import { useMemo, useState } from 'react';
import { RefreshCw, Search } from 'lucide-react';
import { Button } from '../../components/ui/button';
import { Card, CardContent } from '../../components/ui/card';
import { EmptyState, ErrorState, LoadingState } from './FeatureStates';
import { formatCurrency, formatDate } from './format';
import { useFeatureQuery } from './hooks';

type GenericRecord = Record<string, any>;

const valueOf = (record: GenericRecord, keys: string[]) => keys.map(key => record?.[key]).find(value => value !== undefined && value !== null && value !== '');
const titleOf = (record: GenericRecord) => String(valueOf(record, ['title', 'name', 'subject', 'poNumber', 'invoiceNumber', 'ticketNumber', 'ruleCode']) || `Record #${record.id || '-'}`);
const statusOf = (record: GenericRecord) => String(valueOf(record, ['status', 'statusEnum', 'poStatus', 'invoiceStatus', 'paymentStatus']) || 'active');

export default function GenericFeaturePage({ title, eyebrow, description, endpoint, emptyTitle = 'No records found' }: { title: string; eyebrow: string; description: string; endpoint: string; emptyTitle?: string }) {
  const { data, loading, error, reload } = useFeatureQuery<GenericRecord[]>(endpoint, []);
  const [searchTerm, setSearchTerm] = useState('');
  const records = Array.isArray(data)
    ? data
    : Object.entries((data || {}) as GenericRecord).map(([key, value]) => ({ id: key, title: key.replace(/([A-Z])/g, ' $1'), value }));
  const filtered = useMemo(() => {
    const term = searchTerm.trim().toLowerCase();
    return records.filter(record => !term || JSON.stringify(record).toLowerCase().includes(term));
  }, [records, searchTerm]);

  if (loading) return <LoadingState label={`Loading ${title.toLowerCase()}...`} />;
  if (error) return <ErrorState message={error} onRetry={reload} />;

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

      <Card>
        <CardContent className="p-4">
          <div className="relative">
            <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
            <input value={searchTerm} onChange={event => setSearchTerm(event.target.value)} placeholder={`Search ${title.toLowerCase()}...`} className="h-10 w-full rounded-lg border border-slate-200 bg-white pl-10 pr-3 text-xs font-semibold outline-none focus:ring-2 focus:ring-[#12335f]/20" />
          </div>
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
                    <td className="p-3"><p className="font-black text-slate-900">{titleOf(record)}</p><p className="text-[10px] font-semibold text-slate-500">#{record.id || record._id || 'new'}</p></td>
                    <td className="p-3"><span className="rounded-lg border border-blue-200 bg-blue-50 px-3 py-1 text-[10px] font-black uppercase text-blue-700">{statusOf(record).replace(/_/g, ' ')}</span></td>
                    <td className="p-3 text-xs font-black text-slate-900">{typeof valueOf(record, ['amount', 'totalAmount', 'totalValue', 'value', 'estimatedValue']) === 'number' ? formatCurrency(valueOf(record, ['amount', 'totalAmount', 'totalValue', 'value', 'estimatedValue']) || 0) : String(valueOf(record, ['amount', 'totalAmount', 'totalValue', 'value', 'estimatedValue']) || '-')}</td>
                    <td className="p-3 text-xs font-bold text-slate-500">{formatDate(valueOf(record, ['createdAt', 'updatedAt', 'dueDate', 'requiredBy']))}</td>
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
