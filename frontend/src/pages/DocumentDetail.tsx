import React, { useState, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { getDocument } from '../services/api';
import { FieldTable } from '../components/Extraction/FieldTable';
import { ConfidenceIndicator } from '../components/Extraction/ConfidenceIndicator';
import { DocumentTypeSelector, DocumentType } from '../components/Extraction/DocumentTypeSelector';
import type { Field, OcrPage } from '../types';
import { PdfViewer } from '../components/DocumentViewer/PdfViewer';
import { PageNavigator } from '../components/DocumentViewer/PageNavigator';
import { saveCorrectionBackup, getCorrectionForDoc } from '../services/storage';

export function DocumentDetail() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const queryClient = useQueryClient();

  const [hasUnsavedChanges, setHasUnsavedChanges] = useState(false);
  const [correctedType, setCorrectedType] = useState<DocumentType | null>(null);
  const [correctedFields, setCorrectedFields] = useState<Record<string, string | number | boolean>>({});
  const [approvedFields, setApprovedFields] = useState<Set<string>>(new Set());
  const [classificationApproved, setClassificationApproved] = useState(false);
  const [showPdfModal, setShowPdfModal] = useState(false);
  const [approvalMessage, setApprovalMessage] = useState<string | null>(null);
  const [currentPage, setCurrentPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);

  const { data: document, isLoading, error } = useQuery({
    queryKey: ['document', id],
    queryFn: () => getDocument(Number(id)),
    enabled: !!id,
     refetchInterval: (query) => {
       // Poll every 3 seconds if still processing
       const data = query.state.data;
       if (
         data?.processing_status &&
         ['pending', 'ocr_in_progress', 'classification_in_progress', 'extraction_in_progress'].includes(
           data.processing_status
         )
       ) {
         return 3000;
       }
       return false;
     },
  });

  // Debug: Log extraction data
  useEffect(() => {
    if (document?.extraction) {
      console.log('Document extraction data:', {
        overall_confidence: document.extraction.overall_confidence,
        reasons: document.extraction.reasons,
        fields_sample: document.extraction.fields?.slice(0, 2).map((f: Field) => ({
          name: f.name,
          confidence: f.final_confidence,
          reasons: f.reasons
        }))
      });
    }
  }, [document]);

  // Mutation for saving corrections and approvals
  const saveCorrectionMutation = useMutation({
    mutationFn: async (corrections: Array<{
      correctionType: 'classification' | 'field';
      originalValue?: string;
      correctedValue: string;
      fieldName?: string;
      isApproval?: boolean;
    }>) => {
      const API_URL = import.meta.env.VITE_API_URL || 'http://localhost:3000/api';
      const results = [];

      for (const correction of corrections) {
        const response = await fetch(`${API_URL}/docs/${id}/correct`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(correction),
        });

        if (!response.ok) {
          throw new Error(`Failed to save correction: ${response.statusText}`);
        }

        results.push(await response.json());
      }

      return results;
    },
    onSuccess: () => {
      // Refresh document data
      queryClient.invalidateQueries({ queryKey: ['document', id] });
      setHasUnsavedChanges(false);
      setCorrectedType(null);
      setCorrectedFields({});
      setApprovedFields(new Set());
      setClassificationApproved(false);
    },
  });

  // Handlers
  const handleTypeChange = (newType: DocumentType) => {
    setCorrectedType(newType);
    setHasUnsavedChanges(true);
  };

  const handleFieldChange = (fieldName: string, newValue: string | number | boolean) => {
    setCorrectedFields(prev => ({
      ...prev,
      [fieldName]: newValue,
    }));
    setHasUnsavedChanges(true);
  };

  const handleFieldApprove = (fieldName: string) => {
    setApprovedFields(prev => new Set(prev).add(fieldName));
    setHasUnsavedChanges(true);

    // Show success message
    const fieldDisplay = fieldName.replace(/_/g, ' ').replace(/\b\w/g, (char) => char.toUpperCase());
    setApprovalMessage(`✓ Field "${fieldDisplay}" marked as correct`);
    setTimeout(() => setApprovalMessage(null), 3000);
  };

  const handleClassificationApprove = () => {
    setClassificationApproved(true);
    setHasUnsavedChanges(true);

    // Show success message
    setApprovalMessage(`✓ Classification approved as "${document?.type}"`);
    setTimeout(() => setApprovalMessage(null), 3000);
  };

  const handleSaveCorrections = () => {
    if (!document) return;

    const corrections: Array<{
      correctionType: 'classification' | 'field';
      originalValue?: string;
      correctedValue: string;
      fieldName?: string;
      isApproval?: boolean;
    }> = [];

    // Add classification approval
    if (classificationApproved && document.type) {
      corrections.push({
        correctionType: 'classification',
        originalValue: document.type,
        correctedValue: document.type,
        isApproval: true,
      });
    }

    // Add classification correction if type changed
    if (correctedType && correctedType !== document.type) {
      corrections.push({
        correctionType: 'classification',
        originalValue: document.type || undefined,
        correctedValue: correctedType,
        isApproval: false,
      });
    }

    // Add field approvals
    approvedFields.forEach(fieldName => {
      const originalField = document.extraction?.fields?.find((f: Field) => f.name === fieldName);
      if (originalField) {
        corrections.push({
          correctionType: 'field',
          originalValue: String(originalField.value),
          correctedValue: String(originalField.value),
          fieldName,
          isApproval: true,
        });
      }
    });

    // Add field corrections
    Object.entries(correctedFields).forEach(([fieldName, newValue]) => {
      const originalField = document.extraction?.fields?.find((f: Field) => f.name === fieldName);
      if (originalField && originalField.value !== newValue) {
        corrections.push({
          correctionType: 'field',
          originalValue: String(originalField.value),
          correctedValue: String(newValue),
          fieldName,
          isApproval: false,
        });
      }
    });

    if (corrections.length > 0) {
      // Save to localStorage backup
      saveCorrectionBackup({
        docId: Number(id),
        timestamp: new Date().toISOString(),
        corrections,
      });

      // Save to server
      saveCorrectionMutation.mutate(corrections);
    }
  };

  const handleDiscardChanges = () => {
    setCorrectedType(null);
    setCorrectedFields({});
    setApprovedFields(new Set());
    setClassificationApproved(false);
    setHasUnsavedChanges(false);
  };

  // Load from localStorage on mount
  useEffect(() => {
    if (id) {
      const backup = getCorrectionForDoc(Number(id));
      if (backup && backup.corrections.length > 0) {
        const classCorrection = backup.corrections.find(c => c.correctionType === 'classification');
        if (classCorrection) {
          setCorrectedType(classCorrection.correctedValue as DocumentType);
        }

        const fieldCorrections = backup.corrections.filter(c => c.correctionType === 'field');
        const fieldsMap: Record<string, string> = {};
        fieldCorrections.forEach(c => {
          if (c.fieldName) {
            fieldsMap[c.fieldName] = c.correctedValue;
          }
        });
        setCorrectedFields(fieldsMap);

        if (backup.corrections.length > 0) {
          setHasUnsavedChanges(true);
        }
      }
    }
  }, [id]);

  if (isLoading) {
    return (
      <div className="flex justify-center items-center p-16">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600"></div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="p-4 bg-red-50 border border-red-200 rounded-md">
        <p className="text-red-800">Error loading document: {(error as Error).message}</p>
        <button
          onClick={() => navigate('/')}
          className="mt-4 px-4 py-2 bg-red-600 text-white rounded-md hover:bg-red-700"
        >
          Back to Home
        </button>
      </div>
    );
  }

  if (!document) {
    return (
      <div className="text-center p-8">
        <p className="text-gray-500">Document not found</p>
        <button
          onClick={() => navigate('/')}
          className="mt-4 px-4 py-2 bg-blue-600 text-white rounded-md hover:bg-blue-700"
        >
          Back to Home
        </button>
      </div>
    );
  }

  const getStatusColor = (status: string) => {
    switch (status) {
      case 'completed':
        return 'bg-green-100 text-green-800';
      case 'needs_review':
        return 'bg-yellow-100 text-yellow-800';
      case 'error':
        return 'bg-red-100 text-red-800';
      default:
        return 'bg-blue-100 text-blue-800';
    }
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <button
          onClick={() => navigate('/')}
          className="text-blue-600 hover:text-blue-800 flex items-center"
        >
          <svg
            className="w-5 h-5 mr-1"
            fill="none"
            stroke="currentColor"
            viewBox="0 0 24 24"
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth={2}
              d="M15 19l-7-7 7-7"
            />
          </svg>
          Back to Documents
        </button>

        <span
          className={`px-4 py-2 rounded-full text-sm font-medium ${getStatusColor(
            document.processing_status
          )}`}
        >
          {document.processing_status.replace(/_/g, ' ').toUpperCase()}
        </span>
      </div>

      {/* Document Info */}
      <div className="bg-white shadow rounded-lg p-6">
        <h1 className="text-2xl font-bold text-gray-900 mb-4">{document.filename}</h1>

        <div className="grid grid-cols-2 gap-4 text-sm mb-6">
          <div>
            <span className="font-medium text-gray-700">File Size:</span>
            <span className="ml-2 text-gray-600">
              {(document.file_size / 1024).toFixed(0)} KB
            </span>
          </div>
          <div>
            <span className="font-medium text-gray-700">Pages:</span>
            <span className="ml-2 text-gray-600">{document.page_count}</span>
          </div>
          <div>
            <span className="font-medium text-gray-700">Uploaded:</span>
            <span className="ml-2 text-gray-600">
              {new Date(document.upload_timestamp).toLocaleString()}
            </span>
          </div>
          {document.corrected && (
            <div>
              <span className="px-2 py-1 bg-blue-100 text-blue-800 text-xs font-semibold rounded">
                Corrected
              </span>
            </div>
          )}
        </div>

        {/* Document Type Selector */}
        {document.type && (
          <div className="mb-6">
            <DocumentTypeSelector
              currentType={(correctedType || document.type) as DocumentType}
              confidence={document.confidence ?? undefined}
              onTypeChange={handleTypeChange}
              onApprove={handleClassificationApprove}
              isApproved={classificationApproved}
              disabled={document.processing_status !== 'completed' && document.processing_status !== 'needs_review'}
            />
          </div>
        )}

        {/* Confidence Explanation Panel */}
        {document.confidence !== null && document.confidence !== undefined && document.extraction?.overall_confidence !== undefined && (
          <div className="text-xs text-gray-600 bg-blue-50 border border-blue-200 p-3 rounded mb-6">
            <p className="font-semibold text-blue-900 mb-2">📊 Understanding Confidence Scores</p>
            <div className="space-y-1 text-blue-800">
              <div className="flex justify-between">
                <span><strong>Document Type Confidence:</strong> How sure we are this is a {document.type}</span>
                <span className="font-mono font-semibold">{Math.round(document.confidence * 100)}%</span>
              </div>
              <div className="flex justify-between">
                <span><strong>Field Extraction Quality:</strong> How accurate the extracted field values are</span>
                <span className="font-mono font-semibold">{Math.round(document.extraction.overall_confidence * 100)}%</span>
              </div>
            </div>
            <p className="text-xs text-blue-700 mt-2 italic">
              Note: Document type and field extraction are scored independently
            </p>
          </div>
        )}

        {/* Approval feedback message */}
        {approvalMessage && (
          <div className="p-3 bg-green-50 border border-green-200 rounded text-sm text-green-800 flex items-center gap-2 animate-fade-in">
            <svg className="h-5 w-5 text-green-600 flex-shrink-0" viewBox="0 0 20 20" fill="currentColor">
              <path
                fillRule="evenodd"
                d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.707-9.293a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z"
                clipRule="evenodd"
              />
            </svg>
            <span className="font-medium">{approvalMessage}</span>
          </div>
        )}

        {/* Save/Discard Buttons */}
        {hasUnsavedChanges && (
          <div className="flex items-center gap-3 p-4 bg-yellow-50 border border-yellow-200 rounded">
            <div className="flex-1">
              <p className="text-sm font-medium text-yellow-900">You have unsaved corrections</p>
              <p className="text-xs text-yellow-700 mt-1">
                Save your changes to persist corrections and update metrics
              </p>
            </div>
            <div className="flex gap-2">
              <button
                onClick={handleSaveCorrections}
                disabled={saveCorrectionMutation.isPending}
                className="px-4 py-2 bg-green-600 text-white text-sm font-medium rounded hover:bg-green-700 disabled:opacity-50"
              >
                {saveCorrectionMutation.isPending ? 'Saving...' : 'Save Corrections'}
              </button>
              <button
                onClick={handleDiscardChanges}
                disabled={saveCorrectionMutation.isPending}
                className="px-4 py-2 bg-gray-600 text-white text-sm font-medium rounded hover:bg-gray-700 disabled:opacity-50"
              >
                Discard
              </button>
            </div>
          </div>
        )}

        {/* Success message */}
        {saveCorrectionMutation.isSuccess && (
          <div className="p-3 bg-green-50 border border-green-200 rounded text-sm text-green-800">
            Corrections saved successfully! Metrics will be updated shortly.
          </div>
        )}

        {/* Error message */}
        {saveCorrectionMutation.isError && (
          <div className="p-3 bg-red-50 border border-red-200 rounded text-sm text-red-800">
            Failed to save corrections. Please try again.
          </div>
        )}
      </div>

      {/* Processing Status */}
      {['pending', 'ocr_in_progress', 'classification_in_progress'].includes(
        document.processing_status
      ) && (
        <div className="bg-blue-50 border border-blue-200 rounded-lg p-6">
          <div className="flex items-center space-x-3">
            <div className="animate-spin rounded-full h-6 w-6 border-b-2 border-blue-600"></div>
            <div>
              <h3 className="font-medium text-blue-900">Processing Document...</h3>
              <p className="text-sm text-blue-700 mt-1">
                Current stage: {document.processing_status.replace(/_/g, ' ')}
              </p>
            </div>
          </div>
        </div>
      )}

      {/* PDF Review Section for Low Confidence */}
      {document.ocr_json && (
        // Show if extraction confidence is low OR if classification confidence is low (even without extraction)
        (document.extraction &&
          ((document.extraction.overall_confidence !== undefined && document.extraction.overall_confidence < 0.7) ||
           (document.extraction.reasons && document.extraction.reasons.length > 0))) ||
        (!document.extraction && document.confidence !== null && document.confidence !== undefined && document.confidence < 0.7)
      ) && (
        <div className="bg-white shadow rounded-lg p-6">
          <h2 className="text-xl font-bold text-gray-900 mb-4">Document Review Required</h2>
          <div className="bg-amber-50 border border-amber-200 rounded-lg p-4 mb-4">
            <p className="text-sm text-amber-800 mb-3">
              This document has low confidence and requires manual review. Instead of viewing the OCR text,
              please review the original PDF to ensure accuracy.
            </p>

            {/* Show extraction reasons if available */}
            {document.extraction?.reasons && document.extraction.reasons.length > 0 && (
              <div className="mb-3">
                <p className="text-sm font-semibold text-amber-900 mb-2">Why confidence is low:</p>
                <ul className="text-sm text-amber-800 list-disc list-inside space-y-1">
                  {document.extraction.reasons.map((reason: string, idx: number) => (
                    <li key={idx}>{reason}</li>
                  ))}
                </ul>
              </div>
            )}

            {/* Show classification confidence info if no extraction yet */}
            {!document.extraction && document.confidence !== null && document.confidence !== undefined && document.confidence < 0.7 && (
              <div className="mb-3">
                <p className="text-sm font-semibold text-amber-900 mb-2">
                  Classification confidence is low: {Math.round(document.confidence * 100)}%
                </p>
                <p className="text-sm text-amber-800">
                  Document is being processed for field extraction to provide detailed confidence analysis.
                </p>
              </div>
            )}

            <button
              onClick={() => {
                setCurrentPage(1);
                setShowPdfModal(true);
              }}
              className="px-4 py-2 bg-blue-600 text-white font-medium rounded hover:bg-blue-700 transition-colors flex items-center gap-2"
            >
              <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
              </svg>
              Review File
            </button>
          </div>
        </div>
      )}

      {/* OCR Text Preview - Only show if confidence is NOT low */}
      {document.ocr_json &&
        // Don't show if classification confidence is low (without extraction)
        !((!document.extraction && document.confidence !== null && document.confidence !== undefined && document.confidence < 0.7)) &&
        // Don't show if extraction exists and has low confidence
        (!document.extraction || ((document.extraction.overall_confidence === undefined || document.extraction.overall_confidence >= 0.7) && (!document.extraction.reasons || document.extraction.reasons.length === 0))) && (
        <div className="bg-white shadow rounded-lg p-6">
          <h2 className="text-xl font-bold text-gray-900 mb-4">OCR Text</h2>
          <div className="bg-gray-50 p-4 rounded border border-gray-200 max-h-96 overflow-y-auto">
            <pre className="text-sm text-gray-800 whitespace-pre-wrap">
              {document.ocr_json.map((page: OcrPage) => page.text).join('\n\n---\n\n')}
            </pre>
          </div>
        </div>
      )}

      {/* Extraction Results */}
      {document.extraction && document.extraction.fields && (
        <div className="bg-white shadow rounded-lg p-6 space-y-6">
          <div className="flex items-center justify-between">
            <h2 className="text-xl font-bold text-gray-900">Extracted Fields</h2>
            {document.extraction.overall_confidence !== undefined && (
              <div className="w-64">
                <ConfidenceIndicator
                  confidence={document.extraction.overall_confidence}
                  label="Field Extraction Quality"
                  reasons={document.extraction.reasons}
                />
              </div>
            )}
          </div>

          <FieldTable
            fields={document.extraction.fields}
            editable={document.processing_status === 'completed' || document.processing_status === 'needs_review'}
            onFieldChange={handleFieldChange}
            onFieldApprove={handleFieldApprove}
            approvedFieldsInSession={approvedFields}
          />

          {/* Extraction Metadata */}
          <div className="text-sm text-gray-600 pt-4 border-t border-gray-200">
            <div className="flex justify-between">
              <span>Schema Type:</span>
              <span className="font-medium">{document.extraction.schema_type}</span>
            </div>
            {document.extraction.extraction_timestamp && (
              <div className="flex justify-between mt-1">
                <span>Extracted At:</span>
                <span className="font-medium">
                  {new Date(document.extraction.extraction_timestamp).toLocaleString()}
                </span>
              </div>
            )}
          </div>
        </div>
      )}

      {/* Show extraction in progress */}
      {document.processing_status === 'extraction_in_progress' && (
        <div className="bg-blue-50 border border-blue-200 rounded-lg p-6">
          <div className="flex items-center space-x-3">
            <div className="animate-spin rounded-full h-6 w-6 border-b-2 border-blue-600"></div>
            <div>
              <h3 className="font-medium text-blue-900">Extracting Fields...</h3>
              <p className="text-sm text-blue-700 mt-1">
                Processing document fields with confidence scoring
              </p>
            </div>
          </div>
        </div>
      )}

      {/* PDF Viewer Modal */}
      {showPdfModal && (
        <div className="fixed inset-0 bg-black bg-opacity-50 z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-lg shadow-xl max-w-6xl w-full h-[90vh] flex flex-col">
            {/* Modal Header */}
            <div className="flex items-center justify-between px-6 py-4 border-b">
              <h2 className="text-xl font-bold text-gray-900">Review Document: {document.filename}</h2>
              <button
                onClick={() => setShowPdfModal(false)}
                className="text-gray-500 hover:text-gray-700 text-2xl font-bold"
              >
                ×
              </button>
            </div>

            {/* PDF Viewer */}
            <div className="flex-1 overflow-hidden flex flex-col">
              <div className="flex-1 overflow-auto">
                <PdfViewer
                  fileUrl={`${import.meta.env.VITE_API_URL || 'http://localhost:3000/api'}/docs/${id}/pdf`}
                  currentPage={currentPage}
                  onLoadSuccess={(numPages) => setTotalPages(numPages)}
                />
              </div>

              {/* Page Navigation */}
              {totalPages > 1 && (
                <PageNavigator
                  currentPage={currentPage}
                  totalPages={totalPages}
                  onPageChange={setCurrentPage}
                />
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
