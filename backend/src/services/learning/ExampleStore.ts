import { Database } from 'sqlite3';
import { getDatabase } from '../../db/connection';

const IS_GOLD_FLAG = 1;
const DEFAULT_KEYWORDS: string[] = [];
const DEFAULT_EXAMPLE_LIMIT = 1;
const DEFAULT_MULTIPLE_EXAMPLES_LIMIT = 5;
const GOLD_MARKED = 1;
const NOT_GOLD_MARKED = 0;
const EMPTY_JSON_STRING = '';
const EMPTY_JSON_OBJECT = {};

const BASE_GOLD_EXAMPLE_QUERY = `
  SELECT
    c.id,
    c.doc_id as docId,
    d.type as docType,
    d.ocr_json as ocrText,
    d.extraction,
    c.corrected_value as correctedValue,
    c.field_name as fieldName,
    c.created_at as createdAt
  FROM corrections c
  JOIN docs d ON c.doc_id = d.id
  WHERE d.type = ?
    AND c.is_gold = ?
`;

const GOLD_EXAMPLE_COUNTS_QUERY = `
  SELECT d.type as docType, COUNT(*) as count
  FROM corrections c
  JOIN docs d ON c.doc_id = d.id
  WHERE c.is_gold = ?
  GROUP BY d.type
`;

const UPDATE_GOLD_STATUS_QUERY = 'UPDATE corrections SET is_gold = ? WHERE id = ?';

function buildKeywordFilter(keywords: string[]): { conditions: string; params: string[] } {
  if (keywords.length === 0) {
    return { conditions: '', params: [] };
  }

  const keywordConditions = keywords.map(() => 'd.ocr_json LIKE ?').join(' OR ');
  const params = keywords.map(keyword => `%${keyword}%`);
  return { conditions: ` AND (${keywordConditions})`, params };
}

function parseGoldExampleFromRow(row: any): GoldExample {
  return {
    docId: row.docId,
    docType: row.docType,
    ocrText: row.ocrText ? JSON.parse(row.ocrText) : EMPTY_JSON_STRING,
    extraction: row.extraction ? JSON.parse(row.extraction) : EMPTY_JSON_OBJECT,
    correctedValue: row.correctedValue,
    fieldName: row.fieldName,
    createdAt: row.createdAt,
  };
}

function buildCountsRecord(rows: any[]): Record<string, number> {
  const counts: Record<string, number> = {};
  rows.forEach(row => {
    counts[row.docType] = row.count;
  });
  return counts;
}

export interface GoldExample {
  docId: number;
  docType: string;
  ocrText: string;
  extraction: Record<string, any>;
  correctedValue: string;
  fieldName?: string;
  createdAt: string;
}

export interface ExampleQuery {
  docType: string;
  keywords?: string[];
  limit?: number;
}

export class ExampleStore {
  private db: Database;

  constructor(db?: Database) {
    this.db = db || getDatabase();
  }

  async getGoldExample(query: ExampleQuery): Promise<GoldExample | null> {
    const { docType, keywords = DEFAULT_KEYWORDS, limit = DEFAULT_EXAMPLE_LIMIT } = query;

    return new Promise((resolve, reject) => {
      const keywordFilter = buildKeywordFilter(keywords);
      const sql = `${BASE_GOLD_EXAMPLE_QUERY}${keywordFilter.conditions} ORDER BY RANDOM() LIMIT ?`;
      const params: any[] = [docType, IS_GOLD_FLAG, ...keywordFilter.params, limit];

      this.db.get(sql, params, (err, row: any) => {
        if (err) {
          reject(new Error(`Failed to retrieve gold example: ${err.message}`));
          return;
        }

        if (!row) {
          resolve(null);
          return;
        }

        try {
          const example = parseGoldExampleFromRow(row);
          resolve(example);
        } catch (parseError: any) {
          reject(new Error(`Failed to parse gold example: ${parseError.message}`));
        }
      });
    });
  }

  async getGoldExamples(query: ExampleQuery): Promise<GoldExample[]> {
    const { docType, keywords = DEFAULT_KEYWORDS, limit = DEFAULT_MULTIPLE_EXAMPLES_LIMIT } = query;

    return new Promise((resolve, reject) => {
      const keywordFilter = buildKeywordFilter(keywords);
      const sql = `${BASE_GOLD_EXAMPLE_QUERY}${keywordFilter.conditions} ORDER BY RANDOM() LIMIT ?`;
      const params: any[] = [docType, IS_GOLD_FLAG, ...keywordFilter.params, limit];

      this.db.all(sql, params, (err, rows: any[]) => {
        if (err) {
          reject(new Error(`Failed to retrieve gold examples: ${err.message}`));
          return;
        }

        const examples = rows.map(parseGoldExampleFromRow);
        resolve(examples);
      });
    });
  }

  async getGoldExampleCounts(): Promise<Record<string, number>> {
    return new Promise((resolve, reject) => {
      this.db.all(GOLD_EXAMPLE_COUNTS_QUERY, [IS_GOLD_FLAG], (err, rows: any[]) => {
        if (err) {
          reject(new Error(`Failed to get gold example counts: ${err.message}`));
          return;
        }

        const counts = buildCountsRecord(rows);
        resolve(counts);
      });
    });
  }

  async markAsGold(correctionId: number, isGold: boolean): Promise<void> {
    return new Promise((resolve, reject) => {
      const goldValue = isGold ? GOLD_MARKED : NOT_GOLD_MARKED;
      this.db.run(UPDATE_GOLD_STATUS_QUERY, [goldValue, correctionId], function (err) {
        if (err) {
          reject(new Error(`Failed to mark correction as gold: ${err.message}`));
          return;
        }
        resolve();
      });
    });
  }
}

let exampleStoreInstance: ExampleStore | null = null;

export function getExampleStore(): ExampleStore {
  if (!exampleStoreInstance) {
    exampleStoreInstance = new ExampleStore();
  }
  return exampleStoreInstance;
}
