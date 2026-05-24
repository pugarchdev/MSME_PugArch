import React, { useState, useEffect } from 'react';
import { usePathname, useRouter } from 'next/navigation';
import { api, unwrapApiData } from '../lib/api';
import { Card, CardHeader, CardTitle, CardContent } from '../components/ui/card';
import { Button } from '../components/ui/button';
import { compressImage } from '../lib/compress';
import { 
  ChevronLeft, 
  Send, 
  IndianRupee, 
  Package, 
  Truck, 
  ShieldCheck, 
  CheckCircle2,
  Calendar,
  Building2,
  FileText,
  AlertCircle,
  Upload,
  Paperclip,
  Eye,
  X
} from 'lucide-react';
import { toast } from 'sonner';
import { DocumentPreviewModal } from '../components/DocumentPreviewModal';
import { getFileAssetPreview, type DocumentPreview } from '../lib/files';

interface Tender {
  id: number;
  tenderId: string;
  title: string;
  category: string;
  budget: number;
  description: string;
  documentUrl?: string;
  buyer?: {
    name: string;
    buyerProfile?: {
      organizationName: string;
    }
  }
}

const getUploadedFileName = (file: { documentUrl?: string; originalName?: string; url?: string }) => {
  if (file.originalName) return file.originalName;
  const url = file.documentUrl || file.url || '';
  const cleanUrl = url.split('?')[0];
  const name = cleanUrl.substring(cleanUrl.lastIndexOf('/') + 1);
  try {
    return decodeURIComponent(name || 'Document attached');
  } catch {
    return name || 'Document attached';
  }
};

export default function CreateQuotation() {
  const pathname = usePathname() || '';
  const match = pathname.match(/\/seller\/tenders\/([^/]+)\/bid/);
  const id = match ? match[1] : '';
  const router = useRouter();
  const [tender, setTender] = useState<Tender | null>(null);
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [isUploading, setIsUploading] = useState(false);
  const [isSuccess, setIsSuccess] = useState(false);
  const [previewDocument, setPreviewDocument] = useState<DocumentPreview | null>(null);

  const [formData, setFormData] = useState({
    unitPrice: '',
    quantity: '',
    deliveryDays: '',
    warranty: '',
    validTill: '',
    note: '',
    documentUrl: '',
    fileAssetId: null as number | null,
    documentName: ''
  });

  useEffect(() => {
    fetchTenderDetails();
  }, [id]);

  useEffect(() => {
    return () => {
      if (previewDocument?.url?.startsWith('blob:')) URL.revokeObjectURL(previewDocument.url);
    };
  }, [previewDocument?.url]);

  const handlePreviewTenderDocument = async () => {
    if (!tender?.documentUrl) return;
    try {
      setPreviewDocument(await getFileAssetPreview({ url: tender.documentUrl }, `${tender.tenderId} Specifications`));
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Unable to open document');
    }
  };

  const fetchTenderDetails = async () => {
    try {
      // We'll fetch from public tenders list for simplicity, or add a specific endpoint
      const res = await api.get('/api/tenders/public', {
        headers: { Authorization: `Bearer ${localStorage.getItem('token')}` }
      });
      if (res.ok) {
        const data = await res.json();
        const found = data.find((t: any) => t.id === Number(id));
        if (found) setTender(found);
        else {
          toast.error('Tender not found');
          router.push('/seller/tenders');
        }
      }
    } catch (err) {
      toast.error('Failed to load tender details');
    } finally {
      setLoading(false);
    }
  };

  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    setIsUploading(true);
    const optimizedFile = await compressImage(file);
    const formDataUpload = new FormData();
    formDataUpload.append('file', optimizedFile);

    try {
      const res = await api.fetch('/api/upload', {
        method: 'POST',
        headers: { Authorization: `Bearer ${localStorage.getItem('token')}` },
        body: formDataUpload
      });

      if (res.ok) {
        const data = unwrapApiData<any>(await res.json());
        const fileAssetId = Number(data.fileId || data.file?.id || data.fileAssetId || 0) || null;
        const documentUrl = data.url || data.documentUrl || data.file?.documentUrl || data.file?.url || (fileAssetId ? `/api/files/${fileAssetId}/view` : '');
        setFormData(prev => ({
          ...prev,
          documentUrl,
          fileAssetId,
          documentName: data.file?.originalName || data.originalName || file.name
        }));
        toast.success('Document uploaded successfully');
      } else {
        toast.error('Failed to upload document');
      }
    } catch (err) {
      toast.error('Network error during upload');
    } finally {
      setIsUploading(false);
    }
  };

  const handleRemoveFile = () => {
    setFormData(prev => ({ ...prev, documentUrl: '', fileAssetId: null, documentName: '' }));
    toast.info('Document removed');
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!formData.unitPrice || !formData.quantity || !formData.deliveryDays) {
      return toast.error('Please fill in all required fields');
    }

    setSubmitting(true);
    try {
      const res = await api.post(`/api/tenders/${id}/bids`, {
        unitPrice: Number(formData.unitPrice),
        quantity: Number(formData.quantity),
        deliveryDays: Number(formData.deliveryDays),
        warranty: formData.warranty,
        validTill: formData.validTill ? new Date(formData.validTill).toISOString() : null,
        note: formData.note,
        documentUrl: formData.documentUrl || null,
        fileAssetId: formData.fileAssetId || null
      }, {
        headers: { Authorization: `Bearer ${localStorage.getItem('token')}` }
      });

      if (res.ok) {
        toast.success('Quotation submitted successfully!');
        setIsSuccess(true);
      } else {
        const data = await res.json();
        toast.error(data.message || 'Submission failed');
      }
    } catch (err) {
      toast.error('Network error during submission');
    } finally {
      setSubmitting(false);
    }
  };

  if (loading) return <div className="p-8 text-center">Loading tender details...</div>;
  if (!tender) return null;

  if (isSuccess) {
    const totalValue = Number(formData.unitPrice) * Number(formData.quantity);
    return (
      <div className="min-h-screen bg-slate-50 flex items-center justify-center p-4 md:p-6 text-slate-900">
        <div className="w-full max-w-xl bg-white rounded-2xl border border-slate-200 shadow-2xl p-8 text-center space-y-6 animate-in zoom-in-95 duration-300">
          <div className="mx-auto w-16 h-16 bg-emerald-50 rounded-full flex items-center justify-center border border-emerald-100 text-emerald-500 animate-bounce">
            <CheckCircle2 className="h-8 w-8" />
          </div>
          
          <div className="space-y-2">
            <h2 className="text-2xl font-extrabold text-slate-900 uppercase tracking-tight">Quotation Submitted</h2>
            <p className="text-sm text-slate-500 font-medium">Your proposal has been securely sent to the buyer.</p>
          </div>

          <div className="bg-slate-50 rounded-xl border border-slate-200 p-5 text-left space-y-4">
            <div className="grid grid-cols-2 gap-4">
              <div>
                <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest font-sans">Tender Title</p>
                <p className="text-sm font-bold text-slate-900 line-clamp-1">{tender.title}</p>
              </div>
              <div>
                <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest font-sans">Tender ID</p>
                <p className="text-xs font-mono font-bold text-slate-500">{tender.tenderId}</p>
              </div>
            </div>
            
            <div className="h-px bg-slate-200" />
            
            <div className="grid grid-cols-3 gap-4">
              <div>
                <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest font-sans">Unit Price</p>
                <p className="text-base font-extrabold text-slate-900">₹{Number(formData.unitPrice).toLocaleString()}</p>
              </div>
              <div>
                <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest font-sans">Quantity</p>
                <p className="text-base font-extrabold text-slate-900">{formData.quantity}</p>
              </div>
              <div>
                <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest font-sans">Delivery Time</p>
                <p className="text-base font-extrabold text-slate-900">{formData.deliveryDays} Days</p>
              </div>
            </div>

            <div className="h-px bg-slate-200" />

            <div className="flex items-center justify-between">
              <p className="text-xs font-bold text-slate-500 uppercase tracking-wider font-sans">Total Proposed Value</p>
              <p className="text-xl font-black text-[#12335f]">₹{totalValue.toLocaleString()}</p>
            </div>
          </div>

          <div className="flex items-center justify-center gap-4 pt-2">
            <Button 
              onClick={() => router.push('/seller/tenders')}
              className="bg-white border border-[#dadce0] text-slate-700 hover:bg-slate-50 h-10 px-5 rounded-md font-bold uppercase text-[10px] tracking-widest"
            >
              Browse Tenders
            </Button>
            <Button 
              onClick={() => router.push('/quotations')}
              className="bg-[#12335f] hover:bg-[#0b2445] text-white h-10 px-5 rounded-md font-bold uppercase text-[10px] tracking-widest"
            >
              View My Quotations
            </Button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-slate-50 p-4 md:p-6">
      <div className="max-w-5xl mx-auto">
        <button 
          onClick={() => router.push('/seller/tenders')}
          className="flex items-center gap-2 text-slate-500 hover:text-slate-900 font-bold text-xs uppercase tracking-widest mb-4 transition-colors"
        >
          <ChevronLeft className="h-4 w-4" />
          Back to Tenders
        </button>

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-5">
          {/* Left Column: Tender Summary */}
          <div className="lg:col-span-1 space-y-4">
            <Card className="border border-slate-200 shadow-sm overflow-hidden rounded-xl bg-white">
              <div className="bg-[#12335f] p-5 text-white">
                <p className="text-[10px] font-black uppercase tracking-widest opacity-70 mb-1">Target Tender</p>
                <h2 className="text-lg font-bold leading-tight">{tender.title}</h2>
              </div>
              <CardContent className="p-5 space-y-4">
                <div>
                  <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest mb-1">Tender ID</p>
                  <p className="text-sm font-mono font-bold text-[#12335f]">{tender.tenderId}</p>
                </div>
                <div>
                  <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest mb-1">Budget Allocation</p>
                  <p className="text-lg font-bold text-slate-900">₹{tender.budget.toLocaleString()}</p>
                </div>
                <div>
                  <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest mb-1">Buyer Organization</p>
                  <div className="flex items-center gap-2">
                    <Building2 className="h-4 w-4 text-slate-400" />
                    <p className="text-xs font-bold text-slate-700">
                      {tender.buyer?.buyerProfile?.organizationName || tender.buyer?.name || 'Unknown Buyer'}
                    </p>
                  </div>
                </div>
                <div className="pt-3 border-t border-slate-100">
                  <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest mb-1">Requirements</p>
                  <p className="text-xs text-slate-500 font-medium leading-relaxed">
                    {tender.description}
                  </p>
                </div>

                {tender.documentUrl && (
                  <div className="pt-3 border-t border-slate-100 space-y-1.5">
                    <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">Buyer Specifications</p>
                    <button
                      type="button"
                      onClick={handlePreviewTenderDocument}
                      className="flex items-center gap-2 p-2 bg-emerald-50 hover:bg-emerald-100 border border-emerald-100 text-emerald-700 rounded-lg text-xs font-bold transition-all cursor-pointer shadow-sm"
                      title="View specifications document"
                    >
                      <FileText className="h-4 w-4 shrink-0 text-emerald-600" />
                      <span className="truncate flex-1">View Specifications</span>
                      <Eye className="h-3.5 w-3.5 shrink-0 text-emerald-600" />
                    </button>
                  </div>
                )}
              </CardContent>
            </Card>

            <div className="bg-amber-50 border border-amber-100 rounded-xl p-4 flex gap-3">
              <AlertCircle className="h-5 w-5 text-amber-600 shrink-0" />
              <div>
                <p className="text-xs font-bold text-amber-900 mb-0.5">Participation Note</p>
                <p className="text-[10px] text-amber-700 leading-relaxed font-medium">
                  Your bid will be visible only to the buyer. Ensure your pricing is competitive and includes all applicable taxes.
                </p>
              </div>
            </div>
          </div>

          {/* Right Column: Bid Form */}
          <div className="lg:col-span-2">
            <Card className="border border-slate-200 shadow-sm rounded-xl overflow-hidden bg-white">
              <CardHeader className="p-5 pb-0">
                <CardTitle className="text-xl font-bold text-slate-900 uppercase tracking-tight">
                  Create Quotation
                </CardTitle>
              </CardHeader>
              <CardContent className="p-5">
                <form onSubmit={handleSubmit} className="space-y-5">
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <div className="space-y-1">
                      <label className="text-[10px] font-bold text-slate-500 uppercase tracking-widest">Unit Price (₹) *</label>
                      <div className="relative">
                        <IndianRupee className="absolute left-3 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-slate-400" />
                        <input 
                          type="number"
                          placeholder="0.00"
                          value={formData.unitPrice}
                          onChange={(e) => setFormData({...formData, unitPrice: e.target.value})}
                          className="w-full h-10 bg-slate-50 border border-slate-200 rounded-md pl-9 pr-3 text-sm font-medium focus:outline-none focus:ring-2 focus:ring-[#12335f]/20 focus:border-[#12335f] transition-all"
                          required
                        />
                      </div>
                    </div>

                    <div className="space-y-1">
                      <label className="text-[10px] font-bold text-slate-500 uppercase tracking-widest">Quantity *</label>
                      <div className="relative">
                        <Package className="absolute left-3 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-slate-400" />
                        <input 
                          type="number"
                          placeholder="e.g. 500"
                          value={formData.quantity}
                          onChange={(e) => setFormData({...formData, quantity: e.target.value})}
                          className="w-full h-10 bg-slate-50 border border-slate-200 rounded-md pl-9 pr-3 text-sm font-medium focus:outline-none focus:ring-2 focus:ring-[#12335f]/20 focus:border-[#12335f] transition-all"
                          required
                        />
                      </div>
                    </div>

                    <div className="space-y-1">
                      <label className="text-[10px] font-bold text-slate-500 uppercase tracking-widest">Delivery Time (Days) *</label>
                      <div className="relative">
                        <Truck className="absolute left-3 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-slate-400" />
                        <input 
                          type="number"
                          placeholder="e.g. 15"
                          value={formData.deliveryDays}
                          onChange={(e) => setFormData({...formData, deliveryDays: e.target.value})}
                          className="w-full h-10 bg-slate-50 border border-slate-200 rounded-md pl-9 pr-3 text-sm font-medium focus:outline-none focus:ring-2 focus:ring-[#12335f]/20 focus:border-[#12335f] transition-all"
                          required
                        />
                      </div>
                    </div>

                    <div className="space-y-1">
                      <label className="text-[10px] font-bold text-slate-500 uppercase tracking-widest">Warranty (Optional)</label>
                      <div className="relative">
                        <ShieldCheck className="absolute left-3 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-slate-400" />
                        <input 
                          type="text"
                          placeholder="e.g. 1 Year onsite"
                          value={formData.warranty}
                          onChange={(e) => setFormData({...formData, warranty: e.target.value})}
                          className="w-full h-10 bg-slate-50 border border-slate-200 rounded-md pl-9 pr-3 text-sm font-medium focus:outline-none focus:ring-2 focus:ring-[#12335f]/20 focus:border-[#12335f] transition-all"
                        />
                      </div>
                    </div>

                    <div className="space-y-1">
                      <label className="text-[10px] font-bold text-slate-500 uppercase tracking-widest">Validity Date (Optional)</label>
                      <div className="relative">
                        <Calendar className="absolute left-3 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-slate-400" />
                        <input 
                          type="date"
                          value={formData.validTill}
                          onChange={(e) => setFormData({...formData, validTill: e.target.value})}
                          className="w-full h-10 bg-slate-50 border border-slate-200 rounded-md pl-9 pr-3 text-sm font-medium focus:outline-none focus:ring-2 focus:ring-[#12335f]/20 focus:border-[#12335f] transition-all"
                        />
                      </div>
                    </div>

                    <div className="space-y-1">
                      <label className="text-[10px] font-bold text-slate-500 uppercase tracking-widest">Document Attachment (Optional)</label>
                      <div className="relative flex items-center justify-between border border-slate-200 rounded-md h-10 bg-slate-50 px-3 hover:border-[#12335f]/40 transition-colors">
                        <div className="flex items-center gap-2 overflow-hidden mr-2">
                          <Paperclip className="h-3.5 w-3.5 text-slate-400 shrink-0" />
                          {formData.documentUrl ? (
                            <span className="text-xs font-bold text-slate-700 truncate">
                              {getUploadedFileName({
                                documentUrl: formData.documentUrl,
                                originalName: formData.documentName
                              })}
                            </span>
                          ) : (
                            <span className="text-xs font-medium text-slate-400 truncate">
                              {isUploading ? 'Uploading document...' : 'Upload PDF / Specs Sheet'}
                            </span>
                          )}
                        </div>
                        {formData.documentUrl ? (
                          <button
                            type="button"
                            onClick={handleRemoveFile}
                            className="p-1 hover:bg-red-50 text-red-500 rounded-full shrink-0 transition-colors"
                            title="Remove attached document"
                          >
                            <X className="h-3.5 w-3.5" />
                          </button>
                        ) : (
                          <>
                            <input
                              type="file"
                              accept=".pdf,.doc,.docx,.csv,.jpg,.jpeg,.png"
                              onChange={handleFileUpload}
                              id="quote-doc-upload"
                              className="hidden"
                              disabled={isUploading}
                            />
                            <label
                              htmlFor="quote-doc-upload"
                              className="cursor-pointer px-2.5 py-1 bg-[#12335f]/10 hover:bg-[#12335f]/20 text-[#12335f] text-[10px] font-bold uppercase tracking-wider rounded transition-colors shrink-0 flex items-center gap-1"
                            >
                              <Upload className="h-3 w-3" />
                              {isUploading ? 'Uploading...' : 'Browse'}
                            </label>
                          </>
                        )}
                      </div>
                    </div>
                  </div>

                  <div className="space-y-1">
                    <label className="text-[10px] font-bold text-slate-500 uppercase tracking-widest">Additional Notes</label>
                    <div className="relative">
                      <FileText className="absolute left-3 top-3 h-3.5 w-3.5 text-slate-400" />
                      <textarea 
                        rows={3}
                        placeholder="Mention any special conditions, terms, or specifications..."
                        value={formData.note}
                        onChange={(e) => setFormData({...formData, note: e.target.value})}
                        className="w-full bg-slate-50 border border-slate-200 rounded-md pl-9 pr-3 py-2 text-sm font-medium focus:outline-none focus:ring-2 focus:ring-[#12335f]/20 focus:border-[#12335f] transition-all resize-none"
                      />
                    </div>
                  </div>

                  <div className="pt-2 flex items-center justify-end gap-3">
                    <Button 
                      type="button" 
                      variant="ghost"
                      onClick={() => router.push('/seller/tenders')}
                      className="h-9 px-4 rounded-md font-bold uppercase text-[10px] tracking-widest text-slate-500 hover:text-slate-900 hover:bg-slate-100"
                    >
                      Cancel
                    </Button>
                    <Button 
                      type="submit"
                      disabled={submitting}
                      className="h-9 px-6 bg-[#12335f] hover:bg-[#0b2445] text-white rounded-md font-bold uppercase text-[10px] tracking-widest flex items-center justify-center gap-2 transition-all active:scale-98 shadow-sm"
                    >
                      {submitting ? 'Submitting...' : 'Submit Quotation'}
                      <Send className="h-3.5 w-3.5" />
                    </Button>
                  </div>
                </form>
              </CardContent>
            </Card>
          </div>
        </div>
      </div>
      <DocumentPreviewModal previewDocument={previewDocument} onClose={() => setPreviewDocument(null)} />
    </div>
  );
}
