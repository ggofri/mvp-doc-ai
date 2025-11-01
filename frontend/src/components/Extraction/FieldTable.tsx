import React, { useState } from 'react';
import type { Field } from '../../types';

const DEFAULT_EDITABLE = false;
const CONFIDENCE_VERY_HIGH_THRESHOLD = 0.9;
const CONFIDENCE_HIGH_THRESHOLD = 0.7;
const PERCENTAGE_MULTIPLIER = 100;
const DECIMAL_PLACES_PERCENT = 0;
const BOOLEAN_TRUE_VALUES = ['yes', 'true'];
const VALUE_SEPARATOR = ', ';

interface FieldTableProps {
  fields: Field[];
  onFieldClick?: (field: Field) => void;
  editable?: boolean;
  onFieldChange?: (fieldName: string, newValue: string | number | boolean) => void;
  onFieldApprove?: (fieldName: string) => void;
  approvedFieldsInSession?: Set<string>;
}

function getConfidenceColor(confidence: number): string {
  if (confidence >= CONFIDENCE_VERY_HIGH_THRESHOLD) return 'text-green-600 bg-green-50';
  if (confidence >= CONFIDENCE_HIGH_THRESHOLD) return 'text-yellow-600 bg-yellow-50';
  return 'text-red-600 bg-red-50';
}

function getConfidenceLabel(confidence: number): string {
  if (confidence >= CONFIDENCE_VERY_HIGH_THRESHOLD) return 'High';
  if (confidence >= CONFIDENCE_HIGH_THRESHOLD) return 'Medium';
  return 'Low';
}

export function FieldTable({ fields, onFieldClick, editable = DEFAULT_EDITABLE, onFieldChange, onFieldApprove, approvedFieldsInSession }: FieldTableProps) {
  const [editingField, setEditingField] = useState<string | null>(null);
  const [editValue, setEditValue] = useState<string>('');
  
  if (!fields || fields.length === 0) {
    return (
      <div className="text-center py-8 text-gray-500">
        No fields extracted yet
      </div>
    );
  }

  const formatFieldName = (name: string): string => {
    return name
      .replace(/_/g, ' ')
      .replace(/\b\w/g, (char) => char.toUpperCase());
  };

  const formatValue = (value: Field['value']): string => {
    if (value === null || value === undefined) return 'N/A';
    if (typeof value === 'boolean') return value ? 'Yes' : 'No';
    if (Array.isArray(value)) return value.join(VALUE_SEPARATOR);
    return String(value);
  };

  const handleEditStart = (field: Field) => {
    if (!editable) return;
    setEditingField(field.name);
    setEditValue(formatValue(field.value));
  };

  const handleEditCancel = () => {
    setEditingField(null);
    setEditValue('');
  };

  const handleEditSave = (fieldName: string, originalType: string | number | boolean) => {
    if (!onFieldChange) return;

    let parsedValue: string | number | boolean = editValue;

    if (typeof originalType === 'number') {
      const numValue = parseFloat(editValue);
      if (!isNaN(numValue)) {
        parsedValue = numValue;
      }
    } else if (typeof originalType === 'boolean') {
      const lowerValue = editValue.toLowerCase();
      parsedValue = BOOLEAN_TRUE_VALUES.includes(lowerValue);
    }

    onFieldChange(fieldName, parsedValue);
    setEditingField(null);
    setEditValue('');
  };

  const handleKeyPress = (e: React.KeyboardEvent, fieldName: string, originalType: string | number | boolean) => {
    if (e.key === 'Enter') {
      handleEditSave(fieldName, originalType);
    } else if (e.key === 'Escape') {
      handleEditCancel();
    }
  };

  return (
    <div className="overflow-x-auto">
      <table className="min-w-full divide-y divide-gray-200">
        <thead className="bg-gray-50">
          <tr>
            <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
              Field
            </th>
            <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
              Value
            </th>
            <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
              Confidence
            </th>
            <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
              Status
            </th>
            {editable && (
              <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                Actions
              </th>
            )}
          </tr>
        </thead>
        <tbody className="bg-white divide-y divide-gray-200">
          {fields.map((field, index) => {
            const isEditing = editingField === field.name;
            return (
            <tr
              key={index}
              className={!isEditing && onFieldClick ? 'cursor-pointer hover:bg-gray-50' : ''}
            >
              <td className="px-6 py-4 whitespace-nowrap text-sm font-medium text-gray-900">
                <div className="flex items-center gap-2">
                  {formatFieldName(field.name)}
                  {(field.approved || approvedFieldsInSession?.has(field.name)) && (
                    <span className="inline-flex px-2 py-0.5 text-xs font-semibold rounded-full text-green-700 bg-green-100 border border-green-300">
                      ✓ Approved
                    </span>
                  )}
                  {field.corrected && !field.approved && !approvedFieldsInSession?.has(field.name) && (
                    <span className="inline-flex px-2 py-0.5 text-xs font-semibold rounded-full text-blue-700 bg-blue-100 border border-blue-300">
                      ✎ Corrected
                    </span>
                  )}
                </div>
              </td>
              <td className="px-6 py-4 text-sm text-gray-700">
                {isEditing ? (
                  <div className="flex items-center gap-2">
                    <input
                      type="text"
                      value={editValue}
                      onChange={(e) => setEditValue(e.target.value)}
                      onKeyDown={(e) => handleKeyPress(e, field.name, Array.isArray(field.value) ? field.value.join(VALUE_SEPARATOR) : field.value)}
                      className="flex-1 px-2 py-1 border border-blue-500 rounded focus:outline-none focus:ring-2 focus:ring-blue-500"
                      autoFocus
                    />
                    <button
                      onClick={() => handleEditSave(field.name, Array.isArray(field.value) ? field.value.join(VALUE_SEPARATOR) : field.value)}
                      className="px-2 py-1 text-xs bg-green-500 text-white rounded hover:bg-green-600"
                    >
                      Save
                    </button>
                    <button
                      onClick={handleEditCancel}
                      className="px-2 py-1 text-xs bg-gray-500 text-white rounded hover:bg-gray-600"
                    >
                      Cancel
                    </button>
                  </div>
                ) : (
                  <div
                    className="max-w-md truncate"
                    title={formatValue(field.value)}
                    onClick={() => onFieldClick?.(field)}
                  >
                    {formatValue(field.value)}
                  </div>
                )}
              </td>
              <td className="px-6 py-4 text-sm">
                <span
                  className={`inline-flex px-2 py-1 text-xs font-semibold rounded-full ${getConfidenceColor(
                    field.final_confidence
                  )}`}
                >
                  {getConfidenceLabel(field.final_confidence)} (
                  {(field.final_confidence * 100).toFixed(0)}%)
                </span>
                <div className="text-xs text-gray-500 mt-1">
                  LLM: {(field.llm_confidence * 100).toFixed(0)}% | Val:{' '}
                  {(field.validation_confidence * 100).toFixed(0)}% | Clarity:{' '}
                  {(field.clarity_confidence * 100).toFixed(0)}%
                </div>
                {field.reasons && field.reasons.length > 0 && (
                  <div className="mt-2 text-xs text-amber-700 bg-amber-50 px-2 py-1 rounded border border-amber-200">
                    <div className="font-semibold mb-1">Why low:</div>
                    <ul className="list-disc list-inside space-y-0.5">
                      {field.reasons.map((reason, idx) => (
                        <li key={idx} className="break-words">{reason}</li>
                      ))}
                    </ul>
                  </div>
                )}
              </td>
              <td className="px-6 py-4 whitespace-nowrap text-sm">
                <span
                  className={`inline-flex px-2 py-1 text-xs font-semibold rounded-full ${
                    field.validation_status === 'passed'
                      ? 'text-green-600 bg-green-50'
                      : field.validation_status === 'failed'
                      ? 'text-red-600 bg-red-50'
                      : 'text-gray-600 bg-gray-50'
                  }`}
                >
                  {field.validation_status}
                </span>
                {field.validation_error && (
                  <div className="text-xs text-red-500 mt-1" title={field.validation_error}>
                    {field.validation_error}
                  </div>
                )}
              </td>
              {editable && (
                <td className="px-6 py-4 whitespace-nowrap text-sm">
                  {!isEditing && (
                    <div className="flex items-center gap-2">
                      <button
                        onClick={() => handleEditStart(field)}
                        className="px-3 py-1 text-xs bg-blue-500 text-white rounded hover:bg-blue-600"
                      >
                        Edit
                      </button>
                      {onFieldApprove && !field.approved && !approvedFieldsInSession?.has(field.name) && (
                        <button
                          onClick={() => onFieldApprove(field.name)}
                          className="px-3 py-1 text-xs bg-green-500 text-white rounded hover:bg-green-600"
                          title="Mark this field as correctly extracted"
                        >
                          ✓ Mark Correct
                        </button>
                      )}
                      {(field.approved || approvedFieldsInSession?.has(field.name)) && (
                        <span className="text-xs text-green-600 font-medium">
                          Approved
                        </span>
                      )}
                    </div>
                  )}
                </td>
              )}
            </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}
