import React, { useEffect, useState, useMemo } from 'react';
import { toast } from 'sonner';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useDebounce } from '../hooks/useDebounce';
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
  ArrowUpDown,
  LayoutGrid,
  List,
  X
} from 'lucide-react';
import { api } from '../lib/api';
import { Button } from '../components/ui/button';
import { Pagination } from '../features/shared/Pagination';
import { ViewModeToggle } from '../features/shared/ViewModeToggle';
import { useResponsiveViewMode } from '../features/shared/hooks';
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
  const queryClient = useQueryClient();

  const [searchQuery, setSearchQuery] = useState('');
  const debouncedSearch = useDebounce(searchQuery, 400);
  const [statusFilter, setStatusFilter] = useState('all');
  const [page, setPage] = useState(1);
  const [pageSize, setPageSizeState] = useState(10);
  const [viewMode, setViewMode] = useResponsiveViewMode();

  // Detail dialogs
  const [detailOrg, setDetailOrg] = useState<Organization | null>(null);
  const [scopeOrg, setScopeOrg] = useState<Organization | null>(null);
  const [scopeTab, setScopeTab] = useState<'users' | 'products' | 'services'>('users');

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

  const { data, isLoading: loading, isFetching, refetch } = useQuery({
    queryKey: ['organizations', page, pageSize, statusFilter, debouncedSearch],
    queryFn: async () => {
      let url = `/api/admin/organizations?skip=${(page - 1) * pageSize}&take=${pageSize}`;
      if (debouncedSearch) url += `&q=${encodeURIComponent(debouncedSearch)}`;
      if (statusFilter !== 'all') url += `&status=${encodeURIComponent(statusFilter)}`;

      const res = await api.fetch(url, { ...authHeaders });
      if (!res.ok) throw new Error('Failed to fetch organizations');
      const payload = await res.json();
      return payload?.data || payload || {};
    },
    enabled: !!token,
    staleTime: 5 * 60_000,
  });

  const orgs = useMemo(() => {
    const dataOrgs = data?.organizations || data?.records || [];
    return Array.isArray(dataOrgs) ? dataOrgs : [];
  }, [data]);

  const total = data?.total ?? orgs.length;

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

  // Reset page when filter/search changes
  useEffect(() => {
    setPage(1);
  }, [statusFilter, debouncedSearch]);

  const setPageSize = (nextPageSize: number) => {
    setPageSizeState(nextPageSize);
    setPage(1);
  };

  const handleSearchSubmit = (e: React.FormEvent) => {
    e.preventDefault();
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
        queryClient.invalidateQueries({ queryKey: ['organizations'] });
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
        toast.success(`Organization status updated to: ${selectedVerifyStatus}`);
        queryClient.invalidateQueries({ queryKey: ['organizations'] });
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
        toast.success(isBlacklisting ? 'Organization access restricted.' : 'Organization access restriction cleared.');
        queryClient.invalidateQueries({ queryKey: ['organizations'] });
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
    return 'bg-emerald-50 border-emerald-100 text-[#0c2340]';
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
          <div className="flex flex-wrap items-center gap-2 self-start md:self-center">
            {/* Standardised list/grid view toggle (dark theme on navy banner) */}
            <ViewModeToggle value={viewMode} onChange={setViewMode} theme="dark" />
            <Button
              onClick={() => refetch()}
              variant="outline"
              className="border-white/20 hover:border-white/50 hover:text-white text-black hover:bg-white/30 shrink-0 gap-2 text-xs font-bold uppercase tracking-wider h-10"
            >
              <RefreshCw className={cn("h-3.5 w-3.5", isFetching && "animate-spin")} />
              Sync Database
            </Button>
          </div>
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
              className={`px-3 py-1.5 rounded-lg text-xs font-bold uppercase border transition-all ${statusFilter === status
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
          viewMode === 'list' ? (
            <>
              <div className="overflow-x-auto">
                <table className="w-full text-left border-collapse">
                  <thead>
                    <tr className="bg-slate-50 border-b border-slate-200 text-[10px] font-black uppercase tracking-widest text-slate-400">
                      <th className="px-4 py-4 text-center w-12">Sr.</th>
                      <th className="px-4 py-4"><SortHeader label="Company Details" columnKey="name" /></th>
                      <th className="px-4 py-4"><SortHeader label="Tax IDs" columnKey="gst" /></th>
                      <th className="px-4 py-4 text-center"><SortHeader label="Scope" columnKey="scope" className="justify-center w-full" /></th>
                      <th className="px-4 py-4 text-center"><SortHeader label="Status" columnKey="status" className="justify-center w-full" /></th>
                      <th className="px-4 py-4 text-right">Actions</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {sortedOrgs.map((org, index) => (
                      <tr key={org.id} className="hover:bg-slate-50/50 transition-colors">
                        <td className="px-4 py-4 text-center text-xs font-black text-slate-400">
                          {String((page - 1) * pageSize + index + 1).padStart(2, '0')}
                        </td>
                        <td className="px-4 py-4">
                          <button
                            type="button"
                            onClick={() => setDetailOrg(org)}
                            className="flex items-start gap-3 text-left group min-w-0 w-full"
                            title="View company details"
                          >
                            <div className="h-10 w-10 rounded-lg bg-[#0c2340]/5 flex items-center justify-center text-[#0c2340] shrink-0 border border-slate-100 shadow-sm group-hover:bg-[#0c2340] group-hover:text-white transition-colors">
                              <Building2 className="h-5 w-5" />
                            </div>
                            <div className="min-w-0">
                              <h4 className="font-extrabold text-neutral-900 text-sm group-hover:text-[#0c2340] group-hover:underline decoration-[#c5a556] underline-offset-2 transition-colors text-wrap-anywhere">
                                {org.organizationName}
                              </h4>
                              <span className="text-[10px] text-slate-400 font-bold uppercase tracking-wider mt-0.5 block">
                                ID: ORG-{org.id}
                              </span>
                            </div>
                          </button>
                        </td>
                        <td className="px-4 py-4">
                          <div className="space-y-1 text-xs font-mono">
                            <div>
                              <span className="text-[10px] text-slate-400 font-extrabold uppercase tracking-widest mr-1">GSTIN:</span>
                              <span className="text-slate-800 font-bold text-wrap-anywhere">{org.gstin || 'N/A'}</span>
                            </div>
                            <div>
                              <span className="text-[10px] text-slate-400 font-extrabold uppercase tracking-widest mr-2">PAN:</span>
                              <span className="text-slate-800 font-bold text-wrap-anywhere">{org.panNumber || 'N/A'}</span>
                            </div>
                          </div>
                        </td>
                        <td className="px-4 py-4 text-center">
                          <div className="flex items-center justify-center gap-1.5 text-xs">
                            <button
                              type="button"
                              onClick={() => { setScopeOrg(org); setScopeTab('users'); }}
                              title="View users"
                              className="inline-flex items-center gap-1 rounded-md border border-slate-200 bg-white px-2 py-1 text-slate-700 hover:border-[#0c2340] hover:bg-[#0c2340]/5 hover:text-[#0c2340] transition-colors"
                            >
                              <Users className="h-3.5 w-3.5" />
                              <span className="font-bold">{org._count?.users ?? 0}</span>
                            </button>
                            <button
                              type="button"
                              onClick={() => { setScopeOrg(org); setScopeTab('products'); }}
                              title="View products"
                              className="inline-flex items-center gap-1 rounded-md border border-slate-200 bg-white px-2 py-1 text-slate-700 hover:border-[#0c2340] hover:bg-[#0c2340]/5 hover:text-[#0c2340] transition-colors"
                            >
                              <Package className="h-3.5 w-3.5" />
                              <span className="font-bold">{org._count?.products ?? 0}</span>
                            </button>
                            <button
                              type="button"
                              onClick={() => { setScopeOrg(org); setScopeTab('services'); }}
                              title="View services"
                              className="inline-flex items-center gap-1 rounded-md border border-slate-200 bg-white px-2 py-1 text-slate-700 hover:border-[#0c2340] hover:bg-[#0c2340]/5 hover:text-[#0c2340] transition-colors"
                            >
                              <Wrench className="h-3.5 w-3.5" />
                              <span className="font-bold">{org._count?.services ?? 0}</span>
                            </button>
                          </div>
                        </td>
                        <td className="px-4 py-4 text-center">
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
                        <td className="px-4 py-4 text-right">
                          <div className="flex items-center justify-end gap-1.5 flex-wrap">
                            <Button
                              variant="outline"
                              size="sm"
                              onClick={() => handleOpenFeatureModal(org)}
                              title="Manage Feature Flags"
                              className="border-slate-200 hover:bg-slate-100 text-slate-600 px-2 py-1.5 h-8 text-[10px] font-bold uppercase tracking-wider gap-1"
                            >
                              <Sliders className="h-3 w-3 text-[#c5a556]" /> Features
                            </Button>
                            <Button
                              variant="outline"
                              size="sm"
                              onClick={() => handleOpenVerifyModal(org)}
                              title="Change Verification Status"
                              className="border-slate-200 hover:bg-slate-100 text-slate-600 px-2 py-1.5 h-8 text-[10px] font-bold uppercase tracking-wider gap-1"
                            >
                              <Check className="h-3 w-3 text-emerald-600" /> Verify
                            </Button>
                            <Button
                              variant="outline"
                              size="sm"
                              onClick={() => handleOpenBlacklistModal(org)}
                              title={org.isBlacklisted ? "Clear platform restriction" : "Restrict platform access"}
                              className={`px-2 py-1.5 h-8 text-[10px] font-bold uppercase tracking-wider gap-1 ${org.isBlacklisted
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
              <Pagination page={page} pageSize={pageSize} total={total} onPageChange={setPage} onPageSizeChange={setPageSize} label="organizations" />
            </>
          ) : (
            <>
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4 p-4">
                {sortedOrgs.map((org, index) => (
                  <div key={org.id} className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm hover:shadow-md transition-all">
                    <div className="flex items-start justify-between gap-2">
                      <button
                        type="button"
                        onClick={() => setDetailOrg(org)}
                        className="flex items-start gap-3 text-left min-w-0 flex-1 group"
                      >
                        <div className="h-10 w-10 rounded-lg bg-[#0c2340]/5 flex items-center justify-center text-[#0c2340] shrink-0 border border-slate-100 group-hover:bg-[#0c2340] group-hover:text-white transition-colors">
                          <Building2 className="h-5 w-5" />
                        </div>
                        <div className="min-w-0">
                          <p className="font-mono text-[10px] font-black text-slate-400">{String((page - 1) * pageSize + index + 1).padStart(2, '0')} · ORG-{org.id}</p>
                          <h4 className="font-extrabold text-neutral-900 text-sm group-hover:text-[#0c2340] group-hover:underline decoration-[#c5a556] underline-offset-2 transition-colors text-wrap-anywhere">
                            {org.organizationName}
                          </h4>
                        </div>
                      </button>
                      <span className={`shrink-0 px-2 py-0.5 rounded-md text-[9px] font-black uppercase tracking-wider border ${statusTone(org.verificationStatus)}`}>
                        {org.verificationStatus}
                      </span>
                    </div>
                    <div className="mt-3 space-y-1 text-[11px] font-mono">
                      <div className="text-wrap-anywhere">
                        <span className="text-[9px] text-slate-400 font-extrabold uppercase tracking-widest mr-1">GSTIN:</span>
                        <span className="text-slate-800 font-bold">{org.gstin || 'N/A'}</span>
                      </div>
                      <div className="text-wrap-anywhere">
                        <span className="text-[9px] text-slate-400 font-extrabold uppercase tracking-widest mr-2">PAN:</span>
                        <span className="text-slate-800 font-bold">{org.panNumber || 'N/A'}</span>
                      </div>
                    </div>
                    <div className="mt-3 grid grid-cols-3 gap-1">
                      <button type="button" onClick={() => { setScopeOrg(org); setScopeTab('users'); }} className="inline-flex items-center justify-center gap-1 rounded-md border border-slate-200 bg-slate-50 px-2 py-1.5 text-xs text-slate-700 hover:border-[#0c2340] hover:bg-[#0c2340]/5 hover:text-[#0c2340] transition-colors">
                        <Users className="h-3.5 w-3.5" />
                        <span className="font-bold">{org._count?.users ?? 0}</span>
                      </button>
                      <button type="button" onClick={() => { setScopeOrg(org); setScopeTab('products'); }} className="inline-flex items-center justify-center gap-1 rounded-md border border-slate-200 bg-slate-50 px-2 py-1.5 text-xs text-slate-700 hover:border-[#0c2340] hover:bg-[#0c2340]/5 hover:text-[#0c2340] transition-colors">
                        <Package className="h-3.5 w-3.5" />
                        <span className="font-bold">{org._count?.products ?? 0}</span>
                      </button>
                      <button type="button" onClick={() => { setScopeOrg(org); setScopeTab('services'); }} className="inline-flex items-center justify-center gap-1 rounded-md border border-slate-200 bg-slate-50 px-2 py-1.5 text-xs text-slate-700 hover:border-[#0c2340] hover:bg-[#0c2340]/5 hover:text-[#0c2340] transition-colors">
                        <Wrench className="h-3.5 w-3.5" />
                        <span className="font-bold">{org._count?.services ?? 0}</span>
                      </button>
                    </div>
                    <div className="mt-3 grid grid-cols-3 gap-1">
                      <Button variant="outline" size="sm" onClick={() => handleOpenFeatureModal(org)} className="border-slate-200 text-slate-600 h-8 text-[9px] font-bold uppercase tracking-wider gap-1">
                        <Sliders className="h-3 w-3 text-[#c5a556]" /> Features
                      </Button>
                      <Button variant="outline" size="sm" onClick={() => handleOpenVerifyModal(org)} className="border-slate-200 text-slate-600 h-8 text-[9px] font-bold uppercase tracking-wider gap-1">
                        <Check className="h-3 w-3 text-emerald-600" /> Verify
                      </Button>
                      <Button variant="outline" size="sm" onClick={() => handleOpenBlacklistModal(org)} className={cn(
                        "h-8 text-[9px] font-bold uppercase tracking-wider gap-1",
                        org.isBlacklisted ? 'bg-red-50 hover:bg-red-100 border-red-200 text-red-700' : 'border-slate-200 text-slate-600'
                      )}>
                        <Ban className="h-3 w-3 text-red-600" /> {org.isBlacklisted ? "Free" : "Block"}
                      </Button>
                    </div>
                  </div>
                ))}
              </div>
              <Pagination page={page} pageSize={pageSize} total={total} onPageChange={setPage} onPageSizeChange={setPageSize} label="organizations" />
            </>
          )
        ) : (
          <div className="py-16 text-center">
            <Building2 className="h-12 w-12 text-slate-200 mx-auto mb-3" />
            <p className="text-sm font-bold text-slate-400 uppercase tracking-widest">No organizations found</p>
          </div>
        )}
      </div>

      {/* Feature Flags Modal */}
      {isFeatureModalOpen && selectedOrg && (
        <div className="fixed inset-0 bg-neutral-900/45 backdrop-blur-sm flex items-center justify-center z-50 p-4">
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
                    <span className="text-sm font-bold text-neutral-900 block">Catalog Visibility</span>
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
                    <span className="text-sm font-bold text-neutral-900 block">Marketplace Access</span>
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
                    <span className="text-sm font-bold text-neutral-900 block">Product Upload Authorization</span>
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
                    <span className="text-sm font-bold text-neutral-900 block">Services Upload Authorization</span>
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
        <div className="fixed inset-0 bg-neutral-900/45 backdrop-blur-sm flex items-center justify-center z-50 p-4">
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
                      className={`px-3 py-2 rounded-lg border text-xs font-extrabold uppercase transition-all ${selectedVerifyStatus === vst
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
        <div className="fixed inset-0 bg-neutral-900/45 backdrop-blur-sm flex items-center justify-center z-50 p-4">
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

      {/* Company Detail Dialog */}
      {detailOrg && (
        <div className="fixed inset-0 bg-neutral-900/45 backdrop-blur-sm flex items-center justify-center z-50 p-4" onClick={() => setDetailOrg(null)}>
          <div className="bg-white rounded-xl border border-slate-200 shadow-2xl w-full max-w-2xl max-h-[90vh] overflow-hidden flex flex-col animate-in fade-in zoom-in-95 duration-200" onClick={e => e.stopPropagation()}>
            <div className="bg-[#0c2340] border-b-4 border-[#c5a556] p-5 text-white relative">
              <button onClick={() => setDetailOrg(null)} className="absolute right-4 top-4 rounded-md border border-white/20 bg-white/10 p-2 text-white hover:bg-white/20" aria-label="Close">
                <X className="h-4 w-4" />
              </button>
              <div className="flex items-start gap-4 pr-12">
                <div className="h-12 w-12 shrink-0 rounded-lg bg-white/15 flex items-center justify-center text-[#c5a556]">
                  <Building2 className="h-6 w-6" />
                </div>
                <div className="min-w-0">
                  <p className="text-[10px] font-bold uppercase tracking-widest text-[#c5a556]">Organization Detail</p>
                  <h2 className="mt-0.5 text-xl font-extrabold tracking-tight text-wrap-anywhere">{detailOrg.organizationName}</h2>
                  <p className="mt-1 font-mono text-[11px] text-slate-300">ID: ORG-{detailOrg.id}</p>
                </div>
              </div>
            </div>

            <div className="flex-1 overflow-y-auto p-5 space-y-4">
              <div className="grid gap-3 sm:grid-cols-3">
                <div className="rounded-lg border border-slate-200 bg-slate-50 p-3">
                  <p className="text-[9px] font-black uppercase tracking-widest text-slate-400">Verification</p>
                  <span className={`mt-1 inline-flex rounded-md border px-2 py-0.5 text-[10px] font-black uppercase tracking-wider ${statusTone(detailOrg.verificationStatus)}`}>{detailOrg.verificationStatus}</span>
                </div>
                <div className="rounded-lg border border-slate-200 bg-slate-50 p-3">
                  <p className="text-[9px] font-black uppercase tracking-widest text-slate-400">Restriction</p>
                  <p className="mt-1 text-sm font-black text-slate-900">{detailOrg.isBlacklisted ? 'Blacklisted' : 'Active'}</p>
                </div>
                <div className="rounded-lg border border-slate-200 bg-slate-50 p-3">
                  <p className="text-[9px] font-black uppercase tracking-widest text-slate-400">Total Records</p>
                  <p className="mt-1 text-sm font-black text-slate-900">
                    {(detailOrg._count?.users || 0) + (detailOrg._count?.products || 0) + (detailOrg._count?.services || 0)}
                  </p>
                </div>
              </div>

              <div className="rounded-xl border border-slate-200 bg-white shadow-sm overflow-hidden">
                <div className="border-b border-slate-100 bg-slate-50/50 px-4 py-2.5">
                  <h3 className="text-[10px] font-black uppercase tracking-widest text-slate-500">Tax Identifications</h3>
                </div>
                <div className="p-4 grid gap-3 sm:grid-cols-2">
                  <div>
                    <p className="text-[9px] font-black uppercase tracking-widest text-slate-400">GSTIN</p>
                    <p className="mt-0.5 font-mono text-xs font-bold text-slate-700 text-wrap-anywhere">{detailOrg.gstin || '—'}</p>
                  </div>
                  <div>
                    <p className="text-[9px] font-black uppercase tracking-widest text-slate-400">PAN</p>
                    <p className="mt-0.5 font-mono text-xs font-bold text-slate-700 text-wrap-anywhere">{detailOrg.panNumber || '—'}</p>
                  </div>
                </div>
              </div>

              <div className="rounded-xl border border-slate-200 bg-white shadow-sm overflow-hidden">
                <div className="border-b border-slate-100 bg-slate-50/50 px-4 py-2.5">
                  <h3 className="text-[10px] font-black uppercase tracking-widest text-slate-500">Operational Features</h3>
                </div>
                <div className="p-4 grid gap-2 sm:grid-cols-2">
                  {[
                    { label: 'Catalog', icon: BookOpen, on: !!detailOrg.features?.catalog },
                    { label: 'Marketplace', icon: Briefcase, on: !!detailOrg.features?.marketplace },
                    { label: 'Products', icon: Package, on: !!detailOrg.features?.products },
                    { label: 'Services', icon: Wrench, on: !!detailOrg.features?.services }
                  ].map(f => (
                    <div key={f.label} className={cn(
                      "flex items-center justify-between rounded-lg border px-3 py-2",
                      f.on ? 'border-emerald-200 bg-emerald-50' : 'border-slate-200 bg-slate-50'
                    )}>
                      <span className="inline-flex items-center gap-2 text-xs font-bold text-slate-700">
                        <f.icon className={cn("h-3.5 w-3.5", f.on ? 'text-emerald-600' : 'text-slate-400')} />
                        {f.label}
                      </span>
                      <span className={cn(
                        "rounded px-2 py-0.5 text-[9px] font-black uppercase tracking-wider",
                        f.on ? 'bg-emerald-100 text-emerald-700' : 'bg-slate-100 text-slate-500'
                      )}>
                        {f.on ? 'Enabled' : 'Disabled'}
                      </span>
                    </div>
                  ))}
                </div>
              </div>

              <div className="rounded-xl border border-slate-200 bg-white shadow-sm overflow-hidden">
                <div className="border-b border-slate-100 bg-slate-50/50 px-4 py-2.5">
                  <h3 className="text-[10px] font-black uppercase tracking-widest text-slate-500">Scope Stats</h3>
                </div>
                <div className="p-4 grid gap-3 grid-cols-3">
                  <button
                    type="button"
                    onClick={() => { setScopeOrg(detailOrg); setScopeTab('users'); setDetailOrg(null); }}
                    className="rounded-lg border border-slate-200 bg-slate-50 p-3 text-left hover:border-[#0c2340] hover:bg-[#0c2340]/5 transition-colors"
                  >
                    <Users className="h-4 w-4 text-slate-400 mb-1" />
                    <p className="text-xl font-black text-slate-900">{detailOrg._count?.users || 0}</p>
                    <p className="text-[9px] font-bold uppercase tracking-widest text-slate-500">Users</p>
                  </button>
                  <button
                    type="button"
                    onClick={() => { setScopeOrg(detailOrg); setScopeTab('products'); setDetailOrg(null); }}
                    className="rounded-lg border border-slate-200 bg-slate-50 p-3 text-left hover:border-[#0c2340] hover:bg-[#0c2340]/5 transition-colors"
                  >
                    <Package className="h-4 w-4 text-slate-400 mb-1" />
                    <p className="text-xl font-black text-slate-900">{detailOrg._count?.products || 0}</p>
                    <p className="text-[9px] font-bold uppercase tracking-widest text-slate-500">Products</p>
                  </button>
                  <button
                    type="button"
                    onClick={() => { setScopeOrg(detailOrg); setScopeTab('services'); setDetailOrg(null); }}
                    className="rounded-lg border border-slate-200 bg-slate-50 p-3 text-left hover:border-[#0c2340] hover:bg-[#0c2340]/5 transition-colors"
                  >
                    <Wrench className="h-4 w-4 text-slate-400 mb-1" />
                    <p className="text-xl font-black text-slate-900">{detailOrg._count?.services || 0}</p>
                    <p className="text-[9px] font-bold uppercase tracking-widest text-slate-500">Services</p>
                  </button>
                </div>
              </div>

              {detailOrg.isBlacklisted && detailOrg.blacklistReason && (
                <div className="rounded-xl border border-red-200 bg-red-50 p-4">
                  <p className="text-[10px] font-black uppercase tracking-widest text-red-700 flex items-center gap-1.5">
                    <ShieldAlert className="h-3.5 w-3.5" /> Restriction Reason
                  </p>
                  <p className="mt-1 text-xs font-bold text-red-900 text-wrap-anywhere">{detailOrg.blacklistReason}</p>
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      {/* Scope Stats Dialog (Users / Products / Services list) */}
      {scopeOrg && (
        <div className="fixed inset-0 bg-neutral-900/45 backdrop-blur-sm flex items-center justify-center z-50 p-4" onClick={() => setScopeOrg(null)}>
          <div className="bg-white rounded-xl border border-slate-200 shadow-2xl w-full max-w-3xl max-h-[88vh] overflow-hidden flex flex-col animate-in fade-in zoom-in-95 duration-200" onClick={e => e.stopPropagation()}>
            <div className="bg-[#0c2340] border-b-4 border-[#c5a556] p-5 text-white relative">
              <button onClick={() => setScopeOrg(null)} className="absolute right-4 top-4 rounded-md border border-white/20 bg-white/10 p-2 text-white hover:bg-white/20" aria-label="Close">
                <X className="h-4 w-4" />
              </button>
              <p className="text-[10px] font-bold uppercase tracking-widest text-[#c5a556]">Scope Stats</p>
              <h2 className="mt-0.5 text-lg font-extrabold tracking-tight text-wrap-anywhere">{scopeOrg.organizationName}</h2>
            </div>

            <div className="flex border-b border-slate-200 bg-slate-50">
              {(['users', 'products', 'services'] as const).map(tab => {
                const count = scopeOrg._count?.[tab] ?? 0;
                const Icon = tab === 'users' ? Users : tab === 'products' ? Package : Wrench;
                return (
                  <button
                    key={tab}
                    type="button"
                    onClick={() => setScopeTab(tab)}
                    className={cn(
                      "flex-1 px-4 py-3 inline-flex items-center justify-center gap-2 text-xs font-black uppercase tracking-wider border-b-2 transition-colors",
                      scopeTab === tab
                        ? 'border-[#0c2340] text-[#0c2340] bg-white'
                        : 'border-transparent text-slate-500 hover:text-[#0c2340]'
                    )}
                  >
                    <Icon className="h-3.5 w-3.5" />
                    {tab}
                    <span className="rounded-full bg-slate-200 px-2 py-0.5 text-[10px]">{count}</span>
                  </button>
                );
              })}
            </div>

            <div className="flex-1 overflow-y-auto p-4">
              <ScopeListPanel
                orgId={scopeOrg.id}
                tab={scopeTab}
                count={scopeOrg._count?.[scopeTab] ?? 0}
                authHeaders={authHeaders}
              />
            </div>
          </div>
        </div>
      )}

    </div>
  );
}

/**
 * Lazy loader for the organization scope dialog. Fetches users / products /
 * services for the given org from the matching admin endpoints when the tab
 * becomes active. Falls back to a friendly message if endpoints aren't ready.
 */
function ScopeListPanel({
  orgId,
  tab,
  count,
  authHeaders
}: {
  orgId: number;
  tab: 'users' | 'products' | 'services';
  count: number;
  authHeaders: { headers: Record<string, string> };
}) {
  const [items, setItems] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    if (count === 0) {
      setLoading(false);
      setError(null);
      setItems([]);
      return () => { cancelled = true; };
    }
    setLoading(true);
    setError(null);
    setItems([]);
    const params = new URLSearchParams();
    params.set('organizationId', String(orgId));
    params.set('take', '50');
    const endpoint = tab === 'users'
      ? `/api/admin/users?${params.toString()}`
      : tab === 'products'
        ? `/api/admin/catalogue/products?${params.toString()}`
        : `/api/admin/catalogue/services?${params.toString()}`;
    api.fetch(endpoint, { ...authHeaders })
      .then(async res => {
        if (!res.ok) throw new Error('Failed to load list');
        const body = await res.json();
        const data = body?.data || body || {};
        const list = Array.isArray(data)
          ? data
          : Array.isArray(data.records)
            ? data.records
            : Array.isArray(data.users)
              ? data.users
              : Array.isArray(data.products)
                ? data.products
                : Array.isArray(data.services)
                  ? data.services
                  : Array.isArray(data.items)
                    ? data.items
                    : [];
        if (!cancelled) {
          setItems(list.filter((i: any) => Number(i.organizationId ?? i.organization?.id) === Number(orgId)));
        }
      })
      .catch(err => {
        if (!cancelled) setError(err?.message || 'Unable to load');
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => { cancelled = true; };
  }, [orgId, tab, count, authHeaders]);

  if (loading) return <p className="text-center text-xs font-bold text-slate-400 py-8">Loading {tab}...</p>;
  if (error) return <p className="text-center text-xs font-bold text-red-500 py-8">{error}</p>;
  if (items.length === 0) return <p className="text-center text-xs font-bold text-slate-400 py-8">No {tab} found for this organization.</p>;

  return (
    <div className="overflow-x-auto">
      <table className="w-full text-left text-sm">
        <thead className="bg-slate-50 border-b border-slate-200 text-[10px] font-black uppercase tracking-wider text-slate-500">
          <tr>
            <th className="px-3 py-2 w-12">#</th>
            <th className="px-3 py-2">Name</th>
            <th className="px-3 py-2">{tab === 'users' ? 'Email' : tab === 'products' ? 'SKU / HSN' : 'Pricing'}</th>
            <th className="px-3 py-2">Status</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-slate-100">
          {items.map((item, idx) => (
            <tr key={item.id || idx} className="hover:bg-slate-50/50">
              <td className="px-3 py-2 font-mono text-[10px] font-black text-slate-400">{String(idx + 1).padStart(2, '0')}</td>
              <td className="px-3 py-2 font-bold text-slate-900 text-wrap-anywhere">{item.name || item.email || '—'}</td>
              <td className="px-3 py-2 text-xs text-slate-600 text-wrap-anywhere">
                {tab === 'users' ? item.email || '—' : tab === 'products' ? (item.sku || item.hsnCode || '—') : (item.pricingModel || '—')}
              </td>
              <td className="px-3 py-2 text-[10px] font-black uppercase">
                <span className="rounded border border-slate-200 bg-slate-50 px-2 py-0.5 text-slate-600">
                  {item.status || item.accountStatus || item.role || '—'}
                </span>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
