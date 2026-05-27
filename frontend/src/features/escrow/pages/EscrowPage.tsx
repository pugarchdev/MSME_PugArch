import { useEffect, useMemo, useState } from 'react';
import { CheckCircle2, Clock3, Eye, Landmark, Loader2, LockKeyhole, RefreshCw, Receipt, Search, ShieldAlert, X, Filter, LayoutGrid, List } from 'lucide-react';
import { toast } from 'sonner';
import { api } from '../../../lib/api';
import { useAuth } from '../../../hooks/useAuth';
import { Button } from '../../../components/ui/button';
import { Card, CardContent } from '../../../components/ui/card';
import { cn } from '../../../lib/utils';
import { InlineError } from '../../shared/FeatureStates';
import { formatCurrency, formatDate } from '../../shared/format';
import { Pagination } from '../../shared/Pagination';
import { useResponsiveViewMode } from '../../shared/hooks';
import { EntityIdLink } from '../../shared/EntityIdLink';
import { ViewModeToggle } from '../../shared/ViewModeToggle';

type Milestone = {
  id: number;
  title: string;
  amount: string | number;
  currency?: string;
  status: string;
  dueDate?: string;
  completedAt?: string;
  approvedAt?: string;
};

type EscrowAccount = {
  id: number;
  amount: string | number;
  currency?: string;
  status: string;
  buyerId: number;
  sellerId: number;
  buyer?: { id: number; name: string; email?: string };
  seller?: { id: number; name: string; email?: string };
  createdAt?: string;
  fundedAt?: string;
  frozenAt?: string;
  releasedAt?: string;
  paymentTransaction?: { id: number; referenceId?: string; status?: string; gateway?: string };
  purchaseOrder?: { id: number; poNumber?: string; title?: string };
  milestones?: Milestone[];
  transactions?: Array<{ id: number; type: string; amount: string | number; createdAt?: string }>;
};

const statusClass = (status: string) => {
  const normalized = status.toLowerCase();
  if (['held', 'approved', 'released', 'escrow_released', 'paid'].includes(normalized)) return 'border-emerald-200 bg-emerald-50 text-emerald-700';
  if (['failed', 'frozen', 'refunded', 'disputed'].includes(normalized)) return 'border-rose-200 bg-rose-50 text-rose-700';
  return 'border-amber-200 bg-amber-50 text-amber-700';
};

export default function EscrowPage() {
  const { token, user } = useAuth();
  const [escrows, setEscrows] = useState<EscrowAccount[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [query, setQuery] = useState('');
  const [status, setStatus] = useState('');
  const [fundingFilter, setFundingFilter] = useState('');
  const [viewMode, setViewMode] = useResponsiveViewMode();
  const [detailTab, setDetailTab] = useState<'receipt' | 'timeline'>('receipt');
  const [selected, setSelected] = useState<EscrowAccount | null>(null);
  const [page, setPage] = useState(1);
  const [pageSize, setPageSizeState] = useState(10);
  const [total, setTotal] = useState(0);

  const headers = useMemo((): Record<string, string> => {
    const nextHeaders: Record<string, string> = {};
    if (token) nextHeaders.Authorization = `Bearer ${token}`;
    return nextHeaders;
  }, [token]);

  const load = async () => {
    if (!token) return;
    setLoading(true);
    setError('');
    try {
      const params = new URLSearchParams({ skip: String((page - 1) * pageSize), take: String(pageSize) });
      if (query.trim()) params.set('q', query.trim());
      if (status) params.set('status', status);
      if (fundingFilter) params.set('funding', fundingFilter);
      const res = await api.fetch(`/api/escrow?${params.toString()}`, { method: 'GET', headers, skipCache: true });
      const body = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(body.message || 'Unable to load escrow accounts');
      setEscrows(body.escrowAccounts || body.data?.escrowAccounts || body.data || []);
      setTotal(Number(body.total ?? body.data?.total ?? 0));
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unable to load escrow accounts');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void load();
  }, [token, page, pageSize, query, status, fundingFilter]);

  useEffect(() => {
    setPage(1);
  }, [query, status, fundingFilter]);

  const filtered = useMemo(() => {
    return escrows.filter(item => {
      if (fundingFilter === 'funded' && !item.fundedAt) return false;
      if (fundingFilter === 'pending' && item.fundedAt) return false;
      return true;
    });
  }, [escrows, fundingFilter]);

  const pagedEscrows = filtered;
  const setPageSize = (nextPageSize: number) => {
    setPageSizeState(nextPageSize);
    setPage(1);
  };

  const completeMilestone = async (milestoneId: number) => {
    const res = await api.post(`/api/milestones/${milestoneId}/complete`, {}, { headers });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) return toast.error(data.message || 'Unable to complete milestone.');
    toast.success('Milestone marked complete.');
    await load();
  };

  const approveMilestone = async (milestoneId: number) => {
    const res = await api.post(`/api/milestones/${milestoneId}/approve`, { reason: 'Approved from escrow dashboard' }, { headers });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) return toast.error(data.message || 'Unable to approve milestone.');
    toast.success('Milestone approved and release ledger entry recorded.');
    await load();
  };

  const totalHeld = escrows.filter(item => item.status === 'held').reduce((sum, item) => sum + Number(item.amount || 0), 0);
  const frozenCount = escrows.filter(item => item.status === 'frozen').length;
  const milestoneCount = escrows.reduce((sum, item) => sum + (item.milestones?.length || 0), 0);

  if (loading) return <div className="flex min-h-[240px] items-center justify-center text-sm font-black text-[#12335f]"><Loader2 className="mr-2 h-5 w-5 animate-spin" />Loading escrow ledger...</div>;

  return (
    <div className="space-y-4">
      <div className="flex flex-col gap-3 border-b border-slate-200 pb-4 lg:flex-row lg:items-end lg:justify-between">
        <div>
          <p className="text-[10px] font-black uppercase tracking-[0.25em] text-[#12335f]">Escrow Control</p>
          <h1 className="mt-1 text-2xl font-black text-slate-950">Escrow & Milestones</h1>
          <p className="mt-1 text-xs font-semibold text-slate-500">Held funds, freeze state, milestone completion, approval, and release events.</p>
        </div>
        <Button onClick={load} className="w-fit bg-[#12335f] text-white hover:bg-[#0b2445]"><RefreshCw className="mr-2 h-4 w-4" />Refresh</Button>
      </div>

      <div className="grid gap-3 grid-cols-2 md:grid-cols-4">
        <Metric label="Escrow Accounts" value={escrows.length} icon={Landmark} />
        <Metric label="Amount Held" value={formatCurrency(totalHeld)} icon={LockKeyhole} />
        <Metric label="Milestones" value={milestoneCount} icon={CheckCircle2} />
        <Metric label="Frozen" value={frozenCount} icon={ShieldAlert} />
      </div>

      {error && <InlineError message={error} onRetry={load} />}

      <Card className="border-slate-200/80 shadow-sm bg-white">
        <CardContent className="space-y-4 p-4">
          <div className="flex flex-col gap-3 lg:flex-row lg:items-end lg:justify-between">
            <div className="grid gap-3 sm:grid-cols-[1.3fr_1fr_1fr] lg:grid-cols-[1.8fr_1fr_1fr]">
              <div className="relative w-full">
                <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
                <input value={query} onChange={event => setQuery(event.target.value)} placeholder="Search escrow, payment reference, PO, buyer, seller..." className="h-10 w-full rounded-lg border border-slate-200 pl-10 pr-3 text-xs font-semibold outline-none focus:ring-2 focus:ring-[#12335f]/20" />
              </div>
              <select value={status} onChange={event => setStatus(event.target.value)} className="h-10 rounded-lg border border-slate-200 bg-white px-3 text-xs font-bold outline-none focus:ring-2 focus:ring-[#12335f]/20 w-full">
                <option value="">All statuses</option>
                <option value="held">Held</option>
                <option value="released">Released</option>
                <option value="frozen">Frozen</option>
                <option value="refunded">Refunded</option>
              </select>
              <select value={fundingFilter} onChange={event => setFundingFilter(event.target.value)} className="h-10 rounded-lg border border-slate-200 bg-white px-3 text-xs font-bold outline-none focus:ring-2 focus:ring-[#12335f]/20 w-full">
                <option value="">All fund states</option>
                <option value="funded">Funded</option>
                <option value="pending">Pending funding</option>
              </select>
            </div>
            <div className="flex items-center gap-2">
              <ViewModeToggle value={viewMode} onChange={setViewMode} />
            </div>
          </div>
        </CardContent>
      </Card>

      {filtered.length === 0 ? <div className="rounded-lg border border-dashed border-slate-300 bg-white p-10 text-center text-sm font-semibold text-slate-500">No escrow accounts match the current filters.</div> : (
        <div className="space-y-3">
          {viewMode === 'list' ? (
            <div className="overflow-hidden rounded-lg border border-slate-200 bg-white shadow-sm">
              <table className="min-w-full text-left text-sm text-slate-700">
                <thead className="bg-slate-50 text-xs uppercase tracking-[0.18em] text-slate-500">
                  <tr>
                    <th className="px-4 py-3">Sr. No</th>
                    <th className="px-4 py-3">Escrow</th>
                    <th className="px-4 py-3">Buyer / Seller</th>
                    <th className="px-4 py-3">Amount</th>
                    <th className="px-4 py-3">PO / Reference</th>
                    <th className="px-4 py-3">Status</th>
                    <th className="px-4 py-3">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-200">
                  {pagedEscrows.map((escrow, index) => (
                    <tr key={escrow.id} className="hover:bg-slate-50">
                      <td className="px-4 py-3 text-xs font-black text-slate-700">{(page - 1) * pageSize + index + 1}</td>
                      <td className="px-4 py-3">
                        <EntityIdLink
                          label={`ESC-${escrow.id}`}
                          id={escrow.id}
                          size="sm"
                          onClick={() => { setDetailTab('receipt'); setSelected(escrow); }}
                        />
                        <p className="mt-1 text-xs text-slate-500">{formatCurrency(escrow.amount)}</p>
                      </td>
                      <td className="px-4 py-3 text-xs font-semibold text-slate-600">
                        <span className="text-wrap-anywhere">{escrow.buyer?.name || `Buyer #${escrow.buyerId}`}</span>
                        <br />
                        <span className="text-wrap-anywhere">{escrow.seller?.name || `Seller #${escrow.sellerId}`}</span>
                      </td>
                      <td className="px-4 py-3 text-xs font-semibold text-slate-700">{formatCurrency(escrow.amount)}</td>
                      <td className="px-4 py-3 text-xs text-slate-500">PO {escrow.purchaseOrder?.poNumber || '-'}<br />Ref {escrow.paymentTransaction?.referenceId || '-'}</td>
                      <td className="px-4 py-3"><span className={cn('inline-flex rounded-full border px-2 py-1 text-[10px] font-black uppercase', statusClass(escrow.status))}>{escrow.status}</span></td>
                      <td className="px-4 py-3 space-x-2">
                        <Button size="sm" variant="outline" onClick={() => { setDetailTab('receipt'); setSelected(escrow); }}>View</Button>
                        <Button size="sm" className="bg-[#12335f] text-white" onClick={() => { setDetailTab('timeline'); setSelected(escrow); }}>Track</Button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : (
            <div className="grid gap-3 lg:grid-cols-2">
              {pagedEscrows.map(escrow => (
                <Card key={escrow.id} className="rounded-lg border-slate-200 shadow-none">
                  <CardContent className="space-y-4 p-4">
                    <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
                      <div>
                        <EntityIdLink
                          label={`ESC-${escrow.id}`}
                          id={escrow.id}
                          size="sm"
                          onClick={() => { setDetailTab('receipt'); setSelected(escrow); }}
                        />
                        <p className="mt-2 text-xs font-bold text-slate-500 text-wrap-anywhere">{formatCurrency(escrow.amount)} | PO {escrow.purchaseOrder?.poNumber || '-'}</p>
                        <p className="mt-2 text-xs text-slate-500 text-wrap-anywhere">Ref {escrow.paymentTransaction?.referenceId || '-'} | {escrow.buyer?.name || `Buyer #${escrow.buyerId}`} → {escrow.seller?.name || `Seller #${escrow.sellerId}`}</p>
                      </div>
                      <div className="flex flex-col items-start gap-2 sm:items-end">
                        <span className={cn('rounded-full border px-3 py-1 text-[10px] font-black uppercase', statusClass(escrow.status))}>{escrow.status}</span>
                        <div className="flex flex-wrap gap-2">
                          <Button variant="outline" size="sm" onClick={() => { setDetailTab('receipt'); setSelected(escrow); }}>Details</Button>
                          <Button size="sm" className="bg-[#12335f] text-white" onClick={() => { setDetailTab('timeline'); setSelected(escrow); }}>Track</Button>
                        </div>
                      </div>
                    </div>
                    <div className="grid gap-2 md:grid-cols-3">
                      <DetailMetric label="Status" value={escrow.status} />
                      <DetailMetric label="Funded" value={escrow.fundedAt ? formatDate(escrow.fundedAt) : 'Pending'} />
                      <DetailMetric label="Milestones" value={String((escrow.milestones || []).length)} />
                    </div>
                  </CardContent>
                </Card>
              ))}
            </div>
          )}

          <div className="overflow-hidden rounded-lg border border-slate-200 bg-white">
            <Pagination page={page} pageSize={pageSize} total={total} onPageChange={setPage} onPageSizeChange={setPageSize} label="escrow accounts" />
          </div>
        </div>
      )}

      {selected && <EscrowDetail escrow={selected} detailTab={detailTab} onTabChange={setDetailTab} onClose={() => setSelected(null)} />}
    </div>
  );
}

function Metric({ label, value, icon: Icon }: { label: string; value: string | number; icon: any }) {
  return <Card><CardContent className="flex items-center justify-between p-4"><div><p className="text-[9px] font-black uppercase tracking-widest text-slate-400">{label}</p><p className="mt-1 text-xl font-black text-slate-950">{value}</p></div><Icon className="h-5 w-5 text-[#12335f]" /></CardContent></Card>;
}

function EscrowDetail({ escrow, detailTab, onClose, onTabChange }: { escrow: EscrowAccount; detailTab: 'receipt' | 'timeline'; onClose: () => void; onTabChange: (tab: 'receipt' | 'timeline') => void }) {
  const timelineItems = [
    { label: 'Escrow created', date: escrow.createdAt, description: 'Escrow account initialized.' },
    { label: 'Escrow funded', date: escrow.fundedAt, description: 'Funds were deposited to escrow.' },
    { label: 'Escrow frozen', date: escrow.frozenAt, description: 'Escrow account was frozen.' },
    { label: 'Escrow released', date: escrow.releasedAt, description: 'Escrow funds were released.' },
    ...(escrow.milestones || []).map(milestone => ({
      label: `Milestone: ${milestone.title}`,
      date: milestone.completedAt || milestone.approvedAt || milestone.dueDate,
      description: `${milestone.status} · ${formatCurrency(milestone.amount)}`,
    })),
    ...(escrow.transactions || []).map(transaction => ({
      label: `${transaction.type} transaction`,
      date: transaction.createdAt,
      description: formatCurrency(transaction.amount),
    })),
  ].filter(item => item.date).sort((a, b) => Number(new Date(a.date!)) - Number(new Date(b.date!)));

  return (
    <div className="fixed inset-0 z-50 flex justify-end bg-slate-950/30">
      <aside className="h-full w-full max-w-2xl overflow-y-auto bg-white shadow-xl">
        <div className="sticky top-0 z-10 border-b border-slate-200 bg-white">
          <div className="flex flex-col gap-3 p-5 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <p className="text-[10px] font-black uppercase tracking-widest text-[#12335f]">Escrow detail</p>
              <h2 className="mt-1 text-xl font-black text-slate-950">Escrow #{escrow.id}</h2>
              <p className="mt-1 text-xs font-semibold text-slate-500">{formatCurrency(escrow.amount)} | {escrow.status}</p>
            </div>
            <div className="flex items-center gap-2">
              <button onClick={() => onTabChange('receipt')} className={cn('rounded-lg border px-3 py-2 text-xs font-black uppercase tracking-[0.24em]', detailTab === 'receipt' ? 'border-slate-900 bg-slate-950 text-white' : 'border-slate-200 bg-white text-slate-500')}>Receipt</button>
              <button onClick={() => onTabChange('timeline')} className={cn('rounded-lg border px-3 py-2 text-xs font-black uppercase tracking-[0.24em]', detailTab === 'timeline' ? 'border-slate-900 bg-slate-950 text-white' : 'border-slate-200 bg-white text-slate-500')}>Timeline</button>
              <button onClick={onClose} className="rounded-lg border border-slate-200 p-2 text-slate-500 hover:bg-slate-50" aria-label="Close detail"><X className="h-4 w-4" /></button>
            </div>
          </div>
        </div>
        <div className="space-y-4 p-5">
          <div className="grid gap-3 md:grid-cols-3">
            <DetailMetric label="Buyer" value={escrow.buyer?.name || `#${escrow.buyerId}`} />
            <DetailMetric label="Seller" value={escrow.seller?.name || `#${escrow.sellerId}`} />
            <DetailMetric label="Funded" value={escrow.fundedAt ? formatDate(escrow.fundedAt) : 'Pending'} />
          </div>

          {detailTab === 'receipt' ? (
            <div className="space-y-4">
              <Card>
                <CardContent className="space-y-3 p-4">
                  <div className="flex flex-wrap items-center justify-between gap-3">
                    <div>
                      <p className="text-xs font-black uppercase tracking-widest text-slate-500">Receipt summary</p>
                      <p className="mt-1 text-sm text-slate-600">Escrow payment and order details.</p>
                    </div>
                    <div className="rounded-full border border-slate-200 bg-slate-50 px-3 py-1 text-[10px] font-black uppercase text-slate-700">{escrow.status}</div>
                  </div>
                  <div className="grid gap-3 sm:grid-cols-2">
                    <DetailMetric label="Total amount" value={formatCurrency(escrow.amount)} />
                    <DetailMetric label="PO number" value={escrow.purchaseOrder?.poNumber || '-'} />
                    <DetailMetric label="Payment ref" value={escrow.paymentTransaction?.referenceId || '-'} />
                    <DetailMetric label="Gateway" value={escrow.paymentTransaction?.gateway || 'N/A'} />
                  </div>
                </CardContent>
              </Card>
              <Card>
                <CardContent className="space-y-3 p-4">
                  <p className="text-xs font-black uppercase tracking-widest text-slate-500">Milestones</p>
                  {(escrow.milestones || []).length === 0 ? (
                    <p className="text-sm font-semibold text-slate-500">No milestones available for this escrow account.</p>
                  ) : (
                    <div className="space-y-3">
                      {escrow.milestones?.map(milestone => (
                        <div key={milestone.id} className="rounded-lg border border-slate-200 p-3">
                          <p className="font-black text-slate-900">{milestone.title}</p>
                          <p className="text-xs text-slate-500">Amount {formatCurrency(milestone.amount)} · Due {formatDate(milestone.dueDate)} · Status {milestone.status}</p>
                        </div>
                      ))}
                    </div>
                  )}
                </CardContent>
              </Card>
            </div>
          ) : (
            <div className="space-y-4">
              <Card>
                <CardContent className="space-y-3 p-4">
                  <p className="text-xs font-black uppercase tracking-widest text-slate-500">Payment timeline</p>
                  <div className="space-y-4">
                    {timelineItems.length === 0 && <p className="text-sm font-semibold text-slate-500">No timeline events available.</p>}
                    {timelineItems.map((item, index) => (
                      <div key={`${item.label}-${index}`} className="flex gap-4 rounded-lg border border-slate-200 p-4">
                        <div className="flex h-8 w-8 items-center justify-center rounded-full bg-slate-100 text-slate-700 text-xs font-black">{index + 1}</div>
                        <div>
                          <p className="text-sm font-black text-slate-950">{item.label}</p>
                          <p className="mt-1 text-xs text-slate-500">{item.description}</p>
                          <p className="mt-1 text-[11px] uppercase tracking-[0.2em] text-slate-400">{item.date ? formatDate(item.date) : 'Unknown date'}</p>
                        </div>
                      </div>
                    ))}
                  </div>
                </CardContent>
              </Card>
            </div>
          )}
        </div>
      </aside>
    </div>
  );
}

function DetailMetric({ label, value }: { label: string; value: string }) {
  return <div className="rounded-lg border border-slate-200 bg-slate-50 p-3"><p className="text-[9px] font-black uppercase tracking-widest text-slate-400">{label}</p><p className="mt-1 text-sm font-black text-slate-900">{value}</p></div>;
}
