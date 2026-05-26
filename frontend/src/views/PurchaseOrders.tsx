import { useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import jsPDF from 'jspdf';
import autoTable from 'jspdf-autotable';
import { toast } from 'sonner';
import { CheckCircle2, Download, FileText, RefreshCw, Search, ShieldCheck, Truck, XCircle, ArrowUp, ArrowDown, ArrowUpDown, Eye, X, Filter, List, LayoutGrid } from 'lucide-react';
import { Button } from '../components/ui/button';
import { Card, CardContent } from '../components/ui/card';
import { cn } from '../lib/utils';
import { postApi } from '../features/shared/apiClient';
import { EmptyState, InlineError, LoadingState } from '../features/shared/FeatureStates';
import { formatCurrency, formatDate, maskEmail } from '../features/shared/format';
import { useFeatureQuery, usePagination, useResponsiveViewMode } from '../features/shared/hooks';
import { Pagination } from '../features/shared/Pagination';
import { useAuth } from '../hooks/useAuth';
import type { PurchaseOrderDto } from '../features/shared/types';

const readableStatus = (value?: string) => String(value || 'generated').replace(/_/g, ' ').replace(/\b\w/g, char => char.toUpperCase());
const openStatuses = ['generated', 'accepted', 'in_fulfillment', 'delivered', 'invoice_submitted'];

export default function PurchaseOrders() {
  const { user } = useAuth();
  const router = useRouter();
  const isSeller = user?.role === 'seller';
  const isBuyer = user?.role === 'buyer';
  const { data: orders, loading, error, reload, setData } = useFeatureQuery<PurchaseOrderDto[]>('/api/purchase-orders', []);
  const [activeTab, setActiveTab] = useState<'Open' | 'Delivered' | 'Cancelled' | 'All'>('Open');
  const [searchTerm, setSearchTerm] = useState('');
  const [sortBy, setSortBy] = useState('newest');
  const [viewMode, setViewMode] = useResponsiveViewMode();
  const [showMobileFilters, setShowMobileFilters] = useState(false);
  const [confirming, setConfirming] = useState<{ action: 'acknowledge' | 'cancel'; order: PurchaseOrderDto } | null>(null);
  const [viewingOrder, setViewingOrder] = useState<PurchaseOrderDto | null>(null);

  const handleConvertToInvoice = (order: PurchaseOrderDto) => {
    const amountVal = order.amount || order.totalValue || 0;
    router.push(`/seller/invoices?convertPoId=${order.id}&amount=${amountVal}`);
  };

  const formatTimestamp = (value?: string | Date | null) => {
    if (!value) return '-';
    const date = new Date(value);
    if (Number.isNaN(date.getTime())) return '-';
    return date.toLocaleString('en-IN', {
      day: '2-digit',
      month: 'short',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
      hour12: true
    });
  };


  const toggleSort = (key: string) => {
    if (key === 'po') {
      setSortBy(sortBy === 'po_asc' ? 'po_desc' : 'po_asc');
    } else if (key === 'title') {
      setSortBy(sortBy === 'title_asc' ? 'title_desc' : 'title_asc');
    } else if (key === 'party') {
      setSortBy(sortBy === 'party_asc' ? 'party_desc' : 'party_asc');
    } else if (key === 'value') {
      setSortBy(sortBy === 'value_low' ? 'value_high' : 'value_low');
    } else if (key === 'expected') {
      setSortBy(sortBy === 'expected_asc' ? 'expected_desc' : 'expected_asc');
    } else if (key === 'status') {
      setSortBy(sortBy === 'status_asc' ? 'status_desc' : 'status_asc');
    }
  };

  const SortHeader = ({ label, columnKey, className = '' }: { label: string, columnKey: string, className?: string }) => {
    let isActive = false;
    let isAsc = true;

    if (columnKey === 'po') {
      isActive = sortBy === 'po_asc' || sortBy === 'po_desc';
      isAsc = sortBy === 'po_asc';
    } else if (columnKey === 'title') {
      isActive = sortBy === 'title_asc' || sortBy === 'title_desc';
      isAsc = sortBy === 'title_asc';
    } else if (columnKey === 'party') {
      isActive = sortBy === 'party_asc' || sortBy === 'party_desc';
      isAsc = sortBy === 'party_asc';
    } else if (columnKey === 'value') {
      isActive = sortBy === 'value_low' || sortBy === 'value_high';
      isAsc = sortBy === 'value_low';
    } else if (columnKey === 'expected') {
      isActive = sortBy === 'expected_asc' || sortBy === 'expected_desc';
      isAsc = sortBy === 'expected_asc';
    } else if (columnKey === 'status') {
      isActive = sortBy === 'status' || sortBy === 'status_asc' || sortBy === 'status_desc';
      isAsc = sortBy === 'status' || sortBy === 'status_asc';
    }

    return (
      <button
        type="button"
        onClick={() => toggleSort(columnKey)}
        className={cn("inline-flex items-center gap-1 text-[10px] font-black uppercase tracking-wider text-slate-500 hover:text-[#12335f] transition-colors", isActive && "text-[#12335f]", className)}
      >
        {label}
        {isActive ? (
          isAsc ? (
            <ArrowUp className="h-3 w-3 text-[#12335f]" />
          ) : (
            <ArrowDown className="h-3 w-3 text-[#12335f]" />
          )
        ) : (
          <ArrowUpDown className="h-3 w-3 opacity-40" />
        )}
      </button>
    );
  };

  const filteredOrders = useMemo(() => {
    const term = searchTerm.trim().toLowerCase();
    return orders
      .filter(order => {
        const status = String(order.status || '').toLowerCase();
        const matchesTab = activeTab === 'All' ||
          (activeTab === 'Open' && openStatuses.includes(status)) ||
          (activeTab === 'Delivered' && status === 'delivered') ||
          (activeTab === 'Cancelled' && status === 'cancelled');
        const haystack = [order.poNumber, order.title, order.seller?.name, order.buyer?.name, order.status, order.poStatus].filter(Boolean).join(' ').toLowerCase();
        return matchesTab && (!term || haystack.includes(term));
      })
      .sort((a, b) => {
        if (sortBy === 'value_high') return Number(b.amount || b.totalValue || 0) - Number(a.amount || a.totalValue || 0);
        if (sortBy === 'value_low') return Number(a.amount || a.totalValue || 0) - Number(b.amount || b.totalValue || 0);

        if (sortBy === 'status' || sortBy === 'status_asc') return String(a.status || '').localeCompare(String(b.status || ''));
        if (sortBy === 'status_desc') return String(b.status || '').localeCompare(String(a.status || ''));

        if (sortBy === 'po_asc') return String(a.poNumber || '').localeCompare(String(b.poNumber || ''));
        if (sortBy === 'po_desc') return String(b.poNumber || '').localeCompare(String(a.poNumber || ''));

        if (sortBy === 'title_asc') return String(a.title || '').localeCompare(String(b.title || ''));
        if (sortBy === 'title_desc') return String(b.title || '').localeCompare(String(a.title || ''));

        if (sortBy === 'party_asc') {
          const aParty = a.seller?.name || a.buyer?.name || '';
          const bParty = b.seller?.name || b.buyer?.name || '';
          return aParty.localeCompare(bParty);
        }
        if (sortBy === 'party_desc') {
          const aParty = a.seller?.name || a.buyer?.name || '';
          const bParty = b.seller?.name || b.buyer?.name || '';
          return bParty.localeCompare(aParty);
        }

        if (sortBy === 'expected_asc') return new Date(a.expectedDelivery || 0).getTime() - new Date(b.expectedDelivery || 0).getTime();
        if (sortBy === 'expected_desc') return new Date(b.expectedDelivery || 0).getTime() - new Date(a.expectedDelivery || 0).getTime();

        return String(b.createdAt || b.poNumber).localeCompare(String(a.createdAt || a.poNumber));
      });
  }, [activeTab, orders, searchTerm, sortBy]);
  const { page, pageSize, pageItems: pagedOrders, total, setPage, setPageSize } = usePagination(filteredOrders, 10);

  const totalSpend = orders.filter(order => order.status !== 'cancelled').reduce((sum, order) => sum + Number(order.amount || order.totalValue || 0), 0);
  const deliveredCount = orders.filter(order => order.status === 'delivered').length;
  const openCount = orders.filter(order => openStatuses.includes(String(order.status || '').toLowerCase())).length;

  const completeAction = async () => {
    if (!confirming) return;
    try {
      const endpoint = confirming.action === 'acknowledge'
        ? `/api/purchase-orders/${confirming.order.id}/acknowledge`
        : `/api/purchase-orders/${confirming.order.id}/cancel`;
      const updated = await postApi<PurchaseOrderDto>(endpoint, {});
      setData(current => current.map(order => order.id === updated.id ? { ...order, ...updated } : order));
      toast.success(`PO ${readableStatus(updated.status)}.`);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Unable to update purchase order');
    } finally {
      setConfirming(null);
    }
  };

  const renderOrderActions = (order: PurchaseOrderDto) => {
    const statusLower = String(order.status || '').toLowerCase();
    return (
      <div className="flex flex-wrap justify-end gap-2 items-center">
        <Button variant="outline" onClick={() => setViewingOrder(order)} className="h-8 rounded-md text-[10px] font-black uppercase text-[#12335f] border-slate-200 hover:bg-slate-50"><Eye className="mr-1.5 h-3.5 w-3.5" />View</Button>
        <Button variant="outline" onClick={() => downloadPdf(order)} className="h-8 rounded-md text-[10px] font-black uppercase border-slate-200 hover:bg-slate-50"><Download className="mr-1.5 h-3.5 w-3.5" />PDF</Button>
        {isBuyer && !['cancelled', 'delivered'].includes(statusLower) && <Button variant="outline" onClick={() => setConfirming({ action: 'cancel', order })} className="h-8 rounded-md border-red-200 text-[10px] font-black uppercase text-red-600 hover:bg-red-50"><XCircle className="mr-1.5 h-3.5 w-3.5" />Cancel</Button>}
        {isSeller && statusLower === 'generated' && <Button onClick={() => setConfirming({ action: 'acknowledge', order })} className="h-8 rounded-md bg-[#008080] text-[10px] font-black uppercase text-white hover:bg-teal-700 shadow-sm"><Truck className="mr-1.5 h-3.5 w-3.5" />Acknowledge</Button>}
        {isSeller && statusLower === 'accepted' && (
          <Button
            onClick={() => handleConvertToInvoice(order)}
            className="h-8 rounded-md bg-emerald-600 text-[10px] font-black uppercase text-white hover:bg-emerald-700 shadow-sm"
          >
            Convert to Invoice
          </Button>
        )}
      </div>
    );
  };

  const downloadPdf = (order: PurchaseOrderDto) => {
    const doc = new jsPDF();
    doc.setFillColor(18, 51, 95);
    doc.rect(0, 0, 210, 30, 'F');
    doc.setTextColor(255, 255, 255);
    doc.setFontSize(16);
    doc.text('PURCHASE ORDER', 14, 18);
    doc.setFontSize(10);
    doc.text(order.poNumber, 150, 18);
    doc.setTextColor(15, 23, 42);
    doc.setFontSize(11);
    doc.text(`Title: ${order.title}`, 14, 45);
    doc.text(`Seller: ${order.seller?.name || maskEmail(order.seller?.email)}`, 14, 54);
    doc.text(`Expected: ${formatDate(order.expectedDelivery)}`, 14, 63);
    doc.text(`Status: ${readableStatus(order.status)}`, 120, 45);
    if (order.paymentTerms) doc.text(`Payment: ${order.paymentTerms.replace(/_/g, ' ')}`, 120, 54);
    if (order.deliveryType) doc.text(`Delivery: ${order.deliveryType.replace(/_/g, ' ')}`, 120, 63);
    autoTable(doc, {
      startY: 76,
      head: [['Item', 'Qty', 'Unit Price', 'Total']],
      body: (order.items?.length ? order.items : [{ itemName: order.title, quantity: 1, unitPrice: order.amount, totalAmount: order.amount }]).map(item => [
        item.itemName || order.title,
        item.quantity || 1,
        formatCurrency(item.unitPrice),
        formatCurrency(item.totalAmount || order.amount || order.totalValue)
      ]),
      foot: [['', '', 'Grand Total', formatCurrency(order.amount || order.totalValue)]],
      headStyles: { fillColor: [18, 51, 95] }
    });
    doc.save(`${order.poNumber}.pdf`);
    toast.success('PO PDF generated');
  };

  if (loading && orders.length === 0) return <LoadingState label="Loading purchase orders..." />;

  return (
    <div className="space-y-4">
      <div className="flex flex-col gap-3 border-b border-slate-200 pb-4 md:flex-row md:items-end md:justify-between">
        <div>
          <p className="text-[10px] font-black uppercase tracking-widest text-[#12335f]">Procurement Fulfilment</p>
          <h1 className="text-2xl font-black tracking-tight text-slate-950">Purchase Orders</h1>
          <p className="mt-1 text-xs font-semibold text-slate-500">Live PO register from backend procurement workflows.</p>
        </div>
        <Button variant="outline" onClick={reload} className="h-10 rounded-lg text-xs font-black uppercase"><RefreshCw className="mr-2 h-4 w-4" />Refresh</Button>
      </div>

      <div className="grid grid-cols-2 gap-3 md:grid-cols-3">
        <Metric label="Open POs" value={openCount} icon={FileText} onClick={() => setActiveTab('Open')} active={activeTab === 'Open'} />
        <Metric label="Delivered" value={deliveredCount} icon={CheckCircle2} onClick={() => setActiveTab('Delivered')} active={activeTab === 'Delivered'} />
        <Metric label="Total Value" value={formatCurrency(totalSpend)} icon={ShieldCheck} onClick={() => setActiveTab('All')} active={activeTab === 'All'} />
      </div>

      {error && <InlineError message={error} onRetry={reload} />}

      <Card>
        <CardContent className="space-y-3 p-4">
          <div className="flex flex-col gap-3 xl:flex-row xl:items-center xl:justify-between">
            <div className="relative min-w-0 flex-1">
              <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
              <input value={searchTerm} onChange={event => setSearchTerm(event.target.value)} placeholder="Search PO, seller, buyer, status..." className="h-10 w-full rounded-lg border border-slate-200 pl-10 pr-3 text-xs font-semibold outline-none focus:ring-2 focus:ring-[#12335f]/20" />
            </div>

            <div className="flex flex-col gap-3 sm:flex-row sm:items-center w-full xl:w-auto">
              <div className="flex flex-wrap items-center gap-3">
                <select value={sortBy} onChange={event => setSortBy(event.target.value)} className="h-10 rounded-lg border border-slate-200 bg-white px-3 text-xs font-bold outline-none focus:ring-2 focus:ring-[#12335f]/20 min-w-[130px]">
                  <option value="newest">Newest</option>
                  <option value="value_high">Value High</option>
                  <option value="value_low">Value Low</option>
                  <option value="status">Status</option>
                </select>

                <div className="flex flex-wrap items-center gap-1 rounded-lg border border-slate-200 bg-slate-50 p-1">
                  {(['Open', 'Delivered', 'Cancelled', 'All'] as const).map(tab => (
                    <button
                      key={tab}
                      type="button"
                      onClick={() => setActiveTab(tab)}
                      className={cn(
                        'rounded-md px-3 py-1.5 text-[10px] font-black uppercase transition-all duration-200',
                        activeTab === tab
                          ? 'bg-[#12335f] text-white shadow-sm shadow-[#12335f]/15'
                          : 'text-slate-600 hover:text-[#12335f] hover:bg-white'
                      )}
                    >
                      {tab}
                    </button>
                  ))}
                </div>
              </div>

              <div className="flex items-center gap-1 rounded-lg border border-slate-200 bg-white p-1 ml-auto sm:ml-0">
                <button
                  type="button"
                  onClick={() => setViewMode('list')}
                  className={cn('flex h-8 w-8 items-center justify-center rounded-md text-slate-500 transition', viewMode === 'list' ? 'bg-[#12335f] text-white' : 'hover:bg-slate-50 hover:text-[#12335f]')}
                  title="List view"
                >
                  <List className="h-4 w-4" />
                </button>
                <button
                  type="button"
                  onClick={() => setViewMode('grid')}
                  className={cn('flex h-8 w-8 items-center justify-center rounded-md text-slate-500 transition', viewMode === 'grid' ? 'bg-[#12335f] text-white' : 'hover:bg-slate-50 hover:text-[#12335f]')}
                  title="Grid view"
                >
                  <LayoutGrid className="h-4 w-4" />
                </button>
              </div>
            </div>
          </div>
        </CardContent>
      </Card>

      {filteredOrders.length === 0 ? <EmptyState title="No purchase orders" description="No live purchase orders match the current filters." /> : viewMode === 'grid' ? (
        <div className="space-y-4">
          <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
            {pagedOrders.map(order => (
              <Card key={order.id} className="border-slate-200 bg-white shadow-sm">
                <CardContent className="space-y-4 p-4">
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <p className="font-mono text-xs font-black text-[#12335f]">{order.poNumber}</p>
                      <h3 className="mt-1 line-clamp-2 text-base font-black leading-snug text-slate-950">{order.title}</h3>
                    </div>
                    <StatusPill status={order.status} />
                  </div>

                  <div className="grid grid-cols-2 gap-3 text-xs">
                    <InfoTile label="Party" value={order.seller?.name || maskEmail(order.seller?.email) || `Seller #${order.sellerId || '-'}`} />
                    <InfoTile label="Value" value={formatCurrency(order.amount || order.totalValue)} />
                    <InfoTile label="Expected" value={formatDate(order.expectedDelivery)} />
                    <InfoTile label="Created" value={formatDate(order.createdAt)} />
                  </div>

                  {(order.paymentTerms || order.deliveryType) && (
                    <div className="flex flex-wrap gap-1.5">
                      {order.paymentTerms && <span className="rounded bg-teal-50 px-2 py-1 text-[9px] font-black uppercase text-teal-700">{order.paymentTerms.replace(/_/g, ' ')}</span>}
                      {order.deliveryType && <span className="rounded bg-blue-50 px-2 py-1 text-[9px] font-black uppercase text-blue-700">{order.deliveryType.replace(/_/g, ' ')}</span>}
                    </div>
                  )}

                  <div className="border-t border-slate-100 pt-3">
                    {renderOrderActions(order)}
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>
          <Pagination page={page} pageSize={pageSize} total={total} onPageChange={setPage} onPageSizeChange={setPageSize} label="orders" />
        </div>
      ) : (
        <div className="overflow-hidden rounded-lg border border-slate-200 bg-white">
          <div className="overflow-x-auto">
            <table className="w-full min-w-[900px] text-left text-sm">
              <thead className="bg-slate-50 text-[10px] font-black uppercase tracking-wider text-slate-500">
                <tr>
                  <th className="p-3">Sr. No</th>
                  <th className="p-3"><SortHeader label="PO" columnKey="po" /></th>
                  <th className="p-3"><SortHeader label="Title" columnKey="title" /></th>
                  <th className="p-3"><SortHeader label="Party" columnKey="party" /></th>
                  <th className="p-3"><SortHeader label="Value" columnKey="value" /></th>
                  <th className="p-3"><SortHeader label="Expected" columnKey="expected" /></th>
                  <th className="p-3"><SortHeader label="Status" columnKey="status" /></th>
                  <th className="p-3 text-right text-[10px] font-black uppercase tracking-wider text-slate-500">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {pagedOrders.map((order, index) => {
                  const rowIndex = (page - 1) * pageSize + index + 1;
                  return (
                    <tr key={order.id} className="hover:bg-slate-50">
                      <td className="p-3 text-xs font-black text-slate-600">{rowIndex}</td>
                      <td className="p-3 font-mono text-xs font-black text-[#12335f]">{order.poNumber}</td>
                      <td className="p-3">
                        <p className="font-black text-slate-900">{order.title}</p>
                        <div className="flex flex-wrap items-center gap-1.5 mt-1">
                          <span className="text-[9px] font-bold text-slate-500">{formatDate(order.createdAt)}</span>
                          {order.paymentTerms && (
                            <span className="text-[9px] font-black text-teal-700 bg-teal-50 px-1.5 py-0.5 rounded uppercase">
                              {order.paymentTerms.replace(/_/g, ' ')}
                            </span>
                          )}
                          {order.deliveryType && (
                            <span className="text-[9px] font-black text-blue-700 bg-blue-50 px-1.5 py-0.5 rounded uppercase">
                              {order.deliveryType.replace(/_/g, ' ')}
                            </span>
                          )}
                        </div>
                      </td>
                      <td className="p-3 text-xs font-bold text-slate-600">{order.seller?.name || maskEmail(order.seller?.email) || `Seller #${order.sellerId || '-'}`}</td>
                      <td className="p-3 text-xs font-black">{formatCurrency(order.amount || order.totalValue)}</td>
                      <td className="p-3 text-xs font-bold text-slate-500">{formatDate(order.expectedDelivery)}</td>
                      <td className="p-3"><StatusPill status={order.status} /></td>
                      <td className="p-3 text-right w-[380px] min-w-[380px]">
                        {renderOrderActions(order)}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
          <Pagination page={page} pageSize={pageSize} total={total} onPageChange={setPage} onPageSizeChange={setPageSize} label="orders" />
        </div>
      )}

      {confirming && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/40 p-4">
          <div className="w-full max-w-md rounded-lg bg-white p-5 shadow-xl">
            <h3 className="text-base font-black text-slate-950">Confirm {confirming.action}</h3>
            <p className="mt-2 text-sm font-semibold text-slate-500">Apply this action to {confirming.order.poNumber}?</p>
            <div className="mt-5 flex justify-end gap-2">
              <Button variant="outline" onClick={() => setConfirming(null)}>No</Button>
              <Button onClick={completeAction} className="bg-[#12335f] text-white">Yes, continue</Button>
            </div>
          </div>
        </div>
      )}

      {viewingOrder && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/60 p-4 backdrop-blur-sm">
          <div className="max-h-[92vh] w-full max-w-3xl overflow-hidden rounded-xl border border-slate-200 bg-white shadow-2xl flex flex-col animate-in fade-in zoom-in-95 duration-150">
            <div className="flex items-start justify-between border-b border-slate-200 bg-slate-50 px-5 py-4 shrink-0">
              <div>
                <p className="text-[10px] font-black uppercase tracking-widest text-[#12335f]">Purchase Order Details</p>
                <h2 className="mt-1 text-lg font-black text-slate-900">{viewingOrder.poNumber}</h2>
              </div>
              <button onClick={() => setViewingOrder(null)} className="flex h-9 w-9 items-center justify-center rounded-md border border-slate-200 text-slate-500 hover:bg-white transition-colors">
                <X className="h-4 w-4" />
              </button>
            </div>

            <div className="overflow-y-auto p-5 space-y-6 flex-1">
              <div className="bg-slate-50 rounded-lg p-4 border border-slate-100">
                <p className="text-[10px] font-black uppercase text-slate-400">Order Title</p>
                <p className="text-base font-black text-slate-900 mt-0.5">{viewingOrder.title}</p>
                <div className="flex flex-wrap gap-2 mt-3">
                  <span className="rounded-lg border border-blue-200 bg-blue-50/50 px-3 py-1 text-[10px] font-black uppercase tracking-wide text-[#12335f]">
                    {readableStatus(viewingOrder.status)}
                  </span>
                  {viewingOrder.paymentTerms && (
                    <span className="rounded-lg border border-teal-200 bg-teal-50/50 px-3 py-1 text-[10px] font-black uppercase tracking-wide text-teal-700">
                      Payment: {viewingOrder.paymentTerms.replace(/_/g, ' ')}
                    </span>
                  )}
                  {viewingOrder.deliveryType && (
                    <span className="rounded-lg border border-purple-200 bg-purple-50/50 px-3 py-1 text-[10px] font-black uppercase tracking-wide text-purple-700">
                      Delivery: {viewingOrder.deliveryType.replace(/_/g, ' ')}
                    </span>
                  )}
                </div>
              </div>

              <div className="grid gap-4 sm:grid-cols-2">
                <div className="space-y-3">
                  <h4 className="text-[11px] font-black uppercase tracking-widest text-[#12335f] border-b border-slate-100 pb-1">Fulfillment Parties</h4>
                  <div className="space-y-2">
                    <div>
                      <p className="text-[9px] font-black uppercase text-slate-400">Buyer (Requester)</p>
                      <p className="text-xs font-bold text-slate-800">{viewingOrder.buyer?.name || 'MSME Portal Buyer'}</p>
                      {viewingOrder.buyer?.email && <p className="text-[10px] font-semibold text-slate-500">{maskEmail(viewingOrder.buyer.email)}</p>}
                    </div>
                    <div>
                      <p className="text-[9px] font-black uppercase text-slate-400">Seller (Provider)</p>
                      <p className="text-xs font-bold text-slate-800">{viewingOrder.seller?.name || maskEmail(viewingOrder.seller?.email) || 'MSME Portal Seller'}</p>
                      {viewingOrder.seller?.email && <p className="text-[10px] font-semibold text-slate-500">{maskEmail(viewingOrder.seller.email)}</p>}
                    </div>
                  </div>
                </div>

                <div className="space-y-3">
                  <h4 className="text-[11px] font-black uppercase tracking-widest text-[#12335f] border-b border-slate-100 pb-1">Fulfillment Settings</h4>
                  <div className="space-y-2">
                    <div>
                      <p className="text-[9px] font-black uppercase text-slate-400">Expected Delivery Date</p>
                      <p className="text-xs font-black text-slate-800">{formatDate(viewingOrder.expectedDelivery)}</p>
                    </div>
                    {viewingOrder.deliveryAddress && (
                      <div>
                        <p className="text-[9px] font-black uppercase text-slate-400">Delivery Address</p>
                        <p className="text-xs font-bold text-slate-600 line-clamp-2">{viewingOrder.deliveryAddress}</p>
                      </div>
                    )}
                  </div>
                </div>
              </div>

              <div className="space-y-3">
                <h4 className="text-[11px] font-black uppercase tracking-widest text-[#12335f] border-b border-slate-100 pb-1">Workflow Tracking & Timestamps</h4>
                <div className="relative border-l border-slate-200 pl-5 ml-2.5 space-y-4 py-1">
                  <div className="relative">
                    <span className="absolute -left-[26px] top-1 flex h-3 w-3 items-center justify-center rounded-full bg-emerald-500 ring-4 ring-emerald-50" />
                    <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-1">
                      <span className="text-xs font-black text-slate-900">Purchase Order Generated</span>
                      <span className="text-[10px] font-mono font-bold text-slate-500">{formatTimestamp(viewingOrder.createdAt)}</span>
                    </div>
                    <p className="text-[10px] font-semibold text-slate-500 mt-0.5">PO record successfully created from procurement bidding workflow.</p>
                  </div>

                  {viewingOrder.status !== 'generated' && viewingOrder.status !== 'cancelled' && (
                    <div className="relative">
                      <span className="absolute -left-[26px] top-1 flex h-3 w-3 items-center justify-center rounded-full bg-emerald-500 ring-4 ring-emerald-50" />
                      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-1">
                        <span className="text-xs font-black text-slate-900">PO Acknowledged by Seller</span>
                        <span className="text-[10px] font-mono font-bold text-slate-500">
                          {viewingOrder.acceptedAt ? formatTimestamp(viewingOrder.acceptedAt) : 'Pending timestamp'}
                        </span>
                      </div>
                      <p className="text-[10px] font-semibold text-slate-500 mt-0.5">Seller acknowledged and committed to fulfilling this order.</p>
                    </div>
                  )}

                  {viewingOrder.status === 'delivered' && (
                    <div className="relative">
                      <span className="absolute -left-[26px] top-1 flex h-3 w-3 items-center justify-center rounded-full bg-emerald-500 ring-4 ring-emerald-50" />
                      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-1">
                        <span className="text-xs font-black text-slate-900">Delivered & Completed</span>
                        <span className="text-[10px] font-mono font-bold text-slate-500">Completed</span>
                      </div>
                      <p className="text-[10px] font-semibold text-slate-500 mt-0.5">Consignment has been safely delivered and confirmed by buyer.</p>
                    </div>
                  )}

                  {viewingOrder.status === 'cancelled' && (
                    <div className="relative">
                      <span className="absolute -left-[26px] top-1 flex h-3 w-3 items-center justify-center rounded-full bg-red-500 ring-4 ring-red-50" />
                      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-1">
                        <span className="text-xs font-black text-red-700">Order Cancelled</span>
                        <span className="text-[10px] font-mono font-bold text-red-500">Cancelled</span>
                      </div>
                      <p className="text-[10px] font-semibold text-red-500 mt-0.5">Fulfillment terminated by one of the parties.</p>
                    </div>
                  )}
                </div>
              </div>

              <div className="space-y-2">
                <h4 className="text-[11px] font-black uppercase tracking-widest text-[#12335f] border-b border-slate-100 pb-1">Line Items</h4>
                <div className="overflow-hidden rounded-lg border border-slate-100 bg-slate-50/50">
                  <table className="w-full text-left text-xs">
                    <thead className="bg-slate-100 text-[9px] font-black uppercase tracking-wider text-slate-500">
                      <tr>
                        <th className="p-2.5">Item Name</th>
                        <th className="p-2.5 w-16 text-center">Qty</th>
                        <th className="p-2.5 text-right w-28">Unit Price</th>
                        <th className="p-2.5 text-right w-28">Total</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100">
                      {(viewingOrder.items?.length ? viewingOrder.items : [{ itemName: viewingOrder.title, quantity: 1, unitPrice: viewingOrder.amount || viewingOrder.totalValue, totalAmount: viewingOrder.amount || viewingOrder.totalValue }]).map((item, idx) => (
                        <tr key={idx} className="hover:bg-slate-50/80">
                          <td className="p-2.5 font-bold text-slate-800">{item.itemName || viewingOrder.title}</td>
                          <td className="p-2.5 text-center font-bold text-slate-600">{Number(item.quantity || 1)}</td>
                          <td className="p-2.5 text-right font-semibold text-slate-600">{formatCurrency(item.unitPrice)}</td>
                          <td className="p-2.5 text-right font-black text-slate-900">{formatCurrency(item.totalAmount || (Number(item.quantity || 1) * Number(item.unitPrice || 0)))}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>

              <div className="flex justify-end pt-2">
                <div className="bg-[#12335f]/5 border border-[#12335f]/10 rounded-xl px-5 py-3 text-right">
                  <span className="text-[10px] font-black uppercase tracking-wider text-[#12335f] block">Grand Total Value</span>
                  <span className="text-xl font-black text-[#12335f] mt-0.5 block">{formatCurrency(viewingOrder.amount || viewingOrder.totalValue)}</span>
                </div>
              </div>
            </div>

            <div className="flex items-center justify-end gap-2 border-t border-slate-200 bg-slate-50 px-5 py-3 shrink-0">
              <Button variant="outline" onClick={() => downloadPdf(viewingOrder)} className="h-10 text-xs font-black uppercase">
                <Download className="mr-2 h-4 w-4" /> Download PDF
              </Button>
              <Button onClick={() => setViewingOrder(null)} className="h-10 bg-[#12335f] text-xs font-black uppercase text-white hover:bg-[#0b2445]">
                Close
              </Button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

function Metric({ label, value, icon: Icon, onClick, active }: { label: string; value: number | string; icon: any; onClick: () => void; active: boolean }) {
  return (
    <button type="button" onClick={onClick} className="text-left">
      <Card className={cn(active && 'border-[#12335f] ring-1 ring-[#12335f]/10')}>
        <CardContent className="flex items-center justify-between p-4">
          <div><p className="text-[10px] font-black uppercase tracking-widest text-slate-400">{label}</p><p className="mt-1 text-xl font-black text-slate-950">{value}</p></div>
          <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-[#12335f] text-white"><Icon className="h-5 w-5" /></div>
        </CardContent>
      </Card>
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

function StatusPill({ status }: { status?: string }) {
  const value = String(status || 'generated').toLowerCase();
  return <span className={cn('inline-flex rounded-lg border px-3 py-1 text-[10px] font-black uppercase tracking-wide', value === 'cancelled' && 'border-red-200 bg-red-50 text-red-700', value === 'delivered' && 'border-green-200 bg-green-50 text-green-700', value !== 'cancelled' && value !== 'delivered' && 'border-blue-200 bg-slate-50 text-[#12335f]')}>{readableStatus(value)}</span>;
}
