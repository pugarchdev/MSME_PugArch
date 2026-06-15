import { useEffect, useState } from 'react';
import { useAuth } from '../hooks/useAuth';
import { api, unwrapApiData } from '../lib/api';
import { useRouter } from 'next/navigation';
import { Bell, CheckCircle2, AlertTriangle, Info, ArrowLeft, Check, CheckSquare } from 'lucide-react';
import { Button } from '../components/ui/button';
import { toast } from 'sonner';
import { routeForNotification, type PortalNotification } from '../lib/notifications';
import { Pagination } from '../features/shared/Pagination';
import { EntityIdLink } from '../features/shared/EntityIdLink';
import { EntityDetailModal } from '../features/shared/EntityDetailModal';
import { formatDateTime } from '../features/shared/format';

export default function NotificationCenter() {
  const { token, user } = useAuth();
  const router = useRouter();
  const [notifications, setNotifications] = useState<PortalNotification[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [page, setPage] = useState(1);
  const [pageSize, setPageSizeState] = useState(20);
  const [total, setTotal] = useState(0);
  const [detailRecord, setDetailRecord] = useState<PortalNotification | null>(null);

  const fetchNotifications = async () => {
    if (!token) return;
    try {
      const params = new URLSearchParams({ skip: String((page - 1) * pageSize), take: String(pageSize) });
      const res = await api.fetch(`/api/notifications?${params.toString()}`, {
        headers: { Authorization: `Bearer ${token}` }
      });
      if (res.ok) {
        const data = await res.json();
        const body = unwrapApiData<any>(data);
        const items = Array.isArray(body) ? body : body.notifications || body.records || [];
        setNotifications(Array.isArray(items) ? items : []);
        setTotal(Number(body?.total ?? 0));
      }
    } catch (err) {
      console.error('Failed to fetch notifications:', err);
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    if (!token) {
      router.replace('/');
      return;
    }
    void fetchNotifications();
  }, [token, page, pageSize]);

  const handleMarkAsRead = async (id: number | string) => {
    if (!token) return;
    try {
      const res = await api.post(`/api/notifications/${id}/read`, {}, {
        headers: { Authorization: `Bearer ${token}` }
      });
      if (res.ok) {
        setNotifications(prev => prev.map(n => n.id === id ? { ...n, isRead: true } : n));
        window.dispatchEvent(new CustomEvent('notifications:updated'));
        toast.success("Notification marked as read");
      }
    } catch (err) {
      console.error('Failed to mark notification as read:', err);
      toast.error("Failed to update notification");
    }
  };

  const handleMarkAllAsRead = async () => {
    if (!token) return;
    try {
      const res = await api.post('/api/notifications/read-all', {}, {
        headers: { Authorization: `Bearer ${token}` }
      });
      if (res.ok) {
        setNotifications(prev => prev.map(n => ({ ...n, isRead: true })));
        window.dispatchEvent(new CustomEvent('notifications:updated'));
        toast.success("All notifications marked as read");
      }
    } catch (err) {
      console.error('Failed to mark all as read:', err);
      toast.error("Failed to update notifications");
    }
  };

  const handleOpenNotification = async (item: PortalNotification) => {
    if (!item.isRead) await handleMarkAsRead(item.id);
    router.push(routeForNotification(item, user?.role, user));
  };

  if (isLoading) {
    return (
      <div className="flex h-[60vh] items-center justify-center font-bold text-[#12335f] animate-pulse text-lg">
        Loading Notifications...
      </div>
    );
  }

  const unreadCount = notifications.filter(n => !n.isRead).length;
  const pagedNotifications = notifications;
  const setPageSize = (nextPageSize: number) => {
    setPageSizeState(nextPageSize);
    setPage(1);
  };

  return (
    <div className="space-y-6 max-w-4xl mx-auto p-4 sm:p-6 animate-in fade-in duration-500">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between border-b border-slate-200 pb-5">
        <div className="flex items-center gap-3">
          <button
            onClick={() => router.back()}
            className="p-2 rounded-lg border border-slate-200 hover:bg-slate-50 transition-colors text-slate-500 hover:text-[#12335f]"
            title="Go Back"
          >
            <ArrowLeft className="h-5 w-5" />
          </button>
          <div>
            <h1 className="text-2xl font-extrabold text-[#12335f] uppercase tracking-tight flex items-center gap-2.5">
              <Bell className="h-6 w-6 text-[#12335f]" />
              <span>Notification Center</span>
            </h1>
            <p className="text-sm text-slate-500 font-medium mt-1">
              Stay updated with system actions, procurement status, and compliance highlights.
            </p>
          </div>
        </div>

        {unreadCount > 0 && (
          <Button
            onClick={handleMarkAllAsRead}
            variant="outline"
            className="border-slate-200 text-[#12335f] hover:bg-slate-50 font-bold uppercase tracking-wider text-xs h-10 px-4 space-x-2"
          >
            <CheckSquare className="h-4 w-4" />
            <span>Mark All As Read</span>
          </Button>
        )}
      </div>

      <div className="bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden">
        <div className="bg-slate-50/50 px-5 py-4 border-b border-slate-200 flex items-center justify-between">
          <span className="text-xs font-black uppercase tracking-wider text-slate-600">Your Activity Logs</span>
          <span className="text-xs font-bold px-2.5 py-1 bg-slate-50 text-[#12335f] rounded-full border border-slate-100">
            {unreadCount} UNREAD / {total || notifications.length} TOTAL
          </span>
        </div>

        {notifications.length > 0 ? (
          <div className="divide-y divide-slate-100">
            {pagedNotifications.map((item) => {
              const Icon = item.type === 'alert' ? AlertTriangle : item.type === 'success' ? CheckCircle2 : Info;
              const isWarning = item.type === 'alert';
              const isSuccess = item.type === 'success';

              return (
                <div
                  key={item.id}
                  className={`p-5 flex flex-col sm:flex-row sm:items-start gap-4 transition-all duration-200 ${!item.isRead ? 'bg-slate-50/30 font-semibold' : 'bg-white opacity-85 hover:opacity-100'
                    }`}
                >
                  <div className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-white border border-slate-100 shadow-sm ${isWarning ? 'text-red-500' : isSuccess ? 'text-emerald-600' : 'text-[#12335f]'
                    }`}>
                    <Icon className="h-5 w-5" />
                  </div>

                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <EntityIdLink
                        label={`NTF-${item.id}`}
                        id={item.id}
                        size="sm"
                        onClick={() => setDetailRecord(item)}
                      />
                      <span className={`text-[10px] font-black uppercase tracking-widest ${isWarning ? 'text-red-600' : isSuccess ? 'text-emerald-700' : 'text-[#12335f]'
                        }`}>
                        {item.title}
                      </span>
                      {!item.isRead && (
                        <span className="h-2 w-2 bg-[#f9a825] rounded-full" />
                      )}
                    </div>
                    <p className="mt-1.5 text-sm text-slate-800 font-semibold leading-relaxed text-wrap-anywhere">
                      {item.message}
                    </p>
                    {item.createdAt && (
                      <p className="mt-2 text-[10px] font-bold uppercase tracking-widest text-slate-400">
                        {formatDateTime(item.createdAt)}
                      </p>
                    )}
                  </div>

                  <div className="flex items-center gap-2 shrink-0 self-end sm:self-start">
                    <Button
                      onClick={() => handleOpenNotification(item)}
                      variant="ghost"
                      size="sm"
                      className="text-[#12335f] hover:bg-slate-100 text-xs font-bold uppercase tracking-wider h-8"
                    >
                      Open
                    </Button>

                    {!item.isRead && (
                      <button
                        onClick={() => handleMarkAsRead(item.id)}
                        className="p-1.5 rounded-lg border border-slate-200 hover:bg-slate-50 transition-colors text-slate-500 hover:text-emerald-600"
                        title="Mark as Read"
                      >
                        <Check className="h-4 w-4" />
                      </button>
                    )}
                  </div>
                </div>
              );
            })}
            <Pagination page={page} pageSize={pageSize} total={total} onPageChange={setPage} onPageSizeChange={setPageSize} label="notifications" />
          </div>
        ) : (
          <div className="text-center py-20">
            <Bell className="h-12 w-12 text-slate-200 mx-auto mb-4" />
            <h3 className="text-sm font-bold text-slate-600 uppercase tracking-widest">No notifications</h3>
            <p className="text-xs text-slate-400 font-semibold mt-1">We'll alert you when something important occurs.</p>
          </div>
        )}
      </div>

      <EntityDetailModal
        open={!!detailRecord}
        title={detailRecord ? `Notification ${detailRecord.title}` : 'Notification'}
        subtitle={detailRecord ? `NTF-${detailRecord.id}` : undefined}
        entity={detailRecord}
        onClose={() => setDetailRecord(null)}
        footer={detailRecord && (
          <div className="flex justify-end gap-2">
            <Button
              variant="outline"
              size="sm"
              onClick={() => {
                if (detailRecord) handleOpenNotification(detailRecord);
                setDetailRecord(null);
              }}
            >
              Open in module
            </Button>
            {!detailRecord.isRead && (
              <Button
                size="sm"
                onClick={() => {
                  if (detailRecord) handleMarkAsRead(detailRecord.id);
                  setDetailRecord(null);
                }}
              >
                Mark as read
              </Button>
            )}
          </div>
        )}
      />
    </div>
  );
}
