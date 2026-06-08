import { FormEvent, useEffect, useState } from 'react';
import { usePathname, useRouter } from 'next/navigation';
import { Eye, FileText, ImageIcon, Plus, Trash2, Upload, FileUp, Loader2, ArrowLeft } from 'lucide-react';
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
  hsnCode: '',
  unitOfMeasure: '',
  itemCondition: '',
  basePrice: '',
  pricingModel: 'FIXED',
  serviceArea: '',
  status: 'ACTIVE',
  categoryId: ''
};

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
  const idStr = productMatch ? productMatch[2] : (serviceMatch ? serviceMatch[2] : null);
  const id = (isEdit && idStr) ? Number(idStr) : null;

  const [categoryList, setCategoryList] = useState<CategoryDto[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [form, setForm] = useState(blankForm);
  const [uploadedImages, setUploadedImages] = useState<any[]>([]);
  const [uploadedDocuments, setUploadedDocuments] = useState<any[]>([]);
  const [uploading, setUploading] = useState(false);
  const [previewDocument, setPreviewDocument] = useState<DocumentPreview | null>(null);

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
              hsnCode: item.hsnCode || '',
              unitOfMeasure: item.unitOfMeasure || '',
              itemCondition: item.itemCondition || '',
              basePrice: item.basePrice === null || item.basePrice === undefined ? '' : String(item.basePrice),
              pricingModel: item.pricingModel || 'FIXED',
              serviceArea: item.serviceArea || '',
              status: item.status || 'ACTIVE',
              categoryId: String(item.categoryId || '')
            });
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

  const updateForm = (field: keyof typeof blankForm, value: string) =>
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
        ...(kind === 'product'
          ? {
            price: form.price ? Number(form.price) : null,
            taxRate: (form.splitTaxRate ? Number(form.splitTaxRate) : 0) + (form.igstTaxRate ? Number(form.igstTaxRate) : 0) + (form.otherTaxRate ? Number(form.otherTaxRate) : 0),
            discount: form.discount ? Number(form.discount) : 0,
            hsnCode: form.hsnCode.trim() || null,
            unitOfMeasure: form.unitOfMeasure.trim() || null,
            itemCondition: form.itemCondition.trim() || null
          }
          : {
            basePrice: form.basePrice ? Number(form.basePrice) : null,
            taxRate: (form.splitTaxRate ? Number(form.splitTaxRate) : 0) + (form.igstTaxRate ? Number(form.igstTaxRate) : 0) + (form.otherTaxRate ? Number(form.otherTaxRate) : 0),
            discount: form.discount ? Number(form.discount) : 0,
            pricingModel: form.pricingModel,
            serviceArea: form.serviceArea.trim() || null
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
      router.push('/seller/marketplace');
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Unable to save marketplace item');
    } finally {
      setSaving(false);
    }
  };

  const handleCancel = () => {
    uploadedImages.forEach(img => { if (img.localUrl) URL.revokeObjectURL(img.localUrl); });
    uploadedDocuments.forEach(doc => { if (doc.localUrl) URL.revokeObjectURL(doc.localUrl); });
    router.push('/seller/marketplace');
  };

  if (loading) return <LoadingState label="Loading form details..." />;
  if (error) return <InlineError message={error} onRetry={() => router.push('/seller/marketplace')} />;

  const title = isEdit ? `Edit ${kind === 'product' ? 'Product' : 'Service'}` : `New ${kind === 'product' ? 'Product' : 'Service'}`;
  const descriptionText = isEdit
    ? `Review and update details for your marketplace ${kind === 'product' ? 'product' : 'service'}.`
    : `List a new ${kind === 'product' ? 'product' : 'service'} on the synergy marketplace.`;
  const rawPrice = kind === 'product' ? toNumber(form.price) : toNumber(form.basePrice);
  const discountAmount = rawPrice * (toNumber(form.discount) / 100);
  const taxableAmount = Math.max(0, rawPrice - discountAmount);
  const taxBreakdown = calculateGstBreakdown(taxableAmount, form.splitTaxRate, form.igstTaxRate, form.otherTaxRate);

  return (
    <div className="space-y-4 min-w-0">
      <div className="flex flex-col gap-3 border-b border-slate-200 pb-4 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <button
            type="button"
            onClick={handleCancel}
            className="group flex items-center gap-1 text-[10px] font-black uppercase tracking-widest text-slate-500 hover:text-emerald-700 transition-colors mb-2"
          >
            <ArrowLeft className="h-3 w-3 transition-transform group-hover:-translate-x-0.5" />
            Back to Marketplace
          </button>
          <h1 className="text-2xl font-black text-slate-950 font-sans tracking-tight">{title}</h1>
          <p className="mt-1 text-xs font-semibold text-slate-500">{descriptionText}</p>
        </div>
      </div>

      <Card className="border-emerald-100 bg-white shadow-sm max-w-4xl">
        <CardHeader className="flex flex-row items-center justify-between border-b border-slate-100 pb-3">
          <CardTitle className="text-sm font-black text-neutral-900 font-sans tracking-tight">
            {isEdit ? 'Update Details' : 'Specifications & Assets'}
          </CardTitle>
          <Badge className={kind === 'product' ? 'bg-[#059669] text-white' : 'bg-emerald-600 text-white'}>
            {kind.toUpperCase()}
          </Badge>
        </CardHeader>
        <CardContent className="pt-5">
          <form onSubmit={submitForm} className="grid gap-4 lg:grid-cols-2">
            <Input
              label={`${kind === 'product' ? 'Product' : 'Service'} Name`}
              value={form.name}
              onChange={event => updateForm('name', event.target.value)}
              required
              placeholder="e.g. Structural Steel Beams, IT Advisory Services"
              className="bg-white"
            />
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

            {kind === 'product' ? (
              <>
                <Input
                  label="Price (INR)"
                  type="number"
                  min="0"
                  value={form.price}
                  onChange={event => updateForm('price', event.target.value)}
                  placeholder="0.00"
                  className="bg-white"
                />
                <Input
                  label="Discount (%)"
                  type="number"
                  min="0"
                  max="100"
                  step="0.01"
                  value={form.discount}
                  onChange={event => updateForm('discount', event.target.value)}
                  placeholder="0.00"
                  className="bg-white"
                />
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
              </>
            ) : (
              <>
                <Input
                  label="Base Price (INR)"
                  type="number"
                  min="0"
                  value={form.basePrice}
                  onChange={event => updateForm('basePrice', event.target.value)}
                  placeholder="0.00"
                  className="bg-white"
                />
                <Input
                  label="Discount (%)"
                  type="number"
                  min="0"
                  max="100"
                  step="0.01"
                  value={form.discount}
                  onChange={event => updateForm('discount', event.target.value)}
                  placeholder="0.00"
                  className="bg-white"
                />
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
                <Input
                  label="Service Area"
                  value={form.serviceArea}
                  onChange={event => updateForm('serviceArea', event.target.value)}
                  placeholder="e.g. Delhi NCR, Pan-India"
                  className="bg-white"
                />
              </>
            )}

            <div className="lg:col-span-2">
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
              <p className="mt-2 text-[10px] font-bold uppercase tracking-wider text-slate-500">
                Taxable {taxableAmount.toLocaleString('en-IN')} | GST {taxBreakdown.totalRate}% = {taxBreakdown.totalTaxAmount.toLocaleString('en-IN')}
              </p>
            </div>

            <div className="lg:col-span-2">
              <label className="mb-1.5 block text-xs font-bold uppercase tracking-wider text-slate-500">Description</label>
              <textarea
                value={form.description}
                onChange={event => updateForm('description', event.target.value)}
                rows={4}
                placeholder="Provide descriptive details, technical specifications, and delivery terms..."
                className="w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-xs outline-none transition-all focus:border-emerald-400 focus:ring-2 focus:ring-emerald-500/20"
              />
            </div>

            <div className="lg:col-span-2 grid gap-4 sm:grid-cols-2 border-t border-slate-100 pt-4 mt-2">
              {/* Image upload section */}
              <div className="space-y-2">
                <label className="block text-xs font-bold uppercase tracking-wider text-slate-500">
                  Images (Optional)
                </label>

                {uploadedImages.length > 0 && (
                  <div className="flex flex-wrap gap-2 mb-2">
                    {uploadedImages.map(img => (
                      <div key={img.id} className="relative h-16 w-16 rounded-lg overflow-hidden border border-slate-200 group bg-slate-50">
                        <img src={img.localUrl || getCatalogueImageUrl(img.id)} alt={img.originalName} className="h-full w-full object-cover" />
                        <div className="absolute inset-0 bg-black/60 flex items-center justify-center gap-2 opacity-0 group-hover:opacity-100 transition-opacity text-white">
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
                                toast.error(err instanceof Error ? err.message : 'Unable to view image');
                              }
                            }}
                            className="p-1.5 rounded bg-slate-800 hover:bg-slate-700 transition-colors cursor-pointer"
                            title="View image"
                          >
                            <Eye className="h-3.5 w-3.5" />
                          </button>
                          <button
                            type="button"
                            onClick={() => removeUploadedFile(img.id, 'image')}
                            className="p-1.5 rounded bg-red-650 hover:bg-red-700 transition-colors cursor-pointer"
                            title="Delete image"
                          >
                            <Trash2 className="h-3.5 w-3.5" />
                          </button>
                        </div>
                      </div>
                    ))}
                  </div>
                )}

                <label className="flex flex-col items-center justify-center border border-dashed border-slate-200 rounded-lg p-4 bg-white cursor-pointer hover:bg-slate-50 transition-colors">
                  <Upload className="h-5 w-5 text-slate-400 mb-1" />
                  <span className="text-[10px] font-bold text-slate-500">Click to Upload Image</span>
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

              {/* Document upload section */}
              <div className="space-y-2">
                <label className="block text-xs font-bold uppercase tracking-wider text-slate-500">
                  Specification Documents (Optional)
                </label>

                {uploadedDocuments.length > 0 && (
                  <div className="space-y-1.5 mb-2">
                    {uploadedDocuments.map(doc => (
                      <div key={doc.id} className="flex items-center justify-between gap-2 px-2.5 py-1.5 rounded-lg border border-slate-200 bg-white">
                        <div className="flex items-center gap-1.5 min-w-0">
                          <FileText className="h-3.5 w-3.5 text-[#059669] shrink-0" />
                          <span className="text-[10px] font-bold text-slate-700 truncate">{doc.originalName}</span>
                        </div>
                        <div className="flex items-center gap-1.5 shrink-0">
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
                                toast.error(err instanceof Error ? err.message : 'Unable to view document');
                              }
                            }}
                            className="text-[#059669] hover:text-emerald-800 p-0.5 cursor-pointer"
                            title="View document"
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

                <label className="flex flex-col items-center justify-center border border-dashed border-slate-200 rounded-lg p-4 bg-white cursor-pointer hover:bg-slate-50 transition-colors">
                  <FileUp className="h-5 w-5 text-slate-400 mb-1" />
                  <span className="text-[10px] font-bold text-slate-500">Click to Upload Document</span>
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
            </div>

            {uploading && (
              <div className="lg:col-span-2 flex items-center justify-center gap-2 py-2 text-xs text-[#059669] font-bold bg-emerald-50 rounded-lg mt-2">
                <Loader2 className="h-4 w-4 animate-spin" />
                <span>Uploading assets...</span>
              </div>
            )}

            <div className="flex justify-end gap-2 border-t border-slate-100 pt-4 mt-2 lg:col-span-2">
              <Button
                type="button"
                variant="outline"
                onClick={handleCancel}
                className="h-10 rounded-lg text-xs font-black uppercase border-slate-200 text-slate-700 hover:bg-slate-50"
              >
                Cancel
              </Button>
              <Button
                type="submit"
                disabled={saving || uploading}
                className={cn("h-10 rounded-lg text-xs font-black uppercase text-white shadow-sm", kind === 'product' ? 'bg-[#059669] hover:bg-emerald-800' : 'bg-emerald-600 hover:bg-emerald-700')}
              >
                <Plus className="mr-1.5 h-3.5 w-3.5" />
                {saving ? 'Saving...' : isEdit ? `Save Changes` : `Create ${kind}`}
              </Button>
            </div>
          </form>
        </CardContent>
      </Card>

      <DocumentPreviewModal previewDocument={previewDocument} onClose={() => setPreviewDocument(null)} />
    </div>
  );
}
