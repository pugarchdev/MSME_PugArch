import { useMemo, useState } from 'react';
import jsPDF from 'jspdf';
import autoTable from 'jspdf-autotable';
import { toast } from 'sonner';
import { CheckCircle2, Download, FileText, RefreshCw, Search, ShieldCheck, Truck, XCircle } from 'lucide-react';
import { Button } from '../components/ui/button';
import { Card, CardContent } from '../components/ui/card';
import { cn } from '../lib/utils';
import { postApi } from '../features/shared/apiClient';
import { EmptyState, InlineError, LoadingState } from '../features/shared/FeatureStates';
import { formatCurrency, formatDate, maskEmail } from '../features/shared/format';
import { useFeatureQuery } from '../features/shared/hooks';
import type { PurchaseOrderDto } from '../features/shared/types';

const readableStatus = (value?: string) => String(value || 'generated').replace(/_/g, ' ').replace(/\b\w/g, char => char.toUpperCase());
const openStatuses = ['generated', 'accepted', 'in_fulfillment', 'delivered', 'invoice_submitted'];

export default function PurchaseOrders() {
  const { data: orders, loading, error, reload, setData } = useFeatureQuery<PurchaseOrderDto[]>('/api/purchase-orders', []);
  const [activeTab, setActiveTab] = useState<'Open' | 'Delivered' | 'Cancelled' | 'All'>('Open');
  const [searchTerm, setSearchTerm] = useState('');
  const [sortBy, setSortBy] = useState('newest');
  const [confirming, setConfirming] = useState<{ action: 'acknowledge' | 'cancel'; order: PurchaseOrderDto } | null>(null);

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
        if (sortBy === 'status') return String(a.status || '').localeCompare(String(b.status || ''));
        return String(b.createdAt || b.poNumber).localeCompare(String(a.createdAt || a.poNumber));
      });
  }, [activeTab, orders, searchTerm, sortBy]);

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

  if (loading) return <LoadingState label="Loading purchase orders..." />;

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

      <div className="grid grid-cols-1 gap-3 md:grid-cols-3">
        <Metric label="Open POs" value={openCount} icon={FileText} onClick={() => setActiveTab('Open')} active={activeTab === 'Open'} />
        <Metric label="Delivered" value={deliveredCount} icon={CheckCircle2} onClick={() => setActiveTab('Delivered')} active={activeTab === 'Delivered'} />
        <Metric label="Total Value" value={formatCurrency(totalSpend)} icon={ShieldCheck} onClick={() => setActiveTab('All')} active={activeTab === 'All'} />
      </div>

      {error && <InlineError message={error} onRetry={reload} />}

      <Card>
        <CardContent className="space-y-3 p-4">
          <div className="grid grid-cols-1 gap-3 md:grid-cols-[1fr_180px_auto]">
            <div className="relative">
              <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
              <input value={searchTerm} onChange={event => setSearchTerm(event.target.value)} placeholder="Search PO, seller, buyer, status..." className="h-10 w-full rounded-lg border border-slate-200 pl-10 pr-3 text-xs font-semibold outline-none focus:ring-2 focus:ring-[#12335f]/20" />
            </div>
            <select value={sortBy} onChange={event => setSortBy(event.target.value)} className="h-10 rounded-lg border border-slate-200 bg-white px-3 text-xs font-bold">
              <option value="newest">Newest</option>
              <option value="value_high">Value high</option>
              <option value="value_low">Value low</option>
              <option value="status">Status</option>
            </select>
            <div className="flex flex-wrap gap-2">
              {(['Open', 'Delivered', 'Cancelled', 'All'] as const).map(tab => (
                <button key={tab} type="button" onClick={() => setActiveTab(tab)} className={cn('rounded-lg px-3 py-2 text-[10px] font-black uppercase', activeTab === tab ? 'bg-[#12335f] text-white' : 'bg-slate-100 text-slate-600')}>{tab}</button>
              ))}
            </div>
          </div>
        </CardContent>
      </Card>

      {filteredOrders.length === 0 ? <EmptyState title="No purchase orders" description="No live purchase orders match the current filters." /> : (
        <div className="overflow-hidden rounded-lg border border-slate-200 bg-white">
          <div className="overflow-x-auto">
            <table className="w-full min-w-[900px] text-left text-sm">
              <thead className="bg-slate-50 text-[10px] font-black uppercase tracking-wider text-slate-500">
                <tr><th className="p-3">PO</th><th className="p-3">Title</th><th className="p-3">Party</th><th className="p-3">Value</th><th className="p-3">Expected</th><th className="p-3">Status</th><th className="p-3 text-right">Actions</th></tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {filteredOrders.map(order => (
                  <tr key={order.id} className="hover:bg-slate-50">
                    <td className="p-3 font-mono text-xs font-black text-[#12335f]">{order.poNumber}</td>
                    <td className="p-3"><p className="font-black text-slate-900">{order.title}</p><p className="text-[10px] font-semibold text-slate-500">{formatDate(order.createdAt)}</p></td>
                    <td className="p-3 text-xs font-bold text-slate-600">{order.seller?.name || maskEmail(order.seller?.email) || `Seller #${order.sellerId || '-'}`}</td>
                    <td className="p-3 text-xs font-black">{formatCurrency(order.amount || order.totalValue)}</td>
                    <td className="p-3 text-xs font-bold text-slate-500">{formatDate(order.expectedDelivery)}</td>
                    <td className="p-3"><StatusPill status={order.status} /></td>
                    <td className="p-3">
                      <div className="flex justify-end gap-2">
                        {order.status === 'generated' && <Button onClick={() => setConfirming({ action: 'acknowledge', order })} className="h-8 rounded-md bg-[#008080] text-[10px] font-black uppercase text-white"><Truck className="mr-1 h-3.5 w-3.5" />Acknowledge</Button>}
                        <Button variant="outline" onClick={() => downloadPdf(order)} className="h-8 rounded-md text-[10px] font-black uppercase"><Download className="mr-1 h-3.5 w-3.5" />PDF</Button>
                        {!['cancelled', 'delivered'].includes(String(order.status)) && <Button variant="outline" onClick={() => setConfirming({ action: 'cancel', order })} className="h-8 rounded-md border-red-100 text-[10px] font-black uppercase text-red-600"><XCircle className="mr-1 h-3.5 w-3.5" />Cancel</Button>}
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
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

function StatusPill({ status }: { status?: string }) {
  const value = String(status || 'generated').toLowerCase();
  return <span className={cn('inline-flex rounded-lg border px-3 py-1 text-[10px] font-black uppercase tracking-wide', value === 'cancelled' && 'border-red-200 bg-red-50 text-red-700', value === 'delivered' && 'border-green-200 bg-green-50 text-green-700', value !== 'cancelled' && value !== 'delivered' && 'border-blue-200 bg-blue-50 text-blue-700')}>{readableStatus(value)}</span>;
}
