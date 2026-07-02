'use client';

import React, { useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import {
  ArrowLeft, CalendarClock, ShieldCheck, FileText, Landmark,
  Gavel, CheckCircle2, AlertTriangle, HelpCircle, FileDown,
  Lock, ArrowRight, MessageSquare, ClipboardList, Info, FileUp, Loader2
} from 'lucide-react';
import { Button } from '../../../components/ui/button';
import { cn } from '../../../lib/utils';
import { procurementBidApi } from '../../procurementBid/api';
import type { ProcurementBid } from '../../procurementBid/data';
import { MethodBadge, ProcurementStatusBadge, BuyerTypeBadge } from '../../procurementWizard/components/SourcingWizardComponents';
import { toast } from 'sonner';

interface PageProps {
  id: string;
}

export default function SellerEventDetailPage({ id }: PageProps) {
  const router = useRouter();
  const [bid, setBid] = useState<ProcurementBid | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [activeTab, setActiveTab] = useState<'overview' | 'items' | 'documents' | 'clarifications' | 'packets'>('overview');
  const [termsAccepted, setTermsAccepted] = useState(false);
  const [submittingQuestion, setSubmittingQuestion] = useState(false);
  const [questionText, setQuestionText] = useState('');

  const loadData = React.useCallback(() => {
    setLoading(true);
    setError('');
    procurementBidApi.detail(id)
      .then(res => {
        setBid(res);
      })
      .catch(err => {
        setError(err.message || 'Failed to load opportunity details');
      })
      .finally(() => {
        setLoading(false);
      });
  }, [id]);

  useEffect(() => {
    loadData();
  }, [loadData]);

  // Is Two Packet Bid or RFP requiring technical qualification?
  const isTwoPacket = useMemo(() => {
    const method = String(bid?.procurementType || '').toUpperCase();
    return method.includes('TWO_PACKET') || method.includes('TWO PACKET') || method.includes('RFP') || method.includes('SEALED_TENDER');
  }, [bid]);

  // Is financial packet locked?
  const isFinancialLocked = useMemo(() => {
    if (!isTwoPacket) return false;
    // Lock if technical evaluation is not completed or seller has not submitted technical offer
    const isTechPassed = bid?.currentStage === 'Financial Evaluation' || bid?.currentStage === 'Qualified' || bid?.currentStage === 'Awarded';
    return !isTechPassed;
  }, [bid, isTwoPacket]);

  const handleAskQuestion = (e: React.FormEvent) => {
    e.preventDefault();
    if (!questionText.trim()) return;

    setSubmittingQuestion(true);
    // Simulate submission of clarification request
    setTimeout(() => {
      setSubmittingQuestion(false);
      toast.success('Your clarification request was submitted successfully.');
      setQuestionText('');
    }, 1000);
  };

  if (loading) {
    return (
      <div className="p-12 text-center space-y-3">
        <Loader2 className="h-8 w-8 animate-spin mx-auto text-[#12335f]" />
        <p className="text-xs font-bold text-slate-500">Fetching opportunity specifications...</p>
      </div>
    );
  }

  if (error || !bid) {
    return (
      <div className="p-12 text-center space-y-4">
        <AlertTriangle className="h-10 w-10 text-rose-500 mx-auto" />
        <p className="text-sm font-bold text-rose-600">{error || 'Opportunity details not found'}</p>
        <Button type="button" variant="outline" onClick={() => router.push('/seller/procurement/events')}>
          Back to Events List
        </Button>
      </div>
    );
  }

  const participationUrl = bid.sourceModel === 'TENDER' && bid.sourceId 
    ? `/seller/tenders/${bid.sourceId}/bid` 
    : `/bids/${bid.id}`;

  return (
    <div className="mx-auto max-w-7xl space-y-6 pb-16">
      {/* Back button & Title Header */}
      <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
        <button
          type="button"
          onClick={() => router.push('/seller/procurement/events')}
          className="flex items-center gap-1.5 text-xs font-bold text-slate-500 hover:text-slate-900 transition"
        >
          <ArrowLeft className="h-4 w-4" /> Back to Opportunities
        </button>

        <div className="flex items-center gap-2">
          <Link href={participationUrl}>
            <Button type="button" className="bg-[#12335f] text-white hover:bg-[#12335f]/95 rounded-md font-bold text-xs uppercase tracking-wide">
              Participate / Submit Quote <ArrowRight className="ml-1.5 h-4 w-4" />
            </Button>
          </Link>
        </div>
      </div>

      {/* Main Banner Info */}
      <div className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm space-y-4">
        <div className="flex flex-wrap items-center gap-2">
          <span className="text-[10px] font-black uppercase text-slate-450">ID: {bid.id}</span>
          <MethodBadge method={bid.procurementType || 'Open Bid'} />
          <ProcurementStatusBadge status={bid.status} />
          {bid.buyerType && <BuyerTypeBadge buyerType={bid.buyerType} />}
        </div>

        <h1 className="text-xl font-black text-slate-950 tracking-tight leading-snug">{bid.title}</h1>

        <div className="grid gap-3 sm:grid-cols-2 md:grid-cols-4 pt-2 border-t border-slate-100 text-xs">
          <div>
            <p className="text-[10px] font-bold text-slate-400 uppercase tracking-wide">Buyer Organization</p>
            <p className="font-bold text-slate-800 mt-0.5">{bid.buyerName}</p>
          </div>
          <div>
            <p className="text-[10px] font-bold text-slate-400 uppercase tracking-wide">Submission Deadline</p>
            <p className="font-bold text-[#12335f] mt-0.5">
              {bid.endDate ? new Date(bid.endDate).toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' }) : 'Not set'}
            </p>
          </div>
          <div>
            <p className="text-[10px] font-bold text-slate-400 uppercase tracking-wide">Estimated Sourcing Value</p>
            <p className="font-bold text-slate-800 mt-0.5">
              {bid.estimatedValue ? `₹${bid.estimatedValue.toLocaleString('en-IN')}` : 'Value not shown'}
            </p>
          </div>
          <div>
            <p className="text-[10px] font-bold text-slate-400 uppercase tracking-wide">Submission Status</p>
            <p className="font-bold mt-0.5">
              {bid.participated ? (
                <span className="text-emerald-700">SUBMITTED</span>
              ) : (
                <span className="text-amber-600">PENDING PARTICIPATION</span>
              )}
            </p>
          </div>
        </div>
      </div>

      {/* Tabs Menu */}
      <div className="border-b border-slate-200">
        <div className="flex gap-4 overflow-x-auto">
          {[
            { id: 'overview', label: '1. Event Overview & Timeline' },
            { id: 'items', label: '2. Items & Technical Specs' },
            { id: 'documents', label: '3. Required Documents' },
            { id: 'clarifications', label: '4. Clarifications Board' },
            { id: 'packets', label: '5. Submission Packets' },
          ].map((tab) => (
            <button
              key={tab.id}
              type="button"
              onClick={() => setActiveTab(tab.id as any)}
              className={cn(
                "pb-2 text-xs font-black uppercase tracking-wider border-b-2 outline-none transition whitespace-nowrap",
                activeTab === tab.id
                  ? "border-[#12335f] text-[#12335f]"
                  : "border-transparent text-slate-400 hover:text-slate-650"
              )}
            >
              {tab.label}
            </button>
          ))}
        </div>
      </div>

      {/* Tabs Content */}
      <div className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm">
        {activeTab === 'overview' && (
          <div className="space-y-6">
            <div>
              <h3 className="text-sm font-black uppercase tracking-wider text-slate-900 border-b pb-1.5">Event Description</h3>
              <p className="text-xs font-semibold leading-relaxed text-slate-600 mt-2 whitespace-pre-wrap">{bid.description}</p>
            </div>

            <div className="grid gap-6 md:grid-cols-2">
              <div>
                <h3 className="text-sm font-black uppercase tracking-wider text-slate-900 border-b pb-1.5">Timeline Details</h3>
                <div className="space-y-2 mt-3 text-xs">
                  {bid.importantDates?.map((d) => (
                    <div key={d.label} className="flex justify-between border-b border-slate-50 pb-1.5 font-semibold">
                      <span className="text-slate-500">{d.label}</span>
                      <span className="text-slate-800 font-bold">{new Date(d.date).toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' })}</span>
                    </div>
                  ))}
                </div>
              </div>

              <div>
                <h3 className="text-sm font-black uppercase tracking-wider text-slate-900 border-b pb-1.5">Eligibility Criteria</h3>
                <ul className="space-y-2 mt-3 text-xs font-semibold text-slate-600">
                  {bid.eligibility && bid.eligibility.length > 0 ? (
                    bid.eligibility.map((criteria: string, idx: number) => (
                      <li key={idx} className="flex items-start gap-2">
                        <ShieldCheck className="h-4 w-4 text-[#12335f] shrink-0 mt-0.5" />
                        <span>{criteria}</span>
                      </li>
                    ))
                  ) : (
                    <>
                      <li className="flex items-start gap-2">
                        <ShieldCheck className="h-4 w-4 text-[#12335f] shrink-0 mt-0.5" />
                        <span>Valid GSTIN, PAN, and Udyam Registration certificate are mandatory.</span>
                      </li>
                      <li className="flex items-start gap-2">
                        <ShieldCheck className="h-4 w-4 text-[#12335f] shrink-0 mt-0.5" />
                        <span>OEM authorization letter is required for all branded supplies.</span>
                      </li>
                    </>
                  )}
                </ul>
              </div>
            </div>
          </div>
        )}

        {activeTab === 'items' && (
          <div className="space-y-4">
            <h3 className="text-sm font-black uppercase tracking-wider text-slate-900 border-b pb-1.5">Procurement Items & Technical Specs</h3>
            
            {bid.itemName === 'BOQ Based Bid' || String(bid.procurementType).toUpperCase().includes('BOQ') ? (
              <div className="rounded-lg border border-indigo-100 bg-indigo-50/50 p-4 space-y-3">
                <div className="flex gap-2 text-indigo-800">
                  <ClipboardList className="h-5 w-5 shrink-0" />
                  <div>
                    <h4 className="text-xs font-black uppercase tracking-wider">BOQ-Based Excel Sourcing</h4>
                    <p className="text-[11px] font-semibold mt-1">This is a spreadsheet-based BOQ bid. Sellers must download the buyer BOQ sheet, fill in individual rates, and upload the completed workbook.</p>
                  </div>
                </div>
                <div className="flex gap-2">
                  <Button type="button" variant="outline" size="sm" className="h-8 text-[10px] font-black uppercase bg-white border-indigo-200 text-indigo-700">
                    <FileDown className="mr-1 h-3.5 w-3.5" /> Download BOQ Template
                  </Button>
                </div>
              </div>
            ) : null}

            <div className="overflow-x-auto border rounded-lg">
              <table className="w-full text-left border-collapse text-xs">
                <thead>
                  <tr className="border-b bg-slate-50 text-[10px] font-extrabold uppercase text-slate-500">
                    <th className="px-4 py-2">Item Description / Technical Specifications</th>
                    <th className="px-4 py-2 text-right">Quantity</th>
                    <th className="px-4 py-2">Delivery Location</th>
                  </tr>
                </thead>
                <tbody className="divide-y font-semibold text-slate-650">
                  <tr>
                    <td className="px-4 py-3">
                      <p className="font-bold text-slate-800">{bid.itemName || 'Standard Procurement Line Item'}</p>
                      <p className="text-[10px] text-slate-500 mt-0.5">Specifications: All items supplied must match specifications defined by the buyer organization in the bid documents.</p>
                    </td>
                    <td className="px-4 py-3 text-right font-black text-slate-900">{bid.quantity || '1 Units'}</td>
                    <td className="px-4 py-3">{bid.deliveryLocation || 'Delivery location specified in order'}</td>
                  </tr>
                </tbody>
              </table>
            </div>
          </div>
        )}

        {activeTab === 'documents' && (
          <div className="space-y-4">
            <h3 className="text-sm font-black uppercase tracking-wider text-slate-900 border-b pb-1.5">Required Documents Checklist</h3>
            <p className="text-xs font-semibold text-slate-500">The following documents are requested by the buyer organization. Upload files directly in the participation wizard.</p>

            <div className="space-y-2 mt-2">
              {bid.requiredDocuments && bid.requiredDocuments.length > 0 ? (
                bid.requiredDocuments.map((doc: string, idx: number) => (
                  <div key={idx} className="flex items-center justify-between border rounded-lg p-3 text-xs font-bold text-slate-700 bg-slate-50">
                    <span className="flex items-center gap-2">
                      <FileText className="h-4 w-4 text-[#12335f]" />
                      {doc}
                    </span>
                    <span className="text-[9px] uppercase bg-amber-50 text-amber-800 px-1.5 py-0.5 border border-amber-200 rounded font-black">
                      PENDING WIZARD UPLOAD
                    </span>
                  </div>
                ))
              ) : (
                ['Technical Compliance Sheet', 'Udyam Registration Certificate', 'Commercial Offer Details'].map((doc, idx) => (
                  <div key={idx} className="flex items-center justify-between border rounded-lg p-3 text-xs font-bold text-slate-700 bg-slate-50">
                    <span className="flex items-center gap-2">
                      <FileText className="h-4 w-4 text-[#12335f]" />
                      {doc}
                    </span>
                    <span className="text-[9px] uppercase bg-amber-50 text-amber-800 px-1.5 py-0.5 border border-amber-200 rounded font-black">
                      PENDING WIZARD UPLOAD
                    </span>
                  </div>
                ))
              )}
            </div>
          </div>
        )}

        {activeTab === 'clarifications' && (
          <div className="space-y-6">
            <h3 className="text-sm font-black uppercase tracking-wider text-slate-900 border-b pb-1.5">Clarifications Board</h3>
            
            {/* Ask clarification question form */}
            <form onSubmit={handleAskQuestion} className="space-y-3 bg-slate-50 p-4 border rounded-lg">
              <label htmlFor="clarification-question" className="block text-xs font-black uppercase text-slate-700">Ask a Question / Seek Clarification</label>
              <textarea
                id="clarification-question"
                rows={3}
                value={questionText}
                onChange={e => setQuestionText(e.target.value)}
                placeholder="Type your question about technical specifications, timelines, or eligibility criteria..."
                className="w-full text-xs font-semibold p-2 border rounded-md outline-none focus:border-[#12335f]"
              />
              <div className="flex justify-end">
                <Button
                  type="submit"
                  disabled={submittingQuestion || !questionText.trim()}
                  className="bg-[#12335f] text-white hover:bg-[#12335f]/95 rounded-md h-8 text-[10px] font-black uppercase"
                >
                  {submittingQuestion ? 'Submitting Question...' : 'Submit Clarification Request'}
                </Button>
              </div>
            </form>

            {/* Questions list */}
            <div className="space-y-3">
              <h4 className="text-xs font-black uppercase text-slate-500">Clarification History</h4>
              
              {bid.clarifications && bid.clarifications.length > 0 ? (
                bid.clarifications.map((c: any, idx: number) => (
                  <div key={idx} className="border rounded-lg p-3 space-y-2 text-xs">
                    <div className="flex justify-between border-b pb-1">
                      <span className="font-black text-slate-800">Request #{c.requestNumber || idx + 1}</span>
                      <span className="text-[10px] font-bold text-slate-400">{c.requestedAt ? new Date(c.requestedAt).toLocaleDateString() : 'Recent'}</span>
                    </div>
                    <div>
                      <p className="font-bold text-slate-500 uppercase text-[9px]">Question</p>
                      <p className="font-semibold text-slate-700 mt-0.5">{c.description}</p>
                    </div>
                    <div>
                      <p className="font-bold text-slate-500 uppercase text-[9px]">Buyer Response</p>
                      <p className="font-bold text-[#12335f] mt-0.5">{c.sellerResponse}</p>
                    </div>
                  </div>
                ))
              ) : (
                <div className="text-center p-6 text-xs text-slate-400 font-semibold">
                  <MessageSquare className="h-6 w-6 mx-auto mb-1 text-slate-350" />
                  No clarification logs found for this event.
                </div>
              )}
            </div>
          </div>
        )}

        {activeTab === 'packets' && (
          <div className="space-y-6">
            <h3 className="text-sm font-black uppercase tracking-wider text-slate-900 border-b pb-1.5">Sourcing Response Packets</h3>

            {/* Technical Packet */}
            <div className="border rounded-lg p-4 space-y-3">
              <div className="flex items-center justify-between border-b pb-2">
                <h4 className="text-xs font-black uppercase text-slate-800 flex items-center gap-1.5">
                  <FileText className="h-4.5 w-4.5 text-[#12335f]" /> Technical Proposal Packet
                </h4>
                <span className="text-[9px] uppercase bg-indigo-50 text-indigo-800 border border-indigo-250 px-1.5 py-0.5 rounded font-black">
                  REQUIRED FOR TENDER/RFP
                </span>
              </div>
              <p className="text-xs font-semibold text-slate-500">Includes technical specifications compliance, certifications checklists, experience details, and product sheets.</p>
            </div>

            {/* Financial Packet */}
            <div className={cn("border rounded-lg p-4 space-y-3 relative", isFinancialLocked && "bg-slate-50/70 border-dashed")}>
              {isFinancialLocked && (
                <div className="absolute inset-0 bg-slate-50/50 flex flex-col items-center justify-center p-4 text-center rounded-lg">
                  <Lock className="h-6 w-6 text-slate-400" />
                  <p className="text-xs font-black text-slate-700 mt-2 uppercase tracking-wide">Financial Packet Locked</p>
                  <p className="text-[10px] text-slate-400 font-semibold max-w-sm mt-1">This is a two-packet bid. Financial packet remains locked and hidden until technical proposal qualification is approved.</p>
                </div>
              )}
              
              <div className="flex items-center justify-between border-b pb-2">
                <h4 className="text-xs font-black uppercase text-slate-800 flex items-center gap-1.5">
                  <Landmark className="h-4.5 w-4.5 text-[#12335f]" /> Financial Quote Packet
                </h4>
                <span className="text-[9px] uppercase bg-emerald-50 text-emerald-800 border border-emerald-250 px-1.5 py-0.5 rounded font-black">
                  COMMERCIAL OFFER
                </span>
              </div>
              <p className="text-xs font-semibold text-slate-500">Includes unit price, GST %, freight schedules, commercial discounts, and final landed cost calculations.</p>
            </div>

            {/* Terms & Final Submit Notice */}
            <div className="rounded-lg border border-slate-200 p-4 space-y-3 bg-slate-50">
              <label className="flex items-start gap-2.5 cursor-pointer">
                <input
                  type="checkbox"
                  checked={termsAccepted}
                  onChange={e => setTermsAccepted(e.target.checked)}
                  className="h-4 w-4 rounded border-slate-300 text-[#12335f] focus:ring-[#12335f] mt-0.5"
                />
                <span className="text-xs font-semibold text-slate-650 leading-relaxed">
                  We certify that we have reviewed all documents, specifications, timelines, and clarifications of this event and accept the terms and conditions outlined by the buyer organization.
                </span>
              </label>

              <div className="flex justify-end gap-2.5 pt-2 border-t">
                <Button type="button" variant="outline" onClick={() => router.push('/seller/procurement/events')} className="h-9 text-xs font-bold">
                  Cancel
                </Button>
                <Link href={participationUrl}>
                  <Button
                    type="button"
                    disabled={!termsAccepted}
                    className="bg-[#12335f] text-white hover:bg-[#12335f]/95 rounded-md h-9 text-xs font-bold uppercase tracking-wide"
                  >
                    Open Submission Wizard
                  </Button>
                </Link>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
