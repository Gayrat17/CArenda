import {
  BootstrapResponse,
  CalculatePayload,
  CalculateResponse,
  CarCreatePayload,
  CarDetail,
  CarListItem,
  CarUpdatePayload,
  CloseContractPayload,
  Contract,
  ContractSummary,
  CreateContractPayload,
  DashboardResponse,
  Driver,
  DriverCreatePayload,
  MeResponse,
  MeUpdateRequest,
  OverduePaymentItem,
  Payment,
  RecordPaymentPayload,
} from "@/types/fleet";

declare global {
  interface Window {
    Telegram?: {
      WebApp?: {
        initData?: string;
        initDataUnsafe?: {
          user?: {
            id?: number;
            first_name?: string;
            last_name?: string;
            username?: string;
            language_code?: string;
          };
          [key: string]: unknown;
        };
        close?: () => void;
        ready?: () => void;
        expand?: () => void;
        disableVerticalSwipes?: () => void;
        [key: string]: unknown;
      };
    };
  }
}

const API_BASE_URL =
  process.env.NEXT_PUBLIC_API_URL || "/api/v1";

interface CacheEntry<T> {
  data: T;
  timestamp: number;
}

const apiCache = new Map<string, CacheEntry<unknown>>();
const CACHE_TTL_MS = 30_000;
const STORAGE_PREFIX = "carenda_cache_";

export function getTelegramUserId(): string {
  if (typeof window === "undefined") return "dev";
  const tgUser = window.Telegram?.WebApp?.initDataUnsafe?.user;
  return tgUser?.id ? String(tgUser.id) : "dev";
}

export function clearApiCache(): void {
  apiCache.clear();
  if (typeof window !== "undefined") {
    try {
      const userId = getTelegramUserId();
      const prefix = `${STORAGE_PREFIX}${userId}`;
      for (let i = window.localStorage.length - 1; i >= 0; i--) {
        const key = window.localStorage.key(i);
        if (key && (key.startsWith(prefix) || key.startsWith("carenda_bootstrap_"))) {
          window.localStorage.removeItem(key);
        }
      }
    } catch {
      // Ignore localStorage errors
    }
  }
}

/**
 * Synchronously reads the cached Bootstrap payload from memory or localStorage.
 * Enables 0ms immediate UI hydration on frame 1 without waiting for React effects or network.
 */
export function getCachedBootstrapSync(): BootstrapResponse | null {
  if (typeof window === "undefined") return null;

  // 1. Check in-memory Map cache
  for (const [key, entry] of apiCache.entries()) {
    if (key.includes("/bootstrap/") || key.includes("/bootstrap")) {
      return entry.data as BootstrapResponse;
    }
  }

  // 2. Check persistent window.localStorage
  try {
    const userId = getTelegramUserId();
    const primaryKey = `${STORAGE_PREFIX}${userId}_/bootstrap/`;
    const fallbackKey = `${STORAGE_PREFIX}${userId}_/bootstrap`;
    const altKey = `carenda_bootstrap_${userId}`;

    const raw =
      window.localStorage.getItem(primaryKey) ||
      window.localStorage.getItem(fallbackKey) ||
      window.localStorage.getItem(altKey);

    if (raw) {
      const parsed = JSON.parse(raw);
      if (parsed && typeof parsed === "object") {
        if ("data" in parsed && parsed.data) {
          return parsed.data as BootstrapResponse;
        }
        if ("me" in parsed && parsed.me) {
          return parsed as BootstrapResponse;
        }
      }
    }
  } catch {
    // Ignore localStorage errors
  }
  return null;
}

export interface ApiFetchOptions extends RequestInit {
  forceRefresh?: boolean;
}

export async function apiFetch<T>(
  endpoint: string,
  options: ApiFetchOptions = {}
): Promise<T> {
  const method = (options.method || "GET").toUpperCase();
  let cleanEndpoint = endpoint.startsWith("/") ? endpoint : `/${endpoint}`;
  if (!cleanEndpoint.endsWith("/") && !cleanEndpoint.includes("?") && !cleanEndpoint.includes(".")) {
    cleanEndpoint = `${cleanEndpoint}/`;
  }
  const url = `${API_BASE_URL}${cleanEndpoint}`;

  // Read Telegram initData from WebApp or URL hash fallback
  let initData = "";
  if (typeof window !== "undefined") {
    initData = window.Telegram?.WebApp?.initData?.trim() || "";
    if (!initData && window.location.hash.includes("tgWebAppData=")) {
      try {
        const hashParams = new URLSearchParams(window.location.hash.substring(1));
        initData = hashParams.get("tgWebAppData") || "";
      } catch {
        // ignore
      }
    }
  }

  // Safely encode non-ASCII characters (e.g. smart quotes, Cyrillic, Uzbek letters)
  // so Headers.set never throws WebKit 'TypeError: Load failed' or ByteString errors
  let safeInitData = initData;
  if (safeInitData && /[^\x00-\x7F]/.test(safeInitData)) {
    safeInitData = encodeURI(safeInitData);
  }
  const authHeaderValue = safeInitData ? `tma ${safeInitData}` : "tma dev";

  const cacheKey = `${authHeaderValue}:${cleanEndpoint}`;

  // Cache lookup for non-mutating GET requests (Memory -> localStorage)
  if (method === "GET" && !options.forceRefresh) {
    const memCached = apiCache.get(cacheKey);
    if (memCached && Date.now() - memCached.timestamp < CACHE_TTL_MS) {
      return memCached.data as T;
    }

    if (typeof window !== "undefined") {
      try {
        const userId = getTelegramUserId();
        const storageKey = `${STORAGE_PREFIX}${userId}_${cleanEndpoint}`;
        const raw = window.localStorage.getItem(storageKey);
        if (raw) {
          const entry = JSON.parse(raw);
          if (entry && Date.now() - entry.timestamp < CACHE_TTL_MS) {
            apiCache.set(cacheKey, entry);
            return entry.data as T;
          }
        }
      } catch {
        // Ignore localStorage errors
      }
    }
  }

  const { forceRefresh, ...fetchOptions } = options;

  const headers = new Headers(fetchOptions.headers || {});
  if (!headers.has("Content-Type") && !(fetchOptions.body instanceof FormData)) {
    headers.set("Content-Type", "application/json");
  }
  headers.set("Authorization", authHeaderValue);

  let response: Response;
  try {
    response = await fetch(url, {
      ...fetchOptions,
      headers,
    });
  } catch (netErr: unknown) {
    const errorMsg = netErr instanceof Error ? netErr.message : String(netErr);
    throw new Error(
      `Tarmoq xatoligi (API ga ulanib bo'lmadi: ${errorMsg}). Backend server ishlayotganligini tekshiring.`
    );
  }

  if (!response.ok) {
    let rawText = "";
    try {
      rawText = await response.text();
    } catch {
      rawText = "";
    }

    let errorBody = "";
    if (rawText) {
      try {
        const errorData = JSON.parse(rawText);
        errorBody =
          errorData.detail ||
          errorData.message ||
          (typeof errorData === "string" ? errorData : JSON.stringify(errorData));
      } catch {
        errorBody = rawText;
      }
    }

    if (
      response.status === 502 ||
      response.status === 503 ||
      response.status === 504 ||
      errorBody.includes("ECONNREFUSED") ||
      errorBody.includes("Failed to proxy")
    ) {
      throw new Error(
        "Backend serverga ulanib bo'lmadi (127.0.0.1:8000). Iltimos, Django backend serverni ishga tushiring."
      );
    }

    throw new Error(errorBody || `HTTP error ${response.status}`);
  }

  // Any mutation clears client-side cache immediately
  if (method !== "GET") {
    clearApiCache();
  }

  // Handle 204 No Content
  if (response.status === 204) {
    return {} as T;
  }

  const result = (await response.json()) as T;
  if (method === "GET") {
    const entry: CacheEntry<unknown> = { data: result, timestamp: Date.now() };
    apiCache.set(cacheKey, entry);
    if (typeof window !== "undefined") {
      try {
        const userId = getTelegramUserId();
        const storageKey = `${STORAGE_PREFIX}${userId}_${cleanEndpoint}`;
        window.localStorage.setItem(storageKey, JSON.stringify(entry));
        if (cleanEndpoint.startsWith("/bootstrap")) {
          window.localStorage.setItem(`carenda_bootstrap_${userId}`, JSON.stringify(result));
        }
      } catch {
        // Ignore localStorage storage quota errors
      }
    }
  }

  return result;
}

// Bootstrap (Single-request fast startup)
export async function getBootstrap(
  options?: { forceRefresh?: boolean }
): Promise<BootstrapResponse> {
  return apiFetch<BootstrapResponse>("/bootstrap/", options);
}

// User & Settings
export async function getMe(options?: { forceRefresh?: boolean }): Promise<MeResponse> {
  return apiFetch<MeResponse>("/me/", options);
}

export async function updateMe(payload: MeUpdateRequest): Promise<MeResponse> {
  return apiFetch<MeResponse>("/me/", {
    method: "PATCH",
    body: JSON.stringify(payload),
  });
}

// Dashboard
export async function getDashboard(options?: { forceRefresh?: boolean }): Promise<DashboardResponse> {
  return apiFetch<DashboardResponse>("/dashboard/", options);
}

// Fleet / Cars
export async function getCars(options?: { forceRefresh?: boolean }): Promise<CarListItem[]> {
  return apiFetch<CarListItem[]>("/cars/", options);
}

export async function getCarDetail(
  carId: number,
  options?: { forceRefresh?: boolean }
): Promise<CarDetail> {
  return apiFetch<CarDetail>(`/cars/${carId}/`, options);
}

export async function createCar(payload: CarCreatePayload): Promise<CarDetail> {
  return apiFetch<CarDetail>("/cars/", {
    method: "POST",
    body: JSON.stringify(payload),
  });
}

export async function updateCar(
  carId: number,
  payload: CarUpdatePayload
): Promise<CarDetail> {
  return apiFetch<CarDetail>(`/cars/${carId}/`, {
    method: "PATCH",
    body: JSON.stringify(payload),
  });
}

// Drivers
export async function getDrivers(options?: { forceRefresh?: boolean }): Promise<Driver[]> {
  return apiFetch<Driver[]>("/drivers/", options);
}

export async function createDriver(
  payload: DriverCreatePayload
): Promise<Driver> {
  return apiFetch<Driver>("/drivers/", {
    method: "POST",
    body: JSON.stringify(payload),
  });
}

// Contracts & Calculations
export async function calculateContractPreview(
  payload: CalculatePayload
): Promise<CalculateResponse> {
  return apiFetch<CalculateResponse>("/contracts/calculate/", {
    method: "POST",
    body: JSON.stringify(payload),
  });
}

export async function getContracts(
  isActive?: boolean,
  options?: { forceRefresh?: boolean }
): Promise<ContractSummary[]> {
  const query = isActive !== undefined ? `?is_active=${isActive}` : "";
  return apiFetch<ContractSummary[]>(`/contracts/${query}`, options);
}

export async function createContract(
  payload: CreateContractPayload
): Promise<Contract> {
  return apiFetch<Contract>("/contracts/", {
    method: "POST",
    body: JSON.stringify(payload),
  });
}

export async function closeContract(
  contractId: number,
  payload?: CloseContractPayload
): Promise<ContractSummary> {
  return apiFetch<ContractSummary>(`/contracts/${contractId}/close/`, {
    method: "POST",
    body: JSON.stringify(payload || {}),
  });
}

// Payments
export async function getOverduePayments(): Promise<OverduePaymentItem[]> {
  return apiFetch<OverduePaymentItem[]>("/payments/overdue/");
}

export async function recordPayment(
  paymentId: number,
  payload: RecordPaymentPayload
): Promise<Payment> {
  const result = await apiFetch<Payment>(`/payments/${paymentId}/pay/`, {
    method: "POST",
    body: JSON.stringify(payload),
  });
  clearApiCache();
  return result;
}

export async function postponePayment(
  paymentId: number,
  comment?: string
): Promise<{ detail: string; payments: Payment[] }> {
  const result = await apiFetch<{ detail: string; payments: Payment[] }>(
    `/payments/${paymentId}/postpone/`,
    {
      method: "POST",
      body: JSON.stringify({ comment }),
    }
  );
  clearApiCache();
  return result;
}

// Excel Export
export async function downloadExcelReport(): Promise<void> {
  const cleanEndpoint = "/export/excel/";
  const url = `${API_BASE_URL}${cleanEndpoint}`;

  let initData = "";
  if (typeof window !== "undefined") {
    initData = window.Telegram?.WebApp?.initData?.trim() || "";
  }
  const authHeaderValue = initData ? `tma ${initData}` : "tma dev";

  const response = await fetch(url, {
    headers: {
      Authorization: authHeaderValue,
    },
  });

  if (!response.ok) {
    throw new Error("Excel hisobotini yuklab olishda xatolik yuz berdi.");
  }

  const blob = await response.blob();
  const downloadUrl = window.URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = downloadUrl;
  a.download = "carenda_hisobot.xlsx";
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  window.URL.revokeObjectURL(downloadUrl);
}

export async function downloadSingleContractExcel(
  contractId: number,
  filename?: string
): Promise<void> {
  const cleanEndpoint = `/contracts/${contractId}/export/excel/`;
  const url = `${API_BASE_URL}${cleanEndpoint}`;

  let initData = "";
  if (typeof window !== "undefined") {
    initData = window.Telegram?.WebApp?.initData?.trim() || "";
  }
  const authHeaderValue = initData ? `tma ${initData}` : "tma dev";

  const response = await fetch(url, {
    headers: {
      Authorization: authHeaderValue,
    },
  });

  if (!response.ok) {
    throw new Error("Shartnoma Excel hisobotini yuklab olishda xatolik yuz berdi.");
  }

  const blob = await response.blob();
  const downloadUrl = window.URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = downloadUrl;
  a.download = filename || `shartnoma_${contractId}.xlsx`;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  window.URL.revokeObjectURL(downloadUrl);
}

// User (Driver) Schedule API
export async function getUserSchedule(options?: { forceRefresh?: boolean }): Promise<import("@/types/fleet").UserScheduleContract[]> {
  return apiFetch<import("@/types/fleet").UserScheduleContract[]>("/my-schedule/", options);
}

export const getClientContracts = getUserSchedule;


