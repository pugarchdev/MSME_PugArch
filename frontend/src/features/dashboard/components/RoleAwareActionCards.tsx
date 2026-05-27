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

export default function RoleAwareActionCards() {
    const { user } = useAuth();
    const { orgRole, isOrgAdmin, isProcurementOfficer, isFinanceOfficer, isTechnicalOfficer, isLogisticsOfficer } = useOrgRole();
    const router = useRouter();

    const summary = useQuery({
        queryKey: ['dashboard', 'summary'] as const,
        queryFn: () => getApi<DashboardSummary>('/api/dashboard/summary').catch(() => null),
        enabled: !!user && user.role !== 'admin',
        staleTime: 60_000,
        // Show whatever we last cached immediately so KPI tiles never flash
        // empty after navigation. React Query revalidates in the background.
        placeholderData: (prev) => prev,
        refetchOnWindowFocus: false
    });

    const data: DashboardSummary = summary.data || {};
    const isLoading = summary.isLoading && !summary.data;
    const isBuyer = user?.role === 'buyer';
    const isSeller = user?.role === 'seller';

    const cards: Array<{ label: string; count: number; href: string; icon: any; tone: string; show: boolean }> = [
        // ─── Role-gated approval tiles ───
        {
            label: 'Approvals Pending',
            count: data.pendingApprovalsCount || 0,
            href: '/approvals',
            icon: Inbox,
            tone: 'amber',
            show: isOrgAdmin || isProcurementOfficer || isFinanceOfficer
        },
        {
            label: 'Carts to Approve',
            count: data.cartApprovalsCount || 0,
            href: '/cart/approvals',
            icon: ClipboardCheck,
            tone: 'blue',
            show: isOrgAdmin || isFinanceOfficer
        },
        {
            label: 'Tech Review Queue',
            count: data.techReviewCount || 0,
            href: '/cart/technical-review',
            icon: FileText,
            tone: 'purple',
            show: isOrgAdmin || isTechnicalOfficer
        },
        {
            label: 'GRNs to Approve',
            count: data.grnsToApproveCount || 0,
            href: '/grn',
            icon: ClipboardList,
            tone: 'emerald',
            show: !!user && user.role !== 'admin'
        },

        // ─── Buyer baseline tiles (always visible to every buyer) ───
        {
            label: 'My Tenders',
            count: data.myTendersCount || 0,
            href: '/tenders',
            icon: Gavel,
            tone: 'indigo',
            show: isBuyer
        },
        {
            label: 'Active POs',
            count: data.myActivePOsCount || 0,
            href: '/purchase-orders',
            icon: Package,
            tone: 'emerald',
            show: isBuyer
        },
        {
            label: 'Open RFQs',
            count: data.myRfqsCount || 0,
            href: '/rfq',
            icon: Send,
            tone: 'blue',
            show: isBuyer
        },
        {
            label: 'Pending Invoices',
            count: data.myPendingInvoicesCount || 0,
            href: '/invoices',
            icon: Receipt,
            tone: 'rose',
            show: isBuyer
        },

        // ─── Seller baseline tiles (always visible to every seller) ───
        {
            label: 'Open Tenders',
            count: data.sellerOpenTendersCount || 0,
            href: '/seller/tenders',
            icon: Gavel,
            tone: 'indigo',
            show: isSeller
        },
        {
            label: 'Active POs',
            count: data.sellerActivePOsCount || 0,
            href: '/purchase-orders',
            icon: Package,
            tone: 'emerald',
            show: isSeller
        },
        {
            label: 'Catalogue Items',
            count: data.sellerCatalogueItemsCount || 0,
            href: '/seller/marketplace',
            icon: Store,
            tone: 'blue',
            show: isSeller
        },
        {
            label: 'Active Deliveries',
            count: data.activeDeliveriesCount || 0,
            href: '/seller/delivery-management',
            icon: Truck,
            tone: 'cyan',
            show: isSeller && (isOrgAdmin || isLogisticsOfficer || !orgRole)
        },
        {
            label: 'Pending Invoices',
            count: data.sellerPendingInvoicesCount || 0,
            href: '/invoices',
            icon: Receipt,
            tone: 'rose',
            show: isSeller
        },

        // ─── Common shortcut for both ───
        {
            label: 'Cart Items',
            count: data.cartItemCount || 0,
            href: '/cart',
            icon: ShoppingCart,
            tone: 'slate',
            show: isBuyer
        }
    ];

    const visible = cards.filter(c => c.show);
    if (visible.length === 0) return null;

    return (
        <div className="space-y-3">
            <p className="text-[10px] font-black uppercase tracking-widest text-[#12335f]">
                My Tasks {orgRole && `· ${orgRole.replace(/_/g, ' ')}`}
            </p>
            <div className="grid grid-cols-2 gap-3 md:grid-cols-3 xl:grid-cols-4 2xl:grid-cols-6">
                {visible.map(card => (
                    <button
                        key={card.label}
                        type="button"
                        onClick={() => router.push(card.href)}
                        className="group text-left rounded-xl border border-slate-200 bg-white p-4 hover:border-[#12335f]/30 hover:shadow-md transition-all focus:outline-none focus:ring-2 focus:ring-[#12335f]/20"
                    >
                        <div className="flex items-center justify-between mb-2">
                            <div className={`flex h-8 w-8 items-center justify-center rounded-lg ${TONES[card.tone] || TONES.slate}`}>
                                <card.icon className="h-4 w-4" />
                            </div>
                            <ArrowRight className="h-3 w-3 text-slate-400 group-hover:text-[#12335f] transition" />
                        </div>
                        {isLoading ? (
                            <div className="h-7 w-12 rounded bg-slate-100 animate-pulse mb-1" />
                        ) : (
                            <p className="text-2xl font-black text-slate-950">{card.count}</p>
                        )}
                        <p className="text-[10px] font-bold uppercase tracking-wider text-slate-500 mt-0.5">{card.label}</p>
                    </button>
                ))}
            </div>
        </div>
    );
}
