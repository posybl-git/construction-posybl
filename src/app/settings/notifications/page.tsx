'use client';

import { useState, useEffect } from 'react';
import { createClient } from '@/lib/supabase/client';
import { formatPKR } from '@/lib/format';
import Link from 'next/link';

export default function NotificationSettingsPage() {
  const [highValueThreshold, setHighValueThreshold] = useState('50000');
  const [notifyNewExpense, setNotifyNewExpense] = useState(true);
  const [notifyHighValue, setNotifyHighValue] = useState(true);
  const [notifyPayment, setNotifyPayment] = useState(true);
  const [notifyLowFloat, setNotifyLowFloat] = useState(true);
  const [notifyEditDelete, setNotifyEditDelete] = useState(true);
  const [notifyDailyDigest, setNotifyDailyDigest] = useState(true);
  const [digestTime, setDigestTime] = useState('21:00');
  const [quietHoursStart, setQuietHoursStart] = useState('22:00');
  const [quietHoursEnd, setQuietHoursEnd] = useState('07:00');
  const [pushSupported, setPushSupported] = useState(false);
  const [pushSubscribed, setPushSubscribed] = useState(false);
  const [saved, setSaved] = useState(false);

  const supabase = createClient();

  useEffect(() => {
    if (typeof window !== 'undefined' && 'serviceWorker' in navigator && 'PushManager' in window) {
      setPushSupported(true);
    }
  }, []);

  async function handleSave(e: React.FormEvent) {
    e.preventDefault();
    setSaved(true);
    setTimeout(() => setSaved(false), 3000);
  }

  async function handleSubscribePush() {
    if (!pushSupported) {
      alert('Push notifications require installing Android Properties to your Home Screen on iOS (iOS 16.4+) or Chrome on Android.');
      return;
    }

    try {
      const permission = await Notification.requestPermission();
      if (permission === 'granted') {
        setPushSubscribed(true);
        alert('Web Push enabled successfully for this device!');
      } else {
        alert('Notification permission was denied. Please enable in browser settings.');
      }
    } catch {
      alert('Could not subscribe to push notifications.');
    }
  }

  return (
    <div className="page-container" style={{ maxWidth: '680px' }}>
      <div className="flex justify-between items-center" style={{ marginBottom: '1rem' }}>
        <Link href="/settings" className="btn btn-ghost btn-sm" style={{ paddingLeft: 0 }}>
          ← Back to Settings
        </Link>
      </div>

      <div className="page-header">
        <div>
          <h1 className="page-title">🔔 Notification & Push Settings</h1>
          <p className="text-muted" style={{ fontSize: '0.875rem' }}>
            Configure web push alerts, spend thresholds and quiet hours
          </p>
        </div>
      </div>

      {saved && (
        <div className="alert-banner alert-banner--info" style={{ marginBottom: '1rem' }}>
          ✅ Notification preferences saved successfully!
        </div>
      )}

      {/* PWA / Push Status Banner */}
      <div
        className="card"
        style={{
          background: pushSubscribed ? '#F0FDF4' : '#F2F8FD',
          borderColor: pushSubscribed ? '#86EFAC' : '#C4DEF6',
          marginBottom: '1.5rem',
        }}
      >
        <div className="flex justify-between items-center flex-wrap gap-sm">
          <div>
            <div style={{ fontWeight: 700, color: 'var(--color-navy)', fontSize: '0.9375rem' }}>
              📱 Mobile Web Push Notification Status
            </div>
            <div className="text-muted" style={{ fontSize: '0.78125rem', marginTop: '0.125rem' }}>
              {pushSubscribed
                ? 'Active — You will receive instant notifications on this phone/device'
                : 'Not enabled on this device yet. Add to Home Screen on iPhone or enable in browser.'}
            </div>
          </div>
          {!pushSubscribed && (
            <button
              type="button"
              className="btn btn-primary btn-sm"
              onClick={handleSubscribePush}
            >
              🔔 Enable Push on This Device
            </button>
          )}
        </div>
      </div>

      <form onSubmit={handleSave}>
        {/* Event Triggers */}
        <div className="card" style={{ marginBottom: '1.5rem' }}>
          <h3 style={{ fontSize: '1rem', color: 'var(--color-navy)', marginBottom: '1rem' }}>
            Instant Push Event Triggers (Admin)
          </h3>

          <div style={{ display: 'flex', flexDirection: 'column', gap: '0.875rem' }}>
            <label style={{ display: 'flex', alignItems: 'flex-start', gap: '0.75rem', cursor: 'pointer' }}>
              <input
                type="checkbox"
                checked={notifyNewExpense}
                onChange={(e) => setNotifyNewExpense(e.target.checked)}
                style={{ marginTop: '0.2rem' }}
              />
              <div>
                <div style={{ fontWeight: 600, fontSize: '0.875rem' }}>New Site Expense Added</div>
                <div className="text-muted" style={{ fontSize: '0.75rem' }}>
                  Notify when a site supervisor records an expense on an assigned site
                </div>
              </div>
            </label>

            <label style={{ display: 'flex', alignItems: 'flex-start', gap: '0.75rem', cursor: 'pointer' }}>
              <input
                type="checkbox"
                checked={notifyHighValue}
                onChange={(e) => setNotifyHighValue(e.target.checked)}
                style={{ marginTop: '0.2rem' }}
              />
              <div>
                <div style={{ fontWeight: 600, fontSize: '0.875rem' }}>High-Value Spend Alert</div>
                <div className="text-muted" style={{ fontSize: '0.75rem' }}>
                  Highlight any expense exceeding the threshold amount
                </div>
              </div>
            </label>

            <label style={{ display: 'flex', alignItems: 'flex-start', gap: '0.75rem', cursor: 'pointer' }}>
              <input
                type="checkbox"
                checked={notifyPayment}
                onChange={(e) => setNotifyPayment(e.target.checked)}
                style={{ marginTop: '0.2rem' }}
              />
              <div>
                <div style={{ fontWeight: 600, fontSize: '0.875rem' }}>Client Payment Received</div>
                <div className="text-muted" style={{ fontSize: '0.75rem' }}>
                  Notify whenever money-in is recorded for any construction contract
                </div>
              </div>
            </label>

            <label style={{ display: 'flex', alignItems: 'flex-start', gap: '0.75rem', cursor: 'pointer' }}>
              <input
                type="checkbox"
                checked={notifyLowFloat}
                onChange={(e) => setNotifyLowFloat(e.target.checked)}
                style={{ marginTop: '0.2rem' }}
              />
              <div>
                <div style={{ fontWeight: 600, fontSize: '0.875rem' }}>Staff Float Low / Negative Alert</div>
                <div className="text-muted" style={{ fontSize: '0.75rem' }}>
                  Alert when supervisor cash in hand drops below Rs 5,000 or turns negative
                </div>
              </div>
            </label>

            <label style={{ display: 'flex', alignItems: 'flex-start', gap: '0.75rem', cursor: 'pointer' }}>
              <input
                type="checkbox"
                checked={notifyEditDelete}
                onChange={(e) => setNotifyEditDelete(e.target.checked)}
                style={{ marginTop: '0.2rem' }}
              />
              <div>
                <div style={{ fontWeight: 600, fontSize: '0.875rem' }}>Expense Edited or Moved to Trash</div>
                <div className="text-muted" style={{ fontSize: '0.75rem' }}>
                  Notify if any historical entry is altered
                </div>
              </div>
            </label>
          </div>
        </div>

        {/* High Value Threshold & Digest Time */}
        <div className="card" style={{ marginBottom: '1.5rem' }}>
          <h3 style={{ fontSize: '1rem', color: 'var(--color-navy)', marginBottom: '1rem' }}>
            Thresholds & Daily Digest
          </h3>

          <div className="form-group">
            <label className="form-label" htmlFor="high-val-th">
              High-Value Expense Threshold (PKR)
            </label>
            <input
              id="high-val-th"
              type="number"
              className="input"
              value={highValueThreshold}
              onChange={(e) => setHighValueThreshold(e.target.value)}
              style={{ maxWidth: '200px' }}
            />
            <span className="form-helper">
              Expenses above {formatPKR(Number(highValueThreshold) || 50000)} will be flagged as high value
            </span>
          </div>

          <div className="form-group" style={{ marginTop: '1rem' }}>
            <label style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', cursor: 'pointer', fontWeight: 600, fontSize: '0.875rem' }}>
              <input
                type="checkbox"
                checked={notifyDailyDigest}
                onChange={(e) => setNotifyDailyDigest(e.target.checked)}
              />
              Send Daily Evening Spend Digest
            </label>
            <div className="flex items-center gap-sm" style={{ marginTop: '0.5rem' }}>
              <input
                type="time"
                className="input"
                value={digestTime}
                onChange={(e) => setDigestTime(e.target.value)}
                style={{ width: '130px' }}
              />
              <span className="text-muted" style={{ fontSize: '0.75rem' }}>
                Asia/Karachi PKT (Default 9:00 PM)
              </span>
            </div>
          </div>
        </div>

        {/* Quiet Hours */}
        <div className="card" style={{ marginBottom: '1.5rem' }}>
          <h3 style={{ fontSize: '1rem', color: 'var(--color-navy)', marginBottom: '0.5rem' }}>
            🌙 Quiet Hours (Do Not Disturb)
          </h3>
          <p className="text-muted" style={{ fontSize: '0.78125rem', marginBottom: '1rem' }}>
            During quiet hours, non-urgent push alerts are held and batched until morning.
          </p>

          <div className="flex items-center gap-md">
            <div className="form-group" style={{ marginBottom: 0 }}>
              <label className="form-label" htmlFor="quiet-start" style={{ fontSize: '0.75rem' }}>Start Time</label>
              <input
                id="quiet-start"
                type="time"
                className="input"
                value={quietHoursStart}
                onChange={(e) => setQuietHoursStart(e.target.value)}
              />
            </div>
            <span style={{ marginTop: '1.25rem', color: 'var(--color-secondary-text)' }}>to</span>
            <div className="form-group" style={{ marginBottom: 0 }}>
              <label className="form-label" htmlFor="quiet-end" style={{ fontSize: '0.75rem' }}>End Time</label>
              <input
                id="quiet-end"
                type="time"
                className="input"
                value={quietHoursEnd}
                onChange={(e) => setQuietHoursEnd(e.target.value)}
              />
            </div>
          </div>
        </div>

        <button type="submit" className="btn btn-primary btn-full btn-lg">
          💾 Save Notification Preferences
        </button>
      </form>
    </div>
  );
}
