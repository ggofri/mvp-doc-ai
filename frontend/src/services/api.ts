import type {
  Document,
  Correction,
  MetricSnapshot,
  DocumentStatus,
  DocumentType,
} from '../types';

const DEFAULT_API_URL = 'http://localhost:3000/api';
const CONTENT_TYPE_JSON = 'application/json';
const FORM_DATA_FIELD_NAME = 'file';

const API_BASE_URL = import.meta.env.VITE_API_URL || DEFAULT_API_URL;

function buildErrorResponse(statusText: string): { error: string; message: string } {
  return {
    error: 'Unknown error',
    message: statusText,
  };
}

function buildUploadErrorResponse(): { error: string } {
  return {
    error: 'Upload failed',
  };
}

async function apiFetch<T>(
  endpoint: string,
  options: RequestInit = {}
): Promise<T> {
  const url = `${API_BASE_URL}${endpoint}`;

  const response = await fetch(url, {
    ...options,
    headers: {
      'Content-Type': CONTENT_TYPE_JSON,
      ...options.headers,
    },
  });

  if (!response.ok) {
    const error = await response.json().catch(() => buildErrorResponse(response.statusText));
    throw new Error(error.message || error.error || 'API request failed');
  }

  return response.json();
}

export async function uploadDocument(file: File): Promise<Document> {
  const formData = new FormData();
  formData.append(FORM_DATA_FIELD_NAME, file);

  const response = await fetch(`${API_BASE_URL}/upload`, {
    method: 'POST',
    body: formData,
  });

  if (!response.ok) {
    const error = await response.json().catch(() => buildUploadErrorResponse());
    throw new Error(error.message || error.error || 'Upload failed');
  }

  return response.json();
}

export async function getDocuments(filters?: {
  status?: DocumentStatus;
  type?: DocumentType;
  corrected?: boolean;
}): Promise<Document[]> {
  const params = new URLSearchParams();
  if (filters?.status) params.append('status', filters.status);
  if (filters?.type) params.append('type', filters.type);
  if (filters?.corrected !== undefined)
    params.append('corrected', String(filters.corrected));

  const query = params.toString() ? `?${params.toString()}` : '';
  return apiFetch<Document[]>(`/docs${query}`);
}

export async function getDocument(id: number): Promise<Document> {
  return apiFetch<Document>(`/docs/${id}`);
}

export async function applyCorrection(
  docId: number,
  correction: {
    type: 'classification' | 'field';
    originalValue?: string;
    correctedValue: string;
    fieldName?: string;
  }
): Promise<Correction> {
  return apiFetch<Correction>(`/docs/${docId}/correct`, {
    method: 'POST',
    body: JSON.stringify(correction),
  });
}

export async function getMetrics(): Promise<MetricSnapshot> {
  return apiFetch<MetricSnapshot>('/metrics');
}

export async function getSettings(): Promise<{
  thresholds: Record<string, number>;
}> {
  return apiFetch('/settings');
}

export async function updateSettings(settings: {
  thresholds: Record<string, number>;
}): Promise<void> {
  return apiFetch('/settings', {
    method: 'PUT',
    body: JSON.stringify(settings),
  });
}

export async function healthCheck(): Promise<{ status: string; timestamp: string }> {
  return apiFetch('/health');
}
