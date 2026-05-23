import { FormEvent, useCallback, useEffect, useMemo, useState } from 'react';
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
  Building2
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
import { usePagination } from '../../shared/hooks';
import type { CatalogueItemDto, CategoryDto } from '../../shared/types';
import { catalogueApi } from '../api';
import { openFileAsset } from '../../../lib/files';

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

const catalogueDocuments = (item: CatalogueRecord) => {
  const docs: Array<{ id?: number; label: string; fileId?: number; mimeType?: string; originalName?: string }> = [];

  item.images?.forEach((image, index) => {
    const fileId = image.fileAssetId || image.fileAsset?.id || image.fileAsset?.fileAssetId;
    if (!fileId) return;
    docs.push({
      id: fileId,
      fileId,
      label: image.altText || image.fileAsset?.originalName || `Product image ${index + 1}`,
      mimeType: image.fileAsset?.mimeType,
      originalName: image.fileAsset?.originalName
    });
  });

  item.certifications?.forEach((cert, index) => {
    const fileId = cert.fileAssetId || cert.fileAsset?.id || cert.fileAsset?.fileAssetId;
    if (!fileId) return;
    docs.push({
      id: fileId,
      fileId,
      label: cert.name || cert.fileAsset?.originalName || `Certification ${index + 1}`,
      mimeType: cert.fileAsset?.mimeType || undefined,
      originalName: cert.fileAsset?.originalName || undefined
    });
  });

  item.catalogueFiles?.forEach((file, index) => {
    const fileId = file.id || file.fileAssetId;
    if (!fileId) return;
    docs.push({
      id: fileId,
      fileId,
      label: file.originalName || `Catalogue document ${index + 1}`,
      mimeType: file.mimeType,
      originalName: file.originalName
    });
  });

  const seen = new Set<number>();
  return docs.filter(doc => {
    if (!doc.fileId || seen.has(doc.fileId)) return false;
    seen.add(doc.fileId);
    return true;
  });
};

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
  const [viewMode, setViewMode] = useState<'grid' | 'list'>('grid');
  const [selectedDetailsItem, setSelectedDetailsItem] = useState<CatalogueRecord | null>(null);
  const [selectedPurchaseItem, setSelectedPurchaseItem] = useState<CatalogueRecord | null>(null);
  const [selectedSeller, setSelectedSeller] = useState<any | null>(null);
  const [sellerLoading, setSellerLoading] = useState(false);
  const [buyerActions, setBuyerActions] = useState<Record<string, BuyerActionState>>({});

  const sellerApproved = mode !== 'seller' || ['approved_for_procurement', 'approved'].includes(String(user?.onboardingStatus));

  const loadBuyerActions = useCallback(async () => {
    if (mode !== 'buyer') return;
    try {
      const [purchaseRows, rfqRows] = await Promise.all([
        getApi('/api/direct-purchases').catch(() => []),
        getApi('/api/quote-requests').catch(() => [])
      ]);
      const next: Record<string, BuyerActionState> = {};
      normalizeList<any>(purchaseRows).forEach(row => {
        const key = actionKey(row.sellerId);
        if (!key) return;
        next[key] = {
          ...next[key],
          purchase: {
            id: row.id,
            status: row.status,
            purchaseNumber: row.purchaseNumber
          }
        };
      });
      normalizeList<any>(rfqRows).forEach(row => {
        const key = actionKey(row.sellerId);
        if (!key) return;
        next[key] = {
          ...next[key],
          rfq: {
            id: row.id,
            status: row.status || row.statusEnum,
            subject: row.subject
          }
        };
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
      setProducts(normalizeList<CatalogueItemDto>(productRows).map(item => ({ ...item, itemKind: 'product' as const })));
      setServices(normalizeList<CatalogueItemDto>(serviceRows).map(item => ({ ...item, itemKind: 'service' as const })));
      setCategoryList(categoriesData || []);
      void loadBuyerActions();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unable to load marketplace');
    } finally {
      setLoading(false);
    }
  }, [loadBuyerActions, mode]);

  useEffect(() => {
    void loadCatalogue();
  }, [loadCatalogue]);

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
  const { page, pageSize, pageItems: pagedItems, total, setPage, setPageSize } = usePagination(filtered, 18);

  const averageValue = filtered.length ? filtered.reduce((sum, item) => sum + cataloguePrice(item), 0) / filtered.length : 0;

  const updateForm = (field: keyof typeof blankForm, value: string) => setForm(current => ({ ...current, [field]: value }));

  const openCreateForm = (kind: ItemKind) => {
    setEditingItem(null);
    setFormKind(kind);
    setShowForm(true);
    setForm(blankForm);
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
      basePrice: item.basePrice === null || item.basePrice === undefined ? '' : String(item.basePrice),
      pricingModel: item.pricingModel || 'FIXED',
      serviceArea: item.serviceArea || '',
      status: item.status || 'ACTIVE',
      categoryId: String(item.categoryId || '')
    });
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

  const updateBuyerAction = (sellerId: unknown, action: BuyerActionState) => {
    const key = actionKey(sellerId);
    if (!key) return;
    setBuyerActions(current => ({ ...current, [key]: { ...current[key], ...action } }));
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
        ...(formKind === 'product'
          ? {
              price: form.price ? Number(form.price) : undefined,
              hsnCode: form.hsnCode.trim() || undefined,
              unitOfMeasure: form.unitOfMeasure.trim() || undefined
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
    <div className="space-y-4">
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
              <Button disabled={!sellerApproved} onClick={() => openCreateForm('service')} variant="outline" className="h-10 rounded-lg text-xs font-black uppercase tracking-wider border-slate-200 text-slate-700 hover:bg-slate-50">
                <Wrench className="mr-2 h-4 w-4" />Service
              </Button>
            </>
          )}
          <Button variant="outline" onClick={loadCatalogue} className="h-10 rounded-lg text-xs font-black uppercase tracking-wider border-slate-200 text-slate-700 hover:bg-slate-50">
            <RefreshCw className="mr-2 h-4 w-4" />Refresh
          </Button>
        </div>
      </div>

      {mode === 'seller' && !sellerApproved && (
        <InlineError message="Marketplace item creation is locked until admin approves your seller onboarding. You can view your marketplace, but adding or changing products and services is disabled." />
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
          onCancel={() => {
            setShowForm(false);
            setEditingItem(null);
          }}
          onSubmit={submitForm}
          onChange={updateForm}
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
          </div>

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
            
            {/* Grid/List View switcher Toggle */}
            <div className="flex items-center gap-1 border border-slate-200 rounded-lg p-1 bg-slate-50 w-fit xl:ml-auto">
              <button
                type="button"
                onClick={() => setViewMode('grid')}
                className={cn(
                  "p-1.5 rounded-md transition-all",
                  viewMode === 'grid'
                    ? "bg-white text-emerald-700 shadow-sm font-bold"
                    : "text-slate-400 hover:text-slate-650"
                )}
                title="Grid View"
              >
                <Grid className="h-4 w-4" />
              </button>
              <button
                type="button"
                onClick={() => setViewMode('list')}
                className={cn(
                  "p-1.5 rounded-md transition-all",
                  viewMode === 'list'
                    ? "bg-white text-emerald-700 shadow-sm font-bold"
                    : "text-slate-400 hover:text-slate-650"
                )}
                title="List View"
              >
                <List className="h-4 w-4" />
              </button>
            </div>
          </div>
        </CardContent>
      </Card>

      {filtered.length === 0 ? <EmptyState title="No marketplace items found matching filters" /> : (
        <>
          <div className={cn(
            viewMode === 'grid'
              ? "grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-3"
              : "flex flex-col gap-3"
          )}>
            {pagedItems.map(item => (
              <CatalogueCard
                key={`${item.itemKind}-${item.id}`}
                item={item}
                mode={mode}
                viewMode={viewMode}
                onEdit={openEditForm}
                onDelete={deleteItem}
                onViewDetails={setSelectedDetailsItem}
                onPurchaseBid={setSelectedPurchaseItem}
                onSellerClick={openSellerProfile}
                actionState={buyerActions[actionKey(item.sellerId || item.seller?.id)]}
              />
            ))}
          </div>
          <div className="overflow-hidden rounded-lg border border-slate-200 bg-white">
            <Pagination page={page} pageSize={pageSize} total={total} onPageChange={setPage} onPageSizeChange={setPageSize} label="marketplace items" />
          </div>
        </>
      )}

      {/* Modals rendering */}
      {selectedDetailsItem && (
        <ItemDetailsModal
          item={selectedDetailsItem}
          mode={mode}
          actionState={buyerActions[actionKey(selectedDetailsItem.sellerId || selectedDetailsItem.seller?.id)]}
          onSellerClick={openSellerProfile}
          onPurchaseBid={setSelectedPurchaseItem}
          onClose={() => setSelectedDetailsItem(null)}
        />
      )}

      {selectedPurchaseItem && (
        <PurchaseBidModal
          item={selectedPurchaseItem}
          actionState={buyerActions[actionKey(selectedPurchaseItem.sellerId || selectedPurchaseItem.seller?.id)]}
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
    </div>
  );
}

function CatalogueForm({ form, kind, saving, isEdit, categoryList, onCancel, onSubmit, onChange }: {
  form: typeof blankForm;
  kind: ItemKind;
  saving: boolean;
  isEdit: boolean;
  categoryList: CategoryDto[];
  onCancel: () => void;
  onSubmit: (event: FormEvent) => void;
  onChange: (field: keyof typeof blankForm, value: string) => void;
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
              <Input label="Unit Of Measure" value={form.unitOfMeasure} onChange={event => onChange('unitOfMeasure', event.target.value)} placeholder="e.g. piece, kg, box, unit" className="bg-white" />
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
          <div className="flex justify-end gap-2 border-t border-slate-200/80 pt-3 lg:col-span-2">
            <Button type="button" variant="outline" onClick={onCancel} className="h-9 rounded-lg text-xs font-black uppercase tracking-wider border-slate-200 text-slate-700 hover:bg-slate-50">Cancel</Button>
            <Button type="submit" disabled={saving} className={cn("h-9 rounded-lg text-xs font-black uppercase tracking-wider text-white", kind === 'product' ? 'bg-[#059669] hover:bg-emerald-800' : 'bg-emerald-600 hover:bg-emerald-700')}>
              <Plus className="mr-1.5 h-3.5 w-3.5" />{saving ? 'Saving...' : isEdit ? `Save Changes` : `Create ${kind}`}
            </Button>
          </div>
        </form>
      </CardContent>
    </Card>
  );
}

function CatalogueCard({ item, mode, viewMode = 'grid', actionState, onEdit, onDelete, onViewDetails, onPurchaseBid, onSellerClick }: {
  item: CatalogueRecord;
  mode: CatalogueMode;
  viewMode?: 'grid' | 'list';
  actionState?: BuyerActionState;
  onEdit?: (item: CatalogueRecord) => void;
  onDelete?: (item: CatalogueRecord) => void;
  onViewDetails?: (item: CatalogueRecord) => void;
  onPurchaseBid?: (item: CatalogueRecord) => void;
  onSellerClick?: (seller: CatalogueRecord['seller']) => void;
}) {
  const value = cataloguePrice(item);
  const status = item.status || 'DRAFT';
  const statusVariant = status === 'ACTIVE' ? 'success' : status === 'ARCHIVED' || status === 'INACTIVE' ? 'warning' : 'default';
  const buyerStatusLabel = actionState?.purchase
    ? `Purchase ${String(actionState.purchase.status || 'requested').replace(/_/g, ' ')}`
    : actionState?.rfq
      ? `RFQ ${String(actionState.rfq.status || 'sent').replace(/_/g, ' ')}`
      : '';

  if (viewMode === 'list') {
    return (
      <Card className="hover:shadow-md hover:border-slate-350 transition-all duration-200 bg-white border-slate-200/80 w-full">
        <CardContent className="p-4">
          <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
            <div className="flex items-start gap-4 min-w-0 flex-1">
              <div className={cn('flex h-12 w-12 shrink-0 items-center justify-center rounded-xl text-white shadow-sm', item.itemKind === 'product' ? 'bg-[#059669]' : 'bg-emerald-600')}>
                {item.itemKind === 'product' ? <PackageSearch className="h-6 w-6" /> : <Wrench className="h-6 w-6" />}
              </div>
              <div className="min-w-0 flex-1">
                <div className="flex flex-wrap items-center gap-2">
                  <h3 className="break-words text-sm font-black text-neutral-900 leading-snug">{item.name}</h3>
                  <Badge variant={statusVariant}>{status.replace(/_/g, ' ')}</Badge>
                  <span className="rounded bg-slate-100 px-2 py-0.5 text-[9px] font-black uppercase text-slate-600">{item.itemKind}</span>
                  {item.category?.name && <span className="rounded bg-emerald-50 px-2 py-0.5 text-[9px] font-black uppercase text-emerald-700">{item.category.name}</span>}
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
                    <Button
                      type="button"
                      onClick={() => onPurchaseBid?.(item)}
                      className="h-8 px-3 rounded-lg text-[10px] font-black uppercase tracking-wider bg-emerald-600 hover:bg-emerald-700 text-white"
                    >
                      <ShoppingCart className="mr-1 h-3 w-3" />
                      Purchase / Bid
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
            <div className={cn('flex h-10 w-10 shrink-0 items-center justify-center rounded-lg text-white shadow-sm', item.itemKind === 'product' ? 'bg-[#059669]' : 'bg-emerald-600')}>
              {item.itemKind === 'product' ? <PackageSearch className="h-5 w-5" /> : <Wrench className="h-5 w-5" />}
            </div>
            <div className="min-w-0 flex-1">
              <div className="flex flex-wrap items-start justify-between gap-2">
                <h3 className="break-words text-sm font-black text-neutral-900 leading-snug">{item.name}</h3>
                <Badge variant={statusVariant}>{status.replace(/_/g, ' ')}</Badge>
              </div>
              <p className="mt-1 line-clamp-2 text-xs font-semibold text-slate-500 leading-relaxed">{item.description || 'No description provided'}</p>
              <div className="mt-3 flex flex-wrap items-center gap-1.5">
                <p className="text-xs font-black text-emerald-700 bg-emerald-50/50 border border-emerald-100 px-2 py-0.5 rounded">{formatCurrency(value)}</p>
                <span className="rounded bg-slate-100 px-2 py-0.5 text-[9px] font-black uppercase text-slate-600">{item.itemKind}</span>
                {item.category?.name && <span className="rounded bg-emerald-50 px-2 py-0.5 text-[9px] font-black uppercase text-emerald-700">{item.category.name}</span>}
                {item.itemKind === 'service' && item.pricingModel && <span className="rounded bg-emerald-50 px-2 py-0.5 text-[9px] font-black uppercase text-emerald-700">{item.pricingModel.replace(/_/g, ' ')}</span>}
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
                className="flex-1 h-8 rounded-lg text-[9px] sm:text-xs font-black uppercase tracking-wider bg-emerald-600 hover:bg-emerald-700 text-white"
              >
                <ShoppingCart className="mr-1 h-3 w-3" />
                <span>Buy/Bid</span>
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

function ItemDetailsModal({ item, mode, actionState, onSellerClick, onPurchaseBid, onClose }: {
  item: CatalogueRecord;
  mode: CatalogueMode;
  actionState?: BuyerActionState;
  onSellerClick: (seller: CatalogueRecord['seller']) => void;
  onPurchaseBid: (item: CatalogueRecord) => void;
  onClose: () => void;
}) {
  const value = cataloguePrice(item);
  const documents = catalogueDocuments(item);
  const buyerStatusLabel = actionState?.purchase
    ? `Direct purchase ${String(actionState.purchase.status || 'requested').replace(/_/g, ' ')}`
    : actionState?.rfq
      ? `RFQ ${String(actionState.rfq.status || 'sent').replace(/_/g, ' ')}`
      : '';
  const handleOpenDocument = async (document: { fileId?: number; label: string; originalName?: string; mimeType?: string }) => {
    try {
      await openFileAsset({
        fileId: document.fileId,
        originalName: document.originalName || document.label,
        mimeType: document.mimeType
      }, document.label);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Unable to open document');
    }
  };

  return (
    <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-sm z-50 flex items-center justify-center p-4 overflow-y-auto">
      <div className="bg-white rounded-2xl shadow-2xl max-w-lg w-full overflow-hidden border border-slate-100 transform transition-all animate-in fade-in zoom-in-95 duration-200">
        <div className="px-6 py-4 bg-slate-50 border-b border-slate-200 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <span className={cn('flex h-8 w-8 items-center justify-center rounded-lg text-white font-bold', item.itemKind === 'product' ? 'bg-[#059669]' : 'bg-emerald-600')}>
              {item.itemKind === 'product' ? <PackageSearch className="h-4.5 w-4.5" /> : <Wrench className="h-4.5 w-4.5" />}
            </span>
            <span className="text-xs font-black uppercase tracking-widest text-[#059669]">
              {item.itemKind} Details
            </span>
          </div>
          <button onClick={onClose} className="p-1 rounded-lg text-slate-400 hover:text-slate-650 hover:bg-slate-105 transition-all">
            <X className="h-5 w-5" />
          </button>
        </div>
        <div className="p-6 space-y-4">
          <div>
            <h2 className="text-lg font-black text-neutral-900 leading-snug">{item.name}</h2>
            <div className="mt-2 flex flex-wrap gap-1.5">
              <Badge variant="success">{item.status || 'ACTIVE'}</Badge>
              {item.category?.name && <span className="rounded bg-emerald-50 px-2 py-0.5 text-[9px] font-black uppercase text-emerald-700">{item.category.name}</span>}
              {buyerStatusLabel && <span className="rounded bg-emerald-50 px-2 py-0.5 text-[9px] font-black uppercase text-emerald-700">{buyerStatusLabel}</span>}
            </div>
          </div>

          <div className="border-t border-slate-100 pt-3">
            <h4 className="text-[10px] font-black uppercase tracking-widest text-slate-400">Description</h4>
            <p className="mt-1 text-xs text-slate-600 leading-relaxed font-semibold break-words whitespace-pre-wrap">
              {item.description || 'No description provided.'}
            </p>
          </div>

          <div className="grid grid-cols-2 gap-4 border-t border-slate-100 pt-3">
            <div>
              <h4 className="text-[10px] font-black uppercase tracking-widest text-slate-400">
                {item.itemKind === 'product' ? 'Price' : 'Base Price'}
              </h4>
              <p className="mt-1 text-sm font-black text-emerald-800">{formatCurrency(value)}</p>
            </div>
            {item.itemKind === 'product' ? (
              <>
                {item.unitOfMeasure && (
                  <div>
                    <h4 className="text-[10px] font-black uppercase tracking-widest text-slate-400">Unit of Measure</h4>
                    <p className="mt-1 text-xs text-slate-700 font-bold">{item.unitOfMeasure}</p>
                  </div>
                )}
                {item.hsnCode && (
                  <div>
                    <h4 className="text-[10px] font-black uppercase tracking-widest text-slate-400">HSN Code</h4>
                    <p className="mt-1 text-xs text-slate-700 font-bold">{item.hsnCode}</p>
                  </div>
                )}
              </>
            ) : (
              <>
                {item.pricingModel && (
                  <div>
                    <h4 className="text-[10px] font-black uppercase tracking-widest text-slate-400">Pricing Model</h4>
                    <p className="mt-1 text-xs text-slate-700 font-bold">{item.pricingModel.replace(/_/g, ' ')}</p>
                  </div>
                )}
                {item.serviceArea && (
                  <div>
                    <h4 className="text-[10px] font-black uppercase tracking-widest text-slate-400">Service Area</h4>
                    <p className="mt-1 text-xs text-slate-700 font-bold">{item.serviceArea}</p>
                  </div>
                )}
              </>
            )}
          </div>

          <div className="border-t border-slate-100 pt-3">
            <h4 className="text-[10px] font-black uppercase tracking-widest text-slate-400">Documents</h4>
            {documents.length > 0 ? (
              <div className="mt-2 space-y-2">
                {documents.map(document => (
                  <div key={document.fileId} className="flex items-center justify-between gap-3 rounded-lg border border-slate-200 bg-white px-3 py-2">
                    <div className="flex min-w-0 items-center gap-2">
                      <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-md bg-emerald-50 text-[#059669]">
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
                      className="shrink-0 rounded-md border border-slate-200 px-2.5 py-1 text-[10px] font-black uppercase tracking-wider text-[#059669] hover:bg-emerald-50"
                    >
                      View
                    </button>
                  </div>
                ))}
              </div>
            ) : (
              <p className="mt-2 rounded-lg border border-dashed border-slate-200 bg-slate-50 px-3 py-2 text-xs font-semibold text-slate-500">
                No documents uploaded for this {item.itemKind}.
              </p>
            )}
          </div>

          {item.seller && (
            <div className="border-t border-slate-100 pt-3 bg-slate-50 -mx-6 -mb-6 p-6 mt-4">
              <h4 className="text-[10px] font-black uppercase tracking-widest text-slate-400">Seller Information</h4>
              <div className="mt-2 flex items-center gap-3">
                <div className="h-9 w-9 rounded-full bg-emerald-100 flex items-center justify-center text-[#059669]">
                  <Store className="h-4.5 w-4.5" />
                </div>
                <div className="min-w-0 flex-1">
                  <button
                    type="button"
                    onClick={() => onSellerClick?.(item.seller)}
                    className="text-xs font-black text-[#059669] hover:text-neutral-800 hover:underline cursor-pointer text-left focus:outline-none transition-colors truncate"
                    title="Click to view seller profile"
                  >
                    {item.seller.name}
                  </button>
                  <p className="text-[10px] font-semibold text-slate-500 truncate">{item.seller.email}</p>
                </div>
              </div>
              <div className="mt-3 flex justify-end">
                {mode === 'buyer' ? (
                  <Button onClick={() => onPurchaseBid(item)} className="h-9 rounded-lg bg-emerald-600 px-4 text-xs font-black uppercase tracking-wider text-white hover:bg-emerald-700">
                    <ShoppingCart className="mr-2 h-4 w-4" />
                    {buyerStatusLabel ? 'Create Another Request' : 'Purchase / Bid'}
                  </Button>
                ) : (
                  <Button variant="outline" onClick={() => onSellerClick?.(item.seller)} className="h-9 rounded-lg border-emerald-200 px-4 text-xs font-black uppercase tracking-wider text-emerald-700 hover:bg-emerald-50">
                    <Store className="mr-2 h-4 w-4" />
                    Open Seller Profile
                  </Button>
                )}
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

function PurchaseBidModal({ item, actionState, onActionCreated, onClose }: {
  item: CatalogueRecord;
  actionState?: BuyerActionState;
  onActionCreated: (sellerId: unknown, action: BuyerActionState) => void;
  onClose: () => void;
}) {
  const [activeTab, setActiveTab] = useState<'purchase' | 'bid'>('purchase');
  const [quantity, setQuantity] = useState<number>(1);
  const [subject, setSubject] = useState<string>(`RFQ for ${item.name}`);
  const [message, setMessage] = useState<string>(
    `Dear ${item.seller?.name || 'Seller'},\n\nWe are highly interested in your ${item.itemKind} "${item.name}".\n\nPlease provide your best custom quote, delivery timeline, and warranty terms for this item.\n\nThanks,\nBuyer Team`
  );
  const [docUrl, setDocUrl] = useState<string>('');
  const [submitting, setSubmitting] = useState(false);

  const price = cataloguePrice(item);
  const totalAmount = price * quantity;

  const handleDirectPurchase = async (e: FormEvent) => {
    e.preventDefault();
    setSubmitting(true);
    try {
      const directPurchase = await postApi('/api/direct-purchases', {
        sellerId: Number(item.sellerId),
        totalAmount
      });
      onActionCreated(item.sellerId || item.seller?.id, {
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
        documentUrl: docUrl.trim() || undefined
      });
      onActionCreated(item.sellerId || item.seller?.id, {
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
                <label className="mb-1.5 block text-xs font-bold uppercase tracking-wider text-slate-500">Document URL (Optional)</label>
                <input
                  type="url"
                  value={docUrl}
                  onChange={(e) => setDocUrl(e.target.value)}
                  placeholder="https://example.com/spec-sheet.pdf"
                  className="w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-xs font-semibold outline-none focus:border-emerald-400 focus:ring-2 focus:ring-emerald-500/20"
                />
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
