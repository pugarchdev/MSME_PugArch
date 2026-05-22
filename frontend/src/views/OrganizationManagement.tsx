import React, { useEffect, useState, useMemo } from 'react';
import { toast } from 'sonner';
import { 
  Building2, 
  Search, 
  RefreshCw, 
  ShieldAlert, 
  CheckCircle2, 
  XCircle,
  AlertTriangle,
  Sliders,
  Users,
  Eye,
  Check,
  Ban,
  Package,
  Wrench,
  BookOpen,
  Briefcase,
  ArrowUp,
  ArrowDown,
  ArrowUpDown
} from 'lucide-react';
import { api } from '../lib/api';
import { Button } from '../components/ui/button';
import { cn } from '../lib/utils';

interface Organization {
  id: number;
  organizationName: string;
  gstin?: string;
  panNumber?: string;
  verificationStatus: 'PENDING' | 'VERIFIED' | 'REJECTED' | 'SUSPENDED';
  isBlacklisted: boolean;
  blacklistReason?: string;
  features: {
    products: boolean;
    services: boolean;
    marketplace: boolean;
    catalog: boolean;
  };
  _count?: {
    users: number;
    products: number;
    services: number;
  };
}

export default function OrganizationManagement() {
  const token = typeof window !== 'undefined' ? localStorage.getItem('token') || '' : '';
  const authHeaders = useMemo(() => ({ headers: { Authorization: `Bearer ${token}` } }), [token]);

  const [orgs, setOrgs] = useState<Organization[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState('');
  const [statusFilter, setStatusFilter] = useState('all');

  const [sortKey, setSortKey] = useState<'name' | 'gst' | 'status' | 'scope'>('name');
  const [sortDirection, setSortDirection] = useState<'asc' | 'desc'>('asc');

  const toggleSort = (key: 'name' | 'gst' | 'status' | 'scope') => {
    if (sortKey === key) {
      setSortDirection(prev => prev === 'asc' ? 'desc' : 'asc');
    } else {
      setSortKey(key);
      setSortDirection('asc');
    }
  };

  const SortHeader = ({ label, columnKey, className = '' }: { label: string, columnKey: 'name' | 'gst' | 'status' | 'scope', className?: string }) => {
    const isActive = sortKey === columnKey;
    return (
      <button
        type="button"
        onClick={() => toggleSort(columnKey)}
        className={cn("inline-flex items-center gap-1.5 text-[10px] font-black uppercase tracking-widest text-slate-400 hover:text-[#0c2340] transition-colors", isActive && "text-[#0c2340]", className)}
      >
        {label}
        {isActive ? (
          sortDirection === 'asc' ? <ArrowUp className="h-3 w-3 text-[#0c2340]" /> : <ArrowDown className="h-3 w-3 text-[#0c2340]" />
        ) : (
          <ArrowUpDown className="h-3 w-3 opacity-40" />
        )}
      </button>
    );
  };

  const sortedOrgs = useMemo(() => {
    return [...orgs].sort((a, b) => {
      const direction = sortDirection === 'asc' ? 1 : -1;
      if (sortKey === 'name') {
        return (a.organizationName || '').localeCompare(b.organizationName || '') * direction;
      }
      if (sortKey === 'gst') {
        const aTax = a.gstin || a.panNumber || '';
        const bTax = b.gstin || b.panNumber || '';
        return aTax.localeCompare(bTax) * direction;
      }
      if (sortKey === 'status') {
        return (a.verificationStatus || '').localeCompare(b.verificationStatus || '') * direction;
      }
      if (sortKey === 'scope') {
        const aCount = (a._count?.users ?? 0) + (a._count?.products ?? 0) + (a._count?.services ?? 0);
        const bCount = (b._count?.users ?? 0) + (b._count?.products ?? 0) + (b._count?.services ?? 0);
        return (aCount - bCount) * direction;
      }
      return 0;
    });
  }, [orgs, sortKey, sortDirection]);

  // Modal / Detail States
  const [selectedOrg, setSelectedOrg] = useState<Organization | null>(null);
  const [isFeatureModalOpen, setIsFeatureModalOpen] = useState(false);
  const [isVerifyModalOpen, setIsVerifyModalOpen] = useState(false);
  const [isBlacklistModalOpen, setIsBlacklistModalOpen] = useState(false);

  // Form states
  const [blacklistReason, setBlacklistReason] = useState('');
  const [selectedVerifyStatus, setSelectedVerifyStatus] = useState<Organization['verificationStatus']>('VERIFIED');
  const [featuresState, setFeaturesState] = useState({
    products: false,
    services: false,
    marketplace: false,
    catalog: false
  });
  const [savingAction, setSavingAction] = useState(false);

  const fetchOrgs = async () => {
    setLoading(true);
    try {
      let url = '/api/admin/organizations?take=100';
      if (searchQuery) url += `&q=${encodeURIComponent(searchQuery)}`;
      if (statusFilter !== 'all') url += `&status=${encodeURIComponent(statusFilter)}`;

      const res = await api.fetch(url, { ...authHeaders, skipCache: true });
      if (res.ok) {
        const payload = await res.json();
        const data = payload?.data || payload || {};
        const organizations = Array.isArray(data.organizations)
          ? data.organizations
          : Array.isArray(data.records)
            ? data.records
            : [];
        setOrgs(organizations);
        setTotal(typeof data.total === "number" ? data.total : organizations.length);
      } else {
        toast.error('Failed to load organization records.');
      }
    } catch (err) {
      console.error(err);
      toast.error('An error occurred while loading organizations.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchOrgs();
  }, [token, statusFilter]);

  const handleSearchSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    fetchOrgs();
  };

  const handleOpenFeatureModal = (org: Organization) => {
    setSelectedOrg(org);
    setFeaturesState({
      products: org.features?.products ?? false,
      services: org.features?.services ?? false,
      marketplace: org.features?.marketplace ?? false,
      catalog: org.features?.catalog ?? false
    });
    setIsFeatureModalOpen(true);
  };

  const handleSaveFeatures = async () => {
    if (!selectedOrg) return;
    setSavingAction(true);
    try {
      const res = await api.put(`/api/admin/organizations/${selectedOrg.id}/features`, featuresState, authHeaders);
      if (res.ok) {
        toast.success('Organization application features updated.');
        setOrgs(prev => prev.map(o => o.id === selectedOrg.id ? { ...o, features: { ...featuresState } } : o));
        setIsFeatureModalOpen(false);
      } else {
        toast.error('Failed to save organization features.');
      }
    } catch (err) {
      console.error(err);
      toast.error('Error communicating with organization features server.');
    } finally {
      setSavingAction(false);
    }
  };

  const handleOpenVerifyModal = (org: Organization) => {
    setSelectedOrg(org);
    setSelectedVerifyStatus(org.verificationStatus);
    setIsVerifyModalOpen(true);
  };

  const handleSaveVerifyStatus = async () => {
    if (!selectedOrg) return;
    setSavingAction(true);
    try {
      const res = await api.put(`/api/admin/organizations/${selectedOrg.id}`, {
        verificationStatus: selectedVerifyStatus
      }, authHeaders);
      if (res.ok) {
        const payload = await res.json();
        const updated = payload?.data || payload || {};
        toast.success(`Organization status updated to: ${selectedVerifyStatus}`);
        setOrgs(prev => prev.map(o => o.id === selectedOrg.id ? { ...o, ...updated } : o));
        setIsVerifyModalOpen(false);
      } else {
        toast.error('Failed to save verification status.');
      }
    } catch (err) {
      console.error(err);
      toast.error('Verification update request error.');
    } finally {
      setSavingAction(false);
    }
  };

  const handleOpenBlacklistModal = (org: Organization) => {
    setSelectedOrg(org);
    setBlacklistReason(org.blacklistReason || '');
    setIsBlacklistModalOpen(true);
  };

  const handleSaveBlacklist = async (isBlacklisting: boolean) => {
    if (!selectedOrg) return;
    setSavingAction(true);
    try {
      const res = await api.put(`/api/admin/organizations/${selectedOrg.id}`, {
        isBlacklisted: isBlacklisting,
        blacklistReason: isBlacklisting ? blacklistReason : ''
      }, authHeaders);
      if (res.ok) {
        const payload = await res.json();
        const updated = payload?.data || payload || {};
        toast.success(isBlacklisting ? 'Organization access restricted.' : 'Organization access restriction cleared.');
        setOrgs(prev => prev.map(o => o.id === selectedOrg.id ? { ...o, ...updated } : o));
        setIsBlacklistModalOpen(false);
      } else {
        toast.error('Failed to change restriction status.');
      }
    } catch (err) {
      console.error(err);
      toast.error('Restriction toggling request error.');
    } finally {
      setSavingAction(false);
    }
  };

  const statusTone = (status: Organization['verificationStatus']) => {
    if (status === 'VERIFIED') return 'bg-emerald-50 border-emerald-200 text-emerald-700';
    if (status === 'REJECTED') return 'bg-red-50 border-red-200 text-red-700';
    if (status === 'SUSPENDED') return 'bg-amber-50 border-amber-200 text-amber-700';
    return 'bg-blue-50 border-blue-100 text-[#0c2340]';
  };

  return (
    <div className="space-y-6 max-w-7xl mx-auto">
      {/* Banner / Header */}
      <div className="bg-[#0c2340] border-b-4 border-[#c5a556] rounded-xl shadow-xl overflow-hidden p-6 md:p-8 text-white relative">
        <div className="absolute right-0 top-0 opacity-10 translate-x-1/4 -translate-y-1/4 select-none pointer-events-none">
          <Building2 className="h-64 w-64 text-white" />
        </div>
        <div className="relative z-10 flex flex-col md:flex-row md:items-center justify-between gap-4">
          <div>
            <div className="flex items-center gap-2 mb-1">
              <span className="bg-[#c5a556]/20 border border-[#c5a556] text-[#c5a556] text-[10px] uppercase font-bold tracking-widest px-2.5 py-0.5 rounded-full">
                Administration Portal
              </span>
              <span className="text-[10px] text-slate-300 font-medium tracking-wider">Stakeholders Database</span>
            </div>
            <h1 className="text-2xl md:text-3xl font-extrabold tracking-tight">Organization & Feature Management</h1>
            <p className="mt-2 text-sm text-slate-300 max-w-2xl">
              Inspect and verify registered government buyers and sellers. Apply custom operational features (Marketplace, Catalog, Products, Services) and handle compliance controls.
            </p>
          </div>
          <Button 
            onClick={fetchOrgs}
            variant="outline"
            className="self-start md:self-center border-white/20 hover:border-white/50 hover:text-white text-black hover:bg-white/30 shrink-0 gap-2 text-xs font-bold uppercase tracking-wider h-10"
          >
            <RefreshCw className="h-3.5 w-3.5" />
            Sync Database
          </Button>
        </div>
      </div>

      {/* Search & Filter Controls */}
      <div className="bg-white rounded-xl border border-slate-200/80 p-4 shadow-sm flex flex-col md:flex-row md:items-center gap-4 justify-between">
        <form onSubmit={handleSearchSubmit} className="flex items-center gap-2 w-full md:max-w-md">
          <div className="relative w-full">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-400" />
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Search by company name, GSTIN, or PAN..."
              className="w-full h-10 pl-10 pr-3 rounded-lg border border-slate-200 text-sm focus:outline-none focus:ring-2 focus:ring-[#0c2340]/10 focus:border-[#0c2340] bg-slate-50/50 focus:bg-white transition-all"
            />
          </div>
          <Button type="submit" className="bg-[#0c2340] hover:bg-[#0c2340]/90 text-white px-4 h-10 text-xs font-bold uppercase tracking-wider">
            Search
          </Button>
        </form>

        <div className="flex flex-wrap items-center gap-2">
          <span className="text-xs font-bold text-slate-400 uppercase tracking-wide mr-2">Verification Status:</span>
          {['all', 'PENDING', 'VERIFIED', 'REJECTED', 'SUSPENDED'].map((status) => (
            <button
              key={status}
              onClick={() => setStatusFilter(status)}
              className={`px-3 py-1.5 rounded-lg text-xs font-bold uppercase border transition-all ${
                statusFilter === status
                  ? 'bg-[#0c2340] border-[#0c2340] text-white shadow-sm'
                  : 'bg-white border-slate-200 text-slate-600 hover:border-slate-300'
              }`}
            >
              {status}
            </button>
          ))}
        </div>
      </div>

      {/* Main Stakeholders Table */}
      <div className="bg-white rounded-xl border border-slate-200/80 shadow-sm overflow-hidden">
        {loading ? (
          <div className="flex flex-col items-center justify-center min-h-[40vh] p-8 text-slate-500 uppercase tracking-widest text-xs font-bold gap-4">
            <RefreshCw className="h-8 w-8 text-[#c5a556] animate-spin" />
            Retrieving Stakeholders...
          </div>
        ) : orgs.length > 0 ? (
          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse">
              <thead>
                <tr className="bg-slate-50 border-b border-slate-200 text-[10px] font-black uppercase tracking-widest text-slate-400">
                  <th className="px-6 py-4"><SortHeader label="Company Details" columnKey="name" /></th>
                  <th className="px-6 py-4"><SortHeader label="Tax Identifications" columnKey="gst" /></th>
                  <th className="px-6 py-4 text-center text-[10px] font-black uppercase tracking-widest text-slate-400">Operational Features</th>
                  <th className="px-6 py-4 text-center"><SortHeader label="Scope Stats" columnKey="scope" className="justify-center w-full" /></th>
                  <th className="px-6 py-4 text-center"><SortHeader label="Status" columnKey="status" className="justify-center w-full" /></th>
                  <th className="px-6 py-4 text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {sortedOrgs.map((org) => (
                  <tr key={org.id} className="hover:bg-slate-50/50 transition-colors">
                    {/* Details */}
                    <td className="px-6 py-4.5">
                      <div className="flex items-start gap-3">
                        <div className="h-10 w-10 rounded-lg bg-[#0c2340]/5 flex items-center justify-center text-[#0c2340] shrink-0 border border-slate-100 shadow-sm">
                          <Building2 className="h-5 w-5" />
                        </div>
                        <div className="min-w-0">
                          <h4 className="font-extrabold text-blue-900 text-sm truncate">{org.organizationName}</h4>
                          <span className="text-[10px] text-slate-400 font-bold uppercase tracking-wider mt-0.5 block">
                            ID: ORG-{org.id}
                          </span>
                        </div>
                      </div>
                    </td>

                    {/* Tax identifiers */}
                    <td className="px-6 py-4.5">
                      <div className="space-y-1 text-xs font-mono">
                        <div>
                          <span className="text-[10px] text-slate-400 font-extrabold uppercase tracking-widest mr-1">GSTIN:</span>
                          <span className="text-slate-800 font-bold">{org.gstin || 'NOT APPLICABLE'}</span>
                        </div>
                        <div>
                          <span className="text-[10px] text-slate-400 font-extrabold uppercase tracking-widest mr-2">PAN:</span>
                          <span className="text-slate-800 font-bold">{org.panNumber || 'N/A'}</span>
                        </div>
                      </div>
                    </td>

                    {/* Feature Toggles indicator */}
                    <td className="px-6 py-4.5 text-center">
                      <div className="flex items-center justify-center gap-1.5">
                        <span 
                          title="Catalog Feature Access"
                          className={`p-1.5 rounded-lg border text-[10px] font-bold uppercase flex items-center gap-1 ${
                            org.features?.catalog ? 'bg-emerald-50 border-emerald-250 text-emerald-700' : 'bg-slate-100 border-slate-200 text-slate-400'
                          }`}
                        >
                          <BookOpen className="h-3 w-3" /> Catalog
                        </span>
                        <span 
                          title="Marketplace Feature Access"
                          className={`p-1.5 rounded-lg border text-[10px] font-bold uppercase flex items-center gap-1 ${
                            org.features?.marketplace ? 'bg-emerald-50 border-emerald-250 text-emerald-700' : 'bg-slate-100 border-slate-200 text-slate-400'
                          }`}
                        >
                          <Briefcase className="h-3 w-3" /> Marketplace
                        </span>
                        <span 
                          title="Product Submissions Access"
                          className={`p-1.5 rounded-lg border text-[10px] font-bold uppercase flex items-center gap-1 ${
                            org.features?.products ? 'bg-emerald-50 border-emerald-250 text-emerald-700' : 'bg-slate-100 border-slate-200 text-slate-400'
                          }`}
                        >
                          <Package className="h-3 w-3" /> Products
                        </span>
                        <span 
                          title="Service Submissions Access"
                          className={`p-1.5 rounded-lg border text-[10px] font-bold uppercase flex items-center gap-1 ${
                            org.features?.services ? 'bg-emerald-50 border-emerald-250 text-emerald-700' : 'bg-slate-100 border-slate-200 text-slate-400'
                          }`}
                        >
                          <Wrench className="h-3 w-3" /> Services
                        </span>
                      </div>
                    </td>

                    {/* Stats counts */}
                    <td className="px-6 py-4.5 text-center">
                      <div className="flex items-center justify-center gap-4 text-xs text-slate-500">
                        <div title="Users in organization">
                          <Users className="h-3.5 w-3.5 text-slate-400 inline mr-1" />
                          <span className="font-bold text-slate-800">{org._count?.users ?? 0}</span>
                        </div>
                        <div title="Products published">
                          <Package className="h-3.5 w-3.5 text-slate-400 inline mr-1" />
                          <span className="font-bold text-slate-800">{org._count?.products ?? 0}</span>
                        </div>
                        <div title="Services published">
                          <Wrench className="h-3.5 w-3.5 text-slate-400 inline mr-1" />
                          <span className="font-bold text-slate-800">{org._count?.services ?? 0}</span>
                        </div>
                      </div>
                    </td>

                    {/* Blacklist and verification status */}
                    <td className="px-6 py-4.5 text-center">
                      <div className="flex flex-col items-center gap-1">
                        <span className={`px-2.5 py-0.5 rounded-md text-[10px] font-black uppercase tracking-wider border ${statusTone(org.verificationStatus)}`}>
                          {org.verificationStatus}
                        </span>
                        {org.isBlacklisted && (
                          <span className="flex items-center gap-0.5 bg-red-50 border border-red-200 text-red-700 text-[9px] uppercase font-extrabold tracking-wider px-1.5 py-0.5 rounded" title={org.blacklistReason}>
                            <ShieldAlert className="h-2.5 w-2.5" /> RESTRICTED
                          </span>
                        )}
                      </div>
                    </td>

                    {/* Operations */}
                    <td className="px-6 py-4.5 text-right">
                      <div className="flex items-center justify-end gap-1.5">
                        <Button 
                          variant="outline" 
                          size="sm"
                          onClick={() => handleOpenFeatureModal(org)}
                          title="Manage Feature Flags"
                          className="border-slate-200 hover:bg-slate-100 text-slate-600 px-2 py-1.5 h-8 text-[11px] font-bold uppercase tracking-wider gap-1"
                        >
                          <Sliders className="h-3 w-3 text-[#c5a556]" /> Features
                        </Button>
                        <Button 
                          variant="outline" 
                          size="sm"
                          onClick={() => handleOpenVerifyModal(org)}
                          title="Change Verification Status"
                          className="border-slate-200 hover:bg-slate-100 text-slate-600 px-2 py-1.5 h-8 text-[11px] font-bold uppercase tracking-wider gap-1"
                        >
                          <Check className="h-3 w-3 text-emerald-600" /> Verify
                        </Button>
                        <Button 
                          variant="outline" 
                          size="sm"
                          onClick={() => handleOpenBlacklistModal(org)}
                          title={org.isBlacklisted ? "Clear platform restriction" : "Restrict platform access"}
                          className={`px-2 py-1.5 h-8 text-[11px] font-bold uppercase tracking-wider gap-1 ${
                            org.isBlacklisted 
                              ? 'bg-red-50 hover:bg-red-100 border-red-200 hover:border-red-300 text-red-700' 
                              : 'border-slate-200 hover:bg-slate-100 text-slate-600'
                          }`}
                        >
                          <Ban className="h-3 w-3 text-red-600" /> {org.isBlacklisted ? "Unrestrict" : "Restrict"}
                        </Button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <div className="py-16 text-center">
            <Building2 className="h-12 w-12 text-slate-200 mx-auto mb-3" />
            <p className="text-sm font-bold text-slate-400 uppercase tracking-widest">No organizations found</p>
          </div>
        )}
      </div>

      {/* Feature Flags Modal */}
      {isFeatureModalOpen && selectedOrg && (
        <div className="fixed inset-0 bg-blue-800/50 backdrop-blur-sm flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-xl border border-slate-200 shadow-2xl w-full max-w-lg overflow-hidden animate-in fade-in zoom-in-95 duration-200">
            <div className="bg-[#0c2340] border-b-4 border-[#c5a556] p-5 text-white">
              <h3 className="font-extrabold text-lg flex items-center gap-2">
                <Sliders className="h-5 w-5 text-[#c5a556]" /> Access Flags: {selectedOrg.organizationName}
              </h3>
              <p className="text-xs text-slate-300 mt-1">Manage feature flags overlay for this enterprise profile.</p>
            </div>
            
            <div className="p-6 space-y-4">
              <div className="space-y-3">
                <label className="flex items-center gap-3 p-3 rounded-lg border border-slate-100 hover:bg-slate-50 transition-colors cursor-pointer select-none">
                  <input
                    type="checkbox"
                    checked={featuresState.catalog}
                    onChange={(e) => setFeaturesState(prev => ({ ...prev, catalog: e.target.checked }))}
                    className="h-4 w-4 text-[#0c2340] focus:ring-[#0c2340]"
                  />
                  <div>
                    <span className="text-sm font-bold text-blue-900 block">Catalog Visibility</span>
                    <span className="text-[11px] text-slate-500">Allow this organization to view, read, and manage catalogs.</span>
                  </div>
                </label>

                <label className="flex items-center gap-3 p-3 rounded-lg border border-slate-100 hover:bg-slate-50 transition-colors cursor-pointer select-none">
                  <input
                    type="checkbox"
                    checked={featuresState.marketplace}
                    onChange={(e) => setFeaturesState(prev => ({ ...prev, marketplace: e.target.checked }))}
                    className="h-4 w-4 text-[#0c2340] focus:ring-[#0c2340]"
                  />
                  <div>
                    <span className="text-sm font-bold text-blue-900 block">Marketplace Access</span>
                    <span className="text-[11px] text-slate-500">Allow buying and trading directly in the marketplace ecosystem.</span>
                  </div>
                </label>

                <label className="flex items-center gap-3 p-3 rounded-lg border border-slate-100 hover:bg-slate-50 transition-colors cursor-pointer select-none">
                  <input
                    type="checkbox"
                    checked={featuresState.products}
                    onChange={(e) => setFeaturesState(prev => ({ ...prev, products: e.target.checked }))}
                    className="h-4 w-4 text-[#0c2340] focus:ring-[#0c2340]"
                  />
                  <div>
                    <span className="text-sm font-bold text-blue-900 block">Product Upload Authorization</span>
                    <span className="text-[11px] text-slate-500">Allow adding new physical inventory products to catalogs.</span>
                  </div>
                </label>

                <label className="flex items-center gap-3 p-3 rounded-lg border border-slate-100 hover:bg-slate-50 transition-colors cursor-pointer select-none">
                  <input
                    type="checkbox"
                    checked={featuresState.services}
                    onChange={(e) => setFeaturesState(prev => ({ ...prev, services: e.target.checked }))}
                    className="h-4 w-4 text-[#0c2340] focus:ring-[#0c2340]"
                  />
                  <div>
                    <span className="text-sm font-bold text-blue-900 block">Services Upload Authorization</span>
                    <span className="text-[11px] text-slate-500">Allow catalog additions of custom contractor or enterprise services.</span>
                  </div>
                </label>
              </div>
            </div>

            <div className="bg-slate-50 px-6 py-4 flex items-center justify-end gap-2 border-t border-slate-100">
              <Button
                variant="outline"
                onClick={() => setIsFeatureModalOpen(false)}
                className="border-slate-200 text-slate-600 hover:bg-slate-100 text-xs font-bold uppercase tracking-wider"
              >
                Cancel
              </Button>
              <Button
                onClick={handleSaveFeatures}
                disabled={savingAction}
                className="bg-[#0c2340] hover:bg-[#0c2340]/90 text-white text-xs font-bold uppercase tracking-wider gap-2 px-4 shadow-sm"
              >
                {savingAction ? <RefreshCw className="h-3.5 w-3.5 animate-spin" /> : <Sliders className="h-3.5 w-3.5 text-[#c5a556]" />}
                Save Controls
              </Button>
            </div>
          </div>
        </div>
      )}

      {/* Verification Modal */}
      {isVerifyModalOpen && selectedOrg && (
        <div className="fixed inset-0 bg-blue-800/50 backdrop-blur-sm flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-xl border border-slate-200 shadow-2xl w-full max-w-md overflow-hidden animate-in fade-in zoom-in-95 duration-200">
            <div className="bg-[#0c2340] border-b-4 border-[#c5a556] p-5 text-white">
              <h3 className="font-extrabold text-lg flex items-center gap-2">
                <CheckCircle2 className="h-5 w-5 text-emerald-400" /> Verify Stakeholder: {selectedOrg.organizationName}
              </h3>
              <p className="text-xs text-slate-300 mt-1">Audit verification standing for platform operations.</p>
            </div>

            <div className="p-6 space-y-4">
              <div className="space-y-2">
                <label className="text-xs font-black uppercase tracking-widest text-slate-400">Select Status Setting</label>
                <div className="grid grid-cols-2 gap-2">
                  {(['PENDING', 'VERIFIED', 'REJECTED', 'SUSPENDED'] as const).map((vst) => (
                    <button
                      key={vst}
                      type="button"
                      onClick={() => setSelectedVerifyStatus(vst)}
                      className={`px-3 py-2 rounded-lg border text-xs font-extrabold uppercase transition-all ${
                        selectedVerifyStatus === vst
                          ? 'bg-[#0c2340] border-[#0c2340] text-white shadow-sm'
                          : 'bg-white border-slate-200 text-slate-650 hover:border-slate-300'
                      }`}
                    >
                      {vst}
                    </button>
                  ))}
                </div>
              </div>
            </div>

            <div className="bg-slate-50 px-6 py-4 flex items-center justify-end gap-2 border-t border-slate-100">
              <Button
                variant="outline"
                onClick={() => setIsVerifyModalOpen(false)}
                className="border-slate-200 text-slate-600 hover:bg-slate-100 text-xs font-bold uppercase tracking-wider"
              >
                Cancel
              </Button>
              <Button
                onClick={handleSaveVerifyStatus}
                disabled={savingAction}
                className="bg-[#0c2340] hover:bg-[#0c2340]/90 text-white text-xs font-bold uppercase tracking-wider gap-2 px-4 shadow-sm"
              >
                {savingAction ? <RefreshCw className="h-3.5 w-3.5 animate-spin" /> : <Check className="h-3.5 w-3.5 text-[#c5a556]" />}
                Apply Status
              </Button>
            </div>
          </div>
        </div>
      )}

      {/* Blacklist / Restriction Modal */}
      {isBlacklistModalOpen && selectedOrg && (
        <div className="fixed inset-0 bg-blue-800/50 backdrop-blur-sm flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-xl border border-slate-200 shadow-2xl w-full max-w-md overflow-hidden animate-in fade-in zoom-in-95 duration-200">
            <div className="bg-[#0c2340] border-b-4 border-[#c5a556] p-5 text-white">
              <h3 className="font-extrabold text-lg flex items-center gap-2">
                <AlertTriangle className="h-5 w-5 text-red-400" /> Platform Restriction Desk
              </h3>
              <p className="text-xs text-slate-300 mt-1">Manage portal wide restrictions for {selectedOrg.organizationName}.</p>
            </div>

            <div className="p-6 space-y-4">
              {selectedOrg.isBlacklisted ? (
                <div>
                  <p className="text-xs text-slate-600 leading-relaxed bg-amber-50 border border-amber-200 p-3 rounded-lg flex gap-2">
                    <AlertTriangle className="h-4 w-4 text-amber-500 shrink-0" />
                    This stakeholder is currently blacklisted from direct system interactions. Clearing this restriction restores standard operational rights.
                  </p>
                </div>
              ) : (
                <div className="space-y-2">
                  <label className="text-xs font-black uppercase tracking-widest text-slate-400">Reason for restriction</label>
                  <textarea
                    value={blacklistReason}
                    onChange={(e) => setBlacklistReason(e.target.value)}
                    placeholder="Enter compliance breach or reason for blacklist restriction..."
                    rows={4}
                    className="w-full p-3 border border-slate-200 rounded-lg text-xs focus:outline-none focus:ring-2 focus:ring-red-150 focus:border-red-500 bg-slate-50/50 focus:bg-white transition-all resize-none"
                  />
                </div>
              )}
            </div>

            <div className="bg-slate-50 px-6 py-4 flex items-center justify-end gap-2 border-t border-slate-100">
              <Button
                variant="outline"
                onClick={() => setIsBlacklistModalOpen(false)}
                className="border-slate-200 text-slate-600 hover:bg-slate-100 text-xs font-bold uppercase tracking-wider"
              >
                Cancel
              </Button>
              {selectedOrg.isBlacklisted ? (
                <Button
                  onClick={() => handleSaveBlacklist(false)}
                  disabled={savingAction}
                  className="bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-bold uppercase tracking-wider gap-2 px-4 shadow-sm"
                >
                  {savingAction ? <RefreshCw className="h-3.5 w-3.5 animate-spin" /> : <Check className="h-3.5 w-3.5" />}
                  Clear Restriction
                </Button>
              ) : (
                <Button
                  onClick={() => handleSaveBlacklist(true)}
                  disabled={savingAction || !blacklistReason.trim()}
                  className="bg-red-650 hover:bg-red-750 text-white text-xs font-bold uppercase tracking-wider gap-2 px-4 shadow-sm"
                >
                  {savingAction ? <RefreshCw className="h-3.5 w-3.5 animate-spin" /> : <Ban className="h-3.5 w-3.5" />}
                  Apply Restriction
                </Button>
              )}
            </div>
          </div>
        </div>
      )}

    </div>
  );
}
