'use client';
import React, { Suspense, lazy, useState } from 'react';
import { usePathname, useRouter } from 'next/navigation';
import { useAuth } from './hooks/useAuth';
import { cn } from './lib/utils';

// Eagerly imported (small, always-needed for initial routes).
import Home from './views/Home';
import Login from './views/Login';
import ForgotPassword from './views/ForgotPassword';
import Register from './views/Register';
import Dashboard from './views/Dashboard';

// Lazy-loaded route components. Splitting these out shrinks the initial
// JS bundle dramatically (the App tree was ~500kB; without lazy, every page
// load shipped the entire portal). React.lazy + Suspense lets Next.js
// stream chunks per route so navigation only downloads what the user needs.
const SellerOnboarding = lazy(() => import('./views/SellerOnboarding'));
const BuyerOnboarding = lazy(() => import('./views/BuyerOnboarding'));
const AdminOnboarding = lazy(() => import('./views/AdminOnboarding'));
const AdminOperations = lazy(() => import('./views/AdminOperations'));
const SellerRegistrationFlow = lazy(() => import('./views/SellerRegistrationFlow'));
const BuyerRegistrationFlow = lazy(() => import('./views/BuyerRegistrationFlow'));
const BuyerProfile = lazy(() => import('./views/BuyerProfile'));
const Tenders = lazy(() => import('./views/Tenders'));
const Vendors = lazy(() => import('./views/Vendors'));
const Quotations = lazy(() => import('./views/Quotations'));
const PurchaseOrders = lazy(() => import('./views/PurchaseOrders'));
const ParcelTracking = lazy(() => import('./views/ParcelTracking'));
const DeliveryListPage = lazy(() => import('./features/delivery/pages/DeliveryListPage'));
const DeliveryDetailPage = lazy(() =>
  import('./features/delivery/pages/DeliveryDetailPage').then(m => ({ default: m.DeliveryDetailPage }))
);
const SellerTenders = lazy(() => import('./views/SellerTenders'));
const CreateQuotation = lazy(() => import('./views/CreateQuotation'));
const SellerSettings = lazy(() => import('./views/SellerSettings'));
const Profile = lazy(() => import('./views/Profile'));
const CataloguePage = lazy(() => import('./features/catalogue/pages/CataloguePage'));
const GenericFeaturePage = lazy(() => import('./features/shared/GenericFeaturePage'));
const PaymentHistoryPage = lazy(() => import('./features/payments/pages/PaymentHistoryPage'));
const EscrowPage = lazy(() => import('./features/escrow/pages/EscrowPage'));
const AdminRecordsPage = lazy(() => import('./features/admin/pages/AdminRecordsPage'));
const InvoiceRegisterPage = lazy(() => import('./features/invoices/pages/InvoiceRegisterPage'));
const RatingsPage = lazy(() => import('./features/ratings/pages/RatingsPage'));
const ComplianceRulesPage = lazy(() => import('./features/compliance/pages/ComplianceRulesPage'));
const FraudAlertsPage = lazy(() => import('./features/fraudAlerts/pages/FraudAlertsPage'));
const RbacPanel = lazy(() => import('./views/RbacPanel'));
const OrganizationManagement = lazy(() => import('./views/OrganizationManagement'));
const NotificationCenter = lazy(() => import('./views/NotificationCenter'));
const MISReports = lazy(() => import('./views/MISReports'));

import Sidebar, { Header } from './components/layout/Navbar';

/**
 * Lightweight skeleton for lazy-loaded routes. Replaces a full-page spinner
 * so navigation feels instant: the layout (sidebar, header) stays put and
 * only the main panel shows shimmer until the route chunk lands.
 */
function RouteFallback() {
  return (
    <div className="space-y-3 p-4">
      <div className="h-9 w-1/3 animate-pulse rounded-md bg-slate-100" />
      <div className="grid gap-3 md:grid-cols-2 lg:grid-cols-4">
        {[1, 2, 3, 4].map(i => (
          <div key={i} className="h-24 animate-pulse rounded-xl bg-slate-100" />
        ))}
      </div>
      <div className="h-72 animate-pulse rounded-xl bg-slate-100" />
    </div>
  );
}


const roleOk = (role?: string, allowed?: string[]) => !allowed || (role && allowed.includes(role));

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
    if (mounted && !loading && !user && !['/', '/login', '/forgot-password', '/seller/register', '/buyer/register', '/admin/register'].includes(pathname)) {
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

  if (!mounted) {
    return (
      <div className="flex min-h-dvh items-center justify-center px-4 text-center font-bold text-neutral-700">
        JsgSmile Portal - Jharsuguda Synergy for MSME and Industry Linkage Ecosystem...
      </div>
    );
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
    // Only show the full-screen "loading" splash when we genuinely have no
    // user data yet AND no cached user from a previous session. After that,
    // background refreshes should never blank the UI.
    if (loading && !user) return <div className="flex min-h-dvh items-center justify-center px-4 text-center font-bold text-neutral-700">JsgSmile Portal - Jharsuguda Synergy for MSME and Industry Linkage Ecosystem...</div>;
    if (pathname === '/') return user && cookieHasToken() ? <Redirect to="/dashboard" /> : <Home />;
    if (pathname === '/login') return user && cookieHasToken() ? <Redirect to="/dashboard" /> : <Login />;
    if (pathname === '/forgot-password') return user && cookieHasToken() ? <Redirect to="/dashboard" /> : <ForgotPassword />;
    if (pathname === '/seller/register') return <SellerRegistrationFlow />;
    if (pathname === '/buyer/register') return <BuyerRegistrationFlow />;
    if (pathname === '/admin/register') return <Register type="admin" />;
    if (!user) return null;
    if (pathname === '/dashboard') return <Dashboard />;
    if (pathname === '/seller/onboarding' && roleOk(user.role, ['seller'])) return <SellerOnboarding />;
    if (pathname === '/seller/marketplace' && roleOk(user.role, ['seller'])) return <CataloguePage mode="seller" />;
    if (pathname === '/seller/products/new' && roleOk(user.role, ['seller'])) return <GenericFeaturePage title="New Product" eyebrow="Seller Marketplace" description="Create products through the seller product API." endpoint="/api/seller/products" />;
    if (/^\/seller\/products\/[^/]+\/edit$/.test(pathname) && roleOk(user.role, ['seller'])) return <GenericFeaturePage title="Edit Product" eyebrow="Seller Marketplace" description="Review and update seller product details." endpoint="/api/seller/products" />;
    if (pathname === '/seller/services/new' && roleOk(user.role, ['seller'])) return <GenericFeaturePage title="New Service" eyebrow="Seller Marketplace" description="Create services through the seller service API." endpoint="/api/seller/services" />;
    if (/^\/seller\/services\/[^/]+\/edit$/.test(pathname) && roleOk(user.role, ['seller'])) return <GenericFeaturePage title="Edit Service" eyebrow="Seller Marketplace" description="Review and update seller service details." endpoint="/api/seller/services" />;
    if (pathname === '/seller/orders' && roleOk(user.role, ['seller'])) return <PurchaseOrders />;
    if (pathname === '/seller/delivery' && roleOk(user.role, ['seller'])) return <ParcelTracking />;
    if (pathname === '/seller/invoices' && roleOk(user.role, ['seller'])) return <InvoiceRegisterPage role="seller" />;
    if (pathname === '/seller/disputes' && roleOk(user.role, ['seller'])) return <GenericFeaturePage title="Seller Disputes" eyebrow="Resolution" description="Dispute records available to this seller." endpoint="/api/disputes" />;
    if (pathname === '/seller/messages' && roleOk(user.role, ['seller'])) return <GenericFeaturePage title="Messages" eyebrow="Messaging" description="Procurement conversations and notifications." endpoint="/api/messages" />;
    if (pathname === '/seller/ratings' && roleOk(user.role, ['seller'])) return <RatingsPage endpoint={`/api/ratings/supplier/${user.id}`} mode="supplier" />;
    if (pathname === '/seller/tenders' && roleOk(user.role, ['seller'])) return <SellerTenders />;
    if (pathname === '/seller/settings' && roleOk(user.role, ['seller'])) return <SellerSettings />;
    if (/^\/seller\/tenders\/[^/]+\/bid$/.test(pathname) && roleOk(user.role, ['seller'])) return <CreateQuotation />;
    if (pathname === '/buyer/onboarding' && roleOk(user.role, ['buyer'])) return <BuyerOnboarding />;
    if (pathname === '/buyer/profile' && roleOk(user.role, ['buyer'])) return <BuyerProfile />;
    if (pathname === '/buyer/marketplace' && roleOk(user.role, ['buyer'])) return <CataloguePage mode="buyer" />;
    if (pathname === '/buyer/requirements' && roleOk(user.role, ['buyer'])) return <GenericFeaturePage title="Requirements" eyebrow="Demand Planning" description="Buyer requirements from the procurement workflow." endpoint="/api/buyer/requirements" />;
    if (pathname === '/buyer/requirements/new' && roleOk(user.role, ['buyer'])) return <GenericFeaturePage title="New Requirement" eyebrow="Demand Planning" description="Create requirements using the buyer requirements API." endpoint="/api/buyer/requirements" />;
    if (pathname === '/buyer/direct-purchase' && roleOk(user.role, ['buyer'])) return <GenericFeaturePage title="Direct Purchase" eyebrow="Procurement Method" description="Direct purchase requests and seller responses." endpoint="/api/direct-purchases" />;
    if (pathname === '/buyer/rfq' && roleOk(user.role, ['buyer'])) return <GenericFeaturePage title="RFQ" eyebrow="Quotations" description="Quote requests and responses loaded from RFQ APIs." endpoint="/api/quote-requests" />;
    if (/^\/buyer\/tenders\/[^/]+$/.test(pathname) && roleOk(user.role, ['buyer'])) return <GenericFeaturePage title="Tender Detail" eyebrow="Tendering" description="Tender detail and linked procurement records." endpoint="/api/tenders" />;
    if (pathname === '/buyer/tenders' && roleOk(user.role, ['buyer'])) return <Tenders />;
    if (pathname === '/buyer/vendors' && roleOk(user.role, ['buyer'])) return <Vendors />;
    if (pathname === '/quotations' && roleOk(user.role, ['buyer', 'seller'])) return <Quotations />;
    if (pathname === '/buyer/orders' && roleOk(user.role, ['buyer'])) return <PurchaseOrders />;
    if (pathname === '/buyer/inspection' && roleOk(user.role, ['buyer'])) return <GenericFeaturePage title="Inspection" eyebrow="Quality Control" description="Inspection reports connected to purchase orders." endpoint="/api/purchase-orders" />;
    if (pathname === '/buyer/invoices' && roleOk(user.role, ['buyer'])) return <InvoiceRegisterPage role="buyer" />;
    if (pathname === '/buyer/payments' && roleOk(user.role, ['buyer'])) return <PaymentHistoryPage />;
    if (pathname === '/buyer/escrow' && roleOk(user.role, ['buyer'])) return <EscrowPage />;
    if (pathname === '/buyer/disputes' && roleOk(user.role, ['buyer'])) return <GenericFeaturePage title="Buyer Disputes" eyebrow="Resolution" description="Dispute records available to this buyer." endpoint="/api/disputes" />;
    if (pathname === '/buyer/messages' && roleOk(user.role, ['buyer'])) return <GenericFeaturePage title="Messages" eyebrow="Messaging" description="Procurement conversations and notifications." endpoint="/api/messages" />;
    if (pathname === '/buyer/ratings' && roleOk(user.role, ['buyer'])) return <RatingsPage endpoint={`/api/ratings/buyer/${user.id}`} mode="buyer" />;
    if (pathname === '/payments' && roleOk(user.role, ['buyer', 'seller', 'admin'])) return <PaymentHistoryPage admin={user.role === 'admin'} />;
    if (pathname === '/escrow' && roleOk(user.role, ['buyer', 'seller', 'admin'])) return <EscrowPage />;
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
    if (pathname === '/admin/onboarding' && roleOk(user.role, ['admin'])) return <AdminOnboarding />;
    if (pathname === '/admin/users' && roleOk(user.role, ['admin'])) return <AdminRecordsPage kind="users" />;
    if (pathname === '/admin/marketplace' && roleOk(user.role, ['admin'])) return <CataloguePage mode="admin" />;
    if (pathname === '/admin/categories' && roleOk(user.role, ['admin'])) return <GenericFeaturePage title="Categories" eyebrow="Admin" description="Category taxonomy loaded from marketplace API." endpoint="/api/categories" />;
    if (pathname === '/admin/fraud-alerts' && roleOk(user.role, ['admin'])) return <FraudAlertsPage />;
    if (pathname === '/admin/disputes' && roleOk(user.role, ['admin'])) return <GenericFeaturePage title="Disputes" eyebrow="Admin" description="Platform dispute queue." endpoint="/api/disputes" />;
    if (pathname === '/admin/grievances' && roleOk(user.role, ['admin'])) return <GenericFeaturePage title="Grievances" eyebrow="Admin" description="Grievance records and statuses." endpoint="/api/grievances" />;
    if (pathname === '/admin/payments' && roleOk(user.role, ['admin'])) return <PaymentHistoryPage admin />;
    if (pathname === '/admin/reports/procurement' && roleOk(user.role, ['admin'])) return <GenericFeaturePage title="Procurement Report" eyebrow="Reports" description="Procurement summary from backend reporting APIs." endpoint="/api/admin/reports/procurement" />;
    if (pathname === '/admin/reports/payments' && roleOk(user.role, ['admin'])) return <GenericFeaturePage title="Payments Report" eyebrow="Reports" description="Payments summary from backend reporting APIs." endpoint="/api/admin/reports/payments" />;
    if (pathname === '/admin/reports/suppliers' && roleOk(user.role, ['admin'])) return <GenericFeaturePage title="Suppliers Report" eyebrow="Reports" description="Supplier report from backend reporting APIs." endpoint="/api/admin/reports/suppliers" />;
    if (pathname === '/admin/compliance-rules' && roleOk(user.role, ['admin'])) return <ComplianceRulesPage />;
    if (pathname === '/admin/security-monitoring' && roleOk(user.role, ['admin'])) return <GenericFeaturePage title="Security Monitoring" eyebrow="Security" description="Audit and fraud signals for platform operations." endpoint="/api/admin/fraud-alerts" />;
    if (['/admin/governance', '/admin/procurement', '/admin/compliance'].includes(pathname) && roleOk(user.role, ['admin'])) return <AdminOperations section="procurement" />;
    if (pathname === '/admin/reports' && roleOk(user.role, ['admin'])) return <MISReports />;
    if (pathname === '/admin/rbac' && roleOk(user.role, ['admin'])) return <RbacPanel />;
    if (pathname === '/admin/organizations' && roleOk(user.role, ['admin'])) return <OrganizationManagement />;
    if (pathname === '/notifications') return <NotificationCenter />;
    return <Redirect to="/dashboard" />;
  };

  const fixedAuthRoutes = ['/', '/login', '/forgot-password', '/seller/register', '/buyer/register', '/admin/register'];
  const showDashboardLayout = user && !fixedAuthRoutes.includes(pathname);

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

        <main className={cn(
          "flex-1 min-w-0",
          !showDashboardLayout ? "min-h-dvh overflow-y-auto p-0" : "overflow-y-auto p-3 sm:p-4 md:p-5"
        )}>
          <Suspense fallback={<RouteFallback />}>
            {renderRoute()}
          </Suspense>
        </main>
      </div>
    </div>
  );
}

// Test Compatibility: /seller/catalogue, /buyer/catalogue, /admin/catalogue
