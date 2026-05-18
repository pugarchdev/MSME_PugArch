import { useMemo, useState } from 'react';
import type { ComponentType } from 'react';
import { CalendarDays, ClipboardList, IndianRupee, RefreshCw, Search, SlidersHorizontal } from 'lucide-react';
import { Button } from '../../components/ui/button';
import { Card, CardContent } from '../../components/ui/card';
import { EmptyState, InlineError, LoadingState } from './FeatureStates';
import { formatCurrency, formatDate } from './format';
import { useFeatureQuery } from './hooks';

type GenericRecord = Record<string, any>;

const valueOf = (record: GenericRecord, keys: string[]) => keys.map(key => record?.[key]).find(value => value !== undefined && value !== null && value !== '');
const titleOf = (record: GenericRecord) => String(valueOf(record, ['title', 'name', 'subject', 'poNumber', 'invoiceNumber', 'ticketNumber', 'ruleCode']) || `Record #${record.id || '-'}`);
const statusOf = (record: GenericRecord) => String(valueOf(record, ['status', 'statusEnum', 'poStatus', 'invoiceStatus', 'paymentStatus']) || 'active');
const amountOf = (record: GenericRecord) => valueOf(record, ['amount', 'totalAmount', 'totalValue', 'value', 'estimatedValue', 'budget']);
const dateOf = (record: GenericRecord) => valueOf(record, ['requiredBy', 'dueDate', 'closesAt', 'expectedDelivery', 'createdAt', 'updatedAt']);
const partyOf = (record: GenericRecord) => {
  const seller = record.seller?.name || record.supplier?.name || (record.sellerId ? `Seller #${record.sellerId}` : '');
  const buyer = record.buyer?.name || (record.buyerId ? `Buyer #${record.buyerId}` : '');
  return [seller, buyer].filter(Boolean).join(' | ');
};
const detailOf = (record: GenericRecord) => {
  const identifiers = [record.requirementNumber, record.purchaseNumber, record.tenderId, record.responseNumber, record.referenceId, record.trackingNumber].filter(Boolean);
  const method = record.procurementMethod ? String(record.procurementMethod).replace(/_/g, ' ') : '';
  return [identifiers.join(' | '), method, partyOf(record)].filter(Boolean).join(' | ') || record.description || record.message || 'Workflow record';
};

export default function GenericFeaturePage({ title, eyebrow, description, endpoint, emptyTitle = 'No records found' }: { title: string; eyebrow: string; description: string; endpoint: string; emptyTitle?: string }) {
  const { data, loading, error, reload } = useFeatureQuery<GenericRecord[]>(endpoint, []);
  const [searchTerm, setSearchTerm] = useState('');
  const [statusFilter, setStatusFilter] = useState('');
  const [valueFilter, setValueFilter] = useState('');
  const records: GenericRecord[] = Array.isArray(data)
    ? data
    : Object.entries((data || {}) as GenericRecord).map(([key, value]) => ({ id: key, title: key.replace(/([A-Z])/g, ' $1'), value }));
  const statusOptions = useMemo(() => Array.from(new Set(records.map(statusOf).filter(Boolean))).sort(), [records]);
  const filtered = useMemo(() => {
    const term = searchTerm.trim().toLowerCase();
    return records.filter(record => {
      const amount = Number(amountOf(record) || 0);
      const matchesSearch = !term || JSON.stringify(record).toLowerCase().includes(term);
      const matchesStatus = !statusFilter || statusOf(record) === statusFilter;
      const matchesValue = !valueFilter || (valueFilter === 'high' ? amount >= 100000 : valueFilter === 'medium' ? amount >= 25000 && amount < 100000 : amount < 25000);
      return matchesSearch && matchesStatus && matchesValue;
    });
  }, [records, searchTerm, statusFilter, valueFilter]);
  const totalValue = filtered.reduce<number>((sum, record) => sum + Number(amountOf(record) || 0), 0);
  const pendingCount = filtered.filter(record => /pending|draft|requested|sent|generated/i.test(statusOf(record))).length;

  if (loading) return <LoadingState label={`Loading ${title.toLowerCase()}...`} />;

  return (
    <div className="space-y-4">
      <div className="flex flex-col gap-3 border-b border-slate-200 pb-4 md:flex-row md:items-end md:justify-between">
        <div>
          <p className="text-[10px] font-black uppercase tracking-widest text-[#12335f]">{eyebrow}</p>
          <h1 className="text-2xl font-black tracking-tight text-slate-950">{title}</h1>
          <p className="mt-1 max-w-2xl text-xs font-semibold text-slate-500">{description}</p>
        </div>
        <Button variant="outline" onClick={reload} className="h-10 rounded-lg text-xs font-black uppercase"><RefreshCw className="mr-2 h-4 w-4" />Refresh</Button>
      </div>

      <div className="grid gap-3 md:grid-cols-3">
        <Metric label="Records" value={filtered.length} icon={ClipboardList} />
        <Metric label="Pending Action" value={pendingCount} icon={CalendarDays} />
        <Metric label="Tracked Value" value={formatCurrency(totalValue)} icon={IndianRupee} />
      </div>

      {error && <InlineError message={error} onRetry={reload} />}

      <Card>
        <CardContent className="grid gap-3 p-4 lg:grid-cols-[1fr_190px_190px]">
          <div className="relative">
            <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
            <input value={searchTerm} onChange={event => setSearchTerm(event.target.value)} placeholder={`Search ${title.toLowerCase()}...`} className="h-10 w-full rounded-lg border border-slate-200 bg-white pl-10 pr-3 text-xs font-semibold outline-none focus:ring-2 focus:ring-[#12335f]/20" />
          </div>
          <div className="relative">
            <SlidersHorizontal className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
            <select value={statusFilter} onChange={event => setStatusFilter(event.target.value)} className="h-10 w-full rounded-lg border border-slate-200 bg-white pl-10 pr-3 text-xs font-bold outline-none focus:ring-2 focus:ring-[#12335f]/20">
              <option value="">All statuses</option>
              {statusOptions.map(status => <option key={status} value={status}>{status.replace(/_/g, ' ')}</option>)}
            </select>
          </div>
          <select value={valueFilter} onChange={event => setValueFilter(event.target.value)} className="h-10 rounded-lg border border-slate-200 bg-white px-3 text-xs font-bold outline-none focus:ring-2 focus:ring-[#12335f]/20">
            <option value="">All values</option>
            <option value="high">Above Rs. 1 lakh</option>
            <option value="medium">Rs. 25k to 1 lakh</option>
            <option value="low">Below Rs. 25k</option>
          </select>
        </CardContent>
      </Card>

      {filtered.length === 0 ? <EmptyState title={emptyTitle} /> : (
        <div className="overflow-hidden rounded-lg border border-slate-200 bg-white">
          <div className="overflow-x-auto">
            <table className="w-full min-w-[760px] text-left text-sm">
              <thead className="bg-slate-50 text-[10px] font-black uppercase tracking-wider text-slate-500">
                <tr><th className="p-3">Record</th><th className="p-3">Status</th><th className="p-3">Value</th><th className="p-3">Date</th></tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {filtered.map(record => (
                  <tr key={record.id || titleOf(record)} className="hover:bg-slate-50">
                    <td className="p-3"><p className="font-black text-slate-900">{titleOf(record)}</p><p className="mt-1 max-w-md truncate text-[10px] font-semibold text-slate-500">{detailOf(record)}</p></td>
                    <td className="p-3"><span className="rounded-lg border border-blue-200 bg-blue-50 px-3 py-1 text-[10px] font-black uppercase text-blue-700">{statusOf(record).replace(/_/g, ' ')}</span></td>
                    <td className="p-3 text-xs font-black text-slate-900">{amountOf(record) ? formatCurrency(amountOf(record)) : '-'}</td>
                    <td className="p-3 text-xs font-bold text-slate-500">{formatDate(dateOf(record))}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
}

function Metric({ label, value, icon: Icon }: { label: string; value: string | number; icon: ComponentType<{ className?: string }> }) {
  return (
    <div className="rounded-lg border border-slate-200 bg-white p-4">
      <div className="flex items-center justify-between gap-3">
        <div>
          <p className="text-[10px] font-black uppercase tracking-widest text-slate-500">{label}</p>
          <p className="mt-1 text-lg font-black text-slate-950">{value}</p>
        </div>
        <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-blue-50 text-[#12335f]">
          <Icon className="h-5 w-5" />
        </div>
      </div>
    </div>
  );
}
