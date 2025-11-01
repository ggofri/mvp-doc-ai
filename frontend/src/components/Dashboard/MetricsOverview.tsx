import React from 'react';

interface MetricsOverviewProps {
  metrics: {
    classification_accuracy?: number | null;
    auto_approve_rate?: number | null;
    review_rate?: number | null;
    correction_count?: number | null;
    latency_p50?: number | null;
    latency_p95?: number | null;
    field_exact_match_rate?: Record<string, number> | null;
    learning_impact_delta?: number | null;
  };
}

export const MetricsOverview: React.FC<MetricsOverviewProps> = ({ metrics }) => {
  const formatPercentage = (value: number | null | undefined): string => {
    if (value === null || value === undefined) return 'N/A';
    return `${(value * 100).toFixed(1)}%`;
  };

  const formatLatency = (value: number | null | undefined): string => {
    if (value === null || value === undefined) return 'N/A';
    return `${value.toFixed(0)}ms`;
  };

  const formatDelta = (value: number | null | undefined): string => {
    if (value === null || value === undefined) return 'N/A';
    const sign = value >= 0 ? '+' : '';
    return `${sign}${(value * 100).toFixed(1)}%`;
  };

  const calculateAverageFieldAccuracy = (): string => {
    if (!metrics.field_exact_match_rate) return 'N/A';
    const values = Object.values(metrics.field_exact_match_rate);
    if (values.length === 0) return 'N/A';
    const avg = values.reduce((sum, val) => sum + val, 0) / values.length;
    return `${(avg * 100).toFixed(1)}%`;
  };

  return (
    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
      {/* Classification Accuracy */}
      <div className="bg-white rounded-lg shadow p-6">
        <h3 className="text-sm font-medium text-gray-500 mb-2">Classification Accuracy</h3>
        <p className="text-3xl font-bold text-gray-900">
          {formatPercentage(metrics.classification_accuracy)}
        </p>
        <p className="text-xs text-gray-500 mt-1">Overall document type prediction</p>
      </div>

      {/* Auto-Approve Rate */}
      <div className="bg-white rounded-lg shadow p-6">
        <h3 className="text-sm font-medium text-gray-500 mb-2">Auto-Approve Rate</h3>
        <p className="text-3xl font-bold text-green-600">
          {formatPercentage(metrics.auto_approve_rate)}
        </p>
        <p className="text-xs text-gray-500 mt-1">High confidence documents</p>
      </div>

      {/* Review Rate */}
      <div className="bg-white rounded-lg shadow p-6">
        <h3 className="text-sm font-medium text-gray-500 mb-2">Review Rate</h3>
        <p className="text-3xl font-bold text-yellow-600">
          {formatPercentage(metrics.review_rate)}
        </p>
        <p className="text-xs text-gray-500 mt-1">Documents needing review</p>
      </div>

      {/* Correction Count */}
      <div className="bg-white rounded-lg shadow p-6">
        <h3 className="text-sm font-medium text-gray-500 mb-2">Corrections Applied</h3>
        <p className="text-3xl font-bold text-gray-900">
          {metrics.correction_count ?? 0}
        </p>
        <p className="text-xs text-gray-500 mt-1">Total human corrections</p>
      </div>

      {/* Latency P50 */}
      <div className="bg-white rounded-lg shadow p-6">
        <h3 className="text-sm font-medium text-gray-500 mb-2">Latency (P50)</h3>
        <p className="text-3xl font-bold text-gray-900">
          {formatLatency(metrics.latency_p50)}
        </p>
        <p className="text-xs text-gray-500 mt-1">Median processing time</p>
      </div>

      {/* Latency P95 */}
      <div className="bg-white rounded-lg shadow p-6">
        <h3 className="text-sm font-medium text-gray-500 mb-2">Latency (P95)</h3>
        <p className="text-3xl font-bold text-gray-900">
          {formatLatency(metrics.latency_p95)}
        </p>
        <p className="text-xs text-gray-500 mt-1">95th percentile</p>
      </div>

      {/* Field Extraction Accuracy */}
      <div className="bg-white rounded-lg shadow p-6">
        <h3 className="text-sm font-medium text-gray-500 mb-2">Field Extraction Accuracy</h3>
        <p className="text-3xl font-bold text-gray-900">
          {calculateAverageFieldAccuracy()}
        </p>
        <p className="text-xs text-gray-500 mt-1">Average exact match rate</p>
      </div>

      {/* Learning Impact */}
      <div className="bg-white rounded-lg shadow p-6">
        <h3 className="text-sm font-medium text-gray-500 mb-2">Learning Impact</h3>
        <p className={`text-3xl font-bold ${
          metrics.learning_impact_delta && metrics.learning_impact_delta >= 0
            ? 'text-green-600'
            : 'text-red-600'
        }`}>
          {formatDelta(metrics.learning_impact_delta)}
        </p>
        <p className="text-xs text-gray-500 mt-1">Accuracy improvement from corrections</p>
      </div>
    </div>
  );
};
