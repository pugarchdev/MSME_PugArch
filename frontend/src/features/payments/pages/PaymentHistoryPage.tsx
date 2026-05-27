import { useEffect, useState } from 'react';
import {
  CheckCircle2,
  Clock3,
  CreditCard,
  Eye,
  LayoutGrid,
  List,
  RefreshCw,
  Receipt,
  Search,
  ShieldCheck,
  X,
  Lock,
  ArrowRight,
  FileSpreadsheet,
  Terminal,
  ChevronUp,
  ChevronDown
} from 'lucide-react';
import { Button } from '../../../components/ui/button';
import { Card, CardContent } from '../../../components/ui/card';
import { getApi } from '../../shared/apiClient';
import { cn } from '../../../lib/utils';
import { EmptyState, InlineError, LoadingState } from '../../shared/FeatureStates';
import { formatCurrency, formatDate } from '../../shared/format';
import { Pagination } from '../../shared/Pagination';
import { EntityIdLink } from '../../shared/EntityIdLink';
import { ViewModeToggle } from '../../shared/ViewModeToggle';
import { useResponsiveViewMode } from '../../shared/hooks';

type PaymentRow = {
  id: number;
  referenceId: string;
  amount: string | number;
  currency?: string;
  status?: string;
  gateway?: string;
  method?: string;
  invoiceId?: number;
  createdAt?: string;
  completedAt?: string;
  payer?: { id: number; name?: string; email?: string };
  payee?: { id: number; name?: string; email?: string };
  invoice?: { id: number; invoiceNumber?: string; status?: string };
  purchaseOrder?: { id: number; poNumber?: string; title?: string };
  metadata?: any;
  ledgerEntries?: Array<{
    id: number;
    debitAccount?: string;
    creditAccount?: string;
    entryType: string;
    amount: string | number;
    createdAt?: string;
  }>;
  escrowAccount?: {
    id: number;
    status?: string;
    amount?: string | number;
    fundedAt?: string;
    releasedAt?: string;
  };
};

export default function PaymentHistoryPage({ admin = false }: { admin?: boolean }) {
  const [payments, setPayments] = useState<PaymentRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [warning, setWarning] = useState<string | null>(null);
  const [searchTerm, setSearchTerm] = useState('');
  const [statusFilter, setStatusFilter] = useState('');
  const [gatewayFilter, setGatewayFilter] = useState('');
  const [escrowFilter, setEscrowFilter] = useState('');
  const [viewMode, setViewMode] = useResponsiveViewMode();
  const [detailTab, setDetailTab] = useState<'receipt' | 'timeline'>('receipt');
  const [selected, setSelected] = useState<PaymentRow | null>(null);
  const [page, setPage] = useState(1);
  const [pageSize, setPageSizeState] = useState(20);
  const [total, setTotal] = useState(0);

  const reload = async () => {
    setLoading(true);
    setError(null);
    setWarning(null);
    try {
      const params = new URLSearchParams({
        skip: String((page - 1) * pageSize),
        take: String(pageSize)
      });
      if (searchTerm.trim()) params.set('q', searchTerm.trim());
      if (statusFilter) params.set('status', statusFilter);
      if (gatewayFilter) params.set('gateway', gatewayFilter);
      const body = await getApi<any>(`/api/payments?${params.toString()}`);
      setPayments(Array.isArray(body) ? body : body.payments || body.data || []);
      setTotal(Number(body?.total ?? body?.data?.total ?? 0));
      setWarning(body?.warning || null);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unable to load payments');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void reload();
  }, [gatewayFilter, page, pageSize, searchTerm, statusFilter]);

  useEffect(() => {
    setPage(1);
  }, [gatewayFilter, searchTerm, statusFilter]);

  const filtered = payments.filter(payment => {
    if (!escrowFilter) return true;
    const hasEscrow = Boolean(payment.escrowAccount);
    return escrowFilter === 'funded' ? hasEscrow : !hasEscrow;
  });
  const pagedPayments = filtered;
  const setPageSize = (nextPageSize: number) => {
    setPageSizeState(nextPageSize);
    setPage(1);
  };

  if (loading) return <LoadingState label="Loading payment history..." />;

  return (
    <div className="space-y-4">
      <div className="flex flex-col gap-3 border-b border-slate-200 pb-4 md:flex-row md:items-end md:justify-between">
        <div>
          <p className="text-[10px] font-black uppercase tracking-widest text-[#12335f]">{admin ? 'Admin Finance' : 'Finance'}</p>
          <h1 className="text-2xl font-black text-slate-950">Payment History</h1>
          <p className="mt-1 text-xs font-semibold text-slate-500">
            Payment status, escrow linkage, tax/TDS summary, and immutable ledger entries.
          </p>
        </div>

        <div className="flex items-center gap-2">
          <ViewModeToggle value={viewMode} onChange={setViewMode} />
          <Button variant="outline" onClick={reload} className="h-10 rounded-lg text-xs font-black uppercase">
            <RefreshCw className="mr-2 h-4 w-4" />Refresh
          </Button>
        </div>
      </div>

      <div className="grid grid-cols-2 gap-3 md:grid-cols-3">
        <Metric label="Payments" value={total || payments.length} icon={CreditCard} />
        <Metric
          label="Successful"
          value={payments.filter(payment => ['success', 'escrow_released'].includes(payment.status || '')).length}
          icon={ShieldCheck}
        />
        <Metric
          label="Escrow Held"
          value={payments.filter(payment => payment.escrowAccount?.status === 'held').length}
          icon={Lock}
        />
      </div>

      {error && <InlineError message={error} onRetry={reload} />}
      {warning && (
        <div className="rounded-lg border border-amber-200 bg-amber-50 px-4 py-3 text-xs font-bold text-amber-800">
          {warning}
        </div>
      )}

      <Card className="border-slate-200/80 shadow-sm bg-white">
        <CardContent className="p-4">
          <div className="grid gap-3 lg:grid-cols-[1fr_140px_140px_120px] lg:items-end">
            <div className="relative w-full">
              <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
              <input
                value={searchTerm}
                onChange={event => setSearchTerm(event.target.value)}
                placeholder="Search reference, invoice, PO, payer, payee..."
                className="h-10 w-full rounded-lg border border-slate-200 pl-10 pr-3 text-xs font-semibold outline-none focus:ring-2 focus:ring-[#12335f]/20"
              />
            </div>
            <select
              value={statusFilter}
              onChange={event => setStatusFilter(event.target.value)}
              className="h-10 rounded-lg border border-slate-200 px-3 text-xs font-bold outline-none w-full"
            >
              <option value="">All statuses</option>
              <option value="initiated">Initiated</option>
              <option value="gateway_order_created">Gateway order</option>
              <option value="success">Success</option>
              <option value="escrow_released">Escrow released</option>
              <option value="failed">Failed</option>
              <option value="refunded">Refunded</option>
              <option value="cancelled">Cancelled</option>
            </select>
            <select
              value={gatewayFilter}
              onChange={event => setGatewayFilter(event.target.value)}
              className="h-10 rounded-lg border border-slate-200 px-3 text-xs font-bold outline-none w-full"
            >
              <option value="">All gateways</option>
              <option value="bank_transfer">Bank transfer</option>
              <option value="razorpay">Razorpay</option>
              <option value="cashfree">Cashfree</option>
            </select>
            <select
              value={escrowFilter}
              onChange={event => setEscrowFilter(event.target.value)}
              className="h-10 rounded-lg border border-slate-200 px-3 text-xs font-bold outline-none w-full"
            >
              <option value="">Escrow / any</option>
              <option value="funded">Funded</option>
              <option value="not_funded">Not funded</option>
            </select>
          </div>
          <div className="mt-1 flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
            <div className="text-xs text-slate-500">Showing {filtered.length} payments</div>

          </div>
        </CardContent>
      </Card>

      {filtered.length === 0 ? (
        <EmptyState title="No payments found" />
      ) : viewMode === 'grid' ? (
        <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
          {pagedPayments.map((payment, index) => {
            const tax = payment.metadata?.taxSummary || {};
            return (
              <Card key={payment.id} className="rounded-3xl border-slate-200 shadow-sm">
                <CardContent className="space-y-4 p-4">
                  <div className="flex items-start justify-between gap-3">
                    <div>
                      <p className="text-[10px] font-black uppercase tracking-widest text-slate-500">Sr. No</p>
                      <p className="text-lg font-black text-slate-950">{(page - 1) * pageSize + index + 1}</p>
                    </div>
                    <span className="rounded-full border border-slate-200 bg-slate-50 px-3 py-1 text-[10px] font-black uppercase text-slate-700">
                      {String(payment.status || 'initiated').replace(/_/g, ' ')}
                    </span>
                  </div>
                  <div className="space-y-1">
                    <p className="text-xs font-black uppercase tracking-[0.25em] text-slate-500">Reference</p>
                    <EntityIdLink label={payment.referenceId} id={payment.id} size="sm" onClick={() => { setDetailTab('receipt'); setSelected(payment); }} />
                    <p className="text-[10px] text-slate-500">Invoice {payment.invoice?.invoiceNumber || payment.invoiceId || '-'}</p>
                  </div>
                  <div className="grid gap-2 text-[10px] text-slate-600">
                    <p><span className="font-black text-slate-900">Gateway:</span> {payment.gateway || 'manual'} / {payment.method || 'bank_transfer'}</p>
                    <p><span className="font-black text-slate-900">Amount:</span> {formatCurrency(payment.amount)}</p>
                    <p><span className="font-black text-slate-900">PO:</span> {payment.purchaseOrder?.poNumber || '-'}</p>
                    <p><span className="font-black text-slate-900">Tax/TDS:</span> GST {formatCurrency(tax.totalTaxAmount || 0)} | TDS {formatCurrency(tax.tdsAmount || 0)}</p>
                  </div>
                  <div className="flex flex-wrap items-center gap-2 text-[10px] font-black uppercase tracking-[0.25em] text-slate-700">
                    <span className="rounded-full bg-slate-100 px-2 py-1">{payment.payer?.name || `Payer #${payment.payer?.id}`}</span>
                    <span className="rounded-full bg-slate-100 px-2 py-1">{payment.payee?.name || `Payee #${payment.payee?.id}`}</span>
                  </div>
                  <div className="flex flex-wrap gap-2">
                    <Button size="sm" variant="outline" onClick={() => { setDetailTab('receipt'); setSelected(payment); }}>
                      <Receipt className="mr-1 h-3.5 w-3.5" />View
                    </Button>
                    <Button size="sm" onClick={() => { setDetailTab('timeline'); setSelected(payment); }}>
                      <Clock3 className="mr-1 h-3.5 w-3.5" />Track
                    </Button>
                  </div>
                </CardContent>
              </Card>
            );
          })}
        </div>
      ) : (
        <div className="rounded-lg border border-slate-200 bg-white overflow-x-clip">
          <div className="overflow-x-auto">
            <table className="w-full min-w-[1080px] text-left text-sm">
              <thead className="bg-slate-50 text-[10px] font-black uppercase tracking-wider text-slate-500">
                <tr>
                  <th className="p-3">Sr. No</th>
                  <th className="p-3">Reference</th>
                  <th className="p-3">Parties</th>
                  <th className="p-3">Gateway</th>
                  <th className="p-3">Amount</th>
                  <th className="p-3">Tax/TDS</th>
                  <th className="p-3">Escrow Vault</th>
                  <th className="p-3">Ledger Entries</th>
                  <th className="p-3">Status</th>
                  <th className="p-3">Date</th>
                  <th className="p-3 text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {pagedPayments.map((payment, index) => {
                  const tax = payment.metadata?.taxSummary || {};
                  const isSuccess = ['success', 'escrow_released'].includes(payment.status || '');
                  const rowNumber = (page - 1) * pageSize + index + 1;

                  return (
                    <tr key={payment.id} className="hover:bg-slate-50">
                      <td className="p-3 text-xs font-black text-slate-700">{rowNumber}</td>
                      <td className="p-3">
                        <EntityIdLink label={payment.referenceId} id={payment.id} size="sm" onClick={() => { setDetailTab('receipt'); setSelected(payment); }} />
                        <p className="mt-1 text-[10px] font-semibold text-slate-500">
                          Invoice {payment.invoice?.invoiceNumber || payment.invoiceId || '-'}
                        </p>
                      </td>
                      <td className="p-3 text-[10px] font-bold text-slate-500">
                        From {payment.payer?.name || `#${payment.payer?.id || '-'}`}
                        <br />
                        To {payment.payee?.name || `#${payment.payee?.id || '-'}`}
                      </td>
                      <td className="p-3 text-xs font-bold uppercase text-slate-600">
                        {payment.gateway || 'manual'} / {payment.method || 'bank_transfer'}
                      </td>
                      <td className="p-3 text-xs font-black">{formatCurrency(payment.amount)}</td>
                      <td className="p-3 text-[10px] font-bold text-slate-500">
                        GST {formatCurrency(tax.totalTaxAmount || 0)} | TDS {formatCurrency(tax.tdsAmount || 0)}
                      </td>
                      <td className="p-3">
                        {payment.escrowAccount ? (
                          <span className={`inline-flex items-center gap-1 rounded px-2 py-0.5 text-[9px] font-black uppercase ${payment.escrowAccount.status === 'held'
                            ? 'bg-emerald-50 text-emerald-700 border border-emerald-200/50'
                            : 'bg-slate-50 text-[#12335f] border border-blue-200/50'
                            }`}>
                            <Lock className="h-2.5 w-2.5" /> #{payment.escrowAccount.id} {payment.escrowAccount.status}
                          </span>
                        ) : (
                          <span className="text-[10px] font-semibold text-slate-400 italic">Not funded</span>
                        )}
                      </td>
                      <td className="p-3 text-xs font-bold text-slate-600">
                        <span className="flex items-center gap-1 font-mono text-xs text-slate-900 bg-slate-50 px-2 py-0.5 rounded w-max border border-slate-100">
                          <FileSpreadsheet className="h-3 w-3" /> {payment.ledgerEntries?.length || 0} items
                        </span>
                      </td>
                      <td className="p-3">
                        <span className={`rounded-lg border px-2.5 py-0.5 text-[9px] font-black uppercase ${isSuccess
                          ? 'border-emerald-200 bg-emerald-50 text-emerald-700'
                          : payment.status === 'failed'
                            ? 'border-red-200 bg-red-50 text-red-700'
                            : 'border-blue-200 bg-slate-50 text-[#12335f]'
                          }`}>
                          {String(payment.status || 'initiated').replace(/_/g, ' ')}
                        </span>
                      </td>
                      <td className="p-3 text-xs font-bold text-slate-500">
                        {formatDate(payment.completedAt || payment.createdAt)}
                      </td>
                      <td className="p-3 text-right space-y-2 sm:space-y-0 sm:flex sm:justify-end sm:items-center sm:gap-2">
                        <Button
                          variant="outline"
                          onClick={() => { setDetailTab('receipt'); setSelected(payment); }}
                          className="h-8 rounded-lg text-[10px] font-black uppercase tracking-wider"
                        >
                          <Eye className="mr-1.5 h-3.5 w-3.5" />View
                        </Button>
                        <Button
                          variant="secondary"
                          onClick={() => { setDetailTab('timeline'); setSelected(payment); }}
                          className="h-8 rounded-lg text-[10px] font-black uppercase tracking-wider"
                        >
                          <Clock3 className="mr-1.5 h-3.5 w-3.5" />Track
                        </Button>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
          <Pagination page={page} pageSize={pageSize} total={total} onPageChange={setPage} onPageSizeChange={setPageSize} label="payments" />
        </div>
      )}

      {selected && (
        <PaymentDetail
          key={`${selected.id}-${detailTab}`}
          payment={selected}
          initialTab={detailTab}
          onClose={() => setSelected(null)}
        />
      )}
    </div>
  );
}

function Metric({ label, value, icon: Icon }: { label: string; value: number; icon: any }) {
  return (
    <Card>
      <CardContent className="flex items-center justify-between p-4">
        <div>
          <p className="text-[9px] font-black uppercase tracking-widest text-slate-400">{label}</p>
          <p className="mt-1 text-2xl font-black text-slate-950">{value}</p>
        </div>
        <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-[#12335f] text-white">
          <Icon className="h-5 w-5" />
        </div>
      </CardContent>
    </Card>
  );
}

const paymentTimeline = (payment: PaymentRow) => {
  const events: Array<{ title: string; timestamp?: string; detail?: string }> = [];
  if (payment.createdAt) {
    events.push({ title: 'Payment created', timestamp: payment.createdAt });
  }
  if (payment.status) {
    events.push({ title: `Status changed to ${payment.status.replace(/_/g, ' ')}`, timestamp: payment.completedAt || payment.createdAt, detail: `${payment.gateway || 'gateway'} transaction` });
  }
  if (payment.escrowAccount?.fundedAt) {
    events.push({ title: `Escrow ${payment.escrowAccount.status || 'funded'}`, timestamp: payment.escrowAccount.fundedAt, detail: `Escrow account #${payment.escrowAccount.id}` });
  }
  payment.ledgerEntries?.forEach(entry => {
    events.push({ title: `${entry.entryType} ledger entry`, timestamp: entry.createdAt, detail: `${formatCurrency(entry.amount)} ${entry.debitAccount || 'debit'} → ${entry.creditAccount || 'credit'}` });
  });
  if (payment.completedAt && payment.completedAt !== payment.createdAt) {
    events.push({ title: 'Payment completed', timestamp: payment.completedAt });
  }
  return events.filter(event => event.timestamp).sort((a, b) => new Date(a.timestamp || '').getTime() - new Date(b.timestamp || '').getTime());
};

function PaymentDetail({ payment, initialTab, onClose }: { payment: PaymentRow; initialTab?: 'receipt' | 'timeline'; onClose: () => void }) {
  const [activeTab, setActiveTab] = useState<'receipt' | 'timeline'>(initialTab || 'receipt');
  const tax = payment.metadata?.taxSummary || {};
  const status = String(payment.status || 'initiated').replace(/_/g, ' ');
  const gateway = String(payment.gateway || 'manual').replace(/_/g, ' ');
  const method = String(payment.method || 'bank transfer').replace(/_/g, ' ');
  const receiptDate = payment.completedAt || payment.createdAt;
  const timelineItems = paymentTimeline(payment);

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/45 px-3 py-6 backdrop-blur-sm">
      <div className="flex max-h-[92vh] w-full max-w-5xl flex-col overflow-hidden rounded-lg bg-white shadow-2xl">
        <div className="flex flex-col gap-4 border-b border-slate-200 bg-white px-5 py-4 md:flex-row md:items-start md:justify-between">
          <div className="min-w-0">
            <p className="text-[10px] font-black uppercase tracking-widest text-[#12335f]">Government MSME Portal</p>
            <h2 className="mt-1 text-xl font-black text-slate-950">Payment Receipt</h2>
            <p className="mt-1 text-xs font-semibold text-slate-500">
              System generated receipt for payment reference <span className="font-black text-slate-900">{payment.referenceId}</span>
            </p>
          </div>
          <div className="flex items-center gap-2">
            <span className="rounded border border-emerald-200 bg-emerald-50 px-3 py-1.5 text-[10px] font-black uppercase text-emerald-700">
              {status}
            </span>
            <button
              onClick={onClose}
              aria-label="Close receipt"
              className="flex h-9 w-9 items-center justify-center rounded-lg border border-slate-200 text-slate-500 hover:bg-slate-50"
            >
              <X className="h-4 w-4" />
            </button>
          </div>
        </div>

        <div className="flex-1 overflow-y-auto bg-slate-100 p-4 md:p-5">
          <div className="mx-auto space-y-4">
            <div className="flex items-center justify-between rounded-lg border border-slate-200 bg-white p-2">
              <div className="px-2">
                <p className="text-[10px] font-black uppercase tracking-widest text-slate-500">Receipt Record</p>
                <p className="text-sm font-black text-slate-900">
                  {activeTab === 'receipt' ? 'Official payment receipt and settlement summary' : 'Payment status timeline'}
                </p>
              </div>
              <div className="flex items-center gap-2">
                <Button variant={activeTab === 'receipt' ? 'primary' : 'outline'} size="sm" onClick={() => setActiveTab('receipt')}>
                  <Receipt className="mr-1 h-3.5 w-3.5" />Receipt
                </Button>
                <Button variant={activeTab === 'timeline' ? 'primary' : 'outline'} size="sm" onClick={() => setActiveTab('timeline')}>
                  <Clock3 className="mr-1 h-3.5 w-3.5" />Timeline
                </Button>
              </div>
            </div>

            {activeTab === 'receipt' ? (
              <div className="rounded-lg border border-slate-300 bg-white shadow-sm">
                <div className="border-b border-slate-200 px-5 py-4">
                  <div className="flex flex-col gap-3 md:flex-row md:items-start md:justify-between">
                    <div>
                      <p className="text-[10px] font-black uppercase tracking-widest text-slate-500">Receipt No.</p>
                      <p className="mt-1 font-mono text-lg font-black text-[#12335f]">{payment.referenceId}</p>
                      <p className="mt-1 text-xs font-semibold text-slate-500">Issued by MSME Portal Finance System</p>
                    </div>
                    <div className="text-left md:text-right">
                      <p className="text-[10px] font-black uppercase tracking-widest text-slate-500">Receipt Date</p>
                      <p className="mt-1 text-sm font-black text-slate-900">{formatDate(receiptDate)}</p>
                      <p className="mt-1 text-[10px] font-bold uppercase text-slate-500">Currency: {payment.currency || 'INR'}</p>
                    </div>
                  </div>
                </div>

                <div className="grid border-b border-slate-200 md:grid-cols-3">
                  <ReceiptField label="Invoice" value={String(payment.invoice?.invoiceNumber || payment.invoiceId || '-')} />
                  <ReceiptField label="Purchase Order" value={String(payment.purchaseOrder?.poNumber || '-')} />
                  <ReceiptField label="Gateway / Method" value={`${gateway} / ${method}`} />
                </div>

                <div className="grid gap-4 border-b border-slate-200 p-5 lg:grid-cols-[1.2fr_0.8fr]">
                  <section className="space-y-3">
                    <p className="text-[10px] font-black uppercase tracking-widest text-slate-500">Transaction Parties</p>
                    <div className="grid gap-3 md:grid-cols-2">
                      <PartyBlock label="Payer / Buyer" name={payment.payer?.name || `Payer #${payment.payer?.id || '-'}`} email={payment.payer?.email} />
                      <PartyBlock label="Payee / Seller" name={payment.payee?.name || `Payee #${payment.payee?.id || '-'}`} email={payment.payee?.email} />
                    </div>
                  </section>

                  <section className="rounded-lg border border-[#12335f]/20 bg-[#12335f]/5 p-4">
                    <p className="text-[10px] font-black uppercase tracking-widest text-[#12335f]">Amount Paid</p>
                    <p className="mt-2 text-2xl font-black text-slate-950">{formatCurrency(payment.amount)}</p>
                    <p className="mt-1 text-xs font-semibold text-slate-500">Settlement status: {status}</p>
                  </section>
                </div>

                <div className="grid gap-4 border-b border-slate-200 p-5 lg:grid-cols-2">
                  <section className="space-y-3">
                    <p className="text-[10px] font-black uppercase tracking-widest text-slate-500">Tax and Deduction Summary</p>
                    <div className="overflow-hidden rounded-lg border border-slate-200">
                      <AmountRow label="Taxable Amount" value={formatCurrency(tax.taxableAmount || 0)} />
                      <AmountRow label="CGST" value={formatCurrency(tax.cgstAmount || 0)} />
                      <AmountRow label="SGST" value={formatCurrency(tax.sgstAmount || 0)} />
                      <AmountRow label="IGST" value={formatCurrency(tax.igstAmount || 0)} />
                      <AmountRow label="TDS Deducted" value={`-${formatCurrency(tax.tdsAmount || 0)}`} muted />
                      <AmountRow label="Settlement Amount" value={formatCurrency(payment.amount)} strong />
                    </div>
                  </section>

                  <section className="space-y-3">
                    <p className="text-[10px] font-black uppercase tracking-widest text-slate-500">Escrow Custody</p>
                    {payment.escrowAccount ? (
                      <div className="rounded-lg border border-emerald-200 bg-emerald-50 p-4">
                        <div className="flex items-start justify-between gap-3">
                          <div>
                            <p className="text-[10px] font-black uppercase tracking-widest text-emerald-700">Escrow Account</p>
                            <p className="mt-1 font-mono text-sm font-black text-slate-900">VAULT-{payment.escrowAccount.id}</p>
                          </div>
                          <span className="rounded border border-emerald-300 bg-white px-2 py-1 text-[10px] font-black uppercase text-emerald-700">
                            {payment.escrowAccount.status || 'held'}
                          </span>
                        </div>
                        <div className="mt-4 grid grid-cols-2 gap-3 text-xs">
                          <ReceiptMini label="Custody Balance" value={formatCurrency(payment.escrowAccount.amount || payment.amount)} />
                          <ReceiptMini label="Funded On" value={formatDate(payment.escrowAccount.fundedAt || payment.completedAt)} />
                        </div>
                      </div>
                    ) : (
                      <div className="rounded-lg border border-slate-200 bg-slate-50 p-4">
                        <p className="text-sm font-black text-slate-800">Escrow not funded</p>
                        <p className="mt-1 text-xs font-semibold text-slate-500">
                          No escrow account is linked to this payment record yet.
                        </p>
                      </div>
                    )}
                  </section>
                </div>

                <div className="p-5">
                  <div className="mb-3 flex items-center justify-between gap-3">
                    <p className="text-[10px] font-black uppercase tracking-widest text-slate-500">Double-Entry Financial Ledger</p>
                    <span className="inline-flex items-center gap-1 rounded border border-emerald-200 bg-emerald-50 px-2 py-1 text-[10px] font-black uppercase text-emerald-700">
                      <ShieldCheck className="h-3 w-3" /> Verified Format
                    </span>
                  </div>
                  {(payment.ledgerEntries || []).length === 0 ? (
                    <div className="rounded-lg border border-slate-200 bg-slate-50 p-4 text-center text-xs font-semibold text-slate-500">
                      Ledger entry is pending for this payment record.
                    </div>
                  ) : (
                    <div className="overflow-hidden rounded-lg border border-slate-200">
                      <table className="w-full text-left text-xs">
                        <thead className="bg-slate-50 text-[10px] font-black uppercase tracking-widest text-slate-500">
                          <tr>
                            <th className="p-3">Entry</th>
                            <th className="p-3">Debit Account</th>
                            <th className="p-3">Credit Account</th>
                            <th className="p-3 text-right">Amount</th>
                            <th className="p-3">Recorded On</th>
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-slate-100">
                          {payment.ledgerEntries?.map(entry => (
                            <tr key={entry.id}>
                              <td className="p-3 font-black uppercase text-slate-800">{entry.entryType.replace(/_/g, ' ')}</td>
                              <td className="p-3 font-mono font-semibold text-slate-600">{entry.debitAccount || '-'}</td>
                              <td className="p-3 font-mono font-semibold text-slate-600">{entry.creditAccount || '-'}</td>
                              <td className="p-3 text-right font-black text-slate-950">{formatCurrency(entry.amount)}</td>
                              <td className="p-3 font-semibold text-slate-500">{formatDate(entry.createdAt)}</td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  )}
                </div>

                <div className="border-t border-slate-200 bg-slate-50 px-5 py-4 text-xs font-semibold text-slate-500">
                  This is a computer generated receipt from the MSME Portal finance module. It is valid for internal payment tracking,
                  reconciliation, and audit review when matched with the linked invoice and purchase order.
                </div>
              </div>
            ) : (
              <div className="rounded-lg border border-slate-200 bg-white p-5 shadow-sm">
                <p className="text-[10px] font-black uppercase tracking-widest text-slate-500">Transaction Timeline</p>
                <div className="mt-4 space-y-3">
                  {timelineItems.length === 0 ? (
                    <div className="rounded-lg border border-slate-200 bg-slate-50 p-4 text-sm font-semibold text-slate-500">
                      No timestamped events are available for this payment.
                    </div>
                  ) : (
                    timelineItems.map((item, index) => (
                      <div key={index} className="flex gap-3 rounded-lg border border-slate-200 bg-white p-4">
                        <div className="mt-1 flex h-7 w-7 flex-none items-center justify-center rounded-full bg-[#12335f] text-white">
                          <CheckCircle2 className="h-4 w-4" />
                        </div>
                        <div className="min-w-0 flex-1">
                          <div className="flex flex-col gap-1 md:flex-row md:items-start md:justify-between">
                            <p className="text-sm font-black text-slate-900">{item.title}</p>
                            <p className="text-[10px] font-black uppercase text-slate-400">{formatDate(item.timestamp)}</p>
                          </div>
                          {item.detail && <p className="mt-1 text-xs font-semibold text-slate-500">{item.detail}</p>}
                        </div>
                      </div>
                    ))
                  )}
                </div>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

function ReceiptField({ label, value }: { label: string; value: string }) {
  return (
    <div className="border-b border-slate-200 p-4 md:border-b-0 md:border-r last:md:border-r-0">
      <p className="text-[10px] font-black uppercase tracking-widest text-slate-500">{label}</p>
      <p className="mt-1 break-words text-sm font-black text-slate-900">{value}</p>
    </div>
  );
}

function PartyBlock({ label, name, email }: { label: string; name: string; email?: string }) {
  return (
    <div className="rounded-lg border border-slate-200 bg-slate-50 p-4">
      <p className="text-[10px] font-black uppercase tracking-widest text-slate-500">{label}</p>
      <p className="mt-2 text-sm font-black text-slate-900">{name}</p>
      <p className="mt-1 break-words text-xs font-semibold text-slate-500">{email || '-'}</p>
    </div>
  );
}

function AmountRow({ label, value, strong = false, muted = false }: { label: string; value: string; strong?: boolean; muted?: boolean }) {
  return (
    <div className={cn('flex items-center justify-between gap-4 border-b border-slate-100 px-4 py-3 last:border-b-0', strong && 'bg-[#12335f]/5')}>
      <p className="text-xs font-bold text-slate-600">{label}</p>
      <p className={cn('text-right text-xs font-black text-slate-900', strong && 'text-sm text-[#12335f]', muted && 'text-red-700')}>{value}</p>
    </div>
  );
}

function ReceiptMini({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <p className="text-[10px] font-black uppercase tracking-widest text-emerald-700">{label}</p>
      <p className="mt-1 font-bold text-slate-800">{value}</p>
    </div>
  );
}
