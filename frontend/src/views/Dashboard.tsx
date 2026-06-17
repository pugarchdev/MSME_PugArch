import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { api, unwrapApiData } from '../lib/api';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { useAuth } from '../hooks/useAuth';
import { Button } from '../components/ui/button';
import { Card, CardHeader, CardTitle, CardContent, Badge } from '../components/ui/card';
import { AlertTriangle, CheckCircle2, Clock, XCircle, FileText, ArrowRight, ShieldCheck, Bell, Info, ShoppingBag, MessageSquare, Gavel, Briefcase, Users, BarChart3, ClipboardCheck, FileSearch, Loader2, Images, Trophy, Package, Wrench } from 'lucide-react';
import { cn } from '../lib/utils';
import { toast } from 'sonner';
import { validators } from '../lib/validators';
import RoleAwareActionCards from '../features/dashboard/components/RoleAwareActionCards';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { bannerApi } from '../features/banners/api';
import { marketplaceApi } from '../features/marketplace/api';
import { resolveMarketplaceImage } from '../features/marketplace/utils/marketplaceImages';
import { AIInsightBox } from '../features/dashboard/components/AIInsightBox';

const ADMIN_REVIEW_CHECKLIST = [
  'Clear pending stakeholder approvals',
  'Check resubmissions with remarks',
  'Export MIS report for audit trail',
  'Verify approved seller capacity'
] as const;

type AdminTile = {
  label: string;
  value: number;
  helper: string;
  icon: React.ComponentType<{ className?: string }>;
  path: string;
  tone: string;
};

type AdminModule = {
  title: string;
  detail: string;
  path: string;
  icon: React.ComponentType<{ className?: string }>;
};

const formatBannerDate = (value?: string | null) => {
  if (!value) return 'No expiry set';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return 'No expiry set';
  return date.toLocaleDateString(undefined, { day: '2-digit', month: 'short', year: 'numeric' });
};

const readableBannerStatus = (value?: string | null) =>
  String(value || 'No upload yet').replace(/_/g, ' ').toLowerCase().replace(/\b\w/g, char => char.toUpperCase());

const PromotionEligibilityCard = React.memo(function PromotionEligibilityCard({
  eligibility,
  isLoading
}: {
  eligibility: any;
  isLoading: boolean;
}) {
  if (isLoading || !eligibility?.eligible) return null;

  const latestEligibility = Array.isArray(eligibility.eligibility) ? eligibility.eligibility[0] : null;
  const latestBanner = Array.isArray(eligibility.banners) ? eligibility.banners[0] : null;
  const eligibilityType = readableBannerStatus(latestEligibility?.eligibilityType || 'Promotion');
  const expiry = formatBannerDate(latestEligibility?.expiresAt);
  const recentStatus = readableBannerStatus(latestBanner?.status);

  return (
    <Card className="overflow-hidden rounded-lg border-emerald-200 bg-gradient-to-br from-emerald-50 via-white to-blue-50 shadow-sm">
      <CardContent className="p-4">
        <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
          <div className="flex gap-3">
            <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-md bg-emerald-600 text-white shadow-sm">
              <Trophy className="h-5 w-5" />
            </div>
            <div>
              <p className="text-[10px] font-black uppercase tracking-widest text-emerald-700">Banner Eligibility</p>
              <h3 className="text-base font-bold text-slate-950">Homepage Promotion Unlocked</h3>
              <p className="mt-1 max-w-xl text-xs font-semibold leading-relaxed text-slate-600">
                Your organization can submit one homepage promotional banner for admin approval.
              </p>
            </div>
          </div>
          <Link href="/my-org/banner-eligibility">
            <Button className="h-9 rounded-md bg-[#12335f] px-3 text-[10px] font-black uppercase tracking-wide text-white hover:bg-[#0b2445]">
              Upload Banner
              <ArrowRight className="ml-1.5 h-3.5 w-3.5" />
            </Button>
          </Link>
        </div>

        <div className="mt-4 grid gap-2 sm:grid-cols-3">
          <div className="rounded-md border border-white/70 bg-white/80 p-3">
            <p className="text-[9px] font-black uppercase tracking-widest text-slate-400">Eligibility Type</p>
            <p className="mt-1 text-xs font-bold text-slate-900">{eligibilityType}</p>
          </div>
          <div className="rounded-md border border-white/70 bg-white/80 p-3">
            <p className="text-[9px] font-black uppercase tracking-widest text-slate-400">Valid Until</p>
            <p className="mt-1 text-xs font-bold text-slate-900">{expiry}</p>
          </div>
          <div className="rounded-md border border-white/70 bg-white/80 p-3">
            <p className="text-[9px] font-black uppercase tracking-widest text-slate-400">Recent Upload</p>
            <p className="mt-1 text-xs font-bold text-slate-900">{recentStatus}</p>
          </div>
        </div>
      </CardContent>
    </Card>
  );
});

const AdminKpiLink = React.memo(function AdminKpiLink({ stat, isLoading }: { stat: AdminTile; isLoading: boolean }) {
  const Icon = stat.icon;
  return (
    <Link key={stat.label} href={stat.path} className="bg-white p-3 sm:p-4 rounded-lg border border-slate-200 shadow-sm transition-all duration-200 hover:shadow-md hover:border-[#12335f]/40 hover:-translate-y-0.5 active:scale-[0.98] active:translate-y-px focus:outline-none focus:ring-2 focus:ring-[#12335f]">
      <div className="flex items-start justify-between gap-3">
        <div>
          <div className="text-slate-500 text-[10px] font-bold uppercase tracking-widest mb-1">{stat.label}</div>
          <div className={cn("text-3xl font-extrabold tracking-tight", isLoading ? "text-slate-300" : "text-slate-900")}>
            {isLoading ? "0" : stat.value ?? "0"}
          </div>
          <p className="mt-1 text-xs font-semibold text-slate-500">{stat.helper}</p>
        </div>
        <div className={cn('flex h-10 w-10 shrink-0 items-center justify-center rounded-md', stat.tone)}>
          <Icon className="h-5 w-5" />
        </div>
      </div>
    </Link>
  );
});

const AdminModuleLink = React.memo(function AdminModuleLink({ module }: { module: AdminModule }) {
  const Icon = module.icon;
  return (
    <Link
      href={module.path}
      className="rounded-lg border border-slate-200 bg-slate-50 p-4 transition-all duration-200 hover:border-[#12335f]/40 hover:bg-white hover:shadow-sm hover:-translate-y-0.5 active:scale-[0.98] active:translate-y-px focus:outline-none focus:ring-2 focus:ring-[#12335f]"
    >
      <div className="flex items-start gap-3">
        <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-md bg-white text-[#12335f] shadow-sm">
          <Icon className="h-5 w-5" />
        </div>
        <div>
          <h3 className="text-sm font-black uppercase tracking-wide text-slate-900">{module.title}</h3>
          <p className="mt-1 text-xs font-semibold leading-relaxed text-slate-500">{module.detail}</p>
          <span className="mt-3 inline-flex text-[10px] font-black uppercase tracking-widest text-[#12335f]">Open Module</span>
        </div>
      </div>
    </Link>
  );
});

const BuyerMarketplaceDiscovery = React.memo(function BuyerMarketplaceDiscovery({
  data,
  isLoading
}: {
  data: any;
  isLoading: boolean;
}) {
  const sections = Array.isArray(data?.sections) ? data.sections.filter((section: any) => section.items?.length) : [];
  const categories = Array.isArray(data?.categories) ? data.categories.slice(0, 8) : [];
  const items = sections.flatMap((section: any) =>
    (section.items || []).map((item: any) => ({
      ...item,
      sectionTitle: section.title,
      itemType: item.itemType || (item.pricingModel || item.basePrice ? 'SERVICE' : 'PRODUCT')
    }))
  ).slice(0, 4);

  if (isLoading) {
    return (
      <section className="overflow-hidden rounded-lg border border-slate-200 bg-white shadow-sm">
        <div className="border-b border-slate-200 bg-slate-50 px-4 py-3">
          <div className="h-4 w-52 rounded bg-slate-100" />
          <div className="mt-2 h-3 w-72 rounded bg-slate-100" />
        </div>
        <div className="grid gap-3 p-4 sm:grid-cols-2 lg:grid-cols-4">
          {[1, 2, 3, 4].map((item) => (
            <div key={item} className="h-20 rounded-md bg-slate-100" />
          ))}
        </div>
      </section>
    );
  }

  if (!items.length && !categories.length) {
    return (
      <section className="rounded-lg border border-slate-200 bg-white p-4 shadow-sm">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <p className="text-[9px] font-black uppercase tracking-[0.16em] text-[#12335f]">Marketplace Discovery</p>
            <h2 className="text-sm font-black text-slate-950">Find verified MSME suppliers</h2>
            <p className="mt-1 text-xs font-semibold text-slate-500">Browse products, services, and publish requirements when ready.</p>
          </div>
          <Link href="/buyer/marketplace">
            <Button variant="outline" className="h-8 rounded-md px-3 text-[10px] font-black uppercase tracking-wide">
              Open Marketplace
              <ArrowRight className="ml-1.5 h-3.5 w-3.5" />
            </Button>
          </Link>
        </div>
      </section>
    );
  }

  return (
    <section className="rounded-lg border border-slate-200 bg-white shadow-sm">
      <div className="flex flex-col gap-3 border-b border-slate-200 bg-slate-50 px-4 py-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <p className="text-[9px] font-black uppercase tracking-[0.16em] text-[#12335f]">Marketplace Discovery</p>
          <h2 className="text-sm font-black text-slate-950">Quick supplier discovery</h2>
          <p className="mt-0.5 text-xs font-semibold text-slate-500">Compact shortcuts for products, services, and requirements.</p>
        </div>
        <div className="flex flex-wrap gap-2">
        <Link href="/buyer/marketplace">
          <Button variant="outline" className="h-8 rounded-md px-3 text-[10px] font-black uppercase tracking-wide">
            Browse
            <ArrowRight className="ml-1.5 h-3.5 w-3.5" />
          </Button>
        </Link>
        <Link href="/buyer/requirements/new">
          <Button className="h-8 rounded-md bg-[#12335f] px-3 text-[10px] font-black uppercase tracking-wide text-white hover:bg-[#0b2445]">
            Publish Requirement
          </Button>
        </Link>
        </div>
      </div>

      {categories.length > 0 && (
        <div className="flex gap-2 overflow-x-auto border-b border-slate-100 px-4 py-3 no-scrollbar">
          {categories.map((category: any) => (
            <Link
              key={category.id}
              href={`/buyer/marketplace?categoryId=${category.id}`}
              className="shrink-0 rounded-md border border-slate-200 bg-white px-3 py-2 text-[10px] font-black uppercase tracking-wide text-slate-700 transition hover:border-[#12335f]/40 hover:text-[#12335f]"
            >
              {category.name}
            </Link>
          ))}
        </div>
      )}

      {items.length > 0 && (
        <div className="grid gap-3 p-4 sm:grid-cols-2 xl:grid-cols-4">
          {items.map((item: any) => {
            const type = String(item.itemType || '').toUpperCase() === 'SERVICE' ? 'service' : 'product';
            const imageUrl = resolveMarketplaceImage(item, type);
            const href = item.detailUrl || `/marketplace/${type === 'service' ? 'services' : 'products'}/${item.id}`;
            const price = Number(type === 'service' ? item.basePrice || item.price || item.discountPrice || 0 : item.price || item.discountPrice || 0);
            return (
              <Link key={`${type}-${item.id}`} href={href} className="group flex gap-3 rounded-lg border border-slate-200 bg-white p-3 transition hover:border-[#12335f]/35 hover:shadow-sm">
                <div className="flex h-16 w-16 shrink-0 items-center justify-center overflow-hidden rounded-md border border-slate-100 bg-slate-50">
                  {imageUrl ? (
                    <img src={imageUrl} alt={item.name} className="h-full w-full object-cover" />
                  ) : type === 'service' ? (
                    <Wrench className="h-6 w-6 text-[#12335f]/45" />
                  ) : (
                    <Package className="h-6 w-6 text-slate-300" />
                  )}
                </div>
                <div className="min-w-0 flex-1">
                  <p className="text-[9px] font-black uppercase tracking-wider text-[#12335f]/70">{type === 'service' ? 'Service' : 'Product'}</p>
                  <h3 className="mt-1 line-clamp-2 text-xs font-black leading-snug text-slate-900 group-hover:text-[#12335f]">{item.name}</h3>
                  <p className="mt-1 truncate text-[10px] font-semibold text-slate-500">{item.sellerName || item.organization?.organizationName || 'Verified MSME seller'}</p>
                  <p className="mt-1 text-[10px] font-black text-[#12335f]">{price > 0 ? `Rs. ${price.toLocaleString('en-IN')}` : 'Quote based'}</p>
                </div>
              </Link>
            );
          })}
        </div>
      )}
    </section>
  );
});

export default function Dashboard() {
  const { user, token, logout, refreshUser } = useAuth();
  const authHeaders: Record<string, string> = token ? { Authorization: `Bearer ${token}` } : {};
  const queryClient = useQueryClient();
  const router = useRouter();

  const [gstInput, setGstInput] = useState('');
  const [isSubmittingGst, setIsSubmittingGst] = useState(false);
  const [errorMsg, setErrorMsg] = useState('');

  // 1. Profile Query
  const { data: profileData } = useQuery({
    queryKey: ['profile'],
    queryFn: async () => {
      const res = await api.fetch('/api/auth/me', { headers: authHeaders });
      if (!res.ok) {
        if (res.status === 401) {
          logout();
          router.replace('/');
        }
        throw new Error('Failed to fetch profile');
      }
      return res.json();
    },
    enabled: !!token,
    staleTime: 10 * 60_000,
  });
  const profile = profileData?.profile || null;

  // 2. Notifications Query
  const { data: notificationsData, isLoading: isNotifLoading } = useQuery({
    queryKey: ['notifications'],
    queryFn: async () => {
      const res = await api.fetch('/api/notifications', { headers: authHeaders });
      if (!res.ok) throw new Error('Failed to fetch notifications');
      const json = await res.json();
      return unwrapApiData<any[]>(json) || [];
    },
    enabled: !!token,
    staleTime: 60_000,
  });
  const notifications = notificationsData || [];

  // 3. Admin Stats Query (KPI Cards)
  const { data: adminStats, isLoading: isAdminStatsLoading } = useQuery({
    queryKey: ['adminStats'],
    queryFn: async () => {
      const res = await api.fetch('/api/admin/reports/summary?kpiOnly=true', { headers: authHeaders });
      if (!res.ok) throw new Error('Failed to fetch stats');
      const json = await res.json();
      return json?.data ?? json;
    },
    enabled: !!token && user?.role === 'admin',
    staleTime: 5 * 60_000,
  });

  const canCheckBannerEligibility = Boolean(
    token &&
    user?.organizationId &&
    ['buyer', 'seller', 'admin'].includes(String(user?.role || ''))
  );

  const { data: bannerEligibility, isLoading: isBannerEligibilityLoading } = useQuery({
    queryKey: ['dashboard-banner-eligibility', user?.organizationId],
    queryFn: bannerApi.eligibility,
    enabled: canCheckBannerEligibility,
    retry: false,
    staleTime: 60_000,
  });

  const { data: marketplaceRecommendations, isLoading: isMarketplaceRecommendationsLoading } = useQuery({
    queryKey: ['dashboard-marketplace-recommendations', user?.id],
    queryFn: marketplaceApi.getRecommendations,
    enabled: !!token && user?.role === 'buyer',
    retry: 1,
    staleTime: 60_000,
  });

  const { data: summaryData } = useQuery({
    queryKey: ['dashboard', 'summary'],
    queryFn: async () => {
      const res = await api.fetch('/api/dashboard/summary', { headers: authHeaders });
      if (!res.ok) throw new Error('Failed to fetch summary');
      const json = await res.json();
      return unwrapApiData<any>(json);
    },
    enabled: !!token && user?.role !== 'admin',
    staleTime: 15_000
  });

  const dashboardData = useMemo(() => {
    return {
      user: {
        name: user?.name,
        role: user?.role,
        organizationName: (user?.organization as any)?.organizationName,
        onboardingStatus: user?.onboardingStatus
      },
      metrics: user?.role === 'admin' ? (adminStats || {}) : (summaryData || {})
    };
  }, [user, adminStats, summaryData]);

  const handleGstSubmit = useCallback(async (e: React.FormEvent) => {
    e.preventDefault();
    const normalizedGstin = gstInput.trim().toUpperCase();
    if (!validators.gstin(normalizedGstin)) {
      const message = 'Enter a valid GSTIN exactly as shown on your GST certificate. The format and checksum must both be correct.';
      setErrorMsg(message);
      toast.error(message);
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
        body: JSON.stringify({ gstin: normalizedGstin })
      });
      if (!res.ok) {
        const errorData = await res.json().catch(() => ({}));
        const message = [errorData.message, errorData.instruction].filter(Boolean).join(' ');
        throw new Error(message || "Failed to verify GSTIN. Please re-check the number or try again later.");
      }
      toast.success("GSTIN verified and saved successfully!");
      await refreshUser({ skipCache: true });
      queryClient.invalidateQueries({ queryKey: ['profile'] });
    } catch (err: any) {
      setErrorMsg(err.message || "Something went wrong.");
      toast.error(err.message || "Verification failed.");
    } finally {
      setIsSubmittingGst(false);
    }
  }, [gstInput, token, refreshUser, queryClient]);

  useEffect(() => {
    if (!token) return;
    const refreshNotifications = () => {
      queryClient.invalidateQueries({ queryKey: ['notifications'] });
    };
    window.addEventListener('notifications:updated', refreshNotifications);
    return () => window.removeEventListener('notifications:updated', refreshNotifications);
  }, [token, queryClient]);

  useEffect(() => {
    if (!token) {
      router.replace('/');
    }
  }, [token, router]);

  const hasGst = useMemo(() => {
    const registrationGstin = String(user?.registrationDetails?.gstin || '').trim().toUpperCase();
    const registrationGstVerified = Boolean(user?.registrationDetails?.gstVerified && validators.gstin(registrationGstin));
    const organizationGstin = String((user?.organization as any)?.gstin || profileData?.user?.organization?.gstin || '').trim().toUpperCase();
    const profileGstin = String(user?.buyerProfile?.gst || profile?.buyerProfile?.gst || profile?.gst || '').trim().toUpperCase();
    const sellerOfficeHasGst = user?.sellerProfile?.offices?.some((o: any) => o.gstNumber)
      || profile?.sellerProfile?.offices?.some((o: any) => o.gstNumber)
      || profile?.offices?.some((o: any) => o.gstNumber);
    return user?.role === 'seller'
      ? (sellerOfficeHasGst || registrationGstVerified || validators.gstin(organizationGstin))
      : (validators.gstin(profileGstin) || registrationGstVerified || validators.gstin(organizationGstin));
  }, [profile, profileData, user]);

  const getStatusIcon = useCallback((status: string) => {
    switch (status) {
      case 'approved_for_procurement': return <CheckCircle2 className="h-10 w-10 text-emerald-500" />;
      case 'rejected': return <XCircle className="h-10 w-10 text-red-500" />;
      case 'under_compliance_review': return <Clock className="h-10 w-10 text-amber-500" />;
      case 'resubmission_required': return <AlertTriangle className="h-10 w-10 text-amber-500" />;
      default: return <Clock className="h-10 w-10 text-blue-500" />;
    }
  }, []);

  const getStatusLabel = useCallback((status: string) => {
    return status.split('_').map(w => w.charAt(0).toUpperCase() + w.slice(1)).join(' ');
  }, []);

  const adminTiles = useMemo(() => [
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
  ], [adminStats]);

  const adminModules = useMemo(() => [
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
      },
      {
        title: 'Monthly Rankings',
        detail: 'Compute buyer and seller ranking lists that unlock homepage promotion eligibility.',
        path: '/admin/monthly-rankings',
        icon: Trophy
      },
      {
        title: 'Banner Management',
        detail: 'Create, approve, hide, and review homepage banners submitted by eligible organizations.',
        path: '/admin/banners',
        icon: Images
      },
      {
        title: 'Marketplace Sections',
        detail: 'Control homepage discovery order, section visibility, and section item limits.',
        path: '/admin/marketplace/home-sections',
        icon: ShoppingBag
      },
      {
        title: 'Reverse Auction Monitoring',
        detail: 'Track live auctions, monitor L1 rankings, review results, and open award recommendations.',
        path: '/reverse-auctions',
        icon: Gavel
      }
  ], []);

  const sectionMessages = useMemo(() => Object.entries(user?.sectionRejectionReasons || {}).filter(([section, reason]) => {
    const status = user?.sectionStatus?.[section as keyof typeof user.sectionStatus];
    return reason && ['rejected', 'resubmission_required'].includes(status || '');
  }), [user?.sectionRejectionReasons, user?.sectionStatus]);

  if (user?.role === 'admin') {
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
          {adminTiles.map(stat => <AdminKpiLink key={stat.label} stat={stat} isLoading={isAdminStatsLoading} />)}
        </div>

        <AIInsightBox dashboardData={dashboardData} />

        <div className="grid gap-4 xl:grid-cols-[1.35fr_0.65fr]">
          <section className="rounded-lg border border-slate-200 bg-white shadow-sm">
            <div className="border-b border-slate-200 px-4 py-3">
              <h2 className="text-sm font-black uppercase tracking-wide text-slate-900">Admin Work Areas</h2>
              <p className="text-xs font-medium text-slate-500">Operational pages added to the sidebar for procurement portal control.</p>
            </div>
            <div className="grid gap-3 p-4 md:grid-cols-2">
              {adminModules.map(module => <AdminModuleLink key={module.title} module={module} />)}
            </div>
          </section>

          <aside className="rounded-lg border border-slate-200 bg-[#12335f] p-5 text-white shadow-sm">
            <div className="flex h-12 w-12 items-center justify-center rounded-md bg-white/10">
              <ShieldCheck className="h-6 w-6" />
            </div>
            <h2 className="mt-4 text-lg font-black uppercase">Daily review checklist</h2>
            <div className="mt-4 space-y-3">
              {ADMIN_REVIEW_CHECKLIST.map(item => (
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

  return (
    <div className="space-y-4 animate-in fade-in duration-500 max-w-6xl mx-auto pb-6">
      <div className="flex flex-col md:flex-row md:justify-between md:items-center gap-3 border-b border-slate-200 pb-2.5">
        <div>
          <p className="text-[9px] font-black text-[#12335f] uppercase tracking-[0.15em] mb-0.5">MSME Procurement Portal</p>
          <h1 className="text-xl font-extrabold text-[#12335f] uppercase tracking-tight">Dashboard</h1>
        </div>
        <button
          type="button"
          className="flex items-center gap-2 bg-white p-1.5 rounded-lg border border-slate-200 shadow-sm text-left transition-all duration-200 hover:border-[#12335f]/40 hover:shadow-md hover:-translate-y-0.5 active:scale-[0.98] active:translate-y-px focus:outline-none focus:ring-2 focus:ring-[#12335f]"
        >
          <div className="h-8 w-8 rounded bg-[#12335f] flex items-center justify-center text-white font-black text-sm">
            {user?.name?.charAt(0)}
          </div>
          <div className="pr-2">
            <p className="text-[11px] font-bold text-slate-900 uppercase">{user?.name}</p>
            <div className="flex flex-col gap-0.5">
              <p className="text-[8px] font-bold text-slate-400 uppercase tracking-wide">{user?.role} Tier Account</p>
              <p className="text-[8px] font-bold text-[#12335f] uppercase tracking-wide">
                ID: {user?.registrationDetails?.userId || `MSME-${user?.role?.charAt(0).toUpperCase()}-${String(user?.id).padStart(5, '0')}`}
              </p>
            </div>
          </div>
        </button>
      </div>

      {user?.role === 'buyer' && (
        <section className="rounded-lg border border-[#12335f]/20 bg-white p-4 shadow-sm">
          <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <p className="text-[10px] font-black uppercase tracking-[0.18em] text-[#12335f]">Primary Buyer Action</p>
              <h2 className="text-base font-black text-slate-950">Create Procurement</h2>
              <p className="mt-1 text-xs font-semibold leading-relaxed text-slate-500">
                Start once, choose the business intent, and continue to marketplace, request quotations, large procurement, auction, or open requirement.
              </p>
            </div>
            <Link href="/buyer/procurement/create">
              <Button className="h-10 rounded-md bg-[#12335f] px-4 text-xs font-black uppercase tracking-wide text-white hover:bg-[#0b2445]">
                Create Procurement
                <ArrowRight className="ml-2 h-4 w-4" />
              </Button>
            </Link>
          </div>
        </section>
      )}

      {(user?.role as string) !== 'admin' && <RoleAwareActionCards />}

      <div className="space-y-4">
          {!hasGst && (
            <Card className="rounded-lg border border-slate-200 shadow-sm overflow-hidden bg-gradient-to-br from-slate-700 to-slate-900 text-white relative">
              <div className="absolute top-0 right-0 p-4 opacity-5 pointer-events-none">
                <ShieldCheck className="h-20 w-20 text-white" />
              </div>
              <CardContent className="p-4">
                <div className="space-y-3">
                  <div>
                    <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[9px] font-bold bg-indigo-500/20 text-indigo-300 border border-indigo-400/20 mb-1.5 uppercase tracking-wide">
                      <Briefcase className="h-3 w-3" /> Fast-Track Procurement
                    </span>
                    <h3 className="text-sm font-bold uppercase tracking-tight text-slate-100">
                      Add & Verify Business GSTIN
                    </h3>
                    <p className="text-[11px] font-medium text-slate-350 leading-relaxed max-w-xl mt-0.5">
                      Boost your MSME trust quotient. Instantly verify your business details to auto-approve key sections and fast-track your onboarding to approved procurement status.
                    </p>
                  </div>

                  <form onSubmit={handleGstSubmit} className="space-y-2 max-w-md">
                    <div className="flex flex-col sm:flex-row gap-2">
                      <div className="relative flex-1">
                        <input
                          type="text"
                          placeholder="Enter 15-digit GSTIN (e.g. 27AAAAA1111A1Z1)"
                          value={gstInput}
                          onChange={(e) => {
                            setGstInput(e.target.value.toUpperCase().replace(/[^A-Z0-9]/g, ''));
                            if (errorMsg) setErrorMsg('');
                          }}
                          maxLength={15}
                          className="w-full h-8 px-2.5 bg-white/10 border border-white/20 rounded text-[11px] font-semibold text-white placeholder-slate-300 focus:outline-none focus:ring-2 focus:ring-white uppercase tracking-wider"
                          disabled={isSubmittingGst}
                        />
                      </div>
                      <Button
                        type="submit"
                        disabled={isSubmittingGst || !validators.gstin(gstInput)}
                        className="h-8 bg-white hover:bg-slate-100 text-slate-900 rounded px-4 text-[11px] font-bold uppercase tracking-wider transition-all"
                      >
                        {isSubmittingGst && <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" />}
                        {isSubmittingGst ? 'Submitting...' : 'Verify & Save'}
                      </Button>
                    </div>
                    {errorMsg && (
                      <p className="text-[10px] font-semibold text-red-400 bg-red-500/10 px-2.5 py-1 rounded border border-red-500/20">
                        {errorMsg}
                      </p>
                    )}
                  </form>

                  <div className="flex flex-wrap items-center gap-x-4 gap-y-1.5 pt-2 border-t border-slate-800 text-[9.5px] font-semibold text-slate-400">
                    <span className="flex items-center gap-1">
                      <CheckCircle2 className="h-3 w-3 text-emerald-400" /> Auto-approve Offices
                    </span>
                    <span className="flex items-center gap-1">
                      <CheckCircle2 className="h-3 w-3 text-emerald-400" /> Direct Procurement Live
                    </span>
                    <span className="flex items-center gap-1">
                      <CheckCircle2 className="h-3 w-3 text-emerald-400" /> AES-256 Encryption
                    </span>
                  </div>
                </div>
              </CardContent>
            </Card>
          )}

          <AIInsightBox dashboardData={dashboardData} />

          <PromotionEligibilityCard eligibility={bannerEligibility} isLoading={isBannerEligibilityLoading} />

          {user?.role === 'buyer' && (
            <BuyerMarketplaceDiscovery
              data={marketplaceRecommendations}
              isLoading={isMarketplaceRecommendationsLoading}
            />
          )}

          <Card className="rounded-lg border-slate-200 shadow-sm overflow-hidden bg-white">
            <div className="bg-slate-50 border-b border-slate-200 px-3 py-2 flex items-center justify-between">
              <h3 className="text-xs font-bold uppercase text-slate-900 tracking-tight flex items-center gap-1.5">
                <ShieldCheck className="h-4.5 w-4.5 text-[#12335f]" />
                Verification Status Tracker
              </h3>
              <Badge className="bg-white text-[#12335f] border border-slate-200 px-2 py-0.5 rounded text-[9px] font-bold uppercase">
                Live Monitoring
              </Badge>
            </div>
            <CardContent className="p-4">
              <div className="flex flex-col md:flex-row items-center gap-4">
                <div className="relative h-14 w-14 shrink-0">
                  <div className="absolute inset-0 bg-slate-50 rounded-full animate-pulse opacity-50" />
                  <div className="absolute inset-0 flex items-center justify-center scale-75">
                    {getStatusIcon(user?.onboardingStatus || 'pending')}
                  </div>
                </div>
                <div className="space-y-2 text-center md:text-left flex-1">
                  <div>
                    <h4 className="text-sm font-extrabold text-slate-900 uppercase tracking-tight">
                      {getStatusLabel(user?.onboardingStatus || 'pending')}
                    </h4>
                    <p className="text-slate-550 font-medium text-[11px] mt-0.5 leading-snug">
                      {user?.onboardingStatus === 'approved_for_procurement'
                        ? "Your profile is fully verified. You can now participate in all procurement activities."
                        : "Your profile is currently being reviewed by the MSME compliance department."}
                    </p>
                  </div>
                  <Button
                    onClick={() => router.push(user?.role === 'seller' ? '/seller/onboarding' : '/buyer/onboarding')}
                    className="bg-[#12335f] hover:bg-[#0b2445] text-white rounded h-8 px-4 font-bold uppercase text-[10px] tracking-wide transition-all"
                  >
                    {user?.onboardingStatus === 'approved_for_procurement' ? 'View Full Profile' : 'Complete Profile'}
                    <ArrowRight className="ml-1.5 h-3.5 w-3.5" />
                  </Button>
                </div>
              </div>
            </CardContent>
          </Card>

          {/* Quick Actions / Info */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div className="bg-white p-3 rounded-lg border border-slate-200 shadow-sm space-y-2">
              <div className="h-7 w-7 rounded bg-slate-50 text-[#12335f] flex items-center justify-center">
                <Info className="h-4 w-4" />
              </div>
              <h5 className="font-bold text-slate-950 uppercase text-[11px] tracking-wide">Need Help?</h5>
              <p className="text-[10.5px] font-medium text-slate-500 leading-snug">Our support team is available to help you with the onboarding process.</p>
              <Button
                variant="ghost"
                onClick={() => toast.info('Support desk request noted. Please email support@msme-portal.gov.in for urgent help.')}
                className="text-[#12335f] font-bold uppercase text-[9.5px] p-0 h-auto hover:bg-transparent"
              >
                Contact Support
              </Button>
            </div>
          </div>
      </div>
    </div>
  );
}
