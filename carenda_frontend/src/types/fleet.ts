export type UserPlan = "trial" | "basic" | "pro";

export interface User {
  id: number;
  username: string;
  full_name: string;
  phone: string;
  email?: string;
  telegram_id: number | null;
  plan: UserPlan;
  cars_limit: number;
  expires_at: string;
  is_subscription_active: boolean;
  can_add_car: boolean;
}

export interface UserSetting {
  id: number;
  owner: number;
  default_annual_percent: string;
}

export type CarStatus = "available" | "rented" | "maintenance";

export interface Car {
  id: number;
  owner: number;
  name: string;
  plate_number: string;
  default_price: string;
  status: CarStatus;
  created_at: string;
}

export interface Driver {
  id: number;
  owner: number;
  full_name: string;
  phone: string;
  passport_info: string;
  notes: string;
  created_at: string;
}

export interface Contract {
  id: number;
  owner: number;
  car: number | Car;
  driver: number | Driver;
  car_price: string;
  initial_payment: string;
  annual_percent: string;
  months_count: number;
  payment_day: number;
  principal_amount: string;
  total_amount: string;
  monthly_amount: string;
  start_date: string;
  is_active: boolean;
  closed_at: string | null;
  close_note: string;
  created_at: string;
  payments?: Payment[];
}

export type PaymentStatus = "pending" | "partial" | "paid" | "cancelled";

export interface Payment {
  id: number;
  contract: number;
  month_number: number;
  due_date: string;
  expected_amount: string;
  paid_amount: string;
  remaining_amount: string;
  status: PaymentStatus;
  paid_at: string | null;
  comment: string;
}
