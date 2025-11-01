import React from 'react';
import { BrowserRouter, Routes, Route, Link, useLocation } from 'react-router-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { Home } from './pages/Home';
import { DocumentDetail } from './pages/DocumentDetail';
import { Dashboard } from './pages/Dashboard';
import { Settings } from './pages/Settings';

const QUERY_STALE_TIME_MS = 1000 * 10;

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: QUERY_STALE_TIME_MS,
      refetchOnWindowFocus: false,
    },
  },
});

function NavBar() {
  const location = useLocation();

  const isActive = (path: string) => {
    return location.pathname === path
      ? 'bg-blue-600 text-white'
      : 'text-gray-700 hover:bg-gray-100';
  };

  return (
    <header className="bg-white shadow">
      <div className="max-w-7xl mx-auto px-4 py-4">
        <div className="flex items-center justify-between">
          <Link to="/" className="hover:text-blue-600 transition-colors">
            <h1 className="text-2xl font-bold text-gray-900">
              Document Extraction MVP
            </h1>
          </Link>
          <nav className="flex space-x-2">
            <Link
              to="/"
              className={`px-4 py-2 rounded-md text-sm font-medium transition-colors ${isActive(
                '/'
              )}`}
            >
              Upload
            </Link>
            <Link
              to="/dashboard"
              className={`px-4 py-2 rounded-md text-sm font-medium transition-colors ${isActive(
                '/dashboard'
              )}`}
            >
              Dashboard
            </Link>
            <Link
              to="/settings"
              className={`px-4 py-2 rounded-md text-sm font-medium transition-colors ${isActive(
                '/settings'
              )}`}
            >
              Settings
            </Link>
          </nav>
        </div>
      </div>
    </header>
  );
}

function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <BrowserRouter>
        <div className="min-h-screen bg-gray-50">
          <NavBar />

          <main>
            <Routes>
              <Route path="/" element={<Home />} />
              <Route path="/document/:id" element={<DocumentDetail />} />
              <Route path="/dashboard" element={<Dashboard />} />
              <Route path="/settings" element={<Settings />} />
            </Routes>
          </main>
        </div>
      </BrowserRouter>
    </QueryClientProvider>
  );
}

export default App;
