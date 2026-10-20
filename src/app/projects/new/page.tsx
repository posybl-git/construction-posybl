'use client';

import { useState, useEffect } from 'react';
import { createClient } from '@/lib/supabase/client';
import { parsePKRInput } from '@/lib/format';
import { useRouter } from 'next/navigation';
import type { ProjectType, Profile } from '@/types/database';

export default function NewProjectPage() {
  const [name, setName] = useState('');
  const [clientName, setClientName] = useState('');
  const [clientPhone, setClientPhone] = useState('');
  const [address, setAddress] = useState('');
  const [plotSize, setPlotSize] = useState('');
  const [coveredArea, setCoveredArea] = useState('');
  const [projectType, setProjectType] = useState<ProjectType>('turnkey');
  const [supervisionPercent, setSupervisionPercent] = useState('');
  const [contractValueInput, setContractValueInput] = useState('');
  const [startDate, setStartDate] = useState('');
  const [expectedCompletion, setExpectedCompletion] = useState('');
  const [notes, setNotes] = useState('');
  const [supervisors, setSupervisors] = useState<Profile[]>([]);
  const [selectedSupervisorIds, setSelectedSupervisorIds] = useState<string[]>([]);
  const [loadingSupervisors, setLoadingSupervisors] = useState(true);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  const router = useRouter();
  const supabase = createClient();

  useEffect(() => {
    async function loadSupervisors() {
      setLoadingSupervisors(true);
      const { data } = await supabase
        .from('profiles')
        .select('*')
        .eq('role', 'site_manager')
        .eq('is_active', true)
        .order('full_name', { ascending: true });
      setSupervisors((data || []) as Profile[]);
      setLoadingSupervisors(false);
    }
    loadSupervisors();
  }, []);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError('');

    const contractValue = parsePKRInput(contractValueInput);
    if (contractValue === null && projectType !== 'cost_plus') {
      setError('Please enter a valid contract value');
      return;
    }

    setLoading(true);

    const { data: { user } } = await supabase.auth.getUser();
    if (!user) {
      setError('Not authenticated');
      setLoading(false);
      return;
    }

    const { data: insertedProject, error: insertError } = await supabase
      .from('projects')
      .insert({
        name,
        client_name: clientName || null,
        client_phone: clientPhone || null,
        address: address || null,
        plot_size: plotSize || null,
        covered_area_sqft: coveredArea ? parseFloat(coveredArea) : null,
        project_type: projectType,
        supervision_percent: projectType === 'cost_plus' && supervisionPercent
          ? parseFloat(supervisionPercent) : null,
        contract_value: contractValue || 0,
        start_date: startDate || null,
        expected_completion: expectedCompletion || null,
        status: 'active',
        notes: notes || null,
        created_by: user.id,
      })
      .select('id')
      .single();

    if (insertError) {
      setError(insertError.message);
      setLoading(false);
      return;
    }

    // Insert supervisor assignments if selected
    if (insertedProject && selectedSupervisorIds.length > 0) {
      const assignmentRows = selectedSupervisorIds.map(uid => ({
        project_id: insertedProject.id,
        user_id: uid,
        created_by: user.id,
      }));
      await supabase.from('project_assignments').insert(assignmentRows);
    }

    router.push('/projects');
  }

  return (
    <div className="page-container">
      <div className="page-header">
        <h1 className="page-title">New Project</h1>
      </div>

      <div className="card-flat" style={{ maxWidth: '640px' }}>
        <form onSubmit={handleSubmit}>
          {/* Project Name */}
          <div className="form-group">
            <label className="form-label" htmlFor="project-name">Project Name *</label>
            <input
              id="project-name"
              className="form-input"
              value={name}
              onChange={e => setName(e.target.value)}
              placeholder='e.g. "Ahmed House - Bahria Phase 8"'
              required
            />
          </div>

          {/* Client Info */}
          <div className="form-row">
            <div className="form-group">
              <label className="form-label" htmlFor="client-name">Client Name</label>
              <input
                id="client-name"
                className="form-input"
                value={clientName}
                onChange={e => setClientName(e.target.value)}
                placeholder="Client full name"
              />
            </div>
            <div className="form-group">
              <label className="form-label" htmlFor="client-phone">Client Phone</label>
              <input
                id="client-phone"
                className="form-input"
                value={clientPhone}
                onChange={e => setClientPhone(e.target.value)}
                placeholder="+92 3XX XXXXXXX"
              />
            </div>
          </div>

          {/* Location */}
          <div className="form-group">
            <label className="form-label" htmlFor="address">Site Address / Area</label>
            <input
              id="address"
              className="form-input"
              value={address}
              onChange={e => setAddress(e.target.value)}
              placeholder="Address or area name"
            />
          </div>

          <div className="form-row">
            <div className="form-group">
              <label className="form-label" htmlFor="plot-size">Plot Size (marla/kanal)</label>
              <input
                id="plot-size"
                className="form-input"
                value={plotSize}
                onChange={e => setPlotSize(e.target.value)}
                placeholder="e.g. 10 marla"
              />
            </div>
            <div className="form-group">
              <label className="form-label" htmlFor="covered-area">Covered Area (sq ft)</label>
              <input
                id="covered-area"
                className="form-input"
                type="number"
                value={coveredArea}
                onChange={e => setCoveredArea(e.target.value)}
                placeholder="e.g. 2500"
              />
            </div>
          </div>

          {/* Project Type */}
          <div className="form-group">
            <label className="form-label">Project Type *</label>
            <div className="flex gap-sm" style={{ flexWrap: 'wrap' }}>
              {(['turnkey', 'labour_only', 'cost_plus'] as ProjectType[]).map(type => (
                <button
                  key={type}
                  type="button"
                  className={`chip ${projectType === type ? 'chip--active' : ''}`}
                  onClick={() => setProjectType(type)}
                >
                  {type === 'turnkey' ? '🏠 Turnkey (Fixed Price)' :
                   type === 'labour_only' ? '👷 Labour Only' :
                   '📋 Cost Plus'}
                </button>
              ))}
            </div>
          </div>

          {/* Cost Plus supervision percent */}
          {projectType === 'cost_plus' && (
            <div className="form-group">
              <label className="form-label" htmlFor="supervision-pct">Supervision % *</label>
              <input
                id="supervision-pct"
                className="form-input"
                type="number"
                step="0.5"
                value={supervisionPercent}
                onChange={e => setSupervisionPercent(e.target.value)}
                placeholder="e.g. 15"
                required
              />
              <span className="form-hint">The percentage charged on top of actual costs</span>
            </div>
          )}

          {/* Contract Value */}
          {projectType !== 'cost_plus' && (
            <div className="form-group">
              <label className="form-label" htmlFor="contract-value">Contract Value (PKR) *</label>
              <input
                id="contract-value"
                className="form-input form-input-lg"
                value={contractValueInput}
                onChange={e => setContractValueInput(e.target.value)}
                placeholder='e.g. "1.2 crore" or "13 lakh" or "1200000"'
                required
              />
              <span className="form-hint">
                Accepts: 13 lakh, 13l, 1.2 crore, 1200000
                {contractValueInput && parsePKRInput(contractValueInput) !== null && (
                  <> → <strong>Rs {parsePKRInput(contractValueInput)?.toLocaleString('en-IN')}</strong></>
                )}
              </span>
            </div>
          )}

          {/* Dates */}
          <div className="form-row">
            <div className="form-group">
              <label className="form-label" htmlFor="start-date">Start Date</label>
              <input
                id="start-date"
                className="form-input"
                type="date"
                value={startDate}
                onChange={e => setStartDate(e.target.value)}
              />
            </div>
            <div className="form-group">
              <label className="form-label" htmlFor="end-date">Expected Completion</label>
              <input
                id="end-date"
                className="form-input"
                type="date"
                value={expectedCompletion}
                onChange={e => setExpectedCompletion(e.target.value)}
              />
            </div>
          </div>

          {/* Assign Site Supervisors */}
          <div className="form-group" style={{ background: 'var(--color-card-bg)', padding: '1rem', borderRadius: 'var(--radius-md)', border: '1px solid var(--color-line)' }}>
            <label className="form-label" style={{ marginBottom: '0.25rem', display: 'flex', alignItems: 'center', gap: '0.35rem' }}>
              <span>👥</span> Assign Site Supervisors
            </label>
            <span className="form-hint" style={{ marginBottom: '0.75rem', display: 'block', fontSize: '0.78125rem' }}>
              Selected supervisors will have access to this site in their portal to enter daily expenses and view tasks.
            </span>

            {loadingSupervisors ? (
              <div className="text-muted" style={{ fontSize: '0.8125rem' }}>Loading supervisors...</div>
            ) : supervisors.length === 0 ? (
              <div className="text-muted" style={{ fontSize: '0.8125rem', fontStyle: 'italic' }}>
                No active site supervisors found. You can add supervisors later in User Management or assign them anytime.
              </div>
            ) : (
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(240px, 1fr))', gap: '0.5rem' }}>
                {supervisors.map(sup => {
                  const isSelected = selectedSupervisorIds.includes(sup.id);
                  return (
                    <label
                      key={sup.id}
                      style={{
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'space-between',
                        padding: '0.625rem 0.875rem',
                        background: isSelected ? '#EFF6FF' : 'var(--color-white)',
                        border: `1.5px solid ${isSelected ? 'var(--color-primary-blue)' : 'var(--color-line)'}`,
                        borderRadius: 'var(--radius-md)',
                        cursor: 'pointer',
                        transition: 'all 0.15s ease',
                      }}
                    >
                      <div>
                        <div style={{ fontWeight: 600, fontSize: '0.875rem', color: 'var(--color-navy)' }}>
                          👷 {sup.full_name}
                        </div>
                        {sup.phone && (
                          <div className="text-muted" style={{ fontSize: '0.75rem', marginTop: '0.1rem' }}>
                            {sup.phone}
                          </div>
                        )}
                      </div>
                      <input
                        type="checkbox"
                        checked={isSelected}
                        onChange={() => {
                          if (isSelected) {
                            setSelectedSupervisorIds(prev => prev.filter(id => id !== sup.id));
                          } else {
                            setSelectedSupervisorIds(prev => [...prev, sup.id]);
                          }
                        }}
                      />
                    </label>
                  );
                })}
              </div>
            )}
          </div>

          {/* Notes */}
          <div className="form-group">
            <label className="form-label" htmlFor="notes">Notes</label>
            <textarea
              id="notes"
              className="form-textarea"
              value={notes}
              onChange={e => setNotes(e.target.value)}
              rows={3}
              placeholder="Any additional notes..."
            />
          </div>

          {error && <p className="form-error" style={{ marginBottom: '1rem' }}>{error}</p>}

          <div className="flex gap-sm">
            <button type="submit" className="btn btn-primary btn-lg" disabled={loading}>
              {loading ? <span className="spinner" /> : 'Create Project'}
            </button>
            <button
              type="button"
              className="btn btn-secondary btn-lg"
              onClick={() => router.push('/projects')}
            >
              Cancel
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
