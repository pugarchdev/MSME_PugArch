import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import Link from 'next/link';
import { 
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip as RechartsTooltip, Legend, ResponsiveContainer, 
  LineChart, Line, PieChart, Pie, Cell, AreaChart, Area
} from 'recharts';
import { FileBarChart, Users, ClipboardCheck, ArrowUpRight, ArrowDownRight, Activity, Download, ShieldCheck, Clock, FileText, CreditCard, Truck, Gavel, KeyRound } from 'lucide-react';
import { api } from '../lib/api';
import { Card, CardContent, CardHeader, CardTitle } from '../components/ui/card';
import { downloadCsv } from '../features/shared/exportUtils';
import { useAuth } from '../hooks/useAuth';

const COLORS = ['#12335f', '#10b981', '#f59e0b', '#ef4444', '#8b5cf6'];

export default function MISReports() {
  const { token } = useAuth();
  const authHeaders: Record<string, string> = token ? { Authorization: `Bearer ${token}` } : {};
  
  const [timeframe, setTimeframe] = useState('30d');
  const [roleFilter, setRoleFilter] = useState('all');

  // 1. KPI Stats Query (shares key/cache with dashboard for instant load)
  const { data: kpiData, isLoading: isKpiLoading } = useQuery({
    queryKey: ['adminStats'],
    queryFn: async () => {
      const res = await api.fetch('/api/admin/reports/summary?kpiOnly=true', { headers: authHeaders });
      if (!res.ok) throw new Error('Failed to fetch KPIs');
      const json = await res.json();
      return json?.data ?? json;
    },
    enabled: !!token,
    staleTime: 5 * 60_000,
  });

  // 2. Heavy Charts / Details Query (independent loading)
  const { data: detailsData, isLoading: isDetailsLoading } = useQuery({
    queryKey: ['adminStatsDetails', timeframe, roleFilter],
    queryFn: async () => {
      const queryParams = new URLSearchParams({ detailsOnly: 'true', timeframe, role: roleFilter }).toString();
      const res = await api.fetch(`/api/admin/reports/summary?${queryParams}`, { headers: authHeaders });
      if (!res.ok) throw new Error('Failed to fetch details');
      const json = await res.json();
      return json?.data ?? json;
    },
    enabled: !!token,
    staleTime: 5 * 60_000,
  });

  const stats = { ...kpiData, ...detailsData };
  const userGrowthData = stats?.userGrowth || [];
  const transactionData = stats?.transactions || [];
  const approvalRateNumber = Number(String(stats?.approvalRate || '0').replace('%', '')) || 0;
  const pendingApproval = Number(stats?.pendingApproval || 0);
  const totalNetwork = Number(stats?.totalNetwork || 0);
  const reviewLoad = totalNetwork ? Math.round((pendingApproval / totalNetwork) * 100) : 0;
  const executiveSignals = [
    { label: 'Approval throughput', value: `${approvalRateNumber}%`, helper: approvalRateNumber >= 70 ? 'Healthy conversion' : 'Needs review follow-up', icon: ShieldCheck, tone: approvalRateNumber >= 70 ? 'text-emerald-700 bg-emerald-50' : 'text-amber-700 bg-amber-50' },
    { label: 'Review load', value: `${reviewLoad}%`, helper: `${pendingApproval} pending of ${totalNetwork || 0}`, icon: Clock, tone: reviewLoad > 30 ? 'text-amber-700 bg-amber-50' : 'text-blue-700 bg-blue-50' },
    { label: 'Avg onboarding time', value: stats?.avgOnboardingTime || '0 Days', helper: 'Submission to approval cycle', icon: Activity, tone: 'text-slate-700 bg-slate-50' },
  ];

  const distributionData = [
    { name: 'Active Sellers', value: stats?.activeSellers || 0 },
    { name: 'Active Buyers', value: stats?.activeBuyers || 0 },
    { name: 'Pending Review', value: stats?.pendingApproval || 0 },
  ];

  const exportSummary = () => {
    const rows = [
      ['Metric', 'Value'],
      ['Total Network', stats?.totalNetwork || 0],
      ['Active Sellers', stats?.activeSellers || 0],
      ['Active Buyers', stats?.activeBuyers || 0],
      ['Pending Approval', stats?.pendingApproval || 0],
      ['Approval Rate', stats?.approvalRate || '0%'],
      ['Average Onboarding Time', stats?.avgOnboardingTime || '0 Days'],
      ['Active Procurement Value', stats?.activeProcurementValue || 'Rs. 0'],
      ['Tender Success Rate', stats?.tenderSuccessRate || '0%'],
    ];
    downloadCsv(`mis-summary-${new Date().toISOString().slice(0, 10)}.csv`, rows);
  };

  return (
    <div className="mx-auto max-w-[1560px] space-y-5 px-4 pb-12 animate-in fade-in duration-500">
      {/* ── Transparent Header ── */}
      <div>
        <p className="text-[10px] font-black uppercase tracking-[0.18em] text-[#12335f]">Analytics</p>
        <div className="flex flex-col gap-3 lg:flex-row lg:items-end lg:justify-between">
          <div>
            <h1 className="flex items-center gap-2 text-2xl font-black tracking-tight text-slate-950">
              <FileBarChart className="h-6 w-6 text-[#12335f]" /> MIS Reports & Insights
            </h1>
            <p className="mt-1 max-w-3xl text-sm font-semibold text-slate-500">
              Executive dashboard for network health, onboarding metrics, and transaction analytics.
            </p>
          </div>
          <div className="flex items-center gap-2">
            <button type="button" onClick={exportSummary} className="inline-flex h-10 items-center gap-2 rounded-lg bg-[#12335f] px-4 text-xs font-black uppercase tracking-wide text-white shadow-sm hover:bg-[#0b2445] transition">
              <Download className="h-3.5 w-3.5" /> Export
            </button>
          </div>
        </div>
      </div>

      {/* ── Filter Bar (border-y) ── */}
      <div className="flex flex-wrap items-center gap-3 border-y border-slate-200 bg-slate-50/50 px-4 py-3">
        <select
          value={timeframe}
          onChange={(e) => setTimeframe(e.target.value)}
          className="h-10 min-w-[140px] rounded-lg border border-slate-200 bg-white px-3 text-xs font-bold outline-none focus:ring-2 focus:ring-[#12335f]/20"
        >
          <option value="7d">Last 7 Days</option>
          <option value="30d">Last 30 Days</option>
          <option value="90d">Last 90 Days</option>
          <option value="1y">This Year</option>
          <option value="all">All Time</option>
        </select>
        <select
          value={roleFilter}
          onChange={(e) => setRoleFilter(e.target.value)}
          className="h-10 min-w-[140px] rounded-lg border border-slate-200 bg-white px-3 text-xs font-bold outline-none focus:ring-2 focus:ring-[#12335f]/20"
        >
          <option value="all">All Roles</option>
          <option value="buyer">Buyers Only</option>
          <option value="seller">Sellers Only</option>
        </select>
      </div>

      {/* ── Executive Signal Cards ── */}
      <div className="grid gap-3 lg:grid-cols-3">
        {executiveSignals.map(signal => (
          <div key={signal.label} className={`rounded-2xl p-4 ring-1 ${signal.tone} ring-current/20 transition hover:scale-[1.02]`}>
            <div className="flex items-center gap-2 mb-2">
              <signal.icon className="h-4 w-4 opacity-70" />
              <span className="text-[10px] font-black uppercase tracking-widest opacity-60">{signal.label}</span>
            </div>
            <p className="text-2xl font-black">{signal.value}</p>
            <p className="mt-1 text-xs font-semibold opacity-60">{signal.helper}</p>
          </div>
        ))}
      </div>

      <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
        <KPI 
          title="Total Network" 
          value={stats?.totalNetwork || 0} 
          icon={Users} 
          trend="+12% from last month" 
          trendUp={true} 
          loading={isKpiLoading}
        />
        <KPI 
          title="Active Sellers" 
          value={stats?.activeSellers || 0} 
          icon={ClipboardCheck} 
          trend="+5% from last month" 
          trendUp={true} 
          loading={isKpiLoading}
        />
        <KPI 
          title="Active Buyers" 
          value={stats?.activeBuyers || 0} 
          icon={ClipboardCheck} 
          trend="-2% from last month" 
          trendUp={false} 
          loading={isKpiLoading}
        />
        <KPI 
          title="Pending Approval" 
          value={stats?.pendingApproval || 0} 
          icon={Activity} 
          trend="Needs immediate review" 
          trendUp={false} 
          loading={isKpiLoading}
        />
      </div>

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
        <Card className="shadow-sm">
          <CardHeader>
            <CardTitle className="text-sm font-black uppercase tracking-wide text-slate-900">User Registration Growth</CardTitle>
          </CardHeader>
          <CardContent className="h-[300px]">
            {isDetailsLoading ? (
              <div className="h-full w-full animate-pulse rounded-lg bg-slate-50 flex items-center justify-center text-xs font-bold text-slate-400">
                Loading growth stats...
              </div>
            ) : (
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={userGrowthData} margin={{ top: 20, right: 30, left: 0, bottom: 0 }}>
                  <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#e2e8f0" />
                  <XAxis dataKey="name" axisLine={false} tickLine={false} tick={{ fontSize: 12, fill: '#64748b' }} dy={10} />
                  <YAxis axisLine={false} tickLine={false} tick={{ fontSize: 12, fill: '#64748b' }} />
                  <RechartsTooltip cursor={{ fill: '#f8fafc' }} contentStyle={{ borderRadius: '8px', border: 'none', boxShadow: '0 4px 6px -1px rgb(0 0 0 / 0.1)' }} />
                  <Legend wrapperStyle={{ paddingTop: '20px', fontSize: '12px', fontWeight: 'bold' }} />
                  <Bar dataKey="sellers" name="Sellers" fill="#12335f" radius={[4, 4, 0, 0]} barSize={20} />
                  <Bar dataKey="buyers" name="Buyers" fill="#38bdf8" radius={[4, 4, 0, 0]} barSize={20} />
                </BarChart>
              </ResponsiveContainer>
            )}
          </CardContent>
        </Card>

        <Card className="shadow-sm">
          <CardHeader>
            <CardTitle className="text-sm font-black uppercase tracking-wide text-slate-900">Weekly Transaction Volume</CardTitle>
          </CardHeader>
          <CardContent className="h-[300px]">
            {isDetailsLoading ? (
              <div className="h-full w-full animate-pulse rounded-lg bg-slate-50 flex items-center justify-center text-xs font-bold text-slate-400">
                Loading transaction volume...
              </div>
            ) : (
              <ResponsiveContainer width="100%" height="100%">
                <LineChart data={transactionData} margin={{ top: 20, right: 30, left: 0, bottom: 0 }}>
                  <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#e2e8f0" />
                  <XAxis dataKey="name" axisLine={false} tickLine={false} tick={{ fontSize: 12, fill: '#64748b' }} dy={10} />
                  <YAxis axisLine={false} tickLine={false} tick={{ fontSize: 12, fill: '#64748b' }} />
                  <RechartsTooltip contentStyle={{ borderRadius: '8px', border: 'none', boxShadow: '0 4px 6px -1px rgb(0 0 0 / 0.1)' }} />
                  <Line type="monotone" dataKey="value" name="Volume (₹)" stroke="#10b981" strokeWidth={3} dot={{ r: 4, fill: '#10b981', strokeWidth: 0 }} activeDot={{ r: 6 }} />
                </LineChart>
              </ResponsiveContainer>
            )}
          </CardContent>
        </Card>
      </div>

      <div className="grid gap-4 lg:grid-cols-[1.2fr_0.8fr]">
        <Card className="shadow-sm">
          <CardHeader>
            <CardTitle className="text-sm font-black uppercase tracking-wide text-slate-900">Approval Readiness Trend</CardTitle>
          </CardHeader>
          <CardContent className="h-[260px]">
            {isDetailsLoading ? (
              <div className="flex h-full items-center justify-center rounded-lg bg-slate-50 text-xs font-bold text-slate-400">Loading readiness trend...</div>
            ) : (
              <ResponsiveContainer width="100%" height="100%">
                <AreaChart data={userGrowthData} margin={{ top: 20, right: 20, left: 0, bottom: 0 }}>
                  <defs>
                    <linearGradient id="readinessFill" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="5%" stopColor="#12335f" stopOpacity={0.28} />
                      <stop offset="95%" stopColor="#12335f" stopOpacity={0} />
                    </linearGradient>
                  </defs>
                  <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#e2e8f0" />
                  <XAxis dataKey="name" axisLine={false} tickLine={false} tick={{ fontSize: 12, fill: '#64748b' }} />
                  <YAxis axisLine={false} tickLine={false} tick={{ fontSize: 12, fill: '#64748b' }} />
                  <RechartsTooltip contentStyle={{ borderRadius: '8px', border: 'none', boxShadow: '0 4px 6px -1px rgb(0 0 0 / 0.1)' }} />
                  <Area type="monotone" dataKey="sellers" name="Seller approvals" stroke="#12335f" fill="url(#readinessFill)" strokeWidth={3} />
                  <Area type="monotone" dataKey="buyers" name="Buyer approvals" stroke="#0ea5e9" fill="#e0f2fe" strokeWidth={2} />
                </AreaChart>
              </ResponsiveContainer>
            )}
          </CardContent>
        </Card>

        <Card className="shadow-sm">
          <CardHeader>
            <CardTitle className="text-sm font-black uppercase tracking-wide text-slate-900">Report Shortcuts</CardTitle>
          </CardHeader>
          <CardContent className="space-y-2">
            {[
              ['Procurement report', '/admin/reports/procurement', Gavel],
              ['Payments report', '/admin/reports/payments', CreditCard],
              ['Suppliers report', '/admin/reports/suppliers', Users],
              ['Roles & permissions', '/admin/rbac', KeyRound],
              ['Delivery operations', '/admin/delivery', Truck],
              ['Invoices', '/payments/invoices', FileText],
            ].map(([label, href, Icon]: any) => (
              <Link key={href} href={href} className="flex items-center justify-between rounded-md border border-slate-100 bg-slate-50 px-3 py-2 text-xs font-black uppercase tracking-wide text-[#12335f] hover:border-[#12335f]/30 hover:bg-white">
                <span className="flex items-center gap-2"><Icon className="h-4 w-4" />{label}</span>
                <ArrowUpRight className="h-3.5 w-3.5" />
              </Link>
            ))}
          </CardContent>
        </Card>
      </div>

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
        <Card className="shadow-sm lg:col-span-1">
          <CardHeader>
            <CardTitle className="text-sm font-black uppercase tracking-wide text-slate-900">Entity Distribution</CardTitle>
          </CardHeader>
          <CardContent className="h-[250px] flex items-center justify-center">
            {isDetailsLoading ? (
              <div className="h-full w-full animate-pulse rounded-lg bg-slate-50 flex items-center justify-center text-xs font-bold text-slate-400">
                Loading distribution...
              </div>
            ) : (
              <ResponsiveContainer width="100%" height="100%">
                <PieChart>
                  <Pie
                    data={distributionData}
                    cx="50%"
                    cy="50%"
                    innerRadius={60}
                    outerRadius={80}
                    paddingAngle={5}
                    dataKey="value"
                  >
                    {distributionData.map((entry, index) => (
                      <Cell key={`cell-${index}`} fill={COLORS[index % COLORS.length]} />
                    ))}
                  </Pie>
                  <RechartsTooltip contentStyle={{ borderRadius: '8px', border: 'none', boxShadow: '0 4px 6px -1px rgb(0 0 0 / 0.1)' }} />
                  <Legend verticalAlign="bottom" height={36} wrapperStyle={{ fontSize: '12px', fontWeight: 'bold' }} />
                </PieChart>
              </ResponsiveContainer>
            )}
          </CardContent>
        </Card>

        <Card className="shadow-sm lg:col-span-2">
          <CardHeader>
            <CardTitle className="text-sm font-black uppercase tracking-wide text-slate-900">Key Performance Indicators</CardTitle>
          </CardHeader>
          <CardContent className="grid grid-cols-2 gap-4">
             <div className="rounded-lg border border-slate-100 bg-slate-50 p-4">
                <p className="text-[10px] font-black uppercase tracking-widest text-slate-400">Average Onboarding Time</p>
                {isKpiLoading ? (
                  <div className="h-8 w-24 animate-pulse rounded bg-slate-200 mt-1" />
                ) : (
                  <p className="mt-1 text-2xl font-black text-slate-900">{stats?.avgOnboardingTime || '0 Days'}</p>
                )}
             </div>
             <div className="rounded-lg border border-slate-100 bg-slate-50 p-4">
                <p className="text-[10px] font-black uppercase tracking-widest text-slate-400">Approval Rate</p>
                {isKpiLoading ? (
                  <div className="h-8 w-20 animate-pulse rounded bg-slate-200 mt-1" />
                ) : (
                  <p className="mt-1 text-2xl font-black text-slate-900">{stats?.approvalRate || '0%'}</p>
                )}
             </div>
             <div className="rounded-lg border border-slate-100 bg-slate-50 p-4">
                <p className="text-[10px] font-black uppercase tracking-widest text-slate-400">Active Procurement Value</p>
                {isKpiLoading ? (
                  <div className="h-8 w-28 animate-pulse rounded bg-slate-200 mt-1" />
                ) : (
                  <p className="mt-1 text-2xl font-black text-slate-900">{stats?.activeProcurementValue || '₹0Cr'}</p>
                )}
             </div>
             <div className="rounded-lg border border-slate-100 bg-slate-50 p-4">
                <p className="text-[10px] font-black uppercase tracking-widest text-slate-400">Tender Success Rate</p>
                {isKpiLoading ? (
                  <div className="h-8 w-20 animate-pulse rounded bg-slate-200 mt-1" />
                ) : (
                  <p className="mt-1 text-2xl font-black text-slate-900">{stats?.tenderSuccessRate || '0%'}</p>
                )}
             </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}

function KPI({ title, value, icon: Icon, trend, trendUp, loading }: any) {
  return (
    <Card className="shadow-sm">
      <CardContent className="flex items-start justify-between p-4 sm:p-5">
        <div className="w-full">
          <p className="text-[10px] font-black uppercase tracking-widest text-slate-400">{title}</p>
          <p className={`mt-2 text-3xl font-black ${loading ? 'text-slate-300' : 'text-slate-950'}`}>
            {loading ? "0" : value}
          </p>
          <div className={`mt-2 flex items-center text-[10px] font-bold ${trendUp ? 'text-emerald-600' : 'text-amber-600'}`}>
            {trendUp ? <ArrowUpRight className="mr-1 h-3 w-3" /> : <ArrowDownRight className="mr-1 h-3 w-3" />}
            {trend}
          </div>
        </div>
        <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-md bg-slate-50 text-[#12335f]">
          <Icon className="h-5 w-5" />
        </div>
      </CardContent>
    </Card>
  );
}
