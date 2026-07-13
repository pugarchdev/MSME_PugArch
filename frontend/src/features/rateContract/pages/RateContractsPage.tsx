'use client';
import { useMemo, useState, useEffect, useCallback, type FC } from 'react';
import { useRouter } from 'next/navigation';
import {
  FileText, RefreshCw, Search, Calendar, MapPin, Truck,
  IndianRupee, Eye, ArrowUpRight, Plus, X, AlertCircle,
  Building2, User, ShieldCheck, Clock, ChevronRight,
  CheckCircle2, XCircle, Download, Filter, BarChart3
} from 'lucide-react';
import { Card, CardContent, Badge } from '../../../components/ui/card';
import { Button } from '../../../components/ui/button';
import { Input } from '../../../components/ui/input';
import { Pagination } from '../../shared/Pagination';
import { PageToolbar } from '../../shared/PageToolbar';
import { ViewModeToggle } from '../../shared/ViewModeToggle';
import { useResponsiveViewMode } from '../../shared/hooks';
import { ListSkeleton } from '../../../components/ui/skeleton';
import { EmptyState, InlineError } from '../../shared/FeatureStates';
import { useAuth } from '../../../hooks/useAuth';
import { useDebounce } from '../../../hooks/useDebounce';
import { formatCurrency, formatDateTime, formatDate, formatRelative } from '../../shared/format';
import { runWithToast } from '../../../lib/toast';
import { cn } from '../../../lib/utils';
import { api } from '../../../lib/api';
import { toast } from 'sonner';
import { fetchRateContracts, fetchRateContractDetail, createCallOffOrder } from '../api';
import type { RateContractDto, RateContractMetadata } from '../api';

type Tab = 'ACTIVE' | 'EXPIRED';

const TAB_META: Record<Tab, { label: string; accent: string }> = {
  ACTIVE: { label: 'Active Contracts', accent: 'border-emerald-200 bg-emerald-50 text-emerald-700' },
  EXPIRED: { label: 'Expired Contracts', accent: 'border-slate-200 bg-slate-100 text-slate-500' },
};

function ProgressBar({ current, max }: { current: number; max: number }) {
  const pct = max > 0 ? Math.min(100, (current / max) * 100) : 0;
  const color = pct >= 90 ? 'bg-red-500' : pct >= 70 ? 'bg-amber-500' : 'bg-emerald-500';
  return (
    <div className="flex items-center gap-2">
      <div className="h-2 flex-1 rounded-full bg-slate-200 overflow-hidden">
        <div className={cn('h-full rounded-full transition-all duration-500', color)} style={{ width: `${pct}%` }} />
      </div>
      <span className="text-[10px] font-bold text-slate-500 tabular-nums w-16 text-right">{pct.toFixed(0)}%</span>
    </div>
  );
}

const calcUtilization = (contract: RateContractDto) => {
  const totalVal = Number(contract.value) || 0;
  const orders = contract.purchaseOrders || [];
  const spent = orders.reduce((s, po) => s + Number(po.totalValue || po.amount || 0), 0);
  return { totalVal, spent, remaining: Math.max(0, totalVal - spent) };
};

export default function RateContractsPage() {
  const { user } = useAuth();
  const router = useRouter();
  const [tab, setTab] = useState<Tab>('ACTIVE');
  const [q, setQ] = useState('');
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(10);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [contracts, setContracts] = useState<RateContractDto[]>([]);
  const [total, setTotal] = useState(0);
  const debouncedQ = useDebounce(q, 300);

  // detail modal state
  const [detailContract, setDetailContract] = useState<RateContractDto | null>(null);
  const [detailLoading, setDetailLoading] = useState(false);

  // call-off PO modal state
  const [showPoModal, setShowPoModal] = useState(false);
  const [poContract, setPoContract] = useState<RateContractDto | null>(null);
  const [poSellerId, setPoSellerId] = useState<number>(0);
  const [poDeliveryAddress, setPoDeliveryAddress] = useState('');
  const [poExpectedDelivery, setPoExpectedDelivery] = useState('');
  const [poSubmitting, setPoSubmitting] = useState(false);
  const [poItems, setPoItems] = useState<Array<{ itemName: string; quantity: number; unitOfMeasure: string; unitPrice: number; taxRate: number }>>([]);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const data = await fetchRateContracts({ contractState: tab, q: debouncedQ || undefined, page, pageSize });
      setContracts(data.rateContracts || []);
      setTotal(data.total || 0);
    } catch (e: any) {
      setError(e?.message || 'Failed to load rate contracts');
    } finally {
      setLoading(false);
    }
  }, [tab, debouncedQ, page, pageSize]);

  useEffect(() => { load(); }, [load]);

  // open detail modal
  const openDetail = async (c: RateContractDto) => {
    setDetailLoading(true);
    setDetailContract(null);
    try {
      const full = await fetchRateContractDetail(c.id);
      setDetailContract(full);
    } catch (e: any) {
      toast.error(e?.message || 'Failed to load contract details');
      setDetailContract(c);
    } finally {
      setDetailLoading(false);
    }
  };

  // stats
  const stats = useMemo(() => {
    const totalValue = contracts.reduce((s, c) => s + Number(c.value || 0), 0);
    const supplierSet = new Set<number>();
    contracts.forEach(c => {
      (c.metadata as any)?.selectedSuppliers?.forEach((s: any) => {
        if (s.supplierUserId) supplierSet.add(Number(s.supplierUserId));
      });
    });
    return { totalValue, supplierCount: supplierSet.size };
  }, [contracts]);

  // open call-off PO modal
  const openPoModal = async (c: RateContractDto) => {
    let full = c;
    if (!c.purchaseOrders) {
      try { full = await fetchRateContractDetail(c.id); } catch { /* use partial */ }
    }
    setPoContract(full);
    const meta = (full.metadata || {}) as RateContractMetadata;
    const first = meta.selectedSuppliers?.[0];
    setPoSellerId(first?.supplierUserId || 0);
    setPoDeliveryAddress('');
    setPoExpectedDelivery('');
    const items = (meta.itemRateSchedule || []).map(item => ({
      itemName: item.itemName || '',
      quantity: 0,
      unitOfMeasure: item.unitOfMeasure || 'Nos',
      unitPrice: Number(item.baseRate || 0),
      taxRate: Number(item.gst || 0),
    }));
    setPoItems(items);
    setShowPoModal(true);
  };

  const submitCallOff = async () => {
    if (!poContract || poSellerId <= 0 || !poDeliveryAddress.trim() || poItems.length === 0) {
      toast.error('Fill all required fields');
      return;
    }
    const validItems = poItems.filter(i => i.quantity > 0 && i.itemName.trim());
    if (validItems.length === 0) {
      toast.error('At least one item with quantity > 0 required');
      return;
    }
    setPoSubmitting(true);
    try {
      await runWithToast(
        () => createCallOffOrder(poContract.id, {
          sellerId: poSellerId,
          deliveryAddress: poDeliveryAddress.trim(),
          expectedDelivery: poExpectedDelivery || undefined,
          items: validItems,
        }),
        { success: 'Call-off order created successfully', error: 'Failed to create call-off order' }
      );
      setShowPoModal(false);
      load();
    } finally {
      setPoSubmitting(false);
    }
  };

  return (
    <div className="mx-auto max-w-[1560px] space-y-6 px-4 pb-10 sm:px-6 lg:px-8">
      {/* Header */}
      <div className="relative overflow-hidden border border-white/10 bg-[radial-gradient(circle_at_20%_20%,#24457c_0,#0b132b_42%,#081327_100%)] p-7 text-white shadow-[0_18px_55px_rgba(15,23,42,0.18)] rounded-[28px]">
        <div className="absolute right-[-10%] top-[-20%] h-96 w-96 rounded-full bg-blue-600/15 blur-[100px] pointer-events-none" />
        <div className="relative z-10">
          <span className="inline-flex items-center gap-1.5 rounded-full bg-white/10 border border-white/10 px-3 py-1 text-[9px] font-black uppercase tracking-widest text-[#a5c2f4] mb-2">
            <ShieldCheck className="h-3 w-3" />
            Rate Contracts
          </span>
          <h1 className="text-3xl font-black tracking-tight text-white">Rate Contract Management</h1>
          <p className="mt-2 text-xs text-slate-300 font-semibold">
            Manage rate agreements, track utilization, and create call-off purchase orders against active contracts.
          </p>
        </div>
      </div>

      {/* Tabs */}
      <div className="flex items-center gap-2 border-b border-slate-200 pb-2">
        {(Object.entries(TAB_META) as [Tab, typeof TAB_META[Tab]][]).map(([key, meta]) => (
          <button
            key={key}
            onClick={() => { setTab(key); setPage(1); }}
            className={cn(
              'px-4 py-2 text-xs font-bold uppercase tracking-wider rounded-t-lg transition-all',
              tab === key
                ? 'bg-white text-[#12335f] border-b-2 border-[#12335f] shadow-sm'
                : 'text-slate-400 hover:text-slate-700'
            )}
          >
            {meta.label}
          </button>
        ))}
        <div className="ml-auto flex items-center gap-2">
          <Button variant="ghost" size="sm" onClick={load} className="h-8 text-[10px] font-bold uppercase tracking-wider">
            <RefreshCw className="h-3 w-3 mr-1" /> Refresh
          </Button>
        </div>
      </div>

      {/* Search */}
      <div className="relative max-w-md">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-400" />
        <Input
          value={q}
          onChange={e => { setQ(e.target.value); setPage(1); }}
          placeholder="Search by contract number or title..."
          className="h-10 rounded-xl border-slate-200 pl-10 text-xs font-medium"
        />
      </div>

      {/* Stats */}
      {!loading && contracts.length > 0 && (
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
          <Card className="rounded-2xl border-0 bg-white shadow-sm ring-1 ring-slate-200/70">
            <CardContent className="p-4">
              <p className="text-[10px] font-black uppercase tracking-widest text-slate-400">Total Value</p>
              <p className="mt-1 text-lg font-black text-slate-900 tabular-nums">{formatCurrency(stats.totalValue)}</p>
            </CardContent>
          </Card>
          <Card className="rounded-2xl border-0 bg-white shadow-sm ring-1 ring-slate-200/70">
            <CardContent className="p-4">
              <p className="text-[10px] font-black uppercase tracking-widest text-slate-400">Contracts</p>
              <p className="mt-1 text-lg font-black text-slate-900 tabular-nums">{total}</p>
            </CardContent>
          </Card>
          <Card className="rounded-2xl border-0 bg-white shadow-sm ring-1 ring-slate-200/70">
            <CardContent className="p-4">
              <p className="text-[10px] font-black uppercase tracking-widest text-slate-400">Suppliers</p>
              <p className="mt-1 text-lg font-black text-slate-900 tabular-nums">{stats.supplierCount}</p>
            </CardContent>
          </Card>
        </div>
      )}

      {/* Contract List */}
      {loading ? (
        <ListSkeleton rows={4} />
      ) : error ? (
        <InlineError message={error} onRetry={load} />
      ) : contracts.length === 0 ? (
        <EmptyState
          title={tab === 'ACTIVE' ? 'No Active Rate Contracts' : 'No Expired Rate Contracts'}
          description="Rate contracts are created automatically when a procurement is submitted with the Rate Contract method."
        />
      ) : (
        <div className="space-y-3">
          {contracts.map(contract => {
            const meta = (contract.metadata || {}) as RateContractMetadata;
            const suppliers = meta.selectedSuppliers || [];
            const itemCount = meta.itemRateSchedule?.length || 0;
            const activeStatus = contract.status === 'ACTIVE' && (!contract.endDate || new Date(contract.endDate) >= new Date());
            return (
              <Card key={contract.id} className="group rounded-2xl border-0 bg-white shadow-sm ring-1 ring-slate-200/70 transition-all hover:shadow-md">
                <CardContent className="p-5">
                  <div className="flex items-start justify-between gap-4">
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-2">
                        <ShieldCheck className="h-4 w-4 text-teal-600 shrink-0" />
                        <span className="text-[10px] font-bold text-teal-600 uppercase tracking-wider">{contract.contractNumber}</span>
                        <span className={cn(
                          'px-2 py-0.5 rounded text-[9px] font-bold uppercase',
                          activeStatus ? 'bg-emerald-100 text-emerald-700' : 'bg-slate-100 text-slate-500'
                        )}>
                          {activeStatus ? 'Active' : 'Expired'}
                        </span>
                      </div>
                      <h3 className="mt-1 text-sm font-bold text-slate-900 truncate">{contract.title}</h3>
                      <div className="mt-2 flex flex-wrap items-center gap-x-4 gap-y-1 text-[10px] font-semibold text-slate-500">
                        <span className="flex items-center gap-1"><Calendar className="h-3 w-3" />{formatDate(contract.startDate)} – {formatDate(contract.endDate)}</span>
                        <span className="flex items-center gap-1"><IndianRupee className="h-3 w-3" />{formatCurrency(contract.value)}</span>
                        <span className="flex items-center gap-1"><FileText className="h-3 w-3" />{itemCount} items</span>
                        <span className="flex items-center gap-1"><User className="h-3 w-3" />{suppliers.length} supplier(s)</span>
                      </div>
                    </div>
                    <div className="flex items-center gap-2 shrink-0">
                      <Button variant="ghost" size="sm" onClick={() => openDetail(contract)}
                        className="h-8 rounded-full px-3 text-[10px] font-bold uppercase">
                        <Eye className="h-3.5 w-3.5 mr-1" /> View
                      </Button>
                      {activeStatus && (
                        <Button size="sm" onClick={() => openPoModal(contract)}
                          className="h-8 rounded-full bg-[#12335f] px-3 text-[10px] font-bold uppercase text-white hover:bg-[#1a4a7a]">
                          <Plus className="h-3.5 w-3.5 mr-1" /> Call-off PO
                        </Button>
                      )}
                    </div>
                  </div>
                </CardContent>
              </Card>
            );
          })}
          <Pagination page={page} pageSize={pageSize} total={total} onPageChange={setPage} onPageSizeChange={setPageSize} />
        </div>
      )}

      {/* Detail Modal */}
      {detailContract && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4" onClick={() => setDetailContract(null)}>
          <div className="relative max-h-[90vh] w-full max-w-3xl overflow-y-auto rounded-3xl bg-white p-6 shadow-2xl" onClick={e => e.stopPropagation()}>
            <button onClick={() => setDetailContract(null)} className="absolute right-4 top-4 rounded-full p-1 text-slate-400 hover:bg-slate-100">
              <X className="h-5 w-5" />
            </button>
            {detailLoading ? (
              <div className="flex items-center justify-center py-20"><span className="animate-spin h-8 w-8 border-2 border-[#12335f] border-t-transparent rounded-full" /></div>
            ) : (
              <>
                <div className="flex items-center gap-2 mb-4">
                  <ShieldCheck className="h-5 w-5 text-teal-600" />
                  <span className="text-sm font-bold text-teal-600">{detailContract.contractNumber}</span>
                  <span className={cn(
                    'px-2 py-0.5 rounded text-[10px] font-bold uppercase',
                    detailContract.status === 'ACTIVE' ? 'bg-emerald-100 text-emerald-700' : 'bg-slate-100 text-slate-500'
                  )}>{detailContract.status}</span>
                </div>
                <h2 className="text-xl font-black text-slate-900 mb-1">{detailContract.title}</h2>
                <div className="flex flex-wrap gap-x-4 gap-y-1 text-xs text-slate-500 mb-4">
                  <span>Value: <strong>{formatCurrency(detailContract.value)}</strong></span>
                  <span>Currency: <strong>{detailContract.currency}</strong></span>
                  <span>Period: <strong>{formatDate(detailContract.startDate)} – {formatDate(detailContract.endDate)}</strong></span>
                </div>

                {(() => {
                  const meta = (detailContract.metadata || {}) as RateContractMetadata;
                  const util = calcUtilization(detailContract);
                  return (
                    <div className="space-y-5">
                      {/* Utilization */}
                      <Card className="rounded-2xl border-0 bg-slate-50">
                        <CardContent className="p-4">
                          <p className="text-[10px] font-black uppercase tracking-widest text-slate-500 mb-2">Utilization</p>
                          <div className="grid grid-cols-3 gap-4 mb-3">
                            <div><span className="text-[10px] text-slate-400">Contract Value</span><p className="font-bold text-slate-900">{formatCurrency(util.totalVal)}</p></div>
                            <div><span className="text-[10px] text-slate-400">Spent</span><p className="font-bold text-slate-900">{formatCurrency(util.spent)}</p></div>
                            <div><span className="text-[10px] text-slate-400">Remaining</span><p className="font-bold text-emerald-600">{formatCurrency(util.remaining)}</p></div>
                          </div>
                          <ProgressBar current={util.spent} max={util.totalVal} />
                        </CardContent>
                      </Card>

                      {/* Item Rate Schedule */}
                      {meta.itemRateSchedule && meta.itemRateSchedule.length > 0 && (
                        <div>
                          <h4 className="text-[10px] font-black uppercase tracking-widest text-slate-500 mb-2">Item Rate Schedule</h4>
                          <div className="overflow-x-auto rounded-xl border border-slate-200">
                            <table className="w-full text-left text-xs">
                              <thead className="bg-slate-50">
                                <tr>
                                  <th className="px-3 py-2 font-bold text-slate-500">Item</th>
                                  <th className="px-3 py-2 font-bold text-slate-500">UOM</th>
                                  <th className="px-3 py-2 font-bold text-slate-500">Base Rate</th>
                                  <th className="px-3 py-2 font-bold text-slate-500">Discount</th>
                                  <th className="px-3 py-2 font-bold text-slate-500">GST</th>
                                  <th className="px-3 py-2 font-bold text-slate-500">Est. Qty</th>
                                </tr>
                              </thead>
                              <tbody className="divide-y divide-slate-100">
                                {meta.itemRateSchedule.map((item, idx) => (
                                  <tr key={item.id || idx} className="hover:bg-slate-50">
                                    <td className="px-3 py-2 font-semibold text-slate-900">{item.itemName}</td>
                                    <td className="px-3 py-2 text-slate-500">{item.unitOfMeasure}</td>
                                    <td className="px-3 py-2 font-bold tabular-nums">{formatCurrency(item.baseRate)}</td>
                                    <td className="px-3 py-2">{item.discount}%</td>
                                    <td className="px-3 py-2">{item.gst}%</td>
                                    <td className="px-3 py-2 tabular-nums">{item.estimatedAnnualQuantity}</td>
                                  </tr>
                                ))}
                              </tbody>
                            </table>
                          </div>
                        </div>
                      )}

                      {/* Suppliers */}
                      {meta.selectedSuppliers && meta.selectedSuppliers.length > 0 && (
                        <div>
                          <h4 className="text-[10px] font-black uppercase tracking-widest text-slate-500 mb-2">Suppliers ({meta.selectedSuppliers.length})</h4>
                          <div className="flex flex-wrap gap-2">
                            {meta.selectedSuppliers.map((s, idx) => (
                              <span key={idx} className="inline-flex items-center gap-1.5 rounded-full bg-slate-100 px-3 py-1.5 text-xs font-semibold text-slate-700">
                                <Building2 className="h-3 w-3 text-slate-400" />
                                {s.supplierBusinessName || s.supplierName || `Supplier #${s.supplierUserId}`}
                              </span>
                            ))}
                          </div>
                        </div>
                      )}

                      {/* Purchase Orders */}
                      {detailContract.purchaseOrders && detailContract.purchaseOrders.length > 0 && (
                        <div>
                          <h4 className="text-[10px] font-black uppercase tracking-widest text-slate-500 mb-2">Call-off Orders ({detailContract.purchaseOrders.length})</h4>
                          <div className="space-y-2">
                            {detailContract.purchaseOrders.map(po => (
                              <Card key={po.id} className="rounded-xl border border-slate-100 bg-white">
                                <CardContent className="p-3">
                                  <div className="flex items-center justify-between">
                                    <div>
                                      <span className="text-xs font-bold text-slate-900">{po.poNumber}</span>
                                      <span className="ml-2 text-[10px] text-slate-500">{formatDateTime(po.createdAt)}</span>
                                      <span className={cn(
                                        'ml-2 px-1.5 py-0.5 rounded text-[9px] font-bold uppercase',
                                        po.status === 'delivered' ? 'bg-emerald-100 text-emerald-700' :
                                        po.status === 'shipped' ? 'bg-blue-100 text-blue-700' :
                                        po.status === 'confirmed' || po.status === 'accepted' ? 'bg-teal-100 text-teal-700' :
                                        'bg-amber-100 text-amber-700'
                                      )}>{po.status || 'pending'}</span>
                                    </div>
                                    <span className="text-xs font-bold text-slate-900 tabular-nums">{formatCurrency(po.totalValue || po.amount)}</span>
                                  </div>
                                  {po.deliveryAddress && (
                                    <p className="mt-1 text-[10px] text-slate-500 flex items-center gap-1">
                                      <MapPin className="h-3 w-3" />{po.deliveryAddress}
                                    </p>
                                  )}
                                </CardContent>
                              </Card>
                            ))}
                          </div>
                        </div>
                      )}

                      {/* Call-off Button */}
                      {detailContract.status === 'ACTIVE' && (
                        <Button onClick={() => { setDetailContract(null); openPoModal(detailContract); }}
                          className="w-full rounded-xl bg-[#12335f] text-xs font-bold uppercase text-white hover:bg-[#1a4a7a]">
                          <Plus className="h-4 w-4 mr-1.5" /> Create Call-off Order
                        </Button>
                      )}
                    </div>
                  );
                })()}
              </>
            )}
          </div>
        </div>
      )}

      {/* Call-off PO Modal */}
      {showPoModal && poContract && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4" onClick={() => setShowPoModal(false)}>
          <div className="relative max-h-[90vh] w-full max-w-2xl overflow-y-auto rounded-3xl bg-white p-6 shadow-2xl" onClick={e => e.stopPropagation()}>
            <button onClick={() => setShowPoModal(false)} className="absolute right-4 top-4 rounded-full p-1 text-slate-400 hover:bg-slate-100">
              <X className="h-5 w-5" />
            </button>
            <h2 className="text-lg font-black text-slate-900 mb-4">Create Call-off Order</h2>
            <p className="text-xs text-slate-500 mb-4">Against contract: <strong>{poContract.contractNumber}</strong> — {poContract.title}</p>

            <div className="space-y-4">
              {/* Supplier Selection */}
              <div>
                <label className="text-[10px] font-bold uppercase tracking-wider text-slate-500">Supplier</label>
                <select value={poSellerId} onChange={e => setPoSellerId(Number(e.target.value))}
                  className="mt-1 block w-full rounded-xl border border-slate-200 bg-white px-3 py-2.5 text-xs font-medium text-slate-900">
                  {((poContract.metadata as any)?.selectedSuppliers || []).map((s: any, idx: number) => (
                    <option key={idx} value={s.supplierUserId}>{s.supplierBusinessName || s.supplierName || `Supplier #${s.supplierUserId}`}</option>
                  ))}
                </select>
              </div>

              {/* Delivery Info */}
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="text-[10px] font-bold uppercase tracking-wider text-slate-500">Delivery Address *</label>
                  <textarea value={poDeliveryAddress} onChange={e => setPoDeliveryAddress(e.target.value)}
                    className="mt-1 block w-full rounded-xl border border-slate-200 px-3 py-2.5 text-xs font-medium min-h-[60px]" />
                </div>
                <div>
                  <label className="text-[10px] font-bold uppercase tracking-wider text-slate-500">Expected Delivery</label>
                  <input type="date" value={poExpectedDelivery} onChange={e => setPoExpectedDelivery(e.target.value)}
                    className="mt-1 block w-full rounded-xl border border-slate-200 px-3 py-2.5 text-xs font-medium" />
                </div>
              </div>

              {/* Items */}
              <div>
                <div className="flex items-center justify-between mb-2">
                  <label className="text-[10px] font-bold uppercase tracking-wider text-slate-500">Order Items</label>
                  <span className="text-[9px] text-slate-400">Set quantity {'>'} 0 for items to include</span>
                </div>
                <div className="space-y-2 max-h-60 overflow-y-auto">
                  {poItems.map((item, idx) => (
                    <div key={idx} className="flex items-center gap-2 rounded-xl border border-slate-200 bg-slate-50/50 p-2.5">
                      <div className="min-w-0 flex-1">
                        <p className="text-xs font-semibold text-slate-900 truncate">{item.itemName}</p>
                        <p className="text-[10px] text-slate-500">{item.unitOfMeasure} @ {formatCurrency(item.unitPrice)}</p>
                      </div>
                      <input type="number" min={0} value={item.quantity || ''}
                        onChange={e => {
                          const nv = [...poItems];
                          nv[idx] = { ...nv[idx], quantity: Number(e.target.value) || 0 };
                          setPoItems(nv);
                        }}
                        placeholder="Qty"
                        className="w-20 rounded-lg border border-slate-200 px-2 py-1.5 text-xs font-bold text-center tabular-nums" />
                    </div>
                  ))}
                </div>
              </div>

              {/* Summary */}
              {(() => {
                const sub = poItems.reduce((s, i) => s + i.quantity * i.unitPrice * (1 + i.taxRate / 100), 0);
                return (
                  <div className="rounded-xl bg-slate-50 p-3">
                    <div className="flex items-center justify-between">
                      <span className="text-[10px] font-bold uppercase tracking-wider text-slate-500">Estimated Total</span>
                      <span className="text-base font-black text-slate-900 tabular-nums">{formatCurrency(sub)}</span>
                    </div>
                  </div>
                );
              })()}

              <Button onClick={submitCallOff} disabled={poSubmitting || poSellerId <= 0 || !poDeliveryAddress.trim()}
                className="w-full rounded-xl bg-[#12335f] text-xs font-bold uppercase text-white hover:bg-[#1a4a7a]">
                {poSubmitting ? <span className="animate-spin h-4 w-4 border-2 border-white border-t-transparent rounded-full mr-2" /> : null}
                Create Call-off Order
              </Button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
