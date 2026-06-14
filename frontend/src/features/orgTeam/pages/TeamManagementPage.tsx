/**
 * TeamManagementPage — ORG_ADMIN can invite team members, view all members,
 * change roles, and remove members.
 *
 * Route: /org/team
 * Access: ORG_ADMIN only
 */
import { useMemo, useState } from 'react';
import {
    Mail, Plus, RefreshCw, Search, Shield, Trash2, UserCheck,
    UserPlus, Users, X, ChevronDown, Clock, CheckCircle2, KeyRound, History, Copy, Power
} from 'lucide-react';
import { toast } from 'sonner';
import { Button } from '../../../components/ui/button';
import { Card, CardContent } from '../../../components/ui/card';
import { useAuth } from '../../../hooks/useAuth';
import { useOrgRole, type OrgRole } from '../../../hooks/useOrgRole';
import { getApi, postApi, putApi, deleteApi } from '../../shared/apiClient';
import { formatDateTime, formatRelative } from '../../shared/format';
import { EntityIdLink } from '../../shared/EntityIdLink';
import { EmptyState, InlineError, LoadingState } from '../../shared/FeatureStates';
import { Pagination } from '../../shared/Pagination';
import { SortableHeader, type SortDirection } from '../../shared/SortableHeader';
import { useFeatureQuery, usePagination, useResponsiveViewMode } from '../../shared/hooks';
import { ViewModeToggle } from '../../shared/ViewModeToggle';

// ─── Types ────────────────────────────────────────────────────────────────────

type Member = {
    id: number;
    userId: number;
    orgRole: OrgRole;
    customRoleId?: number | null;
    customRole?: { id: number; name: string; roleKey: string };
    isActive: boolean;
    invitedAt: string;
    acceptedAt?: string;
    user: {
        id: number;
        name: string;
        email: string;
        mobile?: string;
        accountStatus: string;
        lastLoginAt?: string;
        createdAt: string;
    };
    invitedBy?: { id: number; name: string; email: string };
};

type Invitation = {
    id: number;
    email: string;
    orgRole: OrgRole;
    customRoleId?: number | null;
    customRole?: { id: number; name: string; roleKey: string };
    status?: string;
    expiresAt: string;
    createdAt: string;
    invitedBy: { id: number; name: string; email: string };
};
type OrgPermission = { key: string; label: string; module: string; description: string };
type OrgCustomRole = {
    id: number;
    name: string;
    description?: string | null;
    roleKey: string;
    isSystemRole: boolean;
    isActive: boolean;
    permissions?: Array<{ permissionKey: string; allowed: boolean }>;
    _count?: { memberships?: number };
};
type AccessTransfer = {
    id: number;
    toEmail?: string | null;
    reason: string;
    status: string;
    createdAt: string;
    completedAt?: string | null;
    fromUser?: { id: number; name: string; email: string };
    toUser?: { id: number; name: string; email: string };
    role?: { id: number; name: string };
};
type MemberSortKey = 'name' | 'email' | 'role' | 'status' | 'joined' | 'lastLogin';
type TeamTab = 'members' | 'invitations' | 'roles' | 'transfers';

// ─── Constants ────────────────────────────────────────────────────────────────

const ORG_ROLES: { value: OrgRole; label: string; description: string }[] = [
    { value: 'ORG_ADMIN', label: 'Org Admin', description: 'Full access — invite members, manage settings, approve everything' },
    { value: 'PROCUREMENT_OFFICER', label: 'Procurement Officer', description: 'Create requirements, tenders, RFQs, manage POs' },
    { value: 'FINANCE_OFFICER', label: 'Finance Officer', description: 'Approve carts, invoices, payments, escrow' },
    { value: 'TECHNICAL_OFFICER', label: 'Technical Officer', description: 'Evaluate bids, review product specs, approve GRNs' },
    { value: 'LOGISTICS_OFFICER', label: 'Logistics Officer', description: 'Update delivery status, upload POD, create GRNs' },
    { value: 'VIEWER', label: 'Viewer', description: 'Read-only access to all organisation data' }
];

const ROLE_COLORS: Record<OrgRole, string> = {
    ORG_ADMIN: 'border-purple-200 bg-purple-50 text-purple-700',
    PROCUREMENT_OFFICER: 'border-blue-200 bg-blue-50 text-blue-700',
    FINANCE_OFFICER: 'border-emerald-200 bg-emerald-50 text-emerald-700',
    TECHNICAL_OFFICER: 'border-amber-200 bg-amber-50 text-amber-700',
    LOGISTICS_OFFICER: 'border-orange-200 bg-orange-50 text-orange-700',
    VIEWER: 'border-slate-200 bg-slate-50 text-slate-600'
};

// ─── Component ────────────────────────────────────────────────────────────────

export default function TeamManagementPage() {
    const { user } = useAuth();
    const { orgRole, orgStatus, isOrgAdmin } = useOrgRole();
    const [showInviteModal, setShowInviteModal] = useState(false);
    const [editingMember, setEditingMember] = useState<Member | null>(null);
    const [searchTerm, setSearchTerm] = useState('');
    const [roleFilter, setRoleFilter] = useState('');
    const [statusFilter, setStatusFilter] = useState('');
    const [sortKey, setSortKey] = useState<MemberSortKey>('joined');
    const [sortDirection, setSortDirection] = useState<SortDirection>('desc');
    const [viewMode, setViewMode] = useResponsiveViewMode('phase7:team-management:view-mode');
    const [activeTab, setActiveTab] = useState<TeamTab>('members');
    const [showRoleModal, setShowRoleModal] = useState(false);
    const [transferMember, setTransferMember] = useState<Member | null>(null);

    const { data: membersData, loading: membersLoading, refreshing: membersRefreshing, error: membersError, reload: reloadMembers } =
        useFeatureQuery<Member[]>('/api/org/members', []);

    const { data: invitesData, loading: invitesLoading, refreshing: invitesRefreshing, reload: reloadInvites } =
        useFeatureQuery<Invitation[]>('/api/org/invitations', []);
    const { data: rolesData, loading: rolesLoading, reload: reloadRoles } =
        useFeatureQuery<OrgCustomRole[]>('/api/org/roles', []);
    const { data: catalogData } =
        useFeatureQuery<{ catalog: OrgPermission[]; grouped: Record<string, OrgPermission[]>; templates: Array<{ roleKey: string; name: string }> }>('/api/org/permissions/catalog', { catalog: [], grouped: {}, templates: [] });
    const { data: transfersData, reload: reloadTransfers } =
        useFeatureQuery<AccessTransfer[]>('/api/org/access-transfer/logs', []);

    const members = Array.isArray(membersData) ? membersData : [];
    const invitations = Array.isArray(invitesData) ? invitesData : [];
    const roles = Array.isArray(rolesData) ? rolesData : [];
    const transfers = Array.isArray(transfersData) ? transfersData : [];
    const permissionGroups = catalogData?.grouped || {};
    const visibleMembers = useMemo(() => {
        const text = searchTerm.trim().toLowerCase();
        return [...members].filter(member => {
            const haystack = [
                member.userId,
                member.user.name,
                member.user.email,
                member.user.mobile,
                member.orgRole,
                member.user.accountStatus
            ].join(' ').toLowerCase();
            if (text && !haystack.includes(text)) return false;
            if (roleFilter && member.orgRole !== roleFilter) return false;
            if (statusFilter === 'active' && !member.isActive) return false;
            if (statusFilter === 'inactive' && member.isActive) return false;
            return true;
        }).sort((a, b) => {
            const valueFor = (member: Member) => {
                if (sortKey === 'name') return member.user.name || '';
                if (sortKey === 'email') return member.user.email || '';
                if (sortKey === 'role') return member.orgRole || '';
                if (sortKey === 'status') return member.isActive ? 'active' : 'inactive';
                if (sortKey === 'lastLogin') return new Date(member.user.lastLoginAt || 0).getTime();
                return new Date(member.acceptedAt || member.invitedAt || 0).getTime();
            };
            const av = valueFor(a);
            const bv = valueFor(b);
            const result = typeof av === 'number' && typeof bv === 'number'
                ? av - bv
                : String(av).localeCompare(String(bv));
            return sortDirection === 'asc' ? result : -result;
        });
    }, [members, roleFilter, searchTerm, sortDirection, sortKey, statusFilter]);
    const { page, pageSize, pageItems, total, setPage, setPageSize } = usePagination(visibleMembers, 10);

    const toggleSort = (field: MemberSortKey) => {
        setSortDirection(prev => sortKey === field && prev === 'asc' ? 'desc' : 'asc');
        setSortKey(field);
        setPage(1);
    };

    const handleRemoveMember = async (member: Member) => {
        if (!window.confirm(`Remove ${member.user.name} from the organisation? They will lose access immediately.`)) return;
        try {
            await deleteApi(`/api/org/members/${member.userId}`);
            toast.success(`${member.user.name} removed from organisation`);
            reloadMembers();
        } catch (err: any) {
            toast.error(err?.message || 'Failed to remove member');
        }
    };

    const handleCancelInvite = async (invite: Invitation) => {
        try {
            await deleteApi(`/api/org/invitations/${invite.id}`);
            toast.success('Invitation cancelled');
            reloadInvites();
        } catch (err: any) {
            toast.error(err?.message || 'Failed to cancel invitation');
        }
    };

    const renderMemberActions = (member: Member) => (
        <>
            {member.userId !== Number(user?.id) && (
                <div className="flex items-center justify-end gap-1">
                    <button
                        type="button"
                        onClick={() => setEditingMember(member)}
                        title="Change role"
                        className="flex h-8 w-8 items-center justify-center rounded-md border border-slate-200 bg-white text-[#12335f] hover:bg-slate-50"
                    >
                        <Shield className="h-3.5 w-3.5" />
                    </button>
                    <button
                        type="button"
                        onClick={() => setTransferMember(member)}
                        title="Transfer access"
                        className="flex h-8 w-8 items-center justify-center rounded-md border border-slate-200 bg-white text-indigo-700 hover:bg-indigo-50"
                    >
                        <History className="h-3.5 w-3.5" />
                    </button>
                    <button
                        type="button"
                        onClick={async () => {
                            try {
                                await putApi(`/api/org/members/${member.userId}/role`, { orgRole: member.orgRole, customRoleId: member.customRoleId ?? null });
                                toast.success('Access refreshed');
                            } catch {
                                toast.error('Unable to refresh access');
                            }
                        }}
                        title="Refresh role assignment"
                        className="flex h-8 w-8 items-center justify-center rounded-md border border-slate-200 bg-white text-slate-700 hover:bg-slate-50"
                    >
                        <Power className="h-3.5 w-3.5" />
                    </button>
                    <button
                        type="button"
                        onClick={() => handleRemoveMember(member)}
                        title="Remove member"
                        className="flex h-8 w-8 items-center justify-center rounded-md border border-red-200 bg-white text-red-600 hover:bg-red-50"
                    >
                        <Trash2 className="h-3.5 w-3.5" />
                    </button>
                </div>
            )}
            {member.userId === Number(user?.id) && (
                <span className="text-[10px] font-black uppercase text-slate-400">You</span>
            )}
        </>
    );

    if (!isOrgAdmin && orgRole !== null) {
        return (
            <div className="flex h-64 items-center justify-center">
                <div className="text-center">
                    <Shield className="mx-auto h-12 w-12 text-slate-300" />
                    <p className="mt-3 text-sm font-black text-slate-600 uppercase tracking-widest">Access Restricted</p>
                    <p className="mt-1 text-xs font-semibold text-slate-400">Only Org Admins can manage team members.</p>
                </div>
            </div>
        );
    }

    return (
        <div className="space-y-4">
            <div className="brand-tricolor-strip rounded-full" />
            {/* Header */}
            <div className="flex flex-col gap-3 border-b border-slate-200 pb-4 md:flex-row md:items-end md:justify-between">
                <div>
                    <p className="text-[10px] font-black uppercase tracking-widest text-[#12335f]">Organisation</p>
                    <h1 className="text-2xl font-black text-slate-950">Team Management</h1>
                    <p className="mt-1 text-xs font-semibold text-slate-500">
                        {orgStatus?.organization?.organizationName} — invite members and assign roles
                    </p>
                </div>
                <div className="flex items-center gap-2">
                    <Button variant="outline" onClick={() => { reloadMembers(); reloadInvites(); }} className="h-10 rounded-lg text-xs font-black uppercase">
                        <RefreshCw className={`mr-2 h-4 w-4 ${(membersRefreshing || invitesRefreshing) ? 'animate-spin' : ''}`} /> Refresh
                    </Button>
                    <Button onClick={() => setShowInviteModal(true)} className="bg-[#12335f] text-white hover:bg-[#0e2a4f]">
                        <UserPlus className="mr-2 h-4 w-4" /> Invite Member
                    </Button>
                </div>
            </div>

            {/* Metrics */}
            <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
                <MetricCard label="Total Members" value={members.length} icon={Users} />
                <MetricCard label="Active" value={members.filter(m => m.isActive).length} icon={UserCheck} />
                <MetricCard label="Pending Invites" value={invitations.length} icon={Mail} />
                <MetricCard label="Org Role" value={orgRole?.replace(/_/g, ' ') || '—'} icon={Shield} />
            </div>

            <div className="flex flex-wrap gap-2 border-b border-slate-200">
                {[
                    ['members', 'Members', Users],
                    ['invitations', 'Invitations', Mail],
                    ['roles', 'Roles & Permissions', KeyRound],
                    ['transfers', 'Access Transfers', History]
                ].map(([key, label, Icon]) => (
                    <button
                        key={String(key)}
                        type="button"
                        onClick={() => setActiveTab(key as TeamTab)}
                        className={`inline-flex items-center gap-2 border-b-2 px-3 py-2 text-xs font-black uppercase tracking-wide ${activeTab === key ? 'border-[#12335f] text-[#12335f]' : 'border-transparent text-slate-500 hover:text-slate-900'}`}
                    >
                        <Icon className="h-3.5 w-3.5" />
                        {String(label)}
                    </button>
                ))}
            </div>

            {membersError && <InlineError message={membersError} onRetry={reloadMembers} />}

            {activeTab === 'members' && members.length > 0 && (
                <Card className="border-slate-200/80 bg-white shadow-sm">
                    <CardContent className="p-4">
                        <div className="grid gap-3 lg:grid-cols-[1fr_190px_150px_auto_auto] lg:items-center">
                            <div className="relative">
                                <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
                                <input
                                    value={searchTerm}
                                    onChange={event => { setSearchTerm(event.target.value); setPage(1); }}
                                    placeholder="Search member name, email, mobile, role..."
                                    className="h-10 w-full rounded-lg border border-slate-200 bg-slate-50 pl-10 pr-3 text-xs font-semibold outline-none focus:ring-2 focus:ring-[#12335f]/20"
                                />
                            </div>
                            <select
                                value={roleFilter}
                                onChange={event => { setRoleFilter(event.target.value); setPage(1); }}
                                className="h-10 rounded-lg border border-slate-200 bg-white px-3 text-xs font-bold text-slate-700 outline-none"
                            >
                                <option value="">All roles</option>
                                {ORG_ROLES.map(role => <option key={role.value} value={role.value}>{role.label}</option>)}
                            </select>
                            <select
                                value={statusFilter}
                                onChange={event => { setStatusFilter(event.target.value); setPage(1); }}
                                className="h-10 rounded-lg border border-slate-200 bg-white px-3 text-xs font-bold text-slate-700 outline-none"
                            >
                                <option value="">Any status</option>
                                <option value="active">Active</option>
                                <option value="inactive">Inactive</option>
                            </select>
                            <ViewModeToggle value={viewMode} onChange={setViewMode} />
                            <Button
                                variant="outline"
                                className="h-10 rounded-lg text-xs font-black uppercase"
                                onClick={() => {
                                    setSearchTerm('');
                                    setRoleFilter('');
                                    setStatusFilter('');
                                    setPage(1);
                                }}
                            >
                                Reset
                            </Button>
                        </div>
                    </CardContent>
                </Card>
            )}

            {/* Members Table */}
            {activeTab === 'members' && <Card className="border-slate-200/80 shadow-sm">
                <CardContent className="p-0">
                    <div className="border-b border-slate-100 bg-slate-50/60 px-4 py-3">
                        <p className="text-[10px] font-black uppercase tracking-widest text-slate-500">Team Members ({total} shown of {members.length})</p>
                    </div>
                    {membersLoading ? (
                        <LoadingState label="Loading members..." />
                    ) : members.length === 0 ? (
                        <EmptyState title="No members yet" description="Invite your first team member to get started." />
                    ) : pageItems.length === 0 ? (
                        <EmptyState title="No members match these filters" description="Clear the search, role, or status filter to see all members." />
                    ) : viewMode === 'grid' ? (
                        <div className="grid gap-4 p-4 md:grid-cols-2 xl:grid-cols-3">
                            {pageItems.map(member => (
                                <article key={member.id} className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm transition hover:-translate-y-0.5 hover:border-[#12335f]/30 hover:shadow-lg">
                                    <div className="flex items-start justify-between gap-3">
                                        <div className="min-w-0">
                                            <EntityIdLink label={`MBR-${member.userId}`} id={member.userId} size="sm" onClick={() => { }} />
                                            <h2 className="mt-1 text-sm font-black text-slate-950 text-wrap-anywhere">{member.user.name}</h2>
                                            <p className="text-[10px] font-semibold text-slate-500 text-wrap-anywhere">{member.user.email}</p>
                                        </div>
                                        <span className={`inline-flex rounded-md border px-2 py-0.5 text-[10px] font-black uppercase ${member.isActive ? 'border-emerald-200 bg-emerald-50 text-emerald-700' : 'border-red-200 bg-red-50 text-red-700'}`}>
                                            {member.isActive ? 'Active' : 'Inactive'}
                                        </span>
                                    </div>
                                    <div className="mt-4 grid gap-2 text-xs font-semibold text-slate-600">
                                        <p><span className="font-black text-slate-900">Role:</span> <span className={`ml-1 inline-flex rounded-md border px-2 py-0.5 text-[10px] font-black uppercase ${ROLE_COLORS[member.orgRole]}`}>{member.orgRole.replace(/_/g, ' ')}</span></p>
                                        <p><span className="font-black text-slate-900">Joined:</span> {formatDateTime(member.acceptedAt || member.invitedAt)}</p>
                                        <p><span className="font-black text-slate-900">Last login:</span> {member.user.lastLoginAt ? formatRelative(member.user.lastLoginAt) : 'Never'}</p>
                                        {member.user.mobile && <p><span className="font-black text-slate-900">Mobile:</span> {member.user.mobile}</p>}
                                    </div>
                                    <div className="mt-4 flex justify-end border-t border-slate-100 pt-3">
                                        {renderMemberActions(member)}
                                    </div>
                                </article>
                            ))}
                            <div className="md:col-span-2 xl:col-span-3">
                                <Pagination page={page} pageSize={pageSize} total={total} onPageChange={setPage} onPageSizeChange={setPageSize} label="members" />
                            </div>
                        </div>
                    ) : (
                        <>
                        <div className="overflow-x-auto">
                            <table className="w-full min-w-[800px] text-sm">
                                <thead className="border-b border-slate-100 bg-slate-50/60 text-[10px] font-black uppercase tracking-widest text-slate-500">
                                    <tr>
                                        <th className="px-4 py-2.5 text-left w-12">#</th>
                                        <th className="px-4 py-2.5 text-left"><SortableHeader label="Member" field="name" activeField={sortKey} direction={sortDirection} onSort={toggleSort} /></th>
                                        <th className="px-4 py-2.5 text-left w-56"><SortableHeader label="Email" field="email" activeField={sortKey} direction={sortDirection} onSort={toggleSort} /></th>
                                        <th className="px-4 py-2.5 text-left w-48"><SortableHeader label="Role" field="role" activeField={sortKey} direction={sortDirection} onSort={toggleSort} /></th>
                                        <th className="px-4 py-2.5 text-left w-32"><SortableHeader label="Status" field="status" activeField={sortKey} direction={sortDirection} onSort={toggleSort} /></th>
                                        <th className="px-4 py-2.5 text-left w-44"><SortableHeader label="Joined" field="joined" activeField={sortKey} direction={sortDirection} onSort={toggleSort} /></th>
                                        <th className="px-4 py-2.5 text-left w-44"><SortableHeader label="Last Login" field="lastLogin" activeField={sortKey} direction={sortDirection} onSort={toggleSort} /></th>
                                        <th className="px-4 py-2.5 text-right w-32">Actions</th>
                                    </tr>
                                </thead>
                                <tbody className="divide-y divide-slate-100">
                                    {pageItems.map((member, idx) => (
                                        <tr key={member.id} className="hover:bg-slate-50/60">
                                            <td className="px-4 py-3 text-xs font-mono text-slate-400">{String((page - 1) * pageSize + idx + 1).padStart(2, '0')}</td>
                                            <td className="px-4 py-3">
                                                <EntityIdLink label={`MBR-${member.userId}`} id={member.userId} size="sm" onClick={() => { }} />
                                                <p className="mt-1 text-sm font-black text-slate-900 text-wrap-anywhere">{member.user.name}</p>
                                            </td>
                                            <td className="px-4 py-3 text-[10px] font-semibold text-slate-500 text-wrap-anywhere">{member.user.email}</td>
                                            <td className="px-4 py-3">
                                                <span className={`inline-flex rounded-md border px-2 py-0.5 text-[10px] font-black uppercase ${ROLE_COLORS[member.orgRole]}`}>
                                                    {member.orgRole.replace(/_/g, ' ')}
                                                </span>
                                            </td>
                                            <td className="px-4 py-3">
                                                <span className={`inline-flex rounded-md border px-2 py-0.5 text-[10px] font-black uppercase ${member.isActive ? 'border-emerald-200 bg-emerald-50 text-emerald-700' : 'border-red-200 bg-red-50 text-red-700'}`}>
                                                    {member.isActive ? 'Active' : 'Inactive'}
                                                </span>
                                            </td>
                                            <td className="px-4 py-3 text-xs font-semibold text-slate-700">
                                                <p>{formatDateTime(member.acceptedAt || member.invitedAt)}</p>
                                                <p className="text-[10px] text-slate-400">{formatRelative(member.acceptedAt || member.invitedAt)}</p>
                                            </td>
                                            <td className="px-4 py-3 text-xs font-semibold text-slate-500">
                                                {member.user.lastLoginAt ? (
                                                    <>
                                                        <p>{formatDateTime(member.user.lastLoginAt)}</p>
                                                        <p className="text-[10px] text-slate-400">{formatRelative(member.user.lastLoginAt)}</p>
                                                    </>
                                                ) : '—'}
                                            </td>
                                            <td className="px-4 py-3 text-right" onClick={e => e.stopPropagation()}>
                                                {renderMemberActions(member)}
                                            </td>
                                        </tr>
                                    ))}
                                </tbody>
                            </table>
                        </div>
                        <Pagination page={page} pageSize={pageSize} total={total} onPageChange={setPage} onPageSizeChange={setPageSize} label="members" />
                        </>
                    )}
                </CardContent>
            </Card>}

            {/* Pending Invitations */}
            {activeTab === 'invitations' && (
                <Card className="border-slate-200/80 shadow-sm">
                    <CardContent className="p-0">
                        <div className="border-b border-slate-100 bg-amber-50/60 px-4 py-3">
                            <p className="text-[10px] font-black uppercase tracking-widest text-amber-700">Pending Invitations ({invitations.length})</p>
                        </div>
                        {invitations.length === 0 ? <EmptyState title="No pending invitations" description="Send an invite when a team member needs access." /> : <div className="divide-y divide-slate-100">
                            {invitations.map(invite => (
                                <div key={invite.id} className="flex items-center justify-between gap-4 px-4 py-3">
                                    <div className="flex items-center gap-3 min-w-0">
                                        <Clock className="h-4 w-4 shrink-0 text-amber-500" />
                                        <div className="min-w-0">
                                            <p className="text-sm font-black text-slate-900 text-wrap-anywhere">{invite.email}</p>
                                            <p className="text-[10px] font-semibold text-slate-500">
                                                Invited as <span className="font-black">{invite.orgRole.replace(/_/g, ' ')}</span> · Expires {formatRelative(invite.expiresAt)}
                                            </p>
                                        </div>
                                    </div>
                                    <button
                                        type="button"
                                        onClick={() => handleCancelInvite(invite)}
                                        className="flex h-8 w-8 shrink-0 items-center justify-center rounded-md border border-red-200 bg-white text-red-600 hover:bg-red-50"
                                        title="Cancel invitation"
                                    >
                                        <X className="h-3.5 w-3.5" />
                                    </button>
                                </div>
                            ))}
                        </div>}
                    </CardContent>
                </Card>
            )}

            {activeTab === 'roles' && (
                <Card className="border-slate-200/80 shadow-sm">
                    <CardContent className="p-0">
                        <div className="flex items-center justify-between border-b border-slate-100 bg-slate-50/60 px-4 py-3">
                            <p className="text-[10px] font-black uppercase tracking-widest text-slate-500">Roles & Permissions ({roles.length})</p>
                            <Button onClick={() => setShowRoleModal(true)} className="h-9 bg-[#12335f] text-white">
                                <Plus className="mr-2 h-4 w-4" /> Create Role
                            </Button>
                        </div>
                        {rolesLoading ? <LoadingState label="Loading roles..." /> : (
                            <div className="grid gap-3 p-4 lg:grid-cols-2">
                                {roles.map(role => {
                                    const permissions = (role.permissions || []).filter(p => p.allowed).map(p => p.permissionKey);
                                    return (
                                        <article key={role.id} className="rounded-lg border border-slate-200 bg-white p-4">
                                            <div className="flex items-start justify-between gap-3">
                                                <div>
                                                    <p className="text-sm font-black text-slate-950">{role.name}</p>
                                                    <p className="mt-1 text-xs font-semibold text-slate-500">{role.description || 'Custom organization role'}</p>
                                                </div>
                                                <span className={`rounded border px-2 py-0.5 text-[10px] font-black uppercase ${role.isActive ? 'border-emerald-200 bg-emerald-50 text-emerald-700' : 'border-red-200 bg-red-50 text-red-700'}`}>
                                                    {role.isSystemRole ? 'Template' : role.isActive ? 'Active' : 'Inactive'}
                                                </span>
                                            </div>
                                            <div className="mt-3 flex flex-wrap gap-1.5">
                                                {permissions.slice(0, 10).map(permission => (
                                                    <span key={permission} className="rounded bg-slate-100 px-2 py-1 text-[9px] font-black uppercase text-slate-600">{permission.replace(/_/g, ' ')}</span>
                                                ))}
                                                {permissions.length > 10 && <span className="rounded bg-slate-900 px-2 py-1 text-[9px] font-black uppercase text-white">+{permissions.length - 10}</span>}
                                            </div>
                                        </article>
                                    );
                                })}
                            </div>
                        )}
                    </CardContent>
                </Card>
            )}

            {activeTab === 'transfers' && (
                <Card className="border-slate-200/80 shadow-sm">
                    <CardContent className="p-0">
                        <div className="border-b border-slate-100 bg-slate-50/60 px-4 py-3">
                            <p className="text-[10px] font-black uppercase tracking-widest text-slate-500">Access Transfers ({transfers.length})</p>
                        </div>
                        {transfers.length === 0 ? <EmptyState title="No access transfers" description="Transfer a member role when an employee moves out of this organization." /> : (
                            <div className="divide-y divide-slate-100">
                                {transfers.map(row => (
                                    <div key={row.id} className="grid gap-2 px-4 py-3 md:grid-cols-[1fr_auto]">
                                        <div>
                                            <p className="text-sm font-black text-slate-950">{row.fromUser?.name || `User #${row.fromUser?.id || '-'}`} → {row.toUser?.name || row.toEmail || 'Pending invitee'}</p>
                                            <p className="mt-1 text-xs font-semibold text-slate-500">{row.reason}</p>
                                            <p className="mt-1 text-[10px] font-bold uppercase text-slate-400">{formatRelative(row.createdAt)} · {row.role?.name || 'Same role'}</p>
                                        </div>
                                        <span className="h-fit rounded border border-slate-200 bg-slate-50 px-2 py-1 text-[10px] font-black uppercase text-slate-700">{row.status}</span>
                                    </div>
                                ))}
                            </div>
                        )}
                    </CardContent>
                </Card>
            )}

            {/* Modals */}
            {showInviteModal && (
                <InviteModal
                    roles={roles}
                    onClose={() => setShowInviteModal(false)}
                    onSuccess={() => { setShowInviteModal(false); reloadInvites(); }}
                />
            )}
            {editingMember && (
                <ChangeRoleModal
                    member={editingMember}
                    roles={roles}
                    onClose={() => setEditingMember(null)}
                    onSuccess={() => { setEditingMember(null); reloadMembers(); reloadRoles(); }}
                />
            )}
            {showRoleModal && (
                <RoleModal
                    permissionGroups={permissionGroups}
                    templates={catalogData?.templates || []}
                    onClose={() => setShowRoleModal(false)}
                    onSuccess={() => { setShowRoleModal(false); reloadRoles(); }}
                />
            )}
            {transferMember && (
                <TransferAccessModal
                    member={transferMember}
                    roles={roles}
                    onClose={() => setTransferMember(null)}
                    onSuccess={() => { setTransferMember(null); reloadTransfers(); reloadInvites(); reloadMembers(); }}
                />
            )}
        </div>
    );
}

// ─── Metric Card ──────────────────────────────────────────────────────────────

function MetricCard({ label, value, icon: Icon }: { label: string; value: string | number; icon: any }) {
    return (
        <Card>
            <CardContent className="flex items-center justify-between p-4">
                <div>
                    <p className="text-[9px] font-black uppercase tracking-widest text-slate-400">{label}</p>
                    <p className="mt-1 text-xl font-black text-slate-950 text-wrap-anywhere">{value}</p>
                </div>
                <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-[#12335f] text-white">
                    <Icon className="h-5 w-5" />
                </div>
            </CardContent>
        </Card>
    );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
    return (
        <div className="space-y-1">
            <label className="text-[10px] font-black uppercase tracking-wider text-slate-400">{label}</label>
            {children}
        </div>
    );
}

// ─── Invite Modal ─────────────────────────────────────────────────────────────

function InviteModal({ roles, onClose, onSuccess }: { roles: OrgCustomRole[]; onClose: () => void; onSuccess: () => void }) {
    const [email, setEmail] = useState('');
    const [orgRole, setOrgRole] = useState<OrgRole>('PROCUREMENT_OFFICER');
    const [customRoleId, setCustomRoleId] = useState<number | ''>(roles.find(role => role.roleKey === 'procurement_officer')?.id || '');
    const [saving, setSaving] = useState(false);

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        if (!email.trim() || !email.includes('@')) {
            toast.error('Enter a valid email address');
            return;
        }
        setSaving(true);
        try {
            await postApi('/api/org/invite', {
                email: email.trim().toLowerCase(),
                orgRole,
                customRoleId: customRoleId === '' ? undefined : customRoleId
            });
            toast.success(`Invitation sent to ${email}`);
            onSuccess();
        } catch (err: any) {
            toast.error(err?.message || 'Failed to send invitation');
        } finally {
            setSaving(false);
        }
    };

    return (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/40 backdrop-blur-sm p-4">
            <div className="w-full max-w-md overflow-hidden rounded-xl border border-slate-200 bg-white shadow-2xl">
                <div className="flex items-center justify-between border-b border-slate-200 bg-gradient-to-r from-[#0b1f3a] to-[#12335f] px-5 py-4 text-white">
                    <div>
                        <h3 className="text-sm font-black uppercase tracking-widest">Invite Team Member</h3>
                        <p className="mt-0.5 text-[10px] text-white/70">Send an invitation email with a secure link</p>
                    </div>
                    <button onClick={onClose} className="rounded-md p-1 text-white/80 hover:bg-white/10">
                        <X className="h-4 w-4" />
                    </button>
                </div>
                <form onSubmit={handleSubmit} className="p-5 space-y-4">
                    <div className="space-y-1">
                        <label className="text-[10px] font-black uppercase tracking-wider text-slate-400">Email Address</label>
                        <input
                            type="email"
                            value={email}
                            onChange={e => setEmail(e.target.value)}
                            placeholder="colleague@company.com"
                            required
                            className="h-10 w-full rounded-lg border border-slate-200 px-3 text-xs font-semibold outline-none focus:ring-2 focus:ring-[#12335f]/20"
                        />
                    </div>
                    <div className="space-y-1">
                        <label className="text-[10px] font-black uppercase tracking-wider text-slate-400">Dynamic Role</label>
                        <select value={customRoleId} onChange={e => setCustomRoleId(e.target.value === '' ? '' : Number(e.target.value))} className="h-10 w-full rounded-lg border border-slate-200 px-3 text-xs font-bold outline-none focus:ring-2 focus:ring-[#12335f]/20">
                            <option value="">Use fixed fallback role</option>
                            {roles.filter(role => role.isActive).map(role => <option key={role.id} value={role.id}>{role.name}</option>)}
                        </select>
                        <p className="text-[10px] font-semibold text-slate-400">
                            The invited user completes only personal verification and joins this organization automatically. Organization verification is not required again.
                        </p>
                    </div>
                    <div className="space-y-1">
                        <label className="text-[10px] font-black uppercase tracking-wider text-slate-400">Fallback Org Role</label>
                        <select value={orgRole} onChange={e => setOrgRole(e.target.value as OrgRole)} className="h-10 w-full rounded-lg border border-slate-200 px-3 text-xs font-bold outline-none focus:ring-2 focus:ring-[#12335f]/20">
                            {ORG_ROLES.map(r => <option key={r.value} value={r.value}>{r.label}</option>)}
                        </select>
                    </div>
                    <div className="flex justify-end gap-2 pt-2">
                        <Button type="button" variant="outline" onClick={onClose}>Cancel</Button>
                        <Button type="submit" disabled={saving} className="bg-[#12335f] text-white">
                            {saving ? 'Sending...' : 'Send Invitation'}
                        </Button>
                    </div>
                </form>
            </div>
        </div>
    );
}

// ─── Change Role Modal ────────────────────────────────────────────────────────

function ChangeRoleModal({ member, roles, onClose, onSuccess }: { member: Member; roles: OrgCustomRole[]; onClose: () => void; onSuccess: () => void }) {
    const [orgRole, setOrgRole] = useState<OrgRole>(member.orgRole);
    const [customRoleId, setCustomRoleId] = useState<number | ''>(member.customRoleId || '');
    const [saving, setSaving] = useState(false);

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        setSaving(true);
        try {
            await putApi(`/api/org/members/${member.userId}/role`, {
                orgRole,
                customRoleId: customRoleId === '' ? null : customRoleId
            });
            toast.success(`${member.user.name}'s role updated to ${orgRole.replace(/_/g, ' ')}`);
            onSuccess();
        } catch (err: any) {
            toast.error(err?.message || 'Failed to update role');
        } finally {
            setSaving(false);
        }
    };

    return (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/40 backdrop-blur-sm p-4">
            <div className="w-full max-w-md overflow-hidden rounded-xl border border-slate-200 bg-white shadow-2xl">
                <div className="flex items-center justify-between border-b border-slate-200 bg-gradient-to-r from-[#0b1f3a] to-[#12335f] px-5 py-4 text-white">
                    <div>
                        <h3 className="text-sm font-black uppercase tracking-widest">Change Role</h3>
                        <p className="mt-0.5 text-[10px] text-white/70">{member.user.name} · {member.user.email}</p>
                    </div>
                    <button onClick={onClose} className="rounded-md p-1 text-white/80 hover:bg-white/10">
                        <X className="h-4 w-4" />
                    </button>
                </div>
                <form onSubmit={handleSubmit} className="p-5 space-y-4">
                    <div className="space-y-1">
                        <label className="text-[10px] font-black uppercase tracking-wider text-slate-400">Dynamic Role</label>
                        <select value={customRoleId} onChange={e => setCustomRoleId(e.target.value === '' ? '' : Number(e.target.value))} className="h-10 w-full rounded-lg border border-slate-200 px-3 text-xs font-bold outline-none focus:ring-2 focus:ring-[#12335f]/20">
                            <option value="">No custom role</option>
                            {roles.filter(role => role.isActive).map(role => <option key={role.id} value={role.id}>{role.name}</option>)}
                        </select>
                    </div>
                    <div className="space-y-1">
                        <label className="text-[10px] font-black uppercase tracking-wider text-slate-400">Fallback Role</label>
                        <select value={orgRole} onChange={e => setOrgRole(e.target.value as OrgRole)} className="h-10 w-full rounded-lg border border-slate-200 px-3 text-xs font-bold outline-none focus:ring-2 focus:ring-[#12335f]/20">
                            {ORG_ROLES.map(r => <option key={r.value} value={r.value}>{r.label}</option>)}
                        </select>
                    </div>
                    <div className="flex justify-end gap-2 pt-2">
                        <Button type="button" variant="outline" onClick={onClose}>Cancel</Button>
                        <Button type="submit" disabled={saving} className="bg-[#12335f] text-white">
                            {saving ? 'Saving...' : 'Update Role'}
                        </Button>
                    </div>
                </form>
            </div>
        </div>
    );
}

function RoleModal({
    permissionGroups,
    templates,
    onClose,
    onSuccess
}: {
    permissionGroups: Record<string, OrgPermission[]>;
    templates: Array<{ roleKey: string; name: string }>;
    onClose: () => void;
    onSuccess: () => void;
}) {
    const [name, setName] = useState('Product A Procurement Officer');
    const [description, setDescription] = useState('Category-scoped procurement role with no payment initiation access.');
    const [cloneFrom, setCloneFrom] = useState('procurement_officer');
    const [selected, setSelected] = useState<string[]>(['MARKETPLACE_COMPARE', 'CART_ADD', 'REQUIREMENT_CREATE', 'REQUIREMENT_PUBLISH', 'REQUIREMENT_RESPONSE_COMPARE']);
    const [saving, setSaving] = useState(false);

    const toggle = (permissionKey: string) => {
        setSelected(prev => prev.includes(permissionKey) ? prev.filter(item => item !== permissionKey) : [...prev, permissionKey]);
    };

    const handleSubmit = async (event: React.FormEvent) => {
        event.preventDefault();
        if (name.trim().length < 2) {
            toast.error('Enter a role name');
            return;
        }
        setSaving(true);
        try {
            await postApi('/api/org/roles', {
                name: name.trim(),
                description: description.trim(),
                cloneFrom,
                permissions: selected
            });
            toast.success('Role created');
            onSuccess();
        } catch (err: any) {
            toast.error(err?.message || 'Failed to create role');
        } finally {
            setSaving(false);
        }
    };

    return (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/40 p-4 backdrop-blur-sm">
            <div className="max-h-[90vh] w-full max-w-4xl overflow-hidden rounded-xl border border-slate-200 bg-white shadow-2xl">
                <div className="flex items-center justify-between border-b border-slate-200 bg-[#12335f] px-5 py-4 text-white">
                    <div>
                        <h3 className="text-sm font-black uppercase tracking-widest">Create Role</h3>
                        <p className="mt-0.5 text-[10px] text-white/70">Build a custom permission checklist for this organization.</p>
                    </div>
                    <button onClick={onClose} className="rounded-md p-1 text-white/80 hover:bg-white/10"><X className="h-4 w-4" /></button>
                </div>
                <form onSubmit={handleSubmit} className="max-h-[calc(90vh-72px)] overflow-y-auto p-5">
                    <div className="grid gap-3 md:grid-cols-3">
                        <Field label="Role Name">
                            <input value={name} onChange={e => setName(e.target.value)} className="h-10 w-full rounded-lg border border-slate-200 px-3 text-xs font-semibold" />
                        </Field>
                        <Field label="Clone Template">
                            <select value={cloneFrom} onChange={e => setCloneFrom(e.target.value)} className="h-10 w-full rounded-lg border border-slate-200 px-3 text-xs font-bold">
                                <option value="">Blank role</option>
                                {templates.map(template => <option key={template.roleKey} value={template.roleKey}>{template.name}</option>)}
                            </select>
                        </Field>
                        <Field label="Selected Permissions">
                            <div className="flex h-10 items-center rounded-lg border border-slate-200 px-3 text-xs font-black text-[#12335f]">{selected.length}</div>
                        </Field>
                    </div>
                    <Field label="Description">
                        <textarea value={description} onChange={e => setDescription(e.target.value)} rows={2} className="w-full rounded-lg border border-slate-200 px-3 py-2 text-xs font-semibold" />
                    </Field>
                    <div className="mt-4 grid gap-3 md:grid-cols-2">
                        {Object.entries(permissionGroups).map(([module, permissions]) => (
                            <div key={module} className="rounded-lg border border-slate-200 p-3">
                                <p className="mb-2 text-[10px] font-black uppercase tracking-widest text-slate-500">{module}</p>
                                <div className="grid gap-1.5">
                                    {permissions.map(permission => (
                                        <label key={permission.key} className="flex items-start gap-2 rounded-md p-1.5 hover:bg-slate-50">
                                            <input type="checkbox" checked={selected.includes(permission.key)} onChange={() => toggle(permission.key)} className="mt-0.5" />
                                            <span>
                                                <span className="block text-xs font-black text-slate-800">{permission.label}</span>
                                                <span className="block text-[10px] font-semibold text-slate-500">{permission.description}</span>
                                            </span>
                                        </label>
                                    ))}
                                </div>
                            </div>
                        ))}
                    </div>
                    <div className="mt-5 flex justify-end gap-2">
                        <Button type="button" variant="outline" onClick={onClose}>Cancel</Button>
                        <Button type="submit" disabled={saving} className="bg-[#12335f] text-white">{saving ? 'Saving...' : 'Save Role'}</Button>
                    </div>
                </form>
            </div>
        </div>
    );
}

function TransferAccessModal({ member, roles, onClose, onSuccess }: { member: Member; roles: OrgCustomRole[]; onClose: () => void; onSuccess: () => void }) {
    const [toEmail, setToEmail] = useState('');
    const [customRoleId, setCustomRoleId] = useState<number | ''>(member.customRoleId || '');
    const [reason, setReason] = useState('');
    const [deactivateOldMember, setDeactivateOldMember] = useState(true);
    const [saving, setSaving] = useState(false);

    const submit = async (event: React.FormEvent) => {
        event.preventDefault();
        if (!toEmail.includes('@')) {
            toast.error('Enter replacement email');
            return;
        }
        if (reason.trim().length < 5) {
            toast.error('Reason is required');
            return;
        }
        setSaving(true);
        try {
            await postApi(`/api/org/members/${member.userId}/transfer-access`, {
                toEmail: toEmail.trim().toLowerCase(),
                customRoleId: customRoleId === '' ? undefined : customRoleId,
                reason: reason.trim(),
                deactivateOldMember
            });
            toast.success('Transfer invite created');
            onSuccess();
        } catch (err: any) {
            toast.error(err?.message || 'Transfer failed');
        } finally {
            setSaving(false);
        }
    };

    return (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/40 p-4 backdrop-blur-sm">
            <div className="w-full max-w-md overflow-hidden rounded-xl border border-slate-200 bg-white shadow-2xl">
                <div className="flex items-center justify-between border-b border-slate-200 bg-[#12335f] px-5 py-4 text-white">
                    <div>
                        <h3 className="text-sm font-black uppercase tracking-widest">Transfer Access</h3>
                        <p className="mt-0.5 text-[10px] text-white/70">{member.user.name} · {member.user.email}</p>
                    </div>
                    <button onClick={onClose} className="rounded-md p-1 text-white/80 hover:bg-white/10"><X className="h-4 w-4" /></button>
                </div>
                <form onSubmit={submit} className="space-y-4 p-5">
                    <Field label="Replacement Email">
                        <input type="email" value={toEmail} onChange={e => setToEmail(e.target.value)} className="h-10 w-full rounded-lg border border-slate-200 px-3 text-xs font-semibold" />
                    </Field>
                    <Field label="Replacement Role">
                        <select value={customRoleId} onChange={e => setCustomRoleId(e.target.value === '' ? '' : Number(e.target.value))} className="h-10 w-full rounded-lg border border-slate-200 px-3 text-xs font-bold">
                            <option value="">Copy same fallback role</option>
                            {roles.filter(role => role.isActive).map(role => <option key={role.id} value={role.id}>{role.name}</option>)}
                        </select>
                    </Field>
                    <Field label="Reason">
                        <textarea value={reason} onChange={e => setReason(e.target.value)} rows={3} className="w-full rounded-lg border border-slate-200 px-3 py-2 text-xs font-semibold" />
                    </Field>
                    <label className="flex items-center gap-2 text-xs font-semibold text-slate-700">
                        <input type="checkbox" checked={deactivateOldMember} onChange={e => setDeactivateOldMember(e.target.checked)} />
                        Deactivate old member after transfer invite is created
                    </label>
                    <div className="rounded-lg border border-amber-200 bg-amber-50 p-3 text-[10px] font-semibold leading-relaxed text-amber-800">
                        Historic records remain linked to the old user. Only future access is transferred.
                    </div>
                    <div className="flex justify-end gap-2">
                        <Button type="button" variant="outline" onClick={onClose}>Cancel</Button>
                        <Button type="submit" disabled={saving} className="bg-[#12335f] text-white">{saving ? 'Sending...' : 'Send Transfer Invite'}</Button>
                    </div>
                </form>
            </div>
        </div>
    );
}
