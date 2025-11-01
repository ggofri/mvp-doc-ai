import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { initDatabase, closeDatabase } from '../../../db/connection';
import { initSchema } from '../../../db/init';
import { MetricsCalculator } from '../MetricsCalculator';
import path from 'path';
import fs from 'fs';

describe('MetricsCalculator', () => {
  const TEST_DB_PATH = path.join(__dirname, 'test.db');
  let calculator: MetricsCalculator;

  beforeAll(async () => {
    // Remove test DB if it exists
    if (fs.existsSync(TEST_DB_PATH)) {
      fs.unlinkSync(TEST_DB_PATH);
    }

    // Initialize test database
    initDatabase({ path: TEST_DB_PATH });
    await initSchema();

    calculator = new MetricsCalculator();
  });

  afterAll(async () => {
    await closeDatabase();
    // Clean up test database
    if (fs.existsSync(TEST_DB_PATH)) {
      fs.unlinkSync(TEST_DB_PATH);
    }
  });

  describe('Learning Metrics', () => {
    it('should calculate learning metrics with no data', async () => {
      const metrics = await calculator.calculateLearningMetrics();

      expect(metrics).toBeDefined();
      expect(metrics.totalCorrections).toBe(0);
      expect(metrics.goldExamplesCount).toBe(0);
      expect(metrics.toolCallsCount).toBe(0);
      expect(metrics.accuracyImprovement).toBeNull();
    });
  });

  describe('Classification Metrics', () => {
    it('should calculate classification metrics with no data', async () => {
      const metrics = await calculator.calculateClassificationMetrics();

      // With no corrected documents, metrics should be defined
      expect(metrics).toBeDefined();
      expect(metrics.accuracy).toBeDefined();
    });
  });

  describe('Operational Metrics', () => {
    it('should calculate operational metrics with no data', async () => {
      const metrics = await calculator.calculateOperationalMetrics();

      expect(metrics).toBeDefined();
      expect(metrics.autoApproveRate).toBeDefined();
      expect(metrics.reviewRate).toBeDefined();
      expect(typeof metrics.autoApproveRate).toBe('number');
      expect(typeof metrics.reviewRate).toBe('number');
    });
  });
});
