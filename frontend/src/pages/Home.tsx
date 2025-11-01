import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { UploadPanel } from '../components/Upload/UploadPanel';
import { FileList } from '../components/Upload/FileList';

export function Home() {
  const navigate = useNavigate();
  const [uploadMessage, setUploadMessage] = useState<{
    type: 'success' | 'error';
    message: string;
  } | null>(null);

  const handleUploadSuccess = (documentId: number) => {
    setUploadMessage({
      type: 'success',
      message: `Document uploaded successfully! Processing started.`,
    });

    // Navigate to document detail after a short delay
    setTimeout(() => {
      navigate(`/document/${documentId}`);
    }, 1500);
  };

  const handleUploadError = (error: string) => {
    setUploadMessage({
      type: 'error',
      message: `Upload failed: ${error}`,
    });

    // Clear error message after 5 seconds
    setTimeout(() => {
      setUploadMessage(null);
    }, 5000);
  };

  const handleDocumentClick = (documentId: number) => {
    navigate(`/document/${documentId}`);
  };

  return (
    <div className="space-y-8">
      {/* Upload Section */}
      <section>
        <h2 className="text-2xl font-bold text-gray-900 mb-4">Upload Document</h2>
        <UploadPanel
          onUploadSuccess={handleUploadSuccess}
          onUploadError={handleUploadError}
        />

        {/* Upload Message */}
        {uploadMessage && (
          <div
            className={`mt-4 p-4 rounded-md ${
              uploadMessage.type === 'success'
                ? 'bg-green-50 border border-green-200'
                : 'bg-red-50 border border-red-200'
            }`}
          >
            <p
              className={
                uploadMessage.type === 'success' ? 'text-green-800' : 'text-red-800'
              }
            >
              {uploadMessage.message}
            </p>
          </div>
        )}
      </section>

      {/* Recent Documents Section */}
      <section>
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-2xl font-bold text-gray-900">Recent Documents</h2>
          <div className="flex space-x-2">
            <button
              className="px-3 py-1 text-sm border border-gray-300 rounded-md hover:bg-gray-50"
              onClick={() => {
                /* Add filter logic */
              }}
            >
              All
            </button>
            <button
              className="px-3 py-1 text-sm border border-gray-300 rounded-md hover:bg-gray-50"
              onClick={() => {
                /* Add filter logic */
              }}
            >
              Needs Review
            </button>
            <button
              className="px-3 py-1 text-sm border border-gray-300 rounded-md hover:bg-gray-50"
              onClick={() => {
                /* Add filter logic */
              }}
            >
              Completed
            </button>
          </div>
        </div>

        <FileList onDocumentClick={handleDocumentClick} />
      </section>
    </div>
  );
}
