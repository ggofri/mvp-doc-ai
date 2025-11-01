import type { DocumentType } from '@fuse/shared/schemas/documentTypes.zod';
import { getSchemaStore } from './SchemaStore';
import { z } from 'zod';

const MAX_DECIMAL_SEPARATOR_LENGTH = 2;
const MIN_DECIMAL_SEPARATOR_LENGTH = 1;
const EUROPEAN_THOUSANDS_DIGITS = 3;

export class TypeCoercionService {
  private schemaStore: ReturnType<typeof getSchemaStore>;

  constructor() {
    this.schemaStore = getSchemaStore();
  }

  coerceFieldValue(
    documentType: DocumentType,
    fieldName: string,
    value: any
  ): any {
    if (value === null || value === undefined) {
      return value;
    }

    const schema = this.schemaStore.getSchema(documentType);
    if (!schema) {
      return value;
    }

    const fieldSchema = schema.shape[fieldName];
    if (!fieldSchema) {
      return value;
    }

    if (this.isNumberSchema(fieldSchema)) {
      return this.coerceToNumber(value);
    }

    if (this.isBooleanSchema(fieldSchema)) {
      return this.coerceToBoolean(value);
    }

    if (this.isArraySchema(fieldSchema)) {
      return this.coerceToArray(value);
    }

    // Check if field is a date field by checking if it's a string field with date-related name
    if (this.isDateField(fieldName) && this.isStringSchema(fieldSchema)) {
      return this.coerceToDate(value);
    }

    return value;
  }

  coerceAllFields(
    documentType: DocumentType,
    extractedData: Record<string, any>
  ): Record<string, any> {
    const coercedData: Record<string, any> = {};

    for (const [fieldName, value] of Object.entries(extractedData)) {
      coercedData[fieldName] = this.coerceFieldValue(
        documentType,
        fieldName,
        value
      );
    }

    return coercedData;
  }

  private coerceToNumber(value: any): number | null {
    if (typeof value === 'number') {
      return isNaN(value) ? null : value;
    }

    if (typeof value !== 'string') {
      return null;
    }

    let cleaned = value.trim();

    if (cleaned === '') {
      return null;
    }

    const hasComma = cleaned.includes(',');
    const hasPeriod = cleaned.includes('.');
    const lastCommaIndex = cleaned.lastIndexOf(',');
    const lastPeriodIndex = cleaned.lastIndexOf('.');

    cleaned = cleaned.replace(/[$€£¥\s]/g, '');

    if (hasComma && hasPeriod) {
      if (lastCommaIndex > lastPeriodIndex) {
        cleaned = cleaned.replace(/\./g, '').replace(',', '.');
      } else {
        cleaned = cleaned.replace(/,/g, '');
      }
    } else if (hasComma && !hasPeriod) {
      const afterComma = cleaned.substring(lastCommaIndex + 1);
      if (afterComma.length <= MAX_DECIMAL_SEPARATOR_LENGTH) {
        cleaned = cleaned.replace(',', '.');
      } else {
        cleaned = cleaned.replace(/,/g, '');
      }
    } else if (hasPeriod && !hasComma) {
      const afterLastPeriod = cleaned.substring(lastPeriodIndex + 1);
      const periodCount = (cleaned.match(/\./g) || []).length;

      if (periodCount > 1) {
        const parts = cleaned.split('.');
        const allPartsThreeDigits = parts.slice(1, -1).every(part => part.length === EUROPEAN_THOUSANDS_DIGITS);
        const lastPartThreeDigits = afterLastPeriod.length === EUROPEAN_THOUSANDS_DIGITS;

        if (allPartsThreeDigits && lastPartThreeDigits && parts[0].length >= MIN_DECIMAL_SEPARATOR_LENGTH && parts[0].length <= EUROPEAN_THOUSANDS_DIGITS) {
          cleaned = cleaned.replace(/\./g, '');
        } else if (afterLastPeriod.length >= MIN_DECIMAL_SEPARATOR_LENGTH && afterLastPeriod.length <= EUROPEAN_THOUSANDS_DIGITS) {
          const lastPeriodPos = cleaned.lastIndexOf('.');
          cleaned = cleaned.substring(0, lastPeriodPos).replace(/\./g, '') +
                    '.' + cleaned.substring(lastPeriodPos + 1);
        } else {
          cleaned = cleaned.replace(/\./g, '');
        }
      }
    }

    const isNegative = cleaned.startsWith('-') || cleaned.startsWith('(');
    if (cleaned.startsWith('(') && cleaned.endsWith(')')) {
      cleaned = cleaned.substring(1, cleaned.length - 1);
    }
    cleaned = cleaned.replace(/^-/, '');

    const parsed = parseFloat(cleaned);

    if (isNaN(parsed)) {
      return null;
    }

    return isNegative ? -parsed : parsed;
  }

  private coerceToBoolean(value: any): boolean | null {
    if (typeof value === 'boolean') {
      return value;
    }

    if (typeof value === 'string') {
      const lower = value.toLowerCase().trim();
      if (lower === 'true' || lower === 'yes' || lower === '1') {
        return true;
      }
      if (lower === 'false' || lower === 'no' || lower === '0') {
        return false;
      }
    }

    if (typeof value === 'number') {
      return value !== 0;
    }

    return null;
  }

  private coerceToArray(value: any): any[] | null {
    if (Array.isArray(value)) {
      return value;
    }

    if (typeof value === 'string') {
      const cleaned = value.trim();
      if (cleaned === '') {
        return [];
      }

      if (cleaned.startsWith('[')) {
        try {
          const parsed = JSON.parse(cleaned);
          if (Array.isArray(parsed)) {
            return parsed;
          }
        } catch {
        }
      }

      const separators = [',', ';', '|', '\n'];
      for (const sep of separators) {
        if (cleaned.includes(sep)) {
          return cleaned.split(sep).map(s => s.trim()).filter(s => s.length > 0);
        }
      }

      return [cleaned];
    }

    return null;
  }

  private isNumberSchema(schema: z.ZodTypeAny): boolean {
    const typeName = (schema as any)._def?.typeName;

    if (typeName === 'ZodNumber') {
      return true;
    }

    if (typeName === 'ZodOptional' || typeName === 'ZodNullable') {
      return this.isNumberSchema((schema as any)._def.innerType);
    }

    if (typeName === 'ZodUnion') {
      const options = (schema as any)._def.options as z.ZodTypeAny[];
      return options.some(opt => this.isNumberSchema(opt));
    }

    return false;
  }

  private isBooleanSchema(schema: z.ZodTypeAny): boolean {
    const typeName = (schema as any)._def?.typeName;

    if (typeName === 'ZodBoolean') {
      return true;
    }

    if (typeName === 'ZodOptional' || typeName === 'ZodNullable') {
      return this.isBooleanSchema((schema as any)._def.innerType);
    }

    if (typeName === 'ZodUnion') {
      const options = (schema as any)._def.options as z.ZodTypeAny[];
      return options.some(opt => this.isBooleanSchema(opt));
    }

    return false;
  }

  private isArraySchema(schema: z.ZodTypeAny): boolean {
    const typeName = (schema as any)._def?.typeName;

    if (typeName === 'ZodArray') {
      return true;
    }

    if (typeName === 'ZodOptional' || typeName === 'ZodNullable') {
      return this.isArraySchema((schema as any)._def.innerType);
    }

    if (typeName === 'ZodUnion') {
      const options = (schema as any)._def.options as z.ZodTypeAny[];
      return options.some(opt => this.isArraySchema(opt));
    }

    return false;
  }

  private isStringSchema(schema: z.ZodTypeAny): boolean {
    const typeName = (schema as any)._def?.typeName;

    if (typeName === 'ZodString') {
      return true;
    }

    if (typeName === 'ZodOptional' || typeName === 'ZodNullable') {
      return this.isStringSchema((schema as any)._def.innerType);
    }

    if (typeName === 'ZodUnion') {
      const options = (schema as any)._def.options as z.ZodTypeAny[];
      return options.some(opt => this.isStringSchema(opt));
    }

    return false;
  }

  private isDateField(fieldName: string): boolean {
    const dateFieldPatterns = ['date', 'time', 'timestamp', 'deadline', 'created', 'updated', 'start', 'end', 'due'];
    const lowerFieldName = fieldName.toLowerCase();
    return dateFieldPatterns.some(pattern => lowerFieldName.includes(pattern));
  }

  private coerceToDate(value: any): string | null {
    if (typeof value !== 'string') {
      return value;
    }

    const trimmed = value.trim();

    // If already in ISO format (YYYY-MM-DD), return as-is
    if (/^\d{4}-\d{2}-\d{2}$/.test(trimmed)) {
      return trimmed;
    }

    // Try parsing as a date (handles natural language dates like "December 1, 2020")
    const date = new Date(trimmed);

    // Check if date is valid
    if (!isNaN(date.getTime())) {
      // Convert to ISO format (YYYY-MM-DD)
      const year = date.getFullYear();
      const month = String(date.getMonth() + 1).padStart(2, '0');
      const day = String(date.getDate()).padStart(2, '0');
      return `${year}-${month}-${day}`;
    }

    // If parsing failed, return original value
    return value;
  }
}

let typeCoercionService: TypeCoercionService | null = null;

export function getTypeCoercionService(): TypeCoercionService {
  if (!typeCoercionService) {
    typeCoercionService = new TypeCoercionService();
  }
  return typeCoercionService;
}
