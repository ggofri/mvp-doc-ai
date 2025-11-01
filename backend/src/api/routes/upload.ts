import { Router } from 'express';
import multer from 'multer';
import path from 'path';
import fs from 'fs/promises';
import { run } from '../../db/connection';
import { getPdfRenderer } from '../../services/ocr/PdfRenderer';
import { getTesseractService } from '../../services/ocr/TesseractService';
import { getClassificationService } from '../../services/classification/ClassificationService';
import { getExtractionService } from '../../services/extraction/ExtractionService';
import { asyncHandler } from '../middleware/errorHandler';
import { logger } from '../../utils/logger';

const router = Router();

const UPLOAD_DIR = process.env.UPLOAD_DIR
  ? (path.isAbsolute(process.env.UPLOAD_DIR)
      ? process.env.UPLOAD_DIR
      : path.resolve(process.cwd(), process.env.UPLOAD_DIR))
  : path.resolve(process.cwd(), 'uploads');

const DEFAULT_MAX_FILE_SIZE_MB = '50';
const BYTES_PER_MEGABYTE = 1024 * 1024;
const MAX_FILE_SIZE = parseInt(process.env.MAX_FILE_SIZE_MB || DEFAULT_MAX_FILE_SIZE_MB) * BYTES_PER_MEGABYTE;

const MAX_PAGE_COUNT = 100;
const PROCESSING_STATUS_PENDING = 'pending';
const PROCESSING_STATUS_OCR_IN_PROGRESS = 'ocr_in_progress';
const PROCESSING_STATUS_CLASSIFICATION_IN_PROGRESS = 'classification_in_progress';
const PROCESSING_STATUS_EXTRACTION_IN_PROGRESS = 'extraction_in_progress';
const PROCESSING_STATUS_NEEDS_REVIEW = 'needs_review';
const PROCESSING_STATUS_COMPLETED = 'completed';
const PROCESSING_STATUS_ERROR = 'error';

const storage = multer.diskStorage({
  destination: async (req, file, cb) => {
    await fs.mkdir(UPLOAD_DIR, { recursive: true });
    cb(null, UPLOAD_DIR);
  },
  filename: (req, file, cb) => {
    const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1e9);
    cb(null, `${uniqueSuffix}-${file.originalname}`);
  },
});

const upload = multer({
  storage,
  limits: {
    fileSize: MAX_FILE_SIZE,
  },
  fileFilter: (req, file, cb) => {
    if (file.mimetype === 'application/pdf') {
      cb(null, true);
    } else {
      cb(new Error('Only PDF files are allowed'));
    }
  },
});

router.post(
  '/',
  upload.single('file'),
  asyncHandler(async (req, res) => {
    if (!req.file) {
      return res.status(400).json({ error: 'No file uploaded' });
    }

    const { filename, path: filePath, size } = req.file;

    console.log(`Processing upload: ${filename} (${size} bytes)`);

    try {
      const pdfRenderer = getPdfRenderer();
      const pageCount = await pdfRenderer.getPageCount(filePath);

      if (pageCount > MAX_PAGE_COUNT) {
        await fs.unlink(filePath);
        return res.status(400).json({
          error: `Document exceeds maximum page limit (${MAX_PAGE_COUNT} pages)`,
        });
      }

      const result = await run(
        `INSERT INTO docs (filename, file_size, page_count, processing_status)
         VALUES (?, ?, ?, ?)`,
        [filename, size, pageCount, PROCESSING_STATUS_PENDING]
      );

      const documentId = result.lastID;

      console.log(`Document created: ID=${documentId}`);

      processDocument(documentId, filePath).catch((error) => {
        console.error(`Error processing document ${documentId}:`, error);
      });

      res.status(202).json({
        id: documentId,
        filename,
        status: PROCESSING_STATUS_PENDING,
        message: 'Document uploaded successfully. Processing started.',
      });
    } catch (error) {
      await fs.unlink(filePath).catch(() => {});
      throw error;
    }
  })
);

async function processDocument(documentId: number, filePath: string): Promise<void> {
  const startTime = Date.now();
  let ocrLatency = 0;
  let classificationLatency = 0;
  let extractionLatency = 0;

  try {
    await run('UPDATE docs SET processing_status = ? WHERE id = ?', [
      PROCESSING_STATUS_OCR_IN_PROGRESS,
      documentId,
    ]);

    console.log(`Starting OCR for document ${documentId}`);
    const ocrStartTime = Date.now();
    const pdfRenderer = getPdfRenderer();
    const tesseractService = getTesseractService();

    const { buffers } = await pdfRenderer.renderAllPages(filePath);
    const ocrResults = await tesseractService.recognizePages(buffers);
    ocrLatency = Date.now() - ocrStartTime;

    await run('UPDATE docs SET ocr_json = ?, processing_status = ?, ocr_latency_ms = ? WHERE id = ?', [
      JSON.stringify(ocrResults),
      PROCESSING_STATUS_CLASSIFICATION_IN_PROGRESS,
      ocrLatency,
      documentId,
    ]);

    console.log(`OCR completed for document ${documentId} in ${ocrLatency}ms`);

    console.log(`Starting classification for document ${documentId}`);
    const classificationStartTime = Date.now();
    const classificationService = getClassificationService();

    const ocrText = ocrResults.map((page) => page.text).join('\n');
    const classificationResult = await classificationService.classify(
      ocrText,
      documentId
    );
    classificationLatency = Date.now() - classificationStartTime;

    await run(
      'UPDATE docs SET type = ?, confidence = ?, processing_status = ?, classification_latency_ms = ? WHERE id = ?',
      [
        classificationResult.predicted_type,
        classificationResult.confidence,
        PROCESSING_STATUS_EXTRACTION_IN_PROGRESS,
        classificationLatency,
        documentId,
      ]
    );

    console.log(`Classification completed for document ${documentId}: ${classificationResult.predicted_type} (confidence: ${classificationResult.confidence}) in ${classificationLatency}ms`);

    console.log(`Starting extraction for document ${documentId}`);
    const extractionStartTime = Date.now();
    const extractionService = getExtractionService();

    const extractionResult = await extractionService.extract(
      ocrText,
      classificationResult.predicted_type,
      documentId,
      ocrResults
    );
    extractionLatency = Date.now() - extractionStartTime;

    const totalLatency = Date.now() - startTime;

    const finalStatus = classificationResult.requires_review
      ? PROCESSING_STATUS_NEEDS_REVIEW
      : PROCESSING_STATUS_COMPLETED;

    await run(
      'UPDATE docs SET extraction = ?, processing_status = ?, extraction_latency_ms = ?, total_latency_ms = ? WHERE id = ?',
      [JSON.stringify(extractionResult), finalStatus, extractionLatency, totalLatency, documentId]
    );

    logger.log(`Extraction completed for document ${documentId}: ${Object.keys(extractionResult.fields).length} fields extracted in ${extractionLatency}ms (total: ${totalLatency}ms)`);
  } catch (error) {
    logger.error(`Processing failed for document ${documentId}:`, error);

    const totalLatency = Date.now() - startTime;
    await run('UPDATE docs SET processing_status = ?, total_latency_ms = ? WHERE id = ?', [
      PROCESSING_STATUS_ERROR,
      totalLatency,
      documentId,
    ]);
  }
}

export default router;
