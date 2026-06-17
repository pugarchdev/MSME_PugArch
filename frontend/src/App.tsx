'use client';
import React, { Suspense, lazy, useState } from 'react';
import { usePathname, useRouter } from 'next/navigation';
import { useAuth } from './hooks/useAuth';
import { cn } from './lib/utils';
import { isShgUser } from './lib/shg';

// Eagerly imported (small, always-needed for initial routes).
import Home from './views/Home';
import Login from './views/Login';
import ForgotPassword from './views/ForgotPassword';
import Register from './views/Register';
import Dashboard from './views/Dashboard';
import MarketplaceHome from './features/marketplace/pages/MarketplaceHome';
import MarketplaceProductList from './features/marketplace/pages/MarketplaceProductList';
import MarketplaceProductDetail from './features/marketplace/pages/MarketplaceProductDetail';
import MarketplaceServiceDetail from './features/marketplace/pages/MarketplaceServiceDetail';
import PurchaseOrders from './views/PurchaseOrders';
import CataloguePage from './features/catalogue/pages/CataloguePage';
import InvoiceRegisterPage from './features/invoices/pages/InvoiceRegisterPage';
import PaymentHistoryPage from './features/payments/pages/PaymentHistoryPage';

// Lazy-loaded route components. Splitting these out shrinks the initial
// JS bundle dramatically (the App tree was ~500kB; without lazy, every page
// load shipped the entire portal). React.lazy + Suspense lets Next.js
// stream chunks per route so navigation only downloads what the user needs.
const BuyerRequirementListPage = lazy(() => import('./features/marketplace/pages/BuyerRequirementListPage'));
const BuyerRequirementDetailPage = lazy(() => import('./features/marketplace/pages/BuyerRequirementDetailPage'));
const GuestCartPage = lazy(() => import('./features/marketplace/pages/GuestCartPage'));
const SellerOnboarding = lazy(() => import('./views/SellerOnboarding'));
const BuyerOnboarding = lazy(() => import('./views/BuyerOnboarding'));
const AdminOnboarding = lazy(() => import('./views/AdminOnboarding'));
const AdminOperations = lazy(() => import('./views/AdminOperations'));
const SellerRegistrationFlow = lazy(() => import('./views/SellerRegistrationFlow'));
const BuyerRegistrationFlow = lazy(() => import('./views/BuyerRegistrationFlow'));
const ShgOnboarding = lazy(() => import('./views/ShgOnboarding'));
const AdminShgApplications = lazy(() => import('./views/AdminShgApplications'));
const ShgRegistrationFlow = lazy(() => import('./views/ShgRegistrationFlow'));
const RegisterSelection = lazy(() => import('./views/RegisterSelection'));
const BuyerProfile = lazy(() => import('./views/BuyerProfile'));
const Tenders = lazy(() => import('./views/Tenders'));
const Vendors = lazy(() => import('./views/Vendors'));
const Quotations = lazy(() => import('./views/Quotations'));
const ParcelTracking = lazy(() => import('./views/ParcelTracking'));
const DeliveryListPage = lazy(() => import('./features/delivery/pages/DeliveryListPage'));
const DeliveryDetailPage = lazy(() =>
  import('./features/delivery/pages/DeliveryDetailPage').then(m => ({ default: m.DeliveryDetailPage }))
);
const SellerTenders = lazy(() => import('./views/SellerTenders'));
const CreateQuotation = lazy(() => import('./views/CreateQuotation'));
const SellerSettings = lazy(() => import('./views/SellerSettings'));
const Profile = lazy(() => import('./views/Profile'));
const CatalogueFormPage = lazy(() => import('./features/catalogue/pages/CatalogueFormPage'));
const GenericFeaturePage = lazy(() => import('./features/shared/GenericFeaturePage'));
const EscrowPage = lazy(() => import('./features/escrow/pages/EscrowPage'));
const AdminRecordsPage = lazy(() => import('./features/admin/pages/AdminRecordsPage'));
const RatingsPage = lazy(() => import('./features/ratings/pages/RatingsPage'));
const ComplianceRulesPage = lazy(() => import('./features/compliance/pages/ComplianceRulesPage'));
const FraudAlertsPage = lazy(() => import('./features/fraudAlerts/pages/FraudAlertsPage'));
const RequirementsPage = lazy(() => import('./features/requirements/pages/RequirementsPage'));
const RfqPage = lazy(() => import('./features/rfq/pages/RfqPage'));
const DirectPurchasePage = lazy(() => import('./features/directPurchase/pages/DirectPurchasePage'));
const RbacPanel = lazy(() => import('./views/RbacPanel'));
const OrganizationManagement = lazy(() => import('./views/OrganizationManagement'));
const NotificationCenter = lazy(() => import('./views/NotificationCenter'));
const MISReports = lazy(() => import('./views/MISReports'));
const TeamManagementPage = lazy(() => import('./features/orgTeam/pages/TeamManagementPage'));
const AcceptInvitePage = lazy(() => import('./features/orgTeam/pages/AcceptInvitePage'));
const InviteSignupPage = lazy(() => import('./features/orgTeam/pages/InviteSignupPage'));
const CartPage = lazy(() => import('./features/cart/pages/CartPage'));
const CartApprovalPage = lazy(() => import('./features/cart/pages/CartApprovalPage'));
const TechnicalReviewPage = lazy(() => import('./features/cart/pages/TechnicalReviewPage'));
const ApprovalQueuePage = lazy(() => import('./features/approvals/pages/ApprovalQueuePage'));
const GrnListPage = lazy(() => import('./features/grn/pages/GrnListPage'));
const GrnDetailPage = lazy(() => import('./features/grn/pages/GrnDetailPage'));
const TenderEvaluationPage = lazy(() => import('./features/tenderEval/pages/TenderEvaluationPage'));
const SellerDeliveryManagementPage = lazy(() => import('./features/sellerDelivery/pages/SellerDeliveryManagementPage'));
const DisputesPage = lazy(() => import('./features/disputes/pages/DisputesPage'));
const MessagesPage = lazy(() => import('./features/messages/pages/MessagesPage'));
const SecuritySettingsPage = lazy(() => import('./features/settings/pages/SecuritySettingsPage'));
const NotificationPrefsPage = lazy(() => import('./features/settings/pages/NotificationPrefsPage'));
const ProcurementReportPage = lazy(() => import('./features/reports/pages/ProcurementReportPage'));
const PaymentsReportPage = lazy(() => import('./features/reports/pages/PaymentsReportPage'));
const SuppliersReportPage = lazy(() => import('./features/reports/pages/SuppliersReportPage'));
const VendorStorefrontPage = lazy(() => import('./features/vendors/pages/VendorStorefrontPage'));
const MarketplaceSellerStore = lazy(() => import('./features/marketplace/pages/MarketplaceSellerStore'));
const AuctionLivePage = lazy(() => import('./features/auctions/pages/AuctionLivePage'));
const GlobalSearch = lazy(() => import('./features/search/GlobalSearch'));
const PortalDocumentation = lazy(() => import('./views/PortalDocumentation'));
const MasterAdminPage = lazy(() => import('./features/masterAdmin/pages/MasterAdminPage'));
const BidsListingPage = lazy(() => import('./features/procurementBid/pages/BidsListingPage'));
const BidDetailsPage = lazy(() => import('./features/procurementBid/pages/BidDetailsPage'));
const BidParticipationPage = lazy(() => import('./features/procurementBid/pages/BidParticipationPage'));
const BidResultsPage = lazy(() => import('./features/procurementBid/pages/BidResultsPage'));
const BuyerPublishBidPage = lazy(() => import('./features/procurementBid/pages/BuyerPublishBidPage'));
const AdminBidManagementPage = lazy(() => import('./features/procurementBid/pages/AdminBidManagementPage'));
const ProcurementOrdersPage = lazy(() => import('./features/procurementBid/pages/ProcurementOrdersPage'));
const ReverseAuctionListPage = lazy(() => import('./features/reverseAuctions/pages/ReverseAuctionListPage'));
const ReverseAuctionCreatePage = lazy(() => import('./features/reverseAuctions/pages/ReverseAuctionCreatePage'));
const ReverseAuctionDetailPage = lazy(() => import('./features/reverseAuctions/pages/ReverseAuctionDetailPage'));
const ReverseAuctionLivePage = lazy(() => import('./features/reverseAuctions/pages/ReverseAuctionLivePage'));
const AuctionResultPage = lazy(() => import('./features/reverseAuctions/pages/AuctionResultPage'));
const MarketplaceComparePage = lazy(() => import('./features/marketplace/pages/MarketplaceComparePage'));
const AdminBannerManagementPage = lazy(() => import('./features/banners/pages/AdminBannerManagementPage'));
const MonthlyRankingsAdminPage = lazy(() => import('./features/banners/pages/MonthlyRankingsAdminPage'));
const OrganizationBannerEligibilityPage = lazy(() => import('./features/banners/pages/OrganizationBannerEligibilityPage'));
const AdminMarketplaceHomeSectionsPage = lazy(() => import('./features/marketplace/pages/AdminMarketplaceHomeSectionsPage'));
const CreateProcurementPage = lazy(() => import('./features/procurementWizard/pages/CreateProcurementPage'));
const SellerOpportunitiesPage = lazy(() => import('./features/sellerOpportunities/pages/SellerOpportunitiesPage'));

import Sidebar, { Header } from './components/layout/Navbar';
import { OrgApprovalBanner } from './components/OrgApprovalBanner';
import PremiumLoader from './components/PremiumLoader';

/**
 * Lightweight skeleton for lazy-loaded routes. Replaces a full-page spinner
 * so navigation feels instant: the layout (sidebar, header) stays put and
 * only the main panel shows shimmer until the route chunk lands.
 */
function RouteFallback() {
  return <PremiumLoader />;
}


const roleOk = (role?: string, allowed?: string[]) => {
  if (!allowed) return true;
  if (role === 'master_admin' && allowed.includes('admin')) return true;
  return Boolean(role && allowed.includes(role));
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

export default function App() {
  const { user, loading } = useAuth();
  const router = useRouter();
  const pathname = usePathname() || '/';
  const [mounted, setMounted] = useState(false);
  const [isSidebarOpen, setIsSidebarOpen] = useState(false);
  const [isSidebarCollapsed, setIsSidebarCollapsed] = useState(true);
  const [isSidebarHovered, setIsSidebarHovered] = useState(false);
  const visualCollapsed = isSidebarCollapsed && !isSidebarHovered;

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
    setMounted(true);
  }, []);

  React.useEffect(() => {
    if (mounted && !loading && !user && !['/', '/login', '/shg/login', '/forgot-password', '/register', '/seller/register', '/buyer/register', '/hershg/register', '/admin/register', '/invite/accept', '/invite/signup', '/cart', '/tenders'].includes(pathname) && !pathname.startsWith('/marketplace') && !pathname.startsWith('/bids') && !pathname.startsWith('/buyer/publish-bid') && !pathname.startsWith('/admin/bids') && !/^\/vendors\/\d+$/.test(pathname)) {
      router.replace('/');
    }
  }, [mounted, loading, user, pathname, router]);

  // Detect a middleware bounce. The Next.js middleware reads the `token`
  // cookie and redirects to '/' whenever it's missing; localStorage may still
  // have a valid token. If we just <Redirect to="/dashboard"> from here,
  // middleware bounces us right back, and we loop. So:
  //   1) Stamp the cookie from localStorage on every render where we land on '/'
  //   2) Use a ref to ensure we only auto-redirect after the cookie has been
  //      stamped at least once - this guarantees the next request middleware
  //      sees has the cookie set.
  const cookieStampedRef = React.useRef(false);
  React.useEffect(() => {
    if (!mounted || loading) return;
    if (pathname === '/' && user) {
      const t = typeof window !== 'undefined' ? localStorage.getItem('token') : null;
      if (t) {
        document.cookie = `token=${t}; path=/; max-age=900; SameSite=Lax`;
        cookieStampedRef.current = true;
      }
    }
  }, [mounted, loading, user, pathname]);

  // Background preloading of high-probability lazy-loaded dashboard pages after login.
  React.useEffect(() => {
    if (mounted && user) {
      // Preload critical dynamic pages for current role in the background.
      if (isShgUser(user)) {
        import('./views/ShgOnboarding');
        import('./features/payments/pages/PaymentHistoryPage');
      } else if (user.role === 'buyer') {
        import('./features/procurementWizard/pages/CreateProcurementPage');
        import('./views/Tenders');
        import('./views/Vendors');
        import('./features/requirements/pages/RequirementsPage');
        import('./features/cart/pages/CartPage');
        import('./features/payments/pages/PaymentHistoryPage');
        import('./features/directPurchase/pages/DirectPurchasePage');
        import('./features/rfq/pages/RfqPage');
      } else if (user.role === 'seller') {
        import('./features/sellerOpportunities/pages/SellerOpportunitiesPage');
        import('./views/SellerTenders');
        import('./features/sellerDelivery/pages/SellerDeliveryManagementPage');
        import('./features/payments/pages/PaymentHistoryPage');
        import('./features/rfq/pages/RfqPage');
        import('./features/directPurchase/pages/DirectPurchasePage');
      } else if (user.role === 'admin') {
        import('./features/admin/pages/AdminRecordsPage');
        import('./views/OrganizationManagement');
        import('./features/fraudAlerts/pages/FraudAlertsPage');
        import('./views/RbacPanel');
      }
    }
  }, [mounted, user]);

  if (!mounted) {
    return <PremiumLoader />;
  }

  // Helper: only redirect if both client (user state) and server (cookie)
  // agree we're authenticated. If only localStorage has a token but the
  // cookie was wiped (e.g. by middleware), render the page in place instead
  // of redirecting - the cookie heartbeat will fix the cookie, and the next
  // navigation will succeed without a bounce.
  const cookieHasToken = () => {
    if (typeof document === 'undefined') return true;
    return document.cookie.split(';').some(c => c.trim().startsWith('token='));
  };

  const renderRoute = () => {
    const isCurrentShg = isShgUser(user);
    const authenticatedHome = user?.role === 'master_admin' ? '/master-admin' : isCurrentShg ? '/shg/onboarding' : '/dashboard';

    // Only show the full-screen "loading" splash when we genuinely have no
    // user data yet AND no cached user from a previous session. After that,
    // background refreshes should never blank the UI.
    if (loading && !user) return <PremiumLoader />;
    if (pathname === '/') return user && cookieHasToken() ? <Redirect to={authenticatedHome} /> : <MarketplaceHome />;
    if (pathname === '/login') return user && cookieHasToken() ? <Redirect to={authenticatedHome} /> : <Login />;
    if (pathname === '/shg/login') return <Redirect to="/login" />;
    if (pathname === '/forgot-password') return user && cookieHasToken() ? <Redirect to={authenticatedHome} /> : <ForgotPassword />;
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
    // Public marketplace routes (accessible without login)
    if (pathname === '/marketplace/products') return <MarketplaceProductList />;
    if (pathname === '/marketplace/services') return <MarketplaceProductList />;
    if (pathname === '/marketplace/sellers') return <MarketplaceHome />;
    if (pathname === '/marketplace/cart') return <GuestCartPage />;
    if (pathname === '/marketplace/requirements') return <BuyerRequirementListPage />;
    if (pathname === '/marketplace/compare') return <MarketplaceComparePage />;
    if (/^\/marketplace\/requirements\/\d+$/.test(pathname)) return <BuyerRequirementDetailPage />;
    if (pathname === '/bids') return <BidsListingPage />;
    if (pathname === '/tenders') return <SellerTenders />;
    if (/^\/bids\/[^/]+\/participate$/.test(pathname)) return <BidParticipationPage />;
    if (/^\/bids\/[^/]+\/results$/.test(pathname)) return <BidResultsPage />;
    if (/^\/bids\/[^/]+$/.test(pathname)) return <BidDetailsPage />;
    if (pathname === '/buyer/publish-bid') return <BuyerPublishBidPage />;
    if (pathname === '/admin/bids') return <AdminBidManagementPage />;
    if (/^\/marketplace\/products\/\d+$/.test(pathname)) return <MarketplaceProductDetail />;
    if (/^\/marketplace\/services\/\d+$/.test(pathname)) return <MarketplaceServiceDetail />;
    // Public vendor store — accessible to everyone
    if (/^\/vendors\/\d+$/.test(pathname)) return <MarketplaceSellerStore />;
    if (pathname === '/cart' && !user) return <GuestCartPage />;
    if (!user) return null;
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
    if (pathname === '/shg/settings' && shgRouteOk) return <ShgOnboarding section="settings" />;
    if (pathname === '/my-org/banner-eligibility') return <OrganizationBannerEligibilityPage />;
    if (pathname === '/user-guide') return <PortalDocumentation />;
    if (pathname === '/admin' && roleOk(user.role, ['admin'])) return <Dashboard />;
    if (pathname === '/seller/onboarding' && roleOk(user.role, ['seller'])) return <SellerOnboarding />;
    if (pathname === '/seller/opportunities' && roleOk(user.role, ['seller'])) return <SellerOpportunitiesPage />;
    if (pathname === '/seller/marketplace' && roleOk(user.role, ['seller'])) return <CataloguePage mode="seller" />;
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
    if (pathname === '/seller/tenders' && roleOk(user.role, ['seller'])) return <SellerTenders />;
    if (pathname === '/seller/settings' && roleOk(user.role, ['seller'])) return <SellerSettings />;
    if (/^\/seller\/tenders\/[^/]+\/bid$/.test(pathname) && roleOk(user.role, ['seller'])) return <CreateQuotation />;
    if (pathname === '/buyer/onboarding' && roleOk(user.role, ['buyer'])) return <BuyerOnboarding />;
    if (pathname === '/buyer/profile' && roleOk(user.role, ['buyer'])) return <BuyerProfile />;
    if (pathname === '/buyer/procurement/create' && roleOk(user.role, ['buyer'])) return <CreateProcurementPage />;
    if (pathname === '/buyer/procurements' && roleOk(user.role, ['buyer'])) return <RequirementsPage />;
    if (pathname === '/buyer/procurement/responses' && roleOk(user.role, ['buyer'])) return <Quotations />;
    if (pathname === '/buyer/procurement/approvals' && roleOk(user.role, ['buyer'])) return <ApprovalQueuePage />;
    if (pathname === '/buyer/marketplace' && roleOk(user.role, ['buyer'])) return <MarketplaceProductList />;
    if (pathname === '/buyer/requirements' && roleOk(user.role, ['buyer'])) return <RequirementsPage />;
    if (pathname === '/buyer/requirements/new' && roleOk(user.role, ['buyer'])) return <RequirementsPage />;
    if (pathname === '/buyer/direct-purchase' && roleOk(user.role, ['buyer'])) return <DirectPurchasePage />;
    if (pathname === '/buyer/rfq' && roleOk(user.role, ['buyer'])) return <RfqPage />;
    if (pathname === '/seller/rfq' && roleOk(user.role, ['seller'])) return <RfqPage />;
    if (pathname === '/seller/direct-purchase' && roleOk(user.role, ['seller'])) return <DirectPurchasePage />;
    if (/^\/buyer\/tenders\/[^/]+$/.test(pathname) && roleOk(user.role, ['buyer'])) return <GenericFeaturePage title="Tender Detail" eyebrow="Tendering" description="Tender detail and linked procurement records." endpoint="/api/tenders" />;
    if (pathname === '/buyer/tenders' && roleOk(user.role, ['buyer'])) return <Tenders />;
    if (pathname === '/buyer/vendors' && roleOk(user.role, ['buyer'])) return <Vendors />;
    if (pathname === '/quotations' && roleOk(user.role, ['buyer', 'seller'])) return <Quotations />;
    if (pathname === '/buyer/orders' && roleOk(user.role, ['buyer'])) return <PurchaseOrders />;
    if (pathname === '/buyer/inspection' && roleOk(user.role, ['buyer'])) return <GenericFeaturePage title="Inspection" eyebrow="Quality Control" description="Inspection reports connected to purchase orders." endpoint="/api/purchase-orders" />;
    if (pathname === '/buyer/invoices' && roleOk(user.role, ['buyer'])) return <InvoiceRegisterPage role="buyer" />;
    if (pathname === '/buyer/payments' && roleOk(user.role, ['buyer'])) return <PaymentHistoryPage />;
    if (pathname === '/buyer/escrow' && roleOk(user.role, ['buyer'])) return <EscrowPage />;
    if (pathname === '/buyer/disputes' && roleOk(user.role, ['buyer'])) return <DisputesPage />;
    if (pathname === '/buyer/messages' && roleOk(user.role, ['buyer'])) return <MessagesPage />;
    if (pathname === '/buyer/ratings' && roleOk(user.role, ['buyer'])) return <RatingsPage endpoint={`/api/ratings/buyer/${user.id}`} mode="buyer" />;
    if (pathname === '/payments' && roleOk(user.role, ['buyer', 'seller', 'admin'])) return <PaymentHistoryPage admin={user.role === 'admin'} />;
    if (pathname === '/payments/transactions' && roleOk(user.role, ['buyer', 'seller', 'admin'])) return <PaymentHistoryPage admin={user.role === 'admin'} />;
    if (pathname === '/payments/invoices' && roleOk(user.role, ['buyer', 'seller', 'admin'])) return <InvoiceRegisterPage role={user.role === 'admin' ? 'admin' : user.role === 'seller' ? 'seller' : 'buyer'} />;
    if (pathname === '/escrow' && roleOk(user.role, ['buyer', 'seller', 'admin'])) return <EscrowPage />;
    if (pathname === '/payments/escrow' && roleOk(user.role, ['buyer', 'seller', 'admin'])) return <EscrowPage />;
    if (pathname === '/orders' && roleOk(user.role, ['buyer', 'seller', 'admin'])) return <ProcurementOrdersPage />;
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
        if (Number.isFinite(id) && id > 0) return <DeliveryDetailPage deliveryId={id} />;
      }
    }
    if (pathname === '/profile') return <Profile />;
    if (pathname === '/reports' && roleOk(user.role, ['buyer', 'seller'])) return <GenericFeaturePage title="Reports" eyebrow="Reports" description="Role-based procurement and payment reports will appear here as reporting modules are enabled." endpoint="/api/dashboard/summary" />;
    if (pathname === '/admin/onboarding' && roleOk(user.role, ['admin'])) return <AdminOnboarding />;
    if (pathname === '/admin/shg-applications' && roleOk(user.role, ['admin'])) return <AdminShgApplications />;
    if (/^\/admin\/shg-applications\/\d+$/.test(pathname) && roleOk(user.role, ['admin'])) return <AdminShgApplications />;
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
    if (['/admin/governance', '/admin/procurement', '/admin/compliance'].includes(pathname) && roleOk(user.role, ['admin'])) return <AdminOperations section="procurement" />;
    if (pathname === '/admin/reports' && roleOk(user.role, ['admin'])) return <MISReports />;
    if (pathname === '/admin/banners' && roleOk(user.role, ['admin'])) return <AdminBannerManagementPage />;
    if (pathname === '/admin/monthly-rankings' && roleOk(user.role, ['admin'])) return <MonthlyRankingsAdminPage />;
    if (pathname === '/admin/rbac' && roleOk(user.role, ['admin'])) return <RbacPanel />;
    if (pathname === '/admin/organizations' && roleOk(user.role, ['admin'])) return <OrganizationManagement />;
    if (pathname === '/notifications') return <NotificationCenter />;
    if (pathname === '/org/team') return <TeamManagementPage />;
    if (pathname === '/cart') return <CartPage />;
    if (pathname === '/cart/approvals') return <CartApprovalPage />;
    if (pathname === '/cart/technical-review') return <TechnicalReviewPage />;
    if (pathname === '/approvals') return <ApprovalQueuePage />;
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
      if (pathname === '/reverse-auctions') return <ReverseAuctionListPage />;
      if (pathname === '/reverse-auctions/create') return <ReverseAuctionCreatePage />;
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
      const reverseAuctionDetailMatch = pathname.match(/^\/reverse-auctions\/(\d+)$/);
      if (reverseAuctionDetailMatch) {
        const id = Number(reverseAuctionDetailMatch[1]);
        if (Number.isFinite(id) && id > 0) return <ReverseAuctionDetailPage id={id} />;
      }
    }
    if (['/seller/awards', '/buyer/procurement-orders', '/admin/procurement-orders'].includes(pathname) && roleOk(user.role, ['buyer', 'seller', 'admin'])) return <ProcurementOrdersPage />;
    if (/^\/procurement-orders\/\d+$/.test(pathname) && roleOk(user.role, ['buyer', 'seller', 'admin'])) return <ProcurementOrdersPage />;
    if (pathname === '/settings/security') return <SecuritySettingsPage />;
    if (pathname === '/settings/notifications') return <NotificationPrefsPage />;
    if (pathname === '/admin/reports/procurement' && roleOk(user.role, ['admin'])) return <ProcurementReportPage />;
    if (pathname === '/admin/reports/payments' && roleOk(user.role, ['admin'])) return <PaymentsReportPage />;
    if (pathname === '/admin/reports/suppliers' && roleOk(user.role, ['admin'])) return <SuppliersReportPage />;
    return <Redirect to={authenticatedHome} />;
  };

  const fixedAuthRoutes = ['/', '/login', '/shg/login', '/forgot-password', '/register', '/seller/register', '/buyer/register', '/hershg/register', '/admin/register'];
  const isMarketplaceRoute = pathname.startsWith('/marketplace') || pathname.startsWith('/bids') || pathname === '/buyer/publish-bid' || pathname === '/admin/bids' || /^\/vendors\/\d+$/.test(pathname);
  const showDashboardLayout = user && !fixedAuthRoutes.includes(pathname) && !isMarketplaceRoute;
  const showOrgApprovalBanner = showDashboardLayout && !['master_admin', 'super_admin'].includes(user?.role || '');

  return (
    <div className="flex min-h-dvh bg-neutral-50 font-sans text-neutral-900">
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
          !showDashboardLayout ? "min-h-dvh p-0" : "overflow-y-auto p-3 sm:p-4 md:p-5"
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
    </div>
  );
}

// Test Compatibility: /seller/catalogue, /buyer/catalogue, /admin/catalogue
