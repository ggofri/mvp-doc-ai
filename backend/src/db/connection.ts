import sqlite3 from 'sqlite3';
import path from 'path';

const ENABLE_FOREIGN_KEYS_PROPAGMA = 'PRAGMA foreign_keys = ON';
const HEALTH_CHECK_QUERY = 'SELECT 1 as result';
const HEALTH_CHECK_EXPECTED_VALUE = 1;
const BEGIN_TRANSACTION_QUERY = 'BEGIN TRANSACTION';
const COMMIT_TRANSACTION_QUERY = 'COMMIT';
const ROLLBACK_TRANSACTION_QUERY = 'ROLLBACK';

let db: sqlite3.Database | null = null;

export interface DatabaseConfig {
  path: string;
  verbose?: boolean;
}

export function initDatabase(config: DatabaseConfig): sqlite3.Database {
  if (db) {
    return db;
  }

  const sqlite = config.verbose ? sqlite3.verbose() : sqlite3;
  const dbPath = path.resolve(config.path);

  db = new sqlite.Database(dbPath, (err) => {
    if (err) {
      console.error('Failed to connect to database:', err);
      throw err;
    }
    console.log(`Connected to SQLite database at ${dbPath}`);
  });

  db.run(ENABLE_FOREIGN_KEYS_PROPAGMA);

  return db;
}

export function getDatabase(): sqlite3.Database {
  if (!db) {
    throw new Error('Database not initialized. Call initDatabase() first.');
  }
  return db;
}

export function closeDatabase(): Promise<void> {
  return new Promise((resolve, reject) => {
    if (!db) {
      resolve();
      return;
    }

    db.close((err) => {
      if (err) {
        reject(err);
      } else {
        db = null;
        console.log('Database connection closed');
        resolve();
      }
    });
  });
}

export function run(
  sql: string,
  params: unknown[] = []
): Promise<{ lastID: number; changes: number }> {
  return new Promise((resolve, reject) => {
    getDatabase().run(sql, params, function (err) {
      if (err) {
        reject(err);
      } else {
        resolve({ lastID: this.lastID, changes: this.changes });
      }
    });
  });
}

export function get<T>(sql: string, params: unknown[] = []): Promise<T | undefined> {
  return new Promise((resolve, reject) => {
    const database = getDatabase();
    database.get(sql, params, (err, row) => {
      if (err) {
        reject(err);
      } else {
        resolve(row as T);
      }
    });
  });
}

export function all<T>(sql: string, params: unknown[] = []): Promise<T[]> {
  return new Promise((resolve, reject) => {
    const database = getDatabase();
    database.all(sql, params, (err, rows) => {
      if (err) {
        reject(err);
      } else {
        resolve(rows as T[]);
      }
    });
  });
}

export async function transaction(
  queries: Array<{ sql: string; params?: unknown[] }>
): Promise<void> {

  await run(BEGIN_TRANSACTION_QUERY);

  try {
    for (const query of queries) {
      await run(query.sql, query.params || []);
    }
    await run(COMMIT_TRANSACTION_QUERY);
  } catch (err) {
    await run(ROLLBACK_TRANSACTION_QUERY);
    throw err;
  }
}

export async function healthCheck(): Promise<boolean> {
  try {
    const result = await get<{ result: number }>(HEALTH_CHECK_QUERY);
    return result?.result === HEALTH_CHECK_EXPECTED_VALUE;
  } catch (err) {
    console.error('Database health check failed:', err);
    return false;
  }
}
