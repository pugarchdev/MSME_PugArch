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
    title: local.basics?.title || 'Untitled Local Draft',
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
    title: server.title || payload.basics?.title || 'Untitled Draft',
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
  const [selectedDraftId, setSelectedDraftId] = useState<string | number | undefined>(undefined);
  const [viewMode, setViewMode] = useResponsiveViewMode('procurement-drafts:view-mode');
  const [sortKey, setSortKey] = useState<SortKey>('updatedAt');
  const [sortDir, setSortDir] = useState<SortDir>('desc');

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

  const sortedDrafts = useMemo(() => {
    const sorted = [...allDrafts];
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
  }, [allDrafts, sortKey, sortDir]);

  /* ── Selection ── */
  useEffect(() => {
    if (allDrafts.length > 0 && selectedDraftId === undefined) {
      const d = allDrafts[0];
      setSelectedDraftId(d.isLocal ? 'local' : d.id);
    } else if (allDrafts.length === 0) {
      setSelectedDraftId(undefined);
    }
  }, [allDrafts, selectedDraftId]);

  const selectedDraft = useMemo(
    () => allDrafts.find(d => d.isLocal ? selectedDraftId === 'local' : selectedDraftId === d.id),
    [allDrafts, selectedDraftId]
  );

  /* ── Actions ── */
  const discardLocal = () => {
    if (!window.confirm('Discard the unsaved local procurement draft from this browser?')) return;
    procurementWizardApi.clearLocalDraft();
    setLocalDraft(null);
    setSelectedDraftId(undefined);
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
      setSelectedDraftId(undefined);
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
              onClick={() => router.push('/buyer/create-procurement')}
              className="h-10 rounded-md bg-[#12335f] text-xs font-black uppercase text-white hover:bg-[#0b2445]"
            >
              <Plus className="mr-2 h-4 w-4" /> Create Procurement
            </Button>
          </div>
        </div>
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
                      <th className="px-4 py-3 text-[10px] font-black uppercase tracking-wide text-slate-500">Source</th>
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
                      const key = d.isLocal ? 'local' : d.id;
                      return (
                        <tr
                          key={key}
                          className="cursor-pointer transition-colors hover:bg-slate-50/80"
                          onClick={() => setSelectedDraftId(d.isLocal ? 'local' : d.id)}
                        >
                          <td className="px-4 py-3 text-center text-xs font-bold text-slate-500">{idx + 1}</td>
                          <td className="max-w-[200px] truncate px-4 py-3 font-bold text-slate-900">
                            {d.title}
                            {!d.isLocal && (
                              <span className="ml-2 text-[10px] font-semibold text-slate-400">#{d.id}</span>
                            )}
                          </td>
                          <td className="px-4 py-3">{methodBadge(d.methodSlug)}</td>
                          <td className="px-4 py-3">{sourceBadge(d.isLocal)}</td>
                          <td className="px-4 py-3 text-slate-600">{d.categoryName || '-'}</td>
                          <td className="max-w-[140px] truncate px-4 py-3 text-slate-600">{d.productOrService || '-'}</td>
                          <td className="px-4 py-3 font-bold text-slate-900 tabular-nums">{formatCurrency(d.estimatedValue)}</td>
                          <td className="px-4 py-3 text-slate-600 tabular-nums">{[d.quantity, d.unit].filter(Boolean).join(' ') || '-'}</td>
                          <td className="whitespace-nowrap px-4 py-3 text-xs text-slate-500">{formatDateTime(d.updatedAt)}</td>
                          <td className="px-4 py-3">
                            <div className="flex items-center justify-end gap-1.5">
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
                  const isSelected = d.isLocal ? selectedDraftId === 'local' : selectedDraftId === d.id;
                  const method = METHOD_CONFIGS_MAP[d.methodSlug] || { title: d.methodSlug, accent: 'border-slate-200 bg-slate-50 text-slate-700' };
                  return (
                    <button
                      key={d.isLocal ? 'local' : d.id}
                      onClick={() => setSelectedDraftId(d.isLocal ? 'local' : d.id)}
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
    </div>
  );
}

/* ── Sub-components ── */

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
