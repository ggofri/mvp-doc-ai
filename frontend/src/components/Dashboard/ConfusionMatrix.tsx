import React from 'react';

const DOCUMENT_TYPES = [
  'Bank Statement',
  'Government ID',
  'W-9',
  'Certificate of Insurance',
  'Articles of Incorporation',
];

interface ConfusionMatrixProps {
  matrix: number[][] | null;
}

export const ConfusionMatrix: React.FC<ConfusionMatrixProps> = ({ matrix }) => {
  if (!matrix || matrix.length === 0) {
    return (
      <div className="bg-white rounded-lg shadow p-6">
        <h3 className="text-lg font-semibold text-gray-900 mb-4">Confusion Matrix</h3>
        <p className="text-gray-500">No classification data available yet.</p>
      </div>
    );
  }

  const maxValue = Math.max(...matrix.flat());

  const getColorIntensity = (value: number): string => {
    if (value === 0) return 'bg-gray-50';
    const intensity = maxValue > 0 ? value / maxValue : 0;
    if (intensity >= 0.8) return 'bg-blue-600 text-white';
    if (intensity >= 0.6) return 'bg-blue-500 text-white';
    if (intensity >= 0.4) return 'bg-blue-400';
    if (intensity >= 0.2) return 'bg-blue-300';
    return 'bg-blue-200';
  };

  const shortLabels = DOCUMENT_TYPES.map(type => {
    if (type === 'Bank Statement') return 'Bank';
    if (type === 'Government ID') return 'Gov ID';
    if (type === 'Certificate of Insurance') return 'COI';
    if (type === 'Articles of Incorporation') return 'Articles';
    return type;
  });

  return (
    <div className="bg-white rounded-lg shadow p-6">
      <h3 className="text-lg font-semibold text-gray-900 mb-4">Confusion Matrix</h3>
      <p className="text-sm text-gray-600 mb-4">
        Rows: Actual document type | Columns: Predicted document type
      </p>

      <div className="overflow-x-auto">
        <table className="min-w-full border-collapse">
          <thead>
            <tr>
              <th className="border border-gray-300 p-2 bg-gray-100 text-xs font-medium text-gray-700">
                Actual \ Predicted
              </th>
              {shortLabels.map((label, idx) => (
                <th
                  key={idx}
                  className="border border-gray-300 p-2 bg-gray-100 text-xs font-medium text-gray-700"
                  title={DOCUMENT_TYPES[idx]}
                >
                  {label}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {matrix.map((row, rowIdx) => (
              <tr key={rowIdx}>
                <td
                  className="border border-gray-300 p-2 bg-gray-100 text-xs font-medium text-gray-700"
                  title={DOCUMENT_TYPES[rowIdx]}
                >
                  {shortLabels[rowIdx]}
                </td>
                {row.map((value, colIdx) => (
                  <td
                    key={colIdx}
                    className={`border border-gray-300 p-2 text-center text-sm font-medium ${getColorIntensity(
                      value
                    )}`}
                  >
                    {value}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <div className="mt-4 text-xs text-gray-500">
        <p>Diagonal values (darker blue) indicate correct classifications.</p>
        <p>Off-diagonal values indicate misclassifications.</p>
      </div>
    </div>
  );
};
