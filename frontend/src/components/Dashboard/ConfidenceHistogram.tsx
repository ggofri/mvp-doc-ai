import React from 'react';

const CONFIDENCE_BINS = [
  { label: '0-0.3', min: 0, max: 0.3, color: 'bg-red-500' },
  { label: '0.3-0.5', min: 0.3, max: 0.5, color: 'bg-orange-500' },
  { label: '0.5-0.7', min: 0.5, max: 0.7, color: 'bg-yellow-500' },
  { label: '0.7-0.9', min: 0.7, max: 0.9, color: 'bg-blue-500' },
  { label: '0.9-1.0', min: 0.9, max: 1.0, color: 'bg-green-500' },
];

const HIGH_CONFIDENCE_THRESHOLD = 0.7;
const PERCENTAGE_MULTIPLIER = 100;
const DECIMAL_PLACES_PERCENT = 0;
const HIGH_CONFIDENCE_BINS_START = 3;
const HIGH_CONFIDENCE_BINS_END = 4;
const LOW_CONFIDENCE_BINS_START = 0;
const LOW_CONFIDENCE_BINS_END = 2;

function calculateBinCounts(values: number[]): number[] {
  const counts = CONFIDENCE_BINS.map(() => 0);
  values.forEach(value => {
    for (let i = 0; i < CONFIDENCE_BINS.length; i++) {
      if (value >= CONFIDENCE_BINS[i].min && value <= CONFIDENCE_BINS[i].max) {
        counts[i]++;
        break;
      }
    }
  });
  return counts;
}

interface ConfidenceHistogramProps {
  distribution: Record<string, number[]> | null;
}

export const ConfidenceHistogram: React.FC<ConfidenceHistogramProps> = ({ distribution }) => {
  if (!distribution || Object.keys(distribution).length === 0) {
    return (
      <div className="bg-white rounded-lg shadow p-6">
        <h3 className="text-lg font-semibold text-gray-900 mb-4">Confidence Distribution</h3>
        <p className="text-gray-500">No confidence data available yet.</p>
      </div>
    );
  }

  const allValues = Object.values(distribution).flat();
  const binCounts = calculateBinCounts(allValues);
  const maxCount = Math.max(...binCounts, 1);

  return (
    <div className="bg-white rounded-lg shadow p-6">
      <h3 className="text-lg font-semibold text-gray-900 mb-4">Confidence Distribution</h3>
      <p className="text-sm text-gray-600 mb-4">
        Distribution of confidence scores across all documents
      </p>

      <div className="space-y-3">
        {CONFIDENCE_BINS.map((bin, idx) => {
          const count = binCounts[idx];
          const percentage = maxCount > 0 ? (count / maxCount) * PERCENTAGE_MULTIPLIER : 0;

          return (
            <div key={idx} className="flex items-center space-x-3">
              <div className="w-20 text-sm font-medium text-gray-700">{bin.label}</div>
              <div className="flex-1 bg-gray-200 rounded-full h-6 relative">
                <div
                  className={`${bin.color} h-6 rounded-full flex items-center justify-end pr-2 text-white text-xs font-medium`}
                  style={{ width: `${percentage}%` }}
                >
                  {count > 0 && <span>{count}</span>}
                </div>
              </div>
              <div className="w-12 text-sm text-gray-600 text-right">{count}</div>
            </div>
          );
        })}
      </div>

      <div className="mt-4 text-xs text-gray-500">
        <p>Total documents: {allValues.length}</p>
        <p>High confidence (≥{HIGH_CONFIDENCE_THRESHOLD}): {binCounts[HIGH_CONFIDENCE_BINS_START] + binCounts[HIGH_CONFIDENCE_BINS_END]}</p>
        <p>Low confidence (&lt;{HIGH_CONFIDENCE_THRESHOLD}): {binCounts[LOW_CONFIDENCE_BINS_START] + binCounts[1] + binCounts[LOW_CONFIDENCE_BINS_END]}</p>
      </div>

      <div className="mt-6 border-t pt-4">
        <h4 className="text-sm font-semibold text-gray-700 mb-3">By Document Type</h4>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
          {Object.entries(distribution).map(([docType, values]) => {
            const avgConfidence = values.length > 0
              ? values.reduce((sum, val) => sum + val, 0) / values.length
              : 0;

            return (
              <div key={docType} className="bg-gray-50 rounded p-3">
                <div className="text-xs font-medium text-gray-700 mb-1">{docType}</div>
                <div className="flex items-center space-x-2">
                  <div className="flex-1 bg-gray-300 rounded-full h-2">
                    <div
                      className="bg-blue-600 h-2 rounded-full"
                      style={{ width: `${avgConfidence * PERCENTAGE_MULTIPLIER}%` }}
                    />
                  </div>
                  <div className="text-xs font-medium text-gray-700">
                    {(avgConfidence * PERCENTAGE_MULTIPLIER).toFixed(DECIMAL_PLACES_PERCENT)}%
                  </div>
                </div>
                <div className="text-xs text-gray-500 mt-1">{values.length} docs</div>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
};
