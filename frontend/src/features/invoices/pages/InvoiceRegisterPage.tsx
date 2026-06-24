import { useEffect, useMemo, useState } from 'react';
import { CheckCircle2, Clock, FileText, IndianRupee, RefreshCw, Search, Building2, CreditCard, Lock, ShieldCheck, Sparkles, Terminal, ArrowRight, AlertCircle, X, ChevronRight, Check, ArrowUp, ArrowDown, ArrowUpDown, Filter, LayoutGrid, List } from 'lucide-react';
import { Loader2 } from '@/components/ui/loader';
import { toast } from 'sonner';
import { Button } from '../../../components/ui/button';
import { Card, CardContent } from '../../../components/ui/card';
import { cn } from '../../../lib/utils';
import { EmptyState, InlineError, LoadingState } from '../../shared/FeatureStates';
import { formatCurrency, formatDate } from '../../shared/format';
import { useFeatureQuery, usePaginatedFeatureQuery, useResponsiveViewMode } from '../../shared/hooks';
import { usePurchaseOrders } from '../../purchaseOrders/hooks';
import { postApi, getApi } from '../../shared/apiClient';
import { Pagination } from '../../shared/Pagination';
import { EntityIdLink } from '../../shared/EntityIdLink';
import { ViewModeToggle } from '../../shared/ViewModeToggle';
import { GST_STANDARD_RATES, formatTaxRate } from '../../shared/gstTax';

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
  cgstAmount?: string | number;
  sgstAmount?: string | number;
  igstAmount?: string | number;
  tdsAmount?: string | number;
  status?: string;
  invoiceStatus?: string;
  dueDate?: string;
  createdAt?: string;
  updatedAt?: string;
  approvedAt?: string;
  interstate?: boolean;
  buyer?: { name?: string };
  seller?: { name?: string };
  purchaseOrder?: { poNumber?: string; title?: string; poStatus?: string };
};

const statusOf = (invoice: InvoiceRow) => String(invoice.invoiceStatus || invoice.status || 'draft').toLowerCase();

const statuses = ['draft', 'submitted', 'under_review', 'approved', 'rejected', 'paid', 'cancelled'];

export default function InvoiceRegisterPage({ role = 'buyer' }: { role?: 'buyer' | 'seller' | 'admin' }) {
  const [searchTerm, setSearchTerm] = useState('');
  const [debouncedSearch, setDebouncedSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState('');
  const [acceptedPoOnly, setAcceptedPoOnly] = useState(false);
  const [invoiceScope, setInvoiceScope] = useState<'all' | 'interstate' | 'domestic'>('all');
  const [viewMode, setViewMode] = useResponsiveViewMode();
  const [showMobileFilters, setShowMobileFilters] = useState(false);
  const [selectedInvoice, setSelectedInvoice] = useState<InvoiceRow | null>(null);
  const [invoiceModalMode, setInvoiceModalMode] = useState<'view' | 'track'>('view');
  const [detailedInvoice, setDetailedInvoice] = useState<any>(null);
  const [detailedLoading, setDetailedLoading] = useState(false);
  const [expandedStep, setExpandedStep] = useState<number | null>(null);

  // Sorting state variables
  const [sortField, setSortField] = useState<'invoiceNumber' | 'poNumber' | 'party' | 'taxableAmount' | 'totalTaxAmount' | 'tdsAmount' | 'totalAmount' | 'dueDate' | 'status'>('invoiceNumber');
  const [sortOrder, setSortOrder] = useState<'asc' | 'desc'>('desc');

  useEffect(() => {
    const handler = setTimeout(() => {
      setDebouncedSearch(searchTerm);
    }, 400);
    return () => clearTimeout(handler);
  }, [searchTerm]);

  const {
    records: pagedInvoices,
    loading,
    refreshing,
    error,
    reload,
    setRecords: setPagedInvoices,
    page,
    pageSize,
    total,
    setPage,
    setPageSize
  } = usePaginatedFeatureQuery<InvoiceRow>(
    '/api/invoices',
    {
      search: debouncedSearch,
      status: statusFilter,
      acceptedPo: acceptedPoOnly ? 'true' : undefined,
      scope: invoiceScope,
      sortBy: sortField,
      sortOrder
    },
    10
  );

  const { data: summaryData } = useFeatureQuery<{ totalValue: number; pendingCount: number; approvedCount: number } | null>(
    '/api/invoices/summary',
    null
  );
  const totalValue = summaryData?.totalValue ?? 0;
  const pendingCount = summaryData?.pendingCount ?? 0;
  const approvedCount = summaryData?.approvedCount ?? 0;
  const invoiceHealth = useMemo(() => {
    const now = new Date();
    const nextWeek = new Date(now);
    nextWeek.setDate(now.getDate() + 7);
    return pagedInvoices.reduce(
      (acc, invoice) => {
        const due = invoice.dueDate ? new Date(invoice.dueDate) : null;
        const state = statusOf(invoice);
        const closed = ['paid', 'cancelled', 'rejected'].includes(state);
        if (due && !Number.isNaN(due.getTime()) && !closed) {
          if (due < now) acc.overdue += 1;
          else if (due <= nextWeek) acc.dueSoon += 1;
        }
        acc.tax += Number(invoice.totalTaxAmount || 0);
        acc.tds += Number(invoice.tdsAmount || 0);
        acc.submitted += state === 'submitted' ? 1 : 0;
        return acc;
      },
      { overdue: 0, dueSoon: 0, tax: 0, tds: 0, submitted: 0 }
    );
  }, [pagedInvoices]);

  useEffect(() => {
    if (!selectedInvoice) {
      setDetailedInvoice(null);
      return;
    }
    const fetchDetailedInvoice = async () => {
      setDetailedLoading(true);
      try {
        const data = await getApi<any>(`/api/invoices/${selectedInvoice.id}`, true);
        setDetailedInvoice(data);
      } catch (err) {
        setDetailedInvoice(null);
        const message = err instanceof Error ? err.message : 'Unable to load invoice details.';
        if (!/session expired|sign in again/i.test(message)) {
          toast.error(message);
        }
      } finally {
        setDetailedLoading(false);
      }
    };
    void fetchDetailedInvoice();
  }, [selectedInvoice]);

  // Checkout modal state variables
  const [checkoutInvoice, setCheckoutInvoice] = useState<InvoiceRow | null>(null);
  const [checkoutStep, setCheckoutStep] = useState<'tabs' | 'processing' | 'success'>('tabs');
  const [activeTab, setActiveTab] = useState<'razorpay' | 'bank'>('razorpay');
  const [submitting, setSubmitting] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [paymentDetails, setPaymentDetails] = useState<any>(null);

  // Razorpay Tab form inputs
  const [cardNumber, setCardNumber] = useState('');
  const [cardName, setCardName] = useState('');
  const [cardExpiry, setCardExpiry] = useState('');
  const [cardCvv, setCardCvv] = useState('');

  // Seller invoice creation modal state
  const [createInvoiceModalOpen, setCreateInvoiceModalOpen] = useState(false);
  const [createInvoiceSubmitting, setCreateInvoiceSubmitting] = useState(false);
  const [createInvoiceError, setCreateInvoiceError] = useState<string | null>(null);
  const [selectedPurchaseOrderId, setSelectedPurchaseOrderId] = useState<number | null>(null);
  const [purchaseOrderSearch, setPurchaseOrderSearch] = useState('');
  const [invoiceAmount, setInvoiceAmount] = useState('');
  const [invoiceGstRate, setInvoiceGstRate] = useState('18');
  const [invoiceTdsRate, setInvoiceTdsRate] = useState('0');
  const [invoiceInterstate, setInvoiceInterstate] = useState(false);
  const [invoiceOtherTax, setInvoiceOtherTax] = useState('0');

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
        className={`inline-flex items-center gap-1 text-[10px] font-black uppercase tracking-wider transition-colors hover:text-[#12335f] ${isActive ? "text-[#12335f]" : "text-slate-500"
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

  const { data: purchaseOrders, loading: purchaseOrdersLoading, reload: reloadPurchaseOrders } = usePurchaseOrders();

  useEffect(() => {
    if (typeof window !== 'undefined') {
      const params = new URLSearchParams(window.location.search);
      const convertPoId = params.get('convertPoId');
      const amount = params.get('amount');
      if (convertPoId && purchaseOrders && purchaseOrders.length > 0) {
        const poId = Number(convertPoId);
        setSelectedPurchaseOrderId(poId);
        if (amount) {
          setInvoiceAmount(amount);
        }
        setInvoiceGstRate('18');
        setInvoiceTdsRate('0');
        setInvoiceInterstate(false);
        setInvoiceOtherTax('0');
        setCreateInvoiceModalOpen(true);

        const cleanUrl = window.location.pathname;
        window.history.replaceState({}, '', cleanUrl);
      }
    }
  }, [purchaseOrders]);

  const selectedPurchaseOrder = purchaseOrders.find(po => po.id === selectedPurchaseOrderId) ?? null;
  const acceptedPurchaseOrders = useMemo(
    () => purchaseOrders.filter(po => ['accepted'].includes((po.status || po.poStatus || '').toLowerCase())),
    [purchaseOrders]
  );
  const filteredPurchaseOrders = useMemo(() => {
    const query = purchaseOrderSearch.trim().toLowerCase();
    if (!query) return acceptedPurchaseOrders;
    return acceptedPurchaseOrders.filter(po =>
      po.poNumber?.toLowerCase().includes(query) ||
      po.title?.toLowerCase().includes(query) ||
      String(po.id).includes(query)
    );
  }, [acceptedPurchaseOrders, purchaseOrderSearch]);




  // Invoice Actions
  const handleApproveInvoice = async (invoiceId: number) => {
    if (submitting) return;
    setSubmitting(true);
    try {
      await postApi(`/api/invoices/${invoiceId}/approve`, {});
      await reload();
      toast.success('Invoice approved successfully.');
    } catch (err: any) {
      toast.error(err.message || 'Invoice approval failed');
    } finally {
      setSubmitting(false);
    }
  };

  const closeInvoiceDetails = () => {
    setSelectedInvoice(null);
    setExpandedStep(null);
  };

  const openCreateInvoiceModal = () => {
    setCreateInvoiceError(null);
    setSelectedPurchaseOrderId(null);
    setPurchaseOrderSearch('');
    setInvoiceAmount('');
    setInvoiceGstRate('18');
    setInvoiceTdsRate('0');
    setInvoiceInterstate(false);
    setInvoiceOtherTax('0');
    setCreateInvoiceModalOpen(true);
  };

  const closeCreateInvoiceModal = () => {
    if (createInvoiceSubmitting) return;
    setCreateInvoiceModalOpen(false);
    setCreateInvoiceError(null);
  };

  const handleSubmitCreateInvoice = async () => {
    if (createInvoiceSubmitting) return;

    if (!selectedPurchaseOrderId) {
      setCreateInvoiceError('Select a purchase order before submitting.');
      return;
    }

    const amount = Number(invoiceAmount);
    if (Number.isNaN(amount) || amount <= 0) {
      setCreateInvoiceError('Enter a valid invoice amount greater than zero.');
      return;
    }

    const gstRate = Number(invoiceGstRate);
    if (Number.isNaN(gstRate) || gstRate < 0 || gstRate > 100) {
      setCreateInvoiceError('Enter a valid GST rate between 0 and 100.');
      return;
    }

    const tdsRate = Number(invoiceTdsRate);
    if (Number.isNaN(tdsRate) || tdsRate < 0 || tdsRate > 100) {
      setCreateInvoiceError('Enter a valid TDS rate between 0 and 100.');
      return;
    }

    const otherTaxRate = Number(invoiceOtherTax || 0);
    if (Number.isNaN(otherTaxRate) || otherTaxRate < 0 || otherTaxRate > 100) {
      setCreateInvoiceError('Enter a valid Other Tax rate between 0 and 100.');
      return;
    }

    setCreateInvoiceSubmitting(true);
    setCreateInvoiceError(null);
    try {
      await postApi('/api/invoices', {
        purchaseOrderId: selectedPurchaseOrderId,
        amount,
        gstRate,
        otherTaxRate,
        tdsRate,
        interstate: invoiceInterstate,
      });
      await reload();
      await reloadPurchaseOrders();
      closeCreateInvoiceModal();
      toast.success('Invoice created successfully.');
    } catch (err: any) {
      setCreateInvoiceError(err.message || 'Invoice creation failed.');
    } finally {
      setCreateInvoiceSubmitting(false);
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
      const paymentAttemptKey = `invoice-pay-${checkoutInvoice.id}-${gatewayType}-${Date.now()}-${typeof crypto !== 'undefined' && 'randomUUID' in crypto ? crypto.randomUUID() : Math.random().toString(36).slice(2)
        }`;

      // Step 1: Initiate Payment
      const initRes = await postApi<any>('/api/payments/initiate', {
        invoiceId: checkoutInvoice.id,
        gateway: gatewayType,
        method: gatewayType === 'razorpay' ? 'card' : 'bank_transfer',
        idempotencyKey: paymentAttemptKey
      });
      const paymentId = Number(initRes?.payment?.id || initRes?.id);
      if (!Number.isInteger(paymentId) || paymentId <= 0) {
        throw new Error('Payment initiation did not return a valid payment id.');
      }

      // Step 2: Simulate Success
      const successRes = await postApi<any>(`/api/payments/${paymentId}/simulate-success`, {});

      setPaymentDetails(successRes);
      setCheckoutStep('success');
      toast.success('Payment completed successfully.');
    } catch (err: any) {
      setCheckoutStep('tabs');
      setErrorMsg(err.message || 'Payment simulation failed. Please try again.');
      toast.error(err.message || 'Payment simulation failed. Please try again.');
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
        <div className="flex gap-2">
          {role === 'seller' && (
            <Button
              variant="outline"
              onClick={openCreateInvoiceModal}
              disabled={submitting}
              className="h-10 rounded-lg text-xs bg-[#12335f] hover:bg-[#0b2445] text-white uppercase"
            >
              Create Invoice
            </Button>
          )}
          <Button variant="outline" onClick={reload} className="h-10 rounded-lg text-xs font-black uppercase">
            <RefreshCw className={cn("mr-2 h-4 w-4", refreshing && "animate-spin")} />Refresh
          </Button>
        </div>
      </div>

      <div className="grid gap-3 grid-cols-2 md:grid-cols-4 xl:grid-cols-6">
        <Metric label="Invoices" value={total} icon={FileText} />
        <Metric label="Pending" value={pendingCount} icon={Clock} />
        <Metric label="Approved/Paid" value={approvedCount} icon={CheckCircle2} />
        <Metric label="Invoice Value" value={formatCurrency(totalValue)} icon={IndianRupee} />
        <Metric label="Overdue" value={invoiceHealth.overdue} icon={AlertCircle} />
        <Metric label="GST/TDS" value={`${formatCurrency(invoiceHealth.tax)} / ${formatCurrency(invoiceHealth.tds)}`} icon={ShieldCheck} />
      </div>

      {error && <InlineError message={error} onRetry={reload} />}

      <Card className="border-slate-200/80 shadow-sm bg-white">
        <CardContent className="p-4 space-y-3">
          <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
            <div className="relative flex-1 min-w-0">
              <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
              <input
                value={searchTerm}
                onChange={event => setSearchTerm(event.target.value)}
                placeholder="Search invoice, PO, buyer, seller..."
                className="h-10 w-full rounded-lg border border-slate-200 bg-white pl-10 pr-3 text-xs font-semibold outline-none focus:ring-2 focus:ring-[#12335f]/20"
              />
            </div>

            <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-end md:gap-4 w-full md:w-auto">
              <ViewModeToggle value={viewMode} onChange={setViewMode} />

              <div className="grid gap-3 sm:grid-cols-3 md:grid-cols-[180px_160px_160px] md:items-center w-full md:w-auto">
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

                <label className="flex items-center gap-2 rounded-lg border border-slate-200 bg-white px-3 text-xs font-bold text-slate-700 w-full">
                  <input
                    type="checkbox"
                    checked={acceptedPoOnly}
                    onChange={event => setAcceptedPoOnly(event.target.checked)}
                    className="h-4 w-4 rounded border-slate-300 text-[#12335f] focus:ring-[#12335f]/50"
                  />
                  Accepted PO only
                </label>

                <select
                  value={invoiceScope}
                  onChange={event => setInvoiceScope(event.target.value as 'all' | 'interstate' | 'domestic')}
                  className="h-10 rounded-lg border border-slate-200 bg-white px-3 text-xs font-bold outline-none focus:ring-2 focus:ring-[#12335f]/20 w-full"
                >
                  <option value="all">All invoices</option>
                  <option value="interstate">Interstate only</option>
                  <option value="domestic">Domestic only</option>
                </select>
              </div>
            </div>
          </div>
        </CardContent>
      </Card>

      {total === 0 ? (
        <EmptyState
          title="No invoices found"
          description={
            searchTerm || statusFilter || acceptedPoOnly || invoiceScope !== 'all'
              ? 'No invoice records match the selected search, status, PO, or tax-scope filters.'
              :
            role === 'seller'
              ? 'Create invoices for accepted purchase orders using the button above. Once an invoice is added, buyers can approve and pay it.'
              : 'Invoices appear once sellers submit bills against accepted purchase orders. Ask your seller to create an invoice first.'
          }
        />
      ) : viewMode === 'list' ? (
        <div className="rounded-lg border border-slate-200 bg-white overflow-x-clip">
          <div className="overflow-x-auto">
            <table className="w-full min-w-[1140px] text-left text-sm">
              <thead className="bg-slate-50 text-[10px] font-black uppercase tracking-wider text-slate-500">
                <tr>
                  <th className="p-3">Sr. No</th>
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
                {pagedInvoices.map((invoice, index) => {
                  const state = statusOf(invoice);
                  const isSubmitted = state === 'submitted';
                  const isPayable = state === 'approved' || state === 'payment_initiated';
                  const rowIndex = (page - 1) * pageSize + index + 1;

                  return (
                    <tr key={invoice.id} className="hover:bg-slate-50">
                      <td className="p-3 text-xs font-black text-slate-600">{rowIndex}</td>
                      <td className="p-3">
                        <EntityIdLink label={invoice.invoiceNumber || `INV-${invoice.id}`} id={invoice.id} size="sm" onClick={() => { setSelectedInvoice(invoice); setInvoiceModalMode('view'); }} />
                        <p className="mt-1 text-[10px] font-semibold text-slate-500">{formatDate(invoice.createdAt)}</p>
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
                        <span className={`rounded-lg border px-2.5 py-0.5 text-[9px] font-black uppercase ${state === 'paid'
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
                        <div className="flex flex-wrap justify-end gap-2">
                          <Button
                            size="sm"
                            onClick={() => { setSelectedInvoice(invoice); setInvoiceModalMode('view'); }}
                            className="h-8 rounded-lg border border-slate-200 bg-white text-[10px] font-black uppercase tracking-wider text-slate-700 hover:bg-slate-50"
                          >
                            View
                          </Button>
                          <Button
                            size="sm"
                            variant="outline"
                            onClick={() => { setSelectedInvoice(invoice); setInvoiceModalMode('track'); }}
                            className="h-8 rounded-lg border border-slate-200 bg-white text-[10px] font-black uppercase tracking-wider text-slate-700 hover:bg-slate-50"
                          >
                            Track Status
                          </Button>
                          {role === 'buyer' && isSubmitted && (
                            <Button
                              size="sm"
                              disabled={submitting}
                              onClick={() => handleApproveInvoice(invoice.id)}
                              className="h-8 rounded-lg bg-[#12335f] text-[10px] font-black uppercase tracking-wider hover:bg-slate-800"
                            >
                              Approve
                            </Button>
                          )}
                          {role === 'buyer' && isPayable && (
                            <Button
                              size="sm"
                              onClick={() => handleOpenCheckout(invoice)}
                              className="h-8 rounded-lg bg-emerald-600 text-[10px] font-black uppercase tracking-wider hover:bg-emerald-700"
                            >
                              Pay Now
                            </Button>
                          )}
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
          <Pagination page={page} pageSize={pageSize} total={total} onPageChange={setPage} onPageSizeChange={setPageSize} label="invoices" />
        </div>
      ) : (
        <div className="grid gap-4 lg:grid-cols-2 xl:grid-cols-3">
          {pagedInvoices.map((invoice, index) => {
            const state = statusOf(invoice);
            const isSubmitted = state === 'submitted';
            const isPayable = state === 'approved' || state === 'payment_initiated';
            const rowIndex = (page - 1) * pageSize + index + 1;
            return (
              <div key={invoice.id} className="rounded-3xl border border-slate-200 bg-white p-5 shadow-sm">
                <div className="flex items-start justify-between gap-4">
                  <div>
                    <p className="text-[10px] font-black uppercase tracking-widest text-slate-500">Invoice #{rowIndex}</p>
                    <div className="mt-2">
                      <EntityIdLink label={invoice.invoiceNumber || `INV-${invoice.id}`} id={invoice.id} size="sm" onClick={() => { setSelectedInvoice(invoice); setInvoiceModalMode('view'); }} />
                    </div>
                    <p className="mt-1 text-[11px] text-slate-500">{invoice.purchaseOrder?.poNumber || `PO #${invoice.purchaseOrderId || '-'}`}</p>
                  </div>
                  <span className={`rounded-full px-3 py-1 text-[10px] font-black uppercase ${state === 'paid'
                    ? 'bg-emerald-100 text-emerald-700'
                    : state === 'approved'
                      ? 'bg-blue-100 text-[#12335f]'
                      : state === 'submitted'
                        ? 'bg-amber-100 text-amber-700'
                        : 'bg-slate-100 text-slate-600'
                    }`}>
                    {state.replace(/_/g, ' ')}
                  </span>
                </div>
                <div className="mt-4 grid gap-3 text-xs text-slate-600">
                  <div className="rounded-2xl bg-slate-50 p-3">
                    <p className="font-black text-slate-900">Party</p>
                    <p>{role === 'seller' ? invoice.buyer?.name || `Buyer #${invoice.buyerId || '-'}` : invoice.seller?.name || `Seller #${invoice.sellerId || '-'}`}</p>
                  </div>
                  <div className="grid gap-2 sm:grid-cols-2">
                    <div className="rounded-2xl bg-slate-50 p-3">
                      <p className="font-black text-slate-900">Total</p>
                      <p>{formatCurrency(invoice.amount || invoice.totalAmount)}</p>
                    </div>
                    <div className="rounded-2xl bg-slate-50 p-3">
                      <p className="font-black text-slate-900">Due Date</p>
                      <p>{formatDate(invoice.dueDate)}</p>
                    </div>
                  </div>
                </div>
                <div className="mt-4 flex flex-wrap gap-2">
                  <Button
                    size="sm"
                    onClick={() => { setSelectedInvoice(invoice); setInvoiceModalMode('view'); }}
                    className="h-10 rounded-lg border border-slate-200 bg-white text-[10px] font-black uppercase tracking-wider text-slate-700 hover:bg-slate-50"
                  >
                    View
                  </Button>
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={() => { setSelectedInvoice(invoice); setInvoiceModalMode('track'); }}
                    className="h-10 rounded-lg border border-slate-200 bg-white text-[10px] font-black uppercase tracking-wider text-slate-700 hover:bg-slate-50"
                  >
                    Track Status
                  </Button>
                  {role === 'buyer' && isSubmitted && (
                    <Button
                      size="sm"
                      disabled={submitting}
                      onClick={() => handleApproveInvoice(invoice.id)}
                      className="h-10 rounded-lg bg-[#12335f] text-[10px] font-black uppercase tracking-wider hover:bg-slate-800"
                    >
                      Approve
                    </Button>
                  )}
                  {role === 'buyer' && isPayable && (
                    <Button
                      size="sm"
                      onClick={() => handleOpenCheckout(invoice)}
                      className="h-10 rounded-lg bg-emerald-600 text-[10px] font-black uppercase tracking-wider hover:bg-emerald-700"
                    >
                      Pay Now
                    </Button>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      )}

      {createInvoiceModalOpen && (
        <div className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto bg-slate-950/60 p-3 backdrop-blur-sm sm:p-5 md:items-center">
          <div className="relative flex max-h-[calc(100dvh-1.5rem)] w-full max-w-2xl flex-col overflow-hidden rounded-xl border border-slate-200 bg-white shadow-2xl sm:max-h-[calc(100dvh-2.5rem)]">
            <div className="flex shrink-0 items-start justify-between gap-4 border-b border-slate-200 bg-white px-5 py-4 sm:px-6">
              <div className="min-w-0">
                <p className="text-[10px] font-black uppercase tracking-widest text-[#12335f]">Create Invoice</p>
                <h2 className="mt-1 text-lg font-black text-slate-950 sm:text-xl">New invoice for accepted PO</h2>
                <p className="mt-1 text-xs leading-5 text-slate-500">Choose an accepted purchase order, then enter amount and tax details.</p>
              </div>
              <button
                type="button"
                onClick={closeCreateInvoiceModal}
                className="shrink-0 rounded-full border border-slate-200 p-2 text-slate-500 hover:bg-slate-100"
              >
                <X className="h-4 w-4" />
              </button>
            </div>

            <div className="min-h-0 flex-1 space-y-4 overflow-y-auto px-5 py-4 sm:px-6">
              <div className="space-y-2">
                <label className="block text-[10px] font-black uppercase tracking-widest text-slate-500">Search Purchase Order</label>
                <div className="relative">
                  <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
                  <input
                    type="text"
                    value={purchaseOrderSearch}
                    onChange={event => setPurchaseOrderSearch(event.target.value)}
                    placeholder="Search PO #, title, or ID"
                    className="h-10 w-full rounded-lg border border-slate-200 bg-white pl-10 pr-3 text-xs font-semibold outline-none focus:ring-2 focus:ring-[#12335f]/20"
                  />
                </div>

                <div className="max-h-36 overflow-y-auto rounded-xl border border-slate-200 bg-slate-50 p-2 text-xs sm:max-h-44">
                  {purchaseOrdersLoading ? (
                    <div className="flex items-center justify-center py-8 text-slate-500">Loading purchase orders…</div>
                  ) : filteredPurchaseOrders.length === 0 ? (
                    <div className="rounded-lg border border-dashed border-slate-300 bg-white p-4 text-slate-500">
                      No accepted purchase orders found. Confirm the buyer has accepted the PO before creating an invoice.
                    </div>
                  ) : (
                    filteredPurchaseOrders.map(po => (
                      <button
                        key={po.id}
                        type="button"
                        onClick={() => {
                          setSelectedPurchaseOrderId(po.id);
                          setPurchaseOrderSearch('');
                        }}
                        className={`w-full rounded-lg px-3 py-2.5 text-left transition ${selectedPurchaseOrderId === po.id ? 'bg-[#12335f] text-white' : 'bg-white text-slate-800 hover:bg-slate-100'
                          }`}
                      >
                        <p className="break-all text-sm font-black">{po.poNumber}</p>
                        <p className={cn('mt-0.5 text-[11px]', selectedPurchaseOrderId === po.id ? 'text-slate-200' : 'text-slate-500')}>{po.title}</p>
                        <p className={cn('mt-1 text-[11px]', selectedPurchaseOrderId === po.id ? 'text-slate-200' : 'text-slate-400')}>Amount: {formatCurrency(po.totalValue || po.amount || 0)}</p>
                      </button>
                    ))
                  )}
                </div>
              </div>

              {selectedPurchaseOrder && (
                <div className="rounded-xl border border-slate-200 bg-slate-50 p-3 text-sm text-slate-700">
                  <p className="font-black uppercase tracking-widest text-[10px] text-slate-500">Selected Purchase Order</p>
                  <p className="mt-2 font-black text-slate-900">{selectedPurchaseOrder.poNumber} · {selectedPurchaseOrder.title}</p>
                  <p className="mt-1 text-xs text-slate-500">Total value: {formatCurrency(selectedPurchaseOrder.totalValue || selectedPurchaseOrder.amount || 0)}</p>
                </div>
              )}

              <div className="grid gap-4 sm:grid-cols-3">
                <div>
                  <label className="block text-[10px] font-black uppercase tracking-widest text-slate-500">Invoice Amount</label>
                  <input
                    type="text"
                    inputMode="decimal"
                    value={invoiceAmount}
                    onChange={event => setInvoiceAmount(event.target.value)}
                    placeholder="Enter invoice amount"
                    className="mt-1 h-10 w-full rounded-lg border border-slate-200 bg-white px-3 text-xs font-semibold outline-none focus:ring-2 focus:ring-[#12335f]/20"
                  />
                </div>
                <div>
                  <label className="block text-[10px] font-black uppercase tracking-widest text-slate-500">GST Rate (%)</label>
                  <select
                    value={invoiceGstRate}
                    onChange={event => setInvoiceGstRate(event.target.value)}
                    className="mt-1 h-10 w-full rounded-lg border border-slate-200 bg-white px-3 text-xs font-semibold outline-none focus:ring-2 focus:ring-[#12335f]/20"
                  >
                    <option value="">-Select-</option>
                    {GST_STANDARD_RATES.map(rate => (
                      <option key={`gst-${rate}`} value={String(rate)}>
                        {formatTaxRate(rate)}%
                      </option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="block text-[10px] font-black uppercase tracking-widest text-slate-500">Other Tax (%)</label>
                  <input
                    type="number"
                    min={0}
                    max={100}
                    step="0.01"
                    placeholder="0"
                    value={invoiceOtherTax}
                    onChange={event => setInvoiceOtherTax(event.target.value)}
                    className="mt-1 h-10 w-full rounded-lg border border-slate-200 bg-white px-3 text-xs font-semibold outline-none focus:ring-2 focus:ring-[#12335f]/20"
                  />
                </div>
              </div>

              <div className="grid gap-4 sm:grid-cols-2">
                <div>
                  <label className="block text-[10px] font-black uppercase tracking-widest text-slate-500">TDS Rate (%)</label>
                  <input
                    type="number"
                    min={0}
                    max={100}
                    value={invoiceTdsRate}
                    onChange={event => setInvoiceTdsRate(event.target.value)}
                    className="mt-1 h-10 w-full rounded-lg border border-slate-200 bg-white px-3 text-xs font-semibold outline-none focus:ring-2 focus:ring-[#12335f]/20"
                  />
                </div>
                <div className="flex min-h-10 items-center gap-3 rounded-lg border border-slate-200 bg-slate-50 px-3 py-2">
                  <input
                    id="interstate-checkbox"
                    type="checkbox"
                    checked={invoiceInterstate}
                    onChange={event => setInvoiceInterstate(event.target.checked)}
                    className="h-4 w-4 rounded border-slate-300 text-[#12335f] focus:ring-[#12335f]/50"
                  />
                  <label htmlFor="interstate-checkbox" className="text-xs font-bold text-slate-700">
                    Interstate invoice
                  </label>
                </div>
              </div>

              {createInvoiceError && (
                <div className="rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-xs font-bold text-red-800">
                  {createInvoiceError}
                </div>
              )}

            </div>

            <div className="flex shrink-0 flex-col gap-2 border-t border-slate-200 bg-white px-5 py-3 sm:flex-row sm:justify-end sm:px-6">
              <Button type="button" variant="secondary" onClick={closeCreateInvoiceModal} className="h-10 rounded-lg text-xs font-black uppercase">
                Cancel
              </Button>
              <Button
                type="button"
                onClick={handleSubmitCreateInvoice}
                disabled={createInvoiceSubmitting || purchaseOrdersLoading || filteredPurchaseOrders.length === 0}
                className="h-10 rounded-lg bg-[#12335f] text-xs font-black uppercase tracking-wider hover:bg-slate-800"
              >
                {createInvoiceSubmitting ? 'Creating...' : 'Create Invoice'}
              </Button>
            </div>
          </div>
        </div>
      )}

      {selectedInvoice && (
        <div id="printable-invoice-overlay" className="fixed inset-0 z-45 flex items-start sm:items-center justify-center overflow-y-auto py-6 px-4 bg-slate-950/70 backdrop-blur-sm">
          <div
            id="printable-invoice-card"
            className={cn(
              "relative w-full overflow-hidden rounded-3xl border border-slate-200 bg-white p-6 shadow-2xl max-h-[calc(100vh-4rem)] overflow-y-auto transition-all duration-300",
              invoiceModalMode === 'view' ? "max-w-4xl" : "max-w-3xl"
            )}
          >
            {/* Modal Header (visible only on screen, hidden on print) */}
            <div className="flex items-start justify-between gap-4 border-b border-slate-200 pb-4 mb-4 no-print">
              <div>
                <p className="text-[10px] font-black uppercase tracking-widest text-[#12335f]">
                  {invoiceModalMode === 'view' ? "Tax Invoice Registry" : "JsgSmile / PFMS Bill Status Tracker"}
                </p>
                <h2 className="text-lg font-black text-slate-950">
                  {selectedInvoice.invoiceNumber || `INV-${selectedInvoice.id}`}
                </h2>
                <p className="text-xs text-slate-500">Created on {formatDate(selectedInvoice.createdAt)}</p>
              </div>
              <button
                type="button"
                onClick={closeInvoiceDetails}
                className="rounded-full border border-slate-200 p-2 text-slate-500 hover:bg-slate-100 transition"
              >
                <X className="h-4 w-4" />
              </button>
            </div>

            {detailedLoading ? (
              <div className="flex flex-col items-center justify-center py-12 space-y-3">
                <RefreshCw className="h-8 w-8 animate-spin text-[#12335f]" />
                <p className="text-xs font-bold text-slate-500">Retrieving digital bill ledger from MSME vaults...</p>
              </div>
            ) : (
              <>
                {/* Print Styling inside the View modal */}
                {invoiceModalMode === 'view' && (
                  <style dangerouslySetInnerHTML={{
                    __html: `
                    @media print {
                      /* Hide standard screen elements */
                      body * {
                        visibility: hidden !important;
                      }
                      /* Show only the printable card and its descendants */
                      #printable-invoice-card, #printable-invoice-card * {
                        visibility: visible !important;
                      }
                      /* Ensure html, body don't have constraints during print */
                      html, body {
                        height: auto !important;
                        overflow: visible !important;
                        min-height: 0 !important;
                        background: white !important;
                      }
                      /* Clear constraints on overlay parent */
                      #printable-invoice-overlay {
                        position: absolute !important;
                        left: 0 !important;
                        top: 0 !important;
                        width: 100% !important;
                        height: auto !important;
                        min-height: 0 !important;
                        overflow: visible !important;
                        background: white !important;
                        padding: 0 !important;
                        margin: 0 !important;
                        display: block !important;
                      }
                      /* Position and flow for the card itself */
                      #printable-invoice-card {
                        position: absolute !important;
                        left: 0 !important;
                        top: 0 !important;
                        width: 100% !important;
                        max-width: 100% !important;
                        height: auto !important;
                        max-height: none !important;
                        overflow: visible !important;
                        box-shadow: none !important;
                        border: none !important;
                        padding: 0 !important;
                        margin: 0 !important;
                      }
                      .no-print {
                        display: none !important;
                      }
                    }
                  `}} />
                )}

                {invoiceModalMode === 'view' && (
                  <div className="space-y-6">
                    {/* Official Government e-Invoice Header Banner */}
                    <div className="flex flex-col md:flex-row justify-between items-center gap-4 bg-slate-50 border border-slate-150 p-4 rounded-2xl">
                      <div className="flex items-center gap-3">
                        <div className="h-12 w-12 rounded-xl bg-[#12335f] text-white flex items-center justify-center shadow-sm">
                          {/* Government Shield Representation */}
                          <ShieldCheck className="h-7 w-7" />
                        </div>
                        <div>
                          <h3 className="text-xs font-black uppercase tracking-wider text-[#12335f]">GOVERNMENT OF INDIA · MINISTRY OF MSME</h3>
                          <p className="text-[10px] font-bold text-slate-500">e-Invoice Registry Portal (JsgSmile Integrated Ledger)</p>
                          <span className="inline-flex items-center gap-1 mt-1 text-[9px] font-extrabold text-emerald-700 bg-emerald-50 px-2 py-0.5 rounded border border-emerald-100">
                            <span className="h-1.5 w-1.5 rounded-full bg-emerald-500 animate-pulse" /> VERIFIED IRN ACTIVE
                          </span>
                        </div>
                      </div>

                      {/* Portal Logo */}
                      <div className="shrink-0 bg-white p-1.5 rounded-xl border border-slate-200 shadow-sm flex items-center justify-center h-16 w-16">
                        {/* eslint-disable-next-line @next/next/no-img-element */}
                        <img src="/logoo.png" alt="SMiLE MSME Logo" className="h-full w-full object-contain" />
                      </div>
                    </div>

                    {/* e-Invoice System IRN Data */}
                    <div className="bg-slate-50 border border-slate-100 rounded-2xl p-4 text-[10px] space-y-2">
                      <div className="flex flex-col md:flex-row md:items-center justify-between gap-2 border-b border-slate-150 pb-2">
                        <div>
                          <span className="text-slate-400 font-bold">INVOICE REFERENCE NUMBER (IRN):</span>
                          <p className="font-mono font-black text-slate-800 text-xs break-all tracking-tight mt-0.5">
                            2f8a5c3e7d9b1a0f9e8d7c6b5a4b3c2d1e0f9a8b7c6d5e4f3a2b1c0d9e8f7a6b
                          </p>
                        </div>
                      </div>
                      <div className="grid grid-cols-2 md:grid-cols-4 gap-2 text-[10px] font-bold text-slate-600">
                        <div>
                          <span className="text-slate-400">ACK NO:</span>
                          <p className="text-slate-800 font-mono">122268901234512</p>
                        </div>
                        <div>
                          <span className="text-slate-400">ACK DATE:</span>
                          <p className="text-slate-800">{formatDate(selectedInvoice.createdAt)}</p>
                        </div>
                        <div>
                          <span className="text-slate-400">GST REGISTRY MODE:</span>
                          <p className="text-emerald-700 uppercase">DIRECT API INTEGRATED</p>
                        </div>
                        <div>
                          <span className="text-slate-400">TAX SCHEME:</span>
                          <p className="text-slate-800">GST INDIA (CGST + SGST / IGST)</p>
                        </div>
                      </div>
                    </div>

                    {/* Parties Grid */}
                    <div className="grid gap-4 md:grid-cols-2 text-xs font-semibold text-slate-600">
                      <div className="p-4 bg-slate-50 rounded-2xl border border-slate-100 space-y-2.5">
                        <p className="text-[9px] font-black text-slate-400 uppercase tracking-wider border-b border-slate-200 pb-1">SUPPLIER (SELLER DETAILS)</p>
                        <p className="font-black text-slate-900 text-sm">{selectedInvoice.seller?.name || `Seller #${selectedInvoice.sellerId || '-'}`}</p>
                        <p className="text-[10px] text-slate-500 font-bold">GSTIN / UIN: <span className="text-slate-800 font-mono">27NIPPL3456D1ZW</span></p>
                        <p className="text-[10px] text-slate-500 font-bold">PAN / TAX ID: <span className="text-slate-800 font-mono">NIPPL3456D</span></p>
                        <p className="text-[10px] text-slate-500 font-bold">State Code: <span className="text-slate-800">Maharashtra (Code 27)</span></p>
                        <p className="text-[10px] text-slate-500 font-medium leading-relaxed">Office: Industrial Estate, Phase 3, Pune, MH, 411018</p>
                      </div>
                      <div className="p-4 bg-slate-50 rounded-2xl border border-slate-100 space-y-2.5">
                        <p className="text-[9px] font-black text-slate-400 uppercase tracking-wider border-b border-slate-200 pb-1">CONSIGNEE (BUYER DEPARTMENT DETAILS)</p>
                        <p className="font-black text-slate-900 text-sm">{selectedInvoice.buyer?.name || `Buyer #${selectedInvoice.buyerId || '-'}`}</p>
                        <p className="text-[10px] text-slate-500 font-bold">GSTIN / UIN: <span className="text-slate-800 font-mono">27JSGS3456D1ZW</span></p>
                        <p className="text-[10px] text-slate-500 font-bold">Department: <span className="text-slate-800">Department of Higher Education</span></p>
                        <p className="text-[10px] text-slate-500 font-bold">State Code: <span className="text-slate-800">Maharashtra (Code 27)</span></p>
                        <p className="text-[10px] text-slate-500 font-medium leading-relaxed">Office: National Institute of Technology (NIT) Campus, Pune, MH, 411030</p>
                      </div>
                    </div>

                    {/* Metadata & Contract References */}
                    <div className="grid gap-4 md:grid-cols-3 text-xs rounded-2xl border border-slate-100 bg-slate-50/50 p-4">
                      <div>
                        <p className="text-[9px] font-black text-slate-400 uppercase tracking-wider">PURCHASE CONTRACT REFERENCE</p>
                        <p className="mt-1 font-black text-[#12335f]">{selectedInvoice.purchaseOrder?.poNumber || `PO #${selectedInvoice.purchaseOrderId || '-'}`}</p>
                        <p className="text-[10px] font-bold text-slate-500 mt-0.5">{selectedInvoice.purchaseOrder?.title || '-'}</p>
                      </div>
                      <div>
                        <p className="text-[9px] font-black text-slate-400 uppercase tracking-wider">BILLING PERIOD & DUE DATE</p>
                        <p className="mt-1 font-bold text-slate-900">Due Date: {formatDate(selectedInvoice.dueDate)}</p>
                        <p className="text-[10px] text-slate-450 font-medium mt-0.5">Credit Window: Net 30 Days (MSME Mandated)</p>
                      </div>
                      <div>
                        <p className="text-[9px] font-black text-slate-400 uppercase tracking-wider">SUPPLY JURISDICTION</p>
                        <p className="mt-1 font-bold text-slate-900">{selectedInvoice.interstate ? 'Interstate (IGST Tax Scheme)' : 'Intrastate (CGST + SGST Tax Scheme)'}</p>
                        <p className="text-[10px] text-slate-400 font-medium mt-0.5">Place of Supply: Maharashtra (27)</p>
                      </div>
                    </div>

                    {/* Itemized Table */}
                    <div className="rounded-2xl border border-slate-200 overflow-hidden bg-white">
                      <div className="overflow-x-auto">
                        <table className="w-full text-left text-xs border-collapse">
                          <thead className="bg-slate-50 text-[9px] font-black uppercase tracking-wider text-slate-500 border-b border-slate-200">
                            <tr>
                              <th className="p-3">Description</th>
                              <th className="p-3 text-center">HSN/SAC</th>
                              <th className="p-3 text-right">Qty</th>
                              <th className="p-3 text-right">Rate</th>
                              <th className="p-3 text-right">Taxable</th>
                              {selectedInvoice.interstate ? (
                                <th className="p-3 text-right">IGST (18%)</th>
                              ) : (
                                <>
                                  <th className="p-3 text-right">CGST (9%)</th>
                                  <th className="p-3 text-right">SGST (9%)</th>
                                </>
                              )}
                              <th className="p-3 text-right">Total</th>
                            </tr>
                          </thead>
                          <tbody className="divide-y divide-slate-100">
                            {(detailedInvoice?.items || []).length === 0 ? (
                              <tr className="hover:bg-slate-50">
                                <td className="p-3">
                                  <p className="font-black text-slate-900">{selectedInvoice.purchaseOrder?.title || 'MSME Goods / Services delivery'}</p>
                                  <p className="text-[10px] text-slate-400">Contract Ref: {selectedInvoice.purchaseOrder?.poNumber || 'N/A'}</p>
                                </td>
                                <td className="p-3 text-center font-mono text-[10px] font-bold text-slate-500">998311</td>
                                <td className="p-3 text-right font-bold">1.000 Unit</td>
                                <td className="p-3 text-right font-bold">{formatCurrency(selectedInvoice.taxableAmount || selectedInvoice.amount || 0)}</td>
                                <td className="p-3 text-right font-bold">{formatCurrency(selectedInvoice.taxableAmount || selectedInvoice.amount || 0)}</td>
                                {selectedInvoice.interstate ? (
                                  <td className="p-3 text-right font-bold">{formatCurrency(selectedInvoice.totalTaxAmount || 0)}</td>
                                ) : (
                                  <>
                                    <td className="p-3 text-right font-bold">{formatCurrency(Number(selectedInvoice.totalTaxAmount || 0) / 2)}</td>
                                    <td className="p-3 text-right font-bold">{formatCurrency(Number(selectedInvoice.totalTaxAmount || 0) / 2)}</td>
                                  </>
                                )}
                                <td className="p-3 text-right font-black text-slate-950">{formatCurrency(selectedInvoice.amount || selectedInvoice.totalAmount || 0)}</td>
                              </tr>
                            ) : (
                              detailedInvoice.items.map((item: any) => (
                                <tr key={item.id} className="hover:bg-slate-50">
                                  <td className="p-3">
                                    <p className="font-black text-slate-900">{item.itemName}</p>
                                    {item.description && <p className="text-[10px] text-slate-400">{item.description}</p>}
                                  </td>
                                  <td className="p-3 text-center font-mono text-[10px] font-bold text-slate-500">{item.hsnCode || '998311'}</td>
                                  <td className="p-3 text-right font-bold">{Number(item.quantity).toFixed(3)} {item.unitOfMeasure || 'Unit'}</td>
                                  <td className="p-3 text-right font-bold">{formatCurrency(item.unitPrice)}</td>
                                  <td className="p-3 text-right font-bold">{formatCurrency(item.taxableAmount)}</td>
                                  {selectedInvoice.interstate ? (
                                    <td className="p-3 text-right font-bold">{formatCurrency(item.taxAmount || 0)}</td>
                                  ) : (
                                    <>
                                      <td className="p-3 text-right font-bold">{formatCurrency(Number(item.taxAmount || 0) / 2)}</td>
                                      <td className="p-3 text-right font-bold">{formatCurrency(Number(item.taxAmount || 0) / 2)}</td>
                                    </>
                                  )}
                                  <td className="p-3 text-right font-black text-slate-950">{formatCurrency(item.totalAmount)}</td>
                                </tr>
                              ))
                            )}
                          </tbody>
                        </table>
                      </div>
                    </div>

                    {/* Financial Summary */}
                    <div className="grid gap-4 md:grid-cols-2">
                      {/* Administrative allocations & bank details */}
                      <div className="space-y-4">
                        <div className="p-4 bg-slate-50 rounded-2xl border border-slate-100 text-xs space-y-2">
                          <p className="text-[9px] font-black text-slate-400 uppercase tracking-wider">Public Treasury DBT Settlement Bank Details</p>
                          <div className="grid grid-cols-2 gap-2 text-[10px] font-bold text-slate-600">
                            <div>
                              <span className="text-slate-400">BANK NAME:</span>
                              <p className="text-slate-800">STATE BANK OF INDIA</p>
                            </div>
                            <div>
                              <span className="text-slate-400">IFSC CODE:</span>
                              <p className="text-slate-800 font-mono">SBIN0001234</p>
                            </div>
                            <div className="col-span-2">
                              <span className="text-slate-400">ACCOUNT NUMBER:</span>
                              <p className="text-slate-800 font-mono">••••••••1234 (Verified Settlements Vault)</p>
                            </div>
                          </div>
                        </div>

                        <div className="p-4 bg-slate-50 rounded-2xl border border-slate-100 text-xs space-y-2">
                          <p className="text-[9px] font-black text-slate-400 uppercase tracking-wider">Administrative Sanction Allocation</p>
                          <div className="grid grid-cols-2 gap-2 text-[10px] font-bold text-slate-600">
                            <div>
                              <span className="text-slate-400">SANCTION ORDER:</span>
                              <p className="text-slate-800">SAN-2026-980860-EC1094</p>
                            </div>
                            <div>
                              <span className="text-slate-400">TREASURY HEAD:</span>
                              <p className="text-slate-800 font-mono">2203-00-112-01-00-50</p>
                            </div>
                          </div>
                        </div>
                      </div>

                      {/* Tax Summary Calculation */}
                      <div className="p-4 bg-slate-50 rounded-2xl border border-slate-100 text-xs space-y-2 h-max">
                        <p className="text-[9px] font-black text-slate-400 uppercase tracking-wider border-b border-slate-200 pb-1 font-extrabold text-slate-500">Taxation & Net Settlement Calculations</p>
                        <div className="space-y-1.5 font-bold text-slate-650">
                          {(() => {
                            const cgstVal = Number(selectedInvoice.cgstAmount || 0);
                            const sgstVal = Number(selectedInvoice.sgstAmount || 0);
                            const igstVal = Number(selectedInvoice.igstAmount || 0);
                            const totalTaxVal = Number(selectedInvoice.totalTaxAmount || 0);
                            const taxableVal = Number(selectedInvoice.taxableAmount || selectedInvoice.amount || 0);
                            const otherTaxVal = Math.max(0, totalTaxVal - (cgstVal + sgstVal + igstVal));

                            const cgstRate = taxableVal > 0 ? ((cgstVal / taxableVal) * 100).toFixed(2).replace(/\.00$/, '').replace(/\.0$/, '') : '';
                            const sgstRate = taxableVal > 0 ? ((sgstVal / taxableVal) * 100).toFixed(2).replace(/\.00$/, '').replace(/\.0$/, '') : '';
                            const igstRate = taxableVal > 0 ? ((igstVal / taxableVal) * 100).toFixed(2).replace(/\.00$/, '').replace(/\.0$/, '') : '';
                            const otherTaxRate = taxableVal > 0 ? ((otherTaxVal / taxableVal) * 100).toFixed(2).replace(/\.00$/, '').replace(/\.0$/, '') : '';

                            return (
                              <>
                                <div className="flex justify-between">
                                  <span>Gross Taxable Amount:</span>
                                  <span className="text-slate-800">{formatCurrency(taxableVal)}</span>
                                </div>
                                {selectedInvoice.interstate ? (
                                  <div className="flex justify-between">
                                    <span>IGST Amount ({igstRate || '0'}%):</span>
                                    <span className="text-slate-800">{formatCurrency(igstVal)}</span>
                                  </div>
                                ) : (
                                  <>
                                    <div className="flex justify-between">
                                      <span>CGST Amount ({cgstRate || '0'}%):</span>
                                      <span className="text-slate-800">{formatCurrency(cgstVal)}</span>
                                    </div>
                                    <div className="flex justify-between">
                                      <span>SGST Amount ({sgstRate || '0'}%):</span>
                                      <span className="text-slate-800">{formatCurrency(sgstVal)}</span>
                                    </div>
                                  </>
                                )}
                                {otherTaxVal > 0 && (
                                  <div className="flex justify-between">
                                    <span>Other Tax / Cess ({otherTaxRate || '0'}%):</span>
                                    <span className="text-slate-800">{formatCurrency(otherTaxVal)}</span>
                                  </div>
                                )}
                              </>
                            );
                          })()}
                          <div className="flex justify-between text-red-650 border-b border-slate-200 pb-1.5">
                            <span>Government TDS Deduction (GST Section 51):</span>
                            <span>-{formatCurrency(selectedInvoice.tdsAmount || 0)}</span>
                          </div>
                          <div className="flex justify-between text-xs font-black text-slate-900 pt-1">
                            <span>NET SETTLEMENT VALUE (DBT):</span>
                            <span className="text-emerald-700 text-sm">{formatCurrency(selectedInvoice.amount || selectedInvoice.totalAmount)}</span>
                          </div>
                        </div>
                      </div>
                    </div>

                    {/* Government Declaration and Digitally Signed Certificate */}
                    <div className="flex flex-col sm:flex-row items-center gap-3 p-4 bg-emerald-50/60 border border-emerald-100 rounded-2xl">
                      <div className="h-10 w-10 rounded-full bg-emerald-100 flex items-center justify-center text-emerald-600 shrink-0 border border-emerald-200/50">
                        <Check className="h-5 w-5 stroke-[2.5]" />
                      </div>
                      <div className="text-xs text-slate-600 font-semibold space-y-0.5">
                        <p className="font-black text-emerald-800 uppercase tracking-wider text-[10px]">Digitally Signed & Certified OK</p>
                        <p className="leading-relaxed">
                          Certified that the particulars given above are true and correct. Authenticated via Class-3 Digital Signature Certificate (DSC) registered under the Indian Information Technology Act, 2000.
                        </p>
                      </div>
                    </div>

                    {/* Print / Close Footer (Screen visible only) */}
                    <div className="flex flex-col sm:flex-row justify-end gap-2.5 pt-4 border-t border-slate-200 no-print">
                      <Button
                        type="button"
                        variant="secondary"
                        onClick={closeInvoiceDetails}
                        className="h-10 rounded-lg text-xs font-black uppercase"
                      >
                        Close
                      </Button>
                      <Button
                        type="button"
                        onClick={() => window.print()}
                        className="h-10 rounded-lg bg-[#12335f] text-xs font-black uppercase tracking-wider hover:bg-slate-800 flex items-center gap-1.5"
                      >
                        Print Invoice
                      </Button>
                    </div>
                  </div>
                )}

                {invoiceModalMode === 'track' && (
                  <div className="space-y-6">
                    {/* Stepper Header Summary */}
                    <div className="p-4 bg-slate-50 rounded-2xl border border-slate-150 text-xs flex items-center justify-between">
                      <div>
                        <p className="text-[9px] font-black text-slate-400 uppercase tracking-wider">CURRENT JSGSMILE BILL DISPATCH STATUS</p>
                        <p className="mt-1 text-sm font-black text-[#12335f] uppercase tracking-wider">
                          {statusOf(selectedInvoice).replace(/_/g, ' ')}
                        </p>
                      </div>
                      <span className={cn(
                        "inline-flex items-center gap-1.5 rounded-full px-3 py-1 text-[9px] font-black uppercase border",
                        statusOf(selectedInvoice) === 'paid'
                          ? "bg-emerald-50 text-emerald-700 border-emerald-200"
                          : "bg-amber-50 text-amber-700 border-amber-200 animate-pulse"
                      )}>
                        <span className={cn("h-2 w-2 rounded-full", statusOf(selectedInvoice) === 'paid' ? "bg-emerald-500" : "bg-amber-500 animate-ping")} />
                        {statusOf(selectedInvoice) === 'paid' ? "Treasury Settlement Cleared" : "Treasury Pipeline Active"}
                      </span>
                    </div>

                    {/* Stepper Vertical Timeline */}
                    <div className="space-y-6 px-1.5 py-2">

                      {/* Step 1: Invoice Submission */}
                      <TimelineStep
                        index={1}
                        title="Invoice Digitally Signed & Uploaded"
                        description="Invoice uploaded by Supplier to JsgSmile invoice gateway with verified Class-3 Digital Signature (DSC) security keys."
                        timestamp={selectedInvoice.createdAt}
                        completed={true}
                        active={statusOf(selectedInvoice) === 'submitted'}
                        details={
                          <div className="grid grid-cols-2 gap-x-4 gap-y-1 text-[10px] leading-relaxed">
                            <div><span className="text-slate-400">SUBMISSION IP:</span> <span className="text-slate-700">10.240.89.112 (Verified)</span></div>
                            <div><span className="text-slate-400">DIGITAL DSC:</span> <span className="text-emerald-700">e-Mudhra root CA</span></div>
                            <div className="col-span-2"><span className="text-slate-400">CRYPTOGRAPHIC SIGNATURE HASH:</span> <span className="text-slate-700 font-mono break-all font-semibold">e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855</span></div>
                          </div>
                        }
                      />

                      {/* Step 2: Technical Quality Inspection (CRAC) */}
                      <TimelineStep
                        index={2}
                        title="Consignee Receipt & Acceptance Certificate (CRAC)"
                        description="Consignee Receipt and Acceptance Certificate (CRAC) generated after physical inspection of consignments under JsgSmile guidelines."
                        timestamp={['approved', 'payment_initiated', 'paid'].includes(statusOf(selectedInvoice)) ? selectedInvoice.approvedAt || selectedInvoice.createdAt : undefined}
                        completed={['approved', 'payment_initiated', 'paid'].includes(statusOf(selectedInvoice))}
                        active={statusOf(selectedInvoice) === 'approved'}
                        details={
                          <div className="grid grid-cols-2 gap-x-4 gap-y-1 text-[10px] leading-relaxed">
                            <div><span className="text-slate-400">CRAC REFERENCE:</span> <span className="text-slate-700 font-mono">CRAC/2026/JSG/489182</span></div>
                            <div><span className="text-slate-400">INSPECTED STATUS:</span> <span className="text-emerald-750">100% SPEC COMPLIANT</span></div>
                            <div><span className="text-slate-400">CONSIGNEE OFFICER:</span> <span className="text-slate-700">Shri Ramesh Kumar (Asst. Registrar)</span></div>
                            <div><span className="text-slate-400">DELIVERY VERIFICATION:</span> <span className="text-slate-700">ACCEPTED & SIGNED</span></div>
                          </div>
                        }
                      />

                      {/* Step 3: DDO Sanction & Sanction Order */}
                      <TimelineStep
                        index={3}
                        title="DDO Billing Sanction & Fund Allocation"
                        description="Drawing and Disbursing Officer (DDO) verified the billing audit ledger. Financial sanction order approved against budget allocation."
                        timestamp={['approved', 'payment_initiated', 'paid'].includes(statusOf(selectedInvoice)) ? selectedInvoice.approvedAt || selectedInvoice.createdAt : undefined}
                        completed={['approved', 'payment_initiated', 'paid'].includes(statusOf(selectedInvoice))}
                        active={statusOf(selectedInvoice) === 'approved'}
                        details={
                          <div className="grid grid-cols-2 gap-x-4 gap-y-1 text-[10px] leading-relaxed">
                            <div><span className="text-slate-400">SANCTION ORDER NO:</span> <span className="text-slate-700 font-mono">SAN-2026-980860-EC1094</span></div>
                            <div><span className="text-slate-400">BUDGET SANCTION HEAD:</span> <span className="text-slate-700 font-mono">2203-00-112-01-00-50</span></div>
                            <div><span className="text-slate-400">APPROVING DDO:</span> <span className="text-slate-700">Dr. S. K. Roy (Drawing & Disbursing Officer)</span></div>
                            <div><span className="text-slate-400">FUNDS RESERVATION:</span> <span className="text-slate-700">COMMITTED ESCROW CAPTURE</span></div>
                          </div>
                        }
                      />

                      {/* Step 4: PFMS Treasury Processing */}
                      <TimelineStep
                        index={4}
                        title="PFMS Treasury Scroll Queue"
                        description="Bill transmitted to Government Treasury via Public Financial Management System (PFMS). Direct Benefit Transfer (DBT) clearing token created."
                        timestamp={['payment_initiated', 'paid'].includes(statusOf(selectedInvoice)) ? selectedInvoice.updatedAt : undefined}
                        completed={['payment_initiated', 'paid'].includes(statusOf(selectedInvoice))}
                        active={statusOf(selectedInvoice) === 'payment_initiated'}
                        details={
                          <div className="grid grid-cols-2 gap-x-4 gap-y-1 text-[10px] leading-relaxed">
                            <div><span className="text-slate-400">PFMS TOKEN NUMBER:</span> <span className="text-slate-700 font-mono">2026PFMSTK8918234</span></div>
                            <div><span className="text-slate-400">TREASURY SCROLL REF:</span> <span className="text-slate-700 font-mono">SCROLL-98218-MH</span></div>
                            <div><span className="text-slate-400">TOKEN VALUATION:</span> <span className="text-emerald-700">VERIFIED OK</span></div>
                            <div><span className="text-slate-400">DBT DISPATCH BATCH:</span> <span className="text-slate-700">RBI-TREASURY-01</span></div>
                          </div>
                        }
                      />

                      {/* Step 5: Direct Treasury Disbursement */}
                      <TimelineStep
                        index={5}
                        title="Clearance & UTR Dispatch"
                        description="Funds disbursed directly to supplier bank account via Public Treasury DBT. Unique Transaction Reference (UTR) generated and issued."
                        timestamp={statusOf(selectedInvoice) === 'paid' ? selectedInvoice.updatedAt : undefined}
                        completed={statusOf(selectedInvoice) === 'paid'}
                        active={statusOf(selectedInvoice) === 'paid'}
                        details={
                          <div className="grid grid-cols-2 gap-x-4 gap-y-1 text-[10px] leading-relaxed">
                            <div><span className="text-slate-400">SETTLEMENT MODE:</span> <span className="text-slate-700">TREASURY DBT CREDITED</span></div>
                            <div><span className="text-slate-400">RBI TRANSACTION REF:</span> <span className="text-slate-700 font-mono">RBI-NEFT-9812903</span></div>
                            <div className="col-span-2"><span className="text-slate-400">UTR (UNIQUE TRANSACTION REFERENCE):</span> <span className="text-emerald-800 font-mono font-black break-all">SBIN20260524890192</span></div>
                          </div>
                        }
                      />
                    </div>

                    {/* Screen Footer (Close button) */}
                    <div className="flex justify-end pt-4 border-t border-slate-200">
                      <Button
                        type="button"
                        variant="secondary"
                        onClick={closeInvoiceDetails}
                        className="h-10 rounded-lg text-xs font-black uppercase"
                      >
                        Close Tracker
                      </Button>
                    </div>
                  </div>
                )}
              </>
            )}
          </div>
        </div>
      )}

      {/* Official Payment Checkout Modal */}
      {checkoutInvoice && (
        <div className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto bg-slate-950/50 px-4 py-6 backdrop-blur-sm sm:items-center">
          <div className="flex max-h-[92vh] w-full max-w-4xl overflow-hidden rounded-lg border border-slate-200 bg-white shadow-2xl">
            <div className="hidden w-80 flex-col justify-between bg-[#12335f] p-6 text-white lg:flex">
              <div>
                <p className="text-[10px] font-black uppercase tracking-widest text-blue-100">MSME Secure Checkout</p>
                <h2 className="mt-2 text-2xl font-black leading-tight">Official Payment Gateway</h2>
                <p className="mt-3 text-xs font-semibold leading-relaxed text-blue-100">
                  Payment is processed through the portal finance workflow and linked to invoice, purchase order, escrow custody, and immutable ledger records.
                </p>
              </div>

              <div className="space-y-3 rounded-lg border border-white/15 bg-white/10 p-4">
                <div>
                  <p className="text-[10px] font-black uppercase tracking-widest text-blue-100">Amount Payable</p>
                  <p className="mt-1 text-2xl font-black">{formatCurrency(checkoutInvoice.amount || checkoutInvoice.totalAmount)}</p>
                </div>
                <div className="grid gap-2 text-xs font-semibold text-blue-50">
                  <div className="flex justify-between gap-3">
                    <span>Invoice</span>
                    <span className="font-mono">{checkoutInvoice.invoiceNumber || `INV-${checkoutInvoice.id}`}</span>
                  </div>
                  <div className="flex justify-between gap-3">
                    <span>PO</span>
                    <span className="font-mono">{checkoutInvoice.purchaseOrder?.poNumber || `PO-${checkoutInvoice.purchaseOrderId || '-'}`}</span>
                  </div>
                  <div className="flex justify-between gap-3">
                    <span>Payee</span>
                    <span className="text-right">{checkoutInvoice.seller?.name || `Seller #${checkoutInvoice.sellerId || '-'}`}</span>
                  </div>
                </div>
              </div>

              <div className="grid gap-2 text-[10px] font-black uppercase tracking-widest text-blue-100">
                <span className="inline-flex items-center gap-2"><ShieldCheck className="h-4 w-4" /> PCI DSS aligned payment entry</span>
                <span className="inline-flex items-center gap-2"><Lock className="h-4 w-4" /> Escrow custody after success</span>
                <span className="inline-flex items-center gap-2"><Sparkles className="h-4 w-4" /> Ledger verified record</span>
              </div>
            </div>

            <div className="flex max-h-[92vh] min-w-0 flex-1 flex-col">
              <div className="flex items-start justify-between gap-4 border-b border-slate-200 px-5 py-4">
                <div className="min-w-0">
                  <p className="text-[10px] font-black uppercase tracking-widest text-emerald-700">Secure Payment</p>
                  <h2 className="mt-1 text-xl font-black text-slate-950">Pay Invoice</h2>
                  <p className="mt-1 text-xs font-semibold text-slate-500">
                    {checkoutInvoice.invoiceNumber || `INV-${checkoutInvoice.id}`} linked to {checkoutInvoice.purchaseOrder?.poNumber || `PO-${checkoutInvoice.purchaseOrderId || '-'}`}
                  </p>
                </div>
                <button
                  onClick={() => setCheckoutInvoice(null)}
                  className="flex h-9 w-9 items-center justify-center rounded-lg border border-slate-200 text-slate-500 hover:bg-slate-50"
                  aria-label="Close payment dialog"
                >
                  <X className="h-4 w-4" />
                </button>
              </div>

              {/* Error Message */}
              {errorMsg && (
                <div className="mx-5 mt-4 flex items-center gap-2 rounded-lg border border-red-200 bg-red-50 p-3 text-xs font-bold text-red-800">
                  <AlertCircle className="h-4 w-4 flex-shrink-0" />
                  <span>{errorMsg}</span>
                </div>
              )}

              {/* Step 1: Selection and Forms */}
              {checkoutStep === 'tabs' && (
                <div className="flex-1 space-y-4 overflow-y-auto p-5">
                  <div className="grid gap-3 rounded-lg border border-slate-200 bg-slate-50 p-4 sm:grid-cols-3">
                    <CheckoutInfo label="Payee" value={checkoutInvoice.seller?.name || `Seller #${checkoutInvoice.sellerId || '-'}`} />
                    <CheckoutInfo label="Invoice" value={checkoutInvoice.invoiceNumber || `INV-${checkoutInvoice.id}`} />
                    <CheckoutInfo label="Net Payable" value={formatCurrency(checkoutInvoice.amount || checkoutInvoice.totalAmount)} strong />
                  </div>

                  <div className="grid grid-cols-2 gap-2 rounded-lg bg-slate-100 p-1">
                    <button
                      type="button"
                      onClick={() => setActiveTab('razorpay')}
                      className={`flex items-center justify-center gap-2 rounded-md px-3 py-3 text-xs font-black uppercase transition-all ${activeTab === 'razorpay'
                        ? 'bg-white text-[#12335f] shadow-sm'
                        : 'text-slate-500 hover:text-slate-800'
                        }`}
                    >
                      <CreditCard className="h-4 w-4" />
                      Card / UPI
                    </button>
                    <button
                      type="button"
                      onClick={() => setActiveTab('bank')}
                      className={`flex items-center justify-center gap-2 rounded-md px-3 py-3 text-xs font-black uppercase transition-all ${activeTab === 'bank'
                        ? 'bg-white text-[#12335f] shadow-sm'
                        : 'text-slate-500 hover:text-slate-800'
                        }`}
                    >
                      <Building2 className="h-4 w-4" />
                      Bank Transfer
                    </button>
                  </div>

                  <div>
                    {activeTab === 'razorpay' && (
                      <div className="space-y-4 rounded-lg border border-slate-200 bg-white p-4">
                        <div className="rounded-lg border border-emerald-200 bg-emerald-50 p-4 text-xs text-slate-700">
                          <div className="flex items-start gap-3">
                            <ShieldCheck className="h-5 w-5 flex-shrink-0 text-emerald-600" />
                            <div>
                              <p className="font-black text-slate-900">Encrypted payment page</p>
                              <p className="mt-1 text-slate-500 font-semibold leading-relaxed">
                                Enter payment details only on this secured checkout. Card data is validated for this payment attempt and is not stored by the portal.
                              </p>
                            </div>
                          </div>
                          <div className="mt-3 flex flex-wrap gap-2 text-[10px] font-black uppercase text-slate-500">
                            <span className="rounded border border-slate-200 bg-white px-2 py-1">Visa</span>
                            <span className="rounded border border-slate-200 bg-white px-2 py-1">Mastercard</span>
                            <span className="rounded border border-slate-200 bg-white px-2 py-1">RuPay</span>
                            <span className="rounded border border-slate-200 bg-white px-2 py-1">UPI</span>
                          </div>
                        </div>

                        <div className="grid gap-3">
                          <div>
                            <label className="text-[10px] font-black uppercase text-slate-500">Card Number</label>
                            <input
                              type="text"
                              placeholder="0000 0000 0000 0000"
                              maxLength={19}
                              value={cardNumber}
                              onChange={e => {
                                const v = e.target.value.replace(/\D/g, '');
                                const formatted = v.match(/.{1,4}/g)?.join(' ') || v;
                                setCardNumber(formatted);
                              }}
                              className="h-11 w-full rounded-md border border-slate-200 bg-white px-3 font-mono text-sm font-semibold outline-none focus:ring-2 focus:ring-[#12335f]/20"
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
                                className="h-11 w-full rounded-md border border-slate-200 bg-white px-3 text-sm font-semibold outline-none focus:ring-2 focus:ring-[#12335f]/20"
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
                                className="h-11 w-full rounded-md border border-slate-200 bg-white px-3 text-center font-mono text-sm font-semibold outline-none focus:ring-2 focus:ring-[#12335f]/20"
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
                                className="h-11 w-full rounded-md border border-slate-200 bg-white px-3 text-center font-mono text-sm font-semibold outline-none focus:ring-2 focus:ring-[#12335f]/20"
                              />
                            </div>
                            <div className="col-span-2 flex items-end">
                              <Button
                                onClick={() => handleConfirmCheckout('razorpay')}
                                className="h-11 w-full rounded-md bg-[#12335f] text-xs font-black uppercase tracking-wider hover:bg-[#0b2445]"
                              >
                                Pay Securely {formatCurrency(checkoutInvoice.amount || checkoutInvoice.totalAmount)}
                              </Button>
                            </div>
                          </div>
                        </div>
                        <p className="text-center text-[10px] font-bold uppercase tracking-widest text-slate-400">
                          Protected by tokenized checkout and portal audit trail
                        </p>
                      </div>
                    )}

                    {activeTab === 'bank' && (
                      <div className="space-y-4 rounded-lg border border-slate-200 bg-white p-4">
                        <div className="space-y-3 rounded-lg border border-slate-200 bg-slate-50 p-4">
                          <p className="border-b border-slate-200 pb-2 text-[10px] font-black uppercase tracking-widest text-[#12335f]">
                            Escrow Virtual Bank Account Details
                          </p>
                          <div className="grid grid-cols-2 gap-3 text-xs">
                            <BankInfo label="Beneficiary" value="PugArch Escrow Services" />
                            <BankInfo label="Bank Name" value="ICICI Bank Ltd" />
                            <BankInfo label="Virtual Account" value={`PUGARCH${checkoutInvoice.invoiceNumber?.replace(/[^a-zA-Z0-9]/g, '') || checkoutInvoice.id}`} mono />
                            <BankInfo label="IFSC Code" value="ICIC0000104" mono />
                            <BankInfo label="Account Type" value="Current Account" />
                            <BankInfo label="Accepted Routes" value="NEFT / IMPS / RTGS" />
                          </div>
                        </div>

                        <div className="rounded-lg border border-amber-200 bg-amber-50 p-4 text-xs text-amber-900">
                          <div className="flex items-start gap-2">
                            <AlertCircle className="h-4 w-4 flex-shrink-0" />
                            <p className="font-bold leading-relaxed">
                              Transfer exactly {formatCurrency(checkoutInvoice.amount || checkoutInvoice.totalAmount)} and use invoice number as payment remarks.
                            </p>
                          </div>
                        </div>

                        <Button
                          onClick={() => handleConfirmCheckout('bank_transfer')}
                          className="h-11 w-full rounded-md bg-[#12335f] text-xs font-black uppercase tracking-wider hover:bg-[#0b2445]"
                        >
                          Confirm Bank Payment
                        </Button>
                      </div>
                    )}

                  </div>
                </div>
              )}

              {/* Step 2: Processing state */}
              {checkoutStep === 'processing' && (
                <div className="flex flex-1 flex-col items-center justify-center space-y-4 px-6 py-16 text-center">
                  <div className="relative">
                    <Loader2 className="h-16 w-16" />
                    <Lock className="absolute inset-0 m-auto h-6 w-6 text-[#12335f]" />
                  </div>
                  <div className="space-y-1.5">
                    <h3 className="text-base font-black text-slate-900">Authorising secure payment</h3>
                    <p className="text-xs font-semibold text-slate-500 max-w-sm">
                      Please do not close this window. The portal is preparing payment confirmation, escrow custody, and ledger records.
                    </p>
                  </div>
                </div>
              )}

              {/* Step 3: Success Screen */}
              {checkoutStep === 'success' && paymentDetails && (
                <div className="flex-1 space-y-5 overflow-y-auto p-6">
                  <div className="flex flex-col items-center justify-center text-center">
                    <div className="mb-3 flex h-14 w-14 items-center justify-center rounded-full border-4 border-emerald-50 bg-emerald-100 text-emerald-600">
                      <Check className="h-7 w-7 stroke-[3]" />
                    </div>
                    <h3 className="text-lg font-black text-slate-950">Payment Successful</h3>
                    <p className="text-xs font-semibold text-slate-500 mt-1">
                      Transaction has been recorded and linked to the invoice finance workflow.
                    </p>
                  </div>

                  <div className="space-y-3 rounded-lg border border-slate-200 bg-slate-50 p-4">
                    <div className="flex items-center justify-between border-b border-slate-200 pb-3">
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

                    <div className="rounded-lg bg-white border border-slate-200 p-3 space-y-1">
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
                      className="flex-1 h-11 rounded-md bg-[#12335f] hover:bg-[#0b2445] text-xs font-black uppercase tracking-wider"
                    >
                      Done & Close
                    </Button>
                  </div>
                </div>
              )}
            </div>
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

function CheckoutInfo({ label, value, strong = false }: { label: string; value: string; strong?: boolean }) {
  return (
    <div>
      <p className="text-[10px] font-black uppercase tracking-widest text-slate-500">{label}</p>
      <p className={cn('mt-1 break-words text-sm font-black text-slate-900', strong && 'text-base text-[#12335f]')}>{value}</p>
    </div>
  );
}

function BankInfo({ label, value, mono = false }: { label: string; value: string; mono?: boolean }) {
  return (
    <div className="rounded-md border border-slate-200 bg-white p-3">
      <p className="text-[10px] font-black uppercase tracking-widest text-slate-400">{label}</p>
      <p className={cn('mt-1 break-words text-xs font-black text-slate-800', mono && 'font-mono text-sm')}>{value}</p>
    </div>
  );
}

function TimelineStep({
  index,
  title,
  description,
  timestamp,
  completed,
  active,
  details
}: {
  index: number;
  title: string;
  description: string;
  timestamp?: string;
  completed: boolean;
  active: boolean;
  details?: React.ReactNode;
}) {
  return (
    <div className="flex gap-4 relative">
      {/* Line connecting nodes */}
      {index < 5 && (
        <div className={cn(
          "absolute left-4 top-8 bottom-[-16px] w-[2px] transition-colors duration-300",
          completed ? "bg-emerald-500" : "bg-slate-200"
        )} />
      )}

      {/* Circle Icon node */}
      <div className={cn(
        "z-10 flex h-8 w-8 shrink-0 items-center justify-center rounded-full border transition-all duration-300",
        completed
          ? "border-emerald-500 bg-emerald-50 text-emerald-600 shadow-sm shadow-emerald-100"
          : active
            ? "border-[#12335f] bg-[#12335f] text-white shadow-md shadow-[#12335f]/20 scale-105"
            : "border-slate-200 bg-white text-slate-400"
      )}>
        {completed ? (
          <Check className="h-4 w-4 stroke-[3]" />
        ) : (
          <span className="text-xs font-black">{index}</span>
        )}
      </div>

      {/* Step Content */}
      <div className="flex-1 pb-4">
        <div className="flex flex-wrap items-baseline justify-between gap-2">
          <h4 className={cn(
            "text-xs font-black uppercase tracking-wider",
            completed ? "text-slate-900" : active ? "text-[#12335f]" : "text-slate-400"
          )}>
            {title}
          </h4>
          {timestamp && (
            <span className="text-[10px] font-bold text-slate-400 bg-slate-150 px-2 py-0.5 rounded-md">{formatDate(timestamp)}</span>
          )}
        </div>
        <p className="mt-1 text-xs font-semibold text-slate-500 leading-relaxed">{description}</p>

        {/* Collapsible details section */}
        {details && (completed || active) && (
          <div className="mt-3 overflow-hidden rounded-2xl border border-slate-100 bg-slate-50/60 p-3.5 text-[10px] font-bold text-slate-600 space-y-1.5 shadow-inner">
            {details}
          </div>
        )}
      </div>
    </div>
  );
}
