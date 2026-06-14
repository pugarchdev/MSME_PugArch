import Link from 'next/link';
import { useMemo, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { ArrowLeft, BadgeCheck, Box, GitCompareArrows, PackageSearch, ShieldCheck, Trash2, Wrench, X } from 'lucide-react';
import { Button } from '../../../components/ui/button';
import { Card, CardContent } from '../../../components/ui/card';
import { EmptyState, InlineError, LoadingState } from '../../shared/FeatureStates';
import { formatCurrency, formatDate } from '../../shared/format';
import { marketplaceApi } from '../api';
import { useCompare } from '../hooks/useCompare';

type CompareRow = {
  key: string;
  label: string;
  group: string;
  value: (item: any) => unknown;
  format?: (value: unknown, item: any) => string;
};

const text = (value: unknown) => {
  if (value === null || value === undefined || value === '') return 'Not provided';
  if (typeof value === 'boolean') return value ? 'Yes' : 'No';
  return String(value).replace(/_/g, ' ');
};

const countText = (value: unknown) => Array.isArray(value) ? String(value.length) : text(value);
const specsText = (value: unknown) => {
  if (!Array.isArray(value) || value.length === 0) return 'Not provided';
  return value.slice(0, 3).map((row: any) => `${row.name}: ${row.value}${row.unit ? ` ${row.unit}` : ''}`).join(', ');
};

const hasValue = (value: unknown) => {
  if (value === null || value === undefined || value === '') return false;
  if (Array.isArray(value)) return value.length > 0;
  if (typeof value === 'boolean') return value;
  return String(value).trim() !== '';
};

const rows: CompareRow[] = [
  { key: 'type', label: 'Type', group: 'Overview', value: item => item.type },
  { key: 'seller', label: 'Seller', group: 'Overview', value: item => item.sellerOrganization?.organizationName },
  { key: 'category', label: 'Category', group: 'Overview', value: item => item.category?.name },
  { key: 'status', label: 'Status', group: 'Overview', value: item => item.status },
  { key: 'verification', label: 'Verification', group: 'Overview', value: item => item.verificationStatus },
  { key: 'location', label: 'Location / Area', group: 'Overview', value: item => item.location },
  { key: 'price', label: 'Price', group: 'Commercials', value: item => item.price, format: value => value ? formatCurrency(value) : 'Quote based' },
  { key: 'taxInfo', label: 'GST / Tax', group: 'Commercials', value: item => item.taxInfo, format: value => value ? `${text(value)}%` : '-' },
  { key: 'discount', label: 'Discount', group: 'Commercials', value: item => item.discount, format: value => value ? `${text(value)}%` : '-' },
  { key: 'unit', label: 'Unit / Pricing', group: 'Commercials', value: item => item.unit || item.pricingModel },
  { key: 'serviceArea', label: 'Service Area', group: 'Commercials', value: item => item.serviceArea },
  { key: 'brand', label: 'Brand', group: 'Technical', value: item => item.brand },
  { key: 'modelNumber', label: 'Model', group: 'Technical', value: item => item.modelNumber },
  { key: 'sku', label: 'SKU', group: 'Technical', value: item => item.sku },
  { key: 'hsnCode', label: 'HSN', group: 'Technical', value: item => item.hsnCode },
  { key: 'condition', label: 'Condition', group: 'Technical', value: item => item.itemCondition },
  { key: 'msmeMade', label: 'MSME Made', group: 'Technical', value: item => item.isMsmeMade },
  { key: 'description', label: 'Description', group: 'Details', value: item => item.description },
  { key: 'technicalSpecs', label: 'Specifications', group: 'Details', value: item => item.technicalSpecs, format: specsText },
  { key: 'documents', label: 'Documents', group: 'Details', value: item => item.documents, format: countText },
  { key: 'lastUpdated', label: 'Last Updated', group: 'Details', value: item => item.lastUpdated, format: value => formatDate(value) }
];

const normalize = (value: unknown) => {
  if (Array.isArray(value)) return JSON.stringify(value.map((row: any) => row?.name || row?.value || row?.id || row));
  return String(value ?? '').trim().toLowerCase();
};

export default function MarketplaceComparePage() {
  const compare = useCompare();
  const [differencesOnly, setDifferencesOnly] = useState(false);
  const query = useQuery({
    queryKey: ['marketplace-compare', compare.ids],
    queryFn: () => marketplaceApi.getCompareItems(compare.ids),
    enabled: compare.ids.length > 0,
    staleTime: 30_000
  });

  const items = query.data?.items || [];
  const visibleRows = useMemo(() => rows.filter(row => {
    const hasAnyValue = items.some(item => hasValue(row.value(item)));
    const alwaysShow = ['type', 'seller', 'category', 'status', 'verification', 'price', 'taxInfo', 'unit', 'lastUpdated'].includes(row.key);
    if (!alwaysShow && !hasAnyValue) return false;
    if (!differencesOnly || items.length < 2) return true;
    return new Set(items.map(item => normalize(row.value(item)))).size > 1;
  }), [differencesOnly, items]);

  const rowGroups = useMemo(() => {
    return visibleRows.reduce<Record<string, CompareRow[]>>((acc, row) => {
      acc[row.group] = [...(acc[row.group] || []), row];
      return acc;
    }, {});
  }, [visibleRows]);

  if (compare.ids.length === 0) {
    return (
      <div className="min-h-dvh bg-slate-50 p-4">
        <div className="mx-auto max-w-5xl">
          <EmptyState title="No items selected for comparison" description="Choose products or services from the marketplace, then open compare again." />
          <div className="mt-4 flex justify-center gap-2">
            <Link href="/marketplace/products"><Button>Browse Products</Button></Link>
            <Link href="/marketplace/services"><Button variant="outline">Browse Services</Button></Link>
          </div>
        </div>
      </div>
    );
  }
  if (query.isLoading) return <LoadingState label="Loading comparison..." />;
  if (query.error) return <InlineError message={(query.error as Error).message} onRetry={() => query.refetch()} />;

  return (
    <div className="min-h-dvh bg-slate-50 p-4">
      <div className="mx-auto max-w-7xl space-y-4">
        <div className="flex flex-col gap-3 border-b border-slate-200 pb-4 lg:flex-row lg:items-end lg:justify-between">
          <div>
            <Link href="/marketplace/products" className="mb-2 inline-flex items-center gap-1 text-xs font-bold text-slate-500 hover:text-[#12335f]">
              <ArrowLeft className="h-3.5 w-3.5" /> Marketplace
            </Link>
            <p className="text-[10px] font-black uppercase tracking-widest text-[#12335f]">Marketplace Compare</p>
            <h1 className="text-2xl font-black text-slate-950">Compare Items</h1>
            <p className="mt-1 text-xs font-semibold text-slate-500">{items.length}/4 selected for side-by-side review</p>
          </div>
          <div className="flex flex-wrap gap-2">
            <Button variant={differencesOnly ? 'primary' : 'outline'} onClick={() => setDifferencesOnly(value => !value)}>
              <GitCompareArrows className="mr-2 h-4 w-4" />Differences
            </Button>
            <Button variant="outline" onClick={compare.clear}><Trash2 className="mr-2 h-4 w-4" />Clear</Button>
          </div>
        </div>

        <div className="grid gap-3 md:grid-cols-3">
          <Metric icon={Box} label="Items" value={items.length} />
          <Metric icon={BadgeCheck} label="Verified Sellers" value={query.data?.highlights?.verifiedCount || 0} />
          <Metric icon={ShieldCheck} label="Lowest Price" value={query.data?.highlights?.lowestPrice ? formatCurrency(query.data.highlights.lowestPrice) : 'Quote based'} />
        </div>

        <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-4">
          {items.map(item => {
            const itemType = String(item.type || '').toLowerCase() as 'product' | 'service';
            const icon = itemType === 'service' ? <Wrench className="h-5 w-5" /> : <PackageSearch className="h-5 w-5" />;
            return (
              <Card key={`${item.type}:${item.id}`} className="overflow-hidden border-slate-200 bg-white">
                <div className="h-28 bg-slate-100">
                  {item.imageUrl ? <img src={item.imageUrl} alt={item.name} className="h-full w-full object-contain" /> : <div className="flex h-full items-center justify-center text-slate-300">{icon}</div>}
                </div>
                <CardContent className="space-y-3 p-3">
                  <div>
                    <p className="text-[10px] font-black uppercase tracking-widest text-slate-500">{item.type} #{item.id}</p>
                    <h2 className="mt-1 line-clamp-2 text-sm font-black text-slate-950">{item.name}</h2>
                    <p className="mt-1 line-clamp-1 text-xs font-semibold text-slate-500">{item.category?.name || 'Uncategorized'}</p>
                  </div>
                  <div className="flex flex-wrap gap-1.5 text-[10px] font-black uppercase">
                    <span className="rounded bg-emerald-50 px-2 py-1 text-emerald-700">{item.price ? formatCurrency(item.price) : 'Quote based'}</span>
                    <span className="rounded bg-slate-100 px-2 py-1 text-slate-600">{text(item.verificationStatus)}</span>
                  </div>
                  <div className="flex gap-2">
                    <Link href={item.detailUrl || `/marketplace/${itemType === 'service' ? 'services' : 'products'}/${item.id}`} className="flex-1">
                      <Button type="button" variant="outline" size="sm" className="w-full">Details</Button>
                    </Link>
                    <Button type="button" variant="ghost" size="icon" title="Remove" onClick={() => compare.remove(itemType, item.id)}>
                      <X className="h-4 w-4" />
                    </Button>
                  </div>
                </CardContent>
              </Card>
            );
          })}
        </div>

        <Card className="border-slate-200 bg-white">
          <CardContent className="p-0">
            <div className="overflow-x-auto">
              <table className="w-full min-w-[980px] text-left text-sm">
                <thead className="bg-slate-50">
                  <tr>
                    <th className="sticky left-0 z-10 w-52 bg-slate-50 p-3 text-[10px] font-black uppercase tracking-widest text-slate-500">Field</th>
                    {items.map(item => (
                      <th key={`${item.type}:${item.id}`} className="min-w-64 p-3 align-top text-xs font-black text-slate-800">{item.name}</th>
                    ))}
                  </tr>
                </thead>
                {Object.entries(rowGroups).map(([group, groupRows]) => (
                  <tbody key={group} className="divide-y divide-slate-100">
                    <tr>
                      <td colSpan={items.length + 1} className="bg-slate-100 px-3 py-2 text-[10px] font-black uppercase tracking-widest text-[#12335f]">{group}</td>
                    </tr>
                    {groupRows.map(row => (
                      <tr key={row.key} className="hover:bg-slate-50/70">
                        <td className="sticky left-0 z-10 bg-white p-3 text-xs font-black uppercase tracking-wider text-slate-500">{row.label}</td>
                        {items.map(item => {
                          const value = row.value(item);
                          const isLowestPrice = row.key === 'price' && Number(value) === Number(query.data?.highlights?.lowestPrice);
                          return (
                            <td key={`${item.type}:${item.id}:${row.key}`} className={isLowestPrice ? 'bg-emerald-50 p-3 font-black text-emerald-700' : 'p-3 font-semibold text-slate-700'}>
                              <span className="line-clamp-3">{row.format ? row.format(value, item) : text(value)}</span>
                            </td>
                          );
                        })}
                      </tr>
                    ))}
                  </tbody>
                ))}
              </table>
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}

function Metric({ icon: Icon, label, value }: { icon: any; label: string; value: string | number }) {
  return (
    <Card className="border-slate-200 bg-white">
      <CardContent className="flex items-center justify-between p-4">
        <div>
          <p className="text-[10px] font-black uppercase tracking-widest text-slate-500">{label}</p>
          <p className="mt-1 text-lg font-black text-slate-950">{value}</p>
        </div>
        <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-[#12335f]/10 text-[#12335f]">
          <Icon className="h-5 w-5" />
        </div>
      </CardContent>
    </Card>
  );
}
