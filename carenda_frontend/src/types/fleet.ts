export type UserPlan = "free" | "standard" | "trial" | "basic" | "pro";
export type UserRole = "superadmin" | "arendator" | "owner" | "user" | "ijarachi";

export interface User {
  id: number;
  telegram_id: number | null;
  username: string | null;
  full_name: string;
  phone: string;
  phone_number?: string;
  role: UserRole;
  tenant_code?: string | null;
  invite_code?: string | null;
  is_registered?: boolean;
  is_onboarded?: boolean;
  is_superuser?: boolean;
  is_superadmin?: boolean;
  parent_owner?: number | null;
  parent_owner_name?: string | null;
  linked_arendator?: number | null;
  driver_id?: number | null;
  plan: UserPlan;
  cars_limit: number;
  cars_count: number;
  expires_at: string;
  trial_ends_at?: string | null;
  subscription_expires_at?: string | null;
  is_frozen?: boolean;
  remaining_days?: number;
  is_subscription_active: boolean;
  can_add_car: boolean;
  default_annual_percent: string;
}

export interface VerifyInviteCodeResponse {
  valid: boolean;
  type?: "contract" | "arendator";
  code?: string;
  contract_id?: number;
  arendator_id?: number;
  arendator_name?: string;
  car_name?: string | null;
  plate_number?: string | null;
  driver_name?: string;
  monthly_amount?: string;
  detail?: string;
}

export interface CompleteOnboardingPayload {
  role: "arendator" | "ijarachi";
  phone_number: string;
  invite_code?: string;
  full_name?: string;
}

export interface ClientPaymentScheduleItem {
  id: number;
  month_number: number;
  due_date: string;
  expected_amount: string;
  paid_amount: string;
  remaining_amount: string;
  status: "pending" | "partial" | "paid";
  paid_at: string | null;
  comment: string;
  days_overdue: number;
}

export interface ClientContract {
  id: number;
  invite_code?: string;
  is_active: boolean;
  car_name: string;
  car_year?: number | null;
  car_notes?: string;
  plate_number: string;
  owner_name: string;
  owner_phone: string;
  car_price: string;
  initial_payment: string;
  principal_amount: string;
  total_amount: string;
  monthly_amount: string;
  annual_percent: string;
  months_count: number;
  payment_day: number;
  start_date: string;
  paid_total_usd: string;
  remaining_total_usd: string;
  next_due_date: string | null;
  next_due_amount: string | null;
  payments: ClientPaymentScheduleItem[];
}

export interface ClientDashboardNextPayment {
  contract_id: number;
  car_name: string;
  car_year?: number | null;
  plate_number: string;
  owner_name?: string;
  owner_phone?: string;
  month_number: number;
  due_date: string;
  amount: string;
  days_left: number;
  is_overdue: boolean;
  is_today: boolean;
  days_overdue: number;
}

export interface ClientDashboardSummary {
  total_contracts: number;
  active_contracts: number;
  total_paid_usd: string;
  total_remaining_usd: string;
  next_payment: ClientDashboardNextPayment | null;
}

export interface ClientDashboardResponse {
  client: {
    id: number;
    full_name: string;
    phone: string;
    telegram_id: number | null;
    is_onboarded: boolean;
  };
  contracts: ClientContract[];
  summary: ClientDashboardSummary;
}

export type UserScheduleContract = ClientContract;
export type UserScheduleItem = ClientPaymentScheduleItem;

export interface MeResponse extends User {}

export interface BootstrapResponse {
  me: MeResponse;
  dashboard: DashboardResponse | null;
  cars: CarListItem[];
  user_schedule: UserScheduleContract[] | null;
}

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
  year?: number | null;
  notes?: string;
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
  year?: number | null;
  notes?: string;
  default_price?: string | number;
}

export interface CarUpdatePayload {
  name?: string;
  plate_number?: string;
  year?: number | null;
  notes?: string;
  default_price?: string | number;
  status?: CarStatus;
}

export interface Driver {
  id: number;
  full_name: string;
  phone: string;
  secondary_phone?: string;
  passport_info: string;
  notes: string;
  created_at: string;
}

export interface DriverCreatePayload {
  full_name: string;
  phone: string;
  secondary_phone?: string;
  passport_info?: string;
  notes?: string;
}

export interface ContractSummary {
  id: number;
  invite_code?: string;
  car: number;
  car_name: string;
  plate_number: string;
  car_year?: number | null;
  car_notes?: string;
  driver: number;
  driver_name: string;
  driver_phone: string;
  driver_secondary_phone?: string;
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
  is_postponed?: boolean;
}

export interface OverduePaymentItem {
  id: number;
  contract_id: number;
  month_number?: number;
  car_name: string;
  plate_number: string;
  driver_name: string;
  driver_phone: string;
  due_date: string;
  expected_amount: string;
  paid_amount: string;
  remaining_amount: string;
  days_overdue: number;
  comment?: string;
  can_pay?: boolean;
  is_postponed?: boolean;
}

export interface UpcomingPaymentItem {
  id: number;
  contract_id: number;
  month_number?: number;
  car_name: string;
  plate_number: string;
  driver_name: string;
  driver_phone: string;
  due_date: string;
  expected_amount: string;
  paid_amount: string;
  remaining_amount: string;
  days_until_due: number;
  comment?: string;
  can_pay?: boolean;
  is_postponed?: boolean;
}

export interface DashboardResponse {
  total_cars: number;
  available_cars: number;
  rented_cars: number;
  maintenance_cars: number;
  active_contracts_count: number;
  completed_contracts_count?: number;
  total_contracts_count?: number;
  total_expected_usd: string;
  total_collected_usd: string;
  total_remaining_usd: string;
  this_month_expected_usd?: string;
  this_month_collected_usd?: string;
  this_month_remaining_usd?: string;
  this_month_collection_rate?: number;
  overdue_count?: number;
  total_overdue_usd?: string;
  overdue_payments: OverduePaymentItem[];
  upcoming_count?: number;
  total_upcoming_usd?: string;
  upcoming_payments?: UpcomingPaymentItem[];
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
  car_id?: number;
  car_name?: string;
  plate_number?: string;
  car_year?: number | null;
  car_notes?: string;
  driver_id?: number;
  driver_full_name?: string;
  driver_phone?: string;
  driver_secondary_phone?: string;
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
