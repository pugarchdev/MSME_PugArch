import { useMemo, useState } from 'react';
import { CheckCircle2, Clock, FileText, IndianRupee, RefreshCw, Search } from 'lucide-react';
import { Button } from '../../../components/ui/button';
import { Card, CardContent } from '../../../components/ui/card';
import { EmptyState, InlineError, LoadingState } from '../../shared/FeatureStates';
import { formatCurrency, formatDate } from '../../shared/format';
import { useFeatureQuery } from '../../shared/hooks';

type InvoiceRow = {
  id: number;
  invoiceNumber?: string;
  purchaseOrderId?: number;
  buyerId?: number;
  sellerId?: number;
  amount?: string | number;
  totalAmount?: string | number;
  taxableAmount?: string | number;
  totalTaxAmount?: string | number;
  tdsAmount?: string | number;
  status?: string;
  invoiceStatus?: string;
  dueDate?: string;
  createdAt?: string;
  buyer?: { name?: string };
  seller?: { name?: string };
  purchaseOrder?: { poNumber?: string; title?: string };
};

const statusOf = (invoice: InvoiceRow) => String(invoice.invoiceStatus || invoice.status || 'draft').toLowerCase();

export default function InvoiceRegisterPage({ role = 'buyer' }: { role?: 'buyer' | 'seller' | 'admin' }) {
  const { data: invoices, loading, error, reload } = useFeatureQuery<InvoiceRow[]>('/api/invoices', []);
  const [searchTerm, setSearchTerm] = useState('');
  const [statusFilter, setStatusFilter] = useState('');

  const statuses = useMemo(() => Array.from(new Set(invoices.map(statusOf))).sort(), [invoices]);
  const filtered = useMemo(() => {
    const term = searchTerm.trim().toLowerCase();
    return invoices.filter(invoice => {
      const haystack = [
        invoice.invoiceNumber,
        invoice.status,
        invoice.invoiceStatus,
        invoice.purchaseOrder?.poNumber,
        invoice.purchaseOrder?.title,
        invoice.buyer?.name,
        invoice.seller?.name
      ].filter(Boolean).join(' ').toLowerCase();
      return (!term || haystack.includes(term)) && (!statusFilter || statusOf(invoice) === statusFilter);
    });
  }, [invoices, searchTerm, statusFilter]);

  const totalValue = filtered.reduce((sum, invoice) => sum + Number(invoice.amount || invoice.totalAmount || 0), 0);
  const pendingCount = filtered.filter(invoice => ['draft', 'submitted', 'pending'].includes(statusOf(invoice))).length;
  const approvedCount = filtered.filter(invoice => ['approved', 'paid'].includes(statusOf(invoice))).length;

  if (loading) return <LoadingState label="Loading invoices..." />;

  return (
    <div className="space-y-4">
      <div className="flex flex-col gap-3 border-b border-slate-200 pb-4 md:flex-row md:items-end md:justify-between">
        <div>
          <p className="text-[10px] font-black uppercase tracking-widest text-[#12335f]">{role === 'seller' ? 'Seller Finance' : role === 'admin' ? 'Admin Finance' : 'Buyer Finance'}</p>
          <h1 className="text-2xl font-black tracking-tight text-slate-950">Invoices</h1>
          <p className="mt-1 max-w-2xl text-xs font-semibold text-slate-500">Invoice register with PO linkage, GST/TDS values, due dates, and approval status.</p>
        </div>
        <Button variant="outline" onClick={reload} className="h-10 rounded-lg text-xs font-black uppercase"><RefreshCw className="mr-2 h-4 w-4" />Refresh</Button>
      </div>

      <div className="grid gap-3 md:grid-cols-4">
        <Metric label="Invoices" value={filtered.length} icon={FileText} />
        <Metric label="Pending" value={pendingCount} icon={Clock} />
        <Metric label="Approved/Paid" value={approvedCount} icon={CheckCircle2} />
        <Metric label="Invoice Value" value={formatCurrency(totalValue)} icon={IndianRupee} />
      </div>

      {error && <InlineError message={error} onRetry={reload} />}

      <Card>
        <CardContent className="grid gap-3 p-4 md:grid-cols-[1fr_190px]">
          <div className="relative">
            <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
            <input value={searchTerm} onChange={event => setSearchTerm(event.target.value)} placeholder="Search invoice, PO, buyer, seller..." className="h-10 w-full rounded-lg border border-slate-200 bg-white pl-10 pr-3 text-xs font-semibold outline-none focus:ring-2 focus:ring-[#12335f]/20" />
          </div>
          <select value={statusFilter} onChange={event => setStatusFilter(event.target.value)} className="h-10 rounded-lg border border-slate-200 bg-white px-3 text-xs font-bold outline-none focus:ring-2 focus:ring-[#12335f]/20">
            <option value="">All statuses</option>
            {statuses.map(status => <option key={status} value={status}>{status.replace(/_/g, ' ')}</option>)}
          </select>
        </CardContent>
      </Card>

      {filtered.length === 0 ? <EmptyState title="No invoices found" description="Invoices will appear once sellers submit bills against accepted purchase orders." /> : (
        <div className="overflow-hidden rounded-lg border border-slate-200 bg-white">
          <div className="overflow-x-auto">
            <table className="w-full min-w-[980px] text-left text-sm">
              <thead className="bg-slate-50 text-[10px] font-black uppercase tracking-wider text-slate-500">
                <tr><th className="p-3">Invoice</th><th className="p-3">PO</th><th className="p-3">Party</th><th className="p-3">Taxable</th><th className="p-3">GST</th><th className="p-3">TDS</th><th className="p-3">Total</th><th className="p-3">Due</th><th className="p-3">Status</th></tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {filtered.map(invoice => (
                  <tr key={invoice.id} className="hover:bg-slate-50">
                    <td className="p-3"><p className="font-mono text-xs font-black text-[#12335f]">{invoice.invoiceNumber || `INV-${invoice.id}`}</p><p className="text-[10px] font-semibold text-slate-500">{formatDate(invoice.createdAt)}</p></td>
                    <td className="p-3"><p className="text-xs font-black text-slate-900">{invoice.purchaseOrder?.poNumber || `PO #${invoice.purchaseOrderId || '-'}`}</p><p className="text-[10px] font-semibold text-slate-500">{invoice.purchaseOrder?.title || '-'}</p></td>
                    <td className="p-3 text-xs font-bold text-slate-600">{role === 'seller' ? invoice.buyer?.name || `Buyer #${invoice.buyerId || '-'}` : invoice.seller?.name || `Seller #${invoice.sellerId || '-'}`}</td>
                    <td className="p-3 text-xs font-bold text-slate-600">{formatCurrency(invoice.taxableAmount || 0)}</td>
                    <td className="p-3 text-xs font-bold text-slate-600">{formatCurrency(invoice.totalTaxAmount || 0)}</td>
                    <td className="p-3 text-xs font-bold text-slate-600">{formatCurrency(invoice.tdsAmount || 0)}</td>
                    <td className="p-3 text-xs font-black text-slate-950">{formatCurrency(invoice.amount || invoice.totalAmount)}</td>
                    <td className="p-3 text-xs font-bold text-slate-500">{formatDate(invoice.dueDate)}</td>
                    <td className="p-3"><span className="rounded-lg border border-blue-200 bg-blue-50 px-3 py-1 text-[10px] font-black uppercase text-blue-700">{statusOf(invoice).replace(/_/g, ' ')}</span></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
}

function Metric({ label, value, icon: Icon }: { label: string; value: string | number; icon: any }) {
  return <Card><CardContent className="flex items-center justify-between p-4"><div><p className="text-[10px] font-black uppercase tracking-widest text-slate-500">{label}</p><p className="mt-1 text-lg font-black text-slate-950">{value}</p></div><div className="flex h-10 w-10 items-center justify-center rounded-lg bg-blue-50 text-[#12335f]"><Icon className="h-5 w-5" /></div></CardContent></Card>;
}
