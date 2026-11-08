export type UserPlan = "trial" | "basic" | "pro";
export type UserRole = "superadmin" | "owner" | "staff";

export interface User {
  id: number;
  telegram_id: number | null;
  username: string;
  full_name: string;
  phone: string;
  role: UserRole;
  parent_owner?: number | null;
  parent_owner_name?: string | null;
  plan: UserPlan;
  cars_limit: number;
  cars_count: number;
  expires_at: string;
  is_subscription_active: boolean;
  can_add_car: boolean;
  default_annual_percent: string;
}

export interface MeResponse extends User {}

export interface MeUpdateRequest {
  full_name?: string;
  phone?: string;
  default_annual_percent?: string | number;
}

export interface UserSetting {
  id: number;
  owner: number;
  default_annual_percent: string;
}

export type CarStatus = "available" | "rented" | "maintenance";

export interface ActiveContractSummary {
  contract_id: number;
  driver_name: string;
  driver_phone: string;
  monthly_amount: string;
  next_due_date: string | null;
}

export interface Car {
  id: number;
  name: string;
  plate_number: string;
  default_price: string;
  status: CarStatus;
  created_at: string;
}

export interface CarListItem extends Car {
  active_contract_summary: ActiveContractSummary | null;
}

export interface CarDetail extends Car {
  active_contract: Contract | null;
  past_contracts: ContractSummary[];
}

export interface CarCreatePayload {
  name: string;
  plate_number: string;
  default_price?: string | number;
}

export interface CarUpdatePayload {
  name?: string;
  plate_number?: string;
  default_price?: string | number;
  status?: CarStatus;
}

export interface Driver {
  id: number;
  full_name: string;
  phone: string;
  passport_info: string;
  notes: string;
  created_at: string;
}

export interface DriverCreatePayload {
  full_name: string;
  phone: string;
  passport_info?: string;
  notes?: string;
}

export interface ContractSummary {
  id: number;
  car: number;
  car_name: string;
  plate_number: string;
  driver: number;
  driver_name: string;
  driver_phone: string;
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
}

export interface Contract extends ContractSummary {
  payments: Payment[];
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

export interface OverduePaymentItem {
  id: number;
  contract_id: number;
  car_name: string;
  plate_number: string;
  driver_name: string;
  driver_phone: string;
  due_date: string;
  expected_amount: string;
  paid_amount: string;
  remaining_amount: string;
  days_overdue: number;
}

export interface DashboardResponse {
  total_cars: number;
  available_cars: number;
  rented_cars: number;
  maintenance_cars: number;
  active_contracts_count: number;
  total_expected_usd: string;
  total_collected_usd: string;
  total_remaining_usd: string;
  overdue_payments: OverduePaymentItem[];
}

export interface CalculatePayload {
  car_price: string | number;
  initial_payment?: string | number;
  annual_percent?: string | number | null;
  months_count: number;
}

export interface CalculateResponse {
  principal_amount: string;
  total_amount: string;
  monthly_amount: string;
  annual_percent: string;
}

export interface CreateContractPayload {
  car_id: number;
  driver_id?: number;
  driver_full_name?: string;
  driver_phone?: string;
  car_price: string | number;
  initial_payment?: string | number;
  annual_percent?: string | number | null;
  months_count: number;
  payment_day: number;
  start_date: string;
}

export interface CloseContractPayload {
  close_note?: string;
}

export interface RecordPaymentPayload {
  amount: string | number;
  comment?: string;
}
