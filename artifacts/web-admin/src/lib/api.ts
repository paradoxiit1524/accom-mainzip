export const API_BASE = (import.meta.env.VITE_API_URL as string | undefined)?.replace(/\/$/, "") || "/api";

const TOKEN_KEY = "campusops_token";

// iOS Safari in private mode throws QuotaExceededError on localStorage writes.
// Fall back to sessionStorage, then in-memory as a last resort.
let _memToken: string | null = null;

function storageGet(key: string): string | null {
  try { return localStorage.getItem(key); } catch { /* blocked */ }
  try { return sessionStorage.getItem(key); } catch { /* blocked */ }
  return _memToken;
}

function storageSet(key: string, value: string) {
  try { localStorage.setItem(key, value); return; } catch { /* blocked */ }
  try { sessionStorage.setItem(key, value); return; } catch { /* blocked */ }
  _memToken = value;
}

function storageRemove(key: string) {
  try { localStorage.removeItem(key); } catch { /* blocked */ }
  try { sessionStorage.removeItem(key); } catch { /* blocked */ }
  _memToken = null;
}

export function getToken(): string | null {
  return storageGet(TOKEN_KEY);
}

export function setToken(token: string) {
  storageSet(TOKEN_KEY, token);
}

export function clearToken() {
  storageRemove(TOKEN_KEY);
}

export async function apiFetch<T = any>(
  path: string,
  options: RequestInit = {},
): Promise<T> {
  const token = getToken();
  const headers: Record<string, string> = {
    "Content-Type": "application/json",
    ...(token ? { Authorization: `Bearer ${token}` } : {}),
    ...((options.headers as Record<string, string>) || {}),
  };

  const res = await fetch(`${API_BASE}${path}`, { ...options, headers });
  const text = await res.text();
  let data: any = {};
  try { data = text ? JSON.parse(text) : {}; } catch { data = { message: text }; }

  if (!res.ok) {
    if (res.status === 401) {
      clearToken();
      window.location.reload();
    }
    throw new Error(data?.message || `Request failed (${res.status})`);
  }
  return data as T;
}

export async function apiUpload<T = any>(
  path: string,
  formData: FormData,
): Promise<T> {
  const token = getToken();
  const headers: Record<string, string> = token
    ? { Authorization: `Bearer ${token}` }
    : {};

  const res = await fetch(`${API_BASE}${path}`, {
    method: "POST",
    headers,
    body: formData,
  });
  const text = await res.text();
  let data: any = {};
  try { data = text ? JSON.parse(text) : {}; } catch { data = { message: text }; }
  if (!res.ok) throw new Error(data?.message || `Upload failed (${res.status})`);
  return data as T;
}

export function downloadFile(path: string, filename: string) {
  const token = getToken();
  const url = `${API_BASE}${path}`;
  fetch(url, { headers: token ? { Authorization: `Bearer ${token}` } : {} })
    .then((res) => res.blob())
    .then((blob) => {
      const a = document.createElement("a");
      a.href = URL.createObjectURL(blob);
      a.download = filename;
      a.click();
      URL.revokeObjectURL(a.href);
    });
}
