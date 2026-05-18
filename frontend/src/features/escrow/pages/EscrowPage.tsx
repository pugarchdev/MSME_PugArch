import { useEffect, useMemo, useState } from 'react';
import { CheckCircle2, Eye, Landmark, Loader2, LockKeyhole, RefreshCw, Search, ShieldAlert, X } from 'lucide-react';
import { toast } from 'sonner';
import { api } from '../../../lib/api';
import { useAuth } from '../../../hooks/useAuth';
import { Button } from '../../../components/ui/button';
import { Card, CardContent } from '../../../components/ui/card';
import { cn } from '../../../lib/utils';
import { formatCurrency, formatDate } from '../../shared/format';

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
  const [selected, setSelected] = useState<EscrowAccount | null>(null);

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
      const res = await api.fetch('/api/escrow', { method: 'GET', headers, skipCache: true });
      const body = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(body.message || 'Unable to load escrow accounts');
      setEscrows(body.escrowAccounts || body.data || []);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unable to load escrow accounts');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void load();
  }, [token]);

  const filtered = useMemo(() => {
    const term = query.trim().toLowerCase();
    return escrows.filter(escrow => {
      const matchesStatus = !status || escrow.status === status;
      const haystack = [escrow.id, escrow.status, escrow.paymentTransaction?.referenceId, escrow.purchaseOrder?.poNumber, escrow.buyerId, escrow.sellerId].filter(Boolean).join(' ').toLowerCase();
      return matchesStatus && (!term || haystack.includes(term));
    });
  }, [escrows, query, status]);

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
  if (error) return <div className="rounded-lg border border-rose-200 bg-rose-50 p-6 text-center"><p className="text-sm font-black text-rose-700">{error}</p><Button onClick={load} className="mt-4 bg-rose-700 text-white">Retry</Button></div>;

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

      <div className="grid gap-3 md:grid-cols-4">
        <Metric label="Escrow Accounts" value={escrows.length} icon={Landmark} />
        <Metric label="Amount Held" value={formatCurrency(totalHeld)} icon={LockKeyhole} />
        <Metric label="Milestones" value={milestoneCount} icon={CheckCircle2} />
        <Metric label="Frozen" value={frozenCount} icon={ShieldAlert} />
      </div>

      <Card><CardContent className="grid gap-3 p-4 md:grid-cols-[1fr_180px]">
        <div className="relative"><Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" /><input value={query} onChange={event => setQuery(event.target.value)} placeholder="Search escrow, payment reference, PO, buyer, seller..." className="h-10 w-full rounded-lg border border-slate-200 pl-10 pr-3 text-xs font-semibold outline-none focus:ring-2 focus:ring-[#12335f]/20" /></div>
        <select value={status} onChange={event => setStatus(event.target.value)} className="h-10 rounded-lg border border-slate-200 px-3 text-xs font-bold"><option value="">All statuses</option><option value="held">Held</option><option value="released">Released</option><option value="frozen">Frozen</option><option value="refunded">Refunded</option></select>
      </CardContent></Card>

      {filtered.length === 0 ? <div className="rounded-lg border border-dashed border-slate-300 bg-white p-10 text-center text-sm font-semibold text-slate-500">No escrow accounts match the current filters.</div> : (
        <div className="grid gap-3">
          {filtered.map(escrow => (
            <Card key={escrow.id} className="rounded-lg border-slate-200 shadow-none">
              <CardContent className="space-y-4 p-4">
                <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
                  <div>
                    <p className="text-sm font-black text-slate-950">Escrow #{escrow.id} | {formatCurrency(escrow.amount)}</p>
                    <p className="mt-1 text-xs font-bold text-slate-500">Payment {escrow.paymentTransaction?.referenceId || '-'} | PO {escrow.purchaseOrder?.poNumber || '-'}</p>
                  </div>
                  <div className="flex items-center gap-2">
                    <span className={cn('rounded-full border px-3 py-1 text-[10px] font-black uppercase', statusClass(escrow.status))}>{escrow.status}</span>
                    <Button variant="outline" onClick={() => setSelected(escrow)} className="h-9 rounded-lg text-xs font-black"><Eye className="mr-2 h-4 w-4" />Details</Button>
                  </div>
                </div>
                <div className="grid gap-2">
                  {(escrow.milestones || []).map(milestone => (
                    <div key={milestone.id} className="flex flex-col gap-3 rounded-lg border border-slate-200 p-3 md:flex-row md:items-center md:justify-between">
                      <div>
                        <p className="text-sm font-black text-slate-900">{milestone.title}</p>
                        <p className="text-xs font-semibold text-slate-500">{formatCurrency(milestone.amount)} | Due {formatDate(milestone.dueDate)} | {milestone.status}</p>
                      </div>
                      <div className="flex gap-2">
                        {user?.role === 'seller' && milestone.status === 'pending' && <Button size="sm" onClick={() => completeMilestone(milestone.id)}>Complete</Button>}
                        {user?.role !== 'seller' && milestone.status === 'completed' && <Button size="sm" onClick={() => approveMilestone(milestone.id)} className="bg-[#12335f] text-white">Approve Release</Button>}
                      </div>
                    </div>
                  ))}
                  {(escrow.milestones || []).length === 0 && <p className="rounded-md bg-slate-50 px-3 py-4 text-sm font-semibold text-slate-500">No milestones are configured for this escrow account.</p>}
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      {selected && <EscrowDetail escrow={selected} onClose={() => setSelected(null)} />}
    </div>
  );
}

function Metric({ label, value, icon: Icon }: { label: string; value: string | number; icon: any }) {
  return <Card><CardContent className="flex items-center justify-between p-4"><div><p className="text-[9px] font-black uppercase tracking-widest text-slate-400">{label}</p><p className="mt-1 text-xl font-black text-slate-950">{value}</p></div><Icon className="h-5 w-5 text-[#12335f]" /></CardContent></Card>;
}

function EscrowDetail({ escrow, onClose }: { escrow: EscrowAccount; onClose: () => void }) {
  return (
    <div className="fixed inset-0 z-50 flex justify-end bg-slate-950/30">
      <aside className="h-full w-full max-w-2xl overflow-y-auto bg-white shadow-xl">
        <div className="sticky top-0 z-10 flex items-start justify-between border-b border-slate-200 bg-white p-5">
          <div><p className="text-[10px] font-black uppercase tracking-widest text-[#12335f]">Escrow Detail</p><h2 className="mt-1 text-xl font-black text-slate-950">Escrow #{escrow.id}</h2><p className="mt-1 text-xs font-semibold text-slate-500">{formatCurrency(escrow.amount)} | {escrow.status}</p></div>
          <button onClick={onClose} className="rounded-lg border border-slate-200 p-2 text-slate-500 hover:bg-slate-50" aria-label="Close detail"><X className="h-4 w-4" /></button>
        </div>
        <div className="space-y-4 p-5">
          <div className="grid gap-3 md:grid-cols-3">
            <DetailMetric label="Buyer" value={`#${escrow.buyerId}`} />
            <DetailMetric label="Seller" value={`#${escrow.sellerId}`} />
            <DetailMetric label="Funded" value={formatDate(escrow.fundedAt || escrow.createdAt)} />
          </div>
          <Card><CardContent className="space-y-3 p-4"><p className="text-xs font-black uppercase tracking-widest text-slate-500">Release Transactions</p>{(escrow.transactions || []).length === 0 ? <p className="text-sm font-semibold text-slate-500">No escrow transaction entries yet.</p> : escrow.transactions?.map(item => <div key={item.id} className="rounded-lg border border-slate-200 p-3 text-sm"><p className="font-black text-slate-900">{item.type} | {formatCurrency(item.amount)}</p><p className="text-xs font-semibold text-slate-500">{formatDate(item.createdAt)}</p></div>)}</CardContent></Card>
          <pre className="max-h-[460px] overflow-auto rounded-lg bg-slate-950 p-4 text-xs font-semibold leading-relaxed text-slate-100">{JSON.stringify(escrow, null, 2)}</pre>
        </div>
      </aside>
    </div>
  );
}

function DetailMetric({ label, value }: { label: string; value: string }) {
  return <div className="rounded-lg border border-slate-200 bg-slate-50 p-3"><p className="text-[9px] font-black uppercase tracking-widest text-slate-400">{label}</p><p className="mt-1 text-sm font-black text-slate-900">{value}</p></div>;
}
