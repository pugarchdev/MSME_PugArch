import { FormEvent, useCallback, useEffect, useMemo, useState, useRef } from 'react';
import {
  Boxes,
  IndianRupee,
  PackagePlus,
  PackageSearch,
  Plus,
  RefreshCw,
  Search,
  Settings2,
  Store,
  Wrench,
  Grid,
  List,
  Eye,
  ShoppingCart,
  X,
  Globe,
  Tag,
  Barcode,
  Info,
  FileText,
  Mail,
  MapPin,
  ShieldCheck,
  CalendarDays,
  Building2,
  Upload,
  Trash2,
  FileUp,
  Loader2,
  ImageIcon,
  Paperclip,
  ArrowUp,
  ArrowDown,
  ArrowUpDown
} from 'lucide-react';
import { toast } from 'sonner';
import { Button } from '../../../components/ui/button';
import { Badge, Card, CardContent, CardHeader, CardTitle } from '../../../components/ui/card';
import { Input, Select } from '../../../components/ui/input';
import { useAuth } from '../../../hooks/useAuth';
import { cn } from '../../../lib/utils';
import { EmptyState, InlineError, LoadingState } from '../../shared/FeatureStates';
import { getApi, normalizeList, postApi } from '../../shared/apiClient';
import { formatCurrency } from '../../shared/format';
import { Pagination } from '../../shared/Pagination';
import { usePagination, useResponsiveViewMode } from '../../shared/hooks';
import { EntityIdLink } from '../../shared/EntityIdLink';
import { ViewModeToggle } from '../../shared/ViewModeToggle';
import type { CatalogueItemDto, CategoryDto } from '../../shared/types';
import { catalogueApi } from '../api';
import { getFileAssetPreview, type DocumentPreview, openFileAsset } from '../../../lib/files';
import { DocumentPreviewModal } from '../../../components/DocumentPreviewModal';
import { QUANTITY_UNITS, ITEM_CONDITIONS } from '../../../constants/dropdowns';
import { api } from '../../../lib/api';
import { compressImage } from '../../../lib/compress';

type CatalogueMode = 'buyer' | 'seller' | 'admin';
type ItemKind = 'product' | 'service';
type FilterKind = 'all' | ItemKind;
type CatalogueRecord = CatalogueItemDto & { itemKind: ItemKind };
type BuyerActionState = {
  purchase?: { id?: number; status?: string; purchaseNumber?: string };
  rfq?: { id?: number; status?: string; subject?: string };
};

const blankForm = {
  name: '',
  description: '',
  price: '',
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

const cataloguePrice = (item: CatalogueRecord) =>
  item.itemKind === 'product' ? toNumber(item.price) : toNumber(item.basePrice);

const actionKey = (sellerId: unknown) => String(sellerId || '');

const getCatalogueImageUrl = (fileId: number | string | undefined) => {
  if (!fileId) return '';
  const token = localStorage.getItem('token') || '';
  const rawBaseUrl = process.env.NEXT_PUBLIC_API_URL || '';
  let baseUrl = rawBaseUrl;
  if (!baseUrl && typeof window !== 'undefined') {
    const { protocol, hostname, port } = window.location;
    if ((hostname === 'localhost' || hostname === '127.0.0.1') && port === '3000') {
      baseUrl = `${protocol}//${hostname}:5000`;
    }
  }
  const cleanBase = (baseUrl || '').replace(/\/$/, '');
  return `${cleanBase}/api/files/${fileId}/view?token=${encodeURIComponent(token)}`;
};

type CatalogueMedia = {
  id?: number;
  label: string;
  fileId?: number;
  mimeType?: string;
  originalName?: string;
  kind: 'image' | 'document';
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

const mediaToUploadedAsset = (media: CatalogueMedia) => ({
  id: media.fileId,
  fileId: media.fileId,
  fileAssetId: media.fileId,
  originalName: media.originalName || media.label,
  mimeType: media.mimeType
});

const uploadedAssetIds = (assets: any[]) =>
  Array.from(new Set(assets.map(asset => fileIdOf(asset)).filter((id): id is number => typeof id === 'number' && Number.isFinite(id) && id > 0)));

const uploadCatalogueAsset = async (file: File) => {
  const buildBody = () => {
    const fd = new FormData();
    fd.append('file', file);
    return fd;
  };
  const headers = { Authorization: `Bearer ${localStorage.getItem('token') || ''}` };
  const endpoints = ['/api/catalogue/upload', '/api/upload?entityType=catalogue'];
  let lastError = '';

  for (const endpoint of endpoints) {
    const res = await api.fetch(endpoint, {
      method: 'POST',
      headers,
      body: buildBody()
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

const catalogueMedia = (item: CatalogueRecord) => {
  const media: CatalogueMedia[] = [];

  item.images?.forEach((image, index) => {
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

  item.certifications?.forEach((cert, index) => {
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

  item.catalogueFiles?.forEach((file, index) => {
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

const getItemImageId = (item: CatalogueRecord): number | null =>
  catalogueMedia(item).find(file => file.kind === 'image')?.fileId || null;

const catalogueDocuments = (item: CatalogueRecord) =>
  catalogueMedia(item).filter(file => file.kind === 'document');

const isProcurementApproved = (status?: string) =>
  ['approved_for_procurement', 'approved'].includes(String(status || ''));

export default function CataloguePage({ mode = 'buyer' }: { mode?: CatalogueMode }) {
  const { user } = useAuth();
  const [products, setProducts] = useState<CatalogueRecord[]>([]);
  const [services, setServices] = useState<CatalogueRecord[]>([]);
  const [categoryList, setCategoryList] = useState<CategoryDto[]>([]);
  const [editingItem, setEditingItem] = useState<CatalogueRecord | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [searchTerm, setSearchTerm] = useState('');
  const [statusFilter, setStatusFilter] = useState('');
  const [categoryFilter, setCategoryFilter] = useState('');
  const [priceFilter, setPriceFilter] = useState('');
  const [kindFilter, setKindFilter] = useState<FilterKind>('all');
  const [formKind, setFormKind] = useState<ItemKind>('product');
  const [form, setForm] = useState(blankForm);
  const [showForm, setShowForm] = useState(false);
  const [showMobileFilters, setShowMobileFilters] = useState(false);

  // Layout and modal states
  const [viewMode, setViewMode] = useResponsiveViewMode();
  const [sortKey, setSortKey] = useState<'sr' | 'name' | 'kind' | 'category' | 'seller' | 'price' | 'status'>('sr');
  const [sortDirection, setSortDirection] = useState<'asc' | 'desc'>('asc');
  const [selectedDetailsItem, setSelectedDetailsItem] = useState<CatalogueRecord | null>(null);
  const [previewDocument, setPreviewDocument] = useState<DocumentPreview | null>(null);
  const [selectedPurchaseItem, setSelectedPurchaseItem] = useState<CatalogueRecord | null>(null);
  const [selectedSeller, setSelectedSeller] = useState<any | null>(null);
  const [sellerLoading, setSellerLoading] = useState(false);
  const [addingItemId, setAddingItemId] = useState<number | null>(null);
  const [buyerActions, setBuyerActions] = useState<Record<string, BuyerActionState>>({});

  // File upload state for catalogue form
  const [uploadedImages, setUploadedImages] = useState<any[]>([]);
  const [uploadedDocuments, setUploadedDocuments] = useState<any[]>([]);
  const [uploading, setUploading] = useState(false);

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

  const removeUploadedFile = (id: number, type: 'image' | 'document') => {
    if (type === 'image') {
      const removed = uploadedImages.find(img => img.id === id);
      if (removed?.localUrl) URL.revokeObjectURL(removed.localUrl);
      setUploadedImages(prev => prev.filter(img => img.id !== id));
    } else {
      const removed = uploadedDocuments.find(doc => doc.id === id);
      if (removed?.localUrl) URL.revokeObjectURL(removed.localUrl);
      setUploadedDocuments(prev => prev.filter(doc => doc.id !== id));
    }
  };

  const sellerApproved = mode !== 'seller' || isProcurementApproved(user?.onboardingStatus);
  const buyerApproved = mode !== 'buyer' || isProcurementApproved(user?.onboardingStatus);
  const buyerProcurementLocked = mode === 'buyer' && !buyerApproved;

  const productsRef = useRef<CatalogueRecord[]>([]);
  productsRef.current = products;
  const servicesRef = useRef<CatalogueRecord[]>([]);
  servicesRef.current = services;

  const loadBuyerActions = useCallback(async (allProducts?: CatalogueRecord[], allServices?: CatalogueRecord[]) => {
    if (mode !== 'buyer') return;
    try {
      const [purchaseRows, rfqRows] = await Promise.all([
        getApi('/api/direct-purchases').catch(() => []),
        getApi('/api/quote-requests').catch(() => [])
      ]);
      const next: Record<string, BuyerActionState> = {};
      const currentProducts = allProducts || productsRef.current;
      const currentServices = allServices || servicesRef.current;
      const allItems = [...currentProducts, ...currentServices];

      normalizeList<any>(purchaseRows).forEach(row => {
        let matchedItem: CatalogueRecord | undefined = undefined;

        // A. Match by requirement item productId or name
        if (row.requirement?.items?.length) {
          const reqItem = row.requirement.items[0];
          matchedItem = allItems.find(item =>
            (reqItem.productId && item.id === reqItem.productId) ||
            item.name.toLowerCase() === reqItem.itemName.toLowerCase()
          );
        }

        // B. Match by requirement title containing item name
        if (!matchedItem && row.requirement?.title) {
          matchedItem = allItems.find(item =>
            row.requirement.title.includes(item.name)
          );
        }

        // C. Fallback: If requirement is null, check if totalAmount matches the item price
        if (!matchedItem && row.totalAmount && Number(row.totalAmount) > 0) {
          matchedItem = allItems.find(item => {
            const price = item.itemKind === 'product' ? toNumber(item.price) : toNumber(item.basePrice);
            return price === Number(row.totalAmount);
          });
        }

        if (matchedItem) {
          const key = `${matchedItem.itemKind}-${matchedItem.id}`;
          next[key] = {
            ...next[key],
            purchase: {
              id: row.id,
              status: row.status,
              purchaseNumber: row.purchaseNumber
            }
          };
        }
      });

      normalizeList<any>(rfqRows).forEach(row => {
        const matchedItem = allItems.find(item =>
          (row.subject && row.subject.includes(item.name)) ||
          (row.message && row.message.includes(item.name))
        );

        if (matchedItem) {
          const key = `${matchedItem.itemKind}-${matchedItem.id}`;
          next[key] = {
            ...next[key],
            rfq: {
              id: row.id,
              status: row.status || row.statusEnum,
              subject: row.subject
            }
          };
        }
      });

      setBuyerActions(next);
    } catch {
      // Marketplace should still render even if activity status cannot be fetched.
    }
  }, [mode]);

  const loadCatalogue = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const [productRows, serviceRows, categoriesData] = await Promise.all([
        mode === 'seller' ? catalogueApi.sellerProducts() : mode === 'admin' ? catalogueApi.adminProducts() : catalogueApi.searchProducts(),
        mode === 'seller' ? catalogueApi.sellerServices() : mode === 'admin' ? catalogueApi.adminServices() : catalogueApi.searchServices(),
        catalogueApi.categories()
      ]);
      const normProducts = normalizeList<CatalogueItemDto>(productRows).map(item => ({ ...item, itemKind: 'product' as const }));
      const normServices = normalizeList<CatalogueItemDto>(serviceRows).map(item => ({ ...item, itemKind: 'service' as const }));
      setProducts(normProducts);
      setServices(normServices);
      setCategoryList(categoriesData || []);
      void loadBuyerActions(normProducts, normServices);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unable to load marketplace');
    } finally {
      setLoading(false);
    }
  }, [loadBuyerActions, mode]);

  useEffect(() => {
    void loadCatalogue();
  }, [loadCatalogue]);

  useEffect(() => {
    return () => {
      if (previewDocument?.url?.startsWith('blob:')) URL.revokeObjectURL(previewDocument.url);
    };
  }, [previewDocument?.url]);

  const data = useMemo(() => [...products, ...services], [products, services]);
  const categories = useMemo(() => Array.from(new Set(data.map(item => item.category?.name).filter(Boolean) as string[])).sort(), [data]);
  const statuses = useMemo(() => Array.from(new Set(data.map(item => item.status).filter(Boolean) as string[])).sort(), [data]);

  const filtered = useMemo(() => {
    const term = searchTerm.trim().toLowerCase();
    return data.filter(item => {
      const price = cataloguePrice(item);
      const haystack = [item.name, item.description, item.category?.name, item.seller?.name, item.seller?.email, item.itemKind].filter(Boolean).join(' ').toLowerCase();
      const matchesSearch = !term || haystack.includes(term);
      const matchesKind = kindFilter === 'all' || item.itemKind === kindFilter;
      const matchesStatus = !statusFilter || item.status === statusFilter;
      const matchesCategory = !categoryFilter || item.category?.name === categoryFilter;
      const matchesPrice = !priceFilter || (priceFilter === 'high' ? price >= 10000 : priceFilter === 'mid' ? price >= 1000 && price < 10000 : price < 1000);
      return matchesSearch && matchesKind && matchesStatus && matchesCategory && matchesPrice;
    });
  }, [categoryFilter, data, kindFilter, priceFilter, searchTerm, statusFilter]);

  const sorted = useMemo(() => {
    const direction = sortDirection === 'asc' ? 1 : -1;
    const valueOf = (item: CatalogueRecord): number | string => {
      if (sortKey === 'name') return (item.name || '').toLowerCase();
      if (sortKey === 'kind') return item.itemKind || '';
      if (sortKey === 'category') return (item.category?.name || '').toLowerCase();
      if (sortKey === 'seller') return (item.seller?.name || '').toLowerCase();
      if (sortKey === 'price') return cataloguePrice(item);
      if (sortKey === 'status') return (item.status || '').toLowerCase();
      return Number(item.id || 0);
    };
    return [...filtered].sort((a, b) => {
      const av = valueOf(a);
      const bv = valueOf(b);
      if (typeof av === 'number' && typeof bv === 'number') return (av - bv) * direction;
      return String(av).localeCompare(String(bv)) * direction;
    });
  }, [filtered, sortKey, sortDirection]);

  const { page, pageSize, pageItems: pagedItems, total, setPage, setPageSize } = usePagination(sorted, 10);

  const averageValue = filtered.length ? filtered.reduce((sum, item) => sum + cataloguePrice(item), 0) / filtered.length : 0;

  const updateForm = (field: keyof typeof blankForm, value: string) => setForm(current => ({ ...current, [field]: value }));

  const openCreateForm = (kind: ItemKind) => {
    setEditingItem(null);
    setFormKind(kind);
    setShowForm(true);
    setForm(blankForm);
    setUploadedImages([]);
    setUploadedDocuments([]);
  };

  const openEditForm = (item: CatalogueRecord) => {
    setEditingItem(item);
    setFormKind(item.itemKind);
    setShowForm(true);
    setForm({
      name: item.name || '',
      description: item.description || '',
      price: item.price === null || item.price === undefined ? '' : String(item.price),
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
  };

  const openSellerProfile = async (seller: CatalogueRecord['seller']) => {
    const sellerId = seller?.id;
    if (!sellerId) return;
    setSellerLoading(true);
    setSelectedSeller({ id: sellerId, name: seller?.name, email: seller?.email });
    try {
      const profile = await getApi(`/api/vendors/${sellerId}`);
      setSelectedSeller(profile);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Unable to open seller profile');
    } finally {
      setSellerLoading(false);
    }
  };

  const updateBuyerAction = (item: CatalogueRecord, action: BuyerActionState) => {
    const key = `${item.itemKind}-${item.id}`;
    setBuyerActions(current => ({ ...current, [key]: { ...current[key], ...action } }));
  };

  const openPurchaseBid = (item: CatalogueRecord) => {
    if (buyerProcurementLocked) {
      toast.error('Your buyer account must be approved by admin before purchase or RFQ actions are allowed.');
      return;
    }
    setSelectedPurchaseItem(item);
  };

  const handleAddToCart = async (item: CatalogueRecord) => {
    if (buyerProcurementLocked) {
      toast.error('Your buyer account must be approved by admin before purchase or RFQ actions are allowed.');
      return;
    }
    setAddingItemId(item.id);
    try {
      const payload = item.itemKind === 'product'
        ? { productId: item.id, quantity: 1 }
        : { serviceId: item.id, quantity: 1 };
      await postApi('/api/cart/items', payload);
      toast.success(`${item.name} added to cart`);
    } catch (err: any) {
      toast.error(err?.message || 'Failed to add to cart');
    } finally {
      setAddingItemId(null);
    }
  };

  const deleteItem = async (item: CatalogueRecord) => {
    if (!window.confirm(`Are you sure you want to delete this ${item.itemKind}?`)) {
      return;
    }
    setLoading(true);
    try {
      if (item.itemKind === 'product') {
        await catalogueApi.deleteProduct(item.id);
      } else {
        await catalogueApi.deleteService(item.id);
      }
      toast.success(`${item.itemKind === 'product' ? 'Product' : 'Service'} deleted successfully.`);
      await loadCatalogue();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Unable to delete marketplace item');
    } finally {
      setLoading(false);
    }
  };

  const submitForm = async (event: FormEvent) => {
    event.preventDefault();
    if (!sellerApproved) {
      toast.error('Your seller account must be approved before adding marketplace items.');
      return;
    }
    if (!form.name.trim()) {
      toast.error('Enter an item name.');
      return;
    }
    setSaving(true);
    try {
      const payload = {
        name: form.name.trim(),
        description: form.description.trim() || undefined,
        categoryId: form.categoryId ? Number(form.categoryId) : null,
        status: form.status,
        currency: 'INR',
        imageIds: uploadedAssetIds(uploadedImages),
        documentIds: uploadedAssetIds(uploadedDocuments),
        ...(formKind === 'product'
          ? {
            price: form.price ? Number(form.price) : undefined,
            hsnCode: form.hsnCode.trim() || undefined,
            unitOfMeasure: form.unitOfMeasure.trim() || undefined,
            itemCondition: form.itemCondition.trim() || undefined
          }
          : {
            basePrice: form.basePrice ? Number(form.basePrice) : undefined,
            pricingModel: form.pricingModel,
            serviceArea: form.serviceArea.trim() || undefined
          })
      };

      if (editingItem) {
        if (formKind === 'product') {
          await catalogueApi.updateProduct(editingItem.id, payload);
          toast.success('Product updated successfully.');
        } else {
          await catalogueApi.updateService(editingItem.id, payload);
          toast.success('Service updated successfully.');
        }
      } else {
        if (formKind === 'product') {
          await catalogueApi.createProduct(payload);
          toast.success('Product added to your marketplace.');
        } else {
          await catalogueApi.createService(payload);
          toast.success('Service added to your marketplace.');
        }
      }
      uploadedImages.forEach(img => { if (img.localUrl) URL.revokeObjectURL(img.localUrl); });
      uploadedDocuments.forEach(doc => { if (doc.localUrl) URL.revokeObjectURL(doc.localUrl); });
      setUploadedImages([]);
      setUploadedDocuments([]);
      setShowForm(false);
      setEditingItem(null);
      setForm(blankForm);
      await loadCatalogue();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Unable to save marketplace item');
    } finally {
      setSaving(false);
    }
  };

  if (loading) return <LoadingState label="Loading marketplace..." />;

  const title = mode === 'seller' ? 'Seller Marketplace' : mode === 'admin' ? 'Marketplace Review' : 'Buyer Marketplace';
  const subtitle = mode === 'seller'
    ? 'Create and manage products and services after seller approval.'
    : mode === 'admin'
      ? 'Review every product and service listed by sellers.'
      : 'Search approved products and services from active sellers.';

  return (
    <div className="space-y-4 min-w-0">
      <div className="flex flex-col gap-3 border-b border-slate-200 pb-4 lg:flex-row lg:items-end lg:justify-between">
        <div>
          <p className="text-[10px] font-black uppercase tracking-widest text-[#059669]">{title}</p>
          <h1 className="text-2xl font-black text-slate-950 font-sans tracking-tight">Marketplace</h1>
          <p className="mt-1 text-xs font-semibold text-slate-500">{subtitle}</p>
        </div>
        <div className="flex flex-wrap gap-2">
          {mode === 'seller' && (
            <>
              <Button disabled={!sellerApproved} onClick={() => openCreateForm('product')} className="h-10 rounded-lg text-xs font-black uppercase tracking-wider bg-emerald-600 text-white hover:bg-emerald-700">
                <PackagePlus className="mr-2 h-4 w-4" />Product
              </Button>
              <Button disabled={!sellerApproved} onClick={() => openCreateForm('service')} variant="outline" className="h-10 rounded-lg text-xs font-black uppercase tracking-wider bg-emerald-600 text-white hover:bg-emerald-700">
                <Wrench className="mr-2 h-4 w-4" />Service
              </Button>
            </>
          )}
          <Button variant="outline" onClick={loadCatalogue} className="h-10 rounded-lg text-xs font-black uppercase tracking-wider border-slate-200 text-slate-700 hover:bg-slate-50">
            <RefreshCw className="mr-2 h-4 w-4" />Refresh
          </Button>
          {/* Standardised list/grid view toggle */}
          <ViewModeToggle value={viewMode} onChange={setViewMode} />

        </div>
      </div>

      {mode === 'seller' && !sellerApproved && (
        <InlineError message="Marketplace item creation is locked until admin approves your seller onboarding. You can view your marketplace, but adding or changing products and services is disabled." />
      )}
      {buyerProcurementLocked && (
        <InlineError message="Buyer procurement is locked until admin approval. You can browse the marketplace and view seller/item details, but purchase and RFQ actions are disabled." />
      )}

      <div className="grid gap-3 grid-cols-2 md:grid-cols-4">
        <Metric label="Total Items" value={filtered.length} icon={Boxes} />
        <Metric label="Products" value={products.length} icon={PackageSearch} />
        <Metric label="Services" value={services.length} icon={Wrench} />
        <Metric label="Avg. Value" value={formatCurrency(averageValue)} icon={IndianRupee} />
      </div>

      {showForm && mode === 'seller' && (
        <CatalogueForm
          form={form}
          kind={formKind}
          saving={saving}
          isEdit={!!editingItem}
          categoryList={categoryList}
          uploadedImages={uploadedImages}
          uploadedDocuments={uploadedDocuments}
          uploading={uploading}
          onFileUpload={handleFileUpload}
          onRemoveFile={removeUploadedFile}
          onCancel={() => {
            uploadedImages.forEach(img => { if (img.localUrl) URL.revokeObjectURL(img.localUrl); });
            uploadedDocuments.forEach(doc => { if (doc.localUrl) URL.revokeObjectURL(doc.localUrl); });
            setUploadedImages([]);
            setUploadedDocuments([]);
            setShowForm(false);
            setEditingItem(null);
          }}
          onSubmit={submitForm}
          onChange={updateForm}
          onPreviewDocument={setPreviewDocument}
        />
      )}

      {error && <InlineError message={error} onRetry={loadCatalogue} />}

      <Card className="border-slate-200/80 shadow-sm bg-white">
        <CardContent className="p-4 space-y-3">
          <div className="flex flex-col sm:flex-row gap-2 items-center">
            <div className="relative flex-1 w-full">
              <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
              <input value={searchTerm} onChange={event => setSearchTerm(event.target.value)} placeholder="Search name, seller, category..." className="h-10 w-full rounded-lg border border-slate-200 pl-10 pr-3 text-xs font-semibold outline-none focus:ring-2 focus:ring-emerald-500/20" />
            </div>

            <Button
              type="button"
              variant="outline"
              onClick={() => setShowMobileFilters(!showMobileFilters)}
              className="xl:hidden h-10 w-full sm:w-auto gap-2 rounded-lg text-xs font-black uppercase tracking-wider border-slate-200 text-slate-700 hover:bg-slate-50 shrink-0"
            >
              <Settings2 className="h-4 w-4 text-slate-500" />
              <span>Filters {showMobileFilters ? '(Hide)' : '(Show)'}</span>
            </Button>

            <div className={cn(
              "grid gap-3 items-center",
              showMobileFilters ? "grid grid-cols-2 sm:grid-cols-3" : "hidden xl:grid xl:grid-cols-[150px_170px_170px_160px_auto] xl:justify-between"
            )}>
              <select value={kindFilter} onChange={event => setKindFilter(event.target.value as FilterKind)} className="h-10 rounded-lg border border-slate-200 bg-white px-3 text-xs font-bold outline-none focus:ring-2 focus:ring-emerald-500/20 w-full">
                <option value="all">All types</option>
                <option value="product">Products</option>
                <option value="service">Services</option>
              </select>
              <select value={categoryFilter} onChange={event => setCategoryFilter(event.target.value)} className="h-10 rounded-lg border border-slate-200 bg-white px-3 text-xs font-bold outline-none focus:ring-2 focus:ring-emerald-500/20 w-full">
                <option value="">All categories</option>
                {categories.map(category => <option key={category} value={category}>{category}</option>)}
              </select>
              <select value={statusFilter} onChange={event => setStatusFilter(event.target.value)} className="h-10 rounded-lg border border-slate-200 bg-white px-3 text-xs font-bold outline-none focus:ring-2 focus:ring-emerald-500/20 w-full">
                <option value="">All statuses</option>
                {statuses.map(status => <option key={status} value={status}>{status.replace(/_/g, ' ')}</option>)}
              </select>
              <select value={priceFilter} onChange={event => setPriceFilter(event.target.value)} className="h-10 rounded-lg border border-slate-200 bg-white px-3 text-xs font-bold outline-none focus:ring-2 focus:ring-emerald-500/20 w-full">
                <option value="">All prices</option>
                <option value="high">Above Rs. 10k</option>
                <option value="mid">Rs. 1k to 10k</option>
                <option value="low">Below Rs. 1k</option>
              </select>


            </div>
          </div>
        </CardContent>
      </Card>

      {filtered.length === 0 ? <EmptyState title="No marketplace items found matching filters" /> : (
        <>
          {viewMode === 'grid' ? (
            <div className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-3">
              {pagedItems.map((item, index) => (
                <CatalogueCard
                  key={`${item.itemKind}-${item.id}`}
                  item={item}
                  mode={mode}
                  viewMode={viewMode}
                  onEdit={openEditForm}
                  onDelete={deleteItem}
                  onViewDetails={setSelectedDetailsItem}
                  onPurchaseBid={openPurchaseBid}
                  onAddToCart={mode === 'buyer' ? handleAddToCart : undefined}
                  addingToCart={addingItemId === item.id}
                  canPurchase={buyerApproved}
                  onSellerClick={openSellerProfile}
                  actionState={buyerActions[`${item.itemKind}-${item.id}`]}
                  srNo={(page - 1) * pageSize + index + 1}
                />
              ))}
            </div>
          ) : (
            <div className="rounded-lg border border-slate-200 bg-white">
              <div className="relative overflow-x-auto">
                <table className="w-full min-w-[960px] table-auto text-left">
                  <thead className="bg-slate-50 border-b border-slate-200">
                    <tr className="text-[10px] font-black uppercase tracking-widest text-slate-500">
                      <th className="px-2 py-3 w-10 text-center">
                        <CatalogueSortHead label="Sr." field="sr" sortKey={sortKey} sortDirection={sortDirection} onToggle={(k) => { setSortKey(k); setSortDirection(prev => sortKey === k ? (prev === 'asc' ? 'desc' : 'asc') : 'asc'); }} />
                      </th>
                      <th className="px-2 py-3 w-14 text-center">Image</th>
                      <th className="px-3 py-3 min-w-[180px]">
                        <CatalogueSortHead label="Item" field="name" sortKey={sortKey} sortDirection={sortDirection} onToggle={(k) => { setSortKey(k); setSortDirection(prev => sortKey === k ? (prev === 'asc' ? 'desc' : 'asc') : 'asc'); }} />
                      </th>
                      <th className="px-2 py-3 w-20 whitespace-nowrap">
                        <CatalogueSortHead label="Type" field="kind" sortKey={sortKey} sortDirection={sortDirection} onToggle={(k) => { setSortKey(k); setSortDirection(prev => sortKey === k ? (prev === 'asc' ? 'desc' : 'asc') : 'asc'); }} />
                      </th>
                      <th className="px-2 py-3 w-24 whitespace-nowrap">
                        <CatalogueSortHead label="Category" field="category" sortKey={sortKey} sortDirection={sortDirection} onToggle={(k) => { setSortKey(k); setSortDirection(prev => sortKey === k ? (prev === 'asc' ? 'desc' : 'asc') : 'asc'); }} />
                      </th>
                      <th className="px-2 py-3 w-20 whitespace-nowrap">
                        <CatalogueSortHead label="HSN" field="hsn" sortKey={sortKey} sortDirection={sortDirection} onToggle={(k) => { setSortKey(k); setSortDirection(prev => sortKey === k ? (prev === 'asc' ? 'desc' : 'asc') : 'asc'); }} />
                      </th>
                      <th className="px-2 py-3 w-28 whitespace-nowrap">
                        <CatalogueSortHead label="Seller" field="seller" sortKey={sortKey} sortDirection={sortDirection} onToggle={(k) => { setSortKey(k); setSortDirection(prev => sortKey === k ? (prev === 'asc' ? 'desc' : 'asc') : 'asc'); }} />
                      </th>
                      <th className="px-2 py-3 w-24 text-right whitespace-nowrap">
                        <CatalogueSortHead label="Price" field="price" sortKey={sortKey} sortDirection={sortDirection} onToggle={(k) => { setSortKey(k); setSortDirection(prev => sortKey === k ? (prev === 'asc' ? 'desc' : 'asc') : 'asc'); }} align="right" />
                      </th>
                      <th className="px-2 py-3 w-24 whitespace-nowrap">
                        <CatalogueSortHead label="Status" field="status" sortKey={sortKey} sortDirection={sortDirection} onToggle={(k) => { setSortKey(k); setSortDirection(prev => sortKey === k ? (prev === 'asc' ? 'desc' : 'asc') : 'asc'); }} />
                      </th>
                      <th className="sticky right-0 z-10 bg-slate-50 px-2 py-3 w-[140px] min-w-[140px] text-right whitespace-nowrap shadow-[-6px_0_8px_-6px_rgba(15,23,42,0.12)]">Actions</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {pagedItems.map((item, index) => {
                      const value = cataloguePrice(item);
                      const status = item.status || 'DRAFT';
                      const imgId = getItemImageId(item);
                      const actionState = buyerActions[`${item.itemKind}-${item.id}`];
                      const buyerStatusLabel = actionState?.purchase
                        ? `Purchase ${String(actionState.purchase.status || 'requested').replace(/_/g, ' ')}`
                        : actionState?.rfq
                          ? `RFQ ${String(actionState.rfq.status || 'sent').replace(/_/g, ' ')}`
                          : '';
                      return (
                        <tr key={`${item.itemKind}-${item.id}`} className="group hover:bg-slate-50/50 transition-colors">
                          <td className="px-3 py-3 text-center text-xs font-black text-slate-400">
                            {String((page - 1) * pageSize + index + 1).padStart(2, '0')}
                          </td>
                          <td className="px-2 py-3 text-center">
                            <button
                              type="button"
                              onClick={() => setSelectedDetailsItem(item)}
                              className="inline-block h-10 w-10 rounded-md overflow-hidden border border-slate-200 bg-slate-50 hover:opacity-85 transition-opacity"
                              title="View details"
                            >
                              {imgId ? (
                                <img src={getCatalogueImageUrl(imgId)} alt={item.name} className="h-full w-full object-cover" />
                              ) : (
                                <div className={cn('flex h-full w-full items-center justify-center text-white', item.itemKind === 'product' ? 'bg-[#059669]' : 'bg-emerald-600')}>
                                  {item.itemKind === 'product' ? <PackageSearch className="h-4 w-4" /> : <Wrench className="h-4 w-4" />}
                                </div>
                              )}
                            </button>
                          </td>
                          <td className="px-3 py-3 align-top">
                            <div className="flex items-center gap-2 mb-0.5">
                              <EntityIdLink
                                label={`${item.itemKind === 'product' ? 'PRD' : 'SVC'}-${item.id}`}
                                id={item.id}
                                size="sm"
                                onClick={() => setSelectedDetailsItem(item)}
                              />
                            </div>
                            <button
                              type="button"
                              onClick={() => setSelectedDetailsItem(item)}
                              className="block text-left"
                            >
                              <p className="text-sm font-black text-neutral-900 hover:text-emerald-700 hover:underline text-wrap-anywhere leading-snug line-clamp-2">
                                {item.name}
                              </p>
                            </button>
                            <p className="mt-0.5 text-[11px] font-medium text-slate-500 line-clamp-1 text-wrap-anywhere">{item.description || 'No description'}</p>
                          </td>
                          <td className="px-3 py-3 align-top">
                            <span className="rounded bg-slate-100 px-2 py-0.5 text-[10px] font-black uppercase text-slate-700">
                              {item.itemKind}
                            </span>
                          </td>
                          <td className="px-3 py-3 align-top  ">
                            {item.category?.name ? (
                              <span className="rounded bg-emerald-50 px-2 py-0.5 text-[10px] font-black uppercase text-emerald-700 text-wrap-anywhere">
                                {item.category.name}
                              </span>
                            ) : (
                              <span className="text-[10px] font-bold text-slate-400">NA</span>
                            )}
                          </td>
                          <td className="px-3 py-3 align-top">
                            {item.hsnCode ? (
                              <span className="font-mono text-[11px] font-bold text-slate-700 text-wrap-anywhere">{item.hsnCode}</span>
                            ) : (
                              <span className="text-[10px] font-bold text-slate-400">NA</span>
                            )}
                          </td>
                          <td className="px-3 py-3 align-top">
                            {item.seller?.name ? (
                              mode === 'seller' ? (
                                <span className="text-xs font-bold text-slate-700 text-wrap-anywhere">{item.seller.name}</span>
                              ) : (
                                <button
                                  type="button"
                                  onClick={() => openSellerProfile(item.seller)}
                                  className="inline-flex items-start gap-1 text-xs font-bold text-slate-700 hover:text-[#059669] hover:underline text-wrap-anywhere text-left"
                                >
                                  <Store className="h-3 w-3 text-slate-400 shrink-0 mt-0.5" />
                                  <span className="text-wrap-anywhere">{item.seller.name}</span>
                                </button>
                              )
                            ) : (
                              <span className="text-[10px] font-bold text-slate-400">—</span>
                            )}
                          </td>
                          <td className="px-3 py-3 text-right whitespace-nowrap align-top">
                            <p className="text-sm font-black text-emerald-700">{formatCurrency(value)}</p>
                            {item.itemKind === 'product' && item.unitOfMeasure && (
                              <p className="text-[10px] font-bold text-slate-400">/{item.unitOfMeasure}</p>
                            )}
                            {item.itemKind === 'service' && item.pricingModel && (
                              <p className="text-[10px] font-bold text-slate-400">{item.pricingModel.replace(/_/g, ' ')}</p>
                            )}
                          </td>
                          <td className="px-3 py-3 align-top whitespace-nowrap min-w-[112px]">
                            <Badge variant={status === 'ACTIVE' ? 'success' : status === 'ARCHIVED' || status === 'INACTIVE' ? 'warning' : 'default'}>
                              {status.replace(/_/g, ' ')}
                            </Badge>
                            {buyerStatusLabel && (
                              <p className="mt-1 text-[9px] font-black uppercase tracking-wide text-emerald-700">{buyerStatusLabel}</p>
                            )}
                          </td>
                          <td className="sticky right-0 z-[5] bg-white group-hover:bg-slate-50 px-2 py-3 w-[140px] min-w-[140px] align-top text-right whitespace-nowrap shadow-[-6px_0_8px_-6px_rgba(15,23,42,0.12)]">
                            <div className="inline-flex items-center justify-end gap-1">
                              {mode === 'seller' && (
                                <>
                                  <button
                                    type="button"
                                    onClick={() => openEditForm(item)}
                                    disabled={status === 'ARCHIVED'}
                                    title="Edit item"
                                    aria-label="Edit"
                                    className="inline-flex h-8 w-8 items-center justify-center rounded-md border border-slate-200 text-emerald-700 hover:bg-emerald-50 disabled:opacity-50 disabled:cursor-not-allowed transition-colors shrink-0"
                                  >
                                    <Settings2 className="h-3.5 w-3.5" />
                                  </button>
                                  <button
                                    type="button"
                                    onClick={() => deleteItem(item)}
                                    title="Delete item"
                                    aria-label="Delete"
                                    className="inline-flex h-8 w-8 items-center justify-center rounded-md border border-slate-200 text-red-600 hover:bg-red-50 transition-colors shrink-0"
                                  >
                                    <Trash2 className="h-3.5 w-3.5" />
                                  </button>
                                </>
                              )}
                              {mode === 'admin' && (
                                <>
                                  <button
                                    type="button"
                                    onClick={() => setSelectedDetailsItem(item)}
                                    title="View details"
                                    aria-label="Details"
                                    className="inline-flex h-8 w-8 items-center justify-center rounded-md border border-slate-200 text-slate-700 hover:bg-slate-50 transition-colors shrink-0"
                                  >
                                    <Eye className="h-3.5 w-3.5" />
                                  </button>
                                  {item.seller && (
                                    <button
                                      type="button"
                                      onClick={() => openSellerProfile(item.seller)}
                                      title="View seller"
                                      aria-label="Seller"
                                      className="inline-flex h-8 w-8 items-center justify-center rounded-md border border-emerald-200 text-emerald-700 hover:bg-emerald-50 transition-colors shrink-0"
                                    >
                                      <Store className="h-3.5 w-3.5" />
                                    </button>
                                  )}
                                </>
                              )}
                              {mode === 'buyer' && (
                                <>
                                  <button
                                    type="button"
                                    onClick={() => setSelectedDetailsItem(item)}
                                    title="View details"
                                    aria-label="Details"
                                    className="inline-flex h-8 w-8 items-center justify-center rounded-md border border-slate-200 text-slate-700 hover:bg-slate-50 transition-colors shrink-0"
                                  >
                                    <Eye className="h-3.5 w-3.5" />
                                  </button>
                                  <button
                                    type="button"
                                    onClick={() => handleAddToCart(item)}
                                    disabled={!buyerApproved || addingItemId === item.id}
                                    title={buyerApproved ? 'Add to cart' : 'Approval required'}
                                    aria-label="Add to cart"
                                    className="inline-flex h-8 w-8 items-center justify-center rounded-md border border-[#12335f] text-[#12335f] hover:bg-[#12335f]/5 disabled:cursor-not-allowed disabled:opacity-50 transition-colors shrink-0"
                                  >
                                    {addingItemId === item.id ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <ShoppingCart className="h-3.5 w-3.5" />}
                                  </button>
                                  <button
                                    type="button"
                                    onClick={() => openPurchaseBid(item)}
                                    disabled={!buyerApproved}
                                    title={buyerApproved ? 'Purchase or request bid' : 'Approval required'}
                                    aria-label="Purchase"
                                    className="inline-flex h-8 w-8 items-center justify-center rounded-md bg-emerald-600 text-white hover:bg-emerald-700 disabled:cursor-not-allowed disabled:bg-slate-200 disabled:text-slate-500 transition-colors shrink-0"
                                  >
                                    <ShoppingCart className="h-3.5 w-3.5" />
                                  </button>
                                </>
                              )}
                            </div>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
              <Pagination page={page} pageSize={pageSize} total={total} onPageChange={setPage} onPageSizeChange={setPageSize} label="marketplace items" />
            </div>
          )}
          {viewMode === 'grid' && (
            <div className="overflow-hidden rounded-lg border border-slate-200 bg-white">
              <Pagination page={page} pageSize={pageSize} total={total} onPageChange={setPage} onPageSizeChange={setPageSize} label="marketplace items" />
            </div>
          )}
        </>
      )}

      {/* Modals rendering */}
      {selectedDetailsItem && (
        <ItemDetailsModal
          item={selectedDetailsItem}
          mode={mode}
          actionState={buyerActions[`${selectedDetailsItem.itemKind}-${selectedDetailsItem.id}`]}
          onSellerClick={openSellerProfile}
          onPurchaseBid={openPurchaseBid}
          canPurchase={buyerApproved}
          onPreviewDocument={setPreviewDocument}
          onClose={() => setSelectedDetailsItem(null)}
        />
      )}

      {selectedPurchaseItem && (
        <PurchaseBidModal
          item={selectedPurchaseItem}
          actionState={buyerActions[`${selectedPurchaseItem.itemKind}-${selectedPurchaseItem.id}`]}
          onActionCreated={updateBuyerAction}
          onClose={() => setSelectedPurchaseItem(null)}
        />
      )}

      {selectedSeller && (
        <SellerProfileModal
          seller={selectedSeller}
          loading={sellerLoading}
          onClose={() => setSelectedSeller(null)}
        />
      )}
      <DocumentPreviewModal previewDocument={previewDocument} onClose={() => setPreviewDocument(null)} />
    </div>
  );
}

function CatalogueForm({
  form,
  kind,
  saving,
  isEdit,
  categoryList,
  uploadedImages,
  uploadedDocuments,
  uploading,
  onFileUpload,
  onRemoveFile,
  onCancel,
  onSubmit,
  onChange,
  onPreviewDocument
}: {
  form: typeof blankForm;
  kind: ItemKind;
  saving: boolean;
  isEdit: boolean;
  categoryList: CategoryDto[];
  uploadedImages: any[];
  uploadedDocuments: any[];
  uploading: boolean;
  onFileUpload: (event: React.ChangeEvent<HTMLInputElement>, type: 'image' | 'document') => void;
  onRemoveFile: (id: number, type: 'image' | 'document') => void;
  onCancel: () => void;
  onSubmit: (event: FormEvent) => void;
  onChange: (field: keyof typeof blankForm, value: string) => void;
  onPreviewDocument: (preview: DocumentPreview) => void;
}) {
  return (
    <Card className="border-emerald-100 bg-emerald-50/15 shadow-sm transition-all focus-within:ring-2 focus-within:ring-emerald-500/10">
      <CardHeader className="flex flex-row items-center justify-between border-b border-slate-200 pb-3">
        <CardTitle className="text-sm font-black text-neutral-900 font-sans tracking-tight">
          {isEdit ? `Edit ${kind === 'product' ? 'Product' : 'Service'}` : `Add New ${kind === 'product' ? 'Product' : 'Service'}`}
        </CardTitle>
        <Badge className={kind === 'product' ? 'bg-[#059669] text-white hover:bg-[#059669]' : 'bg-emerald-600 text-white hover:bg-emerald-600'}>
          {kind}
        </Badge>
      </CardHeader>
      <CardContent className="pt-4">
        <form onSubmit={onSubmit} className="grid gap-3 lg:grid-cols-2">
          <Input label={`${kind === 'product' ? 'Product' : 'Service'} Name`} value={form.name} onChange={event => onChange('name', event.target.value)} required placeholder="e.g. Structural Steel Beams, IT Advisory Services" className="bg-white" />
          <Select label="Visibility Status" value={form.status} onChange={event => onChange('status', event.target.value)} className="bg-white">
            <option value="ACTIVE">Active</option>
            <option value="DRAFT">Draft</option>
            <option value="INACTIVE">Inactive</option>
          </Select>
          <Select label="Category" value={form.categoryId} onChange={event => onChange('categoryId', event.target.value)} className="bg-white">
            <option value="">Select Category</option>
            {categoryList.map(cat => <option key={cat.id} value={String(cat.id)}>{cat.name}</option>)}
          </Select>
          {kind === 'product' ? (
            <>
              <Input label="Price (INR)" type="number" min="0" value={form.price} onChange={event => onChange('price', event.target.value)} placeholder="0.00" className="bg-white" />
              <Select label="Unit Of Measure" value={form.unitOfMeasure} onChange={event => onChange('unitOfMeasure', event.target.value)} className="bg-white">
                <option value="">Select Unit</option>
                {QUANTITY_UNITS.map(u => <option key={u.value} value={u.value}>{u.label}</option>)}
              </Select>
              <Select label="Item Condition" value={form.itemCondition} onChange={event => onChange('itemCondition', event.target.value)} className="bg-white">
                <option value="">Select Condition</option>
                {ITEM_CONDITIONS.map(c => <option key={c.value} value={c.value}>{c.label}</option>)}
              </Select>
              <Input label="HSN Code" value={form.hsnCode} onChange={event => onChange('hsnCode', event.target.value)} placeholder="8-digit HSN code" className="bg-white" />
            </>
          ) : (
            <>
              <Input label="Base Price (INR)" type="number" min="0" value={form.basePrice} onChange={event => onChange('basePrice', event.target.value)} placeholder="0.00" className="bg-white" />
              <Select label="Pricing Model" value={form.pricingModel} onChange={event => onChange('pricingModel', event.target.value)} className="bg-white">
                <option value="FIXED">Fixed</option>
                <option value="HOURLY">Hourly</option>
                <option value="DAILY">Daily</option>
                <option value="MONTHLY">Monthly</option>
                <option value="PER_PROJECT">Per Project</option>
                <option value="CUSTOM">Custom</option>
              </Select>
              <Input label="Service Area" value={form.serviceArea} onChange={event => onChange('serviceArea', event.target.value)} placeholder="e.g. Delhi NCR, Pan-India" className="bg-white" />
            </>
          )}
          <div className="lg:col-span-2">
            <label className="mb-1.5 block text-xs font-bold uppercase tracking-wider text-slate-500">Description</label>
            <textarea value={form.description} onChange={event => onChange('description', event.target.value)} rows={3} placeholder="Provide descriptive details, technical specifications, and delivery terms..." className="w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-xs outline-none transition-all focus:border-emerald-400 focus:ring-2 focus:ring-emerald-500/20" />
          </div>

          <div className="lg:col-span-2 grid gap-4 sm:grid-cols-2 border-t border-slate-250/80 pt-3">
            {/* Image upload section */}
            <div className="space-y-2">
              <label className="block text-xs font-bold uppercase tracking-wider text-slate-500">
                Product/Service Images (Optional)
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
                              onPreviewDocument(await getFileAssetPreview({
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
                          onClick={() => onRemoveFile(img.id, 'image')}
                          className="p-1.5 rounded bg-red-955 hover:bg-red-900 transition-colors cursor-pointer"
                          title="Delete image"
                        >
                          <Trash2 className="h-3.5 w-3.5" />
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
              )}

              <label className="flex flex-col items-center justify-center border border-dashed border-slate-300 rounded-lg p-4 bg-white cursor-pointer hover:bg-slate-55 transition-colors">
                <Upload className="h-5 w-5 text-slate-400 mb-1" />
                <span className="text-[10px] font-bold text-slate-500">Click to Upload Image</span>
                <input
                  type="file"
                  accept="image/*"
                  multiple
                  disabled={uploading}
                  onChange={(e) => onFileUpload(e, 'image')}
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
                              onPreviewDocument(await getFileAssetPreview({
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
                          onClick={() => onRemoveFile(doc.id, 'document')}
                          className="text-red-500 hover:text-red-750 p-0.5 cursor-pointer"
                        >
                          <Trash2 className="h-3.5 w-3.5" />
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
              )}

              <label className="flex flex-col items-center justify-center border border-dashed border-slate-300 rounded-lg p-4 bg-white cursor-pointer hover:bg-slate-55 transition-colors">
                <FileUp className="h-5 w-5 text-slate-400 mb-1" />
                <span className="text-[10px] font-bold text-slate-500">Click to Upload Document</span>
                <input
                  type="file"
                  accept=".pdf,.doc,.docx,.xls,.xlsx,.csv"
                  multiple
                  disabled={uploading}
                  onChange={(e) => onFileUpload(e, 'document')}
                  className="hidden"
                />
              </label>
            </div>
          </div>

          {uploading && (
            <div className="lg:col-span-2 flex items-center justify-center gap-2 py-2 text-xs text-[#059669] font-bold bg-emerald-50 rounded-lg">
              <Loader2 className="h-4 w-4 animate-spin" />
              <span>Uploading catalogue assets...</span>
            </div>
          )}

          <div className="flex justify-end gap-2 border-t border-slate-200/80 pt-3 lg:col-span-2">
            <Button type="button" variant="outline" onClick={onCancel} className="h-9 rounded-lg text-xs font-black uppercase tracking-wider border-slate-200 text-slate-700 hover:bg-slate-50">Cancel</Button>
            <Button type="submit" disabled={saving || uploading} className={cn("h-9 rounded-lg text-xs font-black uppercase tracking-wider text-white", kind === 'product' ? 'bg-[#059669] hover:bg-emerald-800' : 'bg-emerald-600 hover:bg-emerald-700')}>
              <Plus className="mr-1.5 h-3.5 w-3.5" />{saving ? 'Saving...' : isEdit ? `Save Changes` : `Create ${kind}`}
            </Button>
          </div>
        </form>
      </CardContent>
    </Card>
  );
}

function CatalogueCard({ item, mode, viewMode = 'grid', actionState, canPurchase = true, onEdit, onDelete, onViewDetails, onPurchaseBid, onAddToCart, addingToCart, onSellerClick, srNo }: {
  item: CatalogueRecord;
  mode: CatalogueMode;
  viewMode?: 'grid' | 'list';
  actionState?: BuyerActionState;
  canPurchase?: boolean;
  onEdit?: (item: CatalogueRecord) => void;
  onDelete?: (item: CatalogueRecord) => void;
  onViewDetails?: (item: CatalogueRecord) => void;
  onPurchaseBid?: (item: CatalogueRecord) => void;
  onAddToCart?: (item: CatalogueRecord) => void;
  addingToCart?: boolean;
  onSellerClick?: (seller: CatalogueRecord['seller']) => void;
  srNo?: number;
}) {
  const value = cataloguePrice(item);
  const status = item.status || 'DRAFT';
  const statusVariant = status === 'ACTIVE' ? 'success' : status === 'ARCHIVED' || status === 'INACTIVE' ? 'warning' : 'default';
  const buyerStatusLabel = actionState?.purchase
    ? `Purchase ${String(actionState.purchase.status || 'requested').replace(/_/g, ' ')}`
    : actionState?.rfq
      ? `RFQ ${String(actionState.rfq.status || 'sent').replace(/_/g, ' ')}`
      : '';
  const previouslyUsedLabel = actionState?.purchase
    ? 'Already purchased/requested'
    : actionState?.rfq
      ? 'Already bid/RFQ sent'
      : '';
  const imgId = getItemImageId(item);

  if (viewMode === 'list') {
    return (
      <Card className="hover:shadow-md hover:border-slate-350 transition-all duration-200 bg-white border-slate-200/80 w-full">
        <CardContent className="p-4">
          <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
            <div className="flex items-start gap-4 min-w-0 flex-1">
              {srNo !== undefined && (
                <div className="flex flex-col items-center justify-center shrink-0 w-14 h-12 rounded-xl border border-slate-200 bg-slate-50 text-[10px] font-black uppercase tracking-wider text-slate-500 select-none">
                  <span className="text-[8px] font-bold text-slate-400">SR. NO.</span>
                  <span className="text-sm font-black text-slate-700 leading-none mt-0.5">{srNo}</span>
                </div>
              )}
              {imgId ? (
                <div
                  onClick={() => onViewDetails?.(item)}
                  className="h-12 w-12 shrink-0 rounded-xl overflow-hidden border border-slate-200 bg-slate-50 cursor-pointer hover:opacity-85 transition-opacity"
                  title="Click to view details"
                >
                  <img src={getCatalogueImageUrl(imgId)} alt={item.name} className="h-full w-full object-cover" />
                </div>
              ) : (
                <div className={cn('flex h-12 w-12 shrink-0 items-center justify-center rounded-xl text-white shadow-sm', item.itemKind === 'product' ? 'bg-[#059669]' : 'bg-emerald-600')}>
                  {item.itemKind === 'product' ? <PackageSearch className="h-6 w-6" /> : <Wrench className="h-6 w-6" />}
                </div>
              )}
              <div className="min-w-0 flex-1">
                <div className="flex flex-wrap items-center gap-2">
                  <EntityIdLink
                    label={`${item.itemKind === 'product' ? 'PRD' : 'SVC'}-${item.id}`}
                    id={item.id}
                    size="sm"
                    onClick={() => onViewDetails?.(item)}
                  />
                  <h3
                    onClick={() => onViewDetails?.(item)}
                    className="break-words text-sm font-black text-neutral-900 leading-snug cursor-pointer hover:text-emerald-700 hover:underline"
                    title="Click to view details"
                  >
                    {item.name}
                  </h3>
                  <Badge variant={statusVariant}>{status.replace(/_/g, ' ')}</Badge>
                  <span className="rounded bg-slate-100 px-2 py-0.5 text-[9px] font-black uppercase text-slate-600">{item.itemKind}</span>
                  {item.category?.name && <span className="rounded bg-emerald-50 px-2 py-0.5 text-[9px] font-black uppercase text-emerald-700">{item.category.name}</span>}
                  {mode === 'buyer' && previouslyUsedLabel && (
                    <span className="rounded-full border border-amber-200 bg-amber-50 px-2 py-0.5 text-[9px] font-black uppercase tracking-wide text-amber-700">
                      {previouslyUsedLabel}
                    </span>
                  )}
                </div>
                <p className="mt-1 line-clamp-1 text-xs font-semibold text-slate-500 leading-relaxed">{item.description || 'No description provided'}</p>

                {/* Info details */}
                <div className="mt-2 flex flex-wrap items-center gap-x-4 gap-y-1 text-[11px] font-bold text-slate-400">
                  {mode === 'seller' ? (
                    <span>Created: {item.createdAt ? new Date(item.createdAt).toLocaleDateString() : 'N/A'}</span>
                  ) : item.seller?.name ? (
                    <button type="button" onClick={() => onSellerClick?.(item.seller)} className="flex items-center gap-1 text-slate-600 font-semibold hover:text-[#059669]">
                      <Store className="h-3.5 w-3.5 shrink-0 text-slate-400" />
                      {item.seller.name}
                    </button>
                  ) : null}
                  {item.itemKind === 'product' && item.unitOfMeasure && (
                    <span>UOM: {item.unitOfMeasure}</span>
                  )}
                  {item.itemKind === 'product' && item.itemCondition && (
                    <span className="bg-slate-100 text-slate-700 px-1.5 py-0.5 rounded text-[10px] uppercase font-black tracking-wider">
                      {item.itemCondition.replace(/_/g, ' ')}
                    </span>
                  )}
                  {item.itemKind === 'service' && item.pricingModel && (
                    <span>Model: {item.pricingModel.replace(/_/g, ' ')}</span>
                  )}
                </div>
              </div>
            </div>

            <div className="flex flex-row md:flex-col items-center md:items-end justify-between md:justify-center gap-3 shrink-0 border-t md:border-t-0 border-slate-100 pt-3 md:pt-0">
              <div className="text-right">
                <p className="text-sm font-black text-emerald-700 bg-emerald-50/50 border border-emerald-100 px-2.5 py-1 rounded inline-block">{formatCurrency(value)}</p>
                {buyerStatusLabel && <p className="mt-1 text-[10px] font-black uppercase tracking-wide text-emerald-700">{buyerStatusLabel}</p>}
              </div>

              {/* Actions */}
              <div className="flex items-center gap-1.5">
                {mode === 'seller' && onEdit && onDelete && (
                  <>
                    <button
                      type="button"
                      onClick={() => onEdit(item)}
                      disabled={status === 'ARCHIVED'}
                      className="rounded px-2.5 py-1 text-[10px] font-black uppercase tracking-wider text-emerald-600 hover:bg-emerald-50 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
                    >
                      Edit
                    </button>
                    <button
                      type="button"
                      onClick={() => onDelete(item)}
                      className="rounded px-2.5 py-1 text-[10px] font-black uppercase tracking-wider text-red-600 hover:bg-red-50 transition-colors"
                    >
                      Delete
                    </button>
                  </>
                )}
                {mode === 'admin' && (
                  <>
                    <Button
                      type="button"
                      variant="outline"
                      onClick={() => onViewDetails?.(item)}
                      className="h-8 px-3 rounded-lg text-[10px] font-black uppercase tracking-wider border-slate-200 text-slate-700 hover:bg-slate-50"
                    >
                      <Eye className="mr-1 h-3 w-3 text-slate-400" />
                      View Details
                    </Button>
                    {item.seller && (
                      <Button
                        type="button"
                        variant="outline"
                        onClick={() => onSellerClick?.(item.seller)}
                        className="h-8 px-3 rounded-lg text-[10px] font-black uppercase tracking-wider border-emerald-200 text-emerald-700 hover:bg-emerald-50"
                      >
                        <Store className="mr-1 h-3 w-3" />
                        Seller
                      </Button>
                    )}
                  </>
                )}
                {mode === 'buyer' && (
                  <>
                    <Button
                      type="button"
                      variant="outline"
                      onClick={() => onViewDetails?.(item)}
                      className="h-8 px-3 rounded-lg text-[10px] font-black uppercase tracking-wider border-slate-200 text-slate-700 hover:bg-slate-50"
                    >
                      <Eye className="mr-1 h-3 w-3 text-slate-400" />
                      Details
                    </Button>
                    {onAddToCart && (
                      <Button
                        type="button"
                        variant="outline"
                        onClick={() => onAddToCart(item)}
                        disabled={!canPurchase || !!addingToCart}
                        title={canPurchase ? 'Add to organisation cart' : 'Approval required'}
                        className="h-8 px-3 rounded-lg text-[10px] font-black uppercase tracking-wider border-[#12335f] text-[#12335f] hover:bg-[#12335f]/5 disabled:cursor-not-allowed disabled:opacity-50"
                      >
                        <ShoppingCart className="mr-1 h-3 w-3" />
                        {addingToCart ? 'Adding...' : 'Add to Cart'}
                      </Button>
                    )}
                    <Button
                      type="button"
                      onClick={() => onPurchaseBid?.(item)}
                      disabled={!canPurchase}
                      title={canPurchase ? 'Purchase or request bid' : 'Admin approval required before procurement actions'}
                      className="h-8 px-3 rounded-lg text-[10px] font-black uppercase tracking-wider bg-emerald-600 hover:bg-emerald-700 text-white disabled:cursor-not-allowed disabled:bg-slate-200 disabled:text-slate-500"
                    >
                      <ShoppingCart className="mr-1 h-3 w-3" />
                      {canPurchase ? 'Purchase / Bid' : 'Approval Required'}
                    </Button>
                  </>
                )}
              </div>
            </div>
          </div>
        </CardContent>
      </Card>
    );
  }

  // Grid layout (default)
  return (
    <Card className="hover:shadow-md hover:border-slate-300 transition-all duration-200 bg-white border-slate-200/80">
      <CardContent className="p-4 flex flex-col h-full justify-between">
        <div>
          <div className="flex items-start gap-3">
            {imgId ? (
              <div
                onClick={() => onViewDetails?.(item)}
                className="h-10 w-10 shrink-0 rounded-lg overflow-hidden border border-slate-200 bg-slate-50 cursor-pointer hover:opacity-85 transition-opacity"
                title="Click to view details"
              >
                <img src={getCatalogueImageUrl(imgId)} alt={item.name} className="h-full w-full object-cover" />
              </div>
            ) : (
              <div className={cn('flex h-10 w-10 shrink-0 items-center justify-center rounded-lg text-white shadow-sm', item.itemKind === 'product' ? 'bg-[#059669]' : 'bg-emerald-600')}>
                {item.itemKind === 'product' ? <PackageSearch className="h-5 w-5" /> : <Wrench className="h-5 w-5" />}
              </div>
            )}
            <div className="min-w-0 flex-1">
              <div className="flex flex-wrap items-start justify-between gap-2">
                {srNo !== undefined && (
                  <span className="rounded border border-slate-200 bg-slate-50 px-2 py-0.5 text-[10px] font-black uppercase tracking-wide text-slate-500">
                    Sr. No. {srNo}
                  </span>
                )}
                <EntityIdLink
                  label={`${item.itemKind === 'product' ? 'PRD' : 'SVC'}-${item.id}`}
                  id={item.id}
                  size="sm"
                  onClick={() => onViewDetails?.(item)}
                />
                <h3
                  onClick={() => onViewDetails?.(item)}
                  className="break-words text-sm font-black text-neutral-900 leading-snug cursor-pointer hover:text-emerald-700 hover:underline"
                  title="Click to view details"
                >
                  {item.name}
                </h3>
                <Badge variant={statusVariant}>{status.replace(/_/g, ' ')}</Badge>
              </div>
              <p className="mt-1 line-clamp-2 text-xs font-semibold text-slate-500 leading-relaxed">{item.description || 'No description provided'}</p>
              <div className="mt-3 flex flex-wrap items-center gap-1.5">
                <p className="text-xs font-black text-emerald-700 bg-emerald-50/50 border border-emerald-100 px-2 py-0.5 rounded">{formatCurrency(value)}</p>
                <span className="rounded bg-slate-100 px-2 py-0.5 text-[9px] font-black uppercase text-slate-600">{item.itemKind}</span>
                {item.category?.name && <span className="rounded bg-emerald-50 px-2 py-0.5 text-[9px] font-black uppercase text-emerald-700">{item.category.name}</span>}
                {item.itemKind === 'service' && item.pricingModel && <span className="rounded bg-emerald-50 px-2 py-0.5 text-[9px] font-black uppercase text-emerald-700">{item.pricingModel.replace(/_/g, ' ')}</span>}
                {mode === 'buyer' && previouslyUsedLabel && (
                  <span className="rounded-full border border-amber-200 bg-amber-50 px-2 py-0.5 text-[9px] font-black uppercase tracking-wide text-amber-700">
                    {previouslyUsedLabel}
                  </span>
                )}
              </div>
            </div>
          </div>
        </div>

        <div>
          {/* Metadata & Actions section */}
          <div className="mt-3 flex items-center justify-between border-t border-slate-100 pt-3 text-[11px] font-bold text-slate-500">
            {mode === 'seller' ? (
              <div className="flex items-center gap-1">
                <span className="text-[10px] text-slate-400">Created: {item.createdAt ? new Date(item.createdAt).toLocaleDateString() : 'N/A'}</span>
              </div>
            ) : item.seller?.name ? (
              <div className="flex items-center gap-1.5 min-w-0">
                <Store className="h-3.5 w-3.5 text-slate-400 shrink-0" />
                <button type="button" onClick={() => onSellerClick?.(item.seller)} className="truncate text-slate-700 font-semibold hover:text-[#059669]">{item.seller.name}</button>
              </div>
            ) : <div />}

            {mode === 'buyer' && buyerStatusLabel && (
              <span className="rounded-full border border-emerald-200 bg-emerald-50 px-2 py-0.5 text-[9px] font-black uppercase tracking-wide text-emerald-700">
                {buyerStatusLabel}
              </span>
            )}

            {mode === 'seller' && onEdit && onDelete && (
              <div className="flex items-center gap-1">
                <button
                  type="button"
                  onClick={() => onEdit(item)}
                  disabled={status === 'ARCHIVED'}
                  className="rounded px-2.5 py-1 text-[10px] font-black uppercase tracking-wider text-emerald-600 hover:bg-emerald-50 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
                >
                  Edit
                </button>
                <button
                  type="button"
                  onClick={() => onDelete(item)}
                  className="rounded px-2.5 py-1 text-[10px] font-black uppercase tracking-wider text-red-600 hover:bg-red-50 transition-colors"
                >
                  Delete
                </button>
              </div>
            )}
          </div>

          {mode === 'admin' && (
            <div className="mt-3 grid gap-1.5 border-t border-slate-100 pt-3 grid-cols-2">
              <Button
                type="button"
                variant="outline"
                onClick={() => onViewDetails?.(item)}
                className="h-8 rounded-lg text-[9px] sm:text-xs font-black uppercase tracking-wider border-slate-200 text-slate-700 hover:bg-slate-50"
              >
                <Eye className="mr-1 h-3 w-3 text-slate-400" />
                <span>Details</span>
              </Button>
              <Button
                type="button"
                variant="outline"
                disabled={!item.seller}
                onClick={() => item.seller && onSellerClick?.(item.seller)}
                className="h-8 rounded-lg text-[9px] sm:text-xs font-black uppercase tracking-wider border-emerald-200 text-emerald-700 hover:bg-emerald-50 disabled:cursor-not-allowed disabled:opacity-50"
              >
                <Store className="mr-1 h-3 w-3" />
                <span>Seller</span>
              </Button>
            </div>
          )}
          {mode === 'buyer' && (
            <div className="mt-3 flex gap-1.5 border-t border-slate-100 pt-3">
              <Button
                type="button"
                variant="outline"
                onClick={() => onViewDetails?.(item)}
                className="flex-1 h-8 rounded-lg text-[9px] sm:text-xs font-black uppercase tracking-wider border-slate-200 text-slate-700 hover:bg-slate-50"
              >
                <Eye className="mr-1 h-3 w-3 text-slate-400" />
                <span>Details</span>
              </Button>
              <Button
                type="button"
                onClick={() => onPurchaseBid?.(item)}
                disabled={!canPurchase}
                title={canPurchase ? 'Purchase or request bid' : 'Admin approval required before procurement actions'}
                className="flex-1 h-8 rounded-lg text-[9px] sm:text-xs font-black uppercase tracking-wider bg-emerald-600 hover:bg-emerald-700 text-white disabled:cursor-not-allowed disabled:bg-slate-200 disabled:text-slate-500"
              >
                <ShoppingCart className="mr-1 h-3 w-3" />
                <span>{canPurchase ? 'Buy/Bid' : 'Locked'}</span>
              </Button>
            </div>
          )}
        </div>
      </CardContent>
    </Card>
  );
}

function Metric({ label, value, icon: Icon }: { label: string; value: string | number; icon: any }) {
  return (
    <Card className="border-slate-200/80 shadow-sm bg-white hover:border-emerald-100 transition-all duration-200">
      <CardContent className="flex items-center justify-between p-4">
        <div>
          <p className="text-[10px] font-black uppercase tracking-widest text-slate-500">{label}</p>
          <p className="mt-1 text-lg font-black text-neutral-900">{value}</p>
        </div>
        <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-emerald-50 text-emerald-600 shadow-sm">
          <Icon className="h-5 w-5" />
        </div>
      </CardContent>
    </Card>
  );
}

/**
 * Sort header used in the marketplace table view. Toggles between ascending,
 * descending, and unsorted states for the column it represents.
 */
function CatalogueSortHead({
  label,
  field,
  sortKey,
  sortDirection,
  onToggle,
  align = 'left'
}: {
  label: string;
  field: 'sr' | 'name' | 'kind' | 'category' | 'seller' | 'price' | 'status' | 'hsn';
  sortKey: string;
  sortDirection: 'asc' | 'desc';
  onToggle: (field: any) => void;
  align?: 'left' | 'right' | 'center';
}) {
  const active = sortKey === field;
  return (
    <button
      type="button"
      onClick={() => onToggle(field)}
      className={cn(
        'inline-flex items-center gap-1 text-[10px] font-black uppercase tracking-widest hover:text-emerald-700 transition-colors',
        active ? 'text-[#12335f]' : 'text-slate-500',
        align === 'right' && 'justify-end w-full',
        align === 'center' && 'justify-center w-full'
      )}
    >
      {label}
      {active ? (
        sortDirection === 'asc' ? <ArrowUp className="h-3 w-3" /> : <ArrowDown className="h-3 w-3" />
      ) : (
        <ArrowUpDown className="h-3 w-3 opacity-40" />
      )}
    </button>
  );
}

function ItemDetailsModal({ item, mode, actionState, canPurchase = true, onSellerClick, onPurchaseBid, onPreviewDocument, onClose }: {
  item: CatalogueRecord;
  mode: CatalogueMode;
  actionState?: BuyerActionState;
  canPurchase?: boolean;
  onSellerClick: (seller: CatalogueRecord['seller']) => void;
  onPurchaseBid: (item: CatalogueRecord) => void;
  onPreviewDocument: (preview: DocumentPreview) => void;
  onClose: () => void;
}) {
  const value = cataloguePrice(item);
  const media = catalogueMedia(item);
  const photos = media.filter(file => file.kind === 'image');
  const documents = media.filter(file => file.kind === 'document');
  const firstPhotoId = photos[0]?.fileId || getItemImageId(item);
  const [activePhotoId, setActivePhotoId] = useState<number | null>(firstPhotoId || null);
  const buyerStatusLabel = actionState?.purchase
    ? `Direct purchase ${String(actionState.purchase.status || 'requested').replace(/_/g, ' ')}`
    : actionState?.rfq
      ? `RFQ ${String(actionState.rfq.status || 'sent').replace(/_/g, ' ')}`
      : '';
  const handleOpenDocument = async (document: { fileId?: number; label: string; originalName?: string; mimeType?: string }) => {
    try {
      onPreviewDocument(await getFileAssetPreview({
        fileId: document.fileId,
        originalName: document.originalName || document.label,
        mimeType: document.mimeType
      }, document.label));
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Unable to open document');
    }
  };

  const activePhoto = photos.find(photo => photo.fileId === activePhotoId) || photos[0];
  const hasPrice = value > 0;
  const metaTiles = item.itemKind === 'product'
    ? [
      { label: 'Price', value: hasPrice ? formatCurrency(value) : 'Price on request', tone: 'value' },
      { label: 'Unit of Measure', value: item.unitOfMeasure || 'Not specified' },
      { label: 'HSN Code', value: item.hsnCode || 'Not specified' },
      { label: 'Condition', value: item.itemCondition ? item.itemCondition.replace(/_/g, ' ') : 'Not specified' }
    ]
    : [
      { label: 'Base Price', value: hasPrice ? formatCurrency(value) : 'Price on request', tone: 'value' },
      { label: 'Pricing Model', value: item.pricingModel ? item.pricingModel.replace(/_/g, ' ') : 'Not specified' },
      { label: 'Service Area', value: item.serviceArea || 'Not specified' },
      { label: 'Category', value: item.category?.name || 'Not specified' }
    ];

  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center bg-slate-950/65 p-0 backdrop-blur-sm sm:items-center sm:p-4">
      <div className="flex h-full w-full flex-col overflow-hidden bg-white shadow-2xl animate-in fade-in zoom-in-95 duration-200 sm:h-auto sm:max-h-[92vh] sm:max-w-5xl sm:rounded-2xl sm:border sm:border-slate-200">
        <div className="sticky top-0 z-10 flex items-center justify-between gap-3 border-b border-slate-200 bg-white px-4 py-3 sm:px-5">
          <div className="flex min-w-0 items-center gap-3">
            <span className={cn('flex h-10 w-10 shrink-0 items-center justify-center rounded-xl text-white shadow-sm', item.itemKind === 'product' ? 'bg-[#059669]' : 'bg-emerald-600')}>
              {item.itemKind === 'product' ? <PackageSearch className="h-5 w-5" /> : <Wrench className="h-5 w-5" />}
            </span>
            <div className="min-w-0">
              <p className="text-[10px] font-black uppercase tracking-[0.18em] text-[#059669]">{item.itemKind} Details</p>
              <h2 className="truncate text-base font-black leading-tight text-neutral-950 sm:text-lg">{item.name}</h2>
            </div>
          </div>
          <button onClick={onClose} className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl border border-slate-200 text-slate-500 transition-all hover:bg-slate-50 hover:text-slate-900">
            <X className="h-5 w-5" />
          </button>
        </div>

        <div className="min-h-0 flex-1 overflow-y-auto">
          <div className="grid gap-0 lg:grid-cols-[minmax(0,1.05fr)_minmax(360px,0.95fr)]">
            <div className="border-b border-slate-200 bg-slate-50 p-4 sm:p-5 lg:border-b-0 lg:border-r">
              <div className="overflow-hidden rounded-2xl border border-slate-200 bg-white">
                <button
                  type="button"
                  disabled={!activePhoto?.fileId}
                  onClick={async () => {
                    if (!activePhoto?.fileId) return;
                    try {
                      onPreviewDocument(await getFileAssetPreview({
                        id: activePhoto.fileId,
                        fileId: activePhoto.fileId,
                        url: getCatalogueImageUrl(activePhoto.fileId),
                        originalName: activePhoto.originalName || activePhoto.label || item.name,
                        mimeType: activePhoto.mimeType || 'image/png'
                      }, activePhoto.label || item.name));
                    } catch (err) {
                      toast.error(err instanceof Error ? err.message : 'Unable to view image');
                    }
                  }}
                  className="flex aspect-[4/3] w-full items-center justify-center bg-slate-100 text-slate-400 sm:aspect-[16/10] lg:aspect-[4/3]"
                  title={activePhoto?.fileId ? 'View uploaded image' : undefined}
                >
                  {activePhoto?.fileId ? (
                    <img src={getCatalogueImageUrl(activePhoto.fileId)} alt={activePhoto.label || item.name} className="h-full w-full object-contain" />
                  ) : (
                    <span className="flex flex-col items-center gap-2 text-xs font-bold text-slate-500">
                      <ImageIcon className="h-8 w-8" />
                      No product image uploaded
                    </span>
                  )}
                </button>
              </div>

              {photos.length > 0 && (
                <div className="mt-3">
                  <div className="mb-2 flex items-center justify-between">
                    <h4 className="text-[10px] font-black uppercase tracking-widest text-slate-500">Photos</h4>
                    <span className="text-[10px] font-bold text-slate-500">{photos.length} uploaded</span>
                  </div>
                  <div className="grid grid-cols-4 gap-2 sm:grid-cols-6 lg:grid-cols-5">
                    {photos.map((photo, index) => (
                      <button
                        key={photo.fileId || index}
                        type="button"
                        onClick={() => setActivePhotoId(photo.fileId || null)}
                        className={cn(
                          'relative aspect-square overflow-hidden rounded-xl border bg-white transition-all',
                          activePhotoId === photo.fileId ? 'border-emerald-500 ring-2 ring-emerald-500/20' : 'border-slate-200 hover:border-emerald-200'
                        )}
                        title={photo.label}
                      >
                        {photo.fileId ? (
                          <img src={getCatalogueImageUrl(photo.fileId)} alt={photo.label} className="h-full w-full object-cover" />
                        ) : (
                          <span className="flex h-full w-full items-center justify-center text-slate-400">
                            <ImageIcon className="h-4 w-4" />
                          </span>
                        )}
                      </button>
                    ))}
                  </div>
                </div>
              )}
            </div>

            <div className="space-y-5 p-4 sm:p-5">
              <div>
                <div className="flex flex-wrap gap-1.5">
                  <Badge variant="success">{item.status || 'ACTIVE'}</Badge>
                  <span className="rounded bg-slate-100 px-2 py-0.5 text-[9px] font-black uppercase text-slate-600">{item.itemKind}</span>
                  {item.category?.name && <span className="rounded bg-emerald-50 px-2 py-0.5 text-[9px] font-black uppercase text-emerald-700">{item.category.name}</span>}
                  {buyerStatusLabel && <span className="rounded bg-amber-50 px-2 py-0.5 text-[9px] font-black uppercase text-amber-700">{buyerStatusLabel}</span>}
                </div>
                <h3 className="mt-3 break-words text-xl font-black leading-tight text-neutral-950 sm:text-2xl">{item.name}</h3>
              </div>

              <section className="rounded-xl border border-slate-200 bg-white p-4">
                <h4 className="text-[10px] font-black uppercase tracking-widest text-slate-400">Description</h4>
                <p className="mt-2 break-words text-sm font-semibold leading-6 text-slate-600 whitespace-pre-wrap">
                  {item.description || 'No description provided.'}
                </p>
              </section>

              <section className="grid grid-cols-2 gap-2">
                {metaTiles.map(tile => (
                  <div key={tile.label} className="min-h-[72px] rounded-xl border border-slate-200 bg-white p-3">
                    <p className="text-[9px] font-black uppercase tracking-widest text-slate-400">{tile.label}</p>
                    <p className={cn('mt-1 break-words text-sm font-black text-slate-800', tile.tone === 'value' && 'text-base text-emerald-800')}>
                      {tile.value}
                    </p>
                  </div>
                ))}
              </section>

              <section className="rounded-xl border border-slate-200 bg-white p-4">
                <div className="flex items-center justify-between gap-3">
                  <h4 className="text-[10px] font-black uppercase tracking-widest text-slate-400">Documents</h4>
                  <span className="text-[10px] font-bold text-slate-500">{documents.length} files</span>
                </div>
                {documents.length > 0 ? (
                  <div className="mt-3 space-y-2">
                    {documents.map(document => (
                      <div key={document.fileId} className="flex items-center justify-between gap-3 rounded-xl border border-slate-200 bg-slate-50 px-3 py-2.5">
                        <div className="flex min-w-0 items-center gap-2">
                          <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-emerald-50 text-[#059669]">
                            <FileText className="h-4 w-4" />
                          </span>
                          <div className="min-w-0">
                            <p className="truncate text-xs font-black text-neutral-900">{document.label}</p>
                            <p className="truncate text-[10px] font-semibold text-slate-500">{document.mimeType || 'Uploaded file'}</p>
                          </div>
                        </div>
                        <button
                          type="button"
                          onClick={() => handleOpenDocument(document)}
                          className="flex h-8 shrink-0 items-center rounded-lg border border-emerald-200 bg-white px-3 text-[10px] font-black uppercase tracking-wider text-[#059669] hover:bg-emerald-50"
                        >
                          View
                        </button>
                      </div>
                    ))}
                  </div>
                ) : (
                  <p className="mt-3 rounded-xl border border-dashed border-slate-200 bg-slate-50 px-3 py-3 text-xs font-semibold text-slate-500">
                    No documents uploaded for this {item.itemKind}.
                  </p>
                )}
              </section>

              {item.seller && (
                <section className="rounded-xl border border-slate-200 bg-slate-50 p-4">
                  <h4 className="text-[10px] font-black uppercase tracking-widest text-slate-400">Seller Information</h4>
                  <div className="mt-3 flex items-center gap-3">
                    <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-emerald-100 text-[#059669]">
                      <Store className="h-5 w-5" />
                    </span>
                    <div className="min-w-0 flex-1">
                      <button
                        type="button"
                        onClick={() => onSellerClick?.(item.seller)}
                        className="block truncate text-left text-sm font-black text-[#059669] transition-colors hover:text-neutral-900 hover:underline"
                        title="Click to view seller profile"
                      >
                        {item.seller.name || 'Seller'}
                      </button>
                      <p className="truncate text-xs font-semibold text-slate-500">{item.seller.email || 'Email not available'}</p>
                    </div>
                  </div>
                </section>
              )}
            </div>
          </div>
        </div>

        <div className="sticky bottom-0 z-10 border-t border-slate-200 bg-white/95 px-4 py-3 backdrop-blur sm:px-5">
          <div className="flex flex-col gap-2 sm:flex-row sm:justify-end">
            {item.seller && mode !== 'buyer' && (
              <Button variant="outline" onClick={() => onSellerClick?.(item.seller)} className="h-10 rounded-xl border-emerald-200 text-xs font-black uppercase tracking-wider text-emerald-700 hover:bg-emerald-50">
                <Store className="mr-2 h-4 w-4" />
                Open Seller Profile
              </Button>
            )}
            {mode === 'buyer' && (
              <Button
                onClick={() => onPurchaseBid(item)}
                disabled={!canPurchase}
                title={canPurchase ? 'Purchase or request bid' : 'Admin approval required before procurement actions'}
                className="h-10 rounded-xl bg-emerald-600 px-5 text-xs font-black uppercase tracking-wider text-white hover:bg-emerald-700 disabled:cursor-not-allowed disabled:bg-slate-200 disabled:text-slate-500"
              >
                <ShoppingCart className="mr-2 h-4 w-4" />
                {canPurchase ? (buyerStatusLabel ? 'Create Another Request' : 'Purchase / Bid') : 'Approval Required'}
              </Button>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

function PurchaseBidModal({ item, actionState, onActionCreated, onClose }: {
  item: CatalogueRecord;
  actionState?: BuyerActionState;
  onActionCreated: (item: CatalogueRecord, action: BuyerActionState) => void;
  onClose: () => void;
}) {
  const [activeTab, setActiveTab] = useState<'purchase' | 'bid'>('purchase');
  const [quantity, setQuantity] = useState<number>(1);
  const [subject, setSubject] = useState<string>(`RFQ for ${item.name}`);
  const [message, setMessage] = useState<string>(
    `Dear ${item.seller?.name || 'Seller'},\n\nWe are highly interested in your ${item.itemKind} "${item.name}".\n\nPlease provide your best custom quote, delivery timeline, and warranty terms for this item.\n\nThanks,\nBuyer Team`
  );
  const [docUrl, setDocUrl] = useState<string>('');
  const [estimatedValue, setEstimatedValue] = useState<number | ''>('');
  const [submitting, setSubmitting] = useState(false);
  const [isUploadingDoc, setIsUploadingDoc] = useState(false);

  const handleUploadQuoteDoc = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setIsUploadingDoc(true);
    try {
      const optimizedFile = await compressImage(file);
      const formData = new FormData();
      formData.append('file', optimizedFile);
      const res = await api.fetch('/api/upload', {
        method: 'POST',
        headers: { Authorization: `Bearer ${localStorage.getItem('token')}` },
        body: formData
      });
      if (res.ok) {
        const data = await res.json();
        setDocUrl(data?.data?.url || data?.url || '');
        toast.success('Document attached successfully');
      } else {
        toast.error('Upload failed. Please try again.');
      }
    } catch {
      toast.error('Upload error. Please try again.');
    } finally {
      setIsUploadingDoc(false);
    }
  };

  const price = cataloguePrice(item);
  const totalAmount = price * quantity;

  const handleDirectPurchase = async (e: FormEvent) => {
    e.preventDefault();
    setSubmitting(true);
    try {
      // First create a requirement for the direct purchase to uniquely link to this product/service
      const requirement = await postApi('/api/buyer/requirements', {
        title: `Direct Purchase: ${item.name}`,
        description: item.description || `Direct purchase request for ${item.name}`,
        estimatedValue: totalAmount,
        procurementMethod: 'DIRECT_PURCHASE',
        items: [{
          productId: item.itemKind === 'product' ? item.id : undefined,
          itemName: item.name,
          description: item.description || '',
          quantity: quantity,
          unitOfMeasure: item.unitOfMeasure || 'units',
          estimatedUnitPrice: price
        }]
      });

      const directPurchase = await postApi('/api/direct-purchases', {
        sellerId: Number(item.sellerId),
        requirementId: (requirement as any)?.id,
        totalAmount
      });

      onActionCreated(item, {
        purchase: {
          id: (directPurchase as any)?.id,
          status: (directPurchase as any)?.status || 'REQUESTED',
          purchaseNumber: (directPurchase as any)?.purchaseNumber
        }
      });
      toast.success('Direct purchase request submitted successfully! Go to Buyer Hub > Direct Purchase to view.');
      onClose();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Failed to submit direct purchase request');
    } finally {
      setSubmitting(false);
    }
  };

  const handleRequestQuote = async (e: FormEvent) => {
    e.preventDefault();
    if (!subject.trim() || !message.trim()) {
      toast.error('Subject and message are required.');
      return;
    }
    setSubmitting(true);
    try {
      const quote = await postApi('/api/quote-requests', {
        sellerId: Number(item.sellerId),
        subject: subject.trim(),
        message: message.trim(),
        documentUrl: docUrl.trim() || undefined,
        estimatedValue: estimatedValue !== '' ? Number(estimatedValue) : undefined
      });
      onActionCreated(item, {
        rfq: {
          id: (quote as any)?.id,
          status: (quote as any)?.status || (quote as any)?.statusEnum || 'sent',
          subject: (quote as any)?.subject || subject.trim()
        }
      });
      toast.success('RFQ submitted successfully! Go to Buyer Hub > RFQ to track bids.');
      onClose();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Failed to submit quote request');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-sm z-50 flex items-center justify-center p-4 overflow-y-auto">
      <div className="bg-white rounded-2xl shadow-2xl max-w-lg w-full overflow-hidden border border-slate-100 transform transition-all animate-in fade-in zoom-in-95 duration-200">
        <div className="px-6 py-4 bg-slate-50 border-b border-slate-200 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <ShoppingCart className="h-5 w-5 text-[#059669]" />
            <span className="text-sm font-black uppercase tracking-widest text-neutral-900">
              Procure: {item.name}
            </span>
          </div>
          <button onClick={onClose} className="p-1 rounded-lg text-slate-400 hover:text-slate-650 hover:bg-slate-105 transition-all">
            <X className="h-5 w-5" />
          </button>
        </div>

        {/* Tabs switcher */}
        <div className="flex border-b border-slate-100 bg-slate-50/50 p-2 gap-2">
          <button
            type="button"
            onClick={() => setActiveTab('purchase')}
            className={cn(
              "flex-1 py-2 text-xs font-black uppercase tracking-wider rounded-lg transition-all",
              activeTab === 'purchase'
                ? "bg-white text-emerald-700 shadow-sm border border-slate-150"
                : "text-slate-500 hover:bg-slate-100"
            )}
          >
            Direct Purchase
          </button>
          <button
            type="button"
            onClick={() => setActiveTab('bid')}
            className={cn(
              "flex-1 py-2 text-xs font-black uppercase tracking-wider rounded-lg transition-all",
              activeTab === 'bid'
                ? "bg-white text-emerald-700 shadow-sm border border-slate-150"
                : "text-slate-500 hover:bg-slate-100"
            )}
          >
            Request Bid (RFQ)
          </button>
        </div>

        <div className="p-6">
          {(actionState?.purchase || actionState?.rfq) && (
            <div className="mb-4 rounded-xl border border-emerald-200 bg-emerald-50 px-4 py-3">
              <p className="text-[10px] font-black uppercase tracking-widest text-emerald-700">Current Status</p>
              <p className="mt-1 text-xs font-bold text-emerald-900">
                {actionState.purchase
                  ? `Direct purchase ${String(actionState.purchase.status || 'requested').replace(/_/g, ' ')}${actionState.purchase.purchaseNumber ? ` (${actionState.purchase.purchaseNumber})` : ''}`
                  : `RFQ ${String(actionState.rfq?.status || 'sent').replace(/_/g, ' ')}${actionState.rfq?.subject ? `: ${actionState.rfq.subject}` : ''}`}
              </p>
            </div>
          )}
          {activeTab === 'purchase' ? (
            <form onSubmit={handleDirectPurchase} className="space-y-4">
              <div className="bg-emerald-50/30 border border-emerald-100 rounded-xl p-4 space-y-3">
                <div className="flex justify-between items-center text-xs font-bold text-slate-500 uppercase">
                  <span>Unit Price</span>
                  <span className="text-emerald-700 font-black">{formatCurrency(price)}</span>
                </div>
                {item.unitOfMeasure && (
                  <div className="flex justify-between items-center text-xs font-bold text-slate-500 uppercase">
                    <span>UOM</span>
                    <span className="text-slate-700">{item.unitOfMeasure}</span>
                  </div>
                )}
                {item.itemCondition && (
                  <div className="flex justify-between items-center text-xs font-bold text-slate-500 uppercase">
                    <span>Condition</span>
                    <span className="text-slate-700">{item.itemCondition.replace(/_/g, ' ')}</span>
                  </div>
                )}
                {item.seller && (
                  <div className="flex justify-between items-center text-xs font-bold text-slate-500 uppercase">
                    <span>Seller</span>
                    <span className="text-slate-700 truncate max-w-[200px]">{item.seller.name}</span>
                  </div>
                )}
              </div>

              <div>
                <label className="mb-1.5 block text-xs font-bold uppercase tracking-wider text-slate-500">
                  Quantity To Purchase
                </label>
                <input
                  type="number"
                  min="1"
                  value={quantity}
                  onChange={(e) => setQuantity(Math.max(1, Number(e.target.value)))}
                  className="w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-xs font-bold outline-none focus:border-emerald-400 focus:ring-2 focus:ring-emerald-500/20"
                />
              </div>

              <div className="border-t border-slate-100 pt-3 flex justify-between items-center">
                <div>
                  <h4 className="text-[10px] font-black uppercase tracking-widest text-slate-400">Total Est. Value</h4>
                  <p className="text-lg font-black text-emerald-700">{formatCurrency(totalAmount)}</p>
                </div>
                <div className="flex gap-2">
                  <Button type="button" variant="outline" onClick={onClose} className="h-9 px-3.5 text-xs font-black uppercase tracking-wider border-slate-200">
                    Cancel
                  </Button>
                  <Button type="submit" disabled={submitting} className="h-9 px-5 text-xs font-black uppercase tracking-wider bg-emerald-600 text-white hover:bg-emerald-700">
                    {submitting ? 'Submitting...' : 'Confirm Purchase'}
                  </Button>
                </div>
              </div>
            </form>
          ) : (
            <form onSubmit={handleRequestQuote} className="space-y-4">
              <div>
                <label className="mb-1.5 block text-xs font-bold uppercase tracking-wider text-slate-500">RFQ Subject</label>
                <input
                  type="text"
                  required
                  value={subject}
                  onChange={(e) => setSubject(e.target.value)}
                  placeholder="Subject of quote request"
                  className="w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-xs font-bold outline-none focus:border-emerald-400 focus:ring-2 focus:ring-emerald-500/20"
                />
              </div>

              <div>
                <label className="mb-1.5 block text-xs font-bold uppercase tracking-wider text-slate-500">Message for Seller</label>
                <textarea
                  required
                  rows={4}
                  value={message}
                  onChange={(e) => setMessage(e.target.value)}
                  placeholder="Provide precise details, quantity required, technical specs, etc..."
                  className="w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-xs font-semibold outline-none focus:border-emerald-400 focus:ring-2 focus:ring-emerald-500/20"
                />
              </div>

              <div>
                <label className="mb-1.5 block text-xs font-bold uppercase tracking-wider text-slate-500">Amount / Value (Optional)</label>
                <input
                  type="number"
                  min="0"
                  value={estimatedValue}
                  onChange={(e) => setEstimatedValue(e.target.value === '' ? '' : Number(e.target.value))}
                  placeholder="e.g. 50000"
                  className="w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-xs font-bold outline-none focus:border-emerald-400 focus:ring-2 focus:ring-emerald-500/20"
                />
              </div>

              <div>
                <label className="mb-1.5 block text-xs font-bold uppercase tracking-wider text-slate-500">Attach Document (Optional)</label>
                <div className={`relative flex items-center justify-between w-full border border-dashed rounded-lg p-3 transition-all ${docUrl ? 'bg-emerald-50/40 border-emerald-200' : 'bg-slate-50 border-slate-200'}`}>
                  <div className="flex items-center gap-2.5">
                    <div className={`p-1.5 rounded-md ${docUrl ? 'bg-emerald-100 text-emerald-600' : 'bg-slate-200 text-slate-500'}`}>
                      <Paperclip className="h-3.5 w-3.5" />
                    </div>
                    <span className={`text-xs font-semibold ${docUrl ? 'text-emerald-700' : 'text-slate-600'}`}>
                      {docUrl ? 'Document attached' : 'Attach requirement PDF / DOC'}
                    </span>
                  </div>
                  <input
                    type="file"
                    id="rfq-quote-doc"
                    accept=".pdf,.doc,.docx,.xls,.xlsx"
                    className="hidden"
                    onChange={handleUploadQuoteDoc}
                    disabled={isUploadingDoc}
                  />
                  <label
                    htmlFor="rfq-quote-doc"
                    className={`px-3 py-1.5 rounded-md text-[9px] font-black uppercase tracking-wide cursor-pointer transition-all ${docUrl
                      ? 'bg-white border border-emerald-200 text-emerald-700 hover:bg-emerald-50'
                      : 'bg-emerald-600 text-white hover:bg-emerald-700'
                      }`}
                  >
                    {isUploadingDoc ? 'Uploading...' : docUrl ? 'Change' : 'Upload'}
                  </label>
                </div>
              </div>

              <div className="border-t border-slate-100 pt-3 flex justify-end gap-2">
                <Button type="button" variant="outline" onClick={onClose} className="h-9 px-3.5 text-xs font-black uppercase tracking-wider border-slate-200">
                  Cancel
                </Button>
                <Button type="submit" disabled={submitting} className="h-9 px-5 text-xs font-black uppercase tracking-wider bg-emerald-600 text-white hover:bg-emerald-700">
                  {submitting ? 'Submitting...' : 'Submit RFQ'}
                </Button>
              </div>
            </form>
          )}
        </div>
      </div>
    </div>
  );
}

function SellerProfileModal({ seller, loading, onClose }: { seller: any; loading: boolean; onClose: () => void }) {
  const profile = seller?.sellerProfile || {};
  const offices = normalizeList<any>(profile.offices);
  const categories = normalizeList<string>(profile.productCategories);
  const primaryOffice = offices[0] || {};

  return (
    <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-sm z-50 flex items-center justify-center p-4 overflow-y-auto">
      <div className="bg-white rounded-2xl shadow-2xl max-w-2xl w-full overflow-hidden border border-slate-100">
        <div className="px-6 py-4 bg-slate-50 border-b border-slate-200 flex items-center justify-between">
          <div className="flex items-center gap-3 min-w-0">
            <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-emerald-100 text-[#059669]">
              <Store className="h-5 w-5" />
            </div>
            <div className="min-w-0">
              <p className="text-[10px] font-black uppercase tracking-widest text-[#059669]">Seller Profile</p>
              <h2 className="truncate text-lg font-black text-neutral-900">{profile.businessName || seller?.name || 'Seller'}</h2>
            </div>
          </div>
          <button onClick={onClose} className="p-1 rounded-lg text-slate-400 hover:text-slate-650 hover:bg-slate-105 transition-all">
            <X className="h-5 w-5" />
          </button>
        </div>

        <div className="p-6 space-y-5">
          {loading ? (
            <div className="rounded-xl border border-slate-200 bg-slate-50 px-4 py-8 text-center text-sm font-bold text-slate-500">
              Loading seller profile...
            </div>
          ) : (
            <>
              <div className="flex flex-wrap gap-2">
                <span className="rounded-full border border-emerald-200 bg-emerald-50 px-3 py-1 text-[10px] font-black uppercase tracking-wide text-emerald-700">
                  {String(seller?.onboardingStatus || 'approved').replace(/_/g, ' ')}
                </span>
                {profile.organizationType && (
                  <span className="rounded-full border border-slate-200 bg-slate-50 px-3 py-1 text-[10px] font-black uppercase tracking-wide text-slate-600">
                    {profile.organizationType}
                  </span>
                )}
                {profile.msmeCategory && (
                  <span className="rounded-full border border-emerald-200 bg-emerald-50 px-3 py-1 text-[10px] font-black uppercase tracking-wide text-emerald-700">
                    {profile.msmeCategory}
                  </span>
                )}
              </div>

              <div className="grid gap-3 sm:grid-cols-2">
                <SellerInfoBox icon={Mail} label="Email" value={seller?.email || 'Not available'} />
                <SellerInfoBox icon={Building2} label="Business Name" value={profile.businessName || seller?.name || 'Not available'} />
                <SellerInfoBox icon={MapPin} label="Location" value={[profile.city || primaryOffice.city, profile.state || primaryOffice.state].filter(Boolean).join(', ') || 'Not available'} />
                <SellerInfoBox icon={CalendarDays} label="Incorporated" value={profile.dateOfIncorporation ? new Date(profile.dateOfIncorporation).toLocaleDateString() : 'Not available'} />
                <SellerInfoBox icon={ShieldCheck} label="PAN" value={profile.pan || profile.panMasked || 'Not available'} />
                <SellerInfoBox icon={FileText} label="GST" value={profile.gst || profile.gstMasked || primaryOffice.gstNumber || 'Not available'} />
              </div>

              {categories.length > 0 && (
                <div className="border-t border-slate-100 pt-4">
                  <h4 className="text-[10px] font-black uppercase tracking-widest text-slate-400">Procurement Categories</h4>
                  <div className="mt-2 flex flex-wrap gap-2">
                    {categories.map(category => (
                      <span key={category} className="rounded bg-emerald-50 px-2 py-1 text-[10px] font-black uppercase text-emerald-700">{category}</span>
                    ))}
                  </div>
                </div>
              )}

              {offices.length > 0 && (
                <div className="border-t border-slate-100 pt-4">
                  <h4 className="text-[10px] font-black uppercase tracking-widest text-slate-400">Office Locations</h4>
                  <div className="mt-2 space-y-2">
                    {offices.slice(0, 3).map((office, index) => (
                      <div key={office.id || index} className="rounded-lg border border-slate-200 bg-slate-50 px-3 py-2">
                        <p className="text-xs font-black text-neutral-900">{office.name || office.type || `Office ${index + 1}`}</p>
                        <p className="mt-1 text-[11px] font-semibold text-slate-600">{[office.city, office.state, office.pincode].filter(Boolean).join(', ') || office.address || 'Address not available'}</p>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </>
          )}
        </div>
      </div>
    </div>
  );
}

function SellerInfoBox({ icon: Icon, label, value }: { icon: React.ElementType; label: string; value: string }) {
  return (
    <div className="rounded-xl border border-slate-200 bg-white px-3 py-3">
      <div className="flex items-start gap-2">
        <Icon className="mt-0.5 h-4 w-4 shrink-0 text-[#059669]" />
        <div className="min-w-0">
          <p className="text-[10px] font-black uppercase tracking-wider text-slate-400">{label}</p>
          <p className="mt-1 break-words text-xs font-bold text-slate-700">{value}</p>
        </div>
      </div>
    </div>
  );
}
