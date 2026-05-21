import { useEffect, useState } from 'react';
import { 
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip as RechartsTooltip, Legend, ResponsiveContainer, 
  LineChart, Line, PieChart, Pie, Cell
} from 'recharts';
import { FileBarChart, Users, ClipboardCheck, ArrowUpRight, ArrowDownRight, Activity } from 'lucide-react';
import { api } from '../lib/api';
import { Card, CardContent, CardHeader, CardTitle } from '../components/ui/card';

const COLORS = ['#1d4ed8', '#10b981', '#f59e0b', '#ef4444', '#8b5cf6'];

export default function MISReports() {
  const token = localStorage.getItem('token') || '';
  const authOptions = { headers: { Authorization: `Bearer ${token}` } };
  
  const [stats, setStats] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  
  const [timeframe, setTimeframe] = useState('30d');
  const [roleFilter, setRoleFilter] = useState('all');

  useEffect(() => {
    const loadData = async () => {
      try {
        const queryParams = new URLSearchParams({ timeframe, role: roleFilter }).toString();
        const res = await api.fetch(`/api/admin/reports/summary?${queryParams}`, { ...authOptions, skipCache: true });
        if (res.ok) {
          const body = await res.json();
          setStats(body?.data ?? body);
        }
      } catch (err) {
        console.error(err);
      } finally {
        setLoading(false);
      }
    };
    loadData();
  }, [token, timeframe, roleFilter]);

  // Fallback to sample data for charts if backend doesn't provide time-series yet
  const userGrowthData = stats?.userGrowth || [
    { name: 'Jan', buyers: 40, sellers: 24 },
    { name: 'Feb', buyers: 30, sellers: 13 },
    { name: 'Mar', buyers: 20, sellers: 58 },
    { name: 'Apr', buyers: 27, sellers: 39 },
    { name: 'May', buyers: 18, sellers: 48 },
    { name: 'Jun', buyers: 23, sellers: 38 },
  ];

  const transactionData = stats?.transactions || [
    { name: 'Mon', value: 4000 },
    { name: 'Tue', value: 3000 },
    { name: 'Wed', value: 2000 },
    { name: 'Thu', value: 2780 },
    { name: 'Fri', value: 1890 },
    { name: 'Sat', value: 2390 },
    { name: 'Sun', value: 3490 },
  ];

  const distributionData = [
    { name: 'Active Sellers', value: stats?.activeSellers || 120 },
    { name: 'Active Buyers', value: stats?.activeBuyers || 45 },
    { name: 'Pending Review', value: stats?.pendingApproval || 15 },
  ];

  if (loading) {
    return <div className="flex h-[400px] items-center justify-center text-sm font-bold text-slate-400">Loading MIS Reports...</div>;
  }

  return (
    <div className="space-y-6 animate-in fade-in duration-500">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <p className="text-[10px] font-black uppercase tracking-[0.18em] text-slate-400">Analytics</p>
          <h1 className="mt-1 flex items-center gap-2 text-2xl font-extrabold uppercase tracking-tight text-[#1d4ed8]">
            <FileBarChart className="h-6 w-6" /> MIS Reports & Insights
          </h1>
          <p className="mt-1 max-w-3xl text-sm font-medium text-slate-500">
            Executive dashboard for network health, onboarding metrics, and transaction analytics.
          </p>
        </div>

        <div className="flex items-center gap-3 rounded-lg border border-slate-200 bg-white p-2 shadow-sm">
          <select 
            value={timeframe} 
            onChange={(e) => setTimeframe(e.target.value)}
            className="h-9 cursor-pointer rounded-md border-0 bg-slate-50 px-3 text-xs font-bold outline-none ring-1 ring-inset ring-slate-200 focus:ring-2 focus:ring-[#1d4ed8]"
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
            className="h-9 cursor-pointer rounded-md border-0 bg-slate-50 px-3 text-xs font-bold outline-none ring-1 ring-inset ring-slate-200 focus:ring-2 focus:ring-[#1d4ed8]"
          >
            <option value="all">All Roles</option>
            <option value="buyer">Buyers Only</option>
            <option value="seller">Sellers Only</option>
          </select>
        </div>
      </div>

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <KPI 
          title="Total Network" 
          value={stats?.totalNetwork || 180} 
          icon={Users} 
          trend="+12% from last month" 
          trendUp={true} 
        />
        <KPI 
          title="Active Sellers" 
          value={stats?.activeSellers || 120} 
          icon={ClipboardCheck} 
          trend="+5% from last month" 
          trendUp={true} 
        />
        <KPI 
          title="Active Buyers" 
          value={stats?.activeBuyers || 45} 
          icon={ClipboardCheck} 
          trend="-2% from last month" 
          trendUp={false} 
        />
        <KPI 
          title="Pending Approval" 
          value={stats?.pendingApproval || 15} 
          icon={Activity} 
          trend="Needs immediate review" 
          trendUp={false} 
        />
      </div>

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
        <Card className="shadow-sm">
          <CardHeader>
            <CardTitle className="text-sm font-black uppercase tracking-wide text-blue-900">User Registration Growth</CardTitle>
          </CardHeader>
          <CardContent className="h-[300px]">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={userGrowthData} margin={{ top: 20, right: 30, left: 0, bottom: 0 }}>
                <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#e2e8f0" />
                <XAxis dataKey="name" axisLine={false} tickLine={false} tick={{ fontSize: 12, fill: '#64748b' }} dy={10} />
                <YAxis axisLine={false} tickLine={false} tick={{ fontSize: 12, fill: '#64748b' }} />
                <RechartsTooltip cursor={{ fill: '#f8fafc' }} contentStyle={{ borderRadius: '8px', border: 'none', boxShadow: '0 4px 6px -1px rgb(0 0 0 / 0.1)' }} />
                <Legend wrapperStyle={{ paddingTop: '20px', fontSize: '12px', fontWeight: 'bold' }} />
                <Bar dataKey="sellers" name="Sellers" fill="#1d4ed8" radius={[4, 4, 0, 0]} barSize={20} />
                <Bar dataKey="buyers" name="Buyers" fill="#38bdf8" radius={[4, 4, 0, 0]} barSize={20} />
              </BarChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>

        <Card className="shadow-sm">
          <CardHeader>
            <CardTitle className="text-sm font-black uppercase tracking-wide text-blue-900">Weekly Transaction Volume</CardTitle>
          </CardHeader>
          <CardContent className="h-[300px]">
            <ResponsiveContainer width="100%" height="100%">
              <LineChart data={transactionData} margin={{ top: 20, right: 30, left: 0, bottom: 0 }}>
                <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#e2e8f0" />
                <XAxis dataKey="name" axisLine={false} tickLine={false} tick={{ fontSize: 12, fill: '#64748b' }} dy={10} />
                <YAxis axisLine={false} tickLine={false} tick={{ fontSize: 12, fill: '#64748b' }} />
                <RechartsTooltip contentStyle={{ borderRadius: '8px', border: 'none', boxShadow: '0 4px 6px -1px rgb(0 0 0 / 0.1)' }} />
                <Line type="monotone" dataKey="value" name="Volume (₹)" stroke="#10b981" strokeWidth={3} dot={{ r: 4, fill: '#10b981', strokeWidth: 0 }} activeDot={{ r: 6 }} />
              </LineChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>
      </div>

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
        <Card className="shadow-sm lg:col-span-1">
          <CardHeader>
            <CardTitle className="text-sm font-black uppercase tracking-wide text-blue-900">Entity Distribution</CardTitle>
          </CardHeader>
          <CardContent className="h-[250px] flex items-center justify-center">
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
          </CardContent>
        </Card>

        <Card className="shadow-sm lg:col-span-2">
          <CardHeader>
            <CardTitle className="text-sm font-black uppercase tracking-wide text-blue-900">Key Performance Indicators</CardTitle>
          </CardHeader>
          <CardContent className="grid grid-cols-2 gap-4">
             <div className="rounded-lg border border-slate-100 bg-slate-50 p-4">
                <p className="text-[10px] font-black uppercase tracking-widest text-slate-400">Average Onboarding Time</p>
                <p className="mt-1 text-2xl font-black text-slate-900">2.4 Days</p>
             </div>
             <div className="rounded-lg border border-slate-100 bg-slate-50 p-4">
                <p className="text-[10px] font-black uppercase tracking-widest text-slate-400">Approval Rate</p>
                <p className="mt-1 text-2xl font-black text-slate-900">94.2%</p>
             </div>
             <div className="rounded-lg border border-slate-100 bg-slate-50 p-4">
                <p className="text-[10px] font-black uppercase tracking-widest text-slate-400">Active Procurement Value</p>
                <p className="mt-1 text-2xl font-black text-slate-900">₹42.5Cr</p>
             </div>
             <div className="rounded-lg border border-slate-100 bg-slate-50 p-4">
                <p className="text-[10px] font-black uppercase tracking-widest text-slate-400">Tender Success Rate</p>
                <p className="mt-1 text-2xl font-black text-slate-900">68%</p>
             </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}

function KPI({ title, value, icon: Icon, trend, trendUp }: any) {
  return (
    <Card className="shadow-sm">
      <CardContent className="flex items-start justify-between p-5">
        <div>
          <p className="text-[10px] font-black uppercase tracking-widest text-slate-400">{title}</p>
          <p className="mt-2 text-3xl font-black text-slate-950">{value}</p>
          <div className={`mt-2 flex items-center text-[10px] font-bold ${trendUp ? 'text-emerald-600' : 'text-amber-600'}`}>
            {trendUp ? <ArrowUpRight className="mr-1 h-3 w-3" /> : <ArrowDownRight className="mr-1 h-3 w-3" />}
            {trend}
          </div>
        </div>
        <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-md bg-blue-50 text-[#1d4ed8]">
          <Icon className="h-5 w-5" />
        </div>
      </CardContent>
    </Card>
  );
}
