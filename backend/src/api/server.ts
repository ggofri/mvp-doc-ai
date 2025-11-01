import express, { Express } from 'express';
import cors from 'cors';
import { requestLogger } from './middleware/requestLogger';
import { errorHandler, notFoundHandler } from './middleware/errorHandler';
import uploadRoutes from './routes/upload';
import documentRoutes from './routes/documents';
import correctionsRoutes from './routes/corrections';
import metricsRoutes from './routes/metrics';
import settingsRoutes from './routes/settings';

const DEFAULT_FRONTEND_URL = 'http://localhost:5173';
const JSON_SIZE_LIMIT = '10mb';
const URLENCODED_SIZE_LIMIT = '10mb';

export function createApp(): Express {
  const app = express();

  app.use(
    cors({
      origin: process.env.FRONTEND_URL || DEFAULT_FRONTEND_URL,
      credentials: true,
    })
  );

  app.use(express.json({ limit: JSON_SIZE_LIMIT }));
  app.use(express.urlencoded({ extended: true, limit: URLENCODED_SIZE_LIMIT }));

  app.use(requestLogger);

  app.get('/api/health', (req, res) => {
    res.json({ status: 'ok', timestamp: new Date().toISOString() });
  });

  app.use('/api/upload', uploadRoutes);
  app.use('/api/docs', documentRoutes);
  app.use('/api/docs', correctionsRoutes);
  app.use('/api/metrics', metricsRoutes);
  app.use('/api/settings', settingsRoutes);

  app.use(notFoundHandler);

  app.use(errorHandler);

  return app;
}
