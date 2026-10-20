// ============================================================
// Android Properties - Tooltip & Helper Text Copy (PRD §6.15)
// Kept in a single strings dictionary as required by the PRD
// ============================================================

export const TOOLTIPS = {
  // Primary Admin Dashboard Cards (Company-Wide Figures)
  spent_today: 'Total expenses dated today across all construction sites.',
  spent_this_month: 'Total expenses in the current calendar month across all construction sites.',
  clients_have_paid_dashboard: 'Total cash payments received from all clients across all construction projects so far.',
  clients_still_owe_dashboard: 'Sum of remaining contract balance dues owed by clients across all active projects.',
  client_money_still_with_us_dashboard: 'Advance payments received from clients that have not yet been spent on site expenses.',
  our_own_money_in_sites: 'Own company funds currently deployed across projects where spending exceeded client payments received.',
  cash_with_staff_admin: 'Total unspent cash float currently held by site supervisors and staff.',
  still_to_pay_vendors: 'Total unpaid vendor bills and contractor dues recorded across all projects.',

  // Project Detail KPI Figures (Single Project Scope)
  client_has_paid: 'Total money received from the client for this specific project so far.',
  client_still_owes: 'The agreed project price minus what the client has paid so far.',
  total_spent: 'Everything recorded as an expense on this project, whether you have paid the bill yet or not.',
  spent_from_client_money: 'How much of your spending was covered by money the client already sent.',
  spent_from_own_pocket: 'How much you have spent beyond what the client has sent. This is your own money sitting in this site right now.',
  client_money_still_with_us: 'Money the client sent for this project that you have not spent yet.',
  margin: 'The project price minus everything spent on it. On labour-only projects this is your labour charge minus your site costs.',
  budget_used: 'How much of the project price has already been spent. Above 100% means the project is running at a loss.',

  // Site Supervisor View figures
  cash_with_you_site: 'Cash float the company gave you that you have not spent yet. It goes down each time you record an expense paid from this cash.',
  you_spent_today: 'Total of your own expense entries dated today.',
  you_spent_this_month: 'Total of your own expense entries in the current calendar month.',
  your_projects: 'Count of active projects assigned to you.',
  paid_from: 'Funds used for this transaction (Android Properties Own Funds).',
  paid_via: 'Who physically handed over the money - the site cash you were given, or the admin paying directly.',
} as const;

export const FORM_HELPERS = {
  paid_from: 'Android Properties Own Funds.',
  paid_via: 'Site float (cash supervisor is holding) or Direct (paid directly by admin).',
  reimbursable: 'For labour-only jobs where we front material cost that client will return.',
  project_type: 'Turnkey (fixed complete price), Labour only (labour fees only), or Cost plus (expenses + supervision %).',
  quantity_rate: 'Amount is auto-calculated when quantity & rate are filled, but you can always type amount directly.',
  advance_warning: (amountFormatted: string) => `Note: ${amountFormatted} in advances already recorded for this payee on this project. Record only remaining balance to avoid double-counting.`,
} as const;
