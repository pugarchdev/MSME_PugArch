import { useEffect, useState } from 'react';
import { api } from '../lib/api';
import { useNavigate, Link } from 'react-router-dom';
import { useAuth } from '../hooks/useAuth';
import { Button } from '../components/ui/button';
import { Card, CardHeader, CardTitle, CardContent, Badge } from '../components/ui/card';
import { AlertTriangle, CheckCircle2, Clock, XCircle, FileText, ArrowRight, ShieldCheck, Bell, Info, ShoppingBag, MessageSquare, Gavel, Briefcase, Users, BarChart3, ClipboardCheck, FileSearch } from 'lucide-react';
import { cn } from '../lib/utils';
import { toast } from 'sonner';

import ParcelTracking from './ParcelTracking';

export default function Dashboard() {
  const { user, token, logout } = useAuth();
  const authHeaders = token ? { Authorization: `Bearer ${token}` } : {};
  const cachedMe = token ? api.peek('/api/auth/me', { headers: authHeaders }) : null;
  const cachedNotifications = token ? api.peek('/api/notifications', { headers: authHeaders }) : null;
  const cachedAdminStats = token ? api.peek('/api/admin/stats', { headers: authHeaders }) : null;
  const [profile, setProfile] = useState<any>(cachedMe?.profile || null);
  const [isLoading, setIsLoading] = useState(!cachedMe);
  const [adminStats, setAdminStats] = useState<any>(cachedAdminStats || null);
  const [notifications, setNotifications] = useState<any[]>(cachedNotifications || []);
  const navigate = useNavigate();

  useEffect(() => {
    const fetchData = async () => {
      if (!token) {
        setIsLoading(false);
        navigate('/', { replace: true });
        return;
      }

      try {
        const headers = { Authorization: `Bearer ${token}` };
        const profileRes = await api.fetch('/api/auth/me', { headers });
        if (profileRes.status === 401) {
          logout();
          navigate('/', { replace: true });
          return;
        }

        const profileData = await profileRes.json();
        setProfile(profileData.profile);

        if (profileData.user?.role === 'admin') {
          const statsRes = await api.fetch('/api/admin/stats', { headers });
          if (statsRes.ok) {
            const statsData = await statsRes.json();
            setAdminStats(statsData);
          }
        }

        // Fetch Notifications
        const notifRes = await api.fetch('/api/notifications', { headers });
        if (notifRes.ok) {
          const notifData = await notifRes.json();
          setNotifications(notifData);
        }
      } catch (err) {
        console.error(err);
      } finally {
        setIsLoading(false);
      }
    };
    fetchData();
  }, [token, navigate, logout]);

  useEffect(() => {
    if (!token) return;
    const refreshNotifications = async () => {
      try {
        const res = await api.fetch('/api/notifications', {
          headers: { Authorization: `Bearer ${token}` },
          skipCache: true
        });
        if (res.ok) setNotifications(await res.json());
      } catch (err) {
        console.error('[Notifications] Dashboard refresh failed:', err);
      }
    };
    window.addEventListener('notifications:updated', refreshNotifications);
    return () => window.removeEventListener('notifications:updated', refreshNotifications);
  }, [token]);

  if (isLoading) return <div className="flex h-screen items-center justify-center font-black  text-blue-600 animate-pulse text-xl">Loading MSME Portal...</div>;

  const getStatusIcon = (status: string) => {
    switch (status) {
      case 'approved_for_procurement': return <CheckCircle2 className="h-10 w-10 text-emerald-500" />;
      case 'rejected': return <XCircle className="h-10 w-10 text-red-500" />;
      case 'under_compliance_review': return <Clock className="h-10 w-10 text-amber-500" />;
      case 'resubmission_required': return <AlertTriangle className="h-10 w-10 text-amber-500" />;
      default: return <Clock className="h-10 w-10 text-blue-500" />;
    }
  };

  const getStatusLabel = (status: string) => {
    return status.split('_').map(w => w.charAt(0).toUpperCase() + w.slice(1)).join(' ');
  };

  if (user?.role === 'admin') {
    const adminTiles = [
      {
        label: 'Pending Approval',
        value: adminStats?.pendingApproval ?? 0,
        helper: 'Applications waiting for review',
        icon: FileSearch,
        path: '/admin/onboarding',
        tone: 'bg-amber-50 text-amber-700'
      },
      {
        label: 'Active Sellers',
        value: adminStats?.activeSellers ?? 0,
        helper: 'Approved suppliers in the network',
        icon: Users,
        path: '/admin/procurement',
        tone: 'bg-emerald-50 text-emerald-700'
      },
      {
        label: 'Active Buyers',
        value: adminStats?.activeBuyers ?? 0,
        helper: 'Buyer departments enabled',
        icon: ClipboardCheck,
        path: '/admin/procurement',
        tone: 'bg-blue-50 text-[#12335f]'
      },
      {
        label: 'Total Network',
        value: adminStats?.totalNetwork ?? 0,
        helper: 'Stakeholders registered',
        icon: BarChart3,
        path: '/admin/reports',
        tone: 'bg-slate-100 text-slate-700'
      }
    ];

    const adminModules = [
      {
        title: 'Procurement Desk',
        detail: 'Monitor active buyer and seller readiness, supplier pool size, and access requests.',
        path: '/admin/procurement',
        icon: ClipboardCheck
      },
      {
        title: 'Compliance Desk',
        detail: 'Review KYC, PAN, GST, document status, resubmissions, and rejected records.',
        path: '/admin/compliance',
        icon: ShieldCheck
      },
      {
        title: 'Onboarding Console',
        detail: 'Approve, reject, request section changes, and send administrator feedback.',
        path: '/admin/onboarding',
        icon: FileSearch
      },
      {
        title: 'MIS Reports',
        detail: 'Export filtered records and review overall stakeholder network health.',
        path: '/admin/reports',
        icon: BarChart3
      }
    ];

    return (
      <div className="space-y-5 animate-in fade-in duration-500">
        <div className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
          <div>
            <p className="text-[10px] font-black uppercase tracking-[0.18em] text-slate-400">Government Procurement Administration</p>
            <h1 className="text-2xl font-extrabold text-[#12335f] uppercase tracking-tight">Admin Control Center</h1>
            <p className="text-sm text-slate-500 font-medium">Manage approvals, compliance review, stakeholder access, and MIS reporting.</p>
          </div>
          <div className="flex flex-wrap gap-2">
            <Link to="/admin/procurement">
              <Button variant="outline" className="h-10 rounded-md border-slate-200 px-4 text-xs font-bold uppercase tracking-wide">
                Procurement Desk
              </Button>
            </Link>
            <Link to="/admin/onboarding">
              <Button className="bg-[#12335f] hover:bg-[#0b2445] text-white h-10 px-4 rounded-md space-x-2 font-bold uppercase tracking-wide text-xs">
                <ShieldCheck className="h-4 w-4" />
                <span>Review Submissions</span>
              </Button>
            </Link>
          </div>
        </div>

        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-4">
          {adminTiles.map(stat => (
            <Link key={stat.label} to={stat.path} className="bg-white p-4 rounded-lg border border-slate-200 shadow-sm transition-all hover:shadow-md hover:border-[#12335f]/40 focus:outline-none focus:ring-2 focus:ring-[#12335f]">
              <div className="flex items-start justify-between gap-3">
                <div>
                  <div className="text-slate-500 text-[10px] font-bold uppercase tracking-widest mb-1">{stat.label}</div>
                  <div className="text-3xl font-extrabold tracking-tight text-slate-900">{stat.value ?? '0'}</div>
                  <p className="mt-1 text-xs font-semibold text-slate-500">{stat.helper}</p>
                </div>
                <div className={cn('flex h-10 w-10 shrink-0 items-center justify-center rounded-md', stat.tone)}>
                  <stat.icon className="h-5 w-5" />
                </div>
              </div>
            </Link>
          ))}
        </div>

        <div className="grid gap-4 xl:grid-cols-[1.35fr_0.65fr]">
          <section className="rounded-lg border border-slate-200 bg-white shadow-sm">
            <div className="border-b border-slate-200 px-4 py-3">
              <h2 className="text-sm font-black uppercase tracking-wide text-slate-900">Admin Work Areas</h2>
              <p className="text-xs font-medium text-slate-500">Operational pages added to the sidebar for procurement portal control.</p>
            </div>
            <div className="grid gap-3 p-4 md:grid-cols-2">
              {adminModules.map(module => (
                <Link
                  key={module.title}
                  to={module.path}
                  className="rounded-lg border border-slate-200 bg-slate-50 p-4 transition-all hover:border-[#12335f]/40 hover:bg-white hover:shadow-sm focus:outline-none focus:ring-2 focus:ring-[#12335f]"
                >
                  <div className="flex items-start gap-3">
                    <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-md bg-white text-[#12335f] shadow-sm">
                      <module.icon className="h-5 w-5" />
                    </div>
                    <div>
                      <h3 className="text-sm font-black uppercase tracking-wide text-slate-900">{module.title}</h3>
                      <p className="mt-1 text-xs font-semibold leading-relaxed text-slate-500">{module.detail}</p>
                      <span className="mt-3 inline-flex text-[10px] font-black uppercase tracking-widest text-blue-700">Open Module</span>
                    </div>
                  </div>
                </Link>
              ))}
            </div>
          </section>

          <aside className="rounded-lg border border-slate-200 bg-[#12335f] p-5 text-white shadow-sm">
            <div className="flex h-12 w-12 items-center justify-center rounded-md bg-white/10">
              <ShieldCheck className="h-6 w-6" />
            </div>
            <h2 className="mt-4 text-lg font-black uppercase">Daily review checklist</h2>
            <div className="mt-4 space-y-3">
              {[
                'Clear pending stakeholder approvals',
                'Check resubmissions with remarks',
                'Export MIS report for audit trail',
                'Verify approved seller capacity'
              ].map(item => (
                <div key={item} className="flex items-start gap-2 text-xs font-semibold text-blue-50">
                  <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0 text-emerald-300" />
                  <span>{item}</span>
                </div>
              ))}
            </div>
            <Link to="/admin/compliance" className="mt-5 inline-flex text-xs font-black uppercase tracking-wide text-white underline">
              Open compliance desk
            </Link>
          </aside>
        </div>
      </div>
    );
  }

  const sectionMessages = Object.entries(user?.sectionRejectionReasons || {}).filter(([section, reason]) => {
    const status = user?.sectionStatus?.[section as keyof typeof user.sectionStatus];
    return reason && ['rejected', 'resubmission_required'].includes(status || '');
  });

  return (
    <div className="space-y-5 animate-in fade-in duration-500 max-w-6xl mx-auto pb-10">
      <div className="flex flex-col md:flex-row md:justify-between md:items-center gap-4 border-b border-slate-200 pb-4">
        <div>
          <p className="text-[10px] font-bold text-[#12335f] uppercase tracking-[0.18em] mb-1">MSME Procurement Portal</p>
          <h1 className="text-2xl sm:text-3xl font-extrabold text-[#12335f] uppercase tracking-tight">Dashboard</h1>
        </div>
        <button
          type="button"
          onClick={() => navigate('/profile')}
          className="flex items-center gap-3 bg-white p-2 rounded-lg border border-slate-200 shadow-sm text-left hover:border-[#12335f]/40 focus:outline-none focus:ring-2 focus:ring-[#12335f]"
        >
           <div className="h-10 w-10 rounded-md bg-[#12335f] flex items-center justify-center text-white font-black text-base">
             {user?.name?.charAt(0)}
           </div>
           <div className="pr-3">
             <p className="text-xs font-bold text-slate-900 uppercase">{user?.name}</p>
             <div className="flex flex-col gap-0.5 mt-0.5">
                <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">{user?.role} Tier Account</p>
                <p className="text-[10px] font-bold text-[#12335f] uppercase tracking-widest">
                  ID: {user?.registrationDetails?.userId || `MSME-${user?.role?.charAt(0).toUpperCase()}-${String(user?.id).padStart(5, '0')}`}
                </p>
             </div>
           </div>
        </button>
      </div>
      
      {/* Procurement Method Selection - Only for Approved Buyers */}
      {user?.role === 'buyer' && user?.onboardingStatus === 'approved_for_procurement' && (
        <div className="space-y-4 animate-in slide-in-from-top-4 duration-700">
           <div className="bg-[#12335f] px-4 py-2.5 rounded-lg shadow-sm flex items-center justify-between">
              <h2 className="text-white text-xs font-bold uppercase tracking-[0.2em]">Procurement Method Selection</h2>
              <Badge className="bg-white/15 text-white border-none rounded px-3 py-1 font-bold text-[9px]">OFFICIAL CHANNELS</Badge>
           </div>
           
           <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
              {[
                { label: 'Direct Purchase', icon: ShoppingBag, color: 'bg-blue-50 text-blue-600', hover: 'hover:bg-blue-100', path: '/buyer/vendors' },
                { label: 'Request for Quotation (RFQ)', icon: MessageSquare, color: 'bg-slate-50 text-[#12335f]', hover: 'hover:bg-slate-100', path: '/quotations' },
                { label: 'Tender Management', icon: FileText, color: 'bg-emerald-50 text-emerald-600', hover: 'hover:bg-emerald-100', path: '/buyer/tenders' },
                { label: 'Reverse Auction', icon: Gavel, color: 'bg-amber-50 text-amber-700', hover: 'hover:bg-amber-100', path: '/buyer/tenders' },
                { label: 'Service Procurement', icon: Briefcase, color: 'bg-orange-50 text-orange-700', hover: 'hover:bg-orange-100', path: '/buyer/vendors' }
              ].map((method) => (
                <Link 
                  key={method.label} 
                  to={method.path}
                  className={cn(
                    "flex flex-col items-center justify-center p-4 rounded-lg border border-slate-200 bg-white transition-all duration-300 hover:shadow-md group focus:outline-none focus:ring-2 focus:ring-[#12335f]",
                    method.hover
                  )}
                >
                   <div className={cn("h-11 w-11 rounded-md flex items-center justify-center mb-3 transition-transform group-hover:scale-105", method.color)}>
                      <method.icon className="h-5 w-5" />
                   </div>
                   <p className="text-[10px] font-bold text-slate-900 uppercase text-center leading-tight px-2">{method.label}</p>
                </Link>
              ))}
           </div>

           {/* Parcel Tracking Section */}
           <div className="mt-8">
              <ParcelTracking />
           </div>
        </div>
      )}

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-5">
        {/* Onboarding Status Tracker */}
        <div className="lg:col-span-2 space-y-5">
          <Card className="rounded-lg border-slate-200 shadow-sm overflow-hidden bg-white">
            <div className="bg-slate-50 border-b border-slate-200 px-4 py-3 flex items-center justify-between">
               <h3 className="text-sm font-bold uppercase text-slate-900 tracking-tight flex items-center gap-2">
                 <ShieldCheck className="h-5 w-5 text-[#12335f]" />
                 Verification Status Tracker
               </h3>
               <Badge className="bg-white text-[#12335f] border border-slate-200 px-3 py-1 rounded text-[10px] font-bold uppercase">
                 Live Monitoring
               </Badge>
            </div>
            <CardContent className="p-5">
               <div className="flex flex-col md:flex-row items-center gap-5">
                  <div className="relative h-24 w-24 shrink-0">
                    <div className="absolute inset-0 bg-blue-50 rounded-full animate-pulse opacity-50" />
                    <div className="absolute inset-0 flex items-center justify-center">
                       {getStatusIcon(user?.onboardingStatus || 'pending')}
                    </div>
                  </div>
                  <div className="space-y-3 text-center md:text-left">
                     <div>
                        <h4 className="text-xl font-extrabold text-slate-900 uppercase tracking-tight">
                          {getStatusLabel(user?.onboardingStatus || 'pending')}
                        </h4>
                        <p className="text-slate-500 font-medium text-sm mt-1">
                          {user?.onboardingStatus === 'approved_for_procurement' 
                            ? "Your profile is fully verified. You can now participate in all procurement activities."
                            : "Your profile is currently being reviewed by the MSME compliance department."}
                        </p>
                     </div>
                     <Link to={user?.role === 'seller' ? '/seller/onboarding' : '/buyer/onboarding'}>
                       <Button className="bg-[#12335f] hover:bg-[#0b2445] text-white rounded-md h-10 px-5 font-bold uppercase text-xs tracking-wide transition-all">
                          {user?.onboardingStatus === 'approved_for_procurement' ? 'View Full Profile' : 'Complete Profile'}
                          <ArrowRight className="ml-2 h-4 w-4" />
                       </Button>
                     </Link>
                  </div>
               </div>
            </CardContent>
          </Card>

          {/* Quick Actions / Info */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
             <div className="bg-white p-4 rounded-lg border border-slate-200 shadow-sm space-y-3">
                <div className="h-9 w-9 rounded-md bg-blue-50 text-blue-600 flex items-center justify-center">
                   <Info className="h-5 w-5" />
                </div>
                <h5 className="font-bold text-slate-900 uppercase text-sm">Need Help?</h5>
                <p className="text-xs font-medium text-slate-500 leading-relaxed">Our support team is available to help you with the onboarding process.</p>
                <Button
                  variant="ghost"
                  onClick={() => toast.info('Support desk request noted. Please email support@msme-portal.gov.in for urgent help.')}
                  className="text-[#12335f] font-bold uppercase text-[10px] p-0 h-auto hover:bg-transparent"
                >
                  Contact Support
                </Button>
             </div>
             {/* <button
                type="button"
                onClick={() => navigate(user?.role === 'seller' ? '/seller/onboarding' : '/buyer/onboarding')}
                className="bg-[#12335f] p-4 rounded-lg shadow-sm space-y-3 text-white overflow-hidden relative text-left hover:bg-[#0b2445] focus:outline-none focus:ring-2 focus:ring-[#f9a825]"
              >
                <div className="absolute top-0 right-0 p-6 opacity-10">
                   <ShieldCheck className="h-20 w-20" />
                </div>
                <h5 className="font-bold uppercase text-sm">Trust & Security</h5>
                <p className="text-xs font-medium text-blue-100/80 leading-relaxed">Your data is encrypted and stored in compliance with MSME data sovereignty rules.</p>
                <Badge className="bg-white/10 text-white border-none rounded px-3 py-1 font-bold text-[9px]">AES-256 SECURED</Badge>
             </button> */}
          </div>
        </div>

        {/* Notification Panel */}
        <div className="space-y-6">
           <div className="flex items-center justify-between px-2">
              <h3 className="text-xs font-black uppercase text-slate-400 tracking-widest  flex items-center gap-2">
                 <Bell className="h-4 w-4" />
                 Notifications
              </h3>
              {(sectionMessages.length > 0 || notifications.some(n => !n.isRead)) && (
                <span className="flex h-2 w-2 rounded-full bg-red-500 animate-ping" />
              )}
           </div>

           <div className="space-y-4">
              {/* Dynamic Notifications */}
              {notifications.map((notif) => (
                <div 
                  key={notif.id} 
                  className={cn(
                    "p-5 rounded-[2rem] border transition-all duration-300 animate-in slide-in-from-right-4",
                    notif.isRead 
                      ? "bg-white border-slate-100 opacity-60" 
                      : "bg-indigo-50/50 border-indigo-100 shadow-sm"
                  )}
                >
                   <div className="flex items-center gap-3 mb-2">
                      <div className={cn(
                        "h-8 w-8 rounded-xl flex items-center justify-center",
                        notif.type === 'quote_request' ? "bg-slate-100 text-[#12335f]" : "bg-blue-100 text-blue-700"
                      )}>
                         {notif.type === 'quote_request' ? <FileText className="h-4 w-4" /> : <Bell className="h-4 w-4" />}
                      </div>
                      <p className="text-[10px] font-black uppercase tracking-widest text-slate-400">{notif.title}</p>
                   </div>
                   <p className="text-xs font-bold text-slate-800  leading-relaxed">{notif.message}</p>
                   <p className="text-[9px] font-black text-slate-400 uppercase mt-3 ">{new Date(notif.createdAt).toLocaleString()}</p>
                </div>
              ))}

              {user?.adminFeedback && (
                <div className="bg-amber-50 border border-amber-100 p-6 rounded-3xl space-y-3 animate-in slide-in-from-right-4 duration-500">
                   <div className="flex items-center gap-2">
                      <Clock className="h-4 w-4 text-amber-600" />
                      <p className="text-[10px] font-black text-amber-600 uppercase tracking-widest">Admin Remark</p>
                   </div>
                   <p className="text-sm font-semibold text-amber-900  leading-relaxed">"{user.adminFeedback}"</p>
                </div>
              )}

              {sectionMessages.length > 0 && (
                sectionMessages.map(([section, reason]) => (
                  <Link 
                    key={section} 
                    to={user?.role === 'seller' ? '/seller/onboarding' : '/buyer/onboarding'}
                    className="block bg-red-50 border border-red-100 p-4 sm:p-6 rounded-3xl space-y-3 transition-all hover:shadow-md group animate-in slide-in-from-right-4 duration-500"
                  >
                     <div className="flex items-center justify-between">
                        <div className="flex items-center gap-2">
                           <AlertTriangle className="h-4 w-4 text-red-500" />
                           <p className="text-[10px] font-black text-red-600 uppercase tracking-widest">Rejection Alert</p>
                        </div>
                        <ArrowRight className="h-4 w-4 text-red-300 group-hover:translate-x-1 transition-transform" />
                     </div>
                     <p className="text-[11px] font-black text-slate-900 uppercase ">Section: {section}</p>
                     <p className="text-sm font-semibold text-red-900  leading-relaxed">"{reason}"</p>
                  </Link>
                ))
              )}

              {notifications.length === 0 && sectionMessages.length === 0 && !user?.adminFeedback && (
                <div className="bg-white border border-slate-100 p-12 rounded-3xl text-center space-y-3  opacity-60">
                   <Bell className="h-8 w-8 text-slate-300 mx-auto" />
                   <p className="text-xs font-bold text-slate-400 uppercase tracking-widest">No New Notifications</p>
                </div>
              )}
           </div>
        </div>
      </div>
    </div>
  );
}
