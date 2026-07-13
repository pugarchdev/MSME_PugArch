import { useMemo, useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { toast } from 'sonner';
import {
  CheckCircle2,
  RotateCcw,
  FileText,
  Search,
  Calendar,
  MapPin,
  Truck,
  IndianRupee,
  RefreshCw,
  Eye,
  ArrowUp,
  ArrowDown,
  ArrowUpDown,
  XCircle,
  ShieldCheck,
  Filter
} from 'lucide-react';
import { Button } from '../components/ui/button';
import { Card, CardContent } from '../components/ui/card';
import { api } from '../lib/api';
import { cn } from '../lib/utils';
import { EmptyState, LoadingState } from '../features/shared/FeatureStates';
import { formatCurrency, formatDate } from '../features/shared/format';
import { useFeatureQuery, usePaginatedFeatureQuery, useResponsiveViewMode } from '../features/shared/hooks';
import { Pagination } from '../features/shared/Pagination';
import { ViewModeToggle } from '../features/shared/ViewModeToggle';
import { EntityIdLink } from '../features/shared/EntityIdLink';
import { useAuth } from '../hooks/useAuth';
import type { PurchaseOrderDto } from '../features/shared/types';

type StatusTab = 'Delivered' | 'All';

export default function RepeatOrders() {
  const { user } = useAuth();
  const router = useRouter();

  // Filters & UI state
  const [activeTab, setActiveTab] = useState<StatusTab>('Delivered');
  const [searchTerm, setSearchTerm] = useState('');
  const [debouncedSearch, setDebouncedSearch] = useState('');
  const [sortBy, setSortBy] = useState('newest');
  const [viewMode, setViewMode] = useResponsiveViewMode('repeat-orders:view-mode');
  const [showMobileFilters, setShowMobileFilters] = useState(false);

  // Repeat order modal
  const [repeatingOrder, setRepeatingOrder] = useState<PurchaseOrderDto | null>(null);
  const [quantity, setQuantity] = useState(1);
  const [deliveryAddress, setDeliveryAddress] = useState('');
  const [expectedDelivery, setExpectedDelivery] = useState('');
  const [submitting, setSubmitting] = useState(false);

  // Detail modal
  const [viewingOrder, setViewingOrder] = useState<PurchaseOrderDto | null>(null);

  useEffect(() => {
    const handler = setTimeout(() => setDebouncedSearch(searchTerm), 400);
    return () => clearTimeout(handler);
  }, [searchTerm]);

  const viewerScope = `${user?.role || 'buyer'}-${user?.id || 'none'}`;

  // Paginated query – only delivered orders for "Delivered" tab
  const {
    records: pagedOrders,
    loading,
    refreshing,
    error,
    reload,
    page,
    pageSize,
    total,
    setPage,
    setPageSize
  } = usePaginatedFeatureQuery<PurchaseOrderDto>(
    '/api/purchase-orders',
    {
      q: debouncedSearch,
      status: activeTab === 'Delivered' ? 'delivered' : undefined,
      sortBy,
      viewerScope
    },
    10
  );

  // All orders for KPI stats
  const { data: allOrders, reload: reloadAll } = useFeatureQuery<PurchaseOrderDto[]>(
    `/api/purchase-orders?take=500&viewerScope=${encodeURIComponent(viewerScope)}`,
    []
  );

  // KPI metrics computed from all orders
  const deliveredOrders = useMemo(
    () => allOrders.filter(o => String(o.status || '').toLowerCase() === 'delivered'),
    [allOrders]
  );
  const deliveredCount = deliveredOrders.length;
  const totalDeliveredValue = useMemo(
    () => deliveredOrders.reduce((s, o) => s + Number(o.amount || o.totalValue || 0), 0),
    [deliveredOrders]
  );
  const uniqueSuppliers = useMemo(
    () => new Set(deliveredOrders.map(o => o.sellerId).filter(Boolean)).size,
    [deliveredOrders]
  );
  const avgOrderValue = deliveredCount > 0 ? totalDeliveredValue / deliveredCount : 0;

  // Repeat modal handlers
  const handleOpenRepeatModal = (order: PurchaseOrderDto) => {
    setRepeatingOrder(order);
    const firstItem = order.items?.[0];
    const qty = firstItem ? Number(firstItem.quantity) : 1;
    setQuantity(qty || 1);
    setDeliveryAddress(order.deliveryAddress || '');
    const defaultDate = new Date();
    defaultDate.setDate(defaultDate.getDate() + 14);
    setExpectedDelivery(defaultDate.toISOString().split('T')[0]);
  };

  const handleCreateRepeatOrder = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!repeatingOrder) return;
    if (quantity <= 0) { toast.error('Quantity must be greater than zero'); return; }
    if (!deliveryAddress.trim()) { toast.error('Delivery Address is required'); return; }
    if (!expectedDelivery) { toast.error('Expected Delivery Date is required'); return; }

    setSubmitting(true);
    try {
      await api.post(`/api/purchase-orders/${repeatingOrder.id}/repeat`, {
        quantity,
        deliveryAddress: deliveryAddress.trim(),
        expectedDelivery: new Date(expectedDelivery).toISOString()
      });
      toast.success('Repeat purchase order placed successfully!');
      setRepeatingOrder(null);
      await Promise.all([reload(), reloadAll()]);
      router.push('/orders');
    } catch (err: any) {
      console.error(err);
      toast.error(err?.message || 'Failed to place repeat purchase order');
    } finally {
      setSubmitting(false);
    }
  };

  const refreshAll = async () => {
    await Promise.all([reload(), reloadAll()]);
  };

  // Sort header helper
  const toggleSort = (key: string) => {
    if (key === 'value') setSortBy(sortBy === 'value_low' ? 'value_high' : 'value_low');
    else if (key === 'title') setSortBy(sortBy === 'title_asc' ? 'title_desc' : 'title_asc');
    else if (key === 'party') setSortBy(sortBy === 'party_asc' ? 'party_desc' : 'party_asc');
    else if (key === 'updated') setSortBy(sortBy === 'updated_asc' ? 'updated_desc' : 'updated_asc');
  };

  const SortHeader = ({ label, columnKey, className = '' }: { label: string; columnKey: string; className?: string }) => {
    let isActive = false;
    let isAsc = true;
    if (columnKey === 'value') { isActive = sortBy === 'value_low' || sortBy === 'value_high'; isAsc = sortBy === 'value_low'; }
    else if (columnKey === 'title') { isActive = sortBy === 'title_asc' || sortBy === 'title_desc'; isAsc = sortBy === 'title_asc'; }
    else if (columnKey === 'party') { isActive = sortBy === 'party_asc' || sortBy === 'party_desc'; isAsc = sortBy === 'party_asc'; }
    else if (columnKey === 'updated') { isActive = sortBy === 'updated_asc' || sortBy === 'updated_desc'; isAsc = sortBy === 'updated_asc'; }
    return (
      <button type="button" onClick={() => toggleSort(columnKey)} className={cn("inline-flex items-center gap-1 text-[10px] font-black uppercase tracking-wider text-slate-500 hover:text-[#12335f] transition-colors", isActive && "text-[#12335f]", className)}>
        {label}
        {isActive ? (isAsc ? <ArrowUp className="h-3 w-3 text-[#12335f]" /> : <ArrowDown className="h-3 w-3 text-[#12335f]" />) : <ArrowUpDown className="h-3 w-3 opacity-40" />}
      </button>
    );
  };

  if (loading && pagedOrders.length === 0) return <LoadingState label="Loading repeat order history..." />;

  return (
    <div className="space-y-6">
      {/* Transparent Header */}
      <div className="flex flex-col gap-2 md:flex-row md:items-center md:justify-between py-2">
        <div className="min-w-0">
          <span className="text-[10px] font-black uppercase tracking-widest text-[#12335f] bg-[#12335f]/10 px-2.5 py-1 rounded-full">Procurement Fulfilment</span>
          <h1 className="text-3xl font-black tracking-tight text-slate-900 mt-2">Repeat Orders</h1>
          <p className="text-xs font-semibold text-slate-500 mt-1">Re-order materials and items from completed previous orders quickly.</p>
        </div>
        <div className="flex items-center gap-2">
          <Button variant="outline" onClick={refreshAll} className="h-10 rounded-lg text-xs font-black uppercase bg-white hover:bg-slate-50 border-slate-200 shadow-sm">
            <RefreshCw className={cn("mr-2 h-4 w-4 text-[#12335f]", refreshing && "animate-spin")} />
            Refresh
          </Button>
        </div>
      </div>

      {/* KPI Cards Grid */}
      <div className="grid grid-cols-2 gap-4 md:grid-cols-4">
        <KpiCard label="Delivered Orders" value={deliveredCount} icon={CheckCircle2} onClick={() => setActiveTab('Delivered')} active={activeTab === 'Delivered'} color="green" />
        <KpiCard label="Total Value" value={formatCurrency(totalDeliveredValue)} icon={IndianRupee} onClick={() => setActiveTab('All')} active={activeTab === 'All'} color="indigo" />
        <KpiCard label="Unique Suppliers" value={uniqueSuppliers} icon={Truck} active={false} color="blue" />
        <KpiCard label="Avg Order Value" value={formatCurrency(avgOrderValue)} icon={ShieldCheck} active={false} color="amber" />
      </div>

      {/* Inline Filters Bar */}
      <div className="flex flex-col gap-3 md:flex-row md:items-center justify-between border-y border-slate-200 bg-slate-50/50 py-3 px-1">
        <div className="relative min-w-0 flex-1 max-w-md">
          <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
          <input
            value={searchTerm}
            onChange={e => setSearchTerm(e.target.value)}
            placeholder="Search PO number, supplier, title..."
            className="h-10 w-full rounded-lg border border-slate-200 bg-white pl-10 pr-3 text-xs font-semibold outline-none focus:ring-2 focus:ring-[#12335f]/20"
          />
        </div>

        <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
          <select
            value={sortBy}
            onChange={e => setSortBy(e.target.value)}
            className="h-10 min-w-[130px] rounded-lg border border-slate-200 bg-white px-3 text-xs font-bold outline-none focus:ring-2 focus:ring-[#12335f]/20"
          >
            <option value="newest">Newest</option>
            <option value="value_high">Value High</option>
            <option value="value_low">Value Low</option>
            <option value="title_asc">Title A-Z</option>
            <option value="party_asc">Supplier A-Z</option>
          </select>

          <div className="flex min-w-0 items-center gap-1 rounded-lg border border-slate-200 bg-white p-1">
            {(['Delivered', 'All'] as const).map(tab => (
              <button
                key={tab}
                type="button"
                onClick={() => setActiveTab(tab)}
                className={cn(
                  'rounded-md px-3 py-1.5 text-[10px] font-black uppercase transition-all duration-200',
                  activeTab === tab
                    ? 'bg-[#12335f] text-white shadow-sm shadow-[#12335f]/15'
                    : 'text-slate-600 hover:text-[#12335f] hover:bg-slate-50'
                )}
              >
                {tab}
              </button>
            ))}
          </div>

          <ViewModeToggle value={viewMode} onChange={setViewMode} className="ml-auto sm:ml-0" />
        </div>
      </div>

      {/* Content */}
      {pagedOrders.length === 0 ? (
        <EmptyState
          title="No Completed Orders Found"
          description={searchTerm ? 'No orders match your search.' : "You don't have any delivered purchase orders to repeat yet."}
        />
      ) : viewMode === 'grid' ? (
        <div className="space-y-4">
          <div className="grid gap-4 md:grid-cols-2 2xl:grid-cols-3">
            {pagedOrders.map((order, index) => {
              const rowIndex = (page - 1) * pageSize + index + 1;
              const item = order.items?.[0] || { itemName: order.title, quantity: 1 };
              return (
                <div
                  key={order.id}
                  className="group rounded-2xl border border-slate-200/85 bg-white p-4 shadow-sm transition hover:border-[#12335f]/40 hover:shadow-md flex flex-col justify-between"
                >
                  <div className="space-y-3">
                    <div className="flex items-start justify-between gap-3">
                      <div className="min-w-0">
                        <div className="flex items-center gap-2">
                          <span className="flex h-5 w-5 shrink-0 items-center justify-center rounded bg-slate-100 font-mono text-[9px] font-black text-slate-500">
                            {String(rowIndex).padStart(2, '0')}
                          </span>
                          <EntityIdLink label={order.poNumber} id={order.id} size="sm" onClick={() => setViewingOrder(order)} />
                        </div>
                        <h3 className="mt-2 line-clamp-2 text-sm font-black leading-snug text-slate-900 group-hover:text-[#12335f] transition-colors">{item.itemName || order.title}</h3>
                      </div>
                      <span className="inline-flex rounded-lg border border-green-200 bg-green-50 px-3 py-1 text-[10px] font-black uppercase tracking-wide text-green-700">Delivered</span>
                    </div>

                    <div className="grid grid-cols-2 gap-2.5 text-[10px] font-semibold text-slate-500 pt-1">
                      <InfoTile label="Supplier" value={order.seller?.name || `Seller #${order.sellerId || '-'}`} />
                      <InfoTile label="Value" value={formatCurrency(order.amount || order.totalValue)} />
                      <InfoTile label="Quantity" value={String(Number(item.quantity || 0).toLocaleString())} />
                      <InfoTile label="Delivered" value={formatDate(order.updatedAt)} />
                    </div>
                  </div>

                  <div className="flex gap-2 border-t border-slate-100 pt-3 mt-4">
                    <Button variant="outline" onClick={() => setViewingOrder(order)} className="h-8 flex-1 text-[10px] font-black uppercase rounded-lg">
                      <Eye className="mr-1.5 h-3.5 w-3.5 text-[#12335f]" /> View
                    </Button>
                    <Button onClick={() => handleOpenRepeatModal(order)} className="h-8 flex-1 bg-[#12335f] text-[10px] font-black uppercase text-white hover:bg-[#0b2445] rounded-lg shadow-sm">
                      <RotateCcw className="mr-1.5 h-3.5 w-3.5" /> Repeat
                    </Button>
                  </div>
                </div>
              );
            })}
          </div>
          <Pagination page={page} pageSize={pageSize} total={total} onPageChange={setPage} onPageSizeChange={setPageSize} label="completed orders" />
        </div>
      ) : (
        <div className="overflow-hidden rounded-2xl border border-slate-200/80 bg-white shadow-sm">
          <div className="overflow-x-auto">
            <table className="w-full border-collapse text-left text-xs">
              <thead>
                <tr className="border-b border-slate-200 bg-slate-50/75">
                  <th className="p-3 text-[10px] font-black uppercase tracking-wider text-slate-500 w-16">Sr. No</th>
                  <th className="p-3"><SortHeader label="PO Number" columnKey="title" /></th>
                  <th className="p-3"><SortHeader label="Title / Item" columnKey="title" /></th>
                  <th className="p-3"><SortHeader label="Supplier" columnKey="party" /></th>
                  <th className="p-3">Qty</th>
                  <th className="p-3"><SortHeader label="Amount" columnKey="value" /></th>
                  <th className="p-3"><SortHeader label="Delivered On" columnKey="updated" /></th>
                  <th className="p-3 text-right text-[10px] font-black uppercase tracking-wider text-slate-500">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 font-semibold text-slate-700">
                {pagedOrders.map((order, index) => {
                  const rowIndex = (page - 1) * pageSize + index + 1;
                  const item = order.items?.[0] || { itemName: order.title, quantity: 1 };
                  return (
                    <tr key={order.id} className="hover:bg-slate-50/50 transition">
                      <td className="p-3 font-mono text-xs text-slate-500">
                        {String(rowIndex).padStart(2, '0')}
                      </td>
                      <td className="p-3">
                        <EntityIdLink label={order.poNumber} id={order.id} size="sm" onClick={() => setViewingOrder(order)} />
                      </td>
                      <td className="p-3">
                        <p className="font-bold text-slate-900">{item.itemName || order.title}</p>
                      </td>
                      <td className="p-3 text-slate-600">{order.seller?.name || `Seller #${order.sellerId || '-'}`}</td>
                      <td className="p-3 text-slate-900">{Number(item.quantity || 0).toLocaleString()}</td>
                      <td className="p-3 font-bold text-slate-900">{formatCurrency(order.amount || order.totalValue)}</td>
                      <td className="p-3 text-slate-500">{formatDate(order.updatedAt)}</td>
                      <td className="p-3 text-right">
                        <div className="flex items-center justify-end gap-2">
                          <Button variant="outline" onClick={() => setViewingOrder(order)} className="h-8 text-[10px] font-black uppercase rounded-lg">
                            <Eye className="mr-1 h-3.5 w-3.5 text-[#12335f]" /> View
                          </Button>
                          <Button onClick={() => handleOpenRepeatModal(order)} className="h-8 bg-[#12335f] text-[10px] font-black uppercase text-white hover:bg-[#0b2445] rounded-lg">
                            <RotateCcw className="mr-1 h-3.5 w-3.5" /> Repeat
                          </Button>
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
          <Pagination page={page} pageSize={pageSize} total={total} onPageChange={setPage} onPageSizeChange={setPageSize} label="completed orders" />
        </div>
      )}

      {/* View Order Details Modal */}
      {viewingOrder && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/60 p-4 backdrop-blur-sm" role="dialog" aria-modal="true">
          <div className="w-full max-w-lg overflow-hidden rounded-[24px] bg-white shadow-2xl ring-1 ring-slate-200">
            <div className="border-b border-slate-100 bg-slate-50/50 px-5 py-4 flex items-center justify-between">
              <div>
                <p className="text-[10px] font-black uppercase tracking-widest text-[#12335f]">Order Details</p>
                <h3 className="text-sm font-black text-slate-900">{viewingOrder.poNumber}</h3>
              </div>
              <Button variant="ghost" onClick={() => setViewingOrder(null)} className="h-8 w-8 p-0 rounded-full">
                <XCircle className="h-5 w-5 text-slate-400" />
              </Button>
            </div>
            <div className="p-5 space-y-4 text-xs">
              <div className="grid grid-cols-2 gap-3">
                <InfoTile label="Title" value={viewingOrder.title || '-'} />
                <InfoTile label="Status" value={String(viewingOrder.status || '-').replace(/_/g, ' ')} />
                <InfoTile label="Supplier" value={viewingOrder.seller?.name || `Seller #${viewingOrder.sellerId || '-'}`} />
                <InfoTile label="Total Value" value={formatCurrency(viewingOrder.amount || viewingOrder.totalValue)} />
                <InfoTile label="Expected Delivery" value={formatDate(viewingOrder.expectedDelivery)} />
                <InfoTile label="Updated" value={formatDate(viewingOrder.updatedAt)} />
                <InfoTile label="Delivery Address" value={viewingOrder.deliveryAddress || '-'} />
                <InfoTile label="Created" value={formatDate(viewingOrder.createdAt)} />
              </div>

              {viewingOrder.items && viewingOrder.items.length > 0 && (
                <div>
                  <p className="text-[10px] font-black uppercase tracking-wider text-slate-500 mb-2">Line Items</p>
                  <div className="rounded-xl border border-slate-200 overflow-hidden">
                    <table className="w-full text-xs">
                      <thead><tr className="bg-slate-50 border-b border-slate-100 text-[10px] font-black uppercase tracking-wider text-slate-500">
                        <th className="p-2 text-left">Item</th><th className="p-2 text-right">Qty</th><th className="p-2 text-right">Unit Price</th><th className="p-2 text-right">Total</th>
                      </tr></thead>
                      <tbody className="divide-y divide-slate-100">
                        {viewingOrder.items.map((it: any, idx: number) => (
                          <tr key={idx} className="font-semibold text-slate-700">
                            <td className="p-2">{it.itemName || it.description || `Item ${idx + 1}`}</td>
                            <td className="p-2 text-right">{Number(it.quantity || 0).toLocaleString()}</td>
                            <td className="p-2 text-right">{formatCurrency(it.unitPrice)}</td>
                            <td className="p-2 text-right font-bold text-slate-900">{formatCurrency(Number(it.quantity || 0) * Number(it.unitPrice || 0))}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>
              )}

              <div className="flex justify-end gap-2 border-t border-slate-100 pt-3">
                <Button variant="outline" onClick={() => setViewingOrder(null)} className="h-9 text-[10px] font-black uppercase">Close</Button>
                {String(viewingOrder.status || '').toLowerCase() === 'delivered' && (
                  <Button onClick={() => { setViewingOrder(null); handleOpenRepeatModal(viewingOrder); }} className="h-9 bg-[#12335f] text-[10px] font-black uppercase text-white hover:bg-[#0b2445]">
                    <RotateCcw className="mr-1.5 h-3.5 w-3.5" /> Repeat This Order
                  </Button>
                )}
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Repeat Order Modal */}
      {repeatingOrder && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/60 p-4 backdrop-blur-sm" role="dialog" aria-modal="true">
          <div className="w-full max-w-md overflow-hidden rounded-[24px] bg-white shadow-2xl ring-1 ring-slate-200">
            <div className="border-b border-slate-100 bg-slate-50/50 px-5 py-4">
              <div className="flex items-center gap-2">
                <RotateCcw className="h-5 w-5 text-[#12335f]" />
                <h3 className="text-sm font-black text-slate-900 uppercase tracking-wide">Repeat Purchase Order</h3>
              </div>
              <p className="mt-1 text-[11px] font-semibold text-slate-500">
                You are replicating completed order <span className="font-bold text-slate-800">{repeatingOrder.poNumber}</span>.
              </p>
            </div>

            <form onSubmit={handleCreateRepeatOrder} className="p-5 space-y-4 text-xs font-semibold text-slate-700">
              {/* Product Info */}
              <div className="rounded-[18px] bg-slate-50 p-3 ring-1 ring-slate-200/50">
                <span className="text-[9px] font-black uppercase tracking-wider text-slate-500">Product / Material</span>
                <p className="mt-1 text-xs font-bold text-slate-900">{repeatingOrder.items?.[0]?.itemName || repeatingOrder.title}</p>
                <div className="mt-2 grid grid-cols-2 gap-2 border-t border-slate-200/60 pt-2 text-[11px]">
                  <div>
                    <span className="text-slate-500 block">Unit Price</span>
                    <span className="font-bold text-slate-900">{formatCurrency(repeatingOrder.items?.[0]?.unitPrice || repeatingOrder.amount)}</span>
                  </div>
                  <div>
                    <span className="text-slate-500 block">Supplier</span>
                    <span className="font-bold text-slate-900">{repeatingOrder.seller?.name || 'Seller'}</span>
                  </div>
                </div>
              </div>

              {/* Quantity */}
              <div>
                <label className="block text-[10px] font-black uppercase tracking-wider text-slate-500 mb-1">Quantity</label>
                <input type="number" min="1" step="1" required value={quantity} onChange={e => setQuantity(Number(e.target.value))} className="h-10 w-full rounded-xl border border-slate-200 px-3 text-xs font-bold text-slate-800 outline-none focus:border-[#12335f] focus:ring-2 focus:ring-[#12335f]/10" />
              </div>

              {/* Expected Delivery Date */}
              <div>
                <label className="block text-[10px] font-black uppercase tracking-wider text-slate-500 mb-1">Expected Delivery Date</label>
                <div className="relative">
                  <Calendar className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400 pointer-events-none" />
                  <input type="date" required value={expectedDelivery} onChange={e => setExpectedDelivery(e.target.value)} className="h-10 w-full rounded-xl border border-slate-200 pl-10 pr-3 text-xs font-bold text-slate-800 outline-none focus:border-[#12335f] focus:ring-2 focus:ring-[#12335f]/10" />
                </div>
              </div>

              {/* Delivery Address */}
              <div>
                <label className="block text-[10px] font-black uppercase tracking-wider text-slate-500 mb-1">Delivery Address</label>
                <div className="relative">
                  <MapPin className="absolute left-3 top-3 h-4 w-4 text-slate-400 pointer-events-none" />
                  <textarea required rows={2} value={deliveryAddress} onChange={e => setDeliveryAddress(e.target.value)} className="w-full rounded-xl border border-slate-200 pl-10 pr-3 py-2 text-xs font-bold text-slate-800 outline-none focus:border-[#12335f] focus:ring-2 focus:ring-[#12335f]/10" />
                </div>
              </div>

              {/* Summary */}
              <div className="flex items-center justify-between border-t border-slate-100 pt-3">
                <span className="text-[10px] font-black uppercase tracking-wider text-slate-500">Estimated Value</span>
                <span className="text-sm font-black text-[#12335f]">
                  {formatCurrency((Number(repeatingOrder.items?.[0]?.unitPrice) || Number(repeatingOrder.amount)) * quantity)}
                </span>
              </div>

              {/* Actions */}
              <div className="flex justify-end gap-2 border-t border-slate-100 pt-3">
                <Button type="button" variant="outline" onClick={() => setRepeatingOrder(null)} className="h-9 text-[10px] font-black uppercase">Cancel</Button>
                <Button type="submit" disabled={submitting} className="h-9 bg-[#12335f] text-[10px] font-black uppercase text-white hover:bg-[#0b2445]">
                  {submitting ? 'Placing Order...' : 'Confirm Order'}
                </Button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}

// ── Sub-components ──────────────────────────────────────────────────────

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
        <p className="mt-1 text-xl font-black tracking-tight leading-none">{value}</p>
      </div>
      <div className={cn('flex h-9 w-9 shrink-0 items-center justify-center rounded-xl shadow-sm transition-transform duration-300 group-hover:scale-110', iconBgMap[color])}>
        <Icon className="h-4.5 w-4.5" />
      </div>
    </button>
  );
}

function InfoTile({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-md border border-slate-200 bg-slate-50 p-3">
      <p className="text-[9px] font-black uppercase tracking-widest text-slate-400">{label}</p>
      <p className="mt-1 break-words text-xs font-bold text-slate-800">{value || '-'}</p>
    </div>
  );
}
