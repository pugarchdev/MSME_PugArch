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

const formatDateTime = (value?: string | null) => {
  if (!value) return 'Not set';
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return 'Not set';
  return `${d.toLocaleDateString('en-IN', {
    day: '2-digit',
    month: 'short',
    year: 'numeric'
  })}, ${d.toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit', hour12: true })}`;
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
  const [acceptingId, setAcceptingId] = useState<number | null>(null);

  const user = (() => { try { return JSON.parse(localStorage.getItem('msme_user_cache') || '{}'); } catch { return {}; } })();
  const isLoggedIn = !!user?.id;
  const isSeller = user?.role === 'seller';
  const isBuyer = user?.role === 'buyer' || user?.role === 'admin' || user?.role === 'master_admin';

  // Seller responses — buyer/admin only; endpoint enforces ownership server-side.
  const [sellerResponses, setSellerResponses] = useState<any[]>([]);
  const [responsesLoading, setResponsesLoading] = useState(false);
  const [responsesView, setResponsesView] = useState<'list' | 'cards' | 'compare'>('list');
  useEffect(() => {
    const numericId = Number(id);
    if (!isBuyer || !numericId || numericId < 1) return;
    let alive = true;
    setResponsesLoading(true);
    getApi<any>(`/api/buyer/requirements/${numericId}/responses?pageSize=50`)
      .then(data => { if (alive) setSellerResponses(Array.isArray(data?.responses) ? data.responses : []); })
      .catch(() => { /* not the owner or none yet — section simply stays hidden */ })
      .finally(() => { if (alive) setResponsesLoading(false); });
    return () => { alive = false; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id, isBuyer]);

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

  const handleAccept = async (responseId: number) => {
    if (!window.confirm('Are you sure you want to accept this quotation? All other quotations will be automatically rejected.')) return;
    try {
      setAcceptingId(responseId);
      await postApi(`/api/buyer/requirements/${id}/responses/${responseId}/accept`, {});
      
      // Update local state immediately to reflect accepted state without waiting for cache expiration
      setRequirement((prev: any) => prev ? { ...prev, status: 'AWARDED' } : prev);
      setSellerResponses((prev: any[]) => prev.map(r => 
        r.id === responseId 
          ? { ...r, status: 'ACCEPTED' } 
          : { ...r, status: 'REJECTED' }
      ));
      
      loadData();
    } catch (err: any) {
      alert(err.message || 'Failed to accept quotation');
    } finally {
      setAcceptingId(null);
    }
  };

  useEffect(() => { loadData(); }, [loadData]);

  // Redirect to type-specific page when appropriate
  useEffect(() => {
    if (!requirement || redirecting) return;
    const route = getDetailRoute(requirement);
    if (route) {
      // Only redirect to seller-only routes if the user is logged in as a seller
      if (route.startsWith('/seller/') && !isSeller) {
        return;
      }
      setRedirecting(true);
      window.location.replace(route);
    }
  }, [requirement, redirecting, isSeller]);

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

  const termsAndConditions = payload.termsAndConditions || requirement.terms;
  const paymentTerms = payload.paymentTerms || requirement.paymentTerms;
  const deliveryTerms = payload.deliveryTerms || requirement.deliveryTerms;
  const reqDocuments = Array.isArray(payload.documents) && payload.documents.length > 0
    ? payload.documents
    : (Array.isArray(requirement.requiredDocuments) ? requirement.requiredDocuments.map((d: any) => typeof d === 'string' ? { name: d } : d) : []);
  const consigneeDetails = payload.consigneeDetails || requirement.consignees || requirement.consigneeDetails || [];

  const canAccept = isBuyer && !['AWARDED', 'CANCELLED', 'REJECTED'].includes(requirement?.status);

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

            {/* Buyer-filled procurement facts from the creation wizard */}
            {Array.isArray(reqDocuments) && reqDocuments.length > 0 && (
              <div className="mt-6">
                <h3 className="mb-3 text-xs font-black uppercase tracking-wider text-slate-500">Required Documents ({reqDocuments.length})</h3>
                <div className="grid gap-2 sm:grid-cols-2">
                  {reqDocuments.map((doc: any, i: number) => (
                    <div key={i} className="flex items-center gap-2 rounded-xl border border-slate-200 bg-slate-50/40 px-3 py-2.5 text-xs font-semibold text-slate-700">
                      <FileText className="h-4 w-4 shrink-0 text-slate-400" />
                      <span className="min-w-0 truncate">{doc.name || doc.fileName || `Document ${i + 1}`}</span>
                      {doc.required !== false && <span className="ml-auto shrink-0 rounded bg-red-50 px-1.5 py-0.5 text-[9px] font-black uppercase text-red-600 border border-red-100">Required</span>}
                    </div>
                  ))}
                </div>
              </div>
            )}

            {Array.isArray(consigneeDetails) && consigneeDetails.length > 0 && (
              <div className="mt-6">
                <h3 className="mb-3 text-xs font-black uppercase tracking-wider text-slate-500">Consignees / Delivery Points</h3>
                <div className="grid gap-2 sm:grid-cols-2">
                  {consigneeDetails.map((consignee: any, i: number) => (
                    <div key={i} className="rounded-xl border border-slate-200 bg-slate-50/40 px-3 py-2.5 text-xs font-semibold text-slate-700">
                      <span className="font-black text-slate-900">{consignee.name || `Consignee ${i + 1}`}</span>
                      {consignee.location ? <span className="block mt-0.5 text-slate-500">{consignee.location}</span> : null}
                      {consignee.quantity != null ? <span className="block mt-0.5 text-slate-500">Quantity: {consignee.quantity}</span> : null}
                    </div>
                  ))}
                </div>
              </div>
            )}

            {(payload.tender?.bidStartDate || payload.tender?.bidClosingDate || payload.rules?.emdRequired) && (
              <div className="mt-6">
                <h3 className="mb-3 text-xs font-black uppercase tracking-wider text-slate-500">Bid Timeline & Commercial Rules</h3>
                <div className="grid grid-cols-1 gap-4 rounded-xl border border-slate-200 bg-slate-50/40 p-4 sm:grid-cols-2 lg:grid-cols-4">
                  {payload.tender?.bidStartDate && <DetailRow icon={Calendar} label="Bid Start" value={formatDateTime(payload.tender.bidStartDate)} />}
                  {payload.tender?.bidClosingDate && <DetailRow icon={Calendar} label="Bid Closing" value={formatDateTime(payload.tender.bidClosingDate)} />}
                  {payload.tender?.technicalEvaluationDate && <DetailRow icon={Calendar} label="Technical Opening" value={formatDateTime(payload.tender.technicalEvaluationDate)} />}
                  {payload.rules?.emdRequired ? <DetailRow icon={IndianRupee} label="EMD" value={formatMoney(payload.rules.emdAmount)} /> : null}
                  {payload.tender?.performanceSecurityAmount ? <DetailRow icon={Shield} label="Performance Security" value={formatMoney(payload.tender.performanceSecurityAmount)} /> : null}
                </div>
              </div>
            )}

            {/* Payload extra data (terms, conditions, etc.) */}
            {termsAndConditions && (
              <div className="mt-6">
                <h3 className="mb-2 text-xs font-black uppercase tracking-wider text-slate-500">Terms & Conditions</h3>
                <p className="text-sm font-medium text-slate-700 leading-relaxed whitespace-pre-wrap bg-slate-50 rounded-xl p-4 border border-slate-200">{termsAndConditions}</p>
              </div>
            )}
            {paymentTerms && (
              <div className="mt-4">
                <h3 className="mb-2 text-xs font-black uppercase tracking-wider text-slate-500">Payment Terms</h3>
                <p className="text-sm font-medium text-slate-700 leading-relaxed bg-slate-50 rounded-xl p-4 border border-slate-200">{paymentTerms}</p>
              </div>
            )}
            {deliveryTerms && (
              <div className="mt-4">
                <h3 className="mb-2 text-xs font-black uppercase tracking-wider text-slate-500">Delivery Terms</h3>
                <p className="text-sm font-medium text-slate-700 leading-relaxed bg-slate-50 rounded-xl p-4 border border-slate-200">{deliveryTerms}</p>
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

          {/* ─── Seller Responses (owner buyer / admin only) ─── */}
          {isBuyer && (
            <div className="mt-6 rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <h2 className="flex items-center gap-2 text-base font-black text-[#0b2447]">
                  <Users className="h-4 w-4" /> Seller Responses
                </h2>
                <div className="flex items-center gap-3">
                  {sellerResponses.length >= 2 && (
                    <div className="flex rounded-lg border border-slate-200 bg-slate-50 p-0.5">
                      {(['list', 'cards', 'compare'] as const).map(mode => (
                        <button
                          key={mode}
                          type="button"
                          onClick={() => setResponsesView(mode)}
                          className={`rounded-md px-3 py-1 text-[11px] font-black uppercase tracking-wider transition ${
                            responsesView === mode ? 'bg-white text-[#0b2447] shadow-sm' : 'text-slate-500 hover:text-slate-700'
                          }`}
                        >
                          {mode === 'cards' ? 'Cards' : mode === 'compare' ? 'Compare' : 'List'}
                        </button>
                      ))}
                    </div>
                  )}
                  <span className="text-xs font-bold text-slate-500">
                    {responsesLoading ? 'Loading…' : `${sellerResponses.length} response${sellerResponses.length === 1 ? '' : 's'}`}
                  </span>
                </div>
              </div>
              {responsesLoading ? (
                <div className="mt-8 flex flex-col items-center justify-center p-6 text-center animate-pulse">
                  <div className="h-10 w-10 rounded-full border-4 border-slate-200 border-t-[#0b2447] animate-spin mb-4" />
                  <p className="text-sm font-bold text-slate-500">Loading responses...</p>
                </div>
              ) : sellerResponses.length === 0 ? (
                <div className="mt-6 flex flex-col items-center justify-center rounded-xl border border-dashed border-slate-200 bg-slate-50/50 p-8 text-center">
                  <Users className="mx-auto mb-3 h-8 w-8 text-slate-300" />
                  <p className="text-sm font-black text-slate-700">No responses yet</p>
                  <p className="mt-1 max-w-xs text-xs font-medium text-slate-500">
                    Sellers have not submitted any responses or quotations for this requirement yet.
                  </p>
                </div>
              ) : responsesView === 'compare' && sellerResponses.length >= 2 ? (
                <div className="mt-6">
                  <ResponseComparisonTable responses={sellerResponses} canAccept={canAccept} acceptingId={acceptingId} onAccept={handleAccept} />
                </div>
              ) : responsesView === 'list' && sellerResponses.length >= 1 ? (
                <div className="mt-6">
                  <ResponseListTable responses={sellerResponses} canAccept={canAccept} acceptingId={acceptingId} onAccept={handleAccept} />
                </div>
              ) : (
                <div className="mt-6 space-y-4">
                  {sellerResponses.map((response: any) => (
                    <SellerResponseCard key={response.id} response={response} canAccept={canAccept} acceptingId={acceptingId} onAccept={() => handleAccept(response.id)} />
                  ))}
                </div>
              )}
            </div>
          )}
        </div>


      </div>
    </div>
  );
};

/** One seller's submission: headline commercials + dynamic responseData (line quotes, documents). */
function SellerResponseCard({ response, canAccept, acceptingId, onAccept }: { response: any; canAccept?: boolean; acceptingId?: number | null; onAccept?: () => void }) {
  const responseData = response.responseData || {};
  const lineItems: any[] = Array.isArray(responseData.lineItems) ? responseData.lineItems : [];
  const docs: any[] = Array.isArray(responseData.documents) ? responseData.documents : [];
  const orgName = response.sellerOrganization?.organizationName
    || response.sellerUser?.name
    || `Seller #${response.sellerUserId || response.id}`;

  const openDoc = async (doc: any) => {
    if (doc.fileAssetId) {
      try {
        const { openFileAsset } = await import('../../../lib/files');
        await openFileAsset({ id: doc.fileAssetId, fileAssetId: doc.fileAssetId, originalName: doc.fileName || doc.name }, doc.fileName || doc.name);
        return;
      } catch { /* fall through to URL */ }
    }
    if (doc.fileUrl) window.open(doc.fileUrl, '_blank', 'noopener');
  };

  return (
    <div className="rounded-xl border border-slate-200 bg-slate-50/40 p-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="text-sm font-black text-slate-900">{orgName}</p>
          <p className="mt-0.5 text-[11px] font-semibold text-slate-500">
            Submitted {formatDate(response.createdAt)}
            {response.sellerUser?.email ? ` · ${response.sellerUser.email}` : ''}
            {response.sellerUser?.mobile ? ` · ${response.sellerUser.mobile}` : ''}
          </p>
        </div>
        <span className={`inline-flex shrink-0 items-center rounded-full border px-2.5 py-0.5 text-[10px] font-black uppercase ${
          response.status === 'ACCEPTED' ? 'border-emerald-200 bg-emerald-50 text-emerald-700'
            : response.status === 'REJECTED' ? 'border-red-200 bg-red-50 text-red-700'
            : 'border-blue-200 bg-blue-50 text-blue-700'
        }`}>
          {response.status}
        </span>
        {canAccept && (
          <button
            onClick={onAccept}
            disabled={acceptingId !== null}
            className="inline-flex shrink-0 items-center rounded-full bg-[#0b2447] px-3 py-1 text-[10px] font-black uppercase text-white shadow-sm hover:bg-[#12335f] transition disabled:opacity-50"
          >
            {acceptingId === response.id ? 'Accepting...' : 'Accept'}
          </button>
        )}
      </div>

      <div className="mt-3 grid grid-cols-2 gap-3 sm:grid-cols-4">
        <SummaryTile label="Offered Price" value={formatMoney(response.offeredPrice)} />
        <SummaryTile label="Offered Quantity" value={response.offeredQuantity != null ? String(response.offeredQuantity) : '—'} />
        <SummaryTile label="Delivery Timeline" value={response.deliveryTimeline || '—'} />
        <SummaryTile 
          label="Attachment" 
          value={response.attachmentUrl ? 'Attached' : '—'} 
          onClick={response.attachmentUrl ? () => {
            import('../../../lib/files').then(({ openFileAsset }) => {
              openFileAsset({ url: response.attachmentUrl }, 'Attachment');
            });
          } : undefined} 
        />
      </div>

      {response.message && (
        <p className="mt-3 rounded-lg border border-slate-200 bg-white p-3 text-xs font-semibold leading-relaxed text-slate-700 whitespace-pre-wrap">
          {response.message}
        </p>
      )}
      {response.terms && (
        <p className="mt-2 text-[11px] font-semibold text-slate-500">
          <span className="font-black uppercase tracking-wider text-slate-400">Terms: </span>{response.terms}
        </p>
      )}

      {/* Item-wise quote submitted by the seller */}
      {lineItems.length > 0 && (
        <div className="mt-3 overflow-x-auto rounded-lg border border-slate-200 bg-white">
          <table className="w-full min-w-[640px] text-left text-xs">
            <thead className="border-b border-slate-200 bg-slate-50 text-[10px] font-black uppercase tracking-wider text-slate-500">
              <tr>
                <th className="px-3 py-2">Item</th>
                <th className="px-3 py-2 text-right">Qty</th>
                <th className="px-3 py-2 text-right">Unit Price</th>
                <th className="px-3 py-2 text-right">GST %</th>
                <th className="px-3 py-2">Make / Brand</th>
                <th className="px-3 py-2">Remarks</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 font-semibold text-slate-700">
              {lineItems.map((line: any, i: number) => (
                <tr key={i}>
                  <td className="px-3 py-2 font-bold text-slate-900">{line.itemName || '—'}</td>
                  <td className="px-3 py-2 text-right tabular-nums">{line.quantity ?? '—'}</td>
                  <td className="px-3 py-2 text-right tabular-nums">{formatMoney(line.unitPrice)}</td>
                  <td className="px-3 py-2 text-right tabular-nums">{line.gstPercent ?? '—'}</td>
                  <td className="px-3 py-2">{line.makeBrand || '—'}</td>
                  <td className="px-3 py-2 text-slate-500">{line.remarks || '—'}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {/* Documents the seller uploaded against the buyer's checklist */}
      {docs.length > 0 && (
        <div className="mt-3 flex flex-wrap gap-2">
          {docs.map((doc: any, i: number) => (
            <button
              key={i}
              type="button"
              onClick={() => openDoc(doc)}
              className="inline-flex items-center gap-1.5 rounded-lg border border-blue-200 bg-blue-50 px-3 py-1.5 text-[11px] font-bold text-blue-700 hover:bg-blue-100 transition"
            >
              <FileText className="h-3.5 w-3.5 shrink-0" />
              {doc.name || doc.fileName || `Document ${i + 1}`}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

/**
 * Side-by-side comparison: sellers as columns, commercial facts as rows.
 * Lowest offered price and each item's lowest unit price highlighted (L1).
 */
function ResponseComparisonTable({ responses, canAccept, acceptingId, onAccept }: { responses: any[]; canAccept?: boolean; acceptingId?: number | null; onAccept?: (id: number) => void }) {
  const sorted = [...responses].sort((a, b) => (Number(a.offeredPrice) || Infinity) - (Number(b.offeredPrice) || Infinity));
  const validPrices = sorted.map(r => Number(r.offeredPrice)).filter(p => Number.isFinite(p) && p > 0);
  const lowestPrice = validPrices.length ? Math.min(...validPrices) : null;

  // Union of item names quoted by any seller, preserving first-seen order
  const itemNames: string[] = [];
  sorted.forEach(r => {
    (r.responseData?.lineItems || []).forEach((line: any) => {
      const name = String(line.itemName || '').trim();
      if (name && !itemNames.includes(name)) itemNames.push(name);
    });
  });
  const unitPriceFor = (response: any, itemName: string) => {
    const line = (response.responseData?.lineItems || []).find((l: any) => String(l.itemName || '').trim() === itemName);
    return line?.unitPrice != null ? Number(line.unitPrice) : null;
  };
  const lowestUnitFor = (itemName: string) => {
    const prices = sorted.map(r => unitPriceFor(r, itemName)).filter((p): p is number => p != null && Number.isFinite(p));
    return prices.length ? Math.min(...prices) : null;
  };

  const sellerName = (r: any) => r.sellerOrganization?.organizationName || r.sellerUser?.name || `Seller #${r.sellerUserId || r.id}`;

  return (
    <div className="mt-4 overflow-x-auto rounded-xl border border-slate-200">
      <table className="w-full min-w-[720px] text-left text-xs">
        <thead className="border-b border-slate-200 bg-slate-50">
          <tr>
            <th className="px-3 py-2.5 text-[10px] font-black uppercase tracking-wider text-slate-500 w-44">Criteria</th>
            {sorted.map((r, i) => {
              const isLowest = i === 0 && lowestPrice != null;
              return (
                <th key={r.id} className={`px-4 py-3 align-top min-w-[200px] border-l border-slate-200 ${isLowest ? 'bg-emerald-50/30' : ''}`}>
                  <div className="flex flex-col gap-1.5">
                    <span className="font-bold text-slate-900 leading-tight">{sellerName(r)}</span>
                    <span className={`inline-flex self-start rounded px-1.5 py-0.5 text-[9px] font-black uppercase ${
                      isLowest ? 'bg-emerald-50 text-emerald-700 border border-emerald-200' : 'bg-slate-100 text-slate-500'
                    }`}>
                      {isLowest ? 'L1 - Lowest' : `L${i + 1}`}
                    </span>
                    {canAccept && (
                      <button
                        onClick={() => onAccept?.(r.id)}
                        disabled={acceptingId !== null}
                        className="mt-1 inline-flex self-start items-center rounded-md bg-[#0b2447] px-2.5 py-1 text-[10px] font-black uppercase text-white shadow-sm hover:bg-[#12335f] transition disabled:opacity-50"
                      >
                        {acceptingId === r.id ? 'Accepting...' : 'Accept'}
                      </button>
                    )}
                    {r.status === 'ACCEPTED' && (
                      <span className="mt-1 inline-flex self-start items-center rounded-md bg-emerald-50 px-2.5 py-1 text-[10px] font-black uppercase text-emerald-700 border border-emerald-200">
                        Accepted
                      </span>
                    )}
                    {r.status === 'REJECTED' && (
                      <span className="mt-1 inline-flex self-start items-center rounded-md bg-red-50 px-2.5 py-1 text-[10px] font-black uppercase text-red-700 border border-red-200">
                        Rejected
                      </span>
                    )}
                  </div>
                </th>
              );
            })}
          </tr>
        </thead>
        <tbody className="divide-y divide-slate-100 font-semibold text-slate-700">
          <tr>
            <td className="px-3 py-2.5 font-black text-slate-500">Offered Price</td>
            {sorted.map(r => {
              const price = Number(r.offeredPrice);
              const isLowest = lowestPrice != null && price === lowestPrice;
              return (
                <td key={r.id} className={`px-3 py-2.5 tabular-nums font-black ${isLowest ? 'text-emerald-700' : 'text-slate-900'}`}>
                  {formatMoney(r.offeredPrice)}
                </td>
              );
            })}
          </tr>
          <tr>
            <td className="px-3 py-2.5 font-black text-slate-500">Offered Quantity</td>
            {sorted.map(r => <td key={r.id} className="px-3 py-2.5 tabular-nums">{r.offeredQuantity ?? '—'}</td>)}
          </tr>
          <tr>
            <td className="px-3 py-2.5 font-black text-slate-500">Delivery Timeline</td>
            {sorted.map(r => <td key={r.id} className="px-3 py-2.5">{r.deliveryTimeline || '—'}</td>)}
          </tr>
          <tr>
            <td className="px-3 py-2.5 font-black text-slate-500">Documents Uploaded</td>
            {sorted.map(r => <td key={r.id} className="px-3 py-2.5 tabular-nums">{(r.responseData?.documents || []).length}</td>)}
          </tr>
          <tr>
            <td className="px-3 py-2.5 font-black text-slate-500">Submitted</td>
            {sorted.map(r => <td key={r.id} className="px-3 py-2.5">{formatDate(r.createdAt)}</td>)}
          </tr>
          {itemNames.map(itemName => {
            const lowest = lowestUnitFor(itemName);
            return (
              <tr key={itemName}>
                <td className="px-3 py-2.5 font-black text-slate-500">
                  <span className="block text-[9px] uppercase tracking-wider text-slate-400">Unit Price</span>
                  {itemName}
                </td>
                {sorted.map(r => {
                  const price = unitPriceFor(r, itemName);
                  const isLowest = lowest != null && price === lowest;
                  return (
                    <td key={r.id} className={`px-3 py-2.5 tabular-nums ${isLowest ? 'font-black text-emerald-700' : ''}`}>
                      {price != null ? formatMoney(price) : '—'}
                    </td>
                  );
                })}
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

function ResponseListTable({ responses, canAccept, acceptingId, onAccept }: { responses: any[]; canAccept?: boolean; acceptingId?: number | null; onAccept?: (id: number) => void }) {
  const sorted = [...responses].sort((a, b) => (Number(a.offeredPrice) || Infinity) - (Number(b.offeredPrice) || Infinity));
  const validPrices = sorted.map(r => Number(r.offeredPrice)).filter(p => Number.isFinite(p) && p > 0);
  const lowestPrice = validPrices.length ? Math.min(...validPrices) : null;

  const sellerName = (r: any) => r.sellerOrganization?.organizationName || r.sellerUser?.name || `Seller #${r.sellerUserId || r.id}`;

  return (
    <div className="overflow-x-auto rounded-xl border border-slate-200 bg-white">
      <table className="w-full text-left text-xs">
        <thead className="border-b border-slate-200 bg-slate-50">
          <tr>
            <th className="px-4 py-3 font-black text-slate-500 uppercase tracking-wider text-[10px]">Seller</th>
            <th className="px-4 py-3 font-black text-slate-500 uppercase tracking-wider text-[10px]">Price</th>
            <th className="px-4 py-3 font-black text-slate-500 uppercase tracking-wider text-[10px]">Qty</th>
            <th className="px-4 py-3 font-black text-slate-500 uppercase tracking-wider text-[10px]">Delivery</th>
            <th className="px-4 py-3 font-black text-slate-500 uppercase tracking-wider text-[10px]">Submitted Date</th>
            <th className="px-4 py-3 font-black text-slate-500 uppercase tracking-wider text-[10px] text-center">Rank</th>
            {canAccept && <th className="px-4 py-3 font-black text-slate-500 uppercase tracking-wider text-[10px] text-right">Action</th>}
          </tr>
        </thead>
        <tbody className="divide-y divide-slate-100">
          {sorted.map((r, i) => {
            const price = Number(r.offeredPrice);
            const isLowest = lowestPrice != null && price === lowestPrice;
            return (
              <tr key={r.id} className="hover:bg-slate-50/50 transition-colors">
                <td className="px-4 py-3 font-bold text-slate-900">
                  {sellerName(r)}
                  {r.status === 'ACCEPTED' && <span className="ml-2 inline-flex items-center rounded-md bg-emerald-50 px-1.5 py-0.5 text-[9px] font-black uppercase text-emerald-700 border border-emerald-200">Accepted</span>}
                  {r.status === 'REJECTED' && <span className="ml-2 inline-flex items-center rounded-md bg-red-50 px-1.5 py-0.5 text-[9px] font-black uppercase text-red-700 border border-red-200">Rejected</span>}
                </td>
                <td className={`px-4 py-3 font-black tabular-nums ${isLowest ? 'text-emerald-700' : 'text-slate-900'}`}>
                  {formatMoney(r.offeredPrice)}
                </td>
                <td className="px-4 py-3 tabular-nums">{r.offeredQuantity ?? '—'}</td>
                <td className="px-4 py-3">{r.deliveryTimeline || '—'}</td>
                <td className="px-4 py-3 text-slate-500">{formatDate(r.createdAt)}</td>
                <td className="px-4 py-3 text-center">
                  <span className={`inline-flex rounded px-1.5 py-0.5 text-[9px] font-black uppercase ${
                    isLowest ? 'bg-emerald-50 text-emerald-700 border border-emerald-200' : 'bg-slate-100 text-slate-500'
                  }`}>
                    {isLowest ? 'L1' : `L${i + 1}`}
                  </span>
                </td>
                {canAccept && (
                  <td className="px-4 py-3 text-right">
                    <button
                      onClick={() => onAccept?.(r.id)}
                      disabled={acceptingId !== null}
                      className="inline-flex shrink-0 items-center rounded-md bg-[#0b2447] px-2.5 py-1 text-[10px] font-black uppercase text-white shadow-sm hover:bg-[#12335f] transition disabled:opacity-50"
                    >
                      {acceptingId === r.id ? 'Accepting...' : 'Accept'}
                    </button>
                  </td>
                )}
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

function SummaryTile({ label, value, href, onClick }: { label: string; value: string; href?: string; onClick?: () => void }) {
  return (
    <div className="rounded-lg border border-slate-200 bg-white p-2.5">
      <p className="text-[9px] font-black uppercase tracking-wider text-slate-400">{label}</p>
      {onClick ? (
        <button type="button" onClick={onClick} className="mt-0.5 block text-xs font-black text-blue-700 hover:underline cursor-pointer border-none bg-transparent p-0 text-left">
          View attachment
        </button>
      ) : href ? (
        <a href={href} target="_blank" rel="noopener noreferrer" className="mt-0.5 block text-xs font-black text-blue-700 hover:underline">
          View attachment
        </a>
      ) : (
        <p className="mt-0.5 text-xs font-black text-slate-800 break-words">{value}</p>
      )}
    </div>
  );
}

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