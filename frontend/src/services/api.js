// Backend API client. VITE_API_BASE_URL is empty by default so requests go to the
// same origin (Vite dev proxy locally, nginx proxy in Docker).
const API_BASE = (import.meta.env.VITE_API_BASE_URL || '').replace(/\/$/, '');
const DEFAULT_TIMEOUT_MS = 60_000;

export class ApiError extends Error {
  constructor(message, status) {
    super(message);
    this.name = 'ApiError';
    this.status = status;
  }
}

function describeDetail(detail) {
  if (!detail) return null;
  if (typeof detail === 'string') return detail;
  if (Array.isArray(detail)) {
    return detail.map((d) => `${(d.loc || []).slice(1).join('.') || 'request'}: ${d.msg}`).join('; ');
  }
  return JSON.stringify(detail);
}

async function request(path, { method = 'GET', params, timeoutMs = DEFAULT_TIMEOUT_MS } = {}) {
  const query = params
    ? '?' +
      new URLSearchParams(
        Object.entries(params).filter(([, v]) => v !== undefined && v !== null && v !== ''),
      ).toString()
    : '';
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  let response;
  try {
    response = await fetch(`${API_BASE}${path}${query}`, {
      method,
      headers: { Accept: 'application/json' },
      signal: controller.signal,
    });
  } catch (err) {
    if (err.name === 'AbortError') throw new ApiError('The request timed out. Please try again.', 0);
    throw new ApiError('Cannot reach the Wind Intelligence API. Is the backend running?', 0);
  } finally {
    clearTimeout(timer);
  }

  let body = null;
  try {
    body = await response.json();
  } catch {
    body = null;
  }
  if (!response.ok) {
    const message = describeDetail(body?.detail) || `Request failed with status ${response.status}`;
    throw new ApiError(message, response.status);
  }
  return body;
}

export function analysisParams(filters) {
  return {
    start_date: filters.startDate,
    end_date: filters.endDate,
    cutoff_mode: filters.cutoffMode,
    cutoff_time: filters.cutoffMode === 'day_ahead' ? filters.cutoffTime : undefined,
    horizon_hours: filters.cutoffMode === 'horizon' ? filters.horizonHours : undefined,
  };
}

export const api = {
  health: () => request('/api/health'),
  meta: () => request('/api/meta'),
  analysis: (filters) => request('/api/analysis', { params: analysisParams(filters) }),
  accuracy: (filters) => request('/api/accuracy', { params: analysisParams(filters) }),
  refresh: () => request('/api/refresh', { method: 'POST', timeoutMs: 180_000 }),
};
