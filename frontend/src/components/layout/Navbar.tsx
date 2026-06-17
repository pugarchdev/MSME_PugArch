import Link from 'next/link';
import { useRouter, usePathname } from 'next/navigation';
import { memo, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useAuth } from '../../hooks/useAuth';
import { Button } from '../ui/button';
import { toast } from 'sonner';
import { api, unwrapApiData, BASE_URL } from '../../lib/api';
import {
  AlertTriangle,
  CheckCircle2,
  Clock,
  Building2,
  Store,
  LayoutDashboard,
  LogOut,
  ShieldCheck,
  ShoppingCart,
  Menu,
  X,
  ChevronRight,
  ChevronDown,
  Bell,
  Search,
  Users,
  FileText,
  User as UserIcon,
  Settings,
  ClipboardCheck,
  Truck,
  CreditCard,
  Landmark,
  PanelLeftClose,
  PanelLeftOpen,
  BarChart3,
  FileSearch,
  Info,
  Check,
  CheckSquare,
  UserPlus,
  ClipboardList,
  BookOpen,
  Images,
  Trophy,
  Gavel,
  UsersRound
} from 'lucide-react';
import { cn } from '../../lib/utils';
import { routeForNotification, type PortalNotification } from '../../lib/notifications';
import { isShgUser, getSellerPortalPath } from '../../lib/shg';

interface SidebarItem {
  label: string;
  path?: string;
  icon: any;
  roles: string[];
  permission?: string;
  featureCode?: string;
  children?: SidebarItem[];
}

interface SidebarProps {
  isOpen: boolean;
  onClose: () => void;
  isCollapsed: boolean;
  onToggleCollapse: () => void;
  onHoverChange?: (isHovered: boolean) => void;
}

const preloadRegistry: Record<string, () => Promise<any>> = {
  '/dashboard': () => import('../../views/Dashboard'),
  '/master-admin': () => import('../../features/masterAdmin/pages/MasterAdminPage'),
  '/buyer/procurement/create': () => import('../../features/procurementWizard/pages/CreateProcurementPage'),
  '/buyer/procurements': () => import('../../features/requirements/pages/RequirementsPage'),
  '/seller/opportunities': () => import('../../features/sellerOpportunities/pages/SellerOpportunitiesPage'),
  '/orders': () => import('../../features/procurementBid/pages/ProcurementOrdersPage'),
  '/orders/delivery-confirmation': () => import('../../features/grn/pages/GrnListPage'),
  '/orders/tracking': () => import('../../views/ParcelTracking'),
  '/payments/invoices': () => Promise.resolve(),
  '/payments/transactions': () => Promise.resolve(),
  '/payments/escrow': () => import('../../features/escrow/pages/EscrowPage'),
  '/admin/onboarding': () => import('../../views/AdminOnboarding'),
  '/admin/shg-applications': () => import('../../views/AdminShgApplications'),
  '/shg/onboarding': () => import('../../views/ShgOnboarding'),
  '/shg/dashboard': () => import('../../views/ShgOnboarding'),
  '/admin/governance': () => import('../../views/AdminOperations'),
  '/seller/marketplace': () => Promise.resolve(),
  '/buyer/marketplace': () => Promise.resolve(),
  '/buyer/tenders': () => import('../../views/Tenders'),
  '/seller/tenders': () => import('../../views/SellerTenders'),
  '/quotations': () => import('../../views/Quotations'),
  '/seller/orders': () => Promise.resolve(),
  '/buyer/orders': () => Promise.resolve(),
  '/seller/invoices': () => Promise.resolve(),
  '/buyer/invoices': () => Promise.resolve(),
  '/seller/delivery': () => import('../../views/ParcelTracking'),
  '/seller/delivery-management': () => import('../../features/sellerDelivery/pages/SellerDeliveryManagementPage'),
  '/seller/ratings': () => import('../../features/ratings/pages/RatingsPage'),
  '/buyer/vendors': () => import('../../views/Vendors'),
  '/buyer/requirements': () => import('../../features/requirements/pages/RequirementsPage'),
  '/buyer/direct-purchase': () => import('../../features/directPurchase/pages/DirectPurchasePage'),
  '/buyer/rfq': () => import('../../features/rfq/pages/RfqPage'),
  '/seller/rfq': () => import('../../features/rfq/pages/RfqPage'),
  '/reverse-auctions': () => import('../../features/reverseAuctions/pages/ReverseAuctionListPage'),
  '/reverse-auctions/create': () => import('../../features/reverseAuctions/pages/ReverseAuctionCreatePage'),
  '/seller/direct-purchase': () => import('../../features/directPurchase/pages/DirectPurchasePage'),
  '/buyer/tracking': () => import('../../views/ParcelTracking'),
  '/admin/delivery': () => import('../../features/delivery/pages/DeliveryListPage'),
  '/admin/reports': () => import('../../views/MISReports'),
  '/admin/banners': () => import('../../features/banners/pages/AdminBannerManagementPage'),
  '/admin/monthly-rankings': () => import('../../features/banners/pages/MonthlyRankingsAdminPage'),
  '/my-org/banner-eligibility': () => import('../../features/banners/pages/OrganizationBannerEligibilityPage'),
  '/cart': () => import('../../features/cart/pages/CartPage'),
  '/cart/approvals': () => import('../../features/cart/pages/CartApprovalPage'),
  '/cart/technical-review': () => import('../../features/cart/pages/TechnicalReviewPage'),
  '/approvals': () => import('../../features/approvals/pages/ApprovalQueuePage'),
  '/grn': () => import('../../features/grn/pages/GrnListPage'),
  '/payments': () => Promise.resolve(),
  '/escrow': () => import('../../features/escrow/pages/EscrowPage'),
  '/org/team': () => import('../../features/orgTeam/pages/TeamManagementPage'),
  '/buyer/disputes': () => import('../../features/disputes/pages/DisputesPage'),
  '/seller/disputes': () => import('../../features/disputes/pages/DisputesPage'),
  '/admin/disputes': () => import('../../features/disputes/pages/DisputesPage'),
  '/settings/notifications': () => import('../../features/settings/pages/NotificationPrefsPage'),
  '/admin/users': () => import('../../features/admin/pages/AdminRecordsPage'),
  '/admin/marketplace': () => Promise.resolve(),
  '/admin/organizations': () => import('../../views/OrganizationManagement'),
  '/admin/rbac': () => import('../../views/RbacPanel'),
  '/admin/fraud-alerts': () => import('../../features/fraudAlerts/pages/FraudAlertsPage'),
  '/admin/compliance-rules': () => import('../../features/compliance/pages/ComplianceRulesPage'),
  '/seller/onboarding': () => import('../../views/SellerOnboarding'),
  '/buyer/onboarding': () => import('../../views/BuyerOnboarding'),
  '/seller/settings': () => import('../../views/SellerSettings'),
  '/buyer/profile': () => import('../../views/BuyerProfile'),
  '/user-guide': () => import('../../views/PortalDocumentation'),
  '/profile': () => import('../../views/Profile'),
};

const preloadRoute = (path: string) => {
  const load = preloadRegistry[path.split('?')[0]];
  if (load) {
    load().catch((err) => {
      console.warn(`Failed to preload chunk for path ${path}:`, err);
    });
  }
};

const collectPaths = (items: SidebarItem[]) =>
  items.flatMap(item => item.children?.length ? collectPaths(item.children) : item.path ? [item.path] : []);

const SIDEBAR_GROUP_STATE_KEY = 'msme-sidebar-open-groups';
type SidebarGroupState = Record<string, boolean | undefined>;

const getSidebarGroupId = (label: string) =>
  `sidebar-group-${label.toLowerCase().replace(/[^a-z0-9]+/g, '-')}`;

const HIGH_PRIORITY_PREFETCH_ROUTES = [
  '/dashboard',
  '/master-admin',
  '/admin/users',
  '/admin/organizations',
  '/admin/onboarding',
  '/admin/reports',
  '/admin/banners',
  '/admin/monthly-rankings',
  '/payments',
  '/escrow',
  '/settings/notifications'
] as const;

const SidebarNavLink = memo(function SidebarNavLink({
  item,
  isActive,
  isCollapsed,
  onClose
}: {
  item: SidebarItem;
  isActive: boolean;
  isCollapsed: boolean;
  onClose: () => void;
}) {
  const path = item.path;
  const handlePreload = useCallback(() => {
    if (path) preloadRoute(path);
  }, [path]);
  const handlePointerDown = useCallback(() => {
    if (path) preloadRoute(path);
  }, [path]);
  const Icon = item.icon;
  if (!path) return null;

  return (
    <Link
      href={path}
      scroll={false}
      onClick={onClose}
      onPointerDown={handlePointerDown}
      onTouchStart={handlePointerDown}
      onMouseEnter={handlePreload}
      onFocus={handlePreload}
      title={isCollapsed ? item.label : undefined}
      className={cn("relative flex items-center gap-3 rounded-md transition-all duration-200 group",
        isCollapsed ? "lg:justify-center lg:px-0 px-3 py-2.5 h-11" : "px-3 py-2.5",
        isActive
          ? "bg-white/10 text-white"
          : "text-white/70 hover:bg-white/5 hover:text-white"
      )}
    >
      {isActive && (
        <span className="absolute left-0 top-1/2 -translate-y-1/2 h-6 w-[3px] rounded-r bg-[#c8a45c]" aria-hidden="true" />
      )}
      <Icon className={cn("h-4 w-4 shrink-0 transition-transform group-hover:scale-110", isActive ? "text-[#c8a45c]" : "text-white/60 group-hover:text-white")} />
      <span className={cn("text-sm font-medium truncate", isCollapsed && "lg:hidden")}>{item.label}</span>
      {isActive && <ChevronRight className={cn("ml-auto h-3 w-3 text-[#c8a45c]", isCollapsed && "lg:hidden")} />}
    </Link>
  );
});

const SidebarNavGroup = memo(function SidebarNavGroup({
  item,
  pathname,
  isCollapsed,
  isOpen,
  onToggle,
  onClose
}: {
  item: SidebarItem;
  pathname?: string | null;
  isCollapsed: boolean;
  isOpen: boolean;
  onToggle: () => void;
  onClose: () => void;
}) {
  const Icon = item.icon;
  const children = item.children || [];
  const groupId = getSidebarGroupId(item.label);
  const active = children.some(child => {
    const childPath = child.path?.split('?')[0];
    return childPath === pathname || Boolean(childPath && pathname?.startsWith(`${childPath}/`));
  });

  if (!children.length) {
    const itemPath = item.path?.split('?')[0];
    return item.path ? (
      <SidebarNavLink item={item} isActive={pathname === itemPath} isCollapsed={isCollapsed} onClose={onClose} />
    ) : null;
  }

  return (
    <div className="space-y-1">
      <button
        type="button"
        onClick={onToggle}
        aria-expanded={isOpen}
        aria-controls={groupId}
        className={cn(
          "flex w-full items-center gap-3 rounded-md px-3 py-2 text-left text-[10px] font-black uppercase tracking-[0.16em] transition-colors",
          active ? "bg-white/10 text-white" : "text-white/45 hover:bg-white/5 hover:text-white",
          isCollapsed && "lg:justify-center lg:px-0"
        )}
        title={isCollapsed ? item.label : undefined}
      >
        <Icon className={cn("h-4 w-4 shrink-0", active ? "text-[#c8a45c]" : "text-white/45")} />
        <span className={cn(isCollapsed && "lg:hidden")}>{item.label}</span>
        <ChevronDown className={cn("ml-auto h-3 w-3 transition-transform", isOpen && "rotate-180", isCollapsed && "lg:hidden")} />
      </button>
      {isOpen && (
        <div id={groupId} className={cn("space-y-1", !isCollapsed && "pl-3")}>
          {children.map(child => (
            <SidebarNavLink
              key={`${item.label}-${child.label}`}
              item={child}
              isActive={pathname === child.path?.split('?')[0]}
              isCollapsed={isCollapsed}
              onClose={onClose}
            />
          ))}
        </div>
      )}
    </div>
  );
});

export default function Sidebar({ isOpen, onClose, isCollapsed, onToggleCollapse, onHoverChange }: SidebarProps) {
  const { user, logout } = useAuth();
  const router = useRouter();
  const pathname = usePathname();
  const [isHovered, setIsHovered] = useState(false);
  const [openGroups, setOpenGroups] = useState<SidebarGroupState>({});
  const sidebarRef = useRef<HTMLDivElement>(null);
  const navRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (typeof window !== 'undefined') {
      const saved = sessionStorage.getItem('sidebarScrollPosition');
      if (saved && navRef.current) {
        navRef.current.scrollTop = Number(saved);
      }

      const savedGroups = localStorage.getItem(SIDEBAR_GROUP_STATE_KEY);
      if (savedGroups) {
        try {
          const parsedGroups = JSON.parse(savedGroups);
          if (parsedGroups && typeof parsedGroups === 'object' && !Array.isArray(parsedGroups)) {
            setOpenGroups(parsedGroups);
          }
        } catch {
          localStorage.removeItem(SIDEBAR_GROUP_STATE_KEY);
        }
      }
    }
  }, []);

  const handleScroll = useCallback(() => {
    if (navRef.current) {
      sessionStorage.setItem('sidebarScrollPosition', String(navRef.current.scrollTop));
    }
  }, []);

  const handleHover = useCallback((value: boolean) => {
    setIsHovered(value);
    onHoverChange?.(value);
  }, [onHoverChange]);

  useEffect(() => {
    if (sidebarRef.current) {
      const isCurrentlyHovered = sidebarRef.current.matches(':hover');
      if (isCurrentlyHovered) {
        handleHover(true);
      }
    }
  }, []);

  useEffect(() => {
    if (!isHovered) return;

    const handleGlobalMouseMove = (e: MouseEvent) => {
      if (!sidebarRef.current) return;

      const rect = sidebarRef.current.getBoundingClientRect();
      const isInside = (
        e.clientX >= rect.left &&
        e.clientX <= rect.right &&
        e.clientY >= rect.top &&
        e.clientY <= rect.bottom
      );

      if (!isInside) {
        handleHover(false);
      }
    };

    document.addEventListener('mousemove', handleGlobalMouseMove);
    return () => {
      document.removeEventListener('mousemove', handleGlobalMouseMove);
    };
  }, [isHovered]);

  const isActuallyCollapsed = isCollapsed && !isHovered;

  const handleLogout = useCallback(() => {
    logout();
    router.push('/');
  }, [logout, router]);
  const isShgAccount = isShgUser(user);
  const accountLabel = isShgAccount ? 'SHG' : user?.role || 'user';

  const navItems: SidebarItem[] = useMemo(() => [
    { label: 'Dashboard', path: '/dashboard', icon: LayoutDashboard, roles: ['seller', 'buyer', 'admin'] },
    { label: 'SHG Hub', path: '/shg/onboarding', icon: Store, roles: ['shg'] },
    { label: 'SHG Dashboard', path: '/shg/dashboard', icon: LayoutDashboard, roles: ['shg'] },
    { label: 'Members', path: '/shg/members', icon: Users, roles: ['shg'] },
    { label: 'Bank Details', path: '/shg/bank-details', icon: Landmark, roles: ['shg'] },
    { label: 'Documents', path: '/shg/documents', icon: FileText, roles: ['shg'] },
    { label: 'Products', path: '/shg/products', icon: ShoppingCart, roles: ['shg'] },
    { label: 'Orders', path: '/shg/orders', icon: ClipboardList, roles: ['shg'] },
    { label: 'Meetings', path: '/shg/meetings', icon: ClipboardCheck, roles: ['shg'] },
    { label: 'Support', path: '/shg/support', icon: Bell, roles: ['shg'] },
    { label: 'Master Console', path: '/master-admin', icon: ShieldCheck, roles: ['master_admin'], permission: 'company.manage' },
    { label: 'Companies / Portals', path: '/master-admin/companies', icon: Building2, roles: ['master_admin'], permission: 'company.manage' },
    { label: 'Users & Roles', path: '/master-admin/users', icon: UsersRound, roles: ['master_admin'], permission: 'company.manage' },
    { label: 'Organizations', path: '/master-admin/organizations', icon: Store, roles: ['master_admin'], permission: 'company.manage' },
    { label: 'Procurement Control', path: '/master-admin/procurement', icon: Gavel, roles: ['master_admin'], permission: 'company.manage' },
    { label: 'Marketplace Control', path: '/master-admin/marketplace', icon: ShoppingCart, roles: ['master_admin'], permission: 'company.manage' },
    { label: 'Orders & Delivery', path: '/master-admin/orders', icon: Truck, roles: ['master_admin'], permission: 'company.manage' },
    { label: 'Payments & Escrow', path: '/master-admin/payments', icon: CreditCard, roles: ['master_admin'], permission: 'company.manage' },
    { label: 'Reports & Data Export', path: '/master-admin/reports', icon: BarChart3, roles: ['master_admin'], permission: 'company.manage' },
    { label: 'Feature Controls', path: '/master-admin/features', icon: CheckSquare, roles: ['master_admin'], permission: 'company.manage' },
    { label: 'Branding & Homepage', path: '/master-admin/branding', icon: Images, roles: ['master_admin'], permission: 'company.manage' },
    { label: 'Audit Logs', path: '/master-admin/audit-logs', icon: FileText, roles: ['master_admin'], permission: 'company.manage' },
    { label: 'System Monitoring', path: '/master-admin/system', icon: FileSearch, roles: ['master_admin'], permission: 'company.manage' },
    { label: 'Security & Access', path: '/master-admin/security', icon: ShieldCheck, roles: ['master_admin'], permission: 'company.manage' },
    { label: 'Settings', path: '/master-admin/settings', icon: Settings, roles: ['master_admin'], permission: 'company.manage' },
    { label: 'Approvals', icon: ClipboardCheck, roles: ['admin'], children: [
      { label: 'Procurement Approvals', path: '/admin/governance', icon: ClipboardCheck, roles: ['admin'] },
      { label: 'Seller / Buyer Approvals', path: '/admin/onboarding', icon: ShieldCheck, roles: ['admin'] },
      { label: 'SHG Applications', path: '/admin/shg-applications', icon: Store, roles: ['admin'] },
      { label: 'Tender Approvals', path: '/admin/bids', icon: FileText, roles: ['admin'] },
      { label: 'Final Award Approvals', path: '/admin/procurement-orders', icon: Trophy, roles: ['admin'] },
    ] },
    { label: 'Monitoring', icon: FileSearch, roles: ['admin'], children: [
      { label: 'Active Procurements', path: '/admin/procurement', icon: ClipboardList, roles: ['admin'] },
      { label: 'Orders & Delivery', path: '/admin/delivery', icon: Truck, roles: ['admin'] },
      { label: 'Payments & Escrow', path: '/payments/transactions', icon: CreditCard, roles: ['admin'] },
      { label: 'Fraud Alerts', path: '/admin/fraud-alerts', icon: AlertTriangle, roles: ['admin'] },
    ] },
    { label: 'Marketplace', icon: ShoppingCart, roles: ['admin'], children: [
      { label: 'Catalogue Review', path: '/admin/marketplace', icon: ShoppingCart, roles: ['admin'] },
      { label: 'Categories', path: '/admin/categories', icon: ClipboardList, roles: ['admin'] },
      { label: 'Homepage Sections', path: '/admin/marketplace/home-sections', icon: Images, roles: ['admin'] },
      { label: 'Banners', path: '/admin/banners', icon: Images, roles: ['admin'] },
      { label: 'Monthly Rankings', path: '/admin/monthly-rankings', icon: Trophy, roles: ['admin'] },
    ] },
    { label: 'Organizations', icon: Building2, roles: ['admin'], children: [
      { label: 'Users', path: '/admin/users', icon: Users, roles: ['admin'] },
      { label: 'Organizations', path: '/admin/organizations', icon: Building2, roles: ['admin'] },
      { label: 'Team & RBAC', path: '/admin/rbac', icon: ShieldCheck, roles: ['admin'], featureCode: 'role-management' },
    ] },
    { label: 'Reports', path: '/admin/reports', icon: BarChart3, roles: ['admin'], featureCode: 'reports-mis' },
    { label: 'Compliance', path: '/admin/compliance-rules', icon: ShieldCheck, roles: ['admin'] },
    { label: 'Marketplace', path: '/buyer/marketplace', icon: ShoppingCart, roles: ['buyer'], featureCode: 'product-service-catalog' },
    { label: 'Procurement', icon: ClipboardCheck, roles: ['buyer'], children: [
      { label: 'Create Procurement', path: '/buyer/procurement/create', icon: ClipboardCheck, roles: ['buyer'] },
      { label: 'My Procurements', path: '/buyer/procurements', icon: ClipboardList, roles: ['buyer'] },
      { label: 'Supplier Responses', path: '/buyer/procurement/responses', icon: FileText, roles: ['buyer'], featureCode: 'bid-submission' },
      { label: 'Approvals', path: '/buyer/procurement/approvals', icon: CheckSquare, roles: ['buyer'] },
    ] },
    { label: 'Orders', icon: Truck, roles: ['buyer'], children: [
      { label: 'Active Orders', path: '/orders', icon: ShoppingCart, roles: ['buyer'] },
      { label: 'Delivery Confirmation', path: '/orders/delivery-confirmation', icon: ClipboardList, roles: ['buyer'] },
      { label: 'Delivery Tracking', path: '/orders/tracking', icon: Truck, roles: ['buyer'] },
    ] },
    { label: 'Payments', icon: CreditCard, roles: ['buyer'], featureCode: 'payment-module', children: [
      { label: 'Invoices', path: '/payments/invoices', icon: FileText, roles: ['buyer'], featureCode: 'payment-module' },
      { label: 'Transactions', path: '/payments/transactions', icon: CreditCard, roles: ['buyer'], featureCode: 'payment-module' },
      { label: 'Payment Hold / Escrow', path: '/payments/escrow', icon: Landmark, roles: ['buyer'], featureCode: 'escrow-nodal-bank' },
    ] },
    { label: 'Suppliers', icon: Users, roles: ['buyer'], children: [
      { label: 'Supplier Directory', path: '/buyer/vendors', icon: Users, roles: ['buyer'] },
      { label: 'Saved Suppliers', path: '/buyer/vendors', icon: CheckCircle2, roles: ['buyer'] },
    ] },
    { label: 'Reports', path: '/reports', icon: BarChart3, roles: ['buyer'] },
    { label: 'Opportunities', icon: FileSearch, roles: ['seller'], children: [
      { label: 'New Opportunities', path: '/seller/opportunities', icon: FileSearch, roles: ['seller'] },
      { label: 'Request Quotations', path: '/seller/opportunities?type=quote', icon: ClipboardCheck, roles: ['seller'] },
      { label: 'Large Procurements', path: '/seller/opportunities?type=large', icon: FileText, roles: ['seller'] },
      { label: 'Buyer Requirements', path: '/seller/opportunities?type=requirement', icon: ClipboardList, roles: ['seller'] },
      { label: 'Auctions', path: '/seller/opportunities?type=auction', icon: Gavel, roles: ['seller'] },
    ] },
    { label: 'My Bids', path: '/bids', icon: ClipboardCheck, roles: ['seller'] },
    { label: 'Orders', icon: Truck, roles: ['seller'], children: [
      { label: 'Orders Received', path: '/orders', icon: ShoppingCart, roles: ['seller'] },
      { label: 'Delivery Updates', path: '/orders/tracking', icon: Truck, roles: ['seller'] },
    ] },
    { label: 'Payments', icon: CreditCard, roles: ['seller'], featureCode: 'payment-module', children: [
      { label: 'Invoices', path: '/payments/invoices', icon: FileText, roles: ['seller'], featureCode: 'payment-module' },
      { label: 'Payment Status', path: '/payments/transactions', icon: CreditCard, roles: ['seller'], featureCode: 'payment-module' },
    ] },
    { label: 'Marketplace', icon: ShoppingCart, roles: ['seller'], featureCode: 'product-service-catalog', children: [
      { label: 'Products & Services', path: '/seller/marketplace', icon: ShoppingCart, roles: ['seller'], featureCode: 'product-service-catalog' },
      { label: 'Storefront', path: user ? getSellerPortalPath(user) : '/seller/onboarding', icon: Store, roles: ['seller'] },
    ] },
    { label: 'Reports', path: '/reports', icon: BarChart3, roles: ['seller'] },
    { label: 'Banner Eligibility', path: '/my-org/banner-eligibility', icon: Images, roles: ['seller', 'buyer'] },
    { label: 'Ratings', path: '/seller/ratings', icon: CheckCircle2, roles: ['seller'] },
    { label: 'Cart', path: '/cart', icon: ShoppingCart, roles: ['buyer'] },
    { label: 'Administration', icon: Settings, roles: ['buyer', 'seller'], children: [
      { label: 'Team & Roles', path: '/org/team', icon: UserPlus, roles: ['buyer', 'seller'] },
      { label: 'Settings', path: user?.role === 'seller' ? '/seller/settings' : '/buyer/profile', icon: Settings, roles: ['buyer', 'seller'] },
      { label: 'Help', path: '/user-guide', icon: BookOpen, roles: ['buyer', 'seller', 'admin'] },
    ] },
    { label: 'Disputes', path: '/buyer/disputes', icon: AlertTriangle, roles: ['buyer'] },
    { label: 'Disputes', path: '/seller/disputes', icon: AlertTriangle, roles: ['seller'] },
    { label: 'Notification Prefs', path: '/settings/notifications', icon: Bell, roles: ['buyer', 'seller', 'admin'] },
    { label: 'Disputes', path: '/admin/disputes', icon: AlertTriangle, roles: ['admin'] },
    { label: isShgAccount ? 'SHG Hub' : 'Seller Hub', path: user ? getSellerPortalPath(user) : '/seller/onboarding', icon: isShgAccount ? UsersRound : Store, roles: ['seller'] },
    { label: 'Buyer Hub', path: '/buyer/onboarding', icon: Building2, roles: ['buyer'] },
    { label: 'User Guide', path: '/user-guide', icon: BookOpen, roles: ['admin'] },
  ], [isShgAccount, user]);

  const isAllowed = useCallback((item: SidebarItem) => {
    if (!user) return false;
    const hasRole = item.roles.includes(user.role) || (isShgAccount && item.roles.includes('shg'));
    if (!hasRole) return false;
    if (item.featureCode && user.role !== 'master_admin' && Array.isArray(user.enabledFeatures) && user.enabledFeatures.length > 0) {
      if (!user.enabledFeatures.includes(item.featureCode)) return false;
    }
    if (item.permission) {
      if (user.role === 'admin' || user.role === 'master_admin') return true;
      return user.permissions?.includes(item.permission);
    }
    return true;
  }, [user, isShgAccount]);

  const filteredNav = useMemo(() => navItems
    .map(item => {
      if (!isAllowed(item)) return null;
      if (!item.children?.length) return item;
      const children = item.children.filter(isAllowed);
      return children.length ? { ...item, children } : null;
    })
    .filter(Boolean) as SidebarItem[], [isAllowed, navItems]);

  useEffect(() => {
    localStorage.setItem(SIDEBAR_GROUP_STATE_KEY, JSON.stringify(openGroups));
  }, [openGroups]);

  const handleToggleGroup = useCallback((label: string, defaultOpen: boolean) => {
    setOpenGroups(prev => ({
      ...prev,
      [label]: !(prev[label] ?? defaultOpen)
    }));
  }, []);

  useEffect(() => {
    if (!user) return;
    const runPrefetch = () => {
      const routes = new Set<string>([
        pathname || '/dashboard',
        ...HIGH_PRIORITY_PREFETCH_ROUTES.slice(0, 4),
        ...collectPaths(filteredNav).slice(0, 5)
      ]);
      routes.forEach(path => {
        router.prefetch(path);
        preloadRoute(path);
      });
    };
    const idleWindow = window as Window & typeof globalThis & {
      requestIdleCallback?: (callback: () => void, options?: { timeout?: number }) => number;
      cancelIdleCallback?: (id: number) => void;
    };
    const idleId = idleWindow.requestIdleCallback
      ? idleWindow.requestIdleCallback(runPrefetch, { timeout: 2500 })
      : globalThis.setTimeout(runPrefetch, 600);
    return () => {
      if (idleWindow.cancelIdleCallback && typeof idleId === 'number') {
        idleWindow.cancelIdleCallback(idleId);
      } else {
        globalThis.clearTimeout(idleId as number);
      }
    };
  }, [filteredNav, pathname, router, user]);

  if (!user) return null;

  return (
    <>
      {/* Mobile Overlay */}
      {isOpen && (
        <div
          className="fixed inset-0 bg-blue-800/50 backdrop-blur-sm z-40 lg:hidden"
          onClick={onClose}
        />
      )}

      <aside
        ref={sidebarRef}
        onMouseEnter={() => handleHover(true)}
        className={cn(
          "w-64 gov-sidebar-surface text-white flex flex-col shrink-0 h-full fixed left-0 top-0 z-50 transition-all duration-300 ease-in-out lg:translate-x-0 border-r border-white/5 shadow-xl shadow-slate-900/10",
          isActuallyCollapsed ? "lg:w-20" : "w-64",
          !isActuallyCollapsed && "lg:w-64",
          isOpen ? "translate-x-0" : "-translate-x-full"
        )}>
        {/* Tricolor strip — official portal cue */}
        <div className="brand-tricolor-strip" />
        <div className={cn("h-14 px-3 border-b border-white/10 flex items-center", isActuallyCollapsed ? "justify-center" : "justify-between")}>
          <div
            className={cn("flex items-center gap-3 min-w-0 select-none", isActuallyCollapsed && "lg:justify-center")}
            title="MSME Portal"
          >
            <div className="w-11 h-11 bg-white rounded-md flex items-center justify-center overflow-hidden shadow-sm border border-white/20 shrink-0">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src="/logoo.png" alt="SMiLE MSME Logo" className="h-full w-full object-contain" />
            </div>
            <div className={cn("flex flex-col leading-tight min-w-0", isActuallyCollapsed && "lg:hidden")}>
              <span className="font-bold tracking-tight text-base truncate text-white">MSME Portal</span>
              <span className="text-[9px] font-bold uppercase tracking-[0.18em] text-[#c8a45c] truncate">Govt. of India</span>
            </div>
          </div>
          <button onClick={onClose} className="lg:hidden p-2 text-white/70 hover:text-white" aria-label="Close sidebar">
            <X className="h-5 w-5" />
          </button>

        </div>

        <nav
          ref={navRef}
          onScroll={handleScroll}
          className={cn("flex-1 overflow-y-auto", isActuallyCollapsed ? "p-2 space-y-1" : "p-3 space-y-1")}
        >
          <div className={cn("text-white/40 text-[10px] font-bold uppercase tracking-[0.18em] px-3 mb-2", isActuallyCollapsed && "lg:hidden")}>Navigation</div>
          {filteredNav.map((item) => {
            const isGroupActive = Boolean(item.children?.some(child => {
              const childPath = child.path?.split('?')[0];
              return childPath === pathname || Boolean(childPath && pathname?.startsWith(`${childPath}/`));
            }));
            return (
              <SidebarNavGroup
                key={item.label}
                item={item}
                pathname={pathname}
                isCollapsed={isActuallyCollapsed}
                isOpen={!isActuallyCollapsed && Boolean(openGroups[item.label] ?? isGroupActive)}
                onToggle={() => handleToggleGroup(item.label, isGroupActive)}
                onClose={onClose}
              />
            );
          })}
        </nav>

        <div className={cn("border-t border-white/10 bg-black/20", isActuallyCollapsed ? "p-2" : "p-3")}>
          <Link
            href={pathname === '/profile' ? '/dashboard' : '/profile'}
            scroll={false}
            onClick={onClose}
            onMouseEnter={() => preloadRoute('/profile')}
            onFocus={() => preloadRoute('/profile')}
            className={cn(
              "flex items-center gap-3 px-2 mb-3 py-1.5 rounded-md hover:bg-white/10 transition-all duration-200",
              isActuallyCollapsed && "lg:justify-center lg:px-0",
              pathname === '/profile' && "bg-white/10 ring-1 ring-[#c8a45c]/40"
            )}
          >
            <div className="w-8 h-8 rounded-full bg-[#c8a45c] flex items-center justify-center text-xs font-bold text-[#07172e] shadow-inner">
              {user.name.charAt(0)}
            </div>
            <div className={cn("flex flex-col min-w-0", isActuallyCollapsed && "lg:hidden")}>
              <span className="text-sm font-medium truncate text-white">{user.name}</span>
              <span className="text-[10px] text-white/60 uppercase tracking-wide font-bold">{accountLabel} Account</span>
            </div>
          </Link>
          <Button
            variant="outline"
            size="sm"
            onClick={handleLogout}
            title="Logout"
            className={cn("w-full bg-transparent border-white/20 text-white hover:bg-white hover:text-[#0b2447] py-2", isActuallyCollapsed && "lg:px-0")}
          >
            <LogOut className={cn("h-4 w-4", !isActuallyCollapsed && "mr-2")} />
            <span className={cn(isActuallyCollapsed && "lg:hidden")}>Logout</span>
          </Button>
        </div>
      </aside>
    </>
  );
}

interface HeaderProps {
  onMenuClick: () => void;
  onSidebarToggle: () => void;
  isSidebarCollapsed: boolean;
}

export function Header({ onMenuClick, onSidebarToggle, isSidebarCollapsed }: HeaderProps) {
  const { user, token: authToken, logout, login } = useAuth();
  const pathname = usePathname();
  const router = useRouter();
  const [isNotificationsOpen, setIsNotificationsOpen] = useState(false);
  const notificationRef = useRef<HTMLDivElement>(null);
  const [notifications, setNotifications] = useState<PortalNotification[]>([]);
  const [isProfileDropdownOpen, setIsProfileDropdownOpen] = useState(false);
  const profileDropdownRef = useRef<HTMLDivElement>(null);
  const [roleAction, setRoleAction] = useState<'buyer' | 'seller' | null>(null);

  const isShgAccount = isShgUser(user);
  const displayRole = isShgAccount ? 'SHG' : user?.role || 'user';

  const handleLogout = () => {
    logout();
    router.push('/');
  };

  const handleSwitchRole = async (targetRole: 'buyer' | 'seller') => {
    setRoleAction(targetRole);
    try {
      const res = await api.post('/api/auth/switch-role', { role: targetRole }, {
        headers: { Authorization: `Bearer ${authToken || localStorage.getItem('token') || ''}` }
      });
      if (res.ok) {
        const data = await res.json();
        login(data.accessToken || data.token, data.user, data.refreshToken);
        toast.success(`Switched to ${targetRole} view successfully!`);
        router.push(data.redirectUrl || '/dashboard');
      } else {
        const err = await res.json().catch(() => ({}));
        toast.error(err?.message || 'Failed to switch roles');
      }
    } catch {
      toast.error('Network error. Failed to switch roles.');
    } finally {
      setRoleAction(null);
    }
  };

  const handleActivateRole = async (targetRole: 'buyer' | 'seller') => {
    setRoleAction(targetRole);
    try {
      const res = await api.post('/api/auth/activate-dual-role', { roleToActivate: targetRole }, {
        headers: { Authorization: `Bearer ${authToken || localStorage.getItem('token') || ''}` }
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        toast.error(data?.message || `Unable to activate ${targetRole} profile`);
        return;
      }
      login(data.accessToken || data.token, data.user, data.refreshToken);
      toast.success(data.createdProfile
        ? `${targetRole === 'seller' ? 'Seller' : 'Buyer'} profile activated. Complete only the missing role-specific details.`
        : `Switched to ${targetRole} view successfully!`);
      router.push(data.redirectUrl || '/dashboard');
    } catch {
      toast.error('Network error. Failed to activate profile.');
    } finally {
      setRoleAction(null);
    }
  };

  useEffect(() => {
    const fetchNotifications = async () => {
      if (!authToken) return;
      try {
        const res = await api.fetch('/api/notifications', {
          headers: { Authorization: `Bearer ${authToken}` }
        });
        if (res.ok) {
          const data = await res.json();
          const body = unwrapApiData<any>(data);
          const items = Array.isArray(body) ? body : body?.notifications || body?.records || body?.items || [];
          setNotifications(Array.isArray(items) ? items : []);
        }
      } catch {
        setNotifications([]);
      }
    };
    fetchNotifications();
  }, [authToken]);

  useEffect(() => {
    if (!authToken) return;

    const baseUrl = BASE_URL;
    const streamUrl = `${baseUrl}/api/notifications/stream?token=${encodeURIComponent(authToken)}`;

    let eventSource: EventSource | null = null;
    let retryTimeout: NodeJS.Timeout | null = null;
    let disposed = false;

    const scheduleReconnect = () => {
      if (disposed || retryTimeout) return;
      retryTimeout = setTimeout(() => {
        retryTimeout = null;
        connectStream();
      }, 1000);
    };

    const connectStream = () => {
      if (disposed) return;
      try {
        eventSource?.close();
        eventSource = new EventSource(streamUrl);

        eventSource.addEventListener('connected', () => {
          console.log('[SSE] Notification stream connected successfully');
        });

        eventSource.addEventListener('notification', (event) => {
          try {
            const newNotif = JSON.parse(event.data);
            setNotifications(prev => {
              if (prev.some(n => n.id === newNotif.id)) return prev;
              return [newNotif, ...prev];
            });
            window.dispatchEvent(new CustomEvent('notifications:updated'));
            console.log('[SSE] Received new notification:', newNotif);
          } catch (e) {
            console.error('[SSE] Failed to parse notification:', e);
          }
        });

        eventSource.addEventListener('close', () => {
          eventSource?.close();
          eventSource = null;
          scheduleReconnect();
        });

        eventSource.addEventListener('error', (err) => {
          if (disposed) return;
          console.warn('[SSE] EventSource connection error. Waiting for browser reconnect...', err);
        });
      } catch (err) {
        console.error('[SSE] Failed to initialize EventSource:', err);
        scheduleReconnect();
      }
    };

    connectStream();

    return () => {
      disposed = true;
      if (eventSource) {
        eventSource.close();
      }
      if (retryTimeout) {
        clearTimeout(retryTimeout);
      }
    };
  }, [authToken]);

  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (notificationRef.current && !notificationRef.current.contains(event.target as Node)) {
        setIsNotificationsOpen(false);
      }
    }
    if (isNotificationsOpen) {
      document.addEventListener('mousedown', handleClickOutside);
    }
    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
    };
  }, [isNotificationsOpen]);

  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (profileDropdownRef.current && !profileDropdownRef.current.contains(event.target as Node)) {
        setIsProfileDropdownOpen(false);
      }
    }
    if (isProfileDropdownOpen) {
      document.addEventListener('mousedown', handleClickOutside);
    }
    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
    };
  }, [isProfileDropdownOpen]);

  const unreadCount = Array.isArray(notifications) ? notifications.filter(n => !n.isRead).length : 0;

  const markNotificationAsRead = async (id: number | string) => {
    if (!authToken) return;
    try {
      await api.post(`/api/notifications/${id}/read`, {}, {
        headers: { Authorization: `Bearer ${authToken}` }
      });
      setNotifications(prev => prev.map(n => n.id === id ? { ...n, isRead: true } : n));
      window.dispatchEvent(new CustomEvent('notifications:updated'));
    } catch {
      // Keep the dropdown usable if the read receipt fails.
    }
  };

  const markAllNotificationsAsRead = async () => {
    if (!authToken || unreadCount === 0) return;
    try {
      await api.post('/api/notifications/read-all', {}, {
        headers: { Authorization: `Bearer ${authToken}` }
      });
      setNotifications(prev => prev.map(n => ({ ...n, isRead: true })));
      window.dispatchEvent(new CustomEvent('notifications:updated'));
    } catch {
      // Keep the dropdown usable if the read receipt fails.
    }
  };

  const openNotification = async (item: PortalNotification) => {
    if (!item.isRead) await markNotificationAsRead(item.id);
    router.push(routeForNotification(item, user?.role));
    setIsNotificationsOpen(false);
  };

  return (
    <header className="bg-white border-b border-slate-200 sticky top-0 z-40 transition-all duration-300">
      <div className="brand-tricolor-strip" />
      <div className="h-14 px-4 flex items-center justify-between">
        <div className="flex items-center gap-4">
          <button
            onClick={onMenuClick}
            className="p-2 -ml-2 text-slate-500 hover:text-[#0b2447] lg:hidden"
            aria-label="Open menu"
          >
            <Menu className="h-6 w-6" />
          </button>
          <button
            onClick={onSidebarToggle}
            className="hidden lg:flex p-2 -ml-2 text-slate-400 hover:text-[#0b2447] hover:bg-slate-50 rounded-lg transition-colors"
            title={isSidebarCollapsed ? "Expand sidebar" : "Collapse sidebar"}
          >
            {isSidebarCollapsed ? <PanelLeftOpen className="h-5 w-5" /> : <PanelLeftClose className="h-5 w-5" />}
          </button>

          <div className="hidden md:flex relative group cursor-pointer" onClick={() => window.dispatchEvent(new CustomEvent('open-global-search'))}>
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-400 group-hover:text-[#0b2447] transition-colors" />
            <div className="w-64 h-9 pl-9 pr-4 rounded-lg border border-slate-200 text-sm flex items-center justify-between bg-slate-50 hover:bg-white hover:border-[#0b2447]/30 transition-all text-slate-400">
              <span>Quick search...</span>
              <kbd className="hidden sm:inline-flex items-center gap-1 rounded border border-slate-200 bg-slate-100 px-1.5 font-mono text-[10px] font-medium text-slate-500">
                <span className="text-xs">⌘</span>K
              </kbd>
            </div>
          </div>
        </div>

        <div className="flex items-center gap-2 sm:gap-4">
          <div className="relative" ref={notificationRef}>
            <button
              onClick={() => setIsNotificationsOpen(!isNotificationsOpen)}
              className={cn(
                "p-2 rounded-lg transition-all relative",
                isNotificationsOpen ? "bg-slate-100 text-[#0b2447]" : "text-slate-500 hover:bg-slate-50 hover:text-[#0b2447]"
              )}
            >
              <Bell className="h-5 w-5" />
              {unreadCount > 0 && (
                <span className="absolute top-2 right-2 h-2 w-2 bg-red-500 rounded-full ring-2 ring-white" />
              )}
            </button>

            {isNotificationsOpen && (
              <div className="absolute right-0 mt-2 w-80 sm:w-96 bg-white rounded-lg shadow-2xl border border-slate-200 overflow-hidden animate-in fade-in zoom-in-95 duration-200">
                <div className="px-4 py-3 border-b border-slate-100 flex items-center justify-between bg-slate-50/50">
                  <h3 className="text-xs font-black uppercase tracking-widest text-[#0b2447]">Notifications</h3>
                  <div className="flex items-center gap-2">
                    {unreadCount > 0 && (
                      <Badge variant="secondary" className="bg-white text-[#0b2447] border-slate-200 font-bold text-[10px]">
                        {unreadCount} NEW
                      </Badge>
                    )}
                    {unreadCount > 0 && (
                      <button
                        onClick={markAllNotificationsAsRead}
                        className="inline-flex h-7 items-center gap-1 rounded-md border border-slate-200 bg-white px-2 text-[10px] font-black uppercase tracking-wide text-slate-500 transition-colors hover:text-[#0b2447]"
                        title="Mark all as read"
                      >
                        <CheckSquare className="h-3.5 w-3.5" />
                        All
                      </button>
                    )}
                  </div>
                </div>
                <div className="max-h-[400px] overflow-y-auto">
                  {Array.isArray(notifications) && notifications.length > 0 ? (
                    notifications.map((item) => {
                      const Icon = item.type === 'alert' ? AlertTriangle : item.type === 'success' ? CheckCircle2 : Info;
                      const isWarning = item.type === 'alert';
                      const isSuccess = item.type === 'success';

                      return (
                        <button
                          key={item.id}
                          onClick={() => openNotification(item)}
                          className={cn(
                            "w-full p-4 text-left border-b border-slate-100 transition-all hover:bg-slate-50 group",
                            !item.isRead ? "bg-slate-50" : "opacity-75"
                          )}
                        >
                          <div className="flex items-start gap-3">
                            <div className={cn(
                              "mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-md bg-white shadow-sm border border-slate-100",
                              isWarning ? "text-red-500" : isSuccess ? "text-emerald-600" : "text-[#0b2447]"
                            )}>
                              <Icon className="h-4 w-4" />
                            </div>
                            <div className="min-w-0">
                              <div className="flex items-start justify-between gap-3">
                                <p className={cn(
                                  "text-[10px] font-black uppercase tracking-widest",
                                  isWarning ? "text-red-600" : isSuccess ? "text-emerald-700" : "text-[#0b2447]"
                                )}>{item.title}</p>
                                {!item.isRead && (
                                  <span
                                    role="button"
                                    tabIndex={0}
                                    onClick={(event) => {
                                      event.stopPropagation();
                                      markNotificationAsRead(item.id);
                                    }}
                                    onKeyDown={(event) => {
                                      if (event.key === 'Enter' || event.key === ' ') {
                                        event.preventDefault();
                                        event.stopPropagation();
                                        markNotificationAsRead(item.id);
                                      }
                                    }}
                                    className="inline-flex h-6 w-6 shrink-0 items-center justify-center rounded-md border border-slate-200 bg-white text-slate-400 transition-colors hover:text-emerald-600"
                                    title="Mark as read"
                                  >
                                    <Check className="h-3.5 w-3.5" />
                                  </span>
                                )}
                              </div>
                              <p className="mt-1 text-sm font-semibold leading-relaxed text-slate-800">{item.message}</p>
                              {item.createdAt && (
                                <p className="mt-2 text-[10px] font-bold uppercase tracking-widest text-slate-400">
                                  {new Date(item.createdAt).toLocaleString()}
                                </p>
                              )}
                            </div>
                          </div>
                        </button>
                      );
                    })
                  ) : (
                    <div className="py-12 text-center">
                      <Bell className="h-8 w-8 text-slate-200 mx-auto mb-3" />
                      <p className="text-xs font-bold text-slate-400 uppercase tracking-widest">No notifications yet</p>
                    </div>
                  )}
                </div>
                {Array.isArray(notifications) && notifications.length > 0 && (
                  <button
                    onClick={() => {
                      router.push('/notifications');
                      setIsNotificationsOpen(false);
                    }}
                    className="w-full py-3 bg-slate-50 border-t border-slate-100 text-[10px] font-black uppercase tracking-widest text-slate-400 hover:text-[#0b2447] transition-colors"
                  >
                    View All Notifications
                  </button>
                )}
              </div>
            )}
          </div>

          <div className="h-8 w-px bg-slate-200 hidden sm:block" />

          <div className="relative" ref={profileDropdownRef}>
            <button
              onClick={() => setIsProfileDropdownOpen(!isProfileDropdownOpen)}
              className="flex items-center gap-3 p-1 rounded-lg hover:bg-slate-50 transition-colors group text-left"
            >
              <div className="h-8 w-8 rounded-full bg-[#0b2447] flex items-center justify-center text-white font-bold text-sm shadow-sm ring-2 ring-white ring-offset-1 group-hover:ring-offset-2 transition-all">
                {user?.name?.charAt(0) || 'U'}
              </div>
              <div className="hidden sm:flex flex-col text-left">
                <span className="text-xs font-bold text-slate-900 truncate max-w-[100px]">{user?.name}</span>
                <span className="text-[9px] font-black text-[#0b2447] uppercase tracking-widest opacity-70 flex items-center gap-1">
                  {displayRole}
                  <ChevronDown className="h-2.5 w-2.5 transition-transform duration-200" style={{ transform: isProfileDropdownOpen ? 'rotate(180deg)' : 'none' }} />
                </span>
              </div>
            </button>

            {isProfileDropdownOpen && (
              <div className="absolute right-0 mt-2 w-56 bg-white rounded-lg shadow-2xl border border-slate-200 py-1.5 overflow-hidden animate-in fade-in zoom-in-95 duration-200 z-50">
                <div className="px-4 py-2 text-[10px] font-black text-slate-400 uppercase tracking-widest border-b border-slate-100 bg-slate-50/50">
                  Account Options
                </div>
                <button
                  onClick={() => {
                    setIsProfileDropdownOpen(false);
                    router.push('/profile');
                  }}
                  className="w-full text-left px-4 py-2.5 text-sm font-semibold text-slate-700 hover:bg-slate-50 hover:text-[#0b2447] transition-colors flex items-center gap-2"
                >
                  <UserIcon className="h-4 w-4 text-slate-400" />
                  My Profile
                </button>

                {/* DUAL ROLE SWITCHER / ACTIVATION */}
                {(user?.role === 'buyer' || user?.role === 'seller') && (
                  <>
                    <div className="h-px bg-slate-100 my-1" />
                    {(user?.role === 'seller' ? !!user?.buyerProfile : !!user?.sellerProfile) ? (
                      <button
                        onClick={() => {
                          setIsProfileDropdownOpen(false);
                          handleSwitchRole(user.role === 'seller' ? 'buyer' : 'seller');
                        }}
                        disabled={Boolean(roleAction)}
                        className="w-full text-left px-4 py-2.5 text-sm font-bold text-indigo-650 hover:bg-indigo-50 hover:text-indigo-750 transition-colors flex items-center gap-2"
                      >
                        {user.role === 'seller' ? (
                          <>
                            <Building2 className="h-4 w-4 text-indigo-500" />
                            {roleAction === 'buyer' ? 'Switching to Buyer...' : 'Switch to Buyer View'}
                          </>
                        ) : (
                          <>
                            <Store className="h-4 w-4 text-indigo-500" />
                            {roleAction === 'seller' ? 'Switching to Seller...' : 'Switch to Seller View'}
                          </>
                        )}
                      </button>
                    ) : (
                      <button
                        onClick={() => {
                          setIsProfileDropdownOpen(false);
                          handleActivateRole(user?.role === 'seller' ? 'buyer' : 'seller');
                        }}
                        disabled={Boolean(roleAction)}
                        className="w-full text-left px-4 py-2.5 text-sm font-bold text-amber-700 hover:bg-amber-50 hover:text-amber-800 transition-colors flex items-center gap-2"
                      >
                        {user?.role === 'seller' ? (
                          <>
                            <Building2 className="h-4 w-4 text-amber-600" />
                            {roleAction === 'buyer' ? 'Activating Buyer...' : 'Activate Buyer Profile'}
                          </>
                        ) : (
                          <>
                            <Store className="h-4 w-4 text-amber-600" />
                            {roleAction === 'seller' ? 'Activating Seller...' : 'Activate Seller Profile'}
                          </>
                        )}
                      </button>
                    )}
                  </>
                )}

                <div className="h-px bg-slate-100 my-1" />
                <button
                  onClick={() => {
                    setIsProfileDropdownOpen(false);
                    handleLogout();
                  }}
                  className="w-full text-left px-4 py-2.5 text-sm font-semibold text-red-650 hover:bg-red-50 hover:text-red-750 transition-colors flex items-center gap-2"
                >
                  <LogOut className="h-4 w-4 text-red-500" />
                  Logout
                </button>
              </div>
            )}
          </div>
        </div>
      </div>
    </header>
  );
}

const Badge = ({ children, className, variant }: any) => (
  <span className={cn(
    "px-2 py-0.5 rounded text-[10px] font-bold",
    variant === 'secondary' ? "bg-slate-100 text-slate-600" : "bg-[#0b2447]/10 text-[#0b2447]",
    className
  )}>
    {children}
  </span>
);
