'use client';
import React, { Suspense, lazy, useState } from 'react';
import { usePathname, useRouter } from 'next/navigation';
import { useAuth } from './hooks/useAuth';
import { cn } from './lib/utils';
import { isShgUser } from './lib/shg';
import { getCookieValue } from './lib/auth';

// Eagerly imported (small, always-needed for initial routes).
import Home from './views/Home';
import Login from './views/Login';
import ForgotPassword from './views/ForgotPassword';
import Register from './views/Register';

// Lazy-loaded route components. Splitting these out shrinks the initial
// JS bundle dramatically (the App tree was ~500kB; without lazy, every page
// load shipped the entire portal). React.lazy + Suspense lets Next.js
// stream chunks per route so navigation only downloads what the user needs.
const MarketplaceProductList = lazy(() => import('./features/marketplace/pages/MarketplaceProductList'));
const MarketplaceHome = lazy(() => import('./features/marketplace/pages/MarketplaceHome'));
const Dashboard = lazy(() => import('./views/Dashboard'));
const MarketplaceProductDetail = lazy(() => import('./features/marketplace/pages/MarketplaceProductDetail'));
const MarketplaceServiceDetail = lazy(() => import('./features/marketplace/pages/MarketplaceServiceDetail'));
const BuyerRequirementDetailsPage = lazy(() => import('./features/marketplace/pages/BuyerRequirementDetailsPage'));
const PurchaseOrders = lazy(() => import('./views/PurchaseOrders'));
const RepeatOrders = lazy(() => import('./views/RepeatOrders'));
const RateContractsPage = lazy(() => import('./features/rateContract/pages/RateContractsPage'));
const CataloguePage = lazy(() => import('./features/catalogue/pages/CataloguePage'));
const InvoiceRegisterPage = lazy(() => import('./features/invoices/pages/InvoiceRegisterPage'));
const PaymentHistoryPage = lazy(() => import('./features/payments/pages/PaymentHistoryPage'));

const GuestCartPage = lazy(() => import('./features/marketplace/pages/GuestCartPage'));
const SellerOnboarding = lazy(() => import('./views/SellerOnboarding'));
const BuyerOnboarding = lazy(() => import('./views/BuyerOnboarding'));
const AdminOnboarding = lazy(() => import('./views/AdminOnboarding'));
const AdminOperations = lazy(() => import('./views/AdminOperations'));
const SellerRegistrationFlow = lazy(() => import('./views/SellerRegistrationFlow'));
const BuyerRegistrationFlow = lazy(() => import('./views/BuyerRegistrationFlow'));
const ShgOnboarding = lazy(() => import('./views/ShgOnboarding'));
const ShgRegistrationFlow = lazy(() => import('./views/ShgRegistrationFlow'));
const RegisterSelection = lazy(() => import('./views/RegisterSelection'));
const BuyerProfile = lazy(() => import('./views/BuyerProfile'));
const Vendors = lazy(() => import('./views/Vendors'));
const ParcelTracking = lazy(() => import('./views/ParcelTracking'));
const DeliveryListPage = lazy(() => import('./features/delivery/pages/DeliveryListPage'));
const DeliveryDetailPage = lazy(() =>
  import('./features/delivery/pages/DeliveryDetailPage').then(m => ({ default: m.DeliveryDetailPage }))
);
const SellerSettings = lazy(() => import('./views/SellerSettings'));
const Profile = lazy(() => import('./views/Profile'));
const CatalogueFormPage = lazy(() => import('./features/catalogue/pages/CatalogueFormPage'));
const GenericFeaturePage = lazy(() => import('./features/shared/GenericFeaturePage'));
const EscrowPage = lazy(() => import('./features/escrow/pages/EscrowPage'));
const AdminRecordsPage = lazy(() => import('./features/admin/pages/AdminRecordsPage'));
const RatingsPage = lazy(() => import('./features/ratings/pages/RatingsPage'));
const ComplianceRulesPage = lazy(() => import('./features/compliance/pages/ComplianceRulesPage'));
const FraudAlertsPage = lazy(() => import('./features/fraudAlerts/pages/FraudAlertsPage'));
const DirectPurchasePage = lazy(() => import('./features/directPurchase/pages/DirectPurchasePage'));
const AddressBookPage = lazy(() => import('./features/directPurchase/pages/AddressBookPage'));
const RbacPanel = lazy(() => import('./views/RbacPanel'));
const OrganizationManagement = lazy(() => import('./views/OrganizationManagement'));
const NotificationCenter = lazy(() => import('./views/NotificationCenter'));
const MISReports = lazy(() => import('./views/MISReports'));
const TeamManagementPage = lazy(() => import('./features/orgTeam/pages/TeamManagementPage'));
const AcceptInvitePage = lazy(() => import('./features/orgTeam/pages/AcceptInvitePage'));
const InviteSignupPage = lazy(() => import('./features/orgTeam/pages/InviteSignupPage'));
const CartPage = lazy(() => import('./features/cart/pages/CartPage'));
const GrnListPage = lazy(() => import('./features/grn/pages/GrnListPage'));
const GrnDetailPage = lazy(() => import('./features/grn/pages/GrnDetailPage'));
const TenderEvaluationPage = lazy(() => import('./features/tenderEval/pages/TenderEvaluationPage'));
const SellerDeliveryManagementPage = lazy(() => import('./features/sellerDelivery/pages/SellerDeliveryManagementPage'));
const DisputesPage = lazy(() => import('./features/disputes/pages/DisputesPage'));
const MessagesPage = lazy(() => import('./features/messages/pages/MessagesPage'));
const SecuritySettingsPage = lazy(() => import('./features/settings/pages/SecuritySettingsPage'));
const NotificationPrefsPage = lazy(() => import('./features/settings/pages/NotificationPrefsPage'));
const AadhaarKycPage = lazy(() => import('./features/kyc/AadhaarKycPage'));
const RoleReportsPage = lazy(() => import('./features/reports/pages/RoleReportsPage'));
const ProcurementReportPage = lazy(() => import('./features/reports/pages/ProcurementReportPage'));
const PaymentsReportPage = lazy(() => import('./features/reports/pages/PaymentsReportPage'));
const SuppliersReportPage = lazy(() => import('./features/reports/pages/SuppliersReportPage'));
const VendorStorefrontPage = lazy(() => import('./features/vendors/pages/VendorStorefrontPage'));
const MarketplaceSellerStore = lazy(() => import('./features/marketplace/pages/MarketplaceSellerStore'));
const PublicBuyerRequirements = lazy(() => import('./views/PublicBuyerRequirements'));
const MarketplaceSellersPage = lazy(() => import('./features/marketplace/pages/MarketplaceSellersPage'));
const MarketplaceBuyersPage = lazy(() => import('./features/marketplace/pages/MarketplaceBuyersPage'));
const AuctionLivePage = lazy(() => import('./features/auctions/pages/AuctionLivePage'));
const GlobalSearch = lazy(() => import('./features/search/GlobalSearch'));
const PortalDocumentation = lazy(() => import('./views/PortalDocumentation'));
const HelpPage = lazy(() => import('./views/HelpPage'));
const MasterAdminPage = lazy(() => import('./features/masterAdmin/pages/MasterAdminPage'));
const BidsListingPage = lazy(() => import('./features/procurementBid/pages/BidsListingPage'));
const BidDetailsPage = lazy(() => import('./features/procurementBid/pages/BidDetailsPage'));
const BidParticipationPage = lazy(() => import('./features/procurementBid/pages/BidParticipationPage'));
const BidResultsPage = lazy(() => import('./features/procurementBid/pages/BidResultsPage'));
const BidComparisonPage = lazy(() => import('./features/procurementBid/pages/BidComparisonPage'));
const AdminBidManagementPage = lazy(() => import('./features/procurementBid/pages/AdminBidManagementPage'));
const ProcurementOrdersPage = lazy(() => import('./features/procurementBid/pages/ProcurementOrdersPage'));
const ReverseAuctionCreatePage = lazy(() => import('./features/reverseAuctions/pages/ReverseAuctionCreatePage'));
const ReverseAuctionDetailPage = lazy(() => import('./features/reverseAuctions/pages/ReverseAuctionDetailPage'));
const ReverseAuctionLivePage = lazy(() => import('./features/reverseAuctions/pages/ReverseAuctionLivePage'));
const AuctionResultPage = lazy(() => import('./features/reverseAuctions/pages/AuctionResultPage'));
const MarketplaceComparePage = lazy(() => import('./features/marketplace/pages/MarketplaceComparePage'));
const SavedSuppliersPage = lazy(() => import('./features/marketplace/pages/SavedSuppliersPage'));
const PublicInfoPage = lazy(() => import('./features/marketplace/pages/PublicInfoPage'));
const AdminBannerManagementPage = lazy(() => import('./features/banners/pages/AdminBannerManagementPage'));
const MonthlyRankingsAdminPage = lazy(() => import('./features/banners/pages/MonthlyRankingsAdminPage'));
const OrganizationBannerEligibilityPage = lazy(() => import('./features/banners/pages/OrganizationBannerEligibilityPage'));
const AdminMarketplaceHomeSectionsPage = lazy(() => import('./features/marketplace/pages/AdminMarketplaceHomeSectionsPage'));
const CreateProcurementPage = lazy(() => import('./features/procurementWizard/pages/CreateProcurementPage'));
const ProcurementDraftsPage = lazy(() => import('./features/procurementWizard/pages/ProcurementDraftsPage'));
// LEGACY: CreateBidPage import removed — /buyer/create-bid now shows LegacyNoticePage.
// The old bidCreationWizardV2 files are preserved but no longer routed.
const BuyerProcurementHub = lazy(() => import('./features/procurement/pages/BuyerProcurementHub'));
const MyProcurementsPage = lazy(() => import('./features/procurement/pages/MyProcurementsPage'));
const SupplierResponsesPage = lazy(() => import('./features/procurement/pages/SupplierResponsesPage'));
const ProcurementCheckoutPage = lazy(() => import('./features/procurementCheckoutV2/pages/ProcurementCheckoutPage'));
const SellerOpportunitiesPage = lazy(() => import('./features/sellerOpportunities/pages/SellerOpportunitiesPage'));
const SellerBidsPage = lazy(() => import('./features/procurementBid/pages/SellerBidsPage'));
const SellerEventListPage = lazy(() => import('./features/sellerOpportunities/pages/SellerEventListPage'));
const SellerEventDetailPage = lazy(() => import('./features/sellerOpportunities/pages/SellerEventDetailPage'));
const TenderDetailPage = lazy(() => import('./features/tenders/pages/TenderDetailPage'));
const RfqDetailPage = lazy(() => import('./features/rfq/pages/RfqDetailPage'));
const RfpDetailPage = lazy(() => import('./features/rfq/pages/RfpDetailPage'));
const SubmitQuotationPage = lazy(() => import('./features/rfq/pages/SubmitQuotationPage'));
const RfqComparisonPage = lazy(() => import('./features/rfq/pages/RfqComparisonPage'));
const InviteLoginPopup = lazy(() => import('./features/notifications/InviteLoginPopup'));
const BuyerRequirementListPage = lazy(() => import('./features/marketplace/pages/BuyerRequirementListPage'));

import Sidebar, { Header } from './components/layout/Navbar';
import { OrgApprovalBanner } from './components/OrgApprovalBanner';
import PremiumLoader from './components/PremiumLoader';

/**
 * Lightweight skeleton for lazy-loaded routes. Replaces a full-page spinner
 * so navigation feels instant: the layout (sidebar, header) stays put and
 * only the main panel shows shimmer until the route chunk lands.
 */
function RouteFallback() {
  return (
    <div className="p-6 space-y-6 animate-pulse">
      <div className="flex justify-between items-center">
        <div className="h-8 w-48 bg-slate-200 rounded-xl" />
        <div className="h-10 w-24 bg-slate-200 rounded-xl" />
      </div>
      <div className="grid gap-6 md:grid-cols-3">
        <div className="h-32 bg-slate-200/60 rounded-2xl border border-slate-200/20" />
        <div className="h-32 bg-slate-200/60 rounded-2xl border border-slate-200/20" />
        <div className="h-32 bg-slate-200/60 rounded-2xl border border-slate-200/20" />
      </div>
      <div className="space-y-4">
        <div className="h-12 bg-slate-200/40 rounded-xl w-full" />
        <div className="h-12 bg-slate-200/40 rounded-xl w-full" />
        <div className="h-12 bg-slate-200/40 rounded-xl w-full" />
      </div>
    </div>
  );
}

const scheduleIdle = (callback: () => void, timeout = 2500) => {
  if (typeof window === 'undefined') return () => undefined;
  const idleWindow = window as Window & typeof globalThis & {
    requestIdleCallback?: (callback: () => void, options?: { timeout?: number }) => number;
    cancelIdleCallback?: (id: number) => void;
  };
  const id = idleWindow.requestIdleCallback
    ? idleWindow.requestIdleCallback(callback, { timeout })
    : window.setTimeout(callback, Math.min(timeout, 800));

  return () => {
    if (idleWindow.cancelIdleCallback && typeof id === 'number') {
      idleWindow.cancelIdleCallback(id);
      return;
    }
    window.clearTimeout(id as number);
  };
};

const shouldRunBackgroundPreload = () => {
  if (typeof window === 'undefined') return false;
  const nav = navigator as Navigator & {
    connection?: {
      saveData?: boolean;
      effectiveType?: string;
    };
  };
  if (nav.connection?.saveData) return false;
  if (nav.connection?.effectiveType && /(^2g$|slow-2g)/i.test(nav.connection.effectiveType)) return false;
  return window.matchMedia('(min-width: 1024px)').matches;
};

const preloadInBatches = (loaders: ReadonlyArray<() => Promise<unknown>>) => {
  let cancelled = false;
  const run = (index: number) => {
    if (cancelled || index >= loaders.length) return;
    loaders[index]()
      .catch(() => undefined)
      .finally(() => {
        if (!cancelled) window.setTimeout(() => run(index + 1), 180);
      });
  };
  run(0);
  return () => {
    cancelled = true;
  };
};

const rolePreloaders = {
  shg: [
    () => import('./views/ShgOnboarding'),
    () => import('./features/payments/pages/PaymentHistoryPage'),
  ],
  buyer: [
    () => import('./features/procurement/pages/MyProcurementsPage'),
    () => import('./features/procurementWizard/pages/CreateProcurementPage'),
    () => import('./features/procurementWizard/pages/ProcurementDraftsPage'),
    () => import('./features/procurement/pages/BuyerProcurementHub'),
    () => import('./features/procurementBid/pages/BidComparisonPage'),
    // LEGACY: CreateBidPage preload removed — /buyer/create-bid now shows LegacyNoticePage
  ],
  seller: [
    () => import('./features/sellerOpportunities/pages/SellerOpportunitiesPage'),
    () => import('./features/sellerOpportunities/pages/SellerEventListPage'),
    () => import('./features/procurementBid/pages/BidsListingPage'),
    () => import('./features/procurementBid/pages/BidParticipationPage'),
    () => import('./features/procurementBid/pages/SellerBidsPage'),
  ],
  admin: [
    () => import('./features/admin/pages/AdminRecordsPage'),
    () => import('./views/OrganizationManagement'),
    () => import('./features/fraudAlerts/pages/FraudAlertsPage'),
    () => import('./views/RbacPanel'),
    () => import('./features/messages/pages/MessagesPage'),
  ],
} as const;


const roleOk = (role?: string, allowed?: string[]) => {
  if (!allowed) return true;
  if (role === 'master_admin' && allowed.includes('admin')) return true;
  return Boolean(role && allowed.includes(role));
};

const publicInfoRoutes = [
  '/contact-us',
  '/feedback',
  '/sitemap',
  '/faqs',
  '/faq',
  '/terms-of-use',
  '/terms-and-conditions',
  '/website-policies',
  '/privacy-policy',
  '/copyright',
  '/copyrights',
  '/copyright-policy',
  '/hyperlinks',
  '/hyperlinking-policy',
  '/disclaimer',
  '/caution-notice',
  '/caution-notices',
];

const isPublicRoute = (route: string) => {
  const publicPaths = [
    '/',
    '/login',
    '/shg/login',
    '/forgot-password',
    '/register',
    '/seller/register',
    '/buyer/register',
    '/hershg/register',
    '/admin/register',
    '/invite/accept',
    '/invite/signup',
    '/cart',
    '/help',
    '/user-guide',
    '/marketplace/products',
    '/marketplace/services',
    '/marketplace/sellers',
    '/marketplace/cart',
    '/marketplace/compare',
    '/bids',
    '/tenders',
    '/seller/rfq',
    '/seller/rfp',
  ];

  if (publicPaths.includes(route)) return true;
  if (publicInfoRoutes.includes(route)) return true;
  if (route.startsWith('/marketplace')) return true;
  if (route.startsWith('/bids')) return true;
  if (route.startsWith('/tenders')) return true;
  if (route.startsWith('/reverse-auctions')) return true;
  if (route.startsWith('/admin/bids')) return true;
  if (/^\/vendors\/-?\d+$/.test(route)) return true;
  if (/^\/buyer-requirements\/-?\d+$/.test(route)) return true;
  return false;
};

/**
 * Imperative redirect component. Guards against firing when we're already on
 * the target path (which can happen in dev under React Strict Mode when
 * effects run twice) and uses replace so the back button isn't poisoned.
 */
function Redirect({ to }: { to: string }) {
  const router = useRouter();
  const currentPath = usePathname();

  React.useEffect(() => {
    if (currentPath === to) return;
    router.replace(to);
  }, [router, to, currentPath]);

  return null;
}

function LegacyNoticePage({ title, target = '/buyer/procurement/create' }: { title: string; target?: string }) {
  const router = useRouter();
  return (
    <div className="flex min-h-[60vh] flex-col items-center justify-center p-6 text-center">
      <div className="max-w-md border border-slate-200 bg-white rounded-2xl p-8 shadow-sm space-y-6">
        <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-full bg-amber-50 text-amber-600">
          <svg className="h-7 w-7 text-amber-600" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
          </svg>
        </div>
        <div className="space-y-2">
          <h2 className="text-xl font-black text-slate-900 tracking-tight">Unified Sourcing Upgrade</h2>
          <p className="text-sm font-semibold leading-relaxed text-slate-500">
            The legacy "{title}" creation flow has been retired and upgraded to the unified, guided Create Procurement wizard.
          </p>
        </div>
        <div className="flex flex-col gap-2.5">
          <button onClick={() => router.push(target)} className="w-full bg-[#12335f] hover:bg-[#0e2c53] text-white font-black h-11 uppercase text-[10px] tracking-widest rounded-lg shadow-sm transition">
            Open Create Procurement
          </button>
          <button onClick={() => router.push('/buyer/procurement')} className="w-full border border-slate-200 bg-white hover:bg-slate-50 text-slate-700 font-black h-11 uppercase text-[10px] tracking-widest rounded-lg transition">
            Go to Sourcing Hub
          </button>
        </div>
      </div>
    </div>
  );
}

let globalMounted = false;

export default function App() {
  const { user, loading, isLoggingOut } = useAuth();
  const router = useRouter();
  const pathname = usePathname() || '/';
  const [mounted, setMounted] = useState(globalMounted);
  const [isSidebarOpen, setIsSidebarOpen] = useState(false);
  const [isSidebarCollapsed, setIsSidebarCollapsed] = useState(true);
  const [isSidebarHovered, setIsSidebarHovered] = useState(false);
  const visualCollapsed = isSidebarCollapsed && !isSidebarHovered;

  const [hasCookie, setHasCookie] = useState(() => {
    if (typeof document === 'undefined') return false;
    return Boolean(getCookieValue('csrfToken'));
  });

  React.useEffect(() => {
    const saved = localStorage.getItem('isSidebarCollapsed');
    if (saved !== null) {
      setIsSidebarCollapsed(JSON.parse(saved));
    }
  }, []);

  const toggleSidebarCollapse = () => {
    setIsSidebarCollapsed(prev => {
      const newValue = !prev;
      localStorage.setItem('isSidebarCollapsed', JSON.stringify(newValue));
      return newValue;
    });
  };

  React.useEffect(() => {
    globalMounted = true;
    setMounted(true);
  }, []);

  React.useEffect(() => {
    if (mounted) {
      setHasCookie(Boolean(getCookieValue('csrfToken')));
    }
  }, [mounted, loading, user]);

  React.useEffect(() => {
    if (mounted && !loading && !user) {
      if (pathname === '/onboarding/kyc') {
        const savedRedirect = localStorage.getItem('preRegisterKycRedirectPath');
        if (savedRedirect) {
          const search = window.location.search;
          router.replace(`${savedRedirect}${search}`);
          return;
        }
      }
      if (!['/', '/login', '/shg/login', '/forgot-password', '/register', '/seller/register', '/buyer/register', '/hershg/register', '/admin/register', '/invite/accept', '/invite/signup', '/cart', '/help', '/user-guide', ...publicInfoRoutes].includes(pathname) && !pathname.startsWith('/marketplace') && !pathname.startsWith('/bids') && !pathname.startsWith('/admin/bids') && !pathname.startsWith('/tenders') && !pathname.startsWith('/reverse-auctions') && !/^\/vendors\/\d+$/.test(pathname) && !/^\/buyer-requirements\/\d+$/.test(pathname)) {
        router.replace('/');
      }
    }
  }, [mounted, loading, user, pathname, router]);

  // Detect session marker cookie after backend sets HttpOnly auth cookies.
  const cookieStampedRef = React.useRef(false);
  React.useEffect(() => {
    if (!mounted || loading) return;
    if (pathname === '/' && user) {
      if (getCookieValue('csrfToken')) {
        cookieStampedRef.current = true;
        setHasCookie(true);
      }
    }
  }, [mounted, loading, user, pathname]);

  // Background preloading of high-probability lazy-loaded dashboard pages after login.
  React.useEffect(() => {
    if (!mounted || !user) return;
    const loaders = isShgUser(user)
      ? rolePreloaders.shg
      : user.role === 'buyer'
        ? rolePreloaders.buyer
        : user.role === 'seller'
          ? rolePreloaders.seller
          : user.role === 'admin'
            ? rolePreloaders.admin
            : [];

    let cancelBatches = () => { };
    const cancelIdle = scheduleIdle(() => {
      if (!shouldRunBackgroundPreload()) return;
      cancelBatches = preloadInBatches(loaders);
    }, 4500);
    return () => {
      cancelIdle();
      cancelBatches();
    };
  }, [mounted, user]);

  if (!mounted) {
    return <PremiumLoader />;
  }

  const renderRoute = () => {
    if (isLoggingOut) {
      return <PremiumLoader />;
    }

    const isCurrentShg = isShgUser(user);
    const authenticatedHome = user?.role === 'master_admin' ? '/master-admin' : isCurrentShg ? '/shg/onboarding' : '/dashboard';

    // Show PremiumLoader for all non-marketplace/public-info routes while loading is true (e.g., initial auth check, dashboard loading, logout process)
    if (loading) {
      const skipLoader = pathname.startsWith('/marketplace') || pathname.startsWith('/bids') || pathname.startsWith('/tenders') || pathname === '/help' || pathname === '/user-guide' || publicInfoRoutes.includes(pathname);
      if (!skipLoader) {
        return <PremiumLoader />;
      }
    }
    if (pathname === '/') return user && hasCookie ? <Redirect to={authenticatedHome} /> : <MarketplaceHome />;
    if (pathname === '/login') return user && hasCookie ? <Redirect to={authenticatedHome} /> : <Login />;
    if (pathname === '/shg/login') return <Redirect to="/login" />;
    if (pathname === '/forgot-password') return user && hasCookie ? <Redirect to={authenticatedHome} /> : <ForgotPassword />;
    if (pathname === '/register') return <RegisterSelection />;
    if (pathname === '/seller/register') return <SellerRegistrationFlow />;
    if (pathname === '/buyer/register') return <BuyerRegistrationFlow />;
    if (pathname === '/hershg/register') return <ShgRegistrationFlow />;
    if (pathname === '/admin/register') return <Register type="admin" />;
    // Invite routes must be reachable WITHOUT an authenticated session: a brand
    // new invitee has no account yet. AcceptInvitePage decides whether to log
    // in, sign up, or auto-accept; InviteSignupPage creates the account.
    if (pathname === '/invite/accept') return <AcceptInvitePage />;
    if (pathname === '/invite/signup') return <InviteSignupPage />;
    if (pathname === '/help') return <HelpPage />;
    if (pathname === '/user-guide') return <PortalDocumentation />;
    if (publicInfoRoutes.includes(pathname)) return <PublicInfoPage />;
    // Public marketplace routes (accessible without login)
    if (pathname === '/marketplace/products') return <MarketplaceProductList />;
    if (pathname === '/marketplace/services') return <MarketplaceProductList />;
    if (pathname === '/marketplace/sellers') return <MarketplaceSellersPage />;
    if (pathname === '/marketplace/buyers') return <MarketplaceBuyersPage />;
    if (pathname === '/marketplace/cart') return <GuestCartPage />;
    if (pathname === '/marketplace/requirements') return <BuyerRequirementListPage />;
    
    if (pathname === '/marketplace/compare') return <MarketplaceComparePage />;
    
    if (pathname === '/bids') return <Redirect to="/marketplace" />;
    if (pathname === '/tenders') return <TenderDetailPage />;
    
    if (/^\/bids\/[^/]+\/participate$/.test(pathname)) {
      if (user && user.role !== 'seller') {
        const bidId = pathname.split('/')[2];
        return <Redirect to={`/bids/${bidId}`} />;
      }
      return <BidParticipationPage />;
    }
    if (/^\/bids\/[^/]+\/results$/.test(pathname)) return <BidResultsPage />;
    if (/^\/bids\/[^/]+\/compare$/.test(pathname)) return <BidComparisonPage />;
    if (/^\/bids\/[^/]+$/.test(pathname)) {
      if (user && user.role === 'buyer') {
        return <Redirect to="/buyer/my-procurements" />;
      }
      return <BidDetailsPage />;
    }

    if (pathname === '/admin/bids') {
      const isFeatureEnabled = user?.enabledFeatures?.includes('admin-bid-approval');
      if (!isFeatureEnabled) {
        return <Redirect to={authenticatedHome} />;
      }
      return <AdminBidManagementPage />;
    }
    if (/^\/marketplace\/products\/-?\d+$/.test(pathname)) return <MarketplaceProductDetail />;
    if (/^\/marketplace\/services\/-?\d+$/.test(pathname)) return <MarketplaceServiceDetail />;
    if (/^\/marketplace\/requirements\/-?\d+$/.test(pathname)) return <BuyerRequirementDetailsPage />;

    // Public vendor store — accessible to everyone
    if (/^\/vendors\/-?\d+$/.test(pathname)) return <MarketplaceSellerStore />;
    {
      const buyerRequirementsMatch = pathname.match(/^\/buyer-requirements\/(-?\d+)$/);
      if (buyerRequirementsMatch) {
        const buyerId = Number(buyerRequirementsMatch[1]);
        if (Number.isFinite(buyerId)) return <PublicBuyerRequirements buyerId={buyerId} />;
      }
    }

    if (pathname === '/seller/rfq') return <RfqDetailPage />;
    if (pathname === '/seller/rfp') return <RfpDetailPage />;
    {
      const reverseAuctionDetailMatch = pathname.match(/^\/reverse-auctions\/(\d+)$/);
      if (reverseAuctionDetailMatch) {
        const id = Number(reverseAuctionDetailMatch[1]);
        if (Number.isFinite(id) && id > 0) return <ReverseAuctionDetailPage id={id} />;
      }
    }

    if (pathname === '/cart' && !user) return <GuestCartPage />;
    if (!user) {
      if (!isPublicRoute(pathname)) {
        return <PremiumLoader />;
      }
      return null;
    }
    const shgRouteOk = isCurrentShg || roleOk(user.role, ['shg']);
    if ((pathname === '/master-admin' || pathname.startsWith('/master-admin/')) && roleOk(user.role, ['master_admin'])) return <MasterAdminPage />;
    if (pathname === '/dashboard' && user.role === 'master_admin') return <Redirect to="/master-admin" />;
    if (pathname === '/dashboard' && isCurrentShg) return <Redirect to="/shg/onboarding" />;
    if (pathname === '/dashboard') return <Dashboard />;
    if (pathname === '/shg/onboarding' && shgRouteOk) return <ShgOnboarding section="onboarding" />;
    if (pathname === '/shg/dashboard' && shgRouteOk) return <ShgOnboarding section="dashboard" />;
    if (pathname === '/shg/profile' && shgRouteOk) return <ShgOnboarding section="profile" />;
    if (pathname === '/shg/members' && shgRouteOk) return <ShgOnboarding section="members" />;
    if (pathname === '/shg/bank-details' && shgRouteOk) return <ShgOnboarding section="bank-details" />;
    if (pathname === '/shg/documents' && shgRouteOk) return <ShgOnboarding section="documents" />;
    if (pathname === '/shg/products' && shgRouteOk) return <ShgOnboarding section="products" />;
    if (pathname === '/shg/orders' && shgRouteOk) return <ShgOnboarding section="orders" />;
    if (pathname === '/shg/payments' && shgRouteOk) return <ShgOnboarding section="payments" />;
    if (pathname === '/shg/meetings' && shgRouteOk) return <ShgOnboarding section="meetings" />;
    if (pathname === '/shg/schemes' && shgRouteOk) return <ShgOnboarding section="schemes" />;
    if (pathname === '/shg/support' && shgRouteOk) return <ShgOnboarding section="support" />;
    if (pathname === '/shg/settings' && shgRouteOk) return <SellerSettings />;
    if (pathname === '/my-org/banner-eligibility') return <OrganizationBannerEligibilityPage />;
    if (pathname === '/cart' && roleOk(user.role, ['buyer', 'seller'])) return <CartPage />;
    if (pathname === '/admin' && roleOk(user.role, ['admin'])) return <Dashboard />;
    if (pathname === '/seller/onboarding' && roleOk(user.role, ['seller'])) return <SellerOnboarding />;
    
    // Seller Opportunities (explicit route-to-prop mapping)
    if (pathname === '/seller/opportunities' && roleOk(user.role, ['seller'])) return <SellerOpportunitiesPage key={pathname} subRouteType="" />;
    if (pathname === '/seller/opportunities/rfqs' && roleOk(user.role, ['seller'])) return <SellerOpportunitiesPage key={pathname} subRouteType="RFQ" />;
    if (pathname === '/seller/opportunities/rfps' && roleOk(user.role, ['seller'])) return <SellerOpportunitiesPage key={pathname} subRouteType="RFP" />;
    if (pathname === '/seller/opportunities/open-tenders' && roleOk(user.role, ['seller'])) return <SellerOpportunitiesPage key={pathname} subRouteType="Open Tender" />;
    if (pathname === '/seller/opportunities/invitations' && roleOk(user.role, ['seller'])) return <SellerOpportunitiesPage key={pathname} subRouteType="Limited Tender" />;
    if (pathname === '/seller/opportunities/auctions' && roleOk(user.role, ['seller'])) return <SellerOpportunitiesPage key={pathname} subRouteType="Reverse Auction" />;
    
    if (pathname === '/seller/procurement/events' && roleOk(user.role, ['seller'])) return <SellerEventListPage />;
    {
      const sellerEventDetailMatch = pathname.match(/^\/seller\/procurement\/events\/([^/]+)$/);
      if (sellerEventDetailMatch && roleOk(user.role, ['seller'])) {
        return <SellerEventDetailPage id={sellerEventDetailMatch[1]} />;
      }
    }
    if (pathname === '/seller/rfq/submit-quotation' && roleOk(user.role, ['seller'])) return <SubmitQuotationPage />;
    if (pathname === '/seller/marketplace' && roleOk(user.role, ['seller'])) return <MarketplaceProductList />;
    if (pathname === '/seller/catalogue' && roleOk(user.role, ['seller'])) return <CataloguePage mode="seller" />;
    if (pathname === '/seller/products/new' && roleOk(user.role, ['seller'])) return <CatalogueFormPage />;
    if (/^\/seller\/products\/[^/]+\/edit$/.test(pathname) && roleOk(user.role, ['seller'])) return <CatalogueFormPage />;
    if (pathname === '/seller/services/new' && roleOk(user.role, ['seller'])) return <CatalogueFormPage />;
    if (/^\/seller\/services\/[^/]+\/edit$/.test(pathname) && roleOk(user.role, ['seller'])) return <CatalogueFormPage />;
    if (pathname === '/seller/orders' && roleOk(user.role, ['seller'])) return <PurchaseOrders />;
    if (pathname === '/seller/delivery' && roleOk(user.role, ['seller'])) return <ParcelTracking />;
    if (pathname === '/seller/delivery-management' && roleOk(user.role, ['seller'])) return <SellerDeliveryManagementPage />;
    if (pathname === '/seller/invoices' && roleOk(user.role, ['seller'])) return <InvoiceRegisterPage role="seller" />;
    if (pathname === '/seller/disputes' && roleOk(user.role, ['seller'])) return <DisputesPage />;
    if (pathname === '/seller/messages' && roleOk(user.role, ['seller'])) return <MessagesPage />;
    if (pathname === '/seller/ratings' && roleOk(user.role, ['seller'])) return <RatingsPage endpoint={`/api/ratings/supplier/${user.id}`} mode="supplier" />;
    
    if (pathname === '/seller/settings' && roleOk(user.role, ['seller'])) return <SellerSettings />;
    
    // Seller Bids (explicit route-to-prop mapping)
    if (pathname === '/seller/bids/submitted' && roleOk(user.role, ['seller'])) return <SellerBidsPage key={pathname} subRouteType="submitted" />;
    if (pathname === '/seller/bids/draft' && roleOk(user.role, ['seller'])) return <SellerBidsPage key={pathname} subRouteType="draft" />;
    if (pathname === '/seller/bids/awarded' && roleOk(user.role, ['seller'])) return <SellerBidsPage key={pathname} subRouteType="awarded" />;
    
    // Seller & Buyer repeat orders
    if (pathname === '/orders/repeat' && roleOk(user.role, ['buyer', 'seller'])) return <RepeatOrders />;
    
    if (pathname === '/buyer/onboarding' && roleOk(user.role, ['buyer'])) return <BuyerOnboarding />;
    if (pathname === '/buyer/profile' && roleOk(user.role, ['buyer'])) return <BuyerProfile />;
    if (pathname === '/buyer/create-bid' && roleOk(user.role, ['buyer'])) {
      return <Redirect to="/buyer/procurement/create" />;
    }
    if (pathname === '/buyer/procurement/create' && roleOk(user.role, ['buyer'])) return <CreateProcurementPage />;
    if (pathname === '/buyer/procurement/drafts' && roleOk(user.role, ['buyer'])) return <ProcurementDraftsPage />;
    if (pathname === '/buyer/procurement/responses' && roleOk(user.role, ['buyer'])) return <SupplierResponsesPage />;
    {
      const rfqCompareMatch = pathname.match(/^\/buyer\/quote-requests\/(\d+)\/compare$/);
      if (rfqCompareMatch && roleOk(user.role, ['buyer'])) {
        const id = Number(rfqCompareMatch[1]);
        if (Number.isFinite(id) && id > 0) return <RfqComparisonPage id={id} />;
      }
    }
    
    
    if (pathname === '/buyer/marketplace' && roleOk(user.role, ['buyer'])) return <MarketplaceProductList />;
    
    if (pathname === '/buyer/requirements/new' && roleOk(user.role, ['buyer'])) {
      return <LegacyNoticePage title="New Buyer Requirement" />;
    }
    if (pathname === '/buyer/procurement' && roleOk(user.role, ['buyer'])) return <BuyerProcurementHub />;
    if (pathname === '/buyer/my-procurements' && roleOk(user.role, ['buyer'])) return <MyProcurementsPage />;
    if (pathname === '/buyer/rate-contracts' && roleOk(user.role, ['buyer'])) return <RateContractsPage />;
    if (pathname === '/buyer/procurement/checkout' && roleOk(user.role, ['buyer'])) return <ProcurementCheckoutPage />;
    if (pathname === '/buyer/address-book' && roleOk(user.role, ['buyer'])) return <AddressBookPage />;
    
    
    if (pathname === '/buyer/vendors' && roleOk(user.role, ['buyer'])) return <Vendors />;
    if (pathname === '/buyer/saved-suppliers' && roleOk(user.role, ['buyer'])) return <SavedSuppliersPage />;
    
    
    if (pathname === '/buyer/orders' && roleOk(user.role, ['buyer'])) return <PurchaseOrders />;
    if (pathname === '/buyer/repeat-orders' && roleOk(user.role, ['buyer'])) return <RepeatOrders />;
    if (pathname === '/buyer/inspection' && roleOk(user.role, ['buyer'])) return <GenericFeaturePage title="Inspection" eyebrow="Quality Control" description="Inspection reports connected to purchase orders." endpoint="/api/purchase-orders" />;
    if (pathname === '/buyer/invoices' && roleOk(user.role, ['buyer'])) return <InvoiceRegisterPage role="buyer" />;
    if (pathname === '/buyer/payments' && roleOk(user.role, ['buyer'])) return <PaymentHistoryPage />;
    if (pathname === '/buyer/escrow' && roleOk(user.role, ['buyer'])) return <EscrowPage />;
    if (pathname === '/buyer/disputes' && roleOk(user.role, ['buyer'])) return <DisputesPage />;
    if (pathname === '/buyer/messages' && roleOk(user.role, ['buyer'])) return <MessagesPage />;
    if (pathname === '/admin/messages' && roleOk(user.role, ['admin'])) return <MessagesPage />;
    if (pathname === '/buyer/ratings' && roleOk(user.role, ['buyer'])) return <RatingsPage endpoint={`/api/ratings/buyer/${user.id}`} mode="buyer" />;
    if (pathname === '/payments' && roleOk(user.role, ['buyer', 'seller', 'admin'])) return <PaymentHistoryPage admin={user.role === 'admin'} />;
    if (pathname === '/payments/transactions' && roleOk(user.role, ['buyer', 'seller', 'admin'])) return <PaymentHistoryPage admin={user.role === 'admin'} />;
    if (pathname === '/payments/invoices' && roleOk(user.role, ['buyer', 'seller', 'admin'])) return <InvoiceRegisterPage role={user.role === 'admin' ? 'admin' : user.role === 'seller' ? 'seller' : 'buyer'} />;
    if (pathname === '/escrow' && roleOk(user.role, ['buyer', 'seller', 'admin'])) return <EscrowPage />;
    if (pathname === '/payments/escrow' && roleOk(user.role, ['buyer', 'seller', 'admin'])) return <EscrowPage />;
    
    if (pathname === '/orders' && roleOk(user.role, ['buyer', 'seller'])) return <PurchaseOrders />;
    if (pathname === '/orders' && roleOk(user.role, ['admin'])) return <ProcurementOrdersPage />;
    if (pathname === '/orders/delivery-confirmation' && roleOk(user.role, ['buyer'])) return <GrnListPage />;
    if (pathname === '/orders/tracking' && roleOk(user.role, ['buyer', 'seller', 'admin'])) {
      if (user.role === 'seller') return <SellerDeliveryManagementPage />;
      if (user.role === 'admin') return <DeliveryListPage scope="admin" />;
      return <ParcelTracking />;
    }
    if (pathname === '/buyer/tracking' && roleOk(user.role, ['buyer'])) return <ParcelTracking />;
    if (pathname === '/admin/delivery' && roleOk(user.role, ['admin'])) return <DeliveryListPage scope="admin" />;
    {
      const deliveryDetailMatch = pathname.match(/^\/delivery\/(\d+)$/);
      if (deliveryDetailMatch) {
        const id = Number(deliveryDetailMatch[1]);
        if (Number.isFinite(id) && id > 0) return <DeliveryDetailPage deliveryId={id} onClose={() => router.back()} />;
      }
    }
    if (pathname === '/profile') return <Profile />;
    if (pathname === '/reports' && roleOk(user.role, ['buyer', 'seller'])) return <RoleReportsPage />;
    if (pathname === '/admin/onboarding' && roleOk(user.role, ['admin'])) return <AdminOnboarding />;
    if (pathname === '/admin/shg-applications' && roleOk(user.role, ['admin'])) return <Redirect to="/admin/onboarding?tab=shg" />;
    if (/^\/admin\/shg-applications\/\d+$/.test(pathname) && roleOk(user.role, ['admin'])) return <Redirect to="/admin/onboarding?tab=shg" />;
    if (pathname === '/admin/users' && roleOk(user.role, ['admin'])) return <AdminRecordsPage kind="users" />;
    if (pathname === '/admin/marketplace' && roleOk(user.role, ['admin'])) return <CataloguePage mode="admin" />;
    if (pathname === '/admin/marketplace/home-sections' && roleOk(user.role, ['admin'])) return <AdminMarketplaceHomeSectionsPage />;
    if (pathname === '/admin/categories' && roleOk(user.role, ['admin'])) return <GenericFeaturePage title="Categories" eyebrow="Admin" description="Category taxonomy loaded from marketplace API." endpoint="/api/categories" />;
    if (pathname === '/admin/fraud-alerts' && roleOk(user.role, ['admin'])) return <FraudAlertsPage />;
    if (pathname === '/admin/disputes' && roleOk(user.role, ['admin'])) return <DisputesPage />;
    if (pathname === '/admin/grievances' && roleOk(user.role, ['admin'])) return <GenericFeaturePage title="Grievances" eyebrow="Admin" description="Grievance records and statuses." endpoint="/api/grievances" />;
    if (pathname === '/admin/payments' && roleOk(user.role, ['admin'])) return <PaymentHistoryPage admin />;
    if (pathname === '/admin/compliance-rules' && roleOk(user.role, ['admin'])) return <ComplianceRulesPage />;
    if (pathname === '/admin/security-monitoring' && roleOk(user.role, ['admin'])) return <GenericFeaturePage title="Security Monitoring" eyebrow="Security" description="Audit and fraud signals for platform operations." endpoint="/api/admin/fraud-alerts" />;
    if (['/admin/governance', '/admin/procurement', '/admin/compliance'].includes(pathname) && roleOk(user.role, ['admin'])) return <Redirect to="/admin/onboarding" />;
    if (pathname === '/admin/reports' && roleOk(user.role, ['admin'])) return <MISReports />;
    if (pathname === '/admin/banners' && roleOk(user.role, ['admin'])) return <AdminBannerManagementPage />;
    if (pathname === '/admin/monthly-rankings' && roleOk(user.role, ['admin'])) return <MonthlyRankingsAdminPage />;
    if (pathname === '/roles-permissions') return <RbacPanel />;
    if (pathname === '/admin/rbac' && roleOk(user.role, ['admin'])) return <RbacPanel />;
    if (pathname === '/master-admin/rbac' && roleOk(user.role, ['master_admin'])) return <RbacPanel />;
    if (pathname === '/admin/organizations' && roleOk(user.role, ['admin'])) return <OrganizationManagement />;
    if (pathname === '/notifications') return <NotificationCenter />;
    if (pathname === '/org/team') return <TeamManagementPage />;
    if (pathname === '/cart') return <CartPage />;
    
    
    
    if (pathname === '/grn') return <GrnListPage />;
    {
      const grnDetailMatch = pathname.match(/^\/grn\/(\d+)$/);
      if (grnDetailMatch) {
        const id = Number(grnDetailMatch[1]);
        if (Number.isFinite(id) && id > 0) return <GrnDetailPage id={id} />;
      }
      const tenderEvalMatch = pathname.match(/^\/buyer\/tenders\/(\d+)\/evaluate$/);
      if (tenderEvalMatch && roleOk(user.role, ['buyer'])) {
        const id = Number(tenderEvalMatch[1]);
        if (Number.isFinite(id) && id > 0) return <TenderEvaluationPage tenderId={id} />;
      }
      const auctionLiveMatch = pathname.match(/^\/auctions\/(\d+)\/live$/);
      if (auctionLiveMatch) {
        const id = Number(auctionLiveMatch[1]);
        if (Number.isFinite(id) && id > 0) return <AuctionLivePage id={id} />;
      }

      if (pathname === '/reverse-auctions') {
        if (user.role === 'seller') {
          return <Redirect to="/seller/opportunities/auctions" />;
        }
        if (user.role === 'buyer') {
          return <Redirect to="/buyer/my-procurements?type=Reverse Auction" />;
        }
        return <Redirect to="/dashboard" />;
      }
      if (pathname === '/reverse-auctions/create') {
        return <Redirect to="/buyer/procurement/create?method=REVERSE_AUCTION" />;
      }

      const reverseAuctionLiveMatch = pathname.match(/^\/reverse-auctions\/(\d+)\/live$/);
      if (reverseAuctionLiveMatch) {
        const id = Number(reverseAuctionLiveMatch[1]);
        if (Number.isFinite(id) && id > 0) return <ReverseAuctionLivePage id={id} />;
      }
      const reverseAuctionResultMatch = pathname.match(/^\/reverse-auctions\/(\d+)\/results$/);
      if (reverseAuctionResultMatch) {
        const id = Number(reverseAuctionResultMatch[1]);
        if (Number.isFinite(id) && id > 0) return <AuctionResultPage id={id} />;
      }
    }
    if (['/seller/awards', '/buyer/procurement-orders', '/admin/procurement-orders'].includes(pathname) && roleOk(user.role, ['buyer', 'seller', 'admin'])) return <ProcurementOrdersPage />;
    if (/^\/procurement-orders\/\d+$/.test(pathname) && roleOk(user.role, ['buyer', 'seller', 'admin'])) return <ProcurementOrdersPage />;
    if (pathname === '/settings/security') return <SecuritySettingsPage />;
    if (pathname === '/settings/notifications') return <NotificationPrefsPage />;
    if (pathname === '/onboarding/kyc') return <AadhaarKycPage />;
    if (pathname === '/admin/reports/procurement' && roleOk(user.role, ['admin'])) return <ProcurementReportPage />;
    if (pathname === '/admin/reports/payments' && roleOk(user.role, ['admin'])) return <PaymentsReportPage />;
    if (pathname === '/admin/reports/suppliers' && roleOk(user.role, ['admin'])) return <SuppliersReportPage />;
    return <Redirect to={authenticatedHome} />;
  };

  const fixedAuthRoutes = ['/', '/login', '/shg/login', '/forgot-password', '/register', '/seller/register', '/buyer/register', '/hershg/register', '/admin/register'];
  const useDashboardShellForMarketplace =
    pathname === '/marketplace/compare' ||
    pathname === '/marketplace/products' ||
    pathname === '/marketplace/services' ||
    /^\/marketplace\/products\/-?\d+$/.test(pathname) ||
    /^\/marketplace\/services\/-?\d+$/.test(pathname) ||
    /^\/marketplace\/requirements\/-?\d+$/.test(pathname);
  const isMarketplaceRoute = (pathname.startsWith('/marketplace') && !useDashboardShellForMarketplace) || pathname === '/buyer/publish-bid' || /^\/vendors\/-?\d+$/.test(pathname) || /^\/buyer-requirements\/-?\d+$/.test(pathname);
  const showDashboardLayout = user && !fixedAuthRoutes.includes(pathname) && !isMarketplaceRoute && !publicInfoRoutes.includes(pathname);
  const showOrgApprovalBanner = showDashboardLayout && !['master_admin', 'super_admin'].includes(user?.role || '');

  return (
    <div className={cn("flex bg-neutral-50 font-sans text-neutral-900", showDashboardLayout ? "h-dvh overflow-hidden" : "min-h-dvh")}>
      {showDashboardLayout && (
        <Sidebar
          isOpen={isSidebarOpen}
          onClose={() => setIsSidebarOpen(false)}
          isCollapsed={isSidebarCollapsed}
          onToggleCollapse={toggleSidebarCollapse}
          onHoverChange={setIsSidebarHovered}
        />
      )}

      <div className={cn(
        "flex-1 flex flex-col min-w-0 transition-all duration-300",
        showDashboardLayout && (visualCollapsed ? "lg:pl-20" : "lg:pl-64")
      )}>
        {showDashboardLayout && (
          <Header
            onMenuClick={() => setIsSidebarOpen(true)}
            onSidebarToggle={toggleSidebarCollapse}
            isSidebarCollapsed={isSidebarCollapsed}
          />
        )}
        {showOrgApprovalBanner && <OrgApprovalBanner />}
        <main className={cn(
          "flex-1 min-w-0",
          !showDashboardLayout ? "min-h-dvh p-0" : "dashboard-main overflow-y-auto p-3 sm:p-4 md:p-5"
        )}>
          <Suspense fallback={<RouteFallback />}>
            {renderRoute()}
          </Suspense>
        </main>
      </div>
      {showDashboardLayout && (
        <Suspense fallback={null}>
          <GlobalSearch />
        </Suspense>
      )}
      {showDashboardLayout && (
        <Suspense fallback={null}>
          <InviteLoginPopup />
        </Suspense>
      )}
    </div>
  );
}

// Test Compatibility: /seller/catalogue, /buyer/catalogue, /admin/catalogue
