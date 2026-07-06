/**
 * ProcurementReportPage — method-wise procurement analytics.
 *
 * Route: /admin/reports/procurement
 */
import { useQuery } from '@tanstack/react-query';
import { useState } from 'react';
import { ClipboardCheck, FileText, RefreshCw, ShoppingCart, Truck, AlertTriangle, BarChart3, TrendingDown } from 'lucide-react';
import { Loader2 } from '@/components/ui/loader';
import { Button } from '../../../components/ui/button';
import { Card, CardContent } from '../../../components/ui/card';
import { InlineError } from '../../shared/FeatureStates';
import { getApi } from '../../shared/apiClient';
import { fetchMethodWiseReports, fetchExceptionReport, fetchReverseAuctionSavings, fetchRateContractUtilization } from '../../audit/api';
import { CANONICAL_METHOD_LABELS } from '../../../types/enums';

interface ProcurementStats {
    requirements: number;
    tenders: number;
    directPurchases: number;
    quoteRequests: number;
    purchaseOrders: number;
}

type ReportTab = 'overview' | 'method-count' | 'method-spend' | 'exceptions' | 'ra-savings' | 'rate-contracts';

export default function ProcurementReportPage() {
    const [activeTab, setActiveTab] = useState<ReportTab>('overview');

    const { data, isLoading, error, refetch, isFetching } = useQuery({
        queryKey: ['admin', 'reports', 'procurement'] as const,
        queryFn: () => getApi<ProcurementStats>('/api/admin/reports/procurement')
    });

    const methodWise = useQuery({
        queryKey: ['admin', 'reports', 'procurement', 'method-wise'],
        queryFn: () => fetchMethodWiseReports(),
        enabled: activeTab === 'method-count' || activeTab === 'method-spend' || activeTab === 'overview',
    });

    const exceptions = useQuery({
        queryKey: ['admin', 'reports', 'procurement', 'exceptions'],
        queryFn: () => fetchExceptionReport(),
        enabled: activeTab === 'exceptions',
    });

    const raSavings = useQuery({
        queryKey: ['admin', 'reports', 'procurement', 'ra-savings'],
        queryFn: () => fetchReverseAuctionSavings(),
        enabled: activeTab === 'ra-savings',
    });

    const rateContracts = useQuery({
        queryKey: ['admin', 'reports', 'procurement', 'rate-contracts'],
        queryFn: () => fetchRateContractUtilization(),
        enabled: activeTab === 'rate-contracts',
    });

    const TABS: { id: ReportTab; label: string }[] = [
        { id: 'overview', label: 'Overview' },
        { id: 'method-count', label: 'Method-wise Count' },
        { id: 'method-spend', label: 'Method-wise Spend' },
        { id: 'exceptions', label: 'Exception Procurement' },
        { id: 'ra-savings', label: 'RA Savings' },
        { id: 'rate-contracts', label: 'Rate Contracts' },
    ];

    return (
        <div className="space-y-4">
            <div className="flex items-end justify-between border-b border-slate-200 pb-4">
                <div>
                    <p className="text-[10px] font-black uppercase tracking-widest text-[#12335f]">Admin · MIS</p>
                    <h1 className="text-2xl font-black text-slate-950">Procurement Report</h1>
                    <p className="mt-1 text-xs font-semibold text-slate-500">
                        Method-wise procurement analytics across all organisations.
                    </p>
                </div>
                <Button variant="outline" onClick={() => { refetch(); methodWise.refetch(); }} className="h-10 rounded-lg text-xs font-black uppercase">
                    <RefreshCw className={`mr-2 h-4 w-4 ${isFetching ? 'animate-spin' : ''}`} /> Refresh
                </Button>
            </div>

            {/* Tab Navigation */}
            <div className="flex gap-1 overflow-x-auto rounded-lg bg-slate-100 p-1">
                {TABS.map(tab => (
                    <button
                        key={tab.id}
                        onClick={() => setActiveTab(tab.id)}
                        className={`whitespace-nowrap rounded-md px-3 py-1.5 text-[11px] font-bold transition-all ${
                            activeTab === tab.id
                                ? 'bg-white text-slate-900 shadow-sm'
                                : 'text-slate-500 hover:text-slate-700'
                        }`}
                    >
                        {tab.label}
                    </button>
                ))}
            </div>

            {error ? <InlineError message={(error as Error).message} onRetry={() => refetch()} /> :
                isLoading ? (
                    <div className="flex justify-center py-16"><Loader2 className="h-8 w-8 animate-spin text-[#12335f]" /></div>
                ) : (
                    <>
                        {/* Overview Tab — existing stats + tender comparison */}
                        {activeTab === 'overview' && data && (
                            <div className="space-y-4">
                                <div className="grid grid-cols-2 gap-3 md:grid-cols-3 lg:grid-cols-5">
                                    <StatCard label="Requirements" value={data.requirements} icon={ClipboardCheck} color="amber" />
                                    <StatCard label="Tenders" value={data.tenders} icon={FileText} color="blue" />
                                    <StatCard label="Direct Purchases" value={data.directPurchases} icon={ShoppingCart} color="emerald" />
                                    <StatCard label="Quote Requests" value={data.quoteRequests} icon={FileText} color="purple" />
                                    <StatCard label="Purchase Orders" value={data.purchaseOrders} icon={Truck} color="indigo" />
                                </div>
                                {methodWise.data?.tenderComparison && (
                                    <Card>
                                        <CardContent className="pt-4">
                                            <p className="text-[10px] font-black uppercase tracking-widest text-slate-400 mb-3">Open Tender vs Limited Tender vs Direct Purchase</p>
                                            <div className="grid grid-cols-3 gap-3">
                                                {methodWise.data.tenderComparison.map(row => (
                                                    <div key={row.method} className="rounded-lg border border-slate-200 p-3 text-center">
                                                        <p className="text-[10px] font-bold text-slate-500">{row.label}</p>
                                                        <p className="text-xl font-black text-slate-900">{row.count}</p>
                                                        <p className="text-[10px] text-slate-400">₹{row.totalSpend.toLocaleString('en-IN')}</p>
                                                    </div>
                                                ))}
                                            </div>
                                        </CardContent>
                                    </Card>
                                )}
                            </div>
                        )}

                        {/* Method-wise Count */}
                        {activeTab === 'method-count' && (
                            methodWise.isLoading ? <Loading /> : methodWise.data?.counts ? (
                                <Card><CardContent className="pt-4">
                                    <p className="text-[10px] font-black uppercase tracking-widest text-slate-400 mb-3">
                                        <BarChart3 className="mr-1 inline h-3 w-3" /> Method-Wise Procurement Count
                                    </p>
                                    <MethodBarChart data={methodWise.data.counts.map(r => ({ label: r.label, value: r.count, isException: r.isException }))} />
                                </CardContent></Card>
                            ) : null
                        )}

                        {/* Method-wise Spend */}
                        {activeTab === 'method-spend' && (
                            methodWise.isLoading ? <Loading /> : methodWise.data?.spend ? (
                                <Card><CardContent className="pt-4">
                                    <p className="text-[10px] font-black uppercase tracking-widest text-slate-400 mb-3">
                                        <TrendingDown className="mr-1 inline h-3 w-3" /> Method-Wise Spend (₹)
                                    </p>
                                    <MethodBarChart data={methodWise.data.spend.map(r => ({ label: r.label, value: r.totalSpend, isException: r.isException }))} isCurrency />
                                </CardContent></Card>
                            ) : null
                        )}

                        {/* Exception Procurement */}
                        {activeTab === 'exceptions' && (
                            exceptions.isLoading ? <Loading /> : exceptions.data ? (
                                <Card><CardContent className="pt-4">
                                    <p className="text-[10px] font-black uppercase tracking-widest text-red-400 mb-3">
                                        <AlertTriangle className="mr-1 inline h-3 w-3" /> Exception Procurement Report (PAC / Single Source / Emergency)
                                    </p>
                                    {exceptions.data.length === 0 ? (
                                        <p className="py-6 text-center text-xs text-slate-400">No exception procurements found.</p>
                                    ) : (
                                        <div className="overflow-x-auto">
                                            <table className="w-full text-[11px]">
                                                <thead><tr className="border-b text-left text-[9px] font-black uppercase text-slate-400">
                                                    <th className="p-2">Bid #</th><th className="p-2">Title</th><th className="p-2">Method</th>
                                                    <th className="p-2">Org</th><th className="p-2 text-right">Value</th><th className="p-2">Status</th>
                                                </tr></thead>
                                                <tbody>
                                                    {(exceptions.data as any[]).map((row: any) => (
                                                        <tr key={row.id} className="border-b border-slate-100 hover:bg-slate-50">
                                                            <td className="p-2 font-bold text-blue-700">{row.bidNumber}</td>
                                                            <td className="p-2 max-w-[200px] truncate">{row.title}</td>
                                                            <td className="p-2"><span className="rounded bg-red-100 px-1.5 py-0.5 text-[9px] font-bold text-red-700">{CANONICAL_METHOD_LABELS[row.canonicalMethod] || row.canonicalMethod}</span></td>
                                                            <td className="p-2 text-slate-500">{row.buyerOrganizationName}</td>
                                                            <td className="p-2 text-right font-bold">₹{Number(row.estimatedValue || 0).toLocaleString('en-IN')}</td>
                                                            <td className="p-2"><span className="rounded bg-slate-100 px-1.5 py-0.5 text-[9px] font-bold">{row.status}</span></td>
                                                        </tr>
                                                    ))}
                                                </tbody>
                                            </table>
                                        </div>
                                    )}
                                </CardContent></Card>
                            ) : null
                        )}

                        {/* RA Savings */}
                        {activeTab === 'ra-savings' && (
                            raSavings.isLoading ? <Loading /> : raSavings.data ? (
                                <Card><CardContent className="pt-4">
                                    <p className="text-[10px] font-black uppercase tracking-widest text-slate-400 mb-3">Reverse Auction Savings</p>
                                    {raSavings.data.length === 0 ? (
                                        <p className="py-6 text-center text-xs text-slate-400">No reverse auction data found.</p>
                                    ) : (
                                        <div className="overflow-x-auto">
                                            <table className="w-full text-[11px]">
                                                <thead><tr className="border-b text-left text-[9px] font-black uppercase text-slate-400">
                                                    <th className="p-2">Bid #</th><th className="p-2">Title</th>
                                                    <th className="p-2 text-right">Estimated</th><th className="p-2 text-right">Awarded</th>
                                                    <th className="p-2 text-right">Savings</th><th className="p-2 text-right">%</th>
                                                </tr></thead>
                                                <tbody>
                                                    {raSavings.data.map(row => (
                                                        <tr key={row.id} className="border-b border-slate-100">
                                                            <td className="p-2 font-bold text-blue-700">{row.bidNumber}</td>
                                                            <td className="p-2 max-w-[200px] truncate">{row.title}</td>
                                                            <td className="p-2 text-right">₹{row.estimatedValue.toLocaleString('en-IN')}</td>
                                                            <td className="p-2 text-right">{row.awardedAmount != null ? `₹${row.awardedAmount.toLocaleString('en-IN')}` : '—'}</td>
                                                            <td className="p-2 text-right font-bold text-emerald-700">{row.savings != null ? `₹${row.savings.toLocaleString('en-IN')}` : '—'}</td>
                                                            <td className="p-2 text-right font-bold text-emerald-700">{row.savingsPercent != null ? `${row.savingsPercent}%` : '—'}</td>
                                                        </tr>
                                                    ))}
                                                </tbody>
                                            </table>
                                        </div>
                                    )}
                                </CardContent></Card>
                            ) : null
                        )}

                        {/* Rate Contracts */}
                        {activeTab === 'rate-contracts' && (
                            rateContracts.isLoading ? <Loading /> : rateContracts.data ? (
                                <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
                                    <StatCard label="Total Rate Contracts" value={rateContracts.data.total} icon={FileText} color="blue" />
                                    <StatCard label="Active" value={rateContracts.data.active} icon={ClipboardCheck} color="emerald" />
                                    <StatCard label="Expired" value={rateContracts.data.expired} icon={FileText} color="amber" />
                                    <StatCard label="Orders Against RC" value={rateContracts.data.ordersAgainstContracts} icon={Truck} color="purple" />
                                </div>
                            ) : null
                        )}

                        <div className="rounded-lg border border-blue-200 bg-blue-50/40 p-4">
                            <p className="text-[10px] font-black uppercase tracking-widest text-blue-700">Interpretation</p>
                            <p className="mt-1 text-xs font-semibold text-slate-700">
                                Reports show exact canonical procurement methods across all entities. Exception procurement (PAC, Single Source, Emergency) is flagged separately for audit compliance.
                            </p>
                        </div>
                    </>
                )
            }
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

function Loading() {
    return <div className="flex justify-center py-12"><Loader2 className="h-6 w-6 animate-spin text-[#12335f]" /></div>;
}

/** Simple CSS horizontal bar chart — no external library needed. */
function MethodBarChart({ data, isCurrency }: { data: Array<{ label: string; value: number; isException?: boolean }>; isCurrency?: boolean }) {
    const max = Math.max(...data.map(d => d.value), 1);
    const filtered = data.filter(d => d.value > 0);
    if (!filtered.length) return <p className="py-6 text-center text-xs text-slate-400">No data available.</p>;

    return (
        <div className="space-y-1.5">
            {filtered.map(row => (
                <div key={row.label} className="flex items-center gap-2">
                    <span className={`w-36 flex-shrink-0 text-right text-[10px] font-bold ${
                        row.isException ? 'text-red-700' : 'text-slate-700'
                    }`}>
                        {row.label}
                    </span>
                    <div className="relative h-5 flex-1 overflow-hidden rounded-full bg-slate-100">
                        <div
                            className={`h-full rounded-full transition-all duration-500 ${
                                row.isException ? 'bg-red-400' : 'bg-indigo-500'
                            }`}
                            style={{ width: `${Math.max((row.value / max) * 100, 2)}%` }}
                        />
                    </div>
                    <span className="w-24 flex-shrink-0 text-[10px] font-black text-slate-900">
                        {isCurrency ? `₹${row.value.toLocaleString('en-IN')}` : row.value.toLocaleString('en-IN')}
                    </span>
                </div>
            ))}
        </div>
    );
}
