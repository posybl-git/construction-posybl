'use client';

import { useState, useEffect, useRef } from 'react';
import { useRouter } from 'next/navigation';
import { createClient } from '@/lib/supabase/client';
import { formatPKRShort, formatDate } from '@/lib/format';

interface SearchResult {
  id: string;
  type: 'project' | 'expense' | 'vendor' | 'user';
  title: string;
  subtitle: string;
  url: string;
  meta?: string;
}

export function GlobalSearch() {
  const [query, setQuery] = useState('');
  const [results, setResults] = useState<SearchResult[]>([]);
  const [isOpen, setIsOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [userRole, setUserRole] = useState<'admin' | 'site_manager'>('admin');
  const searchRef = useRef<HTMLDivElement>(null);
  const router = useRouter();
  const supabase = createClient();

  useEffect(() => {
    async function checkRole() {
      const { data: { user } } = await supabase.auth.getUser();
      if (user) {
        const { data } = await supabase.from('profiles').select('role').eq('id', user.id).single();
        if (data?.role) setUserRole(data.role as 'admin' | 'site_manager');
      }
    }
    checkRole();
  }, []);

  // Close search results when clicking outside
  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (searchRef.current && !searchRef.current.contains(event.target as Node)) {
        setIsOpen(false);
      }
    }
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  // Debounced search
  useEffect(() => {
    if (!query.trim() || query.trim().length < 2) {
      setResults([]);
      setLoading(false);
      return;
    }

    setLoading(true);
    const timer = setTimeout(async () => {
      await performSearch(query.trim());
      setLoading(false);
    }, 300);

    return () => clearTimeout(timer);
  }, [query]);

  async function performSearch(q: string) {
    const qLower = q.toLowerCase();
    const searchResults: SearchResult[] = [];

    // 1. Search Projects
    if (userRole === 'admin') {
      const { data: projects } = await supabase
        .from('projects')
        .select('id, name, client_name, address, status, contract_value')
        .is('deleted_at', null)
        .ilike('name', `%${q}%`)
        .limit(5);

      if (projects && projects.length > 0) {
        const projectIds = projects.map(p => p.id);
        const { data: assignments } = await supabase
          .from('project_assignments')
          .select('project_id, user_id')
          .in('project_id', projectIds);

        const supervisorUserIds = (assignments || []).map(a => a.user_id);
        const { data: supervisors } = supervisorUserIds.length > 0
          ? await supabase.from('profiles').select('id, full_name').in('id', supervisorUserIds)
          : { data: [] };

        projects.forEach(p => {
          const assignedUserIds = (assignments || []).filter(a => a.project_id === p.id).map(a => a.user_id);
          const supervisorNames = (supervisors || []).filter(s => assignedUserIds.includes(s.id)).map(s => s.full_name);
          const supLabel = supervisorNames.length > 0 ? ` · 👷 ${supervisorNames.join(', ')}` : ' · ⚠️ Unassigned';

          searchResults.push({
            id: p.id,
            type: 'project',
            title: p.name,
            subtitle: `Client: ${p.client_name || 'N/A'}${supLabel}`,
            url: `/projects/${p.id}`,
            meta: formatPKRShort(p.contract_value),
          });
        });
      }
    } else {
      const { data: siteProjects } = await supabase
        .from('projects_for_site')
        .select('id, name, address, status')
        .ilike('name', `%${q}%`)
        .limit(5);

      (siteProjects || []).forEach(p => {
        searchResults.push({
          id: p.id,
          type: 'project',
          title: p.name,
          subtitle: p.address || 'Assigned site',
          url: `/site`,
        });
      });
    }

    // 2. Search Expenses
    const { data: expenses } = await supabase
      .from('expenses')
      .select('id, expense_name, amount, expense_date, project_id, payment_status')
      .is('deleted_at', null)
      .or(`expense_name.ilike.%${q}%,purpose.ilike.%${q}%`)
      .limit(6);

    (expenses || []).forEach(e => {
      searchResults.push({
        id: e.id,
        type: 'expense',
        title: e.expense_name,
        subtitle: `${formatDate(e.expense_date)} · ${e.payment_status}`,
        url: userRole === 'admin' ? `/projects/${e.project_id}` : '/site',
        meta: formatPKRShort(e.amount),
      });
    });

    // 3. Search Vendors (Admin only)
    if (userRole === 'admin') {
      const { data: vendors } = await supabase
        .from('vendors')
        .select('id, name, phone')
        .is('deleted_at', null)
        .ilike('name', `%${q}%`)
        .limit(4);

      (vendors || []).forEach(v => {
        searchResults.push({
          id: v.id,
          type: 'vendor',
          title: v.name,
          subtitle: v.phone ? `Phone: ${v.phone}` : 'Vendor / Contractor',
          url: `/settings/vendors`,
        });
      });

      // 4. Search Users
      const { data: users } = await supabase
        .from('profiles')
        .select('id, full_name, role, phone, email')
        .ilike('full_name', `%${q}%`)
        .limit(4);

      (users || []).forEach(u => {
        searchResults.push({
          id: u.id,
          type: 'user',
          title: u.full_name,
          subtitle: `${u.role === 'admin' ? 'Admin' : 'Site Manager'} ${u.phone || u.email || ''}`,
          url: `/users/${u.id}`,
        });
      });
    }

    setResults(searchResults);
    setIsOpen(true);
  }

  function handleSelect(result: SearchResult) {
    setIsOpen(false);
    setQuery('');
    router.push(result.url);
  }

  const grouped = {
    project: results.filter(r => r.type === 'project'),
    expense: results.filter(r => r.type === 'expense'),
    vendor: results.filter(r => r.type === 'vendor'),
    user: results.filter(r => r.type === 'user'),
  };

  return (
    <div ref={searchRef} style={{ position: 'relative', width: '100%' }}>
      <div style={{ position: 'relative' }}>
        <input
          type="text"
          className="input"
          placeholder="Search projects, expenses, vendors..."
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          onFocus={() => { if (results.length > 0) setIsOpen(true); }}
          style={{
            paddingLeft: '2.25rem',
            paddingRight: '2rem',
            height: '36px',
            fontSize: '0.8125rem',
            borderRadius: 'var(--radius-full)',
            background: '#F0F5FA',
            borderColor: '#D0DFEE',
          }}
        />
        <span
          style={{
            position: 'absolute',
            left: '0.75rem',
            top: '50%',
            transform: 'translateY(-50%)',
            fontSize: '0.875rem',
            color: 'var(--color-secondary-text)',
            pointerEvents: 'none',
          }}
        >
          🔍
        </span>
        {query && (
          <button
            type="button"
            onClick={() => { setQuery(''); setResults([]); setIsOpen(false); }}
            style={{
              position: 'absolute',
              right: '0.625rem',
              top: '50%',
              transform: 'translateY(-50%)',
              background: 'none',
              border: 'none',
              cursor: 'pointer',
              color: 'var(--color-secondary-text)',
              fontSize: '0.875rem',
            }}
          >
            ✕
          </button>
        )}
      </div>

      {/* Results Dropdown */}
      {isOpen && (
        <div
          style={{
            position: 'absolute',
            top: 'calc(100% + 6px)',
            left: 0,
            right: 0,
            background: 'var(--color-white)',
            border: '1px solid var(--color-line)',
            borderRadius: 'var(--radius-lg)',
            boxShadow: 'var(--shadow-lg)',
            maxHeight: '420px',
            overflowY: 'auto',
            zIndex: 100,
            padding: '0.5rem 0',
          }}
        >
          {loading ? (
            <div style={{ padding: '1rem', textAlign: 'center', color: 'var(--color-secondary-text)', fontSize: '0.8125rem' }}>
              Searching...
            </div>
          ) : results.length === 0 ? (
            <div style={{ padding: '1rem', textAlign: 'center', color: 'var(--color-secondary-text)', fontSize: '0.8125rem' }}>
              No results found for &ldquo;{query}&rdquo;
            </div>
          ) : (
            <div>
              {grouped.project.length > 0 && (
                <div>
                  <div style={{ padding: '0.375rem 0.875rem', fontSize: '0.6875rem', fontWeight: 700, color: 'var(--color-secondary-text)', textTransform: 'uppercase', letterSpacing: '0.05em' }}>
                    🏗️ Projects
                  </div>
                  {grouped.project.map(p => (
                    <div
                      key={p.id}
                      onClick={() => handleSelect(p)}
                      style={{
                        padding: '0.5rem 0.875rem',
                        cursor: 'pointer',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'space-between',
                        borderBottom: '1px solid #F0F4F8',
                      }}
                      onMouseEnter={(e) => e.currentTarget.style.background = '#F0F7FD'}
                      onMouseLeave={(e) => e.currentTarget.style.background = 'transparent'}
                    >
                      <div>
                        <div style={{ fontWeight: 600, fontSize: '0.84375rem', color: 'var(--color-navy)' }}>{p.title}</div>
                        <div style={{ fontSize: '0.75rem', color: 'var(--color-secondary-text)' }}>{p.subtitle}</div>
                      </div>
                      {p.meta && <span style={{ fontWeight: 700, fontSize: '0.8125rem', color: 'var(--color-navy)' }}>{p.meta}</span>}
                    </div>
                  ))}
                </div>
              )}

              {grouped.expense.length > 0 && (
                <div>
                  <div style={{ padding: '0.375rem 0.875rem', fontSize: '0.6875rem', fontWeight: 700, color: 'var(--color-secondary-text)', textTransform: 'uppercase', letterSpacing: '0.05em', marginTop: '0.375rem' }}>
                    💸 Expenses
                  </div>
                  {grouped.expense.map(e => (
                    <div
                      key={e.id}
                      onClick={() => handleSelect(e)}
                      style={{
                        padding: '0.5rem 0.875rem',
                        cursor: 'pointer',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'space-between',
                        borderBottom: '1px solid #F0F4F8',
                      }}
                      onMouseEnter={(el) => el.currentTarget.style.background = '#F0F7FD'}
                      onMouseLeave={(el) => el.currentTarget.style.background = 'transparent'}
                    >
                      <div>
                        <div style={{ fontWeight: 600, fontSize: '0.84375rem', color: 'var(--color-navy)' }}>{e.title}</div>
                        <div style={{ fontSize: '0.75rem', color: 'var(--color-secondary-text)' }}>{e.subtitle}</div>
                      </div>
                      {e.meta && <span style={{ fontWeight: 700, fontSize: '0.8125rem', color: 'var(--color-primary-blue)' }}>{e.meta}</span>}
                    </div>
                  ))}
                </div>
              )}

              {grouped.vendor.length > 0 && (
                <div>
                  <div style={{ padding: '0.375rem 0.875rem', fontSize: '0.6875rem', fontWeight: 700, color: 'var(--color-secondary-text)', textTransform: 'uppercase', letterSpacing: '0.05em', marginTop: '0.375rem' }}>
                    🏪 Vendors & Payees
                  </div>
                  {grouped.vendor.map(v => (
                    <div
                      key={v.id}
                      onClick={() => handleSelect(v)}
                      style={{
                        padding: '0.5rem 0.875rem',
                        cursor: 'pointer',
                        borderBottom: '1px solid #F0F4F8',
                      }}
                      onMouseEnter={(el) => el.currentTarget.style.background = '#F0F7FD'}
                      onMouseLeave={(el) => el.currentTarget.style.background = 'transparent'}
                    >
                      <div style={{ fontWeight: 600, fontSize: '0.84375rem', color: 'var(--color-navy)' }}>{v.title}</div>
                      <div style={{ fontSize: '0.75rem', color: 'var(--color-secondary-text)' }}>{v.subtitle}</div>
                    </div>
                  ))}
                </div>
              )}

              {grouped.user.length > 0 && (
                <div>
                  <div style={{ padding: '0.375rem 0.875rem', fontSize: '0.6875rem', fontWeight: 700, color: 'var(--color-secondary-text)', textTransform: 'uppercase', letterSpacing: '0.05em', marginTop: '0.375rem' }}>
                    👥 Staff & Users
                  </div>
                  {grouped.user.map(u => (
                    <div
                      key={u.id}
                      onClick={() => handleSelect(u)}
                      style={{
                        padding: '0.5rem 0.875rem',
                        cursor: 'pointer',
                      }}
                      onMouseEnter={(el) => el.currentTarget.style.background = '#F0F7FD'}
                      onMouseLeave={(el) => el.currentTarget.style.background = 'transparent'}
                    >
                      <div style={{ fontWeight: 600, fontSize: '0.84375rem', color: 'var(--color-navy)' }}>{u.title}</div>
                      <div style={{ fontSize: '0.75rem', color: 'var(--color-secondary-text)' }}>{u.subtitle}</div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
