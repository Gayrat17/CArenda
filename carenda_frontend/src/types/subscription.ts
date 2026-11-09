export interface PaymentSettings {
  id: number;
  paynet_url: string | null;
  paynet_qr_image: string | null;
  card_number: string;
  card_holder: string;
  support_telegram: string;
  standard_plan_price: number;
  pro_plan_price: number;
  updated_at: string;
}

export interface SubscriptionRequest {
  id: number;
  plan_type: "standard" | "pro";
  plan_display: string;
  amount: number;
  status: "pending" | "approved" | "rejected";
  status_display: string;
  note: string;
  admin_note: string;
  user_name: string;
  user_phone: string;
  created_at: string;
  reviewed_at: string | null;
}

export interface SubscriptionStatusResponse {
  plan: string;
  plan_label: string;
  is_active: boolean;
  expires_at: string;
  cars_count: number;
  cars_limit: number;
  pending_request: SubscriptionRequest | null;
}
