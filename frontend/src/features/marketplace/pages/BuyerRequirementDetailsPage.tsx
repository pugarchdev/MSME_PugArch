import React, { useEffect, useState, useCallback } from 'react';
import {
  Calendar,
  IndianRupee,
  Package,
  FileText,
  MapPin,
  Send,
  X,
  ArrowLeft,
  Clock,
  Building2,
  Shield,
  CheckCircle2,
  AlertCircle,
  Loader2,
  Tag,
  Users,
  LogIn,
  Info,
  Clipboard,
  Truck
} from 'lucide-react';
import { getApi, postApi, authHeaders } from '../../shared/apiClient';

/* ── helpers ─────────────────────────────────────────────────────── */

const formatDate = (value?: string | null) => {
  if (!value) return 'Not set';
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return 'Not set';
  return d.toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' });
};

const formatMoney = (value?: number | string | null) => {
  const num = Number(value);
  if (!num || Number.isNaN(num)) return '—';
  return new Intl.NumberFormat('en-IN', { style: 'currency', currency: 'INR', maximumFractionDigits: 0 }).format(num);
};

const daysLeft = (dateStr?: string | null) => {
  if (!dateStr) return null;
  const target = new Date(dateStr);
  if (Number.isNaN(target.getTime())) return null;
  const diff = Math.ceil((target.getTime() - Date.now()) / (1000 * 60 * 60 * 24));
  return diff;
};

const extractIdFromPath = (): string | null => {
  const match = window.location.pathname.match(/\/marketplace\/requirements\/(-?\d+)$/);
  return match ? match[1] : null;
};

/** Map canonical method to appropriate detail page route */
const getDetailRoute = (requirement: any): string | null => {
  const method = String(requirement.canonicalMethod || requirement.procurementMethod || '').toUpperCase();
  const sourceId = requirement.sourceId || Math.abs(requirement.id);

  // RFQ-type methods
  if (['RFQ', 'DIRECT_PURCHASE', 'CATALOG_PURCHASE', 'REPEAT_ORDER', 'RATE_CONTRACT'].includes(method)) {
    return `/seller/rfq?requirementId=${sourceId}`;
  }
  // RFP-type methods
  if (['RFP', 'SINGLE_SOURCE', 'PAC'].includes(method)) {
    return `/seller/rfp?requirementId=${sourceId}`;
  }
  // Tender-type methods
  if (['OPEN_TENDER', 'LIMITED_TENDER', 'TWO_STAGE_TENDER', 'EMERGENCY_PURCHASE'].includes(method)) {
    if (requirement.requirementNumber) {
      return `/tenders?tender=${requirement.requirementNumber}`;
    }
    return `/seller/rfq?requirementId=${sourceId}`;
  }
  // Reverse auction
  if (method === 'REVERSE_AUCTION') {
    return `/reverse-auctions/${sourceId}`;
  }
  return null;
};

/** Action label based on procurement method */
const getActionLabel = (method: string): string => {
  const m = method.toUpperCase();
  if (['RFQ', 'DIRECT_PURCHASE', 'CATALOG_PURCHASE', 'REPEAT_ORDER', 'RATE_CONTRACT'].includes(m)) return 'Submit Quotation';
  if (['RFP', 'SINGLE_SOURCE', 'PAC'].includes(m)) return 'Submit Proposal';
  if (['OPEN_TENDER', 'LIMITED_TENDER', 'TWO_STAGE_TENDER', 'EMERGENCY_PURCHASE'].includes(m)) return 'Participate in Tender';
  if (m === 'REVERSE_AUCTION') return 'Join Auction';
  return 'Submit Response';
};

/* ── main component ──────────────────────────────────────────────── */

const BuyerRequirementDetailsPage = () => {
  const id = extractIdFromPath();
  const [requirement, setRequirement] = useState<any>(null);
  const [similar, setSimilar] = useState<any[]>([]);
  const [ownResponse, setOwnResponse] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [redirecting, setRedirecting] = useState(false);

  const user = (() => { try { return JSON.parse(localStorage.getItem('msme_user_cache') || '{}'); } catch { return {}; } })();
  const isLoggedIn = !!user?.id;
  const isSeller = user?.role === 'seller';

  const loadData = useCallback(async () => {
    if (!id) { setError('Invalid requirement ID'); setLoading(false); return; }
    try {
      setLoading(true);
      setError(null);
      const data: any = await getApi(`/api/marketplace/requirements/${id}`);
      const req = data.requirement || data;
      setRequirement(req);
      setSimilar(data.similarRequirements || []);
      setOwnResponse(data.ownResponse || null);
    } catch (err: any) {
      setError(err.message || 'Failed to load requirement details');
    } finally {
      setLoading(false);
    }
  }, [id]);

  useEffect(() => { loadData(); }, [loadData]);

  // Redirect to type-specific page always
  useEffect(() => {
    if (!requirement || redirecting) return;
    const route = getDetailRoute(requirement);
    if (route) {
      setRedirecting(true);
      window.location.href = route;
    }
  }, [requirement, redirecting]);

  if (loading || redirecting) {
    return (
      <div className="flex h-[60vh] flex-col items-center justify-center gap-3">
        <Loader2 className="h-8 w-8 animate-spin text-blue-600" />
        <p className="text-sm font-bold text-slate-500">
          {redirecting ? 'Redirecting to detail page...' : 'Loading procurement details...'}
        </p>
      </div>
    );
  }

  if (error || !requirement) {
    return (
      <div className="flex h-[60vh] flex-col items-center justify-center gap-4">
        <AlertCircle className="h-12 w-12 text-red-400" />
        <h2 className="text-lg font-black text-slate-800">{error || 'Requirement not found'}</h2>
        <button onClick={() => window.history.back()} className="inline-flex h-9 items-center gap-1.5 rounded-xl bg-slate-100 px-4 text-xs font-bold text-slate-700 hover:bg-slate-200 transition">
          <ArrowLeft className="h-4 w-4" /> Go Back
        </button>
      </div>
    );
  }

  const remaining = daysLeft(requirement.lastDate);
  const isClosed = remaining !== null && remaining < 0;
  const statusColor = requirement.status === 'OPEN' || requirement.status === 'PUBLISHED'
    ? 'bg-emerald-50 text-emerald-700 border-emerald-200'
    : requirement.status === 'CLOSED' || requirement.status === 'AWARDED'
      ? 'bg-amber-50 text-amber-700 border-amber-200'
      : 'bg-slate-100 text-slate-500 border-slate-200';

  const items = Array.isArray(requirement.items) ? requirement.items : [];
  const method = String(requirement.canonicalMethod || requirement.procurementMethod || '').toUpperCase();
  const procMethod = (requirement.procurementMethodLabel || requirement.procurementMethod || '').replace(/_/g, ' ');
  const actionLabel = getActionLabel(method);
  const detailRoute = getDetailRoute(requirement);
  const directPurchase = requirement.directPurchase || null;
  const payload = requirement.payload || {};

  return (
    <div className="mx-auto max-w-7xl px-4 py-6 sm:px-6 lg:px-8">
      {/* Back nav */}
      <button onClick={() => window.history.back()} className="mb-5 inline-flex items-center gap-1.5 text-xs font-bold text-slate-500 hover:text-slate-800 transition">
        <ArrowLeft className="h-4 w-4" /> Back to Opportunities
      </button>

      {/* Guest login banner */}
      {!isLoggedIn && (
        <div className="mb-5 flex items-center gap-3 rounded-xl border border-blue-200 bg-blue-50 px-5 py-4 shadow-sm">
          <Info className="h-5 w-5 text-blue-600 shrink-0" />
          <div className="flex-1">
            <p className="text-sm font-bold text-blue-800">Want to participate in this procurement?</p>
            <p className="text-xs text-blue-600 mt-0.5">Please login or register as a seller to submit your quotation/proposal.</p>
          </div>
          <a
            href={`/login?redirect=${encodeURIComponent(window.location.pathname)}`}
            className="inline-flex h-9 items-center gap-1.5 rounded-xl bg-blue-600 px-4 text-xs font-black text-white hover:bg-blue-700 transition shadow-sm shrink-0"
          >
            <LogIn className="h-3.5 w-3.5" /> Login to Participate
          </a>
        </div>
      )}

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-1">
        {/* ─── Main Details ─── */}
        <div className="lg:col-span-2 space-y-6">
          <div className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
            <div className="flex flex-wrap items-start justify-between gap-4">
              <div className="min-w-0">
                {requirement.requirementNumber && (
                  <span className="mb-1 inline-block text-[10px] font-black uppercase tracking-widest text-[#c86413]">
                    {requirement.requirementNumber}
                  </span>
                )}
                <h1 className="text-xl font-black text-[#0b2447] sm:text-2xl">{requirement.title}</h1>
                {requirement.category?.name && (
                  <p className="mt-1 flex items-center gap-1.5 text-sm font-semibold text-slate-500">
                    <Tag className="h-3.5 w-3.5" /> {requirement.category.name}
                  </p>
                )}
              </div>
              <div className="flex flex-col items-end gap-2">
                <span className={`inline-flex shrink-0 items-center rounded-full border px-3 py-1 text-xs font-black uppercase ${statusColor}`}>
                  {requirement.statusLabel || requirement.status}
                </span>
                {procMethod && (
                  <span className="inline-flex items-center gap-1 rounded-full border border-purple-200 bg-purple-50 px-2.5 py-0.5 text-[9px] font-black uppercase text-purple-700">
                    <Shield className="h-3 w-3" /> {procMethod}
                  </span>
                )}
              </div>
            </div>

            <hr className="my-5 border-slate-100" />

            {/* Description */}
            {requirement.description && (
              <div className="mb-5">
                <h3 className="mb-2 text-xs font-black uppercase tracking-wider text-slate-500">Description</h3>
                <p className="text-sm font-medium text-slate-700 leading-relaxed whitespace-pre-wrap">{requirement.description}</p>
              </div>
            )}

            {/* Key details grid */}
            <div className="grid grid-cols-1 gap-5 sm:grid-cols-2">
              <div className="space-y-4">
                <DetailRow icon={IndianRupee} label="Estimated Value" value={
                  requirement.budgetMin && requirement.budgetMax && requirement.budgetMin !== requirement.budgetMax
                    ? `${formatMoney(requirement.budgetMin)} – ${formatMoney(requirement.budgetMax)}`
                    : formatMoney(requirement.estimatedValue || requirement.budgetMax || requirement.budgetMin)
                } />
                <DetailRow icon={Package} label="Quantity" value={requirement.quantity ? `${requirement.quantity} ${requirement.unit || ''}`.trim() : 'Not specified'} />
                <DetailRow icon={Calendar} label="Deadline" value={
                  <span>
                    {formatDate(requirement.lastDate)}
                    {remaining !== null && (
                      <span className={`ml-2 inline-flex items-center gap-1 text-[10px] font-black uppercase ${isClosed ? 'text-red-500' : remaining <= 3 ? 'text-amber-600' : 'text-emerald-600'}`}>
                        <Clock className="h-3 w-3" />
                        {isClosed ? 'Closed' : `${remaining} day${remaining === 1 ? '' : 's'} left`}
                      </span>
                    )}
                  </span>
                } />
                <DetailRow icon={Clipboard} label="Currency" value={requirement.currency || 'INR'} />
              </div>
              <div className="space-y-4">
                <DetailRow icon={MapPin} label="Location" value={requirement.location || 'Not specified'} />
                {requirement.buyerOrganization?.organizationName && (
                  <DetailRow icon={Building2} label="Buyer Organization" value={
                    <span>
                      {requirement.buyerOrganization.organizationName}
                      {requirement.buyerOrganization.organizationType && (
                        <span className="ml-1.5 text-[9px] font-bold text-slate-400 uppercase">{requirement.buyerOrganization.organizationType}</span>
                      )}
                    </span>
                  } />
                )}
                <DetailRow icon={Users} label="Responses Received" value={`${requirement._count?.responses ?? 0}`} />
                <DetailRow icon={Calendar} label="Published" value={formatDate(requirement.approvedAt || requirement.createdAt)} />
              </div>
            </div>

            {/* Items table */}
            {items.length > 0 && (
              <div className="mt-6">
                <h3 className="mb-3 text-xs font-black uppercase tracking-wider text-slate-500">Items / Line Items</h3>
                <div className="overflow-x-auto rounded-xl border border-slate-200 bg-slate-50/40">
                  <table className="w-full min-w-[600px] text-left text-sm">
                    <thead>
                      <tr className="border-b border-slate-200 text-[10px] font-black uppercase tracking-wider text-slate-500">
                        <th className="px-4 py-3">#</th>
                        <th className="px-4 py-3">Item Name</th>
                        <th className="px-4 py-3">Description</th>
                        <th className="px-4 py-3">Qty</th>
                        <th className="px-4 py-3">Unit</th>
                        <th className="px-4 py-3">Est. Unit Price</th>
                        <th className="px-4 py-3">Specifications</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100 font-semibold text-slate-700">
                      {items.map((item: any, i: number) => (
                        <tr key={item.id || i} className="hover:bg-white/60 transition">
                          <td className="px-4 py-2.5 text-slate-400">{i + 1}</td>
                          <td className="px-4 py-2.5 font-bold text-slate-900">{item.itemName || '—'}</td>
                          <td className="px-4 py-2.5 text-xs text-slate-600 max-w-[200px] truncate">{item.description || '—'}</td>
                          <td className="px-4 py-2.5">{item.quantity ?? '—'}</td>
                          <td className="px-4 py-2.5">{item.unitOfMeasure || '—'}</td>
                          <td className="px-4 py-2.5">{formatMoney(item.estimatedUnitPrice)}</td>
                          <td className="px-4 py-2.5 text-xs text-slate-600 max-w-[200px]">
                            {item.specifications ? (typeof item.specifications === 'string' ? item.specifications : JSON.stringify(item.specifications)) : '—'}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            )}

            {/* Direct Purchase / Delivery Details */}
            {directPurchase && (
              <div className="mt-6">
                <h3 className="mb-3 text-xs font-black uppercase tracking-wider text-slate-500">Delivery & Purchase Details</h3>
                <div className="rounded-xl border border-slate-200 bg-slate-50/40 p-4 space-y-3">
                  {directPurchase.deliveryAddressText && (
                    <DetailRow icon={Truck} label="Delivery Address" value={directPurchase.deliveryAddressText} />
                  )}
                  {directPurchase.department && (
                    <DetailRow icon={Building2} label="Department" value={directPurchase.department} />
                  )}
                  {directPurchase.budgetHead && (
                    <DetailRow icon={Clipboard} label="Budget Head" value={directPurchase.budgetHead} />
                  )}
                  {directPurchase.costCenter && (
                    <DetailRow icon={Clipboard} label="Cost Center" value={directPurchase.costCenter} />
                  )}
                  {directPurchase.justification && (
                    <DetailRow icon={FileText} label="Justification" value={directPurchase.justification} />
                  )}
                  {directPurchase.remarks && (
                    <DetailRow icon={FileText} label="Remarks" value={directPurchase.remarks} />
                  )}
                  {directPurchase.deliveryInstructions && (
                    <DetailRow icon={Truck} label="Delivery Instructions" value={directPurchase.deliveryInstructions} />
                  )}
                  {directPurchase.requiredDeliveryDate && (
                    <DetailRow icon={Calendar} label="Required Delivery Date" value={formatDate(directPurchase.requiredDeliveryDate)} />
                  )}
                  {directPurchase.totalAmount && (
                    <DetailRow icon={IndianRupee} label="Total Amount" value={formatMoney(directPurchase.totalAmount)} />
                  )}
                </div>
              </div>
            )}

            {/* Payload extra data (terms, conditions, etc.) */}
            {payload.termsAndConditions && (
              <div className="mt-6">
                <h3 className="mb-2 text-xs font-black uppercase tracking-wider text-slate-500">Terms & Conditions</h3>
                <p className="text-sm font-medium text-slate-700 leading-relaxed whitespace-pre-wrap bg-slate-50 rounded-xl p-4 border border-slate-200">{payload.termsAndConditions}</p>
              </div>
            )}
            {payload.paymentTerms && (
              <div className="mt-4">
                <h3 className="mb-2 text-xs font-black uppercase tracking-wider text-slate-500">Payment Terms</h3>
                <p className="text-sm font-medium text-slate-700 leading-relaxed bg-slate-50 rounded-xl p-4 border border-slate-200">{payload.paymentTerms}</p>
              </div>
            )}
            {payload.deliveryTerms && (
              <div className="mt-4">
                <h3 className="mb-2 text-xs font-black uppercase tracking-wider text-slate-500">Delivery Terms</h3>
                <p className="text-sm font-medium text-slate-700 leading-relaxed bg-slate-50 rounded-xl p-4 border border-slate-200">{payload.deliveryTerms}</p>
              </div>
            )}

            {/* Action buttons */}
            <div className="mt-6 flex flex-wrap gap-3">
              {!isLoggedIn ? (
                <a
                  href={`/login?redirect=${encodeURIComponent(detailRoute || window.location.pathname)}`}
                  className="inline-flex h-11 items-center justify-center gap-2 rounded-xl bg-[#0b2447] px-6 text-sm font-black text-white shadow-sm hover:bg-[#12335f] active:scale-95 transition"
                >
                  <LogIn className="h-4 w-4" />
                  Login to {actionLabel}
                </a>
              ) : isSeller && !isClosed && !ownResponse ? (
                <a
                  href={detailRoute || '#'}
                  className="inline-flex h-11 items-center justify-center gap-2 rounded-xl bg-[#0b2447] px-6 text-sm font-black text-white shadow-sm hover:bg-[#12335f] active:scale-95 transition"
                >
                  <Send className="h-4 w-4" />
                  {actionLabel}
                </a>
              ) : ownResponse ? (
                <div className="flex items-center gap-2 rounded-xl border border-blue-200 bg-blue-50 px-4 py-3 text-sm font-bold text-blue-700">
                  <CheckCircle2 className="h-5 w-5 shrink-0" /> You have already submitted a response (Status: {ownResponse.status})
                </div>
              ) : isClosed ? (
                <div className="flex items-center gap-2 rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm font-bold text-amber-700">
                  <AlertCircle className="h-5 w-5 shrink-0" /> This procurement opportunity has been closed.
                </div>
              ) : null}
            </div>
          </div>
        </div>

        
      </div>
    </div>
  );
};

/* ── sub-components ──────────────────────────────────────────────── */

function DetailRow({ icon: Icon, label, value }: { icon: any; label: string; value: React.ReactNode }) {
  return (
    <div className="flex items-start gap-3">
      <Icon className="h-5 w-5 text-slate-400 shrink-0 mt-0.5" />
      <div className="min-w-0">
        <span className="block text-[10px] font-black uppercase tracking-wider text-slate-400">{label}</span>
        <span className="text-sm font-bold text-slate-700 leading-relaxed break-words">{value || '—'}</span>
      </div>
    </div>
  );
}

function SummaryRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex justify-between gap-2">
      <span className="text-slate-400 shrink-0">{label}</span>
      <span className="text-slate-700 text-right">{value}</span>
    </div>
  );
}

export default BuyerRequirementDetailsPage;