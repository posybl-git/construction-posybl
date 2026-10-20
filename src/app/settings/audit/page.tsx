'use client';

import { useState, useEffect } from 'react';
import { createClient } from '@/lib/supabase/client';
import { formatDate } from '@/lib/format';
import Link from 'next/link';
import type { AuditLogEntry } from '@/types/database';

export default function AuditLogViewerPage() {
  const [logs, setLogs] = useState<AuditLogEntry[]>([]);
  const [tableFilter, setTableFilter] = useState('');
  const [actionFilter, setActionFilter] = useState('');
  const [selectedEntry, setSelectedEntry] = useState<AuditLogEntry | null>(null);
  const [loading, setLoading] = useState(true);

  const supabase = createClient();

  useEffect(() => {
    loadAuditLogs();
  }, []);

  async function loadAuditLogs() {
    setLoading(true);

    const { data: logData } = await supabase
      .from('audit_log')
      .select('*')
      .order('changed_at', { ascending: false })
      .limit(100);

    const { data: profiles } = await supabase.from('profiles').select('id, full_name');
    const pMap = new Map((profiles || []).map(p => [p.id, p.full_name]));

    const enriched: AuditLogEntry[] = (logData || []).map(l => ({
      ...l,
      profiles: l.changed_by ? { full_name: pMap.get(l.changed_by) || 'User' } : null,
    }));

    setLogs(enriched);
    setLoading(false);
  }

  const filteredLogs = logs.filter(l => {
    if (tableFilter && l.table_name !== tableFilter) return false;
    if (actionFilter && l.action !== actionFilter) return false;
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
          <h1 className="page-title">📜 Append-Only Audit Log Viewer</h1>
          <p className="text-muted" style={{ fontSize: '0.875rem' }}>
            Complete, tamper-proof history of every create, edit and delete action
          </p>
        </div>
      </div>

      {/* Filter Bar */}
      <div
        className="card"
        style={{
          padding: '0.875rem 1rem',
          marginBottom: '1rem',
          background: 'var(--color-card-bg)',
          display: 'flex',
          alignItems: 'center',
          gap: '0.75rem',
          flexWrap: 'wrap',
        }}
      >
        <select
          className="select"
          value={tableFilter}
          onChange={(e) => setTableFilter(e.target.value)}
          style={{ fontSize: '0.8125rem', padding: '0.35rem 0.6rem', height: '34px' }}
        >
          <option value="">All Tables</option>
          <option value="projects">projects</option>
          <option value="expenses">expenses</option>
          <option value="client_payments">client_payments</option>
          <option value="payment_milestones">payment_milestones</option>
          <option value="cash_issuances">cash_issuances</option>
          <option value="vendors">vendors</option>
          <option value="project_assignments">project_assignments</option>
        </select>

        <select
          className="select"
          value={actionFilter}
          onChange={(e) => setActionFilter(e.target.value)}
          style={{ fontSize: '0.8125rem', padding: '0.35rem 0.6rem', height: '34px' }}
        >
          <option value="">All Actions</option>
          <option value="INSERT">INSERT</option>
          <option value="UPDATE">UPDATE</option>
          <option value="DELETE">DELETE</option>
        </select>

        {(tableFilter || actionFilter) && (
          <button
            type="button"
            className="btn btn-ghost btn-sm"
            onClick={() => { setTableFilter(''); setActionFilter(''); }}
          >
            Clear Filters
          </button>
        )}
      </div>

      {/* Logs Table */}
      {loading ? (
        <div className="loading-screen">
          <div className="spinner spinner-lg" />
          <span className="text-muted">Loading audit entries...</span>
        </div>
      ) : filteredLogs.length === 0 ? (
        <div className="empty-state">
          <div className="empty-state__icon">📜</div>
          <div className="empty-state__title">No audit records found</div>
        </div>
      ) : (
        <div className="card" style={{ padding: 0, overflow: 'hidden' }}>
          <div className="table-container" style={{ border: 'none', borderRadius: 0 }}>
            <table className="table">
              <thead>
                <tr>
                  <th style={{ width: '36px', color: 'var(--color-muted)', fontWeight: 500 }}>#</th>
                  <th>Timestamp</th>
                  <th>Table</th>
                  <th>Action</th>
                  <th>Changed By</th>
                  <th>Record ID</th>
                  <th style={{ textAlign: 'right' }}>Inspect</th>
                </tr>
              </thead>
              <tbody>
                {filteredLogs.map((log, idx) => (
                  <tr key={log.id}>
                    <td style={{ color: 'var(--color-muted)', fontSize: '0.75rem', fontWeight: 500, whiteSpace: 'nowrap' }}>#{idx + 1}</td>
                    <td style={{ fontSize: '0.8125rem', whiteSpace: 'nowrap', fontWeight: 500 }}>
                      {formatDate(log.changed_at)}
                    </td>
                    <td>
                      <span style={{ fontFamily: 'var(--font-mono)', fontWeight: 600, fontSize: '0.8125rem', color: 'var(--color-navy)' }}>
                        {log.table_name}
                      </span>
                    </td>
                    <td>
                      <span className={`badge ${log.action === 'INSERT' ? 'badge-success' : log.action === 'UPDATE' ? 'badge-info' : 'badge-danger'}`}>
                        {log.action}
                      </span>
                    </td>
                    <td>
                      <span style={{ fontSize: '0.8125rem' }}>{log.profiles?.full_name || 'System'}</span>
                    </td>
                    <td>
                      <span style={{ fontFamily: 'var(--font-mono)', fontSize: '0.75rem', color: 'var(--color-secondary-text)' }}>
                        {log.record_id.slice(0, 8)}...
                      </span>
                    </td>
                    <td style={{ textAlign: 'right' }}>
                      <button
                        type="button"
                        className="btn btn-secondary btn-sm"
                        onClick={() => setSelectedEntry(log)}
                      >
                        🔍 JSON
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* MODAL: JSON INSPECTION */}
      {selectedEntry && (
        <div className="modal-backdrop">
          <div className="modal" style={{ maxWidth: '640px' }}>
            <div className="modal-header">
              <h2 className="modal-title">
                🔍 Audit Record: {selectedEntry.table_name} ({selectedEntry.action})
              </h2>
              <button type="button" className="btn btn-ghost btn-sm" onClick={() => setSelectedEntry(null)}>✕</button>
            </div>

            <div style={{ marginBottom: '1rem', fontSize: '0.8125rem' }}>
              <div><strong>Record ID:</strong> <code>{selectedEntry.record_id}</code></div>
              <div><strong>Changed At:</strong> {formatDate(selectedEntry.changed_at)}</div>
              <div><strong>Actor:</strong> {selectedEntry.profiles?.full_name || 'System'}</div>
            </div>

            {selectedEntry.old_row && (
              <div style={{ marginBottom: '1rem' }}>
                <div style={{ fontWeight: 700, fontSize: '0.75rem', color: 'var(--color-red)', marginBottom: '0.25rem' }}>
                  BEFORE (OLD ROW):
                </div>
                <pre style={{ background: '#FFF5F5', padding: '0.75rem', borderRadius: 'var(--radius-md)', fontSize: '0.75rem', overflowX: 'auto', maxHeight: '160px' }}>
                  {JSON.stringify(selectedEntry.old_row, null, 2)}
                </pre>
              </div>
            )}

            {selectedEntry.new_row && (
              <div>
                <div style={{ fontWeight: 700, fontSize: '0.75rem', color: 'var(--color-green)', marginBottom: '0.25rem' }}>
                  AFTER (NEW ROW):
                </div>
                <pre style={{ background: '#F0FDF4', padding: '0.75rem', borderRadius: 'var(--radius-md)', fontSize: '0.75rem', overflowX: 'auto', maxHeight: '160px' }}>
                  {JSON.stringify(selectedEntry.new_row, null, 2)}
                </pre>
              </div>
            )}

            <div className="flex justify-end" style={{ marginTop: '1.25rem' }}>
              <button type="button" className="btn btn-secondary" onClick={() => setSelectedEntry(null)}>
                Close
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
