import type {
  ExtractionResult,
  Field,
  DocumentType,
} from '@fuse/shared/schemas/documentTypes.zod';

export interface ExtractionModel extends ExtractionResult {
  document_id: number;
  fields: Field[];
  extraction_timestamp: string;
  overall_confidence: number;
  schema_type: DocumentType;
}

/**
 * Service interface for field extraction operations
 */
export interface ExtractionService {
  /**
   * Extract structured fields from a document
   * @param ocrText - Full text extracted from document
   * @param documentType - Predicted document type
   * @param documentId - ID of document being processed
   * @returns Extraction result with field-level confidence
   */
  extract(
    ocrText: string,
    documentType: DocumentType,
    documentId: number
  ): Promise<ExtractionModel>;

  /**
   * Validate extracted fields against schema
   */
  validate(
    documentType: DocumentType,
    fields: Field[]
  ): Promise<{ valid: boolean; errors: string[] }>;

  /**
   * Re-extract fields after document type correction
   */
  reExtract(documentId: number, newType: DocumentType): Promise<ExtractionModel>;
}
