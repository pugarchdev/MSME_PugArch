import { useEffect, useMemo, useState } from 'react';
import { CheckCircle2, CreditCard, Landmark, Loader2, LockKeyhole, RefreshCw, ShieldCheck, ArrowUp, ArrowDown, ArrowUpDown } from 'lucide-react';
import { toast } from 'sonner';
import { api } from '../lib/api';
import { useAuth } from '../hooks/useAuth';
import { Button } from '../components/ui/button';
import { Card, CardContent } from '../components/ui/card';
import { cn } from '../lib/utils';
import { Pagination } from '../features/shared/Pagination';
import { usePagination } from '../features/shared/hooks';

type Payment = {
  id: number;
  referenceId: string;
  amount: string | number;
  currency: string;
  status: string;
  gateway?: string;
  method?: string;
  invoiceId?: number;
  gatewayOrderId?: string;
  escrowAccount?: EscrowAccount;
};

type Milestone = {
  id: number;
  title: string;
  amount: string | number;
  currency: string;
  status: string;
  completedAt?: string;
  approvedAt?: string;
};

type EscrowAccount = {
  id: number;
  amount: string | number;
  currency: string;
  status: string;
  buyerId: number;
  sellerId: number;
  paymentTransaction?: Payment;
  milestones?: Milestone[];
};

const money = (amount: string | number, currency = 'INR') =>
  new Intl.NumberFormat('en-IN', { style: 'currency', currency, maximumFractionDigits: 0 }).format(Number(amount || 0));

const statusClass = (status: string) => {
  const normalized = status.toLowerCase();
  if (['success', 'held', 'approved', 'released', 'escrow_released', 'paid'].includes(normalized)) return 'bg-emerald-50 text-emerald-700 border-emerald-200';
  if (['failed', 'frozen', 'refunded'].includes(normalized)) return 'bg-rose-50 text-rose-700 border-rose-200';
  return 'bg-amber-50 text-amber-700 border-amber-200';
};

export default function PaymentsEscrow() {
  const { token, user } = useAuth();
  const [payments, setPayments] = useState<Payment[]>([]);
  const [escrowAccounts, setEscrowAccounts] = useState<EscrowAccount[]>([]);
  const [loading, setLoading] = useState(true);
  const [activeTab, setActiveTab] = useState<'payments' | 'escrow'>('payments');
  const [invoiceId, setInvoiceId] = useState('');
  const [gateway, setGateway] = useState('bank_transfer');
  const [method, setMethod] = useState('bank_transfer');

  const [sortField, setSortField] = useState<'referenceId' | 'invoiceId' | 'gateway' | 'amount' | 'status'>('referenceId');
  const [sortOrder, setSortOrder] = useState<'asc' | 'desc'>('desc');

  const toggleSort = (field: 'referenceId' | 'invoiceId' | 'gateway' | 'amount' | 'status') => {
    if (sortField === field) {
      setSortOrder(sortOrder === 'asc' ? 'desc' : 'asc');
    } else {
      setSortField(field);
      setSortOrder('asc');
    }
  };

  const SortHeader = ({ label, field, className = '' }: { label: string; field: 'referenceId' | 'invoiceId' | 'gateway' | 'amount' | 'status'; className?: string }) => {
    const isActive = sortField === field;
    return (
      <button
        type="button"
        onClick={() => toggleSort(field)}
        className={cn(
          "inline-flex items-center gap-1 text-[10px] font-black uppercase tracking-wider text-slate-500 hover:text-[#12335f] transition-colors",
          isActive && "text-[#12335f]",
          className
        )}
      >
        {label}
        {isActive ? (
          sortOrder === 'asc' ? (
            <ArrowUp className="h-3 w-3 text-[#12335f]" />
          ) : (
            <ArrowDown className="h-3 w-3 text-[#12335f]" />
          )
        ) : (
          <ArrowUpDown className="h-3 w-3 opacity-45" />
        )}
      </button>
    );
  };

  const sortedPayments = useMemo(() => {
    return [...payments].sort((a, b) => {
      let aVal: any = '';
      let bVal: any = '';

      if (sortField === 'referenceId') {
        aVal = a.referenceId || '';
        bVal = b.referenceId || '';
      } else if (sortField === 'invoiceId') {
        aVal = Number(a.invoiceId || 0);
        bVal = Number(b.invoiceId || 0);
      } else if (sortField === 'gateway') {
        aVal = a.gateway || '';
        bVal = b.gateway || '';
      } else if (sortField === 'amount') {
        aVal = Number(a.amount || 0);
        bVal = Number(b.amount || 0);
      } else if (sortField === 'status') {
        aVal = a.status || '';
        bVal = b.status || '';
      }

      if (typeof aVal === 'string') {
        return sortOrder === 'asc' ? aVal.localeCompare(bVal) : bVal.localeCompare(aVal);
      } else {
        return sortOrder === 'asc' ? aVal - bVal : bVal - aVal;
      }
    });
  }, [payments, sortField, sortOrder]);
  const { page: paymentsPage, pageSize: paymentsPageSize, pageItems: pagedPayments, total: paymentsTotal, setPage: setPaymentsPage, setPageSize: setPaymentsPageSize } = usePagination(sortedPayments, 10);
  const { page: escrowPage, pageSize: escrowPageSize, pageItems: pagedEscrowAccounts, total: escrowTotal, setPage: setEscrowPage, setPageSize: setEscrowPageSize } = usePagination(escrowAccounts, 10);

  const headers = useMemo<Record<string, string>>(() => {
    if (!token) {
      const emptyHeaders: Record<string, string> = {};
      return emptyHeaders;
    }
    return { Authorization: `Bearer ${token}` };
  }, [token]);

  const load = async () => {
    if (!token) return;
    setLoading(true);
    try {
      const [paymentRes, escrowRes] = await Promise.all([
        api.fetch('/api/payments?skip=0&take=100', { method: 'GET', headers }),
        api.fetch('/api/escrow?skip=0&take=100', { method: 'GET', headers })
      ]);
      if (paymentRes.ok) {
        const data = await paymentRes.json();
        setPayments(data.payments || []);
      }
      if (escrowRes.ok) {
        const data = await escrowRes.json();
        setEscrowAccounts(data.escrowAccounts || []);
      }
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void load();
  }, [token]);

  const initiate = async () => {
    if (!invoiceId.trim()) {
      toast.error('Enter an invoice id first.');
      return;
    }
    const idempotencyKey = `ui-${Date.now()}-${crypto.randomUUID()}`;
    const res = await api.post('/api/payments/initiate', {
      invoiceId: Number(invoiceId),
      gateway,
      method,
      idempotencyKey
    }, { headers: { ...headers, 'Idempotency-Key': idempotencyKey } });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) {
      toast.error(data.message || 'Payment initiation failed.');
      return;
    }
    toast.success('Payment order created. Awaiting gateway/webhook confirmation.');
    setInvoiceId('');
    await load();
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
    toast.success('Milestone approved and escrow release recorded.');
    await load();
  };

  const totalHeld = escrowAccounts.filter(item => item.status === 'held').reduce((sum, item) => sum + Number(item.amount || 0), 0);
  const confirmedPayments = payments.filter(payment => ['success', 'escrow_released'].includes(payment.status)).length;

  return (
    <div className="space-y-4">
      <div className="flex flex-col gap-3 border-b border-slate-200 pb-4 lg:flex-row lg:items-end lg:justify-between">
        <div>
          <p className="text-[10px] font-black uppercase tracking-[0.25em] text-slate-400">Secure Finance</p>
          <h1 className="mt-1 text-2xl font-black text-slate-950">Payments & Escrow</h1>
        </div>
        <Button onClick={load} disabled={loading} className="w-fit bg-[#12335f] text-white hover:bg-[#0b2445]">
          {loading ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <RefreshCw className="mr-2 h-4 w-4" />}
          Refresh
        </Button>
      </div>

      <div className="grid gap-3 md:grid-cols-3">
        {[
          { label: 'Payments', value: payments.length, icon: CreditCard },
          { label: 'Confirmed', value: confirmedPayments, icon: CheckCircle2 },
          { label: 'Escrow Held', value: money(totalHeld), icon: LockKeyhole }
        ].map(item => (
          <Card key={item.label} className="rounded-lg border-slate-200 shadow-none">
            <CardContent className="flex items-center justify-between p-4">
              <div>
                <p className="text-[10px] font-black uppercase tracking-wide text-slate-400">{item.label}</p>
                <p className="mt-1 text-xl font-black text-slate-950">{item.value}</p>
              </div>
              <item.icon className="h-5 w-5 text-[#12335f]" />
            </CardContent>
          </Card>
        ))}
      </div>

      <div className="flex gap-2">
        {[
          { key: 'payments', label: 'Payment Initiation & History', icon: CreditCard },
          { key: 'escrow', label: 'Escrow & Milestones', icon: Landmark }
        ].map(tab => (
          <button
            key={tab.key}
            onClick={() => setActiveTab(tab.key as any)}
            className={cn(
              'inline-flex items-center gap-2 rounded-md border px-3 py-2 text-xs font-black uppercase tracking-wide',
              activeTab === tab.key ? 'border-[#12335f] bg-[#12335f] text-white' : 'border-slate-200 bg-white text-slate-600'
            )}
          >
            <tab.icon className="h-4 w-4" />
            {tab.label}
          </button>
        ))}
      </div>

      {activeTab === 'payments' && (
        <div className="grid gap-4 xl:grid-cols-[360px_1fr]">
          <Card className="rounded-lg border-slate-200 shadow-none">
            <CardContent className="space-y-3 p-4">
              <h2 className="text-sm font-black text-slate-950">Initiate Payment</h2>
              <input value={invoiceId} onChange={event => setInvoiceId(event.target.value)} placeholder="Invoice ID" className="h-10 w-full rounded-md border border-slate-200 px-3 text-sm outline-none focus:border-[#12335f]" />
              <select value={gateway} onChange={event => setGateway(event.target.value)} className="h-10 w-full rounded-md border border-slate-200 px-3 text-sm outline-none">
                <option value="bank_transfer">Bank Transfer</option>
                <option value="razorpay">Razorpay</option>
                <option value="cashfree">Cashfree</option>
              </select>
              <select value={method} onChange={event => setMethod(event.target.value)} className="h-10 w-full rounded-md border border-slate-200 px-3 text-sm outline-none">
                <option value="bank_transfer">Bank Transfer</option>
                <option value="upi">UPI</option>
                <option value="card">Card via Gateway</option>
                <option value="netbanking">Net Banking via Gateway</option>
              </select>
              <Button onClick={initiate} className="w-full bg-[#12335f] text-white hover:bg-[#0b2445]">
                <ShieldCheck className="mr-2 h-4 w-4" />
                Create Gateway Order
              </Button>
            </CardContent>
          </Card>

          <div className="overflow-x-auto rounded-lg border border-slate-200 bg-white">
            <table className="w-full min-w-[760px] text-left text-sm">
              <thead className="bg-slate-50 text-[10px] font-black uppercase tracking-wide text-slate-500">
                <tr>
                  <th className="px-4 py-3"><SortHeader label="Reference" field="referenceId" /></th>
                  <th className="px-4 py-3"><SortHeader label="Invoice" field="invoiceId" /></th>
                  <th className="px-4 py-3"><SortHeader label="Gateway" field="gateway" /></th>
                  <th className="px-4 py-3"><SortHeader label="Amount" field="amount" /></th>
                  <th className="px-4 py-3"><SortHeader label="Status" field="status" /></th>
                </tr>
              </thead>
              <tbody>
                {pagedPayments.map(payment => (
                  <tr key={payment.id} className="border-t border-slate-100">
                    <td className="px-4 py-3 font-bold text-slate-900">{payment.referenceId}</td>
                    <td className="px-4 py-3 text-slate-600">{payment.invoiceId || '-'}</td>
                    <td className="px-4 py-3 text-slate-600">{payment.gateway || 'pending'}</td>
                    <td className="px-4 py-3 font-bold">{money(payment.amount, payment.currency)}</td>
                    <td className="px-4 py-3"><span className={cn('rounded-full border px-2 py-1 text-[10px] font-black uppercase', statusClass(payment.status))}>{payment.status}</span></td>
                  </tr>
                ))}
                {sortedPayments.length === 0 && <tr><td colSpan={5} className="px-4 py-8 text-center text-sm text-slate-500">No payment records yet.</td></tr>}
              </tbody>
            </table>
            <Pagination page={paymentsPage} pageSize={paymentsPageSize} total={paymentsTotal} onPageChange={setPaymentsPage} onPageSizeChange={setPaymentsPageSize} label="payments" />
          </div>
        </div>
      )}

      {activeTab === 'escrow' && (
        <div className="space-y-3">
          {pagedEscrowAccounts.map(escrow => (
            <Card key={escrow.id} className="rounded-lg border-slate-200 shadow-none">
              <CardContent className="space-y-4 p-4">
                <div className="flex flex-col gap-2 md:flex-row md:items-center md:justify-between">
                  <div>
                    <p className="text-sm font-black text-slate-950">Escrow #{escrow.id}</p>
                    <p className="text-xs font-bold text-slate-500">{money(escrow.amount, escrow.currency)} held for payment {escrow.paymentTransaction?.referenceId}</p>
                  </div>
                  <span className={cn('w-fit rounded-full border px-2 py-1 text-[10px] font-black uppercase', statusClass(escrow.status))}>{escrow.status}</span>
                </div>
                <div className="grid gap-2">
                  {(escrow.milestones || []).map(milestone => (
                    <div key={milestone.id} className="flex flex-col gap-3 rounded-md border border-slate-200 p-3 md:flex-row md:items-center md:justify-between">
                      <div>
                        <p className="text-sm font-bold text-slate-950">{milestone.title}</p>
                        <p className="text-xs text-slate-500">{money(milestone.amount, milestone.currency)} · {milestone.status}</p>
                      </div>
                      <div className="flex gap-2">
                        {user?.role === 'seller' && milestone.status === 'pending' && <Button size="sm" onClick={() => completeMilestone(milestone.id)}>Complete</Button>}
                        {user?.role !== 'seller' && milestone.status === 'completed' && <Button size="sm" onClick={() => approveMilestone(milestone.id)} className="bg-[#12335f] text-white">Approve</Button>}
                      </div>
                    </div>
                  ))}
                  {(escrow.milestones || []).length === 0 && <p className="rounded-md bg-slate-50 px-3 py-4 text-sm text-slate-500">No milestones created yet.</p>}
                </div>
              </CardContent>
            </Card>
          ))}
          {escrowAccounts.length === 0 && <div className="rounded-lg border border-slate-200 bg-white p-8 text-center text-sm text-slate-500">No escrow accounts yet.</div>}
          {escrowAccounts.length > 0 && (
            <div className="overflow-hidden rounded-lg border border-slate-200 bg-white">
              <Pagination page={escrowPage} pageSize={escrowPageSize} total={escrowTotal} onPageChange={setEscrowPage} onPageSizeChange={setEscrowPageSize} label="escrow accounts" />
            </div>
          )}
        </div>
      )}
    </div>
  );
}
