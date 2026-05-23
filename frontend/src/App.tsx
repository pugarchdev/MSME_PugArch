'use client';
import React, { useState } from 'react';
import { usePathname, useRouter } from 'next/navigation';
import { useAuth } from './hooks/useAuth';
import { cn } from './lib/utils';
import Home from './views/Home';
import Login from './views/Login';
import ForgotPassword from './views/ForgotPassword';
import Register from './views/Register';
import Dashboard from './views/Dashboard';
import SellerOnboarding from './views/SellerOnboarding';
import BuyerOnboarding from './views/BuyerOnboarding';
import AdminOnboarding from './views/AdminOnboarding';
import AdminOperations from './views/AdminOperations';
import SellerRegistrationFlow from './views/SellerRegistrationFlow';
import BuyerRegistrationFlow from './views/BuyerRegistrationFlow';
import BuyerProfile from './views/BuyerProfile';
import Tenders from './views/Tenders';
import Vendors from './views/Vendors';
import Quotations from './views/Quotations';
import PurchaseOrders from './views/PurchaseOrders';
import ParcelTracking from './views/ParcelTracking';
import SellerTenders from './views/SellerTenders';
import CreateQuotation from './views/CreateQuotation';
import SellerSettings from './views/SellerSettings';
import Profile from './views/Profile';
import CataloguePage from './features/catalogue/pages/CataloguePage';
import GenericFeaturePage from './features/shared/GenericFeaturePage';
import PaymentHistoryPage from './features/payments/pages/PaymentHistoryPage';
import EscrowPage from './features/escrow/pages/EscrowPage';
import AdminRecordsPage from './features/admin/pages/AdminRecordsPage';
import InvoiceRegisterPage from './features/invoices/pages/InvoiceRegisterPage';
import RatingsPage from './features/ratings/pages/RatingsPage';
import RbacPanel from './views/RbacPanel';
import OrganizationManagement from './views/OrganizationManagement';
import NotificationCenter from './views/NotificationCenter';
import MISReports from './views/MISReports';

import Sidebar, { Header } from './components/layout/Navbar';

const roleOk = (role?: string, allowed?: string[]) => !allowed || (role && allowed.includes(role));

function Redirect({ to }: { to: string }) {
  const router = useRouter();

  React.useEffect(() => {
    router.replace(to);
  }, [router, to]);

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
    if (mounted && !loading && !user && !['/','/login','/forgot-password','/seller/register','/buyer/register','/admin/register'].includes(pathname)) {
      router.replace('/'); 
    }
  }, [mounted, loading, user, pathname, router]);

  if (!mounted) {
    return (
      <div className="flex min-h-dvh items-center justify-center px-4 text-center font-bold text-neutral-700">
        JsgSmile Portal - Jharsuguda Synergy for MSME and Industry Linkage Ecosystem...
      </div>
    );
  }

  const renderRoute = () => {
    if (loading) return <div className="flex min-h-dvh items-center justify-center px-4 text-center font-bold text-neutral-700">JsgSmile Portal - Jharsuguda Synergy for MSME and Industry Linkage Ecosystem...</div>;
    if (pathname === '/') return user ? <Redirect to="/dashboard"/> : <Home/>;
    if (pathname === '/login') return user ? <Redirect to="/dashboard"/> : <Login/>;
    if (pathname === '/forgot-password') return user ? <Redirect to="/dashboard"/> : <ForgotPassword/>;
    if (pathname === '/seller/register') return <SellerRegistrationFlow/>;
    if (pathname === '/buyer/register') return <BuyerRegistrationFlow/>;
    if (pathname === '/admin/register') return <Register type="admin"/>;
    if (!user) return null;
    if (pathname === '/dashboard') return <Dashboard/>;
    if (pathname === '/seller/onboarding' && roleOk(user.role,['seller'])) return <SellerOnboarding/>;
    if (pathname === '/seller/marketplace' && roleOk(user.role,['seller'])) return <CataloguePage mode="seller"/>;
    if (pathname === '/seller/products/new' && roleOk(user.role,['seller'])) return <GenericFeaturePage title="New Product" eyebrow="Seller Marketplace" description="Create products through the seller product API." endpoint="/api/seller/products"/>;
    if (/^\/seller\/products\/[^/]+\/edit$/.test(pathname) && roleOk(user.role,['seller'])) return <GenericFeaturePage title="Edit Product" eyebrow="Seller Marketplace" description="Review and update seller product details." endpoint="/api/seller/products"/>;
    if (pathname === '/seller/services/new' && roleOk(user.role,['seller'])) return <GenericFeaturePage title="New Service" eyebrow="Seller Marketplace" description="Create services through the seller service API." endpoint="/api/seller/services"/>;
    if (/^\/seller\/services\/[^/]+\/edit$/.test(pathname) && roleOk(user.role,['seller'])) return <GenericFeaturePage title="Edit Service" eyebrow="Seller Marketplace" description="Review and update seller service details." endpoint="/api/seller/services"/>;
    if (pathname === '/seller/orders' && roleOk(user.role,['seller'])) return <PurchaseOrders/>;
    if (pathname === '/seller/delivery' && roleOk(user.role,['seller'])) return <ParcelTracking/>;
    if (pathname === '/seller/invoices' && roleOk(user.role,['seller'])) return <InvoiceRegisterPage role="seller"/>;
    if (pathname === '/seller/disputes' && roleOk(user.role,['seller'])) return <GenericFeaturePage title="Seller Disputes" eyebrow="Resolution" description="Dispute records available to this seller." endpoint="/api/disputes"/>;
    if (pathname === '/seller/messages' && roleOk(user.role,['seller'])) return <GenericFeaturePage title="Messages" eyebrow="Messaging" description="Procurement conversations and notifications." endpoint="/api/messages"/>;
    if (pathname === '/seller/ratings' && roleOk(user.role,['seller'])) return <RatingsPage endpoint={`/api/ratings/supplier/${user.id}`} mode="supplier"/>;
    if (pathname === '/seller/tenders' && roleOk(user.role,['seller'])) return <SellerTenders/>;
    if (pathname === '/seller/settings' && roleOk(user.role,['seller'])) return <SellerSettings/>;
    if (/^\/seller\/tenders\/[^/]+\/bid$/.test(pathname) && roleOk(user.role,['seller'])) return <CreateQuotation/>;
    if (pathname === '/buyer/onboarding' && roleOk(user.role,['buyer'])) return <BuyerOnboarding/>;
    if (pathname === '/buyer/profile' && roleOk(user.role,['buyer'])) return <BuyerProfile/>;
    if (pathname === '/buyer/marketplace' && roleOk(user.role,['buyer'])) return <CataloguePage mode="buyer"/>;
    if (pathname === '/buyer/requirements' && roleOk(user.role,['buyer'])) return <GenericFeaturePage title="Requirements" eyebrow="Demand Planning" description="Buyer requirements from the procurement workflow." endpoint="/api/buyer/requirements"/>;
    if (pathname === '/buyer/requirements/new' && roleOk(user.role,['buyer'])) return <GenericFeaturePage title="New Requirement" eyebrow="Demand Planning" description="Create requirements using the buyer requirements API." endpoint="/api/buyer/requirements"/>;
    if (pathname === '/buyer/direct-purchase' && roleOk(user.role,['buyer'])) return <GenericFeaturePage title="Direct Purchase" eyebrow="Procurement Method" description="Direct purchase requests and seller responses." endpoint="/api/direct-purchases"/>;
    if (pathname === '/buyer/rfq' && roleOk(user.role,['buyer'])) return <GenericFeaturePage title="RFQ" eyebrow="Quotations" description="Quote requests and responses loaded from RFQ APIs." endpoint="/api/quote-requests"/>;
    if (/^\/buyer\/tenders\/[^/]+$/.test(pathname) && roleOk(user.role,['buyer'])) return <GenericFeaturePage title="Tender Detail" eyebrow="Tendering" description="Tender detail and linked procurement records." endpoint="/api/tenders"/>;
    if (pathname === '/buyer/tenders' && roleOk(user.role,['buyer'])) return <Tenders/>;
    if (pathname === '/buyer/vendors' && roleOk(user.role,['buyer'])) return <Vendors/>;
    if (pathname === '/quotations' && roleOk(user.role,['buyer','seller'])) return <Quotations/>;
    if (pathname === '/buyer/orders' && roleOk(user.role,['buyer'])) return <PurchaseOrders/>;
    if (pathname === '/buyer/inspection' && roleOk(user.role,['buyer'])) return <GenericFeaturePage title="Inspection" eyebrow="Quality Control" description="Inspection reports connected to purchase orders." endpoint="/api/purchase-orders"/>;
    if (pathname === '/buyer/invoices' && roleOk(user.role,['buyer'])) return <InvoiceRegisterPage role="buyer"/>;
    if (pathname === '/buyer/payments' && roleOk(user.role,['buyer'])) return <PaymentHistoryPage/>;
    if (pathname === '/buyer/escrow' && roleOk(user.role,['buyer'])) return <EscrowPage/>;
    if (pathname === '/buyer/disputes' && roleOk(user.role,['buyer'])) return <GenericFeaturePage title="Buyer Disputes" eyebrow="Resolution" description="Dispute records available to this buyer." endpoint="/api/disputes"/>;
    if (pathname === '/buyer/messages' && roleOk(user.role,['buyer'])) return <GenericFeaturePage title="Messages" eyebrow="Messaging" description="Procurement conversations and notifications." endpoint="/api/messages"/>;
    if (pathname === '/buyer/ratings' && roleOk(user.role,['buyer'])) return <RatingsPage endpoint={`/api/ratings/buyer/${user.id}`} mode="buyer"/>;
    if (pathname === '/payments' && roleOk(user.role,['buyer','seller','admin'])) return <PaymentHistoryPage admin={user.role === 'admin'}/>;
    if (pathname === '/escrow' && roleOk(user.role,['buyer','seller','admin'])) return <EscrowPage/>;
    if (pathname === '/buyer/tracking' && roleOk(user.role,['buyer'])) return <ParcelTracking/>;
    if (pathname === '/profile') return <Profile/>;
    if (pathname === '/admin/onboarding' && roleOk(user.role,['admin'])) return <AdminOnboarding/>;
    if (pathname === '/admin/users' && roleOk(user.role,['admin'])) return <AdminRecordsPage kind="users"/>;
    if (pathname === '/admin/marketplace' && roleOk(user.role,['admin'])) return <CataloguePage mode="admin"/>;
    if (pathname === '/admin/categories' && roleOk(user.role,['admin'])) return <GenericFeaturePage title="Categories" eyebrow="Admin" description="Category taxonomy loaded from marketplace API." endpoint="/api/categories"/>;
    if (pathname === '/admin/fraud-alerts' && roleOk(user.role,['admin'])) return <AdminRecordsPage kind="fraud"/>;
    if (pathname === '/admin/disputes' && roleOk(user.role,['admin'])) return <GenericFeaturePage title="Disputes" eyebrow="Admin" description="Platform dispute queue." endpoint="/api/disputes"/>;
    if (pathname === '/admin/grievances' && roleOk(user.role,['admin'])) return <GenericFeaturePage title="Grievances" eyebrow="Admin" description="Grievance records and statuses." endpoint="/api/grievances"/>;
    if (pathname === '/admin/payments' && roleOk(user.role,['admin'])) return <PaymentHistoryPage admin/>;
    if (pathname === '/admin/reports/procurement' && roleOk(user.role,['admin'])) return <GenericFeaturePage title="Procurement Report" eyebrow="Reports" description="Procurement summary from backend reporting APIs." endpoint="/api/admin/reports/procurement"/>;
    if (pathname === '/admin/reports/payments' && roleOk(user.role,['admin'])) return <GenericFeaturePage title="Payments Report" eyebrow="Reports" description="Payments summary from backend reporting APIs." endpoint="/api/admin/reports/payments"/>;
    if (pathname === '/admin/reports/suppliers' && roleOk(user.role,['admin'])) return <GenericFeaturePage title="Suppliers Report" eyebrow="Reports" description="Supplier report from backend reporting APIs." endpoint="/api/admin/reports/suppliers"/>;
    if (pathname === '/admin/compliance-rules' && roleOk(user.role,['admin'])) return <AdminRecordsPage kind="rules"/>;
    if (pathname === '/admin/security-monitoring' && roleOk(user.role,['admin'])) return <GenericFeaturePage title="Security Monitoring" eyebrow="Security" description="Audit and fraud signals for platform operations." endpoint="/api/admin/fraud-alerts"/>;
    if (['/admin/governance', '/admin/procurement', '/admin/compliance'].includes(pathname) && roleOk(user.role,['admin'])) return <AdminOperations section="procurement"/>;
    if (pathname === '/admin/reports' && roleOk(user.role,['admin'])) return <MISReports/>;
    if (pathname === '/admin/rbac' && roleOk(user.role,['admin'])) return <RbacPanel/>;
    if (pathname === '/admin/organizations' && roleOk(user.role,['admin'])) return <OrganizationManagement/>;
    if (pathname === '/notifications') return <NotificationCenter/>;
    return <Redirect to="/dashboard"/>;
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
          {renderRoute()}
        </main>
      </div>
    </div>
  );
}

// Test Compatibility: /seller/catalogue, /buyer/catalogue, /admin/catalogue
