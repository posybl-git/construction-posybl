'use client';

import { useState, useEffect, useRef, useCallback, useSyncExternalStore } from 'react';
import { useRouter } from 'next/navigation';
import { createClient } from '@/lib/supabase/client';
import { formatPKR } from '@/lib/format';

// ─── Notification Data Model ──────────────────────────────────────────────────
export interface AppNotification {
  id: string;
  type: 'alert' | 'warning' | 'info' | 'success';
  category: 'payable' | 'float' | 'budget' | 'milestone' | 'high_value' | 'cash' | 'reminder' | 'project';
  icon: string;
  title: string;
  body: string;
  href: string;
  badgeLabel?: string;
  createdAt: Date;
}

// ─── Persistent Storage Store with Cross-Instance Sync ────────────────────────
const READ_KEY = 'sl_read_notification_ids';
const DISMISSED_KEY = 'sl_dismissed_notification_ids';

function getStoredSet(key: string): Set<string> {
  if (typeof window === 'undefined') return new Set();
  try {
    const raw = localStorage.getItem(key);
    return new Set(raw ? JSON.parse(raw) : []);
  } catch {
    return new Set();
  }
}

function saveStoredSet(key: string, items: Set<string>) {
  if (typeof window === 'undefined') return;
  try {
    const arr = Array.from(items).slice(-300);
    localStorage.setItem(key, JSON.stringify(arr));
    window.dispatchEvent(new CustomEvent('sl-notifications-sync', { detail: { key, items: arr } }));
  } catch {}
}

// ─── Relative Time Formatter (YouTube style) ──────────────────────────────────
function formatRelativeTime(date: Date): string {
  const diffSecs = Math.max(0, Math.floor((Date.now() - date.getTime()) / 1000));
  if (diffSecs < 60) return 'Just now';
  const mins = Math.floor(diffSecs / 60);
  if (mins < 60) return `${mins}m ago`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  if (days === 1) return 'Yesterday';
  if (days < 7) return `${days}d ago`;
  const weeks = Math.floor(days / 7);
  if (weeks < 4) return `${weeks}w ago`;
  return date.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
}

// ─── Admin Notification Generator ─────────────────────────────────────────────
async function fetchAdminNotifications(supabase: ReturnType<typeof createClient>): Promise<AppNotification[]> {
  const notifs: AppNotification[] = [];
  const now = new Date();
  const todayStr = now.toISOString().split('T')[0];
  const sevenDaysAgo = new Date(now.getTime() - 7 * 86400000).toISOString().split('T')[0];

  try {
    // 1. Payment Milestones Overdue or Due Soon
    const { data: milestones } = await supabase
      .from('payment_milestones')
      .select('id, name, planned_amount, planned_date, status, project_id, projects(name)')
      .is('deleted_at', null)
      .neq('status', 'received')
      .order('planned_date', { ascending: true })
      .limit(10);

    (milestones || []).forEach(m => {
      const projName = (m.projects as { name?: string })?.name || 'Project';
      if (m.planned_date && m.planned_date < todayStr) {
        const daysOver = Math.floor((now.getTime() - new Date(m.planned_date).getTime()) / 86400000);
        notifs.push({
          id: `milestone-overdue-${m.id}`,
          type: 'alert',
          category: 'milestone',
          icon: '⏳',
          title: `Milestone Overdue (${daysOver}d): ${m.name}`,
          body: `${projName} · ${formatPKR(m.planned_amount, false)} client payment overdue since ${m.planned_date}`,
          href: `/projects/${m.project_id}`,
          badgeLabel: 'Payment Due',
          createdAt: new Date(m.planned_date),
        });
      }
    });

    // 2. Unpaid Payables / Bills Aging (> 7 days)
    const { data: unpaidExpenses } = await supabase
      .from('expenses')
      .select('id, expense_name, vendor_name, amount, expense_date, project_id')
      .eq('payment_status', 'unpaid')
      .is('deleted_at', null)
      .order('expense_date', { ascending: true })
      .limit(8);

    (unpaidExpenses || []).forEach(exp => {
      const daysUnpaid = Math.floor((now.getTime() - new Date(exp.expense_date).getTime()) / 86400000);
      if (daysUnpaid >= 7) {
        notifs.push({
          id: `unpaid-bill-${exp.id}`,
          type: daysUnpaid >= 14 ? 'alert' : 'warning',
          category: 'payable',
          icon: '📋',
          title: `Unpaid Bill Pending (${daysUnpaid} days)`,
          body: `${exp.vendor_name || exp.expense_name} · ${formatPKR(exp.amount, false)} outstanding`,
          href: '/payables',
          badgeLabel: 'Vendor Payable',
          createdAt: new Date(exp.expense_date),
        });
      }
    });

    // 3. Supervisor Float Balances (Negative = Company owes staff, Low = top up needed)
    const { data: floatBalances } = await supabase.rpc('get_all_float_balances');
    const floatMap = new Map<string, number>(
      (floatBalances || []).map((f: { user_id: string; float_balance: number }) => [f.user_id, Number(f.float_balance)])
    );

    const { data: supervisors } = await supabase
      .from('profiles')
      .select('id, full_name, role')
      .eq('role', 'site_manager')
      .eq('is_active', true);

    (supervisors || []).forEach(sup => {
      const balance = Number(floatMap.get(sup.id) || 0);
      if (balance < 0) {
        notifs.push({
          id: `neg-float-${sup.id}`,
          type: 'alert',
          category: 'float',
          icon: '🚨',
          title: `Reimbursement Due: ${sup.full_name}`,
          body: `Supervisor spent personal funds exceeding float by Rs ${Math.abs(balance).toLocaleString('en-IN')}`,
          href: `/users/${sup.id}`,
          badgeLabel: 'Reimburse',
          createdAt: now,
        });
      } else if (balance === 0) {
        notifs.push({
          id: `low-float-${sup.id}`,
          type: 'warning',
          category: 'float',
          icon: '⚠️',
          title: `Float Balance Zero: ${sup.full_name}`,
          body: `Supervisor has Rs 0 cash in hand - top-up needed for site expenses`,
          href: `/users/${sup.id}`,
          badgeLabel: 'Zero Float',
          createdAt: now,
        });
      } else if (balance < 5000) {
        notifs.push({
          id: `low-float-${sup.id}`,
          type: 'warning',
          category: 'float',
          icon: '⚠️',
          title: `Low Float: ${sup.full_name}`,
          body: `Supervisor has only ${formatPKR(balance, false)} remaining cash in hand`,
          href: `/users/${sup.id}`,
          badgeLabel: 'Low Float',
          createdAt: now,
        });
      }
    });

    // 4. Project Budget Warnings & Critical Overruns
    const { data: projects } = await supabase
      .from('projects')
      .select('id, name, contract_value, status')
      .eq('status', 'active')
      .is('deleted_at', null)
      .gt('contract_value', 0);

    if (projects && projects.length > 0) {
      const projIds = projects.map(p => p.id);
      const { data: projExpenses } = await supabase
        .from('expenses')
        .select('project_id, amount')
        .is('deleted_at', null)
        .in('project_id', projIds);

      const spentByProj: Record<string, number> = {};
      (projExpenses || []).forEach(e => {
        spentByProj[e.project_id] = (spentByProj[e.project_id] || 0) + Number(e.amount);
      });

      projects.forEach(p => {
        const spent = spentByProj[p.id] || 0;
        const contractVal = Number(p.contract_value) || 0;
        const pct = contractVal > 0 ? (spent / contractVal) * 100 : 0;
        const overrun = spent - contractVal;

        if (pct >= 100) {
          notifs.push({
            id: `budget-exceeded-${p.id}`,
            type: 'alert',
            category: 'budget',
            icon: '🔴',
            title: `Budget Exceeded: ${p.name}`,
            body: `Spent ${formatPKR(spent, false)} of ${formatPKR(contractVal, false)} budget (${Math.round(pct)}% used${overrun > 0 ? ` · Exceeded by ${formatPKR(overrun, false)}` : ''})`,
            href: `/projects/${p.id}`,
            badgeLabel: 'Budget Critical',
            createdAt: now,
          });
        } else if (pct >= 85) {
          notifs.push({
            id: `budget-warn-${p.id}`,
            type: 'warning',
            category: 'budget',
            icon: '🟡',
            title: `Budget Warning (85%+): ${p.name}`,
            body: `${Math.round(pct)}% of budget utilized (${formatPKR(spent, false)} of ${formatPKR(contractVal, false)})`,
            href: `/projects/${p.id}`,
            badgeLabel: 'Budget Warning',
            createdAt: now,
          });
        }
      });
    }

    // 5. High-Value Expenses in Last 7 Days (>= Rs 50,000)
    const { data: highValExpenses } = await supabase
      .from('expenses')
      .select('id, expense_name, amount, expense_date, vendor_name, project_id, projects(name)')
      .is('deleted_at', null)
      .gte('expense_date', sevenDaysAgo)
      .gte('amount', 50000)
      .order('amount', { ascending: false })
      .limit(4);

    (highValExpenses || []).forEach(exp => {
      const projName = (exp.projects as { name?: string })?.name || 'Site';
      notifs.push({
        id: `high-val-${exp.id}`,
        type: 'info',
        category: 'high_value',
        icon: '💰',
        title: `High Expense: ${exp.expense_name}`,
        body: `${formatPKR(exp.amount, false)} · ${projName} · Vendor: ${exp.vendor_name || 'Direct'}`,
        href: '/expenses/daily',
        badgeLabel: 'High Value',
        createdAt: new Date(exp.expense_date),
      });
    });

  } catch (err) {
    console.error('Error fetching admin notifications:', err);
  }

  // Priority sort: alert -> warning -> info -> success
  const priority = { alert: 0, warning: 1, info: 2, success: 3 };
  return notifs.sort((a, b) => priority[a.type] - priority[b.type] || b.createdAt.getTime() - a.createdAt.getTime());
}

// ─── Supervisor Notification Generator ────────────────────────────────────────
async function fetchSupervisorNotifications(
  supabase: ReturnType<typeof createClient>,
  userId: string
): Promise<AppNotification[]> {
  const notifs: AppNotification[] = [];
  const now = new Date();
  const todayStr = now.toISOString().split('T')[0];
  const sevenDaysAgo = new Date(now.getTime() - 7 * 86400000).toISOString().split('T')[0];

  try {
    // 1. Physical Cash in Hand (Site Float Balance) - uses server-side RPC to avoid row limit
    const { data: floatData } = await supabase.rpc('get_user_float_balance', { p_user_id: userId });
    const floatRow = Array.isArray(floatData) ? floatData[0] : floatData;
    const cashInHand = floatRow ? Number(floatRow.float_balance) : 0;

    if (cashInHand < 0) {
      notifs.push({
        id: `sup-neg-float-${userId}`,
        type: 'alert',
        category: 'float',
        icon: '🚨',
        title: 'Float Negative - Reimbursement Due',
        body: `You spent Rs ${Math.abs(cashInHand).toLocaleString('en-IN')} personal funds on site. Contact admin for settlement.`,
        href: `/users/${userId}`,
        badgeLabel: 'Settlement Due',
        createdAt: now,
      });
    } else if (cashInHand < 5000) {
      notifs.push({
        id: `sup-low-float-${userId}`,
        type: 'warning',
        category: 'float',
        icon: '⚠️',
        title: 'Low Cash in Hand',
        body: `Only ${formatPKR(cashInHand, false)} left in your site float. Request a cash top-up before making site purchases.`,
        href: `/users/${userId}`,
        badgeLabel: 'Low Float',
        createdAt: now,
      });
    } else {
      notifs.push({
        id: `sup-ok-float-${userId}`,
        type: 'success',
        category: 'float',
        icon: '💵',
        title: 'Site Float Balance Active',
        body: `You have ${formatPKR(cashInHand, false)} cash in hand ready for site material and labour expenses.`,
        href: `/users/${userId}`,
        badgeLabel: 'Available Cash',
        createdAt: now,
      });
    }

    // 2. Recent Cash Handover / Issuance (Last 7 days)
    const { data: recentCash } = await supabase
      .from('cash_issuances')
      .select('id, amount, issue_date, note')
      .eq('user_id', userId)
      .gte('issue_date', sevenDaysAgo)
      .is('deleted_at', null)
      .order('issue_date', { ascending: false })
      .limit(3);

    (recentCash || []).forEach(c => {
      notifs.push({
        id: `cash-recv-${c.id}`,
        type: 'success',
        category: 'cash',
        icon: '💰',
        title: 'Cash Handover Received',
        body: `${formatPKR(c.amount, false)} received on ${c.issue_date}${c.note ? ` (${c.note})` : ''}`,
        href: `/users/${userId}`,
        badgeLabel: 'Cash Handover',
        createdAt: new Date(c.issue_date),
      });
    });

    // 3. Unpaid Expenses recorded by this Supervisor
    const { data: myUnpaid } = await supabase
      .from('expenses')
      .select('id, expense_name, vendor_name, amount, expense_date')
      .eq('created_by', userId)
      .eq('payment_status', 'unpaid')
      .is('deleted_at', null)
      .order('expense_date', { ascending: true })
      .limit(3);

    (myUnpaid || []).forEach(exp => {
      const days = Math.floor((now.getTime() - new Date(exp.expense_date).getTime()) / 86400000);
      notifs.push({
        id: `my-unpaid-${exp.id}`,
        type: days > 7 ? 'warning' : 'info',
        category: 'payable',
        icon: '📋',
        title: `Pending Bill: ${exp.expense_name}`,
        body: `${formatPKR(exp.amount, false)} to ${exp.vendor_name || 'Vendor'} recorded as unpaid (${days}d ago)`,
        href: '/site/daily',
        badgeLabel: 'Unpaid Dues',
        createdAt: new Date(exp.expense_date),
      });
    });

    // 4. Daily Expense Submission Reminder
    const { data: todayExpenses } = await supabase
      .from('expenses')
      .select('id')
      .eq('created_by', userId)
      .eq('expense_date', todayStr)
      .is('deleted_at', null)
      .limit(1);

    if (!todayExpenses || todayExpenses.length === 0) {
      const currentHour = now.getHours();
      if (currentHour >= 16) {
        notifs.push({
          id: `reminder-log-${todayStr}`,
          type: 'info',
          category: 'reminder',
          icon: '📝',
          title: "Today's Expenses Not Submitted",
          body: 'Record daily material receipts and labour payments before closing site for the day.',
          href: '/expenses/add',
          badgeLabel: 'Daily Entry',
          createdAt: now,
        });
      }
    }

  } catch (err) {
    console.error('Error fetching supervisor notifications:', err);
  }

  const priority = { alert: 0, warning: 1, info: 2, success: 3 };
  return notifs.sort((a, b) => priority[a.type] - priority[b.type] || b.createdAt.getTime() - a.createdAt.getTime());
}

// ─── Component Props ──────────────────────────────────────────────────────────
interface NotificationBellProps {
  userId?: string;
  role?: 'admin' | 'site_manager';
  placement?: 'header' | 'standalone';
}

export function NotificationBell({ userId, role = 'admin', placement = 'header' }: NotificationBellProps) {
  const [notifications, setNotifications] = useState<AppNotification[]>([]);
  const [readIds, setReadIds] = useState<Set<string>>(() => {
    if (typeof window !== 'undefined') return getStoredSet(READ_KEY);
    return new Set();
  });
  const [dismissedIds, setDismissedIds] = useState<Set<string>>(() => {
    if (typeof window !== 'undefined') return getStoredSet(DISMISSED_KEY);
    return new Set();
  });
  const [open, setOpen] = useState(false);
  const [activeTab, setActiveTab] = useState<'all' | 'unread'>('all');
  const [loading, setLoading] = useState(true);
  const [isRefreshing, setIsRefreshing] = useState(false);

  const containerRef = useRef<HTMLDivElement>(null);
  const btnRef = useRef<HTMLButtonElement>(null);
  const router = useRouter();
  const supabase = createClient();

  // Load read & dismissed state and listen for cross-component sync events
  useEffect(() => {
    setReadIds(getStoredSet(READ_KEY));
    setDismissedIds(getStoredSet(DISMISSED_KEY));

    function handleSync(e: Event) {
      const customEvent = e as CustomEvent<{ key: string; items: string[] }>;
      if (customEvent.detail) {
        if (customEvent.detail.key === READ_KEY) {
          setReadIds(new Set(customEvent.detail.items));
        } else if (customEvent.detail.key === DISMISSED_KEY) {
          setDismissedIds(new Set(customEvent.detail.items));
        }
      }
    }

    window.addEventListener('sl-notifications-sync', handleSync);
    window.addEventListener('storage', () => {
      setReadIds(getStoredSet(READ_KEY));
      setDismissedIds(getStoredSet(DISMISSED_KEY));
    });

    return () => {
      window.removeEventListener('sl-notifications-sync', handleSync);
      window.removeEventListener('storage', () => {});
    };
  }, []);

  // Fetch notifications
  const loadData = useCallback(async (showSpinner = true) => {
    if (showSpinner) setLoading(true);
    setIsRefreshing(true);
    try {
      let resolvedUserId = userId;
      let resolvedRole = role;

      if (!resolvedUserId) {
        const { data: { user } } = await supabase.auth.getUser();
        if (user) {
          resolvedUserId = user.id;
          const { data: profile } = await supabase.from('profiles').select('role').eq('id', user.id).single();
          if (profile) resolvedRole = profile.role;
        }
      }

      if (!resolvedUserId) return;

      const items = resolvedRole === 'admin'
        ? await fetchAdminNotifications(supabase)
        : await fetchSupervisorNotifications(supabase, resolvedUserId);

      setNotifications(items);
    } catch (err) {
      console.error('Failed to load notifications:', err);
    } finally {
      setLoading(false);
      setIsRefreshing(false);
    }
  }, [role, userId, supabase]);

  useEffect(() => {
    loadData();
    // Auto-refresh notifications every 3 minutes
    const timer = setInterval(() => loadData(false), 3 * 60 * 1000);
    return () => clearInterval(timer);
  }, [loadData]);

  // Handle outside click to dismiss popup
  useEffect(() => {
    function onPointerDown(e: MouseEvent) {
      if (
        containerRef.current &&
        !containerRef.current.contains(e.target as Node)
      ) {
        setOpen(false);
      }
    }
    if (open) {
      document.addEventListener('mousedown', onPointerDown);
    }
    return () => document.removeEventListener('mousedown', onPointerDown);
  }, [open]);

  // Handle keyboard navigation (Escape to close)
  useEffect(() => {
    function onKeyDown(e: KeyboardEvent) {
      if (e.key === 'Escape' && open) {
        setOpen(false);
        btnRef.current?.focus();
      }
    }
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [open]);

  // Filter visible notifications (excluding dismissed)
  const visibleNotifications = notifications.filter(n => !dismissedIds.has(n.id));

  // Determine unread count (checking against both local state and storage)
  const storedReadSet = typeof window !== 'undefined' ? getStoredSet(READ_KEY) : readIds;
  const isRead = (id: string) => readIds.has(id) || storedReadSet.has(id);
  const unreadCount = open ? 0 : visibleNotifications.filter(n => !isRead(n.id)).length;

  const displayedNotifications = activeTab === 'unread'
    ? visibleNotifications.filter(n => !isRead(n.id))
    : visibleNotifications;

  // Actions
  function handleMarkAllAsRead() {
    const updated = new Set([...readIds, ...storedReadSet, ...visibleNotifications.map(n => n.id)]);
    setReadIds(updated);
    saveStoredSet(READ_KEY, updated);
  }

  function handleItemClick(notif: AppNotification) {
    const updated = new Set([...readIds, ...storedReadSet, notif.id]);
    setReadIds(updated);
    saveStoredSet(READ_KEY, updated);
    setOpen(false);
    router.push(notif.href);
  }

  function handleDismiss(e: React.MouseEvent, notifId: string) {
    e.stopPropagation();
    const updated = new Set([...dismissedIds, notifId]);
    setDismissedIds(updated);
    saveStoredSet(DISMISSED_KEY, updated);
  }

  function handleToggleRead(e: React.MouseEvent, notifId: string) {
    e.stopPropagation();
    const isCurrentlyRead = isRead(notifId);
    const updated = new Set([...readIds, ...storedReadSet]);
    if (isCurrentlyRead) {
      updated.delete(notifId);
    } else {
      updated.add(notifId);
    }
    setReadIds(updated);
    saveStoredSet(READ_KEY, updated);
  }

  return (
    <div ref={containerRef} className={`notif-bell-container ${placement === 'standalone' ? 'notif-bell-container--standalone' : ''}`}>
      {/* ── YouTube-Style Bell Button ── */}
      <button
        ref={btnRef}
        type="button"
        id="yt-notification-bell-btn"
        className={`yt-bell-btn ${open ? 'yt-bell-btn--active' : ''} ${unreadCount > 0 ? 'yt-bell-btn--has-unread' : ''}`}
        onClick={() => {
          const nextOpen = !open;
          setOpen(nextOpen);
          if (nextOpen) {
            // As soon as user clicks the bell to see notifications, clear badge count immediately
            if (visibleNotifications.length > 0) {
              const updated = new Set([...readIds, ...storedReadSet, ...visibleNotifications.map(n => n.id)]);
              setReadIds(updated);
              saveStoredSet(READ_KEY, updated);
            }
            loadData(false);
          }
        }}
        aria-label={`Notifications (${unreadCount} unread)`}
        aria-expanded={open}
        title="Notifications"
      >
        {/* YouTube standard bell icon */}
        <svg
          viewBox="0 0 24 24"
          className="yt-bell-icon"
          fill="currentColor"
          width="22"
          height="22"
          aria-hidden="true"
        >
          <path d="M12 22c1.1 0 2-.9 2-2h-4c0 1.1.9 2 2 2zm6-6v-5c0-3.07-1.63-5.64-4.5-6.32V4c0-.83-.67-1.5-1.5-1.5s-1.5.67-1.5 1.5v.68C7.64 5.36 6 7.92 6 11v5l-2 2v1h16v-1l-2-2z" />
        </svg>

        {/* YouTube Red Unread Badge Pill */}
        {unreadCount > 0 && (
          <span className="yt-bell-badge" aria-hidden="true">
            {unreadCount > 9 ? '9+' : unreadCount}
          </span>
        )}
      </button>

      {/* ── YouTube-Style Dropdown Popover Panel ── */}
      {open && (
        <div
          className="yt-notif-panel"
          role="dialog"
          aria-modal="true"
          aria-label="Notifications"
        >
          {/* Header */}
          <div className="yt-notif-header">
            <div className="flex items-center gap-xs">
              <span className="yt-notif-header-title">Notifications</span>
              {unreadCount > 0 && (
                <span className="yt-notif-pill-count">{unreadCount}</span>
              )}
            </div>

            <div className="flex items-center gap-xs">
              <button
                type="button"
                className={`yt-notif-action-btn ${isRefreshing ? 'yt-notif-action-btn--spin' : ''}`}
                onClick={() => loadData(true)}
                title="Refresh notifications"
                aria-label="Refresh notifications"
              >
                <svg viewBox="0 0 24 24" width="16" height="16" fill="currentColor">
                  <path d="M17.65 6.35C16.2 4.9 14.21 4 12 4c-4.42 0-7.99 3.58-7.99 8s3.57 8 7.99 8c3.73 0 6.84-2.55 7.73-6h-2.08c-.82 2.33-3.04 4-5.65 4-3.31 0-6-2.69-6-6s2.69-6 6-6c1.66 0 3.14.69 4.22 1.78L13 11h7V4l-2.35 2.35z"/>
                </svg>
              </button>
              {unreadCount > 0 && (
                <button
                  type="button"
                  className="yt-notif-text-btn"
                  onClick={handleMarkAllAsRead}
                  title="Mark all as read"
                >
                  Mark all as read
                </button>
              )}
              <button
                type="button"
                className="yt-notif-close-btn"
                onClick={() => setOpen(false)}
                aria-label="Close notifications"
              >
                ✕
              </button>
            </div>
          </div>

          {/* YouTube Filter Tabs: All / Unread */}
          <div className="yt-notif-tabs">
            <button
              type="button"
              className={`yt-notif-tab ${activeTab === 'all' ? 'yt-notif-tab--active' : ''}`}
              onClick={() => setActiveTab('all')}
            >
              All ({visibleNotifications.length})
            </button>
            <button
              type="button"
              className={`yt-notif-tab ${activeTab === 'unread' ? 'yt-notif-tab--active' : ''}`}
              onClick={() => setActiveTab('unread')}
            >
              Unread {visibleNotifications.filter(n => !isRead(n.id)).length > 0 ? `(${visibleNotifications.filter(n => !isRead(n.id)).length})` : ''}
            </button>
          </div>

          {/* Body List */}
          <div className="yt-notif-body">
            {loading ? (
              <div className="yt-notif-loading">
                <div className="spinner" style={{ width: 26, height: 26 }} />
                <span>Checking latest alerts…</span>
              </div>
            ) : displayedNotifications.length === 0 ? (
              <div className="yt-notif-empty">
                <div className="yt-notif-empty-icon">
                  {activeTab === 'unread' ? '🎉' : '🔔'}
                </div>
                <div className="yt-notif-empty-title">
                  {activeTab === 'unread' ? 'All caught up!' : 'No notifications'}
                </div>
                <div className="yt-notif-empty-subtitle">
                  {activeTab === 'unread'
                    ? 'You have read all your alerts and updates.'
                    : 'Important milestones, float balances, and bill reminders will appear here.'}
                </div>
              </div>
            ) : (
              <div className="yt-notif-list">
                {displayedNotifications.map(notif => {
                  const unreadItem = !isRead(notif.id);
                  return (
                    <div
                      key={notif.id}
                      className={`yt-notif-item ${unreadItem ? 'yt-notif-item--unread' : ''} yt-notif-item--${notif.type}`}
                      onClick={() => handleItemClick(notif)}
                      role="button"
                      tabIndex={0}
                      onKeyDown={(e) => {
                        if (e.key === 'Enter' || e.key === ' ') {
                          e.preventDefault();
                          handleItemClick(notif);
                        }
                      }}
                    >
                      {/* Left: Unread Blue Indicator Dot */}
                      <div className="yt-notif-dot-wrapper">
                        {unreadItem && <span className="yt-notif-blue-dot" />}
                      </div>

                      {/* Icon Avatar */}
                      <div className={`yt-notif-avatar yt-notif-avatar--${notif.type}`}>
                        <span>{notif.icon}</span>
                      </div>

                      {/* Content */}
                      <div className="yt-notif-content">
                        <div className="yt-notif-item-header">
                          <span className="yt-notif-title">{notif.title}</span>
                          {notif.badgeLabel && (
                            <span className={`yt-notif-chip yt-notif-chip--${notif.type}`}>
                              {notif.badgeLabel}
                            </span>
                          )}
                        </div>
                        <p className="yt-notif-body-text">{notif.body}</p>
                        <div className="yt-notif-meta">
                          <span className="yt-notif-time">{formatRelativeTime(notif.createdAt)}</span>
                        </div>
                      </div>

                      {/* Right: Quick Item Actions (YouTube Hover Menu) */}
                      <div className="yt-notif-item-actions">
                        <button
                          type="button"
                          className="yt-notif-item-action-btn"
                          onClick={(e) => handleToggleRead(e, notif.id)}
                          title={unreadItem ? 'Mark as read' : 'Mark as unread'}
                          aria-label={unreadItem ? 'Mark as read' : 'Mark as unread'}
                        >
                          {unreadItem ? '✓' : '●'}
                        </button>
                        <button
                          type="button"
                          className="yt-notif-item-action-btn"
                          onClick={(e) => handleDismiss(e, notif.id)}
                          title="Dismiss notification"
                          aria-label="Dismiss notification"
                        >
                          ✕
                        </button>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>

          {/* Footer */}
          {visibleNotifications.length > 0 && (
            <div className="yt-notif-footer">
              <span className="yt-notif-footer-text">
                {role === 'admin' ? 'Executive & Project Financial Alerts' : 'Site Supervisor Float & Task Alerts'}
              </span>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
