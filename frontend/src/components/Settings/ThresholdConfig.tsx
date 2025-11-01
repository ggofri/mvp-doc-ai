import React, { useState } from 'react';

interface ThresholdConfigProps {
  thresholds: Record<string, number>;
  onUpdate: (thresholds: Record<string, number>) => Promise<void>;
}

export const ThresholdConfig: React.FC<ThresholdConfigProps> = ({
  thresholds,
  onUpdate,
}) => {
  const [localThresholds, setLocalThresholds] = useState<Record<string, number>>(thresholds);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);

  const documentTypes = [
    'Bank Statement',
    'Government ID',
    'W-9',
    'Certificate of Insurance',
    'Articles of Incorporation',
  ];

  const handleSliderChange = (docType: string, value: number) => {
    setLocalThresholds(prev => ({
      ...prev,
      [docType]: value,
    }));
    setSuccess(false);
    setError(null);
  };

  const handleSave = async () => {
    setSaving(true);
    setError(null);
    setSuccess(false);

    try {
      await onUpdate(localThresholds);
      setSuccess(true);
      setTimeout(() => setSuccess(false), 3000);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to update settings');
    } finally {
      setSaving(false);
    }
  };

  const handleReset = () => {
    setLocalThresholds(thresholds);
    setError(null);
    setSuccess(false);
  };

  const hasChanges = JSON.stringify(localThresholds) !== JSON.stringify(thresholds);

  const getThresholdColor = (threshold: number): string => {
    if (threshold >= 0.8) return 'text-green-600';
    if (threshold >= 0.6) return 'text-blue-600';
    if (threshold >= 0.5) return 'text-yellow-600';
    return 'text-red-600';
  };

  const getThresholdLabel = (threshold: number): string => {
    if (threshold >= 0.8) return 'High (more restrictive)';
    if (threshold >= 0.6) return 'Medium (balanced)';
    if (threshold >= 0.5) return 'Low (more permissive)';
    return 'Very Low (experimental)';
  };

  return (
    <div className="bg-white rounded-lg shadow p-6">
      <div className="mb-6">
        <h3 className="text-lg font-semibold text-gray-900 mb-2">
          Confidence Thresholds
        </h3>
        <p className="text-sm text-gray-600">
          Set the minimum confidence score required for auto-approval per document type.
          Documents below the threshold will be routed to human review.
        </p>
      </div>

      {error && (
        <div className="mb-4 bg-red-50 border border-red-200 rounded-lg p-4">
          <p className="text-red-800 text-sm">
            <strong>Error:</strong> {error}
          </p>
        </div>
      )}

      {success && (
        <div className="mb-4 bg-green-50 border border-green-200 rounded-lg p-4">
          <p className="text-green-800 text-sm">
            <strong>Success:</strong> Settings updated successfully
          </p>
        </div>
      )}

      <div className="space-y-6">
        {documentTypes.map(docType => {
          const threshold = localThresholds[docType] ?? 0.7;

          return (
            <div key={docType} className="border-b border-gray-200 pb-6 last:border-b-0">
              <div className="flex items-center justify-between mb-3">
                <label className="text-sm font-medium text-gray-900">{docType}</label>
                <div className="text-right">
                  <div className={`text-2xl font-bold ${getThresholdColor(threshold)}`}>
                    {(threshold * 100).toFixed(0)}%
                  </div>
                  <div className="text-xs text-gray-500">{getThresholdLabel(threshold)}</div>
                </div>
              </div>

              <input
                type="range"
                min="0.5"
                max="1.0"
                step="0.05"
                value={threshold}
                onChange={e => handleSliderChange(docType, parseFloat(e.target.value))}
                className="w-full h-2 bg-gray-200 rounded-lg appearance-none cursor-pointer accent-blue-600"
              />

              <div className="flex justify-between text-xs text-gray-500 mt-1">
                <span>50%</span>
                <span>60%</span>
                <span>70%</span>
                <span>80%</span>
                <span>90%</span>
                <span>100%</span>
              </div>

              <p className="text-xs text-gray-600 mt-2">
                Documents with confidence below {(threshold * 100).toFixed(0)}% will require
                human review.
              </p>
            </div>
          );
        })}
      </div>

      {/* Action Buttons */}
      <div className="mt-8 flex items-center justify-between">
        <button
          onClick={handleReset}
          disabled={!hasChanges || saving}
          className="px-4 py-2 text-sm font-medium text-gray-700 bg-gray-100 rounded-md hover:bg-gray-200 disabled:opacity-50 disabled:cursor-not-allowed"
        >
          Reset Changes
        </button>

        <button
          onClick={handleSave}
          disabled={!hasChanges || saving}
          className="px-6 py-2 text-sm font-medium text-white bg-blue-600 rounded-md hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed flex items-center space-x-2"
        >
          {saving && (
            <svg
              className="animate-spin h-4 w-4 text-white"
              xmlns="http://www.w3.org/2000/svg"
              fill="none"
              viewBox="0 0 24 24"
            >
              <circle
                className="opacity-25"
                cx="12"
                cy="12"
                r="10"
                stroke="currentColor"
                strokeWidth="4"
              ></circle>
              <path
                className="opacity-75"
                fill="currentColor"
                d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"
              ></path>
            </svg>
          )}
          <span>{saving ? 'Saving...' : 'Save Settings'}</span>
        </button>
      </div>

      {/* Info Box */}
      <div className="mt-6 bg-blue-50 border border-blue-200 rounded-lg p-4">
        <h4 className="text-sm font-semibold text-blue-900 mb-2">How Thresholds Work</h4>
        <ul className="text-xs text-blue-800 space-y-1">
          <li>
            • <strong>High thresholds (80-100%)</strong>: Fewer auto-approvals, more human
            reviews, higher accuracy
          </li>
          <li>
            • <strong>Medium thresholds (60-80%)</strong>: Balanced approach, recommended for
            most document types
          </li>
          <li>
            • <strong>Low thresholds (50-60%)</strong>: More auto-approvals, faster processing,
            higher risk
          </li>
          <li>
            • The system calculates confidence as: LLM score × Validation score × Clarity score
          </li>
        </ul>
      </div>
    </div>
  );
};
