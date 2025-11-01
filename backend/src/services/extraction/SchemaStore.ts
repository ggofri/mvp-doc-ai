import { z } from 'zod';
import type { DocumentType } from '@fuse/shared/schemas/documentTypes.zod';
import {
  BankStatementSchema,
  GovernmentIDSchema,
  W9Schema,
  CertificateOfInsuranceSchema,
  ArticlesOfIncorporationSchema,
  UnknownDocumentSchema,
} from '@fuse/shared/schemas/documentTypes.zod';

export class SchemaStore {
  private schemas: Map<DocumentType, z.ZodObject<any>>;
  private fieldKeywords: Map<DocumentType, Record<string, string[]>>;

  constructor() {
    this.schemas = new Map();
    this.fieldKeywords = new Map();
    this.initializeSchemas();
    this.initializeKeywords();
  }

  private initializeSchemas(): void {
    this.schemas.set('Bank Statement', BankStatementSchema);
    this.schemas.set('Government ID', GovernmentIDSchema);
    this.schemas.set('W-9', W9Schema);
    this.schemas.set('Certificate of Insurance', CertificateOfInsuranceSchema);
    this.schemas.set('Articles of Incorporation', ArticlesOfIncorporationSchema);
    this.schemas.set('Unknown', UnknownDocumentSchema);
  }

  private initializeKeywords(): void {
    this.fieldKeywords.set('Bank Statement', {
      account_holder_name: ['account holder', 'name', 'customer', 'account name'],
      account_number_masked: ['account number', 'account #', 'acct', 'account no'],
      statement_start_date: ['period', 'from', 'beginning', 'start date', 'statement period'],
      statement_end_date: ['period', 'to', 'ending', 'end date', 'through'],
      starting_balance: ['opening', 'previous balance', 'beginning balance', 'prior balance'],
      ending_balance: ['closing', 'current balance', 'ending balance', 'total', 'final balance'],
    });

    this.fieldKeywords.set('Government ID', {
      full_name: ['name', 'full name', 'given name', 'legal name'],
      date_of_birth: ['date of birth', 'dob', 'birth date', 'born', 'birthdate'],
      id_number: ['number', 'id number', 'license number', 'passport number', 'document number'],
      address: ['address', 'residence', 'street', 'home address', 'residential'],
      expiration_date: ['expiration', 'expires', 'exp', 'valid until', 'expiry date'],
    });

    this.fieldKeywords.set('W-9', {
      legal_name: ['name', 'taxpayer name', 'business name', 'legal name'],
      ein_or_ssn: ['ssn', 'ein', 'taxpayer identification', 'tin', 'tax id', 'social security'],
      business_address: ['address', 'street', 'business address', 'mailing address'],
      tax_classification: ['classification', 'entity type', 'individual', 'corporation', 'llc', 'partnership'],
      signature_present: ['signature', 'signed', 'sign here', 'taxpayer signature'],
    });

    this.fieldKeywords.set('Certificate of Insurance', {
      insured_name: ['insured', 'name of insured', 'policyholder', 'named insured'],
      policy_number: ['policy', 'policy number', 'certificate number', 'policy #'],
      policy_effective_date: ['effective', 'effective date', 'from', 'start date', 'eff'],
      policy_expiration_date: ['expiration', 'expires', 'expiry', 'to', 'end date', 'exp'],
      coverage_types: ['coverage', 'type', 'liability', 'insurance type', 'coverages'],
    });

    this.fieldKeywords.set('Articles of Incorporation', {
      entity_legal_name: ['corporation', 'company name', 'name', 'entity name', 'legal name'],
      state: ['state', 'jurisdiction', 'incorporated in', 'state of incorporation'],
      file_number: ['filing', 'document number', 'file number', 'certificate number', 'file #'],
      filing_date: ['date', 'filed', 'filing date', 'effective date', 'date filed'],
    });

    this.fieldKeywords.set('Unknown', {
      notes: ['notes', 'comments', 'remarks', 'description'],
    });
  }

  getSchema(documentType: DocumentType): z.ZodObject<any> | null {
    return this.schemas.get(documentType) || null;
  }

  getFieldKeywords(documentType: DocumentType): Record<string, string[]> | null {
    return this.fieldKeywords.get(documentType) || null;
  }

  getFieldNames(documentType: DocumentType): string[] {
    const schema = this.getSchema(documentType);
    if (!schema) return [];
    return Object.keys(schema.shape);
  }

  hasField(documentType: DocumentType, fieldName: string): boolean {
    const fieldNames = this.getFieldNames(documentType);
    return fieldNames.includes(fieldName);
  }

  getSupportedTypes(): DocumentType[] {
    return Array.from(this.schemas.keys());
  }
}

let schemaStore: SchemaStore | null = null;

export function getSchemaStore(): SchemaStore {
  if (!schemaStore) {
    schemaStore = new SchemaStore();
  }
  return schemaStore;
}
