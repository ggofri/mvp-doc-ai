import React, { useState } from 'react';

export type DocumentType =
  | 'Bank Statement'
  | 'Government ID'
  | 'W-9'
  | 'Certificate of Insurance'
  | 'Articles of Incorporation'
  | 'Unknown';

interface DocumentTypeSelectorProps {
  currentType: DocumentType | null;
  confidence?: number;
  onTypeChange: (newType: DocumentType) => void;
  onApprove?: () => void;
  isApproved?: boolean;
  disabled?: boolean;
}

const DOCUMENT_TYPES: DocumentType[] = [
  'Bank Statement',
  'Government ID',
  'W-9',
  'Certificate of Insurance',
  'Articles of Incorporation',
  'Unknown',
];

const TYPE_DESCRIPTIONS: Record<DocumentType, string> = {
  'Bank Statement': 'Monthly or quarterly bank account statements',
  'Government ID': 'Driver licenses, passports, or state-issued IDs',
  'W-9': 'Request for Taxpayer Identification Number',
  'Certificate of Insurance': 'Proof of insurance coverage',
  'Articles of Incorporation': 'Company formation documents',
  'Unknown': 'Document type cannot be determined or not in known types',
};

export const DocumentTypeSelector: React.FC<DocumentTypeSelectorProps> = ({
  currentType,
  confidence = 0,
  onTypeChange,
  onApprove,
  isApproved = false,
  disabled = false,
}) => {
  const [isOpen, setIsOpen] = useState(false);
  const [selectedType, setSelectedType] = useState<DocumentType | null>(currentType);

  const handleTypeSelect = (type: DocumentType) => {
    setSelectedType(type);
    onTypeChange(type);
    setIsOpen(false);
  };

  const getConfidenceBadge = () => {
    if (!confidence || confidence === 0) return null;

    const confidencePercent = Math.round(confidence * 100);
    let badgeColor = 'bg-green-100 text-green-800';
    let badgeText = 'High Confidence';

    if (confidence < 0.7) {
      badgeColor = 'bg-red-100 text-red-800';
      badgeText = 'Low Confidence';
    } else if (confidence < 0.85) {
      badgeColor = 'bg-yellow-100 text-yellow-800';
      badgeText = 'Medium Confidence';
    }

    return (
      <span className={`ml-2 px-2 py-0.5 text-xs font-medium rounded ${badgeColor}`}>
        {badgeText} · Model: {confidencePercent}%
      </span>
    );
  };

  return (
    <div className="document-type-selector">
      <label className="block text-sm font-medium text-gray-700 mb-2">
        Document Type
      </label>

      <div className="relative">
        <button
          type="button"
          onClick={() => setIsOpen(!isOpen)}
          disabled={disabled}
          className="relative w-full bg-white border border-gray-300 rounded-md shadow-sm pl-3 pr-10 py-2.5 text-left cursor-pointer focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500 disabled:bg-gray-100 disabled:cursor-not-allowed"
        >
          <span className="flex items-center">
            {selectedType || currentType ? (
              <>
                <span className="block truncate text-gray-900">
                  {selectedType || currentType}
                </span>
                {getConfidenceBadge()}
              </>
            ) : (
              <span className="block truncate text-gray-400">
                Select document type...
              </span>
            )}
          </span>
          <span className="absolute inset-y-0 right-0 flex items-center pr-2 pointer-events-none">
            <svg
              className={`h-5 w-5 text-gray-400 transition-transform ${
                isOpen ? 'transform rotate-180' : ''
              }`}
              viewBox="0 0 20 20"
              fill="currentColor"
            >
              <path
                fillRule="evenodd"
                d="M5.293 7.293a1 1 0 011.414 0L10 10.586l3.293-3.293a1 1 0 111.414 1.414l-4 4a1 1 0 01-1.414 0l-4-4a1 1 0 010-1.414z"
                clipRule="evenodd"
              />
            </svg>
          </span>
        </button>

        {isOpen && !disabled && (
          <div className="absolute z-10 mt-1 w-full bg-white shadow-lg max-h-60 rounded-md py-1 text-base ring-1 ring-black ring-opacity-5 overflow-auto focus:outline-none">
            {DOCUMENT_TYPES.map((type) => {
              const isSelected = type === (selectedType || currentType);
              return (
                <button
                  key={type}
                  type="button"
                  onClick={() => handleTypeSelect(type)}
                  className={`w-full text-left px-3 py-2 hover:bg-gray-100 ${
                    isSelected ? 'bg-blue-50 text-blue-900' : 'text-gray-900'
                  }`}
                >
                  <div className="flex items-center justify-between">
                    <div>
                      <div className="font-medium">{type}</div>
                      <div className="text-xs text-gray-500 mt-0.5">
                        {TYPE_DESCRIPTIONS[type]}
                      </div>
                    </div>
                    {isSelected && (
                      <svg
                        className="h-5 w-5 text-blue-600"
                        viewBox="0 0 20 20"
                        fill="currentColor"
                      >
                        <path
                          fillRule="evenodd"
                          d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z"
                          clipRule="evenodd"
                        />
                      </svg>
                    )}
                  </div>
                </button>
              );
            })}
          </div>
        )}
      </div>

      {onApprove && currentType && !isApproved && (
        <div className="mt-3">
          <button
            type="button"
            onClick={onApprove}
            className="px-4 py-2 text-sm bg-green-500 text-white rounded hover:bg-green-600 font-medium"
          >
            ✓ Approve Classification
          </button>
          <p className="mt-1 text-xs text-gray-500">
            Confirm that "{currentType}" is correct
          </p>
        </div>
      )}

      {isApproved && currentType && (
        <div className="mt-3 p-2 bg-green-50 border border-green-200 rounded text-sm text-green-800 flex items-center gap-2">
          <svg className="h-5 w-5 text-green-600" viewBox="0 0 20 20" fill="currentColor">
            <path
              fillRule="evenodd"
              d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.707-9.293a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z"
              clipRule="evenodd"
            />
          </svg>
          <span className="font-medium">Classification approved</span>
        </div>
      )}

      {confidence < 0.7 && currentType && !isApproved && (
        <div className="mt-2 p-2 bg-yellow-50 border border-yellow-200 rounded text-xs text-yellow-800">
          <strong>Low confidence detected.</strong> Please review the classification
          and correct if necessary.
        </div>
      )}

      {/* Overlay to close dropdown when clicking outside */}
      {isOpen && (
        <div
          className="fixed inset-0 z-0"
          onClick={() => setIsOpen(false)}
        />
      )}
    </div>
  );
};
