import React, { useEffect, useMemo, useState } from 'react';
import { toast } from 'sonner';
import { Check, FileClock, LockKeyhole, Plus, RefreshCw, Save, Search, Shield, UserPlus, Users } from 'lucide-react';
import { api, unwrapApiData } from '../lib/api';
import { Button } from '../components/ui/button';
import { useAuth } from '../hooks/useAuth';
import { sanitizeIndianMobileInput, sanitizePersonNameInput, validateIndianMobile, validatePersonName, validateRequiredText } from '../lib/validation';

type ScopeType = 'PLATFORM' | 'DISTRICT' | 'ORGANIZATION';

type Permission = {
  id: number;
  code: string;
  module: string;
  action?: string | null;
  resource?: string | null;
  description?: string | null;
};

type Role = {
  id: number;
  code: string;
  name: string;
  description?: string | null;
  scopeType: ScopeType;
  scopeId?: string | null;
  status: 'ACTIVE' | 'INACTIVE' | 'ARCHIVED';
  isDefault?: boolean;
  permissions: Array<{ permissionId: number; permission: Permission }>;
  _count?: { users: number };
};

type Member = {
  id: number;
  name: string;
  email: string;
  mobile?: string | null;
  role: string;
  accountType?: string;
  accountStatus: string;
  organizationId?: number | null;
  companyId?: number | null;
  roles?: Array<{ role: Role; isActive: boolean }>;
};

const scopeLabels: Record<ScopeType, string> = {
  PLATFORM: 'Platform',
  DISTRICT: 'District',
  ORGANIZATION: 'Organization'
};

const emptyRole = {
  name: '',
  description: '',
  scopeType: 'ORGANIZATION' as ScopeType,
  status: 'ACTIVE',
  permissionCodes: [] as string[]
};

const authHeaders = () => ({ Authorization: `Bearer ${localStorage.getItem('token') || ''}` });

export default function RbacPanel() {
  const { user } = useAuth();
  const [roles, setRoles] = useState<Role[]>([]);
  const [permissions, setPermissions] = useState<Permission[]>([]);
  const [members, setMembers] = useState<Member[]>([]);
  const [auditLogs, setAuditLogs] = useState<any[]>([]);
  const [currentPermissions, setCurrentPermissions] = useState<string[] | null>(null);
  const [selectedRoleId, setSelectedRoleId] = useState<number | null>(null);
  const [selectedMemberId, setSelectedMemberId] = useState<number | null>(null);
  const [activeTab, setActiveTab] = useState<'roles' | 'team' | 'audit'>('roles');
  const [query, setQuery] = useState('');
  const [moduleFilter, setModuleFilter] = useState('All');
  const [draft, setDraft] = useState(emptyRole);
  const [rolePermissionDraft, setRolePermissionDraft] = useState<Record<number, string[]>>({});
  const [invite, setInvite] = useState({ name: '', email: '', mobile: '', roleIds: [] as number[] });
  const [saving, setSaving] = useState(false);
  const [loading, setLoading] = useState(true);

  const canManage = user?.role === 'master_admin' || currentPermissions?.includes('*') || currentPermissions?.includes('team.role.manage');
  const canInvite = user?.role === 'master_admin' || currentPermissions?.includes('*') || currentPermissions?.includes('team.member.invite');
  const canAssign = user?.role === 'master_admin' || currentPermissions?.includes('*') || currentPermissions?.includes('team.role.assign') || currentPermissions?.includes('team.role.manage');

  const defaultScope = useMemo(() => {
    if (user?.role === 'master_admin') return { scopeType: 'PLATFORM' as ScopeType, scopeId: null };
    if (user?.role === 'admin') return { scopeType: 'DISTRICT' as ScopeType, scopeId: user.companyId ? String(user.companyId) : null };
    return { scopeType: 'ORGANIZATION' as ScopeType, scopeId: user?.organizationId ? String(user.organizationId) : null };
  }, [user]);

  const selectedRole = roles.find(role => role.id === selectedRoleId) || roles[0] || null;

  const modules = useMemo(() => ['All', ...Array.from(new Set(permissions.map(p => p.module || 'Other')))], [permissions]);

  const groupedPermissions = useMemo(() => {
    const q = query.trim().toLowerCase();
    return permissions
      .filter(permission => moduleFilter === 'All' || permission.module === moduleFilter)
      .filter(permission => !q || [permission.code, permission.module, permission.description || ''].join(' ').toLowerCase().includes(q))
      .reduce<Record<string, Permission[]>>((acc, permission) => {
        const permModule = permission.module || 'Other';
        acc[permModule] = acc[permModule] || [];
        acc[permModule].push(permission);
        return acc;
      }, {});
  }, [permissions, query, moduleFilter]);

  const load = async () => {
    setLoading(true);
    try {
      const headers = authHeaders();
      const [rolesRes, permsRes, membersRes, auditRes] = await Promise.all([
        api.get('/api/rbac/roles', { headers, skipCache: true }),
        api.get('/api/rbac/permissions/grouped', { headers, skipCache: true }),
        api.get('/api/team/members', { headers, skipCache: true }),
        api.get('/api/rbac/audit-logs', { headers, skipCache: true })
      ]);
      const mePermsRes = await api.get('/api/auth/me/permissions', { headers, skipCache: true });
      if (mePermsRes.ok) {
        const payload = unwrapApiData(await mePermsRes.json());
        setCurrentPermissions(payload.permissions || []);
      } else {
        setCurrentPermissions(user?.permissions || []);
      }
      if (rolesRes.ok) {
        const nextRoles = unwrapApiData<Role[]>(await rolesRes.json());
        setRoles(nextRoles);
        setRolePermissionDraft(Object.fromEntries(nextRoles.map(role => [role.id, role.permissions?.map(row => row.permission.code) || []])));
      }
      if (permsRes.ok) {
        const grouped = unwrapApiData<Record<string, Permission[]>>(await permsRes.json());
        setPermissions(Object.values(grouped).flat());
      }
      if (membersRes.ok) setMembers(unwrapApiData(await membersRes.json()));
      if (auditRes.ok) setAuditLogs(unwrapApiData(await auditRes.json()));
    } catch {
      toast.error('Unable to load roles and permissions.');
      setCurrentPermissions(user?.permissions || []);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    load();
  }, []);

  useEffect(() => {
    setDraft(prev => ({ ...prev, scopeType: defaultScope.scopeType }));
  }, [defaultScope.scopeType]);

  const selectedCodes = useMemo(
    () => new Set(selectedRole ? rolePermissionDraft[selectedRole.id] || [] : []),
    [selectedRole, rolePermissionDraft]
  );

  const draftCodes = new Set(draft.permissionCodes);

  const toggleDraftPermission = (code: string) => {
    setDraft(prev => ({
      ...prev,
      permissionCodes: prev.permissionCodes.includes(code)
        ? prev.permissionCodes.filter(item => item !== code)
        : [...prev.permissionCodes, code]
    }));
  };

  const toggleSelectedRolePermission = (code: string) => {
    if (!selectedRole) return;
    setRolePermissionDraft(prev => {
      const current = prev[selectedRole.id] || [];
      return {
        ...prev,
        [selectedRole.id]: current.includes(code)
          ? current.filter(item => item !== code)
          : [...current, code]
      };
    });
  };

  const saveRole = async () => {
    const roleNameError = validateRequiredText(draft.name, 'Role name', {
      min: 2,
      max: 80,
      pattern: /^[A-Za-z0-9][A-Za-z0-9 _./&()'-]*$/,
      patternMessage: 'Role name can contain letters, numbers, spaces, and common separators'
    });
    if (roleNameError) {
      toast.error(roleNameError);
      return;
    }
    const normalizedRoleName = draft.name.trim().replace(/\s+/g, ' ');
    setSaving(true);
    try {
      const res = await api.post('/api/rbac/roles', {
        ...draft,
        name: normalizedRoleName,
        scopeId: defaultScope.scopeId
      }, { headers: authHeaders() });
      if (!res.ok) throw new Error((await res.json().catch(() => ({}))).message || 'Unable to create role');
      toast.success('Role created.');
      setDraft({ ...emptyRole, scopeType: defaultScope.scopeType });
      await load();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Unable to create role.');
    } finally {
      setSaving(false);
    }
  };

  const saveSelectedRolePermissions = async () => {
    if (!selectedRole) return;
    setSaving(true);
    try {
      const res = await api.post(`/api/rbac/roles/${selectedRole.id}/permissions`, {
        permissionCodes: rolePermissionDraft[selectedRole.id] || []
      }, { headers: authHeaders() });
      if (!res.ok) throw new Error((await res.json().catch(() => ({}))).message || 'Unable to update role');
      toast.success('Role permissions saved.');
      await load();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Unable to update role.');
    } finally {
      setSaving(false);
    }
  };

  const assignRole = async () => {
    if (!selectedMemberId || !selectedRole) return;
    setSaving(true);
    try {
      const res = await api.post(`/api/rbac/users/${selectedMemberId}/roles`, {
        roleId: selectedRole.id,
        scopeType: selectedRole.scopeType,
        scopeId: selectedRole.scopeId
      }, { headers: authHeaders() });
      if (!res.ok) throw new Error((await res.json().catch(() => ({}))).message || 'Unable to assign role');
      toast.success('Role assigned.');
      await load();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Unable to assign role.');
    } finally {
      setSaving(false);
    }
  };

  const sendInvite = async () => {
    const cleanName = sanitizePersonNameInput(invite.name).trim();
    const cleanMobile = sanitizeIndianMobileInput(invite.mobile);
    if (cleanName) {
      const nameError = validatePersonName(cleanName, 'Name');
      if (nameError) return toast.error(nameError);
    }
    if (cleanMobile) {
      const mobileError = validateIndianMobile(cleanMobile, 'Mobile number');
      if (mobileError) return toast.error(mobileError);
    }
    if (!invite.email.trim()) return toast.error('Email is required.');
    setSaving(true);
    try {
      const res = await api.post('/api/team/invite', {
        ...invite,
        name: cleanName || undefined,
        mobile: cleanMobile || undefined
      }, { headers: authHeaders() });
      if (!res.ok) throw new Error((await res.json().catch(() => ({}))).message || 'Unable to create invite');
      toast.success('Invite created.');
      setInvite({ name: '', email: '', mobile: '', roleIds: [] });
      await load();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Unable to create invite.');
    } finally {
      setSaving(false);
    }
  };

  if (currentPermissions === null) {
    return (
      <div className="flex min-h-[40vh] items-center justify-center text-sm font-bold text-slate-500">
        <RefreshCw className="mr-2 h-4 w-4 animate-spin" />
        Loading access policy
      </div>
    );
  }

  if (!canManage) {
    return (
      <div className="mx-auto max-w-3xl rounded-lg border border-slate-200 bg-white p-8 shadow-sm">
        <LockKeyhole className="h-8 w-8 text-slate-500" />
        <h1 className="mt-4 text-xl font-bold text-slate-950">Role management is restricted</h1>
        <p className="mt-2 text-sm text-slate-600">You need the team.role.manage permission to manage roles and team access.</p>
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-7xl space-y-5">
      <div className="flex flex-col gap-3 border-b border-slate-200 pb-4 md:flex-row md:items-end md:justify-between">
        <div>
          <div className="flex items-center gap-2 text-xs font-bold uppercase tracking-widest text-slate-500">
            <Shield className="h-4 w-4" />
            Dynamic RBAC
          </div>
          <h1 className="mt-1 text-2xl font-black text-slate-950">Roles & Permissions</h1>
          <p className="mt-1 text-sm text-slate-600">{scopeLabels[defaultScope.scopeType]} scoped access policies for this workspace.</p>
        </div>
        <Button onClick={load} variant="outline" className="gap-2" disabled={loading}>
          <RefreshCw className={`h-4 w-4 ${loading ? 'animate-spin' : ''}`} />
          Refresh
        </Button>
      </div>

      <div className="flex flex-wrap gap-2">
        {[
          ['roles', 'Roles', Shield],
          ['team', 'Team Members', Users],
          ['audit', 'Audit Logs', FileClock]
        ].map(([key, label, Icon]) => (
          <button
            key={key as string}
            onClick={() => setActiveTab(key as typeof activeTab)}
            className={`inline-flex h-10 items-center gap-2 rounded-md border px-3 text-sm font-bold transition ${activeTab === key ? 'border-slate-950 bg-slate-950 text-white' : 'border-slate-200 bg-white text-slate-700 hover:border-slate-400'}`}
          >
            <Icon className="h-4 w-4" />
            {label as string}
          </button>
        ))}
      </div>

      {activeTab === 'roles' && (
        <div className="grid gap-5 lg:grid-cols-[320px_1fr]">
          <div className="space-y-3">
            <div className="rounded-lg border border-slate-200 bg-white p-4 shadow-sm">
              <h2 className="text-sm font-black text-slate-950">Create Role</h2>
              <div className="mt-4 space-y-3">
                <input value={draft.name} onChange={e => setDraft(prev => ({ ...prev, name: e.target.value }))} maxLength={80} className="h-10 w-full rounded-md border border-slate-200 px-3 text-sm outline-none focus:border-slate-500" placeholder="Role name" />
                <textarea value={draft.description} onChange={e => setDraft(prev => ({ ...prev, description: e.target.value }))} className="min-h-20 w-full rounded-md border border-slate-200 px-3 py-2 text-sm outline-none focus:border-slate-500" placeholder="Description" />
                <div className="grid grid-cols-2 gap-2">
                  <select value={draft.scopeType} onChange={e => setDraft(prev => ({ ...prev, scopeType: e.target.value as ScopeType }))} className="h-10 rounded-md border border-slate-200 px-3 text-sm">
                    <option value="PLATFORM">Platform</option>
                    <option value="DISTRICT">District</option>
                    <option value="ORGANIZATION">Organization</option>
                  </select>
                  <select value={draft.status} onChange={e => setDraft(prev => ({ ...prev, status: e.target.value as any }))} className="h-10 rounded-md border border-slate-200 px-3 text-sm">
                    <option value="ACTIVE">Active</option>
                    <option value="INACTIVE">Inactive</option>
                  </select>
                </div>
                <Button onClick={saveRole} disabled={saving} className="w-full gap-2 bg-slate-950 text-white">
                  <Plus className="h-4 w-4" />
                  Create Role
                </Button>
              </div>
            </div>

            <div className="space-y-2">
              {roles.map(role => (
                <button
                  key={role.id}
                  onClick={() => setSelectedRoleId(role.id)}
                  className={`w-full rounded-lg border bg-white p-3 text-left shadow-sm transition ${selectedRole?.id === role.id ? 'border-slate-950 ring-2 ring-slate-950/10' : 'border-slate-200 hover:border-slate-400'}`}
                >
                  <div className="flex items-center justify-between gap-3">
                    <span className="text-sm font-black text-slate-950">{role.name}</span>
                    <span className="rounded bg-slate-100 px-2 py-1 text-[10px] font-bold uppercase text-slate-600">{role.status}</span>
                  </div>
                  <p className="mt-1 line-clamp-2 text-xs text-slate-500">{role.description || role.code}</p>
                  <div className="mt-2 flex items-center justify-between text-[11px] font-bold text-slate-500">
                    <span>{scopeLabels[role.scopeType]}</span>
                    <span>{role.permissions?.length || 0} permissions</span>
                  </div>
                </button>
              ))}
            </div>
          </div>

          <div className="rounded-lg border border-slate-200 bg-white shadow-sm">
            <div className="flex flex-col gap-3 border-b border-slate-200 p-4 md:flex-row md:items-center md:justify-between">
              <div>
                <h2 className="text-lg font-black text-slate-950">{selectedRole?.name || 'Permission Matrix'}</h2>
                <p className="text-xs font-semibold text-slate-500">Authorization depends on permission codes, not role names.</p>
              </div>
              {selectedRole && (
                <Button onClick={saveSelectedRolePermissions} disabled={saving} className="gap-2 bg-slate-950 text-white">
                  <Save className="h-4 w-4" />
                  Save Matrix
                </Button>
              )}
            </div>
            <div className="flex flex-col gap-3 border-b border-slate-200 bg-slate-50 p-4 md:flex-row">
              <div className="relative md:w-80">
                <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
                <input value={query} onChange={e => setQuery(e.target.value)} className="h-10 w-full rounded-md border border-slate-200 bg-white pl-9 pr-3 text-sm outline-none focus:border-slate-500" placeholder="Search permissions" />
              </div>
              <select value={moduleFilter} onChange={e => setModuleFilter(e.target.value)} className="h-10 rounded-md border border-slate-200 bg-white px-3 text-sm">
                {modules.map(module => <option key={module} value={module}>{module}</option>)}
              </select>
            </div>
            <div className="max-h-[640px] overflow-y-auto p-4">
              {Object.entries(groupedPermissions).map(([module, items]) => (
                <section key={module} className="mb-5">
                  <div className="mb-2 flex items-center justify-between">
                    <h3 className="text-xs font-black uppercase tracking-widest text-slate-500">{module}</h3>
                    <button
                      onClick={() => setDraft(prev => ({ ...prev, permissionCodes: Array.from(new Set([...prev.permissionCodes, ...items.map(item => item.code)])) }))}
                      className="text-xs font-bold text-slate-700 underline"
                    >
                      Select all for new role
                    </button>
                  </div>
                  <div className="grid gap-2 md:grid-cols-2">
                    {items.map(permission => {
                      const assigned = selectedCodes.has(permission.code);
                      const inDraft = draftCodes.has(permission.code);
                      return (
                        <button
                          key={permission.id}
                          onClick={() => toggleSelectedRolePermission(permission.code)}
                          className={`flex min-h-20 items-start gap-3 rounded-md border p-3 text-left transition ${inDraft ? 'border-emerald-300 bg-emerald-50' : assigned ? 'border-slate-300 bg-slate-50' : 'border-slate-200 bg-white hover:border-slate-400'}`}
                        >
                          <span className={`mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded border ${inDraft || assigned ? 'border-slate-950 bg-slate-950 text-white' : 'border-slate-300'}`}>
                            {(inDraft || assigned) && <Check className="h-3 w-3" />}
                          </span>
                          <span className="min-w-0">
                            <span className="block truncate font-mono text-xs font-black text-slate-950">{permission.code}</span>
                            <span className="mt-1 block text-xs leading-relaxed text-slate-500">{permission.description}</span>
                          </span>
                        </button>
                      );
                    })}
                  </div>
                </section>
              ))}
            </div>
          </div>
        </div>
      )}

      {activeTab === 'team' && (
        <div className="grid gap-5 lg:grid-cols-[360px_1fr]">
          <div className="rounded-lg border border-slate-200 bg-white p-4 shadow-sm">
            <div className="flex items-center gap-2">
              <UserPlus className="h-5 w-5 text-slate-700" />
              <h2 className="text-sm font-black text-slate-950">Invite User</h2>
            </div>
            <div className="mt-4 space-y-3">
              <input value={invite.name} onChange={e => setInvite(prev => ({ ...prev, name: sanitizePersonNameInput(e.target.value) }))} maxLength={100} className="h-10 w-full rounded-md border border-slate-200 px-3 text-sm" placeholder="Name" />
              <input value={invite.email} onChange={e => setInvite(prev => ({ ...prev, email: e.target.value }))} className="h-10 w-full rounded-md border border-slate-200 px-3 text-sm" placeholder="Email" />
              <input value={invite.mobile} onChange={e => setInvite(prev => ({ ...prev, mobile: sanitizeIndianMobileInput(e.target.value) }))} inputMode="numeric" maxLength={10} className="h-10 w-full rounded-md border border-slate-200 px-3 text-sm" placeholder="Mobile" />
              <div className="max-h-44 overflow-y-auto rounded-md border border-slate-200 p-2">
                {roles.map(role => (
                  <label key={role.id} className="flex items-center gap-2 px-2 py-1 text-sm">
                    <input type="checkbox" checked={invite.roleIds.includes(role.id)} onChange={() => setInvite(prev => ({ ...prev, roleIds: prev.roleIds.includes(role.id) ? prev.roleIds.filter(id => id !== role.id) : [...prev.roleIds, role.id] }))} />
                    {role.name}
                  </label>
                ))}
              </div>
              <Button onClick={sendInvite} disabled={saving || !canInvite} className="w-full gap-2 bg-slate-950 text-white">
                <UserPlus className="h-4 w-4" />
                Send Invite
              </Button>
            </div>
          </div>

          <div className="rounded-lg border border-slate-200 bg-white shadow-sm">
            <div className="flex items-center justify-between border-b border-slate-200 p-4">
              <h2 className="text-sm font-black text-slate-950">Team Members</h2>
              <Button onClick={assignRole} disabled={!selectedMemberId || !selectedRole || saving || !canAssign} variant="outline">Assign Selected Role</Button>
            </div>
            <div className="divide-y divide-slate-100">
              {members.map(member => (
                <button key={member.id} onClick={() => setSelectedMemberId(member.id)} className={`grid w-full gap-2 p-4 text-left md:grid-cols-[1fr_160px_180px] ${selectedMemberId === member.id ? 'bg-slate-50' : 'bg-white hover:bg-slate-50'}`}>
                  <span>
                    <span className="block font-bold text-slate-950">{member.name}</span>
                    <span className="text-xs text-slate-500">{member.email}</span>
                  </span>
                  <span className="text-xs font-bold uppercase text-slate-600">{member.accountType || member.role}</span>
                  <span className="text-xs text-slate-500">{member.roles?.filter(row => row.isActive).map(row => row.role.name).join(', ') || 'No dynamic roles'}</span>
                </button>
              ))}
            </div>
          </div>
        </div>
      )}

      {activeTab === 'audit' && (
        <div className="rounded-lg border border-slate-200 bg-white shadow-sm">
          <div className="border-b border-slate-200 p-4">
            <h2 className="text-sm font-black text-slate-950">RBAC Audit Logs</h2>
          </div>
          <div className="divide-y divide-slate-100">
            {auditLogs.map(log => (
              <div key={log.id} className="grid gap-2 p-4 text-sm md:grid-cols-[220px_1fr_180px]">
                <span className="font-mono text-xs font-bold text-slate-700">{log.action}</span>
                <span className="text-slate-600">{log.User?.name || 'System'} changed {log.entityType || 'rbac'} #{log.entityId || ''}</span>
                <span className="text-xs text-slate-500">{new Date(log.createdAt).toLocaleString()}</span>
              </div>
            ))}
            {auditLogs.length === 0 && <div className="p-8 text-center text-sm text-slate-500">No RBAC audit activity yet.</div>}
          </div>
        </div>
      )}
    </div>
  );
}
