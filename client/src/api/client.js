/**
 * api/client.js — the one fetch wrapper.
 *
 * Phase 7 · SRS FR-24
 *
 * Attaches the bearer token, normalises errors into a thrown ApiError carrying
 * the server's own message and code, and returns the response body UNCHANGED —
 * including its `trace`. The trace is passed through untouched because the
 * QueryTrace panel has to show the SQL the server actually ran, not a
 * reconstruction of it.
 */

const BASE = import.meta.env.VITE_API_BASE_URL ?? '';
const TOKEN_KEY = 'voyagex.token';

export class ApiError extends Error {
  constructor(message, { status, code, detail, issues } = {}) {
    super(message);
    this.name = 'ApiError';
    this.status = status;
    this.code = code;
    this.detail = detail;
    this.issues = issues;
  }
}

export function getToken() {
  try { return localStorage.getItem(TOKEN_KEY); } catch { return null; }
}
export function setToken(token) {
  try { token ? localStorage.setItem(TOKEN_KEY, token) : localStorage.removeItem(TOKEN_KEY); } catch { /* private mode */ }
}

async function request(path, { method = 'GET', body, auth = true } = {}) {
  const headers = { Accept: 'application/json' };
  if (body !== undefined) headers['Content-Type'] = 'application/json';
  const token = auth ? getToken() : null;
  if (token) headers.Authorization = `Bearer ${token}`;

  let res;
  try {
    res = await fetch(`${BASE}/api${path}`, {
      method, headers, body: body === undefined ? undefined : JSON.stringify(body),
    });
  } catch {
    throw new ApiError('Could not reach the API. Is the server running on port 4000?', { status: 0 });
  }

  const text = await res.text();
  let data = {};
  if (text) { try { data = JSON.parse(text); } catch { data = { error: text.slice(0, 200) }; } }

  if (!res.ok) {
    throw new ApiError(data.error ?? `Request failed (${res.status})`, {
      status: res.status, code: data.code, detail: data.detail, issues: data.issues,
    });
  }
  return data;
}

export const api = {
  get:   (p, o)    => request(p, { ...o, method: 'GET' }),
  post:  (p, b, o) => request(p, { ...o, method: 'POST',  body: b }),
  put:   (p, b, o) => request(p, { ...o, method: 'PUT',   body: b }),
  patch: (p, b, o) => request(p, { ...o, method: 'PATCH', body: b }),
  del:   (p, o)    => request(p, { ...o, method: 'DELETE' }),
};

/** Build a query string from defined, non-empty values only. */
export function qs(params) {
  const usp = new URLSearchParams();
  for (const [k, v] of Object.entries(params)) {
    if (v !== undefined && v !== null && v !== '') usp.set(k, String(v));
  }
  const s = usp.toString();
  return s ? `?${s}` : '';
}

export const inr = (n) =>
  n == null ? '—' : `₹${Number(n).toLocaleString('en-IN', { maximumFractionDigits: 0 })}`;

export const shortDate = (d) =>
  !d ? '—' : new Date(d).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' });
