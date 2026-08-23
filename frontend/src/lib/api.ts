import type { ApiErrorBody } from "./types";

// Falls back to the page's own hostname (not a hardcoded "localhost") so the
// same build works when opened from another device on the LAN — the backend
// binds 0.0.0.0:4000, so "whatever host you reached this page on" is always
// the right place to find it too. VITE_API_URL still wins when set.
export const API_BASE = (import.meta.env.VITE_API_URL as string) || `http://${window.location.hostname}:4000`;
export const WS_BASE = API_BASE.replace(/^http/, "ws");

export class ApiError extends Error {
  status: number;
  code: string;
  details?: unknown;
  constructor(status: number, code: string, message: string, details?: unknown) {
    super(message);
    this.status = status;
    this.code = code;
    this.details = details;
  }
}

let accessToken: string | null = null;
let unauthorizedHandler: (() => void) | null = null;
let refreshInFlight: Promise<string | null> | null = null;

export function setAccessToken(token: string | null) {
  accessToken = token;
}

export function getAccessToken() {
  return accessToken;
}

export function setUnauthorizedHandler(fn: (() => void) | null) {
  unauthorizedHandler = fn;
}

async function refreshAccessToken(): Promise<string | null> {
  if (!refreshInFlight) {
    refreshInFlight = fetch(`${API_BASE}/api/auth/refresh`, {
      method: "POST",
      credentials: "include",
    })
      .then(async (res) => {
        if (!res.ok) return null;
        const data = await res.json();
        accessToken = data.accessToken as string;
        return accessToken;
      })
      .catch(() => null)
      .finally(() => {
        refreshInFlight = null;
      });
  }
  return refreshInFlight;
}

interface ApiOptions extends Omit<RequestInit, "body"> {
  body?: unknown;
  skipAuthRetry?: boolean;
}

export async function api<T = unknown>(path: string, opts: ApiOptions = {}): Promise<T> {
  return request<T>(path, opts, true);
}

async function request<T>(path: string, opts: ApiOptions, allowRetry: boolean): Promise<T> {
  const headers: Record<string, string> = { Accept: "application/json", ...(opts.headers as any) };
  let body: BodyInit | undefined;
  if (opts.body !== undefined) {
    headers["Content-Type"] = "application/json";
    body = JSON.stringify(opts.body);
  }
  if (accessToken) headers["Authorization"] = `Bearer ${accessToken}`;

  let res: Response;
  try {
    res = await fetch(`${API_BASE}${path}`, {
      ...opts,
      headers,
      body,
      credentials: "include",
    });
  } catch {
    throw new ApiError(0, "NETWORK_ERROR", "Нет соединения с сервером Velora");
  }

  if (res.status === 401 && allowRetry && !opts.skipAuthRetry && !path.startsWith("/api/auth/login") && !path.startsWith("/api/auth/register")) {
    const newToken = await refreshAccessToken();
    if (newToken) return request<T>(path, opts, false);
    unauthorizedHandler?.();
  }

  if (res.status === 204) return undefined as T;

  let json: any = null;
  const text = await res.text();
  if (text) {
    try {
      json = JSON.parse(text);
    } catch {
      json = null;
    }
  }

  if (!res.ok) {
    const err = (json as ApiErrorBody) ?? { error: "ERROR", message: res.statusText };
    if (res.status === 401 && !allowRetry) unauthorizedHandler?.();
    throw new ApiError(res.status, err.error ?? "ERROR", err.message ?? res.statusText, err.details);
  }

  return json as T;
}

export const apiGet = <T>(path: string) => api<T>(path, { method: "GET" });
export const apiPost = <T>(path: string, body?: unknown) => api<T>(path, { method: "POST", body });
export const apiPatch = <T>(path: string, body?: unknown) => api<T>(path, { method: "PATCH", body });
export const apiDelete = <T>(path: string) => api<T>(path, { method: "DELETE" });

export { refreshAccessToken };
