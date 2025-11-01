export type {
  Document,
  DocumentType,
  DocumentStatus,
  ClassificationResult,
  ExtractionResult,
  Field,
  Correction,
  CorrectionType,
  MetricSnapshot,
  OcrPage,
  OcrWord,
  ValidationStatus,
  BankStatement,
  GovernmentID,
  W9,
  CertificateOfInsurance,
  ArticlesOfIncorporation,
} from '@fuse/shared/schemas/documentTypes.zod';

export interface ApiResponse<T> {
  data: T;
  error?: string;
}

export interface ApiError {
  error: string;
  message?: string;
  details?: Array<{ path: string; message: string }>;
}

export interface UploadProgress {
  filename: string;
  loaded: number;
  total: number;
  percentage: number;
}

export interface UploadResult {
  documentId: number;
  filename: string;
  status: string;
}

export interface Settings {
  thresholds: Record<string, number>;
}

export interface ToastMessage {
  id: string;
  type: 'success' | 'error' | 'info' | 'warning';
  message: string;
  duration?: number;
}
