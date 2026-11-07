declare global {
  interface Window {
    Telegram?: {
      WebApp?: {
        initData?: string;
        close?: () => void;
        ready?: () => void;
        expand?: () => void;
        [key: string]: unknown;
      };
    };
  }
}

const API_BASE_URL =
  process.env.NEXT_PUBLIC_API_URL || "http://localhost:8000/api/v1";

export async function apiFetch<T>(
  endpoint: string,
  options: RequestInit = {}
): Promise<T> {
  const cleanEndpoint = endpoint.startsWith("/") ? endpoint : `/${endpoint}`;
  const url = `${API_BASE_URL}${cleanEndpoint}`;

  const initData =
    typeof window !== "undefined"
      ? window.Telegram?.WebApp?.initData || ""
      : "";

  const headers = new Headers(options.headers || {});
  if (!headers.has("Content-Type") && !(options.body instanceof FormData)) {
    headers.set("Content-Type", "application/json");
  }
  headers.set("Authorization", `tma ${initData}`);

  const response = await fetch(url, {
    ...options,
    headers,
  });

  if (!response.ok) {
    let errorBody: string;
    try {
      const errorData = await response.json();
      errorBody =
        errorData.detail || errorData.message || JSON.stringify(errorData);
    } catch {
      errorBody = await response.text();
    }
    throw new Error(errorBody || `HTTP error ${response.status}`);
  }

  return response.json() as Promise<T>;
}
