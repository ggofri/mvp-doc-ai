const SSN_LENGTH = 9;
const ROUTING_NUMBER_LENGTH = 9;
const MIN_ACCOUNT_DIGITS = 4;
const VISIBLE_LAST_DIGITS = 4;
const MIN_TEXT_LENGTH_FOR_MASKING = 4;

const SSN_MASK_PREFIX = '***-**-';
const ACCOUNT_MASK_PREFIX = '****';
const ROUTING_MASK_PREFIX = '*****';
const ROUTING_MASK_FALLBACK = '*****';
const TAX_ID_MASK_FALLBACK = '***-**-****';
const ACCOUNT_MASK_FALLBACK = '****';
const CREDIT_CARD_MASK_PREFIX = '****-****-****-';
const CREDIT_CARD_MASK_FALLBACK = '****';

const SENSITIVE_FIELDS = [
  'ssn',
  'ein',
  'account_number',
  'account number',
  'routing',
  'card_number',
  'card number',
  'password',
  'secret',
  'token',
];

const SSN_PATTERN_WITH_DASHES = /\b\d{3}-\d{2}-\d{4}\b/g;
const SSN_PATTERN_NO_DASHES = /\b\d{9}\b/g;
const ACCOUNT_NUMBER_PATTERN = /\b\d{8,17}\b/g;
const EMAIL_PATTERN = /\b[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Z|a-z]{2,}\b/g;

const SSN_MASK_REPLACEMENT = '***-**-****';
const SSN_NUMERIC_MASK_REPLACEMENT = '*********';
const EMAIL_MASK_REPLACEMENT = '***@***.***';

const FIELD_NAME_SSN = 'ssn';
const FIELD_NAME_EIN = 'ein';
const FIELD_NAME_ACCOUNT_NUMBER = 'account_number';
const FIELD_NAME_ACCOUNT_NUMBER_SPACED = 'account number';
const FIELD_NAME_ROUTING = 'routing';
const FIELD_NAME_CARD = 'card';
const FIELD_NAME_NUMBER = 'number';

function cleanValue(value: string): string {
  return value.replace(/[\s-]/g, '');
}

function extractLastNDigits(value: string, n: number): string {
  return value.slice(-n);
}

export class PIIMasker {
  maskField(fieldName: string, value: any): any {
    if (value === null || value === undefined) {
      return value;
    }

    const lowerFieldName = fieldName.toLowerCase();

    if (lowerFieldName.includes(FIELD_NAME_SSN) || lowerFieldName.includes(FIELD_NAME_EIN)) {
      return this.maskTaxId(String(value));
    }

    if (lowerFieldName.includes(FIELD_NAME_ACCOUNT_NUMBER) || lowerFieldName.includes(FIELD_NAME_ACCOUNT_NUMBER_SPACED)) {
      return this.maskAccountNumber(String(value));
    }

    if (lowerFieldName.includes(FIELD_NAME_ROUTING)) {
      return this.maskRoutingNumber(String(value));
    }

    if (lowerFieldName.includes(FIELD_NAME_CARD) && lowerFieldName.includes(FIELD_NAME_NUMBER)) {
      return this.maskCreditCard(String(value));
    }

    return value;
  }

  maskObject(obj: Record<string, any>): Record<string, any> {
    const masked: Record<string, any> = {};

    for (const [key, value] of Object.entries(obj)) {
      if (typeof value === 'object' && value !== null && !Array.isArray(value)) {
        masked[key] = this.maskObject(value);
      } else if (Array.isArray(value)) {
        masked[key] = value.map((item) =>
          typeof item === 'object' && item !== null ? this.maskObject(item) : item
        );
      } else {
        masked[key] = this.maskField(key, value);
      }
    }

    return masked;
  }

  private maskTaxId(value: string): string {
    const cleaned = cleanValue(value);

    if (cleaned.length === SSN_LENGTH) {
      return `${SSN_MASK_PREFIX}${extractLastNDigits(cleaned, VISIBLE_LAST_DIGITS)}`;
    }

    return TAX_ID_MASK_FALLBACK;
  }

  private maskAccountNumber(value: string): string {
    const cleaned = cleanValue(value);

    if (cleaned.length < MIN_ACCOUNT_DIGITS) {
      return ACCOUNT_MASK_FALLBACK;
    }

    return `${ACCOUNT_MASK_PREFIX}${extractLastNDigits(cleaned, VISIBLE_LAST_DIGITS)}`;
  }

  private maskRoutingNumber(value: string): string {
    const cleaned = cleanValue(value);

    if (cleaned.length === ROUTING_NUMBER_LENGTH) {
      return `${ROUTING_MASK_PREFIX}${extractLastNDigits(cleaned, VISIBLE_LAST_DIGITS)}`;
    }

    return ROUTING_MASK_FALLBACK;
  }

  private maskCreditCard(value: string): string {
    const cleaned = cleanValue(value);

    if (cleaned.length < MIN_TEXT_LENGTH_FOR_MASKING) {
      return CREDIT_CARD_MASK_FALLBACK;
    }

    return `${CREDIT_CARD_MASK_PREFIX}${extractLastNDigits(cleaned, VISIBLE_LAST_DIGITS)}`;
  }

  maskText(text: string): string {
    let masked = text;

    masked = masked.replace(SSN_PATTERN_WITH_DASHES, SSN_MASK_REPLACEMENT);
    masked = masked.replace(SSN_PATTERN_NO_DASHES, SSN_NUMERIC_MASK_REPLACEMENT);
    masked = masked.replace(ACCOUNT_NUMBER_PATTERN, (match) => `${ACCOUNT_MASK_PREFIX}${extractLastNDigits(match, VISIBLE_LAST_DIGITS)}`);
    masked = masked.replace(EMAIL_PATTERN, EMAIL_MASK_REPLACEMENT);

    return masked;
  }

  shouldMask(fieldName: string): boolean {
    const lowerFieldName = fieldName.toLowerCase();
    return SENSITIVE_FIELDS.some((sensitive) => lowerFieldName.includes(sensitive));
  }
}

let piiMasker: PIIMasker | null = null;

export function getPIIMasker(): PIIMasker {
  if (!piiMasker) {
    piiMasker = new PIIMasker();
  }
  return piiMasker;
}
