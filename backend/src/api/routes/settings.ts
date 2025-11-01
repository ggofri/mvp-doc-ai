import { Router, Request, Response } from 'express';
import { all as dbAll, run as dbRun } from '../../db/connection';
import type { DocumentType } from '@fuse/shared/schemas/documentTypes.zod';

const router = Router();

const MIN_THRESHOLD_VALUE = 0;
const MAX_THRESHOLD_VALUE = 1;
const THRESHOLD_PREFIX = 'threshold_';

/**
 * Maps database keys to document type names (for reading)
 */
const DB_KEY_TO_DOCUMENT_TYPE: Record<string, string> = {
  'threshold_bank_statement': 'Bank Statement',
  'threshold_government_id': 'Government ID',
  'threshold_w9': 'W-9',
  'threshold_coi': 'Certificate of Insurance',
  'threshold_articles': 'Articles of Incorporation',
  'threshold_unknown': 'Unknown',
};

/**
 * Maps document type names to database keys (for writing)
 */
const DOCUMENT_TYPE_TO_DB_KEY: Record<string, string> = {
  'Bank Statement': 'threshold_bank_statement',
  'Government ID': 'threshold_government_id',
  'W-9': 'threshold_w9',
  'Certificate of Insurance': 'threshold_coi',
  'Articles of Incorporation': 'threshold_articles',
  'Unknown': 'threshold_unknown',
};

function formatKeyFromDatabase(dbKey: string): string {
  // Use mapping if available, otherwise fall back to formatting
  if (DB_KEY_TO_DOCUMENT_TYPE[dbKey]) {
    return DB_KEY_TO_DOCUMENT_TYPE[dbKey];
  }
  return dbKey
    .replace(THRESHOLD_PREFIX, '')
    .split('_')
    .map(word => word.charAt(0).toUpperCase() + word.slice(1))
    .join(' ');
}

function formatKeyForDatabase(userKey: string): string {
  // Use mapping if available, otherwise fall back to formatting
  if (DOCUMENT_TYPE_TO_DB_KEY[userKey]) {
    return DOCUMENT_TYPE_TO_DB_KEY[userKey];
  }
  return THRESHOLD_PREFIX + userKey.toLowerCase().replace(/\s+/g, '_').replace(/-/g, '');
}

function isValidThresholdValue(value: unknown): value is number {
  return typeof value === 'number' && value >= MIN_THRESHOLD_VALUE && value <= MAX_THRESHOLD_VALUE;
}

router.get('/', async (req: Request, res: Response) => {
  try {
    const rows = await dbAll<{ key: string; value: string }>(
      'SELECT key, value FROM settings'
    );

    const thresholds: Record<string, number> = {};

    rows.forEach(row => {
      if (row.key.startsWith(THRESHOLD_PREFIX)) {
        thresholds[formatKeyFromDatabase(row.key)] = parseFloat(row.value);
      }
    });

    res.json({
      thresholds,
    });
  } catch (error) {
    console.error('Error fetching settings:', error);
    res.status(500).json({
      error: 'Failed to fetch settings',
      message: error instanceof Error ? error.message : 'Unknown error',
    });
  }
});

router.put('/', async (req: Request, res: Response) => {
  try {
    const { thresholds } = req.body;

    if (!thresholds || typeof thresholds !== 'object') {
      return res.status(400).json({
        error: 'Invalid request',
        message: 'thresholds object is required',
      });
    }

    for (const [key, value] of Object.entries(thresholds)) {
      if (!isValidThresholdValue(value)) {
        return res.status(400).json({
          error: 'Invalid threshold value',
          message: `Threshold for ${key} must be between ${MIN_THRESHOLD_VALUE} and ${MAX_THRESHOLD_VALUE}`,
        });
      }
    }

    for (const [key, value] of Object.entries(thresholds)) {
      const dbKey = formatKeyForDatabase(key);
      await dbRun('UPDATE settings SET value = ? WHERE key = ?', [String(value), dbKey]);
    }

    res.json({
      success: true,
      message: 'Settings updated successfully',
      thresholds,
    });
  } catch (error) {
    console.error('Error updating settings:', error);
    res.status(500).json({
      error: 'Failed to update settings',
      message: error instanceof Error ? error.message : 'Unknown error',
    });
  }
});

export default router;
