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

export default function SubmitQuotationPage() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const { user } = useAuth();
  const requirementId = Number(searchParams?.get('requirementId') || 0);

  const [offeredPrice, setOfferedPrice] = useState('');
  const [offeredQuantity, setOfferedQuantity] = useState('');
  const [deliveryTimeline, setDeliveryTimeline] = useState('');
  const [message, setMessage] = useState('');
  const [terms, setTerms] = useState('');
  const [declared, setDeclared] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [submitted, setSubmitted] = useState(false);
  const [uploadState, setUploadState] = useState<UploadState | null>(null);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [draftSaved, setDraftSaved] = useState(false);
  const [lastSaved, setLastSaved] = useState<string | null>(null);

  const { data: queryData, isLoading, error } = useQuery({
    queryKey: ['marketplace-requirement-quotation', requirementId],
    queryFn: async () => {
      const data = await getApi<any>(`/api/marketplace/requirements/${requirementId}`);
      return data;
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
        estimatedValue: queryData.requirement.estimatedValue || queryData.requirement.budgetMax,
        quantity: queryData.requirement.quantity,
        unit: queryData.requirement.unit,
        status: queryData.requirement.status,
        description: queryData.requirement.description,
      }
    : null;

  const ownResponse = queryData?.ownResponse;

  // Restore draft details from ownResponse on load
  const restoredRef = useRef(false);
  React.useEffect(() => {
    if (!ownResponse || restoredRef.current) return;
    if (ownResponse.status === 'DRAFT') {
      if (ownResponse.offeredPrice) setOfferedPrice(String(ownResponse.offeredPrice));
      if (ownResponse.offeredQuantity) setOfferedQuantity(String(ownResponse.offeredQuantity));
      if (ownResponse.deliveryTimeline) setDeliveryTimeline(ownResponse.deliveryTimeline);
      if (ownResponse.terms) setTerms(ownResponse.terms);
      if (ownResponse.message) setMessage(ownResponse.message);
      if (ownResponse.attachmentUrl) {
        const urlParts = ownResponse.attachmentUrl.split('/');
        const name = decodeURIComponent(urlParts[urlParts.length - 1] || 'Attachment');
        setUploadState({
          fileName: name,
          progress: 100,
          status: 'done',
          url: ownResponse.attachmentUrl
        });
      }
      
      const savedTime = new Date(ownResponse.updatedAt || ownResponse.createdAt).toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit' });
      setLastSaved(savedTime);
      restoredRef.current = true;
      toast.info('Restored your draft quotation from the server.');
    } else if (ownResponse.status !== 'DRAFT') {
      setSubmitted(true);
      restoredRef.current = true;
    }
  }, [ownResponse]);

  // Save draft to database
  const saveDraft = useCallback(async () => {
    if (!requirementId) return;
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
      
      await postApi(`/api/marketplace/requirements/${requirementId}/responses`, payload);
      
      const now = new Date().toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit', second: '2-digit' });
      setLastSaved(now);
      setDraftSaved(true);
      setTimeout(() => setDraftSaved(false), 2000);
    } catch (err: any) {
      console.warn('Failed to save draft to server', err);
      toast.error('Failed to save draft to server');
    }
  }, [requirementId, offeredPrice, offeredQuantity, deliveryTimeline, terms, message, uploadState]);

  // Auto-save on field changes (debounced at 5 seconds)
  React.useEffect(() => {
    if (!requirementId) return;
    if (!offeredPrice && !offeredQuantity && !deliveryTimeline && !terms && !message && !uploadState) {
      return;
    }
    // Don't auto-save if we are already submitted
    if (ownResponse && ownResponse.status !== 'DRAFT') return;
    
    const timer = setTimeout(() => {
      saveDraft();
    }, 5000);
    return () => clearTimeout(timer);
  }, [offeredPrice, offeredQuantity, deliveryTimeline, terms, message, uploadState, requirementId, saveDraft, ownResponse]);

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

  const validate = (): boolean => {
    const errs: Record<string, string> = {};
    const price = Number(offeredPrice);
    if (!offeredPrice || isNaN(price) || price <= 0) errs.offeredPrice = 'Valid offered price required';
    const qty = Number(offeredQuantity);
    if (!offeredQuantity || isNaN(qty) || qty <= 0) errs.offeredQuantity = 'Valid offered quantity required';
    if (!deliveryTimeline.trim()) errs.deliveryTimeline = 'Delivery timeline required';
    if (!message.trim() || message.trim().length < 10) errs.message = 'Message must be at least 10 characters';
    if (message.length > 3000) errs.message = 'Message cannot exceed 3000 characters';
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
    if (!requirementId) {
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
      };
      if (uploadState?.url) {
        payload.attachmentUrl = uploadState.url;
      }

      await postApi(`/api/marketplace/requirements/${requirementId}/responses`, payload);
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

  if (submitted) {
    return (
      <div className="mx-auto max-w-[800px] px-4 py-12">
        <div className="rounded-3xl border border-emerald-100 bg-white p-8 text-center shadow-sm">
          <div className="mx-auto flex h-20 w-20 items-center justify-center rounded-full bg-emerald-50">
            <CheckCircle2 className="h-10 w-10 text-emerald-600" />
          </div>
          <h2 className="mt-6 text-2xl font-black text-slate-900">Quotation Submitted</h2>
          <p className="mt-3 text-sm text-slate-600 max-w-md mx-auto leading-relaxed">
            Your quotation for <span className="font-bold text-slate-800">{subject}</span> has been submitted successfully.
            The buyer will review your submission and get back to you.
          </p>
          <div className="mt-6 flex flex-col sm:flex-row items-center justify-center gap-3">
            <Button
              onClick={handleBackToRfq}
              className="bg-[#12335f] text-white rounded-xl px-6 h-11 text-xs font-black uppercase"
            >
              View Requirement
            </Button>
            <Button
              onClick={() => window.location.href = '/seller/opportunities'}
              variant="outline"
              className="rounded-xl border-slate-200 h-11 text-xs font-black uppercase"
            >
              Back to Opportunities
            </Button>
          </div>
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
      <section className="border border-slate-100 rounded-3xl bg-white p-6 shadow-sm">
        <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
          <div className="space-y-2">
            <div className="flex flex-wrap items-center gap-2">
              <h1 className="text-xl md:text-2xl font-black tracking-tight text-slate-900">
                Submit Quotation
              </h1>
              <span className="inline-flex items-center rounded-full bg-blue-50 px-3 py-1 text-xs font-extrabold tracking-wide text-[#12335f] border border-blue-200">
                RFQ
              </span>
            </div>
            <p className="text-sm font-semibold text-slate-500">
              <span className="font-mono font-bold text-slate-600">{rfqNumber}</span>
              <span className="mx-2">•</span>
              {subject}
            </p>
            <div className="flex flex-wrap items-center gap-4 mt-1">
              <div className="flex items-center gap-1.5 text-xs text-slate-600">
                <Building2 className="h-3.5 w-3.5 text-slate-400" />
                <span className="font-bold">{orgName}</span>
              </div>
              <div className="flex items-center gap-1.5 text-xs text-slate-600">
                <Calendar className="h-3.5 w-3.5 text-slate-400" />
                <span className="font-bold">Deadline: {deadline}</span>
              </div>
            </div>
          </div>
          <Button
            type="button"
            variant="outline"
            onClick={handleBackToRfq}
            className="h-10 rounded-xl border-slate-200 text-xs font-black uppercase text-slate-700 hover:bg-slate-50 shrink-0"
          >
            <ArrowLeft className="mr-2 h-4 w-4" /> Back to RFQ
          </Button>
        </div>
      </section>

      {/* Main Two-Column Form */}
      <div className="grid gap-6 lg:grid-cols-[1fr_1fr]">

        {/* Left Column — Quotation Details */}
        <section className="border border-slate-100 rounded-3xl bg-white p-6 shadow-sm space-y-6">
          <h2 className="text-base font-black text-slate-900 pb-3 border-b border-slate-100">
            Quotation Details
          </h2>

          {/* Offered Price */}
          <div>
            <label className="block text-xs font-black uppercase text-slate-500 tracking-wider mb-1.5">
              Offered Price (₹) <span className="text-red-500">*</span>
            </label>
            <div className="relative">
              <div className="absolute inset-y-0 left-0 flex items-center pl-3 pointer-events-none">
                <IndianRupee className="h-4 w-4 text-slate-400" />
              </div>
              <input
                type="number"
                min="0"
                step="0.01"
                value={offeredPrice}
                onChange={e => { setOfferedPrice(e.target.value); setErrors(prev => { const n = { ...prev }; delete n.offeredPrice; return n; }); }}
                placeholder="e.g. 150000"
                className={cn(
                  "w-full rounded-xl border py-2.5 pl-9 pr-4 text-sm font-bold text-slate-800 placeholder:text-slate-300 focus:outline-none focus:ring-2 transition",
                  errors.offeredPrice ? "border-red-300 focus:ring-red-200 bg-red-50/30" : "border-slate-200 focus:ring-[#12335f]/20 focus:border-[#12335f]"
                )}
              />
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
                placeholder={`e.g. ${maxQuantity || 100}`}
                className={cn(
                  "w-full rounded-xl border py-2.5 pl-9 pr-4 text-sm font-bold text-slate-800 placeholder:text-slate-300 focus:outline-none focus:ring-2 transition",
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
                placeholder="e.g. 15 days, 30 days, 4 weeks"
                className={cn(
                  "w-full rounded-xl border py-2.5 pl-9 pr-4 text-sm font-bold text-slate-800 placeholder:text-slate-300 focus:outline-none focus:ring-2 transition",
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
              placeholder="Any additional terms, warranty, payment terms, etc."
              rows={4}
              className="w-full rounded-xl border border-slate-200 p-3 text-sm font-semibold text-slate-700 placeholder:text-slate-300 focus:outline-none focus:ring-2 focus:ring-[#12335f]/20 focus:border-[#12335f] transition resize-y"
            />
          </div>
        </section>

        {/* Right Column — Message & Documents */}
        <section className="border border-slate-100 rounded-3xl bg-white p-6 shadow-sm space-y-6">
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
              rows={6}
              className={cn(
                "w-full rounded-xl border p-3 text-sm font-semibold text-slate-700 placeholder:text-slate-300 focus:outline-none focus:ring-2 transition resize-y",
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

      {/* Items Table — Read Only */}
      {itemsList.length > 0 && (
        <section className="border border-slate-100 rounded-3xl bg-white p-6 shadow-sm overflow-hidden">
          <h2 className="text-base font-black text-slate-900 pb-3 border-b border-slate-100">
            Requirement Items Reference
          </h2>
          <div className="mt-4 overflow-x-auto border border-slate-200 rounded-xl bg-white shadow-sm">
            <table className="min-w-[600px] w-full text-left border-collapse">
              <thead className="bg-slate-50 border-b border-slate-200">
                <tr>
                  <th className="px-4 py-2.5 text-[10px] font-black uppercase text-slate-500">Item</th>
                  <th className="px-4 py-2.5 text-[10px] font-black uppercase text-slate-500 text-right">Qty / Unit</th>
                  <th className="px-4 py-2.5 text-[10px] font-black uppercase text-slate-500">Description</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {itemsList.map((item: any, idx: number) => (
                  <tr key={idx} className="hover:bg-slate-50/30 transition-colors">
                    <td className="px-4 py-3 text-xs font-bold text-slate-900">{item.itemName}</td>
                    <td className="px-4 py-3 text-xs font-bold text-slate-800 text-right tabular-nums">
                      {item.quantity} <span className="text-[10px] font-semibold text-slate-500 uppercase">{item.unitOfMeasure || 'Nos'}</span>
                    </td>
                    <td className="px-4 py-3 text-xs text-slate-600">{item.description || '—'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
      )}

      {/* Declaration & Submit */}
      <section className="border border-slate-100 rounded-3xl bg-white p-6 shadow-sm space-y-4">
        <div className="flex items-start gap-3">
          <input
            type="checkbox"
            id="declaration"
            checked={declared}
            onChange={e => { setDeclared(e.target.checked); setErrors(prev => { const n = { ...prev }; delete n.declared; return n; }); }}
            className="mt-0.5 h-4 w-4 rounded border-slate-300 text-[#12335f] focus:ring-[#12335f]/20 focus:ring-2"
          />
          <label htmlFor="declaration" className="text-xs font-semibold text-slate-600 leading-relaxed">
            I declare that the information provided in this quotation is accurate and complete. I understand that any false
            or misleading information may result in disqualification.
          </label>
        </div>
        {fieldError('declared')}

        <div className="flex flex-col sm:flex-row items-center gap-3 pt-2 border-t border-slate-100 w-full">
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
                <ShieldCheck className="h-4 w-4" /> Submit Quotation
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
          <Button
            type="button"
            variant="outline"
            onClick={handleBackToRfq}
            disabled={submitting}
            className="rounded-xl border-slate-200 h-12 text-xs font-black uppercase text-slate-500 w-full sm:w-auto"
          >
            Cancel
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
