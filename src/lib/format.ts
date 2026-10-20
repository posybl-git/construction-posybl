// ============================================================
// PKR Currency Formatting - South Asian Digit Grouping
// Lakh / Crore shorthand input parsing
// Date formatting - DD-MMM-YYYY in Asia/Karachi
// Password & WhatsApp helpers (PRD §2.1)
// ============================================================

/**
 * Format a number into PKR with South Asian digit grouping.
 * e.g. 1200000 → "Rs 12,00,000"
 * Optionally appends shorthand: "Rs 12,00,000 (12 Lakh)"
 */
export function formatPKR(amount: number | null | undefined, showShorthand = true): string {
  if (amount == null || isNaN(amount)) return 'Rs 0';

  const isNegative = amount < 0;
  const abs = Math.abs(Math.round(amount));
  const formatted = formatSouthAsianNumber(abs);
  const prefix = isNegative ? '-' : '';

  let result = `${prefix}Rs ${formatted}`;

  if (showShorthand && abs >= 100000) {
    result += ` (${getShorthand(abs)})`;
  }

  return result;
}

/**
 * Format number with shorthand only (e.g., "12 Lakh", "1.2 Crore")
 */
export function formatPKRShort(amount: number | null | undefined): string {
  if (amount == null || isNaN(amount)) return 'Rs 0';
  const abs = Math.abs(Math.round(amount));
  const prefix = amount < 0 ? '-' : '';

  if (abs >= 10000000) {
    return `${prefix}Rs ${(abs / 10000000).toFixed(abs % 10000000 === 0 ? 0 : 1)} Cr`;
  }
  if (abs >= 100000) {
    return `${prefix}Rs ${(abs / 100000).toFixed(abs % 100000 === 0 ? 0 : 1)} L`;
  }
  return `${prefix}Rs ${formatSouthAsianNumber(abs)}`;
}

/**
 * South Asian digit grouping: 12,00,000 (not 1,200,000)
 */
export function formatSouthAsianNumber(n: number): string {
  const s = Math.round(n).toString();
  if (s.length <= 3) return s;

  const last3 = s.slice(-3);
  const rest = s.slice(0, -3);

  // Group the rest in pairs from right
  const pairs: string[] = [];
  for (let i = rest.length; i > 0; i -= 2) {
    pairs.unshift(rest.slice(Math.max(0, i - 2), i));
  }

  return pairs.join(',') + ',' + last3;
}

/**
 * Get lakh/crore shorthand string
 */
export function getShorthand(abs: number): string {
  if (abs >= 10000000) {
    const crore = abs / 10000000;
    return `${crore % 1 === 0 ? crore.toFixed(0) : crore.toFixed(1)} Crore`;
  }
  if (abs >= 100000) {
    const lakh = abs / 100000;
    return `${lakh % 1 === 0 ? lakh.toFixed(0) : lakh.toFixed(1)} Lakh`;
  }
  return abs.toString();
}

/**
 * Parse PKR input shorthand.
 * Accepts: "13 lakh", "13l", "1.2 crore", "1.2cr", "1200000"
 * Returns the numeric value or null if unparseable.
 */
export function parsePKRInput(input: string): number | null {
  if (!input) return null;

  const cleaned = input.trim().toLowerCase().replace(/,/g, '').replace(/rs\.?\s*/i, '');

  // Match patterns like "13 lakh", "13l", "1.2 crore", "1.2cr"
  const lakhMatch = cleaned.match(/^([\d.]+)\s*(?:lakh|lac|l)$/);
  if (lakhMatch) {
    return Math.round(parseFloat(lakhMatch[1]) * 100000);
  }

  const croreMatch = cleaned.match(/^([\d.]+)\s*(?:crore|cr|c)$/);
  if (croreMatch) {
    return Math.round(parseFloat(croreMatch[1]) * 10000000);
  }

  // Plain number
  const num = parseFloat(cleaned);
  if (!isNaN(num) && num >= 0) {
    return Math.round(num);
  }

  return null;
}

/**
 * Format a date as DD-MMM-YYYY (e.g., "11-Sep-2026")
 */
export function formatDate(date: string | Date | null | undefined): string {
  if (!date) return '';
  const d = typeof date === 'string' ? new Date(date) : date;
  if (isNaN(d.getTime())) return '';

  const months = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
  const day = d.getDate().toString().padStart(2, '0');
  const month = months[d.getMonth()];
  const year = d.getFullYear();

  return `${day}-${month}-${year}`;
}

/**
 * Get today's date in Asia/Karachi timezone as YYYY-MM-DD string
 */
export function getTodayPKT(): string {
  return new Date().toLocaleDateString('en-CA', { timeZone: 'Asia/Karachi' });
}

/**
 * Get yesterday's date in Asia/Karachi timezone as YYYY-MM-DD string
 */
export function getYesterdayPKT(): string {
  const d = new Date();
  d.setDate(d.getDate() - 1);
  return d.toLocaleDateString('en-CA', { timeZone: 'Asia/Karachi' });
}

/**
 * Get a relative label for a date - "Today", "Yesterday", or the formatted date
 */
export function getRelativeDay(date: string): string {
  const today = getTodayPKT();
  const yesterday = getYesterdayPKT();

  if (date === today) return 'Today';
  if (date === yesterday) return 'Yesterday';
  return formatDate(date);
}

/**
 * Get current month as YYYY-MM string in PKT
 */
export function getCurrentMonthPKT(): string {
  const now = new Date();
  const year = parseInt(now.toLocaleDateString('en-CA', { timeZone: 'Asia/Karachi', year: 'numeric' }));
  const month = parseInt(now.toLocaleDateString('en-CA', { timeZone: 'Asia/Karachi', month: 'numeric' }));
  return `${year}-${month.toString().padStart(2, '0')}`;
}

/**
 * Get human-readable status badge variant
 */
export function getStatusVariant(status: string): 'success' | 'warning' | 'danger' | 'info' | 'neutral' {
  switch (status) {
    case 'active': return 'success';
    case 'on_hold': return 'warning';
    case 'completed': return 'info';
    case 'archived': return 'neutral';
    case 'paid': return 'success';
    case 'unpaid': return 'danger';
    case 'received': return 'success';
    case 'partially_received': return 'warning';
    case 'pending': return 'neutral';
    case 'overdue': return 'danger';
    default: return 'neutral';
  }
}

/**
 * Get the budget progress bar variant based on percentage (PRD §5)
 */
export function getBudgetVariant(percent: number): 'normal' | 'warning' | 'danger' {
  if (percent >= 100) return 'danger';
  if (percent >= 80) return 'warning';
  return 'normal';
}

/**
 * Format a status string for display
 */
export function formatStatus(status: string): string {
  return status
    .replace(/_/g, ' ')
    .replace(/\b\w/g, c => c.toUpperCase());
}

/**
 * Format payment method for display
 */
export function formatPaymentMethod(method: string): string {
  const map: Record<string, string> = {
    cash: 'Cash',
    bank_transfer: 'Bank Transfer',
    cheque: 'Cheque',
    easypaisa: 'Easypaisa',
    jazzcash: 'JazzCash',
    other: 'Other',
  };
  return map[method] || method;
}

/**
 * Normalise Pakistani phone or email login identifier per PRD §2.2
 * e.g. "03001234567" or "+923001234567" -> "923001234567@users.siteledger.app"
 */
export function normalizeLoginIdentifier(input: string): string {
  const trimmed = input.trim();
  if (!trimmed) return '';
  if (trimmed.includes('@')) {
    return trimmed.toLowerCase();
  }
  const digits = trimmed.replace(/\D/g, '');
  if (digits.startsWith('03') && digits.length === 11) {
    return `92${digits.slice(1)}@users.siteledger.app`;
  }
  if (digits.startsWith('923') && digits.length === 12) {
    return `${digits}@users.siteledger.app`;
  }
  if (digits.length === 10 && digits.startsWith('3')) {
    return `92${digits}@users.siteledger.app`;
  }
  return trimmed;
}

/**
 * Generate an 8-character readable temporary password (PRD §2.1)
 * Excludes ambiguous characters (no O/0, I/l/1)
 */
export function generateTempPassword(): string {
  const chars = '23456789ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnpqrstuvwxyz';
  let result = '';
  for (let i = 0; i < 8; i++) {
    result += chars.charAt(Math.floor(Math.random() * chars.length));
  }
  return result;
}

/**
 * Build a wa.me WhatsApp sharing deep link (PRD §2.1 & §6.10)
 */
export function getWhatsAppShareLink(phone: string | null | undefined, message: string): string {
  let cleanPhone = (phone || '').replace(/\D/g, '');
  if (cleanPhone.startsWith('03')) {
    cleanPhone = '92' + cleanPhone.slice(1);
  }
  const encodedMsg = encodeURIComponent(message);
  if (cleanPhone) {
    return `https://wa.me/${cleanPhone}?text=${encodedMsg}`;
  }
  return `https://wa.me/?text=${encodedMsg}`;
}
