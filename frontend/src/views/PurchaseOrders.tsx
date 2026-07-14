import { useMemo, useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { toast } from 'sonner';
import { CheckCircle2, Download, FileText, RefreshCw, Search, ShieldCheck, Truck, XCircle, ArrowUp, ArrowDown, ArrowUpDown, Eye, X, Filter, List, LayoutGrid, Printer } from 'lucide-react';
import { PdfEngine, DocumentConfig, moneyPdf } from '../lib/pdfEngine';
import { Button } from '../components/ui/button';
import { Card, CardContent } from '../components/ui/card';
import { api } from '../lib/api';
import { openFileAsset } from '../lib/files';
import { cn } from '../lib/utils';
import { postApi } from '../features/shared/apiClient';
import { EmptyState, InlineError, LoadingState } from '../features/shared/FeatureStates';
import { formatCurrency, formatDate, maskEmail } from '../features/shared/format';
import { useFeatureQuery, usePaginatedFeatureQuery, useResponsiveViewMode } from '../features/shared/hooks';
import { Pagination } from '../features/shared/Pagination';
import { EntityIdLink } from '../features/shared/EntityIdLink';
import { ViewModeToggle } from '../features/shared/ViewModeToggle';
import { useAuth } from '../hooks/useAuth';
import type { PurchaseOrderDto } from '../features/shared/types';
import { useDeliveryByPO } from '../features/delivery/hooks';

const readableStatus = (value?: string) => String(value || 'generated').replace(/_/g, ' ').replace(/\b\w/g, char => char.toUpperCase());
const openStatuses = ['generated', 'accepted', 'in_fulfillment', 'invoice_submitted', 'order_placed', 'issued'];
const purchaseOrderStatusParam = (tab: 'Open' | 'Delivered' | 'Cancelled' | 'All') => {
  if (tab === 'Delivered') return 'delivered';
  if (tab === 'Cancelled') return 'cancelled';
  return undefined;
};
const isOpenPurchaseOrder = (order: PurchaseOrderDto) => openStatuses.includes(String(order.status || 'generated').toLowerCase());

export default function PurchaseOrders() {
  const { user } = useAuth();
  const router = useRouter();
  const isSeller = user?.role === 'seller';
  const isBuyer = user?.role === 'buyer';

  const [activeTab, setActiveTab] = useState<'Open' | 'Delivered' | 'Cancelled' | 'All'>('Open');
  const [searchTerm, setSearchTerm] = useState('');
  const [debouncedSearch, setDebouncedSearch] = useState('');
  const [sortBy, setSortBy] = useState('newest');
  const [viewMode, setViewMode] = useResponsiveViewMode();
  const [showMobileFilters, setShowMobileFilters] = useState(false);
  const [confirming, setConfirming] = useState<{ action: 'acknowledge' | 'cancel'; order: PurchaseOrderDto } | null>(null);
  const [viewingOrder, setViewingOrder] = useState<PurchaseOrderDto | null>(null);
  const { data: activeDelivery } = useDeliveryByPO(viewingOrder?.id);

  const [repeatingOrder, setRepeatingOrder] = useState<PurchaseOrderDto | null>(null);
  const [repeatQuantity, setRepeatQuantity] = useState(1);
  const [repeatAddress, setRepeatAddress] = useState('');
  const [repeatDeliveryDate, setRepeatDeliveryDate] = useState('');
  const [repeatSubmitting, setRepeatSubmitting] = useState(false);

  const handleOpenRepeatModal = (order: PurchaseOrderDto) => {
    setRepeatingOrder(order);
    const firstItem = order.items?.[0];
    setRepeatQuantity(firstItem ? Number(firstItem.quantity) || 1 : 1);
    setRepeatAddress(order.deliveryAddress || '');
    const defaultDate = new Date();
    defaultDate.setDate(defaultDate.getDate() + 14);
    setRepeatDeliveryDate(defaultDate.toISOString().split('T')[0]);
  };

  const handleConfirmRepeatOrder = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!repeatingOrder) return;
    if (repeatQuantity <= 0) {
      toast.error('Quantity must be greater than zero');
      return;
    }
    if (!repeatAddress.trim()) {
      toast.error('Delivery Address is required');
      return;
    }
    if (!repeatDeliveryDate) {
      toast.error('Delivery Date is required');
      return;
    }

    setRepeatSubmitting(true);
    try {
      await api.post(`/api/purchase-orders/${repeatingOrder.id}/repeat`, {
        quantity: repeatQuantity,
        deliveryAddress: repeatAddress.trim(),
        expectedDelivery: new Date(repeatDeliveryDate).toISOString()
      });
      toast.success('Repeat purchase order placed successfully!');
      setRepeatingOrder(null);
      setViewingOrder(null);
      reload();
    } catch (err: any) {
      console.error(err);
      toast.error(err?.message || 'Failed to place repeat purchase order');
    } finally {
      setRepeatSubmitting(false);
    }
  };
  const viewerScope = `${user?.role || 'guest'}-${user?.id || 'none'}`;

  useEffect(() => {
    const handler = setTimeout(() => {
      setDebouncedSearch(searchTerm);
    }, 400);
    return () => clearTimeout(handler);
  }, [searchTerm]);

  const {
    records: pagedOrders,
    loading,
    refreshing,
    error,
    reload,
    setRecords: setPagedOrders,
    page,
    pageSize,
    total,
    setPage,
    setPageSize
  } = usePaginatedFeatureQuery<PurchaseOrderDto>(
    '/api/purchase-orders',
    {
      q: debouncedSearch,
      status: purchaseOrderStatusParam(activeTab),
      sortBy,
      viewerScope
    },
    10
  );

  const { data: allOrders, reload: reloadAllOrders } = useFeatureQuery<PurchaseOrderDto[]>(
    `/api/purchase-orders?take=500&viewerScope=${encodeURIComponent(viewerScope)}`,
    []
  );

  const visibleOrders = useMemo(() => {
    if (activeTab === 'Open') return pagedOrders.filter(isOpenPurchaseOrder);
    return pagedOrders;
  }, [activeTab, pagedOrders]);

  const totalSpend = useMemo(
    () => allOrders.reduce((sum, order) => sum + Number(order.amount || order.totalValue || 0), 0),
    [allOrders]
  );
  const deliveredCount = useMemo(
    () => allOrders.filter(order => String(order.status || '').toLowerCase() === 'delivered').length,
    [allOrders]
  );
  const openCount = useMemo(
    () => allOrders.filter(isOpenPurchaseOrder).length,
    [allOrders]
  );
  const poHealth = useMemo(() => {
    const now = new Date();
    return allOrders.reduce(
      (acc, order) => {
        const value = Number(order.amount || order.totalValue || 0);
        const status = String(order.status || '').toLowerCase();
        if (isOpenPurchaseOrder(order)) acc.openValue += value;
        if (isSeller && status === 'accepted') acc.invoiceReady += 1;
        if (isSeller && (status === 'generated' || status === 'order_placed')) acc.awaitingSeller += 1;
        const expected = order.expectedDelivery ? new Date(order.expectedDelivery) : null;
        if (expected && expected < now && !['delivered', 'cancelled', 'completed'].includes(status)) {
          acc.deliveryRisk += 1;
        }
        return acc;
      },
      { openValue: 0, invoiceReady: 0, awaitingSeller: 0, deliveryRisk: 0 }
    );
  }, [allOrders, isSeller]);

  const refreshPurchaseOrders = async () => {
    await Promise.all([reload(), reloadAllOrders()]);
  };

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
    } else if (key === 'updated') {
      setSortBy(sortBy === 'updated_asc' ? 'updated_desc' : 'updated_asc');
    }
  };

  const SortHeader = ({ label, columnKey, className = '' }: { label: string; columnKey: string; className?: string }) => {
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
    } else if (columnKey === 'updated') {
      isActive = sortBy === 'updated_asc' || sortBy === 'updated_desc';
      isAsc = sortBy === 'updated_asc';
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

  const completeAction = async () => {
    if (!confirming) return;
    try {
      const endpoint = confirming.action === 'acknowledge'
        ? `/api/purchase-orders/${confirming.order.id}/acknowledge`
        : `/api/purchase-orders/${confirming.order.id}/cancel`;
      const updated = await postApi<PurchaseOrderDto>(endpoint, {});
      setPagedOrders(current => current.map(order => order.id === updated.id ? { ...order, ...updated } : order));
      if (viewingOrder && viewingOrder.id === updated.id) {
        setViewingOrder(updated);
      }
      toast.success(`PO ${readableStatus(updated.status)}.`);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Unable to update purchase order');
    } finally {
      setConfirming(null);
    }
  };

  const renderOrderActions = (order: PurchaseOrderDto) => {
    const statusLower = String(order.status || '').toLowerCase();
    const baseActionClass = 'h-8 justify-start rounded-lg px-2.5 text-[10px] font-black uppercase tracking-wide shadow-none';
    return (
      <div className="ml-auto grid w-full max-w-[17rem] grid-cols-2 gap-1.5">
        <Button variant="outline" onClick={() => setViewingOrder(order)} className={cn(baseActionClass, "border-slate-200 text-[#12335f] hover:bg-slate-50")}><Eye className="mr-1.5 h-3.5 w-3.5" />View</Button>
        {order.deliveryTrackings && order.deliveryTrackings.length > 0 && (
          <Button
            variant="outline"
            onClick={() => {
              const trackId = order.deliveryTrackings?.[0]?.id;
              if (trackId) router.push(`/delivery/${trackId}`);
            }}
            className={cn(baseActionClass, "border-slate-200 text-[#12335f] hover:bg-slate-50")}
          >
            <Truck className="mr-1.5 h-3.5 w-3.5" /> Track
          </Button>
        )}
        <Button variant="outline" onClick={() => exportInvoicePdf(order, 'download')} className={cn(baseActionClass, "border-slate-200 hover:bg-slate-50")}><Download className="mr-1.5 h-3.5 w-3.5" />Invoice</Button>
        <Button variant="outline" onClick={() => exportInvoicePdf(order, 'print')} className={cn(baseActionClass, "border-slate-200 hover:bg-slate-50")}><Printer className="mr-1.5 h-3.5 w-3.5" />Print</Button>
        {isBuyer && !['cancelled', 'delivered'].includes(statusLower) && <Button variant="outline" onClick={() => setConfirming({ action: 'cancel', order })} className={cn(baseActionClass, "col-span-2 border-red-200 text-red-600 hover:bg-red-50")}><XCircle className="mr-1.5 h-3.5 w-3.5" />Cancel order</Button>}
        {isSeller && (statusLower === 'generated' || statusLower === 'order_placed') && <Button onClick={() => setConfirming({ action: 'acknowledge', order })} className={cn(baseActionClass, "col-span-2 bg-[#008080] text-white hover:bg-teal-700 shadow-sm")}><Truck className="mr-1.5 h-3.5 w-3.5" />Acknowledge</Button>}
        {isSeller && statusLower === 'accepted' && (
          <Button
            onClick={() => handleConvertToInvoice(order)}
            className={cn(baseActionClass, "col-span-2 bg-emerald-600 text-white hover:bg-emerald-700 shadow-sm")}
          >
            Convert to Invoice
          </Button>
        )}
      </div>
    );
  };



  const exportInvoicePdf = async (baseOrder: PurchaseOrderDto, mode: 'download' | 'print') => {
    let order = baseOrder;
    try {
      const res = await api.get(`/api/purchase-orders/${baseOrder.id}`);
      if ((res as any).data) {
        order = { ...baseOrder, ...(res as any).data };
      }
    } catch (err) {
      console.warn('Failed to fetch full PO details for PDF, using list data');
    }

    const totalValue = Number(order.amount || order.totalValue || 0);
    
    // Fallback items if none exist
    const items = order.items?.length ? order.items : [{
      itemName: order.title,
      quantity: 1,
      unitPrice: totalValue,
      totalAmount: totalValue
    }];

    const tableData = items.map((item, index) => {
      const qty = Number(item.quantity || 1);
      const unitPrice = Number(item.unitPrice || 0);
      const lineTotal = Number(item.totalAmount || qty * unitPrice || totalValue);
      return [
        String(index + 1),
        item.itemName || order.title,
        String(qty),
        unitPrice || (lineTotal / Math.max(qty, 1)),
        lineTotal
      ];
    });

    const subtotal = tableData.reduce((sum, row) => sum + Number(row[4] || 0), 0) || totalValue;

    const config: DocumentConfig = {
      documentTitle: 'Purchase Order / Supplier Invoice Copy',
      documentNumber: order.poNumber || `PO-${order.id}`,
      dateStr: formatTimestamp(new Date()),
      status: readableStatus(order.status),
      parties: [
        {
          title: 'Buyer / Requesting Organization',
          name: order.buyer?.name || 'MSME Portal Buyer',
          email: order.buyer?.email ? maskEmail(order.buyer.email) : undefined,
          address: order.deliveryAddress || 'Ship To: As per purchase order',
        },
        {
          title: 'Seller / Supplier Organization',
          name: order.seller?.name || 'MSME Portal Seller',
          email: order.seller?.email ? maskEmail(order.seller.email) : undefined,
          details: [`Seller ID: ${order.sellerId || '-'}`]
        }
      ],
      infoGrid: {
        'Payment Terms': order.paymentTerms ? readableStatus(order.paymentTerms) : 'As per portal workflow',
        'Delivery Type': order.deliveryType ? readableStatus(order.deliveryType) : 'Standard delivery',
        'Acknowledged At': order.acceptedAt ? formatTimestamp(order.acceptedAt) : 'Pending / Not recorded',
        'PO Reference': `ID ${order.id}`,
        'PO Title': order.title || 'N/A',
        'Expected Delivery': formatDate(order.expectedDelivery)
      },
      tableHeaders: ['Sr.', 'Description of Goods / Services', 'Qty', 'Rate', 'Line Total'],
      tableData: tableData.map(row => [row[0], row[1], row[2], moneyPdf(row[3]), moneyPdf(row[4])]),
      financials: {
        subtotal: subtotal,
        grandTotal: totalValue || subtotal
      },
      notes: [
        '1. This document is generated from the JSGSMILE MSME procurement workflow and must be read with linked GRN, invoice and payment records.',
        '2. Supplier must fulfil quantity, quality, delivery schedule, taxes and documentation requirements recorded against the purchase order.',
        '3. Buyer approval, payment release and settlement remain subject to portal approval matrix, delivery confirmation and invoice verification.'
      ]
    };

    const engine = new PdfEngine('p');
    const doc = engine.generate(config);
    
    const filename = `${order.poNumber || `PO-${order.id}`}-procurement-invoice.pdf`;
    if (mode === 'print') {
      doc.autoPrint();
      window.open(doc.output('bloburl'), '_blank');
      toast.success('Invoice opened for printing');
      return;
    }
    doc.save(filename);
    toast.success('Detailed invoice PDF generated');
  };

  if (loading && pagedOrders.length === 0) return <LoadingState label="Loading purchase orders..." />;

  return (
    <div className="space-y-6">
      {/* Transparent Header */}
      <div className="flex flex-col gap-2 md:flex-row md:items-center md:justify-between py-2">
        <div className="min-w-0">
          <span className="text-[10px] font-black uppercase tracking-widest text-[#12335f] bg-[#12335f]/10 px-2.5 py-1 rounded-full">Procurement Fulfilment</span>
          <h1 className="text-3xl font-black tracking-tight text-slate-900 mt-2">Purchase Orders</h1>
          <p className="text-xs font-semibold text-slate-500 mt-1">Live PO register from backend procurement workflows.</p>
        </div>
        <div className="flex items-center gap-2">
          <Button variant="outline" onClick={refreshPurchaseOrders} className="h-10 rounded-lg text-xs font-black uppercase bg-white hover:bg-slate-50 border-slate-200 shadow-sm">
            <RefreshCw className={cn("mr-2 h-4 w-4 text-[#12335f]", refreshing && "animate-spin")} />
            Refresh
          </Button>
        </div>
      </div>

      {/* KPI Cards Grid */}
      <div className="grid grid-cols-2 gap-4 md:grid-cols-3 lg:grid-cols-6">
        <KpiCard label="Open POs" value={openCount} icon={FileText} onClick={() => setActiveTab('Open')} active={activeTab === 'Open'} color="blue" />
        <KpiCard label="Delivered" value={deliveredCount} icon={CheckCircle2} onClick={() => setActiveTab('Delivered')} active={activeTab === 'Delivered'} color="green" />
        <KpiCard label="Total Value" value={formatCurrency(totalSpend)} icon={ShieldCheck} onClick={() => setActiveTab('All')} active={activeTab === 'All'} color="indigo" />
        <KpiCard label="Open Value" value={formatCurrency(poHealth.openValue)} icon={ShieldCheck} onClick={() => setActiveTab('Open')} active={activeTab === 'Open'} color="amber" />
        <KpiCard label={isSeller ? 'Invoice Ready' : 'Awaiting Seller'} value={isSeller ? poHealth.invoiceReady : allOrders.filter(order => String(order.status || '').toLowerCase() === 'generated').length} icon={Truck} onClick={() => setActiveTab('Open')} active={false} color="purple" />
        <KpiCard label="Delivery Risk" value={poHealth.deliveryRisk} icon={XCircle} onClick={() => setActiveTab('Open')} active={false} color="red" />
      </div>

      {error && <InlineError message={error} onRetry={reload} />}

      {/* Inline Filters Bar */}
      <div className="flex flex-col gap-3 md:flex-row md:items-center justify-between border-y border-slate-200 bg-slate-50/50 py-3 px-1">
        <div className="relative min-w-0 flex-1 max-w-md">
          <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
          <input
            value={searchTerm}
            onChange={event => setSearchTerm(event.target.value)}
            placeholder="Search PO, seller, buyer, status..."
            className="h-10 w-full rounded-lg border border-slate-200 bg-white pl-10 pr-3 text-xs font-semibold outline-none focus:ring-2 focus:ring-[#12335f]/20"
          />
        </div>

        <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
          <select
            value={sortBy}
            onChange={event => setSortBy(event.target.value)}
            className="h-10 min-w-[130px] rounded-lg border border-slate-200 bg-white px-3 text-xs font-bold outline-none focus:ring-2 focus:ring-[#12335f]/20"
          >
            <option value="newest">Newest</option>
            <option value="value_high">Value High</option>
            <option value="value_low">Value Low</option>
            <option value="status">Status</option>
          </select>

          <div className="flex min-w-0 items-center gap-1 rounded-lg border border-slate-200 bg-white p-1">
            {(['Open', 'Delivered', 'Cancelled', 'All'] as const).map(tab => (
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

      {visibleOrders.length === 0 ? (
        <EmptyState
          title="No purchase orders"
          description={searchTerm || activeTab !== 'All' ? 'No purchase orders match the current search, status tab, or sorting filters.' : 'No purchase orders have been generated from procurement awards yet.'}
        />
      ) : viewMode === 'grid' ? (
        <div className="space-y-4">
          <div className="grid gap-4 md:grid-cols-2 2xl:grid-cols-3">
            {visibleOrders.map((order, index) => {
              const rowIndex = (page - 1) * pageSize + index + 1;
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
                        <h3 className="mt-2 line-clamp-2 text-sm font-black leading-snug text-slate-900 group-hover:text-[#12335f] transition-colors">{order.title}</h3>
                      </div>
                      <StatusPill status={order.status} />
                    </div>

                    <div className="grid grid-cols-2 gap-2.5 text-[10px] font-semibold text-slate-500 pt-1">
                      <InfoTile label="Party" value={order.seller?.name || maskEmail(order.seller?.email) || `Seller #${order.sellerId || '-'}`} />
                      <InfoTile label="Value" value={formatCurrency(order.amount || order.totalValue)} />
                      <InfoTile label="Expected" value={formatDate(order.expectedDelivery)} />
                      <InfoTile label="Created" value={formatDate(order.createdAt)} />
                    </div>

                    {(order.paymentTerms || order.deliveryType) && (
                      <div className="flex flex-wrap gap-1.5 pt-1">
                        {order.paymentTerms && <span className="rounded bg-teal-50 px-2 py-0.5 text-[9px] font-black uppercase text-teal-700">{readableStatus(order.paymentTerms)}</span>}
                        {order.deliveryType && <span className="rounded bg-blue-50 px-2 py-0.5 text-[9px] font-black uppercase text-blue-700">{readableStatus(order.deliveryType)}</span>}
                      </div>
                    )}
                  </div>

                  <div className="mt-4 border-t border-slate-100 pt-3">
                    {renderOrderActions(order)}
                  </div>
                </div>
              );
            })}
          </div>
          <Pagination page={page} pageSize={pageSize} total={total} onPageChange={setPage} onPageSizeChange={setPageSize} label="orders" />
        </div>
      ) : (
        <div className="overflow-hidden rounded-2xl border border-slate-200/80 bg-white shadow-sm">
          <div className="overflow-x-auto">
            <table className="w-full min-w-[1000px] border-collapse text-left text-xs">
              <thead>
                <tr className="border-b border-slate-200 bg-slate-50/75">
                  <th className="p-3 text-[10px] font-black uppercase tracking-wider text-slate-500 w-16">Sr. No</th>
                  <th className="p-3"><SortHeader label="PO" columnKey="po" /></th>
                  <th className="p-3"><SortHeader label="Title" columnKey="title" /></th>
                  <th className="p-3"><SortHeader label="Party" columnKey="party" /></th>
                  <th className="p-3"><SortHeader label="Value" columnKey="value" /></th>
                  <th className="p-3"><SortHeader label="Expected" columnKey="expected" /></th>
                  <th className="p-3"><SortHeader label="Updated At" columnKey="updated" /></th>
                  <th className="p-3"><SortHeader label="Status" columnKey="status" /></th>
                  <th className="p-3 text-right text-[10px] font-black uppercase tracking-wider text-slate-500">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 font-semibold text-slate-700">
                {visibleOrders.map((order, index) => {
                  const rowIndex = (page - 1) * pageSize + index + 1;
                  return (
                    <tr key={order.id} className="hover:bg-slate-50/50 transition">
                      <td className="p-3 font-mono text-xs text-slate-500">
                        {String(rowIndex).padStart(2, '0')}
                      </td>
                      <td className="p-3 font-mono text-xs font-black text-[#12335f]">
                        <EntityIdLink label={order.poNumber} id={order.id} size="sm" onClick={() => setViewingOrder(order)} />
                      </td>
                      <td className="p-3">
                        <p className="font-bold text-slate-900">{order.title}</p>
                        <div className="flex flex-wrap items-center gap-1.5 mt-1">
                          <span className="text-[9px] font-bold text-slate-500">{formatDate(order.createdAt)}</span>
                          {order.paymentTerms && (
                            <span className="text-[9px] font-black text-teal-700 bg-teal-50 px-1.5 py-0.5 rounded uppercase">
                              {readableStatus(order.paymentTerms)}
                            </span>
                          )}
                          {order.deliveryType && (
                            <span className="text-[9px] font-black text-blue-700 bg-blue-50 px-1.5 py-0.5 rounded uppercase">
                              {readableStatus(order.deliveryType)}
                            </span>
                          )}
                        </div>
                      </td>
                      <td className="p-3 text-slate-600">{order.seller?.name || maskEmail(order.seller?.email) || `Seller #${order.sellerId || '-'}`}</td>
                      <td className="p-3 font-bold text-slate-900">{formatCurrency(order.amount || order.totalValue)}</td>
                      <td className="p-3 text-slate-500">{formatDate(order.expectedDelivery)}</td>
                      <td className="p-3">
                        {order.updatedAt ? (
                          <div>
                            <p className="text-slate-700">{formatDate(order.updatedAt)}</p>
                            <p className="text-[9px] font-semibold text-slate-400 mt-0.5">
                              {new Date(order.updatedAt).toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit', hour12: true })}
                            </p>
                          </div>
                        ) : (
                          <span className="text-slate-400">—</span>
                        )}
                      </td>
                      <td className="p-3"><StatusPill status={order.status} /></td>
                      <td className="p-3 text-right w-[18rem] min-w-[18rem]">
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
        <div className="fixed inset-0 z-[60] flex items-center justify-center bg-slate-950/50 p-4 backdrop-blur-sm">
          <div className="w-full max-w-md rounded-lg bg-white p-5 shadow-xl">
            <div className="flex items-center justify-between border-b border-slate-100 pb-3">
              <h3 className="text-base font-black text-slate-950 capitalize">Confirm {confirming.action}</h3>
              <button
                type="button"
                onClick={() => setConfirming(null)}
                className="text-slate-400 hover:text-slate-600 transition-colors"
                aria-label="Close dialog"
              >
                <X className="h-4 w-4" />
              </button>
            </div>
            <p className="mt-3 text-sm font-semibold text-slate-500">Apply this action to {confirming.order.poNumber}?</p>
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
                      Payment: {readableStatus(viewingOrder.paymentTerms)}
                    </span>
                  )}
                  {viewingOrder.deliveryType && (
                    <span className="rounded-lg border border-purple-200 bg-purple-50/50 px-3 py-1 text-[10px] font-black uppercase tracking-wide text-purple-700">
                      Delivery: {readableStatus(viewingOrder.deliveryType)}
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
                    {viewingOrder.deliveryTrackings && viewingOrder.deliveryTrackings.length > 0 && (
                      <div>
                        <p className="text-[9px] font-black uppercase text-slate-400">Delivery Status / Tracking</p>
                        <div className="mt-1 flex flex-col gap-1.5">
                          {viewingOrder.deliveryTrackings.map((dt: any) => (
                            <div key={dt.id} className="flex items-center gap-2">
                              <EntityIdLink
                                label={dt.trackingNumber || `DLV-${dt.id}`}
                                id={dt.id}
                                size="sm"
                                onClick={() => {
                                  setViewingOrder(null);
                                  router.push(`/delivery/${dt.id}`);
                                }}
                              />
                              <span className="text-[10px] font-bold text-slate-500 uppercase">({readableStatus(dt.status || 'pending')})</span>
                            </div>
                          ))}
                        </div>
                      </div>
                    )}
                  </div>
                </div>
              </div>

              {activeDelivery && (
                <div className="rounded-lg border border-blue-100 bg-blue-50/30 p-3.5 space-y-2">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-1.5">
                      <Truck className="h-4 w-4 text-[#12335f]" />
                      <span className="text-xs font-black text-[#12335f]">Shipment Tracking</span>
                    </div>
                    <span className="text-[9px] font-black uppercase bg-[#12335f]/10 text-[#12335f] px-2 py-0.5 rounded border border-[#12335f]/20">
                      {readableStatus(activeDelivery.status || 'pending')}
                    </span>
                  </div>
                  <div className="text-[11px] font-semibold text-slate-600 space-y-0.5">
                    {activeDelivery.carrierName && <p>Carrier: <span className="font-bold text-slate-800">{activeDelivery.carrierName}</span></p>}
                    {activeDelivery.trackingNumber && <p>Tracking No: <span className="font-bold text-slate-800">{activeDelivery.trackingNumber}</span></p>}
                    {activeDelivery.expectedDelivery && <p>Expected Delivery: <span className="font-bold text-slate-800">{formatDate(activeDelivery.expectedDelivery)}</span></p>}
                  </div>
                  <Button 
                    size="sm"
                    className="w-full bg-[#12335f] text-white hover:bg-[#0b2445] text-[10px] font-black uppercase tracking-wider h-8 mt-1"
                    onClick={() => {
                      setViewingOrder(null);
                      router.push(`/delivery/${activeDelivery.id}`);
                    }}
                  >
                    Track Shipment Details
                  </Button>
                </div>
              )}

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

                  {(() => {
                    const viewingStatusLower = String(viewingOrder.status || '').toLowerCase();
                    return viewingStatusLower !== 'generated' && viewingStatusLower !== 'order_placed' && viewingStatusLower !== 'cancelled' && (
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
                    );
                  })()}

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

              {/* Terms & Documents section */}
              {(() => {
                const terms = (viewingOrder.metadata as any)?.termsDocuments || {};
                const docs = (Array.isArray(terms.documents) ? terms.documents : []) as Array<{
                  documentType: string;
                  fileAssetId: number;
                  fileName: string;
                  fileSize: number;
                }>;
                
                const hasTerms = terms.deliveryTerms || terms.paymentTerms || terms.warrantyTerms || terms.inspectionTerms || terms.delayPenaltyDetails || terms.additionalTerms;
                const hasDocs = docs.length > 0;

                if (!hasTerms && !hasDocs) return null;

                return (
                  <div className="space-y-3">
                    <h4 className="text-[11px] font-black uppercase tracking-widest text-[#12335f] border-b border-slate-100 pb-1">Procurement Terms & Documents</h4>
                    <div className="grid gap-4 sm:grid-cols-2 text-xs">
                      {hasTerms && (
                        <div className="space-y-2">
                          {terms.deliveryTerms && <div><p className="text-[9px] font-black uppercase text-slate-400">Delivery Terms</p><p className="font-semibold text-slate-700">{terms.deliveryTerms}</p></div>}
                          {terms.paymentTerms && <div><p className="text-[9px] font-black uppercase text-slate-400">Payment Terms</p><p className="font-semibold text-slate-700">{terms.paymentTerms}</p></div>}
                          {terms.warrantyTerms && <div><p className="text-[9px] font-black uppercase text-slate-400">Warranty Terms</p><p className="font-semibold text-slate-700">{terms.warrantyTerms}</p></div>}
                          {terms.inspectionTerms && <div><p className="text-[9px] font-black uppercase text-slate-400">Inspection Terms</p><p className="font-semibold text-slate-700">{terms.inspectionTerms}</p></div>}
                          {terms.delayPenaltyDetails && <div><p className="text-[9px] font-black uppercase text-slate-400">Delay Penalty Details</p><p className="font-semibold text-slate-700">{terms.delayPenaltyDetails}</p></div>}
                          {terms.additionalTerms && <div><p className="text-[9px] font-black uppercase text-slate-400">Additional Terms</p><p className="font-semibold text-slate-700">{terms.additionalTerms}</p></div>}
                        </div>
                      )}
                      {hasDocs && (
                        <div className="space-y-2">
                          <p className="text-[9px] font-black uppercase text-slate-400">Uploaded Procurement Documents</p>
                          <div className="space-y-1.5">
                            {docs.map((doc, dIdx) => (
                              <div key={dIdx} className="flex items-center gap-2 rounded-md bg-slate-50 border border-slate-100 px-3 py-2">
                                <FileText className="h-4 w-4 shrink-0 text-slate-400" />
                                <div className="min-w-0 flex-1">
                                  <p className="text-[10px] font-black text-slate-400 uppercase tracking-wider">{doc.documentType}</p>
                                  <button
                                    type="button"
                                    onClick={() => {
                                      openFileAsset({
                                        id: doc.fileAssetId,
                                        fileAssetId: doc.fileAssetId,
                                        originalName: doc.fileName,
                                      }, doc.fileName).catch(err => {
                                        toast.error(err instanceof Error ? err.message : 'Unable to open document');
                                      });
                                    }}
                                    className="block truncate text-xs font-bold text-[#12335f] hover:underline text-left w-full"
                                  >
                                    {doc.fileName}
                                  </button>
                                </div>
                                <span className="text-[10px] font-bold text-slate-400 shrink-0">({(doc.fileSize / 1024).toFixed(0)} KB)</span>
                              </div>
                            ))}
                          </div>
                        </div>
                      )}
                    </div>
                  </div>
                );
              })()}

              <div className="space-y-2">
                <h4 className="text-[11px] font-black uppercase tracking-widest text-[#12335f] border-b border-slate-100 pb-1">Line Items</h4>
                <div className="overflow-hidden rounded-lg border border-slate-100 bg-slate-50/50">
                  <table className="w-full text-left text-xs">
                    <thead className="bg-slate-100 text-[9px] font-black uppercase tracking-wider text-slate-500">
                      <tr>
                        <th className="w-16 p-2.5">Sr. No</th>
                        <th className="p-2.5">Item Name</th>
                        <th className="p-2.5 w-16 text-center">Qty</th>
                        <th className="p-2.5 text-right w-28">Unit Price</th>
                        <th className="p-2.5 text-right w-28">Total</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100">
                      {(viewingOrder.items?.length ? viewingOrder.items : [{ itemName: viewingOrder.title, quantity: 1, unitPrice: viewingOrder.amount || viewingOrder.totalValue, totalAmount: viewingOrder.amount || viewingOrder.totalValue }]).map((item, idx) => (
                        <tr key={idx} className="hover:bg-slate-50/80">
                          <td className="p-2.5 text-xs font-black text-slate-500">{String(idx + 1).padStart(2, '0')}</td>
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

            <div className="flex flex-wrap items-center justify-end gap-2 border-t border-slate-200 bg-slate-50 px-5 py-3 shrink-0">
              {(() => {
                const viewingStatusLower = String(viewingOrder.status || '').toLowerCase();
                return (
                  <>
                    {isSeller && (viewingStatusLower === 'generated' || viewingStatusLower === 'order_placed') && (
                      <Button
                        onClick={() => setConfirming({ action: 'acknowledge', order: viewingOrder })}
                        className="h-10 bg-[#008080] text-xs font-black uppercase text-white hover:bg-teal-700 shadow-sm"
                      >
                        <Truck className="mr-2 h-4 w-4" /> Acknowledge PO
                      </Button>
                    )}
                    {isSeller && viewingStatusLower === 'accepted' && (
                      <Button
                        onClick={() => {
                          setViewingOrder(null);
                          handleConvertToInvoice(viewingOrder);
                        }}
                        className="h-10 bg-emerald-600 text-xs font-black uppercase text-white hover:bg-emerald-700 shadow-sm"
                      >
                        Convert to Invoice
                      </Button>
                    )}
                    {isBuyer && !['cancelled', 'delivered'].includes(viewingStatusLower) && (
                      <Button
                        onClick={() => setConfirming({ action: 'cancel', order: viewingOrder })}
                        className="h-10 border-red-200 text-xs font-black uppercase text-red-600 hover:bg-red-50"
                      >
                        <XCircle className="mr-2 h-4 w-4" /> Cancel PO
                      </Button>
                    )}
                    {isBuyer && viewingStatusLower === 'delivered' && (
                      <Button
                        onClick={() => handleOpenRepeatModal(viewingOrder)}
                        className="h-10 bg-[#12335f] text-xs font-black uppercase text-white hover:bg-[#0b2445] shadow-sm"
                      >
                        <RefreshCw className="mr-2 h-4 w-4" /> Repeat Order
                      </Button>
                    )}
                  </>
                );
              })()}
              <Button variant="outline" onClick={() => exportInvoicePdf(viewingOrder, 'print')} className="h-10 text-xs font-black uppercase">
                <Printer className="mr-2 h-4 w-4" /> Print Invoice
              </Button>
              <Button variant="outline" onClick={() => exportInvoicePdf(viewingOrder, 'download')} className="h-10 text-xs font-black uppercase">
                <Download className="mr-2 h-4 w-4" /> Download Invoice PDF
              </Button>
              <Button onClick={() => setViewingOrder(null)} className="h-10 bg-[#12335f] text-xs font-black uppercase text-white hover:bg-[#0b2445]">
                Close
              </Button>
            </div>
          </div>
        </div>
      )}
      {repeatingOrder && (
        <div className="fixed inset-0 z-[80] flex items-center justify-center bg-slate-950/60 p-4 backdrop-blur-sm" role="dialog" aria-modal="true">
          <div className="w-full max-w-md overflow-hidden rounded-[24px] bg-white shadow-2xl ring-1 ring-slate-200">
            <div className="border-b border-slate-100 bg-slate-50/50 px-5 py-4">
              <div className="flex items-center gap-2">
                <RefreshCw className="h-5 w-5 text-[#12335f]" />
                <h3 className="text-sm font-black text-slate-900 uppercase tracking-wide">Repeat Purchase Order</h3>
              </div>
              <p className="mt-1 text-[11px] font-semibold text-slate-500">
                Replicating completed order <span className="font-bold text-slate-800">{repeatingOrder.poNumber}</span>.
              </p>
            </div>
            <form onSubmit={handleConfirmRepeatOrder} className="p-5 space-y-4 text-xs font-semibold text-slate-700">
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
              <div>
                <label className="block text-[10px] font-black uppercase tracking-wider text-slate-500 mb-1">Quantity</label>
                <input
                  type="number"
                  min="1"
                  step="1"
                  required
                  value={repeatQuantity}
                  onChange={(e) => setRepeatQuantity(Number(e.target.value))}
                  className="h-10 w-full rounded-xl border border-slate-200 px-3 text-xs font-bold text-slate-800 outline-none focus:border-[#12335f] focus:ring-2 focus:ring-[#12335f]/10"
                />
              </div>
              <div>
                <label className="block text-[10px] font-black uppercase tracking-wider text-slate-500 mb-1">Expected Delivery Date</label>
                <input
                  type="date"
                  required
                  value={repeatDeliveryDate}
                  onChange={(e) => setRepeatDeliveryDate(e.target.value)}
                  className="h-10 w-full rounded-xl border border-slate-200 px-3 text-xs font-bold text-slate-800 outline-none focus:border-[#12335f] focus:ring-2 focus:ring-[#12335f]/10"
                />
              </div>
              <div>
                <label className="block text-[10px] font-black uppercase tracking-wider text-slate-500 mb-1">Delivery Address</label>
                <textarea
                  required
                  rows={2}
                  value={repeatAddress}
                  onChange={(e) => setRepeatAddress(e.target.value)}
                  className="w-full rounded-xl border border-slate-200 px-3 py-2 text-xs font-bold text-slate-800 outline-none focus:border-[#12335f] focus:ring-2 focus:ring-[#12335f]/10"
                />
              </div>
              <div className="flex items-center justify-between border-t border-slate-100 pt-3">
                <span className="text-[10px] font-black uppercase tracking-wider text-slate-500">Estimated Value</span>
                <span className="text-sm font-black text-[#12335f]">
                  {formatCurrency((Number(repeatingOrder.items?.[0]?.unitPrice) || Number(repeatingOrder.amount)) * repeatQuantity)}
                </span>
              </div>
              <div className="flex justify-end gap-2 border-t border-slate-100 pt-3">
                <Button type="button" variant="outline" onClick={() => setRepeatingOrder(null)} className="h-9 text-[10px] font-black uppercase">Cancel</Button>
                <Button type="submit" disabled={repeatSubmitting} className="h-9 bg-[#12335f] text-[10px] font-black uppercase text-white hover:bg-[#0b2445]">
                  {repeatSubmitting ? 'Placing Order...' : 'Confirm Order'}
                </Button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}

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

function StatusPill({ status }: { status?: string }) {
  const value = String(status || 'generated').toLowerCase();
  return <span className={cn('inline-flex rounded-lg border px-3 py-1 text-[10px] font-black uppercase tracking-wide', value === 'cancelled' && 'border-red-200 bg-red-50 text-red-700', value === 'delivered' && 'border-green-200 bg-green-50 text-green-700', value !== 'cancelled' && value !== 'delivered' && 'border-blue-200 bg-slate-50 text-[#12335f]')}>{readableStatus(value)}</span>;
}
