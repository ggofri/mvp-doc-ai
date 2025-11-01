import { Router } from 'express';
import { all, get, run } from '../../db/connection';
import { asyncHandler } from '../middleware/errorHandler';
import { getExtractionService } from '../../services/extraction/ExtractionService';
import { getPIIMasker } from '../../services/masking/PIIMasker';
import { getThreshold } from '../../utils/threshold';
import path from 'path';
import fs from 'fs';
import type { DocumentType } from '@fuse/shared/schemas/documentTypes.zod';

const router = Router();

const PROCESSING_STATUS_COMPLETED = 'completed';
const PROCESSING_STATUS_NEEDS_REVIEW = 'needs_review';
const PROCESSING_STATUS_EXTRACTION_IN_PROGRESS = 'extraction_in_progress';
const PROCESSING_STATUS_ERROR = 'error';

interface DocumentRow {
  id: number;
  filename: string;
  upload_timestamp: string;
  file_size: number;
  page_count: number;
  ocr_json?: string;
  type?: string;
  confidence?: number;
  extraction?: string;
  corrected: number;
  processing_status: string;
}

interface Field {
  name: string;
  value: unknown;
}

interface ProcessedDocument {
  id: number;
  filename: string;
  upload_timestamp: string;
  file_size: number;
  page_count: number;
  ocr_json: unknown[] | null;
  type?: string;
  confidence?: number;
  extraction: { fields?: Field[] } | null;
  corrected: boolean;
  processing_status: string;
}

router.get(
  '/',
  asyncHandler(async (req, res) => {
    const { status, type, corrected } = req.query;

    let sql = 'SELECT * FROM docs WHERE 1=1';
    const params: unknown[] = [];

    if (status) {
      sql += ' AND processing_status = ?';
      params.push(status);
    }

    if (type) {
      sql += ' AND type = ?';
      params.push(type);
    }

    if (corrected !== undefined) {
      sql += ' AND corrected = ?';
      params.push(corrected === 'true' ? 1 : 0);
    }

    sql += ' ORDER BY upload_timestamp DESC';

    const rows = await all<DocumentRow>(sql, params);

    const piiMasker = getPIIMasker();
    const documents = rows.map((row) => {
      const doc = {
        ...row,
        ocr_json: row.ocr_json ? JSON.parse(row.ocr_json) : null,
        extraction: row.extraction ? JSON.parse(row.extraction) : null,
        corrected: Boolean(row.corrected),
      };

      if (doc.extraction && doc.extraction.fields) {
        doc.extraction.fields = doc.extraction.fields.map((field: Field) => ({
          ...field,
          value: piiMasker.maskField(field.name, field.value),
        }));
      }

      return doc;
    });

    res.json(documents);
  })
);

router.get(
  '/:id',
  asyncHandler(async (req, res) => {
    const { id } = req.params;

    const row = await get<DocumentRow>('SELECT * FROM docs WHERE id = ?', [id]);

    if (!row) {
      return res.status(404).json({ error: 'Document not found' });
    }

    const document: ProcessedDocument = {
      ...row,
      ocr_json: row.ocr_json ? JSON.parse(row.ocr_json) : null,
      extraction: row.extraction ? JSON.parse(row.extraction) : null,
      corrected: Boolean(row.corrected),
    };

    const shouldTriggerExtraction = document.type &&
      (document.processing_status === PROCESSING_STATUS_COMPLETED ||
       document.processing_status === PROCESSING_STATUS_NEEDS_REVIEW) &&
      !document.extraction &&
      document.ocr_json;

    if (shouldTriggerExtraction) {
      try {
        console.log(`Triggering extraction for document ${id}`);

        const originalStatus = document.processing_status;

        await run('UPDATE docs SET processing_status = ? WHERE id = ?', [
          PROCESSING_STATUS_EXTRACTION_IN_PROGRESS,
          id,
        ]);

        const ocrText = (document.ocr_json as { text: string }[])
          .map((page) => page.text)
          .join('\n\n');

        const extractionService = getExtractionService();
        const extractionResult = await extractionService.extract(
          ocrText,
          document.type as DocumentType,
          parseInt(id)
        );

        // Get the threshold for this document type from database
        const threshold = await getThreshold(document.type as DocumentType);

        const finalStatus =
          extractionResult.overall_confidence < threshold ? PROCESSING_STATUS_NEEDS_REVIEW :
          originalStatus === PROCESSING_STATUS_NEEDS_REVIEW ? PROCESSING_STATUS_NEEDS_REVIEW :
          PROCESSING_STATUS_COMPLETED;

        await run('UPDATE docs SET extraction = ?, processing_status = ? WHERE id = ?', [
          JSON.stringify(extractionResult),
          finalStatus,
          id,
        ]);

        document.extraction = extractionResult;
        document.processing_status = finalStatus;
      } catch (error) {
        console.error(`Extraction failed for document ${id}:`, error);
        await run('UPDATE docs SET processing_status = ? WHERE id = ?', [PROCESSING_STATUS_ERROR, id]);
        document.processing_status = PROCESSING_STATUS_ERROR;
      }
    }

    if (document.extraction && document.extraction.fields) {
      const piiMasker = getPIIMasker();
      document.extraction.fields = document.extraction.fields.map((field: Field) => ({
        ...field,
        value: piiMasker.maskField(field.name, field.value),
      }));
    }

    res.json(document);
  })
);

function resolveUploadDirectory(): string {
  if (!process.env.UPLOAD_DIR) {
    return path.resolve(process.cwd(), 'uploads');
  }
  return path.isAbsolute(process.env.UPLOAD_DIR)
    ? process.env.UPLOAD_DIR
    : path.resolve(process.cwd(), process.env.UPLOAD_DIR);
}

router.get(
  '/:id/pdf',
  asyncHandler(async (req, res) => {
    const { id } = req.params;

    console.log(`[PDF Request] Document ID: ${id}`);

    const row = await get<{ filename: string }>('SELECT filename FROM docs WHERE id = ?', [id]);

    if (!row) {
      console.error(`[PDF Error] Document not found in database: ${id}`);
      return res.status(404).json({ error: 'Document not found' });
    }

    const uploadDirectory = resolveUploadDirectory();
    const filePath = path.join(uploadDirectory, row.filename);

    console.log(`[PDF Path] Attempting to serve: ${filePath}`);
    console.log(`[PDF Path] Upload directory: ${uploadDirectory}`);
    console.log(`[PDF Path] Working directory (cwd): ${process.cwd()}`);

    if (!fs.existsSync(filePath)) {
      console.error(`[PDF Error] File not found at path: ${filePath}`);
      return res.status(404).json({
        error: 'PDF file not found',
        details: {
          filename: row.filename,
          searchedPath: filePath
        }
      });
    }

    res.contentType('application/pdf');
    res.sendFile(filePath, (err) => {
      if (err) {
        console.error('[PDF Error] Error sending file:', err);
        if (!res.headersSent) {
          res.status(500).json({ error: 'Failed to send PDF file' });
        }
      } else {
        console.log(`[PDF Success] Served file: ${row.filename}`);
      }
    });
  })
);

export default router;
