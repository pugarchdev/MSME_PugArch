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
import React, { useCallback, useMemo, useEffect } from 'react';
import {
    AlertTriangle, ArrowRight, ClipboardCheck, ClipboardList, FileText, Gavel,
    Inbox, Package, Receipt, Send, ShoppingCart, Store, Truck, Landmark, IndianRupee
} from 'lucide-react';
import { useRouter } from 'next/navigation';
import { useAuth } from '../../../hooks/useAuth';
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
    sellerOpportunitiesCount?: number;
    sellerActivePOsCount?: number;
    sellerCatalogueItemsCount?: number;
    sellerPendingInvoicesCount?: number;
    sellerQuotationsCount?: number;
    reverseAuctionsActive?: number;
    reverseAuctionsScheduled?: number;
    reverseAuctionsClosed?: number;
    reverseAuctionInvites?: number;
    reverseAuctionsLive?: number;
    reverseAuctionBidsSubmitted?: number;
    buyerProcurementActiveBidsCount?: number;
    buyerProcurementTotalSpentValue?: number;
    orgRole?: string;
    isAdmin?: boolean;
}

type ActionCardConfig = {
    label: string;
    count: number;
    href: string;
    icon: React.ComponentType<{ className?: string }>;
    tone: string;
    show: boolean;
    priority: boolean;
};

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

const CARD_STYLES: Record<string, string> = {
    indigo: 'bg-indigo-50/40 text-indigo-950 ring-indigo-600/15 hover:bg-indigo-50/80 hover:ring-indigo-600/30',
    emerald: 'bg-emerald-50/40 text-emerald-950 ring-emerald-600/15 hover:bg-emerald-50/80 hover:ring-emerald-600/30',
    blue: 'bg-blue-50/40 text-blue-950 ring-blue-600/15 hover:bg-blue-50/80 hover:ring-blue-600/30',
    rose: 'bg-rose-50/40 text-rose-950 ring-rose-600/15 hover:bg-rose-50/80 hover:ring-rose-600/30',
    slate: 'bg-slate-50/40 text-slate-900 ring-slate-600/15 hover:bg-slate-100 hover:ring-slate-600/30',
    amber: 'bg-amber-50/40 text-amber-950 ring-amber-600/15 hover:bg-amber-50/80 hover:ring-amber-600/30',
    purple: 'bg-purple-50/40 text-purple-950 ring-purple-600/15 hover:bg-purple-50/80 hover:ring-purple-600/30',
    cyan: 'bg-cyan-50/40 text-cyan-950 ring-cyan-600/15 hover:bg-cyan-50/80 hover:ring-cyan-600/30'
};

const ActionCard = React.memo(function ActionCard({
    card,
    isLoading,
    priority,
    onOpen
}: {
    card: ActionCardConfig;
    isLoading: boolean;
    priority?: boolean;
    onOpen: (href: string) => void;
}) {
    const Icon = card.icon;
    const handleClick = useCallback(() => onOpen(card.href), [card.href, onOpen]);

    return (
        <button
            type="button"
            onClick={handleClick}
            className={cn(
                "group flex min-h-[96px] w-full flex-col text-left rounded-2xl p-4 ring-1 transition hover:scale-[1.02] duration-200 active:scale-[0.98] focus:outline-none focus:ring-2",
                priority && "relative overflow-hidden",
                CARD_STYLES[card.tone] || CARD_STYLES.slate
            )}
        >
            <div className="flex items-center justify-between w-full">
                <div className="flex h-8 w-8 items-center justify-center rounded-xl bg-white shadow-sm ring-1 ring-current/15 transition-transform duration-200 group-hover:scale-105">
                    <Icon className="h-4 w-4 text-current" />
                </div>
                <div className="flex items-center gap-1.5">
                    {priority && card.count > 0 && (
                        <span className="inline-flex items-center px-2 py-0.5 rounded text-[8px] font-black uppercase tracking-wider bg-current/10 text-current animate-pulse">
                            Pending
                        </span>
                    )}
                    <ArrowRight className="h-4 w-4 text-current/60 transition-transform duration-200 group-hover:translate-x-0.5" />
                </div>
            </div>
            {isLoading ? (
                <div className="h-6 w-10 rounded bg-slate-200 animate-pulse mt-3 mb-0.5" />
            ) : (
                <p className="text-2xl font-black tracking-tight leading-none mt-3 text-slate-900">
                    {(card as any).isCurrency ? `₹${Number(card.count).toLocaleString('en-IN')}` : card.count}
                </p>
            )}
            <p className="text-[9px] font-black uppercase tracking-wider mt-1.5 leading-tight text-slate-500">{card.label}</p>
        </button>
    );
});

function RoleAwareActionCards() {
    const { user } = useAuth();
    const router = useRouter();

    const summary = useQuery({
        queryKey: ['dashboard', 'summary'] as const,
        queryFn: () => getApi<DashboardSummary>('/api/dashboard/summary', true).catch(() => null),
        enabled: !!user && user.role !== 'admin',
        refetchOnWindowFocus: true,
        staleTime: 15_000,
        placeholderData: (prev) => {
            if (prev) return prev;
            if (typeof window !== 'undefined' && user?.id) {
                const cached = localStorage.getItem(`dashboard_summary_${user.id}`);
                if (cached) {
                    try {
                        return JSON.parse(cached);
                    } catch (e) {
                        return undefined;
                    }
                }
            }
            return undefined;
        }
    });

    useEffect(() => {
        if (summary.data && user?.id) {
            localStorage.setItem(`dashboard_summary_${user.id}`, JSON.stringify(summary.data));
        }
    }, [summary.data, user?.id]);

    const data: DashboardSummary = summary.data || {};
    const isLoading = summary.isLoading && !summary.data;
    const isBuyer = user?.role === 'buyer';
    const isSeller = user?.role === 'seller';
    const permissions = Array.isArray(user?.permissions) ? user.permissions : [];
    const hasPermission = useCallback((permissionCode: string) => {
        return permissions.includes('*') || permissions.includes(permissionCode);
    }, [permissions]);

    const cards: ActionCardConfig[] = useMemo(() => [
        // ─── Buyer baseline tiles (Exactly 10) ───
        {
            label: 'Active Procurements',
            count: data.myTendersCount || 0,
            href: '/buyer/my-procurements',
            icon: ClipboardList,
            tone: 'indigo',
            show: isBuyer,
            priority: false
        },
        {
            label: 'Procurement Bids',
            count: data.buyerProcurementActiveBidsCount || 0,
            href: '/marketplace',
            icon: Gavel,
            tone: 'purple',
            show: isBuyer,
            priority: false
        },
        {
            label: 'Procurement Spend',
            count: data.buyerProcurementTotalSpentValue || 0,
            href: '/payments/transactions',
            icon: IndianRupee,
            tone: 'emerald',
            show: isBuyer,
            priority: false,
            isCurrency: true
        } as any,
        {
            label: 'Active Orders',
            count: data.myActivePOsCount || 0,
            href: '/orders',
            icon: Package,
            tone: 'emerald',
            show: isBuyer,
            priority: false
        },
        {
            label: 'Supplier Responses',
            count: data.myRfqsCount || 0,
            href: '/buyer/procurement/responses',
            icon: Send,
            tone: 'blue',
            show: isBuyer,
            priority: false
        },
        {
            label: 'Negotiate Price',
            count: data.reverseAuctionsActive || data.reverseAuctionsScheduled || 0,
            href: '/buyer/my-procurements?type=Reverse Auction',
            icon: Gavel,
            tone: 'amber',
            show: isBuyer,
            priority: false
        },
        {
            label: 'Pending Payments',
            count: data.myPendingInvoicesCount || 0,
            href: '/payments/invoices',
            icon: Receipt,
            tone: 'rose',
            show: isBuyer,
            priority: false
        },
        {
            label: 'Delivery Confirmation',
            count: data.grnsToApproveCount || 0,
            href: '/orders/delivery-confirmation',
            icon: ClipboardCheck,
            tone: 'emerald',
            show: isBuyer && hasPermission('inspection.view'),
            priority: false
        },
        {
            label: 'Carts to Approve',
            count: data.cartApprovalsCount || 0,
            href: '/cart/approvals',
            icon: ClipboardCheck,
            tone: 'blue',
            show: isBuyer && hasPermission('checkout.approve'),
            priority: false
        },
        {
            label: 'Approvals Pending',
            count: data.pendingApprovalsCount || 0,
            href: '/approvals',
            icon: Inbox,
            tone: 'amber',
            show: isBuyer && hasPermission('approval.view'),
            priority: false
        },

        // ─── Seller baseline tiles (Exactly 10) ───
        {
            label: 'New Opportunities',
            count: data.sellerOpportunitiesCount || 0,
            href: '/seller/opportunities',
            icon: ClipboardList,
            tone: 'indigo',
            show: isSeller,
            priority: false
        },
        {
            label: 'Public Tenders',
            count: data.sellerOpenTendersCount || 0,
            href: '/seller/tenders',
            icon: Gavel,
            tone: 'indigo',
            show: isSeller,
            priority: false
        },
        {
            label: 'My Bids / Quotations',
            count: data.sellerQuotationsCount || 0,
            href: '/quotations',
            icon: ClipboardCheck,
            tone: 'purple',
            show: isSeller,
            priority: false
        },
        {
            label: 'Orders Received',
            count: data.sellerActivePOsCount || 0,
            href: '/orders',
            icon: Package,
            tone: 'emerald',
            show: isSeller,
            priority: false
        },
        {
            label: 'Catalogue Items',
            count: data.sellerCatalogueItemsCount || 0,
            href: '/seller/catalogue',
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
            label: 'Payment Status',
            count: data.sellerPendingInvoicesCount || 0,
            href: '/payments/transactions',
            icon: Receipt,
            tone: 'rose',
            show: isSeller,
            priority: false
        },
        {
            label: 'Request Quotations',
            count: data.sellerQuotationsCount || 0,
            href: '/seller/rfq',
            icon: FileText,
            tone: 'purple',
            show: isSeller,
            priority: false
        },
        {
            label: 'Live Auctions',
            count: data.reverseAuctionsLive || data.reverseAuctionInvites || 0,
            href: '/seller/opportunities/auctions',
            icon: Gavel,
            tone: 'amber',
            show: isSeller,
            priority: false
        },
        {
            label: 'Invoice Factoring',
            count: 0,
            href: '/factoring',
            icon: Landmark,
            tone: 'indigo',
            show: isSeller,
            priority: false
        }
    ], [data, isBuyer, isSeller]);

    const visible = useMemo(() => cards.filter(c => c.show), [cards]);
    const openCard = useCallback((href: string) => router.push(href), [router]);

    if (visible.length === 0) return null;

    return (
        <div className="space-y-2">
            <h4 className="text-[10px] font-black uppercase tracking-wider text-slate-400 pl-0.5">
                General Monitoring
            </h4>
            <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-5">
                {visible.map(card => <ActionCard key={card.label} card={card} isLoading={isLoading} onOpen={openCard} />)}
            </div>
        </div>
    );
}

export default React.memo(RoleAwareActionCards);
