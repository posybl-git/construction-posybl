// ============================================================
// TypeScript types for the Android Properties database (PRD §11)
// ============================================================

export type UserRole = 'admin' | 'site_manager';

export type ProjectType = 'turnkey' | 'labour_only' | 'cost_plus';

export type ProjectStatus = 'active' | 'on_hold' | 'completed' | 'archived';

export type MilestoneStatus = 'pending' | 'partially_received' | 'received' | 'overdue';

export type PaymentMethod = 'cash' | 'bank_transfer' | 'cheque' | 'easypaisa' | 'jazzcash' | 'other';

export type PaymentStatus = 'paid' | 'unpaid';

export type PaidFrom = 'client_funds' | 'own_funds';

export type PaidVia = 'site_float' | 'direct';

export type AuditAction = 'INSERT' | 'UPDATE' | 'DELETE';

// ---------- Profiles (PRD §11) ----------
export interface Profile {
  id: string;
  full_name: string;
  phone: string | null;
  email?: string | null;
  auth_identifier?: string | null;
  role: UserRole;
  must_change_password?: boolean;
  temp_password_expires_at?: string | null;
  invited_by?: string | null;
  invited_at?: string | null;
  last_login_at?: string | null;
  is_active: boolean;
  serial_no?: number | null;
  created_at: string;
  updated_at: string;
}

// ---------- Projects ----------
export interface Project {
  id: string;
  name: string;
  client_name: string | null;
  client_phone: string | null;
  address: string | null;
  plot_size: string | null;
  covered_area_sqft: number | null;
  project_type: ProjectType;
  supervision_percent: number | null;
  contract_value: number;
  start_date: string | null;
  expected_completion: string | null;
  status: ProjectStatus;
  notes: string | null;
  delete_batch_id?: string | null;
  serial_no?: number | null;
  created_at: string;
  created_by: string;
  updated_at: string;
  updated_by: string | null;
  deleted_at: string | null;
  deleted_by: string | null;
}

/** The restricted view site managers see — no contract_value, no financial data */
export interface ProjectForSite {
  id: string;
  name: string;
  address: string | null;
  status: ProjectStatus;
}

// ---------- Project Assignments ----------
export interface ProjectAssignment {
  id: string;
  project_id: string;
  user_id: string;
  created_at: string;
  created_by: string;
}

// ---------- Expenses ----------
export interface Expense {
  id: string;
  project_id: string;
  expense_name: string;
  quantity: number | null;
  unit: string | null;
  rate: number | null;
  amount: number;
  expense_date: string;
  category: string;
  purpose: string | null;
  vendor_id: string | null;
  vendor_name?: string | null;
  reference_no?: string | null;
  payment_status: PaymentStatus;
  paid_date: string | null;
  paid_method: string | null;
  paid_from: PaidFrom;
  paid_via: PaidVia;
  is_reimbursable: boolean;
  serial_no?: number | null;
  delete_batch_id?: string | null;
  attachment_paths?: string[] | null;
  created_at: string;
  created_by: string;
  updated_at: string;
  updated_by: string | null;
  deleted_at: string | null;
  deleted_by: string | null;
}

// ---------- Payment Milestones ----------
export interface PaymentMilestone {
  id: string;
  project_id: string;
  name: string;
  planned_amount: number;
  planned_date: string | null;
  sequence_no: number;
  status: MilestoneStatus;
  on_stage_completion?: boolean;
  notes: string | null;
  delete_batch_id?: string | null;
  created_at: string;
  created_by: string;
  updated_at: string;
  updated_by: string | null;
  deleted_at: string | null;
  deleted_by: string | null;
}

// ---------- Client Payments ----------
export interface ClientPayment {
  id: string;
  project_id: string;
  milestone_id: string | null;
  payment_date: string;
  amount: number;
  method: PaymentMethod;
  reference_no: string | null;
  received_by: string | null;
  note: string | null;
  serial_no?: number | null;
  delete_batch_id?: string | null;
  attachment_path?: string | null;
  created_at: string;
  created_by: string;
  updated_at: string;
  updated_by: string | null;
  deleted_at: string | null;
  deleted_by: string | null;
}

// ---------- Cash Issuances (Site Float) ----------
export interface CashIssuance {
  id: string;
  user_id: string;
  project_id: string | null;
  issue_date: string;
  amount: number; // Negative = cash returned
  funding_source: PaidFrom;
  method: PaymentMethod;
  note: string | null;
  is_adjustment: boolean;
  serial_no?: number | null;
  delete_batch_id?: string | null;
  created_at: string;
  created_by: string;
  updated_at: string;
  updated_by: string | null;
  deleted_at: string | null;
  deleted_by: string | null;
}

// ---------- Vendors ----------
export interface Vendor {
  id: string;
  name: string;
  normalised_name: string;
  phone: string | null;
  notes: string | null;
  created_at: string;
  created_by: string;
  updated_at: string;
  updated_by: string | null;
  deleted_at: string | null;
  deleted_by: string | null;
}

// ---------- Expense Categories ----------
export interface ExpenseCategory {
  id: string;
  name: string;
  is_seeded: boolean;
  created_at: string;
}

// ---------- Contract Revisions (PRD §4.6) ----------
export interface ContractRevision {
  id: string;
  project_id: string;
  old_value: number;
  new_value: number;
  reason: string | null;
  changed_by: string;
  changed_at: string;
  profiles?: { full_name: string } | null;
}

// ---------- Audit Log (PRD §7) ----------
export interface AuditLogEntry {
  id: string;
  table_name: string;
  record_id: string;
  action: AuditAction;
  old_row: Record<string, unknown> | null;
  new_row: Record<string, unknown> | null;
  changed_by: string | null;
  changed_at: string;
  profiles?: { full_name: string } | null;
}

// ---------- Notification Settings (PRD §6.11) ----------
export interface NotificationSettings {
  id?: string;
  user_id: string;
  channel: 'push';
  event_type: string;
  is_enabled: boolean;
  high_value_threshold: number;
  quiet_hours_start: string | null;
  quiet_hours_end: string | null;
  digest_time: string;
}

// ---------- Calculated Project Financials (PRD §5 & §6.5) ----------
export interface ProjectFinancials {
  total_received: number;
  total_expenses: number;
  total_paid_out: number;
  outstanding_payables: number;
  client_balance_due: number;
  cash_in_hand: number;
  net_position: number;
  project_margin: number;
  margin_percent: number;
  budget_used_percent: number;
  // Row 2 Whose Money metrics:
  spent_from_client_money: number;  // MIN(total_paid_out, total_received)
  spent_from_own_pocket: number;    // MAX(0, total_paid_out - total_received)
  client_money_with_us: number;     // MAX(0, total_received - total_paid_out)
  recoverable: number;
}

// ---------- 8 Dashboard Primary Cards (PRD §6.2) ----------
export interface DashboardStats {
  spent_today: number;
  spent_this_month: number;
  total_received: number;          // Clients have paid
  total_receivable: number;        // Clients still owe
  client_money_with_us: number;    // Client funds received but not yet spent
  own_money_in_sites: number;      // Own funds currently deployed across all projects
  cash_with_staff: number;         // Total float issued and not yet spent
  total_unpaid_payables: number;   // Still to pay vendors
}

// ---------- Site Manager Float Status (PRD §6.3 & §6.12) ----------
export interface SiteManagerFloatStatus {
  cash_with_you: number;           // float_issued - float_spent
  total_issued: number;
  total_spent: number;
  spent_today: number;
  spent_this_month: number;
  assigned_projects_count: number;
}
