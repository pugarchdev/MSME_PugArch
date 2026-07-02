import { FormEvent, useEffect, useState } from 'react';
import { usePathname, useRouter } from 'next/navigation';
import { Eye, FileText, ImageIcon, Plus, Trash2, Upload, FileUp, Loader2, ArrowLeft, Sparkles, Package, Wrench, ShieldCheck, BadgeCheck, Tag } from 'lucide-react';
import { toast } from 'sonner';
import { Button } from '../../../components/ui/button';
import { Badge, Card, CardContent, CardHeader, CardTitle } from '../../../components/ui/card';
import { Input, Select } from '../../../components/ui/input';
import { useAuth } from '../../../hooks/useAuth';
import { cn } from '../../../lib/utils';
import { InlineError, LoadingState } from '../../shared/FeatureStates';
import type { CategoryDto } from '../../shared/types';
import { catalogueApi } from '../api';
import { getFileAssetPreview, type DocumentPreview } from '../../../lib/files';
import { DocumentPreviewModal } from '../../../components/DocumentPreviewModal';
import { QUANTITY_UNITS, ITEM_CONDITIONS } from '../../../constants/dropdowns';
import { api, BASE_URL } from '../../../lib/api';
import { GstTaxPicker, calculateGstBreakdown } from '../../shared/gstTax';

type ItemKind = 'product' | 'service';

const blankForm = {
  name: '',
  description: '',
  price: '',
  splitTaxRate: '',
  igstTaxRate: '0.00',
  otherTaxRate: '',
  discount: '0.00',
  originalPrice: '',
  discountPrice: '',
  discountPercent: '',
  offerLabel: '',
  offerStartAt: '',
  offerEndAt: '',
  isOfferActive: false,
  bulkDealAvailable: false,
  bulkMinQuantity: '',
  hsnCode: '',
  unitOfMeasure: '',
  itemCondition: '',
  basePrice: '',
  pricingModel: 'FIXED',
  serviceArea: '',
  status: 'DRAFT',
  categoryId: '',
  sku: '',
  brand: '',
  modelNumber: '',
  isMsmeMade: false,
  scopeOfWork: '',
  deliverables: '',
  inclusions: '',
  exclusions: '',
  duration: '',
  slaResponseTime: ''
};

type SpecRow = { name: string; value: string; unit: string };

const toNumber = (value: unknown) => {
  if (value === null || value === undefined || value === '') return 0;
  if (typeof value === 'object') {
    const maybeDecimal = value as { toString?: () => string; value?: unknown };
    if (maybeDecimal.value !== undefined) return toNumber(maybeDecimal.value);
    if (typeof maybeDecimal.toString === 'function') {
      const parsed = Number(maybeDecimal.toString());
      return Number.isFinite(parsed) ? parsed : 0;
    }
  }
  const parsed = Number(String(value).replace(/[^\d.-]/g, ''));
  return Number.isFinite(parsed) ? parsed : 0;
};

const getCatalogueImageUrl = (fileId: number | string | undefined) => {
  if (!fileId) return '';
  const token = localStorage.getItem('token') || '';
  return `${BASE_URL}/api/files/${fileId}/view?token=${encodeURIComponent(token)}`;
};

const fileIdOf = (value: any, options: { preferNestedFileAsset?: boolean } = {}) => {
  const fileId = options.preferNestedFileAsset
    ? value?.fileAssetId || value?.fileId || value?.fileAsset?.id || value?.fileAsset?.fileAssetId || value?.id
    : value?.fileAssetId || value?.fileId || value?.id || value?.fileAsset?.id || value?.fileAsset?.fileAssetId;
  return fileId === undefined || fileId === null ? undefined : Number(fileId);
};

const normalizeUploadedAsset = (asset: any, fallback?: File) => {
  const source = asset?.file || asset?.data || asset;
  const id = fileIdOf(source) || fileIdOf(asset);
  return {
    ...source,
    id,
    fileId: id,
    fileAssetId: id,
    originalName: source?.originalName || fallback?.name,
    mimeType: source?.mimeType || fallback?.type
  };
};

const mediaToUploadedAsset = (media: any) => ({
  id: media.fileId,
  fileId: media.fileId,
  fileAssetId: media.fileId,
  originalName: media.originalName || media.label,
  mimeType: media.mimeType
});

const uploadedAssetIds = (assets: any[]) =>
  Array.from(new Set(assets.map(asset => fileIdOf(asset)).filter((id): id is number => typeof id === 'number' && Number.isFinite(id) && id > 0)));

const uploadCatalogueAsset = async (file: File) => {
  const fd = new FormData();
  fd.append('file', file);
  const headers = { Authorization: `Bearer ${localStorage.getItem('token') || ''}` };
  const endpoints = ['/api/catalogue/upload', '/api/upload?entityType=catalogue'];
  let lastError = '';

  for (const endpoint of endpoints) {
    const res = await api.fetch(endpoint, {
      method: 'POST',
      headers,
      body: fd
    });
    const data = await res.json().catch(() => ({}));
    if (res.ok) return normalizeUploadedAsset(data, file);
    lastError = data?.message || data?.error || res.statusText || 'Upload failed';
    if (![404, 405].includes(res.status)) break;
  }

  throw new Error(lastError);
};

const looksLikeImage = (value: { mimeType?: string; originalName?: string; label?: string }) => {
  const mimeType = String(value.mimeType || '').toLowerCase();
  const name = String(value.originalName || value.label || '').toLowerCase().split('?')[0];
  return mimeType.startsWith('image/') || /\.(png|jpe?g|gif|webp|svg|bmp|avif)$/i.test(name);
};

const catalogueMedia = (item: any) => {
  const media: any[] = [];

  item.images?.forEach((image: any, index: number) => {
    const fileId = fileIdOf(image, { preferNestedFileAsset: true });
    if (!fileId) return;
    media.push({
      id: fileId,
      fileId,
      label: image.altText || image.fileAsset?.originalName || `Product image ${index + 1}`,
      mimeType: image.fileAsset?.mimeType,
      originalName: image.fileAsset?.originalName,
      kind: 'image'
    });
  });

  item.certifications?.forEach((cert: any, index: number) => {
    const fileId = fileIdOf(cert, { preferNestedFileAsset: true });
    if (!fileId) return;
    const entry = {
      id: fileId,
      fileId,
      label: cert.name || cert.fileAsset?.originalName || `Certification ${index + 1}`,
      mimeType: cert.fileAsset?.mimeType || undefined,
      originalName: cert.fileAsset?.originalName || undefined
    };
    media.push({ ...entry, kind: looksLikeImage(entry) ? 'image' : 'document' });
  });

  item.catalogueFiles?.forEach((file: any, index: number) => {
    const fileId = fileIdOf(file);
    if (!fileId) return;
    const entry = {
      id: fileId,
      fileId,
      label: file.originalName || `Catalogue file ${index + 1}`,
      mimeType: file.mimeType,
      originalName: file.originalName
    };
    media.push({ ...entry, kind: looksLikeImage(entry) ? 'image' : 'document' });
  });

  const seen = new Set<number>();
  return media.filter(item => {
    if (!item.fileId || seen.has(item.fileId)) return false;
    seen.add(item.fileId);
    return true;
  });
};

export default function CatalogueFormPage() {
  const { user } = useAuth();
  const router = useRouter();
  const pathname = usePathname() || '';

  // Parse path to determine kind and action
  const productMatch = pathname.match(/\/products\/(new|[^/]+)/);
  const serviceMatch = pathname.match(/\/services\/(new|[^/]+)/);

  const kind: ItemKind = productMatch ? 'product' : 'service';
  const isEdit = pathname.includes('/edit');
  const idStr = productMatch ? productMatch[1] : (serviceMatch ? serviceMatch[1] : null);
  const id = (isEdit && idStr && idStr !== 'new') ? Number(idStr) : null;

  const [categoryList, setCategoryList] = useState<CategoryDto[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [form, setForm] = useState(blankForm);
  const [uploadedImages, setUploadedImages] = useState<any[]>([]);
  const [uploadedDocuments, setUploadedDocuments] = useState<any[]>([]);
  const [uploading, setUploading] = useState(false);
  const [previewDocument, setPreviewDocument] = useState<DocumentPreview | null>(null);
  const [specifications, setSpecifications] = useState<SpecRow[]>([]);
  const [activeTab, setActiveTab] = useState<'basic' | 'attributes' | 'pricing' | 'specs'>('basic');

  useEffect(() => {
    const initPage = async () => {
      setLoading(true);
      setError(null);
      try {
        const categories = await catalogueApi.categories();
        setCategoryList(categories || []);

        if (isEdit && id) {
          const item = kind === 'product'
            ? await catalogueApi.getProduct(id)
            : await catalogueApi.getService(id);

          if (item) {
            setForm({
              name: item.name || '',
              description: item.description || '',
              price: item.price === null || item.price === undefined ? '' : String(item.price),
              splitTaxRate: '',
              igstTaxRate: item.taxRate === null || item.taxRate === undefined ? '0.00' : String(item.taxRate),
              otherTaxRate: '',
              discount: item.discount === null || item.discount === undefined ? '0.00' : String(item.discount),
              originalPrice: item.originalPrice === null || item.originalPrice === undefined ? '' : String(item.originalPrice),
              discountPrice: item.discountPrice === null || item.discountPrice === undefined ? '' : String(item.discountPrice),
              discountPercent: item.discountPercent === null || item.discountPercent === undefined ? '' : String(item.discountPercent),
              offerLabel: item.offerLabel || '',
              offerStartAt: item.offerStartAt ? String(item.offerStartAt).slice(0, 10) : '',
              offerEndAt: item.offerEndAt ? String(item.offerEndAt).slice(0, 10) : '',
              isOfferActive: Boolean(item.isOfferActive),
              bulkDealAvailable: Boolean(item.bulkDealAvailable),
              bulkMinQuantity: item.bulkMinQuantity === null || item.bulkMinQuantity === undefined ? '' : String(item.bulkMinQuantity),
              hsnCode: item.hsnCode || '',
              unitOfMeasure: item.unitOfMeasure || '',
              itemCondition: item.itemCondition || '',
              basePrice: item.basePrice === null || item.basePrice === undefined ? '' : String(item.basePrice),
              pricingModel: item.pricingModel || 'FIXED',
              serviceArea: item.serviceArea || '',
              status: item.status || 'DRAFT',
              categoryId: String(item.categoryId || ''),
              sku: item.sku || '',
              brand: item.brand || '',
              modelNumber: item.modelNumber || '',
              isMsmeMade: Boolean((item as any).isMsmeMade),
              scopeOfWork: (item as any).scopeOfWork || '',
              deliverables: (item as any).deliverables || '',
              inclusions: (item as any).inclusions || '',
              exclusions: (item as any).exclusions || '',
              duration: (item as any).duration || '',
              slaResponseTime: (item as any).slaResponseTime || ''
            });
            setSpecifications(((item as any).specifications || []).map((s: any) => ({
              name: s.name || '',
              value: s.value || '',
              unit: s.unit || ''
            })));
            const media = catalogueMedia(item);
            setUploadedImages(media.filter(file => file.kind === 'image').map(mediaToUploadedAsset));
            setUploadedDocuments(media.filter(file => file.kind === 'document').map(mediaToUploadedAsset));
          } else {
            setError(`${kind === 'product' ? 'Product' : 'Service'} not found.`);
          }
        }
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Unable to initialize form.');
      } finally {
        setLoading(false);
      }
    };

    void initPage();
  }, [id, isEdit, kind]);

  const handleFileUpload = async (event: React.ChangeEvent<HTMLInputElement>, type: 'image' | 'document') => {
    const files = event.target.files;
    if (!files || files.length === 0) return;

    setUploading(true);
    try {
      for (let i = 0; i < files.length; i++) {
        const file = files[i];
        if (file.size > 10 * 1024 * 1024) {
          toast.error(`File ${file.name} is too large. Max size is 10MB.`);
          continue;
        }

        const rawAsset = await uploadCatalogueAsset(file);
        if (!rawAsset.id) {
          toast.error(`Upload succeeded but ${file.name} was not saved with a file id.`);
          continue;
        }
        const localUrl = URL.createObjectURL(file);
        const asset = { ...rawAsset, localUrl };
        if (type === 'image') {
          setUploadedImages(prev => [...prev, asset]);
        } else {
          setUploadedDocuments(prev => [...prev, asset]);
        }
        toast.success(`${file.name} uploaded successfully.`);
      }
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Failed to upload file.');
    } finally {
      setUploading(false);
      event.target.value = '';
    }
  };

  const removeUploadedFile = (fileId: number, type: 'image' | 'document') => {
    if (type === 'image') {
      const removed = uploadedImages.find(img => img.id === fileId);
      if (removed?.localUrl) URL.revokeObjectURL(removed.localUrl);
      setUploadedImages(prev => prev.filter(img => img.id !== fileId));
    } else {
      const removed = uploadedDocuments.find(doc => doc.id === fileId);
      if (removed?.localUrl) URL.revokeObjectURL(removed.localUrl);
      setUploadedDocuments(prev => prev.filter(doc => doc.id !== fileId));
    }
  };

  const updateForm = (field: keyof typeof blankForm, value: string | boolean) =>
    setForm(current => ({ ...current, [field]: value }));

  const submitForm = async (event: FormEvent) => {
    event.preventDefault();
    if (!form.name.trim()) {
      toast.error('Enter an item name.');
      return;
    }
    setSaving(true);
    try {
      const payload = {
        name: form.name.trim(),
        description: form.description.trim() || null,
        categoryId: form.categoryId ? Number(form.categoryId) : null,
        status: form.status,
        currency: 'INR',
        imageIds: uploadedAssetIds(uploadedImages),
        documentIds: uploadedAssetIds(uploadedDocuments),
        originalPrice: form.originalPrice ? Number(form.originalPrice) : null,
        discountPrice: form.discountPrice ? Number(form.discountPrice) : null,
        discountPercent: form.discountPercent ? Number(form.discountPercent) : null,
        offerLabel: form.offerLabel.trim() || null,
        offerStartAt: form.offerStartAt || null,
        offerEndAt: form.offerEndAt || null,
        isOfferActive: Boolean(form.isOfferActive),
        bulkDealAvailable: Boolean(form.bulkDealAvailable),
        bulkMinQuantity: form.bulkMinQuantity ? Number(form.bulkMinQuantity) : null,
        specifications: specifications.filter(s => s.name.trim() && s.value.trim()).map(s => ({
          name: s.name.trim(),
          value: s.value.trim(),
          unit: s.unit.trim() || null
        })),
        ...(kind === 'product'
          ? {
            price: form.price ? Number(form.price) : null,
            taxRate: (form.splitTaxRate ? Number(form.splitTaxRate) : 0) + (form.igstTaxRate ? Number(form.igstTaxRate) : 0) + (form.otherTaxRate ? Number(form.otherTaxRate) : 0),
            discount: form.discount ? Number(form.discount) : 0,
            hsnCode: form.hsnCode.trim() || null,
            unitOfMeasure: form.unitOfMeasure.trim() || null,
            itemCondition: form.itemCondition.trim() || null,
            sku: form.sku.trim() || null,
            brand: form.brand.trim() || null,
            modelNumber: form.modelNumber.trim() || null,
            isMsmeMade: Boolean(form.isMsmeMade)
          }
          : {
            basePrice: form.basePrice ? Number(form.basePrice) : null,
            taxRate: (form.splitTaxRate ? Number(form.splitTaxRate) : 0) + (form.igstTaxRate ? Number(form.igstTaxRate) : 0) + (form.otherTaxRate ? Number(form.otherTaxRate) : 0),
            discount: form.discount ? Number(form.discount) : 0,
            pricingModel: form.pricingModel,
            serviceArea: form.serviceArea.trim() || null,
            scopeOfWork: form.scopeOfWork.trim() || null,
            deliverables: form.deliverables.trim() || null,
            inclusions: form.inclusions.trim() || null,
            exclusions: form.exclusions.trim() || null,
            duration: form.duration.trim() || null,
            slaResponseTime: form.slaResponseTime.trim() || null
          })
      };

      if (isEdit && id) {
        if (kind === 'product') {
          await catalogueApi.updateProduct(id, payload);
          toast.success('Product updated successfully.');
        } else {
          await catalogueApi.updateService(id, payload);
          toast.success('Service updated successfully.');
        }
      } else {
        if (kind === 'product') {
          await catalogueApi.createProduct(payload);
          toast.success('Product added to your marketplace.');
        } else {
          await catalogueApi.createService(payload);
          toast.success('Service added to your marketplace.');
        }
      }
      uploadedImages.forEach(img => { if (img.localUrl) URL.revokeObjectURL(img.localUrl); });
      uploadedDocuments.forEach(doc => { if (doc.localUrl) URL.revokeObjectURL(doc.localUrl); });
      router.push('/seller/catalogue');
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Unable to save marketplace item');
    } finally {
      setSaving(false);
    }
  };

  const handleCancel = () => {
    uploadedImages.forEach(img => { if (img.localUrl) URL.revokeObjectURL(img.localUrl); });
    uploadedDocuments.forEach(doc => { if (doc.localUrl) URL.revokeObjectURL(doc.localUrl); });
    router.push('/seller/catalogue');
  };

  if (loading) return <LoadingState label="Loading form details..." />;
  if (error) return <InlineError message={error} onRetry={() => router.push('/seller/catalogue')} />;

  const title = isEdit ? `Edit ${kind === 'product' ? 'Product' : 'Service'}` : `New ${kind === 'product' ? 'Product' : 'Service'}`;
  const descriptionText = isEdit
    ? `Review and update details for your marketplace ${kind === 'product' ? 'product' : 'service'}.`
    : `List a new ${kind === 'product' ? 'product' : 'service'} on the synergy marketplace.`;
  const rawPrice = kind === 'product' ? toNumber(form.price) : toNumber(form.basePrice);
  const discountAmount = rawPrice * (toNumber(form.discount) / 100);
  const taxableAmount = Math.max(0, rawPrice - discountAmount);
  const taxBreakdown = calculateGstBreakdown(taxableAmount, form.splitTaxRate, form.igstTaxRate, form.otherTaxRate);

  return (
    <div className="space-y-6 min-w-0">
      {/* Premium Gradient Banner Header */}
      <div className="overflow-hidden rounded-3xl border border-slate-200 bg-gradient-to-br from-[#0c1a30] via-[#122b4f] to-[#1d447d] p-6 text-white shadow-lg relative">
        <div className="absolute right-0 top-0 h-40 w-40 bg-emerald-500/10 rounded-full blur-3xl" />
        <button
          type="button"
          onClick={handleCancel}
          className="group flex items-center gap-1.5 text-[10px] font-black uppercase tracking-[0.2em] text-white/80 transition-colors hover:text-white"
        >
          <ArrowLeft className="h-3 w-3 transition-transform group-hover:-translate-x-0.5" />
          Back to Catalogue
        </button>
        <div className="mt-4 flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between relative z-10">
          <div className="max-w-2xl">
            <div className="inline-flex items-center gap-2 rounded-full border border-white/20 bg-white/10 px-3 py-1 text-[10px] font-black uppercase tracking-[0.22em] text-emerald-300">
              <Sparkles className="h-3.5 w-3.5" /> {kind === 'product' ? 'product onboarding' : 'service onboarding'}
            </div>
            <h1 className="mt-3 text-3xl font-extrabold tracking-tight sm:text-4xl">{title}</h1>
            <p className="mt-2 text-xs font-semibold text-white/70">{descriptionText}</p>
          </div>
          <div className="grid gap-2 rounded-2xl border border-white/15 bg-white/10 p-3 text-xs backdrop-blur-md sm:grid-cols-3">
            <div className="rounded-xl border border-white/10 bg-white/10 px-3 py-2">
              <div className="flex items-center gap-2 text-[9px] font-black uppercase tracking-[0.16em] text-white/80">
                <Package className="h-3.5 w-3.5" /> {kind === 'product' ? 'SKU' : 'Scope'}
              </div>
              <p className="mt-1 text-xs font-bold text-white">Ready to publish</p>
            </div>
            <div className="rounded-xl border border-white/10 bg-white/10 px-3 py-2">
              <div className="flex items-center gap-2 text-[9px] font-black uppercase tracking-[0.16em] text-white/80">
                <ShieldCheck className="h-3.5 w-3.5" /> Verification
              </div>
              <p className="mt-1 text-xs font-bold text-white">Fast review</p>
            </div>
            <div className="rounded-xl border border-white/10 bg-white/10 px-3 py-2">
              <div className="flex items-center gap-2 text-[9px] font-black uppercase tracking-[0.16em] text-white/80">
                <BadgeCheck className="h-3.5 w-3.5" /> Buyer ready
              </div>
              <p className="mt-1 text-xs font-bold text-white">RFQ enabled</p>
            </div>
          </div>
        </div>
      </div>

      <form onSubmit={submitForm} className="grid gap-6 lg:grid-cols-3 items-start">
        {/* Left Side: Form Controls (Col Span 2) */}
        <div className="lg:col-span-2 space-y-6">
          {/* Custom Tabs Navigation */}
          <div className="flex bg-slate-100 p-1.5 rounded-2xl gap-1 shadow-inner border border-slate-200/50">
            {[
              { id: 'basic', label: 'Basic Info', icon: FileText },
              { id: 'attributes', label: kind === 'product' ? 'Attributes' : 'Service Specs', icon: Wrench },
              { id: 'pricing', label: 'Pricing & GST', icon: Tag },
              { id: 'specs', label: 'Specifications', icon: Plus }
            ].map(t => {
              const Icon = t.icon;
              const isActive = activeTab === t.id;
              return (
                <button
                  key={t.id}
                  type="button"
                  onClick={() => setActiveTab(t.id as any)}
                  className={cn(
                    "flex-1 flex items-center justify-center gap-2 py-2 px-3 rounded-xl text-xs font-black uppercase tracking-wider transition-all duration-200",
                    isActive 
                      ? "bg-white text-slate-900 shadow-sm border border-slate-200" 
                      : "text-slate-500 hover:text-slate-900 hover:bg-slate-50"
                  )}
                >
                  <Icon className={cn("h-4 w-4", isActive ? "text-emerald-500" : "text-slate-400")} />
                  <span className="hidden sm:inline">{t.label}</span>
                </button>
              );
            })}
          </div>

          <Card className="border-slate-200/80 shadow-sm bg-white p-6 rounded-3xl">
            <CardContent className="p-0 space-y-6">
              {/* Tab 1: Basic Information */}
              {activeTab === 'basic' && (
                <div className="space-y-4 animate-in fade-in duration-300">
                  <h3 className="text-sm font-black uppercase tracking-wide text-slate-800 border-b border-slate-100 pb-2">General Details</h3>
                  <div className="grid gap-4 sm:grid-cols-2">
                    <div className="sm:col-span-2">
                      <Input
                        label={`${kind === 'product' ? 'Product' : 'Service'} Name`}
                        value={form.name}
                        onChange={event => updateForm('name', event.target.value)}
                        required
                        placeholder="e.g. Structural Steel Beams, IT Advisory Services"
                        className="bg-white"
                      />
                    </div>
                    <Select
                      label="Visibility Status"
                      value={form.status}
                      onChange={event => updateForm('status', event.target.value)}
                      className="bg-white"
                    >
                      <option value="ACTIVE">Active</option>
                      <option value="DRAFT">Draft</option>
                      <option value="INACTIVE">Inactive</option>
                    </Select>
                    <Select
                      label="Category"
                      value={form.categoryId}
                      onChange={event => updateForm('categoryId', event.target.value)}
                      className="bg-white"
                    >
                      <option value="">Select Category</option>
                      {categoryList.map(cat => <option key={cat.id} value={String(cat.id)}>{cat.name}</option>)}
                    </Select>
                    <div className="sm:col-span-2">
                      <label className="mb-1.5 block text-xs font-bold uppercase tracking-wider text-slate-500">Description</label>
                      <textarea
                        value={form.description}
                        onChange={event => updateForm('description', event.target.value)}
                        rows={6}
                        placeholder="Provide descriptive details, technical specifications, and delivery terms..."
                        className="w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-xs outline-none transition-all focus:border-emerald-400 focus:ring-2 focus:ring-emerald-500/20"
                      />
                    </div>
                  </div>
                </div>
              )}

              {/* Tab 2: Attributes */}
              {activeTab === 'attributes' && (
                <div className="space-y-4 animate-in fade-in duration-300">
                  <h3 className="text-sm font-black uppercase tracking-wide text-slate-800 border-b border-slate-100 pb-2">
                    {kind === 'product' ? 'Product Specifications' : 'Service Scope & SLA'}
                  </h3>
                  {kind === 'product' ? (
                    <div className="grid gap-4 sm:grid-cols-2">
                      <Select
                        label="Unit Of Measure"
                        value={form.unitOfMeasure}
                        onChange={event => updateForm('unitOfMeasure', event.target.value)}
                        className="bg-white"
                      >
                        <option value="">Select Unit</option>
                        {QUANTITY_UNITS.map(u => <option key={u.value} value={u.value}>{u.label}</option>)}
                      </Select>
                      <Select
                        label="Item Condition"
                        value={form.itemCondition}
                        onChange={event => updateForm('itemCondition', event.target.value)}
                        className="bg-white"
                      >
                        <option value="">Select Condition</option>
                        {ITEM_CONDITIONS.map(c => <option key={c.value} value={c.value}>{c.label}</option>)}
                      </Select>
                      <Input
                        label="HSN Code"
                        value={form.hsnCode}
                        onChange={event => updateForm('hsnCode', event.target.value)}
                        placeholder="8-digit HSN code"
                        className="bg-white"
                      />
                      <Input label="SKU" value={form.sku} onChange={e => updateForm('sku', e.target.value)} placeholder="Unique product code" className="bg-white" />
                      <Input label="Brand" value={form.brand} onChange={e => updateForm('brand', e.target.value)} placeholder="Brand name" className="bg-white" />
                      <Input label="Model Number" value={form.modelNumber} onChange={e => updateForm('modelNumber', e.target.value)} placeholder="Model / variant" className="bg-white" />
                      <label className="inline-flex items-center gap-2 text-xs font-bold text-slate-700 sm:col-span-2 py-2">
                        <input type="checkbox" checked={Boolean(form.isMsmeMade)} onChange={e => updateForm('isMsmeMade', e.target.checked)} className="h-4 w-4 rounded border-slate-300 accent-emerald-600" />
                        MSME Made Product
                      </label>
                    </div>
                  ) : (
                    <div className="grid gap-4 sm:grid-cols-2">
                      <Input
                        label="Service Area"
                        value={form.serviceArea}
                        onChange={event => updateForm('serviceArea', event.target.value)}
                        placeholder="e.g. Delhi NCR, Pan-India"
                        className="bg-white"
                      />
                      <Input label="Duration" value={form.duration} onChange={e => updateForm('duration', e.target.value)} placeholder="e.g. 30 days" className="bg-white" />
                      <Input label="SLA / Response Time" value={form.slaResponseTime} onChange={e => updateForm('slaResponseTime', e.target.value)} placeholder="e.g. 24 hours" className="bg-white" />
                      <Select
                        label="Pricing Model"
                        value={form.pricingModel}
                        onChange={event => updateForm('pricingModel', event.target.value)}
                        className="bg-white"
                      >
                        <option value="FIXED">Fixed</option>
                        <option value="HOURLY">Hourly</option>
                        <option value="DAILY">Daily</option>
                        <option value="MONTHLY">Monthly</option>
                        <option value="PER_PROJECT">Per Project</option>
                        <option value="CUSTOM">Custom</option>
                      </Select>
                      <div className="sm:col-span-2 space-y-3 pt-2">
                        <div>
                          <label className="mb-1.5 block text-xs font-bold uppercase tracking-wider text-slate-500">Scope of Work</label>
                          <textarea value={form.scopeOfWork} onChange={e => updateForm('scopeOfWork', e.target.value)} rows={3} className="w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-xs" />
                        </div>
                        <div className="grid gap-3 sm:grid-cols-2">
                          <div>
                            <label className="mb-1.5 block text-xs font-bold uppercase tracking-wider text-slate-500">Deliverables</label>
                            <textarea value={form.deliverables} onChange={e => updateForm('deliverables', e.target.value)} rows={3} className="w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-xs" />
                          </div>
                          <div>
                            <label className="mb-1.5 block text-xs font-bold uppercase tracking-wider text-slate-500">Inclusions</label>
                            <textarea value={form.inclusions} onChange={e => updateForm('inclusions', e.target.value)} rows={3} className="w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-xs" />
                          </div>
                        </div>
                        <div>
                          <label className="mb-1.5 block text-xs font-bold uppercase tracking-wider text-slate-500">Exclusions</label>
                          <textarea value={form.exclusions} onChange={e => updateForm('exclusions', e.target.value)} rows={2} className="w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-xs" />
                        </div>
                      </div>
                    </div>
                  )}
                </div>
              )}

              {/* Tab 3: Pricing & GST */}
              {activeTab === 'pricing' && (
                <div className="space-y-6 animate-in fade-in duration-300">
                  <div>
                    <h3 className="text-sm font-black uppercase tracking-wide text-slate-800 border-b border-slate-100 pb-2">Pricing Structure</h3>
                    <div className="grid gap-4 sm:grid-cols-2 mt-4">
                      <Input
                        label={`${kind === 'product' ? 'Price' : 'Base Price'} (INR)`}
                        type="number"
                        min="0"
                        value={kind === 'product' ? form.price : form.basePrice}
                        onChange={event => updateForm(kind === 'product' ? 'price' : 'basePrice', event.target.value)}
                        placeholder="0.00"
                        className="bg-white"
                      />
                      <Input
                        label="General Discount (%)"
                        type="number"
                        min="0"
                        max="100"
                        step="0.01"
                        value={form.discount}
                        onChange={event => updateForm('discount', event.target.value)}
                        placeholder="0.00"
                        className="bg-white"
                      />
                    </div>
                  </div>

                  <div>
                    <h3 className="text-sm font-black uppercase tracking-wide text-slate-800 border-b border-slate-100 pb-2">GST & Taxation</h3>
                    <div className="mt-3">
                      <GstTaxPicker
                        splitRate={form.splitTaxRate}
                        igstRate={form.igstTaxRate}
                        additionalRate={form.otherTaxRate}
                        taxableAmount={taxableAmount}
                        onChange={next => {
                          updateForm('splitTaxRate', next.splitRate);
                          updateForm('igstTaxRate', next.igstRate);
                          updateForm('otherTaxRate', next.additionalRate);
                        }}
                      />
                    </div>
                  </div>

                  <div className="rounded-2xl border border-slate-200 bg-slate-50/50 p-4">
                    <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                      <div>
                        <h4 className="text-xs font-black uppercase tracking-wide text-[#12335f]">Special Offer & Bulk Deal Settings</h4>
                        <p className="mt-1 text-[10px] text-slate-500">Enable promotional prices and bulk ordering discounts.</p>
                      </div>
                      <label className="inline-flex items-center gap-2 text-xs font-bold text-[#12335f] cursor-pointer">
                        <input
                          type="checkbox"
                          checked={Boolean(form.isOfferActive)}
                          onChange={event => updateForm('isOfferActive', event.target.checked)}
                          className="h-4 w-4 rounded border-slate-300 accent-[#12335f]"
                        />
                        Enable Offer
                      </label>
                    </div>
                    {form.isOfferActive && (
                      <div className="mt-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-3 animate-in slide-in-from-top-2 duration-200">
                        <Input
                          label="Original Price"
                          type="number"
                          min="0"
                          value={form.originalPrice}
                          onChange={event => updateForm('originalPrice', event.target.value)}
                          placeholder="Before offer price"
                          className="bg-white"
                        />
                        <Input
                          label="Discount Price"
                          type="number"
                          min="0"
                          value={form.discountPrice}
                          onChange={event => updateForm('discountPrice', event.target.value)}
                          placeholder="Current offer price"
                          className="bg-white"
                        />
                        <Input
                          label="Discount Percent"
                          type="number"
                          min="0"
                          max="100"
                          step="0.01"
                          value={form.discountPercent}
                          onChange={event => updateForm('discountPercent', event.target.value)}
                          placeholder="Optional"
                          className="bg-white"
                        />
                        <Input
                          label="Offer Label"
                          value={form.offerLabel}
                          onChange={event => updateForm('offerLabel', event.target.value)}
                          placeholder="Special Offer, Bulk Deal"
                          className="bg-white"
                        />
                        <Input
                          label="Offer Start"
                          type="date"
                          value={form.offerStartAt}
                          onChange={event => updateForm('offerStartAt', event.target.value)}
                          className="bg-white"
                        />
                        <Input
                          label="Offer End"
                          type="date"
                          value={form.offerEndAt}
                          onChange={event => updateForm('offerEndAt', event.target.value)}
                          className="bg-white"
                        />
                      </div>
                    )}
                    <div className="mt-4 pt-3 border-t border-slate-200/65 flex flex-col gap-3 sm:flex-row sm:items-center">
                      <label className="inline-flex items-center gap-2 text-xs font-bold text-slate-700 cursor-pointer">
                        <input
                          type="checkbox"
                          checked={Boolean(form.bulkDealAvailable)}
                          onChange={event => updateForm('bulkDealAvailable', event.target.checked)}
                          className="h-4 w-4 rounded border-slate-300 accent-slate-800"
                        />
                        Bulk Deal Available
                      </label>
                      {form.bulkDealAvailable && (
                        <div className="sm:w-56 animate-in slide-in-from-left-2 duration-200">
                          <Input
                            label="Bulk Min Quantity"
                            type="number"
                            min="0"
                            value={form.bulkMinQuantity}
                            onChange={event => updateForm('bulkMinQuantity', event.target.value)}
                            placeholder="e.g. 10"
                            className="bg-white"
                          />
                        </div>
                      )}
                    </div>
                  </div>
                </div>
              )}

              {/* Tab 4: Specifications */}
              {activeTab === 'specs' && (
                <div className="space-y-4 animate-in fade-in duration-300">
                  <div className="flex items-center justify-between border-b border-slate-100 pb-2">
                    <h3 className="text-sm font-black uppercase tracking-wide text-slate-800">Technical Specifications</h3>
                    <Button type="button" variant="outline" className="h-8 text-[10px] font-black uppercase border-slate-200" onClick={() => setSpecifications(prev => [...prev, { name: '', value: '', unit: '' }])}>
                      <Plus className="mr-1 h-3 w-3" /> Add Row
                    </Button>
                  </div>
                  {specifications.length === 0 ? (
                    <div className="text-center py-6 border border-dashed border-slate-200 rounded-xl bg-slate-50/50">
                      <p className="text-xs font-semibold text-slate-400">No specifications added yet. Add rows to define technical properties.</p>
                    </div>
                  ) : (
                    <div className="space-y-2">
                      {specifications.map((spec, index) => (
                        <div key={index} className="grid gap-2 sm:grid-cols-[1fr_1fr_120px_auto] items-end bg-slate-50 p-3 rounded-xl border border-slate-100 relative">
                          <Input label={index === 0 ? 'Name' : undefined} value={spec.name} onChange={e => setSpecifications(prev => prev.map((row, i) => i === index ? { ...row, name: e.target.value } : row))} placeholder="e.g. Material" className="bg-white" />
                          <Input label={index === 0 ? 'Value' : undefined} value={spec.value} onChange={e => setSpecifications(prev => prev.map((row, i) => i === index ? { ...row, value: e.target.value } : row))} placeholder="e.g. Grade A Steel" className="bg-white" />
                          <Input label={index === 0 ? 'Unit' : undefined} value={spec.unit} onChange={e => setSpecifications(prev => prev.map((row, i) => i === index ? { ...row, unit: e.target.value } : row))} placeholder="e.g. kg" className="bg-white" />
                          <button type="button" onClick={() => setSpecifications(prev => prev.filter((_, i) => i !== index))} className="h-9 flex items-center justify-center rounded-lg border border-red-200 p-2.5 text-red-600 hover:bg-red-50 bg-white"><Trash2 className="h-4 w-4" /></button>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              )}
            </CardContent>
          </Card>

          {/* Form Actions */}
          <div className="flex justify-end gap-2.5">
            <Button
              type="button"
              variant="outline"
              onClick={handleCancel}
              className="h-10 rounded-xl text-xs font-black uppercase border-slate-200 text-slate-700 hover:bg-slate-50 px-5"
            >
              Cancel
            </Button>
            <Button
              type="submit"
              disabled={saving || uploading}
              className={cn("h-10 rounded-xl text-xs font-black uppercase text-white shadow-md px-6", kind === 'product' ? 'bg-[#059669] hover:bg-emerald-800' : 'bg-emerald-600 hover:bg-emerald-700')}
            >
              {saving ? (
                <>
                  <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" />
                  Saving...
                </>
              ) : (
                <>
                  <Plus className="mr-1.5 h-3.5 w-3.5" />
                  {isEdit ? 'Save Changes' : `Add ${kind}`}
                </>
              )}
            </Button>
          </div>
        </div>

        {/* Right Side: Preview & Assets (Col Span 1) */}
        <div className="space-y-6">
          {/* Live Preview Card */}
          <Card className="overflow-hidden border-slate-200 shadow-sm rounded-3xl bg-white">
            <div className="relative aspect-video bg-gradient-to-br from-slate-100 to-slate-200 flex items-center justify-center text-slate-400 group">
              {uploadedImages.length > 0 ? (
                <img 
                  src={uploadedImages[0].localUrl || getCatalogueImageUrl(uploadedImages[0].id)} 
                  alt="Primary Preview" 
                  className="h-full w-full object-cover"
                />
              ) : (
                <div className="text-center p-4">
                  <ImageIcon className="h-10 w-10 mx-auto text-slate-300" />
                  <p className="mt-1.5 text-[10px] font-bold uppercase tracking-wider text-slate-400">No Image Uploaded</p>
                </div>
              )}
              <div className="absolute left-3 top-3">
                <Badge className={kind === 'product' ? 'bg-emerald-600 text-white' : 'bg-blue-600 text-white'}>
                  {kind.toUpperCase()}
                </Badge>
              </div>
            </div>
            <CardContent className="p-5 space-y-3">
              <div>
                <p className="text-[10px] font-black uppercase tracking-widest text-slate-400">{form.brand || 'No Brand'}</p>
                <h4 className="mt-1 text-sm font-black text-slate-900 line-clamp-1">{form.name || 'Untitled Marketplace Item'}</h4>
                <p className="mt-1 text-[11px] text-slate-500 line-clamp-2">{form.description || 'No description provided.'}</p>
              </div>

              {/* Price Calculation Display */}
              <div className="border-t border-slate-100 pt-3 space-y-2">
                <div className="flex items-center justify-between text-xs font-bold text-slate-500">
                  <span>Base Price:</span>
                  <span>₹{rawPrice.toLocaleString('en-IN')}</span>
                </div>
                {discountAmount > 0 && (
                  <div className="flex items-center justify-between text-xs font-bold text-emerald-600">
                    <span>Discount ({form.discount}%):</span>
                    <span>-₹{discountAmount.toLocaleString('en-IN')}</span>
                  </div>
                )}
                {taxBreakdown.totalTaxAmount > 0 && (
                  <div className="flex items-center justify-between text-xs font-bold text-slate-550">
                    <span>GST ({taxBreakdown.totalRate}%):</span>
                    <span>+₹{taxBreakdown.totalTaxAmount.toLocaleString('en-IN')}</span>
                  </div>
                )}
                <div className="flex items-center justify-between text-sm font-black text-slate-900 border-t border-dashed border-slate-200 pt-2">
                  <span>Final Price:</span>
                  <span className="text-emerald-700">₹{(taxableAmount + taxBreakdown.totalTaxAmount).toLocaleString('en-IN')}</span>
                </div>
              </div>
            </CardContent>
          </Card>

          {/* Upload Card */}
          <Card className="border-slate-200 shadow-sm rounded-3xl bg-white p-5 space-y-4">
            <h4 className="text-xs font-black uppercase tracking-wider text-slate-800 border-b border-slate-100 pb-2">Media & Assets</h4>

            {/* Images Dropzone */}
            <div className="space-y-2">
              <label className="block text-[10px] font-black uppercase tracking-wider text-slate-500">Product Images</label>
              {uploadedImages.length > 0 && (
                <div className="grid grid-cols-4 gap-2 mb-2">
                  {uploadedImages.map(img => (
                    <div key={img.id} className="relative aspect-square rounded-xl overflow-hidden border border-slate-200 group bg-slate-50">
                      <img src={img.localUrl || getCatalogueImageUrl(img.id)} alt={img.originalName} className="h-full w-full object-cover" />
                      <div className="absolute inset-0 bg-black/60 flex items-center justify-center gap-1.5 opacity-0 group-hover:opacity-100 transition-opacity text-white">
                        <button
                          type="button"
                          onClick={async () => {
                            try {
                              setPreviewDocument(await getFileAssetPreview({
                                id: img.id,
                                fileId: img.id,
                                url: img.localUrl || getCatalogueImageUrl(img.id),
                                originalName: img.originalName,
                                mimeType: img.mimeType || 'image/png'
                              }, img.originalName));
                            } catch (err) {
                              toast.error('Unable to preview image');
                            }
                          }}
                          className="p-1 rounded bg-slate-800 hover:bg-slate-700 transition-colors cursor-pointer"
                        >
                          <Eye className="h-3.5 w-3.5" />
                        </button>
                        <button
                          type="button"
                          onClick={() => removeUploadedFile(img.id, 'image')}
                          className="p-1 rounded bg-red-650 hover:bg-red-750 transition-colors cursor-pointer"
                        >
                          <Trash2 className="h-3.5 w-3.5" />
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
              )}
              <label className="flex flex-col items-center justify-center border-2 border-dashed border-slate-200 hover:border-emerald-400 rounded-2xl p-4 bg-slate-50/50 cursor-pointer hover:bg-slate-50 transition-all duration-200">
                <Upload className="h-5 w-5 text-slate-400 mb-1" />
                <span className="text-[10px] font-black uppercase text-slate-500 tracking-wider">Upload Images</span>
                <input
                  type="file"
                  accept="image/*"
                  multiple
                  disabled={uploading}
                  onChange={(e) => handleFileUpload(e, 'image')}
                  className="hidden"
                />
              </label>
            </div>

            {/* Documents Dropzone */}
            <div className="space-y-2">
              <label className="block text-[10px] font-black uppercase tracking-wider text-slate-500">Specification Documents</label>
              {uploadedDocuments.length > 0 && (
                <div className="space-y-1.5 mb-2">
                  {uploadedDocuments.map(doc => (
                    <div key={doc.id} className="flex items-center justify-between gap-2 px-2.5 py-1.5 rounded-xl border border-slate-200 bg-slate-50/50">
                      <div className="flex items-center gap-1.5 min-w-0">
                        <FileText className="h-3.5 w-3.5 text-emerald-600 shrink-0" />
                        <span className="text-[10px] font-bold text-slate-700 truncate">{doc.originalName}</span>
                      </div>
                      <div className="flex items-center gap-1 shrink-0">
                        <button
                          type="button"
                          onClick={async () => {
                            try {
                              setPreviewDocument(await getFileAssetPreview({
                                id: doc.id,
                                fileId: doc.id,
                                url: doc.localUrl || getCatalogueImageUrl(doc.id),
                                originalName: doc.originalName,
                                mimeType: doc.mimeType
                              }, doc.originalName));
                            } catch (err) {
                              toast.error('Unable to view document');
                            }
                          }}
                          className="text-[#059669] hover:text-emerald-800 p-0.5 cursor-pointer"
                        >
                          <Eye className="h-3.5 w-3.5" />
                        </button>
                        <button
                          type="button"
                          onClick={() => removeUploadedFile(doc.id, 'document')}
                          className="text-red-500 hover:text-red-750 p-0.5 cursor-pointer"
                        >
                          <Trash2 className="h-3.5 w-3.5" />
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
              )}
              <label className="flex flex-col items-center justify-center border-2 border-dashed border-slate-200 hover:border-emerald-400 rounded-2xl p-4 bg-slate-50/50 cursor-pointer hover:bg-slate-50 transition-all duration-200">
                <FileUp className="h-5 w-5 text-slate-400 mb-1" />
                <span className="text-[10px] font-black uppercase text-slate-500 tracking-wider">Upload Documents</span>
                <input
                  type="file"
                  accept=".pdf,.doc,.docx,.xls,.xlsx,.csv"
                  multiple
                  disabled={uploading}
                  onChange={(e) => handleFileUpload(e, 'document')}
                  className="hidden"
                />
              </label>
            </div>

            {uploading && (
              <div className="flex items-center justify-center gap-2 py-2 text-xs text-emerald-600 font-bold bg-emerald-50 rounded-xl mt-2 animate-pulse">
                <Loader2 className="h-4 w-4 animate-spin" />
                <span>Uploading files...</span>
              </div>
            )}
          </Card>
        </div>
      </form>

      <DocumentPreviewModal previewDocument={previewDocument} onClose={() => setPreviewDocument(null)} />
    </div>
  );
}
