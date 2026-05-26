/**
 * SuppliersReportPage — sellers, products, services, ratings.
 *
 * Route: /admin/reports/suppliers
 */
import { useQuery } from '@tanstack/react-query';
import { Loader2, Package, RefreshCw, Star, Store, Wrench } from 'lucide-react';
import { Button } from '../../../components/ui/button';
import { InlineError } from '../../shared/FeatureStates';
import { getApi } from '../../shared/apiClient';

interface SuppliersStats {
    sellers: number;
    products: number;
    services: number;
    ratings: number;
}

export default function SuppliersReportPage() {
    const { data, isLoading, error, refetch, isFetching } = useQuery({
        queryKey: ['admin', 'reports', 'suppliers'] as const,
        queryFn: () => getApi<SuppliersStats>('/api/admin/reports/suppliers')
    });

    return (
        <div className="space-y-4">
            <div className="flex items-end justify-between border-b border-slate-200 pb-4">
                <div>
                    <p className="text-[10px] font-black uppercase tracking-widest text-[#12335f]">Admin · MIS</p>
                    <h1 className="text-2xl font-black text-slate-950">Suppliers Report</h1>
                    <p className="mt-1 text-xs font-semibold text-slate-500">
                        Seller registration depth, catalogue size, and rating activity.
                    </p>
                </div>
                <Button variant="outline" onClick={() => refetch()} className="h-10 rounded-lg text-xs font-black uppercase">
                    <RefreshCw className={`mr-2 h-4 w-4 ${isFetching ? 'animate-spin' : ''}`} /> Refresh
                </Button>
            </div>

            {error ? <InlineError message={(error as Error).message} onRetry={() => refetch()} /> :
                isLoading ? (
                    <div className="flex justify-center py-16"><Loader2 className="h-8 w-8 animate-spin text-[#12335f]" /></div>
                ) : data ? (
                    <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
                        <StatCard label="Sellers" value={data.sellers} icon={Store} color="emerald" />
                        <StatCard label="Products" value={data.products} icon={Package} color="blue" />
                        <StatCard label="Services" value={data.services} icon={Wrench} color="purple" />
                        <StatCard label="Ratings" value={data.ratings} icon={Star} color="amber" />
                    </div>
                ) : null
            }

            <div className="rounded-lg border border-purple-200 bg-purple-50/40 p-4">
                <p className="text-[10px] font-black uppercase tracking-widest text-purple-700">Marketplace Health</p>
                <p className="mt-1 text-xs font-semibold text-slate-700">
                    A healthy marketplace shows sellers with multiple products + services and active rating activity.
                    A low rating-to-PO ratio means buyers aren't reviewing — consider rating prompts post-delivery.
                </p>
            </div>
        </div>
    );
}

const COLORS = {
    emerald: 'bg-emerald-50 border-emerald-200 text-emerald-800',
    blue: 'bg-blue-50 border-blue-200 text-blue-800',
    purple: 'bg-purple-50 border-purple-200 text-purple-800',
    amber: 'bg-amber-50 border-amber-200 text-amber-800'
};

function StatCard({ label, value, icon: Icon, color }: { label: string; value: number; icon: any; color: keyof typeof COLORS }) {
    return (
        <div className={`rounded-xl border p-4 ${COLORS[color]}`}>
            <div className="flex items-center justify-between">
                <p className="text-[9px] font-black uppercase tracking-widest opacity-70">{label}</p>
                <Icon className="h-4 w-4 opacity-70" />
            </div>
            <p className="mt-1 text-2xl font-black">{value.toLocaleString('en-IN')}</p>
        </div>
    );
}
