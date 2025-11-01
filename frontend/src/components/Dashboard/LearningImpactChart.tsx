import React from 'react';

interface LearningImpactChartProps {
  learningImpactDelta: number | null;
  correctionCount: number | null;
}

export const LearningImpactChart: React.FC<LearningImpactChartProps> = ({
  learningImpactDelta,
  correctionCount,
}) => {
  const hasData = correctionCount !== null && correctionCount > 0;

  const getImpactColor = (delta: number | null): string => {
    if (delta === null) return 'text-gray-500';
    if (delta >= 0.1) return 'text-green-600';
    if (delta >= 0.05) return 'text-green-500';
    if (delta >= 0) return 'text-blue-500';
    if (delta >= -0.05) return 'text-orange-500';
    return 'text-red-600';
  };

  const getImpactLabel = (delta: number | null): string => {
    if (delta === null) return 'No data';
    if (delta >= 0.1) return 'Excellent improvement';
    if (delta >= 0.05) return 'Good improvement';
    if (delta >= 0) return 'Slight improvement';
    if (delta >= -0.05) return 'Slight decline';
    return 'Significant decline';
  };

  const formatDelta = (delta: number | null): string => {
    if (delta === null) return 'N/A';
    const sign = delta >= 0 ? '+' : '';
    return `${sign}${(delta * 100).toFixed(1)}%`;
  };

  return (
    <div className="bg-white rounded-lg shadow p-6">
      <h3 className="text-lg font-semibold text-gray-900 mb-4">Learning Loop Impact</h3>

      {!hasData ? (
        <div className="text-center py-8">
          <p className="text-gray-500 mb-2">No corrections applied yet</p>
          <p className="text-sm text-gray-400">
            Apply corrections to see learning impact on accuracy
          </p>
        </div>
      ) : (
        <div className="space-y-6">
          {/* Main metric display */}
          <div className="text-center">
            <div className={`text-5xl font-bold ${getImpactColor(learningImpactDelta)}`}>
              {formatDelta(learningImpactDelta)}
            </div>
            <div className="text-sm text-gray-600 mt-2">
              {getImpactLabel(learningImpactDelta)}
            </div>
          </div>

          {/* Correction count */}
          <div className="bg-gray-50 rounded-lg p-4">
            <div className="flex justify-between items-center">
              <span className="text-sm font-medium text-gray-700">Corrections Applied</span>
              <span className="text-2xl font-bold text-gray-900">{correctionCount}</span>
            </div>
            <div className="mt-2 text-xs text-gray-500">
              {correctionCount === 1
                ? '1 correction has been'
                : `${correctionCount} corrections have been`}{' '}
              used to improve model accuracy
            </div>
          </div>

          {/* Visual indicator */}
          <div className="relative">
            <div className="h-12 bg-gradient-to-r from-red-500 via-yellow-500 to-green-500 rounded-lg" />
            <div
              className="absolute top-0 h-12 w-1 bg-gray-900"
              style={{
                left: `${learningImpactDelta !== null ? Math.min(Math.max((learningImpactDelta + 0.2) / 0.4 * 100, 0), 100) : 50}%`,
              }}
              title={`Current impact: ${formatDelta(learningImpactDelta)}`}
            >
              <div className="absolute -top-6 left-1/2 transform -translate-x-1/2 bg-gray-900 text-white text-xs px-2 py-1 rounded whitespace-nowrap">
                {formatDelta(learningImpactDelta)}
              </div>
            </div>
            <div className="flex justify-between text-xs text-gray-600 mt-1">
              <span>-20%</span>
              <span>0%</span>
              <span>+20%</span>
            </div>
          </div>

          {/* Explanation */}
          <div className="bg-blue-50 border border-blue-200 rounded-lg p-4">
            <h4 className="text-sm font-semibold text-blue-900 mb-2">How Learning Works</h4>
            <ul className="text-xs text-blue-800 space-y-1">
              <li>• Corrections are stored as gold examples in the database</li>
              <li>• The LLM retrieves similar past corrections via tool calling</li>
              <li>• Learning impact measures accuracy improvement over baseline</li>
              <li>• More corrections = better few-shot learning performance</li>
            </ul>
          </div>
        </div>
      )}
    </div>
  );
};
