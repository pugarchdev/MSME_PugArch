import { useEffect, useMemo, useState } from 'react';
import { CreditCard, RefreshCw, Search, ShieldCheck } from 'lucide-react';
import { Button } from '../../../components/ui/button';
import { Card, CardContent } from '../../../components/ui/card';
import { getApi } from '../../shared/apiClient';
import { EmptyState, ErrorState, LoadingState } from '../../shared/FeatureStates';
import { formatCurrency, formatDate } from '../../shared/format';

type PaymentRow = {
  id: number;
  referenceId: string;
  amount: string | number;
  currency?: string;
  status?: string;
  gateway?: string;
  method?: string;
  createdAt?: string;
  completedAt?: string;
  metadata?: any;
  ledgerEntries?: Array<{ id: number; entryType: string; amount: string | number; createdAt?: string }>;
  escrowAccount?: { id: number; status?: string; amount?: string | number };
};

export default function PaymentHistoryPage({ admin = false }: { admin?: boolean }) {
  const [payments, setPayments] = useState<PaymentRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [searchTerm, setSearchTerm] = useState('');

  const reload = async () => {
    setLoading(true);
    setError(null);
    try {
      const body = await getApi<any>('/api/payments', true);
      setPayments(Array.isArray(body) ? body : body.payments || body.data || []);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unable to load payments');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void reload();
  }, []);

  const filtered = useMemo(() => {
    const term = searchTerm.trim().toLowerCase();
    return payments.filter(payment => !term || [payment.referenceId, payment.status, payment.gateway, payment.method].filter(Boolean).join(' ').toLowerCase().includes(term));
  }, [payments, searchTerm]);

  if (loading) return <LoadingState label="Loading payment history..." />;
  if (error) return <ErrorState message={error} onRetry={reload} />;

  return (
    <div className="space-y-4">
      <div className="flex flex-col gap-3 border-b border-slate-200 pb-4 md:flex-row md:items-end md:justify-between">
        <div>
          <p className="text-[10px] font-black uppercase tracking-widest text-[#12335f]">{admin ? 'Admin Finance' : 'Finance'}</p>
          <h1 className="text-2xl font-black text-slate-950">Payment History</h1>
          <p className="mt-1 text-xs font-semibold text-slate-500">Payment status, escrow linkage, tax/TDS summary, and immutable ledger entries.</p>
        </div>
        <Button variant="outline" onClick={reload} className="h-10 rounded-lg text-xs font-black uppercase"><RefreshCw className="mr-2 h-4 w-4" />Refresh</Button>
      </div>

      <div className="grid grid-cols-1 gap-3 md:grid-cols-3">
        <Metric label="Payments" value={payments.length} icon={CreditCard} />
        <Metric label="Successful" value={payments.filter(payment => payment.status === 'success' || payment.status === 'escrow_released').length} icon={ShieldCheck} />
        <Metric label="Escrow Held" value={payments.filter(payment => payment.escrowAccount?.status === 'held').length} icon={ShieldCheck} />
      </div>

      <Card><CardContent className="p-4"><div className="relative"><Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" /><input value={searchTerm} onChange={event => setSearchTerm(event.target.value)} placeholder="Search reference, status, gateway..." className="h-10 w-full rounded-lg border border-slate-200 pl-10 pr-3 text-xs font-semibold outline-none focus:ring-2 focus:ring-[#12335f]/20" /></div></CardContent></Card>

      {filtered.length === 0 ? <EmptyState title="No payments found" /> : (
        <div className="overflow-hidden rounded-lg border border-slate-200 bg-white">
          <div className="overflow-x-auto">
            <table className="w-full min-w-[980px] text-left text-sm">
              <thead className="bg-slate-50 text-[10px] font-black uppercase tracking-wider text-slate-500"><tr><th className="p-3">Reference</th><th className="p-3">Gateway</th><th className="p-3">Amount</th><th className="p-3">Tax/TDS</th><th className="p-3">Escrow</th><th className="p-3">Ledger</th><th className="p-3">Status</th><th className="p-3">Date</th></tr></thead>
              <tbody className="divide-y divide-slate-100">
                {filtered.map(payment => {
                  const tax = payment.metadata?.taxSummary || {};
                  return (
                    <tr key={payment.id} className="hover:bg-slate-50">
                      <td className="p-3 font-mono text-xs font-black text-[#12335f]">{payment.referenceId}</td>
                      <td className="p-3 text-xs font-bold uppercase text-slate-600">{payment.gateway || 'manual'} / {payment.method || 'bank_transfer'}</td>
                      <td className="p-3 text-xs font-black">{formatCurrency(payment.amount)}</td>
                      <td className="p-3 text-[10px] font-bold text-slate-500">GST {formatCurrency(tax.totalTaxAmount || 0)} | TDS {formatCurrency(tax.tdsAmount || 0)}</td>
                      <td className="p-3 text-xs font-bold text-slate-600">{payment.escrowAccount ? `#${payment.escrowAccount.id} ${payment.escrowAccount.status}` : 'Not funded'}</td>
                      <td className="p-3 text-xs font-bold text-slate-600">{payment.ledgerEntries?.length || 0} entries</td>
                      <td className="p-3"><span className="rounded-lg border border-blue-200 bg-blue-50 px-3 py-1 text-[10px] font-black uppercase text-blue-700">{String(payment.status || 'initiated').replace(/_/g, ' ')}</span></td>
                      <td className="p-3 text-xs font-bold text-slate-500">{formatDate(payment.completedAt || payment.createdAt)}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
}

function Metric({ label, value, icon: Icon }: { label: string; value: number; icon: any }) {
  return <Card><CardContent className="flex items-center justify-between p-4"><div><p className="text-[9px] font-black uppercase tracking-widest text-slate-400">{label}</p><p className="mt-1 text-2xl font-black text-slate-950">{value}</p></div><div className="flex h-10 w-10 items-center justify-center rounded-lg bg-[#12335f] text-white"><Icon className="h-5 w-5" /></div></CardContent></Card>;
}
