'use client';

import React, { useMemo, useState } from 'react';
import Link from 'next/link';
import { useQuery } from '@tanstack/react-query';
import {
    Area,
    AreaChart,
    Bar,
    BarChart,
    CartesianGrid,
    Cell,
    Pie,
    PieChart,
    ResponsiveContainer,
    Tooltip,
    XAxis,
    YAxis,
} from 'recharts';
import { BarChart3, Download, FileSpreadsheet, FileText, RefreshCw, Search, ShoppingCart, Truck } from 'lucide-react';
import { Button } from '../../../components/ui/button';
import { useAuth } from '../../../hooks/useAuth';
import { getApi } from '../../shared/apiClient';
import { procurementOrderApi } from '../../procurementBid/orderApi';
import { money } from '../../procurementBid/data';
import { InlineError, LoadingState } from '../../shared/FeatureStates';
import { PdfEngine, DocumentConfig, moneyPdf } from '../../../lib/pdfEngine';
import { formatDateTime } from '../../shared/format';
import { downloadCsv, downloadJson } from '../../shared/exportUtils';

const COLORS = ['#12335f', '#0f766e', '#c86413', '#6366f1', '#dc2626', '#64748b'];

const asArray = (value: any) => Array.isArray(value) ? value : [];
const dateLabel = (value?: string) => value ? new Date(value).toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' }) : 'Not recorded';
const monthKey = (value?: string) => {
    const date = value ? new Date(value) : new Date();
    if (Number.isNaN(date.getTime())) return 'Unknown';
    return date.toLocaleDateString('en-IN', { month: 'short', year: '2-digit' });
};
const normalizeStatus = (value?: string) => String(value || 'Pending').replace(/_/g, ' ').toUpperCase();

export default function RoleReportsPage() {
    const { user } = useAuth();
    const [query, setQuery] = useState('');
    const [statusFilter, setStatusFilter] = useState('');

    const summary = useQuery({
        queryKey: ['role-report-summary', user?.role],
        queryFn: () => getApi<any>('/api/dashboard/summary', true),
        enabled: !!user,
    });

    const procurementOrders = useQuery({
        queryKey: ['role-report-orders', user?.role],
        queryFn: () => procurementOrderApi.listOrders(),
        enabled: !!user,
    });

    const purchaseOrders = useQuery({
        queryKey: ['role-report-live-purchase-orders', user?.role],
        queryFn: () => getApi<any>('/api/purchase-orders?take=500', true),
        enabled: !!user,
    });

    const orderRows = useMemo(() => {
        const primary = asArray(purchaseOrders.data?.items || purchaseOrders.data?.purchaseOrders || purchaseOrders.data?.records || purchaseOrders.data);
        const lifecycle = asArray(procurementOrders.data?.items || procurementOrders.data?.purchaseOrders || procurementOrders.data?.records);
        const byId = new Map<number, any>();
        [...primary, ...lifecycle].forEach((order) => {
            if (order?.id) byId.set(Number(order.id), order);
        });
        return Array.from(byId.values());
    }, [procurementOrders.data, purchaseOrders.data]);

    const filteredOrders = useMemo(() => {
        const text = query.trim().toLowerCase();
        return orderRows.filter((order) => {
            const haystack = [
                order.poNumber,
                order.title,
                order.status,
                order.buyer?.name,
                order.seller?.name,
                order.deliveryTrackings?.[0]?.status,
                order.grns?.[0]?.status,
                order.invoices?.[0]?.status,
            ].join(' ').toLowerCase();
            if (text && !haystack.includes(text)) return false;
            if (statusFilter && normalizeStatus(order.status) !== statusFilter) return false;
            return true;
        });
    }, [orderRows, query, statusFilter]);

    const analytics = useMemo(() => buildAnalytics(filteredOrders, summary.data || {}, user?.role), [filteredOrders, summary.data, user?.role]);
    const statuses = useMemo(() => Array.from(new Set(orderRows.map((order) => normalizeStatus(order.status)))).sort(), [orderRows]);

    const isLoading = summary.isLoading || procurementOrders.isLoading || purchaseOrders.isLoading;
    const error = summary.error || procurementOrders.error || purchaseOrders.error;

    const exportRows = filteredOrders.map((order) => ({
        poNumber: order.poNumber || `PO-${order.id}`,
        title: order.title || '',
        buyer: order.buyer?.name || '',
        seller: order.seller?.name || '',
        amount: Number(order.amount || 0),
        status: normalizeStatus(order.status),
        delivery: normalizeStatus(order.deliveryTrackings?.[0]?.status),
        grn: normalizeStatus(order.grns?.[0]?.status),
        invoice: normalizeStatus(order.invoices?.[0]?.status),
        payment: normalizeStatus(order.payments?.[0]?.status || order.invoices?.[0]?.payments?.[0]?.status),
        createdAt: order.createdAt || '',
    }));

    const handleExport = (type: 'csv' | 'json' | 'print') => {
        if (type === 'print') {
            const tableData = exportRows.map(row => [
              row.poNumber,
              row.title,
              row.buyer,
              row.seller,
              moneyPdf(row.amount),
              row.status,
              row.createdAt ? formatDateTime(row.createdAt) : '-'
            ]);

            const config: DocumentConfig = {
              documentTitle: user?.role === 'seller' ? 'Seller Performance Report' : 'Buyer Procurement Report',
              documentNumber: `REP-${Date.now()}`,
              dateStr: formatDateTime(new Date()),
              status: 'GENERATED',
              parties: [],
              infoGrid: {
                'Total Orders': String(exportRows.length),
                'Generated By': user?.name || 'System User',
                'Role': String(user?.role).toUpperCase()
              },
              tableHeaders: ['PO Number', 'Title', 'Buyer', 'Seller', 'Amount', 'Status', 'Created At'],
              tableData: tableData,
              notes: [
                'This report contains procurement lifecycle readiness data including delivery, GRN, and invoice statuses.',
                'Generated automatically by JSGSMILE MSME Procurement.'
              ]
            };

            const engine = new PdfEngine('l'); // Landscape for reports
            const doc = engine.generate(config);
            doc.save(`msme-${user?.role || 'user'}-reports-${new Date().toISOString().slice(0, 10)}.pdf`);
            return;
        }
        const filename = `msme-${user?.role || 'user'}-reports-${new Date().toISOString().slice(0, 10)}`;
        if (type === 'json') {
            downloadJson(`${filename}.json`, { summary: analytics.kpis, orders: exportRows });
            return;
        }
        downloadCsv(`${filename}.csv`, exportRows);
    };

    return (
        <div className="space-y-5">
            <div className="brand-tricolor-strip rounded-full" />
            <section className="rounded-lg border border-slate-200 bg-white p-5 shadow-sm">
                <div className="flex flex-col gap-4 xl:flex-row xl:items-end xl:justify-between">
                    <div>
                        <p className="text-[10px] font-black uppercase tracking-widest text-[#12335f]">Reports and Analytics</p>
                        <h1 className="mt-1 text-2xl font-black text-slate-950">{user?.role === 'seller' ? 'Seller Performance Reports' : 'Buyer Procurement Reports'}</h1>
                        <p className="mt-1 max-w-3xl text-sm font-semibold text-slate-600">
                            Track procurement value, order lifecycle, delivery movement, invoice readiness, and pending actions from one analytical report.
                        </p>
                    </div>
                    <div className="flex flex-wrap gap-2">
                        <Button type="button" variant="outline" onClick={() => handleExport('csv')} className="h-10 gap-2 text-xs font-black uppercase">
                            <FileSpreadsheet className="h-4 w-4" /> CSV
                        </Button>
                        <Button type="button" variant="outline" onClick={() => handleExport('json')} className="h-10 gap-2 text-xs font-black uppercase">
                            <Download className="h-4 w-4" /> JSON
                        </Button>
                        <Button type="button" variant="outline" onClick={() => handleExport('print')} className="h-10 gap-2 text-xs font-black uppercase">
                            <FileText className="h-4 w-4" /> Print / PDF
                        </Button>
                        <Button type="button" variant="outline" onClick={() => { summary.refetch(); procurementOrders.refetch(); purchaseOrders.refetch(); }} className="h-10 gap-2 text-xs font-black uppercase">
                            <RefreshCw className={`h-4 w-4 ${summary.isFetching || procurementOrders.isFetching || purchaseOrders.isFetching ? 'animate-spin' : ''}`} /> Refresh
                        </Button>
                    </div>
                </div>
            </section>

            {error ? <InlineError message={(error as Error).message} onRetry={() => { summary.refetch(); procurementOrders.refetch(); purchaseOrders.refetch(); }} /> : isLoading ? <LoadingState label="Loading analytical reports..." /> : (
                <>
                    <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-4">
                        {analytics.kpis.map((kpi) => <KpiCard key={kpi.label} {...kpi} />)}
                    </div>

                    <section className="grid gap-5 xl:grid-cols-[1.2fr_0.8fr]">
                        <ReportCard title="Monthly Order Value" subtitle="PO value based on order creation month.">
                            <ResponsiveContainer width="100%" height={300}>
                                <AreaChart data={analytics.monthlyValue}>
                                    <defs>
                                        <linearGradient id="valueFill" x1="0" x2="0" y1="0" y2="1">
                                            <stop offset="5%" stopColor="#12335f" stopOpacity={0.28} />
                                            <stop offset="95%" stopColor="#12335f" stopOpacity={0.02} />
                                        </linearGradient>
                                    </defs>
                                    <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#e2e8f0" />
                                    <XAxis dataKey="month" tick={{ fontSize: 11, fill: '#64748b' }} tickLine={false} axisLine={false} />
                                    <YAxis tick={{ fontSize: 11, fill: '#64748b' }} tickLine={false} axisLine={false} />
                                    <Tooltip formatter={(value) => money(Number(value || 0))} />
                                    <Area type="monotone" dataKey="value" stroke="#12335f" strokeWidth={3} fill="url(#valueFill)" name="Order value" />
                                </AreaChart>
                            </ResponsiveContainer>
                        </ReportCard>

                        <ReportCard title="Order Status Distribution" subtitle="Current status of filtered procurement orders.">
                            <ResponsiveContainer width="100%" height={300}>
                                <PieChart>
                                    <Pie data={analytics.statusDistribution} dataKey="value" nameKey="name" innerRadius={64} outerRadius={92} paddingAngle={3}>
                                        {analytics.statusDistribution.map((entry, index) => <Cell key={entry.name} fill={COLORS[index % COLORS.length]} />)}
                                    </Pie>
                                    <Tooltip />
                                </PieChart>
                            </ResponsiveContainer>
                            <div className="mt-2 grid gap-2">
                                {analytics.statusDistribution.map((item, index) => (
                                    <div key={item.name} className="flex items-center justify-between rounded-md bg-slate-50 px-3 py-2 text-xs font-bold">
                                        <span className="inline-flex items-center gap-2"><span className="h-2.5 w-2.5 rounded-full" style={{ backgroundColor: COLORS[index % COLORS.length] }} />{item.name}</span>
                                        <span>{item.value}</span>
                                    </div>
                                ))}
                            </div>
                        </ReportCard>
                    </section>

                    <section className="grid gap-5 xl:grid-cols-2">
                        <ReportCard title="Lifecycle Readiness" subtitle="Delivery, GRN, invoice, and payment progress.">
                            <ResponsiveContainer width="100%" height={280}>
                                <BarChart data={analytics.lifecycle}>
                                    <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#e2e8f0" />
                                    <XAxis dataKey="name" tick={{ fontSize: 11, fill: '#64748b' }} tickLine={false} axisLine={false} />
                                    <YAxis allowDecimals={false} tick={{ fontSize: 11, fill: '#64748b' }} tickLine={false} axisLine={false} />
                                    <Tooltip />
                                    <Bar dataKey="completed" name="Completed / ready" fill="#0f766e" radius={[5, 5, 0, 0]} />
                                    <Bar dataKey="pending" name="Pending" fill="#c86413" radius={[5, 5, 0, 0]} />
                                </BarChart>
                            </ResponsiveContainer>
                        </ReportCard>

                        <ReportCard title="Procurement Aging" subtitle="Open order age from creation date.">
                            <ResponsiveContainer width="100%" height={280}>
                                <BarChart data={analytics.aging}>
                                    <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#e2e8f0" />
                                    <XAxis dataKey="name" tick={{ fontSize: 11, fill: '#64748b' }} tickLine={false} axisLine={false} />
                                    <YAxis allowDecimals={false} tick={{ fontSize: 11, fill: '#64748b' }} tickLine={false} axisLine={false} />
                                    <Tooltip />
                                    <Bar dataKey="value" name="Orders" fill="#12335f" radius={[5, 5, 0, 0]} />
                                </BarChart>
                            </ResponsiveContainer>
                        </ReportCard>
                    </section>

                    <section className="grid gap-5 xl:grid-cols-[0.8fr_1.2fr]">
                        <div className="rounded-lg border border-slate-200 bg-white p-5 shadow-sm">
                            <h2 className="text-base font-black text-slate-950">Where to Find Key Workflows</h2>
                            <div className="mt-4 space-y-3">
                                <WorkflowLink icon={ShoppingCart} title="Create Tender / Procurement" text="Buyer: Procurement > Create Procurement. Use RFQ, tender, auction, requirement, or direct purchase as per need." href="/buyer/create-procurement" />
                                <WorkflowLink icon={Truck} title="See Purchase Orders" text="Orders > Active Orders opens generated PO/work orders. Direct PO URLs are also available from award records." href="/orders" />
                                <WorkflowLink icon={BarChart3} title="Review Reports" text="Reports shows conversion, order value, lifecycle readiness, aging, and exportable order details." href="/reports" />
                            </div>
                        </div>

                        <div className="rounded-lg border border-slate-200 bg-white p-5 shadow-sm">
                            <div className="grid gap-3 md:grid-cols-[1fr_180px]">
                                <div className="relative">
                                    <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
                                    <input
                                        value={query}
                                        onChange={(event) => setQuery(event.target.value)}
                                        placeholder="Search PO, party, delivery, invoice..."
                                        className="h-10 w-full rounded-md border border-slate-200 bg-slate-50 pl-10 pr-3 text-sm font-semibold outline-none focus:border-[#12335f]"
                                    />
                                </div>
                                <select value={statusFilter} onChange={(event) => setStatusFilter(event.target.value)} className="h-10 rounded-md border border-slate-200 bg-white px-3 text-xs font-black outline-none">
                                    <option value="">All statuses</option>
                                    {statuses.map((status) => <option key={status} value={status}>{status}</option>)}
                                </select>
                            </div>
                            <div className="mt-4 overflow-x-auto">
                                <table className="w-full min-w-[900px] text-left text-sm">
                                    <thead className="bg-slate-50 text-[10px] uppercase tracking-wider text-slate-500">
                                        <tr>
                                            <th className="px-3 py-3">PO</th>
                                            <th className="px-3 py-3">Parties</th>
                                            <th className="px-3 py-3 text-right">Value</th>
                                            <th className="px-3 py-3">Status</th>
                                            <th className="px-3 py-3">Lifecycle</th>
                                            <th className="px-3 py-3">Created</th>
                                            <th className="px-3 py-3 text-right">Action</th>
                                        </tr>
                                    </thead>
                                    <tbody className="divide-y divide-slate-100">
                                        {filteredOrders.slice(0, 25).map((order) => (
                                            <tr key={order.id} className="hover:bg-blue-50/40">
                                                <td className="px-3 py-3"><p className="text-xs font-black text-[#12335f]">{order.poNumber || `PO-${order.id}`}</p><p className="text-[11px] font-semibold text-slate-500">{order.title || 'Procurement order'}</p></td>
                                                <td className="px-3 py-3 text-xs font-semibold text-slate-600">{order.buyer?.name || '-'} to {order.seller?.name || '-'}</td>
                                                <td className="px-3 py-3 text-right text-xs font-black text-slate-900">{money(Number(order.amount || 0))}</td>
                                                <td className="px-3 py-3"><StatusPill label={normalizeStatus(order.status)} /></td>
                                                <td className="px-3 py-3 text-[11px] font-semibold text-slate-500">Delivery {normalizeStatus(order.deliveryTrackings?.[0]?.status)} / Invoice {normalizeStatus(order.invoices?.[0]?.status)}</td>
                                                <td className="px-3 py-3 text-xs font-semibold text-slate-500">{dateLabel(order.createdAt)}</td>
                                                <td className="px-3 py-3 text-right"><Link href={order.sourceType === 'procurement_bid_award' ? `/procurement-orders/${order.id}` : '/orders'} className="inline-flex h-8 items-center rounded-md bg-[#12335f] px-3 text-[10px] font-black text-white">Open</Link></td>
                                            </tr>
                                        ))}
                                    </tbody>
                                </table>
                                {filteredOrders.length === 0 && <p className="py-8 text-center text-xs font-bold text-slate-500">No report rows match the current filters.</p>}
                            </div>
                        </div>
                    </section>
                </>
            )}
        </div>
    );
}

function buildAnalytics(orders: any[], summary: any, role?: string) {
    const totalValue = orders.reduce((sum, order) => sum + Number(order.amount || 0), 0);
    const activeOrders = orders.filter((order) => !['COMPLETED', 'CLOSED', 'CANCELLED'].includes(normalizeStatus(order.status))).length;
    const pendingInvoices = role === 'seller' ? summary.sellerPendingInvoicesCount : summary.myPendingInvoicesCount;
    const opportunities = role === 'seller' ? summary.sellerOpenTendersCount : summary.myTendersCount;

    const statusMap = new Map<string, number>();
    const monthlyMap = new Map<string, number>();
    const aging = { '0-7 days': 0, '8-15 days': 0, '16-30 days': 0, '30+ days': 0 };
    let deliveryReady = 0;
    let grnReady = 0;
    let invoiceReady = 0;
    let paymentReady = 0;

    orders.forEach((order) => {
        const status = normalizeStatus(order.status);
        statusMap.set(status, (statusMap.get(status) || 0) + 1);
        const month = monthKey(order.createdAt);
        monthlyMap.set(month, (monthlyMap.get(month) || 0) + Number(order.amount || 0));
        const ageDays = Math.max(0, Math.floor((Date.now() - new Date(order.createdAt || Date.now()).getTime()) / 86400000));
        if (ageDays <= 7) aging['0-7 days'] += 1;
        else if (ageDays <= 15) aging['8-15 days'] += 1;
        else if (ageDays <= 30) aging['16-30 days'] += 1;
        else aging['30+ days'] += 1;
        if (order.deliveryTrackings?.length) deliveryReady += 1;
        if (order.grns?.some((grn: any) => normalizeStatus(grn.status).includes('APPROVED'))) grnReady += 1;
        if (order.invoices?.length) invoiceReady += 1;
        if (order.payments?.length || order.invoices?.some((invoice: any) => invoice.payments?.length)) paymentReady += 1;
    });

    const count = orders.length || 1;
    return {
        kpis: [
            { label: 'Total order value', value: money(totalValue), hint: `${orders.length} filtered orders` },
            { label: 'Active orders', value: activeOrders.toLocaleString('en-IN'), hint: 'Not completed or cancelled' },
            { label: role === 'seller' ? 'Open opportunities' : 'Created tenders', value: Number(opportunities || 0).toLocaleString('en-IN'), hint: 'From dashboard summary' },
            { label: 'Pending invoices', value: Number(pendingInvoices || 0).toLocaleString('en-IN'), hint: 'Needs action or follow-up' },
        ],
        statusDistribution: Array.from(statusMap.entries()).map(([name, value]) => ({ name, value })),
        monthlyValue: Array.from(monthlyMap.entries()).map(([month, value]) => ({ month, value })),
        aging: Object.entries(aging).map(([name, value]) => ({ name, value })),
        lifecycle: [
            { name: 'Delivery', completed: deliveryReady, pending: count - deliveryReady },
            { name: 'GRN', completed: grnReady, pending: count - grnReady },
            { name: 'Invoice', completed: invoiceReady, pending: count - invoiceReady },
            { name: 'Payment', completed: paymentReady, pending: count - paymentReady },
        ],
    };
}

function KpiCard({ label, value, hint }: { label: string; value: string; hint: string }) {
    return (
        <div className="rounded-lg border border-slate-200 bg-white p-4 shadow-sm">
            <p className="text-[10px] font-black uppercase tracking-widest text-slate-400">{label}</p>
            <p className="mt-2 text-2xl font-black text-[#12335f]">{value}</p>
            <p className="mt-1 text-xs font-semibold text-slate-500">{hint}</p>
        </div>
    );
}

function ReportCard({ title, subtitle, children }: { title: string; subtitle: string; children: React.ReactNode }) {
    return (
        <div className="rounded-lg border border-slate-200 bg-white p-5 shadow-sm">
            <h2 className="text-base font-black text-slate-950">{title}</h2>
            <p className="mt-1 text-xs font-semibold text-slate-500">{subtitle}</p>
            <div className="mt-4">{children}</div>
        </div>
    );
}

function WorkflowLink({ icon: Icon, title, text, href }: { icon: any; title: string; text: string; href: string }) {
    return (
        <Link href={href} className="flex gap-3 rounded-md border border-slate-200 bg-slate-50 p-3 transition hover:border-[#12335f]/30 hover:bg-white">
            <Icon className="mt-0.5 h-5 w-5 shrink-0 text-[#12335f]" />
            <span>
                <span className="block text-sm font-black text-slate-900">{title}</span>
                <span className="mt-1 block text-xs font-semibold leading-5 text-slate-600">{text}</span>
            </span>
        </Link>
    );
}

function StatusPill({ label }: { label: string }) {
    return <span className="inline-flex rounded-full border border-blue-200 bg-blue-50 px-2.5 py-1 text-[10px] font-black uppercase text-blue-700">{label}</span>;
}
