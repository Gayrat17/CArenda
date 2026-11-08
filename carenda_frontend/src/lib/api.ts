import {
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
const CACHE_TTL_MS = 20_000;

export function clearApiCache(): void {
  apiCache.clear();
}

export interface ApiFetchOptions extends RequestInit {
  forceRefresh?: boolean;
}

export async function apiFetch<T>(
  endpoint: string,
  options: ApiFetchOptions = {}
): Promise<T> {
  const method = (options.method || "GET").toUpperCase();
  const cleanEndpoint = endpoint.startsWith("/") ? endpoint : `/${endpoint}`;
  const url = `${API_BASE_URL}${cleanEndpoint}`;

  // Read Telegram initData or fallback to 'dev' for browser testing
  let initData = "";
  if (typeof window !== "undefined") {
    initData = window.Telegram?.WebApp?.initData?.trim() || "";
  }
  const authHeaderValue = initData ? `tma ${initData}` : "tma dev";

  const cacheKey = `${authHeaderValue}:${cleanEndpoint}`;

  // Cache lookup for non-mutating GET requests
  if (method === "GET" && !options.forceRefresh) {
    const cached = apiCache.get(cacheKey);
    if (cached && Date.now() - cached.timestamp < CACHE_TTL_MS) {
      return cached.data as T;
    }
  }

  const { forceRefresh, ...fetchOptions } = options;

  const headers = new Headers(fetchOptions.headers || {});
  if (!headers.has("Content-Type") && !(fetchOptions.body instanceof FormData)) {
    headers.set("Content-Type", "application/json");
  }
  headers.set("Authorization", authHeaderValue);

  const response = await fetch(url, {
    ...fetchOptions,
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
    apiCache.set(cacheKey, { data: result, timestamp: Date.now() });
  }

  return result;
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
  return apiFetch<Payment>(`/payments/${paymentId}/pay/`, {
    method: "POST",
    body: JSON.stringify(payload),
  });
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

// User (Driver) Schedule API
export async function getUserSchedule(options?: { forceRefresh?: boolean }): Promise<import("@/types/fleet").UserScheduleContract[]> {
  return apiFetch<import("@/types/fleet").UserScheduleContract[]>("/my-schedule/", options);
}

export const getClientContracts = getUserSchedule;


