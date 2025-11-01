"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.ArticlesOfIncorporationSchema = exports.CertificateOfInsuranceSchema = exports.W9Schema = exports.GovernmentIDSchema = exports.BankStatementSchema = exports.MetricSnapshotSchema = exports.CorrectionSchema = exports.ExtractionResultSchema = exports.ClassificationResultSchema = exports.DocumentSchema = exports.FieldSchema = exports.OcrPageSchema = exports.OcrWordSchema = exports.CorrectionTypeEnum = exports.ValidationStatusEnum = exports.DocumentStatusEnum = exports.DocumentTypeEnum = void 0;
exports.getSchemaForType = getSchemaForType;
exports.validateExtraction = validateExtraction;
const zod_1 = require("zod");
// ============================================================
// Enums
// ============================================================
exports.DocumentTypeEnum = zod_1.z.enum([
    'Bank Statement',
    'Government ID',
    'W-9',
    'Certificate of Insurance',
    'Articles of Incorporation',
]);
exports.DocumentStatusEnum = zod_1.z.enum([
    'pending',
    'ocr_in_progress',
    'classification_in_progress',
    'extraction_in_progress',
    'completed',
    'needs_review',
    'error',
]);
exports.ValidationStatusEnum = zod_1.z.enum(['passed', 'failed', 'skipped']);
exports.CorrectionTypeEnum = zod_1.z.enum(['classification', 'field']);
// ============================================================
// Supporting Types
// ============================================================
exports.OcrWordSchema = zod_1.z.object({
    text: zod_1.z.string(),
    bbox: zod_1.z.tuple([zod_1.z.number(), zod_1.z.number(), zod_1.z.number(), zod_1.z.number()]),
    confidence: zod_1.z.number().min(0).max(1),
});
exports.OcrPageSchema = zod_1.z.object({
    page: zod_1.z.number().int().positive(),
    text: zod_1.z.string(),
    words: zod_1.z.array(exports.OcrWordSchema),
});
exports.FieldSchema = zod_1.z.object({
    name: zod_1.z.string(),
    value: zod_1.z.union([zod_1.z.string(), zod_1.z.number(), zod_1.z.boolean(), zod_1.z.array(zod_1.z.string())]),
    llm_confidence: zod_1.z.number().min(0).max(1),
    validation_confidence: zod_1.z.number().min(0).max(1),
    clarity_confidence: zod_1.z.number().min(0).max(1),
    final_confidence: zod_1.z.number().min(0).max(1),
    page_number: zod_1.z.number().int().positive().nullable(),
    bbox: zod_1.z.tuple([zod_1.z.number(), zod_1.z.number(), zod_1.z.number(), zod_1.z.number()]).nullable(),
    validation_status: exports.ValidationStatusEnum,
    validation_error: zod_1.z.string().nullable(),
});
// ============================================================
// Core Entity Schemas
// ============================================================
exports.DocumentSchema = zod_1.z.object({
    id: zod_1.z.number().int().positive(),
    filename: zod_1.z.string().endsWith('.pdf'),
    upload_timestamp: zod_1.z.string().datetime(),
    file_size: zod_1.z.number().int().positive().max(50 * 1024 * 1024),
    page_count: zod_1.z.number().int().min(1).max(100),
    ocr_json: zod_1.z.array(exports.OcrPageSchema).nullable(),
    type: exports.DocumentTypeEnum.nullable(),
    confidence: zod_1.z.number().min(0).max(1).nullable(),
    extraction: zod_1.z.record(zod_1.z.any()).nullable(),
    corrected: zod_1.z.boolean(),
    processing_status: exports.DocumentStatusEnum,
});
exports.ClassificationResultSchema = zod_1.z.object({
    predicted_type: exports.DocumentTypeEnum,
    confidence: zod_1.z.number().min(0).max(1),
    threshold: zod_1.z.number().min(0.5).max(1),
    requires_review: zod_1.z.boolean(),
    evidence: zod_1.z.array(zod_1.z.string()),
    tool_used: zod_1.z.boolean(),
    llm_confidence: zod_1.z.number().min(0).max(1),
    clarity_confidence: zod_1.z.number().min(0).max(1),
    final_confidence: zod_1.z.number().min(0).max(1),
});
exports.ExtractionResultSchema = zod_1.z.object({
    document_id: zod_1.z.number().int().positive(),
    fields: zod_1.z.array(exports.FieldSchema),
    extraction_timestamp: zod_1.z.string().datetime(),
    overall_confidence: zod_1.z.number().min(0).max(1),
    schema_type: exports.DocumentTypeEnum,
});
exports.CorrectionSchema = zod_1.z
    .object({
    id: zod_1.z.number().int().positive(),
    doc_id: zod_1.z.number().int().positive(),
    correction_type: exports.CorrectionTypeEnum,
    original_value: zod_1.z.string().nullable(),
    corrected_value: zod_1.z.string().min(1),
    field_name: zod_1.z.string().nullable(),
    corrector_id: zod_1.z.string().nullable(),
    created_at: zod_1.z.string().datetime(),
    is_gold: zod_1.z.boolean(),
})
    .refine((data) => data.correction_type === 'field'
    ? data.field_name !== null
    : data.field_name === null, { message: 'field_name required for field corrections, null for classification' });
exports.MetricSnapshotSchema = zod_1.z.object({
    id: zod_1.z.number().int().positive(),
    timestamp: zod_1.z.string().datetime(),
    classification_accuracy: zod_1.z.number().min(0).max(1).nullable(),
    classification_precision: zod_1.z.record(zod_1.z.number().min(0).max(1)).nullable(),
    classification_recall: zod_1.z.record(zod_1.z.number().min(0).max(1)).nullable(),
    confusion_matrix: zod_1.z.array(zod_1.z.array(zod_1.z.number())).nullable(),
    field_exact_match_rate: zod_1.z.record(zod_1.z.number().min(0).max(1)).nullable(),
    field_token_f1: zod_1.z.record(zod_1.z.number().min(0).max(1)).nullable(),
    latency_p50: zod_1.z.number().positive().nullable(),
    latency_p95: zod_1.z.number().positive().nullable(),
    cost_per_document: zod_1.z.number().min(0).nullable(),
    auto_approve_rate: zod_1.z.number().min(0).max(1).nullable(),
    review_rate: zod_1.z.number().min(0).max(1).nullable(),
    confidence_distribution: zod_1.z.record(zod_1.z.array(zod_1.z.number())).nullable(),
    correction_count: zod_1.z.number().int().min(0).nullable(),
    learning_impact_delta: zod_1.z.number().nullable(),
});
// ============================================================
// Document Type-Specific Extraction Schemas
// ============================================================
exports.BankStatementSchema = zod_1.z.object({
    account_holder_name: zod_1.z.string().regex(/^[A-Za-z\s]{2,}$/),
    account_number_masked: zod_1.z.string().regex(/^\*{4,}\d{4}$/),
    statement_start_date: zod_1.z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
    statement_end_date: zod_1.z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
    starting_balance: zod_1.z.number(),
    ending_balance: zod_1.z.number(),
});
exports.GovernmentIDSchema = zod_1.z.object({
    full_name: zod_1.z.string().regex(/^[A-Za-z\s]{2,}$/),
    date_of_birth: zod_1.z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
    id_number: zod_1.z.string(),
    address: zod_1.z.string(),
    expiration_date: zod_1.z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
});
exports.W9Schema = zod_1.z.object({
    legal_name: zod_1.z.string(),
    ein_or_ssn: zod_1.z.string().regex(/^\d{2}-\d{7}$|^\d{3}-\d{2}-\d{4}$/),
    business_address: zod_1.z.string(),
    tax_classification: zod_1.z.enum([
        'Individual',
        'C-Corp',
        'S-Corp',
        'Partnership',
        'LLC',
    ]),
    signature_present: zod_1.z.boolean(),
});
exports.CertificateOfInsuranceSchema = zod_1.z.object({
    insured_name: zod_1.z.string(),
    policy_number: zod_1.z.string(),
    policy_effective_date: zod_1.z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
    policy_expiration_date: zod_1.z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
    coverage_types: zod_1.z.array(zod_1.z.string()),
});
exports.ArticlesOfIncorporationSchema = zod_1.z.object({
    entity_legal_name: zod_1.z.string(),
    state: zod_1.z.string().regex(/^[A-Z]{2}$/),
    file_number: zod_1.z.string(),
    filing_date: zod_1.z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
});
/**
 * Get the extraction schema for a specific document type
 */
function getSchemaForType(type) {
    switch (type) {
        case 'Bank Statement':
            return exports.BankStatementSchema;
        case 'Government ID':
            return exports.GovernmentIDSchema;
        case 'W-9':
            return exports.W9Schema;
        case 'Certificate of Insurance':
            return exports.CertificateOfInsuranceSchema;
        case 'Articles of Incorporation':
            return exports.ArticlesOfIncorporationSchema;
        default:
            throw new Error(`Unknown document type: ${type}`);
    }
}
/**
 * Validate extracted data against document type schema
 */
function validateExtraction(type, data) {
    const schema = getSchemaForType(type);
    const result = schema.safeParse(data);
    if (result.success) {
        return { success: true };
    }
    else {
        return { success: false, errors: result.error };
    }
}
