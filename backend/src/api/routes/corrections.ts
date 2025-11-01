import { Router, Request, Response } from 'express';
import { getDatabase } from '../../db/connection';
import { getMetricStore } from '../../services/metrics/MetricStore';
import { getValidationService } from '../../services/extraction/ValidationService';
import { getTypeCoercionService } from '../../services/extraction/TypeCoercionService';
import { getExtractionService } from '../../services/extraction/ExtractionService';
import { logger } from '../../utils/logger';
import type { DocumentType } from '@fuse/shared/schemas/documentTypes.zod';

const router = Router();

const PROCESSING_STATUS_NEEDS_REVIEW = 'needs_review';
const PROCESSING_STATUS_COMPLETED = 'completed';
const PROCESSING_STATUS_EXTRACTION_IN_PROGRESS = 'extraction_in_progress';
const PROCESSING_STATUS_ERROR = 'error';
const IS_GOLD_EXAMPLE = 1;
const CORRECTION_TYPE_CLASSIFICATION = 'classification';
const CORRECTION_TYPE_FIELD = 'field';

interface CorrectionRequest {
  correctionType: 'classification' | 'field';
  originalValue?: string;
  correctedValue: string;
  fieldName?: string;
  isApproval?: boolean;
}

interface DocumentRow {
  id: number;
  extraction?: string;
  ocr_json?: string;
  type?: string;
  [key: string]: unknown;
}

interface Field {
  name: string;
  value: unknown;
  corrected?: boolean;
  approved?: boolean;
  llm_confidence?: number;
  clarity_confidence?: number;
  validation_confidence?: number;
}

interface CorrectionRow {
  id: number;
  doc_id: number;
  correction_type: string;
  original_value?: string;
  corrected_value: string;
  field_name?: string;
  created_at: string;
  is_gold: boolean;
}

async function getDocumentById(db: any, docId: number): Promise<DocumentRow | undefined> {
  return new Promise((resolve, reject) => {
    db.get('SELECT * FROM docs WHERE id = ?', [docId], (err: Error, row: DocumentRow) => {
      if (err) reject(err);
      else resolve(row);
    });
  });
}

async function insertCorrectionAsGoldExample(
  db: any,
  docId: number,
  correctionType: string,
  originalValue: string | null,
  correctedValue: string,
  fieldName: string | null
): Promise<number> {
  return new Promise((resolve, reject) => {
    db.run(
      `INSERT INTO corrections (doc_id, correction_type, original_value, corrected_value, field_name, is_gold)
       VALUES (?, ?, ?, ?, ?, ?)`,
      [docId, correctionType, originalValue, correctedValue, fieldName, IS_GOLD_EXAMPLE],
      function (err: Error) {
        if (err) reject(err);
        else resolve(this.lastID);
      }
    );
  });
}

async function markDocumentAsCorrected(db: any, docId: number): Promise<void> {
  return new Promise((resolve, reject) => {
    db.run(
      `UPDATE docs
       SET corrected = 1,
           processing_status = CASE
             WHEN processing_status = ? THEN ?
             ELSE processing_status
           END
       WHERE id = ?`,
      [PROCESSING_STATUS_NEEDS_REVIEW, PROCESSING_STATUS_COMPLETED, docId],
      (err: Error) => {
        if (err) reject(err);
        else resolve();
      }
    );
  });
}

async function updateDocumentTypeAndStatus(db: any, docId: number, correctedType: string): Promise<void> {
  return new Promise((resolve, reject) => {
    db.run(
      'UPDATE docs SET type = ?, processing_status = ? WHERE id = ?',
      [correctedType, PROCESSING_STATUS_EXTRACTION_IN_PROGRESS, docId],
      (err: Error) => {
        if (err) reject(err);
        else resolve();
      }
    );
  });
}

async function updateExtractionResults(db: any, docId: number, extractionResult: any): Promise<void> {
  return new Promise((resolve, reject) => {
    db.run(
      'UPDATE docs SET extraction = ?, processing_status = ? WHERE id = ?',
      [JSON.stringify(extractionResult), PROCESSING_STATUS_COMPLETED, docId],
      (err: Error) => {
        if (err) reject(err);
        else resolve();
      }
    );
  });
}

async function markDocumentAsError(db: any, docId: number): Promise<void> {
  return new Promise((resolve, reject) => {
    db.run(
      'UPDATE docs SET processing_status = ? WHERE id = ?',
      [PROCESSING_STATUS_ERROR, docId],
      (err: Error) => {
        if (err) reject(err);
        else resolve();
      }
    );
  });
}

async function saveExtraction(db: any, docId: number, extraction: any): Promise<void> {
  return new Promise((resolve, reject) => {
    db.run(
      'UPDATE docs SET extraction = ? WHERE id = ?',
      [JSON.stringify(extraction), docId],
      (err: Error) => {
        if (err) reject(err);
        else resolve();
      }
    );
  });
}

async function handleClassificationCorrection(
  db: any,
  document: DocumentRow,
  docId: number,
  correctedValue: string,
  isApproval: boolean
): Promise<void> {
  if (isApproval) {
    logger.log(`Classification approved for doc ${docId} as "${correctedValue}". Marked as gold example.`);
    return;
  }

  await updateDocumentTypeAndStatus(db, docId, correctedValue);
  logger.log(`Classification corrected for doc ${docId}. Triggering re-extraction...`);

  if (!document.ocr_json) {
    logger.error(`No OCR data found for doc ${docId}. Cannot re-extract.`);
    return;
  }

  try {
    const ocrResults = JSON.parse(document.ocr_json);
    const ocrText = ocrResults.map((page: { text: string }) => page.text).join('\n');

    const extractionService = getExtractionService();
    const extractionResult = await extractionService.extract(
      ocrText,
      correctedValue as DocumentType,
      docId,
      ocrResults
    );

    await updateExtractionResults(db, docId, extractionResult);
    logger.log(`Re-extraction completed for doc ${docId} with new type "${correctedValue}"`);
  } catch (extractionError) {
    logger.error(`Re-extraction failed for doc ${docId}:`, extractionError);
    await markDocumentAsError(db, docId);
  }
}

function updateFieldWithApproval(field: Field, fieldName: string, docId: number): void {
  field.approved = true;
  logger.log(`Field "${fieldName}" approved for doc ${docId}. Marked as gold example.`);
}

function updateFieldWithCorrection(
  field: Field,
  fieldName: string,
  correctedValue: string,
  docId: number,
  documentType?: string
): void {
  const typeCoercionService = getTypeCoercionService();
  const coercedValue = documentType
    ? typeCoercionService.coerceFieldValue(
        documentType as DocumentType,
        fieldName,
        correctedValue
      )
    : correctedValue;

  field.value = coercedValue;
  field.corrected = true;
  logger.log(`Field "${fieldName}" corrected for doc ${docId}. Marked as gold example.`);
}

function revalidateField(field: Field, fieldName: string, documentType: string): void {
  const validationService = getValidationService();
  const valueToValidate = field.value;
  const validationResult = validationService.validateField(
    documentType as DocumentType,
    fieldName,
    valueToValidate
  );

  field.validation_confidence = validationResult.confidence;
  field.validation_status = validationService.getValidationStatus(validationResult);
  field.validation_error = validationResult.error || null;

  const llmConfidence = field.llm_confidence || 0;
  const clarityConfidence = field.clarity_confidence || 1;
  field.final_confidence = llmConfidence * validationResult.confidence * clarityConfidence;
}

async function handleFieldCorrection(
  db: any,
  document: DocumentRow,
  docId: number,
  fieldName: string,
  correctedValue: string,
  isApproval: boolean
): Promise<void> {
  const extraction = document.extraction ? JSON.parse(document.extraction) : { fields: [] };

  const fieldIndex = extraction.fields.findIndex((f: Field) => f.name === fieldName);
  if (fieldIndex === -1) {
    return;
  }

  const field = extraction.fields[fieldIndex];

  if (isApproval) {
    updateFieldWithApproval(field, fieldName, docId);
  } else {
    updateFieldWithCorrection(field, fieldName, correctedValue, docId, document.type);
  }

  if (document.type) {
    revalidateField(field, fieldName, document.type);
  }

  await saveExtraction(db, docId, extraction);
}

router.post('/:id/correct', async (req: Request, res: Response) => {
  try {
    const docId = parseInt(req.params.id, 10);
    if (isNaN(docId)) {
      return res.status(400).json({ error: 'Invalid document ID' });
    }

    const { correctionType, originalValue, correctedValue, fieldName, isApproval }: CorrectionRequest = req.body;

    if (!correctionType || !correctedValue) {
      return res.status(400).json({
        error: 'Missing required fields: correctionType and correctedValue',
      });
    }

    if (correctionType !== CORRECTION_TYPE_CLASSIFICATION && correctionType !== CORRECTION_TYPE_FIELD) {
      return res.status(400).json({
        error: `Invalid correctionType. Must be "${CORRECTION_TYPE_CLASSIFICATION}" or "${CORRECTION_TYPE_FIELD}"`,
      });
    }

    if (correctionType === CORRECTION_TYPE_FIELD && !fieldName) {
      return res.status(400).json({
        error: 'fieldName is required for field corrections',
      });
    }

    const db = getDatabase();
    const document = await getDocumentById(db, docId);

    if (!document) {
      return res.status(404).json({ error: 'Document not found' });
    }

    const correctionId = await insertCorrectionAsGoldExample(
      db,
      docId,
      correctionType,
      originalValue || null,
      correctedValue,
      fieldName || null
    );

    await markDocumentAsCorrected(db, docId);

    if (correctionType === CORRECTION_TYPE_CLASSIFICATION) {
      await handleClassificationCorrection(db, document, docId, correctedValue, isApproval || false);
    }

    if (correctionType === CORRECTION_TYPE_FIELD && fieldName) {
      await handleFieldCorrection(db, document, docId, fieldName, correctedValue, isApproval || false);
    }

    const metricStore = getMetricStore();
    metricStore.invalidateCache();
    await metricStore.saveMetricsSnapshot('after_correction');

    const actionType = isApproval ? 'Approval' : 'Correction';
    console.log(`${actionType} saved for doc ${docId}. Metrics cache invalidated and snapshot saved.`);

    res.status(201).json({
      id: correctionId,
      docId,
      correctionType,
      correctedValue,
      fieldName,
      isApproval,
      message: `${actionType} saved successfully`,
    });
  } catch (error) {
    console.error('Error saving correction:', error);
    res.status(500).json({ error: 'Failed to save correction' });
  }
});

router.get('/:id/corrections', async (req: Request, res: Response) => {
  try {
    const docId = parseInt(req.params.id, 10);
    if (isNaN(docId)) {
      return res.status(400).json({ error: 'Invalid document ID' });
    }

    const db = getDatabase();

    const corrections = await new Promise<CorrectionRow[]>((resolve, reject) => {
      db.all(
        'SELECT * FROM corrections WHERE doc_id = ? ORDER BY created_at DESC',
        [docId],
        (err: Error, rows: CorrectionRow[]) => {
          if (err) reject(err);
          else resolve(rows);
        }
      );
    });

    res.json({ corrections });
  } catch (error) {
    console.error('Error fetching corrections:', error);
    res.status(500).json({ error: 'Failed to fetch corrections' });
  }
});

export default router;
