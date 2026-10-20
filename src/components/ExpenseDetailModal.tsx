'use client';

import { useState, useEffect } from 'react';
import Link from 'next/link';
import { createClient } from '@/lib/supabase/client';
import { formatPKR, formatDate } from '@/lib/format';
import type { Expense } from '@/types/database';

interface SplitSibling {
  id: string;
  project_id: string;
  project_name: string;
  amount: number;
  serial_no?: number | null;
  is_current: boolean;
}

export interface ExpenseWithMetadata extends Expense {
  project_name?: string | null;
  created_by_name?: string | null;
}

interface ExpenseDetailModalProps {
  expense: ExpenseWithMetadata | null;
  onClose: () => void;
}

export function ExpenseDetailModal({ expense, onClose }: ExpenseDetailModalProps) {
  const [projectName, setProjectName] = useState<string>('');
  const [createdByName, setCreatedByName] = useState<string>('');
  const [splitSiblings, setSplitSiblings] = useState<SplitSibling[]>([]);
  const [loadingSplit, setLoadingSplit] = useState(false);

  // Close on Escape key
  useEffect(() => {
    function handleKeyDown(e: KeyboardEvent) {
      if (e.key === 'Escape') {
        onClose();
      }
    }
    if (expense) {
      window.addEventListener('keydown', handleKeyDown);
    }
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [expense, onClose]);

  const isSplitExpense = Boolean(
    expense &&
    (expense.purpose?.includes('Shared expense split across') ||
     expense.expense_name?.includes('(Shared:'))
  );

  useEffect(() => {
    if (!expense) {
      setSplitSiblings([]);
      setProjectName('');
      setCreatedByName('');
      return;
    }

    const supabase = createClient();

    // 1. Resolve project name if missing
    if (expense.project_name) {
      setProjectName(expense.project_name);
    } else if (expense.project_id) {
      supabase
        .from('projects')
        .select('name')
        .eq('id', expense.project_id)
        .maybeSingle()
        .then(({ data }) => {
          if (data?.name) setProjectName(data.name);
        });
    }

    // 2. Resolve creator name if missing
    if (expense.created_by_name) {
      setCreatedByName(expense.created_by_name);
    } else if (expense.created_by) {
      supabase
        .from('profiles')
        .select('full_name')
        .eq('id', expense.created_by)
        .maybeSingle()
        .then(({ data }) => {
          if (data?.full_name) setCreatedByName(data.full_name);
        });
    }

    // 3. If split expense, fetch sibling rows across all sites
    if (isSplitExpense) {
      setLoadingSplit(true);
      supabase
        .from('expenses')
        .select('id, project_id, amount, serial_no, expense_name, expense_date, projects(name)')
        .eq('expense_name', expense.expense_name)
        .eq('expense_date', expense.expense_date)
        .is('deleted_at', null)
        .order('created_at', { ascending: true })
        .then(({ data, error }) => {
          setLoadingSplit(false);
          if (error || !data) return;

          const siblings: SplitSibling[] = data.map((row: any) => ({
            id: row.id,
            project_id: row.project_id,
            project_name: row.projects?.name || 'Site',
            amount: Number(row.amount),
            serial_no: row.serial_no,
            is_current: row.id === expense.id,
          }));
          setSplitSiblings(siblings);
        });
    } else {
      setSplitSiblings([]);
    }
  }, [expense, isSplitExpense]);

  if (!expense) return null;

  const totalSplitAmount = splitSiblings.reduce((sum, s) => sum + s.amount, 0);

  return (
    <div
      className="modal-backdrop"
      onClick={onClose}
      style={{ zIndex: 100, backdropFilter: 'blur(4px)' }}
    >
      <div
        className="modal"
        onClick={(e) => e.stopPropagation()}
        style={{
          maxWidth: '640px',
          width: '100%',
          padding: '1.5rem',
          borderRadius: 'var(--radius-xl)',
          background: 'var(--color-white)',
          boxShadow: '0 20px 40px rgba(23, 35, 63, 0.2)',
          border: '1px solid var(--color-line)',
        }}
      >
        {/* Header */}
        <div
          className="modal-header"
          style={{
            display: 'flex',
            alignItems: 'flex-start',
            justifyContent: 'space-between',
            gap: '1rem',
            marginBottom: '1rem',
            paddingBottom: '0.875rem',
            borderBottom: '1px solid var(--color-line)',
          }}
        >
          <div>
            <div className="flex items-center gap-xs" style={{ marginBottom: '0.25rem' }}>
              <span
                style={{
                  fontSize: '0.75rem',
                  fontWeight: 700,
                  fontFamily: 'var(--font-mono)',
                  color: 'var(--color-primary-blue)',
                  background: 'rgba(27, 117, 188, 0.1)',
                  padding: '0.15rem 0.5rem',
                  borderRadius: 'var(--radius-sm)',
                }}
              >
                #{expense.serial_no ?? '-'}
              </span>
              <span className="text-muted" style={{ fontSize: '0.75rem' }}>
                {formatDate(expense.expense_date)}
              </span>
              {isSplitExpense && (
                <span
                  style={{
                    fontSize: '0.6875rem',
                    fontWeight: 700,
                    background: '#EDE9FE',
                    color: '#6D28D9',
                    padding: '0.15rem 0.5rem',
                    borderRadius: 'var(--radius-sm)',
                  }}
                >
                  🔗 Shared Split
                </span>
              )}
            </div>
            <h2
              className="modal-title"
              style={{
                fontSize: '1.1875rem',
                fontWeight: 700,
                color: 'var(--color-navy)',
                lineHeight: 1.3,
                margin: 0,
              }}
            >
              {expense.expense_name}
            </h2>
          </div>

          <button
            type="button"
            className="btn btn-ghost btn-sm"
            onClick={onClose}
            aria-label="Close dialog"
            style={{
              fontSize: '1.125rem',
              width: '32px',
              height: '32px',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              borderRadius: 'var(--radius-full)',
              color: 'var(--color-secondary-text)',
              flexShrink: 0,
            }}
          >
            ✕
          </button>
        </div>

        {/* Hero Amount & Primary Badges */}
        <div
          style={{
            background: 'var(--color-card-bg)',
            borderRadius: 'var(--radius-lg)',
            padding: '1rem 1.25rem',
            marginBottom: '1.25rem',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            flexWrap: 'wrap',
            gap: '0.75rem',
            border: '1px solid var(--color-line)',
          }}
        >
          <div>
            <span className="text-muted" style={{ fontSize: '0.71875rem', fontWeight: 600, textTransform: 'uppercase' }}>
              Amount
            </span>
            <div
              className="text-money"
              style={{
                fontSize: '1.625rem',
                fontWeight: 800,
                color: 'var(--color-navy)',
                lineHeight: 1.1,
              }}
            >
              {formatPKR(expense.amount)}
            </div>
          </div>

          <div className="flex items-center gap-xs flex-wrap">

            <span
              className={`badge ${expense.paid_via === 'site_float' ? 'badge-info' : 'badge-neutral'}`}
              style={{ fontSize: '0.71875rem', padding: '0.25rem 0.5rem' }}
            >
              {expense.paid_via === 'site_float' ? 'Site Float' : 'Direct'}
            </span>
            <span
              className={`badge ${expense.payment_status === 'paid' ? 'badge-success' : 'badge-danger'}`}
              style={{ fontSize: '0.71875rem', padding: '0.25rem 0.5rem' }}
            >
              {expense.payment_status === 'paid' ? 'Paid' : 'Unpaid'}
            </span>
          </div>
        </div>

        {/* Grid Details */}
        <div
          style={{
            display: 'grid',
            gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))',
            gap: '0.875rem',
            marginBottom: '1.25rem',
          }}
        >
          {/* Site / Project */}
          <div
            style={{
              padding: '0.75rem',
              borderRadius: 'var(--radius-md)',
              background: 'var(--bg-secondary)',
              border: '1px solid var(--color-line)',
            }}
          >
            <div className="text-muted" style={{ fontSize: '0.6875rem', fontWeight: 600, textTransform: 'uppercase' }}>
              🏗️ Site / Project
            </div>
            <div style={{ fontSize: '0.875rem', fontWeight: 600, color: 'var(--color-navy)', marginTop: '0.2rem' }}>
              {expense.project_id ? (
                <Link
                  href={`/projects/${expense.project_id}`}
                  style={{ color: 'var(--color-primary-blue)', textDecoration: 'none' }}
                  onClick={onClose}
                >
                  {projectName || 'View Project'} →
                </Link>
              ) : (
                projectName || '-'
              )}
            </div>
          </div>

          {/* Payee / Vendor */}
          <div
            style={{
              padding: '0.75rem',
              borderRadius: 'var(--radius-md)',
              background: 'var(--bg-secondary)',
              border: '1px solid var(--color-line)',
            }}
          >
            <div className="text-muted" style={{ fontSize: '0.6875rem', fontWeight: 600, textTransform: 'uppercase' }}>
              🏪 Payee / Vendor
            </div>
            <div style={{ fontSize: '0.875rem', fontWeight: 600, color: 'var(--color-navy)', marginTop: '0.2rem' }}>
              {expense.vendor_name || '-'}
            </div>
          </div>

          {/* Reference No */}
          <div
            style={{
              padding: '0.75rem',
              borderRadius: 'var(--radius-md)',
              background: 'var(--bg-secondary)',
              border: '1px solid var(--color-line)',
            }}
          >
            <div className="text-muted" style={{ fontSize: '0.6875rem', fontWeight: 600, textTransform: 'uppercase' }}>
              🔖 Bill / Reference #
            </div>
            <div style={{ fontSize: '0.875rem', fontWeight: 600, color: 'var(--color-navy)', marginTop: '0.2rem', fontFamily: 'var(--font-mono)' }}>
              {expense.reference_no || '-'}
            </div>
          </div>



          {/* Payment Method & Funds */}
          <div
            style={{
              padding: '0.75rem',
              borderRadius: 'var(--radius-md)',
              background: 'var(--bg-secondary)',
              border: '1px solid var(--color-line)',
            }}
          >
            <div className="text-muted" style={{ fontSize: '0.6875rem', fontWeight: 600, textTransform: 'uppercase' }}>
              💳 Payment Details
            </div>
            <div style={{ fontSize: '0.8125rem', color: 'var(--color-body-text)', marginTop: '0.2rem' }}>
              <span style={{ fontWeight: 600, textTransform: 'capitalize' }}>{expense.paid_method || 'Cash'}</span>
              <span className="text-muted"> ({expense.paid_from === 'own_funds' ? 'Company Funds' : 'Client Funds'})</span>
            </div>
          </div>

          {/* Recorded By */}
          <div
            style={{
              padding: '0.75rem',
              borderRadius: 'var(--radius-md)',
              background: 'var(--bg-secondary)',
              border: '1px solid var(--color-line)',
            }}
          >
            <div className="text-muted" style={{ fontSize: '0.6875rem', fontWeight: 600, textTransform: 'uppercase' }}>
              👤 Recorded By
            </div>
            <div style={{ fontSize: '0.875rem', fontWeight: 600, color: 'var(--color-navy)', marginTop: '0.2rem' }}>
              {createdByName || 'Staff Member'}
            </div>
          </div>
        </div>

        {/* Purpose / Notes */}
        {expense.purpose && (
          <div
            style={{
              padding: '0.75rem 1rem',
              background: 'var(--color-card-bg)',
              borderRadius: 'var(--radius-md)',
              border: '1px solid var(--color-line)',
              marginBottom: '1.25rem',
            }}
          >
            <div className="text-muted" style={{ fontSize: '0.6875rem', fontWeight: 600, textTransform: 'uppercase', marginBottom: '0.25rem' }}>
              📝 Description / Purpose
            </div>
            <div style={{ fontSize: '0.84375rem', color: 'var(--color-body-text)', lineHeight: 1.4 }}>
              {expense.purpose}
            </div>
          </div>
        )}

        {/* SPLIT EXPENSE BREAKDOWN SECTION */}
        {isSplitExpense && (
          <div
            style={{
              marginTop: '1.25rem',
              padding: '1rem',
              borderRadius: 'var(--radius-lg)',
              background: 'linear-gradient(180deg, #FAF5FF 0%, #F5F3FF 100%)',
              border: '1px solid #DDD6FE',
            }}
          >
            <div className="flex items-center justify-between" style={{ marginBottom: '0.5rem' }}>
              <div className="flex items-center gap-xs">
                <span style={{ fontSize: '1rem' }}>📊</span>
                <h3 style={{ fontSize: '0.9375rem', fontWeight: 700, color: '#5B21B6', margin: 0 }}>
                  Shared Cost Distribution Breakdown
                </h3>
              </div>
              {totalSplitAmount > 0 && (
                <div style={{ textAlign: 'right' }}>
                  <span className="text-muted" style={{ fontSize: '0.6875rem' }}>TOTAL SPLIT: </span>
                  <span className="text-money" style={{ fontSize: '0.9375rem', fontWeight: 800, color: '#5B21B6' }}>
                    {formatPKR(totalSplitAmount)}
                  </span>
                </div>
              )}
            </div>

            <p style={{ fontSize: '0.78125rem', color: '#6B7280', marginBottom: '0.75rem' }}>
              This expense was divided across active sites. Below is the full distribution breakdown:
            </p>

            {loadingSplit ? (
              <div style={{ padding: '1rem', textAlign: 'center', color: '#6D28D9', fontSize: '0.8125rem' }}>
                <span className="spinner spinner-sm" style={{ marginRight: '0.5rem' }} />
                Loading distribution details...
              </div>
            ) : splitSiblings.length === 0 ? (
              <div style={{ fontSize: '0.78125rem', color: '#6B7280', fontStyle: 'italic' }}>
                Shared across multiple sites ({expense.purpose})
              </div>
            ) : (
              <div className="table-container" style={{ border: '1px solid #E9D5FF', borderRadius: 'var(--radius-md)', background: 'var(--color-white)' }}>
                <table className="table" style={{ margin: 0 }}>
                  <thead>
                    <tr style={{ background: '#F5F3FF' }}>
                      <th style={{ width: '40px', fontSize: '0.71875rem', color: '#6D28D9' }}>#</th>
                      <th style={{ fontSize: '0.71875rem', color: '#6D28D9' }}>Site Name</th>
                      <th style={{ fontSize: '0.71875rem', color: '#6D28D9', textAlign: 'right' }}>Allocated Amount</th>
                      <th style={{ fontSize: '0.71875rem', color: '#6D28D9', textAlign: 'center', width: '90px' }}>Site Status</th>
                    </tr>
                  </thead>
                  <tbody>
                    {splitSiblings.map((sib, sIdx) => (
                      <tr
                        key={sib.id}
                        style={{
                          background: sib.is_current ? '#FAF5FF' : undefined,
                          fontWeight: sib.is_current ? 600 : 400,
                        }}
                      >
                        <td style={{ fontSize: '0.75rem', color: 'var(--color-muted)', fontFamily: 'var(--font-mono)' }}>
                          #{sib.serial_no ?? sIdx + 1}
                        </td>
                        <td style={{ fontSize: '0.8125rem' }}>
                          <Link
                            href={`/projects/${sib.project_id}`}
                            style={{
                              color: sib.is_current ? '#6D28D9' : 'var(--color-navy)',
                              fontWeight: sib.is_current ? 700 : 500,
                            }}
                            onClick={onClose}
                          >
                            {sib.project_name}
                          </Link>
                          {sib.is_current && (
                            <span
                              style={{
                                marginLeft: '0.5rem',
                                fontSize: '0.65625rem',
                                background: '#7C3AED',
                                color: '#FFF',
                                padding: '0.1rem 0.4rem',
                                borderRadius: 'var(--radius-full)',
                                fontWeight: 700,
                              }}
                            >
                              Current Row
                            </span>
                          )}
                        </td>
                        <td style={{ textAlign: 'right', fontSize: '0.8125rem' }}>
                          <span className="text-money" style={{ fontWeight: 700, color: sib.is_current ? '#6D28D9' : 'var(--color-navy)' }}>
                            {formatPKR(sib.amount)}
                          </span>
                        </td>
                        <td style={{ textAlign: 'center', fontSize: '0.75rem' }}>
                          <span className="badge badge-success" style={{ fontSize: '0.65625rem' }}>
                            Included
                          </span>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                  <tfoot>
                    <tr style={{ background: '#F3E8FF', borderTop: '2px solid #DDD6FE' }}>
                      <td colSpan={2} style={{ fontWeight: 700, fontSize: '0.8125rem', color: '#5B21B6' }}>
                        Total Shared Across {splitSiblings.length} Sites
                      </td>
                      <td style={{ textAlign: 'right', fontWeight: 800, fontSize: '0.875rem', color: '#5B21B6' }}>
                        {formatPKR(totalSplitAmount)}
                      </td>
                      <td />
                    </tr>
                  </tfoot>
                </table>
              </div>
            )}
          </div>
        )}

        {/* Footer actions */}
        <div
          style={{
            marginTop: '1.5rem',
            display: 'flex',
            justifyContent: 'flex-end',
            gap: '0.5rem',
          }}
        >
          <button type="button" className="btn btn-secondary" onClick={onClose}>
            Close
          </button>
        </div>
      </div>
    </div>
  );
}
