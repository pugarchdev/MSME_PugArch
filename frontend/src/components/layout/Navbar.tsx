import Link from 'next/link';
import { useRouter, usePathname } from 'next/navigation';
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
  CreditCard,
  Landmark,
  PanelLeftClose,
  PanelLeftOpen,
  BarChart3,
  FileSearch,
  Info
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
  redirectUrl?: string;
}

interface SidebarItem {
  label: string;
  path: string;
  icon: any;
  roles: string[];
  permission?: string;
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
  const router = useRouter();
  const pathname = usePathname();
  const [isHovered, setIsHovered] = useState(false);
  
  const handleHover = (value: boolean) => {
    setIsHovered(value);
    onHoverChange?.(value);
  };

  const isActuallyCollapsed = isCollapsed && !isHovered;

  const handleLogout = () => {
    logout();
    router.push('/');
  };

  const navItems: SidebarItem[] = [
    { label: 'Dashboard', path: '/dashboard', icon: LayoutDashboard, roles: ['seller', 'buyer', 'admin'] },
    { label: 'Seller Portal', path: '/seller/onboarding', icon: Store, roles: ['seller'] },
    { label: 'Catalogue', path: '/seller/catalogue', icon: ShoppingCart, roles: ['seller'] },
    { label: 'Orders', path: '/seller/orders', icon: ShoppingCart, roles: ['seller'] },
    { label: 'Delivery', path: '/seller/delivery', icon: Truck, roles: ['seller'] },
    { label: 'Invoices', path: '/seller/invoices', icon: CreditCard, roles: ['seller'] },
    { label: 'Ratings', path: '/seller/ratings', icon: CheckCircle2, roles: ['seller'] },
    { label: 'Tenders', path: '/seller/tenders', icon: FileText, roles: ['seller'] },
    { label: 'Account Settings', path: '/seller/settings', icon: Settings, roles: ['seller'] },
    { label: 'Quotations', path: '/quotations', icon: ClipboardCheck, roles: ['seller', 'buyer'] },
    { label: 'Buyer Hub', path: '/buyer/onboarding', icon: Building2, roles: ['buyer'] },
    { label: 'Catalogue', path: '/buyer/catalogue', icon: ShoppingCart, roles: ['buyer'] },
    { label: 'Requirements', path: '/buyer/requirements', icon: ClipboardCheck, roles: ['buyer'] },
    { label: 'Direct Purchase', path: '/buyer/direct-purchase', icon: ShoppingCart, roles: ['buyer'] },
    { label: 'RFQ', path: '/buyer/rfq', icon: FileSearch, roles: ['buyer'] },
    { label: 'Vendors', path: '/buyer/vendors', icon: Users, roles: ['buyer'] },
    { label: 'Tenders', path: '/buyer/tenders', icon: FileText, roles: ['buyer'] },
    { label: 'Purchase Orders', path: '/buyer/orders', icon: ShoppingCart, roles: ['buyer'] },
    { label: 'Payments', path: '/payments', icon: CreditCard, roles: ['buyer', 'seller', 'admin'] },
    { label: 'Escrow', path: '/escrow', icon: Landmark, roles: ['buyer', 'seller', 'admin'] },
    { label: 'Parcel Tracking', path: '/buyer/tracking', icon: Truck, roles: ['buyer'] },
    { label: 'Profile', path: '/buyer/profile', icon: UserIcon, roles: ['buyer'] },
    { label: 'Procurement Desk', path: '/admin/procurement', icon: ClipboardCheck, roles: ['admin'] },
    { label: 'Compliance Desk', path: '/admin/compliance', icon: FileSearch, roles: ['admin'] },
    { label: 'Admin Console', path: '/admin/onboarding', icon: ShieldCheck, roles: ['admin'] },
    { label: 'Users', path: '/admin/users', icon: Users, roles: ['admin'] },
    { label: 'Catalogue', path: '/admin/catalogue', icon: ShoppingCart, roles: ['admin'] },
    { label: 'Organizations', path: '/admin/organizations', icon: Building2, roles: ['admin'] },
    { label: 'RBAC Control', path: '/admin/rbac', icon: ShieldCheck, roles: ['admin'] },
    { label: 'Audit Logs', path: '/admin/audit-logs', icon: FileSearch, roles: ['admin'] },
    { label: 'Fraud Alerts', path: '/admin/fraud-alerts', icon: AlertTriangle, roles: ['admin'] },
    { label: 'Compliance Rules', path: '/admin/compliance-rules', icon: ShieldCheck, roles: ['admin'] },
    { label: 'MIS Reports', path: '/admin/reports', icon: BarChart3, roles: ['admin'] },
  ];

  const filteredNav = navItems.filter(item => {
    if (!user) return false;
    const hasRole = item.roles.includes(user.role);
    if (!hasRole) return false;
    if (item.permission) {
      if (user.role === 'admin') return true;
      return user.permissions?.includes(item.permission);
    }
    return true;
  });

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

      <aside onMouseEnter={() => handleHover(true)} onMouseLeave={() => handleHover(false)} className={cn(
        "w-64 bg-[#1d4ed8] text-white flex flex-col shrink-0 h-full fixed left-0 top-0 z-50 transition-all duration-300 ease-in-out lg:translate-x-0 border-r border-[#1e3a8a]",
        isActuallyCollapsed ? "lg:w-20" : "w-64",
        !isActuallyCollapsed && "lg:w-64",
        isOpen ? "translate-x-0" : "-translate-x-full"
      )}>
      <div className={cn("h-14 px-3 border-b border-white/10 flex items-center", isActuallyCollapsed ? "justify-center" : "justify-between")}>
        <div
          className={cn("flex items-center gap-3 min-w-0 select-none", isActuallyCollapsed && "lg:justify-center")}
          title="MSME Portal"
        >
          <div className="w-11 h-11 bg-white rounded-lg flex items-center justify-center overflow-hidden shadow-sm border border-white/10 p-1">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src="/msme-logo.png" alt="Logo" className="w-full h-full object-contain" />
          </div>
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
            href={item.path}
            onClick={onClose}
            title={isActuallyCollapsed ? item.label : undefined}
            className={cn(
              "flex items-center gap-3 rounded-md transition-all duration-200 group",
              isActuallyCollapsed ? "lg:justify-center lg:px-0 px-3 py-2.5 h-11" : "px-3 py-2.5",
              pathname === item.path
                ? "bg-white text-[#1d4ed8] shadow-sm"
                : "text-blue-50/80 hover:bg-white/10 hover:text-white"
            )}
          >
            <item.icon className={cn("h-4 w-4 shrink-0 transition-transform group-hover:scale-110", pathname === item.path ? "text-[#1d4ed8]" : "text-blue-100")} />
            <span className={cn("text-sm font-medium truncate", isActuallyCollapsed && "lg:hidden")}>{item.label}</span>
            {pathname === item.path && <ChevronRight className={cn("ml-auto h-3 w-3 opacity-60", isActuallyCollapsed && "lg:hidden")} />}
          </Link>
        ))}
      </nav>

      <div className={cn("border-t border-white/10 bg-[#1e3a8a]/40", isActuallyCollapsed ? "p-2" : "p-3")}>
        <Link 
          href={pathname === '/profile' ? '/dashboard' : '/profile'}
          onClick={onClose}
          className={cn(
            "flex items-center gap-3 px-2 mb-3 py-1.5 rounded-md hover:bg-white/10 transition-all duration-200", 
            isActuallyCollapsed && "lg:justify-center lg:px-0",
            pathname === '/profile' && "bg-white/10 ring-1 ring-white/30"
          )}
        >
          <div className="w-8 h-8 rounded-full bg-[#f9a825] flex items-center justify-center text-xs font-bold text-[#1d4ed8] shadow-inner">
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
          className={cn("w-full bg-red/300 border-white/20 text-white hover:bg-white hover:text-red-500 py-2", isActuallyCollapsed && "lg:px-0")}
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
  const { user, token: authToken } = useAuth();
  const pathname = usePathname();
  const router = useRouter();
  const [isNotificationsOpen, setIsNotificationsOpen] = useState(false);
  const notificationRef = useRef<HTMLDivElement>(null);
  const [notifications, setNotifications] = useState<PortalNotification[]>([]);

  useEffect(() => {
    const fetchNotifications = async () => {
      if (!authToken) return;
      try {
        const res = await api.fetch('/api/notifications', {
          headers: { Authorization: `Bearer ${authToken}` }
        });
        if (res.ok) {
          const data = await res.json();
          setNotifications(Array.isArray(data) ? data : []);
        }
      } catch (err) {
        console.error('Failed to fetch notifications:', err);
      }
    };
    fetchNotifications();
  }, [authToken]);

  useEffect(() => {
    if (!authToken) return;

    const rawBaseUrl = process.env.NEXT_PUBLIC_API_URL || '';
    const baseUrl = rawBaseUrl.replace(/\/$/, '');
    const streamUrl = `${baseUrl}/api/notifications/stream?token=${encodeURIComponent(authToken)}`;

    let eventSource: EventSource | null = null;
    let retryTimeout: NodeJS.Timeout | null = null;

    const connectStream = () => {
      try {
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

        eventSource.addEventListener('error', (err) => {
          console.warn('[SSE] EventSource connection error. Reconnecting...', err);
          if (eventSource) {
            eventSource.close();
            eventSource = null;
          }
          retryTimeout = setTimeout(connectStream, 5000);
        });
      } catch (err) {
        console.error('[SSE] Failed to initialize EventSource:', err);
        retryTimeout = setTimeout(connectStream, 5000);
      }
    };

    connectStream();

    return () => {
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

  const unreadCount = Array.isArray(notifications) ? notifications.filter(n => !n.isRead).length : 0;

  return (
    <header className="h-14 bg-white border-b border-slate-200 sticky top-0 z-40 transition-all duration-300">
      <div className="h-full px-4 flex items-center justify-between">
        <div className="flex items-center gap-4">
          <button 
            onClick={onMenuClick}
            className="p-2 -ml-2 text-slate-500 hover:text-[#1d4ed8] lg:hidden"
            aria-label="Open menu"
          >
            <Menu className="h-6 w-6" />
          </button>
          <button
            onClick={onSidebarToggle}
            className="hidden lg:flex p-2 -ml-2 text-slate-400 hover:text-[#1d4ed8] hover:bg-slate-50 rounded-lg transition-colors"
            title={isSidebarCollapsed ? "Expand sidebar" : "Collapse sidebar"}
          >
            {isSidebarCollapsed ? <PanelLeftOpen className="h-5 w-5" /> : <PanelLeftClose className="h-5 w-5" />}
          </button>
          
          {/* <div className="hidden md:flex relative group">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-400 group-focus-within:text-[#1d4ed8] transition-colors" />
            <input 
              type="text" 
              placeholder="Quick search..."
              className="w-64 h-9 pl-9 pr-4 rounded-lg border border-slate-200 text-sm focus:outline-none focus:ring-2 focus:ring-[#1d4ed8]/10 focus:border-[#1d4ed8] transition-all bg-slate-50/50"
            />
          </div> */}
        </div>

        <div className="flex items-center gap-2 sm:gap-4">
          <div className="relative" ref={notificationRef}>
            <button 
              onClick={() => setIsNotificationsOpen(!isNotificationsOpen)}
              className={cn(
                "p-2 rounded-lg transition-all relative",
                isNotificationsOpen ? "bg-slate-100 text-[#1d4ed8]" : "text-slate-500 hover:bg-slate-50 hover:text-[#1d4ed8]"
              )}
            >
              <Bell className="h-5 w-5" />
              {unreadCount > 0 && (
                <span className="absolute top-2 right-2 h-2 w-2 bg-red-500 rounded-full ring-2 ring-white" />
              )}
            </button>

            {isNotificationsOpen && (
              <div className="absolute right-0 mt-2 w-80 sm:w-96 bg-white rounded-xl shadow-2xl border border-slate-200 overflow-hidden animate-in fade-in zoom-in-95 duration-200">
                <div className="px-4 py-3 border-b border-slate-100 flex items-center justify-between bg-slate-50/50">
                  <h3 className="text-xs font-black uppercase tracking-widest text-[#1d4ed8]">Notifications</h3>
                  {unreadCount > 0 && (
                    <Badge variant="secondary" className="bg-white text-[#1d4ed8] border-slate-200 font-bold text-[10px]">
                      {unreadCount} NEW
                    </Badge>
                  )}
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
                          onClick={async () => {
                            if (!item.isRead && authToken) {
                              try {
                                await api.post(`/api/notifications/${item.id}/read`, {}, {
                                  headers: { Authorization: `Bearer ${authToken}` }
                                });
                                setNotifications(prev => prev.map(n => n.id === item.id ? { ...n, isRead: true } : n));
                              } catch (err) {
                                console.error('Failed to mark notification as read:', err);
                              }
                            }
                            const targetRoute = item.route || item.redirectUrl;
                            if (targetRoute) router.push(targetRoute);
                            setIsNotificationsOpen(false);
                          }}
                          className={cn(
                            "w-full p-4 text-left border-b border-slate-100 transition-all hover:bg-slate-50 group",
                            !item.isRead ? "bg-blue-50/30" : "opacity-75"
                          )}
                        >
                          <div className="flex items-start gap-3">
                            <div className={cn(
                              "mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-xl bg-white shadow-sm",
                              isWarning ? "text-red-500" : isSuccess ? "text-emerald-600" : "text-[#1d4ed8]"
                            )}>
                              <Icon className="h-4 w-4" />
                            </div>
                            <div className="min-w-0">
                              <p className={cn(
                                "text-[10px] font-black uppercase tracking-widest",
                                isWarning ? "text-red-600" : isSuccess ? "text-emerald-700" : "text-[#1d4ed8]"
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
                    className="w-full py-3 bg-slate-50 border-t border-slate-100 text-[10px] font-black uppercase tracking-widest text-slate-400 hover:text-[#1d4ed8] transition-colors"
                  >
                    View All Notifications
                  </button>
                )}
              </div>
            )}
          </div>

          <div className="h-8 w-px bg-slate-200 hidden sm:block" />

          <Link 
            href="/profile"
            className="flex items-center gap-3 p-1 rounded-lg hover:bg-slate-50 transition-colors group"
          >
            <div className="h-8 w-8 rounded-full bg-[#1d4ed8] flex items-center justify-center text-white font-bold text-sm shadow-sm ring-2 ring-white ring-offset-1 group-hover:ring-offset-2 transition-all">
              {user?.name?.charAt(0) || 'U'}
            </div>
            <div className="hidden sm:flex flex-col text-left">
              <span className="text-xs font-bold text-blue-900 truncate max-w-[100px]">{user?.name}</span>
              <span className="text-[9px] font-black text-[#1d4ed8] uppercase tracking-widest opacity-60">{user?.role}</span>
            </div>
          </Link>
        </div>
      </div>
    </header>
  );
}

const Badge = ({ children, className, variant }: any) => (
  <span className={cn(
    "px-2 py-0.5 rounded text-[10px] font-bold",
    variant === 'secondary' ? "bg-slate-100 text-slate-600" : "bg-blue-100 text-blue-600",
    className
  )}>
    {children}
  </span>
);
