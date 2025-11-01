import React, { useState, useRef } from 'react';
import { uploadDocument } from '../../services/api';

interface UploadPanelProps {
  onUploadSuccess?: (documentId: number) => void;
  onUploadError?: (error: string) => void;
}

export function UploadPanel({ onUploadSuccess, onUploadError }: UploadPanelProps) {
  const [uploading, setUploading] = useState(false);
  const [dragOver, setDragOver] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const handleFileSelect = async (file: File) => {
    if (!file.name.toLowerCase().endsWith('.pdf')) {
      onUploadError?.('Only PDF files are allowed');
      return;
    }

    if (file.size > 50 * 1024 * 1024) {
      onUploadError?.('File size exceeds 50MB limit');
      return;
    }

    setUploading(true);

    try {
      const result = await uploadDocument(file);
      onUploadSuccess?.(result.id);
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Upload failed';
      onUploadError?.(message);
    } finally {
      setUploading(false);
    }
  };

  const handleFileInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      handleFileSelect(file);
    }
  };

  const handleDrop = (e: React.DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    setDragOver(false);

    const file = e.dataTransfer.files[0];
    if (file) {
      handleFileSelect(file);
    }
  };

  const handleDragOver = (e: React.DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    setDragOver(true);
  };

  const handleDragLeave = () => {
    setDragOver(false);
  };

  const handleClick = () => {
    fileInputRef.current?.click();
  };

  return (
    <div className="w-full">
      <div
        className={`
          border-2 border-dashed rounded-lg p-8 text-center cursor-pointer
          transition-colors duration-200
          ${dragOver ? 'border-blue-500 bg-blue-50' : 'border-gray-300 hover:border-gray-400'}
          ${uploading ? 'opacity-50 pointer-events-none' : ''}
        `}
        onDrop={handleDrop}
        onDragOver={handleDragOver}
        onDragLeave={handleDragLeave}
        onClick={handleClick}
      >
        <input
          ref={fileInputRef}
          type="file"
          accept=".pdf"
          className="hidden"
          onChange={handleFileInputChange}
          disabled={uploading}
        />

        <div className="flex flex-col items-center space-y-4">
          <svg
            className="w-16 h-16 text-gray-400"
            fill="none"
            stroke="currentColor"
            viewBox="0 0 24 24"
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth={2}
              d="M7 16a4 4 0 01-.88-7.903A5 5 0 1115.9 6L16 6a5 5 0 011 9.9M15 13l-3-3m0 0l-3 3m3-3v12"
            />
          </svg>

          {uploading ? (
            <div className="flex flex-col items-center space-y-2">
              <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600"></div>
              <p className="text-sm text-gray-600">Uploading and processing...</p>
            </div>
          ) : (
            <>
              <div className="text-gray-700">
                <p className="text-lg font-medium">Drop PDF here or click to upload</p>
                <p className="text-sm text-gray-500 mt-1">
                  Maximum file size: 50MB | Maximum pages: 100
                </p>
              </div>
              <button
                type="button"
                className="px-4 py-2 bg-blue-600 text-white rounded-md hover:bg-blue-700 transition-colors"
                onClick={(e) => {
                  e.stopPropagation();
                  handleClick();
                }}
              >
                Select File
              </button>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
