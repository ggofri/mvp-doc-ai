import React, { useState } from 'react';
import { Document, Page, pdfjs } from 'react-pdf';

const PDF_WORKER_PATH = 'pdfjs-dist/build/pdf.worker.min.mjs';
const DEFAULT_SCALE = 1.0;
const ZOOM_INCREMENT = 0.2;
const MAX_ZOOM = 3.0;
const MIN_ZOOM = 0.5;
const CONFIDENCE_HIGH_THRESHOLD = 0.7;
const CONFIDENCE_MEDIUM_THRESHOLD = 0.5;
const PERCENTAGE_MULTIPLIER = 100;
const DECIMAL_PLACES = 1;

pdfjs.GlobalWorkerOptions.workerSrc = new URL(
  PDF_WORKER_PATH,
  import.meta.url,
).toString();

interface PdfViewerProps {
  fileUrl: string;
  currentPage: number;
  onLoadSuccess?: (numPages: number) => void;
  highlightedFields?: Array<{
    page: number;
    bbox: [number, number, number, number];
    fieldName: string;
    confidence: number;
  }>;
}

export const PdfViewer: React.FC<PdfViewerProps> = ({
  fileUrl,
  currentPage,
  onLoadSuccess,
  highlightedFields = [],
}) => {
  const [numPages, setNumPages] = useState<number>(0);
  const [error, setError] = useState<string | null>(null);
  const [scale, setScale] = useState(DEFAULT_SCALE);

  const handleDocumentLoadSuccess = ({ numPages: loadedNumPages }: { numPages: number }) => {
    setNumPages(loadedNumPages);
    if (onLoadSuccess) {
      onLoadSuccess(loadedNumPages);
    }
  };

  const handleDocumentLoadError = (err: Error) => {
    console.error('Error loading PDF:', err);
    setError('Failed to load PDF document');
  };

  const handleZoomIn = () => {
    setScale((prev) => Math.min(prev + ZOOM_INCREMENT, MAX_ZOOM));
  };

  const handleZoomOut = () => {
    setScale((prev) => Math.max(prev - ZOOM_INCREMENT, MIN_ZOOM));
  };

  const handleResetZoom = () => {
    setScale(DEFAULT_SCALE);
  };

  const currentPageHighlights = highlightedFields.filter((field) => field.page === currentPage);

  return (
    <div className="pdf-viewer-container flex flex-col h-full">
      <div className="pdf-controls flex items-center justify-between p-3 bg-gray-100 border-b">
        <div className="flex items-center gap-2">
          <button
            onClick={handleZoomOut}
            className="px-3 py-1 text-sm bg-white border border-gray-300 rounded hover:bg-gray-50"
            disabled={scale <= MIN_ZOOM}
          >
            -
          </button>
          <span className="text-sm font-medium min-w-[60px] text-center">
            {Math.round(scale * PERCENTAGE_MULTIPLIER)}%
          </span>
          <button
            onClick={handleZoomIn}
            className="px-3 py-1 text-sm bg-white border border-gray-300 rounded hover:bg-gray-50"
            disabled={scale >= MAX_ZOOM}
          >
            +
          </button>
          <button
            onClick={handleResetZoom}
            className="px-3 py-1 text-sm bg-white border border-gray-300 rounded hover:bg-gray-50 ml-2"
          >
            Reset
          </button>
        </div>

        <div className="text-sm text-gray-600">
          Page {currentPage} of {numPages}
        </div>
      </div>

      <div className="pdf-content flex-1 overflow-auto bg-gray-200 p-4">
        {error ? (
          <div className="flex items-center justify-center h-full">
            <div className="text-red-600">{error}</div>
          </div>
        ) : (
          <div className="pdf-page-wrapper relative inline-block bg-white shadow-lg">
            <Document
              file={fileUrl}
              onLoadSuccess={handleDocumentLoadSuccess}
              onLoadError={handleDocumentLoadError}
              loading={
                <div className="flex items-center justify-center p-8">
                  <div className="text-gray-600">Loading PDF...</div>
                </div>
              }
            >
              <Page
                pageNumber={currentPage}
                scale={scale}
                renderTextLayer={true}
                renderAnnotationLayer={true}
                loading={<div className="p-4">Loading page...</div>}
              />
            </Document>

            {currentPageHighlights.length > 0 && (
              <div className="highlights-overlay absolute inset-0 pointer-events-none">
                {currentPageHighlights.map((field, idx) => {
                  const [x, y, width, height] = field.bbox;
                  const confidenceColor =
                    field.confidence >= CONFIDENCE_HIGH_THRESHOLD
                      ? 'border-green-500 bg-green-100'
                      : field.confidence >= CONFIDENCE_MEDIUM_THRESHOLD
                      ? 'border-yellow-500 bg-yellow-100'
                      : 'border-red-500 bg-red-100';

                  return (
                    <div
                      key={`${field.fieldName}-${idx}`}
                      className={`absolute border-2 ${confidenceColor} bg-opacity-20`}
                      style={{
                        left: `${x * scale}px`,
                        top: `${y * scale}px`,
                        width: `${width * scale}px`,
                        height: `${height * scale}px`,
                      }}
                      title={`${field.fieldName}: ${(field.confidence * PERCENTAGE_MULTIPLIER).toFixed(DECIMAL_PLACES)}%`}
                    />
                  );
                })}
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
};
