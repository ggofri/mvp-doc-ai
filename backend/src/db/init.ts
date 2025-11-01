import fs from 'fs';
import path from 'path';
import { getDatabase } from './connection';

const SCHEMA_FILE_NAME = 'schema.sql';
const SQL_COMMENT_PREFIX = '--';
const SQL_STATEMENT_SEPARATOR = ';';
const UTF8_ENCODING = 'utf8';
const SQL_STATEMENT_PREVIEW_LENGTH = 100;
const SCHEMA_CHECK_QUERY = "SELECT name FROM sqlite_master WHERE type='table' AND name='docs'";

function parseSqlStatements(schemaSql: string): string[] {
  return schemaSql
    .split('\n')
    .filter((line) => !line.trim().startsWith(SQL_COMMENT_PREFIX))
    .join('\n')
    .split(SQL_STATEMENT_SEPARATOR)
    .map((stmt) => stmt.trim())
    .filter((stmt) => stmt.length > 0);
}

export async function initSchema(): Promise<void> {
  try {
    const schemaPath = path.join(__dirname, SCHEMA_FILE_NAME);
    const schemaSql = fs.readFileSync(schemaPath, UTF8_ENCODING);

    const statements = parseSqlStatements(schemaSql);
    const db = getDatabase();

    for (const statement of statements) {
      await new Promise<void>((resolve, reject) => {
        db.run(statement, (err) => {
          if (err) {
            console.error('Failed to execute SQL statement:', statement.substring(0, SQL_STATEMENT_PREVIEW_LENGTH) + '...');
            console.error('Error:', err.message);
            reject(err);
          } else {
            resolve();
          }
        });
      });
    }

    console.log('Database schema initialized successfully');
  } catch (err) {
    console.error('Failed to initialize database schema:', err);
    throw err;
  }
}

export async function checkSchema(): Promise<boolean> {
  try {
    const db = getDatabase();
    const result = await new Promise<{ name: string } | undefined>((resolve, reject) => {
      db.get(
        SCHEMA_CHECK_QUERY,
        (err, row) => {
          if (err) reject(err);
          else resolve(row as { name: string } | undefined);
        }
      );
    });

    return result !== undefined;
  } catch (err) {
    console.error('Failed to check database schema:', err);
    return false;
  }
}

export async function ensureSchema(): Promise<void> {
  const schemaExists = await checkSchema();

  if (!schemaExists) {
    console.log('Database schema not found. Initializing...');
    await initSchema();
  } else {
    console.log('Database schema exists. Running updates for any new tables...');
    await initSchema();
  }
}
