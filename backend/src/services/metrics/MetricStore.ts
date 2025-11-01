import { getMetricsCalculator } from './MetricsCalculator';

const CACHE_TTL_MS = 10000;
const DEFAULT_COUNT = 0;

export interface MetricSnapshot {
  timestamp: string;
  classification_accuracy: number | null;
  classification_precision: Record<string, number> | null;
  classification_recall: Record<string, number> | null;
  confusion_matrix: number[][] | null;
  field_exact_match_rate: Record<string, number> | null;
  field_token_f1: Record<string, number> | null;
  latency_p50: number | null;
  latency_p95: number | null;
  cost_per_document: number | null;
  auto_approve_rate: number | null;
  review_rate: number | null;
  confidence_distribution: Record<string, number[]> | null;
  correction_count: number | null;
  learning_impact_delta: number | null;
}

interface CachedMetrics {
  snapshot: MetricSnapshot;
  timestamp: number;
}

function isCacheValid(cache: CachedMetrics | null): boolean {
  if (!cache) {
    return false;
  }
  return Date.now() - cache.timestamp < CACHE_TTL_MS;
}

export class MetricStore {
  private metricsCalculator = getMetricsCalculator();
  private cache: CachedMetrics | null = null;

  async getMetrics(): Promise<MetricSnapshot> {
    if (isCacheValid(this.cache)) {
      console.log('Returning cached metrics');
      return this.cache!.snapshot;
    }

    console.log('Recalculating metrics...');
    const snapshot = await this.calculateMetrics();

    this.cache = {
      snapshot,
      timestamp: Date.now(),
    };

    return snapshot;
  }

  async refreshMetrics(): Promise<MetricSnapshot> {
    console.log('Force recalculating metrics...');
    const snapshot = await this.calculateMetrics();

    this.cache = {
      snapshot,
      timestamp: Date.now(),
    };

    return snapshot;
  }

  invalidateCache(): void {
    console.log('Invalidating metrics cache');
    this.cache = null;
  }

  private async calculateMetrics(): Promise<MetricSnapshot> {
    try {
      const [
        classificationMetrics,
        extractionMetrics,
        operationalMetrics,
        learningMetrics,
        confidenceDistribution,
      ] = await Promise.all([
        this.metricsCalculator.calculateClassificationMetrics(),
        this.metricsCalculator.calculateExtractionMetrics(),
        this.metricsCalculator.calculateOperationalMetrics(),
        this.metricsCalculator.calculateLearningMetrics(),
        this.metricsCalculator.calculateConfidenceDistribution(),
      ]);

      const snapshot: MetricSnapshot = {
        timestamp: new Date().toISOString(),
        classification_accuracy: classificationMetrics.accuracy,
        classification_precision: classificationMetrics.precision,
        classification_recall: classificationMetrics.recall,
        confusion_matrix: classificationMetrics.confusionMatrix,
        field_exact_match_rate: extractionMetrics.exactMatchRate,
        field_token_f1: extractionMetrics.tokenF1,
        latency_p50: operationalMetrics.latencyP50,
        latency_p95: operationalMetrics.latencyP95,
        cost_per_document: operationalMetrics.costPerDocument,
        auto_approve_rate: operationalMetrics.autoApproveRate,
        review_rate: operationalMetrics.reviewRate,
        confidence_distribution: confidenceDistribution,
        correction_count: learningMetrics.totalCorrections,
        learning_impact_delta: learningMetrics.accuracyImprovement,
      };

      return snapshot;
    } catch (error) {
      console.error('Error calculating metrics:', error);
      return this.getEmptySnapshot();
    }
  }

  private getEmptySnapshot(): MetricSnapshot {
    return {
      timestamp: new Date().toISOString(),
      classification_accuracy: null,
      classification_precision: null,
      classification_recall: null,
      confusion_matrix: null,
      field_exact_match_rate: null,
      field_token_f1: null,
      latency_p50: null,
      latency_p95: null,
      cost_per_document: null,
      auto_approve_rate: null,
      review_rate: null,
      confidence_distribution: null,
      correction_count: null,
      learning_impact_delta: null,
    };
  }

  getCacheStatus(): { cached: boolean; age: number | null } {
    if (!this.cache) {
      return { cached: false, age: null };
    }

    const age = Date.now() - this.cache.timestamp;
    return { cached: true, age };
  }

  async saveMetricsSnapshot(snapshotType: 'periodic' | 'after_correction' = 'periodic'): Promise<void> {
    try {
      const snapshot = await this.calculateMetrics();

      const { run } = await import('../../db/connection');

      await run(
        `
        INSERT INTO metrics_history (
          timestamp,
          classification_accuracy,
          total_documents,
          total_corrections,
          snapshot_json,
          snapshot_type
        ) VALUES (?, ?, ?, ?, ?, ?)
      `,
        [
          snapshot.timestamp,
          snapshot.classification_accuracy,
          await this.getTotalDocuments(),
          snapshot.correction_count,
          JSON.stringify(snapshot),
          snapshotType,
        ]
      );

      console.log(`Metrics snapshot saved (type: ${snapshotType})`);
    } catch (error) {
      console.error('Failed to save metrics snapshot:', error);
    }
  }

  private async getTotalDocuments(): Promise<number> {
    const { get } = await import('../../db/connection');
    const result = await get<{ count: number }>('SELECT COUNT(*) as count FROM docs', []);
    return result?.count || DEFAULT_COUNT;
  }
}

let metricStore: MetricStore | null = null;

export function getMetricStore(): MetricStore {
  if (!metricStore) {
    metricStore = new MetricStore();
  }
  return metricStore;
}
