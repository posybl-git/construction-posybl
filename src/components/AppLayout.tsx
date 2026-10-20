'use client';

import { useState, useEffect } from 'react';
import { usePathname, useRouter } from 'next/navigation';
import Link from 'next/link';
import { createClient } from '@/lib/supabase/client';
import { GlobalSearch } from '@/components/GlobalSearch';
import { NotificationBell } from '@/components/NotificationBell';
import { UserProfileMenu } from '@/components/UserProfileMenu';
import type { Profile } from '@/types/database';

const adminNavItems = [
  { href: '/dashboard', label: 'Dashboard', icon: '📊' },
  { href: '/projects', label: 'Projects', icon: '🏗️' },
  { href: '/expenses', label: 'All Expenses', icon: '💸' },
  { href: '/expenses/add', label: 'Add Expense', icon: '➕' },
  { href: '/expenses/daily', label: 'Daily View', icon: '📅' },
  { href: '/expenses/monthly', label: 'Monthly & Year', icon: '📆' },
  { href: '/payables', label: 'Who Do I Owe', icon: '⏳' },
  { href: '/payments', label: 'Payments', icon: '💰' },
  { href: '/users', label: 'Staff & Float', icon: '👥' },
  { href: '/settings', label: 'Settings', icon: '⚙️' },
];

export function AppLayout({ children }: { children: React.ReactNode }) {
  const [profile, setProfile] = useState<Profile | null>(null);
  const [loading, setLoading] = useState(true);
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const pathname = usePathname();
  const router = useRouter();
  const supabase = createClient();

  // Close sidebar automatically on route change
  useEffect(() => {
    setSidebarOpen(false);
  }, [pathname]);

  useEffect(() => {
    async function loadProfile() {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) {
        router.push('/login');
        return;
      }

      const { data } = await supabase
        .from('profiles')
        .select('*')
        .eq('id', user.id)
        .single();

      if (data) {
        const userProfile = data as Profile;
        if (userProfile.is_active === false) {
          await supabase.auth.signOut();
          router.push('/login?deactivated=1');
          return;
        }
        setProfile(userProfile);

        // If site manager attempts to visit admin-only sections, redirect to /site
        if (userProfile.role === 'site_manager') {
          const isExpenseAdd = pathname === '/expenses/add';
          const adminOnlyPaths = ['/dashboard', '/payables', '/payments', '/settings', '/projects/new'];
          const isAdminOnly = adminOnlyPaths.some(p => pathname === p || pathname.startsWith(p + '/')) || (pathname.startsWith('/expenses') && !isExpenseAdd);
          // Also /users list is admin only (but /users/[their_id] is allowed for their own ledger)
          const isUserList = pathname === '/users';

          if (isAdminOnly || isUserList) {
            router.push('/site');
            return;
          }
        }
      } else {
        // Fallback to metadata role so Admins are never mistakenly redirected to /site
        const metaRole = (user.user_metadata?.role as 'admin' | 'site_manager') || 'admin';
        const fallbackProfile: Profile = {
          id: user.id,
          full_name: (user.user_metadata?.full_name as string) || user.email?.split('@')[0] || 'User',
          phone: (user.user_metadata?.phone as string) || null,
          role: metaRole,
          is_active: true,
          created_at: new Date().toISOString(),
          updated_at: new Date().toISOString(),
        };
        setProfile(fallbackProfile);

        // Proactively upsert to database
        supabase.from('profiles').upsert({
          id: user.id,
          full_name: fallbackProfile.full_name,
          role: metaRole,
          is_active: true,
          updated_at: new Date().toISOString(),
        }, { onConflict: 'id' }).then(() => {});

        if (metaRole === 'site_manager') {
          const isExpenseAdd = pathname === '/expenses/add';
          const adminOnlyPaths = ['/dashboard', '/payables', '/payments', '/settings', '/projects/new'];
          const isAdminOnly = adminOnlyPaths.some(p => pathname === p || pathname.startsWith(p + '/')) || (pathname.startsWith('/expenses') && !isExpenseAdd);
          if (isAdminOnly || pathname === '/users') {
            router.push('/site');
            return;
          }
        }
      }
      setLoading(false);
    }
    loadProfile();
  }, [pathname, router, supabase]);

  const role = profile?.role || 'admin';
  const isSupervisor = role === 'site_manager';

  const siteNavItems = [
    { href: '/site', label: 'Home Dashboard', icon: '🏠' },
    { href: '/expenses/add', label: 'Add Expense', icon: '➕' },
    { href: profile ? `/users/${profile.id}` : '/site', label: 'My Cash Ledger', icon: '📖' },
    { href: '/site/daily', label: 'Daily View', icon: '📅' },
    { href: '/site/monthly', label: 'Monthly View', icon: '📆' },
  ];

  const navItems = isSupervisor ? siteNavItems : adminNavItems;

  function isLinkActive(href: string) {
    if (pathname === href) {
      return true;
    }
    if (pathname.startsWith(href + '/')) {
      const hasMoreSpecificMatch = navItems.some(
        item => item.href !== href && (pathname === item.href || pathname.startsWith(item.href + '/'))
      );
      return !hasMoreSpecificMatch;
    }
    return false;
  }

  if (loading) {
    return (
      <div style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', height: '100vh', background: '#0f172a', color: '#f8fafc' }}>
        <div style={{ textAlign: 'center' }}>
          <img
            src="/logo.png"
            alt="Android Properties"
            style={{ width: 64, height: 64, borderRadius: '50%', margin: '0 auto 1rem', objectFit: 'cover', border: '2px solid #1B75BC' }}
          />
          <div style={{ fontSize: '1.125rem', fontWeight: 600 }}>Loading Android Properties...</div>
        </div>
      </div>
    );
  }

  return (
    <div className="app-layout">
      {/* Mobile top bar */}
      <div className="mobile-topbar no-print">
        <div className="flex items-center gap-sm">
          <button
            className="hamburger-btn"
            onClick={() => setSidebarOpen(true)}
            aria-label="Open navigation menu"
          >
            ☰
          </button>
          <Link
            href={isSupervisor ? '/site' : '/dashboard'}
            className="flex items-center gap-xs"
            style={{ textDecoration: 'none' }}
          >
            <img
              src="/logo.png"
              alt="Android Properties"
              style={{ width: 30, height: 30, borderRadius: '50%', objectFit: 'cover', border: '1.5px solid rgba(255, 255, 255, 0.4)' }}
            />
            <span style={{ fontWeight: 800, fontSize: '0.9375rem', letterSpacing: '-0.01em', color: 'var(--color-white)' }}>Android Properties</span>
          </Link>
        </div>

        <div className="flex items-center gap-xs">
          <NotificationBell userId={profile?.id} role={role} />
          <UserProfileMenu profile={profile} />
        </div>
      </div>

      {/* Sidebar overlay (mobile) */}
      {sidebarOpen && (
        <div
          className="sidebar-overlay sidebar-overlay--visible no-print"
          onClick={() => setSidebarOpen(false)}
        />
      )}

      {/* Sidebar */}
      <aside className={`sidebar ${sidebarOpen ? 'sidebar--open' : ''} no-print`}>
        <Link
          href={isSupervisor ? '/site' : '/dashboard'}
          className="sidebar__brand"
          style={{ textDecoration: 'none' }}
          onClick={() => setSidebarOpen(false)}
        >
          <img
            src="/logo.png"
            alt="Android Properties"
            style={{
              width: 42,
              height: 42,
              borderRadius: '50%',
              objectFit: 'cover',
              flexShrink: 0,
              border: '2px solid rgba(27, 117, 188, 0.6)',
              boxShadow: '0 2px 8px rgba(0, 0, 0, 0.3)'
            }}
          />
          <div>
            <span className="sidebar__brand-name">Android Properties</span>
            <div style={{ fontSize: '0.6875rem', color: '#8EA4D2', fontWeight: 500 }}>
              {isSupervisor ? 'Supervisor Portal' : 'Expense & Cash Tracker'}
            </div>
          </div>
        </Link>

        <nav className="sidebar__nav">
          <div className="sidebar__section-title">
            {isSupervisor ? 'Supervisor Menu' : 'Navigation'}
          </div>
          {navItems.map(item => (
            <Link
              key={item.href}
              href={item.href}
              className={`nav-link ${isLinkActive(item.href) ? 'nav-link--active' : ''}`}
              onClick={() => setSidebarOpen(false)}
            >
              <span style={{ fontSize: '1.1rem' }}>{item.icon}</span>
              {item.label}
            </Link>
          ))}
        </nav>
      </aside>

      {/* Main content with persistent top search bar */}
      <div className="main-wrapper">
        {/* Top Header Bar with Global Search */}
        <header className="top-header-bar no-print">
          <div className="global-search-container">
            <GlobalSearch />
          </div>
          <div className="top-header-actions">
            <Link href="/expenses/add" className="btn btn-primary btn-sm">
              ➕ Add Expense
            </Link>
            {isSupervisor ? (
              profile && (
                <Link href={`/users/${profile.id}`} className="btn btn-secondary btn-sm" title="View your cash ledger passbook">
                  📖 Cash Ledger
                </Link>
              )
            ) : (
              <Link href="/users" className="btn btn-secondary btn-sm" title="Manage site staff and float">
                👥 Float Status
              </Link>
            )}
            <NotificationBell userId={profile?.id} role={role} />
            <UserProfileMenu profile={profile} />
          </div>
        </header>

        <main className="main-content">
          {children}
        </main>
      </div>

      {/* Mobile Bottom Navigation Bar (PRD §6.5 & §10.3) */}
      <nav className="mobile-bottom-nav no-print" aria-label="Mobile navigation">
        {isSupervisor ? (
          <>
            <Link
              href="/site"
              className={`mobile-nav-item ${pathname === '/site' ? 'mobile-nav-item--active' : ''}`}
            >
              <span className="mobile-nav-icon">🏠</span>
              <span>Home</span>
            </Link>
            <Link
              href="/site/daily"
              className={`mobile-nav-item ${pathname.startsWith('/site/daily') ? 'mobile-nav-item--active' : ''}`}
            >
              <span className="mobile-nav-icon">📅</span>
              <span>Daily</span>
            </Link>
            <Link
              href="/expenses/add"
              className="mobile-nav-item mobile-nav-item--center"
              title="Add Expense"
            >
              <span className="mobile-nav-icon">➕</span>
            </Link>
            <Link
              href={profile ? `/users/${profile.id}` : '/site'}
              className={`mobile-nav-item ${profile && pathname.startsWith(`/users/${profile.id}`) ? 'mobile-nav-item--active' : ''}`}
            >
              <span className="mobile-nav-icon">📖</span>
              <span>Ledger</span>
            </Link>
            <Link
              href="/site/monthly"
              className={`mobile-nav-item ${pathname.startsWith('/site/monthly') ? 'mobile-nav-item--active' : ''}`}
            >
              <span className="mobile-nav-icon">📆</span>
              <span>Monthly</span>
            </Link>
          </>
        ) : (
          <>
            <Link
              href="/dashboard"
              className={`mobile-nav-item ${pathname === '/dashboard' ? 'mobile-nav-item--active' : ''}`}
            >
              <span className="mobile-nav-icon">📊</span>
              <span>Dashboard</span>
            </Link>
            <Link
              href="/projects"
              className={`mobile-nav-item ${pathname.startsWith('/projects') ? 'mobile-nav-item--active' : ''}`}
            >
              <span className="mobile-nav-icon">🏗️</span>
              <span>Projects</span>
            </Link>
            <Link
              href="/expenses/add"
              className="mobile-nav-item mobile-nav-item--center"
              title="Add Expense"
            >
              <span className="mobile-nav-icon">➕</span>
            </Link>
            <Link
              href="/expenses"
              className={`mobile-nav-item ${pathname === '/expenses' || (pathname.startsWith('/expenses/') && pathname !== '/expenses/add') ? 'mobile-nav-item--active' : ''}`}
            >
              <span className="mobile-nav-icon">💸</span>
              <span>Expenses</span>
            </Link>
            <Link
              href="/users"
              className={`mobile-nav-item ${pathname.startsWith('/users') ? 'mobile-nav-item--active' : ''}`}
            >
              <span className="mobile-nav-icon">👥</span>
              <span>Staff & Float</span>
            </Link>
          </>
        )}
      </nav>
    </div>
  );
}
