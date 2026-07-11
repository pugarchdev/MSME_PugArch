'use client';

import React, { useEffect, useState } from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { CalendarDays, Download, FileText, MapPin, MessageSquareText, X } from 'lucide-react';
import { useAuth } from '../../../hooks/useAuth';
import { ClarificationButton, LifecycleTracker, PageShell, ProcurementEmptyState, ProcurementErrorState, ProcurementHero, ProcurementLoadingState, ResultsTable, StatusBadge, ProcurementTimelineTracker } from '../components';
import { formatDate, money } from '../data';
import type { ProcurementBid } from '../data';
import { procurementBidApi } from '../api';
import { api, unwrapApiData } from '../../../lib/api';
import PremiumLoader from '../../../components/PremiumLoader';
import { toast } from 'sonner';

export default function BidDetailsPage() {
  const { user, token } = useAuth();
  const pathname = usePathname() || '';
  const bidId = pathname.split('/')[2];
  const [bid, setBid] = useState<ProcurementBid | null>(null);
  const [timeline, setTimeline] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [showClarifications, setShowClarifications] = useState(false);
  const participateHref = user ? `/bids/${bidId}/participate` : `/login?returnUrl=${encodeURIComponent(`/bids/${bidId}/participate`)}`;
  const isPendingApproval = bid?.approvalStatus === 'PENDING' || bid?.approvalStatus === 'DRAFT';
  const authHeaders = React.useMemo(() => {
    const headers: Record<string, string> = {};
    if (token) headers.Authorization = `Bearer ${token}`;
    return headers;
  }, [token]);

  const loadBid = React.useCallback(() => {
    let alive = true;
    setLoading(true);
    setError('');
    
    Promise.all([
      procurementBidApi.detail(bidId),
      api.fetch(`/api/bids/${bidId}/timeline`, { headers: authHeaders }).then(r => r.ok ? r.json() : { data: [] }).catch(() => ({ data: [] }))
    ])
      .then(([bidData, timelineRes]) => {
        if (alive) {
          setBid(bidData);
          setTimeline(unwrapApiData<any[]>(timelineRes) || []);
        }
      })
      .catch((err: any) => {
        if (!alive) return;
        setBid(null);
        setError(err?.message || 'Unable to load bid details right now.');
      })
      .finally(() => { if (alive) setLoading(false); });
      
    return () => { alive = false; };
  }, [bidId, authHeaders]);

  useEffect(() => {
    return loadBid();
  }, [loadBid]);

  if (loading) {
    return <PremiumLoader />;
  }

  if (error) {
    return (
      <PageShell>
        <main className="mx-auto w-full max-w-7xl">
          <ProcurementHero title="Bid Details" subtitle={bidId || 'Requested bid'} action={<Link href="/bids" className="inline-flex h-10 items-center justify-center rounded-md border border-slate-200 bg-white px-4 text-xs font-black text-slate-700">Back to bids</Link>} />
          <div className="mt-5"><ProcurementErrorState message={error} onRetry={loadBid} /></div>
        </main>
      </PageShell>
    );
  }

  if (!bid) {
    return (
      <PageShell>
        <main className="mx-auto w-full max-w-7xl">
          <ProcurementHero title="Bid Details" subtitle={bidId || 'Requested bid'} action={<Link href="/bids" className="inline-flex h-10 items-center justify-center rounded-md border border-slate-200 bg-white px-4 text-xs font-black text-slate-700">Back to bids</Link>} />
          <div className="mt-5"><ProcurementEmptyState title="No bid details available currently." message="This bid was not returned by the live backend." /></div>
        </main>
      </PageShell>
    );
  }

  const isOwner = user?.role === 'buyer' && Number(bid.buyerId) === Number(user.id);

  return (
    <PageShell>
      <main className="mx-auto w-full max-w-7xl">
        <ProcurementHero
          title={bid.title}
          subtitle={`${loading ? 'Loading...' : bid.id} • ${bid.buyerName} • ${bid.buyerType}`}
          action={
            isPendingApproval ? (
              <button disabled className="inline-flex h-10 items-center justify-center rounded-md bg-slate-200 px-4 text-xs font-black text-slate-400 cursor-not-allowed">
                Pending Approval
              </button>
            ) : (
              <Link href={participateHref} className="inline-flex h-10 items-center justify-center rounded-md bg-[#0b2447] px-4 text-xs font-black text-white">{user ? 'Participate in Bid' : 'Login to Participate'}</Link>
            )
          }
        />

        {/* Buyer Control Panel */}
        {isOwner && (
          <div className="mt-4 rounded-xl border border-[#12335f]/25 bg-gradient-to-r from-[#12335f]/5 to-transparent p-4 shadow-sm flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
            <div>
              <p className="text-[9px] font-black uppercase tracking-wider text-[#12335f]">Buyer Control Panel</p>
              <h4 className="text-sm font-extrabold text-slate-900 mt-0.5">Manage Procurement Lifecycle</h4>
              <p className="text-xs text-slate-500 font-semibold">As the owner, you can manage progress, evaluate compliance, and recommend awards.</p>
            </div>
            <div className="flex flex-wrap gap-2">
              {String(bid.status) === 'DRAFT' && (
                <button
                  onClick={async () => {
                    try {
                      setLoading(true);
                      await procurementBidApi.submitBidForApproval(bid.id);
                      toast.success('Bid published successfully!');
                      loadBid();
                    } catch (err: any) {
                      toast.error(err.message || 'Failed to publish bid');
                      setLoading(false);
                    }
                  }}
                  className="inline-flex h-9 items-center justify-center rounded-md bg-[#0b2447] px-4 text-xs font-black text-white shadow-sm transition hover:bg-[#12335f]"
                >
                  Publish Bid
                </button>
              )}
              {['PUBLISHED', 'OPEN_FOR_BIDDING', 'OPEN'].includes(String(bid.status)) && (
                <button
                  onClick={async () => {
                    const confirmEval = window.confirm("Are you sure you want to close bidding and enter technical evaluation?");
                    if (!confirmEval) return;
                    try {
                      setLoading(true);
                      const parts = await procurementBidApi.getBidParticipants(bid.id);
                      if (parts.length === 0) {
                        toast.error("Cannot evaluate: No sellers have participated in this bid yet.");
                        setLoading(false);
                        return;
                      }
                      await procurementBidApi.submitTechnicalEvaluation(bid.id, {
                        evaluations: parts.map(p => ({ participationId: p.id, status: 'QUALIFIED', remarks: 'Technical criteria met' }))
                      });
                      toast.success('Technical evaluation initiated!');
                      loadBid();
                    } catch (err: any) {
                      toast.error(err.message || 'Failed to initiate technical evaluation');
                      setLoading(false);
                    }
                  }}
                  className="inline-flex h-9 items-center justify-center rounded-md bg-[#0b2447] px-4 text-xs font-black text-white shadow-sm transition hover:bg-[#12335f]"
                >
                  Start Evaluation
                </button>
              )}
              {String(bid.status) === 'TECHNICAL_EVALUATION' && (
                <button
                  onClick={async () => {
                    try {
                      setLoading(true);
                      await procurementBidApi.completeTechnicalEvaluation(bid.id);
                      toast.success('Technical evaluation completed!');
                      loadBid();
                    } catch (err: any) {
                      toast.error(err.message || 'Failed to complete technical evaluation');
                      setLoading(false);
                    }
                  }}
                  className="inline-flex h-9 items-center justify-center rounded-md bg-[#0b2447] px-4 text-xs font-black text-white shadow-sm transition hover:bg-[#12335f]"
                >
                  Complete Tech Evaluation
                </button>
              )}
              {String(bid.status) === 'TECHNICAL_EVALUATION_COMPLETED' && (
                <button
                  onClick={async () => {
                    try {
                      setLoading(true);
                      await procurementBidApi.openFinancialEvaluation(bid.id);
                      toast.success('Financial evaluation opened and ranking generated!');
                      loadBid();
                    } catch (err: any) {
                      toast.error(err.message || 'Failed to open financial evaluation');
                      setLoading(false);
                    }
                  }}
                  className="inline-flex h-9 items-center justify-center rounded-md bg-[#0b2447] px-4 text-xs font-black text-white shadow-sm transition hover:bg-[#12335f]"
                >
                  Open Financial Bids
                </button>
              )}
              {['TECHNICAL_EVALUATION', 'TECHNICAL_EVALUATION_COMPLETED', 'L1_GENERATED', 'FINANCIAL_EVALUATION', 'UNDER_EVALUATION'].includes(String(bid.status)) && (
                <Link
                  href={`/bids/${bid.id}/compare`}
                  className="inline-flex h-9 items-center justify-center rounded-md border border-[#c86413] bg-[#fff7ed] px-4 text-xs font-black text-[#9a4a0f] shadow-sm transition hover:bg-[#ffedd5]"
                >
                  Compare & Award
                </Link>
              )}
            </div>
          </div>
        )}

        <div className="mt-5 grid gap-5 lg:grid-cols-[1fr_340px]">
          <section className="space-y-5">
            <div className="rounded-lg border border-slate-200 bg-white p-4">
              <div className="flex flex-wrap gap-2">
                <StatusBadge label={bid.status} />
                <StatusBadge label={bid.technicalStatus} />
                {bid.clarificationStatus && bid.clarificationStatus !== 'None' && (
                  <StatusBadge label={bid.clarificationStatus} />
                )}
              </div>
              <div className="mt-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
                {[
                  ['Buyer', bid.buyerName],
                  ['Category', bid.category],
                  ['Quantity', bid.quantity],
                  ['Estimated value', money(bid.estimatedValue)],
                  ['Bid type', bid.bidType],
                  ['Department', bid.departmentName],
                  ['Start date', formatDate(bid.startDate)],
                  ['End date', formatDate(bid.endDate)],
                ].map(([label, value]) => (
                  <div key={label} className="rounded-md border border-slate-100 bg-slate-50 p-3">
                    <p className="text-[10px] font-black uppercase tracking-wider text-slate-400">{label}</p>
                    <p className="mt-1 text-xs font-black text-slate-800">{value}</p>
                  </div>
                ))}
              </div>
            </div>

            <div className="rounded-lg border border-slate-200 bg-white p-4">
              <h2 className="text-base font-black text-[#0b2447] mb-4">Bid Lifecycle Timeline</h2>
              {timeline && timeline.length > 0 ? (
                <ProcurementTimelineTracker stages={timeline} />
              ) : (
                <LifecycleTracker current={bid.currentStage} />
              )}
            </div>

            <div className="grid gap-5 lg:grid-cols-2">
              <InfoBlock title="Basic bid information" items={[bid.description, `Item/service: ${bid.itemName}`, `Delivery location: ${bid.deliveryLocation}`]} />
              <InfoBlock title="Buyer details" items={[bid.buyerName, bid.buyerType, bid.departmentName, bid.location]} />
              <InfoBlock title="Eligibility criteria" items={bid.eligibility} />
              <InfoBlock title="Required documents" items={bid.requiredDocuments} />
              <InfoBlock title="Important dates" items={bid.importantDates.map(item => `${item.label}: ${formatDate(item.date)}`)} />
              <InfoBlock title="Terms and conditions" items={bid.terms} />
            </div>

            <div className="rounded-lg border border-slate-200 bg-white p-4">
              <div className="flex flex-wrap items-center justify-between gap-3">
                <div>
                  <h2 className="text-base font-black text-[#0b2447]">Clarification Section</h2>
                  <p className="mt-1 text-xs text-slate-500">Buyers and sellers can track request history, uploaded documents, and final responses.</p>
                </div>
                <ClarificationButton onClick={() => setShowClarifications(true)} />
              </div>
            </div>

            <div className="rounded-lg border border-slate-200 bg-white p-4">
              <div className="mb-3 flex items-center justify-between">
                <h2 className="text-base font-black text-[#0b2447]">Bid Result Section</h2>
                <Link href={`/bids/${bid.id}/results`} className="text-xs font-black text-[#0b2447] underline underline-offset-4">Open full result</Link>
              </div>
              <ResultsTable rows={bid.results} />
            </div>
          </section>

          <aside className="space-y-4 lg:sticky lg:top-28 lg:self-start">
            <div className="rounded-lg border border-slate-200 bg-white p-4">
              <h2 className="text-sm font-black text-[#0b2447]">Documents</h2>
              <div className="mt-3 space-y-2">
                {bid.bidDocuments?.length ? bid.bidDocuments.map(doc => (
                  <button key={doc.name} className="flex w-full items-center gap-3 rounded-md border border-slate-200 p-3 text-left hover:bg-slate-50">
                    <FileText className="h-4 w-4 text-[#0b2447]" />
                    <span className="min-w-0 flex-1"><span className="block text-xs font-black text-slate-800">{doc.name}</span><span className="text-[10px] text-slate-500">{doc.meta}</span></span>
                    <Download className="h-4 w-4 text-slate-400" />
                  </button>
                )) : <p className="rounded-md border border-dashed border-slate-200 bg-slate-50 p-3 text-xs font-bold text-slate-500">No bid documents uploaded currently.</p>}
              </div>
            </div>
            {isPendingApproval ? (
              <button disabled className="flex h-11 w-full items-center justify-center rounded-md bg-slate-200 text-xs font-black text-slate-400 cursor-not-allowed">
                Pending Approval
              </button>
            ) : (
              <Link href={participateHref} className="flex h-11 items-center justify-center rounded-md bg-[#0b2447] text-xs font-black text-white">{user ? 'Participate' : 'Login to Participate'}</Link>
            )}
            <Link href="/bids" className="flex h-10 items-center justify-center rounded-md border border-slate-200 bg-white text-xs font-black text-slate-700">Back to all bids</Link>
          </aside>
        </div>
      </main>
      {showClarifications && (
        <div className="fixed inset-0 z-[9999] flex items-end justify-center bg-black/40 p-0 sm:items-center sm:p-4">
          <div className="max-h-[90dvh] w-full max-w-4xl overflow-hidden rounded-t-lg bg-white shadow-2xl sm:rounded-lg">
            <div className="flex items-center justify-between border-b border-slate-200 p-4">
              <div><h2 className="text-base font-black text-[#0b2447]">Clarification History</h2><p className="text-xs text-slate-500">{bid.id}</p></div>
              <button onClick={() => setShowClarifications(false)} className="flex h-8 w-8 items-center justify-center rounded-md border border-slate-200"><X className="h-4 w-4" /></button>
            </div>
            <div className="max-h-[70dvh] overflow-auto p-4">
              {bid.clarifications.length ? bid.clarifications.map(item => (
                <div key={item.requestNumber} className="mb-3 rounded-lg border border-slate-200 bg-slate-50 p-4">
                  <div className="flex flex-wrap items-center gap-2"><StatusBadge label={item.status} /><p className="text-xs font-black text-slate-800">{item.requestNumber}</p><p className="text-[11px] text-slate-500">{item.requestedAt}</p></div>
                  <div className="mt-3 grid gap-3 md:grid-cols-2">
                    <InfoMini icon={<MessageSquareText className="h-4 w-4" />} label="Clarification type" value={item.type} />
                    <InfoMini icon={<FileText className="h-4 w-4" />} label="Uploaded document" value={item.uploadedDocument} />
                    <InfoMini icon={<CalendarDays className="h-4 w-4" />} label="Description" value={item.description} />
                    <InfoMini icon={<MapPin className="h-4 w-4" />} label="Seller / Buyer response" value={`${item.sellerResponse} ${item.buyerResponse}`} />
                  </div>
                </div>
              )) : <p className="text-sm font-bold text-slate-500">No clarification requests have been raised for this bid.</p>}
            </div>
          </div>
        </div>
      )}
    </PageShell>
  );
}

function InfoBlock({ title, items }: { title: string; items: string[] }) {
  return (
    <section className="rounded-lg border border-slate-200 bg-white p-4">
      <h2 className="text-sm font-black text-[#0b2447]">{title}</h2>
      <ul className="mt-3 space-y-2 text-xs leading-5 text-slate-600">
        {items.map(item => <li key={item} className="rounded-md bg-slate-50 px-3 py-2">{item}</li>)}
      </ul>
    </section>
  );
}

function InfoMini({ icon, label, value }: { icon: React.ReactNode; label: string; value: string }) {
  return <div className="rounded-md bg-white p-3"><p className="flex items-center gap-2 text-[10px] font-black uppercase tracking-wider text-slate-400">{icon}{label}</p><p className="mt-1 text-xs font-semibold text-slate-700">{value}</p></div>;
}
