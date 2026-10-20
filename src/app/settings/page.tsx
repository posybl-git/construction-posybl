'use client';

import Link from 'next/link';

export default function SettingsHubPage() {
  const settingsSections = [
    {
      title: '👥 Staff & Float Management',
      desc: 'Add supervisors, set roles, share login credentials via WhatsApp, and manage site cash float.',
      href: '/users',
      badge: 'Core Auth',
    },
    {
      title: '🗑️ Trash & Data Restore',
      desc: 'View all soft-deleted expenses, payments, milestones, and projects. Restore individual records or bulk restore.',
      href: '/settings/trash',
      badge: 'Data Safety',
    },
    {
      title: '📜 Append-Only Audit Log',
      desc: 'Inspect full historical before/after JSON audit records for every create, edit, or delete action.',
      href: '/settings/audit',
      badge: 'Security',
    },
    {
      title: '🔔 Notification & Push Settings',
      desc: 'Configure mobile web push notifications, high-value spend thresholds, and quiet hours.',
      href: '/settings/notifications',
      badge: 'Alerts',
    },
  ];

  return (
    <div className="page-container" style={{ maxWidth: '800px' }}>
      <div className="page-header">
        <div>
          <h1 className="page-title">Admin Settings & Configuration</h1>
          <p className="text-muted" style={{ fontSize: '0.875rem' }}>
            Manage users, data protection, expense categories and system preferences
          </p>
        </div>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: '1fr', gap: '1rem' }}>
        {settingsSections.map(sec => (
          <Link key={sec.href} href={sec.href} style={{ textDecoration: 'none' }}>
            <div className="card card--hoverable" style={{ padding: '1.25rem 1.5rem', cursor: 'pointer' }}>
              <div className="flex items-center justify-between" style={{ marginBottom: '0.375rem' }}>
                <h2 style={{ fontSize: '1.125rem', color: 'var(--color-navy)', margin: 0 }}>
                  {sec.title}
                </h2>
                <span className="badge badge-info" style={{ fontSize: '0.6875rem' }}>
                  {sec.badge}
                </span>
              </div>
              <p className="text-muted" style={{ fontSize: '0.84375rem', margin: 0 }}>
                {sec.desc}
              </p>
            </div>
          </Link>
        ))}
      </div>
    </div>
  );
}
