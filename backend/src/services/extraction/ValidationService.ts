import type { DocumentType, ValidationStatus } from '@fuse/shared/schemas/documentTypes.zod';
import { getSchemaStore } from './SchemaStore';

const VALIDATION_CONFIDENCE_ZERO = 0;
const VALIDATION_CONFIDENCE_MODERATE = 0.5;
const VALIDATION_CONFIDENCE_GOOD = 0.7;
const VALIDATION_CONFIDENCE_STRING = 0.8;
const VALIDATION_CONFIDENCE_NUMBER = 0.9;
const VALIDATION_CONFIDENCE_PERFECT = 1.0;

const HIGH_CONFIDENCE_THRESHOLD = 0.9;

export interface ValidationResult {
  passed: boolean;
  error?: string;
  confidence: number;
}

export class ValidationService {
  private schemaStore: ReturnType<typeof getSchemaStore>;

  constructor() {
    this.schemaStore = getSchemaStore();
  }

  validateField(
    documentType: DocumentType,
    fieldName: string,
    value: any
  ): ValidationResult {
    const schema = this.schemaStore.getSchema(documentType);
    if (!schema) {
      return {
        passed: false,
        error: `Unknown document type: ${documentType}`,
        confidence: VALIDATION_CONFIDENCE_ZERO,
      };
    }

    const fieldSchema = schema.shape[fieldName];
    if (!fieldSchema) {
      return {
        passed: false,
        error: `Unknown field: ${fieldName}`,
        confidence: VALIDATION_CONFIDENCE_ZERO,
      };
    }

    try {
      const result = fieldSchema.safeParse(value);
      if (result.success) {
        return {
          passed: true,
          confidence: this.calculateValidationConfidence(fieldName, value),
        };
      } else {
        return {
          passed: false,
          error: result.error.errors[0]?.message || 'Validation failed',
          confidence: VALIDATION_CONFIDENCE_ZERO,
        };
      }
    } catch (error) {
      return {
        passed: false,
        error: error instanceof Error ? error.message : 'Validation error',
        confidence: VALIDATION_CONFIDENCE_ZERO,
      };
    }
  }

  validateDocument(
    documentType: DocumentType,
    fields: Record<string, any>
  ): { valid: boolean; errors: string[]; fieldResults: Record<string, ValidationResult> } {
    const schema = this.schemaStore.getSchema(documentType);
    if (!schema) {
      return {
        valid: false,
        errors: [`Unknown document type: ${documentType}`],
        fieldResults: {},
      };
    }

    const errors: string[] = [];
    const fieldResults: Record<string, ValidationResult> = {};

    for (const [fieldName, value] of Object.entries(fields)) {
      const result = this.validateField(documentType, fieldName, value);
      fieldResults[fieldName] = result;
      if (!result.passed) {
        errors.push(`${fieldName}: ${result.error}`);
      }
    }

    return {
      valid: errors.length === 0,
      errors,
      fieldResults,
    };
  }

  private calculateValidationConfidence(fieldName: string, value: any): number {
    if (value === null || value === undefined || value === '') {
      return VALIDATION_CONFIDENCE_ZERO;
    }

    if (fieldName.includes('date')) {
      return this.validateDateFormat(value) ? VALIDATION_CONFIDENCE_PERFECT : VALIDATION_CONFIDENCE_MODERATE;
    }

    if (fieldName.includes('ssn') || fieldName.includes('ein')) {
      return this.validateTaxId(value) ? VALIDATION_CONFIDENCE_PERFECT : VALIDATION_CONFIDENCE_MODERATE;
    }

    if (fieldName.includes('account_number')) {
      return this.validateAccountNumber(value) ? VALIDATION_CONFIDENCE_PERFECT : VALIDATION_CONFIDENCE_GOOD;
    }

    if (fieldName.includes('routing_number')) {
      return this.validateRoutingNumber(value) ? VALIDATION_CONFIDENCE_PERFECT : VALIDATION_CONFIDENCE_MODERATE;
    }

    if (fieldName.includes('email')) {
      return this.validateEmail(value) ? VALIDATION_CONFIDENCE_PERFECT : VALIDATION_CONFIDENCE_MODERATE;
    }

    if (fieldName.includes('phone')) {
      return this.validatePhone(value) ? VALIDATION_CONFIDENCE_PERFECT : VALIDATION_CONFIDENCE_GOOD;
    }

    if (typeof value === 'string' && value.length > 0) {
      return VALIDATION_CONFIDENCE_STRING;
    }

    if (typeof value === 'number' || typeof value === 'boolean') {
      return VALIDATION_CONFIDENCE_NUMBER;
    }

    return VALIDATION_CONFIDENCE_MODERATE;
  }

  private validateDateFormat(value: string): boolean {
    if (typeof value !== 'string') return false;

    // ISO format: YYYY-MM-DD
    const isoPattern = /^\d{4}-\d{2}-\d{2}$/;
    if (isoPattern.test(value)) {
      const date = new Date(value);
      return !isNaN(date.getTime());
    }

    // US format: M/D/YYYY or MM/DD/YYYY
    const usPattern = /^\d{1,2}\/\d{1,2}\/\d{4}$/;
    if (usPattern.test(value)) {
      const [month, day, year] = value.split('/').map(Number);
      const date = new Date(year, month - 1, day);
      return !isNaN(date.getTime());
    }

    // Try parsing natural language dates (e.g., "December 1, 2020", "Jan 15, 2023")
    const date = new Date(value);
    if (!isNaN(date.getTime())) {
      return true;
    }

    return false;
  }

  private validateTaxId(value: string): boolean {
    if (typeof value !== 'string') return false;

    const ssnPattern = /^\d{3}-\d{2}-\d{4}$/;
    if (ssnPattern.test(value)) return true;

    const einPattern = /^\d{2}-\d{7}$/;
    if (einPattern.test(value)) return true;

    const unformattedPattern = /^\d{9}$/;
    return unformattedPattern.test(value);
  }

  private validateAccountNumber(value: string): boolean {
    if (typeof value !== 'string') return false;
    const cleaned = value.replace(/[\s-]/g, '');

    // Accept masked format: ****1234 (at least 4 asterisks followed by 4 digits)
    if (/^\*{4,}\d{4}$/.test(cleaned)) return true;

    // Accept unmasked format: 8-17 digits only
    return /^\d{8,17}$/.test(cleaned);
  }

  private validateRoutingNumber(value: string): boolean {
    if (typeof value !== 'string') return false;
    const cleaned = value.replace(/[\s-]/g, '');
    if (!/^\d{9}$/.test(cleaned)) return false;

    const digits = cleaned.split('').map(Number);
    const checksum =
      3 * (digits[0] + digits[3] + digits[6]) +
      7 * (digits[1] + digits[4] + digits[7]) +
      (digits[2] + digits[5] + digits[8]);
    return checksum % 10 === 0;
  }

  private validateEmail(value: string): boolean {
    if (typeof value !== 'string') return false;
    const emailPattern = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    return emailPattern.test(value);
  }

  private validatePhone(value: string): boolean {
    if (typeof value !== 'string') return false;
    const cleaned = value.replace(/[\s().-]/g, '');
    return /^\d{10,11}$/.test(cleaned);
  }

  getValidationStatus(result: ValidationResult): ValidationStatus {
    if (result.passed && result.confidence >= HIGH_CONFIDENCE_THRESHOLD) {
      return 'passed';
    }
    if (!result.passed) {
      return 'failed';
    }
    return 'passed';
  }
}

let validationService: ValidationService | null = null;

export function getValidationService(): ValidationService {
  if (!validationService) {
    validationService = new ValidationService();
  }
  return validationService;
}
