// ============================================================
// CSV Export Utility Functions (PRD §6.10 & §6.14)
// Converts tabular records into clean, Excel-compatible CSVs
// ============================================================

import { formatDate, formatPaymentMethod } from '@/lib/format';
import type { Expense, ClientPayment } from '@/types/database';

/**
 * Trigger download of CSV file in the browser
 */
function downloadCSV(csvContent: string, filename: string) {
  // Use UTF-8 BOM so Excel opens Urdu / special characters correctly
  const blob = new Blob(['\uFEFF' + csvContent], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.setAttribute('href', url);
  link.setAttribute('download', filename);
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  URL.revokeObjectURL(url);
}

/**
 * Escape CSV cell value properly
 */
function escapeCSV(value: unknown): string {
  if (value === null || value === undefined) return '';
  const str = String(value);
  if (str.includes(',') || str.includes('"') || str.includes('\n')) {
    return `"${str.replace(/"/g, '""')}"`;
  }
  return str;
}

/**
 * Export filtered expenses list to CSV
 */
export function exportExpensesToCSV(
  expenses: (Expense & { project_name?: string; created_by_name?: string })[],
  filenamePrefix = 'expenses'
) {
  const headers = [
    'Date',
    'Project',
    'Expense Item',
    'Amount (PKR)',
    'Payee / Vendor',
    'Purpose / Note',
    'Payment Status',
    'Paid Via',
    'Paid Date',
    'Recorded By',
  ];

  const rows = expenses.map(e => [
    escapeCSV(formatDate(e.expense_date)),
    escapeCSV(e.project_name || 'N/A'),
    escapeCSV(e.expense_name),
    escapeCSV(e.amount),
    escapeCSV(e.vendor_name || ''),
    escapeCSV(e.purpose || ''),
    escapeCSV(e.payment_status === 'paid' ? 'Paid' : 'Unpaid (Due)'),
    escapeCSV(e.paid_via === 'site_float' ? 'Site Float' : 'Direct'),
    escapeCSV(e.paid_date ? formatDate(e.paid_date) : ''),
    escapeCSV(e.created_by_name || ''),
  ]);

  const csvContent = [
    headers.join(','),
    ...rows.map(row => row.join(',')),
  ].join('\r\n');

  const dateStr = new Date().toISOString().split('T')[0];
  downloadCSV(csvContent, `${filenamePrefix}_${dateStr}.csv`);
}

/**
 * Export client payments list to CSV
 */
export function exportPaymentsToCSV(
  payments: (ClientPayment & { project_name?: string; milestone_name?: string })[],
  filenamePrefix = 'client_payments'
) {
  const headers = [
    'Date Received',
    'Project',
    'Amount Received (PKR)',
    'Payment Method',
    'Reference / Trx ID',
    'Linked Milestone',
    'Received By',
    'Notes',
  ];

  const rows = payments.map(p => [
    escapeCSV(formatDate(p.payment_date)),
    escapeCSV(p.project_name || 'N/A'),
    escapeCSV(p.amount),
    escapeCSV(formatPaymentMethod(p.method)),
    escapeCSV(p.reference_no || ''),
    escapeCSV(p.milestone_name || ''),
    escapeCSV(p.received_by || ''),
    escapeCSV(p.note || ''),
  ]);

  const csvContent = [
    headers.join(','),
    ...rows.map(row => row.join(',')),
  ].join('\r\n');

  const dateStr = new Date().toISOString().split('T')[0];
  downloadCSV(csvContent, `${filenamePrefix}_${dateStr}.csv`);
}

/**
 * Export payables list to CSV
 */
export function exportPayablesToCSV(
  payables: {
    vendor_name: string;
    expense_name: string;
    project_name: string;
    expense_date: string;
    amount: number;
    purpose?: string | null;
  }[],
  filenamePrefix = 'payables_outstanding'
) {
  const headers = [
    'Vendor / Payee',
    'Expense Description',
    'Project',
    'Bill Date',
    'Amount Due (PKR)',
    'Purpose / Notes',
  ];

  const rows = payables.map(item => [
    escapeCSV(item.vendor_name),
    escapeCSV(item.expense_name),
    escapeCSV(item.project_name),
    escapeCSV(formatDate(item.expense_date)),
    escapeCSV(item.amount),
    escapeCSV(item.purpose || ''),
  ]);

  const csvContent = [
    headers.join(','),
    ...rows.map(row => row.join(',')),
  ].join('\r\n');

  const dateStr = new Date().toISOString().split('T')[0];
  downloadCSV(csvContent, `${filenamePrefix}_${dateStr}.csv`);
}

/**
 * Export supervisor cash ledger to CSV
 */
export function exportLedgerToCSV(
  ledger: {
    date: string;
    type: string;
    description: string;
    project_name?: string;
    amount_in: number;
    amount_out: number;
    running_balance: number;
  }[],
  userName: string
) {
  const headers = [
    'Date',
    'Transaction Type',
    'Description',
    'Project',
    'Cash In / Handover (+)',
    'Cash Out / Expense (-)',
    'Running Float Balance (PKR)',
  ];

  const rows = ledger.map(item => [
    escapeCSV(formatDate(item.date)),
    escapeCSV(item.type.toUpperCase()),
    escapeCSV(item.description),
    escapeCSV(item.project_name || ''),
    escapeCSV(item.amount_in > 0 ? item.amount_in : ''),
    escapeCSV(item.amount_out > 0 ? item.amount_out : ''),
    escapeCSV(item.running_balance),
  ]);

  const csvContent = [
    headers.join(','),
    ...rows.map(row => row.join(',')),
  ].join('\r\n');

  const dateStr = new Date().toISOString().split('T')[0];
  const safeName = userName.toLowerCase().replace(/[^a-z0-9]/g, '_');
  downloadCSV(csvContent, `cash_ledger_${safeName}_${dateStr}.csv`);
}
