'use client';

import { useState, useEffect } from 'react';
import { createClient } from '@/lib/supabase/client';
import { formatPKR } from '@/lib/format';
import Link from 'next/link';
import type { Vendor } from '@/types/database';

interface VendorWithStats extends Vendor {
  expense_count: number;
  total_spend: number;
  unpaid_spend: number;
}

export default function VendorsManagementPage() {
  const [vendors, setVendors] = useState<VendorWithStats[]>([]);
  const [loading, setLoading] = useState(true);

  // Merge modal
  const [showMergeModal, setShowMergeModal] = useState(false);
  const [sourceVendor, setSourceVendor] = useState<VendorWithStats | null>(null);
  const [targetVendorId, setTargetVendorId] = useState('');
  const [saving, setSaving] = useState(false);

  const supabase = createClient();

  useEffect(() => {
    loadVendors(true);
  }, []);

  async function loadVendors(showSpinner = true) {
    if (showSpinner) {
      setLoading(true);
    }

    const { data: vendorData } = await supabase
      .from('vendors')
      .select('*')
      .is('deleted_at', null)
      .order('name', { ascending: true });

    const { data: expenses } = await supabase
      .from('expenses')
      .select('vendor_id, amount, payment_status')
      .is('deleted_at', null);

    const expList = expenses || [];
    const enriched: VendorWithStats[] = (vendorData || []).map(v => {
      const vExp = expList.filter(e => e.vendor_id === v.id);
      const total = vExp.reduce((s, e) => s + Number(e.amount), 0);
      const unpaid = vExp.filter(e => e.payment_status === 'unpaid').reduce((s, e) => s + Number(e.amount), 0);

      return {
        ...v,
        expense_count: vExp.length,
        total_spend: total,
        unpaid_spend: unpaid,
      };
    });

    setVendors(enriched);
    setLoading(false);
  }

  async function handleMergeVendors(e: React.FormEvent) {
    e.preventDefault();
    if (!sourceVendor || !targetVendorId) return;
    setSaving(true);
    const prevScrollY = window.scrollY;

    // 1. Point all expenses to target vendor
    await supabase
      .from('expenses')
      .update({ vendor_id: targetVendorId })
      .eq('vendor_id', sourceVendor.id);

    // 2. Soft delete source vendor
    const { data: { user } } = await supabase.auth.getUser();
    await supabase
      .from('vendors')
      .update({
        deleted_at: new Date().toISOString(),
        deleted_by: user?.id,
      })
      .eq('id', sourceVendor.id);

    setShowMergeModal(false);
    setSourceVendor(null);
    setTargetVendorId('');
    setSaving(false);
    await loadVendors(false);
    setTimeout(() => {
      window.scrollTo({ top: prevScrollY, behavior: 'instant' });
    }, 50);
  }

  return (
    <div className="page-container">
      <div className="flex justify-between items-center" style={{ marginBottom: '1rem' }}>
        <Link href="/settings" className="btn btn-ghost btn-sm" style={{ paddingLeft: 0 }}>
          ← Back to Settings
        </Link>
      </div>

      <div className="page-header">
        <div>
          <h1 className="page-title">🏪 Vendor & Payee Management</h1>
          <p className="text-muted" style={{ fontSize: '0.875rem' }}>
            View, deduplicate and merge payee names across all expenses
          </p>
        </div>
      </div>

      {loading ? (
        <div className="loading-screen">
          <div className="spinner spinner-lg" />
          <span className="text-muted">Loading vendor ledger...</span>
        </div>
      ) : vendors.length === 0 ? (
        <div className="empty-state">
          <div className="empty-state__icon">🏪</div>
          <div className="empty-state__title">No vendors recorded yet</div>
          <div className="empty-state__desc">
            Vendors and payees are automatically created as you record expenses.
          </div>
        </div>
      ) : (
        <div className="card" style={{ padding: 0, overflow: 'hidden' }}>
          <div className="table-container" style={{ border: 'none', borderRadius: 0 }}>
            <table className="table">
              <thead>
                <tr>
                  <th style={{ width: '36px', color: 'var(--color-muted)', fontWeight: 500 }}>#</th>
                  <th>Vendor / Payee Name</th>
                  <th>Phone / Notes</th>
                  <th>Total Invoiced</th>
                  <th>Still Owed (Unpaid)</th>
                  <th>Bills Count</th>
                  <th style={{ textAlign: 'right' }}>Actions</th>
                </tr>
              </thead>
              <tbody>
                {vendors.map((v, idx) => (
                  <tr key={v.id} id={`row-${v.id}`}>
                    <td style={{ color: 'var(--color-muted)', fontSize: '0.75rem', fontWeight: 500, whiteSpace: 'nowrap' }}>#{idx + 1}</td>
                    <td style={{ fontWeight: 600, color: 'var(--color-navy)' }}>
                      {v.name}
                    </td>
                    <td style={{ fontSize: '0.8125rem', color: 'var(--color-secondary-text)' }}>
                      {v.phone || v.notes || '-'}
                    </td>
                    <td>
                      <span className="text-money">{formatPKR(v.total_spend)}</span>
                    </td>
                    <td>
                      {v.unpaid_spend > 0 ? (
                        <span className="text-money text-danger" style={{ fontWeight: 700 }}>
                          {formatPKR(v.unpaid_spend)}
                        </span>
                      ) : (
                        <span className="text-success" style={{ fontSize: '0.8125rem' }}>Settled</span>
                      )}
                    </td>
                    <td>
                      <span style={{ fontSize: '0.8125rem' }}>{v.expense_count} bills</span>
                    </td>
                    <td style={{ textAlign: 'right' }}>
                      <button
                        type="button"
                        className="btn btn-secondary btn-sm"
                        onClick={() => {
                          setSourceVendor(v);
                          setShowMergeModal(true);
                        }}
                      >
                        🔀 Merge Duplicates
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* MODAL: MERGE VENDOR */}
      {showMergeModal && sourceVendor && (
        <div className="modal-backdrop">
          <div className="modal">
            <div className="modal-header">
              <h2 className="modal-title">🔀 Merge Vendor &ldquo;{sourceVendor.name}&rdquo;</h2>
              <button type="button" className="btn btn-ghost btn-sm" onClick={() => setShowMergeModal(false)}>✕</button>
            </div>
            <form onSubmit={handleMergeVendors}>
              <div className="alert-banner alert-banner--warning">
                <span>⚠️</span>
                <span style={{ fontSize: '0.8125rem' }}>
                  All {sourceVendor.expense_count} expenses tagged with &ldquo;{sourceVendor.name}&rdquo; will be re-assigned to the selected target vendor.
                </span>
              </div>

              <div className="form-group">
                <label className="form-label" htmlFor="merge-v-select">Target Destination Vendor <span className="required">*</span></label>
                <select
                  id="merge-v-select"
                  className="select"
                  value={targetVendorId}
                  onChange={(e) => setTargetVendorId(e.target.value)}
                  required
                >
                  <option value="">Select target vendor...</option>
                  {vendors.filter(v => v.id !== sourceVendor.id).map(v => (
                    <option key={v.id} value={v.id}>{v.name} ({v.phone || 'No phone'})</option>
                  ))}
                </select>
              </div>

              <div className="flex justify-end gap-sm" style={{ marginTop: '1.25rem' }}>
                <button type="button" className="btn btn-secondary" onClick={() => setShowMergeModal(false)}>Cancel</button>
                <button type="submit" className="btn btn-primary" disabled={saving || !targetVendorId}>
                  {saving ? 'Merging...' : 'Confirm Vendor Merge'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
