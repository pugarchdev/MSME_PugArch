import { FormEvent, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { BarChart3, RefreshCw, ShieldCheck, XCircle } from 'lucide-react';
import { Button } from '../../../components/ui/button';
import { Card, CardContent } from '../../../components/ui/card';
import { EmptyState, InlineError, LoadingState } from '../../shared/FeatureStates';
import { formatCurrency, formatDate } from '../../shared/format';
import { bannerApi } from '../api';

export default function MonthlyRankingsAdminPage() {
  const now = new Date();
  const [month, setMonth] = useState(now.getMonth() + 1);
  const [year, setYear] = useState(now.getFullYear());
  const [message, setMessage] = useState('');
  const qc = useQueryClient();
  const query = useQuery({ queryKey: ['monthly-rankings', month, year], queryFn: () => bannerApi.rankings(month, year), staleTime: 20_000 });
  const refresh = () => qc.invalidateQueries({ queryKey: ['monthly-rankings'] });
  const compute = useMutation({ mutationFn: () => bannerApi.computeRankings(month, year), onSuccess: () => { setMessage('Rankings computed'); refresh(); } });
  const grant = useMutation({ mutationFn: bannerApi.grant, onSuccess: () => { setMessage('Eligibility granted'); refresh(); } });
  const revoke = useMutation({ mutationFn: bannerApi.revoke, onSuccess: () => { setMessage('Eligibility revoked'); refresh(); } });

  const submitGrant = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    grant.mutate({ organizationId: Number(form.get('organizationId')), month, year, eligibilityType: form.get('eligibilityType') });
  };

  if (query.isLoading) return <LoadingState label="Loading monthly rankings..." />;

  const rankings = query.data?.rankings || [];

  return (
    <div className="space-y-4">
      <div className="flex flex-col gap-3 border-b border-slate-200 pb-4 md:flex-row md:items-end md:justify-between">
        <div>
          <p className="text-[10px] font-black uppercase tracking-widest text-[#12335f]">Banner Eligibility</p>
          <h1 className="text-2xl font-black text-slate-950">Monthly Rankings</h1>
        </div>
        <div className="flex flex-wrap gap-2">
          <input value={month} onChange={event => setMonth(Number(event.target.value))} type="number" min="1" max="12" className="h-10 w-20 rounded-lg border border-slate-200 px-3 text-xs font-bold" />
          <input value={year} onChange={event => setYear(Number(event.target.value))} type="number" min="2020" className="h-10 w-24 rounded-lg border border-slate-200 px-3 text-xs font-bold" />
          <Button variant="outline" onClick={() => query.refetch()}><RefreshCw className="mr-2 h-4 w-4" />Refresh</Button>
          <Button onClick={() => compute.mutate()} disabled={compute.isPending}><BarChart3 className="mr-2 h-4 w-4" />Compute</Button>
        </div>
      </div>
      {message && <div className="rounded-lg border border-blue-200 bg-blue-50 px-4 py-3 text-xs font-bold text-[#12335f]">{message}</div>}
      {query.error && <InlineError message={(query.error as Error).message} onRetry={() => query.refetch()} />}
      <Card>
        <CardContent className="p-4">
          <form onSubmit={submitGrant} className="grid gap-3 md:grid-cols-[1fr_180px_auto]">
            <input name="organizationId" type="number" min="1" required placeholder="Organization ID" className="h-10 rounded-lg border border-slate-200 px-3 text-xs font-bold" />
            <select name="eligibilityType" defaultValue="MANUAL" className="h-10 rounded-lg border border-slate-200 px-3 text-xs font-bold">
              <option value="MANUAL">Manual</option>
              <option value="TOP_BUYER">Top buyer</option>
              <option value="TOP_SELLER">Top seller</option>
            </select>
            <Button disabled={grant.isPending}><ShieldCheck className="mr-2 h-4 w-4" />Grant</Button>
          </form>
        </CardContent>
      </Card>
      {rankings.length === 0 ? <EmptyState title="No rankings for this month" /> : (
        <Card>
          <CardContent className="p-0">
            <div className="overflow-x-auto">
              <table className="w-full min-w-[820px] text-left text-sm">
                <thead className="bg-slate-50 text-[10px] font-black uppercase tracking-widest text-slate-500">
                  <tr><th className="p-3">Rank</th><th className="p-3">Org</th><th className="p-3">Type</th><th className="p-3">Value</th><th className="p-3">Orders</th><th className="p-3">Computed</th><th className="p-3 text-right">Action</th></tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {rankings.map((row: any) => (
                    <tr key={row.id}>
                      <td className="p-3 text-lg font-black">#{row.rank}</td>
                      <td className="p-3 font-bold">Organization #{row.organizationId}</td>
                      <td className="p-3 text-xs font-black uppercase text-slate-500">{row.organizationType}</td>
                      <td className="p-3 font-black">{formatCurrency(row.organizationType === 'BUYER' ? row.totalPurchaseValue : row.totalSalesValue)}</td>
                      <td className="p-3">{row.orderCount}</td>
                      <td className="p-3 text-xs font-semibold text-slate-500">{formatDate(row.computedAt)}</td>
                      <td className="p-3 text-right">
                        <Button size="sm" variant="danger" onClick={() => revoke.mutate({ organizationId: row.organizationId, month, year, eligibilityType: row.organizationType === 'BUYER' ? 'TOP_BUYER' : 'TOP_SELLER' })}>
                          <XCircle className="mr-1 h-3.5 w-3.5" />Revoke
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
