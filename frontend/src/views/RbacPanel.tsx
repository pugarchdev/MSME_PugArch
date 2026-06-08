import React, { useEffect, useState, useMemo } from 'react';
import { toast } from 'sonner';
import { 
  ShieldAlert, 
  ShieldCheck, 
  Search, 
  RefreshCw, 
  Save, 
  HelpCircle,
  Lock,
  CheckCircle,
  AlertCircle
} from 'lucide-react';
import { api } from '../lib/api';
import { Button } from '../components/ui/button';

interface Permission {
  id: number;
  code?: string | null;
  name?: string | null;
  module?: string | null;
  description?: string | null;
}

interface RbacRole {
  id: number;
  code: string;
  name: string;
  description: string;
  permissions: Array<{
    permissionId: number;
    permission: Permission;
  }>;
}

export default function RbacPanel() {
  const token = typeof window !== 'undefined' ? localStorage.getItem('token') || '' : '';
  const authHeaders = useMemo(() => ({ headers: { Authorization: `Bearer ${token}` } }), [token]);

  const [roles, setRoles] = useState<RbacRole[]>([]);
  const [permissions, setPermissions] = useState<Permission[]>([]);
  const [loading, setLoading] = useState(true);
  const [savingRoleId, setSavingRoleId] = useState<number | null>(null);
  
  // Track selected permission IDs per role locally before saving
  const [localMappings, setLocalMappings] = useState<Record<number, number[]>>({});
  const [originalMappings, setOriginalMappings] = useState<Record<number, number[]>>({});
  const [selectedRoleId, setSelectedRoleId] = useState<number | null>(null);
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedModule, setSelectedModule] = useState<string>('all');

  const fetchData = async () => {
    setLoading(true);
    try {
      const [rolesRes, permsRes] = await Promise.all([
        api.fetch('/api/admin/rbac/roles', authHeaders),
        api.fetch('/api/admin/rbac/permissions', authHeaders)
      ]);

      if (rolesRes.ok && permsRes.ok) {
        const rawRolesData = await rolesRes.json();
        const rawPermsData = await permsRes.json();
        
        const rolesData = Array.isArray(rawRolesData) ? rawRolesData : (rawRolesData?.data || []);
        const permsData = Array.isArray(rawPermsData) ? rawPermsData : (rawPermsData?.data || []);

        setRoles(rolesData);
        setPermissions(permsData);

        // Populate local state mapping: roleId -> permissionIds[]
        const mappings: Record<number, number[]> = {};
        rolesData.forEach((role: any) => {
          mappings[role.id] = role.permissions?.map((rp: any) => rp.permission?.id || rp.permissionId) || [];
        });
        setLocalMappings(mappings);
        setOriginalMappings(JSON.parse(JSON.stringify(mappings)));

        if (rolesData.length > 0) {
          setSelectedRoleId(rolesData[0].id);
        }
      } else {
        toast.error('Failed to retrieve security configuration profiles.');
      }
    } catch {
      toast.error('An error occurred while loading security profiles.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchData();
  }, [token]);

  const activeRole = useMemo(() => {
    return roles.find(r => r.id === selectedRoleId) || null;
  }, [roles, selectedRoleId]);

  const modules = useMemo(() => {
    const mods = new Set<string>();
    permissions.forEach(p => {
      if (p.module) mods.add(p.module);
    });
    return ['all', ...Array.from(mods)];
  }, [permissions]);

  const filteredPermissions = useMemo(() => {
    const query = searchQuery.toLowerCase();
    return permissions.filter(p => {
      const name = String(p.name || '');
      const code = String(p.code || '');
      const description = String(p.description || '');
      const module = String(p.module || '');
      const matchesSearch = name.toLowerCase().includes(query) ||
                            code.toLowerCase().includes(query) ||
                            description.toLowerCase().includes(query);
      const matchesModule = selectedModule === 'all' || module === selectedModule;
      return matchesSearch && matchesModule;
    });
  }, [permissions, searchQuery, selectedModule]);

  const handleTogglePermission = (roleId: number, permissionId: number) => {
    setLocalMappings(prev => {
      const current = prev[roleId] || [];
      const updated = current.includes(permissionId)
        ? current.filter(id => id !== permissionId)
        : [...current, permissionId];
      return { ...prev, [roleId]: updated };
    });
  };

  const handleSaveRolePermissions = async (roleId: number) => {
    setSavingRoleId(roleId);
    try {
      const permissionIds = localMappings[roleId] || [];
      const res = await api.post('/api/admin/rbac/update-permissions', {
        roleId,
        permissionIds
      }, authHeaders);

      if (res.ok) {
        toast.success('Access control policy map synchronized successfully.');
        // Update original mapping to hide "unsaved" warning
        setOriginalMappings(prev => ({ ...prev, [roleId]: [...permissionIds] }));
        
        // Refresh roles in place
        const rawRes = await res.json();
        const updatedRole = rawRes?.data || rawRes;
        setRoles(prev => prev.map(r => r.id === roleId ? updatedRole : r));
      } else {
        const errData = await res.json().catch(() => ({}));
        toast.error(errData.message || 'Failure writing RBAC configuration.');
      }
    } catch {
      toast.error('Unable to establish connection with security authorization service.');
    } finally {
      setSavingRoleId(null);
    }
  };

  const handleResetLocal = (roleId: number) => {
    setLocalMappings(prev => ({
      ...prev,
      [roleId]: [...(originalMappings[roleId] || [])]
    }));
    toast.info('Role changes discarded.');
  };

  if (loading && roles.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center min-h-[50vh] p-8 text-slate-500 uppercase tracking-widest text-xs font-bold gap-4">
        <RefreshCw className="h-8 w-8 text-[#c5a556] animate-spin" />
        Synchronizing RBAC Security Protocols...
      </div>
    );
  }

  return (
    <div className="space-y-6 max-w-7xl mx-auto">
      {/* Banner / Header */}
      <div className="bg-[#0c2340] border-b-4 border-[#c5a556] rounded-xl shadow-xl overflow-hidden p-6 md:p-8 text-white relative">
        <div className="absolute right-0 top-0 opacity-10 translate-x-1/4 -translate-y-1/4 select-none pointer-events-none">
          <ShieldAlert className="h-64 w-64 text-white" />
        </div>
        <div className="relative z-10 flex flex-col md:flex-row md:items-center justify-between gap-4">
          <div>
            <div className="flex items-center gap-2 mb-1">
              <span className="bg-[#c5a556]/20 border border-[#c5a556] text-[#c5a556] text-[10px] uppercase font-bold tracking-widest px-2.5 py-0.5 rounded-full">
                Security Core
              </span>
              <span className="text-[10px] text-slate-300 font-medium tracking-wider">v1.2.0</span>
            </div>
            <h1 className="text-2xl md:text-3xl font-extrabold tracking-tight">Role-Based Access Control (RBAC)</h1>
            <p className="mt-2 text-sm text-slate-300 max-w-2xl">
              Master control panel to manage granular platform actions. Set which structural tabs, endpoints, and functionalities are authorized per user classification.
            </p>
          </div>
          <Button 
            onClick={fetchData}
            variant="outline"
            className="self-start md:self-center border-white/20 hover:border-white/50 hover:text-white text-black hover:bg-white/10 shrink-0 gap-2 text-xs font-bold uppercase tracking-wider h-10"
          >
            <RefreshCw className={`h-3.5 w-3.5 ${loading ? 'animate-spin' : ''}`} />
            Reload Profiles
          </Button>
        </div>
      </div>

      {/* Stats Summary Panel */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <div className="bg-white rounded-xl p-5 border border-slate-200/80 shadow-sm flex items-center gap-4">
          <div className="h-12 w-12 rounded-xl bg-[#0c2340]/5 flex items-center justify-center text-[#0c2340]">
            <ShieldCheck className="h-6 w-6" />
          </div>
          <div>
            <p className="text-[10px] font-black uppercase tracking-widest text-slate-400">Total System Roles</p>
            <p className="text-2xl font-bold text-slate-900 mt-0.5">{roles.length}</p>
          </div>
        </div>
        <div className="bg-white rounded-xl p-5 border border-slate-200/80 shadow-sm flex items-center gap-4">
          <div className="h-12 w-12 rounded-xl bg-[#0c2340]/5 flex items-center justify-center text-[#0c2340]">
            <Lock className="h-6 w-6" />
          </div>
          <div>
            <p className="text-[10px] font-black uppercase tracking-widest text-slate-400">Active Permissions</p>
            <p className="text-2xl font-bold text-slate-900 mt-0.5">{permissions.length}</p>
          </div>
        </div>
        <div className="bg-white rounded-xl p-5 border border-slate-200/80 shadow-sm flex items-center gap-4">
          <div className="h-12 w-12 rounded-xl bg-[#c5a556]/10 flex items-center justify-center text-[#c5a556]">
            <CheckCircle className="h-6 w-6" />
          </div>
          <div>
            <p className="text-[10px] font-black uppercase tracking-widest text-slate-400">Policy Maps Installed</p>
            <p className="text-2xl font-bold text-slate-900 mt-0.5">
              {roles.reduce((acc, r) => acc + (localMappings[r.id]?.length || 0), 0)}
            </p>
          </div>
        </div>
      </div>

      {/* Main Configurations Console */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
        
        {/* Left Column: Roles Select Cards */}
        <div className="lg:col-span-4 space-y-4">
          <h2 className="text-xs font-black uppercase tracking-widest text-slate-400">Select Structural Role</h2>
          <div className="space-y-3">
            {roles.map((role) => {
              const hasChanges = JSON.stringify(localMappings[role.id]) !== JSON.stringify(originalMappings[role.id]);
              const active = selectedRoleId === role.id;
              return (
                <button
                  key={role.id}
                  onClick={() => setSelectedRoleId(role.id)}
                  className={`w-full p-4 rounded-xl border text-left transition-all duration-200 shadow-sm relative overflow-hidden group ${
                    active 
                      ? 'bg-white border-[#0c2340] ring-2 ring-[#0c2340]/10' 
                      : 'bg-white hover:bg-slate-50 border-slate-200 hover:border-slate-300'
                  }`}
                >
                  {active && (
                    <div className="absolute left-0 top-0 bottom-0 w-1.5 bg-[#0c2340]" />
                  )}
                  <div className="flex items-center justify-between">
                    <span className={`text-[10px] uppercase font-black tracking-widest ${active ? 'text-[#0c2340]' : 'text-slate-400'}`}>
                      {role.code}
                    </span>
                    {hasChanges && (
                      <span className="flex items-center gap-1 bg-amber-50 border border-amber-200 text-amber-700 text-[9px] uppercase font-bold tracking-wider px-2 py-0.5 rounded">
                        <AlertCircle className="h-2.5 w-2.5" /> Unsaved Changes
                      </span>
                    )}
                  </div>
                  <h3 className="mt-1 font-bold text-slate-900 text-base">{role.name}</h3>
                  <p className="mt-1 text-xs text-slate-500 leading-relaxed line-clamp-2">{role.description}</p>
                  
                  <div className="mt-3 flex items-center justify-between text-[10px] font-bold text-slate-400 border-t border-slate-100 pt-3 group-hover:text-slate-600 transition-colors">
                    <span>Configured Scope</span>
                    <span className="bg-slate-100 px-2 py-0.5 rounded text-slate-600 font-extrabold">
                      {(localMappings[role.id] || []).length} API Actions
                    </span>
                  </div>
                </button>
              );
            })}
          </div>
        </div>

        {/* Right Column: Permission Matrix Toggles */}
        <div className="lg:col-span-8 space-y-4">
          {activeRole ? (
            <div className="bg-white rounded-xl border border-slate-200/80 shadow-sm overflow-hidden flex flex-col h-full">
              {/* Header inside Panel */}
              <div className="p-5 border-b border-slate-100 bg-slate-5/50 flex flex-col sm:flex-row sm:items-center justify-between gap-4">
                <div>
                  <h3 className="font-bold text-slate-900 text-lg flex items-center gap-2">
                    Permissions Profile: <span className="text-[#0c2340] underline decoration-[#c5a556] decoration-2">{activeRole.name}</span>
                  </h3>
                  <p className="text-xs text-slate-500 mt-0.5">Toggle active modules below. Press Apply Policy to write settings permanently to DB.</p>
                </div>
                
                {/* Actions */}
                {JSON.stringify(localMappings[activeRole.id]) !== JSON.stringify(originalMappings[activeRole.id]) && (
                  <div className="flex items-center gap-2 shrink-0">
                    <Button 
                      variant="outline" 
                      size="sm"
                      onClick={() => handleResetLocal(activeRole.id)}
                      className="border-slate-200 text-slate-600 hover:bg-slate-50 text-xs font-bold uppercase tracking-wider py-1.5 h-9"
                    >
                      Discard
                    </Button>
                    <Button 
                      size="sm"
                      onClick={() => handleSaveRolePermissions(activeRole.id)}
                      disabled={savingRoleId !== null}
                      className="bg-[#0c2340] hover:bg-[#0c2340]/90 text-white text-xs font-bold uppercase tracking-wider gap-2 py-1.5 h-9 shadow-md"
                    >
                      {savingRoleId === activeRole.id ? (
                        <RefreshCw className="h-3.5 w-3.5 animate-spin" />
                      ) : (
                        <Save className="h-3.5 w-3.5 text-[#c5a556]" />
                      )}
                      Apply Policy
                    </Button>
                  </div>
                )}
              </div>

              {/* Filtering Controls */}
              <div className="p-4 bg-slate-50 border-b border-slate-100 flex flex-col sm:flex-row items-center gap-3">
                {/* Search query */}
                <div className="relative w-full sm:w-64">
                  <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-slate-400" />
                  <input
                    type="text"
                    value={searchQuery}
                    onChange={(e) => setSearchQuery(e.target.value)}
                    placeholder="Search permission scopes..."
                    className="w-full h-8 pl-9 pr-3 rounded-lg border border-slate-200 text-xs focus:outline-none focus:ring-2 focus:ring-[#0c2340]/10 focus:border-[#0c2340] bg-white transition-all"
                  />
                </div>

                {/* Module selector tab */}
                <div className="flex flex-wrap gap-1.5 w-full sm:w-auto">
                  {modules.map((mod) => (
                    <button
                      key={mod}
                      onClick={() => setSelectedModule(mod)}
                      className={`px-2.5 py-1 rounded text-[10px] uppercase font-black tracking-wider border transition-all ${
                        selectedModule === mod
                          ? 'bg-[#0c2340] border-[#0c2340] text-white'
                          : 'bg-white border-slate-200 hover:border-slate-300 text-slate-500 hover:text-slate-800'
                      }`}
                    >
                      {mod}
                    </button>
                  ))}
                </div>
              </div>

              {/* Permissions Checklist Grid */}
              <div className="p-6 max-h-[500px] overflow-y-auto space-y-4">
                {filteredPermissions.length > 0 ? (
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    {filteredPermissions.map((perm) => {
                      const active = (localMappings[activeRole.id] || []).includes(perm.id);
                      return (
                        <button
                          key={perm.id}
                          onClick={() => handleTogglePermission(activeRole.id, perm.id)}
                          className={`p-4 rounded-xl border text-left transition-all duration-200 flex items-start gap-3 shadow-sm group select-none ${
                            active
                              ? 'bg-[#0c2340]/5 border-[#0c2340]/30 hover:border-[#0c2340]/50'
                              : 'bg-white border-slate-200 hover:border-slate-300'
                          }`}
                        >
                          <div className={`mt-0.5 shrink-0 h-4.5 w-4.5 rounded border flex items-center justify-center transition-all ${
                            active 
                              ? 'bg-[#0c2340] border-[#0c2340] text-white shadow-inner' 
                              : 'border-slate-300 group-hover:border-slate-400 bg-white'
                          }`}>
                            {active && (
                              <svg className="h-3 w-3 fill-none stroke-current stroke-2" viewBox="0 0 24 24">
                                <polyline points="20 6 9 17 4 12" />
                              </svg>
                            )}
                          </div>
                          
                          <div className="min-w-0">
                            <div className="flex items-center gap-1.5 flex-wrap">
                              <span className="font-extrabold text-slate-850 text-xs font-mono">{perm.code}</span>
                              <span className="bg-slate-100 text-[8px] font-black uppercase tracking-wider px-1.5 py-0.5 rounded text-slate-500 font-mono">
                                {perm.module}
                              </span>
                            </div>
                            <h4 className="font-bold text-slate-900 text-xs mt-1.5">{perm.name}</h4>
                            <p className="text-[11px] text-slate-500 leading-relaxed mt-0.5 line-clamp-2">{perm.description}</p>
                          </div>
                        </button>
                      );
                    })}
                  </div>
                ) : (
                  <div className="py-12 text-center">
                    <HelpCircle className="h-10 w-10 text-slate-300 mx-auto mb-3" />
                    <p className="text-xs font-bold text-slate-400 uppercase tracking-widest">No matching authorization scopes found</p>
                  </div>
                )}
              </div>

              {/* Matrix Policy Footer Banner */}
              <div className="bg-[#0c2340]/5 border-t border-slate-100 p-4 flex items-center gap-3">
                <ShieldCheck className="h-5 w-5 text-[#c5a556] shrink-0" />
                <p className="text-[11px] text-slate-600 leading-relaxed">
                  <strong>Secure System Standard:</strong> Dynamic changes to these tables immediately update permission scopes for users upon their next authentication verify check or session refresh. Modify responsibly to protect corporate data boundaries.
                </p>
              </div>

            </div>
          ) : (
            <div className="bg-white rounded-xl border border-slate-200/80 shadow-sm p-12 text-center">
              <ShieldAlert className="h-12 w-12 text-slate-300 mx-auto mb-3 animate-pulse" />
              <h3 className="font-bold text-slate-900 text-base">Select structural classification to manage</h3>
              <p className="text-xs text-slate-500 mt-1">Please pick a security profile card from the side column matrix to inspect access protocols.</p>
            </div>
          )}
        </div>

      </div>
    </div>
  );
}
