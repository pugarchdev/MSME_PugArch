import { useMemo, useState } from 'react';
import { PackageSearch, RefreshCw, Search } from 'lucide-react';
import { Button } from '../../../components/ui/button';
import { Card, CardContent } from '../../../components/ui/card';
import { EmptyState, ErrorState, LoadingState } from '../../shared/FeatureStates';
import { formatCurrency } from '../../shared/format';
import { useFeatureQuery } from '../../shared/hooks';
import type { CatalogueItemDto } from '../../shared/types';

export default function CataloguePage({ mode = 'buyer' }: { mode?: 'buyer' | 'seller' }) {
  const endpoint = mode === 'seller' ? '/api/seller/products' : '/api/products/search';
  const { data, loading, error, reload } = useFeatureQuery<CatalogueItemDto[]>(endpoint, []);
  const [searchTerm, setSearchTerm] = useState('');
  const filtered = useMemo(() => {
    const term = searchTerm.trim().toLowerCase();
    return data.filter(item => !term || [item.name, item.description, item.category?.name].filter(Boolean).join(' ').toLowerCase().includes(term));
  }, [data, searchTerm]);

  if (loading) return <LoadingState label="Loading catalogue..." />;
  if (error) return <ErrorState message={error} onRetry={reload} />;

  return (
    <div className="space-y-4">
      <div className="flex flex-col gap-3 border-b border-slate-200 pb-4 md:flex-row md:items-end md:justify-between">
        <div><p className="text-[10px] font-black uppercase tracking-widest text-[#12335f]">{mode === 'seller' ? 'Seller Catalogue' : 'Buyer Catalogue Search'}</p><h1 className="text-2xl font-black text-slate-950">Catalogue</h1><p className="mt-1 text-xs font-semibold text-slate-500">Products and services loaded from live catalogue APIs.</p></div>
        <Button variant="outline" onClick={reload} className="h-10 rounded-lg text-xs font-black uppercase"><RefreshCw className="mr-2 h-4 w-4" />Refresh</Button>
      </div>
      <Card><CardContent className="p-4"><div className="relative"><Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" /><input value={searchTerm} onChange={event => setSearchTerm(event.target.value)} placeholder="Search product, service, category..." className="h-10 w-full rounded-lg border border-slate-200 pl-10 pr-3 text-xs font-semibold outline-none focus:ring-2 focus:ring-[#12335f]/20" /></div></CardContent></Card>
      {filtered.length === 0 ? <EmptyState title="No catalogue items" /> : (
        <div className="grid grid-cols-1 gap-3 md:grid-cols-2 xl:grid-cols-3">
          {filtered.map(item => (
            <Card key={item.id}>
              <CardContent className="p-4">
                <div className="flex items-start gap-3">
                  <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-[#12335f] text-white"><PackageSearch className="h-5 w-5" /></div>
                  <div className="min-w-0"><h3 className="break-words text-sm font-black text-slate-950">{item.name}</h3><p className="mt-1 line-clamp-2 text-xs font-semibold text-slate-500">{item.description || 'No description provided'}</p><p className="mt-3 text-xs font-black text-[#12335f]">{formatCurrency(item.price || item.basePrice)}</p></div>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}
