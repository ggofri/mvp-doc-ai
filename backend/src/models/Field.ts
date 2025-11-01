import type {
  Field,
  ValidationStatus,
} from '@fuse/shared/schemas/documentTypes.zod';

export interface FieldModel extends Field {
  name: string;
  value: string | number | boolean | string[];
  llm_confidence: number;
  validation_confidence: number;
  clarity_confidence: number;
  final_confidence: number;
  page_number: number | null;
  bbox: [number, number, number, number] | null;
  validation_status: ValidationStatus;
  validation_error: string | null;
}

export interface ConfidenceCalculator {
  calculateLLMConfidence(modelOutput: unknown): number;
  calculateValidationConfidence(
    value: string | number | boolean | string[],
    validationResult: { passed: boolean; error?: string }
  ): number;
  calculateClarityConfidence(text: string, keywords: string[]): number;
  calculateFinalConfidence(
    llm: number,
    validation: number,
    clarity: number
  ): number;
}
