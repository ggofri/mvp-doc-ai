import { get } from '../db/connection';
import type { DocumentType } from '@fuse/shared/schemas/documentTypes.zod';

const DEFAULT_THRESHOLD = 0.7;

/**
 * Maps document type names to their database key format.
 * Handles special cases where database uses abbreviations.
 */
const DOCUMENT_TYPE_TO_KEY: Record<DocumentType, string> = {
  'Bank Statement': 'threshold_bank_statement',
  'Government ID': 'threshold_government_id',
  'W-9': 'threshold_w9',
  'Certificate of Insurance': 'threshold_coi',
  'Articles of Incorporation': 'threshold_articles',
  'Unknown': 'threshold_unknown',
};

/**
 * Builds the database key for a document type threshold
 */
function buildThresholdKey(type: DocumentType): string {
  return DOCUMENT_TYPE_TO_KEY[type] || `threshold_${type.replace(/\s+/g, '_').replace(/-/g, '').toLowerCase()}`;
}

/**
 * Gets the confidence threshold for a document type from the database.
 * Returns the default threshold (0.7) if not found.
 */
export async function getThreshold(type: DocumentType): Promise<number> {
  try {
    const key = buildThresholdKey(type);
    const result = await get<{ value: string }>(
      'SELECT value FROM settings WHERE key = ?',
      [key]
    );

    return result ? parseFloat(result.value) : DEFAULT_THRESHOLD;
  } catch (error) {
    console.error('Error getting threshold:', error);
    return DEFAULT_THRESHOLD;
  }
}

