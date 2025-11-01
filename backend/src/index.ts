import * as dotenv from 'dotenv';
import path from 'path';
import { createApp } from './api/server';
import { initDatabase, healthCheck, closeDatabase } from './db/connection';
import { ensureSchema } from './db/init';

dotenv.config();

const DEFAULT_PORT = 3000;
const DEFAULT_DATABASE_PATH = '../data/db.sqlite';
const DEFAULT_NODE_ENV = 'development';
const SHUTDOWN_TIMEOUT_MS = 10000;
const EXIT_SUCCESS = 0;
const EXIT_ERROR = 1;

const PORT = process.env.PORT || DEFAULT_PORT;
const DATABASE_PATH = process.env.DATABASE_PATH || DEFAULT_DATABASE_PATH;
const NODE_ENV = process.env.NODE_ENV || DEFAULT_NODE_ENV;

function buildServerUrls(port: number): { base: string; api: string; health: string } {
  const base = `http://localhost:${port}`;
  return {
    base,
    api: `${base}/api`,
    health: `${base}/api/health`,
  };
}

async function start(): Promise<void> {
  try {
    console.log(`Starting server in ${NODE_ENV} mode...`);

    console.log('Connecting to database...');
    initDatabase({
      path: path.resolve(__dirname, '..', DATABASE_PATH),
      verbose: NODE_ENV === DEFAULT_NODE_ENV,
    });

    const isHealthy = await healthCheck();
    if (!isHealthy) {
      throw new Error('Database health check failed');
    }
    console.log('Database connected and healthy');

    await ensureSchema();

    const app = createApp();

    const server = app.listen(PORT, () => {
      const urls = buildServerUrls(PORT);
      console.log(`Server running on ${urls.base}`);
      console.log(`API available at ${urls.api}`);
      console.log(`Health check: ${urls.health}`);
    });

    const shutdown = async (signal: string) => {
      console.log(`\n${signal} received. Shutting down gracefully...`);

      server.close(async () => {
        console.log('HTTP server closed');

        try {
          await closeDatabase();
          console.log('Database connection closed');
          process.exit(EXIT_SUCCESS);
        } catch (err) {
          console.error('Error closing database:', err);
          process.exit(EXIT_ERROR);
        }
      });

      setTimeout(() => {
        console.error('Forced shutdown after timeout');
        process.exit(EXIT_ERROR);
      }, SHUTDOWN_TIMEOUT_MS);
    };

    process.on('SIGTERM', () => shutdown('SIGTERM'));
    process.on('SIGINT', () => shutdown('SIGINT'));
  } catch (err) {
    console.error('Failed to start server:', err);
    process.exit(EXIT_ERROR);
  }
}

start();
