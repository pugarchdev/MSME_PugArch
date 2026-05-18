import { useMemo, useState } from 'react';
import { Boxes, IndianRupee, PackageSearch, RefreshCw, Search, Store } from 'lucide-react';
import { Button } from '../../../components/ui/button';
import { Card, CardContent } from '../../../components/ui/card';
import { EmptyState, InlineError, LoadingState } from '../../shared/FeatureStates';
import { formatCurrency } from '../../shared/format';
import { useFeatureQuery } from '../../shared/hooks';
import type { CatalogueItemDto } from '../../shared/types';

export default function CataloguePage({ mode = 'buyer' }: { mode?: 'buyer' | 'seller' }) {
  const endpoint = mode === 'seller' ? '/api/seller/products' : '/api/products/search';
  const { data, loading, error, reload } = useFeatureQuery<CatalogueItemDto[]>(endpoint, []);
  const [searchTerm, setSearchTerm] = useState('');
  const [statusFilter, setStatusFilter] = useState('');
  const [categoryFilter, setCategoryFilter] = useState('');
  const [priceFilter, setPriceFilter] = useState('');
  const categories = useMemo(() => Array.from(new Set(data.map(item => item.category?.name).filter(Boolean))).sort(), [data]);
  const statuses = useMemo(() => Array.from(new Set(data.map(item => item.status).filter(Boolean))).sort(), [data]);
  const filtered = useMemo(() => {
    const term = searchTerm.trim().toLowerCase();
    return data.filter(item => {
      const price = Number(item.price || item.basePrice || 0);
      const matchesSearch = !term || [item.name, item.description, item.category?.name].filter(Boolean).join(' ').toLowerCase().includes(term);
      const matchesStatus = !statusFilter || item.status === statusFilter;
      const matchesCategory = !categoryFilter || item.category?.name === categoryFilter;
      const matchesPrice = !priceFilter || (priceFilter === 'high' ? price >= 10000 : priceFilter === 'mid' ? price >= 1000 && price < 10000 : price < 1000);
      return matchesSearch && matchesStatus && matchesCategory && matchesPrice;
    });
  }, [categoryFilter, data, priceFilter, searchTerm, statusFilter]);
  const averageValue = filtered.length ? filtered.reduce((sum, item) => sum + Number(item.price || item.basePrice || 0), 0) / filtered.length : 0;

  if (loading) return <LoadingState label="Loading catalogue..." />;

  return (
    <div className="space-y-4">
      <div className="flex flex-col gap-3 border-b border-slate-200 pb-4 md:flex-row md:items-end md:justify-between">
        <div><p className="text-[10px] font-black uppercase tracking-widest text-[#12335f]">{mode === 'seller' ? 'Seller Catalogue' : 'Buyer Catalogue Search'}</p><h1 className="text-2xl font-black text-slate-950">Catalogue</h1><p className="mt-1 text-xs font-semibold text-slate-500">Products and services loaded from live catalogue APIs.</p></div>
        <Button variant="outline" onClick={reload} className="h-10 rounded-lg text-xs font-black uppercase"><RefreshCw className="mr-2 h-4 w-4" />Refresh</Button>
      </div>

      <div className="grid gap-3 md:grid-cols-3">
        <Metric label="Visible Items" value={filtered.length} icon={Boxes} />
        <Metric label="Categories" value={categories.length} icon={Store} />
        <Metric label="Avg. Listed Value" value={formatCurrency(averageValue)} icon={IndianRupee} />
      </div>

      {error && <InlineError message={error} onRetry={reload} />}

      <Card>
        <CardContent className="grid gap-3 p-4 lg:grid-cols-[1fr_170px_180px_170px]">
          <div className="relative"><Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" /><input value={searchTerm} onChange={event => setSearchTerm(event.target.value)} placeholder="Search product, service, category..." className="h-10 w-full rounded-lg border border-slate-200 pl-10 pr-3 text-xs font-semibold outline-none focus:ring-2 focus:ring-[#12335f]/20" /></div>
          <select value={categoryFilter} onChange={event => setCategoryFilter(event.target.value)} className="h-10 rounded-lg border border-slate-200 bg-white px-3 text-xs font-bold outline-none focus:ring-2 focus:ring-[#12335f]/20">
            <option value="">All categories</option>
            {categories.map(category => <option key={category} value={category}>{category}</option>)}
          </select>
          <select value={statusFilter} onChange={event => setStatusFilter(event.target.value)} className="h-10 rounded-lg border border-slate-200 bg-white px-3 text-xs font-bold outline-none focus:ring-2 focus:ring-[#12335f]/20">
            <option value="">All statuses</option>
            {statuses.map(status => <option key={status} value={status}>{String(status).replace(/_/g, ' ')}</option>)}
          </select>
          <select value={priceFilter} onChange={event => setPriceFilter(event.target.value)} className="h-10 rounded-lg border border-slate-200 bg-white px-3 text-xs font-bold outline-none focus:ring-2 focus:ring-[#12335f]/20">
            <option value="">All prices</option>
            <option value="high">Above Rs. 10k</option>
            <option value="mid">Rs. 1k to 10k</option>
            <option value="low">Below Rs. 1k</option>
          </select>
        </CardContent>
      </Card>
      {filtered.length === 0 ? <EmptyState title="No catalogue items" /> : (
        <div className="grid grid-cols-1 gap-3 md:grid-cols-2 xl:grid-cols-3">
          {filtered.map(item => (
            <Card key={item.id}>
              <CardContent className="p-4">
                <div className="flex items-start gap-3">
                  <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-[#12335f] text-white"><PackageSearch className="h-5 w-5" /></div>
                  <div className="min-w-0"><h3 className="break-words text-sm font-black text-slate-950">{item.name}</h3><p className="mt-1 line-clamp-2 text-xs font-semibold text-slate-500">{item.description || 'No description provided'}</p><div className="mt-3 flex flex-wrap items-center gap-2"><p className="text-xs font-black text-[#12335f]">{formatCurrency(item.price || item.basePrice)}</p>{item.category?.name && <span className="rounded-md bg-slate-100 px-2 py-1 text-[10px] font-black uppercase text-slate-600">{item.category.name}</span>}{item.status && <span className="rounded-md bg-emerald-50 px-2 py-1 text-[10px] font-black uppercase text-emerald-700">{item.status.replace(/_/g, ' ')}</span>}</div></div>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}

function Metric({ label, value, icon: Icon }: { label: string; value: string | number; icon: any }) {
  return (
    <Card>
      <CardContent className="flex items-center justify-between p-4">
        <div>
          <p className="text-[10px] font-black uppercase tracking-widest text-slate-500">{label}</p>
          <p className="mt-1 text-lg font-black text-slate-950">{value}</p>
        </div>
        <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-blue-50 text-[#12335f]">
          <Icon className="h-5 w-5" />
        </div>
      </CardContent>
    </Card>
  );
}
