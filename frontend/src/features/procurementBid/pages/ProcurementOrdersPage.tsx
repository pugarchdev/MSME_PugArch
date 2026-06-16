'use client';

import React, { useCallback, useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { ClipboardCheck, CreditCard, ReceiptText, RefreshCcw, Search, Truck } from 'lucide-react';
import { toast } from 'sonner';
import { useAuth } from '../../../hooks/useAuth';
import { MarketplaceHeader } from '../../marketplace/components/MarketplaceHeader';
import { MarketplaceFooter } from '../../marketplace/components/MarketplaceFooter';
import { PageShell, ProcurementEmptyState, ProcurementErrorState, ProcurementHero, ProcurementLoadingState, StatusBadge } from '../components';
import { money } from '../data';
import { procurementOrderApi } from '../orderApi';
import { Pagination } from '../../shared/Pagination';
import { usePagination, useResponsiveViewMode } from '../../shared/hooks';
import { ViewModeToggle } from '../../shared/ViewModeToggle';
import { SortableHeader, type SortDirection } from '../../shared/SortableHeader';
import ProcurementLifecycleTracker from '../../procurementLifecycle/components/ProcurementLifecycleTracker';
import { inferCurrentLifecycleStage, mapProcurementOrderToLifecycle } from '../../procurementLifecycle/statusMapper';

const fmt = (value?: string) => value ? new Date(value).toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' }) : 'Pending';
const roleTitle = (role?: string) => role === 'seller' ? 'Seller Awarded Bids' : role === 'admin' ? 'Admin Procurement Orders' : 'Buyer Awarded Orders';
type OrderSortKey = 'poNumber' | 'title' | 'buyer' | 'seller' | 'status' | 'amount' | 'createdAt';

export default function ProcurementOrdersPage() {
  const { user } = useAuth();
  const pathname = usePathname() || '';
  const detailMatch = pathname.match(/^\/procurement-orders\/(\d+)$/);
  const orderId = detailMatch ? Number(detailMatch[1]) : null;
  const [orders, setOrders] = useState<any[]>([]);
  const [awards, setAwards] = useState<any[]>([]);
  const [order, setOrder] = useState<any | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState('');
  const [remarks, setRemarks] = useState('');
  const [query, setQuery] = useState('');
  const [statusFilter, setStatusFilter] = useState('');
  const [sortKey, setSortKey] = useState<OrderSortKey>('createdAt');
  const [sortDirection, setSortDirection] = useState<SortDirection>('desc');
  const [viewMode, setViewMode] = useResponsiveViewMode(`phase7:procurement-orders:${user?.role || 'all'}:view-mode`);

  const load = useCallback(() => {
    let alive = true;
    setLoading(true);
    setError('');
    const request = orderId
      ? procurementOrderApi.getOrder(orderId).then(data => {
        if (alive) setOrder(data);
      })
      : Promise.all([
        procurementOrderApi.listOrders(),
        user?.role === 'seller' ? procurementOrderApi.sellerAwards() : Promise.resolve([])
      ]).then(([orderData, awardData]) => {
        if (!alive) return;
        setOrders(orderData.items || orderData.purchaseOrders || []);
        setAwards(awardData || []);
      });
    request.catch((err: any) => {
      if (!alive) return;
      setError(err?.message || 'Unable to load procurement orders.');
    }).finally(() => {
      if (alive) setLoading(false);
    });
    return () => { alive = false; };
  }, [orderId, user?.role]);

  useEffect(() => load(), [load]);

  const run = async (label: string, action: () => Promise<unknown>) => {
    setBusy(label);
    try {
      await action();
      toast.success(label);
      load();
    } catch (err: any) {
      toast.error(err?.message || `${label} failed`);
    } finally {
      setBusy('');
    }
  };

  const visibleAwards = useMemo(() => awards.filter(award => award.purchaseOrder), [awards]);
  const filteredOrders = useMemo(() => {
    const text = query.trim().toLowerCase();
    return [...orders].filter(item => {
      const haystack = [
        item.poNumber,
        item.title,
        item.status,
        item.buyer?.name,
        item.seller?.name,
        item.deliveryTrackings?.[0]?.status,
        item.invoices?.[0]?.status,
      ].join(' ').toLowerCase();
      if (text && !haystack.includes(text)) return false;
      if (statusFilter && String(item.status || '').toLowerCase() !== statusFilter.toLowerCase()) return false;
      return true;
    }).sort((a, b) => {
      const valueFor = (item: any) => {
        if (sortKey === 'poNumber') return item.poNumber || '';
        if (sortKey === 'title') return item.title || '';
        if (sortKey === 'buyer') return item.buyer?.name || '';
        if (sortKey === 'seller') return item.seller?.name || '';
        if (sortKey === 'status') return item.status || '';
        if (sortKey === 'amount') return Number(item.amount || 0);
        return new Date(item.createdAt || 0).getTime();
      };
      const av = valueFor(a);
      const bv = valueFor(b);
      const result = typeof av === 'number' && typeof bv === 'number'
        ? av - bv
        : String(av).localeCompare(String(bv));
      return sortDirection === 'asc' ? result : -result;
    });
  }, [orders, query, sortDirection, sortKey, statusFilter]);
  const { page, pageSize, pageItems, total, setPage, setPageSize } = usePagination(filteredOrders, 10);

  const toggleSort = (field: OrderSortKey) => {
    setSortDirection(prev => sortKey === field && prev === 'asc' ? 'desc' : 'asc');
    setSortKey(field);
    setPage(1);
  };

  const statusOptions = useMemo(
    () => Array.from(new Set(orders.map(item => String(item.status || '')).filter(Boolean))).sort(),
    [orders]
  );

  return (
    <PageShell>
      <div className="brand-tricolor-strip w-full" />
      <MarketplaceHeader user={user} />
      <main className="mx-auto w-full max-w-7xl px-4 py-5">
        <ProcurementHero
          title={order ? order.poNumber || `Order #${order.id}` : roleTitle(user?.role)}
          subtitle="Track bid award, PO/work order, seller acceptance, delivery, GRN, invoice, payment, and settlement in one procurement lifecycle."
          action={<button onClick={load} className="inline-flex h-10 items-center gap-2 rounded-md border border-slate-200 bg-white px-4 text-xs font-black text-slate-700"><RefreshCcw className="h-4 w-4" /> Refresh</button>}
        />

        {loading ? <div className="mt-5"><ProcurementLoadingState message="Loading procurement order lifecycle..." /></div> : error ? <div className="mt-5"><ProcurementErrorState message={error} onRetry={load} /></div> : order ? (
          <OrderDetail order={order} role={user?.role} busy={busy} remarks={remarks} setRemarks={setRemarks} run={run} />
        ) : (
          <section className="mt-5 space-y-5">
            {user?.role === 'seller' && visibleAwards.length > 0 && (
              <div className="rounded-lg border border-slate-200 bg-white p-4 shadow-sm">
                <h2 className="text-base font-black text-[#0b2447]">Award Acceptance Queue</h2>
                <div className="mt-3 grid gap-3 lg:grid-cols-2">
                  {visibleAwards.map(award => <AwardCard key={award.id} award={award} run={run} />)}
                </div>
              </div>
            )}
            {orders.length > 0 && (
              <div className="rounded-lg border border-slate-200 bg-white p-3 shadow-sm">
                <div className="grid gap-3 md:grid-cols-[1fr_180px_auto_auto] md:items-center">
                  <div className="relative">
                    <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
                    <input
                      value={query}
                      onChange={event => { setQuery(event.target.value); setPage(1); }}
                      placeholder="Search PO, buyer, seller, delivery, invoice..."
                      className="h-10 w-full rounded-md border border-slate-200 bg-slate-50 pl-10 pr-3 text-sm outline-none focus:border-[#0b2447]"
                    />
                  </div>
                  <select
                    value={statusFilter}
                    onChange={event => { setStatusFilter(event.target.value); setPage(1); }}
                    className="h-10 rounded-md border border-slate-200 bg-white px-3 text-xs font-bold text-slate-700 outline-none"
                  >
                    <option value="">All statuses</option>
                    {statusOptions.map(status => <option key={status} value={status}>{status}</option>)}
                  </select>
                  <ViewModeToggle value={viewMode} onChange={setViewMode} />
                  <button
                    type="button"
                    onClick={() => { setQuery(''); setStatusFilter(''); setPage(1); }}
                    className="h-10 rounded-md border border-slate-200 bg-white px-4 text-xs font-black text-slate-700"
                  >
                    Reset
                  </button>
                </div>
              </div>
            )}
            {!orders.length ? <ProcurementEmptyState title="No awarded procurement orders yet." message="Final award approved bids will appear here once PO/work order generation is complete." /> : !pageItems.length ? (
              <ProcurementEmptyState title="No procurement orders match these filters." message="Clear the search or status filter to see the full lifecycle list." />
            ) : viewMode === 'grid' ? (
              <div className="grid gap-4 lg:grid-cols-2">
                {pageItems.map(item => <OrderCard key={item.id} order={item} />)}
              </div>
            ) : (
              <OrderTable orders={pageItems} sortKey={sortKey} sortDirection={sortDirection} onSort={toggleSort} />
            )}
            {orders.length > 0 && (
              <Pagination page={page} pageSize={pageSize} total={total} onPageChange={setPage} onPageSizeChange={setPageSize} label="orders" />
            )}
          </section>
        )}
      </main>
      <MarketplaceFooter />
    </PageShell>
  );
}

function OrderTable({
  orders,
  sortKey,
  sortDirection,
  onSort,
}: {
  orders: any[];
  sortKey: OrderSortKey;
  sortDirection: SortDirection;
  onSort: (field: OrderSortKey) => void;
}) {
  return (
    <div className="overflow-hidden rounded-lg border border-slate-200 bg-white shadow-sm">
      <div className="overflow-x-auto">
        <table className="w-full min-w-[980px] text-left text-sm">
          <thead className="bg-slate-50 text-[10px] uppercase tracking-wider text-slate-500">
            <tr>
              <th className="px-4 py-3"><SortableHeader label="PO number" field="poNumber" activeField={sortKey} direction={sortDirection} onSort={onSort} /></th>
              <th className="px-4 py-3"><SortableHeader label="Title" field="title" activeField={sortKey} direction={sortDirection} onSort={onSort} /></th>
              <th className="px-4 py-3"><SortableHeader label="Buyer" field="buyer" activeField={sortKey} direction={sortDirection} onSort={onSort} /></th>
              <th className="px-4 py-3"><SortableHeader label="Seller" field="seller" activeField={sortKey} direction={sortDirection} onSort={onSort} /></th>
              <th className="px-4 py-3 text-right"><SortableHeader label="Amount" field="amount" activeField={sortKey} direction={sortDirection} onSort={onSort} className="justify-end" /></th>
              <th className="px-4 py-3"><SortableHeader label="Status" field="status" activeField={sortKey} direction={sortDirection} onSort={onSort} /></th>
              <th className="px-4 py-3">Lifecycle</th>
              <th className="px-4 py-3 text-right font-black">Action</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {orders.map(order => {
              const delivery = order.deliveryTrackings?.[0];
              const invoice = order.invoices?.[0];
              return (
                <tr key={order.id} className="bg-white transition hover:bg-blue-50/50">
                  <td className="px-4 py-3 text-xs font-black text-[#c86413]">{order.poNumber}</td>
                  <td className="px-4 py-3 text-xs font-black text-slate-900">{order.title}</td>
                  <td className="px-4 py-3 text-xs font-semibold text-slate-600">{order.buyer?.name || '-'}</td>
                  <td className="px-4 py-3 text-xs font-semibold text-slate-600">{order.seller?.name || '-'}</td>
                  <td className="px-4 py-3 text-right text-xs font-black text-[#0b2447]">{money(Number(order.amount || 0))}</td>
                  <td className="px-4 py-3"><StatusBadge label={order.status || 'issued'} /></td>
                  <td className="px-4 py-3 text-[10px] font-semibold text-slate-500">
                    Delivery {delivery?.status || 'CREATED'} / Invoice {invoice?.status || 'PENDING'}
                  </td>
                  <td className="px-4 py-3 text-right">
                    <Link href={`/procurement-orders/${order.id}`} className="inline-flex h-8 items-center rounded-md bg-[#0b2447] px-3 text-[10px] font-black text-white">Open</Link>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function AwardCard({ award, run }: { award: any; run: (label: string, action: () => Promise<unknown>) => void }) {
  const po = award.purchaseOrder;
  return (
    <div className="rounded-lg border border-slate-200 bg-slate-50 p-4">
      <div className="flex items-start justify-between gap-3">
        <div>
          <p className="text-[10px] font-black uppercase tracking-wide text-slate-500">{award.bid?.bidNumber}</p>
          <h3 className="mt-1 text-sm font-black text-slate-900">{award.bid?.title || po?.title}</h3>
          <p className="mt-1 text-xs font-bold text-slate-500">{po?.poNumber} • {money(Number(po?.amount || 0))}</p>
        </div>
        <StatusBadge label={award.awardStatus || 'Recommended'} />
      </div>
      <div className="mt-3 flex flex-wrap gap-2">
        <button onClick={() => run('Award accepted', () => procurementOrderApi.acceptAward(award.id, {}))} className="h-9 rounded-md bg-emerald-600 px-3 text-xs font-black text-white">Accept Award</button>
        <button onClick={() => {
          const reason = window.prompt('Reason for rejecting award');
          if (reason) run('Award rejected', () => procurementOrderApi.rejectAward(award.id, reason));
        }} className="h-9 rounded-md bg-red-600 px-3 text-xs font-black text-white">Reject</button>
        <Link href={`/procurement-orders/${po?.id}`} className="inline-flex h-9 items-center rounded-md border border-slate-200 bg-white px-3 text-xs font-black text-slate-700">Open PO</Link>
      </div>
    </div>
  );
}

function OrderCard({ order }: { order: any }) {
  const delivery = order.deliveryTrackings?.[0];
  return (
    <Link href={`/procurement-orders/${order.id}`} className="block rounded-lg border border-slate-200 bg-white p-4 shadow-sm transition hover:-translate-y-0.5 hover:shadow-lg">
      <div className="flex items-start justify-between gap-3">
        <div>
          <p className="text-[10px] font-black uppercase tracking-wide text-[#c86413]">{order.poNumber}</p>
          <h2 className="mt-1 text-sm font-black text-[#0b2447]">{order.title}</h2>
          <p className="mt-1 text-xs font-bold text-slate-500">{order.buyer?.name} to {order.seller?.name}</p>
        </div>
        <StatusBadge label={order.status || 'issued'} />
      </div>
      <div className="mt-4 grid gap-2 sm:grid-cols-3">
        <Metric label="Value" value={money(Number(order.amount || 0))} />
        <Metric label="Delivery" value={delivery?.status || 'CREATED'} />
        <Metric label="Invoices" value={String(order.invoices?.length || 0)} />
      </div>
    </Link>
  );
}

function OrderDetail({ order, role, busy, remarks, setRemarks, run }: any) {
  const delivery = order.deliveryTrackings?.[0];
  const grn = order.grns?.[0];
  const invoice = order.invoices?.[0];
  const payment = order.payments?.[0] || invoice?.payments?.[0];
  const lifecycleEvents = mapProcurementOrderToLifecycle(order);
  const currentStage = inferCurrentLifecycleStage(lifecycleEvents);

  return (
    <div className="mt-5 grid gap-5 lg:grid-cols-[1fr_360px]">
      <section className="space-y-5">
        <ProcurementLifecycleTracker
          currentStage={currentStage}
          events={lifecycleEvents}
          role={role}
          sourceType="Procurement Order"
          showTechnicalStatus
          nextAction={role === 'seller' ? 'Update delivery and upload invoice when the order moves forward.' : 'Confirm delivery, approve invoice, and initiate payment from the actions panel when ready.'}
        />

        <div className="rounded-lg border border-slate-200 bg-white p-4 shadow-sm">
          <h2 className="text-base font-black text-[#0b2447]">PO / Work Order</h2>
          <div className="mt-3 grid gap-3 sm:grid-cols-3">
            <Metric label="PO Number" value={order.poNumber} />
            <Metric label="Amount" value={money(Number(order.amount || 0))} />
            <Metric label="Issued" value={fmt(order.createdAt)} />
            <Metric label="Buyer" value={order.buyer?.name || '-'} />
            <Metric label="Seller" value={order.seller?.name || '-'} />
            <Metric label="Delivery location" value={order.deliveryAddress || order.metadata?.deliveryLocation || '-'} />
          </div>
        </div>

        <div className="rounded-lg border border-slate-200 bg-white p-4 shadow-sm">
          <h2 className="text-base font-black text-[#0b2447]">Delivery, GRN, Invoice and Payment</h2>
          <div className="mt-3 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
            <Stage icon={<Truck />} label="Delivery" value={delivery?.status || 'CREATED'} />
            <Stage icon={<ClipboardCheck />} label="GRN" value={grn?.status || 'PENDING'} />
            <Stage icon={<ReceiptText />} label="Invoice" value={invoice?.status || 'PENDING'} />
            <Stage icon={<CreditCard />} label="Payment" value={payment?.status || 'PAYMENT_PENDING'} />
          </div>
        </div>
      </section>

      <aside className="space-y-4 lg:sticky lg:top-28 lg:self-start">
        <div className="rounded-lg border border-slate-200 bg-white p-4 shadow-sm">
          <h2 className="text-sm font-black text-[#0b2447]">Actions</h2>
          <textarea value={remarks} onChange={e => setRemarks(e.target.value)} className="mt-3 min-h-20 w-full rounded-md border border-slate-200 p-3 text-xs font-bold outline-none" placeholder="Remarks or reason" />
          <div className="mt-3 grid gap-2">
            {role === 'seller' && <button disabled={!!busy} onClick={() => run('Delivery dispatched', () => procurementOrderApi.updateDelivery(order.id, { status: 'DISPATCHED', remarks }))} className="h-10 rounded-md bg-[#0b2447] px-3 text-xs font-black text-white disabled:opacity-50">Update Delivery</button>}
            {role === 'seller' && <button disabled={!!busy} onClick={() => run('Invoice submitted', () => procurementOrderApi.createInvoice(order.id, { amount: Number(order.amount || 0) }))} className="h-10 rounded-md bg-[#c86413] px-3 text-xs font-black text-white disabled:opacity-50">Create Invoice</button>}
            {role === 'buyer' && !grn && <button disabled={!!busy} onClick={() => run('GRN created', () => procurementOrderApi.createGrn(order.id, { remarks }))} className="h-10 rounded-md bg-[#0b2447] px-3 text-xs font-black text-white disabled:opacity-50">Create GRN</button>}
            {role === 'buyer' && grn && grn.status !== 'APPROVED' && <button disabled={!!busy} onClick={() => run('GRN approved', () => procurementOrderApi.approveGrn(order.id, grn.id, { inspectionNote: remarks }))} className="h-10 rounded-md bg-emerald-600 px-3 text-xs font-black text-white disabled:opacity-50">Approve GRN</button>}
            {role === 'buyer' && invoice && invoice.status !== 'approved' && <button disabled={!!busy} onClick={() => run('Invoice approved', () => procurementOrderApi.approveInvoice(order.id, invoice.id))} className="h-10 rounded-md bg-emerald-600 px-3 text-xs font-black text-white disabled:opacity-50">Approve Invoice</button>}
            {role === 'buyer' && invoice?.status === 'approved' && <button disabled={!!busy} onClick={() => run('Payment initiated', () => procurementOrderApi.initiatePayment(order.id, { method: 'bank_transfer' }))} className="h-10 rounded-md bg-[#0b2447] px-3 text-xs font-black text-white disabled:opacity-50">Initiate Payment</button>}
            {role === 'admin' && payment && <button disabled={!!busy} onClick={() => run('Settlement confirmed', () => procurementOrderApi.markSettlementConfirmed(order.id, { remarks }))} className="h-10 rounded-md bg-emerald-600 px-3 text-xs font-black text-white disabled:opacity-50">Confirm Settlement</button>}
          </div>
        </div>
        <Link href={role === 'seller' ? '/seller/awards' : role === 'admin' ? '/admin/procurement-orders' : '/buyer/procurement-orders'} className="flex h-10 items-center justify-center rounded-md border border-slate-200 bg-white text-xs font-black text-slate-700">Back to orders</Link>
      </aside>
    </div>
  );
}

function Metric({ label, value }: { label: string; value: string }) {
  return <div className="rounded-md border border-slate-200 bg-slate-50 p-3"><p className="text-[10px] font-black uppercase tracking-wide text-slate-500">{label}</p><p className="mt-1 text-xs font-black text-slate-800">{value}</p></div>;
}

function Stage({ icon, label, value }: { icon: React.ReactNode; label: string; value: string }) {
  return <div className="rounded-lg border border-slate-200 bg-slate-50 p-3"><div className="flex items-center gap-2 text-[#0b2447]"><span className="[&>svg]:h-4 [&>svg]:w-4">{icon}</span><p className="text-xs font-black">{label}</p></div><div className="mt-2"><StatusBadge label={value} /></div></div>;
}
