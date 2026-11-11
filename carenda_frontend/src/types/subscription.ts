export interface SubscriptionSettings {
  id: number;
  standart_price: number;
  free_max_contracts: number;
  free_duration_days: number;
  paynet_url: string | null;
  paynet_qr_image: string | null;
  card_number: string;
  card_holder: string;
  support_telegram: string;
  standard_plan_price?: number;
  pro_plan_price?: number;
  updated_at: string;
}

export type PaymentSettings = SubscriptionSettings;

export interface SubscriptionRequest {
  id: number;
  user_id?: number;
  plan_type: "standard" | "pro" | string;
  plan_display: string;
  amount: number;
  status: "pending" | "approved" | "rejected";
  status_display: string;
  note: string;
  admin_note: string;
  user_name: string;
  user_phone: string;
  user_username?: string | null;
  user_tenant_code?: string | null;
  created_at: string;
  reviewed_at: string | null;
}

export interface SuperadminKpi {
  total: number;
  standard: number;
  free: number;
  expired: number;
  frozen: number;
  pending_requests: number;
}

export interface SuperadminArendatorItem {
  id: number;
  telegram_id: number | null;
  username: string | null;
  full_name: string;
  phone: string;
  tenant_code: string | null;
  plan: "free" | "standard" | string;
  plan_label: string;
  cars_limit: number;
  cars_count: number;
  active_contracts_count: number;
  is_frozen: boolean;
  is_superuser: boolean;
  is_onboarded: boolean;
  is_subscription_active: boolean;
  status_category: "standard" | "free" | "expired" | "frozen";
  days_delta: number;
  date_joined: string;
  trial_ends_at: string | null;
  subscription_expires_at: string | null;
  expires_at: string | null;
  expires_date: string | null;
}

export interface SuperadminArendatorsResponse {
  kpi: SuperadminKpi;
  arendators: SuperadminArendatorItem[];
}

export interface SubscriptionStatusResponse {
  plan: string;
  plan_label: string;
  is_active: boolean;
  is_frozen?: boolean;
  trial_ends_at?: string | null;
  subscription_expires_at?: string | null;
  expires_at: string;
  remaining_days?: number;
  contracts_count?: number;
  active_contracts_count?: number;
  max_contracts?: number;
  can_create_contract?: boolean;
  cannot_create_reason?: string;
  standart_price?: number;
  cars_count: number;
  cars_limit: number;
  settings?: SubscriptionSettings;
  pending_request: SubscriptionRequest | null;
}
