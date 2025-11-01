import type {
  Document,
  DocumentType,
  DocumentStatus,
  OcrPage,
} from '@fuse/shared/schemas/documentTypes.zod';

export interface DocumentModel extends Document {
  id: number;
  filename: string;
  upload_timestamp: string;
  file_size: number;
  page_count: number;
  ocr_json: OcrPage[] | null;
  type: DocumentType | null;
  confidence: number | null;
  extraction: Record<string, unknown> | null;
  corrected: boolean;
  processing_status: DocumentStatus;
}

export interface DocumentRepository {
  create(doc: Omit<DocumentModel, 'id'>): Promise<DocumentModel>;
  findById(id: number): Promise<DocumentModel | null>;
  findAll(filters?: {
    status?: DocumentStatus;
    type?: DocumentType;
    corrected?: boolean;
  }): Promise<DocumentModel[]>;
  update(
    id: number,
    updates: Partial<Omit<DocumentModel, 'id' | 'upload_timestamp'>>
  ): Promise<DocumentModel>;
  updateStatus(id: number, status: DocumentStatus): Promise<void>;
  markCorrected(id: number): Promise<void>;
  delete(id: number): Promise<void>;
}
