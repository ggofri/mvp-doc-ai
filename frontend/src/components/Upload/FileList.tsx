import React from 'react';
import { useQuery } from '@tanstack/react-query';
import { getDocuments } from '../../services/api';
import type { DocumentStatus } from '../../types';

interface FileListProps {
  filter?: {
    status?: DocumentStatus;
    corrected?: boolean;
  };
  onDocumentClick?: (documentId: number) => void;
}

export function FileList({ filter, onDocumentClick }: FileListProps) {
  const { data: documents, isLoading, error } = useQuery({
    queryKey: ['documents', filter],
    queryFn: () => getDocuments(filter),
    refetchInterval: 5000, // Poll every 5 seconds for processing updates
  });

  if (isLoading) {
    return (
      <div className="flex justify-center items-center p-8">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600"></div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="p-4 bg-red-50 border border-red-200 rounded-md">
        <p className="text-red-800">Error loading documents: {(error as Error).message}</p>
      </div>
    );
  }

  if (!documents || documents.length === 0) {
    return (
      <div className="text-center p-8 text-gray-500">
        <p>No documents found</p>
      </div>
    );
  }

  const getStatusColor = (status: DocumentStatus) => {
    switch (status) {
      case 'completed':
        return 'bg-green-100 text-green-800';
      case 'needs_review':
        return 'bg-yellow-100 text-yellow-800';
      case 'error':
        return 'bg-red-100 text-red-800';
      case 'pending':
      case 'ocr_in_progress':
      case 'classification_in_progress':
      case 'extraction_in_progress':
        return 'bg-blue-100 text-blue-800';
      default:
        return 'bg-gray-100 text-gray-800';
    }
  };

  const getStatusLabel = (status: DocumentStatus) => {
    const labels: Record<DocumentStatus, string> = {
      pending: 'Pending',
      ocr_in_progress: 'OCR Processing',
      classification_in_progress: 'Classifying',
      extraction_in_progress: 'Extracting',
      completed: 'Completed',
      needs_review: 'Needs Review',
      error: 'Error',
    };
    return labels[status] || status;
  };

  return (
    <div className="space-y-3">
      {documents.map((doc) => (
        <div
          key={doc.id}
          className="bg-white border border-gray-200 rounded-lg p-4 hover:shadow-md transition-shadow cursor-pointer"
          onClick={() => onDocumentClick?.(doc.id)}
        >
          <div className="flex items-start justify-between">
            <div className="flex-1 min-w-0">
              <h3 className="text-lg font-medium text-gray-900 truncate">
                {doc.filename}
              </h3>
              <div className="mt-2 flex items-center space-x-4 text-sm text-gray-500">
                <span>{doc.page_count} pages</span>
                <span>{(doc.file_size / 1024).toFixed(0)} KB</span>
                <span>{new Date(doc.upload_timestamp).toLocaleString()}</span>
              </div>
              {doc.type && (
                <div className="mt-2">
                  <span className="text-sm font-medium text-gray-700">
                    Type: {doc.type}
                  </span>
                  {doc.confidence !== null && (
                    <span className="ml-2 text-sm text-gray-600">
                      ({(doc.confidence * 100).toFixed(1)}% confidence)
                    </span>
                  )}
                </div>
              )}
            </div>
            <div className="ml-4 flex-shrink-0">
              <span
                className={`px-3 py-1 rounded-full text-xs font-medium ${getStatusColor(
                  doc.processing_status
                )}`}
              >
                {getStatusLabel(doc.processing_status)}
              </span>
              {doc.corrected && (
                <span className="ml-2 px-2 py-1 rounded-full text-xs font-medium bg-purple-100 text-purple-800">
                  Corrected
                </span>
              )}
            </div>
          </div>
        </div>
      ))}
    </div>
  );
}
