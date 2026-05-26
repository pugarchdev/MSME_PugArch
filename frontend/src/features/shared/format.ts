/**
 * Shared formatting helpers used across feature pages.
 *
 * `formatDate` shows just the date, `formatDateTime` shows date + time so
 * audit logs and admin queues display when something happened down to the
 * minute. Both are tolerant of nulls/undefined so callers don't have to
 * defensively check.
 */

const safeDate = (value: unknown): Date | null => {
  if (!value) return null;
  const d = value instanceof Date ? value : new Date(String(value));
  return Number.isFinite(d.getTime()) ? d : null;
};

export const formatDate = (value: unknown): string => {
  const d = safeDate(value);
  if (!d) return '—';
  return d.toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' });
};

export const formatDateTime = (value: unknown): string => {
  const d = safeDate(value);
  if (!d) return '—';
  // 24 May 2026, 14:32
  return `${d.toLocaleDateString('en-IN', {
    day: '2-digit',
    month: 'short',
    year: 'numeric'
  })}, ${d.toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit', hour12: false })}`;
};

/** Distance from now in friendly form: "5 minutes ago", "2 days ago". */
export const formatRelative = (value: unknown): string => {
  const d = safeDate(value);
  if (!d) return '—';
  const diffMs = Date.now() - d.getTime();
  const sec = Math.round(diffMs / 1000);
  if (sec < 0) return 'just now';
  if (sec < 60) return `${sec}s ago`;
  const min = Math.round(sec / 60);
  if (min < 60) return `${min} min${min === 1 ? '' : 's'} ago`;
  const hr = Math.round(min / 60);
  if (hr < 24) return `${hr} hr${hr === 1 ? '' : 's'} ago`;
  const day = Math.round(hr / 24);
  if (day < 30) return `${day} day${day === 1 ? '' : 's'} ago`;
  return formatDate(d);
};

export const formatCurrency = (value: unknown, currency = 'INR'): string => {
  const num = typeof value === 'string' ? Number(value) : (value as number);
  if (!Number.isFinite(num)) return '—';
  return new Intl.NumberFormat('en-IN', {
    style: 'currency',
    currency,
    maximumFractionDigits: 2
  }).format(num);
};

export const formatNumber = (value: unknown): string => {
  const num = typeof value === 'string' ? Number(value) : (value as number);
  if (!Number.isFinite(num)) return '—';
  return new Intl.NumberFormat('en-IN').format(num);
};

export const maskEmail = (email?: string | null): string => {
  if (!email) return '—';
  const [local = '', domain = ''] = email.split('@');
  if (!domain) return email;
  const visible = local.slice(0, Math.min(2, local.length));
  return `${visible}${'*'.repeat(Math.max(1, local.length - visible.length))}@${domain}`;
};
