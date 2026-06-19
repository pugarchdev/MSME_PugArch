import { useState } from 'react';
import { Landmark, ArrowRight, ShieldCheck, FileText, CheckCircle2, DollarSign, Percent, Clock, Info } from 'lucide-react';
import { Button } from '../../components/ui/button';
import { Card, CardContent } from '../../components/ui/card';
import { Loader2 } from '../../components/ui/loader';
import { cn } from '../../lib/utils';
import { toast } from 'sonner';
import { api } from '../../lib/api';

type FactoringRequest = {
  id: number;
  invoiceId: number;
  financierId?: number | null;
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
    seller?: { name: string; email: string };
  };
  seller: { id: number; name: string; email: string };
  financier?: { id: number; name: string; email: string };
};

type FinancierFactoringProps = {
  token: string;
  financierId: number;
  allRequests: FactoringRequest[];
  loading: boolean;
  onRefresh: () => void;
};

const formatMoney = (amount: string | number, currency = 'INR') =>
  new Intl.NumberFormat('en-IN', { style: 'currency', currency, maximumFractionDigits: 0 }).format(Number(amount || 0));

export default function FinancierFactoring({ token, financierId, allRequests, loading, onRefresh }: FinancierFactoringProps) {
  const [selectedRequest, setSelectedRequest] = useState<FactoringRequest | null>(null);
  const [discountRate, setDiscountRate] = useState('2.5');
  const [feeAmount, setFeeAmount] = useState('500');
  const [submitting, setSubmitting] = useState(false);

  const pendingDemands = allRequests.filter(r => r.status === 'INITIATED');
  const myActiveOffers = allRequests.filter(r => r.financierId === financierId && ['OFFERED', 'ACCEPTED', 'DISBURSED', 'SETTLED'].includes(r.status));

  const handleOfferInit = (request: FactoringRequest) => {
    setSelectedRequest(request);
  };

  const handleSubmitOffer = async () => {
    if (!selectedRequest) return;
    const rate = Number(discountRate);
    const fee = Number(feeAmount);
    
    if (isNaN(rate) || rate < 0 || rate > 100) {
      toast.error('Please enter a valid discount rate percentage between 0 and 100');
      return;
    }
    
    if (isNaN(fee) || fee < 0) {
      toast.error('Please enter a valid flat fee amount');
      return;
    }

    setSubmitting(true);
    try {
      const res = await api.post(`/api/factoring/requests/${selectedRequest.id}/offer`, {
        discountRate: rate,
        feeAmount: fee
      }, {
        headers: { Authorization: `Bearer ${token}` }
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        toast.error(data.message || 'Failed to submit discount offer');
        return;
      }
      toast.success('Discount offer submitted successfully');
      setSelectedRequest(null);
      onRefresh();
    } catch (err) {
      toast.error('An error occurred. Please try again.');
    } finally {
      setSubmitting(false);
    }
  };

  const handleDisburse = async (requestId: number) => {
    try {
      const res = await api.post(`/api/factoring/requests/${requestId}/disburse`, {}, {
        headers: { Authorization: `Bearer ${token}` }
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        toast.error(data.message || 'Failed to disburse payout');
        return;
      }
      toast.success('Payout marked as disbursed to MSME Vendor account');
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
          {/* Section 1: Eligible Factoring Demands */}
          <Card className="rounded-lg border-slate-200 shadow-none">
            <CardContent className="p-5 space-y-4">
              <div className="flex items-center justify-between border-b border-slate-100 pb-3">
                <h2 className="text-sm font-black text-slate-900 uppercase tracking-wider flex items-center gap-2">
                  <Clock className="h-4 w-4 text-[#12335f]" /> Eligible Factoring Demands (Pending)
                </h2>
                <span className="rounded-full bg-slate-100 px-2.5 py-0.5 text-xs font-bold text-slate-600">
                  {pendingDemands.length} Available
                </span>
              </div>

              {pendingDemands.length === 0 ? (
                <div className="py-8 text-center text-sm text-slate-500">
                  No pending early payment requests are currently available.
                </div>
              ) : (
                <div className="overflow-x-auto">
                  <table className="w-full min-w-[600px] text-left text-sm">
                    <thead className="bg-slate-50 text-[10px] font-black uppercase tracking-wider text-slate-500">
                      <tr>
                        <th className="px-4 py-3">Vendor / Seller</th>
                        <th className="px-4 py-3">Invoice Number</th>
                        <th className="px-4 py-3">Buyer Name</th>
                        <th className="px-4 py-3">Invoice Amount</th>
                        <th className="px-4 py-3 text-right">Action</th>
                      </tr>
                    </thead>
                    <tbody>
                      {pendingDemands.map((req) => (
                        <tr key={req.id} className="border-t border-slate-100 hover:bg-slate-50/50 transition-colors">
                          <td className="px-4 py-3 font-bold text-slate-900">{req.seller?.name || '-'}</td>
                          <td className="px-4 py-3 text-slate-600 font-medium">{req.invoice.invoiceNumber}</td>
                          <td className="px-4 py-3 text-slate-500 font-semibold">{req.invoice.buyer?.name || '-'}</td>
                          <td className="px-4 py-3 font-black text-slate-900">
                            {formatMoney(req.invoice.amount)}
                          </td>
                          <td className="px-4 py-3 text-right">
                            <Button
                              size="sm"
                              onClick={() => handleOfferInit(req)}
                              className="bg-[#12335f] text-white hover:bg-[#0a203f] h-8 text-[11px] font-black uppercase tracking-wider"
                            >
                              Submit Offer
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

          {/* Section 2: My Active Financing Offers & Disbursements */}
          <Card className="rounded-lg border-slate-200 shadow-none">
            <CardContent className="p-5 space-y-4">
              <div className="flex items-center justify-between border-b border-slate-100 pb-3">
                <h2 className="text-sm font-black text-slate-900 uppercase tracking-wider flex items-center gap-2">
                  <Landmark className="h-4 w-4 text-[#12335f]" /> My Active Financing Contracts
                </h2>
                <span className="rounded-full bg-slate-100 px-2.5 py-0.5 text-xs font-bold text-slate-600">
                  {myActiveOffers.length} Active
                </span>
              </div>

              {myActiveOffers.length === 0 ? (
                <div className="py-8 text-center text-sm text-slate-500">
                  You have no active or completed financing contracts.
                </div>
              ) : (
                <div className="space-y-4">
                  {myActiveOffers.map((req) => (
                    <div
                      key={req.id}
                      className="rounded-lg border border-slate-200 p-4 space-y-3 bg-white hover:border-slate-300 transition-all"
                    >
                      <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
                        <div>
                          <div className="flex items-center gap-2">
                            <span className="text-sm font-black text-slate-900">Contract #{req.id}</span>
                            <span className="text-xs text-slate-400">·</span>
                            <span className="text-xs font-bold text-slate-500">
                              Invoice: {req.invoice.invoiceNumber}
                            </span>
                          </div>
                          <p className="text-xs text-slate-500 mt-0.5">
                            MSME Seller: <span className="font-semibold text-slate-700">{req.seller?.name}</span> · Buyer: {req.invoice.buyer?.name}
                          </p>
                        </div>
                        <span className={cn(
                          'w-fit rounded-full border px-2.5 py-1 text-[10px] font-black uppercase tracking-wider',
                          getStatusBadgeClass(req.status)
                        )}>
                          {req.status}
                        </span>
                      </div>

                      {/* Details row */}
                      <div className="grid gap-3 grid-cols-2 sm:grid-cols-4 bg-slate-50 rounded-lg p-3 text-xs">
                        <div>
                          <p className="text-[10px] font-black uppercase text-slate-400">Invoice Amount</p>
                          <p className="mt-0.5 font-bold text-slate-900">{formatMoney(req.invoice.amount)}</p>
                        </div>
                        <div>
                          <p className="text-[10px] font-black uppercase text-slate-400">Discount / Fee</p>
                          <p className="mt-0.5 font-bold text-slate-900">
                            {req.discountRate}% / {formatMoney(req.feeAmount || 0)}
                          </p>
                        </div>
                        <div>
                          <p className="text-[10px] font-black uppercase text-slate-400">Payout to Vendor</p>
                          <p className="mt-0.5 font-black text-[#12335f]">{formatMoney(req.factoredAmount || 0)}</p>
                        </div>
                        <div>
                          <p className="text-[10px] font-black uppercase text-slate-400">Repayment to Me</p>
                          <p className="mt-0.5 font-black text-emerald-700">{formatMoney(req.repaymentAmount || 0)}</p>
                        </div>
                      </div>

                      {/* Actions */}
                      {req.status === 'ACCEPTED' && (
                        <div className="flex items-center justify-between border-t border-slate-100 pt-3">
                          <span className="text-[11px] text-slate-500 flex items-center gap-1">
                            <Info className="h-3.5 w-3.5 text-[#12335f]" /> Seller accepted your offer. Disburse payout now.
                          </span>
                          <Button
                            size="sm"
                            onClick={() => handleDisburse(req.id)}
                            className="bg-blue-600 text-white hover:bg-blue-700 h-8 font-black uppercase tracking-wider text-[11px]"
                          >
                            Disburse Payout
                          </Button>
                        </div>
                      )}

                      {req.status === 'DISBURSED' && (
                        <div className="text-[11px] text-indigo-700 bg-indigo-50 border border-indigo-100 rounded-md p-2 flex items-center gap-1.5 font-semibold">
                          <Clock className="h-4 w-4 text-indigo-500 flex-shrink-0" />
                          Payout disbursed to MSME Vendor. Awaiting settlement release from Buyer on invoice maturity.
                        </div>
                      )}

                      {req.status === 'SETTLED' && (
                        <div className="text-[11px] text-emerald-700 bg-emerald-50 border border-emerald-100 rounded-md p-2 flex items-center gap-1.5 font-bold">
                          <CheckCircle2 className="h-4 w-4 text-emerald-600 flex-shrink-0" />
                          Invoice repayment settled to your bank account by the buyer platform settlement.
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
          {selectedRequest ? (
            <Card className="rounded-lg border-slate-200 shadow-none bg-gradient-to-br from-slate-50 to-white">
              <CardContent className="p-5 space-y-4">
                <h3 className="text-sm font-black text-slate-900 uppercase tracking-wider">
                  Submit Factoring Offer
                </h3>

                <div className="space-y-2 border-b border-slate-200 pb-3 text-xs">
                  <div className="flex justify-between">
                    <span className="text-slate-500">MSME Seller:</span>
                    <span className="font-bold text-slate-900">{selectedRequest.seller?.name}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-slate-500">Invoice:</span>
                    <span className="font-bold text-slate-900">{selectedRequest.invoice.invoiceNumber}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-slate-500">Invoice Amount:</span>
                    <span className="font-black text-[#12335f]">
                      {formatMoney(selectedRequest.invoice.amount)}
                    </span>
                  </div>
                </div>

                {/* Offer Fields */}
                <div className="space-y-3">
                  <div className="space-y-1.5">
                    <label className="text-[11px] font-black uppercase tracking-wider text-slate-500 flex items-center gap-1">
                      <Percent className="h-3.5 w-3.5 text-indigo-500" /> Discount Rate (%)
                    </label>
                    <input
                      type="number"
                      step="0.01"
                      value={discountRate}
                      onChange={(e) => setDiscountRate(e.target.value)}
                      placeholder="e.g. 2.5"
                      className="h-10 w-full rounded-md border border-slate-200 px-3 text-sm font-bold outline-none focus:border-[#12335f]"
                    />
                  </div>

                  <div className="space-y-1.5">
                    <label className="text-[11px] font-black uppercase tracking-wider text-slate-500 flex items-center gap-1">
                      <DollarSign className="h-3.5 w-3.5 text-indigo-500" /> Administrative Fee (INR)
                    </label>
                    <input
                      type="number"
                      value={feeAmount}
                      onChange={(e) => setFeeAmount(e.target.value)}
                      placeholder="e.g. 500"
                      className="h-10 w-full rounded-md border border-slate-200 px-3 text-sm font-bold outline-none focus:border-[#12335f]"
                    />
                  </div>
                </div>

                {/* Calculation breakdown */}
                <div className="bg-slate-50 rounded-lg p-3 space-y-2 text-[11px] border border-slate-100">
                  <div className="flex justify-between">
                    <span className="text-slate-500">Estimated Payout to Vendor:</span>
                    <span className="font-bold text-slate-900">
                      {formatMoney(
                        Number(selectedRequest.invoice.amount) * (1 - Number(discountRate) / 100) - Number(feeAmount)
                      )}
                    </span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-slate-500">Your Repayment Settlement:</span>
                    <span className="font-bold text-emerald-700">
                      {formatMoney(selectedRequest.invoice.amount)}
                    </span>
                  </div>
                </div>

                <div className="flex gap-2 pt-2">
                  <Button
                    onClick={() => setSelectedRequest(null)}
                    variant="outline"
                    className="flex-1 text-slate-600"
                  >
                    Cancel
                  </Button>
                  <Button
                    onClick={handleSubmitOffer}
                    disabled={submitting}
                    className="flex-1 bg-[#12335f] text-white hover:bg-[#0a203f]"
                  >
                    {submitting ? (
                      <Loader2 className="h-4 w-4 animate-spin" />
                    ) : (
                      <>
                        Submit Offer <ArrowRight className="ml-1.5 h-3.5 w-3.5" />
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
                <p className="font-bold">Select a pending factoring demand to construct and submit an early payment bid/offer.</p>
              </CardContent>
            </Card>
          )}

          {/* Quick Info Panel */}
          <Card className="rounded-lg border-slate-200 shadow-none bg-slate-900 text-white">
            <CardContent className="p-5 space-y-4">
              <h3 className="text-xs font-black uppercase tracking-wider text-slate-400 flex items-center gap-1.5">
                <ShieldCheck className="h-4 w-4 text-emerald-400" /> financier Guidelines
              </h3>
              <ul className="space-y-2.5 text-xs text-slate-300">
                <li className="flex items-start gap-2">
                  <span className="rounded-full bg-emerald-500/10 p-0.5 text-emerald-400 mt-0.5">✓</span>
                  <span><strong>Low-risk assets:</strong> All factoring invoices have been pre-approved by the buyer entity on-platform.</span>
                </li>
                <li className="flex items-start gap-2">
                  <span className="rounded-full bg-emerald-500/10 p-0.5 text-emerald-400 mt-0.5">✓</span>
                  <span><strong>Guaranteed payment routing:</strong> Payment Settlements automatically redirect the final buyer payout to your account on maturity.</span>
                </li>
              </ul>
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  );
}
