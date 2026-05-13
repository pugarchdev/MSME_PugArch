import { Link, useNavigate, useLocation } from 'react-router-dom';
import { useEffect, useMemo, useRef, useState } from 'react';
import { useAuth } from '../../hooks/useAuth';
import { Button } from '../ui/button';
import { api } from '../../lib/api';
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
  Bell,
  Search,
  Users,
  FileText,
  User as UserIcon,
  Settings,
  ClipboardCheck,
  Truck,
  PanelLeftClose,
  PanelLeftOpen,
  BarChart3,
  FileSearch
} from 'lucide-react';
import { cn } from '../../lib/utils';

interface PortalNotification {
  id: number | string;
  title: string;
  message: string;
  type: string;
  isRead?: boolean;
  createdAt?: string;
  route?: string;
}

interface SidebarProps {
  isOpen: boolean;
  onClose: () => void;
  isCollapsed: boolean;
  onToggleCollapse: () => void;
  onHoverChange?: (isHovered: boolean) => void;
}

export default function Sidebar({ isOpen, onClose, isCollapsed, onToggleCollapse, onHoverChange }: SidebarProps) {
  const { user, logout } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();
  const [isHovered, setIsHovered] = useState(false);
  
  const handleHover = (value: boolean) => {
    setIsHovered(value);
    onHoverChange?.(value);
  };

  const isActuallyCollapsed = isCollapsed && !isHovered;

  const handleLogout = () => {
    logout();
    navigate('/');
  };

  const navItems = [
    { label: 'Dashboard', path: '/dashboard', icon: LayoutDashboard, roles: ['seller', 'buyer', 'admin'] },
    { label: 'Seller Portal', path: '/seller/onboarding', icon: Store, roles: ['seller'] },
    { label: 'Tenders', path: '/seller/tenders', icon: FileText, roles: ['seller'] },
    { label: 'Account Settings', path: '/seller/settings', icon: Settings, roles: ['seller'] },
    { label: 'Quotations', path: '/quotations', icon: ClipboardCheck, roles: ['seller', 'buyer'] },
    { label: 'Buyer Hub', path: '/buyer/onboarding', icon: Building2, roles: ['buyer'] },
    { label: 'Vendors', path: '/buyer/vendors', icon: Users, roles: ['buyer'] },
    { label: 'Tenders', path: '/buyer/tenders', icon: FileText, roles: ['buyer'] },
    { label: 'Purchase Orders', path: '/buyer/orders', icon: ShoppingCart, roles: ['buyer'] },
    { label: 'Parcel Tracking', path: '/buyer/tracking', icon: Truck, roles: ['buyer'] },
    { label: 'Profile', path: '/buyer/profile', icon: UserIcon, roles: ['buyer'] },
    { label: 'Procurement Desk', path: '/admin/procurement', icon: ClipboardCheck, roles: ['admin'] },
    { label: 'Compliance Desk', path: '/admin/compliance', icon: FileSearch, roles: ['admin'] },
    { label: 'Admin Console', path: '/admin/onboarding', icon: ShieldCheck, roles: ['admin'] },
    { label: 'MIS Reports', path: '/admin/reports', icon: BarChart3, roles: ['admin'] },
  ];

  const filteredNav = navItems.filter(item => !user || item.roles.includes(user.role));

  if (!user) return null;

  return (
    <>
      {/* Mobile Overlay */}
      {isOpen && (
        <div 
          className="fixed inset-0 bg-slate-900/50 backdrop-blur-sm z-40 lg:hidden"
          onClick={onClose}
        />
      )}

      <aside onMouseEnter={() => handleHover(true)} onMouseLeave={() => handleHover(false)} className={cn(
        "w-64 bg-[#12335f] text-white flex flex-col shrink-0 h-full fixed left-0 top-0 z-50 transition-all duration-300 ease-in-out lg:translate-x-0 border-r border-[#0b2445]",
        isActuallyCollapsed ? "lg:w-20" : "w-64",
        !isActuallyCollapsed && "lg:w-64",
        isOpen ? "translate-x-0" : "-translate-x-full"
      )}>
      <div className={cn("h-14 px-3 border-b border-white/10 flex items-center", isActuallyCollapsed ? "justify-center" : "justify-between")}>
        <div
          className={cn("flex items-center gap-3 min-w-0 select-none", isActuallyCollapsed && "lg:justify-center")}
          title="MSME Portal"
        >
          <div className="w-8 h-8 bg-white text-[#12335f] rounded flex items-center justify-center font-black text-sm shadow-sm">MS</div>
          <span className={cn("font-bold tracking-tight text-base truncate", isActuallyCollapsed && "lg:hidden")}>MSME Portal</span>
        </div>
        <button onClick={onClose} className="lg:hidden p-2 text-blue-100 hover:text-white" aria-label="Close sidebar">
          <X className="h-5 w-5" />
        </button>

      </div>

      <nav className={cn("flex-1 overflow-y-auto", isActuallyCollapsed ? "p-2 space-y-2" : "p-3 space-y-1")}>
        <div className={cn("text-blue-200/70 text-[10px] font-bold uppercase tracking-widest px-3 mb-2", isActuallyCollapsed && "lg:hidden")}>Navigation</div>
        {filteredNav.map((item) => (
          <Link
            key={item.label}
            to={item.path}
            onClick={onClose}
            title={isActuallyCollapsed ? item.label : undefined}
            className={cn(
              "flex items-center gap-3 rounded-md transition-all duration-200 group",
              isActuallyCollapsed ? "lg:justify-center lg:px-0 px-3 py-2.5 h-11" : "px-3 py-2.5",
              location.pathname === item.path
                ? "bg-white text-[#12335f] shadow-sm"
                : "text-blue-50/80 hover:bg-white/10 hover:text-white"
            )}
          >
            <item.icon className={cn("h-4 w-4 shrink-0 transition-transform group-hover:scale-110", location.pathname === item.path ? "text-[#12335f]" : "text-blue-100")} />
            <span className={cn("text-sm font-medium truncate", isActuallyCollapsed && "lg:hidden")}>{item.label}</span>
            {location.pathname === item.path && <ChevronRight className={cn("ml-auto h-3 w-3 opacity-60", isActuallyCollapsed && "lg:hidden")} />}
          </Link>
        ))}
      </nav>

      <div className={cn("border-t border-white/10 bg-[#0b2445]/40", isActuallyCollapsed ? "p-2" : "p-3")}>
        <Link 
          to={location.pathname === '/profile' ? '/dashboard' : '/profile'}
          onClick={onClose}
          className={cn(
            "flex items-center gap-3 px-2 mb-3 py-1.5 rounded-md hover:bg-white/10 transition-all duration-200", 
            isActuallyCollapsed && "lg:justify-center lg:px-0",
            location.pathname === '/profile' && "bg-white/10 ring-1 ring-white/30"
          )}
        >
          <div className="w-8 h-8 rounded-full bg-[#f9a825] flex items-center justify-center text-xs font-bold text-[#12335f] shadow-inner">
            {user.name.charAt(0)}
          </div>
          <div className={cn("flex flex-col min-w-0", isActuallyCollapsed && "lg:hidden")}>
            <span className="text-sm font-medium truncate">{user.name}</span>
            <span className="text-[10px] text-blue-100/70 uppercase tracking-wide font-bold">{user.role} Account</span>
          </div>
        </Link>
        <Button 
          variant="outline" 
          size="sm" 
          onClick={handleLogout} 
          title="Logout"
          className={cn("w-full bg-white/10 border-white/10 text-blue-50 hover:bg-white hover:text-[#12335f] py-2", isActuallyCollapsed && "lg:px-0")}
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
  const { user } = useAuth();
  const location = useLocation();

  const navigate = useNavigate();
  const [isNotificationsOpen, setIsNotificationsOpen] = useState(false);
  const notificationRef = useRef<HTMLDivElement>(null);

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
  const token = localStorage.getItem('token') || '';
  const authOptions = useMemo(() => ({
    headers: { Authorization: `Bearer ${token}` }
  }), [token]);
  const cachedNotifications = token ? api.peek('/api/notifications', authOptions) : null;
  const [notifications, setNotifications] = useState<PortalNotification[]>(cachedNotifications || []);
  const [isNotificationLoading, setIsNotificationLoading] = useState(!cachedNotifications);

  const sectionLabels: Record<string, string> = {
    basic: 'Basic Details',
    business: 'Business Details',
    compliance: 'Compliance',
    bank: 'Bank Details',
    documents: 'Documents',
    org: 'Organisation Details',
    rep: 'Authorized Representative',
    address: 'Address Details',
    procurement: 'Procurement Profile',
    docs: 'Documents',
    pan: 'Business PAN Validation',
    details: 'Business Details',
    additional: 'Additional Details',
    offices: 'Office Locations',
    einvoicing: 'E-Invoicing',
    ownership: 'Beneficial Ownership',
  };

  const sectionRouteMap: Record<string, { seller: string; buyer: string }> = {
    basic: { seller: '/seller/onboarding?section=basic', buyer: '/buyer/onboarding?section=basic' },
    business: { seller: '/seller/onboarding?section=business', buyer: '/buyer/onboarding?section=business' },
    compliance: { seller: '/seller/onboarding?section=compliance', buyer: '/buyer/onboarding?section=compliance' },
    bank: { seller: '/seller/onboarding?section=bank', buyer: '/buyer/onboarding?section=bank' },
    documents: { seller: '/seller/onboarding?section=documents', buyer: '/buyer/onboarding?section=documents' },
    org: { seller: '/seller/onboarding', buyer: '/buyer/onboarding?section=org' },
    rep: { seller: '/seller/onboarding', buyer: '/buyer/onboarding?section=rep' },
    address: { seller: '/seller/onboarding', buyer: '/buyer/onboarding?section=address' },
    procurement: { seller: '/seller/onboarding', buyer: '/buyer/onboarding?section=procurement' },
    docs: { seller: '/seller/onboarding', buyer: '/buyer/onboarding?section=docs' },
    pan: { seller: '/seller/onboarding?section=pan', buyer: '/buyer/onboarding' },
    details: { seller: '/seller/onboarding?section=details', buyer: '/buyer/onboarding' },
    additional: { seller: '/seller/onboarding?section=additional', buyer: '/buyer/onboarding' },
    offices: { seller: '/seller/onboarding?section=offices', buyer: '/buyer/onboarding' },
    einvoicing: { seller: '/seller/onboarding?section=einvoicing', buyer: '/buyer/onboarding' },
    ownership: { seller: '/seller/onboarding?section=ownership', buyer: '/buyer/onboarding' },
  };

  const fetchNotifications = async (silent = false) => {
    if (!token) {
      setNotifications([]);
      setIsNotificationLoading(false);
      return;
    }

    if (!silent && notifications.length === 0) setIsNotificationLoading(true);
    try {
      const res = await api.fetch('/api/notifications', { ...authOptions, skipCache: silent });
      if (!res.ok) return;
      const data = await res.json();
      setNotifications(data || []);
    } catch (err) {
      console.error('[Notifications] Failed to load:', err);
    } finally {
      setIsNotificationLoading(false);
    }
  };

  useEffect(() => {
    if (!user || !token) {
      setNotifications([]);
      setIsNotificationLoading(false);
      return;
    }

    fetchNotifications(true);
    const refresh = () => fetchNotifications(true);
    window.addEventListener('notifications:refresh', refresh);
    const interval = window.setInterval(refresh, 30000);
    return () => {
      window.removeEventListener('notifications:refresh', refresh);
      window.clearInterval(interval);
    };
  }, [user?.id, token]);

  useEffect(() => {
    if (!user || !token || typeof EventSource === 'undefined') return;
    const rawBaseUrl = import.meta.env.VITE_API_URL || '';
    const baseUrl = import.meta.env.DEV ? '' : rawBaseUrl.replace(/\/$/, '');
    const source = new EventSource(`${baseUrl}/api/notifications/stream?token=${encodeURIComponent(token)}`);

    source.addEventListener('notification', (event) => {
      try {
        const notification = JSON.parse((event as MessageEvent).data);
        setNotifications(prev => [notification, ...prev.filter(item => item.id !== notification.id)].slice(0, 20));
        api.invalidate('/api/notifications');
        window.dispatchEvent(new CustomEvent('notifications:updated'));
      } catch (err) {
        console.error('[Notifications] Failed to parse live notification:', err);
      }
    });

    source.onerror = () => {
      source.close();
    };

    return () => source.close();
  }, [user?.id, token]);

  const sectionNotifications = useMemo<PortalNotification[]>(() => {
    if (!user?.sectionStatus || !['seller', 'buyer'].includes(user.role)) return [];

    return Object.entries(user.sectionStatus)
      .filter(([, status]) => ['rejected', 'resubmission_required'].includes(String(status)))
      .map(([section, status]) => ({
        id: `section-${section}`,
        title: `${sectionLabels[section] || section} requires attention`,
        type: `section_${status}`,
        isRead: false,
        route: sectionRouteMap[section]?.[user.role as 'seller' | 'buyer'] || (user.role === 'seller' ? '/seller/onboarding' : '/buyer/onboarding'),
        message: `Your ${sectionLabels[section] || section} section has been rejected by Admin. Please review and update.`,
      }));
  }, [user]);

  const displayNotifications = useMemo(() => {
    const fallbackSections = sectionNotifications.filter(item =>
      !notifications.some(notification =>
        notification.message?.toLowerCase().includes(item.title.replace(' requires attention', '').toLowerCase())
      )
    );
    return [...fallbackSections, ...notifications].slice(0, 20);
  }, [notifications, sectionNotifications]);

  const unreadCount = displayNotifications.filter(item => !item.isRead).length;

  const routeForNotification = (notification: PortalNotification) => {
    if (notification.route) return notification.route;
    if (user?.role === 'admin') return '/admin/onboarding';
    if (notification.type === 'quote_request') return '/quotations';
    return user?.role === 'seller' ? '/seller/onboarding' : '/buyer/onboarding';
  };

  const handleNotificationToggle = async () => {
    const nextOpen = !isNotificationsOpen;
    setIsNotificationsOpen(nextOpen);
    if (!nextOpen) return;

    fetchNotifications(true);
    if (!notifications.some(item => !item.isRead)) return;

    try {
      const res = await api.post('/api/notifications/read-all', {}, authOptions);
      if (res.ok) {
        setNotifications(prev => prev.map(item => ({ ...item, isRead: true })));
        api.invalidate('/api/notifications');
        window.dispatchEvent(new CustomEvent('notifications:updated'));
      }
    } catch (err) {
      console.error('[Notifications] Failed to mark as read:', err);
    }
  };

  if (!user) return null;

  const getPageTitle = () => {
    switch (location.pathname) {
      case '/dashboard': return 'Dashboard Overview';
      case '/seller/onboarding': return 'Seller Onboarding';
      case '/buyer/onboarding': return 'Buyer Onboarding';
      case '/buyer/vendors': return 'Vendor Discovery';
      case '/buyer/tenders': return 'Procurement ERP';
      case '/quotations': return user.role === 'buyer' ? 'Bid Evaluation' : 'My Bids';
      case '/buyer/orders': return 'Order Management';
      case '/buyer/tracking': return 'Shipment Tracking';
      case '/seller/tenders': return 'Tender Marketplace';
      case '/seller/settings': return 'Account Settings';
      case '/admin/onboarding': return 'Onboarding Verification';
      case '/admin/procurement': return 'Procurement Command';
      case '/admin/compliance': return 'Compliance Desk';
      case '/admin/reports': return 'MIS Reports';
      case '/profile': return 'My Profile';
      default: return 'Procurement ERP';
    }
  };

  return (
    <header className="h-14 bg-white border-b border-slate-200 flex items-center justify-between px-3 lg:px-5 shrink-0 sticky top-0 z-40 transition-all duration-300">
      <div className="flex items-center gap-3 min-w-0">
        <button 
          onClick={onMenuClick}
          className="p-2 -ml-2 text-slate-600 hover:bg-slate-100 rounded-md lg:hidden"
          aria-label="Open sidebar"
        >
          <Menu className="h-5 w-5" />
        </button>
        <button
          onClick={onSidebarToggle}
          className="hidden lg:flex h-9 w-9 items-center justify-center rounded-md border border-slate-200 text-slate-600 hover:bg-slate-50"
          aria-label={isSidebarCollapsed ? "Expand sidebar" : "Collapse sidebar"}
          type="button"
        >
          {isSidebarCollapsed ? <PanelLeftOpen className="h-4 w-4" /> : <PanelLeftClose className="h-4 w-4" />}
        </button>
        <h1 className="text-sm md:text-base font-bold truncate max-w-[140px] xs:max-w-[220px] sm:max-w-[360px] md:max-w-none text-[#12335f]">{getPageTitle()}</h1>
      </div>
      
      <div className="flex items-center gap-3">
        <div className="relative hidden md:block">
          <Search className="absolute inset-y-0 left-3 flex items-center h-full w-4 text-slate-400 pointer-events-none" />
          <input 
            type="text" 
            placeholder="Search entities..." 
            onKeyDown={(event) => {
              if (event.key === 'Enter') navigate(user.role === 'buyer' ? '/buyer/vendors' : user.role === 'seller' ? '/seller/tenders' : '/admin/onboarding');
            }}
            className="pl-9 pr-3 py-2 bg-slate-50 border border-slate-200 rounded-md text-xs w-60 focus:ring-2 focus:ring-[#12335f] transition-all outline-none"
          />
        </div>
        <div ref={notificationRef} className="relative flex items-center gap-2">
          <button
            type="button"
            onClick={handleNotificationToggle}
            className="w-9 h-9 rounded-md border border-slate-200 flex items-center justify-center cursor-pointer text-slate-500 hover:bg-slate-50 transition-colors relative"
            aria-label="Open notifications"
          >
            <Bell className="h-4 w-4" />
            {unreadCount > 0 && (
              <span className="absolute -top-1 -right-1 min-w-5 h-5 px-1 rounded-full bg-red-500 text-white border-2 border-white text-[10px] font-black flex items-center justify-center">
                {unreadCount > 9 ? '9+' : unreadCount}
              </span>
            )}
          </button>
          {isNotificationsOpen && (
            <div className="absolute right-0 top-12 w-80 md:w-96 max-w-[calc(100vw-2rem)] rounded-2xl border border-slate-200 bg-white shadow-2xl shadow-slate-200/70 overflow-hidden z-50">
              <div className="px-5 py-4 border-b border-slate-100 flex items-center justify-between">
                <div>
                  <p className="text-xs font-black uppercase tracking-widest text-slate-900">Notifications</p>
                  <p className="text-[10px] font-bold uppercase tracking-widest text-slate-400">Portal alerts</p>
                </div>
                {unreadCount > 0 && (
                  <span className="rounded-full bg-red-50 px-3 py-1 text-[9px] font-black uppercase tracking-widest text-red-600">
                    {unreadCount} unread
                  </span>
                )}
              </div>

              <div className="max-h-96 overflow-y-auto p-3">
                {isNotificationLoading && displayNotifications.length === 0 ? (
                  <div className="px-4 py-8 text-center">
                    <p className="text-sm font-bold text-slate-700">Loading alerts</p>
                    <p className="mt-1 text-xs text-slate-400">Checking the latest portal updates.</p>
                  </div>
                ) : displayNotifications.length === 0 ? (
                  <div className="px-4 py-8 text-center">
                    <p className="text-sm font-bold text-slate-700">No new alerts</p>
                    <p className="mt-1 text-xs text-slate-400">Important onboarding updates will appear here.</p>
                  </div>
                ) : (
                  <div className="space-y-2">
                    {displayNotifications.map((item) => {
                      const isSuccess = item.type?.includes('approved');
                      const isWarning = item.type?.includes('rejected') || item.type?.includes('resubmission') || item.type?.includes('feedback');
                      const Icon = isSuccess ? CheckCircle2 : isWarning ? AlertTriangle : Clock;
                      return (
                      <button
                        key={item.id}
                        type="button"
                        onClick={() => {
                          setIsNotificationsOpen(false);
                          navigate(routeForNotification(item));
                        }}
                        className={cn(
                          "w-full rounded-xl border p-4 text-left transition-all focus:outline-none focus:ring-2 focus:ring-offset-2",
                          isWarning
                            ? "border-red-100 bg-red-50/70 hover:border-red-200 hover:bg-red-50 focus:ring-red-300"
                            : isSuccess
                              ? "border-emerald-100 bg-emerald-50/70 hover:border-emerald-200 hover:bg-emerald-50 focus:ring-emerald-300"
                              : "border-slate-100 bg-slate-50/70 hover:border-slate-200 hover:bg-slate-50 focus:ring-[#12335f]"
                        )}
                      >
                        <div className="flex items-start gap-3">
                          <div className={cn(
                            "mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-xl bg-white shadow-sm",
                            isWarning ? "text-red-500" : isSuccess ? "text-emerald-600" : "text-[#12335f]"
                          )}>
                            <Icon className="h-4 w-4" />
                          </div>
                          <div className="min-w-0">
                            <p className={cn(
                              "text-[10px] font-black uppercase tracking-widest",
                              isWarning ? "text-red-600" : isSuccess ? "text-emerald-700" : "text-[#12335f]"
                            )}>{item.title}</p>
                            <p className="mt-1 text-sm font-semibold leading-relaxed text-slate-800">{item.message}</p>
                            {item.createdAt && (
                              <p className="mt-2 text-[10px] font-bold uppercase tracking-widest text-slate-400">
                                {new Date(item.createdAt).toLocaleString()}
                              </p>
                            )}
                          </div>
                        </div>
                      </button>
                    )})}
                  </div>
                )}
              </div>
            </div>
          )}
        </div>
      </div>
    </header>
  );
}
