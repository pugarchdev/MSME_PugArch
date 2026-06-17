import { memo, useEffect, useMemo, useState } from 'react';
import { usePathname, useSearchParams } from 'next/navigation';
import {
  AlertTriangle,
  Archive,
  BarChart3,
  Bell,
  Building2,
  CheckCircle2,
  CreditCard,
  Download,
  Eye,
  FileClock,
  FileSearch,
  FileText,
  Filter,
  Grid2X2,
  KeyRound,
  LayoutDashboard,
  List,
  Mail,
  Palette,
  Plus,
  Power,
  RefreshCw,
  RotateCcw,
  Search,
  ShieldCheck,
  ShoppingCart,
  SlidersHorizontal,
  Store,
  ToggleLeft,
  ToggleRight,
  Truck,
  UserPlus,
  Users
} from 'lucide-react';
import { toast } from 'sonner';
import { useDebounce } from '../../../hooks/useDebounce';
import { useAuth } from '../../../hooks/useAuth';
import { Button } from '../../../components/ui/button';
import { Card, CardContent } from '../../../components/ui/card';
import { Loader2 } from '../../../components/ui/loader';
import { api } from '../../../lib/api';
import { openFileAsset } from '../../../lib/files';
import { cn } from '../../../lib/utils';
import PremiumLoader from '../../../components/PremiumLoader';
import { Pagination } from '../../shared/Pagination';
import { SortableHeader, type SortDirection } from '../../shared/SortableHeader';
import { useResponsiveViewMode, type ViewMode } from '../../shared/hooks';
import { masterAdminApi } from '../masterAdminApi';

type ApiPage<T> = { items: T[]; total: number; page: number; pageSize: number; summary?: Record<string, number> };
type TabId = 'overview' | 'organizations' | 'branding' | 'users' | 'procurement' | 'marketplace' | 'payments' | 'features' | 'exports' | 'email' | 'audit' | 'settings' | 'security';
type FilterId = TabId | 'tenders' | 'rfqs' | 'orders' | 'invoices' | 'escrows' | 'settlements' | 'documents';

type Company = {
  id: number;
  name: string;
  portalDisplayName?: string | null;
  shortName?: string | null;
  logoUrl?: string | null;
  district?: string | null;
  state?: string | null;
  contactEmail?: string | null;
  contactPhone?: string | null;
  isActive?: boolean;
  createdAt?: string;
  updatedAt?: string;
  _count?: { users?: number; organizations?: number; features?: number; buyerRequirements?: number };
};
type Organization = {
  id: number;
  organizationName?: string | null;
  organizationType?: string | null;
  gstin?: string | null;
  pan?: string | null;
  udyamNumber?: string | null;
  cin?: string | null;
  contactPerson?: string | null;
  email?: string | null;
  mobile?: string | null;
  district?: string | null;
  state?: string | null;
  pincode?: string | null;
  verificationStatus?: string | null;
  isBlacklisted?: boolean;
  gstReuseAllowed?: boolean;
  previousOrganizationId?: number | null;
  replacementOrganizationId?: number | null;
  createdAt?: string;
  updatedAt?: string;
  users?: Array<{ id: number }>;
};

type UserRecord = {
  id: number;
  userId?: string | null;
  name?: string | null;
  email?: string | null;
  mobile?: string | null;
  role?: string | null;
  onboardingStatus?: string | null;
  accountStatus?: string | null;
  createdAt?: string;
  organization?: { id: number; organizationName?: string | null; organizationType?: string | null } | null;
  company?: { id: number; name?: string | null } | null;
};

type Feature = {
  id: number;
  code: string;
  name: string;
  module: string;
  description?: string | null;
  enabled?: boolean;
};

type BidRecord = {
  id: number;
  bidNumber?: string;
  title?: string;
  buyerOrganizationName?: string;
  category?: string;
  status?: string;
  approvalStatus?: string;
  lifecycleStage?: string;
  estimatedValue?: string | number | null;
  endDate?: string;
  createdAt?: string;
  _count?: { participations?: number; documents?: number; awards?: number };
};

type PaymentRecord = {
  id: number;
  referenceId?: string;
  gateway?: string | null;
  method?: string | null;
  status?: string | null;
  paymentStatus?: string | null;
  amount?: string | number | null;
  currency?: string;
  createdAt?: string;
  payer?: { name?: string | null; email?: string | null };
  payee?: { name?: string | null; email?: string | null };
};

type EscrowRecord = {
  id: number;
  amount?: string | number | null;
  currency?: string;
  status?: string | null;
  escrowStatus?: string | null;
  fundedAt?: string | null;
  frozenAt?: string | null;
  releasedAt?: string | null;
  createdAt?: string;
  updatedAt?: string;
  paymentTransaction?: { id: number; referenceId?: string | null; status?: string | null } | null;
  purchaseOrder?: { id: number; poNumber?: string | null; title?: string | null; status?: string | null } | null;
  buyer?: { name?: string | null; email?: string | null };
  seller?: { name?: string | null; email?: string | null };
  _count?: { transactions?: number; milestones?: number };
};

type SettlementRecord = {
  id: number;
  status?: string | null;
  transactionReference?: string | null;
  netReleasedAmount?: string | number | null;
  deductionAmount?: string | number | null;
  penaltyAmount?: string | number | null;
  approvedAt?: string | null;
  releasedAt?: string | null;
  rejectedAt?: string | null;
  rejectionReason?: string | null;
  createdAt?: string;
  updatedAt?: string;
  invoice?: { id: number; invoiceNumber?: string | null; status?: string | null; amount?: string | number | null } | null;
  paymentTransaction?: { id: number; referenceId?: string | null; status?: string | null; amount?: string | number | null } | null;
};

type DocumentRecord = {
  id: number;
  originalName?: string | null;
  entityType?: string | null;
  entityId?: number | null;
  mimeType?: string | null;
  size?: number | null;
  status?: string | null;
  url?: string | null;
  key?: string | null;
  storageProvider?: string | null;
  createdAt?: string;
  updatedAt?: string;
  owner?: {
    id: number;
    name?: string | null;
    email?: string | null;
    company?: { id: number; name?: string | null; portalDisplayName?: string | null } | null;
    organization?: { id: number; organizationName?: string | null } | null;
  } | null;
};

type MasterSearchResult = {
  id: number | string;
  type: string;
  title: string;
  subtitle?: string | null;
  status?: string | null;
  company?: string | null;
  updatedAt?: string | null;
  href?: string | null;
};

type MarketplaceProductRecord = {
  id: number;
  name?: string;
  sku?: string | null;
  brand?: string | null;
  price?: string | number | null;
  currency?: string | null;
  status?: string;
  isMsmeMade?: boolean;
  seller?: { name?: string | null; email?: string | null };
  organization?: { organizationName?: string | null } | null;
  category?: { name?: string | null; type?: string | null } | null;
  _count?: { images?: number; cartItems?: number; guestCartItems?: number };
};

type MarketplaceServiceRecord = {
  id: number;
  name?: string;
  pricingModel?: string;
  basePrice?: string | number | null;
  currency?: string | null;
  serviceArea?: string | null;
  status?: string;
  seller?: { name?: string | null; email?: string | null };
  organization?: { organizationName?: string | null } | null;
  category?: { name?: string | null; type?: string | null } | null;
  _count?: { cartItems?: number; guestCartItems?: number };
};

type TenderRecord = {
  id: number;
  tenderId?: string;
  title?: string;
  category?: string;
  status?: string;
  budget?: string | number | null;
  bidsCount?: number;
  closesAt?: string;
  publishedAt?: string;
  createdAt?: string;
  buyer?: { name?: string | null; email?: string | null };
  organization?: { organizationName?: string | null; organizationType?: string | null } | null;
  _count?: { bids?: number; tenderParticipants?: number; purchaseOrders?: number };
};

type RfqRecord = {
  id: number;
  subject?: string;
  status?: string;
  estimatedValue?: string | number | null;
  deadlineDate?: string;
  createdAt?: string;
  buyer?: { name?: string | null; email?: string | null };
  seller?: { name?: string | null; email?: string | null };
  _count?: { quoteResponses?: number };
};

type OrderRecord = {
  id: number;
  poNumber?: string;
  title?: string;
  amount?: string | number | null;
  totalValue?: string | number | null;
  currency?: string;
  status?: string;
  sourceType?: string | null;
  expectedDelivery?: string;
  createdAt?: string;
  buyer?: { name?: string | null; email?: string | null };
  seller?: { name?: string | null; email?: string | null };
  tender?: { tenderId?: string | null; title?: string | null } | null;
  _count?: { invoices?: number; payments?: number; grns?: number };
};

type InvoiceRecord = {
  id: number;
  invoiceNumber?: string;
  amount?: string | number | null;
  currency?: string;
  status?: string;
  invoiceStatus?: string | null;
  taxableAmount?: string | number | null;
  totalTaxAmount?: string | number | null;
  tdsAmount?: string | number | null;
  approvedAt?: string;
  createdAt?: string;
  purchaseOrder?: { poNumber?: string | null; title?: string | null; status?: string | null };
  buyer?: { name?: string | null; email?: string | null };
  seller?: { name?: string | null; email?: string | null };
  _count?: { items?: number; payments?: number; paymentSettlements?: number };
};

type AuditRecord = {
  id: number;
  action?: string | null;
  entityType?: string | null;
  entityId?: string | number | null;
  createdAt?: string;
  User?: { name?: string | null; email?: string | null; role?: string | null } | null;
};

type ActionDialogState = {
  entity: 'company' | 'organization' | 'user' | 'feature' | 'email' | 'marketplaceProduct' | 'marketplaceService' | 'order' | 'invoice' | 'payment' | 'escrow';
  action: string;
  id?: number;
  label: string;
  danger?: boolean;
  featureKey?: string;
  status?: string;
} | null;

type EditorState = {
  type: 'company' | 'organization' | 'user' | 'email';
  mode: 'create' | 'edit';
  record?: any;
} | null;

const tabs: Array<{ id: TabId; label: string; icon: any }> = [
  { id: 'overview', label: 'Overview', icon: LayoutDashboard },
  { id: 'organizations', label: 'Companies & Orgs', icon: Building2 },
  { id: 'branding', label: 'Branding', icon: Palette },
  { id: 'users', label: 'Users', icon: Users },
  { id: 'procurement', label: 'Procurement', icon: BarChart3 },
  { id: 'marketplace', label: 'Marketplace', icon: Store },
  { id: 'payments', label: 'Payments', icon: CreditCard },
  { id: 'features', label: 'Features', icon: ToggleRight },
  { id: 'exports', label: 'Reports & Export', icon: Download },
  { id: 'email', label: 'Email Setup', icon: Mail },
  { id: 'audit', label: 'Audit Logs', icon: FileClock },
  { id: 'settings', label: 'Settings', icon: SlidersHorizontal },
  { id: 'security', label: 'Security', icon: ShieldCheck }
];

const quickActions = [
  ['Add Company', 'organizations', Building2],
  ['Edit Branding', 'branding', Palette],
  ['Add Organization', 'organizations', Plus],
  ['Add User', 'users', Users],
  ['Review Pending Bids', 'procurement', BarChart3],
  ['Export Data', 'exports', Download],
  ['Configure Email', 'email', Mail],
  ['View Audit Logs', 'audit', FileClock],
  ['View Payments', 'payments', CreditCard]
] as const;

const pageSizeOptions = [10, 20, 50];

const tabAliases: Record<string, TabId> = {
  companies: 'organizations',
  organizations: 'organizations',
  branding: 'branding',
  homepage: 'branding',
  users: 'users',
  roles: 'users',
  procurement: 'procurement',
  orders: 'procurement',
  delivery: 'procurement',
  marketplace: 'marketplace',
  payments: 'payments',
  escrow: 'payments',
  features: 'features',
  plans: 'features',
  entitlements: 'features',
  monitoring: 'security',
  reports: 'exports',
  export: 'exports',
  exports: 'exports',
  'audit-logs': 'audit',
  audit: 'audit',
  system: 'security',
  security: 'security',
  settings: 'settings'
};

export default function MasterAdminPage() {
  const { token } = useAuth();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const [activeTab, setActiveTab] = useState<TabId>('overview');
  const [overview, setOverview] = useState<any>(null);
  const [overviewLoading, setOverviewLoading] = useState(true);
  const [selectedCompanyId, setSelectedCompanyId] = useState<number | null>(null);
  const [companies, setCompanies] = useState<ApiPage<Company>>({ items: [], total: 0, page: 1, pageSize: 20 });
  const [organizations, setOrganizations] = useState<ApiPage<Organization>>({ items: [], total: 0, page: 1, pageSize: 20 });
  const [users, setUsers] = useState<ApiPage<UserRecord>>({ items: [], total: 0, page: 1, pageSize: 20 });
  const [procurement, setProcurement] = useState<ApiPage<BidRecord>>({ items: [], total: 0, page: 1, pageSize: 20 });
  const [marketplaceProducts, setMarketplaceProducts] = useState<ApiPage<MarketplaceProductRecord>>({ items: [], total: 0, page: 1, pageSize: 10 });
  const [marketplaceServices, setMarketplaceServices] = useState<ApiPage<MarketplaceServiceRecord>>({ items: [], total: 0, page: 1, pageSize: 10 });
  const [tenders, setTenders] = useState<ApiPage<TenderRecord>>({ items: [], total: 0, page: 1, pageSize: 10 });
  const [rfqs, setRfqs] = useState<ApiPage<RfqRecord>>({ items: [], total: 0, page: 1, pageSize: 10 });
  const [orders, setOrders] = useState<ApiPage<OrderRecord>>({ items: [], total: 0, page: 1, pageSize: 10 });
  const [invoices, setInvoices] = useState<ApiPage<InvoiceRecord>>({ items: [], total: 0, page: 1, pageSize: 10 });
  const [payments, setPayments] = useState<ApiPage<PaymentRecord>>({ items: [], total: 0, page: 1, pageSize: 20 });
  const [escrows, setEscrows] = useState<ApiPage<EscrowRecord>>({ items: [], total: 0, page: 1, pageSize: 10 });
  const [settlements, setSettlements] = useState<ApiPage<SettlementRecord>>({ items: [], total: 0, page: 1, pageSize: 10 });
  const [documents, setDocuments] = useState<ApiPage<DocumentRecord>>({ items: [], total: 0, page: 1, pageSize: 10 });
  const [features, setFeatures] = useState<Feature[]>([]);
  const [loadedFeatureCompanyId, setLoadedFeatureCompanyId] = useState<number | null>(null);
  const [emailSettings, setEmailSettings] = useState<any>(null);
  const [auditLogs, setAuditLogs] = useState<ApiPage<AuditRecord>>({ items: [], total: 0, page: 1, pageSize: 20 });
  const [security, setSecurity] = useState<any>(null);
  const [systemHealth, setSystemHealth] = useState<any>(null);
  const [portalSettings, setPortalSettings] = useState<any>(null);
  const [reports, setReports] = useState<any>(null);
  const [globalSearch, setGlobalSearch] = useState('');
  const debouncedGlobalSearch = useDebounce(globalSearch, 300);
  const [searchResults, setSearchResults] = useState<MasterSearchResult[]>([]);
  const [searchLoading, setSearchLoading] = useState(false);
  const [searchError, setSearchError] = useState<string | null>(null);
  const [loading, setLoading] = useState<Record<string, boolean>>({
    companies: true,
    organizations: true,
    users: true,
    procurement: true,
    marketplaceProducts: true,
    marketplaceServices: true,
    tenders: true,
    rfqs: true,
    orders: true,
    invoices: true,
    payments: true,
    escrows: true,
    settlements: true,
    documents: true,
    email: true,
    audit: true,
    security: true,
    systemHealth: true,
    settings: true,
    reports: true
  });
  const [error, setError] = useState<Record<string, string | null>>({});
  const [filters, setFilters] = useState<Record<FilterId, Record<string, string>>>({
    overview: {},
    organizations: { search: '', status: '', organizationType: '' },
    branding: { search: '' },
    users: { search: '', role: '', status: '' },
    procurement: { search: '', status: '' },
    marketplace: { search: '', status: '' },
    tenders: { search: '', status: '' },
    rfqs: { search: '', status: '' },
    orders: { search: '', status: '' },
    invoices: { search: '', status: '' },
    payments: { search: '', status: '' },
    escrows: { search: '', status: '' },
    settlements: { search: '', status: '' },
    documents: { search: '', status: '' },
    features: { search: '', module: '' },
    exports: {},
    email: {},
    audit: { search: '', action: '', entityType: '' },
    settings: {},
    security: {}
  });
  const [sorts, setSorts] = useState<Record<string, { field: string; direction: SortDirection }>>({
    companies: { field: 'updatedAt', direction: 'desc' },
    organizations: { field: 'updatedAt', direction: 'desc' },
    users: { field: 'createdAt', direction: 'desc' },
    procurement: { field: 'createdAt', direction: 'desc' },
    marketplaceProducts: { field: 'updatedAt', direction: 'desc' },
    marketplaceServices: { field: 'updatedAt', direction: 'desc' },
    tenders: { field: 'createdAt', direction: 'desc' },
    rfqs: { field: 'createdAt', direction: 'desc' },
    orders: { field: 'createdAt', direction: 'desc' },
    invoices: { field: 'createdAt', direction: 'desc' },
    payments: { field: 'createdAt', direction: 'desc' },
    escrows: { field: 'updatedAt', direction: 'desc' },
    settlements: { field: 'updatedAt', direction: 'desc' },
    documents: { field: 'createdAt', direction: 'desc' },
    audit: { field: 'createdAt', direction: 'desc' }
  });
  const [pages, setPages] = useState<Record<string, { page: number; pageSize: number }>>({
    companies: { page: 1, pageSize: 20 },
    organizations: { page: 1, pageSize: 20 },
    users: { page: 1, pageSize: 20 },
    procurement: { page: 1, pageSize: 20 },
    marketplaceProducts: { page: 1, pageSize: 10 },
    marketplaceServices: { page: 1, pageSize: 10 },
    tenders: { page: 1, pageSize: 10 },
    rfqs: { page: 1, pageSize: 10 },
    orders: { page: 1, pageSize: 10 },
    invoices: { page: 1, pageSize: 10 },
    payments: { page: 1, pageSize: 20 },
    escrows: { page: 1, pageSize: 10 },
    settlements: { page: 1, pageSize: 10 },
    documents: { page: 1, pageSize: 10 },
    audit: { page: 1, pageSize: 20 }
  });
  const [viewMode, setViewMode] = useResponsiveViewMode('master-admin:control-center:view-mode');
  const [actionDialog, setActionDialog] = useState<ActionDialogState>(null);
  const [editor, setEditor] = useState<EditorState>(null);
  const [mutating, setMutating] = useState(false);
  const debouncedFilters = useDebounce(filters, 350);

  const fetchJson = async <T,>(path: string): Promise<T> => {
    const authToken = token || (typeof window !== 'undefined' ? localStorage.getItem('token') : null);
    const headers = authToken ? { Authorization: `Bearer ${authToken}` } : undefined;
    const res = await api.fetch(path, { headers, skipCache: true });
    const body = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error(body?.message || 'Request failed');
    return (body?.data ?? body) as T;
  };

  const setBusy = (key: string, busy: boolean) => setLoading(prev => ({ ...prev, [key]: busy }));
  const setSectionError = (key: string, message: string | null) => setError(prev => ({ ...prev, [key]: message }));

  const loadOverview = async () => {
    setOverviewLoading(true);
    try {
      const data = await fetchJson<any>('/api/master-admin/dashboard');
      setOverview(data);
      setSectionError('overview', null);
    } catch (err: any) {
      setSectionError('overview', err.message);
    } finally {
      setOverviewLoading(false);
    }
  };

  const loadCompanies = async () => {
    setBusy('companies', true);
    try {
      const data = await fetchJson<ApiPage<Company>>(endpoint('/api/master-admin/companies', {
        ...pages.companies,
        search: debouncedFilters.organizations.search,
        status: debouncedFilters.organizations.status,
        sortBy: sorts.companies.field,
        sortOrder: sorts.companies.direction
      }));
      setCompanies(data);
      setSelectedCompanyId(current => current ?? data.items[0]?.id ?? null);
      setSectionError('companies', null);
    } catch (err: any) {
      setSectionError('companies', err.message);
    } finally {
      setBusy('companies', false);
    }
  };

  const loadOrganizations = async () => {
    setBusy('organizations', true);
    try {
      const data = await fetchJson<ApiPage<Organization>>(endpoint('/api/master-admin/organizations', {
        ...pages.organizations,
        search: debouncedFilters.organizations.search,
        status: debouncedFilters.organizations.status,
        organizationType: debouncedFilters.organizations.organizationType,
        sortBy: sorts.organizations.field,
        sortOrder: sorts.organizations.direction
      }));
      setOrganizations(data);
      setSectionError('organizations', null);
    } catch (err: any) {
      setSectionError('organizations', err.message);
    } finally {
      setBusy('organizations', false);
    }
  };

  const loadUsers = async () => {
    setBusy('users', true);
    try {
      const data = await fetchJson<ApiPage<UserRecord>>(endpoint('/api/master-admin/users', {
        ...pages.users,
        search: debouncedFilters.users.search,
        role: debouncedFilters.users.role,
        status: debouncedFilters.users.status,
        sortBy: sorts.users.field,
        sortOrder: sorts.users.direction
      }));
      setUsers(data);
      setSectionError('users', null);
    } catch (err: any) {
      setSectionError('users', err.message);
    } finally {
      setBusy('users', false);
    }
  };

  const loadProcurement = async () => {
    setBusy('procurement', true);
    try {
      const data = await fetchJson<ApiPage<BidRecord>>(endpoint('/api/master-admin/procurement', {
        ...pages.procurement,
        search: debouncedFilters.procurement.search,
        status: debouncedFilters.procurement.status,
        sortBy: sorts.procurement.field,
        sortOrder: sorts.procurement.direction
      }));
      setProcurement(data);
      setSectionError('procurement', null);
    } catch (err: any) {
      setSectionError('procurement', err.message);
    } finally {
      setBusy('procurement', false);
    }
  };

  const loadMarketplaceProducts = async () => {
    setBusy('marketplaceProducts', true);
    try {
      const data = await masterAdminApi.getMarketplaceProducts({
        ...pages.marketplaceProducts,
        search: debouncedFilters.marketplace.search,
        status: debouncedFilters.marketplace.status,
        sortBy: sorts.marketplaceProducts.field,
        sortOrder: sorts.marketplaceProducts.direction
      }) as ApiPage<MarketplaceProductRecord>;
      setMarketplaceProducts(data);
      setSectionError('marketplaceProducts', null);
    } catch (err: any) {
      setSectionError('marketplaceProducts', err.message);
    } finally {
      setBusy('marketplaceProducts', false);
    }
  };

  const loadMarketplaceServices = async () => {
    setBusy('marketplaceServices', true);
    try {
      const data = await masterAdminApi.getMarketplaceServices({
        ...pages.marketplaceServices,
        search: debouncedFilters.marketplace.search,
        status: debouncedFilters.marketplace.status,
        sortBy: sorts.marketplaceServices.field,
        sortOrder: sorts.marketplaceServices.direction
      }) as ApiPage<MarketplaceServiceRecord>;
      setMarketplaceServices(data);
      setSectionError('marketplaceServices', null);
    } catch (err: any) {
      setSectionError('marketplaceServices', err.message);
    } finally {
      setBusy('marketplaceServices', false);
    }
  };

  const loadTenders = async () => {
    setBusy('tenders', true);
    try {
      const data = await fetchJson<ApiPage<TenderRecord>>(endpoint('/api/master-admin/tenders', {
        ...pages.tenders,
        search: debouncedFilters.tenders.search,
        status: debouncedFilters.tenders.status,
        sortBy: sorts.tenders.field,
        sortOrder: sorts.tenders.direction
      }));
      setTenders(data);
      setSectionError('tenders', null);
    } catch (err: any) {
      setSectionError('tenders', err.message);
    } finally {
      setBusy('tenders', false);
    }
  };

  const loadRfqs = async () => {
    setBusy('rfqs', true);
    try {
      const data = await fetchJson<ApiPage<RfqRecord>>(endpoint('/api/master-admin/rfqs', {
        ...pages.rfqs,
        search: debouncedFilters.rfqs.search,
        status: debouncedFilters.rfqs.status,
        sortBy: sorts.rfqs.field,
        sortOrder: sorts.rfqs.direction
      }));
      setRfqs(data);
      setSectionError('rfqs', null);
    } catch (err: any) {
      setSectionError('rfqs', err.message);
    } finally {
      setBusy('rfqs', false);
    }
  };

  const loadOrders = async () => {
    setBusy('orders', true);
    try {
      const data = await fetchJson<ApiPage<OrderRecord>>(endpoint('/api/master-admin/orders', {
        ...pages.orders,
        search: debouncedFilters.orders.search,
        status: debouncedFilters.orders.status,
        sortBy: sorts.orders.field,
        sortOrder: sorts.orders.direction
      }));
      setOrders(data);
      setSectionError('orders', null);
    } catch (err: any) {
      setSectionError('orders', err.message);
    } finally {
      setBusy('orders', false);
    }
  };

  const loadInvoices = async () => {
    setBusy('invoices', true);
    try {
      const data = await fetchJson<ApiPage<InvoiceRecord>>(endpoint('/api/master-admin/invoices', {
        ...pages.invoices,
        search: debouncedFilters.invoices.search,
        status: debouncedFilters.invoices.status,
        sortBy: sorts.invoices.field,
        sortOrder: sorts.invoices.direction
      }));
      setInvoices(data);
      setSectionError('invoices', null);
    } catch (err: any) {
      setSectionError('invoices', err.message);
    } finally {
      setBusy('invoices', false);
    }
  };

  const loadPayments = async () => {
    setBusy('payments', true);
    try {
      const data = await fetchJson<ApiPage<PaymentRecord>>(endpoint('/api/master-admin/payments', {
        ...pages.payments,
        search: debouncedFilters.payments.search,
        status: debouncedFilters.payments.status,
        sortBy: sorts.payments.field,
        sortOrder: sorts.payments.direction
      }));
      setPayments(data);
      setSectionError('payments', null);
    } catch (err: any) {
      setSectionError('payments', err.message);
    } finally {
      setBusy('payments', false);
    }
  };

  const loadEscrows = async () => {
    setBusy('escrows', true);
    try {
      const data = await masterAdminApi.getEscrowAccounts({
        ...pages.escrows,
        search: debouncedFilters.escrows.search,
        status: debouncedFilters.escrows.status,
        sortBy: sorts.escrows.field,
        sortOrder: sorts.escrows.direction
      }) as ApiPage<EscrowRecord>;
      setEscrows(data);
      setSectionError('escrows', null);
    } catch (err: any) {
      setSectionError('escrows', err.message);
    } finally {
      setBusy('escrows', false);
    }
  };

  const loadSettlements = async () => {
    setBusy('settlements', true);
    try {
      const data = await masterAdminApi.getPaymentSettlements({
        ...pages.settlements,
        search: debouncedFilters.settlements.search,
        status: debouncedFilters.settlements.status,
        sortBy: sorts.settlements.field,
        sortOrder: sorts.settlements.direction
      }) as ApiPage<SettlementRecord>;
      setSettlements(data);
      setSectionError('settlements', null);
    } catch (err: any) {
      setSectionError('settlements', err.message);
    } finally {
      setBusy('settlements', false);
    }
  };

  const loadDocuments = async () => {
    setBusy('documents', true);
    try {
      const data = await masterAdminApi.getDocuments({
        ...pages.documents,
        search: debouncedFilters.documents.search,
        status: debouncedFilters.documents.status,
        sortBy: sorts.documents.field,
        sortOrder: sorts.documents.direction
      }) as ApiPage<DocumentRecord>;
      setDocuments(data);
      setSectionError('documents', null);
    } catch (err: any) {
      setSectionError('documents', err.message);
    } finally {
      setBusy('documents', false);
    }
  };

  const loadFeatures = async () => {
    if (!selectedCompanyId) {
      setBusy('features', false);
      setLoadedFeatureCompanyId(null);
      return;
    }
    setBusy('features', true);
    try {
      const data = await fetchJson<{ items: Feature[] }>(`/api/master-admin/companies/${selectedCompanyId}/features`);
      setFeatures(data.items || []);
      setLoadedFeatureCompanyId(selectedCompanyId);
      setSectionError('features', null);
    } catch (err: any) {
      setSectionError('features', err.message);
      setLoadedFeatureCompanyId(selectedCompanyId);
    } finally {
      setBusy('features', false);
    }
  };

  const loadEmail = async () => {
    setBusy('email', true);
    try {
      setEmailSettings(await fetchJson<any>('/api/master-admin/email-settings'));
      setSectionError('email', null);
    } catch (err: any) {
      setSectionError('email', err.message);
    } finally {
      setBusy('email', false);
    }
  };

  const loadAudit = async () => {
    setBusy('audit', true);
    try {
      const data = await fetchJson<ApiPage<AuditRecord>>(endpoint('/api/master-admin/audit-logs', {
        ...pages.audit,
        search: debouncedFilters.audit.search,
        action: debouncedFilters.audit.action,
        entityType: debouncedFilters.audit.entityType,
        sortBy: sorts.audit.field,
        sortOrder: sorts.audit.direction
      }));
      setAuditLogs(data);
      setSectionError('audit', null);
    } catch (err: any) {
      setSectionError('audit', err.message);
    } finally {
      setBusy('audit', false);
    }
  };

  const loadSecurity = async () => {
    setBusy('security', true);
    try {
      setSecurity(await fetchJson<any>('/api/master-admin/security-overview'));
      setSectionError('security', null);
    } catch (err: any) {
      setSectionError('security', err.message);
    } finally {
      setBusy('security', false);
    }
  };

  const loadSystemHealth = async () => {
    setBusy('systemHealth', true);
    try {
      setSystemHealth(await masterAdminApi.getMasterSystemHealth());
      setSectionError('systemHealth', null);
    } catch (err: any) {
      setSectionError('systemHealth', err.message);
    } finally {
      setBusy('systemHealth', false);
    }
  };

  const loadSettings = async () => {
    setBusy('settings', true);
    try {
      setPortalSettings(await masterAdminApi.getPortalSettings());
      setSectionError('settings', null);
    } catch (err: any) {
      setSectionError('settings', err.message);
    } finally {
      setBusy('settings', false);
    }
  };

  const loadReports = async () => {
    setBusy('reports', true);
    try {
      setReports(await masterAdminApi.getReports());
      setSectionError('reports', null);
    } catch (err: any) {
      setSectionError('reports', err.message);
    } finally {
      setBusy('reports', false);
    }
  };

  useEffect(() => {
    if (activeTab === 'overview') {
      void loadOverview();
    }
  }, [activeTab]);

  useEffect(() => {
    if (activeTab === 'organizations' || activeTab === 'branding' || activeTab === 'features' || editor?.type === 'organization' || editor?.type === 'user') {
      void loadCompanies();
    }
  }, [activeTab, editor?.type, pages.companies, debouncedFilters.organizations.search, debouncedFilters.organizations.status, sorts.companies]);

  useEffect(() => {
    if (activeTab === 'organizations' || editor?.type === 'user') {
      void loadOrganizations();
    }
  }, [activeTab, editor?.type, pages.organizations, debouncedFilters.organizations, sorts.organizations]);

  useEffect(() => {
    if (activeTab === 'users') {
      void loadUsers();
    }
  }, [activeTab, pages.users, debouncedFilters.users, sorts.users]);

  useEffect(() => {
    if (activeTab === 'procurement') {
      void loadProcurement();
    }
  }, [activeTab, pages.procurement, debouncedFilters.procurement, sorts.procurement]);

  useEffect(() => {
    if (activeTab === 'marketplace') {
      void loadMarketplaceProducts();
    }
  }, [activeTab, pages.marketplaceProducts, debouncedFilters.marketplace, sorts.marketplaceProducts]);

  useEffect(() => {
    if (activeTab === 'marketplace') {
      void loadMarketplaceServices();
    }
  }, [activeTab, pages.marketplaceServices, debouncedFilters.marketplace, sorts.marketplaceServices]);

  useEffect(() => {
    if (activeTab === 'procurement') {
      void loadTenders();
    }
  }, [activeTab, pages.tenders, debouncedFilters.tenders, sorts.tenders]);

  useEffect(() => {
    if (activeTab === 'procurement') {
      void loadRfqs();
    }
  }, [activeTab, pages.rfqs, debouncedFilters.rfqs, sorts.rfqs]);

  useEffect(() => {
    if (activeTab === 'procurement') {
      void loadOrders();
    }
  }, [activeTab, pages.orders, debouncedFilters.orders, sorts.orders]);

  useEffect(() => {
    if (activeTab === 'payments') {
      void loadInvoices();
    }
  }, [activeTab, pages.invoices, debouncedFilters.invoices, sorts.invoices]);

  useEffect(() => {
    if (activeTab === 'payments') {
      void loadPayments();
    }
  }, [activeTab, pages.payments, debouncedFilters.payments, sorts.payments]);

  useEffect(() => {
    if (activeTab === 'payments') {
      void loadEscrows();
    }
  }, [activeTab, pages.escrows, debouncedFilters.escrows, sorts.escrows]);

  useEffect(() => {
    if (activeTab === 'payments') {
      void loadSettlements();
    }
  }, [activeTab, pages.settlements, debouncedFilters.settlements, sorts.settlements]);

  useEffect(() => {
    if (activeTab === 'exports') {
      void loadDocuments();
    }
  }, [activeTab, pages.documents, debouncedFilters.documents, sorts.documents]);

  useEffect(() => {
    if (activeTab === 'features' && selectedCompanyId) {
      void loadFeatures();
    }
  }, [activeTab, selectedCompanyId]);

  useEffect(() => {
    if (activeTab === 'email') {
      void loadEmail();
    }
  }, [activeTab]);

  useEffect(() => {
    if (activeTab === 'security') {
      void loadSecurity();
      void loadSystemHealth();
    }
  }, [activeTab]);

  useEffect(() => {
    if (activeTab === 'branding' || activeTab === 'settings') {
      void loadSettings();
    }
  }, [activeTab]);

  useEffect(() => {
    if (activeTab === 'organizations' || activeTab === 'exports') {
      void loadReports();
    }
  }, [activeTab]);

  useEffect(() => {
    if (activeTab === 'audit') {
      void loadAudit();
    }
  }, [activeTab, pages.audit, debouncedFilters.audit, sorts.audit]);

  useEffect(() => {
    if (debouncedGlobalSearch.trim().length < 2) {
      setSearchResults([]);
      setSearchError(null);
      setSearchLoading(false);
      return;
    }
    let active = true;
    setSearchLoading(true);
    masterAdminApi.searchMasterAdmin({ q: debouncedGlobalSearch.trim(), limit: 4 })
      .then((data: any) => {
        if (!active) return;
        setSearchResults(data.items || []);
        setSearchError(null);
      })
      .catch((err: any) => {
        if (!active) return;
        setSearchError(err.message || 'Search failed');
      })
      .finally(() => {
        if (active) setSearchLoading(false);
      });
    return () => { active = false; };
  }, [debouncedGlobalSearch]);
  useEffect(() => {
    const requestedTab = pathname?.split('/').filter(Boolean)[1] || searchParams?.get('tab');
    if (!requestedTab) return;
    const tab = tabAliases[requestedTab];
    if (tab) setActiveTab(tab);
  }, [pathname, searchParams]);

  const summaryCards = useMemo(() => {
    const summary = overview?.summary || {};
    return [
      ['Organizations', summary.totalOrganizations, `${summary.activeOrganizations || 0} verified`, Building2, 'blue'],
      ['Pending Orgs', summary.pendingOrganizations, `${summary.suspendedOrganizations || 0} suspended`, AlertTriangle, 'amber'],
      ['Users', summary.totalUsers, `${summary.totalBuyers || 0} buyers / ${summary.totalSellers || 0} sellers`, Users, 'green'],
      ['Active Bids', summary.activeBids, `${summary.pendingApprovals || 0} pending approvals`, BarChart3, 'blue'],
      ['Payments', summary.totalPayments, `${summary.pendingSettlements || 0} pending settlements`, CreditCard, 'green'],
      ['Fraud Alerts', summary.openFraudAlerts, 'open security signals', ShieldCheck, 'red']
    ];
  }, [overview]);

  const visibleFeatures = useMemo(() => {
    const text = filters.features.search.toLowerCase();
    const moduleFilter = filters.features.module.toLowerCase();
    return features.filter(feature =>
      (!text || `${feature.name} ${feature.code} ${feature.description || ''}`.toLowerCase().includes(text)) &&
      (!moduleFilter || feature.module.toLowerCase().includes(moduleFilter))
    );
  }, [features, filters.features]);

  const visibleBrandingCompanies = useMemo(() => {
    const text = filters.branding.search.toLowerCase();
    return companies.items.filter(company =>
      !text || `${company.name || ''} ${company.portalDisplayName || ''} ${company.district || ''} ${company.state || ''}`.toLowerCase().includes(text)
    );
  }, [companies.items, filters.branding.search]);

  const selectedCompany = useMemo(
    () => companies.items.find(company => company.id === selectedCompanyId) || companies.items[0] || null,
    [companies.items, selectedCompanyId]
  );

  const initialPageLoading = overviewLoading && activeTab === 'overview';

  const updateFilter = (tab: FilterId, key: string, value: string) => {
    setFilters(prev => ({ ...prev, [tab]: { ...prev[tab], [key]: value } }));
    const pageKey = tab === 'organizations' ? 'organizations' : tab;
    if (pages[pageKey]) setPages(prev => ({ ...prev, [pageKey]: { ...prev[pageKey], page: 1 } }));
  };

  const resetFilters = (tab: FilterId) => {
    setFilters(prev => ({ ...prev, [tab]: Object.fromEntries(Object.keys(prev[tab]).map(key => [key, ''])) }));
    const pageKey = tab === 'organizations' ? 'organizations' : tab;
    if (pages[pageKey]) setPages(prev => ({ ...prev, [pageKey]: { ...prev[pageKey], page: 1 } }));
  };

  const onSort = (key: string, field: string) => {
    setSorts(prev => ({
      ...prev,
      [key]: {
        field,
        direction: prev[key]?.field === field && prev[key]?.direction === 'asc' ? 'desc' : 'asc'
      }
    }));
  };

  const setPageState = (key: string, page: number) => setPages(prev => ({ ...prev, [key]: { ...prev[key], page } }));
  const setPageSizeState = (key: string, pageSize: number) => setPages(prev => ({ ...prev, [key]: { page: 1, pageSize } }));
  const refreshActive = () => {
    const loaders: Record<TabId, () => Promise<void>> = {
      overview: loadOverview,
      organizations: async () => { await Promise.all([loadCompanies(), loadOrganizations(), loadReports()]); },
      branding: async () => { await Promise.all([loadCompanies(), loadSettings()]); },
      users: loadUsers,
      procurement: async () => { await Promise.all([loadProcurement(), loadTenders(), loadRfqs(), loadOrders()]); },
      marketplace: async () => { await Promise.all([loadMarketplaceProducts(), loadMarketplaceServices()]); },
      payments: async () => { await Promise.all([loadPayments(), loadInvoices(), loadEscrows(), loadSettlements()]); },
      features: loadFeatures,
      exports: async () => { await Promise.all([loadReports(), loadDocuments()]); },
      email: loadEmail,
      audit: loadAudit,
      settings: loadSettings,
      security: async () => { await Promise.all([loadSecurity(), loadSystemHealth()]); }
    };
    void loaders[activeTab]();
  };

  const exportCsv = (label: string, rows: Array<Record<string, any>>) => {
    if (!rows.length) {
      toast.info(`No ${label} records are loaded to export.`);
      return;
    }
    const keySet = rows.reduce<Set<string>>((set, row) => {
      Object.keys(row).forEach(key => {
        if (typeof row[key] !== 'object' || row[key] == null) set.add(key);
      });
      return set;
    }, new Set<string>());
    const keys = Array.from(keySet);
    const csv = [
      keys.join(','),
      ...rows.map(row => keys.map(key => csvCell(row[key])).join(','))
    ].join('\n');
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `master-admin-${label}-${new Date().toISOString().slice(0, 10)}.csv`;
    link.click();
    URL.revokeObjectURL(url);
    toast.success(`${labelize(label)} export prepared`);
  };

  const exportMasterReport = async (module: string, label: string, fallbackRows: Array<Record<string, any>>) => {
    const reason = window.prompt(`Reason for exporting ${label}`);
    if (!reason || reason.trim().length < 4) {
      toast.info('Export cancelled. A reason is required for audit logging.');
      return;
    }
    try {
      const blob = await masterAdminApi.downloadReportExport({ module, reason: reason.trim(), limit: 5000 });
      const url = URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      link.download = `master-admin-${module}-${new Date().toISOString().slice(0, 10)}.csv`;
      link.click();
      URL.revokeObjectURL(url);
      toast.success(`${label} export downloaded`);
    } catch (err: any) {
      toast.error(err.message || 'Backend export failed. Preparing loaded rows only.');
      exportCsv(module, fallbackRows);
    }
  };

  const openAction = (dialog: NonNullable<ActionDialogState>) => setActionDialog(dialog);

  const runAction = async (reason: string) => {
    if (!actionDialog) return;
    setMutating(true);
    let successMessage: string | undefined;
    try {
      const { entity, action, id, featureKey, status } = actionDialog;
      if (entity === 'organization' && id) {
        const actions: Record<string, () => Promise<any>> = {
          activate: () => masterAdminApi.activateOrganization(id, reason),
          inactivate: () => masterAdminApi.inactivateOrganization(id, reason),
          suspend: () => masterAdminApi.suspendOrganization(id, reason),
          reactivate: () => masterAdminApi.reactivateOrganization(id, reason),
          archive: () => masterAdminApi.archiveOrganizationPatch(id, reason, true),
          close: () => masterAdminApi.closeOrganization(id, reason, true),
          restore: () => masterAdminApi.restoreOrganization(id, reason),
          allowGstReuse: () => masterAdminApi.allowGstReuse(id, reason, true),
          revokeGstReuse: () => masterAdminApi.revokeGstReuse(id, reason, true)
        };
        await actions[action]?.();
        await loadOrganizations();
      }
      if (entity === 'company' && id) {
        const path = `/api/master-admin/companies/${id}/${action}`;
        const res = await api.fetch(path, {
          method: 'POST',
          body: JSON.stringify({ reason }),
          headers: token ? { Authorization: `Bearer ${token}` } : undefined,
          skipCache: true
        });
        const body = await res.json().catch(() => ({}));
        if (!res.ok) throw new Error(body?.message || 'Request failed');
        await loadCompanies();
      }
      if (entity === 'user' && id) {
        const actions: Record<string, () => Promise<any>> = {
          activate: () => masterAdminApi.activateUser(id, reason),
          inactivate: () => masterAdminApi.inactivateUser(id, reason),
          suspend: () => masterAdminApi.suspendUser(id, reason),
          reactivate: () => masterAdminApi.reactivateUser(id, reason),
          archive: () => masterAdminApi.archiveUser(id, reason),
          invite: () => masterAdminApi.sendUserInvite(id, reason),
          resetPassword: () => masterAdminApi.resetUserPassword(id, reason)
        };
        const result: any = await actions[action]?.();
        if (action === 'resetPassword' && result?.temporaryPassword) {
          toast.success(`Temporary password generated: ${result.temporaryPassword}`);
        }
        await loadUsers();
      }
      if (entity === 'feature' && selectedCompanyId && featureKey) {
        const res = await api.fetch(`/api/master-admin/companies/${selectedCompanyId}/features/${featureKey}/${action}`, {
          method: 'POST',
          body: JSON.stringify({ reason }),
          headers: token ? { Authorization: `Bearer ${token}` } : undefined,
          skipCache: true
        });
        const body = await res.json().catch(() => ({}));
        if (!res.ok) throw new Error(body?.message || 'Request failed');
        await loadFeatures();
      }
      if (entity === 'email' && action === 'test') {
        await masterAdminApi.sendTestEmail({ to: reason, reason: 'Master admin SMTP test' });
      }
      if (entity === 'marketplaceProduct' && id && status) {
        await masterAdminApi.updateMarketplaceProductStatus(id, status, reason);
        await loadMarketplaceProducts();
      }
      if (entity === 'marketplaceService' && id && status) {
        await masterAdminApi.updateMarketplaceServiceStatus(id, status, reason);
        await loadMarketplaceServices();
      }
      if (entity === 'order' && id && status) {
        await masterAdminApi.updateOrderStatus(id, status, reason);
        await loadOrders();
      }
      if (entity === 'invoice' && id && status) {
        await masterAdminApi.updateInvoiceStatus(id, status, reason);
        await loadInvoices();
      }
      if (entity === 'payment' && id && status) {
        await masterAdminApi.updatePaymentStatus(id, status, reason);
        await loadPayments();
      }
      if (entity === 'escrow' && id && status) {
        await masterAdminApi.updateEscrowStatus(id, status, reason);
        await loadEscrows();
      }
      toast.success(successMessage || `${labelize(action)} completed`);
      setActionDialog(null);
      await loadOverview();
    } catch (err: any) {
      toast.error(err.message || 'Action failed');
    } finally {
      setMutating(false);
    }
  };

  const saveEditor = async (values: Record<string, any>) => {
    if (!editor) return;
    setMutating(true);
    try {
      if (editor.type === 'organization') {
        if (editor.mode === 'create') await masterAdminApi.createOrganization(values);
        else await masterAdminApi.updateOrganization(Number(editor.record.id), values);
        await loadOrganizations();
        await loadCompanies();
      }
      if (editor.type === 'company') {
        if (editor.mode === 'create') await masterAdminApi.createCompany(values);
        else await masterAdminApi.updateCompany(Number(editor.record.id), values);
        await loadCompanies();
        await loadFeatures();
        await loadSettings();
      }
      if (editor.type === 'user') {
        if (editor.mode === 'create') await masterAdminApi.createUser(values);
        else await masterAdminApi.updateUser(Number(editor.record.id), values);
        await loadUsers();
      }
      if (editor.type === 'email') {
        await masterAdminApi.updateEmailSettings(values);
        await loadEmail();
      }
      toast.success(`${labelize(editor.type)} saved`);
      setEditor(null);
      await loadOverview();
    } catch (err: any) {
      toast.error(err.message || 'Save failed');
    } finally {
      setMutating(false);
    }
  };

  if (initialPageLoading) return <PremiumLoader />;

  return (
    <div className="min-h-full bg-slate-50">
      <div className="mx-auto max-w-[1560px] space-y-5 px-3 py-4 sm:px-5 lg:px-6">
        <header className="rounded-md border border-slate-200 bg-white px-4 py-4 shadow-sm">
          <div className="flex flex-col gap-4 xl:flex-row xl:items-center xl:justify-between">
            <div>
              <p className="text-[10px] font-black uppercase tracking-[0.22em] text-[#c27803]">JsgSmile Governance</p>
              <h1 className="mt-1 text-2xl font-black text-[#12335f] sm:text-3xl">Master Admin Control Center</h1>
              <p className="mt-2 max-w-4xl text-sm font-medium leading-6 text-slate-600">
                Complete portal governance, organization control, user management, feature settings, procurement monitoring, payment oversight, and security review.
              </p>
            </div>
            <div className="flex flex-wrap gap-2">
              {quickActions.map(([label, tab, Icon]) => (
                <Button
                  key={label}
                  type="button"
                  variant="outline"
                  onClick={() => {
                    setActiveTab(tab);
                    if (label === 'Add Company') setEditor({ type: 'company', mode: 'create' });
                    if (label === 'Edit Branding') setEditor({ type: 'company', mode: 'edit', record: portalSettings?.company || companies.items[0] || {} });
                    if (label === 'Add Organization') setEditor({ type: 'organization', mode: 'create' });
                    if (label === 'Add User') setEditor({ type: 'user', mode: 'create' });
                    if (label === 'Configure Email') setEditor({ type: 'email', mode: 'edit', record: emailSettings?.smtp || {} });
                  }}
                  className="h-9 rounded-md text-xs font-black"
                >
                  <Icon className="mr-2 h-4 w-4" />
                  {label}
                </Button>
              ))}
              <Button type="button" onClick={refreshActive} className="h-9 rounded-md bg-[#12335f] text-xs font-black text-white hover:bg-[#0d274b]">
                <RefreshCw className="mr-2 h-4 w-4" />
                Refresh
              </Button>
            </div>
          </div>
        </header>

        <div className="flex gap-2 overflow-x-auto rounded-md border border-slate-200 bg-white p-2 shadow-sm">
          {tabs.map(tab => (
            <button
              key={tab.id}
              type="button"
              onClick={() => setActiveTab(tab.id)}
              className={cn(
                'inline-flex h-10 shrink-0 items-center gap-2 rounded-md px-3 text-xs font-black transition',
                activeTab === tab.id ? 'bg-[#12335f] text-white shadow-sm' : 'text-slate-600 hover:bg-slate-100 hover:text-[#12335f]'
              )}
            >
              <tab.icon className="h-4 w-4" />
              {tab.label}
            </button>
          ))}
        </div>

        <Panel title="Global Master Admin Search" icon={Search} loading={searchLoading} error={searchError}>
          <div className="space-y-3">
            <SearchInput value={globalSearch} onChange={setGlobalSearch} placeholder="Search companies, users, organizations, tenders, RFQs, orders, payments, listings, and documents..." />
            {globalSearch.trim().length < 2 ? (
              <p className="text-xs font-semibold text-slate-500">Enter at least 2 characters to search across protected Master Admin data.</p>
            ) : (
              <div className="grid gap-2 md:grid-cols-2 xl:grid-cols-4">
                {searchResults.map(result => (
                  <a
                    key={`${result.type}-${result.id}`}
                    href={result.href || '/master-admin'}
                    className="rounded-md border border-slate-200 bg-slate-50 p-3 transition hover:border-[#12335f]/30 hover:bg-white"
                  >
                    <div className="flex items-start justify-between gap-2">
                      <div className="min-w-0">
                        <p className="text-[10px] font-black uppercase tracking-wider text-slate-500">{result.type}</p>
                        <p className="mt-1 truncate text-sm font-black text-slate-900">{result.title}</p>
                      </div>
                      {result.status ? <span className="shrink-0 rounded-md bg-white px-2 py-1 text-[10px] font-black uppercase text-[#12335f]">{formatCell(result.status)}</span> : null}
                    </div>
                    <p className="mt-2 line-clamp-2 text-xs font-semibold leading-5 text-slate-500">{result.subtitle || result.company || 'Open record'}</p>
                    <p className="mt-2 text-[10px] font-bold uppercase tracking-wider text-slate-400">{result.company || 'Platform'}{result.updatedAt ? ` - ${formatDate(result.updatedAt)}` : ''}</p>
                  </a>
                ))}
                {!searchLoading && !searchResults.length ? <EmptyState /> : null}
              </div>
            )}
          </div>
        </Panel>

        {activeTab === 'overview' && (
          <section className="space-y-4">
            <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-6">
              {summaryCards.map(([label, value, subtext, Icon, tone]: any) => (
                <KpiCard key={label} label={label} value={value ?? 0} subtext={subtext} icon={Icon} tone={tone} />
              ))}
            </div>
            <div className="grid gap-4 xl:grid-cols-[1.4fr_1fr]">
              <Panel title="Recent Audit Trail" icon={FileClock} error={error.overview}>
                <SimpleList rows={overview?.recentAuditLogs || []} primary="action" secondary="entityType" meta="createdAt" />
              </Panel>
              <Panel title="Production Guardrails" icon={ShieldCheck}>
                <div className="grid gap-2">
                  {[
                    'Master-only backend routes enforced',
                    'Secrets are masked and sourced from environment',
                    'Production CORS requires explicit origins',
                    'Archive and restore actions require a reason',
                    'Payments, settlements, audit logs are never hard-deleted'
                  ].map(item => <StatusLine key={item} label={item} ok />)}
                </div>
              </Panel>
            </div>
          </section>
        )}

        {activeTab === 'organizations' && (
          <section className="space-y-4">
            <Toolbar
              tab="organizations"
              filters={filters.organizations}
              updateFilter={updateFilter}
              resetFilters={resetFilters}
              viewMode={viewMode}
              setViewMode={setViewMode}
              selects={[
                ['status', 'All statuses', ['VERIFIED', 'PENDING', 'UNDER_REVIEW', 'REJECTED', 'SUSPENDED']],
                ['organizationType', 'All organization types', ['Buyer', 'Seller', 'MSME', 'Large Industry', 'Government', 'Private', 'PSU', 'Service Provider']]
              ]}
            />
            <div className="flex flex-wrap gap-2">
              <Button type="button" className="h-9 rounded-md bg-[#12335f] text-xs font-black text-white hover:bg-[#0d274b]" onClick={() => setEditor({ type: 'company', mode: 'create' })}>
                <Plus className="mr-2 h-4 w-4" />
                Add Company
              </Button>
              <Button type="button" variant="outline" className="h-9 rounded-md text-xs font-black" onClick={() => setEditor({ type: 'organization', mode: 'create' })}>
                <Plus className="mr-2 h-4 w-4" />
                Add Organization
              </Button>
            </div>
            <CompanyDetailTabs
              company={selectedCompany}
              reports={reports}
              onOpenTab={setActiveTab}
              onEdit={() => setEditor({ type: 'company', mode: 'edit', record: selectedCompany || {} })}
            />
            <div className="grid gap-4 xl:grid-cols-[minmax(0,1fr)_minmax(0,1.2fr)]">
              <PaginatedTable
                title="Companies"
                icon={Building2}
                rows={companies.items}
                total={companies.total}
                page={pages.companies.page}
                pageSize={pages.companies.pageSize}
                loading={loading.companies}
                error={error.companies}
                columns={[
                  ['name', 'Company'],
                  ['portalDisplayName', 'Portal'],
                  ['district', 'District'],
                  ['state', 'State'],
                  ['isActive', 'Active']
                ]}
                sort={sorts.companies}
                onSort={field => onSort('companies', field)}
                onPageChange={page => setPageState('companies', page)}
                onPageSizeChange={size => setPageSizeState('companies', size)}
                viewMode={viewMode}
                actions={row => (
                  <EntityActions
                    label={row.name || 'company'}
                    active={Boolean(row.isActive)}
                    onEdit={() => setEditor({ type: 'company', mode: 'edit', record: row })}
                    onActivate={() => openAction({ entity: 'company', action: row.isActive ? 'inactivate' : 'reactivate', id: row.id, label: row.name || 'company' })}
                    onSuspend={() => openAction({ entity: 'company', action: 'suspend', id: row.id, label: row.name || 'company' })}
                    onArchive={() => openAction({ entity: 'company', action: 'archive', id: row.id, label: row.name || 'company', danger: true })}
                  />
                )}
              />
              <PaginatedTable
                title="Organizations"
                icon={Building2}
                rows={organizations.items}
                total={organizations.total}
                page={pages.organizations.page}
                pageSize={pages.organizations.pageSize}
                loading={loading.organizations}
                error={error.organizations}
                columns={[
                  ['organizationName', 'Organization'],
                  ['organizationType', 'Type'],
                  ['verificationStatus', 'Verification'],
                  ['state', 'State'],
                  ['updatedAt', 'Updated']
                ]}
                sort={sorts.organizations}
                onSort={field => onSort('organizations', field)}
                onPageChange={page => setPageState('organizations', page)}
                onPageSizeChange={size => setPageSizeState('organizations', size)}
                viewMode={viewMode}
                actions={row => (
                  <OrganizationActions
                    org={row}
                    onEdit={() => setEditor({ type: 'organization', mode: 'edit', record: row })}
                    onActivate={() => openAction({ entity: 'organization', action: row.verificationStatus === 'VERIFIED' && !row.isBlacklisted ? 'inactivate' : 'reactivate', id: row.id, label: row.organizationName || 'organization' })}
                    onSuspend={() => openAction({ entity: 'organization', action: 'suspend', id: row.id, label: row.organizationName || 'organization' })}
                    onArchive={() => openAction({ entity: 'organization', action: 'archive', id: row.id, label: row.organizationName || 'organization', danger: true })}
                    onClose={() => openAction({ entity: 'organization', action: 'close', id: row.id, label: row.organizationName || 'organization', danger: true })}
                    onRestore={() => openAction({ entity: 'organization', action: 'restore', id: row.id, label: row.organizationName || 'organization' })}
                    onAllowGstReuse={() => openAction({ entity: 'organization', action: 'allowGstReuse', id: row.id, label: row.organizationName || 'organization' })}
                    onRevokeGstReuse={() => openAction({ entity: 'organization', action: 'revokeGstReuse', id: row.id, label: row.organizationName || 'organization', danger: true })}
                  />
                )}
              />
            </div>
          </section>
        )}

        {activeTab === 'branding' && (
          <section className="space-y-4">
            <div className="grid gap-4 xl:grid-cols-[0.9fr_1.1fr]">
              <Panel title="Primary Portal Branding" icon={Palette} loading={loading.settings} error={error.settings}>
                <div className="grid gap-3">
                  <Detail label="Portal name" value={portalSettings?.company?.portalDisplayName || 'JsgSmile Portal'} />
                  <Detail label="Company / district portal" value={portalSettings?.company?.name || 'Jharsuguda District'} />
                  <Detail label="District" value={portalSettings?.company?.district || 'Jharsuguda'} />
                  <Detail label="State" value={portalSettings?.company?.state || 'Odisha'} />
                  <Detail label="Contact email" value={portalSettings?.company?.contactEmail} />
                  <StatusLine label="Existing JSG SMILE / Jharsuguda portal data remains visible" ok />
                  <Button
                    type="button"
                    className="h-9 rounded-md bg-[#12335f] text-xs font-black text-white hover:bg-[#0d274b]"
                    onClick={() => setEditor({ type: 'company', mode: 'edit', record: portalSettings?.company || companies.items[0] || {} })}
                  >
                    <Palette className="mr-2 h-4 w-4" />
                    Edit Branding & Content
                  </Button>
                </div>
              </Panel>
              <Panel title="District Portal Content" icon={FileText} loading={loading.settings} error={error.settings}>
                <div className="grid gap-3">
                  <Detail label="Logo URL" value={portalSettings?.company?.logoUrl} />
                  <Detail label="Homepage content" value={portalSettings?.company?.homepageContent} />
                  <Detail label="About content" value={portalSettings?.company?.aboutContent} />
                  <Detail label="Footer content" value={portalSettings?.company?.footerContent} />
                  <Detail label="Grievance content" value={portalSettings?.company?.grievanceContent} />
                  <Detail label="Procurement policy" value={portalSettings?.company?.procurementPolicy} />
                </div>
              </Panel>
            </div>
            <Toolbar
              tab="branding"
              filters={filters.branding}
              updateFilter={updateFilter}
              resetFilters={resetFilters}
              viewMode={viewMode}
              setViewMode={setViewMode}
            />
            <Panel title="Companies / District Portals" icon={Building2} loading={loading.companies} error={error.companies}>
              <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
                {visibleBrandingCompanies.map(company => (
                  <article key={company.id} className="rounded-md border border-slate-200 bg-slate-50 p-4">
                    <div className="flex items-start justify-between gap-3">
                      <div className="min-w-0">
                        <p className="truncate text-sm font-black text-slate-900">{company.portalDisplayName || company.name}</p>
                        <p className="mt-1 text-xs font-semibold text-slate-500">{company.district || 'District not set'}, {company.state || 'State not set'}</p>
                      </div>
                      <span className={cn('rounded-full px-2 py-1 text-[10px] font-black uppercase tracking-wider', company.isActive ? 'bg-emerald-100 text-emerald-700' : 'bg-amber-100 text-amber-700')}>
                        {company.isActive ? 'Active' : 'Review'}
                      </span>
                    </div>
                    <div className="mt-4 grid gap-2">
                      <Detail label="Short name" value={company.shortName} />
                      <Detail label="Contact email" value={company.contactEmail} />
                      <Detail label="Contact phone" value={company.contactPhone} />
                    </div>
                  </article>
                ))}
                {!visibleBrandingCompanies.length && <EmptyState />}
              </div>
            </Panel>
          </section>
        )}

        {activeTab === 'users' && (
          <section className="space-y-4">
            <Toolbar
              tab="users"
              filters={filters.users}
              updateFilter={updateFilter}
              resetFilters={resetFilters}
              viewMode={viewMode}
              setViewMode={setViewMode}
              selects={[
                ['role', 'All roles', ['master_admin', 'admin', 'buyer', 'seller']],
                ['status', 'All account statuses', ['ACTIVE', 'SUSPENDED', 'DEACTIVATED', 'PENDING']]
              ]}
            />
            <PaginatedTable
              title="Portal Users"
              icon={Users}
              rows={users.items}
              total={users.total}
              page={pages.users.page}
              pageSize={pages.users.pageSize}
              loading={loading.users}
              error={error.users}
              columns={[
                ['name', 'Name'],
                ['email', 'Email'],
                ['role', 'Role'],
                ['accountStatus', 'Account'],
                ['onboardingStatus', 'Verification'],
                ['createdAt', 'Created']
              ]}
              sort={sorts.users}
              onSort={field => onSort('users', field)}
              onPageChange={page => setPageState('users', page)}
              onPageSizeChange={size => setPageSizeState('users', size)}
              viewMode={viewMode}
              actions={row => (
                <UserActions
                  label={row.email || 'user'}
                  active={row.accountStatus === 'ACTIVE'}
                  onEdit={() => setEditor({ type: 'user', mode: 'edit', record: row })}
                  onActivate={() => openAction({ entity: 'user', action: row.accountStatus === 'ACTIVE' ? 'inactivate' : 'reactivate', id: row.id, label: row.email || 'user' })}
                  onSuspend={() => openAction({ entity: 'user', action: 'suspend', id: row.id, label: row.email || 'user' })}
                  onArchive={() => openAction({ entity: 'user', action: 'archive', id: row.id, label: row.email || 'user', danger: true })}
                  onInvite={() => openAction({ entity: 'user', action: 'invite', id: row.id, label: row.email || 'user' })}
                  onResetPassword={() => openAction({ entity: 'user', action: 'resetPassword', id: row.id, label: row.email || 'user', danger: true })}
                />
              )}
            />
          </section>
        )}

        {activeTab === 'procurement' && (
          <section className="space-y-4">
            <MetricStrip summary={procurement.summary} labels={[
              ['totalBids', 'All bids'],
              ['pendingApprovals', 'Pending approvals'],
              ['activeBids', 'Active bids'],
              ['technicalEvaluation', 'Technical eval'],
              ['financialEvaluation', 'Financial eval'],
              ['awardRecommended', 'Award recommended'],
              ['participations', 'Participations']
            ]} />
            <Toolbar
              tab="procurement"
              filters={filters.procurement}
              updateFilter={updateFilter}
              resetFilters={resetFilters}
              viewMode={viewMode}
              setViewMode={setViewMode}
              selects={[['status', 'All statuses', ['OPEN', 'PENDING_ADMIN_APPROVAL', 'TECHNICAL_EVALUATION', 'FINANCIAL_EVALUATION', 'L1_GENERATED', 'AWARD_RECOMMENDED', 'AWARDED', 'CANCELLED', 'EXPIRED']]]}
            />
            <PaginatedTable
              title="Procurement Bids"
              icon={BarChart3}
              rows={procurement.items}
              total={procurement.total}
              page={pages.procurement.page}
              pageSize={pages.procurement.pageSize}
              loading={loading.procurement}
              error={error.procurement}
              columns={[
                ['bidNumber', 'Bid No.'],
                ['title', 'Title'],
                ['buyerOrganizationName', 'Buyer'],
                ['status', 'Status'],
                ['approvalStatus', 'Approval'],
                ['endDate', 'End Date']
              ]}
              sort={sorts.procurement}
              onSort={field => onSort('procurement', field)}
              onPageChange={page => setPageState('procurement', page)}
              onPageSizeChange={size => setPageSizeState('procurement', size)}
              viewMode={viewMode}
              actions={row => (
                <Button type="button" variant="outline" className="h-8 rounded-md px-2 text-[10px] font-black" onClick={() => toast.info(`Open /bids/${row.id} to inspect this bid.`)}>
                  <Eye className="mr-1 h-3 w-3" />
                  View
                </Button>
              )}
            />
            <div className="grid gap-4 xl:grid-cols-2">
              <section className="space-y-3">
                <Toolbar
                  tab="tenders"
                  filters={filters.tenders}
                  updateFilter={updateFilter}
                  resetFilters={resetFilters}
                  viewMode={viewMode}
                  setViewMode={setViewMode}
                  selects={[['status', 'All tender statuses', ['draft', 'approved', 'published', 'bid_submission', 'tech_evaluation', 'financial_evaluation', 'awarded', 'po_generated', 'closed']]]}
                />
                <PaginatedTable
                  title="Tenders / Large Procurements"
                  icon={FileText}
                  rows={tenders.items}
                  total={tenders.total}
                  page={pages.tenders.page}
                  pageSize={pages.tenders.pageSize}
                  loading={loading.tenders}
                  error={error.tenders}
                  columns={[
                    ['tenderId', 'Tender ID'],
                    ['title', 'Title'],
                    ['buyer.name', 'Buyer'],
                    ['status', 'Status'],
                    ['budget', 'Budget'],
                    ['_count.bids', 'Bids']
                  ]}
                  sort={sorts.tenders}
                  onSort={field => onSort('tenders', field)}
                  onPageChange={page => setPageState('tenders', page)}
                  onPageSizeChange={size => setPageSizeState('tenders', size)}
                  viewMode={viewMode}
                />
              </section>
              <section className="space-y-3">
                <Toolbar
                  tab="rfqs"
                  filters={filters.rfqs}
                  updateFilter={updateFilter}
                  resetFilters={resetFilters}
                  viewMode={viewMode}
                  setViewMode={setViewMode}
                  selects={[['status', 'All RFQ statuses', ['pending', 'sent', 'responded', 'accepted', 'completed', 'closed', 'cancelled']]]}
                />
                <PaginatedTable
                  title="RFQs / Request Quotations"
                  icon={FileText}
                  rows={rfqs.items}
                  total={rfqs.total}
                  page={pages.rfqs.page}
                  pageSize={pages.rfqs.pageSize}
                  loading={loading.rfqs}
                  error={error.rfqs}
                  columns={[
                    ['subject', 'Subject'],
                    ['buyer.name', 'Buyer'],
                    ['seller.name', 'Seller'],
                    ['status', 'Status'],
                    ['estimatedValue', 'Value'],
                    ['_count.quoteResponses', 'Responses']
                  ]}
                  sort={sorts.rfqs}
                  onSort={field => onSort('rfqs', field)}
                  onPageChange={page => setPageState('rfqs', page)}
                  onPageSizeChange={size => setPageSizeState('rfqs', size)}
                  viewMode={viewMode}
                />
              </section>
            </div>
            <section className="space-y-3">
              <Toolbar
                tab="orders"
                filters={filters.orders}
                updateFilter={updateFilter}
                resetFilters={resetFilters}
                viewMode={viewMode}
                setViewMode={setViewMode}
                selects={[['status', 'All order statuses', ['generated', 'issued', 'accepted', 'in_fulfillment', 'delivered', 'completed', 'closed', 'cancelled']]]}
              />
              <PaginatedTable
                title="Orders"
                icon={FileText}
                rows={orders.items}
                total={orders.total}
                page={pages.orders.page}
                pageSize={pages.orders.pageSize}
                loading={loading.orders}
                error={error.orders}
                columns={[
                  ['poNumber', 'PO Number'],
                  ['title', 'Title'],
                  ['buyer.name', 'Buyer'],
                  ['seller.name', 'Seller'],
                  ['status', 'Status'],
                  ['amount', 'Amount'],
                  ['_count.invoices', 'Invoices']
                ]}
                sort={sorts.orders}
                onSort={field => onSort('orders', field)}
                onPageChange={page => setPageState('orders', page)}
                onPageSizeChange={size => setPageSizeState('orders', size)}
                viewMode={viewMode}
                actions={row => <OrderStatusActions row={row} openAction={openAction} />}
              />
            </section>
            <RecordShortcutGrid
              title="Procurement Record Areas"
              icon={FileText}
              links={[
                ['Procurement Records', '/buyer/procurements', procurement.summary?.totalBids ?? procurement.total, 'Unified procurement view'],
                ['Tenders / Large Procurement', '/buyer/tenders', tenders.summary?.totalTenders ?? tenders.total, 'Existing tender workflow'],
                ['RFQs / Request Quotations', '/buyer/rfq', rfqs.summary?.totalRfqs ?? rfqs.total, 'Existing quotation workflow'],
                ['Reverse Auctions', '/reverse-auctions', procurement.summary?.activeBids ?? 0, 'Negotiation workflow'],
                ['Orders', '/orders', orders.summary?.totalOrders ?? orders.total, 'Purchase order lifecycle']
              ]}
            />
            <SafetyNotice />
          </section>
        )}

        {activeTab === 'marketplace' && (
          <section className="space-y-4">
            <MetricStrip summary={{
              totalProducts: marketplaceProducts.summary?.totalProducts ?? marketplaceProducts.total,
              activeProducts: marketplaceProducts.summary?.activeProducts ?? 0,
              totalServices: marketplaceServices.summary?.totalServices ?? marketplaceServices.total,
              activeServices: marketplaceServices.summary?.activeServices ?? 0
            }} labels={[
              ['totalProducts', 'Products'],
              ['activeProducts', 'Active products'],
              ['totalServices', 'Services'],
              ['activeServices', 'Active services']
            ]} />
            <Toolbar
              tab="marketplace"
              filters={filters.marketplace}
              updateFilter={updateFilter}
              resetFilters={resetFilters}
              viewMode={viewMode}
              setViewMode={setViewMode}
              selects={[['status', 'All listing statuses', ['DRAFT', 'ACTIVE', 'INACTIVE', 'OUT_OF_STOCK', 'ARCHIVED']]]}
            />
            <section className="space-y-3">
              <PaginatedTable
                title="Product Listings"
                icon={ShoppingCart}
                rows={marketplaceProducts.items}
                total={marketplaceProducts.total}
                page={pages.marketplaceProducts.page}
                pageSize={pages.marketplaceProducts.pageSize}
                loading={loading.marketplaceProducts}
                error={error.marketplaceProducts}
                columns={[
                  ['name', 'Product'],
                  ['seller.name', 'Seller'],
                  ['organization.organizationName', 'Organization'],
                  ['category.name', 'Category'],
                  ['status', 'Status'],
                  ['price', 'Price'],
                  ['_count.images', 'Images']
                ]}
                sort={sorts.marketplaceProducts}
                onSort={field => onSort('marketplaceProducts', field)}
                onPageChange={page => setPageState('marketplaceProducts', page)}
                onPageSizeChange={size => setPageSizeState('marketplaceProducts', size)}
                viewMode={viewMode}
                actions={row => <MarketplaceStatusActions entity="marketplaceProduct" row={row} openAction={openAction} />}
              />
            </section>
            <section className="space-y-3">
              <PaginatedTable
                title="Service Listings"
                icon={Store}
                rows={marketplaceServices.items}
                total={marketplaceServices.total}
                page={pages.marketplaceServices.page}
                pageSize={pages.marketplaceServices.pageSize}
                loading={loading.marketplaceServices}
                error={error.marketplaceServices}
                columns={[
                  ['name', 'Service'],
                  ['seller.name', 'Seller'],
                  ['organization.organizationName', 'Organization'],
                  ['category.name', 'Category'],
                  ['status', 'Status'],
                  ['basePrice', 'Base Price'],
                  ['serviceArea', 'Area']
                ]}
                sort={sorts.marketplaceServices}
                onSort={field => onSort('marketplaceServices', field)}
                onPageChange={page => setPageState('marketplaceServices', page)}
                onPageSizeChange={size => setPageSizeState('marketplaceServices', size)}
                viewMode={viewMode}
                actions={row => <MarketplaceStatusActions entity="marketplaceService" row={row} openAction={openAction} />}
              />
            </section>
            <RecordShortcutGrid
              title="Marketplace Supporting Areas"
              icon={Store}
              links={[
                ['Categories', '/admin/categories', 0, 'Preserved existing category controls'],
                ['Homepage Sections', '/admin/marketplace/home-sections', 0, 'Featured marketplace content'],
                ['Banners', '/admin/banners', 0, 'Existing banner management'],
                ['Monthly Rankings', '/admin/monthly-rankings', 0, 'Seller and listing visibility signals']
              ]}
            />
            <SafetyNotice text="Marketplace status changes require a reason and are audited. Archive or inactive status hides listings while preserving catalogue history." />
          </section>
        )}

        {activeTab === 'payments' && (
          <section className="space-y-4">
            <MetricStrip summary={payments.summary} labels={[
              ['totalPayments', 'Payments'],
              ['failedPayments', 'Failed'],
              ['pendingSettlements', 'Pending settlements'],
              ['completedSettlements', 'Completed settlements'],
              ['pendingWebhooks', 'Pending webhooks']
            ]} />
            <Toolbar
              tab="payments"
              filters={filters.payments}
              updateFilter={updateFilter}
              resetFilters={resetFilters}
              viewMode={viewMode}
              setViewMode={setViewMode}
              selects={[['status', 'All statuses', ['initiated', 'success', 'failed', 'refunded', 'cancelled']]]}
            />
            <PaginatedTable
              title="Payment Transactions"
              icon={CreditCard}
              rows={payments.items}
              total={payments.total}
              page={pages.payments.page}
              pageSize={pages.payments.pageSize}
              loading={loading.payments}
              error={error.payments}
              columns={[
                ['referenceId', 'Reference'],
                ['gateway', 'Gateway'],
                ['status', 'Status'],
                ['amount', 'Amount'],
                ['currency', 'Currency'],
                ['createdAt', 'Created']
              ]}
              sort={sorts.payments}
              onSort={field => onSort('payments', field)}
              onPageChange={page => setPageState('payments', page)}
              onPageSizeChange={size => setPageSizeState('payments', size)}
              viewMode={viewMode}
              actions={row => <PaymentStatusActions row={row} openAction={openAction} />}
            />
            <section className="space-y-3">
              <Toolbar
                tab="escrows"
                filters={filters.escrows}
                updateFilter={updateFilter}
                resetFilters={resetFilters}
                viewMode={viewMode}
                setViewMode={setViewMode}
                selects={[['status', 'All escrow statuses', ['held', 'funded', 'frozen', 'released', 'dispute', 'cancelled']]]}
              />
              <PaginatedTable
                title="Escrow Accounts"
                icon={ShieldCheck}
                rows={escrows.items}
                total={escrows.total}
                page={pages.escrows.page}
                pageSize={pages.escrows.pageSize}
                loading={loading.escrows}
                error={error.escrows}
                columns={[
                  ['paymentTransaction.referenceId', 'Payment Ref'],
                  ['purchaseOrder.poNumber', 'PO Number'],
                  ['buyer.name', 'Buyer'],
                  ['seller.name', 'Seller'],
                  ['status', 'Status'],
                  ['amount', 'Amount'],
                  ['currency', 'Currency']
                ]}
                sort={sorts.escrows}
                onSort={field => onSort('escrows', field)}
                onPageChange={page => setPageState('escrows', page)}
                onPageSizeChange={size => setPageSizeState('escrows', size)}
                viewMode={viewMode}
                actions={row => <EscrowStatusActions row={row} openAction={openAction} />}
              />
            </section>
            <section className="space-y-3">
              <Toolbar
                tab="invoices"
                filters={filters.invoices}
                updateFilter={updateFilter}
                resetFilters={resetFilters}
                viewMode={viewMode}
                setViewMode={setViewMode}
                selects={[['status', 'All invoice statuses', ['submitted', 'under_review', 'approved', 'rejected', 'paid', 'cancelled']]]}
              />
              <PaginatedTable
                title="Invoices"
                icon={FileText}
                rows={invoices.items}
                total={invoices.total}
                page={pages.invoices.page}
                pageSize={pages.invoices.pageSize}
                loading={loading.invoices}
                error={error.invoices}
                columns={[
                  ['invoiceNumber', 'Invoice No.'],
                  ['purchaseOrder.poNumber', 'PO Number'],
                  ['seller.name', 'Seller'],
                  ['buyer.name', 'Buyer'],
                  ['status', 'Status'],
                  ['amount', 'Amount'],
                  ['_count.payments', 'Payments']
                ]}
                sort={sorts.invoices}
                onSort={field => onSort('invoices', field)}
                onPageChange={page => setPageState('invoices', page)}
                onPageSizeChange={size => setPageSizeState('invoices', size)}
                viewMode={viewMode}
                actions={row => <InvoiceStatusActions row={row} openAction={openAction} />}
              />
            </section>
            <section className="space-y-3">
              <Toolbar
                tab="settlements"
                filters={filters.settlements}
                updateFilter={updateFilter}
                resetFilters={resetFilters}
                viewMode={viewMode}
                setViewMode={setViewMode}
                selects={[['status', 'All settlement statuses', ['PENDING', 'INVOICE_VERIFIED', 'APPROVED', 'RELEASED', 'REJECTED']]]}
              />
              <PaginatedTable
                title="Payment Settlements"
                icon={FileClock}
                rows={settlements.items}
                total={settlements.total}
                page={pages.settlements.page}
                pageSize={pages.settlements.pageSize}
                loading={loading.settlements}
                error={error.settlements}
                columns={[
                  ['paymentTransaction.referenceId', 'Payment Ref'],
                  ['invoice.invoiceNumber', 'Invoice'],
                  ['status', 'Status'],
                  ['transactionReference', 'Settlement Ref'],
                  ['netReleasedAmount', 'Net Released'],
                  ['releasedAt', 'Released']
                ]}
                sort={sorts.settlements}
                onSort={field => onSort('settlements', field)}
                onPageChange={page => setPageState('settlements', page)}
                onPageSizeChange={size => setPageSizeState('settlements', size)}
                viewMode={viewMode}
              />
            </section>
            <RecordShortcutGrid
              title="Finance Record Areas"
              icon={CreditCard}
              links={[
                ['Invoices', '/payments/invoices', invoices.summary?.totalInvoices ?? invoices.total, 'Invoice register and billing records'],
                ['Transactions', '/payments/transactions', payments.summary?.totalPayments ?? payments.total, 'Payment transactions'],
                ['Payment Hold / Escrow', '/payments/escrow', escrows.summary?.heldEscrows ?? 0, 'Escrow and settlement oversight'],
                ['Legacy Payments', '/payments', payments.total, 'Preserved existing payment route']
              ]}
            />
            <SafetyNotice text="Payments, settlements, invoices, ledgers, and audit logs are immutable operational records. Do not hard-delete financial history." />
          </section>
        )}

        {activeTab === 'features' && (
          <section className="space-y-4">
            <div className="flex flex-col gap-3 rounded-md border border-slate-200 bg-white p-3 sm:flex-row sm:items-center sm:justify-between">
              <CompanySelect companies={companies.items} value={selectedCompanyId} onChange={setSelectedCompanyId} />
              <div className="grid gap-2 sm:grid-cols-2">
                <SearchInput value={filters.features.search} onChange={value => updateFilter('features', 'search', value)} placeholder="Search features..." />
                <SearchInput value={filters.features.module} onChange={value => updateFilter('features', 'module', value)} placeholder="Filter module..." icon={Filter} />
              </div>
            </div>
            <Panel title="Feature Control" icon={ToggleRight} loading={loading.features} error={error.features}>
              <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
                {visibleFeatures.map(feature => (
                  <button
                    key={feature.id}
                    type="button"
                    onClick={() => openAction({
                      entity: 'feature',
                      action: feature.enabled ? 'disable' : 'enable',
                      featureKey: feature.code,
                      label: feature.name,
                      danger: feature.enabled
                    })}
                    className="min-h-24 rounded-md border border-slate-200 bg-slate-50 p-4 text-left transition hover:border-[#12335f]/30 hover:bg-white"
                  >
                    <div className="flex items-start justify-between gap-3">
                      <div>
                        <p className="text-sm font-black text-slate-900">{feature.name}</p>
                        <p className="mt-1 text-xs font-semibold text-slate-500">{feature.module}</p>
                      </div>
                      {feature.enabled ? <ToggleRight className="h-6 w-6 text-emerald-600" /> : <ToggleLeft className="h-6 w-6 text-slate-400" />}
                    </div>
                    <p className="mt-3 line-clamp-2 text-xs text-slate-500">{feature.description || 'Feature availability can be governed per company.'}</p>
                  </button>
                ))}
              </div>
            </Panel>
          </section>
        )}

        {activeTab === 'exports' && (
          <section className="space-y-4">
            <MetricStrip summary={reports} labels={[
              ['organizations', 'Organizations'],
              ['users', 'Users'],
              ['procurementBids', 'Procurements'],
              ['tenders', 'Tenders'],
              ['rfqs', 'RFQs'],
              ['buyerRequirements', 'Requirements'],
              ['purchaseOrders', 'Orders'],
              ['invoices', 'Invoices'],
              ['payments', 'Payments'],
              ['products', 'Products'],
              ['services', 'Services'],
              ['documents', 'Documents'],
              ['auditLogs', 'Audit Logs']
            ]} />
            <Panel title="Data Export" icon={Download} loading={loading.reports} error={error.reports}>
              <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
                <ExportCard label="Companies" count={companies.total} onExport={() => exportMasterReport('companies', 'Companies', companies.items as any)} />
                <ExportCard label="Organizations" count={organizations.total} onExport={() => exportMasterReport('organizations', 'Organizations', organizations.items as any)} />
                <ExportCard label="Users" count={users.total} onExport={() => exportMasterReport('users', 'Users', users.items as any)} />
                <ExportCard label="Procurement Records" count={procurement.total} onExport={() => exportMasterReport('procurement-bids', 'Procurement Records', procurement.items as any)} />
                <ExportCard label="Tenders" count={tenders.total} onExport={() => exportMasterReport('tenders', 'Tenders', tenders.items as any)} />
                <ExportCard label="RFQs" count={rfqs.total} onExport={() => exportMasterReport('rfqs', 'RFQs', rfqs.items as any)} />
                <ExportCard label="Buyer Requirements" count={reports?.buyerRequirements ?? 0} onExport={() => exportMasterReport('buyer-requirements', 'Buyer Requirements', [])} />
                <ExportCard label="Orders" count={orders.total} onExport={() => exportMasterReport('orders', 'Orders', orders.items as any)} />
                <ExportCard label="Invoices" count={invoices.total} onExport={() => exportMasterReport('invoices', 'Invoices', invoices.items as any)} />
                <ExportCard label="Payments" count={payments.total} onExport={() => exportMasterReport('payments', 'Payments', payments.items as any)} />
                <ExportCard label="Products" count={reports?.products ?? 0} onExport={() => exportMasterReport('products', 'Products', [])} />
                <ExportCard label="Services" count={reports?.services ?? 0} onExport={() => exportMasterReport('services', 'Services', [])} />
                <ExportCard label="Documents" count={reports?.documents ?? 0} onExport={() => exportMasterReport('documents', 'Documents', [])} />
                <ExportCard label="Audit Logs" count={auditLogs.total} onExport={() => exportMasterReport('audit-logs', 'Audit Logs', auditLogs.items as any)} />
              </div>
            </Panel>
            <section className="space-y-3">
              <Toolbar
                tab="documents"
                filters={filters.documents}
                updateFilter={updateFilter}
                resetFilters={resetFilters}
                viewMode={viewMode}
                setViewMode={setViewMode}
                selects={[['status', 'All document statuses', ['active', 'archived', 'deleted']]]}
              />
              <PaginatedTable
                title="Document Register"
                icon={FileSearch}
                rows={documents.items}
                total={documents.total}
                page={pages.documents.page}
                pageSize={pages.documents.pageSize}
                loading={loading.documents}
                error={error.documents}
                columns={[
                  ['originalName', 'Document'],
                  ['entityType', 'Entity'],
                  ['owner.organization.organizationName', 'Organization'],
                  ['owner.company.portalDisplayName', 'Company'],
                  ['mimeType', 'Type'],
                  ['size', 'Size'],
                  ['status', 'Status']
                ]}
                sort={sorts.documents}
                onSort={field => onSort('documents', field)}
                onPageChange={page => setPageState('documents', page)}
                onPageSizeChange={size => setPageSizeState('documents', size)}
                viewMode={viewMode}
                actions={row => <DocumentActions row={row} />}
              />
            </section>
            <SafetyNotice text="Exports are generated by the backend, require an audit reason, and preserve records without deletion or mutation." />
          </section>
        )}

        {activeTab === 'email' && (
          <section className="grid gap-4 xl:grid-cols-[1fr_1fr]">
            <Panel title="SMTP Configuration" icon={Mail} loading={loading.email} error={error.email}>
              <div className="grid gap-3">
                <Detail label="SMTP Host" value={emailSettings?.smtp?.host} />
                <Detail label="SMTP Port" value={emailSettings?.smtp?.port} />
                <Detail label="SMTP Username" value={emailSettings?.smtp?.user || 'Not configured'} />
                <Detail label="From Email" value={emailSettings?.smtp?.fromEmail || 'Not configured'} />
                <Detail label="From Name" value={emailSettings?.smtp?.fromName} />
                <StatusLine label="SMTP password configured" ok={Boolean(emailSettings?.smtp?.passwordConfigured)} />
                <div className="flex flex-wrap gap-2">
                  <Button type="button" className="h-9 rounded-md bg-[#12335f] text-xs font-black text-white hover:bg-[#0d274b]" onClick={() => setEditor({ type: 'email', mode: 'edit', record: emailSettings?.smtp || {} })}>
                    <Mail className="mr-2 h-4 w-4" />
                    Save Email Setup
                  </Button>
                  <Button type="button" variant="outline" className="h-9 rounded-md text-xs font-black" onClick={() => openAction({ entity: 'email', action: 'test', label: 'SMTP test' })}>
                  <Mail className="mr-2 h-4 w-4" />
                  Send Test Email
                  </Button>
                </div>
              </div>
            </Panel>
            <Panel title="Notification Templates" icon={Bell}>
              <div className="grid gap-2">
                {(emailSettings?.notifications?.templates || []).map((template: string) => (
                  <StatusLine key={template} label={template} ok={Boolean(emailSettings?.notifications?.emailEnabled)} />
                ))}
              </div>
            </Panel>
          </section>
        )}

        {activeTab === 'audit' && (
          <section className="space-y-4">
            <Toolbar
              tab="audit"
              filters={filters.audit}
              updateFilter={updateFilter}
              resetFilters={resetFilters}
              viewMode={viewMode}
              setViewMode={setViewMode}
              selects={[
                ['action', 'Any action', ['company', 'role', 'payment', 'file', 'bid', 'login']],
                ['entityType', 'Any entity', ['user', 'organization', 'company', 'payment', 'procurement', 'file']]
              ]}
            />
            <PaginatedTable
              title="Audit Logs"
              icon={FileClock}
              rows={auditLogs.items}
              total={auditLogs.total}
              page={pages.audit.page}
              pageSize={pages.audit.pageSize}
              loading={loading.audit}
              error={error.audit}
              columns={[
                ['action', 'Action'],
                ['entityType', 'Entity'],
                ['entityId', 'Entity ID'],
                ['createdAt', 'Created']
              ]}
              sort={sorts.audit}
              onSort={field => onSort('audit', field)}
              onPageChange={page => setPageState('audit', page)}
              onPageSizeChange={size => setPageSizeState('audit', size)}
              viewMode={viewMode}
            />
          </section>
        )}

        {activeTab === 'settings' && (
          <section className="grid gap-4 xl:grid-cols-[1fr_1fr]">
            <Panel title="System Settings" icon={SlidersHorizontal} loading={loading.settings} error={error.settings}>
              <div className="grid gap-3">
                <StatusLine label="Master Admin access is restricted to master_admin role" ok />
                <StatusLine label="Company and portal settings require audited content permission" ok />
                <StatusLine label="Existing JSG SMILE portal records are preserved" ok />
                <StatusLine label="Financial and audit records are read-only in this surface" ok />
                <Button
                  type="button"
                  className="h-9 rounded-md bg-[#12335f] text-xs font-black text-white hover:bg-[#0d274b]"
                  onClick={() => setEditor({ type: 'company', mode: 'edit', record: portalSettings?.company || companies.items[0] || {} })}
                >
                  <SlidersHorizontal className="mr-2 h-4 w-4" />
                  Update Portal Settings
                </Button>
              </div>
            </Panel>
            <Panel title="Configured Portal" icon={Building2} loading={loading.settings} error={error.settings}>
              <div className="grid gap-3">
                <Detail label="Portal display name" value={portalSettings?.company?.portalDisplayName} />
                <Detail label="Company name" value={portalSettings?.company?.name} />
                <Detail label="Short name" value={portalSettings?.company?.shortName} />
                <Detail label="District" value={portalSettings?.company?.district} />
                <Detail label="State" value={portalSettings?.company?.state} />
                <Detail label="Last updated" value={portalSettings?.company?.updatedAt} />
              </div>
            </Panel>
          </section>
        )}

        {activeTab === 'security' && (
          <section className="grid gap-4 xl:grid-cols-[1fr_1fr]">
            <MetricStrip summary={security?.summary} labels={[
              ['failedLogins', 'Failed logins'],
              ['suspiciousActions', 'Suspicious actions'],
              ['openFraudAlerts', 'Open fraud alerts'],
              ['roleChanges', 'Role changes'],
              ['fileAccessEvents', 'File access events'],
              ['paymentActions', 'Payment actions']
            ]} />
            <Panel title="System Health" icon={FileSearch} loading={loading.systemHealth} error={error.systemHealth}>
              <div className="grid gap-4 xl:grid-cols-[1fr_1fr]">
                <div className="grid gap-2">
                  {Object.entries(systemHealth?.checks || {}).map(([key, value]) => (
                    <StatusLine key={key} label={`${labelize(key)}: ${formatCell(value)}`} ok={String(value).toLowerCase() === 'ok' || String(value).toLowerCase() === 'available' || String(value).toLowerCase() === 'configured'} />
                  ))}
                </div>
                <div className="grid gap-2">
                  <Detail label="Overall status" value={systemHealth?.status} />
                  <Detail label="API latency" value={systemHealth?.latencyMs != null ? `${systemHealth.latencyMs} ms` : '-'} />
                  <Detail label="Failed API calls" value={systemHealth?.counts?.failedApiCalls ?? 0} />
                  <Detail label="Pending webhooks" value={systemHealth?.counts?.pendingWebhooks ?? 0} />
                  <Detail label="Last checked" value={formatDate(systemHealth?.generatedAt)} />
                </div>
              </div>
            </Panel>
            <Panel title="Security Controls" icon={ShieldCheck} loading={loading.security} error={error.security}>
              <div className="grid gap-2">
                {Object.entries(security?.controls || {}).map(([key, value]) => (
                  <StatusLine key={key} label={String(value)} ok />
                ))}
              </div>
            </Panel>
            <Panel title="Safe Action Policy" icon={AlertTriangle}>
              <SafetyNotice text="Master Admin records use archive, suspend, and restore actions with mandatory reasons and audit logging. Operational history is preserved." />
            </Panel>
          </section>
        )}
        {actionDialog && (
          <ActionDialog
            dialog={actionDialog}
            busy={mutating}
            onCancel={() => setActionDialog(null)}
            onConfirm={runAction}
          />
        )}
        {editor && (
          <EntityEditor
            editor={editor}
            companies={companies.items}
            organizations={organizations.items}
            busy={mutating}
            onCancel={() => setEditor(null)}
            onSave={saveEditor}
          />
        )}
      </div>
    </div>
  );
}

function Toolbar({
  tab,
  filters,
  updateFilter,
  resetFilters,
  viewMode,
  setViewMode,
  selects
}: {
  tab: FilterId;
  filters: Record<string, string>;
  updateFilter: (tab: FilterId, key: string, value: string) => void;
  resetFilters: (tab: FilterId) => void;
  viewMode: ViewMode;
  setViewMode: (mode: ViewMode) => void;
  selects?: Array<[string, string, string[]]>;
}) {
  const activeFilters = Object.entries(filters).filter(([, value]) => value);
  return (
    <div className="sticky top-0 z-10 rounded-md border border-slate-200 bg-white p-3 shadow-sm">
      <div className="flex flex-col gap-3 xl:flex-row xl:items-center xl:justify-between">
        <div className="grid flex-1 gap-2 md:grid-cols-2 xl:grid-cols-3">
          <SearchInput value={filters.search || ''} onChange={value => updateFilter(tab, 'search', value)} placeholder="Search..." />
          {selects?.map(([key, label, options]) => (
            <select key={key} value={filters[key] || ''} onChange={event => updateFilter(tab, key, event.target.value)} className="h-10 rounded-md border border-slate-200 bg-white px-3 text-xs font-bold text-slate-600 outline-none focus:border-[#12335f]">
              <option value="">{label}</option>
              {options.map(option => <option key={option} value={option}>{labelize(option)}</option>)}
            </select>
          ))}
        </div>
        <div className="flex flex-wrap gap-2">
          <Button type="button" variant="outline" onClick={() => resetFilters(tab)} className="h-10 rounded-md text-xs font-black">
            <RotateCcw className="mr-2 h-4 w-4" />
            Reset
          </Button>
          <ViewToggle viewMode={viewMode} onChange={setViewMode} />
        </div>
      </div>
      {activeFilters.length > 0 && (
        <div className="mt-3 flex flex-wrap gap-2">
          {activeFilters.map(([key, value]) => (
            <span key={key} className="rounded-full bg-[#12335f]/10 px-3 py-1 text-[10px] font-black uppercase tracking-wider text-[#12335f]">
              {labelize(key)}: {labelize(value)}
            </span>
          ))}
        </div>
      )}
    </div>
  );
}

function SearchInput({ value, onChange, placeholder, icon: Icon = Search }: { value: string; onChange: (value: string) => void; placeholder: string; icon?: any }) {
  return (
    <div className="relative">
      <Icon className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
      <input value={value} onChange={event => onChange(event.target.value)} placeholder={placeholder} className="h-10 w-full rounded-md border border-slate-200 bg-white pl-9 pr-3 text-sm font-semibold outline-none focus:border-[#12335f]" />
    </div>
  );
}

function ViewToggle({ viewMode, onChange }: { viewMode: ViewMode; onChange: (mode: ViewMode) => void }) {
  return (
    <div className="inline-flex h-10 overflow-hidden rounded-md border border-slate-200 bg-white">
      <button type="button" onClick={() => onChange('list')} className={cn('px-3', viewMode === 'list' ? 'bg-[#12335f] text-white' : 'text-slate-500')}>
        <List className="h-4 w-4" />
      </button>
      <button type="button" onClick={() => onChange('grid')} className={cn('px-3', viewMode === 'grid' ? 'bg-[#12335f] text-white' : 'text-slate-500')}>
        <Grid2X2 className="h-4 w-4" />
      </button>
    </div>
  );
}

function PaginatedTable<T extends Record<string, any>>({
  title,
  icon: Icon,
  rows,
  columns,
  total,
  page,
  pageSize,
  loading,
  error,
  sort,
  onSort,
  onPageChange,
  onPageSizeChange,
  viewMode,
  actions
}: {
  title: string;
  icon: any;
  rows: T[];
  columns: Array<[string, string]>;
  total: number;
  page: number;
  pageSize: number;
  loading?: boolean;
  error?: string | null;
  sort: { field: string; direction: SortDirection };
  onSort: (field: string) => void;
  onPageChange: (page: number) => void;
  onPageSizeChange: (pageSize: number) => void;
  viewMode: ViewMode;
  actions?: (row: T) => React.ReactNode;
}) {
  if (viewMode === 'grid') {
    return (
      <Panel title={title} icon={Icon} loading={loading} error={error}>
        <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
          {rows.map(row => (
            <article key={row.id || JSON.stringify(row)} className="rounded-md border border-slate-200 bg-slate-50 p-4">
              <div className="space-y-2">
                {columns.slice(0, 5).map(([field, label]) => (
                  <Detail key={field} label={label} value={formatCell(valueAt(row, field))} />
                ))}
              </div>
              {actions && <div className="mt-3 flex flex-wrap gap-2">{actions(row)}</div>}
            </article>
          ))}
          {rows.length === 0 && <EmptyState />}
        </div>
        <Pagination page={page} pageSize={pageSize} total={total} onPageChange={onPageChange} onPageSizeChange={onPageSizeChange} pageSizeOptions={pageSizeOptions} />
      </Panel>
    );
  }

  return (
    <section className="overflow-hidden rounded-md border border-slate-200 bg-white shadow-sm">
      <div className="flex items-center justify-between border-b border-slate-200 px-4 py-3">
        <div className="flex items-center gap-2">
          <Icon className="h-4 w-4 text-[#12335f]" />
          <h2 className="text-sm font-black text-slate-900">{title}</h2>
        </div>
        {loading && <Loader2 className="h-4 w-4 animate-spin text-[#12335f]" />}
      </div>
      {error ? <ErrorState message={error} /> : (
        <div className="overflow-x-auto">
          <table className="w-full min-w-[860px] text-left text-sm">
            <thead className="bg-slate-50">
              <tr>
                <th className="w-16 px-4 py-3 text-[10px] font-black uppercase tracking-wider text-slate-500">S.No.</th>
                {columns.map(([field, label]) => (
                  <th key={field} className="px-4 py-3">
                    <SortableHeader label={label} field={field} activeField={sort.field} direction={sort.direction} onSort={onSort} />
                  </th>
                ))}
                {actions && <th className="px-4 py-3 text-right text-[10px] font-black uppercase tracking-wider text-slate-500">Actions</th>}
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {rows.map((row, index) => (
                <tr key={row.id || index} className="hover:bg-slate-50">
                  <td className="px-4 py-3 text-xs font-black text-slate-400">{(page - 1) * pageSize + index + 1}</td>
                  {columns.map(([field]) => (
                    <td key={field} className="max-w-72 truncate px-4 py-3 text-slate-700">{formatCell(valueAt(row, field))}</td>
                  ))}
                  {actions && <td className="px-4 py-3"><div className="flex justify-end gap-2">{actions(row)}</div></td>}
                </tr>
              ))}
              {!loading && rows.length === 0 && <tr><td colSpan={columns.length + (actions ? 2 : 1)}><EmptyState /></td></tr>}
            </tbody>
          </table>
        </div>
      )}
      <Pagination page={page} pageSize={pageSize} total={total} onPageChange={onPageChange} onPageSizeChange={onPageSizeChange} pageSizeOptions={pageSizeOptions} />
    </section>
  );
}

function Panel({ title, icon: Icon, children, loading, error }: { title: string; icon: any; children: React.ReactNode; loading?: boolean; error?: string | null }) {
  return (
    <section className="rounded-md border border-slate-200 bg-white p-4 shadow-sm">
      <div className="mb-4 flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Icon className="h-4 w-4 text-[#12335f]" />
          <h2 className="text-sm font-black text-slate-900">{title}</h2>
        </div>
        {loading && <Loader2 className="h-4 w-4 animate-spin text-[#12335f]" />}
      </div>
      {error ? <ErrorState message={error} /> : children}
    </section>
  );
}

const KpiCard = memo(function KpiCard({ label, value, subtext, icon: Icon, tone }: { label: string; value: number; subtext: string; icon: any; tone: string }) {
  const tones: Record<string, string> = {
    blue: 'bg-sky-50 text-[#12335f]',
    green: 'bg-emerald-50 text-emerald-700',
    amber: 'bg-amber-50 text-amber-700',
    red: 'bg-red-50 text-red-700'
  };
  return (
    <Card className="rounded-md border-slate-200 bg-white shadow-sm">
      <CardContent className="p-4">
        <div className="flex items-start justify-between gap-3">
          <div>
            <p className="text-[10px] font-black uppercase tracking-wider text-slate-500">{label}</p>
            <p className="mt-2 text-2xl font-black text-slate-950">{value}</p>
          </div>
          <div className={cn('rounded-md p-2', tones[tone] || tones.blue)}><Icon className="h-5 w-5" /></div>
        </div>
        <p className="mt-3 text-xs font-semibold text-slate-500">{subtext}</p>
      </CardContent>
    </Card>
  );
});

const MetricStrip = memo(function MetricStrip({ summary, labels }: { summary?: Record<string, number>; labels: Array<[string, string]> }) {
  return (
    <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-4 xl:grid-cols-7">
      {labels.map(([key, label]) => (
        <div key={key} className="rounded-md border border-slate-200 bg-white px-4 py-3 shadow-sm">
          <p className="text-[10px] font-black uppercase tracking-wider text-slate-500">{label}</p>
          <p className="mt-1 text-xl font-black text-[#12335f]">{summary?.[key] ?? 0}</p>
        </div>
      ))}
    </div>
  );
});

const RecordShortcutGrid = memo(function RecordShortcutGrid({
  title,
  icon: Icon,
  links
}: {
  title: string;
  icon: any;
  links: Array<[string, string, number, string]>;
}) {
  return (
    <Panel title={title} icon={Icon}>
      <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-5">
        {links.map(([label, href, count, description]) => (
          <a
            key={label}
            href={href}
            className="rounded-md border border-slate-200 bg-slate-50 p-4 transition hover:border-[#12335f]/30 hover:bg-white"
          >
            <p className="text-[10px] font-black uppercase tracking-wider text-slate-500">{label}</p>
            <p className="mt-2 text-2xl font-black text-[#12335f]">{count ?? 0}</p>
            <p className="mt-2 text-xs font-semibold leading-5 text-slate-500">{description}</p>
          </a>
        ))}
      </div>
    </Panel>
  );
});

function ExportCard({ label, count, onExport }: { label: string; count: number; onExport: () => void }) {
  return (
    <article className="rounded-md border border-slate-200 bg-slate-50 p-4">
      <div className="flex items-start justify-between gap-3">
        <div>
          <p className="text-sm font-black text-slate-900">{label}</p>
          <p className="mt-1 text-xs font-semibold text-slate-500">{count.toLocaleString('en-IN')} records available</p>
        </div>
        <Download className="h-5 w-5 text-[#12335f]" />
      </div>
      <Button type="button" variant="outline" className="mt-4 h-9 w-full rounded-md text-xs font-black" onClick={onExport}>
        <Download className="mr-2 h-4 w-4" />
        Export CSV
      </Button>
    </article>
  );
}

function CompanyDetailTabs({
  company,
  reports,
  onOpenTab,
  onEdit
}: {
  company: Company | null;
  reports: any;
  onOpenTab: (tab: TabId) => void;
  onEdit: () => void;
}) {
  const detailTabs: Array<[string, TabId, string, number | string | undefined]> = [
    ['Overview', 'organizations', 'Tenant profile and status', company?.isActive ? 'Active' : 'Review'],
    ['Branding', 'branding', 'Logo, homepage, colors', company?.logoUrl ? 'Logo set' : 'No logo'],
    ['Features', 'features', 'Company feature flags', company?._count?.features],
    ['Users', 'users', 'Assigned tenant users', company?._count?.users],
    ['Organizations', 'organizations', 'Tenant organizations', company?._count?.organizations],
    ['Procurement Data', 'procurement', 'Tenders, RFQs, bids', reports?.procurementBids ?? reports?.tenders],
    ['Payments', 'payments', 'Invoices, payments, escrow', reports?.payments],
    ['Reports', 'exports', 'CSV exports and documents', reports?.documents],
    ['Audit Logs', 'audit', 'Critical action trail', reports?.auditLogs],
    ['Settings', 'settings', 'Portal settings and policy', company?.updatedAt ? formatDate(company.updatedAt) : undefined]
  ];

  return (
    <Panel title="Selected Company Detail" icon={Building2}>
      <div className="grid gap-4 lg:grid-cols-[0.85fr_1.15fr]">
        <div className="rounded-md border border-slate-200 bg-slate-50 p-4">
          <p className="text-[10px] font-black uppercase tracking-wider text-slate-500">Company / Tenant</p>
          <p className="mt-2 text-lg font-black text-slate-900">{company?.portalDisplayName || company?.name || 'No company selected'}</p>
          <div className="mt-3 grid gap-2">
            <Detail label="District portal" value={company?.name} />
            <Detail label="Short name" value={company?.shortName} />
            <Detail label="Location" value={[company?.district, company?.state].filter(Boolean).join(', ')} />
            <Detail label="Status" value={company?.isActive ? 'Active' : 'Review'} />
          </div>
          <Button type="button" variant="outline" className="mt-4 h-9 rounded-md text-xs font-black" onClick={onEdit} disabled={!company}>
            <Eye className="mr-2 h-4 w-4" />
            Edit Company
          </Button>
        </div>
        <div className="grid gap-2 sm:grid-cols-2 xl:grid-cols-5">
          {detailTabs.map(([label, tab, description, value]) => (
            <button
              key={label}
              type="button"
              onClick={() => onOpenTab(tab)}
              className="rounded-md border border-slate-200 bg-white p-3 text-left transition hover:border-[#12335f]/30 hover:bg-slate-50"
            >
              <p className="text-xs font-black text-slate-900">{label}</p>
              <p className="mt-1 min-h-8 text-[11px] font-semibold leading-4 text-slate-500">{description}</p>
              <p className="mt-2 text-sm font-black text-[#12335f]">{value ?? '-'}</p>
            </button>
          ))}
        </div>
      </div>
    </Panel>
  );
}

const EntityActions = memo(function EntityActions({
  label,
  active,
  onEdit,
  onActivate,
  onSuspend,
  onArchive
}: {
  label: string;
  active: boolean;
  onEdit: () => void;
  onActivate: () => void;
  onSuspend: () => void;
  onArchive: () => void;
}) {
  return (
    <>
      <Button type="button" variant="outline" className="h-8 rounded-md px-2 text-[10px] font-black" onClick={onEdit} title={`Edit ${label}`}>
        <Eye className="mr-1 h-3 w-3" />
        Edit
      </Button>
      <Button type="button" variant="outline" className={cn('h-8 rounded-md px-2 text-[10px] font-black', active ? 'text-amber-700' : 'text-emerald-700')} onClick={onActivate} title={active ? `Deactivate ${label}` : `Restore ${label}`}>
        <Power className="mr-1 h-3 w-3" />
        {active ? 'Deactivate' : 'Restore'}
      </Button>
      <Button type="button" variant="outline" className="h-8 rounded-md px-2 text-[10px] font-black text-amber-700" onClick={onSuspend} title={`Suspend ${label}`}>
        <Archive className="mr-1 h-3 w-3" />
        Suspend
      </Button>
      <Button type="button" variant="outline" className="h-8 rounded-md px-2 text-[10px] font-black text-slate-700" onClick={onArchive} title={`Archive ${label}`}>
        <Archive className="mr-1 h-3 w-3" />
        Archive
      </Button>
    </>
  );
});

const OrganizationActions = memo(function OrganizationActions({
  org,
  onEdit,
  onActivate,
  onSuspend,
  onArchive,
  onClose,
  onRestore,
  onAllowGstReuse,
  onRevokeGstReuse
}: {
  org: Organization;
  onEdit: () => void;
  onActivate: () => void;
  onSuspend: () => void;
  onArchive: () => void;
  onClose: () => void;
  onRestore: () => void;
  onAllowGstReuse: () => void;
  onRevokeGstReuse: () => void;
}) {
  const status = org.verificationStatus;
  const isClosedOrArchived = status === 'CLOSED' || status === 'ARCHIVED';

  return (
    <>
      <Button type="button" variant="outline" className="h-8 rounded-md px-2 text-[10px] font-black" onClick={onEdit} title={`Edit ${org.organizationName}`}>
        <Eye className="mr-1 h-3 w-3" />
        Edit
      </Button>

      {/* Close button (only if not already closed/archived/rejected) */}
      {!isClosedOrArchived && status !== 'REJECTED' && (
        <Button type="button" variant="outline" className="h-8 rounded-md px-2 text-[10px] font-black text-red-700" onClick={onClose} title={`Close ${org.organizationName}`}>
          <Power className="mr-1 h-3 w-3" />
          Close
        </Button>
      )}

      {/* Archive button (only if not already archived) */}
      {status !== 'ARCHIVED' && (
        <Button type="button" variant="outline" className="h-8 rounded-md px-2 text-[10px] font-black text-slate-700" onClick={onArchive} title={`Archive ${org.organizationName}`}>
          <Archive className="mr-1 h-3 w-3" />
          Archive
        </Button>
      )}

      {/* Restore button (only if closed or archived) */}
      {isClosedOrArchived && (
        <Button type="button" variant="outline" className="h-8 rounded-md px-2 text-[10px] font-black text-emerald-700" onClick={onRestore} title={`Restore ${org.organizationName}`}>
          <RotateCcw className="mr-1 h-3 w-3" />
          Restore
        </Button>
      )}

      {/* GST Reuse Controls */}
      {isClosedOrArchived && !org.gstReuseAllowed && (
        <Button type="button" variant="outline" className="h-8 rounded-md px-2 text-[10px] font-black text-blue-700" onClick={onAllowGstReuse} title={`Allow GST Reuse for ${org.organizationName}`}>
          <CheckCircle2 className="mr-1 h-3 w-3" />
          Allow GST Reuse
        </Button>
      )}

      {isClosedOrArchived && org.gstReuseAllowed && (
        <Button type="button" variant="outline" className="h-8 rounded-md px-2 text-[10px] font-black text-amber-700" onClick={onRevokeGstReuse} title={`Revoke GST Reuse for ${org.organizationName}`}>
          <AlertTriangle className="mr-1 h-3 w-3" />
          Revoke GST Reuse
        </Button>
      )}

      {!isClosedOrArchived && (
        <Button type="button" variant="outline" className="h-8 rounded-md px-2 text-[10px] font-black text-amber-700" onClick={onSuspend} title={`Suspend ${org.organizationName}`}>
          <Archive className="mr-1 h-3 w-3" />
          Suspend
        </Button>
      )}
    </>
  );
});

const UserActions = memo(function UserActions(props: Parameters<typeof EntityActions>[0] & { onInvite: () => void; onResetPassword: () => void }) {
  return (
    <>
      <EntityActions {...props} />
      <Button type="button" variant="outline" className="h-8 rounded-md px-2 text-[10px] font-black text-[#12335f]" onClick={props.onInvite}>
        <UserPlus className="mr-1 h-3 w-3" />
        Invite
      </Button>
      <Button type="button" variant="outline" className="h-8 rounded-md px-2 text-[10px] font-black text-[#12335f]" onClick={props.onResetPassword}>
        <KeyRound className="mr-1 h-3 w-3" />
        Reset
      </Button>
    </>
  );
});

const MarketplaceStatusActions = memo(function MarketplaceStatusActions({
  entity,
  row,
  openAction
}: {
  entity: 'marketplaceProduct' | 'marketplaceService';
  row: MarketplaceProductRecord | MarketplaceServiceRecord;
  openAction: (dialog: NonNullable<ActionDialogState>) => void;
}) {
  const label = row.name || 'listing';
  const isActive = row.status === 'ACTIVE';
  return (
    <>
      <Button
        type="button"
        variant="outline"
        className="h-8 rounded-md px-2 text-[10px] font-black text-emerald-700"
        onClick={() => openAction({ entity, action: 'activate', id: row.id, label, status: 'ACTIVE' })}
      >
        <CheckCircle2 className="mr-1 h-3 w-3" />
        Approve
      </Button>
      <Button
        type="button"
        variant="outline"
        className="h-8 rounded-md px-2 text-[10px] font-black text-amber-700"
        onClick={() => openAction({ entity, action: isActive ? 'hide' : 'restore', id: row.id, label, status: isActive ? 'INACTIVE' : 'ACTIVE' })}
      >
        <Power className="mr-1 h-3 w-3" />
        {isActive ? 'Hide' : 'Restore'}
      </Button>
      <Button
        type="button"
        variant="outline"
        className="h-8 rounded-md px-2 text-[10px] font-black text-slate-700"
        onClick={() => openAction({ entity, action: 'archive', id: row.id, label, status: 'ARCHIVED', danger: true })}
      >
        <Archive className="mr-1 h-3 w-3" />
        Archive
      </Button>
    </>
  );
});

const OrderStatusActions = memo(function OrderStatusActions({
  row,
  openAction
}: {
  row: OrderRecord;
  openAction: (dialog: NonNullable<ActionDialogState>) => void;
}) {
  const label = row.poNumber || row.title || 'order';
  return (
    <>
      <Button type="button" variant="outline" className="h-8 rounded-md px-2 text-[10px] font-black text-[#12335f]" onClick={() => openAction({ entity: 'order', action: 'markInFulfillment', id: row.id, label, status: 'in_fulfillment' })}>
        <Truck className="mr-1 h-3 w-3" />
        Fulfill
      </Button>
      <Button type="button" variant="outline" className="h-8 rounded-md px-2 text-[10px] font-black text-emerald-700" onClick={() => openAction({ entity: 'order', action: 'close', id: row.id, label, status: 'closed' })}>
        <CheckCircle2 className="mr-1 h-3 w-3" />
        Close
      </Button>
      <Button type="button" variant="outline" className="h-8 rounded-md px-2 text-[10px] font-black text-amber-700" onClick={() => openAction({ entity: 'order', action: 'cancel', id: row.id, label, status: 'cancelled', danger: true })}>
        <Archive className="mr-1 h-3 w-3" />
        Cancel
      </Button>
    </>
  );
});

const PaymentStatusActions = memo(function PaymentStatusActions({
  row,
  openAction
}: {
  row: PaymentRecord;
  openAction: (dialog: NonNullable<ActionDialogState>) => void;
}) {
  const label = row.referenceId || `payment ${row.id}`;
  return (
    <>
      <Button type="button" variant="outline" className="h-8 rounded-md px-2 text-[10px] font-black text-emerald-700" onClick={() => openAction({ entity: 'payment', action: 'markSuccess', id: row.id, label, status: 'success', danger: true })}>
        <CheckCircle2 className="mr-1 h-3 w-3" />
        Success
      </Button>
      <Button type="button" variant="outline" className="h-8 rounded-md px-2 text-[10px] font-black text-amber-700" onClick={() => openAction({ entity: 'payment', action: 'hold', id: row.id, label, status: 'on_hold', danger: true })}>
        <Power className="mr-1 h-3 w-3" />
        Hold
      </Button>
      <Button type="button" variant="outline" className="h-8 rounded-md px-2 text-[10px] font-black text-red-700" onClick={() => openAction({ entity: 'payment', action: 'markFailed', id: row.id, label, status: 'failed', danger: true })}>
        <AlertTriangle className="mr-1 h-3 w-3" />
        Failed
      </Button>
    </>
  );
});

const EscrowStatusActions = memo(function EscrowStatusActions({
  row,
  openAction
}: {
  row: EscrowRecord;
  openAction: (dialog: NonNullable<ActionDialogState>) => void;
}) {
  const label = row.paymentTransaction?.referenceId || row.purchaseOrder?.poNumber || `escrow ${row.id}`;
  return (
    <>
      <Button type="button" variant="outline" className="h-8 rounded-md px-2 text-[10px] font-black text-amber-700" onClick={() => openAction({ entity: 'escrow', action: 'hold', id: row.id, label, status: 'frozen', danger: true })}>
        <Power className="mr-1 h-3 w-3" />
        Hold
      </Button>
      <Button type="button" variant="outline" className="h-8 rounded-md px-2 text-[10px] font-black text-red-700" onClick={() => openAction({ entity: 'escrow', action: 'markDispute', id: row.id, label, status: 'dispute', danger: true })}>
        <AlertTriangle className="mr-1 h-3 w-3" />
        Dispute
      </Button>
      <Button type="button" variant="outline" className="h-8 rounded-md px-2 text-[10px] font-black text-emerald-700" onClick={() => openAction({ entity: 'escrow', action: 'release', id: row.id, label, status: 'released', danger: true })}>
        <CheckCircle2 className="mr-1 h-3 w-3" />
        Release
      </Button>
    </>
  );
});

const DocumentActions = memo(function DocumentActions({ row }: { row: DocumentRecord }) {
  const openDocument = async () => {
    try {
      await openFileAsset(row, row.originalName || 'Document');
    } catch (err: any) {
      toast.error(err.message || 'Unable to open document');
    }
  };
  return (
    <Button type="button" variant="outline" className="h-8 rounded-md px-2 text-[10px] font-black" onClick={openDocument}>
      <Eye className="mr-1 h-3 w-3" />
      Open
    </Button>
  );
});

const InvoiceStatusActions = memo(function InvoiceStatusActions({
  row,
  openAction
}: {
  row: InvoiceRecord;
  openAction: (dialog: NonNullable<ActionDialogState>) => void;
}) {
  const label = row.invoiceNumber || `invoice ${row.id}`;
  return (
    <>
      <Button type="button" variant="outline" className="h-8 rounded-md px-2 text-[10px] font-black text-[#12335f]" onClick={() => openAction({ entity: 'invoice', action: 'review', id: row.id, label, status: 'under_review' })}>
        <Eye className="mr-1 h-3 w-3" />
        Review
      </Button>
      <Button type="button" variant="outline" className="h-8 rounded-md px-2 text-[10px] font-black text-emerald-700" onClick={() => openAction({ entity: 'invoice', action: 'approve', id: row.id, label, status: 'approved', danger: true })}>
        <CheckCircle2 className="mr-1 h-3 w-3" />
        Approve
      </Button>
      <Button type="button" variant="outline" className="h-8 rounded-md px-2 text-[10px] font-black text-red-700" onClick={() => openAction({ entity: 'invoice', action: 'reject', id: row.id, label, status: 'rejected', danger: true })}>
        <AlertTriangle className="mr-1 h-3 w-3" />
        Reject
      </Button>
    </>
  );
});

function ActionDialog({
  dialog,
  busy,
  onCancel,
  onConfirm
}: {
  dialog: NonNullable<ActionDialogState>;
  busy: boolean;
  onCancel: () => void;
  onConfirm: (reason: string) => void;
}) {
  const [reason, setReason] = useState('');
  const isEmailTest = dialog.entity === 'email' && dialog.action === 'test';
  const canSubmit = isEmailTest ? /^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(reason) : reason.trim().length >= 4;
  return (
    <ModalShell title={`${labelize(dialog.action)} ${dialog.label}`} onCancel={onCancel}>
      <SafetyNotice text="This sensitive action will be recorded in the audit log." />
      <label className="grid gap-1 text-xs font-black uppercase tracking-wider text-slate-500">
        {isEmailTest ? 'Test recipient email' : 'Reason'}
        <textarea
          value={reason}
          onChange={event => setReason(event.target.value)}
          rows={isEmailTest ? 1 : 4}
          className="min-h-10 rounded-md border border-slate-200 p-3 text-sm font-semibold normal-case tracking-normal text-slate-800 outline-none focus:border-[#12335f]"
          placeholder={isEmailTest ? 'admin@example.com' : 'Required audit reason'}
        />
      </label>
      <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
        <Button type="button" variant="outline" className="h-10 rounded-md text-xs font-black" onClick={onCancel}>Cancel</Button>
        <Button type="button" disabled={!canSubmit || busy} className="h-10 rounded-md bg-[#12335f] text-xs font-black text-white hover:bg-[#0d274b]" onClick={() => onConfirm(reason.trim())}>
          {busy ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
          Confirm
        </Button>
      </div>
    </ModalShell>
  );
}

function EntityEditor({
  editor,
  companies,
  organizations,
  busy,
  onCancel,
  onSave
}: {
  editor: NonNullable<EditorState>;
  companies: Company[];
  organizations: Organization[];
  busy: boolean;
  onCancel: () => void;
  onSave: (values: Record<string, any>) => void;
}) {
  const record = editor.record || {};
  const [values, setValues] = useState<Record<string, any>>({
    companyName: record.name || '',
    shortName: record.shortName || '',
    portalDisplayName: record.portalDisplayName || '',
    logoUrl: record.logoUrl || '',
    contactEmail: record.contactEmail || '',
    contactPhone: record.contactPhone || '',
    address: record.address || '',
    homepageContent: record.homepageContent || '',
    aboutContent: record.aboutContent || '',
    footerContent: record.footerContent || '',
    grievanceContent: record.grievanceContent || '',
    procurementPolicy: record.procurementPolicy || '',
    isActive: record.isActive ?? true,
    organizationName: record.organizationName || '',
    organizationType: record.organizationType || 'MSME',
    gstin: record.gstin || '',
    panNumber: record.panNumber || record.pan || '',
    contactPersonName: record.contactPersonName || record.contactPerson || '',
    email: record.email || '',
    mobile: record.mobile || '',
    addressLine1: record.addressLine1 || record.address || '',
    state: record.state || '',
    district: record.district || '',
    pincode: record.pincode || '',
    verificationStatus: record.verificationStatus || 'PENDING',
    companyId: record.companyId || companies[0]?.id || '',
    name: record.name || '',
    role: record.role || 'buyer',
    accountStatus: record.accountStatus || 'ACTIVE',
    organizationId: record.organizationId || record.organization?.id || '',
    host: record.host || '',
    port: record.port || 587,
    secure: Boolean(record.secure),
    username: record.username || record.user || '',
    password: '',
    fromEmail: record.fromEmail || '',
    fromName: record.fromName || 'JsgSmile Portal',
    replyToEmail: record.replyToEmail || '',
    emailEnabled: record.emailEnabled ?? true,
    reason: ''
  });
  const set = (key: string, value: any) => setValues(prev => ({ ...prev, [key]: value }));
  const title = `${editor.mode === 'create' ? 'Add' : 'Edit'} ${labelize(editor.type)}`;
  return (
    <ModalShell title={title} onCancel={onCancel} wide>
      <div className="grid gap-3 md:grid-cols-2">
        {editor.type === 'company' && (
          <>
            <FormField label="Company name" value={values.companyName} onChange={value => set('companyName', value)} required />
            <FormField label="Short name" value={values.shortName} onChange={value => set('shortName', value)} />
            <FormField label="Portal display name" value={values.portalDisplayName} onChange={value => set('portalDisplayName', value)} required />
            <FormField label="Logo URL" value={values.logoUrl} onChange={value => set('logoUrl', value)} />
            <FormField label="Contact email" value={values.contactEmail} onChange={value => set('contactEmail', value)} />
            <FormField label="Contact phone" value={values.contactPhone} onChange={value => set('contactPhone', value)} />
            <FormField label="Address" value={values.address} onChange={value => set('address', value)} />
            <FormField label="District" value={values.district} onChange={value => set('district', value)} />
            <FormField label="State" value={values.state} onChange={value => set('state', value)} />
            <ToggleField label="Active company" value={Boolean(values.isActive)} onChange={value => set('isActive', value)} />
            <div className="md:col-span-2">
              <FormField label="Homepage content" value={values.homepageContent} onChange={value => set('homepageContent', value)} />
            </div>
            <div className="md:col-span-2">
              <FormField label="About content" value={values.aboutContent} onChange={value => set('aboutContent', value)} />
            </div>
            <div className="md:col-span-2">
              <FormField label="Footer content" value={values.footerContent} onChange={value => set('footerContent', value)} />
            </div>
            <div className="md:col-span-2">
              <FormField label="Grievance content" value={values.grievanceContent} onChange={value => set('grievanceContent', value)} />
            </div>
            <div className="md:col-span-2">
              <FormField label="Procurement policy" value={values.procurementPolicy} onChange={value => set('procurementPolicy', value)} />
            </div>
          </>
        )}
        {editor.type === 'organization' && (
          <>
            <FormField label="Organization name" value={values.organizationName} onChange={value => set('organizationName', value)} required />
            <SelectField label="Type" value={values.organizationType} onChange={value => set('organizationType', value)} options={['MSME', 'PRIVATE_LIMITED', 'PUBLIC_LIMITED', 'LLP', 'PARTNERSHIP', 'PROPRIETORSHIP', 'GOVERNMENT', 'PSU', 'STARTUP']} />
            <FormField label="GSTN" value={values.gstin} onChange={value => set('gstin', value)} />
            <FormField label="PAN" value={values.panNumber} onChange={value => set('panNumber', value)} />
            <FormField label="Email" value={values.email} onChange={value => set('email', value)} />
            <FormField label="Mobile" value={values.mobile} onChange={value => set('mobile', value)} />
            <FormField label="Address" value={values.addressLine1} onChange={value => set('addressLine1', value)} />
            <FormField label="State" value={values.state} onChange={value => set('state', value)} />
            <FormField label="District" value={values.district} onChange={value => set('district', value)} />
            <FormField label="Pincode" value={values.pincode} onChange={value => set('pincode', value)} />
            <SelectField label="Verification" value={values.verificationStatus} onChange={value => set('verificationStatus', value)} options={['PENDING', 'UNDER_REVIEW', 'VERIFIED', 'REJECTED', 'SUSPENDED']} />
            <CompanySelectField companies={companies} value={values.companyId} onChange={value => set('companyId', value)} />
          </>
        )}
        {editor.type === 'user' && (
          <>
            <FormField label="Name" value={values.name} onChange={value => set('name', value)} required />
            <FormField label="Email" value={values.email} onChange={value => set('email', value)} required />
            <FormField label="Mobile" value={values.mobile} onChange={value => set('mobile', value)} />
            <SelectField label="Role" value={values.role} onChange={value => set('role', value)} options={['buyer', 'seller', 'admin', 'master_admin']} />
            <SelectField label="Status" value={values.accountStatus} onChange={value => set('accountStatus', value)} options={['PENDING', 'ACTIVE', 'BLOCKED', 'SUSPENDED', 'DELETED']} />
            <OrganizationSelectField organizations={organizations} value={values.organizationId} onChange={value => set('organizationId', value)} />
            {editor.mode === 'create' && <FormField label="Temporary password" value={values.password} onChange={value => set('password', value)} placeholder="Auto-generated if blank" />}
          </>
        )}
        {editor.type === 'email' && (
          <>
            <FormField label="SMTP host" value={values.host} onChange={value => set('host', value)} />
            <FormField label="SMTP port" value={values.port} onChange={value => set('port', value)} />
            <FormField label="Username" value={values.username} onChange={value => set('username', value)} />
            <FormField label="New password" value={values.password} onChange={value => set('password', value)} placeholder="Leave blank to keep existing" />
            <FormField label="From email" value={values.fromEmail} onChange={value => set('fromEmail', value)} />
            <FormField label="From name" value={values.fromName} onChange={value => set('fromName', value)} />
            <FormField label="Reply-to email" value={values.replyToEmail} onChange={value => set('replyToEmail', value)} />
            <ToggleField label="Email enabled" value={Boolean(values.emailEnabled)} onChange={value => set('emailEnabled', value)} />
          </>
        )}
      </div>
      <FormField label="Audit reason" value={values.reason} onChange={value => set('reason', value)} required />
      <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
        <Button type="button" variant="outline" className="h-10 rounded-md text-xs font-black" onClick={onCancel}>Cancel</Button>
        <Button type="button" disabled={busy || !String(values.reason || '').trim()} className="h-10 rounded-md bg-[#12335f] text-xs font-black text-white hover:bg-[#0d274b]" onClick={() => onSave(values)}>
          {busy ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
          Save
        </Button>
      </div>
    </ModalShell>
  );
}

function ModalShell({ title, children, onCancel, wide }: { title: string; children: React.ReactNode; onCancel: () => void; wide?: boolean }) {
  return (
    <div className="fixed inset-0 z-50 flex items-end bg-slate-950/45 p-0 sm:items-center sm:justify-center sm:p-4">
      <section className={cn('max-h-[92vh] w-full overflow-y-auto rounded-t-md bg-white p-4 shadow-xl sm:rounded-md', wide ? 'sm:max-w-3xl' : 'sm:max-w-lg')}>
        <div className="mb-4 flex items-center justify-between gap-3">
          <h2 className="text-base font-black text-slate-950">{title}</h2>
          <Button type="button" variant="outline" className="h-8 rounded-md px-2 text-xs font-black" onClick={onCancel}>Close</Button>
        </div>
        <div className="space-y-4">{children}</div>
      </section>
    </div>
  );
}

function FormField({ label, value, onChange, placeholder, required }: { label: string; value: any; onChange: (value: string) => void; placeholder?: string; required?: boolean }) {
  return (
    <label className="grid gap-1 text-xs font-black uppercase tracking-wider text-slate-500">
      {label}{required ? ' *' : ''}
      <input value={value ?? ''} onChange={event => onChange(event.target.value)} placeholder={placeholder} className="h-10 rounded-md border border-slate-200 px-3 text-sm font-semibold normal-case tracking-normal text-slate-800 outline-none focus:border-[#12335f]" />
    </label>
  );
}

function SelectField({ label, value, onChange, options }: { label: string; value: any; onChange: (value: string) => void; options: string[] }) {
  return (
    <label className="grid gap-1 text-xs font-black uppercase tracking-wider text-slate-500">
      {label}
      <select value={value ?? ''} onChange={event => onChange(event.target.value)} className="h-10 rounded-md border border-slate-200 bg-white px-3 text-sm font-semibold normal-case tracking-normal text-slate-800 outline-none focus:border-[#12335f]">
        {options.map(option => <option key={option} value={option}>{labelize(option)}</option>)}
      </select>
    </label>
  );
}

function CompanySelectField({ companies, value, onChange }: { companies: Company[]; value: any; onChange: (value: string) => void }) {
  return (
    <label className="grid gap-1 text-xs font-black uppercase tracking-wider text-slate-500">
      Company
      <select value={value ?? ''} onChange={event => onChange(event.target.value)} className="h-10 rounded-md border border-slate-200 bg-white px-3 text-sm font-semibold normal-case tracking-normal text-slate-800 outline-none focus:border-[#12335f]">
        <option value="">No company</option>
        {companies.map(company => <option key={company.id} value={company.id}>{company.portalDisplayName || company.name}</option>)}
      </select>
    </label>
  );
}

function OrganizationSelectField({ organizations, value, onChange }: { organizations: Organization[]; value: any; onChange: (value: string) => void }) {
  return (
    <label className="grid gap-1 text-xs font-black uppercase tracking-wider text-slate-500">
      Organization
      <select value={value ?? ''} onChange={event => onChange(event.target.value)} className="h-10 rounded-md border border-slate-200 bg-white px-3 text-sm font-semibold normal-case tracking-normal text-slate-800 outline-none focus:border-[#12335f]">
        <option value="">No organization</option>
        {organizations.map(org => <option key={org.id} value={org.id}>{org.organizationName}</option>)}
      </select>
    </label>
  );
}

function ToggleField({ label, value, onChange }: { label: string; value: boolean; onChange: (value: boolean) => void }) {
  return (
    <label className="flex h-10 items-center justify-between rounded-md border border-slate-200 px-3 text-xs font-black uppercase tracking-wider text-slate-500">
      {label}
      <input type="checkbox" checked={value} onChange={event => onChange(event.target.checked)} className="h-4 w-4" />
    </label>
  );
}

function SafeActions({ onAction, label }: { onAction: (label: string) => void; label: string }) {
  return (
    <>
      <Button type="button" variant="outline" className="h-8 rounded-md px-2 text-[10px] font-black" onClick={() => toast.info(`Open detail view for ${label}.`)}>
        <Eye className="mr-1 h-3 w-3" />
        View
      </Button>
      <Button type="button" variant="outline" className="h-8 rounded-md px-2 text-[10px] font-black text-amber-700" onClick={() => onAction(`Suspend/archive ${label}`)}>
        <Archive className="mr-1 h-3 w-3" />
        Archive
      </Button>
    </>
  );
}

function SafetyNotice({ text = 'This action may affect historical records. Use archive, suspend, or restore so operational history is preserved.' }: { text?: string }) {
  return (
    <div className="rounded-md border border-amber-200 bg-amber-50 px-4 py-3 text-xs font-bold leading-5 text-amber-900">
      <AlertTriangle className="mr-2 inline h-4 w-4" />
      {text}
    </div>
  );
}

function CompanySelect({ companies, value, onChange }: { companies: Company[]; value: number | null; onChange: (id: number) => void }) {
  return (
    <select value={value || ''} onChange={event => onChange(Number(event.target.value))} className="h-10 min-w-64 rounded-md border border-slate-200 bg-white px-3 text-sm font-bold text-slate-700 outline-none focus:border-[#12335f]">
      {companies.map(company => <option key={company.id} value={company.id}>{company.portalDisplayName || company.name}</option>)}
    </select>
  );
}

const Detail = memo(function Detail({ label, value }: { label: string; value: unknown }) {
  return (
    <div>
      <p className="text-[10px] font-black uppercase tracking-wider text-slate-400">{label}</p>
      <p className="mt-0.5 truncate text-sm font-bold text-slate-800">{formatCell(value)}</p>
    </div>
  );
});

const StatusLine = memo(function StatusLine({ label, ok }: { label: string; ok: boolean }) {
  return (
    <div className="flex items-center justify-between gap-3 rounded-md border border-slate-100 bg-slate-50 px-3 py-2">
      <span className="text-xs font-bold text-slate-700">{label}</span>
      <span className={cn('inline-flex items-center gap-1 rounded-full px-2 py-1 text-[10px] font-black uppercase tracking-wider', ok ? 'bg-emerald-100 text-emerald-700' : 'bg-amber-100 text-amber-700')}>
        <CheckCircle2 className="h-3 w-3" />
        {ok ? 'Ready' : 'Review'}
      </span>
    </div>
  );
});

function SimpleList({ rows, primary, secondary, meta }: { rows: any[]; primary: string; secondary: string; meta: string }) {
  if (!rows.length) return <EmptyState />;
  return (
    <div className="divide-y divide-slate-100">
      {rows.map((row, index) => (
        <div key={row.id || index} className="flex items-center justify-between gap-3 py-3">
          <div>
            <p className="text-sm font-black text-slate-900">{formatCell(row[primary])}</p>
            <p className="text-xs font-semibold text-slate-500">{formatCell(row[secondary])}</p>
          </div>
          <p className="shrink-0 text-xs font-bold text-slate-400">{formatCell(row[meta])}</p>
        </div>
      ))}
    </div>
  );
}

function EmptyState() {
  return <div className="px-4 py-8 text-center text-sm font-bold text-slate-500">No records found for the current filters.</div>;
}

function ErrorState({ message }: { message: string }) {
  return <div className="rounded-md border border-red-100 bg-red-50 px-4 py-3 text-sm font-bold text-red-700">{message}</div>;
}

const endpoint = (path: string, params: Record<string, string | number | undefined>) => {
  const query = new URLSearchParams();
  for (const [key, value] of Object.entries(params)) {
    if (value !== undefined && value !== '') query.set(key, String(value));
  }
  const value = query.toString();
  return value ? `${path}?${value}` : path;
};

const valueAt = (row: any, path: string) => path.split('.').reduce((value, key) => value?.[key], row);

const formatCell = (value: unknown) => {
  if (typeof value === 'boolean') return value ? 'Yes' : 'No';
  if (typeof value === 'string' && /^\d{4}-\d{2}-\d{2}T/.test(value)) return value.slice(0, 10);
  if (typeof value === 'number') return Number.isFinite(value) ? value.toLocaleString('en-IN') : '-';
  if (value == null || value === '') return '-';
  if (typeof value === 'object') {
    const anyValue = value as any;
    return anyValue.organizationName || anyValue.name || anyValue.email || JSON.stringify(value);
  }
  return String(value).replace(/_/g, ' ');
};

const csvCell = (value: unknown) => {
  const text = formatCell(value).replace(/\s+/g, ' ').trim();
  return `"${text.replace(/"/g, '""')}"`;
};

const formatDate = (value: unknown) => {
  if (!value) return '-';
  const date = new Date(String(value));
  if (Number.isNaN(date.getTime())) return String(value);
  return date.toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' });
};

const labelize = (value: string) => value.replace(/_/g, ' ').replace(/([a-z])([A-Z])/g, '$1 $2').replace(/\b\w/g, char => char.toUpperCase());
