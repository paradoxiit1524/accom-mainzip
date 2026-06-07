const API_BASE = (import.meta.env.VITE_API_URL as string | undefined)?.replace(/\/$/, "") || "/api";

export function getToken(): string | null {
  return localStorage.getItem("campusops_token");
}

export function setToken(token: string) {
  localStorage.setItem("campusops_token", token);
}

export function clearToken() {
  localStorage.removeItem("campusops_token");
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
