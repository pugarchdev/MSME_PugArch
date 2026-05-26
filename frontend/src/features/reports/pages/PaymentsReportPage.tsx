/**
 * PaymentsReportPage — payment & escrow stats.
 *
 * Route: /admin/reports/payments
 */
import { useQuery } from '@tanstack/react-query';
import { CheckCircle2, CreditCard, FileText, Landmark, Loader2, RefreshCw } from 'lucide-react';
import { Button } from '../../../components/ui/button';
import { InlineError } from '../../shared/FeatureStates';
import { getApi } from '../../shared/apiClient';

interface PaymentsStats {
    invoices: number;
    payments: number;
    escrows: number;
    milestones: number;
}

export default function PaymentsReportPage() {
    const { data, isLoading, error, refetch, isFetching } = useQuery({
        queryKey: ['admin', 'reports', 'payments'] as const,
        queryFn: () => getApi<PaymentsStats>('/api/admin/reports/payments')
    });

    return (
        <div className="space-y-4">
            <div className="flex items-end justify-between border-b border-slate-200 pb-4">
                <div>
                    <p className="text-[10px] font-black uppercase tracking-widest text-[#12335f]">Admin · MIS</p>
                    <h1 className="text-2xl font-black text-slate-950">Payments Report</h1>
                    <p className="mt-1 text-xs font-semibold text-slate-500">
                        Settlement, escrow custody, milestone, and invoice volume.
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
                        <StatCard label="Invoices" value={data.invoices} icon={FileText} color="amber" />
                        <StatCard label="Payments" value={data.payments} icon={CreditCard} color="emerald" />
                        <StatCard label="Escrow Accounts" value={data.escrows} icon={Landmark} color="blue" />
                        <StatCard label="Milestones" value={data.milestones} icon={CheckCircle2} color="purple" />
                    </div>
                ) : null
            }

            <div className="rounded-lg border border-emerald-200 bg-emerald-50/40 p-4">
                <p className="text-[10px] font-black uppercase tracking-widest text-emerald-700">Compliance Insight</p>
                <p className="mt-1 text-xs font-semibold text-slate-700">
                    The MSMED Act requires payment to MSME suppliers within 45 days. Track payment-vs-invoice ratio
                    in the Dashboard summary — anything below 0.95 indicates buyer payment delays.
                </p>
            </div>
        </div>
    );
}

const COLORS = {
    amber: 'bg-amber-50 border-amber-200 text-amber-800',
    blue: 'bg-blue-50 border-blue-200 text-blue-800',
    emerald: 'bg-emerald-50 border-emerald-200 text-emerald-800',
    purple: 'bg-purple-50 border-purple-200 text-purple-800'
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
