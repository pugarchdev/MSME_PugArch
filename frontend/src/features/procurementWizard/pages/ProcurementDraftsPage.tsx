'use client';

import React, { useEffect, useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import {
  ArrowRight,
  ArrowUpDown,
  FileText,
  Plus,
  RefreshCw,
  Trash2,
  Search,
  Filter,
  XCircle,
  Database,
  Monitor,
  Gavel,
  ShoppingCart,
  ClipboardList,
  Eye,
  X,
  Tag,
  IndianRupee,
  CalendarDays,
  MapPin,
  Info,
  Layers,
  Package,
} from 'lucide-react';
import { toast } from 'sonner';
import { Button } from '../../../components/ui/button';
import { cn } from '../../../lib/utils';
import { procurementWizardApi, fetchProcurementDrafts, deleteProcurementDraft } from '../api';
import { bidWizardApi } from '../../bidCreationWizardV2/api';
import { ViewModeToggle } from '../../shared/ViewModeToggle';
import { useResponsiveViewMode } from '../../shared/hooks';



/* ─── Method Config Map ─── */
const METHOD_CONFIGS_MAP: Record<string, { title: string; accent: string }> = {
  'direct-purchase': { title: 'Direct Purchase', accent: 'border-emerald-200 bg-emerald-50 text-emerald-800' },
  'l1-comparison': { title: 'L1 Comparison', accent: 'border-cyan-200 bg-cyan-50 text-cyan-800' },
  'rfq': { title: 'RFQ / eRFQ', accent: 'border-blue-200 bg-blue-50 text-blue-800' },
  'tender': { title: 'Tender / Open Bid', accent: 'border-amber-200 bg-amber-50 text-amber-900' },
  'reverse-auction': { title: 'Reverse Auction', accent: 'border-violet-200 bg-violet-50 text-violet-800' },
  'boq': { title: 'BOQ Based Bid', accent: 'border-slate-200 bg-slate-50 text-slate-800' },
  'custom-product': { title: 'Custom Product Bid', accent: 'border-indigo-200 bg-indigo-50 text-indigo-800' },
  'custom-service': { title: 'Custom Service Bid', accent: 'border-rose-200 bg-rose-50 text-rose-800' },
  'pac': { title: 'PAC / Proprietary Bid', accent: 'border-orange-200 bg-orange-50 text-orange-800' },
  'rate-contract': { title: 'Rate Contract', accent: 'border-teal-200 bg-teal-50 text-teal-800' },
  'emergency': { title: 'Emergency Procurement', accent: 'border-red-200 bg-red-50 text-red-800' },
  'repeat-order': { title: 'Repeat Order / Reorder', accent: 'border-purple-200 bg-purple-50 text-purple-800' },
};

/* ─── Types ─── */
interface DisplayDraft {
  id?: number;
  uniqueKey: string;
  title: string;
  methodSlug: string;
  estimatedValue: number;
  updatedAt?: string;
  productOrService: string;
  categoryName: string;
  quantity: string;
  unit: string;
  deliveryLocation: string;
  requiredDeliveryDate: string;
  specifications: string;
  specificationDocumentName: string;
  isLocal: boolean;
  raw: any;
}

type SortKey = 'title' | 'methodSlug' | 'estimatedValue' | 'updatedAt' | 'categoryName';
type SortDir = 'asc' | 'desc';

/* ─── Helpers ─── */
const formatDateTime = (value?: string) => {
  if (!value) return 'Not saved yet';
  try {
    return new Date(value).toLocaleString('en-IN', { dateStyle: 'medium', timeStyle: 'short', hour12: true });
  } catch {
    return value;
  }
};

const formatCurrency = (v: number) => v ? `₹${v.toLocaleString('en-IN')}` : '-';

const cleanTitle = (rawTitle: string): string => {
  if (!rawTitle) return '';
  return rawTitle.replace(/\s+#\d+$/, '');
};

const mapLocalDraftToDisplay = (local: any): DisplayDraft | null => {
  if (!local) return null;
  const item = local.items?.[0];
  const doc = local.documents?.[0];
  const hasContent = Boolean(
    local.basics?.title?.trim() ||
    local.items?.some((i: any) => i.name?.trim()) ||
    local.basics?.category?.trim() ||
    local.basics?.justification?.trim() ||
    local.basics?.estimatedValue
  );
  if (!hasContent) return null;
  return {
    id: undefined,
    uniqueKey: 'local',
    title: cleanTitle(local.basics?.title || 'Untitled Local Draft'),
    methodSlug: local.type || 'rfq',
    estimatedValue: Number(local.basics?.estimatedValue || 0),
    updatedAt: local.updatedAt,
    productOrService: item?.name || '',
    categoryName: local.basics?.category || '',
    quantity: item?.quantity?.toString() || '',
    unit: item?.unit || '',
    deliveryLocation: local.tender?.deliveryLocation || local.basics?.deliveryLocation || '',
    requiredDeliveryDate: local.schedule?.deliveryDate || '',
    specifications: item?.specification || local.basics?.justification || '',
    specificationDocumentName: doc?.fileName || '',
    isLocal: true,
    raw: local,
  };
};

const mapServerDraftToDisplay = (server: any): DisplayDraft => {
  const payload = server.payload || {};
  const firstItem = server.items?.[0];
  const payloadItem = payload.items?.[0];
  const payloadDoc = payload.documents?.[0];
  return {
    id: server.id,
    uniqueKey: server.payload?.isV2 ? `v2-${server.id}` : `v1-${server.id}`,
    title: cleanTitle(server.title || payload.basics?.title || 'Untitled Draft'),
    methodSlug: server.methodSlug || payload.type || 'rfq',
    estimatedValue: Number(server.estimatedValue || payload.basics?.estimatedValue || 0),
    updatedAt: server.updatedAt,
    productOrService: firstItem?.itemName || payloadItem?.name || '',
    categoryName: server.category?.name || payload.basics?.category || '',
    quantity: firstItem?.quantity?.toString() || payloadItem?.quantity?.toString() || '',
    unit: firstItem?.unitOfMeasure || payloadItem?.unit || '',
    deliveryLocation: payload.tender?.deliveryLocation || payload.basics?.deliveryLocation || '',
    requiredDeliveryDate: server.requiredBy || payload.schedule?.deliveryDate || '',
    specifications: firstItem?.description || payloadItem?.specification || payload.basics?.justification || server.description || '',
    specificationDocumentName: payloadDoc?.fileName || '',
    isLocal: false,
    raw: server,
  };
};

/* ══════════════════════════════════════════════════════════════════════
   MAIN COMPONENT
   ══════════════════════════════════════════════════════════════════════ */

export default function ProcurementDraftsPage() {
  const router = useRouter();
  const [localDraft, setLocalDraft] = useState<any | null>(null);
  const [serverDrafts, setServerDrafts] = useState<any[]>([]);
  const [loading, setLoading] = useState<boolean>(true);
  const [selectedDraftKey, setSelectedDraftKey] = useState<string | undefined>(undefined);
  const [detailOpen, setDetailOpen] = useState(false);

  const openDetail = (d: DisplayDraft, e?: React.MouseEvent) => {
    if (e) e.stopPropagation();
    setSelectedDraftKey(d.uniqueKey);
    setDetailOpen(true);
  };
  const closeDetail = () => {
    setDetailOpen(false);
  };
  const [viewMode, setViewMode] = useResponsiveViewMode('procurement-drafts:view-mode');
  const [sortKey, setSortKey] = useState<SortKey>('updatedAt');
  const [sortDir, setSortDir] = useState<SortDir>('desc');

  // Filters
  const [searchQuery, setSearchQuery] = useState('');
  const [methodFilter, setMethodFilter] = useState('');
  const [sourceFilter, setSourceFilter] = useState('');
  const [activeKpi, setActiveKpi] = useState<string | null>(null);

  /* ── Data Loading ── */
  const loadAllDrafts = async () => {
    setLoading(true);
    try {
      const local = procurementWizardApi.loadLocalDraft();
      setLocalDraft(local);
      const result = await fetchProcurementDrafts();
      const records = result?.drafts || result?.records || result?.data?.drafts || [];
      setServerDrafts(Array.isArray(records) ? records : []);
    } catch {
      toast.error('Failed to load drafts list');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { loadAllDrafts(); }, []);

  /* ── Mapped & Sorted Drafts ── */
  const mappedLocal = useMemo(() => mapLocalDraftToDisplay(localDraft), [localDraft]);
  const mappedServers = useMemo(() => serverDrafts.map(mapServerDraftToDisplay), [serverDrafts]);

  const allDrafts = useMemo(() => {
    const list: DisplayDraft[] = [];
    if (mappedLocal) list.push(mappedLocal);
    list.push(...mappedServers);
    return list;
  }, [mappedLocal, mappedServers]);

  const kpiData = useMemo(() => {
    let local = 0;
    let server = 0;
    let directPurchase = 0;
    let l1Rfq = 0;
    let tenderBid = 0;
    let totalValue = 0;

    for (const d of allDrafts) {
      if (d.isLocal) local++;
      else server++;

      const slug = d.methodSlug?.toLowerCase() || '';
      if (slug === 'direct-purchase') {
        directPurchase++;
      } else if (slug === 'rfq' || slug === 'l1-comparison') {
        l1Rfq++;
      } else if (['tender', 'pac', 'boq', 'reverse-auction', 'custom-product', 'custom-service'].includes(slug)) {
        tenderBid++;
      }

      totalValue += d.estimatedValue || 0;
    }

    return {
      total: allDrafts.length,
      local,
      server,
      directPurchase,
      l1Rfq,
      tenderBid,
      totalValue,
    };
  }, [allDrafts]);

  const filteredDrafts = useMemo(() => {
    let list = [...allDrafts];

    if (activeKpi) {
      if (activeKpi === 'local') {
        list = list.filter(d => d.isLocal);
      } else if (activeKpi === 'server') {
        list = list.filter(d => !d.isLocal);
      } else if (activeKpi === 'direct-purchase') {
        list = list.filter(d => d.methodSlug === 'direct-purchase');
      } else if (activeKpi === 'l1-rfq') {
        list = list.filter(d => d.methodSlug === 'rfq' || d.methodSlug === 'l1-comparison');
      } else if (activeKpi === 'tender-bid') {
        list = list.filter(d => ['tender', 'pac', 'boq', 'reverse-auction', 'custom-product', 'custom-service'].includes(d.methodSlug));
      }
    }

    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase();
      list = list.filter(d =>
        d.title.toLowerCase().includes(q) ||
        (d.productOrService || '').toLowerCase().includes(q) ||
        (d.categoryName || '').toLowerCase().includes(q)
      );
    }

    if (methodFilter) {
      if (methodFilter === 'tender-bid') {
        list = list.filter(d => ['tender', 'pac', 'boq', 'reverse-auction', 'custom-product', 'custom-service'].includes(d.methodSlug));
      } else if (methodFilter === 'l1-rfq') {
        list = list.filter(d => d.methodSlug === 'rfq' || d.methodSlug === 'l1-comparison');
      } else {
        list = list.filter(d => d.methodSlug === methodFilter);
      }
    }

    if (sourceFilter) {
      if (sourceFilter === 'local') {
        list = list.filter(d => d.isLocal);
      } else if (sourceFilter === 'server') {
        list = list.filter(d => !d.isLocal);
      }
    }

    return list;
  }, [allDrafts, activeKpi, searchQuery, methodFilter, sourceFilter]);

  const sortedDrafts = useMemo(() => {
    const sorted = [...filteredDrafts];
    sorted.sort((a, b) => {
      let cmp = 0;
      switch (sortKey) {
        case 'title': cmp = (a.title || '').localeCompare(b.title || ''); break;
        case 'methodSlug': cmp = (a.methodSlug || '').localeCompare(b.methodSlug || ''); break;
        case 'estimatedValue': cmp = (a.estimatedValue || 0) - (b.estimatedValue || 0); break;
        case 'updatedAt': cmp = new Date(a.updatedAt || 0).getTime() - new Date(b.updatedAt || 0).getTime(); break;
        case 'categoryName': cmp = (a.categoryName || '').localeCompare(b.categoryName || ''); break;
      }
      return sortDir === 'asc' ? cmp : -cmp;
    });
    return sorted;
  }, [filteredDrafts, sortKey, sortDir]);

  /* ── Selection ── */
  useEffect(() => {
    if (sortedDrafts.length > 0) {
      const exists = sortedDrafts.some(d => selectedDraftKey === d.uniqueKey);
      if (!exists) {
        const d = sortedDrafts[0];
        setSelectedDraftKey(d.uniqueKey);
      }
    } else {
      setSelectedDraftKey(undefined);
    }
  }, [sortedDrafts, selectedDraftKey]);

  const selectedDraft = useMemo(
    () => allDrafts.find(d => selectedDraftKey === d.uniqueKey),
    [allDrafts, selectedDraftKey]
  );

  /* ── Actions ── */
  const discardLocal = () => {
    if (!window.confirm('Discard the unsaved local procurement draft from this browser?')) return;
    procurementWizardApi.clearLocalDraft();
    setLocalDraft(null);
    setSelectedDraftKey(undefined);
    toast.success('Local procurement draft discarded');
  };

  const discardServer = async (d: DisplayDraft) => {
    if (!window.confirm('Are you sure you want to delete this procurement draft from the server? This action cannot be undone.')) return;
    try {
      if (d.raw?.payload?.isV2) {
        await bidWizardApi.deleteDraft(d.id!);
      } else {
        await deleteProcurementDraft(d.id!);
      }
      toast.success('Procurement draft deleted successfully');
      setSelectedDraftKey(undefined);
      loadAllDrafts();
    } catch (err) {
      toast.error('Failed to delete draft: ' + (err instanceof Error ? err.message : String(err)));
    }
  };

  const handleContinue = (d: DisplayDraft) => {
    if (d.isLocal) router.push('/buyer/create-procurement');
    else if (d.raw?.payload?.isV2) router.push(`/buyer/create-bid?draft=${d.id}`);
    else router.push(`/buyer/create-procurement?id=${d.id}`);
  };

  const handleSort = (key: SortKey) => {
    if (sortKey === key) setSortDir(d => d === 'asc' ? 'desc' : 'asc');
    else { setSortKey(key); setSortDir('desc'); }
  };

  /* ── Render Helpers ── */
  const methodBadge = (slug: string) => {
    const m = METHOD_CONFIGS_MAP[slug] || { title: slug, accent: 'border-slate-200 bg-slate-50 text-slate-700' };
    return (
      <span className={cn('inline-flex whitespace-nowrap rounded-md border px-2 py-0.5 text-[9px] font-black uppercase tracking-wide', m.accent)}>
        {m.title}
      </span>
    );
  };

  const sourceBadge = (isLocal: boolean) =>
    isLocal ? (
      <span className="inline-flex rounded-md border border-amber-200 bg-amber-50 px-2 py-0.5 text-[9px] font-black uppercase tracking-wide text-amber-700">
        Local
      </span>
    ) : (
      <span className="inline-flex rounded-md border border-sky-200 bg-sky-50 px-2 py-0.5 text-[9px] font-black uppercase tracking-wide text-sky-700">
        Server
      </span>
    );

  /* ═══════════════════════════════════════════════════════════════════ */
  return (
    <div className="mx-auto max-w-7xl space-y-5 pb-8">
      {/* ── Page Header ── */}
      <section className="rounded-lg border border-slate-200 bg-white p-5 shadow-sm">
        <div className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
          <div>
            <p className="text-[10px] font-black uppercase tracking-[0.18em] text-[#12335f]">Procurement</p>
            <h1 className="mt-1 text-2xl font-black tracking-tight text-slate-950">Procurement Drafts</h1>
            <p className="mt-1 max-w-3xl text-sm font-semibold leading-relaxed text-slate-500">
              Drafts from the guided Create Procurement module are saved both in this browser and on the server. Select a draft to view details, discard, or continue editing.
            </p>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <ViewModeToggle value={viewMode} onChange={setViewMode} />
            <Button type="button" variant="outline" onClick={loadAllDrafts} disabled={loading} className="h-10 rounded-md text-xs font-black uppercase">
              <RefreshCw className={cn('mr-2 h-4 w-4', loading && 'animate-spin')} /> Refresh
            </Button>
            <Button
              type="button"
              onClick={() => router.push('/buyer/procurement')}
              className="h-10 rounded-md bg-[#12335f] text-xs font-black uppercase text-white hover:bg-[#0b2445]"
            >
              <Plus className="mr-2 h-4 w-4" /> Create Procurement
            </Button>
          </div>
        </div>
      </section>

      {/* ── KPI Cards ── */}
      <section className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-5">
        <KpiCard
          icon={ClipboardList}
          label="Total"
          value={kpiData.total}
          gradient="bg-gradient-to-br from-[#12335f] to-blue-600"
          isActive={activeKpi === null}
          onClick={() => setActiveKpi(null)}
        />
        <KpiCard
          icon={ShoppingCart}
          label="Direct Purchase"
          value={kpiData.directPurchase}
          gradient="bg-gradient-to-br from-emerald-500 to-green-600"
          isActive={activeKpi === 'direct-purchase'}
          onClick={() => setActiveKpi('direct-purchase')}
        />
        <KpiCard
          icon={FileText}
          label="L1 / RFQ"
          value={kpiData.l1Rfq}
          gradient="bg-gradient-to-br from-cyan-500 to-blue-600"
          isActive={activeKpi === 'l1-rfq'}
          onClick={() => setActiveKpi('l1-rfq')}
        />
        <KpiCard
          icon={Gavel}
          label="Tender / Bid"
          value={kpiData.tenderBid}
          gradient="bg-gradient-to-br from-violet-500 to-indigo-600"
          isActive={activeKpi === 'tender-bid'}
          onClick={() => setActiveKpi('tender-bid')}
        />
        <KpiCard
          icon={ClipboardList}
          label="Est. Value"
          value={formatCurrency(kpiData.totalValue)}
          gradient="bg-gradient-to-br from-[#12335f] to-indigo-650"
          isActive={false}
          onClick={() => {}}
        />
      </section>

      {/* ── Filters Bar ── */}
      <section className="rounded-lg border border-slate-200 bg-white p-4 shadow-sm">
        <div className="flex flex-col gap-3 lg:flex-row lg:items-center">
          {/* Search */}
          <div className="relative flex-1">
            <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
            <input
              type="text"
              placeholder="Search drafts by title, category, item/service..."
              value={searchQuery}
              onChange={e => setSearchQuery(e.target.value)}
              className="h-10 w-full rounded-lg border border-slate-200 bg-slate-50 pl-10 pr-4 text-xs font-semibold text-slate-900 outline-none transition-colors focus:border-[#12335f] focus:bg-white focus:ring-1 focus:ring-[#12335f]/20"
            />
          </div>

          {/* Method Filter */}
          <div className="flex items-center gap-2">
            <Filter className="h-4 w-4 shrink-0 text-slate-400" />
            <select
              value={methodFilter}
              onChange={e => setMethodFilter(e.target.value)}
              className="h-10 rounded-lg border border-slate-200 bg-slate-50 px-3 text-xs font-bold text-slate-700 outline-none transition-colors focus:border-[#12335f] focus:ring-1 focus:ring-[#12335f]/20"
            >
              <option value="">All Procurement Methods</option>
              <option value="direct-purchase">Direct Purchase</option>
              <option value="l1-rfq">L1 / RFQ</option>
              <option value="tender-bid">Tender / Bid / PAC</option>
            </select>
          </div>

          {/* Source Filter */}
          <select
            value={sourceFilter}
            onChange={e => setSourceFilter(e.target.value)}
            className="h-10 rounded-lg border border-slate-200 bg-slate-50 px-3 text-xs font-bold text-slate-700 outline-none transition-colors focus:border-[#12335f] focus:ring-1 focus:ring-[#12335f]/20"
          >
            <option value="">All Sources</option>
            <option value="local">Local Drafts</option>
            <option value="server">Server Drafts</option>
          </select>

          {/* Clear Filters */}
          {(searchQuery || methodFilter || sourceFilter || activeKpi) && (
            <Button
              type="button"
              variant="outline"
              onClick={() => {
                setSearchQuery('');
                setMethodFilter('');
                setSourceFilter('');
                setActiveKpi(null);
              }}
              className="h-10 rounded-md border-red-200 text-xs font-black uppercase text-red-600 hover:bg-red-50"
            >
              <XCircle className="mr-1.5 h-4 w-4" /> Clear
            </Button>
          )}
        </div>

        {/* Active chips */}
        {(searchQuery || methodFilter || sourceFilter || activeKpi) && (
          <div className="mt-3 flex flex-wrap items-center gap-1.5 border-t border-slate-100 pt-3">
            <span className="text-[10px] font-black uppercase tracking-wide text-slate-400">Active:</span>
            {activeKpi && (
              <span className="inline-flex items-center gap-1 rounded-full border border-[#12335f]/20 bg-[#12335f]/5 px-2.5 py-0.5 text-[10px] font-bold text-[#12335f]">
                KPI: {activeKpi.replace('-', ' ')}
                <button onClick={() => setActiveKpi(null)} className="ml-0.5 hover:text-red-600">×</button>
              </span>
            )}
            {searchQuery && (
              <span className="inline-flex items-center gap-1 rounded-full border border-[#12335f]/20 bg-[#12335f]/5 px-2.5 py-0.5 text-[10px] font-bold text-[#12335f]">
                Search: "{searchQuery}"
                <button onClick={() => setSearchQuery('')} className="ml-0.5 hover:text-red-600">×</button>
              </span>
            )}
            {methodFilter && (
              <span className="inline-flex items-center gap-1 rounded-full border border-[#12335f]/20 bg-[#12335f]/5 px-2.5 py-0.5 text-[10px] font-bold text-[#12335f]">
                Method: {methodFilter === 'l1-rfq' ? 'L1 / RFQ' : methodFilter === 'tender-bid' ? 'Tender / Bid' : methodFilter}
                <button onClick={() => setMethodFilter('')} className="ml-0.5 hover:text-red-600">×</button>
              </span>
            )}
            {sourceFilter && (
              <span className="inline-flex items-center gap-1 rounded-full border border-[#12335f]/20 bg-[#12335f]/5 px-2.5 py-0.5 text-[10px] font-bold text-[#12335f]">
                Source: {sourceFilter}
                <button onClick={() => setSourceFilter('')} className="ml-0.5 hover:text-red-600">×</button>
              </span>
            )}
          </div>
        )}
      </section>

      {/* ── Content ── */}
      {loading ? (
        <section className="flex h-[400px] items-center justify-center rounded-lg border border-slate-200 bg-white shadow-sm">
          <div className="flex flex-col items-center gap-3">
            <RefreshCw className="h-8 w-8 animate-spin text-[#12335f]" />
            <p className="text-sm font-semibold text-slate-500">Loading procurement drafts...</p>
          </div>
        </section>
      ) : sortedDrafts.length > 0 ? (
        <>
          {/* ═══ LIST VIEW (Table) ═══ */}
          {viewMode === 'list' && (
            <section className="overflow-hidden rounded-lg border border-slate-200 bg-white shadow-sm">
              <div className="overflow-x-auto">
                <table className="w-full text-left text-sm">
                  <thead>
                    <tr className="border-b border-slate-200 bg-slate-50">
                      <th className="px-4 py-3 text-[10px] font-black uppercase tracking-wide text-slate-500 w-[60px]">Sr. No</th>
                      <ThCell sortKey="title" currentSort={sortKey} sortDir={sortDir} onSort={handleSort}>Title</ThCell>
                      <ThCell sortKey="methodSlug" currentSort={sortKey} sortDir={sortDir} onSort={handleSort}>Method</ThCell>
                      <ThCell sortKey="categoryName" currentSort={sortKey} sortDir={sortDir} onSort={handleSort}>Category</ThCell>
                      <th className="px-4 py-3 text-[10px] font-black uppercase tracking-wide text-slate-500">Item / Service</th>
                      <ThCell sortKey="estimatedValue" currentSort={sortKey} sortDir={sortDir} onSort={handleSort}>Est. Value</ThCell>
                      <th className="px-4 py-3 text-[10px] font-black uppercase tracking-wide text-slate-500">Qty</th>
                      <ThCell sortKey="updatedAt" currentSort={sortKey} sortDir={sortDir} onSort={handleSort}>Last Updated</ThCell>
                      <th className="px-4 py-3 text-right text-[10px] font-black uppercase tracking-wide text-slate-500">Actions</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {sortedDrafts.map((d, idx) => {
                      const key = d.uniqueKey;
                      return (
                        <tr
                          key={key}
                          className="cursor-pointer transition-colors hover:bg-slate-50/80"
                          onClick={() => openDetail(d)}
                        >
                          <td className="px-4 py-3 text-center text-xs font-bold text-slate-500">{idx + 1}</td>
                          <td className="w-[240px] min-w-[200px] whitespace-normal break-words px-4 py-3 font-bold text-slate-900">
                            {d.title}
                          </td>
                          <td className="px-4 py-3">{methodBadge(d.methodSlug)}</td>
                          <td className="px-4 py-3 text-slate-600">{d.categoryName || '-'}</td>
                          <td className="max-w-[140px] truncate px-4 py-3 text-slate-600">{d.productOrService || '-'}</td>
                          <td className="px-4 py-3 font-bold text-slate-900 tabular-nums">{formatCurrency(d.estimatedValue)}</td>
                          <td className="px-4 py-3 text-slate-600 tabular-nums">{[d.quantity, d.unit].filter(Boolean).join(' ') || '-'}</td>
                          <td className="whitespace-nowrap px-4 py-3 text-xs text-slate-500">{formatDateTime(d.updatedAt)}</td>
                          <td className="px-4 py-3">
                            <div className="flex items-center justify-end gap-1.5" onClick={e => e.stopPropagation()}>
                              <Button
                                type="button"
                                size="sm"
                                onClick={(e) => openDetail(d, e)}
                                className="h-7 rounded bg-[#12335f] px-2 text-[10px] font-black uppercase text-white hover:bg-[#0b2445]"
                              >
                                <Eye className="mr-1 h-3 w-3" /> View
                              </Button>
                              <Button
                                type="button"
                                variant="outline"
                                size="sm"
                                onClick={(e) => { e.stopPropagation(); d.isLocal ? discardLocal() : discardServer(d); }}
                                className="h-7 rounded border-red-200 px-2 text-[10px] font-black uppercase text-red-600 hover:bg-red-50"
                              >
                                <Trash2 className="mr-1 h-3 w-3" /> Delete
                              </Button>
                              <Button
                                type="button"
                                size="sm"
                                onClick={(e) => { e.stopPropagation(); handleContinue(d); }}
                                className="h-7 rounded bg-[#12335f] px-2 text-[10px] font-black uppercase text-white hover:bg-[#0b2445]"
                              >
                                Continue <ArrowRight className="ml-1 h-3 w-3" />
                              </Button>
                            </div>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
              <div className="border-t border-slate-200 bg-slate-50 px-4 py-2.5">
                <p className="text-xs font-semibold text-slate-500">
                  {sortedDrafts.length} draft{sortedDrafts.length !== 1 ? 's' : ''} total
                  {mappedLocal ? ` · 1 local, ${mappedServers.length} server` : ''}
                </p>
              </div>
            </section>
          )}

          {/* ═══ GRID VIEW (Card + Detail Panel) ═══ */}
          {viewMode === 'grid' && (
            <div className="grid gap-6 lg:grid-cols-[350px_1fr]">
              {/* Left: Drafts Cards */}
              <div className="space-y-3 max-h-[600px] overflow-y-auto pr-1">
                {sortedDrafts.map((d) => {
                  const isSelected = selectedDraftKey === d.uniqueKey;
                  const method = METHOD_CONFIGS_MAP[d.methodSlug] || { title: d.methodSlug, accent: 'border-slate-200 bg-slate-50 text-slate-700' };
                  return (
                    <button
                      key={d.uniqueKey}
                      onClick={() => setSelectedDraftKey(d.uniqueKey)}
                      className={cn(
                        'w-full text-left rounded-lg border p-4 transition-all duration-200 shadow-sm hover:translate-y-[-1px]',
                        isSelected
                          ? 'border-[#12335f] bg-[#12335f]/5 ring-1 ring-[#12335f]'
                          : 'border-slate-200 bg-white hover:border-slate-300'
                      )}
                    >
                      <div className="flex items-center justify-between gap-2">
                        <span className={cn('inline-flex rounded-md border px-2 py-0.5 text-[9px] font-black uppercase tracking-wide', method.accent)}>
                          {method.title}
                        </span>
                        {d.isLocal ? (
                          <span className="inline-flex rounded-md border border-amber-200 bg-amber-50 px-2 py-0.5 text-[9px] font-black uppercase tracking-wide text-amber-700">
                            Local
                          </span>
                        ) : (
                          <span className="text-[10px] font-semibold text-slate-400">#D-{d.id}</span>
                        )}
                      </div>
                      <h3 className="mt-2 line-clamp-1 text-sm font-bold text-slate-900">{d.title}</h3>
                      <div className="mt-3 flex items-center justify-between text-xs text-slate-500">
                        <span className="font-bold text-slate-700">{formatCurrency(d.estimatedValue)}</span>
                        <span>{formatDateTime(d.updatedAt)}</span>
                      </div>
                    </button>
                  );
                })}
              </div>

              {/* Right: Selected Detail */}
              <div>
                {selectedDraft ? (
                  <section className="rounded-lg border border-slate-200 bg-white shadow-sm transition-all duration-300">
                    <div className="flex flex-col gap-4 border-b border-slate-200 bg-slate-50 p-5 lg:flex-row lg:items-start lg:justify-between">
                      <div className="min-w-0">
                        <div className="flex flex-wrap items-center gap-2">
                          {selectedDraft.isLocal ? (
                            <span className="inline-flex rounded-md border border-amber-200 bg-amber-50 px-2.5 py-1 text-[10px] font-black uppercase tracking-wide text-amber-700">
                              Active local draft
                            </span>
                          ) : (
                            <span className="inline-flex rounded-md border border-emerald-200 bg-emerald-50 px-2.5 py-1 text-[10px] font-black uppercase tracking-wide text-emerald-700">
                              Saved draft (#D-{selectedDraft.id})
                            </span>
                          )}
                          {methodBadge(selectedDraft.methodSlug)}
                        </div>
                        <h2 className="mt-3 break-words text-xl font-black text-slate-950">
                          {selectedDraft.title || 'Untitled procurement draft'}
                        </h2>
                        <p className="mt-1 text-sm font-semibold text-slate-500">
                          Last saved: {formatDateTime(selectedDraft.updatedAt)}
                        </p>
                      </div>
                      <div className="flex shrink-0 flex-wrap gap-2">
                        <Button
                          type="button"
                          variant="outline"
                          onClick={() => selectedDraft.isLocal ? discardLocal() : discardServer(selectedDraft)}
                          className="h-10 rounded-md border-red-200 text-xs font-black uppercase text-red-700 hover:bg-red-50"
                        >
                          <Trash2 className="mr-2 h-4 w-4" /> Discard
                        </Button>
                        <Button
                          type="button"
                          onClick={() => handleContinue(selectedDraft)}
                          className="h-10 rounded-md bg-[#12335f] text-xs font-black uppercase text-white hover:bg-[#0b2445]"
                        >
                          Continue Draft <ArrowRight className="ml-2 h-4 w-4" />
                        </Button>
                      </div>
                    </div>
                    <div className="grid gap-3 p-5 md:grid-cols-2 lg:grid-cols-4">
                      <DraftMetric label="Intent" value={(METHOD_CONFIGS_MAP[selectedDraft.methodSlug] || { title: selectedDraft.methodSlug }).title} />
                      <DraftMetric label="Item / Service" value={selectedDraft.productOrService || '-'} />
                      <DraftMetric label="Category" value={selectedDraft.categoryName || '-'} />
                      <DraftMetric label="Estimated Value" value={selectedDraft.estimatedValue ? formatCurrency(selectedDraft.estimatedValue) : '-'} />
                      <DraftMetric label="Quantity" value={[selectedDraft.quantity, selectedDraft.unit].filter(Boolean).join(' ') || '-'} />
                      <DraftMetric label="Delivery Location" value={selectedDraft.deliveryLocation || '-'} />
                      <DraftMetric label="Required Date" value={selectedDraft.requiredDeliveryDate || '-'} />
                      <DraftMetric label="Type" value={selectedDraft.isLocal ? 'Local Browser Cache' : 'Database Server Draft'} />
                    </div>
                    <div className="border-t border-slate-200 p-5">
                      <div className="rounded-md border border-slate-200 bg-slate-50 p-4">
                        <p className="text-[10px] font-black uppercase tracking-[0.16em] text-slate-500">Specification snapshot</p>
                        <p className={cn('mt-2 text-sm font-medium leading-relaxed text-slate-700', !selectedDraft.specifications && 'text-slate-400')}>
                          {selectedDraft.specifications || 'No specification text captured yet.'}
                        </p>
                        {selectedDraft.specificationDocumentName && (
                          <p className="mt-3 inline-flex items-center gap-2 rounded-md border border-slate-200 bg-white px-3 py-2 text-xs font-black text-slate-700">
                            <FileText className="h-4 w-4 text-[#12335f]" /> {selectedDraft.specificationDocumentName}
                          </p>
                        )}
                      </div>
                    </div>
                  </section>
                ) : (
                  <section className="rounded-lg border border-dashed border-slate-300 bg-white p-8 text-center shadow-sm">
                    <p className="text-sm font-semibold text-slate-500">Please select a draft from the list to view its details.</p>
                  </section>
                )}
              </div>
            </div>
          )}
        </>
      ) : (
        /* Empty State */
        <section className="rounded-lg border border-dashed border-slate-300 bg-white p-8 text-center shadow-sm">
          <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-md bg-slate-50 text-[#12335f]">
            <FileText className="h-7 w-7" />
          </div>
          <h2 className="mt-4 text-lg font-black text-slate-950">No procurement drafts saved</h2>
          <p className="mx-auto mt-2 max-w-xl text-sm font-semibold text-slate-500">
            Start a Create Procurement process and click Save Draft. Your drafts will appear here for you to continue them at any time.
          </p>
          <Button type="button" onClick={() => router.push('/buyer/create-procurement')} className="mt-5 h-10 rounded-md bg-[#12335f] px-5 text-xs font-black uppercase text-white hover:bg-[#0b2445]">
            Create Procurement <ArrowRight className="ml-2 h-4 w-4" />
          </Button>
        </section>
      )}
      {detailOpen && selectedDraft && (
        <DraftDetailDialog
          draft={selectedDraft}
          onClose={closeDetail}
          onContinue={() => handleContinue(selectedDraft)}
          onDelete={() => selectedDraft.isLocal ? discardLocal() : discardServer(selectedDraft)}
        />
      )}
    </div>
  );
}

/* ─── Draft Detail Dialog ─── */
function DraftDetailDialog({
  draft: d,
  onClose,
  onContinue,
  onDelete,
}: {
  draft: DisplayDraft;
  onClose: () => void;
  onContinue: () => void;
  onDelete: () => void;
}) {
  // Close on Escape key
  React.useEffect(() => {
    const handler = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [onClose]);

  const DetailRow = ({ icon: Icon, label, value }: { icon: React.ElementType; label: string; value?: string | number | null }) => {
    if (!value && value !== 0) return null;
    return (
      <div className="flex items-start gap-3 py-2.5 border-b border-slate-100 last:border-b-0">
        <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-slate-50 text-slate-500">
          <Icon className="h-4 w-4" />
        </div>
        <div className="min-w-0 flex-1">
          <p className="text-[10px] font-black uppercase tracking-[0.14em] text-slate-400">{label}</p>
          <p className="mt-0.5 text-sm font-semibold text-slate-800 break-words whitespace-pre-wrap">{value}</p>
        </div>
      </div>
    );
  };

  return (
    <div
      className="fixed inset-0 z-[9999] flex items-center justify-center bg-black/50 backdrop-blur-sm p-4"
      onClick={onClose}
    >
      <div
        className="relative w-full max-w-lg max-h-[85vh] overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-2xl animate-in fade-in zoom-in-95 duration-200"
        onClick={e => e.stopPropagation()}
      >
        {/* Header */}
        <div className="sticky top-0 z-10 flex items-start justify-between gap-3 border-b border-slate-200 bg-white px-6 py-4">
          <div className="min-w-0 flex-1">
            <div className="flex flex-wrap items-center gap-2 mb-1.5">
              {d.isLocal ? (
                <span className="inline-flex rounded-md border border-amber-200 bg-amber-50 px-2 py-0.5 text-[9px] font-black uppercase tracking-wide text-amber-700">
                  Active local draft
                </span>
              ) : (
                <span className="inline-flex rounded-md border border-emerald-200 bg-emerald-50 px-2 py-0.5 text-[9px] font-black uppercase tracking-wide text-emerald-700">
                  Saved draft (#D-{d.id})
                </span>
              )}
              <span className="inline-flex rounded-md border border-slate-200 bg-slate-50 px-2 py-0.5 text-[9px] font-black uppercase tracking-wide text-slate-700">
                {(METHOD_CONFIGS_MAP[d.methodSlug] || { title: d.methodSlug }).title}
              </span>
            </div>
            <h2 className="text-lg font-black text-slate-950 leading-snug break-words">{d.title || 'Untitled Draft'}</h2>
          </div>
          <button
            onClick={onClose}
            className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg hover:bg-slate-100 text-slate-400 hover:text-slate-600 transition-colors"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        {/* Body */}
        <div className="overflow-y-auto px-6 py-4" style={{ maxHeight: 'calc(85vh - 140px)' }}>
          <DetailRow icon={ShoppingCart} label="Intent" value={(METHOD_CONFIGS_MAP[d.methodSlug] || { title: d.methodSlug }).title} />
          <DetailRow icon={Package} label="Item / Service" value={d.productOrService} />
          <DetailRow icon={Tag} label="Category" value={d.categoryName} />
          <DetailRow icon={IndianRupee} label="Estimated Value" value={d.estimatedValue ? formatCurrency(d.estimatedValue) : undefined} />
          <DetailRow icon={Layers} label="Quantity" value={[d.quantity, d.unit].filter(Boolean).join(' ') || undefined} />
          <DetailRow icon={MapPin} label="Delivery Location" value={d.deliveryLocation} />
          <DetailRow icon={CalendarDays} label="Required Date" value={d.requiredDeliveryDate} />
          <DetailRow icon={Info} label="Specifications snapshot" value={d.specifications} />
          {d.specificationDocumentName && (
            <DetailRow icon={FileText} label="Specification Document" value={d.specificationDocumentName} />
          )}
          <DetailRow icon={CalendarDays} label="Last Updated" value={formatDateTime(d.updatedAt)} />
        </div>

        {/* Footer */}
        <div className="sticky bottom-0 z-10 flex items-center justify-end gap-2 border-t border-slate-200 bg-white px-6 py-3">
          <Button
            type="button"
            variant="outline"
            onClick={() => { onClose(); onDelete(); }}
            className="h-9 rounded-lg border-red-200 text-xs font-black uppercase text-red-700 hover:bg-red-50"
          >
            <Trash2 className="mr-1.5 h-3.5 w-3.5" /> Discard
          </Button>
          <Button
            type="button"
            onClick={() => { onClose(); onContinue(); }}
            className="h-9 rounded-lg bg-[#12335f] text-xs font-black uppercase text-white hover:bg-[#0b2445]"
          >
            Continue Draft <ArrowRight className="ml-1.5 h-3.5 w-3.5" />
          </Button>
        </div>
      </div>
    </div>
  );
}

/* ── Sub-components ── */

function KpiCard({
  icon: Icon,
  label,
  value,
  gradient,
  isActive,
  onClick,
}: {
  icon: React.ElementType;
  label: string;
  value: string | number;
  gradient: string;
  isActive: boolean;
  onClick: () => void;
}) {
  return (
    <button
      onClick={onClick}
      className={cn(
        'group relative flex flex-col items-start gap-1 overflow-hidden rounded-xl border p-4 text-left transition-all duration-300 w-full',
        'hover:shadow-lg hover:-translate-y-0.5',
        isActive
          ? 'border-[#12335f] bg-[#12335f]/5 ring-2 ring-[#12335f]/20 shadow-md'
          : 'border-slate-200 bg-white hover:border-[#12335f]/30 shadow-sm'
      )}
    >
      <div className={cn('absolute inset-0 opacity-[0.04] transition-opacity group-hover:opacity-[0.07]', gradient)} />
      <div className="relative z-10 flex w-full items-center justify-between">
        <div className={cn(
          'flex h-9 w-9 items-center justify-center rounded-lg transition-colors',
          isActive ? 'bg-[#12335f] text-white' : 'bg-[#12335f]/10 text-[#12335f] group-hover:bg-[#12335f]/15'
        )}>
          <Icon className="h-4 w-4" />
        </div>
        {isActive && (
          <span className="inline-flex h-2 w-2 rounded-full bg-[#12335f] animate-pulse" />
        )}
      </div>
      <div className="relative z-10 mt-2">
        <p className="text-base font-black tracking-tight text-slate-950 tabular-nums">{value}</p>
        <p className="text-[9px] font-black uppercase tracking-[0.16em] text-slate-500">{label}</p>
      </div>
    </button>
  );
}

function DraftMetric({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-md border border-slate-200 bg-white p-3">
      <p className="text-[10px] font-black uppercase tracking-[0.16em] text-slate-400">{label}</p>
      <p className="mt-1 break-words text-sm font-black text-slate-900">{value}</p>
    </div>
  );
}

function ThCell({
  children,
  sortKey,
  currentSort,
  sortDir,
  onSort,
}: {
  children: React.ReactNode;
  sortKey: SortKey;
  currentSort: SortKey;
  sortDir: SortDir;
  onSort: (key: SortKey) => void;
}) {
  const isActive = currentSort === sortKey;
  return (
    <th
      className="cursor-pointer select-none px-4 py-3 text-[10px] font-black uppercase tracking-wide text-slate-500 transition-colors hover:text-slate-700"
      onClick={() => onSort(sortKey)}
    >
      <span className="inline-flex items-center gap-1">
        {children}
        <ArrowUpDown className={cn('h-3 w-3 transition-colors', isActive ? 'text-[#12335f]' : 'text-slate-300')} />
        {isActive && (
          <span className="text-[8px] text-[#12335f]">{sortDir === 'asc' ? '↑' : '↓'}</span>
        )}
      </span>
    </th>
  );
}
