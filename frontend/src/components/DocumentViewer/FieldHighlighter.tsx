import React, { useState } from 'react';

const DEFAULT_SCALE = 1.0;
const CONFIDENCE_HIGH_THRESHOLD = 0.7;
const CONFIDENCE_MEDIUM_THRESHOLD = 0.5;
const PERCENTAGE_MULTIPLIER = 100;
const DECIMAL_PLACES = 1;
const DECIMAL_PLACES_PERCENT = 0;
const MIN_TOOLTIP_WIDTH = 200;

export interface HighlightedField {
  name: string;
  value: string | number | boolean;
  confidence: number;
  page: number;
  bbox: [number, number, number, number];
}

interface FieldHighlighterProps {
  fields: HighlightedField[];
  currentPage: number;
  scale?: number;
  onFieldClick?: (field: HighlightedField) => void;
  selectedFieldName?: string | null;
}

export const FieldHighlighter: React.FC<FieldHighlighterProps> = ({
  fields,
  currentPage,
  scale = DEFAULT_SCALE,
  onFieldClick,
  selectedFieldName = null,
}) => {
  const [hoveredField, setHoveredField] = useState<string | null>(null);

  const currentPageFields = fields.filter((field) => field.page === currentPage);

  if (currentPageFields.length === 0) {
    return null;
  }

  const getConfidenceColor = (confidence: number, isSelected: boolean, isHovered: boolean) => {
    if (isSelected) {
      return 'border-blue-600 bg-blue-200';
    }
    if (isHovered) {
      return 'border-purple-500 bg-purple-200';
    }
    if (confidence >= CONFIDENCE_HIGH_THRESHOLD) {
      return 'border-green-500 bg-green-100';
    }
    if (confidence >= CONFIDENCE_MEDIUM_THRESHOLD) {
      return 'border-yellow-500 bg-yellow-100';
    }
    return 'border-red-500 bg-red-100';
  };

  const getConfidenceLabel = (confidence: number): string => {
    if (confidence >= CONFIDENCE_HIGH_THRESHOLD) return 'High';
    if (confidence >= CONFIDENCE_MEDIUM_THRESHOLD) return 'Medium';
    return 'Low';
  };

  const formatFieldValue = (value: string | number | boolean): string => {
    if (typeof value === 'boolean') {
      return value ? 'Yes' : 'No';
    }
    if (typeof value === 'number') {
      return value.toString();
    }
    return value;
  };

  const handleFieldClick = (field: HighlightedField) => {
    if (onFieldClick) {
      onFieldClick(field);
    }
  };

  return (
    <div className="field-highlighter-overlay absolute inset-0 pointer-events-none">
      {currentPageFields.map((field, idx) => {
        const [x, y, width, height] = field.bbox;
        const isSelected = selectedFieldName === field.name;
        const isHovered = hoveredField === field.name;
        const confidenceColor = getConfidenceColor(field.confidence, isSelected, isHovered);

        return (
          <div
            key={`${field.name}-${idx}`}
            className={`absolute border-2 ${confidenceColor} bg-opacity-30 transition-all duration-150 pointer-events-auto cursor-pointer hover:bg-opacity-50`}
            style={{
              left: `${x * scale}px`,
              top: `${y * scale}px`,
              width: `${width * scale}px`,
              height: `${height * scale}px`,
            }}
            onMouseEnter={() => setHoveredField(field.name)}
            onMouseLeave={() => setHoveredField(null)}
            onClick={() => handleFieldClick(field)}
          >
            {isHovered && (
              <div className="absolute z-10 p-2 mt-1 text-xs bg-gray-900 text-white rounded shadow-lg pointer-events-none"
                   style={{ top: '100%', left: '0', minWidth: `${MIN_TOOLTIP_WIDTH}px` }}>
                <div className="font-semibold mb-1">{field.name}</div>
                <div className="text-gray-300 mb-1">
                  Value: {formatFieldValue(field.value)}
                </div>
                <div className="flex items-center justify-between">
                  <span>Confidence:</span>
                  <span className={`font-medium ${
                    field.confidence >= CONFIDENCE_HIGH_THRESHOLD ? 'text-green-400' :
                    field.confidence >= CONFIDENCE_MEDIUM_THRESHOLD ? 'text-yellow-400' :
                    'text-red-400'
                  }`}>
                    {getConfidenceLabel(field.confidence)} ({(field.confidence * PERCENTAGE_MULTIPLIER).toFixed(DECIMAL_PLACES)}%)
                  </span>
                </div>
                <div className="text-gray-400 mt-1 text-[10px]">
                  Page {field.page} • Click to edit
                </div>
              </div>
            )}

            <div
              className={`absolute top-0 right-0 transform translate-x-1/2 -translate-y-1/2 px-1.5 py-0.5 text-[10px] font-semibold rounded ${
                field.confidence >= CONFIDENCE_HIGH_THRESHOLD
                  ? 'bg-green-600 text-white'
                  : field.confidence >= CONFIDENCE_MEDIUM_THRESHOLD
                  ? 'bg-yellow-600 text-white'
                  : 'bg-red-600 text-white'
              }`}
            >
              {(field.confidence * PERCENTAGE_MULTIPLIER).toFixed(DECIMAL_PLACES_PERCENT)}%
            </div>
          </div>
        );
      })}

      {/* Legend */}
      <div className="absolute top-4 right-4 bg-white border border-gray-300 rounded shadow-lg p-3 pointer-events-auto">
        <div className="text-xs font-semibold mb-2 text-gray-700">Field Confidence</div>
        <div className="space-y-1.5">
          <div className="flex items-center gap-2">
            <div className="w-4 h-4 border-2 border-green-500 bg-green-100"></div>
            <span className="text-xs text-gray-600">High (&ge; 70%)</span>
          </div>
          <div className="flex items-center gap-2">
            <div className="w-4 h-4 border-2 border-yellow-500 bg-yellow-100"></div>
            <span className="text-xs text-gray-600">Medium (50-69%)</span>
          </div>
          <div className="flex items-center gap-2">
            <div className="w-4 h-4 border-2 border-red-500 bg-red-100"></div>
            <span className="text-xs text-gray-600">Low (&lt; 50%)</span>
          </div>
          {selectedFieldName && (
            <div className="flex items-center gap-2 pt-1 mt-1 border-t border-gray-200">
              <div className="w-4 h-4 border-2 border-blue-600 bg-blue-200"></div>
              <span className="text-xs text-gray-600">Selected</span>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};
