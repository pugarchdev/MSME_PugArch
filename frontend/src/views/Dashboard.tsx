import { useEffect, useState, useCallback } from 'react';
import { api, unwrapApiData } from '../lib/api';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { useAuth } from '../hooks/useAuth';
import { Button } from '../components/ui/button';
import { Card, CardHeader, CardTitle, CardContent, Badge } from '../components/ui/card';
import { AlertTriangle, CheckCircle2, Clock, XCircle, FileText, ArrowRight, ShieldCheck, Bell, Info, ShoppingBag, MessageSquare, Gavel, Briefcase, Users, BarChart3, ClipboardCheck, FileSearch } from 'lucide-react';
import { cn } from '../lib/utils';
import { toast } from 'sonner';



export default function Dashboard() {
  const { user, token, logout, refreshUser } = useAuth();
  const authHeaders: Record<string, string> = token ? { Authorization: `Bearer ${token}` } : {};
  const cachedMe = token ? api.peek('/api/auth/me', { headers: authHeaders }) : null;
  const cachedNotifications = token ? api.peek('/api/notifications', { headers: authHeaders }) : null;
  const cachedAdminStats = token ? api.peek('/api/admin/reports/summary', { headers: authHeaders }) : null;
  const [profile, setProfile] = useState<any>(cachedMe?.profile || null);
  const [isLoading, setIsLoading] = useState(!cachedMe);
  const [adminStats, setAdminStats] = useState<any>(cachedAdminStats || null);
  const cachedNotificationItems = unwrapApiData<any[]>(cachedNotifications);
  const [notifications, setNotifications] = useState<any[]>(Array.isArray(cachedNotificationItems) ? cachedNotificationItems : []);
  const router = useRouter();

  const [gstInput, setGstInput] = useState('');
  const [isSubmittingGst, setIsSubmittingGst] = useState(false);
  const [errorMsg, setErrorMsg] = useState('');

  const fetchData = useCallback(async () => {
    if (!token) {
      setIsLoading(false);
      router.replace('/');
      return;
    }

    const headers = { Authorization: `Bearer ${token}` };

    // Fire all three requests in parallel rather than sequentially. The
    // sequential version was costing 3x the latency of the slowest one - on a
    // cold Neon serverless DB that's the difference between 9s and 3s.
    const profilePromise = api.fetch('/api/auth/me', { headers })
      .then(async res => ({ res, data: res.ok ? await res.json() : null }))
      .catch(() => ({ res: null as any, data: null as any }));

    const notifPromise = api.fetch('/api/notifications', { headers })
      .then(async res => (res.ok ? unwrapApiData<any[]>(await res.json()) : null))
      .catch(() => null);

    // Admin stats are only useful for admins. We don't know the role until
    // /api/auth/me returns, so we kick off this request only after we have
    // confirmation. To keep latency low we still don't block the dashboard
    // render on it - it fills in when ready.
    const adminStatsPromise = (user?.role === 'admin')
      ? api.fetch('/api/admin/reports/summary', { headers })
        .then(async res => (res.ok ? await res.json() : null))
        .catch(() => null)
      : Promise.resolve(null);

    try {
      const [{ res: profileRes, data: profileData }, notifItems, statsData] = await Promise.all([
        profilePromise,
        notifPromise,
        adminStatsPromise
      ]);

      if (profileRes && profileRes.status === 401) {
        logout();
        router.replace('/');
        return;
      }
      if (profileData) setProfile(profileData.profile);
      if (Array.isArray(notifItems)) setNotifications(notifItems);
      if (statsData) setAdminStats(statsData?.data ?? statsData);
    } catch {
      // Errors on individual fetches are already handled above; this only
      // catches Promise.all's own rare failure modes.
    } finally {
      setIsLoading(false);
    }
  }, [token, router, logout, user?.role]);

  const hasGst = user?.role === 'seller'
    ? (user?.sellerProfile?.offices?.some((o: any) => o.gstNumber) || profile?.sellerProfile?.offices?.some((o: any) => o.gstNumber) || profile?.offices?.some((o: any) => o.gstNumber))
    : (!!user?.buyerProfile?.gst || !!profile?.buyerProfile?.gst || !!profile?.gst);

  const handleGstSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!gstInput || gstInput.trim().length !== 15) {
      toast.error("Please enter a valid 15-digit GSTIN.");
      return;
    }
    setIsSubmittingGst(true);
    setErrorMsg("");
    try {
      const res = await api.fetch('/api/profile/verify-gst-dashboard', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`
        },
        body: JSON.stringify({ gstin: gstInput.trim().toUpperCase() })
      });
      if (!res.ok) {
        const errorData = await res.json().catch(() => ({}));
        throw new Error(errorData.message || "Failed to verify GSTIN.");
      }
      toast.success("GSTIN verified and saved successfully!");
      await refreshUser();
      await fetchData();
    } catch (err: any) {
      setErrorMsg(err.message || "Something went wrong.");
      toast.error(err.message || "Verification failed.");
    } finally {
      setIsSubmittingGst(false);
    }
  };

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  useEffect(() => {
    if (!token) return;
    const refreshNotifications = async () => {
      try {
        const res = await api.fetch('/api/notifications', {
          headers: { Authorization: `Bearer ${token}` },
        });
        if (res.ok) {
          const data = await res.json();
          const items = unwrapApiData<any[]>(data);
          setNotifications(Array.isArray(items) ? items : []);
        }
      } catch {
        setNotifications([]);
      }
    };
    window.addEventListener('notifications:updated', refreshNotifications);
    return () => window.removeEventListener('notifications:updated', refreshNotifications);
  }, [token]);

  if (isLoading) return <div className="flex h-screen items-center justify-center px-4 text-center font-black text-[#12335f] animate-pulse text-xl">Loading JsgSmile Portal - Jharsuguda Synergy for MSME and Industry Linkage Ecosystem...</div>;

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
        path: '/admin/governance',
        tone: 'bg-emerald-50 text-emerald-700'
      },
      {
        label: 'Active Buyers',
        value: adminStats?.activeBuyers ?? 0,
        helper: 'Buyer departments enabled',
        icon: ClipboardCheck,
        path: '/admin/governance',
        tone: 'bg-slate-50 text-[#12335f]'
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
        title: 'Governance Desk',
        detail: 'Monitor procurement readiness, compliance exceptions, review queues, and approved stakeholder capacity.',
        path: '/admin/governance',
        icon: ClipboardCheck
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
            <Link href="/admin/governance">
              <Button variant="outline" className="h-10 rounded-md border-slate-200 px-4 text-xs font-bold uppercase tracking-wide">
                Governance Desk
              </Button>
            </Link>
            <Link href="/admin/onboarding">
              <Button className="bg-[#12335f] hover:bg-[#0b2445] text-white h-10 px-4 rounded-md space-x-2 font-bold uppercase tracking-wide text-xs">
                <ShieldCheck className="h-4 w-4" />
                <span>Review Submissions</span>
              </Button>
            </Link>
          </div>
        </div>

        <div className="grid grid-cols-2 gap-3 xl:grid-cols-4">
          {adminTiles.map(stat => (
            <Link key={stat.label} href={stat.path} className="bg-white p-3 sm:p-4 rounded-lg border border-slate-200 shadow-sm transition-all hover:shadow-md hover:border-[#12335f]/40 focus:outline-none focus:ring-2 focus:ring-[#12335f]">
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
                  href={module.path}
                  className="rounded-lg border border-slate-200 bg-slate-50 p-4 transition-all hover:border-[#12335f]/40 hover:bg-white hover:shadow-sm focus:outline-none focus:ring-2 focus:ring-[#12335f]"
                >
                  <div className="flex items-start gap-3">
                    <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-md bg-white text-[#12335f] shadow-sm">
                      <module.icon className="h-5 w-5" />
                    </div>
                    <div>
                      <h3 className="text-sm font-black uppercase tracking-wide text-slate-900">{module.title}</h3>
                      <p className="mt-1 text-xs font-semibold leading-relaxed text-slate-500">{module.detail}</p>
                      <span className="mt-3 inline-flex text-[10px] font-black uppercase tracking-widest text-[#12335f]">Open Module</span>
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
            <Link href="/admin/governance" className="mt-5 inline-flex text-xs font-black uppercase tracking-wide text-white underline">
              Open governance desk
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




      <div className="grid grid-cols-1 lg:grid-cols-3 gap-5">
        {/* Onboarding Status Tracker */}
        <div className="lg:col-span-2 space-y-5">
          {!hasGst && (
            <Card className="rounded-xl border border-slate-200 shadow-sm overflow-hidden bg-gradient-to-br from-slate-700 to-slate-900 text-white relative">
              <div className="absolute top-0 right-0 p-8 opacity-10 pointer-events-none">
                <ShieldCheck className="h-28 w-28 text-white" />
              </div>
              <CardContent className="p-6">
                <div className="space-y-4">
                  <div>
                    <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-bold bg-indigo-500/20 text-indigo-300 border border-indigo-400/20 mb-3 uppercase tracking-wider">
                      <Briefcase className="h-3.5 w-3.5" /> Fast-Track Procurement
                    </span>
                    <h3 className="text-lg sm:text-xl font-extrabold uppercase tracking-tight text-slate-100">
                      Add & Verify Business GSTIN
                    </h3>
                    <p className="text-xs sm:text-sm font-medium text-slate-300 leading-relaxed max-w-xl mt-1">
                      Boost your MSME trust quotient. Instantly verify your business details to auto-approve key sections and fast-track your onboarding to approved procurement status.
                    </p>
                  </div>

                  <form onSubmit={handleGstSubmit} className="space-y-3 max-w-md">
                    <div className="flex flex-col sm:flex-row gap-2">
                      <div className="relative flex-1">
                        <input
                          type="text"
                          placeholder="Enter 15-digit GSTIN (e.g. 27AAAAA1111A1Z1)"
                          value={gstInput}
                          onChange={(e) => setGstInput(e.target.value.toUpperCase())}
                          maxLength={15}
                          className="w-full h-10 px-3 bg-white/10 border border-white/20 rounded text-xs font-bold text-white placeholder-slate-300 focus:outline-none focus:ring-2 focus:ring-white uppercase tracking-widest"
                          disabled={isSubmittingGst}
                        />
                      </div>
                      <Button
                        type="submit"
                        disabled={isSubmittingGst || gstInput.length !== 15}
                        className="h-10 bg-white hover:bg-slate-100 text-slate-900 rounded px-5 text-xs font-bold uppercase tracking-wider transition-all"
                      >
                        {isSubmittingGst ? 'Verifying...' : 'Verify & Save'}
                      </Button>
                    </div>
                    {errorMsg && (
                      <p className="text-xs font-semibold text-red-400 bg-red-500/10 px-3 py-1.5 rounded border border-red-500/20">
                        {errorMsg}
                      </p>
                    )}
                  </form>

                  <div className="flex flex-wrap items-center gap-x-6 gap-y-2 pt-2 border-t border-slate-800 text-[11px] font-semibold text-slate-400">
                    <span className="flex items-center gap-1">
                      <CheckCircle2 className="h-3.5 w-3.5 text-emerald-400" /> Auto-approve Offices
                    </span>
                    <span className="flex items-center gap-1">
                      <CheckCircle2 className="h-3.5 w-3.5 text-emerald-400" /> Direct Procurement Live
                    </span>
                    <span className="flex items-center gap-1">
                      <CheckCircle2 className="h-3.5 w-3.5 text-emerald-400" /> AES-256 Encryption
                    </span>
                  </div>
                </div>
              </CardContent>
            </Card>
          )}

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
                  <div className="absolute inset-0 bg-slate-50 rounded-full animate-pulse opacity-50" />
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
                  <Button
                    onClick={() => router.push(user?.role === 'seller' ? '/seller/onboarding' : '/buyer/onboarding')}
                    className="bg-[#12335f] hover:bg-[#0b2445] text-white rounded-md h-10 px-5 font-bold uppercase text-xs tracking-wide transition-all"
                  >
                    {user?.onboardingStatus === 'approved_for_procurement' ? 'View Full Profile' : 'Complete Profile'}
                    <ArrowRight className="ml-2 h-4 w-4" />
                  </Button>
                </div>
              </div>
            </CardContent>
          </Card>

          {/* Quick Actions / Info */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div className="bg-white p-4 rounded-lg border border-slate-200 shadow-sm space-y-3">
              <div className="h-9 w-9 rounded-md bg-slate-50 text-[#12335f] flex items-center justify-center">
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
          </div>
        </div>

        {/* Notification Panel */}
        <div className="space-y-6">
          <div className="flex items-center justify-between px-2">
            <h3 className="text-xs font-black uppercase text-slate-400 tracking-widest  flex items-center gap-2">
              <Bell className="h-4 w-4" />
              Notifications
            </h3>
            {(sectionMessages.length > 0 || (Array.isArray(notifications) && notifications.some(n => !n.isRead))) && (
              <span className="flex h-2 w-2 rounded-full bg-red-500 animate-ping" />
            )}
          </div>

          <div className="space-y-4">
            {/* Dynamic Notifications */}
            {Array.isArray(notifications) && notifications.map((notif) => (
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
                    notif.type === 'quote_request' ? "bg-slate-100 text-[#12335f]" : "bg-blue-100 text-[#12335f]"
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
                <button
                  key={section}
                  onClick={() => router.push(user?.role === 'seller' ? '/seller/onboarding' : '/buyer/onboarding')}
                  className="block w-full text-left bg-red-50 border border-red-100 p-4 sm:p-6 rounded-3xl space-y-3 transition-all hover:shadow-md group animate-in slide-in-from-right-4 duration-500"
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
                </button>
              ))
            )}

            {(!Array.isArray(notifications) || notifications.length === 0) && sectionMessages.length === 0 && !user?.adminFeedback && (
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
