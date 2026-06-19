import { useState } from 'react';
import { Landmark, ArrowRight, ShieldCheck, RefreshCw, FileText, CheckCircle2, Info } from 'lucide-react';
import { Button } from '../../components/ui/button';
import { Card, CardContent } from '../../components/ui/card';
import { Loader2 } from '../../components/ui/loader';
import { cn } from '../../lib/utils';
import { toast } from 'sonner';
import { api } from '../../lib/api';

type Invoice = {
  id: number;
  invoiceNumber: string;
  amount: string | number;
  currency: string;
  status: string;
  invoiceStatus?: string;
  createdAt: string;
  purchaseOrder?: { poNumber: string; title: string };
  buyer?: { name: string; email: string };
};

type FactoringRequest = {
  id: number;
  invoiceId: number;
  status: string;
  requestedAmount: string | number;
  factoredAmount?: string | number;
  feeAmount?: string | number;
  discountRate?: string | number;
  repaymentAmount?: string | number;
  createdAt: string;
  updatedAt: string;
  invoice: {
    invoiceNumber: string;
    amount: string | number;
    purchaseOrder?: { poNumber: string; title: string };
    buyer?: { name: string; email: string };
  };
  financier?: { name: string; email: string };
};

type SellerFactoringProps = {
  token: string;
  eligibleInvoices: Invoice[];
  activeRequests: FactoringRequest[];
  loading: boolean;
  onRefresh: () => void;
};

const formatMoney = (amount: string | number, currency = 'INR') =>
  new Intl.NumberFormat('en-IN', { style: 'currency', currency, maximumFractionDigits: 0 }).format(Number(amount || 0));

export default function SellerFactoring({ token, eligibleInvoices, activeRequests, loading, onRefresh }: SellerFactoringProps) {
  const [selectedInvoice, setSelectedInvoice] = useState<Invoice | null>(null);
  const [requestedAmount, setRequestedAmount] = useState('');
  const [submitting, setSubmitting] = useState(false);

  const handleRequestInit = (invoice: Invoice) => {
    setSelectedInvoice(invoice);
    setRequestedAmount(String(invoice.amount));
  };

  const handleSubmitRequest = async () => {
    if (!selectedInvoice) return;
    const amount = Number(requestedAmount);
    if (!amount || amount <= 0 || amount > Number(selectedInvoice.amount)) {
      toast.error(`Please enter a valid amount up to ${formatMoney(selectedInvoice.amount)}`);
      return;
    }

    setSubmitting(true);
    try {
      const res = await api.post('/api/factoring/request', {
        invoiceId: selectedInvoice.id,
        requestedAmount: amount
      }, {
        headers: { Authorization: `Bearer ${token}` }
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        toast.error(data.message || 'Failed to submit factoring request');
        return;
      }
      toast.success('Factoring request submitted successfully');
      setSelectedInvoice(null);
      onRefresh();
    } catch (err: any) {
      toast.error('An error occurred. Please try again.');
    } finally {
      setSubmitting(false);
    }
  };

  const handleAcceptOffer = async (requestId: number) => {
    try {
      const res = await api.post(`/api/factoring/requests/${requestId}/accept`, {}, {
        headers: { Authorization: `Bearer ${token}` }
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        toast.error(data.message || 'Failed to accept offer');
        return;
      }
      toast.success('Factoring offer accepted successfully');
      onRefresh();
    } catch (err) {
      toast.error('An error occurred. Please try again.');
    }
  };

  const getStatusBadgeClass = (status: string) => {
    const s = status.toUpperCase();
    if (s === 'SETTLED' || s === 'DISBURSED') return 'bg-emerald-50 text-emerald-700 border-emerald-200';
    if (s === 'ACCEPTED') return 'bg-blue-50 text-blue-700 border-blue-200';
    if (s === 'OFFERED') return 'bg-indigo-50 text-indigo-700 border-indigo-200';
    return 'bg-amber-50 text-amber-700 border-amber-200';
  };

  return (
    <div className="space-y-6">
      <div className="grid gap-6 lg:grid-cols-[1fr_360px]">
        {/* Main Console */}
        <div className="space-y-6">
          {/* Section 1: Eligible Invoices */}
          <Card className="rounded-lg border-slate-200 shadow-none">
            <CardContent className="p-5 space-y-4">
              <div className="flex items-center justify-between border-b border-slate-100 pb-3">
                <h2 className="text-sm font-black text-slate-900 uppercase tracking-wider flex items-center gap-2">
                  <FileText className="h-4 w-4 text-[#12335f]" /> Eligible Invoices for Early Payment
                </h2>
                <span className="rounded-full bg-slate-100 px-2.5 py-0.5 text-xs font-bold text-slate-600">
                  {eligibleInvoices.length} Available
                </span>
              </div>

              {eligibleInvoices.length === 0 ? (
                <div className="py-8 text-center text-sm text-slate-500">
                  No approved invoices are currently eligible for early payment.
                </div>
              ) : (
                <div className="overflow-x-auto">
                  <table className="w-full min-w-[600px] text-left text-sm">
                    <thead className="bg-slate-50 text-[10px] font-black uppercase tracking-wider text-slate-500">
                      <tr>
                        <th className="px-4 py-3">Invoice Number</th>
                        <th className="px-4 py-3">PO Reference</th>
                        <th className="px-4 py-3">Buyer Name</th>
                        <th className="px-4 py-3">Amount</th>
                        <th className="px-4 py-3 text-right">Action</th>
                      </tr>
                    </thead>
                    <tbody>
                      {eligibleInvoices.map((inv) => (
                        <tr key={inv.id} className="border-t border-slate-100 hover:bg-slate-50/50 transition-colors">
                          <td className="px-4 py-3 font-bold text-slate-900">{inv.invoiceNumber}</td>
                          <td className="px-4 py-3 text-slate-600 font-medium">
                            {inv.purchaseOrder?.poNumber || '-'}
                          </td>
                          <td className="px-4 py-3 text-slate-500 font-semibold">{inv.buyer?.name || '-'}</td>
                          <td className="px-4 py-3 font-black text-slate-900">
                            {formatMoney(inv.amount, inv.currency)}
                          </td>
                          <td className="px-4 py-3 text-right">
                            <Button
                              size="sm"
                              onClick={() => handleRequestInit(inv)}
                              className="bg-[#12335f] text-white hover:bg-[#0a203f] h-8 text-[11px] font-black uppercase tracking-wider"
                            >
                              Request Factoring
                            </Button>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </CardContent>
          </Card>

          {/* Section 2: Active Factoring Requests */}
          <Card className="rounded-lg border-slate-200 shadow-none">
            <CardContent className="p-5 space-y-4">
              <div className="flex items-center justify-between border-b border-slate-100 pb-3">
                <h2 className="text-sm font-black text-slate-900 uppercase tracking-wider flex items-center gap-2">
                  <Landmark className="h-4 w-4 text-[#12335f]" /> Factoring Requests & Offers
                </h2>
                <span className="rounded-full bg-slate-100 px-2.5 py-0.5 text-xs font-bold text-slate-600">
                  {activeRequests.length} Total
                </span>
              </div>

              {activeRequests.length === 0 ? (
                <div className="py-8 text-center text-sm text-slate-500">
                  No active factoring requests found.
                </div>
              ) : (
                <div className="space-y-4">
                  {activeRequests.map((req) => (
                    <div
                      key={req.id}
                      className="rounded-lg border border-slate-200 p-4 space-y-3 bg-white hover:border-slate-300 transition-all"
                    >
                      <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
                        <div>
                          <div className="flex items-center gap-2">
                            <span className="text-sm font-black text-slate-900">Request #{req.id}</span>
                            <span className="text-xs text-slate-400">·</span>
                            <span className="text-xs font-bold text-slate-500">
                              Invoice: {req.invoice.invoiceNumber}
                            </span>
                          </div>
                          <p className="text-xs text-slate-500 mt-0.5">
                            Buyer: {req.invoice.buyer?.name || 'Unknown'} · PO: {req.invoice.purchaseOrder?.poNumber || '-'}
                          </p>
                        </div>
                        <span className={cn(
                          'w-fit rounded-full border px-2.5 py-1 text-[10px] font-black uppercase tracking-wider',
                          getStatusBadgeClass(req.status)
                        )}>
                          {req.status}
                        </span>
                      </div>

                      {/* Display Offer/Disbursement details */}
                      <div className="grid gap-3 grid-cols-2 sm:grid-cols-4 bg-slate-50 rounded-lg p-3 text-xs">
                        <div>
                          <p className="text-[10px] font-black uppercase text-slate-400">Requested</p>
                          <p className="mt-0.5 font-bold text-slate-900">{formatMoney(req.requestedAmount)}</p>
                        </div>
                        {req.discountRate !== undefined && req.discountRate !== null && (
                          <>
                            <div>
                              <p className="text-[10px] font-black uppercase text-slate-400">Rate / Fee</p>
                              <p className="mt-0.5 font-bold text-slate-900">
                                {req.discountRate}% / {formatMoney(req.feeAmount || 0)}
                              </p>
                            </div>
                            <div>
                              <p className="text-[10px] font-black uppercase text-slate-400">Factored Payout</p>
                              <p className="mt-0.5 font-black text-emerald-700">{formatMoney(req.factoredAmount || 0)}</p>
                            </div>
                            <div>
                              <p className="text-[10px] font-black uppercase text-slate-400">Financier</p>
                              <p className="mt-0.5 font-bold text-[#12335f] truncate">
                                {req.financier?.name || 'Assigned'}
                              </p>
                            </div>
                          </>
                        )}
                      </div>

                      {/* Actions */}
                      {req.status === 'OFFERED' && (
                        <div className="flex items-center justify-between border-t border-slate-100 pt-3">
                          <span className="text-[11px] text-slate-500 flex items-center gap-1">
                            <Info className="h-3.5 w-3.5 text-indigo-500" /> Financier has submitted an early payment offer.
                          </span>
                          <Button
                            size="sm"
                            onClick={() => handleAcceptOffer(req.id)}
                            className="bg-emerald-600 text-white hover:bg-emerald-700 h-8 font-black uppercase tracking-wider text-[11px]"
                          >
                            Accept Offer
                          </Button>
                        </div>
                      )}
                      
                      {req.status === 'DISBURSED' && (
                        <div className="text-[11px] text-emerald-700 bg-emerald-50/50 border border-emerald-100 rounded-md p-2 flex items-center gap-1.5 font-bold">
                          <CheckCircle2 className="h-4 w-4 text-emerald-600 flex-shrink-0" />
                          Early payment was disbursed to your account. Net settlement will be paid by the buyer to the financier.
                        </div>
                      )}

                      {req.status === 'SETTLED' && (
                        <div className="text-[11px] text-slate-600 bg-slate-50 border border-slate-200 rounded-md p-2 flex items-center gap-1.5 font-semibold">
                          <CheckCircle2 className="h-4 w-4 text-slate-500 flex-shrink-0" />
                          Redirection settlement completed. The buyer has successfully paid the invoice to the financier.
                        </div>
                      )}
                    </div>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>
        </div>

        {/* Action Panel / Invoice Detail Info */}
        <div className="space-y-6">
          {selectedInvoice ? (
            <Card className="rounded-lg border-slate-200 shadow-none bg-gradient-to-br from-slate-50 to-white">
              <CardContent className="p-5 space-y-4">
                <h3 className="text-sm font-black text-slate-900 uppercase tracking-wider">
                  Request Factoring Details
                </h3>

                <div className="space-y-2 border-b border-slate-200 pb-3 text-xs">
                  <div className="flex justify-between">
                    <span className="text-slate-500">Invoice:</span>
                    <span className="font-bold text-slate-900">{selectedInvoice.invoiceNumber}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-slate-500">PO Ref:</span>
                    <span className="font-bold text-slate-900">{selectedInvoice.purchaseOrder?.poNumber || '-'}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-slate-500">Invoice Amount:</span>
                    <span className="font-black text-[#12335f]">
                      {formatMoney(selectedInvoice.amount, selectedInvoice.currency)}
                    </span>
                  </div>
                </div>

                <div className="space-y-2">
                  <label className="text-[11px] font-black uppercase tracking-wider text-slate-500">
                    Requested Payout Amount
                  </label>
                  <div className="relative">
                    <span className="absolute left-3 top-2.5 text-sm font-bold text-slate-400">INR</span>
                    <input
                      type="number"
                      value={requestedAmount}
                      onChange={(e) => setRequestedAmount(e.target.value)}
                      placeholder="0.00"
                      className="h-10 w-full rounded-md border border-slate-200 pl-12 pr-3 text-sm font-bold outline-none focus:border-[#12335f]"
                    />
                  </div>
                  <p className="text-[10px] text-slate-400">
                    You can request up to 100% of the approved invoice amount.
                  </p>
                </div>

                <div className="flex gap-2 pt-2">
                  <Button
                    onClick={() => setSelectedInvoice(null)}
                    variant="outline"
                    className="flex-1 text-slate-600"
                  >
                    Cancel
                  </Button>
                  <Button
                    onClick={handleSubmitRequest}
                    disabled={submitting}
                    className="flex-1 bg-[#12335f] text-white hover:bg-[#0a203f]"
                  >
                    {submitting ? (
                      <Loader2 className="h-4 w-4 animate-spin" />
                    ) : (
                      <>
                        Submit <ArrowRight className="ml-1.5 h-3.5 w-3.5" />
                      </>
                    )}
                  </Button>
                </div>
              </CardContent>
            </Card>
          ) : (
            <Card className="rounded-lg border-slate-200 border-dashed bg-slate-50/50 shadow-none py-10">
              <CardContent className="p-5 text-center text-xs text-slate-400 space-y-2 flex flex-col items-center">
                <Landmark className="h-10 w-10 text-slate-300 stroke-[1.5]" />
                <p className="font-bold">Select an eligible invoice to request early payment / bill discounting offers from financing partners.</p>
              </CardContent>
            </Card>
          )}

          {/* Quick Stats Panel */}
          <Card className="rounded-lg border-slate-200 shadow-none bg-slate-900 text-white">
            <CardContent className="p-5 space-y-4">
              <h3 className="text-xs font-black uppercase tracking-wider text-slate-400 flex items-center gap-1.5">
                <ShieldCheck className="h-4 w-4 text-emerald-400" /> Early Payment Benefits
              </h3>
              <ul className="space-y-2.5 text-xs text-slate-300">
                <li className="flex items-start gap-2">
                  <span className="rounded-full bg-emerald-500/10 p-0.5 text-emerald-400 mt-0.5">✓</span>
                  <span><strong>Zero collateral:</strong> Payout is backed entirely by your approved corporate buyer invoice.</span>
                </li>
                <li className="flex items-start gap-2">
                  <span className="rounded-full bg-emerald-500/10 p-0.5 text-emerald-400 mt-0.5">✓</span>
                  <span><strong>Instant Liquidity:</strong> Release working capital locked in accounts receivable within 24-48 hours.</span>
                </li>
                <li className="flex items-start gap-2">
                  <span className="rounded-full bg-emerald-500/10 p-0.5 text-emerald-400 mt-0.5">✓</span>
                  <span><strong>No impact on credit rating:</strong> Factoring uses off-balance-sheet financing logic.</span>
                </li>
              </ul>
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  );
}
