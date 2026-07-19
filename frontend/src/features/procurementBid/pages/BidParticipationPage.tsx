'use client';

import React, { useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import {
  AlertTriangle,
  ArrowRight,
  BadgeCheck,
  CalendarClock,
  CheckCircle2,
  Circle,
  ClipboardCheck,
  Eye,
  FileCheck2,
  FileText,
  FileUp,
  IndianRupee,
  Loader2,
  Lock,
  Unlock,
  RotateCcw,
  Send,
  ShieldCheck,
  Trash2,
} from 'lucide-react';
import { toast } from 'sonner';
import { DocumentPreviewModal } from '../../../components/DocumentPreviewModal';
import type { DocumentPreview } from '../../../lib/files';
import { getDocumentPreviewMode } from '../../../lib/files';
import { useAuth } from '../../../hooks/useAuth';
import {
  LifecycleTracker,
  PageShell,
  ProcurementEmptyState,
  ProcurementErrorState,
  ProcurementLoadingState,
  StatusBadge,
  getThemeForMethod,
  type ProcurementTheme,
} from '../components';
import { formatDate, money } from '../data';
import type { ProcurementBid } from '../data';
import { procurementBidApi } from '../api';

type ParticipationDocument = {
  id?: number;
  fileName?: string;
  documentName?: string;
  documentCategory?: string;
  mimeType?: string;
  fileSize?: number;
  uploadedAt?: string;
};

type ParticipationState = {
  id: number;
  submissionStatus?: string;
  technicalStatus?: string;
  financialStatus?: string;
  finalStatus?: string;
  rank?: number | null;
  documents?: ParticipationDocument[];
  quotedAmount?: number | null;
  totalAmount?: number | null;
  rejectionReason?: string;
};

type PendingFile = {
  id: string;
  file: File;
  progress: number;
  status: 'ready' | 'uploading' | 'uploaded' | 'error';
  error?: string;
  previewUrl: string;
  /** Which buyer-required document this file satisfies (defaults to the file name). */
  documentName?: string;
};

const steps = [
  'Technical Offer',
  'Upload Technical Documents',
  'Financial Quote',
  'Review & Declaration',
  'Submit Bid',
];

const isSellerVerified = (user: any) => {
  if (!user || user.role !== 'seller') return false;
  if (['approved_for_procurement', 'approved'].includes(String(user.onboardingStatus))) return true;
  if (user.organization?.verificationStatus === 'VERIFIED' && !user.organization?.isBlacklisted) return true;
  return Boolean(user.sellerProfile?.verificationStatusEnum === 'VERIFIED' || user.sellerProfile?.panVerified || user.sellerProfile?.isUdyamCertified);
};

const isBidClosed = (bid: ProcurementBid) => bid.status === 'Closed' || new Date(`${bid.endDate}T23:59:59`).getTime() < Date.now();

const daysLeft = (date: string) => {
  const days = Math.ceil((new Date(`${date}T23:59:59`).getTime() - Date.now()) / 86400000);
  if (days <= 0) return 'Closed';
  if (days === 1) return '1 day left';
  return `${days} days left`;
};

const formatBytes = (size?: number) => {
  if (!size) return 'Unknown size';
  if (size < 1024 * 1024) return `${Math.max(1, Math.round(size / 1024))} KB`;
  return `${(size / (1024 * 1024)).toFixed(1)} MB`;
};

const inputClass = 'h-10 w-full rounded-lg border border-slate-200 bg-slate-50/50 px-3 text-sm font-medium outline-none transition-all focus:border-[var(--bid-primary)] focus:bg-white focus:ring-4 focus:ring-[var(--bid-primary)]/10';
const textAreaClass = 'min-h-24 w-full rounded-lg border border-slate-200 bg-slate-50/50 px-3 py-2 text-sm font-medium outline-none transition-all focus:border-[var(--bid-primary)] focus:bg-white focus:ring-4 focus:ring-[var(--bid-primary)]/10';
const surfaceClass = 'rounded-2xl bg-white shadow-sm ring-1 ring-slate-100 transition-all duration-300 ease-out';
const panelClass = 'rounded-xl bg-slate-50/50 p-5 ring-1 ring-slate-100 transition-all duration-300 ease-out';

export default function BidParticipationPage() {
  const { user } = useAuth();
  const router = useRouter();
  const pathname = usePathname() || '';
  const bidId = pathname.split('/')[2];
  const [bid, setBid] = useState<ProcurementBid | null>(null);
  const [participation, setParticipation] = useState<ParticipationState | null>(null);
  const [step, setStep] = useState(2);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [starting, setStarting] = useState(false);
  const [uploadingTechnical, setUploadingTechnical] = useState(false);
  const [savingFinancial, setSavingFinancial] = useState(false);
  const [savingDraft, setSavingDraft] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [technicalFiles, setTechnicalFiles] = useState<PendingFile[]>([]);
  const [financialFile, setFinancialFile] = useState<PendingFile | null>(null);
  const [previewDocument, setPreviewDocument] = useState<DocumentPreview | null>(null);
  const [technicalOffer, setTechnicalOffer] = useState({
    makeBrand: '',
    model: '',
    offeredItemDescription: '',
    complianceRemarks: '',
    deliveryTimeline: '',
    warrantyDetails: '',
    serviceSupport: '',
    deviation: '',
  });
  const [quote, setQuote] = useState({ quotedAmount: '', gstPercentage: '18', totalAmount: '' });
  const [declaration, setDeclaration] = useState(false);
  const previewUrlsRef = React.useRef<string[]>([]);

  const [rfiAnswers, setRfiAnswers] = useState<Record<string, string>>({});
  const [rateContractData, setRateContractData] = useState({ validityDate: '', notes: '' });
  const [rfqData, setRfqData] = useState({ notes: '' });
  const [savingRfi, setSavingRfi] = useState(false);
  const stepContentRef = React.useRef<HTMLElement | null>(null);

  const goToStep = React.useCallback((nextStep: number) => {
    setStep(nextStep);
    window.requestAnimationFrame(() => {
      window.requestAnimationFrame(() => {
        stepContentRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' });
      });
    });
  }, []);


  const activeSteps = useMemo(() => {
    const list = [
      { id: 2, label: bid?.procurementType === 'RFI' ? 'Capability Answers' : 'Technical Offer' },
      { id: 3, label: 'Upload Technical Documents' },
      { id: 4, label: 'Financial Quote' },
      { id: 5, label: 'Review & Declaration' },
      { id: 6, label: 'Submit Bid' },
    ];
    if (bid?.procurementType === 'RFI') {
      return list.filter(item => item.id !== 4);
    }
    return list;
  }, [bid?.procurementType]);

  const questionnaire = useMemo(() => {
    const pkt = bid?.technicalPacket as any;
    return Array.isArray(pkt?.questionnaire) ? pkt.questionnaire : [];
  }, [bid?.technicalPacket]);

  const loadBid = React.useCallback(() => {
    let alive = true;
    setLoading(true);
    setError('');
    procurementBidApi.detail(bidId)
      .then(async data => {
        if (!alive) return;
        setBid(data);
        if (user?.role === 'seller') {
          try {
            const status = await procurementBidApi.getSellerBidStatus(data.id);
            if (!alive) return;
            if (status?.participation) {
              setParticipation(status.participation);
              if (status.participation.offeredItemDescription) {
                try {
                  const parsedDesc = JSON.parse(status.participation.offeredItemDescription);
                  if (parsedDesc?.rfiAnswers) {
                    setRfiAnswers(parsedDesc.rfiAnswers);
                  }
                  if (parsedDesc?.rateContractValidityDate) {
                    setRateContractData({
                      validityDate: parsedDesc.rateContractValidityDate,
                      notes: parsedDesc.rateContractNotes || '',
                    });
                  }
                  if (parsedDesc?.rfqNotes) {
                    setRfqData({
                      notes: parsedDesc.rfqNotes || '',
                    });
                  }
                  setTechnicalOffer({
                    makeBrand: status.participation.makeBrand || parsedDesc?.makeBrand || '',
                    model: status.participation.model || parsedDesc?.model || '',
                    offeredItemDescription: parsedDesc?.offeredItemDescription || (typeof parsedDesc === 'string' ? parsedDesc : ''),
                    complianceRemarks: parsedDesc?.complianceRemarks || '',
                    deliveryTimeline: parsedDesc?.deliveryTimeline || '',
                    warrantyDetails: parsedDesc?.warrantyDetails || '',
                    serviceSupport: parsedDesc?.serviceSupport || '',
                    deviation: parsedDesc?.deviation || '',
                  });
                } catch (e) {
                  setTechnicalOffer({
                    makeBrand: status.participation.makeBrand || '',
                    model: status.participation.model || '',
                    offeredItemDescription: status.participation.offeredItemDescription || '',
                    complianceRemarks: '',
                    deliveryTimeline: '',
                    warrantyDetails: '',
                    serviceSupport: '',
                    deviation: '',
                  });
                }
              } else {
                setTechnicalOffer({
                  makeBrand: status.participation.makeBrand || '',
                  model: status.participation.model || '',
                  offeredItemDescription: '',
                  complianceRemarks: '',
                  deliveryTimeline: '',
                  warrantyDetails: '',
                  serviceSupport: '',
                  deviation: '',
                });
              }
            }
          } catch {
          }
        }
      })
      .catch((err: any) => {
        if (!alive) return;
        setBid(null);
        setError(err?.message || 'Unable to load bid participation right now.');
      })
      .finally(() => { if (alive) setLoading(false); });
    return () => { alive = false; };
  }, [bidId, user?.role]);

  useEffect(() => {
    return loadBid();
  }, [loadBid]);

  useEffect(() => () => {
    previewUrlsRef.current.forEach(url => URL.revokeObjectURL(url));
  }, []);

  useEffect(() => {
    const quoted = Number(quote.quotedAmount || 0);
    const gst = Number(quote.gstPercentage || 0);
    if (!quoted) {
      setQuote(prev => prev.totalAmount ? { ...prev, totalAmount: '' } : prev);
      return;
    }
    const total = Math.round((quoted + quoted * gst / 100) * 100) / 100;
    setQuote(prev => prev.totalAmount === String(total) ? prev : { ...prev, totalAmount: String(total) });
  }, [quote.quotedAmount, quote.gstPercentage]);

  const theme = useMemo(() => getThemeForMethod(bid?.procurementType), [bid?.procurementType]);
  const verifiedSeller = isSellerVerified(user);
  const closed = bid ? isBidClosed(bid) : false;
  const uploadedDocs = participation?.documents || [];
  const uploadedTechnicalDocs = uploadedDocs.filter(doc => doc.documentCategory !== 'FINANCIAL_QUOTE');
  const uploadedFinancialDocs = uploadedDocs.filter(doc => doc.documentCategory === 'FINANCIAL_QUOTE');
  const isSubmitted = participation?.submissionStatus === 'SUBMITTED';

  const guard = useMemo(() => {
    if (!user) return { tone: 'amber', message: 'Please login as a verified seller/vendor to participate in this bid.', action: 'Login to Participate' };
    if (user.role !== 'seller') return { tone: 'red', message: 'Only verified sellers/vendors can participate in bids.' };
    if (!verifiedSeller) return { tone: 'amber', message: 'Complete your seller verification before participating in bids.' };
    if (bid?.approvalStatus === 'PENDING' || bid?.approvalStatus === 'DRAFT') {
      return { tone: 'amber', message: 'This bid is pending admin approval and is not yet open for participation.' };
    }
    if (closed) return { tone: 'red', message: 'This bid is closed. Participation is no longer allowed.' };
    return null;
  }, [closed, user, verifiedSeller, bid]);

  const canPrepare = Boolean(!guard && !closed && !isSubmitted);
  const canUpload = Boolean(participation?.id && canPrepare);
  const canSubmit = Boolean(participation?.id && uploadedTechnicalDocs.length && (bid?.procurementType === 'RFI' || uploadedFinancialDocs.length || participation?.quotedAmount) && declaration && !isSubmitted);
  const technicalOfferStarted = Object.values(technicalOffer).some(value => Boolean(String(value || '').trim()));
  const financialQuoteStarted = Boolean(quote.quotedAmount || uploadedFinancialDocs.length || participation?.quotedAmount);
  const activeStepIndex = Math.max(activeSteps.findIndex(item => item.id === step), 0);
  const navProgress = activeSteps.length > 0 ? Math.round(((activeStepIndex + 1) / activeSteps.length) * 100) : 0;
  const submitRequirements = [
    { ok: Boolean(participation?.id), label: participation?.id ? `Participation #${participation.id}` : 'Participation started' },
    { ok: uploadedTechnicalDocs.length > 0, label: `${uploadedTechnicalDocs.length} technical document(s)` },
    ...(bid?.procurementType === 'RFI' ? [] : [{ ok: Boolean(uploadedFinancialDocs.length || participation?.quotedAmount), label: 'Financial quote saved' }]),
    { ok: declaration, label: 'Declaration accepted' },
  ];
  const completedStepIds = new Set<number>([
    ...(technicalOfferStarted || Object.keys(rfiAnswers).length ? [2] : []),
    ...(uploadedTechnicalDocs.length || technicalFiles.length ? [3] : []),
    ...(financialQuoteStarted ? [4] : []),
    ...(declaration ? [5] : []),
    ...(isSubmitted ? [6] : []),
  ]);

  const openPreview = (item: PendingFile) => {
    setPreviewDocument({
      label: item.file.name,
      url: item.previewUrl,
      mode: getDocumentPreviewMode(item.previewUrl, item.file.type, item.file.name.split('.').pop() || ''),
    });
  };

  const addTechnicalFiles = (files: FileList | File[]) => {
    const next = Array.from(files).map(file => ({
      id: `${file.name}-${file.size}-${Date.now()}-${Math.random()}`,
      file,
      progress: 0,
      status: 'ready' as const,
      previewUrl: URL.createObjectURL(file),
    }));
    previewUrlsRef.current.push(...next.map(item => item.previewUrl));
    setTechnicalFiles(prev => [...prev, ...next]);
  };

  const addFinancialFile = (file?: File) => {
    if (!file) return;
    if (financialFile) URL.revokeObjectURL(financialFile.previewUrl);
    const previewUrl = URL.createObjectURL(file);
    previewUrlsRef.current.push(previewUrl);
    setFinancialFile({
      id: `${file.name}-${file.size}-${Date.now()}`,
      file,
      progress: 0,
      status: 'ready',
      previewUrl,
    });
  };

  const removeTechnicalFile = (id: string) => {
    setTechnicalFiles(prev => {
      const removed = prev.find(item => item.id === id);
      if (removed) URL.revokeObjectURL(removed.previewUrl);
      return prev.filter(item => item.id !== id);
    });
  };

  const uploadTechnical = async () => {
    if (!bid || !participation?.id || !technicalFiles.length) return;
    setUploadingTechnical(true);
    setTechnicalFiles(prev => prev.map(item => ({ ...item, status: 'uploading', progress: 0 })));
    try {
      const files = technicalFiles.map(item => ({ file: item.file, documentName: item.documentName }));
      const uploaded = await procurementBidApi.uploadTechnicalDocuments(
        bid.id,
        participation.id,
        files,
        { documentCategory: 'TECHNICAL_COMPLIANCE' },
        (fileIndex, percent) => {
          setTechnicalFiles(prev => prev.map((item, index) => index === fileIndex ? { ...item, progress: percent } : item));
        }
      );
      setTechnicalFiles(prev => prev.map(item => ({ ...item, status: 'uploaded', progress: 100 })));
      setParticipation(prev => ({
        ...(prev || participation),
        documents: [...(prev?.documents || []), ...uploaded],
      }));
      toast.success('Technical documents uploaded.');
      goToStep(bid?.procurementType === 'RFI' ? 5 : 4);
    } catch (err: any) {
      setTechnicalFiles(prev => prev.map(item => item.status === 'uploading' ? { ...item, status: 'error', error: err?.message || 'Upload failed' } : item));
      toast.error(err?.message || 'Technical document upload failed.');
    } finally {
      setUploadingTechnical(false);
    }
  };

  const saveRfiAnswers = async () => {
    if (!bid || !participation?.id) return;
    setSavingRfi(true);
    try {
      const data = await procurementBidApi.uploadFinancialQuote(
        bid.id,
        participation.id,
        {
          quotedAmount: '0',
          gstPercentage: '0',
          totalAmount: '0',
          offeredItemDescription: JSON.stringify({
            rfiAnswers
          })
        }
      );
      setParticipation(prev => ({
        ...(prev || participation),
        ...(data?.participation || {})
      }));
      toast.success('RFI questionnaire answers saved successfully.');
    } catch (err: any) {
      toast.error(err?.message || 'Failed to save RFI answers.');
    } finally {
      setSavingRfi(false);
    }
  };


  const saveDraft = async () => {
    if (!bid || !participation?.id) return;
    setSavingDraft(true);
    try {
      let description = '';
      if (bid.procurementType === 'RATE_CONTRACT') {
        description = JSON.stringify({
          rateContractValidityDate: rateContractData.validityDate,
          rateContractNotes: rateContractData.notes,
        });
      } else if (bid.procurementType === 'RFQ' || bid.procurementType === 'RFP' || bid.procurementType === 'TENDER' || bid.procurementType === 'OPEN_TENDER' || bid.procurementType === 'LIMITED_TENDER') {
        description = JSON.stringify({
          makeBrand: technicalOffer.makeBrand,
          model: technicalOffer.model,
          offeredItemDescription: technicalOffer.offeredItemDescription,
          complianceRemarks: technicalOffer.complianceRemarks,
          deliveryTimeline: technicalOffer.deliveryTimeline,
          warrantyDetails: technicalOffer.warrantyDetails,
          serviceSupport: technicalOffer.serviceSupport,
          deviation: technicalOffer.deviation,
          rfqNotes: rfqData.notes,
        });
      } else {
        description = technicalOffer.offeredItemDescription;
      }

      const data = await procurementBidApi.uploadFinancialQuote(
        bid.id,
        participation.id,
        {
          quotedAmount: quote.quotedAmount || '0',
          gstPercentage: quote.gstPercentage || '18',
          totalAmount: quote.totalAmount || '0',
          offeredItemDescription: description
        },
        undefined,
      );
      setParticipation(prev => ({
        ...(prev || participation),
        ...(data?.participation || {})
      }));
      toast.success('Draft saved successfully.');
    } catch (err: any) {
      toast.error(err?.message || 'Failed to save draft.');
    } finally {
      setSavingDraft(false);
    }
  };

  const saveFinancial = async () => {
    if (!bid || !participation?.id) return;
    if (!quote.quotedAmount) {
      toast.error('Enter quoted amount before saving financial quote.');
      return;
    }
    setSavingFinancial(true);
    if (financialFile) setFinancialFile(prev => prev ? { ...prev, status: 'uploading', progress: 0 } : prev);
    try {
      let description = '';
      if (bid.procurementType === 'RATE_CONTRACT') {
        description = JSON.stringify({
          rateContractValidityDate: rateContractData.validityDate,
          rateContractNotes: rateContractData.notes,
        });
      } else if (bid.procurementType === 'RFQ' || bid.procurementType === 'RFP' || bid.procurementType === 'TENDER' || bid.procurementType === 'OPEN_TENDER' || bid.procurementType === 'LIMITED_TENDER') {
        description = JSON.stringify({
          makeBrand: technicalOffer.makeBrand,
          model: technicalOffer.model,
          offeredItemDescription: technicalOffer.offeredItemDescription,
          complianceRemarks: technicalOffer.complianceRemarks,
          deliveryTimeline: technicalOffer.deliveryTimeline,
          warrantyDetails: technicalOffer.warrantyDetails,
          serviceSupport: technicalOffer.serviceSupport,
          deviation: technicalOffer.deviation,
          rfqNotes: rfqData.notes,
        });
      } else {
        description = technicalOffer.offeredItemDescription;
      }

      const data = await procurementBidApi.uploadFinancialQuote(
        bid.id,
        participation.id,
        {
          file: financialFile?.file,
          quotedAmount: quote.quotedAmount,
          gstPercentage: quote.gstPercentage,
          totalAmount: quote.totalAmount,
          makeBrand: technicalOffer.makeBrand,
          model: technicalOffer.model,
          offeredItemDescription: description,
        },
        percent => setFinancialFile(prev => prev ? { ...prev, progress: percent } : prev)
      );
      if (financialFile) setFinancialFile(prev => prev ? { ...prev, status: 'uploaded', progress: 100 } : prev);
      setParticipation(prev => ({
        ...(prev || participation),
        ...(data?.participation || {}),
        documents: [...(prev?.documents || []), ...(data?.document ? [data.document] : [])],
      }));
      toast.success('Financial quote saved securely.');
      goToStep(5);
    } catch (err: any) {
      setFinancialFile(prev => prev ? { ...prev, status: 'error', error: err?.message || 'Upload failed' } : prev);
      toast.error(err?.message || 'Unable to save financial quote.');
    } finally {
      setSavingFinancial(false);
    }
  };

  const submitFinal = async () => {
    if (!bid || !participation?.id || !canSubmit) return;
    setSubmitting(true);
    try {
      const submitted = await procurementBidApi.submitBidParticipation(bid.id, participation.id, { declaration });
      setParticipation(prev => ({ ...(prev || participation), ...submitted }));
      toast.success('Bid submitted successfully.');
    } catch (err: any) {
      toast.error(err?.message || 'Unable to submit bid.');
    } finally {
      setSubmitting(false);
    }
  };

  if (loading) {
    return (
      <PageShell>
        <main className="mx-auto w-full max-w-6xl animate-in fade-in duration-300">
          <div className="mt-5"><ProcurementLoadingState message="Loading bid participation..." /></div>
        </main>
      </PageShell>
    );
  }

  if (error) {
    return (
      <PageShell>
        <main className="mx-auto w-full max-w-6xl animate-in fade-in duration-300">
          <div className="mt-5"><ProcurementErrorState message={error} onRetry={loadBid} /></div>
        </main>
      </PageShell>
    );
  }

  if (!bid) {
    return (
      <PageShell>
        <main className="mx-auto w-full max-w-6xl animate-in fade-in duration-300">
          <div className="mt-5"><ProcurementEmptyState title="No bid available currently." message="This bid was not returned by the live backend." /></div>
        </main>
      </PageShell>
    );
  }

  return (
    <PageShell>
      <div style={{ '--bid-primary': theme.primary, '--bid-light': theme.lightBg === 'bg-blue-50' ? '#eff6ff' : theme.lightBg === 'bg-emerald-50' ? '#ecfdf5' : theme.lightBg === 'bg-amber-50' ? '#fffbeb' : theme.lightBg === 'bg-rose-50' ? '#fff1f2' : theme.lightBg === 'bg-violet-50' ? '#f5f3ff' : theme.lightBg === 'bg-teal-50' ? '#f0fdfa' : theme.lightBg === 'bg-indigo-50' ? '#eef2ff' : theme.lightBg === 'bg-sky-50' ? '#f0f9ff' : theme.lightBg === 'bg-orange-50' ? '#fff7ed' : theme.lightBg === 'bg-lime-50' ? '#f7fee7' : '#f1f5f9' } as React.CSSProperties}>
        <style dangerouslySetInnerHTML={{ __html: `
          html {
            scroll-behavior: smooth;
          }
          @keyframes bidStepFadeUp {
            from {
              opacity: 0;
              transform: translateY(10px);
            }
            to {
              opacity: 1;
              transform: translateY(0);
            }
          }
          .bid-step-body {
            animation: bidStepFadeUp 260ms ease-out both;
          }
          input:focus, textarea:focus {
            border-color: var(--bid-primary) !important;
            box-shadow: 0 0 0 2px var(--bid-light) !important;
          }
        ` }} />
      <main className="mx-auto w-full max-w-7xl scroll-smooth font-sans animate-in fade-in duration-500">
        {/* Sticky Top Summary & Stepper */}
        <div className="sticky top-0 z-40 border-b border-slate-200/60 bg-white/85 p-5 shadow-sm backdrop-blur-xl transition-all">
          <div className="mx-auto max-w-6xl">
            {/* Header Area */}
            <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
              <div className="min-w-0">
                <span className="inline-flex items-center gap-1.5 rounded-full border border-slate-200 bg-slate-50 px-2.5 py-1 text-[10px] font-semibold uppercase tracking-wider text-slate-500">
                  <ShieldCheck className="h-3.5 w-3.5" style={{ color: theme.primary }} />
                  Request for Proposal
                </span>
                <h1 className="mt-2 text-xl font-bold tracking-tight text-slate-900 sm:text-2xl">Seller Bid Participation</h1>
                <p className="mt-1 max-w-3xl truncate text-xs font-semibold text-slate-500 sm:text-sm" title={`${bid.id} - ${bid.title}`}>
                  <span className="font-mono text-slate-700">{bid.id}</span>
                  <span className="mx-2 text-slate-300">/</span>
                  {bid.title}
                </p>
              </div>
              <div className="flex shrink-0 items-center gap-3">
                <StatusBadge label={bid.status} />
                <Link
                  href={`/bids/${bid.id}`}
                  className="inline-flex h-9 items-center justify-center rounded-xl border border-slate-200 bg-white px-4 text-xs font-semibold text-slate-700 shadow-sm transition-all duration-200 hover:-translate-y-0.5 hover:bg-slate-50 hover:shadow-md"
                >
                  View bid details
                </Link>
              </div>
            </div>

            {/* Quick Summary Row */}
            <div className="mt-4 flex flex-wrap items-center gap-6 rounded-xl bg-slate-50/50 p-3 ring-1 ring-slate-100">
              <div className="flex items-center gap-2 text-xs">
                <span className="text-slate-500">Buyer:</span>
                <span className="font-semibold text-slate-900">{bid.buyerName}</span>
              </div>
              <div className="flex items-center gap-2 text-xs">
                <span className="text-slate-500">Value:</span>
                <span className="font-semibold text-slate-900">{money(bid.estimatedValue)}</span>
              </div>
              <div className="flex items-center gap-2 text-xs">
                <span className="text-slate-500">Closing:</span>
                <span className="font-semibold text-rose-700">{formatDate(bid.endDate)}</span>
              </div>
              <div className="flex items-center gap-2 text-xs">
                <span className="text-slate-500">Status:</span>
                <span className="font-semibold text-slate-900">{participation?.submissionStatus || 'Draft'}</span>
              </div>
            </div>

            {/* Modern Horizontal Stepper */}
            <div className="mt-6 flex items-center justify-between gap-1 overflow-x-auto pb-4 pt-2">
              {activeSteps.map((s, i) => {
                const active = step === s.id;
                const done = completedStepIds.has(s.id);
                return (
                  <div key={s.id} className="flex min-w-[150px] flex-1 items-center gap-1">
                    <button
                      type="button"
                      onClick={() => goToStep(s.id)}
                      className={`group relative flex flex-1 flex-col items-start gap-1.5 rounded-xl border px-4 py-3 text-left transition-all duration-300 ease-out hover:-translate-y-1 hover:scale-[1.02] hover:bg-white hover:shadow-md hover:border-slate-200 ${
                        active ? 'z-10 bg-white' : done ? 'border-slate-100 bg-slate-50/50' : 'border-transparent bg-transparent'
                      }`}
                      style={active ? { 
                        background: `linear-gradient(135deg, ${theme.primary}12 0%, white 100%)`, 
                        borderColor: `${theme.primary}40`,
                        boxShadow: `0 10px 25px -5px ${theme.primary}30, 0 8px 10px -6px ${theme.primary}10`
                      } : undefined}
                    >
                      {active && (
                        <span className="absolute -right-1 -top-1 flex h-3 w-3">
                          <span className="absolute inline-flex h-full w-full animate-ping rounded-full opacity-75" style={{ backgroundColor: theme.primary }} />
                          <span className="relative inline-flex h-3 w-3 rounded-full border border-white" style={{ backgroundColor: theme.primary }} />
                        </span>
                      )}
                      <span className="flex items-center gap-1.5 text-[10px] font-bold uppercase tracking-wider transition-colors duration-300" style={{ color: active || done ? theme.primary : '#94a3b8' }}>
                        {done ? (
                          <CheckCircle2 className="h-4 w-4 animate-in zoom-in duration-300" />
                        ) : (
                          <Circle className={`h-4 w-4 transition-all duration-500 ${active ? 'fill-current/20 scale-110' : ''}`} />
                        )}
                        Step {i + 1}
                      </span>
                      <span className={`text-xs transition-colors duration-300 ${active ? 'font-bold text-slate-900' : done ? 'font-semibold text-slate-700' : 'font-medium text-slate-500 group-hover:text-slate-700'}`}>
                        {s.label}
                      </span>
                    </button>
                    {i < activeSteps.length - 1 && (
                      <div className="hidden sm:block relative h-[2px] w-8 shrink-0 overflow-hidden rounded-full bg-slate-100">
                        <div 
                          className="absolute left-0 top-0 h-full rounded-full transition-all duration-700 ease-in-out" 
                          style={{ width: done ? '100%' : '0%', backgroundColor: theme.primary }} 
                        />
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          </div>
        </div>

        {/* Centered Form Area */}
        <div className="mx-auto mt-8 max-w-6xl px-4 pb-20">
          <section ref={stepContentRef} className={`${surfaceClass} overflow-hidden bg-white ring-1 ring-slate-200/60 shadow-lg shadow-slate-200/40 sm:rounded-[2rem]`}>
            {participation?.rejectionReason?.startsWith('REQUIRES_RESUBMISSION') && (
              <div className="m-6 rounded-2xl border border-amber-200 bg-amber-50/60 p-4 text-xs font-medium text-amber-900 shadow-sm animate-pulse flex items-start gap-3">
                <AlertTriangle className="h-5 w-5 text-amber-600 shrink-0 mt-0.5" />
                <div>
                  <h4 className="font-semibold uppercase tracking-wider text-amber-950">Revision/Resubmission Required</h4>
                  <p className="mt-1 leading-relaxed text-amber-800">
                    This procurement has been amended by the buyer (V{bid?.version || 2}). Your previously submitted offer is now in draft. Please review the updated terms/specifications, update your quote if necessary, and click **Submit Bid** again.
                  </p>
                </div>
              </div>
            )}
            <div key={step} className="bid-step-body p-6 sm:p-8">
              {step === 2 && (
                bid?.procurementType === 'RFI' ? (
                  <RfiQuestionnaireForm
                    questionnaire={questionnaire}
                    answers={rfiAnswers}
                    onChange={(qId, val) => setRfiAnswers(prev => ({ ...prev, [qId]: val }))}
                    onNext={() => goToStep(3)}
                    canEdit={canPrepare}
                    canSave={canUpload}
                    saving={savingRfi}
                    onSave={saveRfiAnswers}
                    onSaveDraft={saveDraft}
                    savingDraft={savingDraft}
                  />
                ) : (
                  <TechnicalOfferStep 
                    value={technicalOffer} 
                    onChange={setTechnicalOffer} 
                    onNext={() => goToStep(3)} 
                    disabled={!canPrepare} 
                    onSaveDraft={saveDraft}
                    savingDraft={savingDraft}
                  />
                )
              )}
              {step === 3 && (
                <TechnicalDocumentsStep
                  canSelectFiles={canPrepare}
                  canUpload={canUpload}
                  files={technicalFiles}
                  uploadedDocs={uploadedTechnicalDocs}
                  uploading={uploadingTechnical}
                  requiredDocuments={bid?.requiredDocuments || []}
                  onAdd={addTechnicalFiles}
                  onRemove={removeTechnicalFile}
                  onPreview={openPreview}
                  onUpload={uploadTechnical}
                  onNext={() => goToStep(bid?.procurementType === 'RFI' ? 5 : 4)}
                  onTag={(id, documentName) => setTechnicalFiles(prev => prev.map(item => item.id === id ? { ...item, documentName: documentName || undefined } : item))}
                  onSaveDraft={saveDraft}
                  savingDraft={savingDraft}
                />
              )}
              {step === 4 && (
                <FinancialQuoteStep
                  canEdit={canPrepare}
                  canSave={canUpload}
                  quote={quote}
                  setQuote={setQuote}
                  file={financialFile}
                  uploadedDocs={uploadedFinancialDocs}
                  saving={savingFinancial}
                  onFile={addFinancialFile}
                  onRemoveFile={() => { if (financialFile) URL.revokeObjectURL(financialFile.previewUrl); setFinancialFile(null); }}
                  onPreview={item => item && openPreview(item)}
                  onSave={saveFinancial}
                  onNext={() => goToStep(5)}
                  bid={bid}
                  participation={participation!}
                  rateContractData={rateContractData}
                  setRateContractData={setRateContractData}
                  rfqData={rfqData}
                  setRfqData={setRfqData}
                  onSaveDraft={saveDraft}
                  savingDraft={savingDraft}
                />
              )}
              {step === 5 && (
                <ReviewStep
                  bid={bid}
                  participation={participation}
                  technicalDocs={uploadedTechnicalDocs}
                  financialDocs={uploadedFinancialDocs}
                  declaration={declaration}
                  setDeclaration={setDeclaration}
                  onNext={() => goToStep(6)}
                  disabled={isSubmitted}
                  onSaveDraft={saveDraft}
                  savingDraft={savingDraft}
                />
              )}
              {step === 6 && (
                <SubmitStep canSubmit={canSubmit} submitted={isSubmitted} submitting={submitting} requirements={submitRequirements} onSubmit={submitFinal} />
              )}
            </div>
          </section>
        </div>
      </main>
      <DocumentPreviewModal previewDocument={previewDocument} onClose={() => setPreviewDocument(null)} />
      </div>
    </PageShell>
  );
}

function Info({ label, value, wide }: { label: string; value: React.ReactNode; wide?: boolean }) {
  return (
    <div className={`group min-w-0 flex flex-col gap-1.5 rounded-xl border border-slate-200 bg-white p-4 shadow-sm transition-all duration-300 hover:-translate-y-0.5 hover:border-slate-300 hover:shadow-md ${wide ? 'sm:col-span-2' : ''}`}>
      <p className="text-[10px] font-bold uppercase tracking-wider text-slate-500 transition-colors group-hover:text-slate-700">{label}</p>
      <div className="text-sm font-bold leading-relaxed text-slate-900">{value}</div>
    </div>
  );
}

function ReadyRow({ ok, label }: { ok: boolean; label: string }) {
  return (
    <div className={`flex items-center gap-2 rounded-lg px-2 py-1 transition-colors ${ok ? 'bg-emerald-50 text-emerald-800' : 'text-slate-500'}`}>
      {ok ? <CheckCircle2 className="h-4 w-4 text-emerald-600" /> : <Circle className="h-4 w-4 text-slate-300" />}
      <span>{label}</span>
    </div>
  );
}

function TechnicalOfferStep({ value, onChange, onNext, onSaveDraft, savingDraft, disabled }: { value: any; onChange: (next: any) => void; onNext: () => void; onSaveDraft: () => void; savingDraft: boolean; disabled: boolean }) {
  const update = (key: string, next: string) => onChange({ ...value, [key]: next });
  return (
    <div>
      <StepTitle icon={<BadgeCheck className="h-5 w-5" />} title="Technical Offer" subtitle="Enter product/service specifics that will be attached to your financial quote save." />
      <div className="mt-4 grid gap-6 md:grid-cols-2 lg:grid-cols-3">
        <Input label="Make/Brand" value={value.makeBrand} onChange={next => update('makeBrand', next)} disabled={disabled} />
        <Input label="Model" value={value.model} onChange={next => update('model', next)} disabled={disabled} />
        <Field label="Offered product/service description" value={value.offeredItemDescription} onChange={next => update('offeredItemDescription', next)} disabled={disabled} />
        <Field label="Technical compliance remarks" value={value.complianceRemarks} onChange={next => update('complianceRemarks', next)} disabled={disabled} />
        <Input label="Delivery timeline" value={value.deliveryTimeline} onChange={next => update('deliveryTimeline', next)} disabled={disabled} />
        <Input label="Warranty details" value={value.warrantyDetails} onChange={next => update('warrantyDetails', next)} disabled={disabled} />
        <Input label="Service support" value={value.serviceSupport} onChange={next => update('serviceSupport', next)} disabled={disabled} />
        <Input label="Deviation, if any" value={value.deviation} onChange={next => update('deviation', next)} disabled={disabled} />
      </div>
      <div className="sticky bottom-0 z-10 mt-6 flex justify-end gap-3 border-t border-slate-100 bg-white/90 p-4 backdrop-blur">
        {!disabled && (
          <button type="button" onClick={onSaveDraft} disabled={savingDraft} className="inline-flex h-10 items-center justify-center gap-2 rounded-xl border border-slate-200 bg-white px-4 text-xs font-semibold text-slate-700 shadow-sm transition-all duration-200 hover:-translate-y-0.5 hover:bg-slate-50 hover:shadow-md disabled:opacity-50 disabled:hover:translate-y-0">
            {savingDraft ? <Loader2 className="h-4 w-4 animate-spin" /> : <ClipboardCheck className="h-4 w-4" />} Save as Draft
          </button>
        )}
        <button onClick={onNext} className="inline-flex h-10 items-center justify-center gap-2 rounded-xl px-4 text-xs font-semibold text-white shadow-sm transition-all duration-200 hover:-translate-y-0.5 hover:shadow-md" style={{ backgroundColor: 'var(--bid-primary)' }}>
          Continue <ArrowRight className="h-3.5 w-3.5" />
        </button>
      </div>
    </div>
  );
}

function RfiQuestionnaireForm({
  questionnaire,
  answers,
  onChange,
  onNext,
  canEdit,
  canSave,
  saving,
  onSave,
  onSaveDraft,
  savingDraft
}: {
  questionnaire: Array<{ id: string; type: string; text: string; questionText?: string }>;
  answers: Record<string, string>;
  onChange: (questionId: string, value: string) => void;
  onNext: () => void;
  canEdit: boolean;
  canSave: boolean;
  saving: boolean;
  onSave: () => Promise<void>;
  onSaveDraft: () => void;
  savingDraft: boolean;
}) {
  return (
    <div>
      <StepTitle icon={<ClipboardCheck className="h-5 w-5" />} title="RFI Questionnaire" subtitle="Please provide detailed answers to the buyer's questionnaire." />
      {questionnaire.length === 0 ? (
        <div className="mt-4 rounded-xl border border-dashed border-slate-200 bg-slate-50 p-6 text-center text-xs font-bold text-slate-500">
          No questionnaire configured for this Request for Information.
        </div>
      ) : (
        <div className="mt-4 space-y-4">
          {questionnaire.map((q, idx) => {
            const qId = q.id || `q-${idx}`;
            const label = q.text || q.questionText || `Question ${idx + 1}`;
            const type = String(q.type).toUpperCase();

            return (
              <div key={qId} className={`${panelClass} p-4`}>
                <span className="mb-2 block text-xs font-semibold text-slate-700">{idx + 1}. {label}</span>
                {type === 'YES_NO' || type === 'YESNO' ? (
                  <div className="flex gap-4">
                    <label className="flex items-center gap-2 text-xs font-bold text-slate-600">
                      <input
                        type="radio"
                        disabled={!canEdit}
                        name={qId}
                        value="Yes"
                        checked={answers[qId] === 'Yes'}
                        onChange={() => onChange(qId, 'Yes')}
                        className="h-4 w-4"
                        style={{ accentColor: 'var(--bid-primary)' }}
                      />
                      Yes
                    </label>
                    <label className="flex items-center gap-2 text-xs font-bold text-slate-600">
                      <input
                        type="radio"
                        disabled={!canEdit}
                        name={qId}
                        value="No"
                        checked={answers[qId] === 'No'}
                        onChange={() => onChange(qId, 'No')}
                        className="h-4 w-4"
                        style={{ accentColor: 'var(--bid-primary)' }}
                      />
                      No
                    </label>
                  </div>
                ) : type === 'ATTACHMENT' ? (
                  <div>
                    <input
                      type="text"
                      disabled={!canEdit}
                      value={answers[qId] || ''}
                      onChange={e => onChange(qId, e.target.value)}
                      placeholder="Specify uploaded filename or detail reference..."
                      className={inputClass}
                    />
                    <p className="mt-1 text-[10px] text-slate-400 font-bold">Please upload the supporting file in the next step and mention its name here.</p>
                  </div>
                ) : (
                  <textarea
                    disabled={!canEdit}
                    value={answers[qId] || ''}
                    onChange={e => onChange(qId, e.target.value)}
                    placeholder="Provide your response..."
                    className={textAreaClass}
                  />
                )}
              </div>
            );
          })}
        </div>
      )}
      <div className="sticky bottom-0 z-10 mt-6 flex justify-end gap-3 border-t border-slate-100 bg-white/90 p-4 backdrop-blur">
        <button
          onClick={onSave}
          disabled={!canSave || saving}
          className="inline-flex h-10 items-center justify-center gap-2 rounded-xl px-4 text-xs font-semibold text-white shadow-sm transition-all duration-200 hover:-translate-y-0.5 hover:shadow-md disabled:opacity-50 disabled:hover:translate-y-0"
          style={{ backgroundColor: 'var(--bid-primary)' }}
        >
          {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <ShieldCheck className="h-4 w-4" />} Save Answers
        </button>
        <button onClick={onNext} className="inline-flex h-10 items-center justify-center gap-2 rounded-xl border border-slate-200 bg-white px-4 text-xs font-semibold text-slate-700 shadow-sm transition-all duration-200 hover:-translate-y-0.5 hover:bg-slate-50 hover:shadow-md">
          Continue <ArrowRight className="h-3.5 w-3.5" />
        </button>
      </div>
    </div>
  );
}

function TechnicalDocumentsStep({ canSelectFiles, canUpload, files, uploadedDocs, uploading, requiredDocuments, onAdd, onRemove, onPreview, onUpload, onNext, onTag, onSaveDraft, savingDraft }: { canSelectFiles: boolean; canUpload: boolean; files: PendingFile[]; uploadedDocs: ParticipationDocument[]; uploading: boolean; requiredDocuments: string[]; onAdd: (f: FileList | File[]) => void; onRemove: (id: string) => void; onPreview: (item: PendingFile) => void; onUpload: () => Promise<void>; onNext: () => void; onTag: (id: string, name: string) => void; onSaveDraft: () => void; savingDraft: boolean; }) {
  const required = requiredDocuments || [];
  const coveredNames = new Set([
    ...uploadedDocs.map(doc => String(doc.documentName || '').trim().toLowerCase()),
    ...files.map(item => String(item.documentName || '').trim().toLowerCase()),
  ]);
  const missingRequired = required.filter(name => !coveredNames.has(String(name).trim().toLowerCase()));
  return (
    <div>
      <StepTitle icon={<FileUp className="h-5 w-5" />} title="Upload Technical Documents" subtitle="Upload compliance, certificates, catalogues, experience proofs, and supporting technical documents." />
      {required.length > 0 && (
        <div className={`${panelClass} mt-4 p-4`}>
          <p className="text-[10px] font-semibold uppercase tracking-wider text-slate-500">Buyer-required documents checklist</p>
          <div className="mt-2 space-y-1.5">
            {required.map(name => {
              const done = coveredNames.has(String(name).trim().toLowerCase());
              return (
                <div key={name} className="flex items-center gap-2 text-xs font-bold">
                  {done ? <CheckCircle2 className="h-4 w-4 text-emerald-600" /> : <Circle className="h-4 w-4 text-slate-300" />}
                  <span className={done ? 'text-emerald-700' : 'text-slate-600'}>{name}</span>
                </div>
              );
            })}
          </div>
          {missingRequired.length > 0 && (
            <p className="mt-2 text-[11px] font-bold text-amber-700">Tag each uploaded file with the required document it satisfies. Missing: {missingRequired.join(', ')}</p>
          )}
        </div>
      )}
      <UploadDropZone disabled={!canSelectFiles} multiple onFiles={onAdd} />
      <FileList files={files} onRemove={onRemove} onPreview={onPreview} requiredDocuments={required} onTag={onTag} />
      {files.length > 0 && !canUpload && canSelectFiles && (
        <p className="mt-3 rounded-xl border border-amber-200 bg-amber-50 px-3 py-2 text-[11px] font-bold text-amber-800">
          Start participation to upload the prepared document set.
        </p>
      )}
      <UploadedList docs={uploadedDocs} title="Uploaded technical documents" />
      <div className="sticky bottom-0 z-10 mt-6 flex flex-col gap-3 border-t border-slate-100 bg-white/90 p-4 backdrop-blur sm:flex-row sm:justify-end">
        <button onClick={onUpload} disabled={!canUpload || uploading || !files.length || (required.length > 0 && files.some(f => !f.documentName))} className="inline-flex h-10 items-center justify-center gap-2 rounded-xl px-4 text-xs font-semibold text-white shadow-sm transition-all duration-200 hover:-translate-y-0.5 hover:shadow-md disabled:opacity-50 disabled:hover:translate-y-0" style={{ backgroundColor: 'var(--bid-primary)' }} title={(required.length > 0 && files.some(f => !f.documentName)) ? "Please tag all files before uploading" : ""}>
          {uploading ? <Loader2 className="h-4 w-4 animate-spin" /> : <FileCheck2 className="h-4 w-4" />} Upload documents
        </button>
        <button onClick={onNext} className="inline-flex h-10 items-center justify-center gap-2 rounded-xl border border-slate-200 bg-white px-4 text-xs font-semibold text-slate-700 shadow-sm transition-all duration-200 hover:-translate-y-0.5 hover:bg-slate-50 hover:shadow-md">
          Continue <ArrowRight className="h-3.5 w-3.5" />
        </button>
      </div>
    </div>
  );
}

function FinancialQuoteStep({
  bid,
  participation,
  quote,
  setQuote,
  file,
  uploadedDocs,
  onFile,
  onRemoveFile,
  onPreview,
  canEdit,
  canSave,
  saving,
  onSave,
  onNext,
  rateContractData,
  setRateContractData,
  rfqData,
  setRfqData,
  onSaveDraft,
  savingDraft
}: {
  bid: ProcurementBid;
  participation: ParticipationState;
  quote: { quotedAmount: string; gstPercentage: string; totalAmount: string };
  setQuote: React.Dispatch<React.SetStateAction<{ quotedAmount: string; gstPercentage: string; totalAmount: string }>>;
  file: PendingFile | null;
  uploadedDocs: ParticipationDocument[];
  onFile: (file?: File) => void;
  onRemoveFile: () => void;
  onPreview: (item: PendingFile) => void;
  canEdit: boolean;
  canSave: boolean;
  saving: boolean;
  onSave: () => Promise<void>;
  onNext: () => void;
  rateContractData: { validityDate: string; notes: string };
  setRateContractData: React.Dispatch<React.SetStateAction<{ validityDate: string; notes: string }>>;
  rfqData: { notes: string };
  setRfqData: React.Dispatch<React.SetStateAction<{ notes: string }>>;
  onSaveDraft: () => void;
  savingDraft: boolean;
}) {
  const isBoq = bid?.procurementType === 'BOQ_BASED_BID';
  const isRateContract = bid?.procurementType === 'RATE_CONTRACT';
  const isRfq = bid?.procurementType === 'RFQ';

  const boqTemplates = useMemo(() => {
    return (bid?.documents || []).filter(doc => 
      String(doc.fileName || '').toUpperCase().includes('BOQ') || 
      String(doc.documentType || '').toUpperCase().includes('BOQ')
    );
  }, [bid?.documents]);

  return (
    <div>
      <StepTitle icon={<IndianRupee className="h-5 w-5" />} title="Financial Quote" subtitle="Upload the commercial quote and save sealed quotation values before final submission." />
      
      {isBoq && (
        <div className={`${panelClass} mt-4 p-4`}>
          <h4 className="text-xs font-semibold uppercase tracking-wider text-slate-800">BOQ Excel Template Download</h4>
          <p className="mt-1 text-xs font-bold text-slate-600">Please download the template, fill in your line-item rates, and upload the completed sheet below.</p>
          <div className="mt-3">
            {boqTemplates.length > 0 ? boqTemplates.map(doc => (
              <a
                key={doc.id}
                href={doc.fileUrl || `/api/files/${doc.fileAssetId}/view`}
                target="_blank"
                rel="noreferrer"
                className="inline-flex h-9 items-center gap-2 rounded-xl px-4 text-xs font-semibold text-white shadow-sm transition-all duration-200 hover:-translate-y-0.5 hover:shadow-md"
                style={{ backgroundColor: 'var(--bid-primary)' }}
              >
                Download {doc.fileName || 'BOQ Template'}
              </a>
            )) : (
              <span className="text-xs font-bold text-slate-500">No BOQ template found in attachments. Please contact the buyer.</span>
            )}
          </div>
        </div>
      )}

      <div className="mt-4 grid gap-4 md:grid-cols-3">
        <Input
          label={isBoq ? "Total Quoted Amount (from BOQ sheet)" : "Quoted amount"}
          value={quote.quotedAmount}
          onChange={next => setQuote(prev => ({ ...prev, quotedAmount: next.replace(/[^\d.]/g, '') }))}
          disabled={!canEdit}
          required
          prefix="₹"
        />
        <Input
          label="GST percentage"
          value={quote.gstPercentage}
          onChange={next => setQuote(prev => ({ ...prev, gstPercentage: next.replace(/[^\d.]/g, '') }))}
          disabled={!canEdit}
          required
        />
        <Input
          label="Total amount"
          value={quote.totalAmount}
          onChange={next => setQuote(prev => ({ ...prev, totalAmount: next.replace(/[^\d.]/g, '') }))}
          disabled={!canEdit}
          prefix="₹"
        />
      </div>

      {isRateContract && (
        <div className="mt-4 grid gap-4 md:grid-cols-2">
          <label>
            <span className="mb-1 block text-[10px] font-semibold uppercase tracking-wider text-slate-500">Rate Validity Date <span className="text-red-500">*</span></span>
            <input
              type="date"
              value={rateContractData.validityDate}
              onChange={e => setRateContractData(prev => ({ ...prev, validityDate: e.target.value }))}
              disabled={!canEdit}
              className={`${inputClass} disabled:bg-slate-50 disabled:text-slate-400`}
            />
          </label>
          <Field
            label="Rate Schedule / Commercial Notes"
            value={rateContractData.notes}
            onChange={val => setRateContractData(prev => ({ ...prev, notes: val }))}
            disabled={!canEdit}
          />
        </div>
      )}

      {isRfq && (
        <div className="mt-4">
          <Field
            label="RFQ Commercial Notes / Deviations"
            value={rfqData.notes}
            onChange={val => setRfqData(prev => ({ ...prev, notes: val }))}
            disabled={!canEdit}
          />
        </div>
      )}

      <div className="mt-4">
        <span className="mb-1 block text-[10px] font-semibold uppercase tracking-wider text-slate-500">
          {isBoq ? "Upload Completed BOQ Excel sheet *" : "Upload Financial Proposal / Quote Document"}
        </span>
        <UploadDropZone disabled={!canEdit} onFiles={files => onFile(Array.from(files)[0])} />
        {file && <FileList files={[file]} onRemove={onRemoveFile} onPreview={onPreview} />}
      </div>

      <UploadedList docs={uploadedDocs} title="Uploaded financial quote documents" />
      {(quote.quotedAmount || file) && !canSave && canEdit && (
        <p className="mt-3 rounded-xl border border-amber-200 bg-amber-50 px-3 py-2 text-[11px] font-bold text-amber-800">
          Start participation to save this financial quote securely.
        </p>
      )}

      <div className="sticky bottom-0 z-10 mt-6 flex flex-col gap-3 border-t border-slate-100 bg-white/90 p-4 backdrop-blur sm:flex-row sm:justify-end">
        <button
          onClick={onSave}
          disabled={!canSave || saving || !quote.quotedAmount || (isBoq && !file && !uploadedDocs.length) || (isRateContract && !rateContractData.validityDate)}
          className="inline-flex h-10 items-center justify-center gap-2 rounded-xl px-4 text-xs font-semibold text-white shadow-sm transition-all duration-200 hover:-translate-y-0.5 hover:shadow-md disabled:opacity-50 disabled:hover:translate-y-0"
          style={{ backgroundColor: 'var(--bid-primary)' }}
        >
          {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <ShieldCheck className="h-4 w-4" />} Save quote
        </button>
        <button onClick={onNext} className="inline-flex h-10 items-center justify-center gap-2 rounded-xl border border-slate-200 bg-white px-4 text-xs font-semibold text-slate-700 shadow-sm transition-all duration-200 hover:-translate-y-0.5 hover:bg-slate-50 hover:shadow-md">
          Continue <ArrowRight className="h-3.5 w-3.5" />
        </button>
      </div>
    </div>
  );
}

function ReviewStep({ bid, participation, technicalDocs, financialDocs, declaration, setDeclaration, onNext, disabled, onSaveDraft, savingDraft }: {
  bid: ProcurementBid;
  participation: ParticipationState | null;
  technicalDocs: ParticipationDocument[];
  financialDocs: ParticipationDocument[];
  declaration: boolean;
  setDeclaration: (value: boolean) => void;
  onNext: () => void;
  disabled?: boolean;
  onSaveDraft: () => void;
  savingDraft: boolean;
}) {
  return (
    <div>
      <StepTitle icon={<ClipboardCheck className="h-5 w-5" />} title="Review & Declaration" subtitle="Review the submission summary and accept the declaration before final submit." />
      <div className="mt-4 grid gap-3 md:grid-cols-2">
        <Info label="Bid" value={`${bid.id} - ${bid.title}`} />
        <Info label="Participation" value={participation?.id ? `#${participation.id}` : 'Not started'} />
        <Info label="Technical documents" value={`${technicalDocs.length} uploaded`} />
        {bid?.procurementType !== 'RFI' && (
          <Info label="Financial quote" value={financialDocs.length || participation?.quotedAmount ? 'Saved' : 'Pending'} />
        )}
        <Info label="Current status" value={participation?.submissionStatus || 'Draft'} />
      </div>
      <label className={`mt-5 flex items-start gap-3 rounded-xl border p-4 text-xs font-bold transition-all duration-200 hover:-translate-y-0.5 hover:shadow-sm ${declaration ? 'border-emerald-200 bg-emerald-50 text-emerald-800' : 'border-slate-200 bg-white text-slate-600'}`}>
        <input type="checkbox" checked={declaration} onChange={event => setDeclaration(event.target.checked)} disabled={disabled} className="mt-0.5 h-4 w-4 disabled:opacity-50" style={{ accentColor: 'var(--bid-primary)' }} />
        I confirm that the uploaded documents and financial quote are accurate, complete, and submitted by an authorized seller representative.
      </label>
      <div className="sticky bottom-0 z-10 mt-6 flex justify-end gap-3 border-t border-slate-100 bg-white/90 p-4 backdrop-blur">
        {!disabled && (
          <button type="button" onClick={onSaveDraft} disabled={savingDraft} className="inline-flex h-10 items-center justify-center gap-2 rounded-xl border border-slate-200 bg-white px-4 text-xs font-semibold text-slate-700 shadow-sm transition-all duration-200 hover:-translate-y-0.5 hover:bg-slate-50 hover:shadow-md disabled:opacity-50 disabled:hover:translate-y-0">
            {savingDraft ? <Loader2 className="h-4 w-4 animate-spin" /> : <ClipboardCheck className="h-4 w-4" />} Save as Draft
          </button>
        )}
        <button onClick={onNext} className="inline-flex h-10 items-center justify-center gap-2 rounded-xl px-4 text-xs font-semibold text-white shadow-sm transition-all duration-200 hover:-translate-y-0.5 hover:shadow-md" style={{ backgroundColor: 'var(--bid-primary)' }}>
          Continue to submit <ArrowRight className="h-3.5 w-3.5" />
        </button>
      </div>
    </div>
  );
}

function SubmitStep({ canSubmit, submitted, submitting, requirements, onSubmit }: {
  canSubmit: boolean;
  submitted: boolean;
  submitting: boolean;
  requirements: Array<{ ok: boolean; label: string }>;
  onSubmit: () => void;
}) {
  return (
    <div>
      <StepTitle icon={<Send className="h-5 w-5" />} title="Submit Bid" subtitle="Final submission locks this participation for buyer evaluation." />
      <div className={`${panelClass} mt-4 grid gap-3 p-5 text-center`}>
        {submitted ? <CheckCircle2 className="mx-auto h-10 w-10 text-emerald-600" /> : <Lock className="mx-auto h-10 w-10" style={{ color: 'var(--bid-primary)' }} />}
        <p className="mt-3 text-sm font-semibold text-slate-800">{submitted ? 'Bid already submitted.' : 'Ready for final submission'}</p>
        <p className="mt-1 text-xs text-slate-500">{submitted ? 'You can track evaluation progress now.' : 'Please ensure all files and quote values are correct before submitting.'}</p>
        {!submitted && (
          <div className="mx-auto mt-3 grid w-full max-w-2xl gap-2 sm:grid-cols-2">
            {requirements.map(item => (
              <div
                key={item.label}
                className={`flex items-center gap-2 rounded-xl border px-3 py-2 text-left text-[11px] font-semibold transition-all duration-200 ${item.ok ? 'border-emerald-200 bg-emerald-50 text-emerald-800' : 'border-slate-200 bg-white text-slate-500'}`}
              >
                {item.ok ? <CheckCircle2 className="h-4 w-4 shrink-0 text-emerald-600" /> : <Circle className="h-4 w-4 shrink-0 text-slate-300" />}
                <span>{item.label}</span>
              </div>
            ))}
          </div>
        )}
      </div>
      <div className="sticky bottom-0 z-10 mt-6 flex flex-col gap-3 border-t border-slate-100 bg-white/90 p-4 backdrop-blur sm:flex-row sm:justify-end">
        <button onClick={onSubmit} disabled={!canSubmit || submitting || submitted} className="inline-flex h-10 items-center justify-center gap-2 rounded-xl px-4 text-xs font-semibold text-white shadow-sm transition-all duration-200 hover:-translate-y-0.5 hover:shadow-md disabled:opacity-50 disabled:hover:translate-y-0" style={{ backgroundColor: 'var(--bid-primary)' }}>
          {submitting ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />} Final submit
        </button>
      </div>
    </div>
  );
}

function StepTitle({ icon, title, subtitle }: { icon: React.ReactNode; title: string; subtitle: string }) {
  return (
    <div className="flex items-start gap-3 border-b border-slate-100 pb-4">
      <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl text-white shadow-sm transition-transform duration-300 hover:scale-105" style={{ backgroundColor: 'var(--bid-primary)' }}>{icon}</div>
      <div>
        <h2 className="text-lg font-semibold" style={{ color: 'var(--bid-primary)' }}>{title}</h2>
        <p className="mt-1 text-xs text-slate-500">{subtitle}</p>
      </div>
    </div>
  );
}

function Panel({ title, items }: { title: string; items: string[] }) {
  return (
    <section className={`${panelClass} p-4`}>
      <h3 className="text-sm font-semibold" style={{ color: 'var(--bid-primary)' }}>{title}</h3>
      <ul className="mt-3 space-y-2 text-xs leading-5 text-slate-600">
        {items.map(item => <li key={item} className="rounded-lg bg-white px-3 py-2 font-semibold shadow-sm ring-1 ring-slate-100">{item}</li>)}
      </ul>
    </section>
  );
}

function Input({ label, value, onChange, disabled, required, prefix }: { label: string; value: string; onChange: (value: string) => void; disabled?: boolean; required?: boolean; prefix?: string }) {
  return (
    <label className="block">
      <span className="mb-1.5 block text-xs font-bold uppercase tracking-wider text-slate-700">{label} {required && <span className="text-red-500">*</span>}</span>
      <div className="relative">
        {prefix && <span className="absolute left-3 top-1/2 -translate-y-1/2 text-sm font-semibold text-slate-500">{prefix}</span>}
        <input value={value} onChange={event => onChange(event.target.value)} disabled={disabled} className={`${inputClass} disabled:bg-slate-50 disabled:text-slate-400 ${prefix ? 'pl-8' : ''}`} />
      </div>
    </label>
  );
}

function Field({ label, value, onChange, disabled, required }: { label: string; value: string; onChange: (value: string) => void; disabled?: boolean; required?: boolean }) {
  return (
    <label className="md:col-span-2 lg:col-span-3">
      <span className="mb-1.5 block text-xs font-bold uppercase tracking-wider text-slate-700">{label} {required && <span className="text-red-500">*</span>}</span>
      <textarea value={value} onChange={event => onChange(event.target.value)} disabled={disabled} className={`${textAreaClass} disabled:bg-slate-50 disabled:text-slate-400`} />
    </label>
  );
}

function UploadDropZone({ disabled, multiple, onFiles }: { disabled: boolean; multiple?: boolean; onFiles: (files: FileList | File[]) => void }) {
  const [dragging, setDragging] = useState(false);
  return (
    <label
      onDragOver={event => { event.preventDefault(); if (!disabled) setDragging(true); }}
      onDragLeave={() => setDragging(false)}
      onDrop={event => {
        event.preventDefault();
        setDragging(false);
        if (!disabled && event.dataTransfer.files.length) onFiles(event.dataTransfer.files);
      }}
      className={`mt-4 flex min-h-36 cursor-pointer flex-col items-center justify-center rounded-2xl border border-dashed p-5 text-center transition-all duration-300 ${disabled ? 'cursor-not-allowed border-slate-200 bg-slate-50 text-slate-400' : 'border-slate-300 bg-white text-slate-600 hover:-translate-y-0.5 hover:border-slate-400 hover:bg-slate-50 hover:shadow-sm'}`}
      style={dragging ? { borderColor: 'var(--bid-primary)', backgroundColor: 'var(--bid-light)', color: 'var(--bid-primary)' } : undefined}
    >
      <FileUp className="h-8 w-8" />
      <span className="mt-3 text-sm font-semibold">Drag and drop files here</span>
      <span className="mt-1 text-xs">PDF, DOC, DOCX, XLS, XLSX, CSV, JPG, PNG up to 10 MB</span>
      <input disabled={disabled} type="file" multiple={multiple} accept=".pdf,.doc,.docx,.xls,.xlsx,.csv,.jpg,.jpeg,.png" onChange={event => event.target.files && onFiles(event.target.files)} className="hidden" />
    </label>
  );
}

function FileList({ files, onRemove, onPreview, requiredDocuments, onTag }: { files: PendingFile[]; onRemove: (id: string) => void; onPreview: (item: PendingFile) => void; requiredDocuments?: string[]; onTag?: (id: string, documentName: string) => void }) {
  if (!files.length) return null;
  return (
    <div className="mt-4 space-y-2">
      {files.map(item => (
        <div key={item.id} className="rounded-xl border border-slate-200 bg-slate-50 p-3 transition-all duration-200 hover:-translate-y-0.5 hover:bg-white hover:shadow-sm">
          <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
            <FileText className="h-5 w-5" style={{ color: 'var(--bid-primary)' }} />
            <div className="min-w-0 flex-1">
              <p className="truncate text-xs font-semibold text-slate-800">{item.file.name}</p>
              <p className="text-[10px] font-bold text-slate-500">{formatBytes(item.file.size)} - {item.status}</p>
              {item.status === 'uploading' && <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-slate-200"><div className="h-full" style={{ width: `${item.progress}%`, backgroundColor: 'var(--bid-primary)' }} /></div>}
              {item.error && <p className="mt-1 text-[10px] font-bold text-red-600">{item.error}</p>}
            </div>
            {requiredDocuments && requiredDocuments.length > 0 && onTag && item.status !== 'uploaded' && (
              <select
                value={item.documentName || ''}
                onChange={event => onTag(item.id, event.target.value)}
                className="h-8 rounded-lg border border-slate-200 bg-white px-2 text-[10px] font-semibold text-slate-700 transition-colors focus:border-slate-400"
                title="Which required document is this file?"
              >
                <option value="">Tag as required document…</option>
                {requiredDocuments.map(name => <option key={name} value={name}>{name}</option>)}
                <option value="Other">Other / Optional Document</option>
              </select>
            )}
            <div className="flex gap-2">
              <button type="button" onClick={() => onPreview(item)} className="inline-flex h-8 items-center gap-1 rounded-lg border border-slate-200 bg-white px-3 text-[10px] font-semibold text-slate-700 transition-colors hover:bg-slate-50"><Eye className="h-3.5 w-3.5" /> Preview</button>
              {item.status !== 'uploaded' && <button type="button" onClick={() => onRemove(item.id)} className="inline-flex h-8 items-center gap-1 rounded-lg border border-red-200 bg-white px-3 text-[10px] font-semibold text-red-600 transition-colors hover:bg-red-50"><Trash2 className="h-3.5 w-3.5" /> Remove</button>}
            </div>
          </div>
        </div>
      ))}
    </div>
  );
}

function UploadedList({ docs, title }: { docs: ParticipationDocument[]; title: string }) {
  return (
    <div className="mt-4">
      <p className="text-[10px] font-semibold uppercase tracking-wider text-slate-500">{title}</p>
      <div className="mt-2 space-y-2">
        {docs.length ? docs.map((doc, index) => (
          <div key={`${doc.id || doc.fileName}-${index}`} className="flex items-center gap-2 rounded-xl border border-emerald-200 bg-emerald-50 p-3 text-xs font-bold text-emerald-800 transition-all duration-200 hover:-translate-y-0.5 hover:shadow-sm">
            <CheckCircle2 className="h-4 w-4" /> {doc.fileName || doc.documentName || 'Uploaded document'}
          </div>
        )) : <p className="rounded-xl border border-dashed border-slate-200 bg-slate-50 p-3 text-xs font-bold text-slate-500">No server-uploaded files yet.</p>}
      </div>
    </div>
  );
}
