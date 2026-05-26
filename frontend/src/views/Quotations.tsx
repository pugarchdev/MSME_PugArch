import React, { useEffect, useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import { toast } from 'sonner';
import {
  AlertCircle,
  ArrowRight,
  CheckCircle2,
  ClipboardCheck,
  Clock,
  FileText,
  Search,
  Send,
  Trophy,
  XCircle,
  LayoutGrid,
  List,
  FileSpreadsheet,
  ArrowUp,
  ArrowDown,
  ArrowUpDown,
  Power,
  Eye,
  Edit3,
  Trash2,
  Paperclip,
  Upload
} from 'lucide-react';
import { api } from '../lib/api';
import { Button } from '../components/ui/button';
import { Card, CardContent } from '../components/ui/card';
import { useAuth } from '../hooks/useAuth';
import { cn } from '../lib/utils';
import { Pagination } from '../features/shared/Pagination';
import { usePagination, useResponsiveViewMode } from '../features/shared/hooks';
import { normalizeList } from '../features/shared/apiClient';
import { DocumentPreviewModal } from '../components/DocumentPreviewModal';
import { getFileAssetPreview, type DocumentPreview } from '../lib/files';
import { compressImage } from '../lib/compress';

type BidStatus = 'pending' | 'submitted' | 'technical_qualified' | 'technical_rejected' | 'financial_evaluated' | 'accepted' | 'rejected' | 'withdrawn' | 'draft' | 'modified';

interface Quotation {
  id: number;
  source?: 'bid' | 'rfq';
  responseId?: number;
  sellerId: number;
  buyerId?: number;
  tenderId?: number;
  unitPrice: number;
  quantity: number;
  deliveryDays: number;
  warranty?: string;
  validTill?: string;
  status: BidStatus;
  note?: string;
  isLowest?: boolean;
  bidNumber?: string;
  documentUrl?: string;
  documentName?: string;
  rfqDocumentUrl?: string | null;
  rfqDocumentName?: string | null;
  fileAssetId?: number | null;
  fileAsset?: {
    id?: number;
    fileAssetId?: number;
    fileId?: number;
    originalName?: string;
    mimeType?: string;
    url?: string;
    signedUrl?: string;
    documentUrl?: string;
  } | null;
  tender?: {
    id?: number;
    tenderId?: string;
    title?: string;
    category?: string;
    budget?: number;
    status?: string;
    closesAt?: string;
  };
  seller?: {
    name: string;
    sellerProfile?: {
      businessName?: string;
      offices?: Array<{ city?: string; state?: string }>;
    };
  };
  buyer?: {
    name: string;
  };
  quoteResponses?: Array<{
    id: number;
    status?: string;
    totalAmount?: number;
    deliveryDays?: number;
    validityDate?: string;
    notes?: string;
    documentUrl?: string;
    documentName?: string;
    fileAssetId?: number | null;
    fileAsset?: Quotation['fileAsset'];
  }>;
}

const normalizeBidStatus = (value?: string): BidStatus => {
  const normalized = String(value || 'pending').toLowerCase();
  if (normalized === 'sent') return 'pending';
  if (normalized === 'responded') return 'submitted';
  if (normalized === 'closed' || normalized === 'cancelled' || normalized === 'withdrawn') return 'withdrawn';
  if (normalized === 'approved') return 'accepted';
  if (normalized === 'draft') return 'draft';
  if (normalized === 'accepted') return 'accepted';
  if (normalized === 'rejected') return 'rejected';
  if (normalized === 'submitted') return 'submitted';
  return 'pending';
};

const quoteRequestToRecord = (rfq: any): Quotation => {
  const response = Array.isArray(rfq.quoteResponses) ? rfq.quoteResponses[0] : null;
  const amount = response ? Number(response.totalAmount || 0) : Number(rfq.estimatedValue || 0);
  return {
    id: Number(rfq.id),
    source: 'rfq',
    responseId: response?.id ? Number(response.id) : undefined,
    sellerId: Number(rfq.sellerId),
    buyerId: Number(rfq.buyerId),
    tenderId: 0,
    unitPrice: amount,
    quantity: amount ? 1 : 0,
    deliveryDays: Number(response?.deliveryDays || 0),
    validTill: response?.validityDate,
    status: response ? normalizeBidStatus(response.status) : normalizeBidStatus(rfq.statusEnum || rfq.status),
    note: response?.notes || rfq.message,
    documentUrl: response?.documentUrl || null,
    documentName: response?.documentName || null,
    rfqDocumentUrl: rfq.documentUrl || null,
    rfqDocumentName: rfq.documentName || null,
    fileAssetId: response?.fileAssetId || rfq.fileAssetId || null,
    fileAsset: response?.fileAsset || rfq.fileAsset || null,
    tender: {
      id: Number(rfq.id),
      tenderId: `RFQ-${String(rfq.id).padStart(4, '0')}`,
      title: rfq.subject || `RFQ #${rfq.id}`,
      category: 'Request for Quote',
      status: rfq.status
    },
    seller: rfq.seller,
    buyer: rfq.buyer,
    quoteResponses: Array.isArray(rfq.quoteResponses) ? rfq.quoteResponses : []
  };
};

const statusStyles: Record<BidStatus, string> = {
  pending: 'border-amber-200 bg-amber-50 text-amber-800',
  submitted: 'border-blue-200 bg-slate-50 text-blue-800',
  technical_qualified: 'border-teal-200 bg-teal-50 text-teal-800',
  technical_rejected: 'border-red-200 bg-red-50 text-red-800',
  financial_evaluated: 'border-purple-200 bg-purple-50 text-purple-800',
  accepted: 'border-emerald-200 bg-emerald-50 text-emerald-800',
  rejected: 'border-red-200 bg-red-50 text-red-800',
  withdrawn: 'border-slate-200 bg-slate-100 text-slate-700',
  draft: 'border-slate-200 bg-slate-50 text-slate-600',
  modified: 'border-indigo-200 bg-indigo-50 text-[#12335f]'
};

const statusIcons: Record<BidStatus, React.ElementType> = {
  pending: Clock,
  submitted: Clock,
  technical_qualified: CheckCircle2,
  technical_rejected: XCircle,
  financial_evaluated: ClipboardCheck,
  accepted: CheckCircle2,
  rejected: XCircle,
  withdrawn: Power,
  draft: FileText,
  modified: Clock
};

const getStatusLabel = (status: BidStatus) => {
  switch (status) {
    case 'pending':
      return 'Pending';
    case 'submitted':
      return 'Submitted';
    case 'technical_qualified':
      return 'Tech Qualified';
    case 'technical_rejected':
      return 'Tech Rejected';
    case 'financial_evaluated':
      return 'Fin Evaluated';
    case 'accepted':
      return 'Accepted';
    case 'rejected':
      return 'Rejected';
    case 'withdrawn':
      return 'Inactive';
    case 'draft':
      return 'Draft';
    case 'modified':
      return 'Modified';
    default:
      return String(status || '').toUpperCase();
  }
};

const formatMoney = (value?: number) => `Rs. ${Number(value || 0).toLocaleString('en-IN')}`;
const formatDateTime = (val?: string) => val ? new Date(val).toLocaleString('en-IN', { dateStyle: 'medium', timeStyle: 'short' }) : '-';
const toDateInputValue = (val?: string) => val ? val.split('T')[0] : '';
const getQuoteSubmittedAt = (q: Quotation) => (q as any).createdAt || (q as any).submittedAt;
const getQuoteUpdatedAt = (q: Quotation) => (q as any).updatedAt || (q as any).lastModified;
const getFileNameFromUrl = (url?: string, fallback = 'Quotation document') => {
  if (!url) return fallback;
  const cleanUrl = String(url).split('?')[0];
  const name = cleanUrl.substring(cleanUrl.lastIndexOf('/') + 1);
  try {
    return decodeURIComponent(name || fallback);
  } catch {
    return name || fallback;
  }
};

const getQuoteDocument = (quote: Quotation) => {
  const responseDocument = quote.quoteResponses?.find(response => response.fileAssetId || response.documentUrl || response.fileAsset);
  const fileAsset = quote.fileAsset || responseDocument?.fileAsset || undefined;
  const fileAssetId = Number(quote.fileAssetId || responseDocument?.fileAssetId || fileAsset?.id || fileAsset?.fileAssetId || fileAsset?.fileId || 0) || undefined;
  const documentUrl = quote.documentUrl || responseDocument?.documentUrl || fileAsset?.documentUrl || fileAsset?.signedUrl || fileAsset?.url;
  const label = quote.documentName || responseDocument?.documentName || fileAsset?.originalName || getFileNameFromUrl(documentUrl) || 'Quotation document';

  if (!fileAssetId && !documentUrl) return null;
  return {
    label,
    fileAsset: {
      ...fileAsset,
      id: fileAssetId,
      fileAssetId,
      fileId: fileAssetId,
      url: documentUrl,
      documentUrl
    }
  };
};

const canSellerManageBid = (quote: Quotation, role?: string) =>
  role === 'seller' && quote.source !== 'rfq' && !['accepted', 'rejected'].includes(quote.status);
const isDecisionOpen = (quote: Quotation) =>
  quote.source === 'rfq'
    ? Boolean(quote.responseId) && quote.status === 'submitted'
    : ['pending', 'submitted', 'technical_qualified', 'financial_evaluated', 'modified'].includes(quote.status);

function InfoBox({ label, value, strong = false }: { label: string; value: string | number; strong?: boolean }) {
  return (
    <div className="rounded-md border border-slate-200 bg-white px-3 py-2">
      <p className="text-[10px] font-bold uppercase tracking-wider text-slate-500">{label}</p>
      <p className={cn('mt-1 break-words text-sm font-bold text-slate-800', strong && 'text-[#12335f]')}>
        {value}
      </p>
    </div>
  );
}

function QuotationDetailsModal({
  quote,
  role,
  onClose,
  onOpenDocument
}: {
  quote: Quotation;
  role?: string;
  onClose: () => void;
  onOpenDocument: (url: string, label: string, fileAssetId?: number | null) => void;
}) {
  const StatusIcon = statusIcons[quote.status] || Clock;
  const sellerName = quote.seller?.sellerProfile?.businessName || quote.seller?.name || '-';
  const buyerName = quote.buyer?.name || '-';
  const totalValue = Number(quote.unitPrice || 0) * Number(quote.quantity || 0);
  const quoteDocument = getQuoteDocument(quote);

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/60 p-4 backdrop-blur-sm">
      <div className="w-full max-w-3xl overflow-hidden rounded-lg border border-slate-200 bg-white shadow-2xl">
        <div className="flex items-start justify-between gap-4 border-b border-slate-200 bg-slate-50 px-5 py-4">
          <div>
            <p className="text-[10px] font-black uppercase tracking-widest text-[#12335f]">Quotation Details</p>
            <h2 className="mt-1 text-lg font-black text-[#071632]">{quote.tender?.title || `${quote.source === 'rfq' ? 'RFQ' : 'BID'} #${quote.id}`}</h2>
            <p className="mt-1 text-xs font-semibold text-slate-500">
              {quote.bidNumber || `${quote.source === 'rfq' ? 'RFQ' : 'BID'}-${String(quote.id).padStart(4, '0')}`} | {quote.tender?.tenderId || `Tender #${quote.tenderId || '-'}`}
            </p>
          </div>
          <button onClick={onClose} className="flex h-8 w-8 items-center justify-center rounded-md border border-slate-200 bg-white text-slate-500 hover:bg-slate-100" title="Close">
            <XCircle className="h-4 w-4" />
          </button>
        </div>

        <div className="max-h-[75vh] overflow-y-auto p-5">
          <div className="mb-4 flex flex-wrap items-center gap-2">
            <span className={cn('inline-flex items-center gap-1 rounded border px-2.5 py-1 text-[10px] font-bold uppercase tracking-wide', statusStyles[quote.status])}>
              <StatusIcon className="h-3.5 w-3.5" />
              {getStatusLabel(quote.status)}
            </span>
            {quote.isLowest && (
              <span className="inline-flex items-center gap-1 rounded border border-amber-200 bg-amber-50 px-2.5 py-1 text-[10px] font-bold uppercase tracking-wide text-amber-700">
                <Trophy className="h-3.5 w-3.5" />
                Lowest quoted rate
              </span>
            )}
          </div>

          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
            <InfoBox label={role === 'seller' ? 'Buyer' : 'Supplier'} value={role === 'seller' ? buyerName : sellerName} />
            <InfoBox label="Category" value={quote.tender?.category || 'General Procurement'} />
            <InfoBox label="Unit Rate" value={formatMoney(quote.unitPrice)} />
            <InfoBox label="Net Value" value={formatMoney(totalValue)} strong />
            <InfoBox label="Quantity" value={quote.quantity || '-'} />
            <InfoBox label="Delivery" value={quote.deliveryDays ? `${quote.deliveryDays} days` : '-'} />
            <InfoBox label="Warranty" value={quote.warranty || 'Not Provided'} />
            <InfoBox label="Valid Till" value={formatDateTime(quote.validTill)} />
            <InfoBox label="Submitted Date & Time" value={formatDateTime(getQuoteSubmittedAt(quote))} />
            <InfoBox label="Last Updated" value={formatDateTime(getQuoteUpdatedAt(quote))} />
            <InfoBox label="Tender Closing" value={formatDateTime(quote.tender?.closesAt)} />

            {/* Buyer RFQ Document */}
            {quote.rfqDocumentUrl ? (
              <div className="rounded-md border border-slate-200 bg-slate-50/50 px-3 py-2 lg:col-span-2">
                <p className="text-[10px] font-bold uppercase tracking-wider text-[#12335f]">RFQ Specifications</p>
                <div className="mt-2 flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
                  <div className="min-w-0">
                    <p className="truncate text-sm font-black text-slate-800">
                      {quote.rfqDocumentName || getFileNameFromUrl(quote.rfqDocumentUrl, 'RFQ Specifications')}
                    </p>
                    <p className="text-[10px] font-bold uppercase tracking-wide text-slate-500">Attached by buyer</p>
                  </div>
                  <Button
                    type="button"
                    variant="outline"
                    onClick={() => onOpenDocument(quote.rfqDocumentUrl!, quote.rfqDocumentName || 'RFQ Specifications', null)}
                    className="h-8 shrink-0 rounded-md border-slate-200 bg-white px-3 text-[10px] font-black uppercase text-[#12335f] hover:bg-slate-50"
                  >
                    <FileText className="mr-1.5 h-3.5 w-3.5" />
                    View Document
                  </Button>
                </div>
              </div>
            ) : null}

            {/* Seller Response Document */}
            {quoteDocument ? (
              <div className="rounded-md border border-emerald-200 bg-emerald-50/40 px-3 py-2 lg:col-span-2">
                <p className="text-[10px] font-bold uppercase tracking-wider text-emerald-700">Proposal Document</p>
                <div className="mt-2 flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
                  <div className="min-w-0">
                    <p className="truncate text-sm font-black text-slate-800">{quoteDocument.label}</p>
                    <p className="text-[10px] font-bold uppercase tracking-wide text-emerald-700">Attached by seller</p>
                  </div>
                  <Button
                    type="button"
                    variant="outline"
                    onClick={() => onOpenDocument(quoteDocument.fileAsset.url || '', quoteDocument.label, quoteDocument.fileAsset.id)}
                    className="h-8 shrink-0 rounded-md border-emerald-200 bg-white px-3 text-[10px] font-black uppercase text-emerald-700 hover:bg-emerald-50"
                  >
                    <FileText className="mr-1.5 h-3.5 w-3.5" />
                    View Document
                  </Button>
                </div>
              </div>
            ) : (
              !quote.rfqDocumentUrl && <InfoBox label="Document" value="Not Attached" />
            )}
          </div>

          {quote.note && (
            <div className="mt-4 rounded-md border border-slate-200 bg-slate-50 p-4">
              <p className="text-[10px] font-black uppercase tracking-wider text-slate-500">{quote.source === 'rfq' ? 'RFQ / Response Notes' : 'Seller Note'}</p>
              <p className="mt-1 whitespace-pre-wrap text-sm font-medium leading-relaxed text-slate-700">{quote.note}</p>
            </div>
          )}
        </div>

        <div className="flex justify-end border-t border-slate-200 bg-slate-50 px-5 py-4">
          <Button type="button" onClick={onClose} className="h-9 rounded-md bg-[#12335f] px-4 text-xs font-black uppercase text-white hover:bg-[#0b2445]">
            Close
          </Button>
        </div>
      </div>
    </div>
  );
}

function BidEditModal({
  quote,
  saving,
  onClose,
  onSubmit
}: {
  quote: Quotation;
  saving: boolean;
  onClose: () => void;
  onSubmit: (event: React.FormEvent<HTMLFormElement>) => void;
}) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/60 p-4 backdrop-blur-sm">
      <div className="w-full max-w-2xl overflow-hidden rounded-lg border border-slate-200 bg-white shadow-2xl">
        <div className="flex items-start justify-between gap-4 border-b border-slate-200 bg-slate-50 px-5 py-4">
          <div>
            <p className="text-[10px] font-black uppercase tracking-widest text-[#12335f]">Edit Quotation</p>
            <h2 className="mt-1 text-lg font-black text-[#071632]">{quote.tender?.title || `BID #${quote.id}`}</h2>
            <p className="mt-1 text-xs font-semibold text-slate-500">Update pricing, delivery, validity, and seller notes.</p>
          </div>
          <button onClick={onClose} className="flex h-8 w-8 items-center justify-center rounded-md border border-slate-200 bg-white text-slate-500 hover:bg-slate-100" title="Close">
            <XCircle className="h-4 w-4" />
          </button>
        </div>

        <form onSubmit={onSubmit} className="space-y-4 p-5">
          <div className="grid gap-4 sm:grid-cols-3">
            <label className="block text-[10px] font-black uppercase tracking-wider text-slate-500">
              Unit Rate
              <input name="unitPrice" type="number" min="1" step="0.01" required defaultValue={quote.unitPrice || ''} className="mt-1 h-11 w-full rounded-md border border-slate-200 px-3 text-sm font-semibold outline-none focus:ring-2 focus:ring-[#12335f]/20" />
            </label>
            <label className="block text-[10px] font-black uppercase tracking-wider text-slate-500">
              Quantity
              <input name="quantity" type="number" min="1" required defaultValue={quote.quantity || ''} className="mt-1 h-11 w-full rounded-md border border-slate-200 px-3 text-sm font-semibold outline-none focus:ring-2 focus:ring-[#12335f]/20" />
            </label>
            <label className="block text-[10px] font-black uppercase tracking-wider text-slate-500">
              Delivery Days
              <input name="deliveryDays" type="number" min="1" required defaultValue={quote.deliveryDays || ''} className="mt-1 h-11 w-full rounded-md border border-slate-200 px-3 text-sm font-semibold outline-none focus:ring-2 focus:ring-[#12335f]/20" />
            </label>
          </div>

          <div className="grid gap-4 sm:grid-cols-2">
            <label className="block text-[10px] font-black uppercase tracking-wider text-slate-500">
              Warranty
              <input name="warranty" type="text" maxLength={500} defaultValue={quote.warranty || ''} className="mt-1 h-11 w-full rounded-md border border-slate-200 px-3 text-sm font-semibold outline-none focus:ring-2 focus:ring-[#12335f]/20" />
            </label>
            <label className="block text-[10px] font-black uppercase tracking-wider text-slate-500">
              Valid Till
              <input name="validTill" type="date" defaultValue={toDateInputValue(quote.validTill)} className="mt-1 h-11 w-full rounded-md border border-slate-200 px-3 text-sm font-semibold outline-none focus:ring-2 focus:ring-[#12335f]/20" />
            </label>
          </div>

          <label className="block text-[10px] font-black uppercase tracking-wider text-slate-500">
            Seller Note
            <textarea name="note" rows={4} defaultValue={quote.note || ''} maxLength={2000} className="mt-1 w-full rounded-md border border-slate-200 px-3 py-2 text-sm font-semibold outline-none focus:ring-2 focus:ring-[#12335f]/20" />
          </label>

          <div className="flex justify-end gap-2 border-t border-slate-200 pt-4">
            <Button type="button" variant="outline" onClick={onClose} className="h-10 text-xs font-black uppercase">Cancel</Button>
            <Button type="submit" disabled={saving} className="h-10 bg-[#12335f] text-xs font-black uppercase text-white hover:bg-[#0b2445] disabled:opacity-60">
              {saving ? 'Saving...' : 'Save Changes'}
            </Button>
          </div>
        </form>
      </div>
    </div>
  );
}

export default function Quotations() {
  const { user } = useAuth();
  const router = useRouter();
  const authOptions = { headers: { Authorization: `Bearer ${localStorage.getItem('token')}` } };
  const cachedSellerBids = user?.role === 'seller' ? api.peek('/api/bids/my', authOptions) : null;
  const cachedBuyerTenders = user?.role === 'buyer' ? api.peek('/api/tenders', authOptions) : null;

  const [quotes, setQuotes] = useState<Quotation[]>(normalizeList<Quotation>(cachedSellerBids));
  const [tenders, setTenders] = useState<any[]>(normalizeList<any>(cachedBuyerTenders));
  const [loading, setLoading] = useState(!(cachedSellerBids || cachedBuyerTenders));
  const [searchTerm, setSearchTerm] = useState('');
  const [statusFilter, setStatusFilter] = useState<'all' | BidStatus>('all');
  const [selectedTenderId, setSelectedTenderId] = useState('all');
  const [viewMode, setViewMode] = useResponsiveViewMode();
  const [buyerTendersReady, setBuyerTendersReady] = useState(false);
  const [responseTarget, setResponseTarget] = useState<Quotation | null>(null);
  const [detailsTarget, setDetailsTarget] = useState<Quotation | null>(null);
  const [editTarget, setEditTarget] = useState<Quotation | null>(null);
  const [previewDocument, setPreviewDocument] = useState<DocumentPreview | null>(null);
  const [responding, setResponding] = useState(false);
  const [savingEdit, setSavingEdit] = useState(false);
  const [deletingId, setDeletingId] = useState<number | null>(null);

  const [sortField, setSortField] = useState<'id' | 'title' | 'seller' | 'rate' | 'qty' | 'netValue' | 'status'>('id');
  const [sortOrder, setSortOrder] = useState<'asc' | 'desc'>('desc');

  const toggleSort = (field: 'id' | 'title' | 'seller' | 'rate' | 'qty' | 'netValue' | 'status') => {
    if (sortField === field) {
      setSortOrder(sortOrder === 'asc' ? 'desc' : 'asc');
    } else {
      setSortField(field);
      setSortOrder('asc');
    }
  };

  const SortHeader = ({ label, field, className = '' }: { label: string; field: 'id' | 'title' | 'seller' | 'rate' | 'qty' | 'netValue' | 'status'; className?: string }) => {
    const isActive = sortField === field;
    return (
      <button
        type="button"
        onClick={() => toggleSort(field)}
        className={cn(
          "inline-flex items-center gap-1 text-[10px] font-black uppercase tracking-wider text-slate-500 hover:text-[#12335f] transition-colors",
          isActive && "text-[#12335f]",
          className
        )}
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

  useEffect(() => {
    if (user?.role === 'seller') fetchMyBids();
    if (user?.role === 'buyer') fetchMyTenders();
  }, [user?.role]);

  useEffect(() => {
    if (user?.role === 'buyer' && buyerTendersReady) fetchBuyerBids();
  }, [user?.role, tenders.length, selectedTenderId, buyerTendersReady]);

  const fetchMyTenders = async () => {
    if (tenders.length === 0) setLoading(true);
    try {
      const res = await api.get('/api/tenders', authOptions);
      if (!res.ok) throw new Error('Failed to load tenders');
      const data = await res.json();
      const tenderList = normalizeList<any>(data);
      setTenders(tenderList);
      if (tenderList.length === 0) setQuotes([]);
    } catch {
      toast.error('Failed to load your tenders');
    } finally {
      setBuyerTendersReady(true);
      setLoading(false);
    }
  };

  const fetchMyBids = async () => {
    if (quotes.length === 0) setLoading(true);
    try {
      const [bidsRes, rfqRes] = await Promise.all([
        api.get('/api/bids/my', authOptions).catch(() => null),
        api.get('/api/quote-requests', authOptions).catch(() => null)
      ]);
      const bidsData = bidsRes?.ok ? await bidsRes.json() : [];
      const rfqData = rfqRes?.ok ? await rfqRes.json() : [];
      const tenderBids = normalizeList<Quotation>(bidsData).map(bid => ({ ...bid, source: 'bid' as const }));
      const rfqs = normalizeList<any>(rfqData).map(quoteRequestToRecord);
      setQuotes([...rfqs, ...tenderBids]);
    } catch {
      toast.error('Failed to load your bids and RFQs');
    } finally {
      setLoading(false);
    }
  };

  const handleRfqResponse = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!responseTarget) return;
    const form = new FormData(event.currentTarget);
    const payload = {
      totalAmount: Number(form.get('totalAmount') || 0),
      deliveryDays: Number(form.get('deliveryDays') || 0) || undefined,
      validityDate: String(form.get('validityDate') || '') || undefined,
      notes: String(form.get('notes') || '').trim() || undefined,
      documentUrl: String(form.get('documentUrl') || '').trim() || undefined
    };
    setResponding(true);
    try {
      const res = await api.post(`/api/quote-requests/${responseTarget.id}/responses`, payload, authOptions);
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        throw new Error(body?.message || 'Unable to submit RFQ response');
      }
      toast.success('RFQ response submitted successfully');
      setResponseTarget(null);
      await fetchMyBids();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Unable to submit RFQ response');
    } finally {
      setResponding(false);
    }
  };

  const fetchBuyerBids = async () => {
    if (quotes.length === 0) setLoading(true);
    try {
      const tenderIds = selectedTenderId === 'all'
        ? tenders.map(tender => tender.id)
        : [Number(selectedTenderId)];
      let allBids: Quotation[] = [];

      for (const tenderId of tenderIds) {
        const res = await api.get(`/api/tenders/${tenderId}/bids`, authOptions);
        if (!res.ok) continue;
        const data = await res.json();
        const bids = normalizeList<Quotation>(data);
        const tender = tenders.find(item => item.id === tenderId);
        const prices = bids.map((bid: Quotation) => Number(bid.unitPrice || 0)).filter(Boolean);
        const lowestPrice = prices.length > 0 ? Math.min(...prices) : null;
        allBids = [
          ...allBids,
          ...bids.map((bid: Quotation) => ({
            ...bid,
            tender,
            isLowest: lowestPrice !== null && Number(bid.unitPrice) === lowestPrice && bids.length > 1
          }))
        ];
      }

      if (selectedTenderId === 'all') {
        const rfqRes = await api.get('/api/quote-requests', authOptions).catch(() => null);
        if (rfqRes?.ok) {
          const rfqData = await rfqRes.json();
          const rfqs = normalizeList<any>(rfqData).map(quoteRequestToRecord);
          allBids = [...rfqs, ...allBids];
        }
      }

      setQuotes(allBids);
    } catch {
      toast.error('Failed to load quotations');
    } finally {
      setLoading(false);
    }
  };

  const handleStatusUpdate = async (quote: Quotation, status: BidStatus) => {
    try {
      if (quote.source === 'rfq' && !quote.responseId) {
        throw new Error('The seller has not submitted a response yet');
      }
      const endpoint = quote.source === 'rfq'
        ? `/api/quote-responses/${quote.responseId}/${status === 'accepted' ? 'accept' : 'reject'}`
        : `/api/bids/${quote.id}/status`;
      const payload = quote.source === 'rfq' ? {} : { status };
      const res = await api.post(endpoint, payload, authOptions);
      if (!res.ok) {
        const data = await res.json().catch(() => null);
        throw new Error(data?.message || 'Update failed');
      }
      toast.success(`Quotation ${status === 'accepted' ? 'accepted' : 'rejected'} successfully`);
      fetchBuyerBids();
    } catch (err: any) {
      toast.error(err?.message || 'Network error');
    }
  };

  const handleViewQuote = async (quote: Quotation) => {
    setDetailsTarget(quote);
    if (quote.source === 'rfq') return;

    try {
      const res = await api.get(`/api/bids/${quote.id}`, authOptions);
      if (res.ok) {
        const body = await res.json();
        const data = body?.data || body;
        setDetailsTarget({ ...quote, ...data, source: 'bid' });
      }
    } catch {
      // Keep row-level details visible if the full detail endpoint is unavailable.
    }
  };

  const handleOpenQuoteDocument = async (url: string, label: string, fileAssetId?: number | null) => {
    try {
      const asset = { url, id: fileAssetId, fileAssetId, fileId: fileAssetId };
      setPreviewDocument(await getFileAssetPreview(asset, label));
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Unable to open document');
    }
  };

  const handleEditBid = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!editTarget) return;

    const form = new FormData(event.currentTarget);
    const payload = {
      unitPrice: Number(form.get('unitPrice') || 0),
      quantity: Number(form.get('quantity') || 0),
      deliveryDays: Number(form.get('deliveryDays') || 0),
      warranty: String(form.get('warranty') || '').trim() || null,
      validTill: String(form.get('validTill') || '') || null,
      note: String(form.get('note') || '').trim() || null
    };

    setSavingEdit(true);
    try {
      const res = await api.put(`/api/bids/${editTarget.id}`, payload, authOptions);
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        throw new Error(body?.message || 'Unable to update quotation');
      }
      toast.success('Quotation updated successfully');
      setEditTarget(null);
      await fetchMyBids();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Unable to update quotation');
    } finally {
      setSavingEdit(false);
    }
  };

  const handleDeleteBid = async (quote: Quotation) => {
    if (!window.confirm(`Delete ${quote.source === 'rfq' ? 'RFQ' : 'BID'}-${String(quote.id).padStart(4, '0')}? This cannot be undone.`)) return;

    setDeletingId(quote.id);
    try {
      const res = await api.delete(`/api/bids/${quote.id}`, authOptions);
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        throw new Error(body?.message || 'Unable to delete quotation');
      }
      toast.success('Quotation deleted successfully');
      setQuotes(current => current.filter(item => !(item.source !== 'rfq' && item.id === quote.id)));
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Unable to delete quotation');
    } finally {
      setDeletingId(null);
    }
  };

  // Trigger Next.js SWC recompilation to clear stale build errors
  const filteredQuotes = useMemo(() => {
    const query = searchTerm.trim().toLowerCase();
    const list = quotes.filter((quote) => {
      const tenderText = `${quote.tender?.tenderId || ''} ${quote.tender?.title || ''} ${quote.tender?.category || ''}`.toLowerCase();
      const sellerText = `${quote.seller?.name || ''} ${quote.seller?.sellerProfile?.businessName || ''}`.toLowerCase();
      const buyerText = `${quote.buyer?.name || ''} ${quote.note || ''}`.toLowerCase();
      const matchesSearch = !query || tenderText.includes(query) || sellerText.includes(query) || buyerText.includes(query);
      const matchesStatus = statusFilter === 'all' || quote.status === statusFilter;
      return matchesSearch && matchesStatus;
    });

    return list.sort((a, b) => {
      let aVal: any = '';
      let bVal: any = '';

      if (sortField === 'id') {
        aVal = a.id;
        bVal = b.id;
      } else if (sortField === 'title') {
        aVal = a.tender?.title || '';
        bVal = b.tender?.title || '';
      } else if (sortField === 'seller') {
        aVal = a.seller?.sellerProfile?.businessName || a.seller?.name || '';
        bVal = b.seller?.sellerProfile?.businessName || b.seller?.name || '';
      } else if (sortField === 'rate') {
        aVal = Number(a.unitPrice || 0);
        bVal = Number(b.unitPrice || 0);
      } else if (sortField === 'qty') {
        aVal = Number(a.quantity || 0);
        bVal = Number(b.quantity || 0);
      } else if (sortField === 'netValue') {
        aVal = Number(a.unitPrice || 0) * Number(a.quantity || 0);
        bVal = Number(b.unitPrice || 0) * Number(b.quantity || 0);
      } else if (sortField === 'status') {
        aVal = a.status || '';
        bVal = b.status || '';
      }

      if (typeof aVal === 'string') {
        return sortOrder === 'asc' ? aVal.localeCompare(bVal) : bVal.localeCompare(aVal);
      } else {
        return sortOrder === 'asc' ? aVal - bVal : bVal - aVal;
      }
    });
  }, [quotes, searchTerm, statusFilter, sortField, sortOrder]);
  const { page, pageSize, pageItems: pagedQuotes, total, setPage, setPageSize } = usePagination(filteredQuotes, 10);

  const stats = useMemo(() => {
    const total = quotes.length;
    const evaluableStatuses: BidStatus[] = ['pending', 'submitted', 'technical_qualified', 'financial_evaluated', 'modified'];
    const pending = quotes.filter(quote => evaluableStatuses.includes(quote.status)).length;
    const accepted = quotes.filter(quote => quote.status === 'accepted').length;
    const rejected = quotes.filter(quote => quote.status === 'rejected' || quote.status === 'technical_rejected').length;
    const totalValue = quotes.reduce((sum, quote) => sum + Number(quote.unitPrice || 0) * Number(quote.quantity || 0), 0);
    return { total, pending, accepted, rejected, totalValue };
  }, [quotes]);

  return (
    <div className="min-h-screen bg-slate-50 px-3 py-5 text-slate-900 sm:px-5 md:px-8">
      <div className="mx-auto max-w-7xl space-y-6">
        <div className="flex flex-col gap-4 md:flex-row md:items-end md:justify-between">
          <div>
            <p className="text-[11px] font-bold uppercase tracking-[0.16em] text-slate-500">
              {user?.role === 'buyer' ? 'Bid Evaluation' : 'Market Participation'}
            </p>
            <h1 className="mt-2 text-2xl font-extrabold tracking-tight text-[#071632] md:text-3xl">
              {user?.role === 'buyer' ? 'Quotations' : 'Bids & RFQs'}
            </h1>
            <p className="mt-1 max-w-2xl text-sm font-medium text-slate-600">
              {user?.role === 'buyer'
                ? 'Review submitted quotations, compare pricing, and record procurement decisions.'
                : 'Track submitted tender bids and respond to buyer RFQ requests from marketplace.'}
            </p>
          </div>

          <Button
            onClick={() => router.push(user?.role === 'seller' ? '/seller/marketplace' : '/buyer/tenders')}
            className="h-10 rounded-md bg-[#12335f] px-5 text-xs font-bold uppercase tracking-wide text-white hover:bg-[#0b2445]"
          >
            <Send className="mr-2 h-4 w-4" />
            {user?.role === 'seller' ? 'Open Marketplace' : 'View Tenders'}
          </Button>
        </div>

        <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
          <SummaryTile label={user?.role === 'buyer' ? 'Total Quotations' : 'Bids / RFQs'} value={stats.total} icon={ClipboardCheck} />
          <SummaryTile label="Pending Review" value={stats.pending} icon={Clock} tone="amber" />
          <SummaryTile label="Accepted" value={stats.accepted} icon={CheckCircle2} tone="green" />
          <SummaryTile label={user?.role === 'buyer' ? 'Quoted Value' : 'Response Value'} value={formatMoney(stats.totalValue)} icon={FileText} />
        </div>

        <Card className="rounded-lg border border-slate-200 shadow-sm">
          <CardContent className="p-4">
            <div className="flex flex-col gap-3 md:flex-row md:items-center">
              <div className="relative flex-1">
                <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
                <input
                  value={searchTerm}
                  onChange={(event) => setSearchTerm(event.target.value)}
                  placeholder={user?.role === 'buyer' ? 'Search by seller, tender ID, or category' : 'Search by RFQ, buyer, tender ID, or title'}
                  className="h-10 w-full rounded-md border border-slate-300 bg-white pl-9 pr-3 text-sm font-medium outline-none transition focus:ring-2 focus:ring-[#12335f]"
                />
              </div>

              <div className="flex flex-wrap items-center gap-2">
                {user?.role === 'buyer' && (
                  <select
                    value={selectedTenderId}
                    onChange={(event) => setSelectedTenderId(event.target.value)}
                    className="h-10 rounded-md border border-slate-300 bg-white px-3 text-sm font-semibold text-slate-700 outline-none transition focus:ring-2 focus:ring-[#12335f]"
                  >
                    <option value="all">All tenders</option>
                    {tenders.map(tender => (
                      <option key={tender.id} value={tender.id}>{tender.tenderId} - {tender.title}</option>
                    ))}
                  </select>
                )}

                <select
                  value={statusFilter}
                  onChange={(event) => setStatusFilter(event.target.value as 'all' | BidStatus)}
                  className="h-10 rounded-md border border-slate-300 bg-white px-3 text-sm font-semibold text-slate-700 outline-none transition focus:ring-2 focus:ring-[#12335f]"
                >
                  <option value="all">All status</option>
                  <option value="pending">Pending</option>
                  <option value="accepted">Accepted</option>
                  <option value="rejected">Rejected</option>
                </select>

                <div className="h-10 w-px bg-slate-200 mx-1 hidden md:block" />

                <div className="flex items-center gap-1 rounded-lg bg-[#f1f3f4] p-1 border border-[#dadce0] h-10">
                  <button
                    type="button"
                    onClick={() => setViewMode('grid')}
                    className={cn(
                      "flex h-8 w-9 items-center justify-center rounded transition-all",
                      viewMode === 'grid' ? "bg-white shadow-sm border border-[#dadce0] text-[#12335f]" : "text-slate-500 hover:text-slate-700"
                    )}
                  >
                    <LayoutGrid className="h-4 w-4" />
                  </button>
                  <button
                    type="button"
                    onClick={() => setViewMode('list')}
                    className={cn(
                      "flex h-8 w-9 items-center justify-center rounded transition-all",
                      viewMode === 'list' ? "bg-white shadow-sm border border-[#dadce0] text-[#12335f]" : "text-slate-500 hover:text-slate-700"
                    )}
                  >
                    <List className="h-4 w-4" />
                  </button>
                </div>
              </div>
            </div>
          </CardContent>
        </Card>

        {loading && quotes.length === 0 ? (
          <div className="flex min-h-[300px] items-center justify-center rounded-lg border border-slate-200 bg-white">
            <div className="space-y-3 text-center">
              <div className="mx-auto h-9 w-9 animate-spin rounded-full border-4 border-[#12335f] border-t-transparent" />
              <p className="text-sm font-semibold text-slate-600">Loading bid records...</p>
            </div>
          </div>
        ) : filteredQuotes.length === 0 ? (
          <EmptyState
            role={user?.role}
            hasQuotes={quotes.length > 0}
            onPrimary={() => router.push(user?.role === 'seller' ? '/seller/marketplace' : '/buyer/tenders')}
          />
        ) : viewMode === 'list' ? (
          <div className="overflow-hidden rounded-lg border border-slate-200 bg-white shadow-sm">
            <div className="overflow-x-auto">
              <table className="w-full table-fixed border-collapse text-left min-w-[1150px]">
                <colgroup>
                  <col className="w-[52px]" />
                  <col className="w-[94px]" />
                  <col />
                  <col className="w-[138px]" />
                  <col className="w-[108px]" />
                  <col className="w-[48px]" />
                  <col className="w-[124px]" />
                  <col className="w-[96px]" />
                  {(user?.role === 'buyer' || user?.role === 'seller') && <col className="w-[196px]" />}
                </colgroup>
                <thead className="bg-slate-50 text-[10px] font-bold uppercase tracking-wider text-slate-500 border-b border-slate-200">
                  <tr>
                    <th className="px-3 py-3">Sr.No</th>
                    <th className="px-3 py-3"><SortHeader label="Bid ID" field="id" /></th>
                    <th className="px-4 py-3"><SortHeader label={user?.role === 'seller' ? 'RFQ / Tender' : 'Tender'} field="title" /></th>
                    <th className="px-3 py-3"><SortHeader label={user?.role === 'seller' ? 'Buyer' : 'Supplier'} field="seller" /></th>
                    <th className="px-3 py-3 text-right"><SortHeader label="Rate" field="rate" className="w-full justify-end" /></th>
                    <th className="px-2 py-3 text-center"><SortHeader label="Qty" field="qty" className="w-full justify-center" /></th>
                    <th className="px-3 py-3 text-right"><SortHeader label="Net Value" field="netValue" className="w-full justify-end" /></th>
                    <th className="px-3 py-3 text-center"><SortHeader label="Status" field="status" className="w-full justify-center" /></th>
                    {(user?.role === 'buyer' || user?.role === 'seller') && <th className="px-3 py-3 text-right">Manage</th>}
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-200 text-xs">
                  {pagedQuotes.map((quote, index) => {
                    const StatusIcon = statusIcons[quote.status] || Clock;
                    const totalValue = Number(quote.unitPrice || 0) * Number(quote.quantity || 0);
                    return (
                      <tr key={`${quote.source || 'bid'}-${quote.id}`} className="hover:bg-slate-50/50 transition-colors group">
                        <td className="px-3 py-4 font-black text-slate-400">{String((page - 1) * pageSize + index + 1).padStart(2, '0')}</td>
                        <td className="px-3 py-4 font-mono font-bold text-[#12335f]">
                          {quote.source === 'rfq' ? 'RFQ' : 'BID'}-{String(quote.id).padStart(4, '0')}
                        </td>
                        <td className="px-4 py-4">
                          <div className="break-words font-bold text-slate-800">{quote.tender?.title || '-'}</div>
                          <div className="break-words text-[10px] font-medium text-slate-500">{quote.tender?.tenderId} | {quote.tender?.category}</div>
                          <div className="mt-1 text-[10px] font-semibold text-slate-400">
                            Delivery: {quote.deliveryDays ? `${quote.deliveryDays} days` : '-'} | Valid: {formatDateTime(quote.validTill)}
                          </div>
                        </td>
                        <td className="px-3 py-4">
                          <div className="break-words font-semibold text-slate-700">{user?.role === 'seller' ? quote.buyer?.name || '-' : quote.seller?.sellerProfile?.businessName || quote.seller?.name || '-'}</div>
                          <div className="mt-1 text-[10px] font-semibold text-slate-400">
                            Updated: {formatDateTime(getQuoteUpdatedAt(quote))}
                          </div>
                        </td>
                        <td className="px-3 py-4 text-right font-semibold text-slate-600">
                          <span className="block min-w-0 whitespace-normal break-all leading-relaxed">{formatMoney(quote.unitPrice)}</span>
                        </td>
                        <td className="px-2 py-4 text-center font-medium">{quote.quantity}</td>
                        <td className="px-3 py-4 text-right font-black text-[#12335f]">
                          <div className="flex min-w-0 items-start justify-end gap-1">
                            {quote.isLowest && <Trophy className="h-3 w-3 text-amber-500" />}
                            <span className="min-w-0 whitespace-normal break-all leading-relaxed">{formatMoney(totalValue)}</span>
                          </div>
                        </td>
                        <td className="px-3 py-4 text-center">
                          <span className={cn('inline-flex items-center gap-1 rounded px-2 py-0.5 text-[10px] font-bold uppercase border shadow-sm', statusStyles[quote.status])}>
                            {getStatusLabel(quote.status)}
                          </span>
                        </td>
                        {user?.role === 'buyer' && (
                          <td className="px-3 py-4 text-right">
                            <div className="flex flex-wrap items-center justify-end gap-1.5">
                              <button type="button" onClick={() => handleViewQuote(quote)} className="inline-flex h-7 items-center gap-1 rounded border border-slate-200 bg-white px-2 text-[10px] font-black uppercase text-slate-700 hover:bg-slate-50" title="View quotation details">
                                <Eye className="h-3.5 w-3.5" />
                                View
                              </button>
                              {isDecisionOpen(quote) && (
                                <>
                                  <button onClick={() => handleStatusUpdate(quote, 'rejected')} className="h-7 w-7 rounded border border-red-200 bg-white flex items-center justify-center text-red-600 hover:bg-red-50" title="Reject quotation">
                                    <XCircle className="h-3.5 w-3.5" />
                                  </button>
                                  <button onClick={() => handleStatusUpdate(quote, 'accepted')} className="h-7 w-7 rounded border border-emerald-200 bg-white flex items-center justify-center text-emerald-600 hover:bg-emerald-50" title="Accept quotation">
                                    <CheckCircle2 className="h-3.5 w-3.5" />
                                  </button>
                                </>
                              )}
                              {!isDecisionOpen(quote) && (
                                <span className={cn(
                                  'inline-flex h-7 items-center rounded border px-2 text-[10px] font-black uppercase',
                                  quote.source === 'rfq' && !quote.responseId
                                    ? 'border-amber-200 bg-amber-50 text-amber-700'
                                    : 'border-emerald-100 bg-emerald-50 text-emerald-700'
                                )}>
                                  {quote.source === 'rfq' && !quote.responseId ? 'Awaiting Response' : 'Finalized'}
                                </span>
                              )}
                            </div>
                          </td>
                        )}
                        {user?.role === 'seller' && (
                          <td className="px-3 py-4 text-right">
                            <div className="flex flex-wrap items-center justify-end gap-1.5">
                              <button type="button" onClick={() => handleViewQuote(quote)} className="inline-flex h-7 items-center gap-1 rounded border border-slate-200 bg-white px-2 text-[10px] font-black uppercase text-slate-700 hover:bg-slate-50" title="View details">
                                <Eye className="h-3.5 w-3.5" />
                                View
                              </button>
                              <button type="button" onClick={() => setEditTarget(quote)} disabled={!canSellerManageBid(quote, user?.role)} className="inline-flex h-7 items-center gap-1 rounded border border-blue-200 bg-white px-2 text-[10px] font-black uppercase text-blue-700 hover:bg-blue-50 disabled:border-blue-100 disabled:bg-slate-50 disabled:text-slate-300" title="Edit quotation">
                                <Edit3 className="h-3.5 w-3.5" />
                                Edit
                              </button>
                              <button type="button" onClick={() => handleDeleteBid(quote)} disabled={!canSellerManageBid(quote, user?.role) || deletingId === quote.id} className="inline-flex h-7 items-center gap-1 rounded border border-red-200 bg-white px-2 text-[10px] font-black uppercase text-red-700 hover:bg-red-50 disabled:border-red-100 disabled:bg-slate-50 disabled:text-slate-300" title="Delete quotation">
                                <Trash2 className="h-3.5 w-3.5" />
                                Delete
                              </button>
                              {quote.source === 'rfq' && (!quote.quoteResponses || quote.quoteResponses.length === 0) && (
                                <Button onClick={() => setResponseTarget(quote)} className="h-7 rounded-md bg-[#12335f] px-2 text-[10px] font-black uppercase text-white hover:bg-[#0b2445]">
                                  Respond
                                </Button>
                              )}
                            </div>
                          </td>
                        )}
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
            <Pagination page={page} pageSize={pageSize} total={total} onPageChange={setPage} onPageSizeChange={setPageSize} label="quotations" />
          </div>
        ) : (
          <>
            <div className="grid grid-cols-1 gap-4 xl:grid-cols-2">
              {pagedQuotes.map((quote, index) => (
                <React.Fragment key={`${quote.source || 'bid'}-${quote.id}`}>
                  <QuotationCard
                    quote={quote}
                    role={user?.role}
                    index={(page - 1) * pageSize + index}
                    onView={() => handleViewQuote(quote)}
                    onAccept={() => handleStatusUpdate(quote, 'accepted')}
                    onReject={() => handleStatusUpdate(quote, 'rejected')}
                    onRespond={() => setResponseTarget(quote)}
                  />
                </React.Fragment>
              ))}
            </div>
            <div className="overflow-hidden rounded-lg border border-slate-200 bg-white">
              <Pagination page={page} pageSize={pageSize} total={total} onPageChange={setPage} onPageSizeChange={setPageSize} label="quotations" />
            </div>
          </>
        )}
        {responseTarget && (
          <RfqResponseModal
            quote={responseTarget}
            saving={responding}
            onClose={() => setResponseTarget(null)}
            onSubmit={handleRfqResponse}
          />
        )}
        {detailsTarget && (
          <QuotationDetailsModal
            quote={detailsTarget}
            role={user?.role}
            onClose={() => setDetailsTarget(null)}
            onOpenDocument={handleOpenQuoteDocument}
          />
        )}
        {editTarget && (
          <BidEditModal
            quote={editTarget}
            saving={savingEdit}
            onClose={() => setEditTarget(null)}
            onSubmit={handleEditBid}
          />
        )}
        <DocumentPreviewModal previewDocument={previewDocument} onClose={() => setPreviewDocument(null)} />
      </div>
    </div>
  );
}

function SummaryTile({
  label,
  value,
  icon: Icon,
  tone = 'blue'
}: {
  label: string;
  value: string | number;
  icon: React.ElementType;
  tone?: 'blue' | 'amber' | 'green';
}) {
  const toneClass = tone === 'green'
    ? 'bg-emerald-50 text-emerald-700'
    : tone === 'amber'
      ? 'bg-amber-50 text-amber-700'
      : 'bg-slate-50 text-[#12335f]';

  return (
    <div className="rounded-lg border border-slate-200 bg-white p-3 shadow-sm">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0 flex-1">
          <p className="text-[9px] font-bold uppercase tracking-wide text-slate-500">{label}</p>
          <p className="mt-0.5 min-w-0 whitespace-normal break-all text-lg font-black leading-snug tracking-tight text-slate-900">{value}</p>
        </div>
        <div className={cn('flex h-8 w-8 items-center justify-center rounded-md shrink-0', toneClass)}>
          <Icon className="h-4 w-4" />
        </div>
      </div>
    </div>
  );
}

function QuotationCard({
  quote,
  role,
  index,
  onView,
  onAccept,
  onReject,
  onRespond
}: {
  quote: Quotation;
  role?: string;
  index: number;
  onView: () => void;
  onAccept: () => void;
  onReject: () => void;
  onRespond?: () => void;
}) {
  const StatusIcon = statusIcons[quote.status] || Clock;
  const sellerName = quote.seller?.sellerProfile?.businessName || quote.seller?.name || 'Submitted Bid';
  const counterpartyName = role === 'seller' && quote.source === 'rfq' ? quote.buyer?.name || 'Buyer RFQ' : sellerName;
  const totalValue = Number(quote.unitPrice || 0) * Number(quote.quantity || 0);
  const isUnansweredRfq = role === 'seller' && quote.source === 'rfq' && (!quote.quoteResponses || quote.quoteResponses.length === 0);

  return (
    <Card className={cn(
      'overflow-hidden rounded-lg border border-slate-200 bg-white shadow-sm transition hover:shadow-md relative',
      quote.status === 'accepted' && 'border-emerald-300'
    )}>
      <CardContent className="p-0">
        <div className="border-b border-slate-200 bg-[#f8fafc] px-5 py-4">
          <div className="flex items-start justify-between gap-4">
            <div className="min-w-0">
              <div className="flex flex-wrap items-center gap-2">
                <span className="text-[10px] font-black text-[#12335f] bg-slate-200/70 px-1.5 py-0.5 rounded min-w-[20px] text-center">
                  {String(index + 1).padStart(2, '0')}
                </span>
                <p className="font-mono text-[11px] font-bold uppercase text-slate-500">
                  {quote.source === 'rfq' ? 'RFQ' : 'BID'}-{String(quote.id).padStart(4, '0')}
                </p>
                {quote.isLowest && (
                  <span className="inline-flex items-center gap-1 rounded border border-emerald-200 bg-emerald-50 px-2 py-0.5 text-[10px] font-bold uppercase text-emerald-700">
                    <Trophy className="h-3 w-3" />
                    Lowest
                  </span>
                )}
              </div>
              <h3 className="mt-2 truncate text-base font-extrabold text-[#071632]">
                {role === 'buyer' ? sellerName : quote.tender?.title || 'Tender Quotation'}
              </h3>
              <p className="mt-1 text-xs font-semibold text-slate-500">
                {quote.tender?.tenderId || `Tender #${quote.tenderId}`} | {quote.tender?.category || 'General Procurement'}{role === 'seller' ? ` | ${counterpartyName}` : ''}
              </p>
            </div>
            <span className={cn('inline-flex shrink-0 items-center gap-1 rounded border px-2.5 py-1 text-[10px] font-bold uppercase tracking-wide', statusStyles[quote.status])}>
              <StatusIcon className="h-3.5 w-3.5" />
              {getStatusLabel(quote.status)}
            </span>
          </div>
        </div>

        <div className="space-y-5 p-5">
          <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
            <InfoBox label={quote.source === 'rfq' ? 'Quoted Amount' : 'Unit Price'} value={quote.unitPrice ? formatMoney(quote.unitPrice) : 'Awaiting response'} />
            <InfoBox label="Quantity" value={quote.quantity || '-'} />
            <InfoBox label="Total Value" value={formatMoney(totalValue)} strong />
            <InfoBox label="Delivery" value={quote.deliveryDays ? `${quote.deliveryDays} days` : '-'} />
          </div>

          <div className="grid gap-3 sm:grid-cols-2">
            <InfoBox label="Warranty" value={quote.warranty || 'Not Provided'} />
            <InfoBox label="Valid Till" value={quote.validTill ? new Date(quote.validTill).toLocaleDateString() : 'Not Provided'} />
          </div>

          {quote.note && (
            <div className="rounded-md border border-slate-200 bg-slate-50 p-3">
              <p className="text-[10px] font-bold uppercase tracking-wider text-slate-500">{quote.source === 'rfq' ? 'RFQ Message' : 'Seller Note'}</p>
              <p className="mt-1 text-sm font-medium leading-relaxed text-slate-700">{quote.note}</p>
            </div>
          )}

          <Button variant="outline" onClick={onView} className="h-10 w-full rounded-md border-slate-200 bg-white font-bold text-slate-700 hover:bg-slate-50">
            <Eye className="mr-2 h-4 w-4" />
            View Details
          </Button>

          {role === 'buyer' ? (
            isDecisionOpen(quote) ? (
              <div className="grid gap-3 sm:grid-cols-2">
                <Button variant="outline" onClick={onReject} className="h-10 rounded-md border-red-200 font-bold text-red-700 hover:bg-red-50">
                  <XCircle className="mr-2 h-4 w-4" />
                  Reject
                </Button>
                <Button onClick={onAccept} className="h-10 rounded-md bg-[#12335f] font-bold text-white hover:bg-[#0b2445]">
                  <CheckCircle2 className="mr-2 h-4 w-4" />
                  Accept
                </Button>
              </div>
            ) : (
              <div className={cn('flex h-10 items-center justify-center rounded-md border text-sm font-bold', statusStyles[quote.status])}>
                <StatusIcon className="mr-2 h-4 w-4" />
                {quote.status === 'accepted' ? 'Quotation Accepted' :
                  quote.status === 'rejected' || quote.status === 'technical_rejected' ? 'Quotation Rejected' :
                    'Status: ' + getStatusLabel(quote.status)}
              </div>
            )
          ) : (
            isUnansweredRfq ? (
              <Button onClick={onRespond} className="h-10 w-full rounded-md bg-[#12335f] font-bold text-white hover:bg-[#0b2445]">
                <Send className="mr-2 h-4 w-4" />
                Respond to RFQ
              </Button>
            ) : (
              <div className={cn('flex h-10 items-center justify-center rounded-md border text-sm font-bold', statusStyles[quote.status])}>
                <StatusIcon className="mr-2 h-4 w-4" />
                {quote.source === 'rfq' && quote.status === 'submitted' ? 'RFQ response submitted' :
                  quote.status === 'pending' ? 'Pending buyer review' :
                    quote.status === 'submitted' ? 'Submitted (Awaiting Review)' :
                      quote.status === 'technical_qualified' ? 'Technically Qualified' :
                        quote.status === 'technical_rejected' ? 'Technically Rejected' :
                          quote.status === 'financial_evaluated' ? 'Financial Evaluated' :
                            quote.status === 'accepted' ? 'Accepted by buyer' :
                              quote.status === 'withdrawn' ? 'Inactive quotation' :
                                quote.status === 'rejected' ? 'Not selected' : 'Status: ' + getStatusLabel(quote.status)}
              </div>
            )
          )}
        </div>
      </CardContent>
    </Card>
  );
}


function RfqResponseModal({
  quote,
  saving,
  onClose,
  onSubmit
}: {
  quote: Quotation;
  saving: boolean;
  onClose: () => void;
  onSubmit: (event: React.FormEvent<HTMLFormElement>) => void;
}) {
  const [documentUrl, setDocumentUrl] = useState('');
  const [documentName, setDocumentName] = useState('');
  const [uploadingDocument, setUploadingDocument] = useState(false);

  const handleUploadDocument = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;

    setUploadingDocument(true);
    try {
      const optimizedFile = await compressImage(file);
      const body = new FormData();
      body.append('file', optimizedFile);
      const response = await api.fetch('/api/upload', {
        method: 'POST',
        headers: { Authorization: `Bearer ${localStorage.getItem('token')}` },
        body
      });
      const data = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(data?.message || 'Unable to upload document');

      const upload = data?.data || data;
      const fileId = Number(upload?.fileId || upload?.file?.id || 0) || null;
      const uploadedUrl = fileId
        ? `/api/files/${fileId}/view`
        : upload?.url || upload?.file?.documentUrl || upload?.file?.url || '';
      if (!uploadedUrl) throw new Error('Uploaded document link is unavailable');

      setDocumentUrl(uploadedUrl);
      setDocumentName(upload?.file?.originalName || upload?.originalName || file.name);
      toast.success('Response document attached');
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Unable to upload document');
    } finally {
      setUploadingDocument(false);
      event.target.value = '';
    }
  };

  const handleRemoveDocument = () => {
    setDocumentUrl('');
    setDocumentName('');
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/60 p-4 backdrop-blur-sm">
      <div className="w-full max-w-xl overflow-hidden rounded-lg border border-slate-200 bg-white shadow-2xl">
        <div className="border-b border-slate-200 bg-slate-50 px-5 py-4">
          <p className="text-[10px] font-black uppercase tracking-widest text-[#12335f]">Respond to RFQ</p>
          <h2 className="mt-1 text-lg font-black text-[#071632]">{quote.tender?.title || `RFQ #${quote.id}`}</h2>
          <p className="mt-1 text-xs font-semibold text-slate-500">{quote.buyer?.name || 'Buyer'} requested a quote.</p>
        </div>
        <form onSubmit={onSubmit} className="space-y-4 p-5">
          <label className="block text-[10px] font-black uppercase tracking-wider text-slate-500">
            Total Amount
            <input name="totalAmount" type="number" min="0" step="0.01" required className="mt-1 h-11 w-full rounded-md border border-slate-200 px-3 text-sm font-semibold outline-none focus:ring-2 focus:ring-[#12335f]/20" />
          </label>
          <div className="grid gap-4 sm:grid-cols-2">
            <label className="block text-[10px] font-black uppercase tracking-wider text-slate-500">
              Delivery Days
              <input name="deliveryDays" type="number" min="1" className="mt-1 h-11 w-full rounded-md border border-slate-200 px-3 text-sm font-semibold outline-none focus:ring-2 focus:ring-[#12335f]/20" />
            </label>
            <label className="block text-[10px] font-black uppercase tracking-wider text-slate-500">
              Validity Date
              <input name="validityDate" type="date" className="mt-1 h-11 w-full rounded-md border border-slate-200 px-3 text-sm font-semibold outline-none focus:ring-2 focus:ring-[#12335f]/20" />
            </label>
          </div>
          <label className="block text-[10px] font-black uppercase tracking-wider text-slate-500">
            Notes
            <textarea name="notes" rows={4} defaultValue="" className="mt-1 w-full rounded-md border border-slate-200 px-3 py-2 text-sm font-semibold outline-none focus:ring-2 focus:ring-[#12335f]/20" />
          </label>
          <div className="space-y-1.5">
            <p className="text-[10px] font-black uppercase tracking-wider text-slate-500">Upload Document (Optional)</p>
            <div className={cn(
              'flex items-center justify-between gap-3 rounded-md border border-dashed p-3',
              documentUrl ? 'border-emerald-200 bg-emerald-50/40' : 'border-slate-200 bg-slate-50'
            )}>
              <div className="flex min-w-0 items-center gap-2">
                <Paperclip className={cn('h-4 w-4 shrink-0', documentUrl ? 'text-emerald-700' : 'text-slate-400')} />
                <p className={cn('truncate text-xs font-semibold', documentUrl ? 'text-emerald-700' : 'text-slate-500')}>
                  {documentName || (uploadingDocument ? 'Uploading document...' : 'Attach proposal PDF or supporting file')}
                </p>
              </div>
              {documentUrl ? (
                <button type="button" onClick={handleRemoveDocument} className="shrink-0 rounded px-2 py-1 text-[10px] font-black uppercase text-red-600 hover:bg-red-50">
                  Remove
                </button>
              ) : (
                <>
                  <input id={`rfq-response-document-${quote.id}`} type="file" accept=".pdf,.doc,.docx,.csv,.jpg,.jpeg,.png" onChange={handleUploadDocument} disabled={uploadingDocument} className="hidden" />
                  <label htmlFor={`rfq-response-document-${quote.id}`} className="inline-flex h-8 shrink-0 cursor-pointer items-center rounded-md bg-[#12335f] px-3 text-[10px] font-black uppercase text-white hover:bg-[#0b2445]">
                    <Upload className="mr-1.5 h-3.5 w-3.5" />
                    {uploadingDocument ? 'Uploading...' : 'Upload'}
                  </label>
                </>
              )}
            </div>
            <input type="hidden" name="documentUrl" value={documentUrl} />
          </div>
          <div className="flex justify-end gap-2 border-t border-slate-200 pt-4">
            <Button type="button" variant="outline" onClick={onClose} className="h-10 text-xs font-black uppercase">Cancel</Button>
            <Button type="submit" disabled={saving || uploadingDocument} className="h-10 bg-[#12335f] text-xs font-black uppercase text-white hover:bg-[#0b2445]">
              {saving ? 'Submitting...' : 'Submit Response'}
            </Button>
          </div>
        </form>
      </div>
    </div>
  );
}

function EmptyState({
  role,
  hasQuotes,
  onPrimary
}: {
  role?: string;
  hasQuotes: boolean;
  onPrimary: () => void;
}) {
  return (
    <div className="rounded-lg border border-dashed border-slate-300 bg-white p-8 text-center shadow-sm">
      <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-md bg-slate-50 text-[#12335f]">
        {hasQuotes ? <Search className="h-7 w-7" /> : <AlertCircle className="h-7 w-7" />}
      </div>
      <h2 className="mt-4 text-lg font-extrabold text-slate-900">
        {hasQuotes ? 'No matching bid records' : role === 'buyer' ? 'No quotations received yet' : 'No bids or RFQs yet'}
      </h2>
      <p className="mx-auto mt-2 max-w-xl text-sm font-medium text-slate-600">
        {hasQuotes
          ? 'Adjust the search or status filter to view more bid records.'
          : role === 'buyer'
            ? 'Published tenders will show supplier quotations here once sellers submit their bids.'
            : 'Buyer RFQ requests from marketplace and your submitted tender bids will appear here.'}
      </p>
      {!hasQuotes && (
        <Button onClick={onPrimary} className="mt-5 h-10 rounded-md bg-[#12335f] px-5 text-xs font-bold uppercase tracking-wide text-white hover:bg-[#0b2445]">
          {role === 'buyer' ? 'View Tenders' : 'Open Marketplace'}
          <ArrowRight className="ml-2 h-4 w-4" />
        </Button>
      )}
    </div>
  );
}
