import { useMemo, useState } from 'react';
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
  ChevronDown,
  IndianRupee
} from 'lucide-react';
import { Button } from '../../../components/ui/button';
import { Card, CardContent } from '../../../components/ui/card';

import { cn } from '../../../lib/utils';
import { EmptyState, InlineError, LoadingState } from '../../shared/FeatureStates';
import { formatCurrency, formatDate } from '../../shared/format';
import { Pagination } from '../../shared/Pagination';
import { EntityIdLink } from '../../shared/EntityIdLink';
import { ViewModeToggle } from '../../shared/ViewModeToggle';
import { useResponsiveViewMode, usePaginatedFeatureQuery } from '../../shared/hooks';
import { SortableHeader, type SortDirection } from '../../shared/SortableHeader';

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
type PaymentSortKey = 'reference' | 'parties' | 'gateway' | 'amount' | 'escrow' | 'status' | 'date';

export default function PaymentHistoryPage({ admin = false }: { admin?: boolean }) {
  const [searchTerm, setSearchTerm] = useState('');
  const [statusFilter, setStatusFilter] = useState('');
  const [gatewayFilter, setGatewayFilter] = useState('');
  const [escrowFilter, setEscrowFilter] = useState('');
  const [viewMode, setViewMode] = useResponsiveViewMode(`phase7:payment-history:${admin ? 'admin' : 'user'}:view-mode`);
  const [sortKey, setSortKey] = useState<PaymentSortKey>('date');
  const [sortDirection, setSortDirection] = useState<SortDirection>('desc');
  const [detailTab, setDetailTab] = useState<'receipt' | 'timeline'>('receipt');
  const [selected, setSelected] = useState<PaymentRow | null>(null);

  const { records: payments, warning, loading, refreshing, error, reload, page, pageSize, total, setPage, setPageSize } = usePaginatedFeatureQuery<PaymentRow>('/api/payments', {
    ...(searchTerm.trim() ? { q: searchTerm.trim() } : {}),
    ...(statusFilter ? { status: statusFilter } : {}),
    ...(gatewayFilter ? { gateway: gatewayFilter } : {})
  }, 20);

  const paymentSummary = useMemo(() => {
    const totalAmount = payments.reduce((sum, payment) => sum + Number(payment.amount || 0), 0);
    const successful = payments.filter(payment => ['success', 'escrow_released', 'offline_proof_verified'].includes(String(payment.status || '').toLowerCase()));
    const settledValue = successful.reduce((sum, payment) => sum + Number(payment.amount || 0), 0);
    const escrowHeldValue = payments
      .filter(payment => String(payment.escrowAccount?.status || '').toLowerCase() === 'held')
      .reduce((sum, payment) => sum + Number(payment.escrowAccount?.amount || payment.amount || 0), 0);
    const successRate = payments.length ? Math.round((successful.length / payments.length) * 100) : 0;
    return { totalAmount, successful: successful.length, settledValue, escrowHeldValue, successRate };
  }, [payments]);

  const filtered = useMemo(() => payments.filter(payment => {
    if (!escrowFilter) return true;
    const hasEscrow = Boolean(payment.escrowAccount);
    return escrowFilter === 'funded' ? hasEscrow : !hasEscrow;
  }).sort((a, b) => {
    const valueFor = (payment: PaymentRow) => {
      if (sortKey === 'reference') return payment.referenceId || '';
      if (sortKey === 'parties') return `${payment.payer?.name || ''} ${payment.payee?.name || ''}`;
      if (sortKey === 'gateway') return `${payment.gateway || 'manual'} ${payment.method || ''}`;
      if (sortKey === 'amount') return Number(payment.amount || 0);
      if (sortKey === 'escrow') return payment.escrowAccount?.status || 'not_funded';
      if (sortKey === 'status') return payment.status || '';
      return new Date(payment.completedAt || payment.createdAt || 0).getTime();
    };
    const av = valueFor(a);
    const bv = valueFor(b);
    const result = typeof av === 'number' && typeof bv === 'number' ? av - bv : String(av).localeCompare(String(bv));
    return sortDirection === 'asc' ? result : -result;
  }), [escrowFilter, payments, sortDirection, sortKey]);
  const pagedPayments = filtered;

  const toggleSort = (field: PaymentSortKey) => {
    setSortDirection(prev => sortKey === field && prev === 'asc' ? 'desc' : 'asc');
    setSortKey(field);
    setPage(1);
  };

  if (loading) return <LoadingState label="Loading payment history..." />;

  return (
    <div className="space-y-6">
      {/* Transparent Header */}
      <div className="flex flex-col gap-2 md:flex-row md:items-center md:justify-between py-2">
        <div className="min-w-0">
          <span className="text-[10px] font-black uppercase tracking-widest text-[#12335f] bg-[#12335f]/10 px-2.5 py-1 rounded-full">{admin ? 'Admin Finance' : 'Finance'}</span>
          <h1 className="text-3xl font-black tracking-tight text-slate-900 mt-2">Payment History</h1>
          <p className="text-xs font-semibold text-slate-500 mt-1">
            Payment status, escrow linkage, tax/TDS summary, and immutable ledger entries.
          </p>
        </div>

        <div className="flex items-center gap-2">
          <ViewModeToggle value={viewMode} onChange={setViewMode} />
          <Button variant="outline" onClick={reload} className="h-10 rounded-lg text-xs font-black uppercase bg-white hover:bg-slate-50 border-slate-200 shadow-sm">
            <RefreshCw className={cn("mr-2 h-4 w-4 text-[#12335f]", refreshing && "animate-spin")} /> Refresh
          </Button>
        </div>
      </div>

      {/* KPI Cards Grid */}
      <div className="grid grid-cols-2 gap-4 md:grid-cols-3 xl:grid-cols-6">
        <KpiCard label="Payments" value={total || payments.length} icon={CreditCard} active={true} color="blue" />
        <KpiCard label="Successful" value={paymentSummary.successful} icon={ShieldCheck} color="green" />
        <KpiCard label="Visible Value" value={formatCurrency(paymentSummary.totalAmount)} icon={IndianRupee} color="indigo" />
        <KpiCard label="Success Rate" value={`${paymentSummary.successRate}%`} icon={CheckCircle2} color="purple" />
        <KpiCard label="Settled Value" value={formatCurrency(paymentSummary.settledValue)} icon={Receipt} color="blue" />
        <KpiCard label="Escrow Held" value={formatCurrency(paymentSummary.escrowHeldValue)} icon={Lock} color="amber" />
      </div>

      {error && <InlineError message={error} onRetry={reload} />}
      {warning && (
        <div className="rounded-lg border border-amber-200 bg-amber-50 px-4 py-3 text-xs font-bold text-amber-800">
          {warning}
        </div>
      )}

      {/* Inline Filters Bar */}
      <div className="flex flex-col gap-3 md:flex-row md:items-center justify-between border-y border-slate-200 bg-slate-50/50 py-3 px-1">
        <div className="relative min-w-0 flex-1 max-w-md">
          <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
          <input
            value={searchTerm}
            onChange={e => { setSearchTerm(e.target.value); setPage(1); }}
            placeholder="Search reference, invoice, PO..."
            className="h-10 w-full rounded-lg border border-slate-200 bg-white pl-10 pr-3 text-xs font-semibold outline-none focus:ring-2 focus:ring-[#12335f]/20"
          />
        </div>

        <div className="flex items-center gap-3 justify-end">
          <select
            value={statusFilter}
            onChange={e => { setStatusFilter(e.target.value); setPage(1); }}
            className="h-10 min-w-[140px] rounded-lg border border-slate-200 bg-white px-3 text-xs font-bold outline-none focus:ring-2 focus:ring-[#12335f]/20"
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
            onChange={e => { setGatewayFilter(e.target.value); setPage(1); }}
            className="h-10 min-w-[140px] rounded-lg border border-slate-200 bg-white px-3 text-xs font-bold outline-none focus:ring-2 focus:ring-[#12335f]/20"
          >
            <option value="">Gateway / any</option>
            <option value="bank_transfer">Bank transfer</option>
            <option value="razorpay">Razorpay</option>
            <option value="cashfree">Cashfree</option>
          </select>

          <select
            value={escrowFilter}
            onChange={e => { setEscrowFilter(e.target.value); setPage(1); }}
            className="h-10 min-w-[140px] rounded-lg border border-slate-200 bg-white px-3 text-xs font-bold outline-none focus:ring-2 focus:ring-[#12335f]/20"
          >
            <option value="">Escrow / any</option>
            <option value="funded">Funded</option>
            <option value="not_funded">Not funded</option>
          </select>
        </div>
      </div>

      {filtered.length === 0 ? (
        <EmptyState
          title="No payments found"
          description={searchTerm || statusFilter || gatewayFilter || escrowFilter
            ? 'No transactions match the current search, status, gateway, or escrow filters.'
            : admin
              ? 'No payment transactions have been recorded yet. Payments appear after invoice checkout, offline proof verification, or escrow settlement.'
              : 'No transactions are linked to your account yet. Payments appear after invoice checkout, offline proof verification, or escrow release.'}
        />
      ) : viewMode === 'grid' ? (
        <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
          {pagedPayments.map((payment, index) => {
            const tax = payment.metadata?.taxSummary || {};
            const rowIndex = (page - 1) * pageSize + index + 1;
            return (
              <div key={payment.id} className="group rounded-2xl border border-slate-200 bg-white p-4 text-left shadow-sm transition hover:border-[#12335f]/40 hover:shadow-md flex flex-col justify-between">
                <div className="w-full space-y-3">
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <div className="flex items-center gap-2">
                        <span className="flex h-5 w-5 shrink-0 items-center justify-center rounded bg-slate-100 font-mono text-[9px] font-black text-slate-500">
                          {String(rowIndex).padStart(2, '0')}
                        </span>
                        <EntityIdLink label={payment.referenceId} id={payment.id} size="sm" onClick={() => { setDetailTab('receipt'); setSelected(payment); }} />
                      </div>
                      <p className="mt-1.5 text-[10px] text-slate-500 font-semibold">Invoice: {payment.invoice?.invoiceNumber || payment.invoiceId || '-'}</p>
                    </div>
                    <span className="rounded-full border border-slate-200 bg-slate-50 px-2.5 py-0.5 text-[10px] font-black uppercase text-slate-700">
                      {String(payment.status || 'initiated').replace(/_/g, ' ')}
                    </span>
                  </div>

                  <div className="grid grid-cols-2 gap-2.5 text-[10px] font-semibold text-slate-500 border-t border-slate-100 pt-3">
                    <InfoTile label="Gateway" value={`${payment.gateway || 'manual'} / ${payment.method || 'bank_transfer'}`} />
                    <InfoTile label="Amount" value={formatCurrency(payment.amount)} />
                    <InfoTile label="PO Number" value={payment.purchaseOrder?.poNumber || '-'} />
                    <InfoTile label="Tax/TDS" value={`GST ${formatCurrency(tax.totalTaxAmount || 0)} | TDS ${formatCurrency(tax.tdsAmount || 0)}`} />
                  </div>

                  <div className="flex flex-wrap items-center gap-2 text-[9px] font-black uppercase tracking-wider text-slate-500 border-t border-slate-100 pt-3">
                    <span className="rounded-md bg-slate-100 px-2 py-0.5">Payer: {payment.payer?.name || `Payer #${payment.payer?.id}`}</span>
                    <span className="rounded-md bg-slate-100 px-2 py-0.5">Payee: {payment.payee?.name || `Payee #${payment.payee?.id}`}</span>
                  </div>

                  <div className="flex flex-wrap gap-2 pt-2 border-t border-slate-100">
                    <Button size="sm" variant="outline" className="h-8 text-[10px] font-black uppercase rounded-lg" onClick={() => { setDetailTab('receipt'); setSelected(payment); }}>
                      <Receipt className="mr-1.5 h-3.5 w-3.5" />View Receipt
                    </Button>
                    <Button size="sm" className="h-8 text-[10px] font-black uppercase rounded-lg" onClick={() => { setDetailTab('timeline'); setSelected(payment); }}>
                      <Clock3 className="mr-1.5 h-3.5 w-3.5" />Track Payment
                    </Button>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      ) : (
        <div className="overflow-hidden rounded-2xl border border-slate-200/80 bg-white shadow-sm">
          <div className="overflow-x-auto">
            <table className="w-full min-w-[1080px] border-collapse text-left text-xs">
              <thead>
                <tr className="border-b border-slate-200 bg-slate-50/75 hover:bg-transparent">
                  <th className="p-3 text-[10px] font-black uppercase tracking-wider text-slate-500 w-16">Sr. No</th>
                  <th className="p-3"><SortableHeader label="Reference" field="reference" activeField={sortKey} direction={sortDirection} onSort={toggleSort} /></th>
                  <th className="p-3"><SortableHeader label="Parties" field="parties" activeField={sortKey} direction={sortDirection} onSort={toggleSort} /></th>
                  <th className="p-3"><SortableHeader label="Gateway" field="gateway" activeField={sortKey} direction={sortDirection} onSort={toggleSort} /></th>
                  <th className="p-3"><SortableHeader label="Amount" field="amount" activeField={sortKey} direction={sortDirection} onSort={toggleSort} /></th>
                  <th className="p-3">Tax/TDS</th>
                  <th className="p-3"><SortableHeader label="Escrow Vault" field="escrow" activeField={sortKey} direction={sortDirection} onSort={toggleSort} /></th>
                  <th className="p-3">Ledger Entries</th>
                  <th className="p-3"><SortableHeader label="Status" field="status" activeField={sortKey} direction={sortDirection} onSort={toggleSort} /></th>
                  <th className="p-3"><SortableHeader label="Date" field="date" activeField={sortKey} direction={sortDirection} onSort={toggleSort} /></th>
                  <th className="p-3 text-right w-44">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 font-semibold text-slate-700">
                {pagedPayments.map((payment, index) => {
                  const tax = payment.metadata?.taxSummary || {};
                  const isSuccess = ['success', 'escrow_released'].includes(payment.status || '');
                  const rowNumber = (page - 1) * pageSize + index + 1;

                  return (
                    <tr key={payment.id} className="hover:bg-slate-50/50 transition cursor-pointer" onClick={() => { setDetailTab('receipt'); setSelected(payment); }}>
                      <td className="p-3 font-mono text-xs text-slate-500">{rowNumber}</td>
                      <td className="p-3" onClick={e => e.stopPropagation()}>
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
                      <td className="p-3 text-xs font-black text-slate-900">{formatCurrency(payment.amount)}</td>
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
                      <td className="p-3 text-right space-y-2 sm:space-y-0 sm:flex sm:justify-end sm:items-center sm:gap-2" onClick={e => e.stopPropagation()}>
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
    <div className="rounded-md border border-slate-200 bg-slate-50 p-2.5">
      <p className="text-[9px] font-black uppercase tracking-widest text-slate-400">{label}</p>
      <p className="mt-1 break-words text-xs font-bold text-slate-800">{value || '-'}</p>
    </div>
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
                            <th className="w-16 p-3">Sr. No</th>
                            <th className="p-3">Entry</th>
                            <th className="p-3">Debit Account</th>
                            <th className="p-3">Credit Account</th>
                            <th className="p-3 text-right">Amount</th>
                            <th className="p-3">Recorded On</th>
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-slate-100">
                          {payment.ledgerEntries?.map((entry, index) => (
                            <tr key={entry.id}>
                              <td className="p-3 text-xs font-black text-slate-500">{String(index + 1).padStart(2, '0')}</td>
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
