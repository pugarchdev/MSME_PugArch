import { useMemo, useState } from 'react';
import {
  CheckCircle2,
  Clock,
  FileText,
  IndianRupee,
  RefreshCw,
  Search,
  Building2,
  CreditCard,
  Lock,
  Loader2,
  ShieldCheck,
  Sparkles,
  Terminal,
  ArrowRight,
  AlertCircle,
  X,
  ChevronRight,
  Check,
  ArrowUp,
  ArrowDown,
  ArrowUpDown,
  Filter
} from 'lucide-react';
import { Button } from '../../../components/ui/button';
import { Card, CardContent } from '../../../components/ui/card';
import { cn } from '../../../lib/utils';
import { EmptyState, InlineError, LoadingState } from '../../shared/FeatureStates';
import { formatCurrency, formatDate } from '../../shared/format';
import { useFeatureQuery, usePagination } from '../../shared/hooks';
import { postApi } from '../../shared/apiClient';
import { Pagination } from '../../shared/Pagination';

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
  const [showMobileFilters, setShowMobileFilters] = useState(false);

  // Checkout modal state variables
  const [checkoutInvoice, setCheckoutInvoice] = useState<InvoiceRow | null>(null);
  const [checkoutStep, setCheckoutStep] = useState<'tabs' | 'processing' | 'success'>('tabs');
  const [activeTab, setActiveTab] = useState<'razorpay' | 'bank' | 'bypass'>('razorpay');
  const [submitting, setSubmitting] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [paymentDetails, setPaymentDetails] = useState<any>(null);

  // Razorpay Tab form inputs
  const [cardNumber, setCardNumber] = useState('');
  const [cardName, setCardName] = useState('');
  const [cardExpiry, setCardExpiry] = useState('');
  const [cardCvv, setCardCvv] = useState('');

  // Sorting state variables
  const [sortField, setSortField] = useState<'invoiceNumber' | 'poNumber' | 'party' | 'taxableAmount' | 'totalTaxAmount' | 'tdsAmount' | 'totalAmount' | 'dueDate' | 'status'>('invoiceNumber');
  const [sortOrder, setSortOrder] = useState<'asc' | 'desc'>('desc');

  const toggleSort = (field: 'invoiceNumber' | 'poNumber' | 'party' | 'taxableAmount' | 'totalTaxAmount' | 'tdsAmount' | 'totalAmount' | 'dueDate' | 'status') => {
    if (sortField === field) {
      setSortOrder(sortOrder === 'asc' ? 'desc' : 'asc');
    } else {
      setSortField(field);
      setSortOrder('asc');
    }
  };

  const SortHeader = ({ label, field, className = '' }: { label: string; field: 'invoiceNumber' | 'poNumber' | 'party' | 'taxableAmount' | 'totalTaxAmount' | 'tdsAmount' | 'totalAmount' | 'dueDate' | 'status'; className?: string }) => {
    const isActive = sortField === field;
    return (
      <button
        type="button"
        onClick={() => toggleSort(field)}
        className={`inline-flex items-center gap-1 text-[10px] font-black uppercase tracking-wider transition-colors hover:text-[#12335f] ${
          isActive ? "text-[#12335f]" : "text-slate-500"
        } ${className}`}
      >
        {label}
        {isActive ? (
          sortOrder === 'asc' ? (
            <ArrowUp className="h-3 w-3 text-[#12335f]" />
          ) : (
            <ArrowDown className="h-3 w-3 text-[#12335f]" />
          )
        ) : (
          <ArrowUpDown className="h-3 w-3 opacity-45" />
        )}
      </button>
    );
  };

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

  const sortedInvoices = useMemo(() => {
    return [...filtered].sort((a, b) => {
      let aVal: any = '';
      let bVal: any = '';

      if (sortField === 'invoiceNumber') {
        aVal = a.invoiceNumber || `INV-${a.id}`;
        bVal = b.invoiceNumber || `INV-${b.id}`;
      } else if (sortField === 'poNumber') {
        aVal = a.purchaseOrder?.poNumber || `PO #${a.purchaseOrderId || ''}`;
        bVal = b.purchaseOrder?.poNumber || `PO #${b.purchaseOrderId || ''}`;
      } else if (sortField === 'party') {
        aVal = role === 'seller' ? a.buyer?.name || '' : a.seller?.name || '';
        bVal = role === 'seller' ? b.buyer?.name || '' : b.seller?.name || '';
      } else if (sortField === 'taxableAmount') {
        aVal = Number(a.taxableAmount || 0);
        bVal = Number(b.taxableAmount || 0);
      } else if (sortField === 'totalTaxAmount') {
        aVal = Number(a.totalTaxAmount || 0);
        bVal = Number(b.totalTaxAmount || 0);
      } else if (sortField === 'tdsAmount') {
        aVal = Number(a.tdsAmount || 0);
        bVal = Number(b.tdsAmount || 0);
      } else if (sortField === 'totalAmount') {
        aVal = Number(a.amount || a.totalAmount || 0);
        bVal = Number(b.amount || b.totalAmount || 0);
      } else if (sortField === 'dueDate') {
        aVal = a.dueDate || '';
        bVal = b.dueDate || '';
      } else if (sortField === 'status') {
        aVal = statusOf(a);
        bVal = statusOf(b);
      }

      if (typeof aVal === 'string') {
        return sortOrder === 'asc' ? aVal.localeCompare(bVal) : bVal.localeCompare(aVal);
      } else {
        return sortOrder === 'asc' ? aVal - bVal : bVal - aVal;
      }
    });
  }, [filtered, sortField, sortOrder, role]);
  const { page, pageSize, pageItems: pagedInvoices, total, setPage, setPageSize } = usePagination(sortedInvoices, 20);

  const totalValue = filtered.reduce((sum, invoice) => sum + Number(invoice.amount || invoice.totalAmount || 0), 0);
  const pendingCount = filtered.filter(invoice => ['draft', 'submitted', 'pending'].includes(statusOf(invoice))).length;
  const approvedCount = filtered.filter(invoice => ['approved', 'paid'].includes(statusOf(invoice))).length;

  // Invoice Actions
  const handleApproveInvoice = async (invoiceId: number) => {
    if (submitting) return;
    setSubmitting(true);
    try {
      await postApi(`/api/invoices/${invoiceId}/approve`, {});
      await reload();
    } catch (err: any) {
      alert(err.message || 'Invoice approval failed');
    } finally {
      setSubmitting(false);
    }
  };

  const handleOpenCheckout = (invoice: InvoiceRow) => {
    setCheckoutInvoice(invoice);
    setCheckoutStep('tabs');
    setActiveTab('razorpay');
    setErrorMsg(null);
    setPaymentDetails(null);
    setCardNumber('');
    setCardName('');
    setCardExpiry('');
    setCardCvv('');
  };

  const handleConfirmCheckout = async (gatewayType: 'razorpay' | 'bank_transfer') => {
    if (!checkoutInvoice || submitting) return;
    setSubmitting(true);
    setErrorMsg(null);

    // Basic Card Validation if using Razorpay
    if (gatewayType === 'razorpay') {
      if (cardNumber.replace(/\s/g, '').length < 16) {
        setErrorMsg('Please enter a valid 16-digit card number');
        setSubmitting(false);
        return;
      }
      if (!cardName.trim()) {
        setErrorMsg('Please enter the name on the card');
        setSubmitting(false);
        return;
      }
      if (cardExpiry.length < 5 || !cardExpiry.includes('/')) {
        setErrorMsg('Please enter a valid expiry date (MM/YY)');
        setSubmitting(false);
        return;
      }
      if (cardCvv.length < 3) {
        setErrorMsg('Please enter a valid 3-digit CVV');
        setSubmitting(false);
        return;
      }
    }

    setCheckoutStep('processing');

    try {
      // Step 1: Initiate Payment
      const initRes = await postApi<any>('/api/payments/initiate', {
        invoiceId: checkoutInvoice.id,
        gateway: gatewayType,
        method: gatewayType === 'razorpay' ? 'card' : 'bank_transfer'
      });

      // Step 2: Simulate Success
      const successRes = await postApi<any>(`/api/payments/${initRes.id}/simulate-success`, {});

      setPaymentDetails(successRes);
      setCheckoutStep('success');
    } catch (err: any) {
      setCheckoutStep('tabs');
      setErrorMsg(err.message || 'Payment simulation failed. Please try again.');
    } finally {
      setSubmitting(false);
    }
  };

  if (loading) return <LoadingState label="Loading invoices..." />;

  return (
    <div className="space-y-4">
      <div className="flex flex-col gap-3 border-b border-slate-200 pb-4 md:flex-row md:items-end md:justify-between">
        <div>
          <p className="text-[10px] font-black uppercase tracking-widest text-[#12335f]">
            {role === 'seller' ? 'Seller Finance' : role === 'admin' ? 'Admin Finance' : 'Buyer Finance'}
          </p>
          <h1 className="text-2xl font-black tracking-tight text-slate-950">Invoices</h1>
          <p className="mt-1 max-w-2xl text-xs font-semibold text-slate-500">
            Invoice register with PO linkage, GST/TDS values, due dates, and payment workflows.
          </p>
        </div>
        <Button variant="outline" onClick={reload} className="h-10 rounded-lg text-xs font-black uppercase">
          <RefreshCw className="mr-2 h-4 w-4" />Refresh
        </Button>
      </div>

      <div className="grid gap-3 grid-cols-2 md:grid-cols-4">
        <Metric label="Invoices" value={filtered.length} icon={FileText} />
        <Metric label="Pending" value={pendingCount} icon={Clock} />
        <Metric label="Approved/Paid" value={approvedCount} icon={CheckCircle2} />
        <Metric label="Invoice Value" value={formatCurrency(totalValue)} icon={IndianRupee} />
      </div>

      {error && <InlineError message={error} onRetry={reload} />}

      <Card className="border-slate-200/80 shadow-sm bg-white">
        <CardContent className="p-4 space-y-3">
          <div className="flex flex-col sm:flex-row gap-2 items-center">
            <div className="relative flex-1 w-full">
              <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
              <input
                value={searchTerm}
                onChange={event => setSearchTerm(event.target.value)}
                placeholder="Search invoice, PO, buyer, seller..."
                className="h-10 w-full rounded-lg border border-slate-200 bg-white pl-10 pr-3 text-xs font-semibold outline-none focus:ring-2 focus:ring-[#12335f]/20"
              />
            </div>
            
            <Button
              type="button"
              variant="outline"
              onClick={() => setShowMobileFilters(!showMobileFilters)}
              className="md:hidden h-10 w-full sm:w-auto gap-2 rounded-lg text-xs font-black uppercase tracking-wider border-slate-200 text-slate-700 hover:bg-slate-50 shrink-0"
            >
              <Filter className="h-4 w-4 text-slate-500" />
              <span>Filters {showMobileFilters ? '(Hide)' : '(Show)'}</span>
            </Button>
          </div>

          <div className={cn(
            "grid gap-3 items-center",
            showMobileFilters ? "grid grid-cols-2" : "hidden md:grid md:grid-cols-[190px] md:justify-end"
          )}>
            <select
              value={statusFilter}
              onChange={event => setStatusFilter(event.target.value)}
              className="h-10 rounded-lg border border-slate-200 bg-white px-3 text-xs font-bold outline-none focus:ring-2 focus:ring-[#12335f]/20 w-full"
            >
              <option value="">All statuses</option>
              {statuses.map(status => (
                <option key={status} value={status}>
                  {status.replace(/_/g, ' ')}
                </option>
              ))}
            </select>
          </div>
        </CardContent>
      </Card>

      {filtered.length === 0 ? (
        <EmptyState
          title="No invoices found"
          description="Invoices will appear once sellers submit bills against accepted purchase orders."
        />
      ) : (
        <div className="overflow-hidden rounded-lg border border-slate-200 bg-white">
          <div className="overflow-x-auto">
            <table className="w-full min-w-[1080px] text-left text-sm">
              <thead className="bg-slate-50 text-[10px] font-black uppercase tracking-wider text-slate-500">
                <tr>
                  <th className="p-3"><SortHeader label="Invoice" field="invoiceNumber" /></th>
                  <th className="p-3"><SortHeader label="PO" field="poNumber" /></th>
                  <th className="p-3"><SortHeader label="Party" field="party" /></th>
                  <th className="p-3"><SortHeader label="Taxable" field="taxableAmount" /></th>
                  <th className="p-3"><SortHeader label="GST" field="totalTaxAmount" /></th>
                  <th className="p-3"><SortHeader label="TDS" field="tdsAmount" /></th>
                  <th className="p-3"><SortHeader label="Total" field="totalAmount" /></th>
                  <th className="p-3"><SortHeader label="Due" field="dueDate" /></th>
                  <th className="p-3"><SortHeader label="Status" field="status" /></th>
                  <th className="p-3 text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {pagedInvoices.map(invoice => {
                  const state = statusOf(invoice);
                  const isSubmitted = state === 'submitted';
                  const isPayable = state === 'approved' || state === 'payment_initiated';

                  return (
                    <tr key={invoice.id} className="hover:bg-slate-50">
                      <td className="p-3">
                        <p className="font-mono text-xs font-black text-[#12335f]">{invoice.invoiceNumber || `INV-${invoice.id}`}</p>
                        <p className="text-[10px] font-semibold text-slate-500">{formatDate(invoice.createdAt)}</p>
                      </td>
                      <td className="p-3">
                        <p className="text-xs font-black text-slate-900">{invoice.purchaseOrder?.poNumber || `PO #${invoice.purchaseOrderId || '-'}`}</p>
                        <p className="text-[10px] font-semibold text-slate-500">{invoice.purchaseOrder?.title || '-'}</p>
                      </td>
                      <td className="p-3 text-xs font-bold text-slate-600">
                        {role === 'seller' ? invoice.buyer?.name || `Buyer #${invoice.buyerId || '-'}` : invoice.seller?.name || `Seller #${invoice.sellerId || '-'}`}
                      </td>
                      <td className="p-3 text-xs font-bold text-slate-600">{formatCurrency(invoice.taxableAmount || 0)}</td>
                      <td className="p-3 text-xs font-bold text-slate-600">{formatCurrency(invoice.totalTaxAmount || 0)}</td>
                      <td className="p-3 text-xs font-bold text-slate-600">{formatCurrency(invoice.tdsAmount || 0)}</td>
                      <td className="p-3 text-xs font-black text-slate-950">{formatCurrency(invoice.amount || invoice.totalAmount)}</td>
                      <td className="p-3 text-xs font-bold text-slate-500">{formatDate(invoice.dueDate)}</td>
                      <td className="p-3">
                        <span className={`rounded-lg border px-2.5 py-0.5 text-[9px] font-black uppercase ${
                          state === 'paid'
                            ? 'border-emerald-200 bg-emerald-50 text-emerald-700'
                            : state === 'approved'
                            ? 'border-blue-200 bg-slate-50 text-[#12335f]'
                            : state === 'submitted'
                            ? 'border-amber-200 bg-amber-50 text-amber-700'
                            : 'border-slate-200 bg-slate-50 text-slate-600'
                        }`}>
                          {state.replace(/_/g, ' ')}
                        </span>
                      </td>
                      <td className="p-3 text-right">
                        {role === 'buyer' && (
                          <div className="flex justify-end gap-1.5">
                            {isSubmitted && (
                              <Button
                                size="sm"
                                disabled={submitting}
                                onClick={() => handleApproveInvoice(invoice.id)}
                                className="h-8 rounded-lg bg-[#12335f] text-[10px] font-black uppercase tracking-wider hover:bg-slate-800"
                              >
                                Approve
                              </Button>
                            )}
                            {isPayable && (
                              <Button
                                size="sm"
                                onClick={() => handleOpenCheckout(invoice)}
                                className="h-8 rounded-lg bg-emerald-600 text-[10px] font-black uppercase tracking-wider hover:bg-emerald-700"
                              >
                                Pay Now
                              </Button>
                            )}
                            {!isSubmitted && !isPayable && (
                              <span className="text-[10px] font-bold text-slate-400 italic">No actions</span>
                            )}
                          </div>
                        )}
                        {role !== 'buyer' && (
                          <span className="text-[10px] font-bold text-slate-400 italic">View Only</span>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
          <Pagination page={page} pageSize={pageSize} total={total} onPageChange={setPage} onPageSizeChange={setPageSize} label="invoices" />
        </div>
      )}

      {/* Glassmorphic Checkout Modal Overlay */}
      {checkoutInvoice && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/40 backdrop-blur-md transition-all duration-300">
          <div className="relative w-full max-w-xl overflow-hidden rounded-2xl border border-white/20 bg-white/95 p-6 shadow-2xl transition-all duration-300 transform scale-100 flex flex-col max-h-[90vh]">
            
            {/* Header */}
            {checkoutStep !== 'success' && (
              <div className="flex items-center justify-between border-b border-slate-200 pb-4 mb-4">
                <div>
                  <span className="flex items-center gap-1 text-[9px] font-extrabold uppercase tracking-widest text-emerald-600">
                    <Lock className="h-3 w-3" /> Secure Payment Escrow
                  </span>
                  <h2 className="text-lg font-black tracking-tight text-slate-900">
                    Settle Invoice {checkoutInvoice.invoiceNumber || `INV-${checkoutInvoice.id}`}
                  </h2>
                </div>
                <button
                  onClick={() => setCheckoutInvoice(null)}
                  className="rounded-lg border border-slate-200 p-2 text-slate-500 hover:bg-slate-50 transition"
                >
                  <X className="h-4 w-4" />
                </button>
              </div>
            )}

            {/* Error Message */}
            {errorMsg && (
              <div className="mb-4 flex items-center gap-2 rounded-lg border border-red-200 bg-red-50 p-3 text-xs font-bold text-red-800 animate-pulse">
                <AlertCircle className="h-4 w-4 flex-shrink-0" />
                <span>{errorMsg}</span>
              </div>
            )}

            {/* Step 1: Selection and Forms */}
            {checkoutStep === 'tabs' && (
              <div className="flex-1 overflow-y-auto space-y-4 pr-1">
                {/* Invoice Summary Card */}
                <div className="rounded-xl border border-slate-100 bg-slate-50 p-4 flex justify-between items-center">
                  <div>
                    <p className="text-[10px] font-bold text-slate-500">PAYEE (SELLER)</p>
                    <p className="text-xs font-extrabold text-slate-800">{checkoutInvoice.seller?.name || `Seller #${checkoutInvoice.sellerId}`}</p>
                    <p className="mt-1 text-[10px] font-bold text-slate-500">LINKED PURCHASE ORDER</p>
                    <p className="text-xs font-extrabold text-slate-900">{checkoutInvoice.purchaseOrder?.poNumber || `PO #${checkoutInvoice.purchaseOrderId}`}</p>
                  </div>
                  <div className="text-right">
                    <p className="text-[10px] font-bold text-slate-500">TOTAL PAYABLE AMOUNT</p>
                    <p className="text-xl font-black text-slate-950">{formatCurrency(checkoutInvoice.amount || checkoutInvoice.totalAmount)}</p>
                    <p className="text-[9px] font-black text-[#12335f] uppercase tracking-wider mt-0.5">Includes GST & Less TDS</p>
                  </div>
                </div>

                {/* Tabs selection */}
                <div className="grid grid-cols-3 gap-2 p-1 bg-slate-100 rounded-xl">
                  <button
                    onClick={() => setActiveTab('razorpay')}
                    className={`flex flex-col items-center justify-center py-2.5 rounded-lg text-[10px] font-extrabold uppercase transition-all ${
                      activeTab === 'razorpay'
                        ? 'bg-white text-slate-950 shadow-md shadow-slate-200/50'
                        : 'text-slate-500 hover:text-slate-800'
                    }`}
                  >
                    <CreditCard className="h-4 w-4 mb-1" />
                    Razorpay
                  </button>
                  <button
                    onClick={() => setActiveTab('bank')}
                    className={`flex flex-col items-center justify-center py-2.5 rounded-lg text-[10px] font-extrabold uppercase transition-all ${
                      activeTab === 'bank'
                        ? 'bg-white text-slate-950 shadow-md shadow-slate-200/50'
                        : 'text-slate-500 hover:text-slate-800'
                    }`}
                  >
                    <Building2 className="h-4 w-4 mb-1" />
                    Bank Transfer
                  </button>
                  <button
                    onClick={() => setActiveTab('bypass')}
                    className={`flex flex-col items-center justify-center py-2.5 rounded-lg text-[10px] font-extrabold uppercase transition-all ${
                      activeTab === 'bypass'
                        ? 'bg-slate-900 text-emerald-400 shadow-md shadow-slate-900/20'
                        : 'text-slate-500 hover:text-slate-800'
                    }`}
                  >
                    <Terminal className="h-4 w-4 mb-1 text-emerald-500" />
                    Dev Bypass
                  </button>
                </div>

                {/* Tab content */}
                <div className="pt-2">
                  {activeTab === 'razorpay' && (
                    <div className="space-y-3">
                      <div className="rounded-lg border border-slate-100 bg-slate-50/50 p-3 text-xs text-blue-800 flex gap-2">
                        <Sparkles className="h-4 w-4 text-[#12335f] flex-shrink-0" />
                        <div>
                          <p className="font-extrabold">Razorpay Premium Sandbox</p>
                          <p className="mt-0.5 text-slate-500 font-semibold leading-relaxed">
                            Simulate high-throughput card settlement. Enter any mock card details to process your transaction instantly.
                          </p>
                        </div>
                      </div>

                      <div className="grid gap-3">
                        <div>
                          <label className="text-[10px] font-black uppercase text-slate-500">Card Number</label>
                          <input
                            type="text"
                            placeholder="4111 2222 3333 4444"
                            maxLength={19}
                            value={cardNumber}
                            onChange={e => {
                              const v = e.target.value.replace(/\D/g, '');
                              const formatted = v.match(/.{1,4}/g)?.join(' ') || v;
                              setCardNumber(formatted);
                            }}
                            className="h-10 w-full rounded-lg border border-slate-200 bg-white px-3 text-xs font-semibold outline-none focus:ring-2 focus:ring-[#12335f]/20"
                          />
                        </div>

                        <div className="grid grid-cols-3 gap-3">
                          <div className="col-span-2">
                            <label className="text-[10px] font-black uppercase text-slate-500">Card Holder</label>
                            <input
                              type="text"
                              placeholder="ANAND GADGE"
                              value={cardName}
                              onChange={e => setCardName(e.target.value.toUpperCase())}
                              className="h-10 w-full rounded-lg border border-slate-200 bg-white px-3 text-xs font-semibold outline-none focus:ring-2 focus:ring-[#12335f]/20"
                            />
                          </div>
                          <div>
                            <label className="text-[10px] font-black uppercase text-slate-500">Expiry (MM/YY)</label>
                            <input
                              type="text"
                              placeholder="12/28"
                              maxLength={5}
                              value={cardExpiry}
                              onChange={e => {
                                let v = e.target.value.replace(/\D/g, '');
                                if (v.length > 2) {
                                  v = v.slice(0, 2) + '/' + v.slice(2, 4);
                                }
                                setCardExpiry(v);
                              }}
                              className="h-10 w-full rounded-lg border border-slate-200 bg-white px-3 text-xs font-semibold outline-none focus:ring-2 focus:ring-[#12335f]/20 text-center"
                            />
                          </div>
                        </div>

                        <div className="grid grid-cols-3 gap-3">
                          <div>
                            <label className="text-[10px] font-black uppercase text-slate-500">CVV / CVC</label>
                            <input
                              type="password"
                              placeholder="123"
                              maxLength={3}
                              value={cardCvv}
                              onChange={e => setCardCvv(e.target.value.replace(/\D/g, ''))}
                              className="h-10 w-full rounded-lg border border-slate-200 bg-white px-3 text-xs font-semibold outline-none focus:ring-2 focus:ring-[#12335f]/20 text-center"
                            />
                          </div>
                          <div className="col-span-2 flex items-end">
                            <Button
                              onClick={() => handleConfirmCheckout('razorpay')}
                              className="h-10 w-full rounded-lg bg-emerald-600 hover:bg-emerald-700 text-xs font-black uppercase tracking-wider"
                            >
                              Pay {formatCurrency(checkoutInvoice.amount || checkoutInvoice.totalAmount)}
                            </Button>
                          </div>
                        </div>
                      </div>
                    </div>
                  )}

                  {activeTab === 'bank' && (
                    <div className="space-y-3">
                      <div className="rounded-lg border border-slate-200 bg-slate-50 p-4 space-y-2.5">
                        <p className="text-[10px] font-black uppercase tracking-widest text-[#12335f] border-b border-slate-200 pb-1">
                          Escrow Virtual Bank Account Details
                        </p>
                        <div className="grid grid-cols-2 gap-y-2 text-xs">
                          <div>
                            <p className="font-bold text-slate-400">BENEFICIARY</p>
                            <p className="font-black text-slate-800">PugArch Escrow Services</p>
                          </div>
                          <div>
                            <p className="font-bold text-slate-400">BANK NAME</p>
                            <p className="font-black text-slate-800">ICICI Bank Ltd</p>
                          </div>
                          <div>
                            <p className="font-bold text-slate-400">VIRTUAL ACCOUNT</p>
                            <p className="font-mono font-black text-slate-900 text-sm">
                              PUGARCH{checkoutInvoice.invoiceNumber?.replace(/[^a-zA-Z0-9]/g, '') || checkoutInvoice.id}
                            </p>
                          </div>
                          <div>
                            <p className="font-bold text-slate-400">IFSC CODE</p>
                            <p className="font-mono font-black text-slate-800">ICIC0000104</p>
                          </div>
                          <div>
                            <p className="font-bold text-slate-400">ACCOUNT TYPE</p>
                            <p className="font-black text-slate-800">Current Account</p>
                          </div>
                          <div>
                            <p className="font-bold text-slate-400">ROUTING ROUTE</p>
                            <p className="font-black text-slate-800">NEFT / IMPS / RTGS</p>
                          </div>
                        </div>
                      </div>

                      <div className="rounded-lg border border-amber-100 bg-amber-50/50 p-3 text-xs text-amber-900 flex gap-2">
                        <AlertCircle className="h-4 w-4 text-amber-600 flex-shrink-0" />
                        <p className="font-semibold leading-relaxed text-slate-600">
                          Transfer the funds via corporate banking net banking. You can use the button below to simulate immediate settlement verification from our bank webhook.
                        </p>
                      </div>

                      <Button
                        onClick={() => handleConfirmCheckout('bank_transfer')}
                        className="h-10 w-full rounded-lg bg-emerald-600 hover:bg-emerald-700 text-xs font-black uppercase tracking-wider"
                      >
                        Simulate Bank Transfer Receipt
                      </Button>
                    </div>
                  )}

                  {activeTab === 'bypass' && (
                    <div className="rounded-xl border border-slate-800 bg-slate-900 p-5 space-y-4 text-slate-200">
                      <div className="flex items-center gap-2 text-emerald-400">
                        <Terminal className="h-5 w-5" />
                        <h4 className="font-mono text-sm font-black uppercase tracking-wider">Developer Sandbox Bypass</h4>
                      </div>

                      <p className="text-xs text-slate-400 leading-relaxed font-semibold">
                        This environment option initiates a secure, verified offline transaction directly, generating standard financial ledger logs, and locking custody in Escrow within a single Prisma atomic step.
                      </p>

                      <div className="rounded-lg bg-slate-950 p-3 font-mono text-[10px] text-slate-400 border border-slate-800 space-y-1">
                        <p className="text-emerald-500">$ curl -X POST "/api/payments/initiate"</p>
                        <p className="text-emerald-500">$ curl -X POST "/api/payments/:id/simulate-success"</p>
                        <p className="text-slate-500">// Atomically transitions invoice to PAID and purchase order to ESCROW_HELD</p>
                      </div>

                      <Button
                        onClick={() => handleConfirmCheckout('bank_transfer')}
                        className="w-full h-10 rounded-lg bg-emerald-500 text-slate-950 font-black uppercase tracking-wider hover:bg-emerald-400 transition-all duration-300"
                      >
                        Atomically Settle Payment Now
                      </Button>
                    </div>
                  )}
                </div>
              </div>
            )}

            {/* Step 2: Processing state */}
            {checkoutStep === 'processing' && (
              <div className="flex-1 py-12 flex flex-col items-center justify-center text-center space-y-4">
                <div className="relative">
                  <div className="h-16 w-16 rounded-full border-4 border-slate-200 border-t-emerald-600 animate-spin"></div>
                  <Lock className="absolute inset-0 m-auto h-6 w-6 text-slate-400" />
                </div>
                <div className="space-y-1.5">
                  <h3 className="text-base font-black text-slate-900">Securing Payment Channel...</h3>
                  <p className="text-xs font-semibold text-slate-500 max-w-sm">
                    Connecting to MSME-Gateway, initiating double-entry ledger audits, and preparing Escrow custody vault.
                  </p>
                </div>
              </div>
            )}

            {/* Step 3: Success Screen */}
            {checkoutStep === 'success' && paymentDetails && (
              <div className="flex-1 py-4 flex flex-col space-y-5 overflow-y-auto pr-1">
                {/* Emerald Circle Checkmark */}
                <div className="flex flex-col items-center justify-center text-center">
                  <div className="h-14 w-14 rounded-full bg-emerald-100 flex items-center justify-center text-emerald-600 mb-3 border-4 border-emerald-50 animate-bounce">
                    <Check className="h-7 w-7 stroke-[3]" />
                  </div>
                  <h3 className="text-lg font-black text-slate-950">Payment Settled & Held in Escrow</h3>
                  <p className="text-xs font-semibold text-slate-500 mt-1">
                    Your payment was secured successfully. Funds are held in escrow custody until PO delivery completion.
                  </p>
                </div>

                {/* Receipt Details Card */}
                <div className="rounded-xl border border-slate-100 bg-slate-50/60 p-4 space-y-3">
                  <div className="flex justify-between items-center border-b border-slate-100 pb-2">
                    <div>
                      <p className="text-[9px] font-bold text-slate-400 uppercase">TRANSACTION REFERENCE</p>
                      <p className="font-mono text-xs font-black text-[#12335f]">
                        {paymentDetails.payment?.referenceId || 'REF-SIM-98218'}
                      </p>
                    </div>
                    <div className="text-right">
                      <p className="text-[9px] font-bold text-slate-400 uppercase">AMOUNT PAID</p>
                      <p className="text-sm font-black text-slate-900">
                        {formatCurrency(paymentDetails.payment?.amount)}
                      </p>
                    </div>
                  </div>

                  <div className="grid grid-cols-2 gap-3 text-xs pt-1">
                    <div>
                      <p className="text-[9px] font-bold text-slate-400 uppercase">ESCROW SYSTEM Vault</p>
                      <span className="flex items-center gap-1 font-bold text-emerald-700 bg-emerald-50 border border-emerald-200/50 rounded-md px-1.5 py-0.5 w-max text-[10px] mt-0.5">
                        <ShieldCheck className="h-3 w-3" /> HELD & SECURED
                      </span>
                    </div>
                    <div>
                      <p className="text-[9px] font-bold text-slate-400 uppercase">LEDGER AUDIT LOG</p>
                      <span className="flex items-center gap-1 font-bold text-[#12335f] bg-slate-50 border border-blue-200/50 rounded-md px-1.5 py-0.5 w-max text-[10px] mt-0.5">
                        <Sparkles className="h-3 w-3" /> VERIFIED OK
                      </span>
                    </div>
                  </div>

                  <div className="rounded-lg bg-white border border-slate-100 p-2.5 space-y-1">
                    <p className="text-[9px] font-black uppercase text-slate-400 tracking-wider">Double-Entry Financial Receipt</p>
                    <div className="flex justify-between text-[11px] font-bold text-slate-600">
                      <span>Debit: Buyer Account</span>
                      <span>{formatCurrency(paymentDetails.payment?.amount)}</span>
                    </div>
                    <div className="flex justify-between text-[11px] font-bold text-slate-600">
                      <span>Credit: Escrow Platform</span>
                      <span>{formatCurrency(paymentDetails.payment?.amount)}</span>
                    </div>
                  </div>
                </div>

                <div className="flex items-center gap-2 pt-2">
                  <Button
                    onClick={() => {
                      setCheckoutInvoice(null);
                      void reload();
                    }}
                    className="flex-1 h-11 rounded-lg bg-slate-900 hover:bg-slate-800 text-xs font-black uppercase tracking-wider"
                  >
                    Done & Close
                  </Button>
                </div>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

function Metric({ label, value, icon: Icon }: { label: string; value: string | number; icon: any }) {
  return (
    <Card>
      <CardContent className="flex items-center justify-between p-4">
        <div>
          <p className="text-[10px] font-black uppercase tracking-widest text-slate-500">{label}</p>
          <p className="mt-1 text-lg font-black text-slate-950">{value}</p>
        </div>
        <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-slate-50 text-[#12335f]">
          <Icon className="h-5 w-5" />
        </div>
      </CardContent>
    </Card>
  );
}
