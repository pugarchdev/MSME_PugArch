import { useMemo, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Trash2 } from 'lucide-react';
import { Button } from '../../../components/ui/button';
import { Card, CardContent } from '../../../components/ui/card';
import { EmptyState, InlineError, LoadingState } from '../../shared/FeatureStates';
import { formatCurrency, formatDate } from '../../shared/format';
import { marketplaceApi } from '../api';
import { useCompare } from '../hooks/useCompare';

const rows = [
  ['sellerOrganization.organizationName', 'Seller'],
  ['category.name', 'Category'],
  ['price', 'Price'],
  ['taxInfo', 'GST / Tax'],
  ['unit', 'Unit'],
  ['moq', 'MOQ'],
  ['deliveryTime', 'Delivery'],
  ['location', 'Location'],
  ['warranty', 'Warranty'],
  ['availableQuantity', 'Available Qty'],
  ['verificationStatus', 'Verification'],
  ['lastUpdated', 'Last Updated']
] as const;

const read = (item: any, path: string) => path.split('.').reduce((value, key) => value?.[key], item);

export default function MarketplaceComparePage() {
  const compare = useCompare();
  const [differencesOnly, setDifferencesOnly] = useState(false);
  const query = useQuery({
    queryKey: ['marketplace-compare', compare.ids],
    queryFn: () => marketplaceApi.getCompareItems(compare.ids),
    enabled: compare.ids.length > 0,
    staleTime: 30_000
  });

  const visibleRows = useMemo(() => rows.filter(([path]) => {
    if (!differencesOnly || !query.data?.items?.length) return true;
    const values = new Set(query.data.items.map(item => String(read(item, path) ?? '')));
    return values.size > 1;
  }), [differencesOnly, query.data?.items]);

  if (compare.ids.length === 0) return <EmptyState title="No items selected for comparison" />;
  if (query.isLoading) return <LoadingState label="Loading comparison..." />;
  if (query.error) return <InlineError message={(query.error as Error).message} onRetry={() => query.refetch()} />;

  const items = query.data?.items || [];

  return (
    <div className="min-h-dvh bg-slate-50 p-4">
      <div className="mx-auto max-w-7xl space-y-4">
        <div className="flex flex-col gap-3 border-b border-slate-200 pb-4 md:flex-row md:items-end md:justify-between">
          <div>
            <p className="text-[10px] font-black uppercase tracking-widest text-[#12335f]">Marketplace Compare</p>
            <h1 className="text-2xl font-black text-slate-950">Compare Items</h1>
          </div>
          <div className="flex gap-2">
            <Button variant={differencesOnly ? 'primary' : 'outline'} onClick={() => setDifferencesOnly(value => !value)}>Differences</Button>
            <Button variant="outline" onClick={compare.clear}><Trash2 className="mr-2 h-4 w-4" />Clear</Button>
          </div>
        </div>
        <Card>
          <CardContent className="p-0">
            <div className="overflow-x-auto">
              <table className="w-full min-w-[960px] text-left text-sm">
                <thead className="bg-slate-50">
                  <tr>
                    <th className="w-48 p-3 text-[10px] font-black uppercase tracking-widest text-slate-500">Field</th>
                    {items.map(item => (
                      <th key={`${item.type}:${item.id}`} className="min-w-56 p-3 align-top">
                        {item.imageUrl && <img src={item.imageUrl} alt="" className="mb-2 h-24 w-full rounded-lg object-contain bg-slate-100" />}
                        <p className="text-sm font-black text-slate-950">{item.name}</p>
                        <p className="text-[10px] font-bold uppercase text-slate-500">{item.type} #{item.id}</p>
                        <Button size="sm" variant="outline" className="mt-2" onClick={() => compare.remove(item.type.toLowerCase() as 'product' | 'service', item.id)}>Remove</Button>
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {visibleRows.map(([path, label]) => (
                    <tr key={path}>
                      <td className="p-3 text-xs font-black uppercase tracking-wider text-slate-500">{label}</td>
                      {items.map(item => {
                        const value = read(item, path);
                        const isLowestPrice = path === 'price' && Number(value) === Number(query.data?.highlights?.lowestPrice);
                        return (
                          <td key={`${item.type}:${item.id}:${path}`} className={isLowestPrice ? 'bg-emerald-50 p-3 font-black text-emerald-700' : 'p-3 font-semibold text-slate-700'}>
                            {path === 'price' ? (value ? formatCurrency(value) : 'Quote based') : path === 'lastUpdated' ? formatDate(value) : String(value ?? '-')}
                          </td>
                        );
                      })}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
