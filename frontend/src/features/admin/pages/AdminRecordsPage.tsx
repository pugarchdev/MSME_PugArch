import React, { useMemo, useState, useEffect } from 'react';
import { AlertTriangle, ArrowDown, ArrowUp, ArrowUpDown, Eye, Filter, RefreshCw, Search, ShieldCheck, Users, X, Grid, List, Save, Edit3, Trash2 } from 'lucide-react';
import { Button } from '../../../components/ui/button';
import { Card, CardContent } from '../../../components/ui/card';
import { cn } from '../../../lib/utils';
import { EmptyState, ErrorState, LoadingState } from '../../shared/FeatureStates';
import { Pagination } from '../../shared/Pagination';
import { formatDate } from '../../shared/format';
import { useFeatureQuery, useResponsiveViewMode } from '../../shared/hooks';
import { EntityIdLink } from '../../shared/EntityIdLink';
import { ViewModeToggle } from '../../shared/ViewModeToggle';
import { toast } from 'sonner';
import { api } from '../../../lib/api';
import { useAuth } from '../../../hooks/useAuth';




type AdminKind = 'users' | 'audit' | 'fraud' | 'rules';
type RecordMap = Record<string, any>;

const config = {
  users: {
    title: 'Users',
    eyebrow: 'Admin Registry',
    description: 'Account status, registration status, role, onboarding state, sessions, and compliance signals.',
    endpoint: '/api/admin/users',
    icon: Users
  },
  audit: {
    title: 'Audit Logs',
    eyebrow: 'Administrative Trail',
    description: 'Write actions, actors, affected entities, and immutable event payloads.',
    endpoint: '/api/admin/audit-logs',
    icon: Eye
  },
  fraud: {
    title: 'Fraud Alerts',
    eyebrow: 'Risk Monitoring',
    description: 'Risk alerts, severity, review state, linked user, and entity references.',
    endpoint: '/api/admin/fraud-alerts',
    icon: AlertTriangle
  },
  rules: {
    title: 'Compliance Rules',
    eyebrow: 'Policy Controls',
    description: 'Active compliance rules, severity, violation samples, and control coverage.',
    endpoint: '/api/admin/compliance-rules',
    icon: ShieldCheck
  }
} satisfies Record<AdminKind, { title: string; eyebrow: string; description: string; endpoint: string; icon: any }>;

const readRecords = (data: any): RecordMap[] => Array.isArray(data) ? data : data?.records || data?.data?.records || [];
const totalOf = (data: any, fallback: number) => Number(data?.total ?? data?.data?.total ?? fallback);
const label = (value: unknown) => String(value ?? '-').replace(/_/g, ' ');

const rowTitle = (kind: AdminKind, record: RecordMap) => {
  if (kind === 'users') return record.name || record.email || `User #${record.id}`;
  if (kind === 'audit') return record.action || `Audit #${record.id}`;
  if (kind === 'fraud') return record.alertType || `Alert #${record.id}`;
  return record.title || record.code || `Rule #${record.id}`;
};

const rowIdLabel = (kind: AdminKind, record: RecordMap) => {
  const id = record.id ?? '-';
  if (kind === 'users') return `USR-${id}`;
  if (kind === 'audit') return `AUD-${id}`;
  if (kind === 'fraud') return `FRD-${id}`;
  return `RUL-${id}`;
};

const rowSubtitle = (kind: AdminKind, record: RecordMap) => {
  if (kind === 'users') return [record.email, record.mobile, record.organization?.name, record.registrationStatus && `registration: ${record.registrationStatus}`, record.onboardingStatus && `onboarding: ${record.onboardingStatus}`].filter(Boolean).join(' | ');
  if (kind === 'audit') return [record.User?.email, record.entityType && `${record.entityType} #${record.entityId || '-'}`].filter(Boolean).join(' | ');
  if (kind === 'fraud') return [record.user?.email, record.entityType && `${record.entityType} #${record.entityId || '-'}`].filter(Boolean).join(' | ');
  return record.description || record.code || '-';
};

const statusOf = (kind: AdminKind, record: RecordMap) => {
  if (kind === 'users') return record.registrationStatus || record.onboardingStatus || record.accountStatus || record.role;
  if (kind === 'audit') return record.entityType || 'recorded';
  if (kind === 'rules') return record.isActive === false ? 'inactive' : 'active';
  return record.status || 'open';
};

const severityClass = (value: unknown) => {
  const normalized = String(value || '').toLowerCase();
  if (['critical', 'high'].includes(normalized)) return 'border-rose-200 bg-rose-50 text-rose-700';
  if (['medium', 'pending', 'under_compliance_review'].includes(normalized)) return 'border-amber-200 bg-amber-50 text-amber-700';
  if (['active', 'approved_for_procurement', 'low', 'closed', 'resolved'].includes(normalized)) return 'border-emerald-200 bg-emerald-50 text-emerald-700';
  return 'border-blue-200 bg-slate-50 text-[#12335f]';
};

export default function AdminRecordsPage({ kind }: { kind: AdminKind }) {
  const cfg = config[kind];
  const { user: currentUser } = useAuth();
  const [searchInput, setSearchInput] = useState('');
  const [query, setQuery] = useState('');
  const [role, setRole] = useState('');
  const [status, setStatus] = useState('');
  const [severity, setSeverity] = useState('');
  const [selected, setSelected] = useState<RecordMap | null>(null);
  const [editingUser, setEditingUser] = useState<RecordMap | null>(null);
  const [page, setPage] = useState(1);
  const [pageSize, setPageSizeState] = useState(20);
  const [showMobileFilters, setShowMobileFilters] = useState(false);
  const [viewMode, setViewMode] = useResponsiveViewMode();

  const [sortKey, setSortKey] = useState<string>('date');
  const [sortDirection, setSortDirection] = useState<'asc' | 'desc'>('desc');

  useEffect(() => {
    const handler = setTimeout(() => setQuery(searchInput), 400);
    return () => clearTimeout(handler);
  }, [searchInput]);

  useEffect(() => {
    setPage(1);
  }, [query, role, status, severity, kind]);

  const setPageSize = (nextPageSize: number) => {
    setPageSizeState(nextPageSize);
    setPage(1);
  };

  const handleToggleUserStatus = async (record: RecordMap) => {
    const currentUserId = currentUser?.id;
    if (currentUserId && Number(record.id) === Number(currentUserId)) {
      toast.error("You cannot deactivate your own account!");
      return;
    }

    const newStatus = record.accountStatus === 'ACTIVE' ? 'BLOCKED' : 'ACTIVE';

    // Optimistic UI Update
    setData((current: any) => {
      if (!current) return current;
      const recordsList = readRecords(current);
      const updatedList = recordsList.map((r: any) => r.id === record.id ? { ...r, accountStatus: newStatus } : r);
      if (Array.isArray(current)) return updatedList;
      return { ...current, records: updatedList };
    });

    try {
      const res = await fetch(`/api/admin/users/${record.id}/status`, {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${localStorage.getItem('token')}`
        },
        body: JSON.stringify({ accountStatus: newStatus })
      });
      if (res.ok) {
        toast.success(`User status updated to ${newStatus === 'ACTIVE' ? 'Active' : 'Inactive'}`);
        api.invalidate();
        reload();
      } else {
        const body = await res.json().catch(() => ({}));
        toast.error(body?.message || 'Failed to update status');
        // Rollback
        setData((current: any) => {
          if (!current) return current;
          const recordsList = readRecords(current);
          const updatedList = recordsList.map((r: any) => r.id === record.id ? { ...r, accountStatus: record.accountStatus } : r);
          if (Array.isArray(current)) return updatedList;
          return { ...current, records: updatedList };
        });
      }
    } catch (err) {
      toast.error('Unable to update user status');
      // Rollback
      setData((current: any) => {
        if (!current) return current;
        const recordsList = readRecords(current);
        const updatedList = recordsList.map((r: any) => r.id === record.id ? { ...r, accountStatus: record.accountStatus } : r);
        if (Array.isArray(current)) return updatedList;
        return { ...current, records: updatedList };
      });
    }
  };

  const handleDeleteUser = async (record: RecordMap) => {
    const currentUserId = currentUser?.id;
    if (currentUserId && Number(record.id) === Number(currentUserId)) {
      toast.error("You cannot delete your own account!");
      return;
    }

    if (!window.confirm(`Are you sure you want to permanently delete user "${record.name || record.email}"? This will clean up all active sessions, compliance violations, and fraud alerts for this user.`)) {
      return;
    }

    // Optimistic UI Update (remove from local list)
    setData((current: any) => {
      if (!current) return current;
      const recordsList = readRecords(current);
      const updatedList = recordsList.filter((r: any) => r.id !== record.id);
      if (Array.isArray(current)) return updatedList;
      return { ...current, records: updatedList };
    });

    try {
      const res = await fetch(`/api/admin/users/${record.id}`, {
        method: 'DELETE',
        headers: {
          'Authorization': `Bearer ${localStorage.getItem('token')}`
        }
      });
      if (res.ok) {
        toast.success("User successfully deleted");
        api.invalidate();
        reload();
      } else {
        const body = await res.json().catch(() => ({}));
        toast.error(body?.message || "Failed to delete user");
        api.invalidate();
        reload();
      }
    } catch (err) {
      toast.error("Unable to delete user");
      api.invalidate();
      reload();
    }
  };

  const handleUpdateUser = async (updatedFields: { name: string; email: string; mobile: string; role: string }) => {
    if (!editingUser) return;

    // Optimistic UI Update
    setData((current: any) => {
      if (!current) return current;
      const recordsList = readRecords(current);
      const updatedList = recordsList.map((r: any) => r.id === editingUser.id ? { ...r, ...updatedFields } : r);
      if (Array.isArray(current)) return updatedList;
      return { ...current, records: updatedList };
    });

    try {
      const res = await fetch(`/api/admin/users/${editingUser.id}`, {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${localStorage.getItem('token')}`
        },
        body: JSON.stringify(updatedFields)
      });
      if (res.ok) {
        toast.success("User updated successfully");
        setEditingUser(null);
        api.invalidate();
        reload();
      } else {
        const body = await res.json().catch(() => ({}));
        toast.error(body?.message || "Failed to update user");
        api.invalidate();
        reload();
      }
    } catch (err) {
      toast.error("Unable to update user");
      api.invalidate();
      reload();
    }
  };

  const params = new URLSearchParams();
  params.set('skip', String((page - 1) * pageSize));
  params.set('take', String(pageSize));
  if (query.trim()) params.set('q', query.trim());
  if (role) params.set('role', role);
  if (status) params.set('status', status);
  if (kind === 'users' && status) {
    if (['completed', 'incomplete'].includes(status)) params.set('registrationStatus', status);
    else params.set('accountStatus', status);
  }
  if (severity) params.set('severity', severity);
  const endpoint = `${cfg.endpoint}${params.toString() ? `?${params.toString()}` : ''}`;
  const { data, loading, error, reload, setData } = useFeatureQuery<any>(endpoint, { records: [] });
  let records = readRecords(data);

  const total = totalOf(data, records.length);
  const Icon = cfg.icon;

  const valueForSort = (record: RecordMap) => {
    if (sortKey === 'record') return rowTitle(kind, record);
    if (sortKey === 'status') return String(statusOf(kind, record));
    if (sortKey === 'severity') return record.severity || record.role || record.alertType || '';
    if (sortKey === 'date') return new Date(record.createdAt || record.updatedAt || 0).getTime();
    return '';
  };

  records = [...records].sort((a, b) => {
    const aVal = valueForSort(a);
    const bVal = valueForSort(b);
    const res = typeof aVal === 'number' && typeof bVal === 'number'
      ? aVal - bVal
      : String(aVal).localeCompare(String(bVal));
    return sortDirection === 'asc' ? res : -res;
  });

  const toggleSort = (key: string) => {
    setSortDirection(prev => sortKey === key && prev === 'asc' ? 'desc' : 'asc');
    setSortKey(key);
  };

  const SortHead = ({ label, field }: { label: string; field: string }) => (
    <button
      type="button"
      onClick={() => toggleSort(field)}
      className="inline-flex items-center gap-1 text-left hover:text-slate-700"
    >
      {label}
      <span className="text-slate-400">
        {sortKey === field ? (
          sortDirection === 'asc' ? <ArrowUp className="h-3 w-3" /> : <ArrowDown className="h-3 w-3" />
        ) : (
          <ArrowUpDown className="h-3 w-3 opacity-50" />
        )}
      </span>
    </button>
  );

  const metrics = useMemo(() => {
    if (kind === 'users') {
      const activeCount = records.filter(r => r.accountStatus === 'ACTIVE').length;
      return [
        { label: 'Total Users', value: total },
        { label: 'Active Users', value: activeCount }
      ];
    }
    const open = records.filter(record => ['open', 'pending', 'PENDING', 'under_compliance_review'].includes(String(statusOf(kind, record)))).length;
    const critical = records.filter(record => ['HIGH', 'CRITICAL', 'high', 'critical'].includes(String(record.severity))).length;
    return [
      { label: 'Loaded', value: records.length },
      { label: 'Matched', value: total },
      { label: kind === 'fraud' || kind === 'rules' ? 'High Risk' : 'Pending', value: kind === 'fraud' || kind === 'rules' ? critical : open }
    ];
  }, [kind, records, total]);


  if (loading && records.length === 0) return <LoadingState label={`Loading ${cfg.title.toLowerCase()}...`} />;
  if (error) return <ErrorState message={error} onRetry={reload} />;

  return (
    <div className="space-y-4">
      <div className="flex flex-col gap-3 border-b border-slate-200 pb-4 md:flex-row md:items-end md:justify-between">
        <div>
          <p className="text-[10px] font-black uppercase tracking-widest text-[#12335f]">{cfg.eyebrow}</p>
          <h1 className="text-2xl font-black tracking-tight text-slate-950">{cfg.title}</h1>
          <p className="mt-1 max-w-3xl text-xs font-semibold text-slate-500">{cfg.description}</p>
        </div>
        <div className="flex items-center gap-2">
          <ViewModeToggle value={viewMode} onChange={setViewMode} />
          <Button variant="outline" onClick={reload} className="h-10 rounded-lg text-xs font-black uppercase"><RefreshCw className="mr-2 h-4 w-4" />Refresh</Button>
        </div>
      </div>

      <div className={cn("grid gap-3", kind === 'users' ? "grid-cols-2" : "grid-cols-2 md:grid-cols-3")}>
        {metrics.map(item => (
          <Card key={item.label} className="border-slate-200/80 shadow-sm"><CardContent className="flex items-center justify-between p-4"><div><p className="text-[9px] font-black uppercase tracking-widest text-slate-400">{item.label}</p><p className="mt-1 text-2xl font-black text-slate-950">{item.value}</p></div><Icon className="h-5 w-5 text-[#12335f]" /></CardContent></Card>
        ))}
      </div>


      <Card className="border-slate-200/80 shadow-sm bg-white">
        <CardContent className="p-4">
          <div className="flex flex-col lg:flex-row gap-2.5 items-center w-full">
            <div className="relative flex-1 w-full">
              <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
              <input value={searchInput} onChange={event => setSearchInput(event.target.value)} placeholder={`Search ${cfg.title.toLowerCase()}...`} className="h-10 w-full rounded-lg border border-slate-200 pl-10 pr-3 text-xs font-semibold outline-none focus:ring-2 focus:ring-[#12335f]/20 bg-slate-50/50 hover:bg-slate-50 focus:bg-white transition-all text-slate-900" />
            </div>

            <div className={cn(
              "flex-col sm:flex-row gap-2 w-full lg:w-auto shrink-0",
              showMobileFilters ? "flex" : "hidden lg:flex"
            )}>
              <select value={role} onChange={event => setRole(event.target.value)} disabled={kind !== 'users'} className="h-10 rounded-lg border border-slate-200 px-3 text-xs font-bold disabled:bg-slate-50 disabled:text-slate-300 w-full lg:w-[160px] bg-white text-slate-900 outline-none focus:ring-2 focus:ring-[#12335f]/20 transition-all"><option value="">All roles</option><option value="admin">Admin</option><option value="buyer">Buyer</option><option value="seller">Seller</option></select>
              <select value={status} onChange={event => setStatus(event.target.value)} className="h-10 rounded-lg border border-slate-200 px-3 text-xs font-bold w-full lg:w-[160px] bg-white text-slate-900 outline-none focus:ring-2 focus:ring-[#12335f]/20 transition-all"><option value="">All statuses</option><option value="completed">Registration completed</option><option value="incomplete">Registration incomplete</option><option value="approved_for_procurement">Approved onboarding</option><option value="PENDING">Pending account</option><option value="ACTIVE">Active account</option><option value="OPEN">Open</option><option value="CLOSED">Closed</option></select>
            </div>

            <Button
              type="button"
              variant="outline"
              onClick={() => setShowMobileFilters(!showMobileFilters)}
              className="lg:hidden h-10 w-full sm:w-auto gap-2 rounded-lg text-xs font-black uppercase tracking-wider border-slate-200 text-slate-700 hover:bg-slate-50 shrink-0"
            >
              <Filter className="h-4 w-4 text-slate-500" />
              <span>Filters {showMobileFilters ? '(Hide)' : '(Show)'}</span>
            </Button>
          </div>
        </CardContent>
      </Card>


      {records.length === 0 ? (
        <EmptyState title={kind === 'fraud' ? 'No active fraud alerts' : `No ${cfg.title.toLowerCase()} found`} />
      ) : viewMode === 'grid' ? (
        <>
          <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 xl:grid-cols-4 gap-4">
            {records.map((record, index) => (
              <AdminRecordCard
                key={`${kind}-${record.id || rowTitle(kind, record)}`}
                kind={kind}
                record={record}
                srNo={(page - 1) * pageSize + index + 1}
                onView={() => setSelected(record)}
                onToggleStatus={handleToggleUserStatus}
                onEdit={setEditingUser}
                onDelete={handleDeleteUser}
                currentUserId={currentUser ? Number(currentUser.id) : null}
              />
            ))}
          </div>
          <div className="mt-4 overflow-hidden rounded-lg border border-slate-200 bg-white">
            <Pagination page={page} pageSize={pageSize} total={total} onPageChange={setPage} onPageSizeChange={setPageSize} />
          </div>
        </>
      ) : (
        <div className="rounded-lg border border-slate-200 bg-white overflow-x-clip">
          <div className="overflow-x-auto">
            <table className="w-full min-w-[940px] text-left text-sm">
              <thead className="bg-slate-50 text-[10px] font-black uppercase tracking-wider text-slate-500">
                <tr>
                  <th className="p-3 w-16">Sr. No.</th>
                  <th className="p-3"><SortHead label="Record" field="record" /></th>
                  <th className="p-3"><SortHead label="Status" field="status" /></th>
                  <th className="p-3"><SortHead label="Severity/Role" field="severity" /></th>
                  <th className="p-3"><SortHead label="Date" field="date" /></th>
                  <th className="p-3">Action</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {records.map((record, index) => (
                  <tr key={`${kind}-${record.id || rowTitle(kind, record)}`} className="hover:bg-slate-50">
                    <td className="p-3 font-mono text-xs font-black text-slate-400">{String((page - 1) * pageSize + index + 1).padStart(2, '0')}</td>
                    <td className="p-3">
                      <EntityIdLink
                        label={rowIdLabel(kind, record)}
                        id={record.id}
                        size="sm"
                        onClick={() => setSelected(record)}
                      />
                      <p className="mt-1 font-black text-slate-900 text-wrap-anywhere">{rowTitle(kind, record)}</p>
                      <p className="text-[10px] font-semibold text-slate-500 text-wrap-anywhere">{rowSubtitle(kind, record) || `#${record.id || '-'}`}</p>
                    </td>
                    <td className="p-3">
                      {kind === 'users' ? (
                        <div className="flex items-center gap-2">
                          <button
                            type="button"
                            onClick={() => handleToggleUserStatus(record)}
                            className={cn(
                              "relative inline-flex h-5 w-9 shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors duration-200 ease-in-out focus:outline-none focus:ring-2 focus:ring-[#12335f] focus:ring-offset-2",
                              record.accountStatus === 'ACTIVE' ? "bg-emerald-500" : "bg-slate-300"
                            )}
                          >
                            <span
                              className={cn(
                                "pointer-events-none inline-block h-4 w-4 transform rounded-full bg-white shadow ring-0 transition duration-200 ease-in-out",
                                record.accountStatus === 'ACTIVE' ? "translate-x-4" : "translate-x-0"
                              )}
                            />
                          </button>
                          <span className={cn(
                            "text-[10px] font-black uppercase tracking-wider",
                            record.accountStatus === 'ACTIVE' ? "text-emerald-700" : "text-slate-500"
                          )}>
                            {record.accountStatus === 'ACTIVE' ? "Active" : "Inactive"}
                          </span>
                        </div>
                      ) : (
                        <span className={`rounded-lg border px-3 py-1 text-[10px] font-black uppercase ${severityClass(statusOf(kind, record))}`}>{label(statusOf(kind, record))}</span>
                      )}
                    </td>
                    <td className="p-3 text-xs font-black uppercase text-slate-700">{label(record.severity || record.role || record.alertType || '-')}</td>
                    <td className="p-3 text-xs font-bold text-slate-500">{formatDateTime(record.createdAt || record.updatedAt)}</td>
                    <td className="p-3">
                      <div className="flex items-center gap-1.5">
                        <Button variant="outline" onClick={() => setSelected(record)} className="h-9 rounded-lg text-xs font-black"><Eye className="mr-2 h-4 w-4" />View</Button>
                        {kind === 'users' && (
                          <>
                            <Button variant="outline" onClick={() => setEditingUser(record)} className="h-9 rounded-lg text-xs font-black text-blue-600 hover:text-blue-700 border-blue-100 hover:bg-blue-50/50"><Edit3 className="mr-2 h-4 w-4" />Edit</Button>
                            <Button variant="outline" onClick={() => handleDeleteUser(record)} className="h-9 rounded-lg text-xs font-black text-rose-600 hover:text-rose-700 border-rose-100 hover:bg-rose-50/50" disabled={Number(record.id) === Number(currentUser?.id)}><Trash2 className="mr-2 h-4 w-4" />Delete</Button>
                          </>
                        )}
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <Pagination page={page} pageSize={pageSize} total={total} onPageChange={setPage} onPageSizeChange={setPageSize} />
        </div>
      )}


      {selected && <DetailPanel kind={kind} record={selected} onClose={() => setSelected(null)} />}
      {editingUser && (
        <UserEditModal
          user={editingUser}
          onClose={() => setEditingUser(null)}
          onSave={handleUpdateUser}
        />
      )}
    </div>
  );
}

function signalText(kind: AdminKind, record: RecordMap) {
  if (kind === 'users') return `${record.sessions?.length || 0} sessions | ${record.complianceViolations?.length || 0} flags`;
  if (kind === 'audit') return record.entityType ? `${record.entityType} #${record.entityId || '-'}` : 'System event';
  if (kind === 'fraud') return record.reviewedAt ? `Reviewed ${formatDate(record.reviewedAt)}` : 'Awaiting review';
  return `${record.violations?.length || 0} recent violations`;
}

function formatDateTime(dateVal: any) {
  if (!dateVal) return '—';
  const d = new Date(dateVal);
  if (isNaN(d.getTime())) return '—';

  const dateStr = d.toLocaleDateString('en-IN', {
    day: '2-digit',
    month: 'short',
    year: 'numeric'
  });

  const timeStr = d.toLocaleTimeString('en-IN', {
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hour12: true
  });

  return `${dateStr} ${timeStr}`;
}

function DetailPanel({ kind, record, onClose }: { kind: AdminKind; record: RecordMap; onClose: () => void }) {
  const safeRecord = { ...record };
  delete safeRecord.password;

  // For users kind, show a structured detail view
  if (kind === 'users') {
    const profile = record.profile || {};
    const org = record.organization || {};
    const sessions = record.sessions || [];
    const violations = record.complianceViolations || [];
    const sectionStatus = record.sectionStatus || {};

    return (
      <div className="fixed inset-0 z-50 flex justify-end bg-slate-950/30" onClick={onClose}>
        <aside className="h-full w-full max-w-2xl overflow-y-auto bg-white shadow-xl" onClick={e => e.stopPropagation()}>
          {/* Header */}
          <div className="sticky top-0 z-10 border-b border-slate-200 bg-gradient-to-r from-[#12335f] to-[#2563eb] p-5 text-white">
            <div className="flex items-start justify-between">
              <div className="flex items-start gap-4">
                <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-lg bg-white/15 text-lg font-black backdrop-blur-sm">
                  {(record.name || '?').charAt(0).toUpperCase()}
                </div>
                <div>
                  <p className="text-[10px] font-black uppercase tracking-widest text-blue-200">User Detail</p>
                  <h2 className="mt-0.5 text-xl font-black">{record.name || 'Unnamed User'}</h2>
                  <p className="mt-0.5 text-xs font-medium text-slate-100">{record.email || 'No email'}</p>
                </div>
              </div>
              <button onClick={onClose} className="rounded-lg border border-white/20 bg-white/10 p-2 text-white hover:bg-white/20" aria-label="Close detail"><X className="h-4 w-4" /></button>
            </div>
          </div>

          <div className="space-y-5 p-5">
            {/* Quick Status Cards */}
            <div className="grid gap-3 sm:grid-cols-3">
              <DetailMetric label="Account Status" value={label(record.accountStatus || record.onboardingStatus || 'pending')} />
              <DetailMetric label="Role" value={label(record.role || '-')} />
              <DetailMetric label="Registered" value={formatDate(record.createdAt)} />
            </div>

            {/* Contact Information */}
            <DetailSection title="Contact Information">
              <div className="grid gap-3 sm:grid-cols-2">
                <DetailField label="Full Name" value={record.name} />
                <DetailField label="Email" value={record.email} />
                <DetailField label="Mobile" value={record.mobile || record.phone} />
                <DetailField label="Alternate Phone" value={record.alternatePhone} />
              </div>
            </DetailSection>

            {/* Organization */}
            {(org.id || org.organizationName || profile.businessName || profile.organizationName) && (
              <DetailSection title="Organization">
                <div className="grid gap-3 sm:grid-cols-2">
                  <DetailField label="Organization Name" value={org.organizationName || profile.businessName || profile.organizationName} />
                  {org.id && <DetailField label="Org ID" value={`ORG-${org.id}`} />}
                  <DetailField label="GSTIN" value={org.gstin || profile.gst} />
                  <DetailField label="Verification" value={org.verificationStatus} />
                </div>
              </DetailSection>
            )}

            {/* Profile / Business Details */}
            {Object.keys(profile).length > 0 && (
              <DetailSection title="Business Profile">
                <div className="grid gap-3 sm:grid-cols-2">
                  <DetailField label="PAN" value={profile.pan} />
                  <DetailField label="GST" value={profile.gst} />
                  <DetailField label="Udyam Number" value={profile.udyamNumber} />
                  <DetailField label="Industry" value={profile.industry} />
                  <DetailField label="State" value={profile.state} />
                  <DetailField label="City" value={profile.city} />
                  <DetailField label="Annual Turnover" value={profile.annualTurnover} />
                  <DetailField label="Annual Budget" value={profile.annualBudget} />
                  {profile.productCategories && (
                    <DetailField label="Product Categories" value={Array.isArray(profile.productCategories) ? profile.productCategories.join(', ') : profile.productCategories} />
                  )}
                  {profile.procurementCategories && (
                    <DetailField label="Procurement Categories" value={Array.isArray(profile.procurementCategories) ? profile.procurementCategories.join(', ') : profile.procurementCategories} />
                  )}
                </div>
              </DetailSection>
            )}

            {/* Onboarding Section Status */}
            {Object.keys(sectionStatus).length > 0 && (
              <DetailSection title="Onboarding Verification">
                <div className="grid gap-2 sm:grid-cols-2">
                  {Object.entries(sectionStatus).map(([section, status]) => (
                    <div key={section} className="flex items-center justify-between rounded-lg border border-slate-100 bg-slate-50/50 px-3 py-2">
                      <span className="text-xs font-bold uppercase tracking-wide text-slate-600">{section}</span>
                      <span className={`rounded-md border px-2 py-0.5 text-[10px] font-black uppercase ${status === 'approved' ? 'border-emerald-200 bg-emerald-50 text-emerald-700'
                        : status === 'rejected' ? 'border-rose-200 bg-rose-50 text-rose-700'
                          : status === 'resubmission_required' ? 'border-amber-200 bg-amber-50 text-amber-700'
                            : 'border-blue-200 bg-slate-50 text-[#12335f]'
                        }`}>{label(String(status))}</span>
                    </div>
                  ))}
                </div>
              </DetailSection>
            )}

            {/* Sessions */}
            {sessions.length > 0 && (
              <DetailSection title={`Active Sessions (${sessions.length})`}>
                <div className="space-y-2">
                  {sessions.slice(0, 5).map((session: any, idx: number) => (
                    <div key={idx} className="flex items-center justify-between rounded-lg border border-slate-100 bg-slate-50/50 px-3 py-2 text-xs">
                      <div>
                        <span className="font-bold text-slate-700">{session.device || session.userAgent || 'Unknown Device'}</span>
                        {session.ip && <span className="ml-2 text-slate-400">({session.ip})</span>}
                      </div>
                      <span className="text-[10px] font-bold text-slate-400">{formatDate(session.lastActive || session.createdAt)}</span>
                    </div>
                  ))}
                  {sessions.length > 5 && (
                    <p className="text-center text-[10px] font-bold text-slate-400">+{sessions.length - 5} more sessions</p>
                  )}
                </div>
              </DetailSection>
            )}

            {/* Compliance Violations */}
            {violations.length > 0 && (
              <DetailSection title={`Compliance Flags (${violations.length})`}>
                <div className="space-y-2">
                  {violations.map((v: any, idx: number) => (
                    <div key={idx} className="rounded-lg border border-slate-100 bg-slate-50/50 p-3 text-xs">
                      <div className="flex items-center justify-between">
                        <span className="font-bold text-slate-700">{v.rule || v.ruleCode || v.type || `Flag #${idx + 1}`}</span>
                        <span className={`rounded-md border px-2 py-0.5 text-[10px] font-black uppercase ${severityClass(v.severity)}`}>{v.severity || 'info'}</span>
                      </div>
                      {v.description && <p className="mt-1 text-slate-500">{v.description}</p>}
                      {v.createdAt && <p className="mt-1 text-[10px] text-slate-400">Flagged: {formatDate(v.createdAt)}</p>}
                    </div>
                  ))}
                </div>
              </DetailSection>
            )}

            {/* Admin Feedback */}
            {record.adminFeedback && (
              <DetailSection title="Admin Feedback">
                <p className="text-xs font-medium leading-relaxed text-slate-600">{record.adminFeedback}</p>
              </DetailSection>
            )}

            {/* Timestamps */}
            <DetailSection title="Timestamps">
              <div className="grid gap-3 sm:grid-cols-2">
                <DetailField label="Created At" value={formatDate(record.createdAt)} />
                <DetailField label="Updated At" value={formatDate(record.updatedAt)} />
                <DetailField label="Last Login" value={formatDate(record.lastLoginAt)} />
                <DetailField label="Email Verified" value={record.emailVerified ? 'Yes' : 'No'} />
              </div>
            </DetailSection>
          </div>
        </aside>
      </div>
    );
  }

  // For non-users kinds (audit, fraud, rules) keep the JSON view
  return (
    <div className="fixed inset-0 z-50 flex justify-end bg-slate-950/30" onClick={onClose}>
      <aside className="h-full w-full max-w-2xl overflow-y-auto bg-white shadow-xl" onClick={e => e.stopPropagation()}>
        <div className="sticky top-0 z-10 flex items-start justify-between border-b border-slate-200 bg-white p-5">
          <div>
            <p className="text-[10px] font-black uppercase tracking-widest text-[#12335f]">{config[kind].title} Detail</p>
            <h2 className="mt-1 text-xl font-black text-slate-950">{rowTitle(kind, record)}</h2>
            <p className="mt-1 text-xs font-semibold text-slate-500">{rowSubtitle(kind, record)}</p>
          </div>
          <button onClick={onClose} className="rounded-lg border border-slate-200 p-2 text-slate-500 hover:bg-slate-50" aria-label="Close detail"><X className="h-4 w-4" /></button>
        </div>
        <div className="space-y-4 p-5">
          <div className="grid gap-3 md:grid-cols-3">
            <DetailMetric label="Status" value={label(statusOf(kind, record))} />
            <DetailMetric label="Severity/Role" value={label(record.severity || record.role || '-')} />
            <DetailMetric label="Created" value={formatDate(record.createdAt)} />
          </div>
          <Card><CardContent className="space-y-3 p-4">
            <div className="flex items-center gap-2 text-xs font-black uppercase tracking-widest text-slate-500"><Filter className="h-4 w-4" /> Full Record</div>
            <pre className="max-h-[520px] overflow-auto rounded-lg bg-slate-950 p-4 text-xs font-semibold leading-relaxed text-slate-100">{JSON.stringify(safeRecord, null, 2)}</pre>
          </CardContent></Card>
        </div>
      </aside>
    </div>
  );
}

function DetailMetric({ label, value }: { label: string; value: string }) {
  return <div className="rounded-lg border border-slate-200 bg-slate-50 p-3"><p className="text-[9px] font-black uppercase tracking-widest text-slate-400">{label}</p><p className="mt-1 text-sm font-black text-slate-900">{value}</p></div>;
}

function DetailSection({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="rounded-xl border border-slate-200 bg-white shadow-sm overflow-hidden">
      <div className="border-b border-slate-100 bg-slate-50/50 px-4 py-2.5">
        <h3 className="text-[10px] font-black uppercase tracking-widest text-slate-500">{title}</h3>
      </div>
      <div className="p-4">{children}</div>
    </div>
  );
}

function DetailField({ label, value }: { label: string; value?: string | number | null }) {
  const display = value != null && value !== '' ? String(value) : '—';
  return (
    <div className="space-y-0.5">
      <p className="text-[9px] font-black uppercase tracking-widest text-slate-400">{label}</p>
      <p className="text-xs font-bold text-slate-700 break-all">{display}</p>
    </div>
  );
}

function AdminRecordCard({
  kind,
  record,
  srNo,
  onView,
  onToggleStatus,
  onEdit,
  onDelete,
  currentUserId
}: {
  kind: AdminKind;
  record: RecordMap;
  srNo: number;
  onView: () => void;
  onToggleStatus?: (record: RecordMap) => void;
  onEdit?: (record: RecordMap) => void;
  onDelete?: (record: RecordMap) => void;
  currentUserId?: number | null;
}) {
  return (
    <Card className="border-slate-200 bg-white shadow-sm hover:shadow-md transition-shadow">
      <CardContent className="p-4 flex flex-col justify-between h-full min-h-[180px]">
        <div>
          <div className="flex items-start justify-between gap-3">
            <span className="rounded bg-slate-50 px-2 py-1 font-mono text-[10px] font-black text-[#12335f]">{String(srNo).padStart(2, '0')}</span>
            {kind === 'users' && onToggleStatus ? (
              <div className="flex items-center gap-1.5">
                <button
                  type="button"
                  onClick={() => onToggleStatus(record)}
                  className={cn(
                    "relative inline-flex h-4 w-7 shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors duration-200 ease-in-out focus:outline-none",
                    record.accountStatus === 'ACTIVE' ? "bg-emerald-500" : "bg-slate-300"
                  )}
                >
                  <span
                    className={cn(
                      "pointer-events-none inline-block h-3 w-3 transform rounded-full bg-white shadow transition duration-200 ease-in-out",
                      record.accountStatus === 'ACTIVE' ? "translate-x-3" : "translate-x-0"
                    )}
                  />
                </button>
                <span className={cn(
                  "text-[9px] font-black uppercase tracking-wider",
                  record.accountStatus === 'ACTIVE' ? "text-emerald-700" : "text-slate-500"
                )}>
                  {record.accountStatus === 'ACTIVE' ? "Active" : "Inactive"}
                </span>
              </div>
            ) : (
              <span className={`rounded-lg border px-2 py-0.5 text-[9px] font-black uppercase ${severityClass(statusOf(kind, record))}`}>{label(statusOf(kind, record))}</span>
            )}
          </div>
          <h3 className="mt-3 line-clamp-2 text-sm font-black text-slate-900 text-wrap-anywhere">{rowTitle(kind, record)}</h3>
          <p className="mt-1 line-clamp-2 text-[10px] font-semibold text-slate-500 text-wrap-anywhere">{rowSubtitle(kind, record) || `#${record.id || '-'}`}</p>
          <div className="mt-3">
            <EntityIdLink
              label={rowIdLabel(kind, record)}
              id={record.id}
              size="sm"
              onClick={onView}
            />
          </div>
        </div>

        <div className="mt-4 pt-3 border-t border-slate-100 flex items-center justify-between gap-2">
          <span className="text-[9px] font-bold text-slate-400">{formatDateTime(record.createdAt || record.updatedAt)}</span>
          <div className="flex items-center gap-1.5">
            <Button variant="outline" onClick={onView} className="h-8 rounded-lg text-[10px] font-black px-2.5"><Eye className="mr-1 h-3.5 w-3.5" />View</Button>
            {kind === 'users' && onEdit && onDelete && (
              <>
                <Button variant="outline" onClick={() => onEdit(record)} className="h-8 rounded-lg text-[10px] font-black px-2 text-blue-600 hover:text-blue-700 border-blue-100 hover:bg-blue-50/50"><Edit3 className="h-3.5 w-3.5" /></Button>
                <Button variant="outline" onClick={() => onDelete(record)} className="h-8 rounded-lg text-[10px] font-black px-2 text-rose-600 hover:text-rose-700 border-rose-100 hover:bg-rose-50/50" disabled={Number(record.id) === Number(currentUserId)}><Trash2 className="h-3.5 w-3.5" /></Button>
              </>
            )}
          </div>
        </div>
      </CardContent>
    </Card>
  );
}

function UserEditModal({
  user,
  onClose,
  onSave
}: {
  user: RecordMap;
  onClose: () => void;
  onSave: (data: { name: string; email: string; mobile: string; role: string }) => void;
}) {
  const [name, setName] = useState(user.name || '');
  const [email, setEmail] = useState(user.email || '');
  const [mobile, setMobile] = useState(user.mobile || '');
  const [role, setRole] = useState(user.role || 'seller');

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim()) {
      toast.error("Name is required");
      return;
    }
    if (!email.trim() || !email.includes('@')) {
      toast.error("A valid email is required");
      return;
    }
    onSave({ name, email, mobile, role });
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/40 backdrop-blur-sm p-4">
      <div className="w-full max-w-md overflow-hidden rounded-xl border border-slate-200 bg-white shadow-2xl animate-in fade-in zoom-in-95 duration-200">
        {/* Header */}
        <div className="flex items-center justify-between border-b border-slate-200 bg-slate-50 px-5 py-4">
          <div>
            <h3 className="text-sm font-black text-slate-950 uppercase tracking-wider">Edit User Profile</h3>
            <p className="text-[10px] font-semibold text-slate-500">Modify user information and system role.</p>
          </div>
          <button type="button" onClick={onClose} className="rounded-lg border border-slate-200 bg-white p-1.5 text-slate-500 hover:bg-slate-50 transition-colors"><X className="h-4 w-4" /></button>
        </div>

        {/* Form */}
        <form onSubmit={handleSubmit} className="p-5 space-y-4">
          <div className="space-y-1">
            <label className="text-[10px] font-black uppercase tracking-wider text-slate-400">Full Name</label>
            <input
              type="text"
              value={name}
              onChange={e => setName(e.target.value)}
              className="h-10 w-full rounded-lg border border-slate-200 px-3 text-xs font-semibold outline-none focus:ring-2 focus:ring-[#12335f]/20 bg-slate-50/50 hover:bg-slate-50 focus:bg-white transition-all text-slate-900"
              placeholder="Enter full name"
              required
            />
          </div>

          <div className="space-y-1">
            <label className="text-[10px] font-black uppercase tracking-wider text-slate-400">Email Address</label>
            <input
              type="email"
              value={email}
              onChange={e => setEmail(e.target.value)}
              className="h-10 w-full rounded-lg border border-slate-200 px-3 text-xs font-semibold outline-none focus:ring-2 focus:ring-[#12335f]/20 bg-slate-50/50 hover:bg-slate-50 focus:bg-white transition-all text-slate-900"
              placeholder="email@example.com"
              required
            />
          </div>

          <div className="space-y-1">
            <label className="text-[10px] font-black uppercase tracking-wider text-slate-400">Mobile Number</label>
            <input
              type="text"
              value={mobile}
              onChange={e => setMobile(e.target.value)}
              className="h-10 w-full rounded-lg border border-slate-200 px-3 text-xs font-semibold outline-none focus:ring-2 focus:ring-[#12335f]/20 bg-slate-50/50 hover:bg-slate-50 focus:bg-white transition-all text-slate-900"
              placeholder="10-digit mobile number"
            />
          </div>

          <div className="space-y-1">
            <label className="text-[10px] font-black uppercase tracking-wider text-slate-400">System Role</label>
            <select
              value={role}
              onChange={e => setRole(e.target.value)}
              className="h-10 w-full rounded-lg border border-slate-200 px-3 text-xs font-bold bg-white text-slate-900 outline-none focus:ring-2 focus:ring-[#12335f]/20 transition-all"
            >
              <option value="admin">Administrator</option>
              <option value="buyer">Buyer</option>
              <option value="seller">Seller</option>
            </select>
          </div>

          {/* Footer Actions */}
          <div className="pt-4 border-t border-slate-100 flex items-center justify-end gap-2">
            <Button type="button" variant="outline" onClick={onClose} className="h-9 px-4 rounded-lg text-xs font-black uppercase tracking-wider">Cancel</Button>
            <Button type="submit" className="h-9 px-4 rounded-lg text-xs font-black uppercase tracking-wider bg-[#12335f] text-white hover:bg-[#1e467d] transition-colors flex items-center gap-1.5"><Save className="h-4 w-4" /> Save Changes</Button>
          </div>
        </form>
      </div>
    </div>
  );
}

