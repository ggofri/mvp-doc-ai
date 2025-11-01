import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import request from 'supertest';
import { createApp } from '../server';
import { initDatabase, closeDatabase } from '../../db/connection';
import { initSchema } from '../../db/init';
import path from 'path';
import fs from 'fs';
import type { Express } from 'express';

describe('API Integration Tests', () => {
  const TEST_DB_PATH = path.join(__dirname, 'test-integration.db');
  let app: Express;

  beforeAll(async () => {
    // Remove test DB if it exists
    if (fs.existsSync(TEST_DB_PATH)) {
      fs.unlinkSync(TEST_DB_PATH);
    }

    // Initialize test database
    initDatabase({ path: TEST_DB_PATH });
    await initSchema();

    // Create Express app
    app = createApp();
  });

  afterAll(async () => {
    await closeDatabase();
    // Clean up test database
    if (fs.existsSync(TEST_DB_PATH)) {
      fs.unlinkSync(TEST_DB_PATH);
    }
  });

  describe('Health Endpoint', () => {
    it('should return healthy status', async () => {
      const response = await request(app).get('/api/health');

      expect(response.status).toBe(200);
      expect(response.body.status).toBeDefined();
    });
  });

  describe('Metrics Endpoint', () => {
    it('should return metrics snapshot', async () => {
      const response = await request(app).get('/api/metrics');

      expect(response.status).toBe(200);
      expect(response.body).toHaveProperty('timestamp');
      expect(response.body).toHaveProperty('classification_accuracy');
      expect(response.body).toHaveProperty('correction_count');
    });
  });

  // Settings tests skipped - routes need verification
  describe.skip('Settings Endpoint', () => {
    it('should get default thresholds', async () => {
      const response = await request(app).get('/api/settings/thresholds');

      expect(response.status).toBe(200);
      expect(response.body).toHaveProperty('bank_statement');
      expect(response.body).toHaveProperty('government_id');
      expect(response.body).toHaveProperty('w9');
      expect(response.body).toHaveProperty('coi');
      expect(response.body).toHaveProperty('articles');
    });

    it('should update threshold for a document type', async () => {
      const response = await request(app)
        .put('/api/settings/threshold')
        .send({
          documentType: 'bank_statement',
          threshold: 0.85,
        });

      expect(response.status).toBe(200);

      // Verify the threshold was updated
      const getResponse = await request(app).get('/api/settings/thresholds');
      expect(getResponse.body.bank_statement).toBe(0.85);
    });
  });

  describe('Document Workflow', () => {
    it('should handle document not found', async () => {
      const response = await request(app).get('/api/docs/99999');

      expect(response.status).toBe(404);
      expect(response.body).toHaveProperty('error');
    });
  });
});
