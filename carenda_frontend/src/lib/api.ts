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

export async function apiFetch<T>(
  endpoint: string,
  options: RequestInit = {}
): Promise<T> {
  const cleanEndpoint = endpoint.startsWith("/") ? endpoint : `/${endpoint}`;
  const url = `${API_BASE_URL}${cleanEndpoint}`;

  // Read Telegram initData or fallback to 'dev' for browser testing
  let initData = "";
  if (typeof window !== "undefined") {
    initData = window.Telegram?.WebApp?.initData?.trim() || "";
  }
  const authHeaderValue = initData ? `tma ${initData}` : "tma dev";

  const headers = new Headers(options.headers || {});
  if (!headers.has("Content-Type") && !(options.body instanceof FormData)) {
    headers.set("Content-Type", "application/json");
  }
  headers.set("Authorization", authHeaderValue);

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

  // Handle 204 No Content
  if (response.status === 204) {
    return {} as T;
  }

  return response.json() as Promise<T>;
}

// User & Settings
export async function getMe(): Promise<MeResponse> {
  return apiFetch<MeResponse>("/me/");
}

export async function updateMe(payload: MeUpdateRequest): Promise<MeResponse> {
  return apiFetch<MeResponse>("/me/", {
    method: "PATCH",
    body: JSON.stringify(payload),
  });
}

// Dashboard
export async function getDashboard(): Promise<DashboardResponse> {
  return apiFetch<DashboardResponse>("/dashboard/");
}

// Fleet / Cars
export async function getCars(): Promise<CarListItem[]> {
  return apiFetch<CarListItem[]>("/cars/");
}

export async function getCarDetail(carId: number): Promise<CarDetail> {
  return apiFetch<CarDetail>(`/cars/${carId}/`);
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
export async function getDrivers(): Promise<Driver[]> {
  return apiFetch<Driver[]>("/drivers/");
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
  isActive?: boolean
): Promise<ContractSummary[]> {
  const query = isActive !== undefined ? `?is_active=${isActive}` : "";
  return apiFetch<ContractSummary[]>(`/contracts/${query}`);
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
export async function getUserSchedule(): Promise<import("@/types/fleet").UserScheduleContract[]> {
  return apiFetch<import("@/types/fleet").UserScheduleContract[]>("/my-schedule/");
}

export const getClientContracts = getUserSchedule;


