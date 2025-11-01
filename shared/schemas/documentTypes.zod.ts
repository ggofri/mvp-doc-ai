import { z } from 'zod';

// ============================================================
// Enums
// ============================================================

export const DocumentTypeEnum = z.enum([
  'Bank Statement',
  'Government ID',
  'W-9',
  'Certificate of Insurance',
  'Articles of Incorporation',
  'Unknown',
]);

export const DocumentStatusEnum = z.enum([
  'pending',
  'ocr_in_progress',
  'classification_in_progress',
  'extraction_in_progress',
  'completed',
  'needs_review',
  'error',
]);

export const ValidationStatusEnum = z.enum(['passed', 'failed', 'skipped']);

export const CorrectionTypeEnum = z.enum(['classification', 'field']);

// ============================================================
// Supporting Types
// ============================================================

export const OcrWordSchema = z.object({
  text: z.string(),
  bbox: z.tuple([z.number(), z.number(), z.number(), z.number()]),
  confidence: z.number().min(0).max(1),
});

export const OcrPageSchema = z.object({
  page: z.number().int().positive(),
  text: z.string(),
  words: z.array(OcrWordSchema),
});

export const FieldSchema = z.object({
  name: z.string(),
  value: z.union([z.string(), z.number(), z.boolean(), z.array(z.string())]),
  llm_confidence: z.number().min(0).max(1),
  validation_confidence: z.number().min(0).max(1),
  clarity_confidence: z.number().min(0).max(1),
  final_confidence: z.number().min(0).max(1),
  page_number: z.number().int().positive().nullable(),
  bbox: z.tuple([z.number(), z.number(), z.number(), z.number()]).nullable(),
  validation_status: ValidationStatusEnum,
  validation_error: z.string().nullable(),
  reasons: z.array(z.string()).optional(),
  corrected: z.boolean().optional(), // True if user corrected the value
  approved: z.boolean().optional(), // True if user approved the value as correct
});

// ============================================================
// Core Entity Schemas
// ============================================================

export const DocumentSchema = z.object({
  id: z.number().int().positive(),
  filename: z.string().endsWith('.pdf'),
  upload_timestamp: z.string().datetime(),
  file_size: z.number().int().positive().max(50 * 1024 * 1024),
  page_count: z.number().int().min(1).max(100),
  ocr_json: z.array(OcrPageSchema).nullable(),
  type: DocumentTypeEnum.nullable(),
  confidence: z.number().min(0).max(1).nullable(),
  extraction: z.record(z.any()).nullable(),
  corrected: z.boolean(),
  processing_status: DocumentStatusEnum,
});

export const ClassificationResultSchema = z.object({
  predicted_type: DocumentTypeEnum,
  confidence: z.number().min(0).max(1),
  threshold: z.number().min(0.5).max(1),
  requires_review: z.boolean(),
  evidence: z.array(z.string()),
  tool_used: z.boolean(),
  llm_confidence: z.number().min(0).max(1),
  clarity_confidence: z.number().min(0).max(1),
  final_confidence: z.number().min(0).max(1),
  reasons: z.array(z.string()).optional(),
});

export const ExtractionResultSchema = z.object({
  document_id: z.number().int().positive(),
  fields: z.array(FieldSchema),
  extraction_timestamp: z.string().datetime(),
  overall_confidence: z.number().min(0).max(1),
  schema_type: DocumentTypeEnum,
  reasons: z.array(z.string()).optional(),
});

export const CorrectionSchema = z
  .object({
    id: z.number().int().positive(),
    doc_id: z.number().int().positive(),
    correction_type: CorrectionTypeEnum,
    original_value: z.string().nullable(),
    corrected_value: z.string().min(1),
    field_name: z.string().nullable(),
    corrector_id: z.string().nullable(),
    created_at: z.string().datetime(),
    is_gold: z.boolean(),
  })
  .refine(
    (data) =>
      data.correction_type === 'field'
        ? data.field_name !== null
        : data.field_name === null,
    { message: 'field_name required for field corrections, null for classification' }
  );

export const MetricSnapshotSchema = z.object({
  id: z.number().int().positive(),
  timestamp: z.string().datetime(),
  classification_accuracy: z.number().min(0).max(1).nullable(),
  classification_precision: z.record(z.number().min(0).max(1)).nullable(),
  classification_recall: z.record(z.number().min(0).max(1)).nullable(),
  confusion_matrix: z.array(z.array(z.number())).nullable(),
  field_exact_match_rate: z.record(z.number().min(0).max(1)).nullable(),
  field_token_f1: z.record(z.number().min(0).max(1)).nullable(),
  latency_p50: z.number().positive().nullable(),
  latency_p95: z.number().positive().nullable(),
  cost_per_document: z.number().min(0).nullable(),
  auto_approve_rate: z.number().min(0).max(1).nullable(),
  review_rate: z.number().min(0).max(1).nullable(),
  confidence_distribution: z.record(z.array(z.number())).nullable(),
  correction_count: z.number().int().min(0).nullable(),
  learning_impact_delta: z.number().nullable(),
});

// ============================================================
// Document Type-Specific Extraction Schemas
// ============================================================

export const BankStatementSchema = z.object({
  account_holder_name: z.string().regex(/^[A-Za-z\s]{2,}$/),
  account_number_masked: z.string().regex(/^\*{4,}\d{4}$/),
  statement_start_date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  statement_end_date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  starting_balance: z.number(),
  ending_balance: z.number(),
});

export const GovernmentIDSchema = z.object({
  full_name: z.string().regex(/^[A-Za-z\s]{2,}$/),
  date_of_birth: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  id_number: z.string(),
  address: z.string(),
  expiration_date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
});

export const W9Schema = z.object({
  legal_name: z.string(),
  ein_or_ssn: z.string().regex(/^\d{2}-\d{7}$|^\d{3}-\d{2}-\d{4}$/),
  business_address: z.string(),
  tax_classification: z.enum([
    'Individual',
    'C-Corp',
    'S-Corp',
    'Partnership',
    'LLC',
  ]),
  signature_present: z.boolean(),
});

export const CertificateOfInsuranceSchema = z.object({
  insured_name: z.string(),
  policy_number: z.string(),
  policy_effective_date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  policy_expiration_date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  coverage_types: z.array(z.string()),
});

export const ArticlesOfIncorporationSchema = z.object({
  entity_legal_name: z.string(),
  state: z.string().regex(/^[A-Z]{2}$/),
  file_number: z.string(),
  filing_date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
});

export const UnknownDocumentSchema = z.object({
  // Minimal schema for unknown documents - no specific fields required
  // This allows the system to handle documents that don't match any known type
  notes: z.string().optional(),
});

// ============================================================
// Type Guards and Utilities
// ============================================================

export type DocumentType = z.infer<typeof DocumentTypeEnum>;
export type DocumentStatus = z.infer<typeof DocumentStatusEnum>;
export type ValidationStatus = z.infer<typeof ValidationStatusEnum>;
export type CorrectionType = z.infer<typeof CorrectionTypeEnum>;

export type Document = z.infer<typeof DocumentSchema>;
export type ClassificationResult = z.infer<typeof ClassificationResultSchema>;
export type ExtractionResult = z.infer<typeof ExtractionResultSchema>;
export type Field = z.infer<typeof FieldSchema>;
export type Correction = z.infer<typeof CorrectionSchema>;
export type MetricSnapshot = z.infer<typeof MetricSnapshotSchema>;
export type OcrPage = z.infer<typeof OcrPageSchema>;
export type OcrWord = z.infer<typeof OcrWordSchema>;

export type BankStatement = z.infer<typeof BankStatementSchema>;
export type GovernmentID = z.infer<typeof GovernmentIDSchema>;
export type W9 = z.infer<typeof W9Schema>;
export type CertificateOfInsurance = z.infer<typeof CertificateOfInsuranceSchema>;
export type ArticlesOfIncorporation = z.infer<typeof ArticlesOfIncorporationSchema>;
export type UnknownDocument = z.infer<typeof UnknownDocumentSchema>;

/**
 * Get the extraction schema for a specific document type
 */
export function getSchemaForType(type: DocumentType): z.ZodSchema {
  switch (type) {
    case 'Bank Statement':
      return BankStatementSchema;
    case 'Government ID':
      return GovernmentIDSchema;
    case 'W-9':
      return W9Schema;
    case 'Certificate of Insurance':
      return CertificateOfInsuranceSchema;
    case 'Articles of Incorporation':
      return ArticlesOfIncorporationSchema;
    case 'Unknown':
      return UnknownDocumentSchema;
    default:
      throw new Error(`Unknown document type: ${type}`);
  }
}

/**
 * Validate extracted data against document type schema
 */
export function validateExtraction(
  type: DocumentType,
  data: unknown
): { success: boolean; errors?: z.ZodError } {
  const schema = getSchemaForType(type);
  const result = schema.safeParse(data);

  if (result.success) {
    return { success: true };
  } else {
    return { success: false, errors: result.error };
  }
}
