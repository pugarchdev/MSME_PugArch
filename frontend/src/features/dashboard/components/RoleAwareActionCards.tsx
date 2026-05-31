/**
 * RoleAwareActionCards — shows quick-action cards on the Dashboard tailored
 * to the user's intra-organisation role + their portal role (buyer/seller).
 *
 * Tile visibility rules:
 *  - Approvals tiles (Approvals Pending, Carts to Approve, Tech Review,
 *    Active Deliveries) only show for users with the matching org role.
 *  - Baseline portal tiles (My Tenders, Active POs, Pending Invoices, RFQs
 *    for buyers; Open Tenders, Active POs, Catalogue Items, Pending Invoices
 *    for sellers) show for every buyer / seller, regardless of org role,
 *    so a freshly-onboarded user always sees something useful here.
 *
 * Data is fetched from the unified /api/dashboard/summary endpoint so the
 * dashboard makes ONE network call instead of 5+ parallel queries.
 */
import { useQuery } from '@tanstack/react-query';
import {
    AlertTriangle, ArrowRight, ClipboardCheck, ClipboardList, FileText, Gavel,
    Inbox, Package, Receipt, Send, ShoppingCart, Store, Truck
} from 'lucide-react';
import { useRouter } from 'next/navigation';
import { useAuth } from '../../../hooks/useAuth';
import { useOrgRole } from '../../../hooks/useOrgRole';
import { getApi } from '../../shared/apiClient';
import { cn } from '../../../lib/utils';

interface DashboardSummary {
    cartItemCount?: number;
    pendingApprovalsCount?: number;
    cartApprovalsCount?: number;
    techReviewCount?: number;
    grnsToApproveCount?: number;
    activeDeliveriesCount?: number;
    // Buyer-side
    myTendersCount?: number;
    myActivePOsCount?: number;
    myPendingInvoicesCount?: number;
    myRfqsCount?: number;
    // Seller-side
    sellerOpenTendersCount?: number;
    sellerActivePOsCount?: number;
    sellerCatalogueItemsCount?: number;
    sellerPendingInvoicesCount?: number;
    sellerQuotationsCount?: number;
    orgRole?: string;
    isAdmin?: boolean;
}

const TONES: Record<string, string> = {
    amber: 'bg-amber-50 text-amber-700',
    blue: 'bg-blue-50 text-blue-700',
    purple: 'bg-purple-50 text-purple-700',
    emerald: 'bg-emerald-50 text-emerald-700',
    cyan: 'bg-cyan-50 text-cyan-700',
    slate: 'bg-slate-100 text-slate-700',
    indigo: 'bg-indigo-50 text-indigo-700',
    rose: 'bg-rose-50 text-rose-700'
};

const TONE_HOVER_BORDERS: Record<string, string> = {
    indigo: 'hover:border-indigo-400 focus:ring-indigo-200/30',
    emerald: 'hover:border-emerald-400 focus:ring-emerald-200/30',
    blue: 'hover:border-blue-400 focus:ring-blue-200/30',
    rose: 'hover:border-rose-400 focus:ring-rose-200/30',
    slate: 'hover:border-slate-400 focus:ring-slate-200/30',
    amber: 'hover:border-amber-400 focus:ring-amber-200/30',
    purple: 'hover:border-purple-400 focus:ring-purple-200/30',
    cyan: 'hover:border-cyan-400 focus:ring-cyan-200/30'
};

const TONE_TEXT_COLORS: Record<string, string> = {
    indigo: 'text-indigo-700',
    emerald: 'text-emerald-700',
    blue: 'text-blue-700',
    rose: 'text-rose-700',
    slate: 'text-slate-800',
    amber: 'text-amber-700',
    purple: 'text-purple-700',
    cyan: 'text-cyan-700'
};

export default function RoleAwareActionCards() {
    const { user } = useAuth();
    const { orgRole, isOrgAdmin, isProcurementOfficer, isFinanceOfficer, isTechnicalOfficer, isLogisticsOfficer } = useOrgRole();
    const router = useRouter();

    const summary = useQuery({
        queryKey: ['dashboard', 'summary'] as const,
        queryFn: () => getApi<DashboardSummary>('/api/dashboard/summary').catch(() => null),
        enabled: !!user && user.role !== 'admin',
        placeholderData: (prev) => prev,
        refetchOnWindowFocus: false
    });

    const data: DashboardSummary = summary.data || {};
    const isLoading = summary.isLoading && !summary.data;
    const isBuyer = user?.role === 'buyer';
    const isSeller = user?.role === 'seller';

    const cards: Array<{
        label: string;
        count: number;
        href: string;
        icon: any;
        tone: string;
        show: boolean;
        priority: boolean;
    }> = [
        // ─── Buyer baseline tiles ───
        {
            label: 'My Tenders',
            count: data.myTendersCount || 0,
            href: '/buyer/tenders',
            icon: Gavel,
            tone: 'indigo',
            show: isBuyer,
            priority: false
        },
        {
            label: 'Active POs',
            count: data.myActivePOsCount || 0,
            href: '/buyer/orders',
            icon: Package,
            tone: 'emerald',
            show: isBuyer,
            priority: false
        },
        {
            label: 'Open RFQs',
            count: data.myRfqsCount || 0,
            href: '/buyer/rfq',
            icon: Send,
            tone: 'blue',
            show: isBuyer,
            priority: false
        },
        {
            label: 'Pending Invoices',
            count: data.myPendingInvoicesCount || 0,
            href: '/buyer/invoices',
            icon: Receipt,
            tone: 'rose',
            show: isBuyer,
            priority: false
        },
        {
            label: 'GRNs to Approve',
            count: data.grnsToApproveCount || 0,
            href: '/grn',
            icon: ClipboardList,
            tone: 'emerald',
            show: isBuyer,
            priority: true
        },

        // ─── Seller baseline tiles ───
        {
            label: 'Open Tenders',
            count: data.sellerOpenTendersCount || 0,
            href: '/seller/tenders',
            icon: Gavel,
            tone: 'indigo',
            show: isSeller,
            priority: false
        },
        {
            label: 'Active POs',
            count: data.sellerActivePOsCount || 0,
            href: '/seller/orders',
            icon: Package,
            tone: 'emerald',
            show: isSeller,
            priority: false
        },
        {
            label: 'Catalogue Items',
            count: data.sellerCatalogueItemsCount || 0,
            href: '/seller/marketplace',
            icon: Store,
            tone: 'blue',
            show: isSeller,
            priority: false
        },
        {
            label: 'Active Deliveries',
            count: data.activeDeliveriesCount || 0,
            href: '/seller/delivery-management',
            icon: Truck,
            tone: 'cyan',
            show: isSeller,
            priority: false
        },
        {
            label: 'Pending Invoices',
            count: data.sellerPendingInvoicesCount || 0,
            href: '/seller/invoices',
            icon: Receipt,
            tone: 'rose',
            show: isSeller,
            priority: false
        },
        {
            label: 'Quotations',
            count: data.sellerQuotationsCount || 0,
            href: '/quotations',
            icon: FileText,
            tone: 'purple',
            show: isSeller,
            priority: false
        },

        // ─── Org Admin / Role specific buyer priority task tiles ───
        {
            label: 'Approvals Pending',
            count: data.pendingApprovalsCount || 0,
            href: '/approvals',
            icon: Inbox,
            tone: 'amber',
            show: isBuyer && !!(isOrgAdmin || isProcurementOfficer || isFinanceOfficer),
            priority: true
        },
        {
            label: 'Carts to Approve',
            count: data.cartApprovalsCount || 0,
            href: '/cart/approvals',
            icon: ClipboardCheck,
            tone: 'blue',
            show: isBuyer && !!(isOrgAdmin || isFinanceOfficer),
            priority: true
        },
        {
            label: 'Tech Review Queue',
            count: data.techReviewCount || 0,
            href: '/cart/technical-review',
            icon: FileText,
            tone: 'purple',
            show: isBuyer && !!(isOrgAdmin || isTechnicalOfficer),
            priority: true
        }
    ];

    const visible = cards.filter(c => c.show);
    if (visible.length === 0) return null;

    const priorityActions = visible.filter(c => c.priority);
    const generalMonitoring = visible.filter(c => !c.priority);

    return (
        <div className="space-y-4">
            {/* Group 1: Priority Action Queue */}
            {priorityActions.length > 0 && (
                <div className="space-y-2">
                    <div className="flex items-center gap-1.5 pl-0.5">
                        <span className="flex h-1.5 w-1.5 rounded-full bg-amber-500 animate-pulse" />
                        <h4 className="text-[9px] font-black uppercase tracking-widest text-[#12335f]">
                            Priority Actions Required {orgRole && `· ${orgRole.replace(/_/g, ' ')}`}
                        </h4>
                    </div>
                    <div className="grid grid-cols-2 gap-2 lg:grid-cols-4">
                        {priorityActions.map(card => (
                            <button
                                key={card.label}
                                type="button"
                                onClick={() => router.push(card.href)}
                                className={cn(
                                    "group text-left rounded-lg border border-slate-200 bg-white p-3 hover:shadow-md transition-all duration-200 transform hover:-translate-y-0.5 active:scale-[0.98] active:translate-y-px focus:outline-none focus:ring-2 relative overflow-hidden",
                                    TONE_HOVER_BORDERS[card.tone] || TONE_HOVER_BORDERS.slate
                                )}
                            >
                                {card.count > 0 && (
                                    <div className={cn(
                                        "absolute top-0 bottom-0 left-0 w-0.5",
                                        card.tone === 'amber' ? "bg-amber-500" :
                                        card.tone === 'blue' ? "bg-blue-500" :
                                        card.tone === 'purple' ? "bg-purple-500" :
                                        card.tone === 'emerald' ? "bg-emerald-500" : "bg-slate-500"
                                    )} />
                                )}

                                <div className="flex items-center justify-between mb-1.5">
                                    <div className={cn(
                                        "flex h-7 w-7 items-center justify-center rounded-lg shadow-sm transition-transform duration-200 group-hover:scale-105", 
                                        TONES[card.tone] || TONES.slate
                                    )}>
                                        <card.icon className="h-3.5 w-3.5" />
                                    </div>
                                    <div className="flex items-center gap-1">
                                        {card.count > 0 && (
                                            <span className={cn(
                                                "inline-flex items-center px-1 py-0.5 rounded text-[7.5px] font-extrabold uppercase tracking-wider animate-pulse",
                                                card.tone === 'amber' ? "bg-amber-100 text-amber-850" :
                                                card.tone === 'rose' ? "bg-rose-100 text-rose-850" :
                                                card.tone === 'emerald' ? "bg-emerald-100 text-emerald-850" : "bg-blue-100 text-blue-850"
                                            )}>
                                                Pending
                                            </span>
                                        )}
                                        <ArrowRight className="h-3 w-3 text-slate-400 group-hover:text-slate-800 transition-transform duration-200 group-hover:translate-x-0.5" />
                                    </div>
                                </div>
                                {isLoading ? (
                                    <div className="h-6 w-10 rounded bg-slate-100 animate-pulse mb-0.5" />
                                ) : (
                                    <p className={cn(
                                        "text-xl font-extrabold tracking-tight leading-none",
                                        card.count > 0 ? (TONE_TEXT_COLORS[card.tone] || "text-slate-900") : "text-slate-800"
                                    )}>
                                        {card.count}
                                    </p>
                                )}
                                <p className="text-[9px] font-bold uppercase tracking-wide text-slate-650 mt-1 leading-tight">{card.label}</p>
                            </button>
                        ))}
                    </div>
                </div>
            )}

            {/* Group 2: General Monitoring */}
            {generalMonitoring.length > 0 && (
                <div className="space-y-2">
                    <h4 className="text-[9px] font-black uppercase tracking-widest text-slate-400 pl-0.5">
                        General Monitoring
                    </h4>
                    <div className="grid grid-cols-2 gap-2 lg:grid-cols-4">
                        {generalMonitoring.map(card => (
                            <button
                                key={card.label}
                                type="button"
                                onClick={() => router.push(card.href)}
                                className={cn(
                                    "group text-left rounded-lg border border-slate-200 bg-white p-3 hover:shadow-md transition-all duration-200 transform hover:-translate-y-0.5 active:scale-[0.98] active:translate-y-px focus:outline-none focus:ring-2",
                                    TONE_HOVER_BORDERS[card.tone] || TONE_HOVER_BORDERS.slate
                                )}
                            >
                                <div className="flex items-center justify-between mb-1.5">
                                    <div className={cn(
                                        "flex h-7 w-7 items-center justify-center rounded-lg transition-transform duration-200 group-hover:scale-105", 
                                        TONES[card.tone] || TONES.slate
                                    )}>
                                        <card.icon className="h-3.5 w-3.5" />
                                    </div>
                                    <ArrowRight className="h-3 w-3 text-slate-400 group-hover:text-slate-700 transition-transform duration-200 group-hover:translate-x-0.5" />
                                </div>
                                {isLoading ? (
                                    <div className="h-6 w-10 rounded bg-slate-100 animate-pulse mb-0.5" />
                                ) : (
                                    <p className={cn(
                                        "text-xl font-extrabold tracking-tight leading-none",
                                        card.count > 0 ? (TONE_TEXT_COLORS[card.tone] || "text-slate-900") : "text-slate-800"
                                    )}>
                                        {card.count}
                                    </p>
                                )}
                                <p className="text-[9px] font-bold uppercase tracking-wide text-slate-500 mt-1 leading-tight">{card.label}</p>
                            </button>
                        ))}
                    </div>
                </div>
            )}
        </div>
    );
}
