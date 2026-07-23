'use client';

import React, { useState, useRef, useCallback } from 'react';
import { useSearchParams, useRouter } from 'next/navigation';
import { useAuth } from '../../../hooks/useAuth';
import {
  ChevronRight,
  Loader2,
  Building2,
  Calendar,
  FileText,
  Upload,
  CheckCircle2,
  IndianRupee,
  AlertTriangle,
  ArrowLeft,
  Clock,
  ShieldCheck,
  X,
  Paperclip,
  Package,
  FileUp,
  Eye,
  Trash2,
} from 'lucide-react';
import { toast } from 'sonner';
import { getApi, postApi } from '../../shared/apiClient';
import { Button } from '../../../components/ui/button';
import { cn } from '../../../lib/utils';
import { useQuery } from '@tanstack/react-query';
import { getCookieValue } from '../../../lib/auth';
import { BASE_URL } from '../../../lib/api';

const authHeaders = (): Record<string, string> => {
  if (typeof window === 'undefined') return {};
  const token = localStorage.getItem('token');
  const headers: Record<string, string> = {};
  if (token) headers.Authorization = `Bearer ${token}`;
  const csrfToken = getCookieValue('csrfToken');
  if (csrfToken) headers['X-CSRF-Token'] = csrfToken;
  return headers;
};

const uploadFile = (file: File, onProgress?: (percent: number) => void): Promise<{ id: number; url: string }> =>
  new Promise((resolve, reject) => {
    const xhr = new XMLHttpRequest();
    const formData = new FormData();
    formData.append('file', file);
    formData.append('entityType', 'quotation');

    xhr.open('POST', `${BASE_URL}/api/upload`, true);
    xhr.withCredentials = true;

    for (const [key, value] of Object.entries(authHeaders())) {
      xhr.setRequestHeader(key, value);
    }

    xhr.upload.addEventListener('progress', (event) => {
      if (!event.lengthComputable || !onProgress) return;
      onProgress(Math.round((event.loaded / event.total) * 100));
    });

    xhr.onreadystatechange = () => {
      if (xhr.readyState !== 4) return;
      let body: any = {};
      try {
        body = xhr.responseText ? JSON.parse(xhr.responseText) : {};
        if (body?.data) body = body.data;
      } catch {
        // ignore
      }
      if (xhr.status >= 200 && xhr.status < 300) {
        resolve({ id: body.id || body.fileAssetId, url: body.url || body.fileUrl || '' });
      } else {
        reject(new Error(body?.message || body?.error || `Upload failed (${xhr.status})`));
      }
    };

    xhr.onerror = () => reject(new Error('Network error during upload'));
    xhr.ontimeout = () => reject(new Error('Upload timed out'));
    xhr.onabort = () => reject(new Error('Upload aborted'));
    xhr.send(formData);
  });

const formatDate = (dateStr?: string | Date) => {
  if (!dateStr) return '—';
  try {
    const d = new Date(dateStr);
    if (isNaN(d.getTime())) return String(dateStr);
    return d.toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' });
  } catch {
    return String(dateStr);
  }
};

const formatCurrency = (val?: number | string) => {
  if (!val) return '—';
  const n = Number(val);
  if (isNaN(n)) return String(val);
  return `₹${n.toLocaleString('en-IN', { maximumFractionDigits: 0 })}`;
};

type UploadState = {
  file?: File;
  fileName?: string;
  fileSize?: number;
  progress: number;
  status: 'pending' | 'uploading' | 'done' | 'error';
  url?: string;
  error?: string;
};

// One upload slot per document the buyer asked for at procurement creation.
type RequestedDocUpload = {
  name: string;
  required: boolean;
  fileAssetId?: number | null;
  fileName?: string;
  fileUrl?: string;
  status: 'empty' | 'uploading' | 'done' | 'error';
  progress: number;
  error?: string;
};

// Seller's quote against each buyer line item.
type LineQuote = {
  itemName: string;
  quantity: number;
  unitOfMeasure: string;
  unitPrice: string;
  gstPercent: string;
  makeBrand: string;
  remarks: string;
};

export default function SubmitQuotationPage() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const { user } = useAuth();
  const requirementIdParam = searchParams?.get('requirementId') || searchParams?.get('id') || searchParams?.get('requestId');
  const requirementId = requirementIdParam ? (isNaN(Number(requirementIdParam)) ? requirementIdParam : Number(requirementIdParam)) : 0;

  const [offeredPrice, setOfferedPrice] = useState('');
  const [offeredQuantity, setOfferedQuantity] = useState('');
  const [deliveryTimeline, setDeliveryTimeline] = useState('');
  const [message, setMessage] = useState('');
  const [terms, setTerms] = useState('');
  const [declared, setDeclared] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [submitted, setSubmitted] = useState(false);
  const [uploadState, setUploadState] = useState<UploadState | null>(null);
  const [docUploads, setDocUploads] = useState<RequestedDocUpload[]>([]);
  const [lineQuotes, setLineQuotes] = useState<LineQuote[]>([]);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [draftSaved, setDraftSaved] = useState(false);
  const [lastSaved, setLastSaved] = useState<string | null>(null);

  const scrollToSection = (id: string) => {
    const el = document.getElementById(id);
    if (el) {
      const yOffset = -90;
      const y = el.getBoundingClientRect().top + window.pageYOffset + yOffset;
      window.scrollTo({ top: y, behavior: 'smooth' });
    }
  };

  const { data: queryData, isLoading, error } = useQuery({
    queryKey: ['marketplace-requirement-quotation', requirementId],
    queryFn: async () => {
      try {
        const data = await getApi<any>(`/api/marketplace/requirements/${requirementId}`);
        if (data && (data.requirement || data.id)) {
          return {
            requirement: data.requirement || data,
            ownResponse: data.ownResponse || data.myResponse || data.response || null,
          };
        }
      } catch (err) {
        // Fallback to procurement bid endpoint if marketplace requirement route fails
      }
      try {
        const bidData = await getApi<any>(`/api/procurement-bids/detail/${requirementId}`);
        if (bidData) {
          const userParticipation = (bidData.participations || []).find((p: any) => 
            String(p.sellerId || p.seller?.id) === String(user?.id) || 
            (user?.organizationId && (p.organizationId === user.organizationId || p.seller?.organizationId === user.organizationId))
          );

          const ownResponseData = userParticipation ? {
            status: userParticipation.status || 'SUBMITTED',
            offeredPrice: userParticipation.offeredPrice ?? userParticipation.responseData?.offeredPrice,
            offeredQuantity: userParticipation.offeredQuantity ?? userParticipation.responseData?.offeredQuantity,
            deliveryTimeline: userParticipation.deliveryTimeline || userParticipation.responseData?.deliveryTimeline,
            terms: userParticipation.terms || userParticipation.responseData?.terms,
            message: userParticipation.message || userParticipation.responseData?.message || userParticipation.coverNote,
            attachmentUrl: userParticipation.attachmentUrl || userParticipation.responseData?.attachmentUrl,
            createdAt: userParticipation.createdAt,
            updatedAt: userParticipation.updatedAt || userParticipation.createdAt,
            responseData: userParticipation.responseData || userParticipation,
            documents: userParticipation.documents || userParticipation.responseData?.documents || [],
            lineItems: userParticipation.lineItems || userParticipation.responseData?.lineItems || userParticipation.responseData?.lineQuotes || [],
          } : null;

          return {
            requirement: {
              id: bidData.id,
              title: bidData.title,
              requirementNumber: bidData.bidNumber || bidData.id,
              buyerOrganization: bidData.buyerOrganization || { organizationName: bidData.buyerName },
              lastDate: bidData.endDate,
              items: bidData.technicalPacket?.boq || bidData.items || [],
              documents: bidData.documents || [],
              payload: bidData.technicalPacket,
              requiredDocuments: bidData.requiredDocuments,
              estimatedValue: bidData.estimatedValue,
              quantity: bidData.quantity,
              unit: bidData.unit,
              status: bidData.status,
              description: bidData.description,
            },
            ownResponse: ownResponseData,
          };
        }
      } catch (e) {
        // Ignore fallback error
      }
      return null;
    },
    enabled: !!requirementId,
  });

  const rfqData: any = queryData?.requirement
    ? {
        id: queryData.requirement.id,
        title: queryData.requirement.title || queryData.requirement.description,
        requirementNumber: queryData.requirement.requirementNumber,
        buyerOrganization: queryData.requirement.buyerOrganization,
        deadlineDate: queryData.requirement.lastDate,
        items: queryData.requirement.items,
        documents: queryData.requirement.documents,
        payload: queryData.requirement.payload,
        requiredDocuments: queryData.requirement.requiredDocuments,
        estimatedValue: queryData.requirement.estimatedValue || queryData.requirement.budgetMax,
        quantity: queryData.requirement.quantity,
        unit: queryData.requirement.unit,
        status: queryData.requirement.status,
        description: queryData.requirement.description,
      }
    : null;

  const ownResponse = queryData?.ownResponse;

  // Restore quotation details from ownResponse on load (whether DRAFT or SUBMITTED)
  const restoredRef = useRef(false);
  React.useEffect(() => {
    if (!ownResponse || restoredRef.current) return;
    
    const targetPrice = ownResponse.offeredPrice ?? ownResponse.responseData?.offeredPrice;
    const targetQty = ownResponse.offeredQuantity ?? ownResponse.responseData?.offeredQuantity;
    const targetTimeline = ownResponse.deliveryTimeline || ownResponse.responseData?.deliveryTimeline;
    const targetTerms = ownResponse.terms || ownResponse.responseData?.terms;
    const targetMessage = ownResponse.message || ownResponse.responseData?.message || ownResponse.coverNote || ownResponse.responseData?.coverNote;
    const targetAttachment = ownResponse.attachmentUrl || ownResponse.responseData?.attachmentUrl;

    if (targetPrice != null && targetPrice !== '') setOfferedPrice(String(targetPrice));
    if (targetQty != null && targetQty !== '') setOfferedQuantity(String(targetQty));
    if (targetTimeline) setDeliveryTimeline(String(targetTimeline));
    if (targetTerms) setTerms(String(targetTerms));
    if (targetMessage) setMessage(String(targetMessage));
    if (targetAttachment) {
      const urlParts = String(targetAttachment).split('/');
      const name = decodeURIComponent(urlParts[urlParts.length - 1] || 'Attachment');
      setUploadState({
        fileName: name,
        progress: 100,
        status: 'done',
        url: targetAttachment
      });
    }
    
    const savedTime = new Date(ownResponse.updatedAt || ownResponse.createdAt).toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit' });
    setLastSaved(savedTime);
    restoredRef.current = true;

    if (ownResponse.status === 'DRAFT') {
      toast.info('Restored your draft quotation from the server.');
    } else {
      setDeclared(true);
      toast.info('Loaded your submitted quotation from the server.');
    }
  }, [ownResponse]);

  // Use the numeric ID from fetched data for API calls; the URL param may be a string like REQ-2026-...
  const resolvedId = rfqData?.id || requirementId;

  // Save draft to database
  const saveDraft = useCallback(async () => {
    if (!resolvedId) return;
    try {
      const payload: any = {
        offeredPrice: offeredPrice ? Number(offeredPrice) : undefined,
        offeredQuantity: offeredQuantity ? Number(offeredQuantity) : undefined,
        deliveryTimeline: deliveryTimeline.trim() || undefined,
        message: message.trim() || 'Draft quotation response', // default placeholder
        terms: terms.trim() || undefined,
        status: 'DRAFT'
      };
      if (uploadState?.url) {
        payload.attachmentUrl = uploadState.url;
      }
      const responseData = buildResponseData();
      if (responseData) payload.responseData = responseData;

      await postApi(`/api/marketplace/requirements/${resolvedId}/responses`, payload);
      
      const now = new Date().toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit', second: '2-digit' });
      setLastSaved(now);
      setDraftSaved(true);
      toast.success('Draft saved successfully');
      setTimeout(() => setDraftSaved(false), 2000);
    } catch (err: any) {
      console.warn('Failed to save draft to server', err);
      toast.error('Failed to save draft to server');
    }
  }, [resolvedId, offeredPrice, offeredQuantity, deliveryTimeline, terms, message, uploadState, docUploads, lineQuotes]);

  const isClosed = ['AWARDED', 'CLOSED', 'CANCELLED'].includes(rfqData?.status);
  const isDeadlinePassed = !!rfqData?.deadlineDate && new Date(rfqData.deadlineDate).getTime() < Date.now();
  const isReadOnly = isClosed || isDeadlinePassed;

  // Auto-save on field changes (debounced at 5 seconds)
  React.useEffect(() => {
    if (!resolvedId || isReadOnly || !rfqData) return;
    const hasDynamicInput = docUploads.some(doc => doc.status === 'done') || lineQuotes.some(line => line.unitPrice !== '');
    if (!offeredPrice && !offeredQuantity && !deliveryTimeline && !terms && !message && !uploadState && !hasDynamicInput) {
      return;
    }

    const timer = setTimeout(() => {
      saveDraft();
    }, 5000);
    return () => clearTimeout(timer);
  }, [offeredPrice, offeredQuantity, deliveryTimeline, terms, message, uploadState, docUploads, lineQuotes, resolvedId, rfqData, saveDraft, ownResponse]);

  const orgName = rfqData?.buyerOrganization?.organizationName || 'Buyer';
  const subject = rfqData?.title || 'Sourcing Requirement';
  const rfqNumber = rfqData?.requirementNumber || `REQ-${requirementId}`;
  const deadline = rfqData?.deadlineDate ? formatDate(rfqData.deadlineDate) : '—';

  const itemsList: Array<{
    itemName: string;
    quantity: number | string;
    unitOfMeasure: string;
    description?: string;
  }> = rfqData?.items && Array.isArray(rfqData.items) && rfqData.items.length > 0
    ? rfqData.items.map((item: any) => ({
        itemName: item.itemName || item.name || item.description || '—',
        quantity: item.quantity || 0,
        unitOfMeasure: item.unitOfMeasure || item.unit || 'Nos',
        description: item.description,
      }))
    : [];

  const maxQuantity = itemsList.length > 0
    ? Math.max(...itemsList.map((i: any) => Number(i.quantity) || 0))
    : 0;

  const documents = Array.isArray(rfqData?.documents) ? rfqData?.documents : [];

  // Buyer-requested documents come from three shapes depending on how the procurement was
  // created: wizard payload.documents ({name, required}), marketplace requiredDocuments
  // (string[]), or attached requirement documents. Merge + dedupe by name.
  const requestedDocs = React.useMemo(() => {
    const out: Array<{ name: string; required: boolean }> = [];
    const seen = new Set<string>();
    const push = (name: unknown, required: boolean) => {
      const label = String(name || '').trim();
      const key = label.toLowerCase();
      if (!label || seen.has(key)) return;
      seen.add(key);
      out.push({ name: label, required });
    };
    const payloadDocs = rfqData?.payload?.documents;
    if (Array.isArray(payloadDocs)) payloadDocs.forEach((d: any) => push(d?.name, d?.required !== false));
    if (Array.isArray(rfqData?.requiredDocuments)) rfqData.requiredDocuments.forEach((d: any) => push(d, true));
    documents.forEach((d: any) => push(d?.documentType || d?.name, d?.required === true));
    return out;
  }, [rfqData, documents]);

  // Initialise one upload slot per requested document and one quote row per buyer line item
  // (both only once per load; draft restore below may overwrite).
  const dynInitRef = useRef(false);
  React.useEffect(() => {
    if (dynInitRef.current || !rfqData) return;
    dynInitRef.current = true;
    const saved = ownResponse?.responseData || ownResponse || {};
    const savedDocs: any[] = Array.isArray(saved.documents) ? saved.documents : (Array.isArray(ownResponse?.documents) ? ownResponse.documents : []);
    const savedLines: any[] = Array.isArray(saved.lineItems) ? saved.lineItems : (Array.isArray(saved.lineQuotes) ? saved.lineQuotes : (Array.isArray(ownResponse?.lineItems) ? ownResponse.lineItems : []));
    const restoreSaved = !!ownResponse;

    setDocUploads(requestedDocs.map(doc => {
      const match = restoreSaved ? savedDocs.find(d => String(d?.name || d?.documentType || '').toLowerCase() === doc.name.toLowerCase()) : null;
      return match?.fileAssetId || match?.fileUrl || match?.url
        ? { ...doc, fileAssetId: match.fileAssetId || match.id, fileName: match.fileName || match.name || doc.name, fileUrl: match.fileUrl || match.url || '', status: 'done', progress: 100 }
        : { ...doc, status: 'empty', progress: 0 };
    }));

    setLineQuotes(itemsList.map(item => {
      const match = restoreSaved ? savedLines.find(l => String(l?.itemName || l?.name || '').toLowerCase() === String(item.itemName).toLowerCase()) : null;
      return {
        itemName: item.itemName,
        quantity: Number(item.quantity) || 0,
        unitOfMeasure: item.unitOfMeasure || 'Nos',
        unitPrice: match?.unitPrice != null ? String(match.unitPrice) : '',
        gstPercent: match?.gstPercent != null ? String(match.gstPercent) : '',
        makeBrand: match?.makeBrand || match?.brand || '',
        remarks: match?.remarks || ''
      };
    }));
  }, [rfqData, ownResponse]);

  // Line-quote totals: when the seller prices per line, keep the headline offered price/qty in sync.
  const lineTotals = React.useMemo(() => {
    let total = 0;
    let qty = 0;
    let priced = 0;
    lineQuotes.forEach(line => {
      const price = Number(line.unitPrice);
      const lineQty = Number(line.quantity) || 0;
      if (line.unitPrice !== '' && Number.isFinite(price) && price >= 0) {
        priced += 1;
        const gst = Number(line.gstPercent) || 0;
        total += price * lineQty * (1 + gst / 100);
        qty += lineQty;
      }
    });
    return { total: Math.round(total * 100) / 100, qty, priced };
  }, [lineQuotes]);

  React.useEffect(() => {
    if (lineTotals.priced === 0 || lineTotals.priced < lineQuotes.length) return;
    setOfferedPrice(String(lineTotals.total));
    setOfferedQuantity(String(lineTotals.qty));
  }, [lineTotals, lineQuotes.length]);

  // Assemble the structured submission payload persisted as RequirementResponse.responseData.
  // Function declaration (hoisted) so saveDraft, defined earlier in the component, can call it.
  function buildResponseData() {
    const docs = docUploads
      .filter(doc => doc.status === 'done' && (doc.fileAssetId || doc.fileUrl))
      .map(doc => ({ name: doc.name, fileAssetId: doc.fileAssetId || null, fileName: doc.fileName || null, fileUrl: doc.fileUrl || null }));
    const lines = lineQuotes
      .filter(line => line.unitPrice !== '' && Number.isFinite(Number(line.unitPrice)))
      .map(line => ({
        itemName: line.itemName,
        quantity: Number(line.quantity) || null,
        unitPrice: Number(line.unitPrice),
        gstPercent: line.gstPercent !== '' ? Number(line.gstPercent) : null,
        makeBrand: line.makeBrand.trim() || null,
        remarks: line.remarks.trim() || null
      }));
    if (!docs.length && !lines.length) return undefined;
    return { documents: docs, lineItems: lines };
  }

  const uploadRequestedDoc = useCallback(async (index: number, file: File) => {
    if (file.size > 10 * 1024 * 1024) {
      toast.error('File size must be under 10 MB');
      return;
    }
    setDocUploads(prev => prev.map((doc, i) => i === index ? { ...doc, status: 'uploading', progress: 0, error: undefined } : doc));
    try {
      const result = await uploadFile(file, percent => {
        setDocUploads(prev => prev.map((doc, i) => i === index ? { ...doc, progress: percent } : doc));
      });
      setDocUploads(prev => prev.map((doc, i) => i === index
        ? { ...doc, status: 'done', progress: 100, fileAssetId: result.id || null, fileName: file.name, fileUrl: result.url }
        : doc));
      setErrors(prev => { const n = { ...prev }; delete n.requestedDocs; return n; });
      toast.success(`${file.name} uploaded`);
    } catch (err: any) {
      setDocUploads(prev => prev.map((doc, i) => i === index ? { ...doc, status: 'error', error: err?.message || 'Upload failed' } : doc));
      toast.error(err?.message || 'Upload failed');
    }
  }, []);

  const clearRequestedDoc = (index: number) => {
    setDocUploads(prev => prev.map((doc, i) => i === index
      ? { name: doc.name, required: doc.required, status: 'empty', progress: 0 }
      : doc));
  };

  const updateLineQuote = (index: number, patch: Partial<LineQuote>) => {
    setLineQuotes(prev => prev.map((line, i) => i === index ? { ...line, ...patch } : line));
  };

  const validate = (): boolean => {
    const errs: Record<string, string> = {};
    const price = Number(offeredPrice);
    if (!offeredPrice || isNaN(price) || price <= 0) errs.offeredPrice = 'Valid offered price required';
    const qty = Number(offeredQuantity);
    if (!offeredQuantity || isNaN(qty) || qty <= 0) errs.offeredQuantity = 'Valid offered quantity required';
    if (!deliveryTimeline.trim()) errs.deliveryTimeline = 'Delivery timeline required';
    if (!message.trim() || message.trim().length < 10) errs.message = 'Message must be at least 10 characters';
    if (message.length > 3000) errs.message = 'Message cannot exceed 3000 characters';
    const missingDocs = docUploads.filter(doc => doc.required && doc.status !== 'done');
    if (missingDocs.length > 0) {
      errs.requestedDocs = `Upload the required document${missingDocs.length > 1 ? 's' : ''}: ${missingDocs.map(d => d.name).join(', ')}`;
    }
    if (!declared) errs.declared = 'You must declare the information is accurate';
    setErrors(errs);
    return Object.keys(errs).length === 0;
  };

  const handleFileSelect = useCallback((files: FileList | File[]) => {
    const file = files[0];
    if (!file) return;
    if (file.size > 10 * 1024 * 1024) {
      toast.error('File size must be under 10 MB');
      return;
    }
    setUploadState({ file, progress: 0, status: 'pending' });
    setErrors(prev => {
      const next = { ...prev };
      delete next.attachment;
      return next;
    });
  }, []);

  const handleUpload = useCallback(async () => {
    if (!uploadState || !uploadState.file || uploadState.status === 'done') return;
    setUploadState(prev => prev ? { ...prev, status: 'uploading', progress: 0 } : prev);
    try {
      const result = await uploadFile(uploadState.file, (percent) => {
        setUploadState(prev => prev ? { ...prev, progress: percent } : prev);
      });
      setUploadState(prev => prev ? { ...prev, status: 'done', progress: 100, url: result.url } : prev);
      toast.success('Document uploaded');
    } catch (err: any) {
      setUploadState(prev => prev ? { ...prev, status: 'error', error: err?.message || 'Upload failed' } : prev);
      toast.error(err?.message || 'Upload failed');
    }
  }, [uploadState]);

  React.useEffect(() => {
    if (uploadState?.status === 'pending') {
      handleUpload();
    }
  }, [uploadState?.status, handleUpload]);

  const removeFile = () => {
    setUploadState(null);
    if (fileInputRef.current) fileInputRef.current.value = '';
  };

  const handleSubmit = async () => {
    if (!validate()) return;
    if (!resolvedId) {
      toast.error('Invalid requirement');
      return;
    }

    setSubmitting(true);
    try {
      const payload: any = {
        offeredPrice: Number(offeredPrice),
        offeredQuantity: Number(offeredQuantity),
        deliveryTimeline: deliveryTimeline.trim(),
        message: message.trim(),
        terms: terms.trim() || undefined,
        status: 'SUBMITTED',
      };
      if (uploadState?.url) {
        payload.attachmentUrl = uploadState.url;
      }
      const responseData = buildResponseData();
      if (responseData) payload.responseData = responseData;

      await postApi(`/api/marketplace/requirements/${resolvedId}/responses`, payload);
      localStorage.removeItem(`rfq_draft_${requirementId}`);
      setSubmitted(true);
      toast.success('Quotation submitted successfully');
    } catch (err: any) {
      toast.error(err?.message || 'Failed to submit quotation');
    } finally {
      setSubmitting(false);
    }
  };

  const handleBackToRfq = () => {
    window.location.href = `/seller/rfq?requirementId=${requirementId}`;
  };

  if (!requirementId) {
    return (
      <div className="mx-auto max-w-[1200px] px-4 py-12">
        <div className="rounded-3xl border border-red-200 bg-red-50 p-8 text-center">
          <AlertTriangle className="mx-auto h-12 w-12 text-red-400" />
          <h2 className="mt-4 text-lg font-black text-red-800">Invalid Requirement</h2>
          <p className="mt-2 text-sm text-red-600">No requirement ID provided.</p>
          <Button onClick={() => window.location.href = '/seller/opportunities'} className="mt-4 bg-[#12335f] text-white">
            Back to Opportunities
          </Button>
        </div>
      </div>
    );
  }

  if (isLoading) {
    return (
      <div className="flex h-[80vh] flex-col items-center justify-center gap-3">
        <Loader2 className="h-10 w-10 animate-spin text-[#12335f]" />
        <p className="text-sm font-bold text-slate-500">Loading requirement details...</p>
      </div>
    );
  }

  if (error || !rfqData) {
    return (
      <div className="mx-auto max-w-[1200px] px-4 py-12">
        <div className="rounded-3xl border border-red-200 bg-red-50 p-8 text-center">
          <AlertTriangle className="mx-auto h-12 w-12 text-red-400" />
          <h2 className="mt-4 text-lg font-black text-red-800">Failed to Load</h2>
          <p className="mt-2 text-sm text-red-600">Could not load requirement details. Please try again.</p>
          <Button onClick={handleBackToRfq} className="mt-4 bg-[#12335f] text-white">
            Go Back
          </Button>
        </div>
      </div>
    );
  }


  const fieldError = (field: string) => {
    if (!errors[field]) return null;
    return <p className="mt-1 text-[10px] font-bold text-red-600">{errors[field]}</p>;
  };

  return (
    <div className="mx-auto max-w-[1400px] space-y-6 px-4 py-6 md:px-8 pb-12">
      {submitted && (
        <div className="mb-4 rounded-xl border border-emerald-200 bg-emerald-50 p-4 flex items-center justify-between shadow-sm">
          <div className="flex items-center gap-3">
            <CheckCircle2 className="h-5 w-5 text-emerald-600" />
            <div>
              <h3 className="text-sm font-black text-emerald-800">Quotation Submitted</h3>
              <p className="text-xs font-semibold text-emerald-700">This quotation has been submitted. It is now in read-only mode.</p>
            </div>
          </div>
          <Button onClick={handleBackToRfq} className="bg-emerald-600 hover:bg-emerald-700 text-white rounded-xl h-9 text-xs font-black uppercase shadow-sm">
            Back to Requirement
          </Button>
        </div>
      )}
      {!submitted && isClosed && (
        <div className="mb-4 rounded-xl border border-slate-200 bg-slate-50 p-4 flex items-center justify-between shadow-sm">
          <div className="flex items-center gap-3">
            <AlertTriangle className="h-5 w-5 text-slate-500" />
            <div>
              <h3 className="text-sm font-black text-slate-800">Requirement {rfqData?.status}</h3>
              <p className="text-xs font-semibold text-slate-500">This requirement is no longer accepting new quotations.</p>
            </div>
          </div>
          <Button onClick={handleBackToRfq} className="bg-slate-600 hover:bg-slate-700 text-white rounded-xl h-9 text-xs font-black uppercase shadow-sm">
            Back to Requirement
          </Button>
        </div>
      )}

      {/* Breadcrumb */}
      <nav className="flex items-center gap-1.5 text-xs font-bold text-slate-500">
        <span className="hover:text-slate-800 cursor-pointer" onClick={() => window.location.href = '/seller/opportunities'}>
          Opportunities
        </span>
        <ChevronRight className="h-3 w-3" />
        <span className="hover:text-slate-800 cursor-pointer" onClick={() => window.location.href = '/seller/opportunities/rfqs'}>
          RFQs
        </span>
        <ChevronRight className="h-3 w-3" />
        <span className="hover:text-slate-800 cursor-pointer" onClick={handleBackToRfq}>
          {rfqNumber}
        </span>
        <ChevronRight className="h-3 w-3" />
        <span className="text-[#12335f]">Submit Quotation</span>
      </nav>

      {/* Header Card */}
      <section className="relative overflow-hidden border border-slate-200/80 rounded-2xl bg-white p-6 md:p-8 shadow-sm transition-all duration-300 hover:shadow-md">
        <div className="absolute top-0 left-0 right-0 h-1.5 bg-gradient-to-r from-[#12335f] via-indigo-600 to-blue-500" />

        <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between pt-1">
          <div className="space-y-2">
            <div className="flex flex-wrap items-center gap-2.5">
              <h1 className="text-2xl md:text-3xl font-black tracking-tight text-slate-900">
                Submit Quotation
              </h1>
              <span className="inline-flex items-center rounded-full bg-indigo-50 px-3 py-1 text-xs font-black tracking-wider text-indigo-700 border border-indigo-200/80 shadow-2xs">
                RFQ
              </span>
            </div>
            <p className="text-xs md:text-sm font-medium text-slate-500 flex flex-wrap items-center gap-2">
              <span className="font-mono font-bold text-slate-700 bg-slate-100 px-2 py-0.5 rounded text-xs border border-slate-200">{rfqNumber}</span>
              <span className="text-slate-300">•</span>
              <span className="font-bold text-slate-800">{subject}</span>
            </p>
            <div className="flex flex-wrap items-center gap-4 pt-1">
              <div className="flex items-center gap-1.5 text-xs text-slate-600 bg-slate-50 px-2.5 py-1 rounded-lg border border-slate-100">
                <Building2 className="h-3.5 w-3.5 text-slate-400" />
                <span className="font-bold text-slate-800">{orgName}</span>
              </div>
              <div className="flex items-center gap-1.5 text-xs text-slate-600 bg-slate-50 px-2.5 py-1 rounded-lg border border-slate-100">
                <Calendar className="h-3.5 w-3.5 text-slate-400" />
                <span className="font-bold text-slate-800">Deadline: {deadline}</span>
              </div>
            </div>
          </div>
          <Button
            type="button"
            variant="outline"
            onClick={handleBackToRfq}
            className="h-10 rounded-xl border-slate-200 bg-white text-xs font-bold text-slate-700 hover:bg-slate-50 hover:text-slate-900 shadow-2xs transition-all flex items-center gap-1.5 shrink-0"
          >
            <ArrowLeft className="h-4 w-4" /> Back to RFQ
          </Button>
        </div>
      </section>

      {/* ── Sticky Quick Navigation Bar ── */}
      <div className="sticky top-4 z-40 bg-white/90 backdrop-blur-md border border-slate-200/80 rounded-2xl px-4 py-2.5 shadow-md transition-all duration-300">
        <div className="flex items-center gap-2 overflow-x-auto no-scrollbar">
          <button
            type="button"
            onClick={() => scrollToSection('quotation-details')}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-bold text-slate-600 hover:text-[#12335f] hover:bg-slate-100 transition-all whitespace-nowrap active:scale-95"
          >
            <IndianRupee className="h-3.5 w-3.5 text-emerald-600" /> Quotation Details
          </button>
          <button
            type="button"
            onClick={() => scrollToSection('message-documents')}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-bold text-slate-600 hover:text-[#12335f] hover:bg-slate-100 transition-all whitespace-nowrap active:scale-95"
          >
            <FileText className="h-3.5 w-3.5 text-blue-600" /> Message & Documents
          </button>
          {lineQuotes.length > 0 && (
            <button
              type="button"
              onClick={() => scrollToSection('item-wise-pricing')}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-bold text-slate-600 hover:text-[#12335f] hover:bg-slate-100 transition-all whitespace-nowrap active:scale-95"
            >
              <Package className="h-3.5 w-3.5 text-amber-600" /> Item-Wise Quotation
            </button>
          )}
          {docUploads.length > 0 && (
            <button
              type="button"
              onClick={() => scrollToSection('requested-documents')}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-bold text-slate-600 hover:text-[#12335f] hover:bg-slate-100 transition-all whitespace-nowrap active:scale-95"
            >
              <Paperclip className="h-3.5 w-3.5 text-purple-600" /> Requested Documents
            </button>
          )}
          <button
            type="button"
            onClick={() => scrollToSection('submit-action')}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-bold text-slate-600 hover:text-[#12335f] hover:bg-slate-100 transition-all whitespace-nowrap active:scale-95"
          >
            <ShieldCheck className="h-3.5 w-3.5 text-indigo-600" /> Declaration & Submit
          </button>
        </div>
      </div>

      {/* Main Two-Column Form */}
      <div className="grid gap-6 lg:grid-cols-[1fr_1fr]">

        {/* Left Column — Quotation Details */}
        <section id="quotation-details" className="scroll-mt-24 border border-slate-200/80 rounded-2xl bg-white p-6 shadow-sm space-y-6 transition-all duration-300 hover:shadow-md">
          <h2 className="text-base font-black text-slate-900 pb-3 border-b border-slate-100">
            Quotation Details
          </h2>

          {/* Offered Price */}
          <div>
            <label className="block text-xs font-black uppercase text-slate-500 tracking-wider mb-1.5">
              Offered Price (₹) <span className="text-red-500">*</span>
            </label>
            <div className="relative">
              <input
                type="number"
                min="0"
                step="0.01"
                value={offeredPrice}
                onChange={e => { setOfferedPrice(e.target.value); setErrors(prev => { const n = { ...prev }; delete n.offeredPrice; return n; }); }}
                disabled={isReadOnly || (lineQuotes.length > 0)}
                placeholder="e.g. 150000"
                className={cn(
                  "peer h-11 w-full rounded-xl border pl-9 pr-16 text-sm font-semibold text-slate-900 outline-none transition disabled:bg-slate-50 disabled:text-slate-500",
                  errors.offeredPrice ? "border-red-300 focus:ring-red-200 bg-red-50/30" : "border-slate-200 focus:ring-[#12335f]/20 focus:border-[#12335f]"
                )}
              />
              <div className="absolute inset-y-0 left-0 flex items-center pl-3 pointer-events-none">
                <IndianRupee className="h-4 w-4 text-slate-400" />
              </div>
              <div className={cn(
                "absolute inset-y-0 right-0 flex items-center rounded-r-xl border border-l-0 px-3 transition-colors",
                errors.offeredPrice ? "border-red-300 bg-red-50/50 text-red-500" : "border-slate-200 bg-slate-50/50 text-slate-500 peer-focus:border-[#12335f]"
              )}>
                <span className="text-xs font-bold uppercase tracking-wider">INR</span>
              </div>
            </div>
            {fieldError('offeredPrice')}
          </div>

          {/* Offered Quantity */}
          <div>
            <label className="block text-xs font-black uppercase text-slate-500 tracking-wider mb-1.5">
              Offered Quantity <span className="text-red-500">*</span>
            </label>
            <div className="relative">
              <div className="absolute inset-y-0 left-0 flex items-center pl-3 pointer-events-none">
                <Package className="h-4 w-4 text-slate-400" />
              </div>
              <input
                type="number"
                min="0"
                step="1"
                value={offeredQuantity}
                onChange={e => { setOfferedQuantity(e.target.value); setErrors(prev => { const n = { ...prev }; delete n.offeredQuantity; return n; }); }}
                disabled={isReadOnly || (lineQuotes.length > 0)}
                placeholder={`e.g. ${maxQuantity || 100}`}
                className={cn(
                  "w-full rounded-xl border py-2.5 pl-9 pr-4 text-sm font-bold text-slate-800 placeholder:text-slate-300 focus:outline-none focus:ring-2 transition disabled:bg-slate-50 disabled:text-slate-500",
                  errors.offeredQuantity ? "border-red-300 focus:ring-red-200 bg-red-50/30" : "border-slate-200 focus:ring-[#12335f]/20 focus:border-[#12335f]"
                )}
              />
            </div>
            <p className="mt-1 text-[10px] text-slate-400 font-semibold">
              {itemsList.length > 0 ? `Requirement includes ${itemsList.length} item(s). Specify total quantity you can supply.` : ''}
            </p>
            {fieldError('offeredQuantity')}
          </div>

          {/* Delivery Timeline */}
          <div>
            <label className="block text-xs font-black uppercase text-slate-500 tracking-wider mb-1.5">
              Delivery Timeline <span className="text-red-500">*</span>
            </label>
            <div className="relative">
              <div className="absolute inset-y-0 left-0 flex items-center pl-3 pointer-events-none">
                <Clock className="h-4 w-4 text-slate-400" />
              </div>
              <input
                type="text"
                value={deliveryTimeline}
                onChange={e => { setDeliveryTimeline(e.target.value); setErrors(prev => { const n = { ...prev }; delete n.deliveryTimeline; return n; }); }}
                disabled={isReadOnly}
                placeholder="e.g. 15 days, 30 days, 4 weeks"
                className={cn(
                  "w-full rounded-xl border py-2.5 pl-9 pr-4 text-sm font-bold text-slate-800 placeholder:text-slate-300 focus:outline-none focus:ring-2 transition disabled:bg-slate-50 disabled:text-slate-500",
                  errors.deliveryTimeline ? "border-red-300 focus:ring-red-200 bg-red-50/30" : "border-slate-200 focus:ring-[#12335f]/20 focus:border-[#12335f]"
                )}
              />
            </div>
            {fieldError('deliveryTimeline')}
          </div>

          {/* Terms & Conditions */}
          <div>
            <label className="block text-xs font-black uppercase text-slate-500 tracking-wider mb-1.5">
              Terms & Conditions
            </label>
            <textarea
              value={terms}
              onChange={e => setTerms(e.target.value)}
              disabled={isReadOnly}
              placeholder="Any additional terms, warranty, payment terms, etc."
              rows={4}
              className="w-full rounded-xl border border-slate-200 p-3 text-sm font-semibold text-slate-700 placeholder:text-slate-300 focus:outline-none focus:ring-2 focus:ring-[#12335f]/20 focus:border-[#12335f] transition resize-y disabled:bg-slate-50 disabled:text-slate-500"
            />
          </div>
        </section>

        {/* Right Column — Message & Documents */}
        <section id="message-documents" className="scroll-mt-24 border border-slate-200/80 rounded-2xl bg-white p-6 shadow-sm space-y-6 transition-all duration-300 hover:shadow-md">
          <h2 className="text-base font-black text-slate-900 pb-3 border-b border-slate-100">
            Message & Documents
          </h2>

          {/* Quotation Message / Cover Note */}
          <div>
            <label className="block text-xs font-black uppercase text-slate-500 tracking-wider mb-1.5">
              Quotation Message / Cover Note <span className="text-red-500">*</span>
            </label>
            <textarea
              value={message}
              onChange={e => { setMessage(e.target.value); setErrors(prev => { const n = { ...prev }; delete n.message; return n; }); }}
              placeholder="Write a cover note for your quotation (min 10 characters)..."
              disabled={isReadOnly}
              rows={6}
              className={cn(
                "w-full rounded-xl border p-3 text-sm font-semibold text-slate-700 placeholder:text-slate-300 focus:outline-none focus:ring-2 transition resize-y disabled:bg-slate-50 disabled:text-slate-500",
                errors.message ? "border-red-300 focus:ring-red-200 bg-red-50/30" : "border-slate-200 focus:ring-[#12335f]/20 focus:border-[#12335f]"
              )}
            />
            <div className="flex items-center justify-between mt-1">
              {fieldError('message')}
              <span className={cn(
                "ml-auto text-[10px] font-semibold",
                message.length > 3000 ? "text-red-500" : "text-slate-400"
              )}>
                {message.length}/3000
              </span>
            </div>
          </div>

          {/* Upload Supporting Documents */}
          <div>
            <label className="block text-xs font-black uppercase text-slate-500 tracking-wider mb-1.5">
              Upload Supporting Documents
            </label>
            <p className="text-[10px] text-slate-400 font-semibold mb-3">
              Upload price schedule, catalogues, or any supporting documents (PDF, DOC, JPG, PNG — max 10 MB)
            </p>

            {uploadState ? (
              <div className="rounded-xl border border-slate-200 bg-slate-50/50 p-4 space-y-3">
                <div className="flex items-start gap-3">
                  <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-blue-50 text-[#12335f]">
                    <FileText className="h-4 w-4" />
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-xs font-bold text-slate-800 truncate">
                      {uploadState.file?.name || uploadState.fileName || 'Attachment'}
                    </p>
                    {(uploadState.file?.size || uploadState.fileSize) && (
                      <p className="text-[10px] font-semibold text-slate-500">
                        {(((uploadState.file?.size || uploadState.fileSize || 0) / 1024)).toFixed(1)} KB
                      </p>
                    )}
                    {uploadState.status === 'uploading' && (
                      <div className="mt-2 h-1.5 w-full overflow-hidden rounded-full bg-slate-200">
                        <div
                          className="h-full rounded-full bg-[#12335f] transition-all duration-300"
                          style={{ width: `${uploadState.progress}%` }}
                        />
                      </div>
                    )}
                    {uploadState.status === 'done' && (
                      <div className="flex items-center gap-1 mt-1">
                        <CheckCircle2 className="h-3 w-3 text-emerald-600" />
                        <span className="text-[10px] font-bold text-emerald-700">Uploaded</span>
                      </div>
                    )}
                    {uploadState.status === 'error' && (
                      <p className="text-[10px] font-bold text-red-600 mt-1">{uploadState.error || 'Upload failed'}</p>
                    )}
                  </div>
                  <button
                    type="button"
                    onClick={removeFile}
                    className="shrink-0 rounded-lg p-1.5 text-slate-400 hover:bg-slate-200 hover:text-slate-600 transition"
                  >
                    <X className="h-4 w-4" />
                  </button>
                </div>
              </div>
            ) : (
              <label
                onDragOver={e => { e.preventDefault(); e.currentTarget.classList.add('border-[#12335f]', 'bg-blue-50/30'); }}
                onDragLeave={e => { e.currentTarget.classList.remove('border-[#12335f]', 'bg-blue-50/30'); }}
                onDrop={e => {
                  e.preventDefault();
                  e.currentTarget.classList.remove('border-[#12335f]', 'bg-blue-50/30');
                  if (e.dataTransfer.files.length) handleFileSelect(e.dataTransfer.files);
                }}
                className="flex min-h-32 cursor-pointer flex-col items-center justify-center rounded-xl border-2 border-dashed border-slate-300 bg-white p-5 text-center transition hover:border-slate-400 hover:bg-slate-50/50"
              >
                <FileUp className="h-8 w-8 text-slate-400" />
                <span className="mt-2 text-sm font-black text-slate-600">Drag & drop files here</span>
                <span className="mt-1 text-[10px] text-slate-400 font-semibold">or click to browse</span>
                <input
                  ref={fileInputRef}
                  type="file"
                  accept=".pdf,.doc,.docx,.xls,.xlsx,.csv,.jpg,.jpeg,.png"
                  onChange={e => e.target.files && handleFileSelect(e.target.files)}
                  className="hidden"
                />
              </label>
            )}
            {fieldError('attachment')}
          </div>

          {/* Required Documents List */}
          {documents.length > 0 && (
            <div>
              <label className="block text-xs font-black uppercase text-slate-500 tracking-wider mb-2">
                <Paperclip className="inline h-3 w-3 mr-1" />
                Required Documents from Requirement
              </label>
              <div className="space-y-1.5">
                {documents.map((doc: any, idx: number) => (
                  <div
                    key={idx}
                    className="flex items-center gap-2 rounded-lg border border-slate-100 bg-slate-50/50 px-3 py-2"
                  >
                    <FileText className="h-3.5 w-3.5 text-slate-400 shrink-0" />
                    <span className="text-xs font-semibold text-slate-600">{doc.fileName || doc.documentType || 'Document'}</span>
                    {doc.required && (
                      <span className="rounded-full px-1.5 py-0.5 text-[8px] font-black uppercase border border-rose-200 bg-rose-50 text-rose-700 shrink-0 ml-auto">
                        Required
                      </span>
                    )}
                  </div>
                ))}
              </div>
            </div>
          )}
        </section>
      </div>

      {/* Per-line-item quote — seller prices each buyer line; totals feed the headline offer */}
      {lineQuotes.length > 0 && (
        <section id="item-wise-pricing" className="scroll-mt-24 border border-slate-200/80 rounded-2xl bg-white p-6 shadow-sm overflow-hidden transition-all duration-300 hover:shadow-md">
          <div className="flex flex-wrap items-center justify-between gap-2 pb-3 border-b border-slate-100">
            <h2 className="text-base font-black text-slate-900">Item-Wise Quotation</h2>
            <p className="text-[11px] font-semibold text-slate-500">
              Price every line — the totals auto-fill your offered price and quantity above.
            </p>
          </div>
          <div className="mt-4 overflow-x-auto border border-slate-200 rounded-xl bg-white shadow-sm">
            <table className="min-w-[860px] w-full text-left border-collapse">
              <thead className="bg-slate-50 border-b border-slate-200">
                <tr>
                  <th className="px-4 py-2.5 text-[10px] font-black uppercase text-slate-500">Item</th>
                  <th className="px-4 py-2.5 text-[10px] font-black uppercase text-slate-500 text-right">Qty / Unit</th>
                  <th className="px-4 py-2.5 text-[10px] font-black uppercase text-slate-500 text-right w-36">Unit Price (₹)</th>
                  <th className="px-4 py-2.5 text-[10px] font-black uppercase text-slate-500 text-right w-24">GST %</th>
                  <th className="px-4 py-2.5 text-[10px] font-black uppercase text-slate-500 w-36">Make / Brand</th>
                  <th className="px-4 py-2.5 text-[10px] font-black uppercase text-slate-500 text-right w-32">Line Total (₹)</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {lineQuotes.map((line, idx) => {
                  const price = Number(line.unitPrice);
                  const hasPrice = line.unitPrice !== '' && Number.isFinite(price) && price >= 0;
                  const lineTotal = hasPrice ? price * (Number(line.quantity) || 0) * (1 + (Number(line.gstPercent) || 0) / 100) : 0;
                  return (
                    <tr key={idx} className="hover:bg-slate-50/30 transition-colors">
                      <td className="px-4 py-3 text-xs font-bold text-slate-900">
                        {line.itemName}
                        {itemsList[idx]?.description && (
                          <p className="mt-0.5 text-[10px] font-semibold text-slate-500 line-clamp-1">{itemsList[idx].description}</p>
                        )}
                      </td>
                      <td className="px-4 py-3 text-xs font-bold text-slate-800 text-right tabular-nums whitespace-nowrap">
                        {line.quantity} <span className="text-[10px] font-semibold text-slate-500 uppercase">{line.unitOfMeasure}</span>
                      </td>
                      <td className="px-4 py-2 text-right">
                        <input
                          type="number"
                          min="0"
                          step="0.01"
                          value={line.unitPrice}
                          onChange={e => updateLineQuote(idx, { unitPrice: e.target.value })}
                          disabled={isReadOnly}
                          placeholder="0.00"
                          className="h-9 w-full rounded-lg border border-slate-200 bg-white px-2 text-right text-xs font-bold text-slate-900 outline-none transition focus:border-[#12335f] focus:ring-2 focus:ring-[#12335f]/15 disabled:bg-slate-50 disabled:text-slate-500"
                        />
                      </td>
                      <td className="px-4 py-2 text-right">
                        <input
                          type="number"
                          min="0"
                          max="100"
                          step="0.1"
                          value={line.gstPercent}
                          onChange={e => updateLineQuote(idx, { gstPercent: e.target.value })}
                          disabled={isReadOnly}
                          placeholder="18"
                          className="h-9 w-full rounded-lg border border-slate-200 bg-white px-2 text-right text-xs font-bold text-slate-900 outline-none transition focus:border-[#12335f] focus:ring-2 focus:ring-[#12335f]/15 disabled:bg-slate-50 disabled:text-slate-500"
                        />
                      </td>
                      <td className="px-4 py-2">
                        <input
                          type="text"
                          value={line.makeBrand}
                          onChange={e => updateLineQuote(idx, { makeBrand: e.target.value })}
                          disabled={isReadOnly}
                          placeholder="Optional"
                          className="h-9 w-full rounded-lg border border-slate-200 bg-white px-2 text-xs font-semibold text-slate-900 outline-none transition focus:border-[#12335f] focus:ring-2 focus:ring-[#12335f]/15 disabled:bg-slate-50 disabled:text-slate-500"
                        />
                      </td>
                      <td className="px-4 py-3 text-xs font-black text-slate-900 text-right tabular-nums">
                        {hasPrice ? `₹${lineTotal.toLocaleString('en-IN', { maximumFractionDigits: 2 })}` : '—'}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
              {lineTotals.priced > 0 && (
                <tfoot className="bg-slate-50 border-t border-slate-200">
                  <tr>
                    <td colSpan={5} className="px-4 py-3 text-xs font-black uppercase tracking-wider text-slate-600 text-right">
                      Total ({lineTotals.priced}/{lineQuotes.length} items priced, incl. GST)
                    </td>
                    <td className="px-4 py-3 text-sm font-black text-[#12335f] text-right tabular-nums">
                      ₹{lineTotals.total.toLocaleString('en-IN', { maximumFractionDigits: 2 })}
                    </td>
                  </tr>
                </tfoot>
              )}
            </table>
          </div>
        </section>
      )}

      {/* Buyer-requested documents — one upload slot per document the buyer asked for */}
      {docUploads.length > 0 && (
        <section id="requested-documents" className="scroll-mt-24 border border-slate-200/80 rounded-2xl bg-white p-6 shadow-sm transition-all duration-300 hover:shadow-md">
          <div className="flex flex-wrap items-center justify-between gap-2 pb-3 border-b border-slate-100">
            <h2 className="text-base font-black text-slate-900">Documents Requested By Buyer</h2>
            <p className="text-[11px] font-semibold text-slate-500">
              {docUploads.filter(d => d.status === 'done').length}/{docUploads.length} uploaded
              {docUploads.some(d => d.required) ? ' · required documents are marked *' : ''}
            </p>
          </div>
          {errors.requestedDocs && (
            <div className="mt-3 rounded-xl border border-red-200 bg-red-50 px-4 py-2.5 text-xs font-bold text-red-700">
              {errors.requestedDocs}
            </div>
          )}
          <div className="mt-4 grid gap-3 md:grid-cols-2">
            {docUploads.map((doc, idx) => (
              <div
                key={doc.name}
                className={cn(
                  'rounded-2xl border p-4 transition',
                  doc.status === 'done' ? 'border-emerald-200 bg-emerald-50/40'
                    : doc.status === 'error' ? 'border-red-200 bg-red-50/40'
                    : doc.required && errors.requestedDocs ? 'border-red-300 bg-white'
                    : 'border-slate-200 bg-white'
                )}
              >
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <p className="text-xs font-black text-slate-900 text-wrap-anywhere">
                      {doc.name} {doc.required && <span className="text-red-500">*</span>}
                    </p>
                    {doc.status === 'done' && doc.fileName ? (
                      <p className="mt-1 flex items-center gap-1 text-[11px] font-bold text-emerald-700">
                        <CheckCircle2 className="h-3.5 w-3.5 shrink-0" /> {doc.fileName}
                      </p>
                    ) : doc.status === 'uploading' ? (
                      <p className="mt-1 text-[11px] font-bold text-slate-500">Uploading… {doc.progress}%</p>
                    ) : doc.status === 'error' ? (
                      <p className="mt-1 text-[11px] font-bold text-red-600">{doc.error || 'Upload failed'}</p>
                    ) : (
                      <p className="mt-1 text-[11px] font-semibold text-slate-400">PDF, image or doc, max 10 MB</p>
                    )}
                  </div>
                  <div className="flex shrink-0 items-center gap-1.5">
                    {!isReadOnly && (
                      doc.status === 'done' ? (
                        <button
                          type="button"
                          onClick={() => clearRequestedDoc(idx)}
                          className="inline-flex h-8 items-center rounded-lg border border-slate-200 bg-white px-2.5 text-[11px] font-black text-slate-600 hover:border-red-300 hover:text-red-600 transition"
                        >
                          Replace
                        </button>
                      ) : (
                        <label className={cn(
                          'inline-flex h-8 cursor-pointer items-center rounded-lg px-3 text-[11px] font-black text-white transition',
                          doc.status === 'uploading' ? 'bg-slate-300 cursor-wait' : 'bg-[#12335f] hover:bg-[#0b2445]'
                        )}>
                          {doc.status === 'uploading' ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : 'Upload'}
                          <input
                            type="file"
                            className="hidden"
                            disabled={doc.status === 'uploading'}
                            accept=".pdf,.doc,.docx,.xls,.xlsx,.png,.jpg,.jpeg,.webp"
                            onChange={e => {
                              const file = e.target.files?.[0];
                              if (file) uploadRequestedDoc(idx, file);
                              e.target.value = '';
                            }}
                          />
                        </label>
                      )
                    )}
                  </div>
                </div>
                {doc.status === 'uploading' && (
                  <div className="mt-2 h-1.5 w-full overflow-hidden rounded-full bg-slate-100">
                    <div className="h-full rounded-full bg-[#12335f] transition-all" style={{ width: `${doc.progress}%` }} />
                  </div>
                )}
              </div>
            ))}
          </div>
        </section>
      )}

      {/* Declaration & Submit */}
      <section id="submit-action" className="scroll-mt-24 border border-slate-200/80 rounded-2xl bg-white p-6 shadow-sm space-y-4 transition-all duration-300 hover:shadow-md">
        <div className="flex items-start gap-3">
          <input
            type="checkbox"
            id="declaration"
            checked={declared}
            disabled={isReadOnly}
            onChange={e => { setDeclared(e.target.checked); setErrors(prev => { const n = { ...prev }; delete n.declared; return n; }); }}
            className="mt-0.5 h-4 w-4 rounded border-slate-300 text-[#12335f] focus:ring-[#12335f]/20 focus:ring-2 disabled:opacity-50"
          />
          <label htmlFor="declaration" className="text-xs font-semibold text-slate-600 leading-relaxed">
            I declare that the information provided in this quotation is accurate and complete. I understand that any false
            or misleading information may result in disqualification.
          </label>
        </div>
        {fieldError('declared')}

        <div className="flex flex-col sm:flex-row items-center gap-3 pt-2 border-t border-slate-100 w-full">
          {!isReadOnly && (
            <>
              <Button
                type="button"
                onClick={handleSubmit}
                disabled={submitting}
                className="bg-[#12335f] hover:bg-[#0b2447] text-white rounded-xl px-8 h-12 text-xs font-black uppercase shadow-sm transition flex items-center gap-2 w-full sm:w-auto"
              >
                {submitting ? (
                  <>
                    <Loader2 className="h-4 w-4 animate-spin" /> Submitting...
                  </>
                ) : (
                  <>
                    <ShieldCheck className="h-4 w-4" /> {ownResponse && ownResponse.status !== 'DRAFT' ? 'Revise & Update Quotation' : 'Submit Quotation'}
                  </>
                )}
              </Button>
              <Button
                type="button"
                onClick={saveDraft}
                disabled={submitting}
                variant="outline"
                className="rounded-xl border-slate-200 h-12 text-xs font-black uppercase text-[#12335f] hover:bg-slate-50 w-full sm:w-auto"
              >
                Save Draft
              </Button>
            </>
          )}
          <Button
            type="button"
            variant="outline"
            onClick={handleBackToRfq}
            disabled={submitting}
            className="rounded-xl border-slate-200 h-12 text-xs font-black uppercase text-slate-500 w-full sm:w-auto"
          >
            {isReadOnly ? 'Back' : 'Cancel'}
          </Button>
          
          <div className="text-right sm:ml-auto shrink-0 mt-2 sm:mt-0 text-[10px] font-black uppercase tracking-wider text-slate-400">
            {draftSaved ? (
              <span className="text-emerald-600 font-extrabold flex items-center gap-1">
                <CheckCircle2 className="h-3 w-3" /> Draft Saved Successfully
              </span>
            ) : lastSaved ? (
              <span>Last saved draft: {lastSaved}</span>
            ) : (
              <span>Draft not saved yet</span>
            )}
          </div>
        </div>
      </section>

    </div>
  );
}
