'use client';

import { useState, useEffect } from 'react';
import { createClient } from '@/lib/supabase/client';
import { formatPKR, formatDate } from '@/lib/format';
import Link from 'next/link';
import type { Expense, ClientPayment, Project, PaymentMilestone, CashIssuance } from '@/types/database';

interface TrashItem {
  id: string;
  type: 'expense' | 'payment' | 'project' | 'milestone' | 'issuance';
  title: string;
  project_id?: string | null;
  project_name?: string;
  amount?: number;
  date?: string;
  deleted_at: string;
  deleted_by?: string;
  deleted_by_name?: string;
}

export default function TrashRestorePage() {
  const [trashItems, setTrashItems] = useState<TrashItem[]>([]);
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const [typeFilter, setTypeFilter] = useState<string>('all');
  const [searchQuery, setSearchQuery] = useState('');
  const [loading, setLoading] = useState(true);
  const [restoring, setRestoring] = useState(false);

  const supabase = createClient();

  useEffect(() => {
    loadTrash(true);
  }, []);

  async function loadTrash(showSpinner = true) {
    if (showSpinner) {
      setLoading(true);
    }

    // 1. Fetch profiles for user names
    const { data: profiles } = await supabase.from('profiles').select('id, full_name');
    const profileMap = new Map((profiles || []).map(p => [p.id, p.full_name]));

    // 2. Fetch projects (including deleted ones)
    const { data: allProjects } = await supabase.from('projects').select('id, name');
    const projectMap = new Map((allProjects || []).map(p => [p.id, p.name]));

    const items: TrashItem[] = [];

    // Deleted Expenses
    const { data: delExpenses } = await supabase
      .from('expenses')
      .select('*')
      .not('deleted_at', 'is', null)
      .order('deleted_at', { ascending: false });

    (delExpenses || []).forEach(e => {
      items.push({
        id: e.id,
        type: 'expense',
        title: e.expense_name,
        project_id: e.project_id,
        project_name: projectMap.get(e.project_id) || 'Unknown Project',
        amount: Number(e.amount),
        date: e.expense_date,
        deleted_at: e.deleted_at,
        deleted_by: e.deleted_by,
        deleted_by_name: profileMap.get(e.deleted_by || '') || 'Admin',
      });
    });

    // Deleted Payments
    const { data: delPayments } = await supabase
      .from('client_payments')
      .select('*')
      .not('deleted_at', 'is', null)
      .order('deleted_at', { ascending: false });

    (delPayments || []).forEach(p => {
      items.push({
        id: p.id,
        type: 'payment',
        title: `Payment: ${p.method} (${p.reference_no || 'No ref'})`,
        project_id: p.project_id,
        project_name: projectMap.get(p.project_id) || 'Unknown Project',
        amount: Number(p.amount),
        date: p.payment_date,
        deleted_at: p.deleted_at,
        deleted_by: p.deleted_by,
        deleted_by_name: profileMap.get(p.deleted_by || '') || 'Admin',
      });
    });

    // Deleted Projects
    const { data: delProjects } = await supabase
      .from('projects')
      .select('*')
      .not('deleted_at', 'is', null)
      .order('deleted_at', { ascending: false });

    (delProjects || []).forEach(proj => {
      items.push({
        id: proj.id,
        type: 'project',
        title: proj.name,
        amount: Number(proj.contract_value),
        date: proj.created_at,
        deleted_at: proj.deleted_at,
        deleted_by: proj.deleted_by,
        deleted_by_name: profileMap.get(proj.deleted_by || '') || 'Admin',
      });
    });

    // Deleted Milestones
    const { data: delMilestones } = await supabase
      .from('payment_milestones')
      .select('*')
      .not('deleted_at', 'is', null)
      .order('deleted_at', { ascending: false });

    (delMilestones || []).forEach(m => {
      items.push({
        id: m.id,
        type: 'milestone',
        title: `Milestone: ${m.name}`,
        project_id: m.project_id,
        project_name: projectMap.get(m.project_id) || 'Unknown Project',
        amount: Number(m.planned_amount),
        date: m.planned_date,
        deleted_at: m.deleted_at,
        deleted_by: m.deleted_by,
        deleted_by_name: profileMap.get(m.deleted_by || '') || 'Admin',
      });
    });

    // Deleted Issuances
    const { data: delIssuances } = await supabase
      .from('cash_issuances')
      .select('*')
      .not('deleted_at', 'is', null)
      .order('deleted_at', { ascending: false });

    (delIssuances || []).forEach(iss => {
      items.push({
        id: iss.id,
        type: 'issuance',
        title: iss.is_adjustment
          ? `Cash Adjustment: ${iss.note || 'Correction'}`
          : Number(iss.amount) < 0
          ? `Cash Return: ${iss.note || 'Returned'}`
          : `Cash Issuance: ${iss.note || 'Handed over'}`,
        project_id: iss.project_id,
        project_name: projectMap.get(iss.project_id || '') || 'General Float',
        amount: Math.abs(Number(iss.amount)),
        date: iss.issue_date,
        deleted_at: iss.deleted_at,
        deleted_by: iss.deleted_by,
        deleted_by_name: profileMap.get(iss.deleted_by || '') || 'Admin',
      });
    });

    // Sort all deleted items by deleted_at descending
    items.sort((a, b) => new Date(b.deleted_at).getTime() - new Date(a.deleted_at).getTime());

    setTrashItems(items);
    setLoading(false);
  }

  async function handleRestoreSingle(item: TrashItem) {
    setRestoring(true);
    const prevScrollY = window.scrollY;
    const tableMap: Record<string, string> = {
      expense: 'expenses',
      payment: 'client_payments',
      project: 'projects',
      milestone: 'payment_milestones',
      issuance: 'cash_issuances',
    };

    const table = tableMap[item.type];
    if (table) {
      await supabase
        .from(table)
        .update({ deleted_at: null, deleted_by: null })
        .eq('id', item.id);

      // If restoring a project, also restore cascaded items
      if (item.type === 'project') {
        await supabase.from('expenses').update({ deleted_at: null, deleted_by: null }).eq('project_id', item.id);
        await supabase.from('client_payments').update({ deleted_at: null, deleted_by: null }).eq('project_id', item.id);
        await supabase.from('payment_milestones').update({ deleted_at: null, deleted_by: null }).eq('project_id', item.id);
        await supabase.from('cash_issuances').update({ deleted_at: null, deleted_by: null }).eq('project_id', item.id);
      }
    }

    setRestoring(false);
    await loadTrash(false);
    setTimeout(() => {
      window.scrollTo({ top: prevScrollY, behavior: 'instant' });
    }, 50);
  }

  async function handleBulkRestore() {
    if (selectedIds.length === 0) return;
    setRestoring(true);
    const prevScrollY = window.scrollY;

    const itemsToRestore = trashItems.filter(i => selectedIds.includes(i.id));

    const tableMap: Record<string, string> = {
      expense: 'expenses',
      payment: 'client_payments',
      project: 'projects',
      milestone: 'payment_milestones',
      issuance: 'cash_issuances',
    };

    for (const item of itemsToRestore) {
      const table = tableMap[item.type];
      if (table) {
        await supabase
          .from(table)
          .update({ deleted_at: null, deleted_by: null })
          .eq('id', item.id);

        if (item.type === 'project') {
          await supabase.from('expenses').update({ deleted_at: null, deleted_by: null }).eq('project_id', item.id);
          await supabase.from('client_payments').update({ deleted_at: null, deleted_by: null }).eq('project_id', item.id);
          await supabase.from('payment_milestones').update({ deleted_at: null, deleted_by: null }).eq('project_id', item.id);
          await supabase.from('cash_issuances').update({ deleted_at: null, deleted_by: null }).eq('project_id', item.id);
        }
      }
    }

    setSelectedIds([]);
    setRestoring(false);
    await loadTrash(false);
    setTimeout(() => {
      window.scrollTo({ top: prevScrollY, behavior: 'instant' });
    }, 50);
  }

  // Filter items
  const filteredItems = trashItems.filter(item => {
    if (typeFilter !== 'all' && item.type !== typeFilter) return false;
    if (searchQuery) {
      const q = searchQuery.toLowerCase();
      const match = item.title.toLowerCase().includes(q) ||
        (item.project_name && item.project_name.toLowerCase().includes(q)) ||
        (item.deleted_by_name && item.deleted_by_name.toLowerCase().includes(q));
      if (!match) return false;
    }
    return true;
  });

  return (
    <div className="page-container">
      <div className="flex justify-between items-center" style={{ marginBottom: '1rem' }}>
        <Link href="/settings" className="btn btn-ghost btn-sm" style={{ paddingLeft: 0 }}>
          ← Back to Settings
        </Link>
      </div>

      <div className="page-header">
        <div>
          <h1 className="page-title">🗑️ Trash & Data Restore</h1>
          <p className="text-muted" style={{ fontSize: '0.875rem' }}>
            View and restore soft-deleted expenses, payments, milestones and projects
          </p>
        </div>

        {selectedIds.length > 0 && (
          <button
            type="button"
            className="btn btn-primary"
            onClick={handleBulkRestore}
            disabled={restoring}
          >
            🔄 Restore Selected ({selectedIds.length})
          </button>
        )}
      </div>

      {/* Filter and Search Bar */}
      <div
        className="card"
        style={{
          padding: '0.875rem 1rem',
          marginBottom: '1rem',
          background: 'var(--color-card-bg)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          flexWrap: 'wrap',
          gap: '0.75rem',
        }}
      >
        <div className="flex items-center gap-xs flex-wrap">
          <input
            type="text"
            className="input"
            placeholder="Search deleted records..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            style={{ fontSize: '0.8125rem', padding: '0.35rem 0.6rem', height: '34px', width: '220px' }}
          />

          <select
            className="select"
            value={typeFilter}
            onChange={(e) => setTypeFilter(e.target.value)}
            style={{ fontSize: '0.8125rem', padding: '0.35rem 0.6rem', height: '34px' }}
          >
            <option value="all">All Types ({trashItems.length})</option>
            <option value="expense">Expenses ({trashItems.filter(i => i.type === 'expense').length})</option>
            <option value="payment">Payments ({trashItems.filter(i => i.type === 'payment').length})</option>
            <option value="project">Projects ({trashItems.filter(i => i.type === 'project').length})</option>
            <option value="milestone">Milestones ({trashItems.filter(i => i.type === 'milestone').length})</option>
            <option value="issuance">Cash Issuances / Float ({trashItems.filter(i => i.type === 'issuance').length})</option>
          </select>
        </div>

        <span className="text-muted" style={{ fontSize: '0.78125rem' }}>
          {filteredItems.length} records in Trash
        </span>
      </div>

      {/* Trash Table */}
      {loading ? (
        <div className="loading-screen">
          <div className="spinner spinner-lg" />
          <span className="text-muted">Loading trash records...</span>
        </div>
      ) : filteredItems.length === 0 ? (
        <div className="empty-state">
          <div className="empty-state__icon">✨</div>
          <div className="empty-state__title">Trash is empty</div>
          <div className="empty-state__desc">
            No soft-deleted records match the current filter.
          </div>
        </div>
      ) : (
        <div className="card" style={{ padding: 0, overflow: 'hidden' }}>
          <div className="table-container" style={{ border: 'none', borderRadius: 0 }}>
            <table className="table">
              <thead>
                <tr>
                  <th style={{ width: '36px' }}>
                    <input
                      type="checkbox"
                      checked={selectedIds.length === filteredItems.length && filteredItems.length > 0}
                      onChange={(e) => {
                        if (e.target.checked) {
                          setSelectedIds(filteredItems.map(i => i.id));
                        } else {
                          setSelectedIds([]);
                        }
                      }}
                    />
                  </th>
                  <th style={{ width: '36px', color: 'var(--color-muted)', fontWeight: 500 }}>#</th>
                  <th>Item / Record</th>
                  <th>Type</th>
                  <th>Project</th>
                  <th style={{ textAlign: 'right' }}>Amount</th>
                  <th>Deleted When & By</th>
                  <th style={{ textAlign: 'right' }}>Action</th>
                </tr>
              </thead>
              <tbody>
                {filteredItems.map((item, idx) => {
                  const isChecked = selectedIds.includes(item.id);
                  return (
                    <tr key={item.id} id={`row-${item.id}`}>
                      <td>
                        <input
                          type="checkbox"
                          checked={isChecked}
                          onChange={(e) => {
                            if (e.target.checked) {
                              setSelectedIds([...selectedIds, item.id]);
                            } else {
                              setSelectedIds(selectedIds.filter(id => id !== item.id));
                            }
                          }}
                        />
                      </td>
                      <td style={{ color: 'var(--color-muted)', fontSize: '0.75rem', fontWeight: 500, whiteSpace: 'nowrap' }}>#{idx + 1}</td>
                      <td>
                        <div style={{ fontWeight: 600, color: 'var(--color-navy)' }}>
                          {item.title}
                        </div>
                        {item.date && (
                          <div className="text-muted" style={{ fontSize: '0.75rem' }}>
                            Orig. date: {formatDate(item.date)}
                          </div>
                        )}
                      </td>
                      <td>
                        <span className="badge badge-neutral" style={{ textTransform: 'uppercase', fontSize: '0.6875rem' }}>
                          {item.type}
                        </span>
                      </td>
                      <td>
                        <span style={{ fontSize: '0.8125rem' }}>{item.project_name || '-'}</span>
                      </td>
                      <td style={{ textAlign: 'right' }}>
                        {item.amount != null ? (
                          <span className="text-money">{formatPKR(item.amount)}</span>
                        ) : '-'}
                      </td>
                      <td>
                        <div style={{ fontSize: '0.8125rem', fontWeight: 500 }}>
                          {formatDate(item.deleted_at)}
                        </div>
                        <div className="text-muted" style={{ fontSize: '0.71875rem' }}>
                          By: {item.deleted_by_name}
                        </div>
                      </td>
                      <td style={{ textAlign: 'right' }}>
                        <button
                          type="button"
                          className="btn btn-secondary btn-sm"
                          onClick={() => handleRestoreSingle(item)}
                          disabled={restoring}
                        >
                          🔄 Restore
                        </button>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
}
