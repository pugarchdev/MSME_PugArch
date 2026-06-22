'use client';

import React, { useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import {
  BadgeCheck,
  ClipboardCheck,
  Download,
  Eye,
  FileText,
  Filter,
  Gavel,
  ListChecks,
  MessageSquareText,
  Search,
  ShieldCheck,
  Trophy,
  Users,
  X,
  XCircle,
} from 'lucide-react';
import { toast } from 'sonner';
import { useAuth } from '../../../hooks/useAuth';
import {
  PageShell,
  ProcurementEmptyState,
  ProcurementErrorState,
  ProcurementHero,
  ProcurementLoadingState,
  ResultsTable,
  StatusBadge,
} from '../components';
import { formatDate, money, type ProcurementBid, type ProcurementBidAward, type ProcurementBidParticipation } from '../data';
import { procurementBidApi } from '../api';

type FilterState = {
  search: string;
  status: string;
  approvalStatus: string;
  category: string;
  buyerType: string;
  procurementType: string;
  dateFrom: string;
  dateTo: string;
  location: string;
};

type EvaluationDraft = Record<number, { status: 'QUALIFIED' | 'DISQUALIFIED' | ''; remarks: string; score: string }>;

type ProcurementIntakeRecord = {
  id: number;
  requirementNumber?: string;
  title: string;
  methodSlug?: string;
  procurementMethod?: string;
  status?: string;
  estimatedValue?: number;
  updatedAt?: string;
  payload?: {
    documents?: Array<{
      id?: string;
      name?: string;
      label?: string;
      requirement?: string;
      fileName?: string;
      fileAssetId?: number | null;
      documentUrl?: string;
    }>;
  };
  buyer?: { name?: string; organization?: { organizationName?: string } | null };
  organization?: { organizationName?: string } | null;
};

const initialFilters: FilterState = {
  search: '',
  status: '',
  approvalStatus: '',
  category: '',
  buyerType: '',
  procurementType: '',
  dateFrom: '',
  dateTo: '',
  location: '',
};

const rankLabel = (rank?: number | null) => {
  if (rank === 1) return 'L1';
  if (rank === 2) return 'L2';
  if (rank === 3) return 'L3';
  if (rank === 4) return 'L4';
  return rank ? `L${rank}` : 'Pending';
};

const readable = (value?: string | null) => (value ? value.replace(/_/g, ' ').toLowerCase().replace(/\b\w/g, c => c.toUpperCase()) : 'Pending');
const isAdminRole = (role?: string) => role === 'admin' || role === 'master_admin';

const unique = (values: Array<string | undefined>) => Array.from(new Set(values.filter(Boolean) as string[])).sort();

const sortedRanking = (participants: ProcurementBidParticipation[]) =>
  [...participants]
    .filter(participant => participant.financialStatus === 'OPENED' || participant.financialStatus === 'EVALUATED' || participant.rank)
    .sort((a, b) => {
      const rankA = a.rank || 999;
      const rankB = b.rank || 999;
      if (rankA !== rankB) return rankA - rankB;
      return (Number(a.totalAmount) || Number.MAX_SAFE_INTEGER) - (Number(b.totalAmount) || Number.MAX_SAFE_INTEGER);
    });

export default function AdminBidManagementPage() {
  const { user } = useAuth();
  const [bids, setBids] = useState<ProcurementBid[]>([]);
  const [intakeRecords, setIntakeRecords] = useState<ProcurementIntakeRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [filters, setFilters] = useState<FilterState>(initialFilters);
  const [selectedBid, setSelectedBid] = useState<ProcurementBid | null>(null);
  const [participants, setParticipants] = useState<ProcurementBidParticipation[]>([]);
  const [auditLogs, setAuditLogs] = useState<any[]>([]);
  const [detailLoading, setDetailLoading] = useState(false);
  const [rejectReason, setRejectReason] = useState('');
  const [awardRemarks, setAwardRemarks] = useState('');
  const [selectedAwardId, setSelectedAwardId] = useState('');
  const [recommendationParticipantId, setRecommendationParticipantId] = useState('');
  const [recommendationReason, setRecommendationReason] = useState('');
  const [technicalDraft, setTechnicalDraft] = useState<EvaluationDraft>({});
  const [updatingIntakeId, setUpdatingIntakeId] = useState<number | null>(null);

  const load = () => {
    setLoading(true);
    setError('');
    Promise.all([
      procurementBidApi.getAdminBids(),
      procurementBidApi.getAdminProcurementIntake().catch(() => []),
    ])
      .then(([rows, intake]) => {
        setBids(rows);
        setIntakeRecords(intake);
      })
      .catch((err: any) => {
        setBids([]);
        setIntakeRecords([]);
        setError(err?.message || 'Unable to load admin bids right now.');
      })
      .finally(() => setLoading(false));
  };

  useEffect(() => { load(); }, []);

  const refreshSelectedBid = async (bid: ProcurementBid) => {
    setDetailLoading(true);
    setSelectedBid(bid);
    try {
      const [freshParticipants, freshLogs] = await Promise.all([
        procurementBidApi.getAdminBidParticipants(bid.id),
        procurementBidApi.getBidAuditLogs(bid.id),
      ]);
      setParticipants(freshParticipants);
      setAuditLogs(freshLogs || []);
      setTechnicalDraft(Object.fromEntries(
        freshParticipants.map(participant => [
          participant.id,
          {
            status: participant.technicalStatus === 'QUALIFIED' || participant.technicalStatus === 'DISQUALIFIED'
              ? participant.technicalStatus
              : '',
            remarks: participant.evaluations?.[0]?.remarks || participant.rejectionReason || '',
            score: participant.evaluations?.[0]?.score != null ? String(participant.evaluations[0].score) : '',
          },
        ])
      ));
    } catch (err: any) {
      toast.error(err?.message || 'Unable to load bid participants.');
      setParticipants(bid.participations || []);
      setAuditLogs([]);
    } finally {
      setDetailLoading(false);
    }
  };

  const approve = async (id: string) => {
    try {
      await procurementBidApi.approveBid(id);
      toast.success('Bid approved for publication.');
      load();
    } catch (err: any) {
      toast.error(err?.message || 'Unable to approve bid.');
    }
  };

  const reject = async (id: string, reason = rejectReason) => {
    if (!reason.trim()) {
      toast.error('Add a rejection reason before rejecting the bid.');
      return;
    }
    try {
      await procurementBidApi.rejectBid(id, reason.trim());
      toast.success('Bid rejected with reason.');
      setRejectReason('');
      setSelectedBid(null);
      load();
    } catch (err: any) {
      toast.error(err?.message || 'Unable to reject bid.');
    }
  };

  const updateIntakeStatus = async (record: ProcurementIntakeRecord, status: 'APPROVED' | 'REJECTED') => {
    setUpdatingIntakeId(record.id);
    try {
      await procurementBidApi.updateProcurementIntakeStatus(record.id, status);
      toast.success(status === 'APPROVED' ? 'Procurement intake approved.' : 'Procurement intake rejected.');
      load();
    } catch (err: any) {
      toast.error(err?.message || 'Unable to update procurement intake.');
    } finally {
      setUpdatingIntakeId(null);
    }
  };

  const saveTechnicalEvaluation = async () => {
    if (!selectedBid) return;
    const evaluations = Object.entries(technicalDraft)
      .map(([participationId, draft]) => ({
        participationId: Number(participationId),
        status: draft.status as 'QUALIFIED' | 'DISQUALIFIED',
        remarks: draft.remarks.trim(),
        score: draft.score ? Number(draft.score) : undefined,
      }))
      .filter(row => row.status);
    const missingReason = evaluations.some(row => row.status === 'DISQUALIFIED' && !row.remarks);
    if (!evaluations.length) {
      toast.error('Select at least one technical decision.');
      return;
    }
    if (missingReason) {
      toast.error('Disqualification requires private remarks.');
      return;
    }
    try {
      await procurementBidApi.submitTechnicalEvaluation(selectedBid.id, { evaluations });
      toast.success('Technical evaluation saved.');
      await refreshSelectedBid(selectedBid);
      load();
    } catch (err: any) {
      toast.error(err?.message || 'Unable to save technical evaluation. Buyer ownership may be required by the backend.');
    }
  };

  const completeTechnicalEvaluation = async () => {
    if (!selectedBid) return;
    const unresolved = participants.some(participant => !['QUALIFIED', 'DISQUALIFIED'].includes(String(participant.technicalStatus)));
    if (unresolved) {
      toast.error('All participants must be qualified or disqualified before completion.');
      return;
    }
    try {
      await procurementBidApi.completeTechnicalEvaluation(selectedBid.id);
      toast.success('Technical evaluation completed.');
      await refreshSelectedBid(selectedBid);
      load();
    } catch (err: any) {
      toast.error(err?.message || 'Unable to complete technical evaluation. Backend may require buyer ownership.');
    }
  };

  const openFinancialEvaluation = async () => {
    if (!selectedBid) return;
    try {
      await procurementBidApi.openFinancialEvaluation(selectedBid.id);
      toast.success('Financial evaluation opened and ranking generated.');
      await refreshSelectedBid(selectedBid);
      load();
    } catch (err: any) {
      toast.error(err?.message || 'Unable to open financial evaluation. Backend may require buyer ownership.');
    }
  };

  const recommendAward = async () => {
    if (!selectedBid || !recommendationParticipantId) {
      toast.error('Select a ranked seller before recommending award.');
      return;
    }
    const selectedParticipant = participants.find(participant => String(participant.id) === recommendationParticipantId);
    const isNonL1 = selectedParticipant?.rank && selectedParticipant.rank !== 1;
    if (isNonL1 && recommendationReason.trim().length < 10) {
      toast.error('Non-L1 recommendation requires a strong audited reason.');
      return;
    }
    try {
      await procurementBidApi.recommendAward(selectedBid.id, {
        participationId: Number(recommendationParticipantId),
        remarks: recommendationReason.trim() || undefined,
        adminOverrideReason: isNonL1 ? recommendationReason.trim() : undefined,
      });
      toast.success('Award recommendation submitted for final approval.');
      setRecommendationParticipantId('');
      setRecommendationReason('');
      await refreshSelectedBid(selectedBid);
      load();
    } catch (err: any) {
      toast.error(err?.message || 'Unable to submit award recommendation.');
    }
  };

  const approveFinalAward = async () => {
    if (!selectedBid) return;
    try {
      await procurementBidApi.approveFinalAward(selectedBid.id, {
        awardId: selectedAwardId ? Number(selectedAwardId) : undefined,
        remarks: awardRemarks.trim() || undefined,
      });
      toast.success('Final award approved.');
      setAwardRemarks('');
      setSelectedAwardId('');
      setSelectedBid(null);
      load();
    } catch (err: any) {
      toast.error(err?.message || 'Unable to approve final award. A buyer recommendation may be required first.');
    }
  };

  const exportReport = async (bid?: ProcurementBid) => {
    try {
      await procurementBidApi.getProcurementReports();
    } catch {
      // The CSV below still exports the records visible to the admin.
    }
    const rows = (bid ? [bid] : filteredBids).map(item => ({
      bidNumber: item.id,
      title: item.title,
      buyer: item.buyerName,
      buyerType: item.buyerType,
      category: item.category,
      procurementType: item.procurementType || item.bidType,
      status: item.status,
      approvalStatus: item.approvalStatus || 'Pending',
      lifecycleStage: item.currentStage,
      participants: item.participantsCount || item.results.length,
    }));
    const csv = [
      Object.keys(rows[0] || { bidNumber: '', title: '', buyer: '' }).join(','),
      ...rows.map(row => Object.values(row).map(value => `"${String(value).replace(/"/g, '""')}"`).join(',')),
    ].join('\n');
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = bid ? `${bid.id}-procurement-report.csv` : 'jsgsmile-procurement-report.csv';
    link.click();
    URL.revokeObjectURL(url);
  };

  const options = useMemo(() => ({
    statuses: unique(bids.map(bid => bid.status)),
    approvals: unique(bids.map(bid => bid.approvalStatus)),
    categories: unique(bids.map(bid => bid.category)),
    buyerTypes: unique(bids.map(bid => bid.buyerType)),
    procurementTypes: unique(bids.map(bid => bid.procurementType || bid.bidType)),
  }), [bids]);

  const filteredBids = useMemo(() => bids.filter(bid => {
    const haystack = `${bid.id} ${bid.title} ${bid.buyerName}`.toLowerCase();
    const startsAfter = !filters.dateFrom || bid.startDate >= filters.dateFrom;
    const endsBefore = !filters.dateTo || bid.endDate <= filters.dateTo;
    return (
      (!filters.search || haystack.includes(filters.search.toLowerCase())) &&
      (!filters.status || bid.status === filters.status) &&
      (!filters.approvalStatus || bid.approvalStatus === filters.approvalStatus) &&
      (!filters.category || bid.category === filters.category) &&
      (!filters.buyerType || bid.buyerType === filters.buyerType) &&
      (!filters.procurementType || (bid.procurementType || bid.bidType) === filters.procurementType) &&
      (!filters.location || bid.location.toLowerCase().includes(filters.location.toLowerCase())) &&
      startsAfter &&
      endsBefore
    );
  }), [bids, filters]);

  const summary = useMemo(() => {
    const pendingApproval = bids.filter(bid => bid.approvalStatus === 'PENDING_APPROVAL' || bid.approvalStatus === 'SUBMITTED').length;
    const totalParticipants = bids.reduce((sum, bid) => sum + (bid.participantsCount || bid.results.length), 0);
    return [
      { label: 'Total bids', value: bids.length, icon: FileText },
      { label: 'Pending approval', value: pendingApproval, icon: ShieldCheck },
      { label: 'Approved/open', value: bids.filter(bid => bid.status === 'Open').length, icon: BadgeCheck },
      { label: 'Closed bids', value: bids.filter(bid => bid.status === 'Closed').length, icon: XCircle },
      { label: 'Technical eval pending', value: bids.filter(bid => bid.currentStage === 'Technical Evaluation').length, icon: ClipboardCheck },
      { label: 'Financial eval pending', value: bids.filter(bid => bid.currentStage === 'Financial Evaluation').length, icon: ListChecks },
      { label: 'Award recommended', value: bids.filter(bid => (bid.awards || []).some(award => award.status === 'RECOMMENDED')).length, icon: Trophy },
      { label: 'Awarded bids', value: bids.filter(bid => bid.status === 'Awarded').length, icon: Gavel },
      { label: 'Cancelled/expired', value: bids.filter(bid => ['CANCELLED', 'EXPIRED'].includes(String(bid.lifecycleStage))).length, icon: X },
      { label: 'Participating sellers', value: totalParticipants, icon: Users },
      { label: 'Create Procurement intake', value: intakeRecords.length, icon: ClipboardCheck },
    ];
  }, [bids, intakeRecords.length]);

  const selectedRanking = sortedRanking(participants);
  const selectedAwards = participants.flatMap(participant =>
    (participant.awards || []).map((award: ProcurementBidAward) => ({
      ...award,
      participationId: award.participationId || participant.id,
      sellerName: participant.seller?.name || participant.participationNumber || `Seller ${participant.id}`,
    }))
  );

  const canViewAdmin = isAdminRole(user?.role);

  return (
    <PageShell>
      <main className="mx-auto w-full max-w-7xl px-4 py-5">
        <ProcurementHero
          title="Admin Bid Management"
          subtitle="Control approval, participant review, technical evaluation, financial ranking, and final award approval for JsgSmile procurement bids."
          action={<button onClick={() => exportReport()} className="inline-flex h-10 items-center gap-2 rounded-md bg-[#0b2447] px-4 text-xs font-black text-white"><Download className="h-4 w-4" /> Export report</button>}
        />

        {!canViewAdmin && (
          <div className="mt-5">
            <ProcurementErrorState message="Admin access is required for bid management." onRetry={load} />
          </div>
        )}

        {canViewAdmin && (
          <>
            <div className="mt-5 grid gap-3 sm:grid-cols-2 lg:grid-cols-5">
              {summary.map(item => {
                const Icon = item.icon;
                return (
                  <div key={item.label} className="rounded-lg border border-slate-200 bg-white p-4 shadow-sm">
                    <div className="flex items-start justify-between gap-3">
                      <p className="text-[11px] font-black uppercase tracking-wide text-slate-500">{item.label}</p>
                      <Icon className="h-4 w-4 text-[#0b2447]" />
                    </div>
                    <p className="mt-3 text-2xl font-black text-[#0b2447]">{item.value}</p>
                  </div>
                );
              })}
            </div>

            {intakeRecords.length > 0 && (
              <section className="mt-5 rounded-lg border border-amber-200 bg-amber-50/40 p-4">
                <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
                  <div>
                    <h2 className="text-base font-black text-[#0b2447]">Create Procurement Intake</h2>
                    <p className="text-xs font-semibold text-slate-600">Buyer procurements submitted from the new method-first wizard before they become published seller-facing bids.</p>
                  </div>
                  <span className="inline-flex h-9 items-center justify-center rounded-md border border-amber-200 bg-white px-3 text-xs font-black text-[#0b2447]">
                    {intakeRecords.length} intake record(s)
                  </span>
                </div>
                <div className="mt-4 overflow-x-auto rounded-md border border-amber-100 bg-white">
                  <table className="min-w-[1080px] w-full text-left text-xs">
                    <thead className="bg-amber-50 text-[10px] font-black uppercase tracking-wider text-amber-800">
                      <tr>
                        {['Reference', 'Title', 'Method', 'Buyer', 'Status', 'Documents', 'Value', 'Updated', 'Actions'].map(head => <th key={head} className="px-3 py-2">{head}</th>)}
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100">
                      {intakeRecords.slice(0, 8).map(record => {
                        const docs = record.payload?.documents?.filter(document => document.fileName || document.fileAssetId || document.documentUrl) || [];
                        const isUpdating = updatingIntakeId === record.id;
                        const canAct = !['APPROVED', 'REJECTED', 'PUBLISHED', 'OPEN'].includes(String(record.status || '').toUpperCase());
                        return (
                          <tr key={record.id} className="align-top">
                            <td className="px-3 py-2 font-black text-[#0b2447]">{record.requirementNumber || `REQ-${record.id}`}</td>
                            <td className="px-3 py-2 font-bold text-slate-900">{record.title}</td>
                            <td className="px-3 py-2 font-semibold text-slate-600">{readable(record.methodSlug || record.procurementMethod)}</td>
                            <td className="px-3 py-2 font-semibold text-slate-600">{record.organization?.organizationName || record.buyer?.organization?.organizationName || record.buyer?.name || 'Buyer'}</td>
                            <td className="px-3 py-2"><StatusBadge label={readable(record.status)} /></td>
                            <td className="px-3 py-2">
                              {docs.length ? (
                                <div className="space-y-1">
                                  {docs.slice(0, 3).map(document => (
                                    <p key={document.id || document.fileName || document.fileAssetId} className="max-w-[180px] truncate font-semibold text-slate-600">
                                      {document.name || document.label || 'Document'}: {document.fileName || `Asset #${document.fileAssetId}`}
                                    </p>
                                  ))}
                                  {docs.length > 3 && <p className="text-[10px] font-black text-slate-400">+{docs.length - 3} more</p>}
                                </div>
                              ) : (
                                <span className="font-semibold text-slate-400">No files</span>
                              )}
                            </td>
                            <td className="px-3 py-2 font-black text-slate-900">{money(Number(record.estimatedValue || 0))}</td>
                            <td className="px-3 py-2 font-semibold text-slate-500">{record.updatedAt ? formatDate(record.updatedAt) : '-'}</td>
                            <td className="px-3 py-2">
                              <div className="flex flex-wrap gap-2">
                                {canAct && (
                                  <>
                                    <button type="button" disabled={isUpdating} onClick={() => updateIntakeStatus(record, 'APPROVED')} className="inline-flex h-8 items-center rounded-md bg-emerald-600 px-3 text-[10px] font-black text-white disabled:opacity-60">Approve</button>
                                    <button type="button" disabled={isUpdating} onClick={() => updateIntakeStatus(record, 'REJECTED')} className="inline-flex h-8 items-center rounded-md bg-red-600 px-3 text-[10px] font-black text-white disabled:opacity-60">Reject</button>
                                  </>
                                )}
                                {!canAct && (
                                  <span className="inline-flex h-8 items-center rounded-md border border-slate-200 px-3 text-[10px] font-black text-slate-500">No action</span>
                                )}
                              </div>
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              </section>
            )}

            <section className="mt-5 rounded-lg border border-slate-200 bg-white p-4">
              <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
                <div>
                  <h2 className="text-base font-black text-[#0b2447]">Bid Control Register</h2>
                  <p className="text-xs text-slate-500">Live admin records only. No demo procurement bids are shown here.</p>
                </div>
                <span className="inline-flex items-center gap-2 text-xs font-black text-slate-600"><Filter className="h-4 w-4" /> {filteredBids.length} visible</span>
              </div>

              <div className="grid gap-3 border-b border-slate-100 pb-4 md:grid-cols-4">
                <label className="md:col-span-2">
                  <span className="text-[10px] font-black uppercase tracking-wide text-slate-500">Search</span>
                  <div className="mt-1 flex h-10 items-center gap-2 rounded-md border border-slate-200 px-3">
                    <Search className="h-4 w-4 text-slate-400" />
                    <input value={filters.search} onChange={event => setFilters({ ...filters, search: event.target.value })} className="w-full bg-transparent text-xs font-bold outline-none" placeholder="Bid number, title, buyer" />
                  </div>
                </label>
                {[
                  ['status', 'Bid status', options.statuses],
                  ['approvalStatus', 'Approval status', options.approvals.map(readable)],
                  ['category', 'Category', options.categories],
                  ['buyerType', 'Buyer type', options.buyerTypes],
                  ['procurementType', 'Procurement type', options.procurementTypes],
                ].map(([key, label, values]) => (
                  <label key={key as string}>
                    <span className="text-[10px] font-black uppercase tracking-wide text-slate-500">{label as string}</span>
                    <select
                      value={(filters as any)[key as string]}
                      onChange={event => setFilters({ ...filters, [key as string]: event.target.value })}
                      className="mt-1 h-10 w-full rounded-md border border-slate-200 bg-white px-3 text-xs font-bold text-slate-700"
                    >
                      <option value="">All</option>
                      {(values as string[]).map(value => <option key={value} value={key === 'approvalStatus' ? options.approvals.find(raw => readable(raw) === value) || value : value}>{value}</option>)}
                    </select>
                  </label>
                ))}
                <label>
                  <span className="text-[10px] font-black uppercase tracking-wide text-slate-500">Start date from</span>
                  <input type="date" value={filters.dateFrom} onChange={event => setFilters({ ...filters, dateFrom: event.target.value })} className="mt-1 h-10 w-full rounded-md border border-slate-200 px-3 text-xs font-bold" />
                </label>
                <label>
                  <span className="text-[10px] font-black uppercase tracking-wide text-slate-500">End date to</span>
                  <input type="date" value={filters.dateTo} onChange={event => setFilters({ ...filters, dateTo: event.target.value })} className="mt-1 h-10 w-full rounded-md border border-slate-200 px-3 text-xs font-bold" />
                </label>
                <label>
                  <span className="text-[10px] font-black uppercase tracking-wide text-slate-500">Location</span>
                  <input value={filters.location} onChange={event => setFilters({ ...filters, location: event.target.value })} className="mt-1 h-10 w-full rounded-md border border-slate-200 px-3 text-xs font-bold outline-none" placeholder="District/state" />
                </label>
                <div className="flex items-end">
                  <button onClick={() => setFilters(initialFilters)} className="h-10 w-full rounded-md border border-slate-200 text-xs font-black text-slate-700">Reset filters</button>
                </div>
              </div>

              {loading ? (
                <div className="mt-4"><ProcurementLoadingState message="Loading admin bid register..." /></div>
              ) : error ? (
                <div className="mt-4"><ProcurementErrorState message={error} onRetry={load} /></div>
              ) : !filteredBids.length ? (
                <div className="mt-4"><ProcurementEmptyState title="No admin bids match these filters." message="Change filters or wait for buyers to submit bids for approval." /></div>
              ) : (
                <div className="table-shell mt-4">
                  <div className="table-shell-scroller">
                    <table className="min-w-[1320px] w-full text-xs">
                      <thead className="bg-slate-50 text-[10px] uppercase tracking-wider text-slate-500">
                        <tr>{['Bid number', 'Title', 'Buyer organization', 'Buyer type', 'Category', 'Procurement type', 'Bid status', 'Approval', 'Start', 'End', 'Participants', 'Lifecycle', 'Actions'].map(head => <th key={head} className="px-4 py-3 font-black">{head}</th>)}</tr>
                      </thead>
                      <tbody className="divide-y divide-slate-100">
                        {filteredBids.map(bid => (
                          <tr key={bid.id} className="bg-white align-top hover:bg-slate-50">
                            <td className="px-4 py-3 font-black text-[#0b2447]">{bid.id}</td>
                            <td className="px-4 py-3 font-bold text-slate-800">{bid.title}</td>
                            <td className="px-4 py-3">{bid.buyerName}</td>
                            <td className="px-4 py-3">{bid.buyerType}</td>
                            <td className="px-4 py-3">{bid.category}</td>
                            <td className="px-4 py-3">{bid.procurementType || bid.bidType}</td>
                            <td className="px-4 py-3"><StatusBadge label={bid.status} /></td>
                            <td className="px-4 py-3"><StatusBadge label={readable(bid.approvalStatus)} /></td>
                            <td className="px-4 py-3">{formatDate(bid.startDate)}</td>
                            <td className="px-4 py-3">{formatDate(bid.endDate)}</td>
                            <td className="px-4 py-3 font-black">{bid.participantsCount || bid.results.length}</td>
                            <td className="px-4 py-3"><StatusBadge label={bid.currentStage} /></td>
                            <td className="px-4 py-3">
                              <div className="flex flex-wrap gap-2">
                                <button onClick={() => refreshSelectedBid(bid)} className="inline-flex h-8 items-center gap-1 rounded-md border border-slate-200 px-3 text-[10px] font-black text-slate-700"><Eye className="h-3.5 w-3.5" /> Review</button>
                                <button onClick={() => approve(bid.id)} className="inline-flex h-8 items-center gap-1 rounded-md bg-emerald-600 px-3 text-[10px] font-black text-white"><ShieldCheck className="h-3.5 w-3.5" /> Approve</button>
                                <button onClick={() => reject(bid.id, window.prompt('Reason for rejection') || '')} className="inline-flex h-8 items-center gap-1 rounded-md bg-red-600 px-3 text-[10px] font-black text-white"><XCircle className="h-3.5 w-3.5" /> Reject</button>
                                <Link href={`/bids/${bid.id}`} className="inline-flex h-8 items-center gap-1 rounded-md border border-slate-200 px-3 text-[10px] font-black text-slate-700">Details</Link>
                              </div>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>
              )}
            </section>
          </>
        )}
      </main>

      {selectedBid && (
        <div className="fixed inset-0 z-50 overflow-y-auto bg-slate-950/45 p-3">
          <div className="mx-auto my-4 w-full max-w-6xl rounded-lg bg-white shadow-2xl">
            <div className="sticky top-0 z-10 border-b border-slate-200 bg-white p-4">
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div>
                  <p className="text-[10px] font-black uppercase tracking-wide text-slate-400">{selectedBid.id}</p>
                  <h2 className="text-lg font-black text-[#0b2447]">{selectedBid.title}</h2>
                  <p className="mt-1 text-xs text-slate-500">{selectedBid.buyerName} • {selectedBid.category} • {selectedBid.location}</p>
                </div>
                <button onClick={() => setSelectedBid(null)} className="inline-flex h-9 w-9 items-center justify-center rounded-md border border-slate-200 text-slate-500"><X className="h-4 w-4" /></button>
              </div>
            </div>

            <div className="grid gap-4 p-4 lg:grid-cols-[1.2fr_0.8fr]">
              <section className="rounded-lg border border-slate-200 p-4">
                <div className="flex flex-wrap items-center justify-between gap-3">
                  <h3 className="text-sm font-black text-[#0b2447]">Bid Details and Buyer Documents</h3>
                  <button onClick={() => exportReport(selectedBid)} className="inline-flex h-8 items-center gap-2 rounded-md border border-slate-200 px-3 text-[10px] font-black"><Download className="h-3.5 w-3.5" /> Export bid</button>
                </div>
                <div className="mt-3 grid gap-3 text-xs sm:grid-cols-3">
                  <Info label="Approval status" value={readable(selectedBid.approvalStatus)} />
                  <Info label="Lifecycle stage" value={selectedBid.currentStage} />
                  <Info label="Estimated value" value={money(selectedBid.estimatedValue)} />
                  <Info label="Start date" value={formatDate(selectedBid.startDate)} />
                  <Info label="End date" value={formatDate(selectedBid.endDate)} />
                  <Info label="Procurement type" value={selectedBid.procurementType || selectedBid.bidType} />
                </div>
                <p className="mt-4 text-xs leading-5 text-slate-600">{selectedBid.description}</p>
                <div className="mt-4 grid gap-3 sm:grid-cols-2">
                  {(selectedBid.bidDocuments || []).length ? selectedBid.bidDocuments?.map(doc => (
                    <div key={doc.id} className="rounded-md border border-slate-200 p-3">
                      <p className="text-xs font-black text-slate-800">{doc.name}</p>
                      <p className="mt-1 text-[11px] text-slate-500">{doc.meta}</p>
                    </div>
                  )) : <ProcurementEmptyState title="No buyer documents attached." message="Uploaded tender/RFQ documents will appear here." />}
                </div>
              </section>

              <section className="rounded-lg border border-slate-200 p-4">
                <h3 className="text-sm font-black text-[#0b2447]">Admin Actions</h3>
                <div className="mt-3 grid gap-2">
                  <button onClick={() => approve(selectedBid.id)} className="h-10 rounded-md bg-emerald-600 text-xs font-black text-white">Approve bid</button>
                  <textarea value={rejectReason} onChange={event => setRejectReason(event.target.value)} className="min-h-20 rounded-md border border-slate-200 p-3 text-xs font-bold outline-none" placeholder="Reason required for rejection" />
                  <button onClick={() => reject(selectedBid.id)} className="h-10 rounded-md bg-red-600 text-xs font-black text-white">Reject with reason</button>
                </div>
              </section>

              <section className="rounded-lg border border-slate-200 p-4 lg:col-span-2">
                <div className="mb-3 flex flex-wrap items-center justify-between gap-3">
                  <h3 className="text-sm font-black text-[#0b2447]">Participant Review</h3>
                  <StatusBadge label={`${participants.length} sellers`} />
                </div>
                {detailLoading ? <ProcurementLoadingState message="Loading participant review..." /> : !participants.length ? <ProcurementEmptyState title="No participating sellers yet." message="Seller submissions will appear after participation starts." /> : (
                  <div className="table-shell">
                    <div className="table-shell-scroller">
                      <table className="min-w-[1180px] w-full text-xs">
                        <thead className="bg-slate-50 text-[10px] uppercase tracking-wider text-slate-500">
                          <tr>{['Participation', 'Seller', 'Verification', 'Submitted', 'Technical', 'Financial', 'Final', 'Rank', 'Documents'].map(head => <th key={head} className="px-4 py-3 font-black">{head}</th>)}</tr>
                        </thead>
                        <tbody className="divide-y divide-slate-100">
                          {participants.map(participant => (
                            <tr key={participant.id} className="align-top">
                              <td className="px-4 py-3 font-black text-[#0b2447]">{participant.participationNumber || participant.id}</td>
                              <td className="px-4 py-3">{participant.seller?.name || 'Seller'}</td>
                              <td className="px-4 py-3"><StatusBadge label={readable(participant.seller?.onboardingStatus || 'Verified')} /></td>
                              <td className="px-4 py-3">{participant.submittedAt ? new Date(participant.submittedAt).toLocaleString('en-IN') : readable(participant.submissionStatus)}</td>
                              <td className="px-4 py-3"><StatusBadge label={readable(participant.technicalStatus)} /></td>
                              <td className="px-4 py-3"><StatusBadge label={readable(participant.financialStatus)} /></td>
                              <td className="px-4 py-3"><StatusBadge label={readable(participant.finalStatus)} /></td>
                              <td className="px-4 py-3"><StatusBadge label={rankLabel(participant.rank)} /></td>
                              <td className="px-4 py-3">
                                <div className="space-y-1">
                                  {(participant.documents || []).map(doc => (
                                    <p key={doc.id} className="text-[11px] font-bold text-slate-600">{doc.documentCategory === 'FINANCIAL_QUOTE' && participant.financialStatus !== 'OPENED' ? 'Sealed financial quote' : doc.documentName || doc.fileName || doc.documentCategory}</p>
                                  ))}
                                  {!(participant.documents || []).length && <p className="text-[11px] text-slate-400">No documents</p>}
                                </div>
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  </div>
                )}
              </section>

              <section className="rounded-lg border border-slate-200 p-4">
                <div className="mb-3 flex items-center justify-between gap-3">
                  <h3 className="text-sm font-black text-[#0b2447]">Technical Evaluation</h3>
                  <ClipboardCheck className="h-4 w-4 text-[#0b2447]" />
                </div>
                <div className="space-y-3">
                  {participants.map(participant => (
                    <div key={participant.id} className="rounded-md border border-slate-200 p-3">
                      <div className="flex flex-wrap items-center justify-between gap-2">
                        <p className="text-xs font-black text-slate-800">{participant.seller?.name || participant.participationNumber}</p>
                        <StatusBadge label={readable(participant.technicalStatus)} />
                      </div>
                      <div className="mt-3 grid gap-2 sm:grid-cols-[150px_100px_1fr]">
                        <select value={technicalDraft[participant.id]?.status || ''} onChange={event => setTechnicalDraft({ ...technicalDraft, [participant.id]: { ...(technicalDraft[participant.id] || { remarks: '', score: '' }), status: event.target.value as any } })} className="h-9 rounded-md border border-slate-200 px-2 text-xs font-bold">
                          <option value="">Decision</option>
                          <option value="QUALIFIED">Qualified</option>
                          <option value="DISQUALIFIED">Disqualified</option>
                        </select>
                        <input value={technicalDraft[participant.id]?.score || ''} onChange={event => setTechnicalDraft({ ...technicalDraft, [participant.id]: { ...(technicalDraft[participant.id] || { status: '', remarks: '' }), score: event.target.value } })} className="h-9 rounded-md border border-slate-200 px-2 text-xs font-bold" placeholder="Score" />
                        <input value={technicalDraft[participant.id]?.remarks || ''} onChange={event => setTechnicalDraft({ ...technicalDraft, [participant.id]: { ...(technicalDraft[participant.id] || { status: '', score: '' }), remarks: event.target.value } })} className="h-9 rounded-md border border-slate-200 px-2 text-xs font-bold" placeholder="Private remarks" />
                      </div>
                    </div>
                  ))}
                </div>
                <div className="mt-3 flex flex-wrap gap-2">
                  <button onClick={saveTechnicalEvaluation} className="inline-flex h-9 items-center gap-2 rounded-md bg-[#0b2447] px-3 text-xs font-black text-white"><ClipboardCheck className="h-3.5 w-3.5" /> Save decisions</button>
                  <button onClick={completeTechnicalEvaluation} className="inline-flex h-9 items-center gap-2 rounded-md border border-slate-200 px-3 text-xs font-black text-slate-700"><BadgeCheck className="h-3.5 w-3.5" /> Complete technical</button>
                </div>
              </section>

              <section className="rounded-lg border border-slate-200 p-4">
                <div className="mb-3 flex items-center justify-between gap-3">
                  <h3 className="text-sm font-black text-[#0b2447]">Financial Evaluation and Award</h3>
                  <Trophy className="h-4 w-4 text-[#0b2447]" />
                </div>
                <div className="rounded-md border border-amber-200 bg-amber-50 p-3 text-xs font-bold leading-5 text-amber-800">
                  Financial quotes stay sealed until the backend opens financial evaluation. Admin can see financial data only when returned by the admin route.
                </div>
                <button onClick={openFinancialEvaluation} className="mt-3 h-9 w-full rounded-md bg-[#0b2447] text-xs font-black text-white">Open financial evaluation / generate ranking</button>
                <div className="mt-4">
                  {selectedRanking.length ? <ResultsTable rows={selectedRanking.map(participant => ({
                    participationId: participant.id,
                    sellerName: participant.seller?.name || participant.participationNumber || `Seller ${participant.id}`,
                    sellerType: participant.seller?.role || 'Seller',
                    offeredItem: participant.offeredItemDescription || selectedBid.title,
                    makeBrand: participant.makeBrand || 'As quoted',
                    model: participant.model || 'Standard',
                    technicalStatus: participant.technicalStatus === 'QUALIFIED' ? 'Qualified' : participant.technicalStatus === 'DISQUALIFIED' ? 'Disqualified' : 'Pending',
                    financialStatus: participant.financialStatus === 'OPENED' || participant.financialStatus === 'EVALUATED' ? 'Opened' : 'Pending',
                    totalPrice: Number(participant.totalAmount || participant.quotedAmount || 0),
                    finalRank: rankLabel(participant.rank) as any,
                    resultStatus: participant.finalStatus === 'AWARDED' ? 'Awarded' : participant.finalStatus === 'REJECTED' ? 'Rejected' : 'Responsive',
                  }))} /> : <ProcurementEmptyState title="No financial ranking available." message="L1/L2/L3/L4 ranking will appear after financial evaluation is opened." />}
                </div>
                <div className="mt-4 grid gap-2">
                  <label className="text-[10px] font-black uppercase tracking-wide text-slate-500">Recommended award</label>
                  <select value={recommendationParticipantId} onChange={event => setRecommendationParticipantId(event.target.value)} className="h-10 rounded-md border border-slate-200 px-3 text-xs font-bold">
                    <option value="">Select seller to recommend</option>
                    {selectedRanking.map(participant => <option key={participant.id} value={participant.id}>{participant.seller?.name || participant.participationNumber || `Seller ${participant.id}`} • {rankLabel(participant.rank)} • {participant.totalAmount ? money(Number(participant.totalAmount)) : 'Amount pending'}</option>)}
                  </select>
                  <textarea value={recommendationReason} onChange={event => setRecommendationReason(event.target.value)} className="min-h-20 rounded-md border border-slate-200 p-3 text-xs font-bold outline-none" placeholder="Recommendation reason. Required for non-L1 selection." />
                  <button onClick={recommendAward} className="h-10 rounded-md bg-[#0b2447] text-xs font-black text-white">Submit award recommendation</button>
                  <div className="h-px bg-slate-100" />
                  <label className="text-[10px] font-black uppercase tracking-wide text-slate-500">Final award approval</label>
                  <select value={selectedAwardId} onChange={event => setSelectedAwardId(event.target.value)} className="h-10 rounded-md border border-slate-200 px-3 text-xs font-bold">
                    <option value="">Use backend recommended award</option>
                    {selectedAwards.map(award => <option key={award.id || award.participationId} value={award.id || ''}>{award.sellerName} • {readable(award.status)}</option>)}
                  </select>
                  <textarea value={awardRemarks} onChange={event => setAwardRemarks(event.target.value)} className="min-h-20 rounded-md border border-slate-200 p-3 text-xs font-bold outline-none" placeholder="Final award approval remarks" />
                  <button onClick={approveFinalAward} className="h-10 rounded-md bg-emerald-600 text-xs font-black text-white">Approve final award</button>
                </div>
              </section>

              <section className="rounded-lg border border-slate-200 p-4 lg:col-span-2">
                <div className="mb-3 flex items-center gap-2">
                  <MessageSquareText className="h-4 w-4 text-[#0b2447]" />
                  <h3 className="text-sm font-black text-[#0b2447]">Audit Logs and Clarifications</h3>
                </div>
                <div className="grid gap-3 lg:grid-cols-2">
                  <div className="space-y-2">
                    {auditLogs.length ? auditLogs.map(log => (
                      <div key={log.id || `${log.action}-${log.createdAt}`} className="rounded-md border border-slate-200 p-3">
                        <p className="text-xs font-black text-slate-800">{readable(log.action)}</p>
                        <p className="mt-1 text-[11px] text-slate-500">{log.createdAt ? new Date(log.createdAt).toLocaleString('en-IN') : 'Time not available'} • {readable(log.role)}</p>
                      </div>
                    )) : <ProcurementEmptyState title="No audit logs returned." message="Approval, evaluation, and award activity will be listed here." />}
                  </div>
                  <div className="space-y-2">
                    {participants.flatMap(participant => participant.clarifications || []).length ? participants.flatMap(participant => participant.clarifications || []).map((clarification, index) => (
                      <div key={clarification.id || index} className="rounded-md border border-slate-200 p-3">
                        <p className="text-xs font-black text-slate-800">{clarification.requestNumber || readable(clarification.clarificationType)}</p>
                        <p className="mt-1 text-[11px] leading-5 text-slate-600">{clarification.question || 'Clarification question not returned.'}</p>
                        <StatusBadge label={readable(clarification.status)} />
                      </div>
                    )) : <ProcurementEmptyState title="No clarification history." message="Buyer clarification requests and seller responses will appear here." />}
                  </div>
                </div>
              </section>
            </div>
          </div>
        </div>
      )}

    </PageShell>
  );
}

function Info({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-md border border-slate-200 bg-slate-50 p-3">
      <p className="text-[10px] font-black uppercase tracking-wide text-slate-500">{label}</p>
      <p className="mt-1 text-xs font-black text-slate-800">{value}</p>
    </div>
  );
}
