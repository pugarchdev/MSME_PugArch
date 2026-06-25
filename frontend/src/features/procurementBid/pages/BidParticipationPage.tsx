'use client';

import React, { useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import {
  AlertTriangle,
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
  ProcurementHero,
  ProcurementLoadingState,
  StatusBadge,
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
};

type PendingFile = {
  id: string;
  file: File;
  progress: number;
  status: 'ready' | 'uploading' | 'uploaded' | 'error';
  error?: string;
  previewUrl: string;
};

const steps = [
  'View Bid',
  'Check Eligibility',
  'Technical Offer',
  'Upload Technical Documents',
  'Financial Quote',
  'Review & Declaration',
  'Submit Bid',
  'Track Status',
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

const inputClass = 'h-10 w-full rounded-md border border-slate-200 bg-white px-3 text-sm outline-none focus:border-[#0b2447] focus:ring-2 focus:ring-[#0b2447]/10';
const textAreaClass = 'min-h-24 w-full rounded-md border border-slate-200 bg-white px-3 py-2 text-sm outline-none focus:border-[#0b2447] focus:ring-2 focus:ring-[#0b2447]/10';

export default function BidParticipationPage() {
  const { user } = useAuth();
  const router = useRouter();
  const pathname = usePathname() || '';
  const bidId = pathname.split('/')[2];
  const [bid, setBid] = useState<ProcurementBid | null>(null);
  const [participation, setParticipation] = useState<ParticipationState | null>(null);
  const [step, setStep] = useState(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [starting, setStarting] = useState(false);
  const [uploadingTechnical, setUploadingTechnical] = useState(false);
  const [savingFinancial, setSavingFinancial] = useState(false);
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
  const [eligibility, setEligibility] = useState<Record<string, boolean>>({
    gst: false,
    pan: false,
    udyam: false,
    experience: false,
    turnover: false,
    delivery: false,
    notBlacklisted: false,
    terms: false,
  });
  const [declaration, setDeclaration] = useState(false);
  const previewUrlsRef = React.useRef<string[]>([]);

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
              setStep(7);
            }
          } catch {
            // A missing seller participation is normal before the seller starts.
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

  const verifiedSeller = isSellerVerified(user);
  const closed = bid ? isBidClosed(bid) : false;
  const uploadedDocs = participation?.documents || [];
  const uploadedTechnicalDocs = uploadedDocs.filter(doc => doc.documentCategory !== 'FINANCIAL_QUOTE');
  const uploadedFinancialDocs = uploadedDocs.filter(doc => doc.documentCategory === 'FINANCIAL_QUOTE');
  const isSubmitted = participation?.submissionStatus === 'SUBMITTED';
  const allEligibilityChecked = Object.values(eligibility).every(Boolean);
  const canUpload = Boolean(participation?.id && !closed && !isSubmitted);
  const canSubmit = Boolean(participation?.id && uploadedTechnicalDocs.length && (uploadedFinancialDocs.length || participation?.quotedAmount) && declaration && !isSubmitted);

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

  const startParticipation = async () => {
    if (!user) {
      router.push(`/login?returnUrl=${encodeURIComponent(`/bids/${bidId}/participate`)}`);
      return;
    }
    if (guard || !bid) return;
    if (participation?.id) {
      setStep(1);
      return;
    }
    setStarting(true);
    try {
      const created = await procurementBidApi.startBidParticipation(bid.id);
      setParticipation(created);
      setStep(1);
      toast.success('Participation started.');
    } catch (err: any) {
      toast.error(err?.message || 'Unable to start participation.');
      try {
        const status = await procurementBidApi.getSellerBidStatus(bid.id);
        if (status?.participation) setParticipation(status.participation);
      } catch {}
    } finally {
      setStarting(false);
    }
  };

  const uploadTechnical = async () => {
    if (!bid || !participation?.id || !technicalFiles.length) return;
    setUploadingTechnical(true);
    setTechnicalFiles(prev => prev.map(item => ({ ...item, status: 'uploading', progress: 0 })));
    try {
      const files = technicalFiles.map(item => item.file);
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
      setStep(4);
    } catch (err: any) {
      setTechnicalFiles(prev => prev.map(item => item.status === 'uploading' ? { ...item, status: 'error', error: err?.message || 'Upload failed' } : item));
      toast.error(err?.message || 'Technical document upload failed.');
    } finally {
      setUploadingTechnical(false);
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
          offeredItemDescription: technicalOffer.offeredItemDescription,
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
      setStep(5);
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
      setStep(7);
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
        <main className="mx-auto w-full max-w-6xl">
          <ProcurementHero title="Seller Bid Participation" subtitle="Loading live bid participation context." />
          <div className="mt-5"><ProcurementLoadingState message="Loading bid participation..." /></div>
        </main>
      </PageShell>
    );
  }

  if (error) {
    return (
      <PageShell>
        <main className="mx-auto w-full max-w-6xl">
          <ProcurementHero title="Seller Bid Participation" subtitle={bidId || 'Requested bid'} action={<Link href="/bids" className="inline-flex h-10 items-center justify-center rounded-md border border-slate-200 bg-white px-4 text-xs font-black text-slate-700">Back to bids</Link>} />
          <div className="mt-5"><ProcurementErrorState message={error} onRetry={loadBid} /></div>
        </main>
      </PageShell>
    );
  }

  if (!bid) {
    return (
      <PageShell>
        <main className="mx-auto w-full max-w-6xl">
          <ProcurementHero title="Seller Bid Participation" subtitle={bidId || 'Requested bid'} action={<Link href="/bids" className="inline-flex h-10 items-center justify-center rounded-md border border-slate-200 bg-white px-4 text-xs font-black text-slate-700">Back to bids</Link>} />
          <div className="mt-5"><ProcurementEmptyState title="No bid available currently." message="This bid was not returned by the live backend." /></div>
        </main>
      </PageShell>
    );
  }

  return (
    <PageShell>
      <main className="mx-auto w-full max-w-7xl">
        <ProcurementHero title="Seller Bid Participation" subtitle={`${bid.id} - ${bid.title}`} action={<Link href={`/bids/${bid.id}`} className="inline-flex h-10 items-center justify-center rounded-md border border-slate-200 bg-white px-4 text-xs font-black text-slate-700">View bid</Link>} />

        <section className="mt-5 border border-slate-200 bg-white">
          <div className="grid gap-4 p-4 lg:grid-cols-[1.3fr_0.7fr]">
            <div>
              <div className="flex flex-wrap items-center gap-2">
                <StatusBadge label={bid.status} />
                <StatusBadge label={participation?.submissionStatus || 'Not Started'} />
                <span className="inline-flex items-center gap-1 rounded-full border border-slate-200 bg-slate-50 px-2.5 py-1 text-[10px] font-black text-slate-600"><CalendarClock className="h-3 w-3" /> {daysLeft(bid.endDate)}</span>
              </div>
              <div className="mt-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
                <Info label="Buyer" value={bid.buyerName} />
                <Info label="Buyer type" value={bid.buyerType} />
                <Info label="Category" value={bid.category} />
                <Info label="Quantity" value={bid.quantity} />
                <Info label="Delivery" value={bid.deliveryLocation} wide />
                <Info label="Closing date" value={formatDate(bid.endDate)} />
                <Info label="Estimated value" value={money(bid.estimatedValue)} />
              </div>
            </div>
            <div className="border border-slate-200 bg-slate-50 p-4">
              <p className="text-xs font-black uppercase tracking-wider text-slate-500">Participation readiness</p>
              <div className="mt-3 space-y-2 text-xs font-bold text-slate-600">
                <ReadyRow ok={Boolean(participation?.id)} label={participation?.id ? `Participation #${participation.id}` : 'Start participation'} />
                <ReadyRow ok={uploadedTechnicalDocs.length > 0} label={`${uploadedTechnicalDocs.length} technical document(s) uploaded`} />
                <ReadyRow ok={Boolean(uploadedFinancialDocs.length || participation?.quotedAmount)} label="Financial quote saved" />
                <ReadyRow ok={declaration} label="Declaration accepted" />
              </div>
            </div>
          </div>
          {guard && (
            <div className={`mx-4 mb-4 flex flex-col gap-3 border p-3 sm:flex-row sm:items-center sm:justify-between ${guard.tone === 'red' ? 'border-red-200 bg-red-50 text-red-800' : 'border-amber-200 bg-amber-50 text-amber-800'}`}>
              <span className="flex items-center gap-2 text-xs font-black"><AlertTriangle className="h-4 w-4" /> {guard.message}</span>
              {guard.action && <button onClick={() => router.push('/login')} className="h-9 rounded-md bg-[#0b2447] px-4 text-xs font-black text-white">{guard.action}</button>}
            </div>
          )}
        </section>

        <div className="mt-5 grid gap-5 lg:grid-cols-[280px_1fr]">
          <aside className="lg:sticky lg:top-28 lg:self-start">
            <div className="overflow-hidden border border-slate-200 bg-white">
              <div className="border-b border-slate-100 p-4">
                <p className="text-sm font-black text-[#0b2447]">Submission Steps</p>
              </div>
              <div className="grid grid-cols-2 gap-1 p-2 sm:grid-cols-4 lg:block lg:space-y-1">
                {steps.map((label, index) => {
                  const locked = index >= 3 && !participation?.id;
                  const active = step === index;
                  const done = index < step || (index === 7 && isSubmitted);
                  return (
                    <button
                      key={label}
                      type="button"
                      disabled={locked}
                      onClick={() => setStep(index)}
                      className={`flex min-h-12 items-center gap-2 rounded-md border p-2 text-left text-[11px] font-black transition ${active ? 'border-[#0b2447] bg-blue-50 text-[#0b2447]' : done ? 'border-emerald-200 bg-emerald-50 text-emerald-800' : locked ? 'border-slate-100 bg-slate-50 text-slate-300' : 'border-slate-200 bg-white text-slate-600 hover:bg-slate-50'}`}
                    >
                      {locked ? <Lock className="h-3.5 w-3.5" /> : done ? <CheckCircle2 className="h-3.5 w-3.5" /> : <Circle className="h-3.5 w-3.5" />}
                      <span>{label}</span>
                    </button>
                  );
                })}
              </div>
            </div>
          </aside>

          <section className="min-w-0 border border-slate-200 bg-white p-4">
            {step === 0 && <ViewBidStep bid={bid} onStart={startParticipation} onContinue={() => setStep(1)} starting={starting} hasParticipation={Boolean(participation?.id)} blocked={Boolean(guard)} />}
            {step === 1 && <EligibilityStep eligibility={eligibility} setEligibility={setEligibility} onNext={() => setStep(2)} />}
            {step === 2 && <TechnicalOfferStep value={technicalOffer} onChange={setTechnicalOffer} onNext={() => setStep(3)} disabled={!participation?.id || isSubmitted} />}
            {step === 3 && (
              <TechnicalDocumentsStep
                canUpload={canUpload}
                files={technicalFiles}
                uploadedDocs={uploadedTechnicalDocs}
                uploading={uploadingTechnical}
                onAdd={addTechnicalFiles}
                onRemove={removeTechnicalFile}
                onPreview={openPreview}
                onUpload={uploadTechnical}
                onNext={() => setStep(4)}
              />
            )}
            {step === 4 && (
              <FinancialQuoteStep
                canUpload={canUpload}
                quote={quote}
                setQuote={setQuote}
                file={financialFile}
                uploadedDocs={uploadedFinancialDocs}
                saving={savingFinancial}
                onFile={addFinancialFile}
                onRemoveFile={() => { if (financialFile) URL.revokeObjectURL(financialFile.previewUrl); setFinancialFile(null); }}
                onPreview={item => item && openPreview(item)}
                onSave={saveFinancial}
                onNext={() => setStep(5)}
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
                allEligibilityChecked={allEligibilityChecked}
                onNext={() => setStep(6)}
              />
            )}
            {step === 6 && (
              <SubmitStep canSubmit={canSubmit} submitted={isSubmitted} submitting={submitting} onSubmit={submitFinal} onTrack={() => setStep(7)} />
            )}
            {step === 7 && (
              <TrackStep bid={bid} participation={participation} />
            )}
          </section>
        </div>
      </main>
      <DocumentPreviewModal previewDocument={previewDocument} onClose={() => setPreviewDocument(null)} />
    </PageShell>
  );
}

function Info({ label, value, wide }: { label: string; value: React.ReactNode; wide?: boolean }) {
  return (
    <div className={`border border-slate-100 bg-slate-50 p-3 ${wide ? 'sm:col-span-2' : ''}`}>
      <p className="text-[10px] font-black uppercase tracking-wider text-slate-400">{label}</p>
      <p className="mt-1 text-xs font-black text-slate-800">{value}</p>
    </div>
  );
}

function ReadyRow({ ok, label }: { ok: boolean; label: string }) {
  return <div className="flex items-center gap-2">{ok ? <CheckCircle2 className="h-4 w-4 text-emerald-600" /> : <Circle className="h-4 w-4 text-slate-300" />} <span>{label}</span></div>;
}

function ViewBidStep({ bid, onStart, onContinue, starting, hasParticipation, blocked }: { bid: ProcurementBid; onStart: () => void; onContinue: () => void; starting: boolean; hasParticipation: boolean; blocked: boolean }) {
  return (
    <div>
      <StepTitle icon={<Eye className="h-5 w-5" />} title="View Bid" subtitle="Review the live bid details before starting participation." />
      <div className="mt-4 grid gap-4 lg:grid-cols-2">
        <Panel title="Bid details" items={[bid.description, `Item/service: ${bid.itemName}`, `Delivery location: ${bid.deliveryLocation}`, `Estimated value: ${money(bid.estimatedValue)}`]} />
        <Panel title="Important dates" items={bid.importantDates.map(item => `${item.label}: ${formatDate(item.date)}`)} />
        <Panel title="Eligibility criteria" items={bid.eligibility.length ? bid.eligibility : ['No eligibility criteria published currently.']} />
        <Panel title="Required documents" items={bid.requiredDocuments.length ? bid.requiredDocuments : ['No required document list published currently.']} />
        <Panel title="Terms and conditions" items={bid.terms.length ? bid.terms : ['No terms published currently.']} />
        <div className="border border-slate-200 p-4">
          <h3 className="text-sm font-black text-[#0b2447]">Bid documents</h3>
          <div className="mt-3 space-y-2">
            {bid.bidDocuments?.length ? bid.bidDocuments.map(doc => (
              <div key={doc.id} className="flex items-center gap-2 rounded-md border border-slate-200 bg-slate-50 p-3 text-xs font-bold text-slate-600">
                <FileText className="h-4 w-4 text-[#0b2447]" /> {doc.name}
              </div>
            )) : <p className="text-xs font-bold text-slate-500">No bid documents uploaded currently.</p>}
          </div>
        </div>
      </div>
      <div className="mt-5 flex flex-col gap-3 sm:flex-row">
        <button onClick={onStart} disabled={blocked || starting} className="inline-flex h-10 items-center justify-center gap-2 rounded-md bg-[#0b2447] px-4 text-xs font-black text-white disabled:cursor-not-allowed disabled:opacity-50">
          {starting ? <Loader2 className="h-4 w-4 animate-spin" /> : <ShieldCheck className="h-4 w-4" />}
          {hasParticipation ? 'Continue Participation' : 'Start Participation'}
        </button>
        <button onClick={onContinue} disabled={!hasParticipation} className="h-10 rounded-md border border-slate-200 bg-white px-4 text-xs font-black text-slate-700 disabled:cursor-not-allowed disabled:opacity-50">Continue</button>
      </div>
    </div>
  );
}

function EligibilityStep({ eligibility, setEligibility, onNext }: { eligibility: Record<string, boolean>; setEligibility: React.Dispatch<React.SetStateAction<Record<string, boolean>>>; onNext: () => void }) {
  const rows = [
    ['gst', 'GST registration available'],
    ['pan', 'PAN available'],
    ['udyam', 'Udyam certificate available, if applicable'],
    ['experience', 'Experience criteria accepted'],
    ['turnover', 'Turnover criteria accepted'],
    ['delivery', 'Delivery location accepted'],
    ['notBlacklisted', 'Not blacklisted declaration'],
    ['terms', 'Terms accepted'],
  ];
  const complete = Object.values(eligibility).every(Boolean);
  return (
    <div>
      <StepTitle icon={<ClipboardCheck className="h-5 w-5" />} title="Check Eligibility" subtitle="Confirm eligibility before preparing the technical offer." />
      <div className="mt-4 grid gap-3 sm:grid-cols-2">
        {rows.map(([key, label]) => (
          <label key={key} className={`flex min-h-14 items-center gap-3 border p-3 text-xs font-bold ${eligibility[key] ? 'border-emerald-200 bg-emerald-50 text-emerald-800' : 'border-slate-200 bg-white text-slate-600'}`}>
            <input type="checkbox" checked={eligibility[key]} onChange={event => setEligibility(prev => ({ ...prev, [key]: event.target.checked }))} className="h-4 w-4 accent-[#0b2447]" />
            {label}
          </label>
        ))}
      </div>
      <div className="mt-5 flex justify-end">
        <button onClick={onNext} disabled={!complete} className="h-10 rounded-md bg-[#0b2447] px-4 text-xs font-black text-white disabled:opacity-50">Continue</button>
      </div>
    </div>
  );
}

function TechnicalOfferStep({ value, onChange, onNext, disabled }: { value: any; onChange: (next: any) => void; onNext: () => void; disabled: boolean }) {
  const update = (key: string, next: string) => onChange({ ...value, [key]: next });
  return (
    <div>
      <StepTitle icon={<BadgeCheck className="h-5 w-5" />} title="Technical Offer" subtitle="Enter product/service specifics that will be attached to your financial quote save." />
      <div className="mt-4 grid gap-4 md:grid-cols-2">
        <Input label="Make/Brand" value={value.makeBrand} onChange={next => update('makeBrand', next)} disabled={disabled} />
        <Input label="Model" value={value.model} onChange={next => update('model', next)} disabled={disabled} />
        <Field label="Offered product/service description" value={value.offeredItemDescription} onChange={next => update('offeredItemDescription', next)} disabled={disabled} />
        <Field label="Technical compliance remarks" value={value.complianceRemarks} onChange={next => update('complianceRemarks', next)} disabled={disabled} />
        <Input label="Delivery timeline" value={value.deliveryTimeline} onChange={next => update('deliveryTimeline', next)} disabled={disabled} />
        <Input label="Warranty details" value={value.warrantyDetails} onChange={next => update('warrantyDetails', next)} disabled={disabled} />
        <Input label="Service support" value={value.serviceSupport} onChange={next => update('serviceSupport', next)} disabled={disabled} />
        <Input label="Deviation, if any" value={value.deviation} onChange={next => update('deviation', next)} disabled={disabled} />
      </div>
      <div className="mt-5 flex justify-end">
        <button onClick={onNext} disabled={disabled} className="h-10 rounded-md bg-[#0b2447] px-4 text-xs font-black text-white disabled:opacity-50">Continue</button>
      </div>
    </div>
  );
}

function TechnicalDocumentsStep({ canUpload, files, uploadedDocs, uploading, onAdd, onRemove, onPreview, onUpload, onNext }: {
  canUpload: boolean;
  files: PendingFile[];
  uploadedDocs: ParticipationDocument[];
  uploading: boolean;
  onAdd: (files: FileList | File[]) => void;
  onRemove: (id: string) => void;
  onPreview: (item: PendingFile) => void;
  onUpload: () => void;
  onNext: () => void;
}) {
  return (
    <div>
      <StepTitle icon={<FileUp className="h-5 w-5" />} title="Upload Technical Documents" subtitle="Upload compliance, certificates, catalogues, experience proofs, and supporting technical documents." />
      <UploadDropZone disabled={!canUpload} multiple onFiles={onAdd} />
      <FileList files={files} onRemove={onRemove} onPreview={onPreview} />
      <UploadedList docs={uploadedDocs} title="Uploaded technical documents" />
      <div className="mt-5 flex flex-col gap-3 sm:flex-row sm:justify-end">
        <button onClick={onUpload} disabled={!canUpload || uploading || !files.length} className="inline-flex h-10 items-center justify-center gap-2 rounded-md bg-[#0b2447] px-4 text-xs font-black text-white disabled:opacity-50">
          {uploading ? <Loader2 className="h-4 w-4 animate-spin" /> : <FileCheck2 className="h-4 w-4" />} Upload documents
        </button>
        <button onClick={onNext} disabled={!uploadedDocs.length} className="h-10 rounded-md border border-slate-200 bg-white px-4 text-xs font-black text-slate-700 disabled:opacity-50">Continue</button>
      </div>
    </div>
  );
}

function FinancialQuoteStep({ canUpload, quote, setQuote, file, uploadedDocs, saving, onFile, onRemoveFile, onPreview, onSave, onNext }: {
  canUpload: boolean;
  quote: { quotedAmount: string; gstPercentage: string; totalAmount: string };
  setQuote: React.Dispatch<React.SetStateAction<{ quotedAmount: string; gstPercentage: string; totalAmount: string }>>;
  file: PendingFile | null;
  uploadedDocs: ParticipationDocument[];
  saving: boolean;
  onFile: (file?: File) => void;
  onRemoveFile: () => void;
  onPreview: (item: PendingFile | null) => void;
  onSave: () => void;
  onNext: () => void;
}) {
  return (
    <div>
      <StepTitle icon={<IndianRupee className="h-5 w-5" />} title="Financial Quote" subtitle="Upload the commercial quote and save sealed quotation values before final submission." />
      <div className="mt-4 grid gap-4 md:grid-cols-3">
        <Input label="Quoted amount" value={quote.quotedAmount} onChange={next => setQuote(prev => ({ ...prev, quotedAmount: next.replace(/[^\d.]/g, '') }))} disabled={!canUpload} required />
        <Input label="GST percentage" value={quote.gstPercentage} onChange={next => setQuote(prev => ({ ...prev, gstPercentage: next.replace(/[^\d.]/g, '') }))} disabled={!canUpload} required />
        <Input label="Total amount" value={quote.totalAmount} onChange={next => setQuote(prev => ({ ...prev, totalAmount: next.replace(/[^\d.]/g, '') }))} disabled={!canUpload} />
      </div>
      <div className="mt-4">
        <UploadDropZone disabled={!canUpload} onFiles={files => onFile(Array.from(files)[0])} />
        {file && <FileList files={[file]} onRemove={onRemoveFile} onPreview={onPreview} />}
      </div>
      <UploadedList docs={uploadedDocs} title="Uploaded financial quote documents" />
      <div className="mt-5 flex flex-col gap-3 sm:flex-row sm:justify-end">
        <button onClick={onSave} disabled={!canUpload || saving || !quote.quotedAmount} className="inline-flex h-10 items-center justify-center gap-2 rounded-md bg-[#0b2447] px-4 text-xs font-black text-white disabled:opacity-50">
          {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <ShieldCheck className="h-4 w-4" />} Save quote
        </button>
        <button onClick={onNext} disabled={!uploadedDocs.length && !quote.quotedAmount} className="h-10 rounded-md border border-slate-200 bg-white px-4 text-xs font-black text-slate-700 disabled:opacity-50">Continue</button>
      </div>
    </div>
  );
}

function ReviewStep({ bid, participation, technicalDocs, financialDocs, declaration, setDeclaration, allEligibilityChecked, onNext }: {
  bid: ProcurementBid;
  participation: ParticipationState | null;
  technicalDocs: ParticipationDocument[];
  financialDocs: ParticipationDocument[];
  declaration: boolean;
  setDeclaration: (value: boolean) => void;
  allEligibilityChecked: boolean;
  onNext: () => void;
}) {
  return (
    <div>
      <StepTitle icon={<ClipboardCheck className="h-5 w-5" />} title="Review & Declaration" subtitle="Review the submission summary and accept the declaration before final submit." />
      <div className="mt-4 grid gap-3 md:grid-cols-2">
        <Info label="Bid" value={`${bid.id} - ${bid.title}`} />
        <Info label="Participation" value={participation?.id ? `#${participation.id}` : 'Not started'} />
        <Info label="Eligibility checklist" value={allEligibilityChecked ? 'Completed' : 'Incomplete'} />
        <Info label="Technical documents" value={`${technicalDocs.length} uploaded`} />
        <Info label="Financial quote" value={financialDocs.length || participation?.quotedAmount ? 'Saved' : 'Pending'} />
        <Info label="Current status" value={participation?.submissionStatus || 'Draft'} />
      </div>
      <label className={`mt-5 flex items-start gap-3 border p-4 text-xs font-bold ${declaration ? 'border-emerald-200 bg-emerald-50 text-emerald-800' : 'border-slate-200 bg-white text-slate-600'}`}>
        <input type="checkbox" checked={declaration} onChange={event => setDeclaration(event.target.checked)} className="mt-0.5 h-4 w-4 accent-[#0b2447]" />
        I confirm that the uploaded documents and financial quote are accurate, complete, and submitted by an authorized seller representative.
      </label>
      <div className="mt-5 flex justify-end">
        <button onClick={onNext} disabled={!declaration} className="h-10 rounded-md bg-[#0b2447] px-4 text-xs font-black text-white disabled:opacity-50">Continue to submit</button>
      </div>
    </div>
  );
}

function SubmitStep({ canSubmit, submitted, submitting, onSubmit, onTrack }: { canSubmit: boolean; submitted: boolean; submitting: boolean; onSubmit: () => void; onTrack: () => void }) {
  return (
    <div>
      <StepTitle icon={<Send className="h-5 w-5" />} title="Submit Bid" subtitle="Final submission locks this participation for buyer evaluation." />
      <div className="mt-4 border border-slate-200 bg-slate-50 p-5 text-center">
        {submitted ? <CheckCircle2 className="mx-auto h-10 w-10 text-emerald-600" /> : <Lock className="mx-auto h-10 w-10 text-[#0b2447]" />}
        <p className="mt-3 text-sm font-black text-slate-800">{submitted ? 'Bid already submitted.' : 'Ready for final submission'}</p>
        <p className="mt-1 text-xs text-slate-500">{submitted ? 'You can track evaluation progress now.' : 'Please ensure all files and quote values are correct before submitting.'}</p>
      </div>
      <div className="mt-5 flex flex-col gap-3 sm:flex-row sm:justify-end">
        <button onClick={onTrack} className="h-10 rounded-md border border-slate-200 bg-white px-4 text-xs font-black text-slate-700">Track status</button>
        <button onClick={onSubmit} disabled={!canSubmit || submitting || submitted} className="inline-flex h-10 items-center justify-center gap-2 rounded-md bg-[#0b2447] px-4 text-xs font-black text-white disabled:opacity-50">
          {submitting ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />} Final submit
        </button>
      </div>
    </div>
  );
}

function TrackStep({ bid, participation }: { bid: ProcurementBid; participation: ParticipationState | null }) {
  return (
    <div>
      <StepTitle icon={<ShieldCheck className="h-5 w-5" />} title="Track Status" subtitle="Follow the submitted bid through technical and financial evaluation." />
      <div className="mt-4"><LifecycleTracker current={bid.currentStage} /></div>
      <div className="mt-5 grid gap-3 md:grid-cols-4">
        <Info label="Submission" value={participation?.submissionStatus || 'Draft'} />
        <Info label="Technical" value={participation?.technicalStatus || 'Pending'} />
        <Info label="Financial" value={participation?.financialStatus || 'Locked'} />
        <Info label="Final" value={participation?.finalStatus || 'Pending'} />
      </div>
    </div>
  );
}

function StepTitle({ icon, title, subtitle }: { icon: React.ReactNode; title: string; subtitle: string }) {
  return (
    <div className="flex items-start gap-3 border-b border-slate-100 pb-4">
      <div className="flex h-10 w-10 items-center justify-center rounded-md bg-[#0b2447] text-white">{icon}</div>
      <div>
        <h2 className="text-lg font-black text-[#0b2447]">{title}</h2>
        <p className="mt-1 text-xs text-slate-500">{subtitle}</p>
      </div>
    </div>
  );
}

function Panel({ title, items }: { title: string; items: string[] }) {
  return (
    <section className="border border-slate-200 p-4">
      <h3 className="text-sm font-black text-[#0b2447]">{title}</h3>
      <ul className="mt-3 space-y-2 text-xs leading-5 text-slate-600">
        {items.map(item => <li key={item} className="bg-slate-50 px-3 py-2">{item}</li>)}
      </ul>
    </section>
  );
}

function Input({ label, value, onChange, disabled, required }: { label: string; value: string; onChange: (value: string) => void; disabled?: boolean; required?: boolean }) {
  return (
    <label>
      <span className="mb-1 block text-[10px] font-black uppercase tracking-wider text-slate-500">{label} {required && <span className="text-red-500">*</span>}</span>
      <input value={value} onChange={event => onChange(event.target.value)} disabled={disabled} className={`${inputClass} disabled:bg-slate-50 disabled:text-slate-400`} />
    </label>
  );
}

function Field({ label, value, onChange, disabled, required }: { label: string; value: string; onChange: (value: string) => void; disabled?: boolean; required?: boolean }) {
  return (
    <label className="md:col-span-2">
      <span className="mb-1 block text-[10px] font-black uppercase tracking-wider text-slate-500">{label} {required && <span className="text-red-500">*</span>}</span>
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
      className={`mt-4 flex min-h-36 cursor-pointer flex-col items-center justify-center border border-dashed p-5 text-center transition ${disabled ? 'cursor-not-allowed border-slate-200 bg-slate-50 text-slate-400' : dragging ? 'border-[#0b2447] bg-blue-50 text-[#0b2447]' : 'border-slate-300 bg-white text-slate-600 hover:bg-slate-50'}`}
    >
      <FileUp className="h-8 w-8" />
      <span className="mt-3 text-sm font-black">Drag and drop files here</span>
      <span className="mt-1 text-xs">PDF, DOC, DOCX, XLS, XLSX, CSV, JPG, PNG up to 10 MB</span>
      <input disabled={disabled} type="file" multiple={multiple} accept=".pdf,.doc,.docx,.xls,.xlsx,.csv,.jpg,.jpeg,.png" onChange={event => event.target.files && onFiles(event.target.files)} className="hidden" />
    </label>
  );
}

function FileList({ files, onRemove, onPreview }: { files: PendingFile[]; onRemove: (id: string) => void; onPreview: (item: PendingFile) => void }) {
  if (!files.length) return null;
  return (
    <div className="mt-4 space-y-2">
      {files.map(item => (
        <div key={item.id} className="border border-slate-200 bg-slate-50 p-3">
          <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
            <FileText className="h-5 w-5 text-[#0b2447]" />
            <div className="min-w-0 flex-1">
              <p className="truncate text-xs font-black text-slate-800">{item.file.name}</p>
              <p className="text-[10px] font-bold text-slate-500">{formatBytes(item.file.size)} - {item.status}</p>
              {item.status === 'uploading' && <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-slate-200"><div className="h-full bg-[#0b2447]" style={{ width: `${item.progress}%` }} /></div>}
              {item.error && <p className="mt-1 text-[10px] font-bold text-red-600">{item.error}</p>}
            </div>
            <div className="flex gap-2">
              <button type="button" onClick={() => onPreview(item)} className="inline-flex h-8 items-center gap-1 rounded-md border border-slate-200 bg-white px-3 text-[10px] font-black text-slate-700"><Eye className="h-3.5 w-3.5" /> Preview</button>
              {item.status !== 'uploaded' && <button type="button" onClick={() => onRemove(item.id)} className="inline-flex h-8 items-center gap-1 rounded-md border border-red-200 bg-white px-3 text-[10px] font-black text-red-600"><Trash2 className="h-3.5 w-3.5" /> Remove</button>}
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
      <p className="text-[10px] font-black uppercase tracking-wider text-slate-500">{title}</p>
      <div className="mt-2 space-y-2">
        {docs.length ? docs.map((doc, index) => (
          <div key={`${doc.id || doc.fileName}-${index}`} className="flex items-center gap-2 border border-emerald-200 bg-emerald-50 p-3 text-xs font-bold text-emerald-800">
            <CheckCircle2 className="h-4 w-4" /> {doc.fileName || doc.documentName || 'Uploaded document'}
          </div>
        )) : <p className="border border-dashed border-slate-200 bg-slate-50 p-3 text-xs font-bold text-slate-500">No server-uploaded files yet.</p>}
      </div>
    </div>
  );
}
