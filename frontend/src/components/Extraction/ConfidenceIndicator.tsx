import React from 'react';

interface ConfidenceIndicatorProps {
  confidence: number; // 0-1
  label?: string;
  showBreakdown?: boolean;
  llmConfidence?: number;
  validationConfidence?: number;
  clarityConfidence?: number;
  reasons?: string[]; // Reasons for low confidence
}

export function ConfidenceIndicator({
  confidence,
  label,
  showBreakdown = false,
  llmConfidence,
  validationConfidence,
  clarityConfidence,
  reasons,
}: ConfidenceIndicatorProps) {
  const percentage = Math.round(confidence * 100);

  const getColor = (): string => {
    if (confidence >= 0.9) return 'bg-green-500';
    if (confidence >= 0.7) return 'bg-yellow-500';
    return 'bg-red-500';
  };

  const getTextColor = (): string => {
    if (confidence >= 0.9) return 'text-green-700';
    if (confidence >= 0.7) return 'text-yellow-700';
    return 'text-red-700';
  };

  const getLabel = (): string => {
    if (label) return label;
    if (confidence >= 0.9) return 'High Confidence';
    if (confidence >= 0.7) return 'Medium Confidence';
    return 'Low Confidence';
  };

  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between">
        <span className={`text-sm font-medium ${getTextColor()}`}>
          {getLabel()}
        </span>
        <span className={`text-sm font-bold ${getTextColor()}`}>
          {percentage}%
        </span>
      </div>

      <div className="w-full bg-gray-200 rounded-full h-2">
        <div
          className={`${getColor()} h-2 rounded-full transition-all duration-300`}
          style={{ width: `${percentage}%` }}
        />
      </div>

      {/* Display reasons for low confidence */}
      {reasons && reasons.length > 0 && (
        <div className="mt-3 p-3 bg-amber-50 border border-amber-200 rounded-md">
          <div className="text-xs font-semibold text-amber-800 mb-2">
            Why confidence is low:
          </div>
          <ul className="text-xs text-amber-700 space-y-1 list-disc list-inside">
            {reasons.map((reason, index) => (
              <li key={index}>{reason}</li>
            ))}
          </ul>
        </div>
      )}

      {showBreakdown && (llmConfidence !== undefined || validationConfidence !== undefined || clarityConfidence !== undefined) && (
        <div className="text-xs text-gray-600 space-y-1 mt-2">
          <div className="font-semibold">Confidence Breakdown:</div>
          {llmConfidence !== undefined && (
            <div className="flex justify-between">
              <span>LLM Extraction:</span>
              <span>{Math.round(llmConfidence * 100)}%</span>
            </div>
          )}
          {validationConfidence !== undefined && (
            <div className="flex justify-between">
              <span>Schema Validation:</span>
              <span>{Math.round(validationConfidence * 100)}%</span>
            </div>
          )}
          {clarityConfidence !== undefined && (
            <div className="flex justify-between">
              <span>Text Clarity:</span>
              <span>{Math.round(clarityConfidence * 100)}%</span>
            </div>
          )}
          <div className="flex justify-between font-semibold pt-1 border-t border-gray-300">
            <span>Final (LLM × Val × Clarity):</span>
            <span>{percentage}%</span>
          </div>
        </div>
      )}
    </div>
  );
}
