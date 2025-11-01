import type {
  Correction,
  CorrectionType,
} from '@fuse/shared/schemas/documentTypes.zod';

export interface CorrectionModel extends Correction {
  id: number;
  doc_id: number;
  correction_type: CorrectionType;
  original_value: string | null;
  corrected_value: string;
  field_name: string | null;
  corrector_id: string | null;
  created_at: string;
  is_gold: boolean;
}

/**
 * Repository interface for Correction persistence
 */
export interface CorrectionRepository {
  /**
   * Create a new correction
   */
  create(correction: Omit<CorrectionModel, 'id' | 'created_at'>): Promise<CorrectionModel>;

  /**
   * Find all corrections for a document
   */
  findByDocumentId(docId: number): Promise<CorrectionModel[]>;

  /**
   * Find gold-standard corrections for learning loop
   */
  findGoldExamples(filters?: {
    correctionType?: CorrectionType;
    fieldName?: string;
    limit?: number;
  }): Promise<CorrectionModel[]>;

  /**
   * Mark correction as gold or non-gold
   */
  setGoldStatus(id: number, isGold: boolean): Promise<void>;

  /**
   * Delete correction
   */
  delete(id: number): Promise<void>;
}

/**
 * Service interface for correction operations
 */
export interface CorrectionService {
  /**
   * Apply a correction to a document
   */
  applyCorrection(
    docId: number,
    correction: {
      type: CorrectionType;
      originalValue?: string;
      correctedValue: string;
      fieldName?: string;
    }
  ): Promise<CorrectionModel>;

  /**
   * Retrieve corrections for learning loop
   */
  getGoldExamples(
    correctionType: CorrectionType,
    fieldName?: string
  ): Promise<CorrectionModel[]>;
}
