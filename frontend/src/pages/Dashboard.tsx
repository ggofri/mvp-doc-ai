import React, { useEffect, useState } from 'react';
import { getMetrics } from '../services/api';
import type { MetricSnapshot } from '../types';
import { MetricsOverview } from '../components/Dashboard/MetricsOverview';
import { ConfusionMatrix } from '../components/Dashboard/ConfusionMatrix';
import { ConfidenceHistogram } from '../components/Dashboard/ConfidenceHistogram';
import { LearningImpactChart } from '../components/Dashboard/LearningImpactChart';

export const Dashboard: React.FC = () => {
  const [metrics, setMetrics] = useState<MetricSnapshot | null>(null);
  const [loading, setLoading] = useState<boolean>(true);
  const [error, setError] = useState<string | null>(null);
  const [lastUpdate, setLastUpdate] = useState<Date | null>(null);

  const fetchMetrics = async () => {
    try {
      const data = await getMetrics();
      setMetrics(data);
      setLastUpdate(new Date());
      setError(null);
    } catch (err) {
      console.error('Failed to fetch metrics:', err);
      setError(err instanceof Error ? err.message : 'Failed to fetch metrics');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    // Initial fetch
    fetchMetrics();

    // Poll every 10 seconds
    const interval = setInterval(() => {
      fetchMetrics();
    }, 10000);

    return () => clearInterval(interval);
  }, []);

  if (loading && !metrics) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <div className="text-center">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600 mx-auto mb-4"></div>
          <p className="text-gray-600">Loading metrics...</p>
        </div>
      </div>
    );
  }

  if (error && !metrics) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <div className="bg-red-50 border border-red-200 rounded-lg p-6 max-w-md">
          <h2 className="text-red-900 font-semibold mb-2">Error Loading Metrics</h2>
          <p className="text-red-700">{error}</p>
          <button
            onClick={fetchMetrics}
            className="mt-4 bg-red-600 text-white px-4 py-2 rounded hover:bg-red-700"
          >
            Retry
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-50">
      {/* Header */}
      <div className="bg-white border-b border-gray-200">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-6">
          <div className="flex items-center justify-between">
            <div>
              <h1 className="text-3xl font-bold text-gray-900">Metrics Dashboard</h1>
              <p className="text-sm text-gray-600 mt-1">
                System quality and performance metrics
              </p>
            </div>
            <div className="text-right">
              <div className="text-sm text-gray-600">Last updated</div>
              <div className="text-sm font-medium text-gray-900">
                {lastUpdate ? lastUpdate.toLocaleTimeString() : 'N/A'}
              </div>
              <div className="text-xs text-gray-500 mt-1">
                Auto-refresh every 10s
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Main Content */}
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8 space-y-8">
        {/* Error Banner (if polling fails but we have cached data) */}
        {error && metrics && (
          <div className="bg-yellow-50 border border-yellow-200 rounded-lg p-4">
            <p className="text-yellow-800 text-sm">
              <strong>Warning:</strong> Failed to refresh metrics. Showing cached data. {error}
            </p>
          </div>
        )}

        {/* No Data State */}
        {!metrics && (
          <div className="bg-white rounded-lg shadow p-12 text-center">
            <svg
              className="mx-auto h-12 w-12 text-gray-400"
              fill="none"
              stroke="currentColor"
              viewBox="0 0 24 24"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z"
              />
            </svg>
            <h3 className="mt-2 text-sm font-medium text-gray-900">No metrics available</h3>
            <p className="mt-1 text-sm text-gray-500">
              Upload and process documents to see metrics here.
            </p>
          </div>
        )}

        {/* Metrics Display */}
        {metrics && (
          <>
            {/* Overview Cards */}
            <section>
              <h2 className="text-xl font-semibold text-gray-900 mb-4">Overview</h2>
              <MetricsOverview metrics={metrics} />
            </section>

            {/* Classification Metrics */}
            <section>
              <h2 className="text-xl font-semibold text-gray-900 mb-4">
                Classification Performance
              </h2>
              <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
                <ConfusionMatrix matrix={metrics.confusion_matrix} />
                <ConfidenceHistogram distribution={metrics.confidence_distribution} />
              </div>
            </section>

            {/* Learning Loop */}
            <section>
              <h2 className="text-xl font-semibold text-gray-900 mb-4">Learning Loop</h2>
              <LearningImpactChart
                learningImpactDelta={metrics.learning_impact_delta}
                correctionCount={metrics.correction_count}
              />
            </section>

            {/* Field-Level Metrics (if available) */}
            {metrics.field_exact_match_rate &&
              Object.keys(metrics.field_exact_match_rate).length > 0 && (
                <section>
                  <h2 className="text-xl font-semibold text-gray-900 mb-4">
                    Field Extraction Quality
                  </h2>
                  <div className="bg-white rounded-lg shadow p-6">
                    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                      {Object.entries(metrics.field_exact_match_rate).map(
                        ([fieldName, rate]) => {
                          const tokenF1 = metrics.field_token_f1?.[fieldName] ?? null;
                          return (
                            <div key={fieldName} className="bg-gray-50 rounded-lg p-4">
                              <div className="text-sm font-medium text-gray-700 mb-3">
                                {fieldName.replace(/_/g, ' ')}
                              </div>

                              {/* Exact Match Rate */}
                              <div className="mb-3">
                                <div className="text-xs text-gray-600 mb-1">Exact Match</div>
                                <div className="flex items-center space-x-2">
                                  <div className="flex-1 bg-gray-300 rounded-full h-2">
                                    <div
                                      className="bg-green-600 h-2 rounded-full"
                                      style={{ width: `${rate * 100}%` }}
                                    />
                                  </div>
                                  <div className="text-sm font-semibold text-gray-900">
                                    {(rate * 100).toFixed(0)}%
                                  </div>
                                </div>
                              </div>

                              {/* Token F1 */}
                              {tokenF1 !== null && (
                                <div>
                                  <div className="text-xs text-gray-600 mb-1">Token F1</div>
                                  <div className="flex items-center space-x-2">
                                    <div className="flex-1 bg-gray-300 rounded-full h-2">
                                      <div
                                        className="bg-blue-600 h-2 rounded-full"
                                        style={{ width: `${tokenF1 * 100}%` }}
                                      />
                                    </div>
                                    <div className="text-sm font-semibold text-gray-900">
                                      {(tokenF1 * 100).toFixed(0)}%
                                    </div>
                                  </div>
                                </div>
                              )}
                            </div>
                          );
                        }
                      )}
                    </div>
                  </div>
                </section>
              )}

            {/* Precision & Recall (if available) */}
            {metrics.classification_precision &&
              Object.keys(metrics.classification_precision).length > 0 && (
                <section>
                  <h2 className="text-xl font-semibold text-gray-900 mb-4">
                    Precision & Recall by Document Type
                  </h2>
                  <div className="bg-white rounded-lg shadow p-6">
                    <div className="overflow-x-auto">
                      <table className="min-w-full">
                        <thead>
                          <tr className="border-b border-gray-200">
                            <th className="text-left py-3 px-4 text-sm font-medium text-gray-700">
                              Document Type
                            </th>
                            <th className="text-left py-3 px-4 text-sm font-medium text-gray-700">
                              Precision
                            </th>
                            <th className="text-left py-3 px-4 text-sm font-medium text-gray-700">
                              Recall
                            </th>
                          </tr>
                        </thead>
                        <tbody>
                          {Object.entries(metrics.classification_precision).map(
                            ([docType, precision]) => {
                              const recall = metrics.classification_recall?.[docType] ?? null;
                              return (
                                <tr key={docType} className="border-b border-gray-100">
                                  <td className="py-3 px-4 text-sm text-gray-900">{docType}</td>
                                  <td className="py-3 px-4 text-sm text-gray-900">
                                    {(precision * 100).toFixed(1)}%
                                  </td>
                                  <td className="py-3 px-4 text-sm text-gray-900">
                                    {recall !== null ? `${(recall * 100).toFixed(1)}%` : 'N/A'}
                                  </td>
                                </tr>
                              );
                            }
                          )}
                        </tbody>
                      </table>
                    </div>
                  </div>
                </section>
              )}
          </>
        )}
      </div>
    </div>
  );
};
