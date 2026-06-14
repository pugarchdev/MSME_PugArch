import { FormEvent, useMemo, useRef, useState } from 'react';
import Link from 'next/link';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { BarChart3, CalendarDays, Images, RefreshCw, ShieldCheck, Trophy, XCircle } from 'lucide-react';
import { Button } from '../../../components/ui/button';
import { Card, CardContent } from '../../../components/ui/card';
import { EmptyState, InlineError, LoadingState } from '../../shared/FeatureStates';
import { formatCurrency, formatDate } from '../../shared/format';
import { bannerApi } from '../api';

const monthName = (month: number, year: number) =>
  new Date(year, month - 1, 1).toLocaleDateString(undefined, { month: 'long', year: 'numeric' });

const readable = (value?: string | null) =>
  String(value || '').replace(/_/g, ' ').toLowerCase().replace(/\b\w/g, char => char.toUpperCase());

export default function MonthlyRankingsAdminPage() {
  const now = new Date();
  const [month, setMonth] = useState(now.getMonth() + 1);
  const [year, setYear] = useState(now.getFullYear());
  const [message, setMessage] = useState('');
  const grantFormRef = useRef<HTMLFormElement>(null);
  const qc = useQueryClient();

  const query = useQuery({
    queryKey: ['monthly-rankings', month, year],
    queryFn: () => bannerApi.rankings(month, year),
    staleTime: 20_000
  });

  const refresh = () => qc.invalidateQueries({ queryKey: ['monthly-rankings'] });

  const compute = useMutation({
    mutationFn: () => bannerApi.computeRankings(month, year),
    onSuccess: () => {
      setMessage(`Rankings computed for ${monthName(month, year)}.`);
      refresh();
    },
    onError: err => setMessage((err as Error).message)
  });

  const grant = useMutation({
    mutationFn: bannerApi.grant,
    onSuccess: (_data, variables: any) => {
      setMessage(`Eligibility granted for Organization #${variables.organizationId} in ${monthName(month, year)}.`);
      grantFormRef.current?.reset();
      refresh();
    },
    onError: err => setMessage((err as Error).message)
  });

  const revoke = useMutation({
    mutationFn: bannerApi.revoke,
    onSuccess: (_data, variables: any) => {
      setMessage(`Eligibility revoked for Organization #${variables.organizationId} in ${monthName(month, year)}.`);
      refresh();
    },
    onError: err => setMessage((err as Error).message)
  });

  const submitGrant = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    grant.mutate({
      organizationId: Number(form.get('organizationId')),
      month,
      year,
      eligibilityType: form.get('eligibilityType')
    });
  };

  const rankings = query.data?.rankings || [];
  const buyerCount = useMemo(() => rankings.filter((row: any) => row.organizationType === 'BUYER').length, [rankings]);
  const sellerCount = useMemo(() => rankings.filter((row: any) => row.organizationType === 'SELLER').length, [rankings]);

  if (query.isLoading) return <LoadingState label="Loading monthly rankings..." />;

  return (
    <div className="space-y-5">
      <div className="rounded-lg border border-slate-200 bg-white p-5 shadow-sm">
        <div className="flex flex-col gap-4 xl:flex-row xl:items-start xl:justify-between">
          <div>
            <p className="text-[10px] font-black uppercase tracking-widest text-[#12335f]">Banner Eligibility</p>
            <h1 className="text-2xl font-bold text-slate-950">Monthly Rankings</h1>
            <p className="mt-2 max-w-3xl text-sm font-medium leading-relaxed text-slate-600">
              Compute monthly buyer and seller rankings, then grant homepage banner eligibility to top performers or manually selected organizations.
            </p>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <Link href="/admin/banners">
              <Button variant="outline" className="h-10">
                <Images className="mr-2 h-4 w-4" />
                Banner Management
              </Button>
            </Link>
            <Button variant="outline" onClick={() => query.refetch()} disabled={query.isFetching}>
              <RefreshCw className="mr-2 h-4 w-4" />
              Refresh
            </Button>
            <Button onClick={() => compute.mutate()} disabled={compute.isPending}>
              <BarChart3 className="mr-2 h-4 w-4" />
              {compute.isPending ? 'Computing...' : 'Compute'}
            </Button>
          </div>
        </div>

        <div className="mt-5 grid gap-3 md:grid-cols-4">
          <div className="rounded-lg border border-slate-200 bg-slate-50 p-4">
            <div className="flex items-center gap-2 text-[10px] font-black uppercase tracking-widest text-slate-500">
              <CalendarDays className="h-3.5 w-3.5" />
              Selected Period
            </div>
            <p className="mt-2 text-lg font-bold text-slate-950">{monthName(month, year)}</p>
          </div>
          <Metric label="Ranked Organizations" value={rankings.length} />
          <Metric label="Buyer Rankings" value={buyerCount} />
          <Metric label="Seller Rankings" value={sellerCount} />
        </div>
      </div>

      <Card className="border-slate-200">
        <CardContent className="p-4">
          <div className="grid gap-3 lg:grid-cols-[1fr_1fr_auto_auto]">
            <label className="space-y-1">
              <span className="text-[10px] font-black uppercase tracking-widest text-slate-500">Month</span>
              <input value={month} onChange={event => setMonth(Number(event.target.value))} type="number" min="1" max="12" className="h-10 w-full rounded-lg border border-slate-200 px-3 text-xs font-bold" />
            </label>
            <label className="space-y-1">
              <span className="text-[10px] font-black uppercase tracking-widest text-slate-500">Year</span>
              <input value={year} onChange={event => setYear(Number(event.target.value))} type="number" min="2020" className="h-10 w-full rounded-lg border border-slate-200 px-3 text-xs font-bold" />
            </label>
            <div className="flex items-end">
              <Button variant="outline" onClick={() => setMessage('')} className="h-10 w-full">
                Clear Message
              </Button>
            </div>
            <div className="flex items-end">
              <Button onClick={() => compute.mutate()} disabled={compute.isPending} className="h-10 w-full">
                <Trophy className="mr-2 h-4 w-4" />
                Compute Period
              </Button>
            </div>
          </div>
        </CardContent>
      </Card>

      {message && <div className="rounded-lg border border-blue-200 bg-blue-50 px-4 py-3 text-xs font-bold text-[#12335f]">{message}</div>}
      {query.error && <InlineError message={(query.error as Error).message} onRetry={() => query.refetch()} />}

      <Card className="border-slate-200">
        <CardContent className="space-y-4 p-4">
          <div>
            <p className="text-[10px] font-black uppercase tracking-widest text-slate-500">Manual Grant</p>
            <h2 className="text-lg font-bold text-slate-950">Grant banner eligibility manually</h2>
            <p className="mt-1 text-xs font-semibold text-slate-500">
              Use this when an organization should receive homepage promotion access outside the automatic ranking list.
            </p>
          </div>
          <form ref={grantFormRef} onSubmit={submitGrant} className="grid gap-3 md:grid-cols-[1fr_180px_auto]">
            <input name="organizationId" type="number" min="1" required placeholder="Organization ID" className="h-10 rounded-lg border border-slate-200 px-3 text-xs font-bold" />
            <select name="eligibilityType" defaultValue="MANUAL" className="h-10 rounded-lg border border-slate-200 px-3 text-xs font-bold">
              <option value="MANUAL">Manual</option>
              <option value="TOP_BUYER">Top buyer</option>
              <option value="TOP_SELLER">Top seller</option>
            </select>
            <Button disabled={grant.isPending} className="h-10">
              <ShieldCheck className="mr-2 h-4 w-4" />
              {grant.isPending ? 'Granting...' : 'Grant'}
            </Button>
          </form>
        </CardContent>
      </Card>

      {rankings.length === 0 ? (
        <EmptyState
          title="No rankings available for this period"
          description="Click Compute to generate rankings for the selected month and year. You can still use Manual Grant if an organization needs immediate banner eligibility."
        />
      ) : (
        <Card className="border-slate-200">
          <CardContent className="p-0">
            <div className="border-b border-slate-200 px-4 py-3">
              <p className="text-[10px] font-black uppercase tracking-widest text-slate-500">Computed List</p>
              <h2 className="text-lg font-bold text-slate-950">{monthName(month, year)} rankings</h2>
            </div>
            <div className="overflow-x-auto">
              <table className="w-full min-w-[860px] text-left text-sm">
                <thead className="bg-slate-50 text-[10px] font-black uppercase tracking-widest text-slate-500">
                  <tr>
                    <th className="p-3">Rank</th>
                    <th className="p-3">Organization</th>
                    <th className="p-3">Type</th>
                    <th className="p-3">Value</th>
                    <th className="p-3">Orders</th>
                    <th className="p-3">Computed</th>
                    <th className="p-3 text-right">Action</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {rankings.map((row: any) => (
                    <tr key={row.id} className="hover:bg-slate-50">
                      <td className="p-3 text-lg font-bold text-slate-950">#{row.rank}</td>
                      <td className="p-3">
                        <p className="font-bold text-slate-900">Organization #{row.organizationId}</p>
                        <p className="mt-0.5 text-[11px] font-semibold text-slate-500">{readable(row.organizationType)} promotion candidate</p>
                      </td>
                      <td className="p-3 text-xs font-black uppercase text-slate-500">{row.organizationType}</td>
                      <td className="p-3 font-bold">{formatCurrency(row.organizationType === 'BUYER' ? row.totalPurchaseValue : row.totalSalesValue)}</td>
                      <td className="p-3 font-semibold text-slate-700">{row.orderCount}</td>
                      <td className="p-3 text-xs font-semibold text-slate-500">{formatDate(row.computedAt)}</td>
                      <td className="p-3 text-right">
                        <Button
                          size="sm"
                          variant="danger"
                          disabled={revoke.isPending}
                          onClick={() => revoke.mutate({ organizationId: row.organizationId, month, year, eligibilityType: row.organizationType === 'BUYER' ? 'TOP_BUYER' : 'TOP_SELLER' })}
                        >
                          <XCircle className="mr-1 h-3.5 w-3.5" />
                          Revoke
                        </Button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
}

function Metric({ label, value }: { label: string; value: number }) {
  return (
    <div className="rounded-lg border border-slate-200 bg-white p-4">
      <p className="text-[10px] font-black uppercase tracking-widest text-slate-500">{label}</p>
      <p className="mt-2 text-2xl font-bold text-slate-950">{value}</p>
    </div>
  );
}
