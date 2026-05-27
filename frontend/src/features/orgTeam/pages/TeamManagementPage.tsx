/**
 * TeamManagementPage — ORG_ADMIN can invite team members, view all members,
 * change roles, and remove members.
 *
 * Route: /org/team
 * Access: ORG_ADMIN only
 */
import { useState } from 'react';
import {
    Mail, Plus, RefreshCw, Shield, Trash2, UserCheck,
    UserPlus, Users, X, ChevronDown, Clock, CheckCircle2
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
import { useFeatureQuery } from '../../shared/hooks';

// ─── Types ────────────────────────────────────────────────────────────────────

type Member = {
    id: number;
    userId: number;
    orgRole: OrgRole;
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
    expiresAt: string;
    createdAt: string;
    invitedBy: { id: number; name: string; email: string };
};

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

    const { data: membersData, loading: membersLoading, error: membersError, reload: reloadMembers } =
        useFeatureQuery<Member[]>('/api/org/members', []);

    const { data: invitesData, loading: invitesLoading, reload: reloadInvites } =
        useFeatureQuery<Invitation[]>('/api/org/invitations', []);

    const members = Array.isArray(membersData) ? membersData : [];
    const invitations = Array.isArray(invitesData) ? invitesData : [];

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
                        <RefreshCw className="mr-2 h-4 w-4" /> Refresh
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

            {membersError && <InlineError message={membersError} onRetry={reloadMembers} />}

            {/* Members Table */}
            <Card className="border-slate-200/80 shadow-sm">
                <CardContent className="p-0">
                    <div className="border-b border-slate-100 bg-slate-50/60 px-4 py-3">
                        <p className="text-[10px] font-black uppercase tracking-widest text-slate-500">Team Members ({members.length})</p>
                    </div>
                    {membersLoading ? (
                        <LoadingState label="Loading members..." />
                    ) : members.length === 0 ? (
                        <EmptyState title="No members yet" description="Invite your first team member to get started." />
                    ) : (
                        <div className="overflow-x-auto">
                            <table className="w-full min-w-[800px] text-sm">
                                <thead className="border-b border-slate-100 bg-slate-50/60 text-[10px] font-black uppercase tracking-widest text-slate-500">
                                    <tr>
                                        <th className="px-4 py-2.5 text-left w-12">#</th>
                                        <th className="px-4 py-2.5 text-left">Member</th>
                                        <th className="px-4 py-2.5 text-left w-48">Role</th>
                                        <th className="px-4 py-2.5 text-left w-32">Status</th>
                                        <th className="px-4 py-2.5 text-left w-44">Joined</th>
                                        <th className="px-4 py-2.5 text-left w-44">Last Login</th>
                                        <th className="px-4 py-2.5 text-right w-32">Actions</th>
                                    </tr>
                                </thead>
                                <tbody className="divide-y divide-slate-100">
                                    {members.map((member, idx) => (
                                        <tr key={member.id} className="hover:bg-slate-50/60">
                                            <td className="px-4 py-3 text-xs font-mono text-slate-400">{String(idx + 1).padStart(2, '0')}</td>
                                            <td className="px-4 py-3">
                                                <EntityIdLink label={`MBR-${member.userId}`} id={member.userId} size="sm" onClick={() => { }} />
                                                <p className="mt-1 text-sm font-black text-slate-900 text-wrap-anywhere">{member.user.name}</p>
                                                <p className="text-[10px] font-semibold text-slate-500 text-wrap-anywhere">{member.user.email}</p>
                                            </td>
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
                                            </td>
                                        </tr>
                                    ))}
                                </tbody>
                            </table>
                        </div>
                    )}
                </CardContent>
            </Card>

            {/* Pending Invitations */}
            {invitations.length > 0 && (
                <Card className="border-slate-200/80 shadow-sm">
                    <CardContent className="p-0">
                        <div className="border-b border-slate-100 bg-amber-50/60 px-4 py-3">
                            <p className="text-[10px] font-black uppercase tracking-widest text-amber-700">Pending Invitations ({invitations.length})</p>
                        </div>
                        <div className="divide-y divide-slate-100">
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
                        </div>
                    </CardContent>
                </Card>
            )}

            {/* Modals */}
            {showInviteModal && (
                <InviteModal
                    onClose={() => setShowInviteModal(false)}
                    onSuccess={() => { setShowInviteModal(false); reloadInvites(); }}
                />
            )}
            {editingMember && (
                <ChangeRoleModal
                    member={editingMember}
                    onClose={() => setEditingMember(null)}
                    onSuccess={() => { setEditingMember(null); reloadMembers(); }}
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

// ─── Invite Modal ─────────────────────────────────────────────────────────────

function InviteModal({ onClose, onSuccess }: { onClose: () => void; onSuccess: () => void }) {
    const [email, setEmail] = useState('');
    const [orgRole, setOrgRole] = useState<OrgRole>('PROCUREMENT_OFFICER');
    const [saving, setSaving] = useState(false);

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        if (!email.trim() || !email.includes('@')) {
            toast.error('Enter a valid email address');
            return;
        }
        setSaving(true);
        try {
            await postApi('/api/org/invite', { email: email.trim().toLowerCase(), orgRole });
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
                        <label className="text-[10px] font-black uppercase tracking-wider text-slate-400">Role</label>
                        <select
                            value={orgRole}
                            onChange={e => setOrgRole(e.target.value as OrgRole)}
                            className="h-10 w-full rounded-lg border border-slate-200 px-3 text-xs font-bold outline-none focus:ring-2 focus:ring-[#12335f]/20"
                        >
                            {ORG_ROLES.map(r => (
                                <option key={r.value} value={r.value}>{r.label}</option>
                            ))}
                        </select>
                        <p className="text-[10px] font-semibold text-slate-400">
                            {ORG_ROLES.find(r => r.value === orgRole)?.description}
                        </p>
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

function ChangeRoleModal({ member, onClose, onSuccess }: { member: Member; onClose: () => void; onSuccess: () => void }) {
    const [orgRole, setOrgRole] = useState<OrgRole>(member.orgRole);
    const [saving, setSaving] = useState(false);

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        setSaving(true);
        try {
            await putApi(`/api/org/members/${member.userId}/role`, { orgRole });
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
                        <label className="text-[10px] font-black uppercase tracking-wider text-slate-400">New Role</label>
                        <select
                            value={orgRole}
                            onChange={e => setOrgRole(e.target.value as OrgRole)}
                            className="h-10 w-full rounded-lg border border-slate-200 px-3 text-xs font-bold outline-none focus:ring-2 focus:ring-[#12335f]/20"
                        >
                            {ORG_ROLES.map(r => (
                                <option key={r.value} value={r.value}>{r.label}</option>
                            ))}
                        </select>
                        <p className="text-[10px] font-semibold text-slate-400">
                            {ORG_ROLES.find(r => r.value === orgRole)?.description}
                        </p>
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
