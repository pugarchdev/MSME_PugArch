'use client';

import React, { useEffect, useRef, useState } from 'react';
import { X, Gavel, BellRing } from 'lucide-react';
import { useAuth } from '../../hooks/useAuth';
import { getApi, postApi } from '../shared/apiClient';
import { routeForNotification, type PortalNotification } from '../../lib/notifications';

const AUTO_HIDE_MS = 5000;

/**
 * Shows pending invitation notifications as a popup for 5 seconds right after
 * login (once per browser session per user). Dismissible via the cross button;
 * clicking an invite marks it read and jumps to the invitation.
 */
export default function InviteLoginPopup() {
  const { user } = useAuth();
  const [invites, setInvites] = useState<PortalNotification[]>([]);
  const [visible, setVisible] = useState(false);
  const hideTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    if (!user?.id) return;
    const sessionKey = `invite-popup-shown:${user.id}`;
    if (sessionStorage.getItem(sessionKey)) return;

    let alive = true;
    getApi<any>('/api/notifications?status=unread&pageSize=20')
      .then(data => {
        if (!alive) return;
        const list: PortalNotification[] = Array.isArray(data?.notifications) ? data.notifications : [];
        const pendingInvites = list.filter(item => String(item.type || '').toLowerCase().includes('invit'));
        if (pendingInvites.length === 0) return;
        sessionStorage.setItem(sessionKey, '1');
        setInvites(pendingInvites.slice(0, 3));
        setVisible(true);
        hideTimer.current = setTimeout(() => setVisible(false), AUTO_HIDE_MS);
      })
      .catch(() => { /* silent — popup is best-effort */ });

    return () => {
      alive = false;
      if (hideTimer.current) clearTimeout(hideTimer.current);
    };
  }, [user?.id]);

  if (!visible || invites.length === 0) return null;

  const close = () => {
    if (hideTimer.current) clearTimeout(hideTimer.current);
    setVisible(false);
  };

  const openInvite = (invite: PortalNotification) => {
    close();
    postApi(`/api/notifications/${invite.id}/read`, {}).catch(() => undefined);
    const route = routeForNotification(invite, user?.role, user);
    if (route) window.location.href = route;
  };

  return (
    <div
      role="alertdialog"
      aria-label="Pending invitations"
      className="fixed right-4 top-16 z-[90] w-[min(92vw,380px)] overflow-hidden rounded-2xl border border-blue-200 bg-white shadow-2xl animate-in slide-in-from-top-4 fade-in duration-300"
    >
      <div className="flex items-center justify-between gap-3 border-b border-blue-100 bg-blue-50/70 px-4 py-3">
        <div className="flex items-center gap-2">
          <span className="flex h-8 w-8 items-center justify-center rounded-xl bg-[#12335f] text-white">
            <BellRing className="h-4 w-4" />
          </span>
          <div>
            <p className="text-xs font-black uppercase tracking-wider text-[#12335f]">
              You have {invites.length > 1 ? `${invites.length} invitations` : 'an invitation'}
            </p>
            <p className="text-[10px] font-semibold text-slate-500">Buyers invited your organization to participate</p>
          </div>
        </div>
        <button
          type="button"
          onClick={close}
          aria-label="Dismiss invitations popup"
          className="inline-flex h-7 w-7 shrink-0 items-center justify-center rounded-full border border-slate-200 bg-white text-slate-500 transition hover:border-red-300 hover:text-red-600"
        >
          <X className="h-4 w-4" />
        </button>
      </div>
      <div className="divide-y divide-slate-100">
        {invites.map(invite => (
          <button
            key={invite.id}
            type="button"
            onClick={() => openInvite(invite)}
            className="flex w-full items-start gap-2.5 px-4 py-3 text-left transition hover:bg-blue-50/40"
          >
            <Gavel className="mt-0.5 h-4 w-4 shrink-0 text-[#c86413]" />
            <span className="min-w-0">
              <span className="block text-xs font-black text-slate-900">{invite.title || 'Invitation'}</span>
              <span className="mt-0.5 block text-[11px] font-semibold leading-relaxed text-slate-500 line-clamp-2">
                {invite.message}
              </span>
            </span>
          </button>
        ))}
      </div>
    </div>
  );
}
