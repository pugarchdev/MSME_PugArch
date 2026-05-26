/**
 * ProcurementReportPage — drill-down on procurement counts.
 *
 * Route: /admin/reports/procurement
 */
import { useQuery } from '@tanstack/react-query';
import { ClipboardCheck, FileText, Loader2, RefreshCw, ShoppingCart, Truck } from 'lucide-react';
import { Button } from '../../../components/ui/button';
import { Card, CardContent } from '../../../components/ui/card';
import { InlineError } from '../../shared/FeatureStates';
import { getApi } from '../../shared/apiClient';

interface ProcurementStats {
    requirements: number;
    tenders: number;
    directPurchases: number;
    quoteRequests: number;
    purchaseOrders: number;
}

export default function ProcurementReportPage() {
    const { data, isLoading, error, refetch, isFetching } = useQuery({
        queryKey: ['admin', 'reports', 'procurement'] as const,
        queryFn: () => getApi<ProcurementStats>('/api/admin/reports/procurement')
    });

    return (
        <div className="space-y-4">
            <div className="flex items-end justify-between border-b border-slate-200 pb-4">
                <div>
                    <p className="text-[10px] font-black uppercase tracking-widest text-[#12335f]">Admin · MIS</p>
                    <h1 className="text-2xl font-black text-slate-950">Procurement Report</h1>
                    <p className="mt-1 text-xs font-semibold text-slate-500">
                        Volume of procurement activity across all organisations.
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
                    <div className="grid grid-cols-2 gap-3 md:grid-cols-3 lg:grid-cols-5">
                        <StatCard label="Requirements" value={data.requirements} icon={ClipboardCheck} color="amber" />
                        <StatCard label="Tenders" value={data.tenders} icon={FileText} color="blue" />
                        <StatCard label="Direct Purchases" value={data.directPurchases} icon={ShoppingCart} color="emerald" />
                        <StatCard label="Quote Requests" value={data.quoteRequests} icon={FileText} color="purple" />
                        <StatCard label="Purchase Orders" value={data.purchaseOrders} icon={Truck} color="indigo" />
                    </div>
                ) : null
            }

            <div className="rounded-lg border border-blue-200 bg-blue-50/40 p-4">
                <p className="text-[10px] font-black uppercase tracking-widest text-blue-700">Interpretation</p>
                <p className="mt-1 text-xs font-semibold text-slate-700">
                    Procurement volume is measured across Requirements → Tenders/RFQs/Direct → POs.
                    A healthy ratio shows requirements converting to actual orders.
                </p>
            </div>
        </div>
    );
}

const COLORS = {
    amber: 'bg-amber-50 border-amber-200 text-amber-800',
    blue: 'bg-blue-50 border-blue-200 text-blue-800',
    emerald: 'bg-emerald-50 border-emerald-200 text-emerald-800',
    purple: 'bg-purple-50 border-purple-200 text-purple-800',
    indigo: 'bg-indigo-50 border-indigo-200 text-indigo-800'
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
