'use client';

import React, { useEffect, useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import {
  ArrowLeft,
  Check,
  ChevronRight,
  Building2,
  ClipboardCheck,
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
import { formatDate } from '../../shared/format';



/* ─── Method Config Map ─── */
const METHOD_CONFIGS_MAP: Record<string, { title: string; accent: string }> = {
  'direct-purchase': { title: 'Cart Checkout', accent: 'border-emerald-200 bg-emerald-50/50 text-emerald-700' },
  'l1-comparison': { title: 'RFQ', accent: 'border-blue-200 bg-blue-50/50 text-blue-700' },
  'rfq': { title: 'RFQ', accent: 'border-blue-200 bg-blue-50/50 text-blue-700' },
  'rfi': { title: 'RFI', accent: 'border-cyan-200 bg-cyan-50/50 text-cyan-700' },
  'tender': { title: 'OpenTender', accent: 'border-amber-200 bg-amber-50/50 text-amber-700' },
  'open-tender': { title: 'OpenTender', accent: 'border-amber-200 bg-amber-50/50 text-amber-700' },
  'reverse-auction': { title: 'Reverse Auction', accent: 'border-violet-200 bg-violet-50/50 text-violet-700' },
  'boq': { title: 'OpenTender', accent: 'border-amber-200 bg-amber-50/50 text-amber-700' },
  'custom-product': { title: 'RFQ', accent: 'border-blue-200 bg-blue-50/50 text-blue-700' },
  'custom-service': { title: 'RFQ', accent: 'border-blue-200 bg-blue-50/50 text-blue-700' },
  'pac': { title: 'Limited Tender', accent: 'border-orange-200 bg-orange-50/50 text-orange-700' },
  'rate-contract': { title: 'Rate Contract', accent: 'border-teal-200 bg-teal-50/50 text-teal-700' },
  'emergency': { title: 'Limited Tender', accent: 'border-orange-200 bg-orange-50/50 text-orange-700' },
  'limited-tender': { title: 'Limited Tender', accent: 'border-orange-200 bg-orange-50/50 text-orange-700' },
  'repeat-order': { title: 'Repeat order', accent: 'border-purple-200 bg-purple-50/50 text-purple-700' },
  'draft': { title: 'Draft', accent: 'border-slate-200 bg-slate-50/50 text-slate-700' },
};

/* ─── Types ─── */
interface DisplayDraft {
  id?: number;
  uniqueKey: string;
  title: string;
  procurementMethod?: string;
  canonicalMethod?: string;
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
    id: local.id ? Number(local.id) : undefined,
    uniqueKey: local.id ? `local-${local.id}` : 'local',
    title: cleanTitle(local.basics?.title || 'Untitled Local Draft'),
    procurementMethod: undefined,
    canonicalMethod: local.type?.toUpperCase?.().replace(/-/g, '_'),
    methodSlug: local.type || 'rfq',
    estimatedValue: Number(local.basics?.estimatedValue || 0),
    updatedAt: local.updatedAt || new Date().toISOString(),
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
    procurementMethod: server.procurementMethod,
    canonicalMethod: server.canonicalMethod || payload.fullProcurementMethod || payload.type,
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
  const [deletingIds, setDeletingIds] = useState<number[]>([]);

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
    const serverList = [...mappedServers];

    if (mappedLocal) {
      // Find a matching server draft
      const matchIdx = serverList.findIndex((s) => {
        // 1. Match by ID if both are available
        if (mappedLocal.id !== undefined && s.id !== undefined && mappedLocal.id === s.id) {
          return true;
        }
        // 2. Match by content similarity as a fallback
        const cleanLocalTitle = (mappedLocal.title || '').trim().toLowerCase();
        const cleanServerTitle = (s.title || '').trim().toLowerCase();
        return (
          cleanLocalTitle === cleanServerTitle &&
          mappedLocal.categoryName === s.categoryName &&
          mappedLocal.methodSlug === s.methodSlug &&
          mappedLocal.estimatedValue === s.estimatedValue
        );
      });

      if (matchIdx !== -1) {
        // Merge: Use the local draft (most up-to-date client edits) but bind the server's ID/metadata
        const matchedServer = serverList[matchIdx];
        mappedLocal.id = matchedServer.id;
        mappedLocal.uniqueKey = `local-${matchedServer.id}`;
        // Remove the duplicate server draft from display
        serverList.splice(matchIdx, 1);
      }

      list.push(mappedLocal);
    }

    list.push(...serverList);
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
    procurementWizardApi.clearLocalDraft();
    setLocalDraft(null);
    setSelectedDraftKey(undefined);
    toast.success('Local procurement draft discarded');
  };

  const discardServer = async (d: DisplayDraft) => {
    if (!d.id || deletingIds.includes(d.id)) return;
    setDeletingIds(prev => [...prev, d.id!]);
    try {
      if (d.raw?.payload?.isV2) {
        await bidWizardApi.deleteDraft(d.id!);
      } else {
        await deleteProcurementDraft(d.id!);
      }
      toast.success('Procurement draft deleted successfully');
      setSelectedDraftKey(undefined);
      await loadAllDrafts();
    } catch (err) {
      toast.error('Failed to delete draft: ' + (err instanceof Error ? err.message : String(err)));
    } finally {
      setDeletingIds(prev => prev.filter(id => id !== d.id));
    }
  };

  const handleContinue = (d: DisplayDraft) => {
    if (d.isLocal) router.push('/buyer/procurement/create');
    else if (d.raw?.payload?.isV2) router.push(`/buyer/create-bid?draft=${d.id}`);
    else router.push(`/buyer/procurement/create?id=${d.id}`);
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
  if (detailOpen && selectedDraft) {
    return (
      <DraftDetailView
        draft={selectedDraft}
        onBack={closeDetail}
        onContinue={() => handleContinue(selectedDraft)}
        onDiscard={() => {
          closeDetail();
          selectedDraft.isLocal ? discardLocal() : discardServer(selectedDraft);
        }}
      />
    );
  }

  return (
    <div className="space-y-6">
      {/* Transparent Header */}
      <div className="flex flex-col gap-2 md:flex-row md:items-center md:justify-between py-2">
        <div className="min-w-0">
          <span className="text-[10px] font-black uppercase tracking-widest text-[#12335f] bg-[#12335f]/10 px-2.5 py-1 rounded-full">Procurement</span>
          <h1 className="text-3xl font-black tracking-tight text-slate-900 mt-2">Procurement Drafts</h1>
          <p className="text-xs font-semibold text-slate-500 mt-1">
            Drafts from the guided Create Procurement module are saved both in this browser and on the server.
          </p>
        </div>

        <div className="flex items-center gap-2">
          <ViewModeToggle value={viewMode} onChange={setViewMode} />
          <Button type="button" variant="outline" onClick={loadAllDrafts} disabled={loading} className="h-10 rounded-lg text-xs font-black uppercase bg-white hover:bg-slate-50 border-slate-200 shadow-sm">
            <RefreshCw className={cn('mr-2 h-4 w-4 text-[#12335f]', loading && 'animate-spin')} /> Refresh
          </Button>
          <Button
            type="button"
            onClick={() => router.push('/buyer/procurement')}
            className="h-10 bg-[#12335f] hover:bg-[#0b2445] text-xs font-black uppercase text-white rounded-lg shadow-sm"
          >
            <Plus className="mr-2 h-4 w-4" /> Create Procurement
          </Button>
        </div>
      </div>

      {/* KPI Cards Grid */}
      <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-5">
        <KpiCard
          label="Total Drafts"
          value={kpiData.total}
          icon={ClipboardList}
          active={activeKpi === null}
          onClick={() => setActiveKpi(null)}
          color="blue"
        />
        <KpiCard
          label="Cart Checkouts"
          value={kpiData.directPurchase}
          icon={ShoppingCart}
          active={activeKpi === 'direct-purchase'}
          onClick={() => setActiveKpi('direct-purchase')}
          color="green"
        />
        <KpiCard
          label="RFQs"
          value={kpiData.l1Rfq}
          icon={FileText}
          active={activeKpi === 'l1-rfq'}
          onClick={() => setActiveKpi('l1-rfq')}
          color="indigo"
        />
        <KpiCard
          label="OpenTenders"
          value={kpiData.tenderBid}
          icon={Gavel}
          active={activeKpi === 'tender-bid'}
          onClick={() => setActiveKpi('tender-bid')}
          color="purple"
        />
        <KpiCard
          label="Est. Value"
          value={formatCurrency(kpiData.totalValue)}
          icon={IndianRupee}
          active={false}
          color="slate"
        />
      </div>

      {/* Inline Filters Bar */}
      <div className="border-y border-slate-200 bg-slate-50/50 py-3 px-1">
        <div className="flex flex-col gap-3 md:flex-row md:items-center justify-between">
          <div className="relative min-w-0 flex-1 max-w-md">
            <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
            <input
              type="text"
              placeholder="Search drafts by title, category..."
              value={searchQuery}
              onChange={e => setSearchQuery(e.target.value)}
              className="h-10 w-full rounded-lg border border-slate-200 bg-white pl-10 pr-3 text-xs font-semibold outline-none focus:ring-2 focus:ring-[#12335f]/20"
            />
          </div>

          <div className="flex items-center gap-3 justify-end">
            <select
              value={methodFilter}
              onChange={e => setMethodFilter(e.target.value)}
              className="h-10 min-w-[160px] rounded-lg border border-slate-200 bg-white px-3 text-xs font-bold outline-none focus:ring-2 focus:ring-[#12335f]/20"
            >
              <option value="">All Types</option>
              <option value="direct-purchase">Cart Checkout</option>
              <option value="rfq">RFQ</option>
              <option value="tender">OpenTender</option>
              <option value="reverse-auction">Reverse Auction</option>
              <option value="rate-contract">Rate Contract</option>
              <option value="limited-tender">Limited Tender</option>
              <option value="repeat-order">Repeat order</option>
            </select>

            <select
              value={sourceFilter}
              onChange={e => setSourceFilter(e.target.value)}
              className="h-10 min-w-[140px] rounded-lg border border-slate-200 bg-white px-3 text-xs font-bold outline-none focus:ring-2 focus:ring-[#12335f]/20"
            >
              <option value="">All Sources</option>
              <option value="local">Local Drafts</option>
              <option value="server">Server Drafts</option>
            </select>

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
                className="h-10 border-red-200 text-xs font-black uppercase text-red-600 hover:bg-red-50"
              >
                Clear
              </Button>
            )}
          </div>
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
      </div>

      {/* ── Content ── */}
      {loading ? (
        <section className="flex h-[400px] items-center justify-center rounded-[24px] bg-white/95 shadow-[0_10px_30px_rgba(15,23,42,0.06)] ring-1 ring-slate-200/70">
          <div className="flex flex-col items-center gap-3">
            <RefreshCw className="h-8 w-8 animate-spin text-[#12335f]" />
            <p className="text-sm font-semibold text-slate-500">Loading procurement drafts...</p>
          </div>
        </section>
      ) : sortedDrafts.length > 0 ? (
        <>
          {/* ═══ LIST VIEW (Table) ═══ */}
          {viewMode === 'list' && (
            <section className="overflow-hidden rounded-[24px] bg-white/95 shadow-[0_10px_30px_rgba(15,23,42,0.06)] ring-1 ring-slate-200/70">
              <div className="overflow-x-auto bg-slate-50/70 p-2">
                <table className="w-full border-separate border-spacing-y-2 text-left text-sm">
                  <thead>
                    <tr>
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
                  <tbody>
                    {sortedDrafts.map((d, idx) => {
                      const key = d.uniqueKey;
                      return (
                        <tr
                          key={key}
                           className="cursor-pointer bg-white shadow-3xs transition hover:shadow-sm"
                          onClick={() => openDetail(d)}
                        >
                          <td className="rounded-l-2xl px-4 py-3 text-center text-xs font-bold text-slate-500">{idx + 1}</td>
                          <td className="w-[240px] min-w-[200px] whitespace-normal break-words px-4 py-3 font-bold text-slate-900">
                            {d.title}
                          </td>
                          <td className="px-4 py-3">{methodBadge(d.methodSlug)}</td>
                          <td className="px-4 py-3 text-slate-600">{d.categoryName || '-'}</td>
                          <td className="max-w-[140px] truncate px-4 py-3 text-slate-600">{d.productOrService || '-'}</td>
                          <td className="px-4 py-3 font-bold text-slate-900 tabular-nums">{formatCurrency(d.estimatedValue)}</td>
                          <td className="px-4 py-3 text-slate-600 tabular-nums">{[d.quantity, d.unit].filter(Boolean).join(' ') || '-'}</td>
                          <td className="whitespace-nowrap px-4 py-3 text-xs text-slate-500">{formatDateTime(d.updatedAt)}</td>
                          <td className="rounded-r-2xl px-4 py-3">
                            <div className="flex items-center justify-end gap-1.5" onClick={e => e.stopPropagation()}>
                              <Button
                                type="button"
                                size="sm"
                                onClick={(e) => openDetail(d, e)}
                                 className="h-7 bg-[#12335f] px-2 text-[10px] font-black uppercase text-white hover:bg-[#0b2445]"
                              >
                                <Eye className="mr-1 h-3 w-3" /> View
                              </Button>
                              <Button
                                type="button"
                                variant="outline"
                                size="sm"
                                disabled={!d.isLocal && deletingIds.includes(d.id!)}
                                onClick={(e) => { e.stopPropagation(); d.isLocal ? discardLocal() : discardServer(d); }}
                                 className="h-7 border-red-200 px-2 text-[10px] font-black uppercase text-red-600 hover:bg-red-50"
                              >
                                <Trash2 className="mr-1 h-3 w-3" /> Delete
                              </Button>
                              <Button
                                type="button"
                                size="sm"
                                onClick={(e) => { e.stopPropagation(); handleContinue(d); }}
                                 className="h-7 bg-[#12335f] px-2 text-[10px] font-black uppercase text-white hover:bg-[#0b2445]"
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
              <div className="bg-slate-50 px-4 py-2.5">
                <p className="text-xs font-semibold text-slate-500">
                  {sortedDrafts.length} draft{sortedDrafts.length !== 1 ? 's' : ''} total
                  {mappedLocal ? (
                    mappedLocal.id && serverDrafts.some((s) => s.id === mappedLocal.id)
                      ? ` · 1 local (synced), ${serverDrafts.length - 1} server`
                      : ` · 1 local, ${serverDrafts.length} server`
                  ) : ''}
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
                        'w-full rounded-[22px] p-4 text-left shadow-[0_10px_30px_rgba(15,23,42,0.06)] ring-1 ring-slate-200/70 transition-all duration-200 hover:translate-y-[-1px]',
                        isSelected
                          ? 'bg-[#12335f]/5 ring-2 ring-[#12335f]/25'
                          : 'bg-white/95 hover:ring-[#12335f]/25'
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
                  <section className="rounded-[24px] bg-white/95 shadow-[0_10px_30px_rgba(15,23,42,0.06)] ring-1 ring-slate-200/70 transition-all duration-300">
                    <div className="flex flex-col gap-4 bg-slate-50/80 p-5 lg:flex-row lg:items-start lg:justify-between">
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
                          disabled={!selectedDraft.isLocal && deletingIds.includes(selectedDraft.id!)}
                          onClick={() => selectedDraft.isLocal ? discardLocal() : discardServer(selectedDraft)}
                           className="h-10 border-red-200 text-xs font-black uppercase text-red-700 hover:bg-red-50"
                        >
                          <Trash2 className="mr-2 h-4 w-4" /> Discard
                        </Button>
                        <Button
                          type="button"
                          onClick={() => handleContinue(selectedDraft)}
                           className="h-10 bg-[#12335f] text-xs font-black uppercase text-white hover:bg-[#0b2445]"
                        >
                          Continue Draft <ArrowRight className="ml-2 h-4 w-4" />
                        </Button>
                      </div>
                    </div>
                    <div className="grid gap-3 p-5 md:grid-cols-2 lg:grid-cols-4">
                      <InfoTile label="Intent" value={(METHOD_CONFIGS_MAP[selectedDraft.methodSlug] || { title: selectedDraft.methodSlug }).title} />
                      <InfoTile label="Item / Service" value={selectedDraft.productOrService || '-'} />
                      <InfoTile label="Category" value={selectedDraft.categoryName || '-'} />
                      <InfoTile label="Estimated Value" value={selectedDraft.estimatedValue ? formatCurrency(selectedDraft.estimatedValue) : '-'} />
                      <InfoTile label="Quantity" value={[selectedDraft.quantity, selectedDraft.unit].filter(Boolean).join(' ') || '-'} />
                      <InfoTile label="Delivery Location" value={selectedDraft.deliveryLocation || '-'} />
                      <InfoTile label="Required Date" value={selectedDraft.requiredDeliveryDate ? formatDate(selectedDraft.requiredDeliveryDate) : '-'} />
                      <InfoTile label="Type" value={selectedDraft.isLocal ? 'Local Browser Cache' : 'Database Server Draft'} />
                    </div>
                    <div className="p-5">
                      <div className="rounded-[18px] bg-slate-50 p-4 ring-1 ring-slate-200/70">
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
                  <section className="rounded-[24px] border border-dashed border-slate-300 bg-white/95 p-8 text-center shadow-[0_10px_30px_rgba(15,23,42,0.06)]">
                    <p className="text-sm font-semibold text-slate-500">Please select a draft from the list to view its details.</p>
                  </section>
                )}
              </div>
            </div>
          )}
        </>
      ) : (
        /* Empty State */
        <section className="rounded-[24px] border border-dashed border-slate-300 bg-white/95 p-8 text-center shadow-[0_10px_30px_rgba(15,23,42,0.06)]">
          <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-md bg-slate-50 text-[#12335f]">
            <FileText className="h-7 w-7" />
          </div>
          <h2 className="mt-4 text-lg font-black text-slate-950">No procurement drafts saved</h2>
          <p className="mx-auto mt-2 max-w-xl text-sm font-semibold text-slate-500">
            Start a Create Procurement process and click Save Draft. Your drafts will appear here for you to continue them at any time.
          </p>
          <Button type="button" onClick={() => router.push('/buyer/procurement/create')} className="mt-5 h-10 rounded-md bg-[#12335f] px-5 text-xs font-black uppercase text-white hover:bg-[#0b2445]">
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
          <DetailRow icon={CalendarDays} label="Required Date" value={d.requiredDeliveryDate ? formatDate(d.requiredDeliveryDate) : undefined} />
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

interface KpiCardProps {
  label: string;
  value: string | number;
  icon: any;
  onClick?: () => void;
  active?: boolean;
  color?: 'blue' | 'green' | 'red' | 'purple' | 'amber' | 'indigo' | 'slate';
}

function KpiCard({ label, value, icon: Icon, onClick, active, color = 'slate' }: KpiCardProps) {
  const colorMap = {
    blue: 'border-blue-100 bg-blue-50/50 hover:bg-blue-50 text-blue-700 hover:border-blue-300 ring-blue-600/10',
    green: 'border-green-100 bg-green-50/50 hover:bg-green-50 text-green-700 hover:border-green-300 ring-green-600/10',
    red: 'border-red-100 bg-red-50/50 hover:bg-red-50 text-red-700 hover:border-red-300 ring-red-600/10',
    purple: 'border-purple-100 bg-purple-50/50 hover:bg-purple-50 text-purple-700 hover:border-purple-300 ring-purple-600/10',
    amber: 'border-amber-100 bg-amber-50/50 hover:bg-amber-50 text-amber-700 hover:border-amber-300 ring-amber-600/10',
    indigo: 'border-indigo-100 bg-indigo-50/50 hover:bg-indigo-50 text-indigo-700 hover:border-indigo-300 ring-indigo-600/10',
    slate: 'border-slate-100 bg-slate-50/50 hover:bg-slate-50 text-slate-700 hover:border-slate-300 ring-slate-600/10',
  };

  const activeColorMap = {
    blue: 'border-blue-500 bg-blue-50 text-blue-800 ring-2 ring-blue-500/20',
    green: 'border-green-500 bg-green-50 text-green-800 ring-2 ring-green-500/20',
    red: 'border-red-500 bg-red-50 text-red-800 ring-2 ring-red-500/20',
    purple: 'border-purple-500 bg-purple-50 text-purple-800 ring-2 ring-purple-500/20',
    amber: 'border-amber-500 bg-amber-50 text-amber-800 ring-2 ring-amber-500/20',
    indigo: 'border-indigo-500 bg-indigo-50 text-indigo-800 ring-2 ring-indigo-500/20',
    slate: 'border-slate-500 bg-slate-50 text-slate-800 ring-2 ring-slate-500/20',
  };

  const iconBgMap = {
    blue: 'bg-blue-500 text-white',
    green: 'bg-green-500 text-white',
    red: 'bg-red-500 text-white',
    purple: 'bg-purple-500 text-white',
    amber: 'bg-amber-500 text-white',
    indigo: 'bg-indigo-500 text-white',
    slate: 'bg-slate-500 text-white',
  };

  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        'w-full text-left rounded-2xl border p-4 shadow-sm transition-all duration-300 flex items-center justify-between',
        active ? activeColorMap[color] : colorMap[color]
      )}
    >
      <div className="min-w-0">
        <p className="text-[10px] font-black uppercase tracking-widest opacity-80">{label}</p>
        <p className="mt-1 text-2xl font-black tracking-tight leading-none">{value}</p>
      </div>
      <div className={cn('flex h-9 w-9 shrink-0 items-center justify-center rounded-xl shadow-sm transition-transform duration-300 group-hover:scale-110', iconBgMap[color])}>
        <Icon className="h-4.5 w-4.5" />
      </div>
    </button>
  );
}

function InfoTile({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-md border border-slate-200 bg-slate-50 p-2.5">
      <p className="text-[9px] font-black uppercase tracking-widest text-slate-400">{label}</p>
      <p className="mt-1 break-words text-xs font-bold text-slate-800">{value || '-'}</p>
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

/* ─── Draft Detail View (Full Page style) ─── */
function DraftDetailView({
  draft: d,
  onBack,
  onContinue,
  onDiscard,
}: {
  draft: DisplayDraft;
  onBack: () => void;
  onContinue: () => void;
  onDiscard: () => void;
}) {
  // Helper function to pick relevant icons
  const getSectionIcon = (title: string) => {
    const t = title.toLowerCase();
    if (t.includes('intent') || t.includes('scope')) return ClipboardList;
    if (t.includes('buyer') || t.includes('user') || t.includes('contact') || t.includes('org')) return Info;
    if (t.includes('item') || t.includes('qty')) return Package;
    if (t.includes('date') || t.includes('time') || t.includes('schedule')) return CalendarDays;
    if (t.includes('price') || t.includes('budget') || t.includes('cost') || t.includes('value')) return IndianRupee;
    if (t.includes('terms') || t.includes('eligibility') || t.includes('criteria') || t.includes('rule')) return ClipboardCheck;
    return Layers;
  };

  // 1. Extract Items
  const items = useMemo(() => {
    if (d.isLocal) {
      return (d.raw?.items || []).map((item: any) => ({
        itemName: item.name || '',
        quantity: String(item.quantity || ''),
        unitOfMeasure: item.unit || 'Nos',
        description: item.specification || ''
      }));
    }
    if (d.raw?.payload?.isV2 || d.raw?.formData) {
      const payload = d.raw.payload || d.raw.formData || {};
      const payloadItems = payload.items || payload.step4?.items || [];
      if (payloadItems.length > 0) {
        return payloadItems.map((item: any) => ({
          itemName: item.name || item.itemName || '',
          quantity: String(item.quantity || ''),
          unitOfMeasure: item.unit || item.unitOfMeasure || 'Nos',
          description: item.specification || item.description || ''
        }));
      }
      const step4 = payload.step4 || {};
      if (step4.productName || step4.serviceCategory) {
        return [{
          itemName: step4.productName || step4.serviceCategory || '',
          quantity: String(step4.quantity || ''),
          unitOfMeasure: step4.unitOfMeasurement || 'Nos',
          description: step4.productDescription || step4.scopeOfWork || ''
        }];
      }
    }
    if (Array.isArray(d.raw?.items)) {
      return d.raw.items.map((item: any) => ({
        itemName: item.itemName || '',
        quantity: String(item.quantity || ''),
        unitOfMeasure: item.unitOfMeasure || 'Nos',
        description: item.description || ''
      }));
    }
    // Fallback using DisplayDraft properties
    if (d.productOrService) {
      return [{
        itemName: d.productOrService,
        quantity: d.quantity,
        unitOfMeasure: d.unit || 'Nos',
        description: d.specifications
      }];
    }
    return [];
  }, [d]);

  // 2. Extract Org Name
  const orgName = useMemo(() => {
    return d.raw?.internal?.orgName || d.raw?.basics?.organizationName || d.raw?.organizationName || 'My Organization';
  }, [d]);

  // 3. Extract Documents
  const documents = useMemo(() => {
    const docs = d.raw?.documents || d.raw?.payload?.documents || [];
    const mapped = (Array.isArray(docs) ? docs : []).map((doc: any) => ({
      fileAssetId: doc.fileAssetId || doc.id,
      fileName: doc.fileName || doc.originalName || 'Document',
      documentType: doc.documentType || 'Draft Document'
    }));
    if (mapped.length === 0 && d.specificationDocumentName) {
      mapped.push({
        fileAssetId: d.raw?.boqFileAssetId || d.raw?.items?.[0]?.fileAssetId || null,
        fileName: d.specificationDocumentName,
        documentType: 'Specification Document'
      });
    }
    return mapped;
  }, [d]);

  // 4. Extract Detail Sections (Accordions)
  const detailSections = useMemo(() => {
    const sections: Array<{ title: string; fields: Array<{ label: string; value: string }> }> = [];
    
    // Procurement Intent Section
    sections.push({
      title: 'PROCUREMENT INTENT',
      fields: [
        { label: 'TITLE', value: d.title || 'Untitled Draft' },
        { label: 'CATEGORY', value: d.categoryName || '—' },
        { label: 'BUYER TYPE', value: d.raw?.basics?.buyerType || 'PRIVATE_BUYER' },
        { label: 'DESCRIPTION', value: `Sourcing Method: ${(METHOD_CONFIGS_MAP[d.methodSlug] || { title: d.methodSlug }).title}\nValue: ${formatCurrency(d.estimatedValue)}\nUrgency: ${d.raw?.basics?.priority || 'Normal'}` }
      ]
    });

    // Internal Details Section
    if (d.raw?.internal) {
      sections.push({
        title: 'INTERNAL DETAILS',
        fields: [
          { label: 'ORGANIZATION NAME', value: d.raw.internal.orgName || '—' },
          { label: 'DEPARTMENT', value: d.raw.internal.department || '—' },
          { label: 'COST CENTER', value: d.raw.internal.costCenter || '—' },
          { label: 'BUDGET HEAD', value: d.raw.internal.budgetHead || '—' },
          { label: 'CONTACT PERSON', value: d.raw.internal.contactPerson || '—' },
          { label: 'EMAIL', value: d.raw.internal.email || '—' },
          { label: 'MOBILE', value: d.raw.internal.mobile || '—' }
        ].filter(f => f.value !== '—')
      });
    }

    return sections;
  }, [d]);

  const [activeSection, setActiveSection] = useState<number | null>(0);

  const InfoRow = ({ label, value, mono, highlight }: { label: string; value?: string | number | null; mono?: boolean; highlight?: boolean }) => {
    if (!value && value !== 0) return null;
    return (
      <div className="flex justify-between items-start gap-4">
        <span className="text-xs font-bold text-slate-400 uppercase tracking-wider">{label}</span>
        <span className={cn('text-xs font-black text-right', mono ? 'font-mono font-bold text-slate-700' : highlight ? 'font-extrabold text-red-600 tabular-nums' : 'text-slate-800')}>{value}</span>
      </div>
    );
  };

  const timelineSteps = [
    { label: 'Created', date: formatDateTime(d.updatedAt), active: true },
    { label: 'Submitted', date: 'Pending', active: false },
    { label: 'Approval Review', date: 'Pending', active: false },
    { label: 'Approved / Ordered', date: 'Pending', active: false },
  ];

  return (
    <div className="mx-auto max-w-[1600px] space-y-6 pb-8">
      {/* Breadcrumb Navigation */}
      <nav className="flex items-center gap-1.5 text-xs font-bold text-slate-500">
        <span className="hover:text-slate-800 cursor-pointer" onClick={onBack}>Procurement Drafts</span>
        <ChevronRight className="h-3 w-3" />
        <span className="hover:text-slate-800 cursor-pointer">{d.title}</span>
        <ChevronRight className="h-3 w-3" />
        <span className="text-[#12335f]">Details</span>
      </nav>

      {/* Page Header */}
      <section className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between border border-slate-100 rounded-3xl bg-white p-6 shadow-sm">
        <div className="space-y-1.5">
          <div className="flex flex-wrap items-center gap-3">
            <h1 className="text-xl md:text-2xl font-black tracking-tight text-slate-900 font-sans">
              {d.title}
            </h1>
            <span className="inline-flex items-center rounded-full px-3 py-1 text-xs font-extrabold tracking-wide border border-amber-200 bg-amber-50 text-amber-700">
              Draft
            </span>
            {d.isLocal ? (
              <span className="inline-flex items-center rounded-full px-3 py-1 text-xs font-extrabold tracking-wide border border-blue-200 bg-blue-50 text-blue-700">
                Local
              </span>
            ) : (
              <span className="inline-flex items-center rounded-full px-3 py-1 text-xs font-extrabold tracking-wide border border-emerald-200 bg-emerald-50 text-emerald-700">
                Server Draft
              </span>
            )}
          </div>
          <p className="text-sm font-semibold text-slate-500">
            <span className="font-mono font-bold text-slate-600">{d.isLocal ? 'Local Browser Cache' : `Draft #D-${d.id}`}</span>
            <span className="mx-2">•</span>
            Last updated {formatDateTime(d.updatedAt)}
          </p>
        </div>

        {/* Action Buttons */}
        <div className="flex flex-wrap items-center gap-2">
          <Button
            type="button"
            variant="outline"
            onClick={onBack}
            className="h-10 rounded-xl border-slate-200 text-xs font-black uppercase text-slate-700 hover:bg-slate-50 cursor-pointer"
          >
            <ArrowLeft className="mr-2 h-4 w-4" /> Back to List
          </Button>
          <Button
            type="button"
            variant="outline"
            onClick={onDiscard}
            className="h-10 rounded-xl border-red-200 text-xs font-black uppercase text-red-600 hover:bg-red-50 cursor-pointer"
          >
            <Trash2 className="mr-2 h-4 w-4" /> Discard Draft
          </Button>
          <Button
            type="button"
            onClick={onContinue}
            className="h-10 bg-[#12335f] text-xs font-black uppercase text-white rounded-xl shadow-sm hover:bg-[#0b2445] cursor-pointer font-extrabold"
          >
            Continue Draft <ArrowRight className="ml-2 h-4 w-4" />
          </Button>
        </div>
      </section>

      {/* Timeline Section */}
      <section className="border border-slate-100 rounded-3xl bg-white p-6 shadow-sm overflow-x-auto">
        <div className="min-w-[700px] flex items-center justify-between relative px-6 py-4">
          <div className="absolute top-[38px] left-[50px] right-[50px] h-[3px] bg-slate-100 -z-0" />

          {timelineSteps.map((step, idx) => (
            <div key={idx} className="flex flex-col items-center gap-3 relative z-10 w-28 text-center">
              <div
                className={cn(
                  'flex h-9 w-9 items-center justify-center rounded-full border-2 transition-all duration-300',
                  step.active
                    ? 'bg-[#12335f] border-[#12335f] text-white shadow-md shadow-blue-100'
                    : 'bg-white border-slate-200 text-slate-400'
                )}
              >
                {step.active ? (
                  <Check className="h-4 w-4 stroke-[3]" />
                ) : (
                  <div className="h-2 w-2 rounded-full bg-slate-200" />
                )}
              </div>
              <div className="space-y-1">
                <p className={cn('text-xs font-black tracking-tight', step.active ? 'text-[#12335f]' : 'text-slate-800')}>
                  {step.label}
                </p>
                <p className="text-[10px] font-semibold text-slate-500">{step.date}</p>
              </div>
            </div>
          ))}
        </div>
      </section>

      {/* Main Details Grid */}
      <div className="grid gap-6 lg:grid-cols-[1fr_1.1fr_0.9fr]">
        {/* COLUMN 1: Overview */}
        <section className="border border-slate-100 rounded-3xl bg-white p-6 shadow-sm flex flex-col justify-between">
          <div>
            <h2 className="text-base font-black text-slate-900 pb-3 border-b border-slate-100">
              Procurement Overview
            </h2>
            <div className="mt-4 space-y-4">
              <InfoRow label="Estimated Value" value={d.estimatedValue ? formatCurrency(d.estimatedValue) : undefined} />
              <InfoRow label="Type" value="Draft" />
              <InfoRow label="Reference Number" value={d.isLocal ? 'Local Draft' : `Draft #D-${d.id}`} mono />
              <InfoRow label="Method" value={(METHOD_CONFIGS_MAP[d.methodSlug] || { title: d.methodSlug }).title} />
              <InfoRow label="Category" value={d.categoryName} />
              <InfoRow label="Delivery Location" value={d.deliveryLocation} />
              {d.quantity && <InfoRow label="Quantity" value={d.unit ? `${d.quantity} ${d.unit}` : d.quantity} />}
              <InfoRow label="Last Updated" value={formatDateTime(d.updatedAt)} />
            </div>
          </div>
        </section>

        {/* COLUMN 2: Scope & Items */}
        <div className="space-y-6 flex flex-col">
          <section className="border border-slate-100 rounded-3xl bg-white p-6 shadow-sm space-y-4">
            <h2 className="text-base font-black text-slate-900 pb-3 border-b border-slate-100">
              Scope & Description
            </h2>
            {d.specifications ? (
              <p className="text-xs font-semibold leading-relaxed text-slate-600 whitespace-pre-wrap break-words">
                {d.specifications}
              </p>
            ) : (
              <p className="text-xs font-semibold text-slate-400 italic">No specifications provided.</p>
            )}

            <div className="grid grid-cols-2 gap-3 pt-2">
              <div className="rounded-2xl bg-purple-50/40 border border-purple-100 p-4 text-left">
                <span className="text-[10px] font-extrabold uppercase tracking-wider text-purple-700">Documents</span>
                <p className="mt-1.5 text-lg font-black text-purple-900 tabular-nums">{documents.length}</p>
              </div>
              <div className="rounded-2xl bg-amber-50/40 border border-amber-100 p-4 text-left">
                <span className="text-[10px] font-extrabold uppercase tracking-wider text-amber-700">Line Items</span>
                <p className="mt-1.5 text-lg font-black text-amber-900 tabular-nums">{items.length}</p>
              </div>
            </div>
          </section>

          {/* Items Table */}
          {items.length > 0 && (
            <section className="border border-slate-100 rounded-3xl bg-white p-6 shadow-sm">
              <h2 className="text-base font-black text-slate-900 pb-3 border-b border-slate-100">
                Items & Specifications
              </h2>
              <div className="mt-4 overflow-hidden border border-slate-200 rounded-xl bg-white shadow-sm">
                <table className="w-full text-left border-collapse">
                  <thead className="bg-slate-50 border-b border-slate-200">
                    <tr>
                      <th className="px-4 py-2.5 text-[10px] font-black uppercase text-slate-500">Item Name</th>
                      <th className="px-4 py-2.5 text-[10px] font-black uppercase text-slate-500 w-20 text-right">Qty</th>
                      <th className="px-4 py-2.5 text-[10px] font-black uppercase text-slate-500 w-20">Unit</th>
                      <th className="px-4 py-2.5 text-[10px] font-black uppercase text-slate-500">Description</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {items.map((item, idx) => (
                      <tr key={idx} className="hover:bg-slate-50/30 transition-colors">
                        <td className="px-4 py-3 text-xs font-bold text-slate-900">{item.itemName}</td>
                        <td className="px-4 py-3 text-xs font-bold text-slate-900 text-right tabular-nums">{item.quantity}</td>
                        <td className="px-4 py-3 text-xs font-bold text-slate-500">{item.unitOfMeasure}</td>
                        <td className="px-4 py-3 text-xs font-medium text-slate-500 break-words max-w-xs">{item.description || '—'}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </section>
          )}
        </div>

        {/* COLUMN 3: Org & Attachments */}
        <div className="space-y-6 flex flex-col">
          <section className="border border-slate-100 rounded-3xl bg-white p-6 shadow-sm">
            <h2 className="text-base font-black text-slate-900 pb-3 border-b border-slate-100">
              Organization
            </h2>
            <div className="mt-4 space-y-3">
              <div className="flex items-center gap-3">
                <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-[#12335f]/10 text-[#12335f]">
                  <Building2 className="h-5 w-5" />
                </div>
                <div>
                  <p className="text-sm font-black text-slate-900">{orgName}</p>
                  <p className="text-[10px] font-semibold text-slate-500 uppercase tracking-wider">Procuring Entity</p>
                </div>
              </div>
            </div>
          </section>

          {documents.length > 0 && (
            <section className="border border-slate-100 rounded-3xl bg-white p-6 shadow-sm">
              <h2 className="text-base font-black text-slate-900 pb-3 border-b border-slate-100">
                Attachments
              </h2>
              <div className="mt-4 space-y-2">
                {documents.map((doc, idx) => (
                  <div
                    key={idx}
                    className="flex items-center justify-between p-3 rounded-xl border border-slate-200 bg-slate-50/50 hover:bg-slate-100 hover:border-slate-300 transition-all text-xs font-bold text-[#12335f] group text-left w-full"
                  >
                    <div className="flex items-center gap-2.5 min-w-0">
                      <div className="flex h-7 w-7 shrink-0 items-center justify-center rounded-lg bg-blue-50 text-[#12335f] group-hover:bg-[#12335f] group-hover:text-white transition-all">
                        <FileText className="h-3.5 w-3.5" />
                      </div>
                      <div className="min-w-0">
                        <p className="truncate text-slate-700 font-bold">{doc.fileName}</p>
                        <p className="text-[9px] font-semibold text-slate-400 uppercase tracking-wider mt-0.5">{doc.documentType || 'General'}</p>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </section>
          )}

          {/* Accordion Sections */}
          {detailSections.length > 0 && (
            <section className="border border-slate-100 rounded-3xl bg-white p-6 shadow-sm space-y-4">
              <h2 className="text-base font-black text-slate-900 pb-3 border-b border-slate-100 flex items-center justify-between">
                <span>Additional Details</span>
                <span className="text-[10px] font-black uppercase bg-[#12335f]/5 text-[#12335f] px-2.5 py-1 rounded-full border border-[#12335f]/10">
                  {detailSections.length} {detailSections.length === 1 ? 'Section' : 'Sections'}
                </span>
              </h2>
              <div className="space-y-2.5">
                {detailSections.map((section, idx) => {
                  const isOpen = activeSection === idx;
                  const SectionIcon = getSectionIcon(section.title);
                  return (
                    <div
                      key={idx}
                      className="overflow-hidden rounded-2xl border border-slate-100 bg-slate-50/30 transition-all"
                    >
                      <button
                        type="button"
                        onClick={() => setActiveSection(isOpen ? null : idx)}
                        className="flex w-full items-center justify-between p-4 text-left transition-colors hover:bg-slate-50"
                      >
                        <div className="flex items-center gap-3">
                          <div className={cn(
                            'flex h-7 w-7 items-center justify-center rounded-lg border transition-colors',
                            isOpen ? 'bg-[#12335f] border-[#12335f] text-white' : 'bg-white border-slate-200 text-slate-500'
                          )}>
                            <SectionIcon className="h-3.5 w-3.5" />
                          </div>
                          <span className="text-xs font-black tracking-tight text-slate-800">{section.title}</span>
                        </div>
                        <span className={cn('text-lg font-black transition-transform duration-200 text-slate-400', isOpen && 'rotate-180')}>
                          ▼
                        </span>
                      </button>
                      {isOpen && (
                        <div className="border-t border-slate-100 bg-white p-4 space-y-3">
                          {section.fields.map((f, fIdx) => (
                            <div key={fIdx} className="space-y-1">
                              <p className="text-[9px] font-black uppercase tracking-wider text-slate-400">{f.label}</p>
                              <p className="text-xs font-bold text-slate-700 whitespace-pre-wrap break-words leading-relaxed">{f.value || '—'}</p>
                            </div>
                          ))}
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            </section>
          )}
        </div>
      </div>
    </div>
  );
}
