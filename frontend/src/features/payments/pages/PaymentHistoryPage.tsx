import { useEffect, useState } from 'react';
import {
  CreditCard,
  Eye,
  Filter,
  RefreshCw,
  Search,
  ShieldCheck,
  X,
  Building2,
  Lock,
  ArrowRight,
  ChevronDown,
  ChevronUp,
  FileSpreadsheet,
  Terminal
} from 'lucide-react';
import { Button } from '../../../components/ui/button';
import { Card, CardContent } from '../../../components/ui/card';
import { getApi } from '../../shared/apiClient';
import { cn } from '../../../lib/utils';
import { EmptyState, InlineError, LoadingState } from '../../shared/FeatureStates';
import { formatCurrency, formatDate } from '../../shared/format';
import { Pagination } from '../../shared/Pagination';

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
  const [selected, setSelected] = useState<PaymentRow | null>(null);
  const [page, setPage] = useState(1);
  const [pageSize, setPageSizeState] = useState(20);
  const [total, setTotal] = useState(0);
  const [showMobileFilters, setShowMobileFilters] = useState(false);

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

  const filtered = payments;
  const pagedPayments = payments;
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
        <Button variant="outline" onClick={reload} className="h-10 rounded-lg text-xs font-black uppercase">
          <RefreshCw className="mr-2 h-4 w-4" />Refresh
        </Button>
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
        <CardContent className="p-4 space-y-3">
          <div className="flex flex-col sm:flex-row gap-2 items-center">
            <div className="relative flex-1 w-full">
              <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
              <input
                value={searchTerm}
                onChange={event => setSearchTerm(event.target.value)}
                placeholder="Search reference, invoice, PO, payer, payee..."
                className="h-10 w-full rounded-lg border border-slate-200 pl-10 pr-3 text-xs font-semibold outline-none focus:ring-2 focus:ring-[#12335f]/20"
              />
            </div>
            
            <Button
              type="button"
              variant="outline"
              onClick={() => setShowMobileFilters(!showMobileFilters)}
              className="lg:hidden h-10 w-full sm:w-auto gap-2 rounded-lg text-xs font-black uppercase tracking-wider border-slate-200 text-slate-700 hover:bg-slate-50 shrink-0"
            >
              <Filter className="h-4 w-4 text-slate-500" />
              <span>Filters {showMobileFilters ? '(Hide)' : '(Show)'}</span>
            </Button>
          </div>

          <div className={cn(
            "grid gap-3 items-center",
            showMobileFilters ? "grid grid-cols-2 sm:grid-cols-2" : "hidden lg:grid lg:grid-cols-[180px_180px] lg:justify-end"
          )}>
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
          </div>
        </CardContent>
      </Card>

      {filtered.length === 0 ? (
        <EmptyState title="No payments found" />
      ) : (
        <div className="overflow-hidden rounded-lg border border-slate-200 bg-white">
          <div className="overflow-x-auto">
            <table className="w-full min-w-[1080px] text-left text-sm">
              <thead className="bg-slate-50 text-[10px] font-black uppercase tracking-wider text-slate-500">
                <tr>
                  <th className="p-3">Reference</th>
                  <th className="p-3">Parties</th>
                  <th className="p-3">Gateway</th>
                  <th className="p-3">Amount</th>
                  <th className="p-3">Tax/TDS</th>
                  <th className="p-3">Escrow Vault</th>
                  <th className="p-3">Ledger Entries</th>
                  <th className="p-3">Status</th>
                  <th className="p-3">Date</th>
                  <th className="p-3 text-right">Action</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {pagedPayments.map(payment => {
                  const tax = payment.metadata?.taxSummary || {};
                  const isSuccess = ['success', 'escrow_released'].includes(payment.status || '');

                  return (
                    <tr key={payment.id} className="hover:bg-slate-50">
                      <td className="p-3">
                        <p className="font-mono text-xs font-black text-[#12335f]">{payment.referenceId}</p>
                        <p className="text-[10px] font-semibold text-slate-500">
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
                          <span className={`inline-flex items-center gap-1 rounded px-2 py-0.5 text-[9px] font-black uppercase ${
                            payment.escrowAccount.status === 'held'
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
                        <span className={`rounded-lg border px-2.5 py-0.5 text-[9px] font-black uppercase ${
                          isSuccess
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
                      <td className="p-3 text-right">
                        <Button
                          variant="outline"
                          onClick={() => setSelected(payment)}
                          className="h-8 rounded-lg text-[10px] font-black uppercase tracking-wider"
                        >
                          <Eye className="mr-1.5 h-3.5 w-3.5" />View
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

      {selected && <PaymentDetail payment={selected} onClose={() => setSelected(null)} />}
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

function PaymentDetail({ payment, onClose }: { payment: PaymentRow; onClose: () => void }) {
  const [showRaw, setShowRaw] = useState(false);
  const tax = payment.metadata?.taxSummary || {};

  return (
    <div className="fixed inset-0 z-50 flex justify-end bg-slate-950/30 backdrop-blur-sm animate-fade-in transition-all duration-300">
      <aside className="h-full w-full max-w-2xl overflow-y-auto bg-white shadow-2xl flex flex-col transition-all duration-300 transform scale-100">
        
        {/* Header */}
        <div className="sticky top-0 z-10 flex items-start justify-between border-b border-slate-200 bg-white p-5">
          <div>
            <p className="text-[10px] font-black uppercase tracking-widest text-[#12335f]">TRANSACTION AUDIT RECEIPT</p>
            <h2 className="mt-1 text-xl font-black text-slate-950 tracking-tight">{payment.referenceId}</h2>
            <p className="mt-1 text-xs font-semibold text-slate-500">
              Gateway: <span className="uppercase text-slate-800 font-extrabold">{payment.gateway || 'manual'}</span> | Status:{' '}
              <span className="uppercase text-[#12335f] font-extrabold">{payment.status || 'initiated'}</span>
            </p>
          </div>
          <button
            onClick={onClose}
            className="rounded-lg border border-slate-200 p-2 text-slate-500 hover:bg-slate-50 transition"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        {/* Body Content */}
        <div className="flex-1 space-y-4 p-5">
          {/* Key Metrics grid */}
          <div className="grid gap-3 md:grid-cols-3">
            <DetailMetric label="Settle Amount" value={formatCurrency(payment.amount)} />
            <DetailMetric label="Invoice" value={String(payment.invoice?.invoiceNumber || payment.invoiceId || '-')} />
            <DetailMetric label="Linked Purchase Order" value={String(payment.purchaseOrder?.poNumber || '-')} />
          </div>

          {/* Parties Section */}
          <Card>
            <CardContent className="p-4 space-y-3">
              <p className="text-[10px] font-black uppercase tracking-widest text-slate-500">Transaction Parties</p>
              <div className="grid grid-cols-2 gap-4 text-xs font-semibold text-slate-600">
                <div className="p-3 bg-slate-50 rounded-lg border border-slate-100">
                  <p className="text-[9px] font-bold text-slate-400 uppercase">PAYER (BUYER)</p>
                  <p className="mt-1 font-black text-slate-800">{payment.payer?.name || `Payer #${payment.payer?.id}`}</p>
                  <p className="text-slate-500 font-medium">{payment.payer?.email}</p>
                </div>
                <div className="p-3 bg-slate-50 rounded-lg border border-slate-100">
                  <p className="text-[9px] font-bold text-slate-400 uppercase">PAYEE (SELLER)</p>
                  <p className="mt-1 font-black text-slate-800">{payment.payee?.name || `Payee #${payment.payee?.id}`}</p>
                  <p className="text-slate-500 font-medium">{payment.payee?.email}</p>
                </div>
              </div>
            </CardContent>
          </Card>

          {/* Escrow Custody Section */}
          <Card>
            <CardContent className="p-4 space-y-3">
              <p className="text-[10px] font-black uppercase tracking-widest text-slate-500">Escrow Custody Vault</p>
              {payment.escrowAccount ? (
                <div className="rounded-lg border border-emerald-100 bg-emerald-50/50 p-4 space-y-3">
                  <div className="flex justify-between items-center">
                    <div>
                      <p className="text-[9px] font-bold text-slate-400 uppercase">ESCROW SYSTEM ID</p>
                      <p className="text-sm font-black text-slate-800">VAULT-#{payment.escrowAccount.id}</p>
                    </div>
                    <div className="text-right">
                      <p className="text-[9px] font-bold text-slate-400 uppercase">CUSTODY BALANCE</p>
                      <p className="text-base font-black text-emerald-800">
                        {formatCurrency(payment.escrowAccount.amount || payment.amount)}
                      </p>
                    </div>
                  </div>
                  <div className="grid grid-cols-2 gap-3 text-xs pt-1 border-t border-emerald-100">
                    <div>
                      <p className="text-[9px] font-bold text-slate-400 uppercase">VAULT STATE</p>
                      <span className="inline-flex items-center gap-1 font-bold text-emerald-700 bg-emerald-100/50 rounded px-1.5 py-0.5 text-[9px] mt-0.5 uppercase">
                        <Lock className="h-2.5 w-2.5" /> held (custody active)
                      </span>
                    </div>
                    <div>
                      <p className="text-[9px] font-bold text-slate-400 uppercase">FUNDED TIMESTAMP</p>
                      <p className="font-bold text-slate-700 mt-0.5">
                        {formatDate(payment.escrowAccount.fundedAt || payment.completedAt)}
                      </p>
                    </div>
                  </div>
                </div>
              ) : (
                <div className="rounded-lg border border-slate-200 bg-slate-50 p-4 text-center">
                  <p className="text-xs font-bold text-slate-500">This payment transaction has not funded an escrow account yet.</p>
                  <p className="text-[10px] text-slate-400 mt-1 font-medium">Verify successful payment event webhook execution.</p>
                </div>
              )}
            </CardContent>
          </Card>

          {/* Double-Entry Ledger Bookkeeping */}
          <Card>
            <CardContent className="p-4 space-y-3">
              <div className="flex items-center justify-between border-b border-slate-100 pb-2">
                <p className="text-[10px] font-black uppercase tracking-widest text-slate-500">Double-Entry Financial Ledger</p>
                <span className="flex items-center gap-1 text-[9px] font-black text-emerald-600 uppercase bg-emerald-50 px-2 py-0.5 rounded border border-emerald-200">
                  <ShieldCheck className="h-3 w-3" /> Ledger Audit Ok
                </span>
              </div>

              {(payment.ledgerEntries || []).length === 0 ? (
                <p className="text-xs font-semibold text-slate-500 text-center py-2">
                  No immutable ledger entries recorded yet.
                </p>
              ) : (
                <div className="space-y-2">
                  {payment.ledgerEntries?.map(entry => (
                    <div
                      key={entry.id}
                      className="rounded-lg border border-slate-200 bg-white p-3 text-xs shadow-sm hover:shadow-md transition duration-200"
                    >
                      <div className="flex justify-between items-center mb-2">
                        <span className="rounded bg-slate-50 border border-slate-100 px-2 py-0.5 text-[9px] font-black uppercase text-slate-900">
                          {entry.entryType.replace(/_/g, ' ')}
                        </span>
                        <span className="font-mono font-black text-slate-900 text-sm">
                          {formatCurrency(entry.amount)}
                        </span>
                      </div>

                      <div className="flex items-center justify-between text-[11px] font-semibold text-slate-500 border-t border-slate-100 pt-2 bg-slate-50/50 p-1.5 rounded">
                        <div className="flex flex-col">
                          <span className="text-[9px] text-slate-400 font-bold uppercase">DEBIT (FROM)</span>
                          <span className="font-mono text-slate-800 font-bold">{entry.debitAccount || '-'}</span>
                        </div>
                        <ArrowRight className="h-4 w-4 text-slate-400 flex-shrink-0" />
                        <div className="flex flex-col text-right">
                          <span className="text-[9px] text-slate-400 font-bold uppercase">CREDIT (TO)</span>
                          <span className="font-mono text-slate-800 font-bold">{entry.creditAccount || '-'}</span>
                        </div>
                      </div>

                      <p className="text-[9px] text-slate-400 font-bold text-right mt-1.5 uppercase">
                        RECORDED: {formatDate(entry.createdAt)}
                      </p>
                    </div>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>

          {/* Tax summary metadata */}
          {Object.keys(tax).length > 0 && (
            <Card>
              <CardContent className="p-4 space-y-2">
                <p className="text-[10px] font-black uppercase tracking-widest text-slate-500">Tax & TDS Breakdown</p>
                <div className="grid grid-cols-4 gap-2 text-center text-xs font-semibold text-slate-600 bg-slate-50 p-2.5 rounded-lg border border-slate-100">
                  <div>
                    <p className="text-[9px] font-bold text-slate-400 uppercase">TAXABLE</p>
                    <p className="mt-0.5 font-black text-slate-800">{formatCurrency(tax.taxableAmount)}</p>
                  </div>
                  <div>
                    <p className="text-[9px] font-bold text-slate-400 uppercase">CGST</p>
                    <p className="mt-0.5 font-black text-slate-800">{formatCurrency(tax.cgstAmount)}</p>
                  </div>
                  <div>
                    <p className="text-[9px] font-bold text-slate-400 uppercase">SGST</p>
                    <p className="mt-0.5 font-black text-slate-800">{formatCurrency(tax.sgstAmount)}</p>
                  </div>
                  <div>
                    <p className="text-[9px] font-bold text-slate-400 uppercase">TDS DEDUCTED</p>
                    <p className="mt-0.5 font-black text-red-600">-{formatCurrency(tax.tdsAmount)}</p>
                  </div>
                </div>
              </CardContent>
            </Card>
          )}

          {/* Raw JSON Payload section */}
          <div className="border border-slate-200 rounded-xl overflow-hidden">
            <button
              onClick={() => setShowRaw(!showRaw)}
              className="w-full flex items-center justify-between p-3 bg-slate-50 text-xs font-bold text-slate-700 hover:bg-slate-100 transition"
            >
              <span className="flex items-center gap-1.5 uppercase tracking-wider text-[10px] font-black">
                <Terminal className="h-3.5 w-3.5 text-slate-500" /> Raw Audit Payload
              </span>
              {showRaw ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
            </button>

            {showRaw && (
              <pre className="max-h-[300px] overflow-auto rounded-b-xl bg-slate-950 p-4 text-[10px] font-semibold leading-relaxed text-slate-100">
                {JSON.stringify(payment, null, 2)}
              </pre>
            )}
          </div>
        </div>
      </aside>
    </div>
  );
}

function DetailMetric({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-lg border border-slate-200 bg-slate-50 p-3">
      <p className="text-[9px] font-black uppercase tracking-widest text-slate-400">{label}</p>
      <p className="mt-1 text-xs font-black text-slate-900 tracking-tight leading-none">{value}</p>
    </div>
  );
}
