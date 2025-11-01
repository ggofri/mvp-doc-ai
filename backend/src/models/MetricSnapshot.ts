import type { MetricSnapshot } from '@fuse/shared/schemas/documentTypes.zod';

export interface MetricSnapshotModel extends MetricSnapshot {
  id: number;
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

/**
 * Service interface for metrics calculation
 */
export interface MetricsService {
  /**
   * Calculate current metrics snapshot
   * Recalculates from raw docs and corrections tables
   */
  calculateMetrics(): Promise<MetricSnapshotModel>;

  /**
   * Get cached metrics (10-second cache)
   */
  getCachedMetrics(): Promise<MetricSnapshotModel>;

  /**
   * Calculate classification accuracy
   */
  calculateClassificationAccuracy(): Promise<number>;

  /**
   * Calculate precision and recall per document type
   */
  calculatePrecisionRecall(): Promise<{
    precision: Record<string, number>;
    recall: Record<string, number>;
  }>;

  /**
   * Calculate confusion matrix
   */
  calculateConfusionMatrix(): Promise<number[][]>;

  /**
   * Calculate field-level metrics
   */
  calculateFieldMetrics(): Promise<{
    exactMatchRate: Record<string, number>;
    tokenF1: Record<string, number>;
  }>;

  /**
   * Calculate operational metrics (latency, cost, rates)
   */
  calculateOperationalMetrics(): Promise<{
    latency_p50: number;
    latency_p95: number;
    cost_per_document: number;
    auto_approve_rate: number;
    review_rate: number;
  }>;

  /**
   * Calculate learning impact (accuracy improvement from corrections)
   */
  calculateLearningImpact(): Promise<number>;
}
