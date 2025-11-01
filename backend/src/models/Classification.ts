import type {
  ClassificationResult,
  DocumentType,
} from '@fuse/shared/schemas/documentTypes.zod';

export interface ClassificationModel extends ClassificationResult {
  predicted_type: DocumentType;
  confidence: number;
  threshold: number;
  requires_review: boolean;
  evidence: string[];
  tool_used: boolean;
  llm_confidence: number;
  clarity_confidence: number;
  final_confidence: number;
}

/**
 * Service interface for classification operations
 */
export interface ClassificationService {
  /**
   * Classify a document based on OCR text
   * @param ocrText - Full text extracted from document
   * @param documentId - ID of document being classified
   * @returns Classification result with confidence breakdown
   */
  classify(ocrText: string, documentId: number): Promise<ClassificationModel>;

  /**
   * Get confidence threshold for a document type
   */
  getThreshold(type: DocumentType): Promise<number>;

  /**
   * Update confidence threshold for a document type
   */
  setThreshold(type: DocumentType, threshold: number): Promise<void>;
}
