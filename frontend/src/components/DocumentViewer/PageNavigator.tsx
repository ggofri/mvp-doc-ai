import React from 'react';

const FIRST_PAGE_NUMBER = 1;
const DECIMAL_RADIX = 10;
const ENTER_KEY = 'Enter';

interface PageNavigatorProps {
  currentPage: number;
  totalPages: number;
  onPageChange: (page: number) => void;
}

function isValidPageNumber(page: number, minPage: number, maxPage: number): boolean {
  return page >= minPage && page <= maxPage;
}

export const PageNavigator: React.FC<PageNavigatorProps> = ({
  currentPage,
  totalPages,
  onPageChange,
}) => {
  const handlePrevious = () => {
    if (currentPage > FIRST_PAGE_NUMBER) {
      onPageChange(currentPage - 1);
    }
  };

  const handleNext = () => {
    if (currentPage < totalPages) {
      onPageChange(currentPage + 1);
    }
  };

  const handleFirst = () => {
    onPageChange(FIRST_PAGE_NUMBER);
  };

  const handleLast = () => {
    onPageChange(totalPages);
  };

  const handlePageInput = (e: React.ChangeEvent<HTMLInputElement>) => {
    const page = parseInt(e.target.value, DECIMAL_RADIX);
    if (isValidPageNumber(page, FIRST_PAGE_NUMBER, totalPages)) {
      onPageChange(page);
    }
  };

  const handleKeyPress = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === ENTER_KEY) {
      const page = parseInt(e.currentTarget.value, DECIMAL_RADIX);
      if (isValidPageNumber(page, FIRST_PAGE_NUMBER, totalPages)) {
        onPageChange(page);
      } else {
        e.currentTarget.value = currentPage.toString();
      }
    }
  };

  return (
    <div className="page-navigator flex items-center justify-center gap-3 p-3 bg-white border-t">
      <button
        onClick={handleFirst}
        disabled={currentPage === FIRST_PAGE_NUMBER}
        className="px-3 py-1.5 text-sm font-medium text-gray-700 bg-white border border-gray-300 rounded hover:bg-gray-50 disabled:opacity-50 disabled:cursor-not-allowed"
        title="First Page"
      >
        <svg
          className="w-4 h-4"
          fill="none"
          stroke="currentColor"
          viewBox="0 0 24 24"
        >
          <path
            strokeLinecap="round"
            strokeLinejoin="round"
            strokeWidth={2}
            d="M11 19l-7-7 7-7m8 14l-7-7 7-7"
          />
        </svg>
      </button>

      <button
        onClick={handlePrevious}
        disabled={currentPage === FIRST_PAGE_NUMBER}
        className="px-3 py-1.5 text-sm font-medium text-gray-700 bg-white border border-gray-300 rounded hover:bg-gray-50 disabled:opacity-50 disabled:cursor-not-allowed"
        title="Previous Page"
      >
        <svg
          className="w-4 h-4"
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
      </button>

      <div className="flex items-center gap-2">
        <span className="text-sm text-gray-600">Page</span>
        <input
          type="number"
          min={FIRST_PAGE_NUMBER}
          max={totalPages}
          value={currentPage}
          onChange={handlePageInput}
          onKeyPress={handleKeyPress}
          className="w-16 px-2 py-1 text-sm text-center border border-gray-300 rounded focus:outline-none focus:ring-2 focus:ring-blue-500"
        />
        <span className="text-sm text-gray-600">of {totalPages}</span>
      </div>

      <button
        onClick={handleNext}
        disabled={currentPage === totalPages}
        className="px-3 py-1.5 text-sm font-medium text-gray-700 bg-white border border-gray-300 rounded hover:bg-gray-50 disabled:opacity-50 disabled:cursor-not-allowed"
        title="Next Page"
      >
        <svg
          className="w-4 h-4"
          fill="none"
          stroke="currentColor"
          viewBox="0 0 24 24"
        >
          <path
            strokeLinecap="round"
            strokeLinejoin="round"
            strokeWidth={2}
            d="M9 5l7 7-7 7"
          />
        </svg>
      </button>

      <button
        onClick={handleLast}
        disabled={currentPage === totalPages}
        className="px-3 py-1.5 text-sm font-medium text-gray-700 bg-white border border-gray-300 rounded hover:bg-gray-50 disabled:opacity-50 disabled:cursor-not-allowed"
        title="Last Page"
      >
        <svg
          className="w-4 h-4"
          fill="none"
          stroke="currentColor"
          viewBox="0 0 24 24"
        >
          <path
            strokeLinecap="round"
            strokeLinejoin="round"
            strokeWidth={2}
            d="M13 5l7 7-7 7M5 5l7 7-7 7"
          />
        </svg>
      </button>
    </div>
  );
};
