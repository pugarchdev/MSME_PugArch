/**
 * RoleAwareActionCards — shows quick-action cards on the Dashboard tailored
 * to the user's intra-organisation role. Each card is a direct link to the
 * relevant page with a count of pending items.
 *
 * Used by Dashboard.tsx after the existing summary section.
 */
import { useQuery } from '@tanstack/react-query';
import {
    AlertTriangle, ArrowRight, ClipboardCheck, ClipboardList, FileText,
    Inbox, Package, Send, ShoppingCart, Truck
} from 'lucide-react';
import { useRouter } from 'next/navigation';
import { useAuth } from '../../../hooks/useAuth';
import { useOrgRole } from '../../../hooks/useOrgRole';
import { Card, CardContent } from '../../../components/ui/card';
import { getApi } from '../../shared/apiClient';

export default function RoleAwareActionCards() {
    const { user } = useAuth();
    const { orgRole, isOrgAdmin, isProcurementOfficer, isFinanceOfficer, isTechnicalOfficer, isLogisticsOfficer } = useOrgRole();
    const router = useRouter();

    // Counts (keep all queries lightweight — best-effort)
    const pendingApprovals = useQuery({
        queryKey: ['dashboard', 'pending-approvals'] as const,
        queryFn: () => getApi<any[]>('/api/approvals/pending').catch(() => []),
        enabled: !!user && user.role !== 'admin',
        staleTime: 60_000
    });

    const cartApprovals = useQuery({
        queryKey: ['dashboard', 'cart-approvals'] as const,
        queryFn: () => getApi<any[]>('/api/cart/pending-approval').catch(() => []),
        enabled: isOrgAdmin || isFinanceOfficer,
        staleTime: 60_000
    });

    const techReview = useQuery({
        queryKey: ['dashboard', 'tech-review'] as const,
        queryFn: () => getApi<any[]>('/api/cart/pending-tech-review').catch(() => []),
        enabled: isOrgAdmin || isTechnicalOfficer,
        staleTime: 60_000
    });

    const grns = useQuery({
        queryKey: ['dashboard', 'grns-submitted'] as const,
        queryFn: () => getApi<any[]>('/api/grn?status=SUBMITTED').catch(() => []),
        enabled: !!user && user.role !== 'admin',
        staleTime: 60_000
    });

    const deliveries = useQuery({
        queryKey: ['dashboard', 'deliveries-active'] as const,
        queryFn: () => getApi<any>('/api/delivery?role=seller').catch(() => ({ items: [] })),
        enabled: user?.role === 'seller',
        staleTime: 60_000
    });

    const cards: Array<{ label: string; count: number; href: string; icon: any; tone: string; show: boolean }> = [
        // Procurement Officer / Org Admin — approvals & carts
        {
            label: 'Approvals Pending',
            count: pendingApprovals.data?.length || 0,
            href: '/approvals',
            icon: Inbox,
            tone: 'amber',
            show: isOrgAdmin || isProcurementOfficer || isFinanceOfficer
        },
        // Finance — cart approvals
        {
            label: 'Carts to Approve',
            count: cartApprovals.data?.length || 0,
            href: '/cart/approvals',
            icon: ClipboardCheck,
            tone: 'blue',
            show: isOrgAdmin || isFinanceOfficer
        },
        // Technical — review
        {
            label: 'Tech Review Queue',
            count: techReview.data?.length || 0,
            href: '/cart/technical-review',
            icon: FileText,
            tone: 'purple',
            show: isOrgAdmin || isTechnicalOfficer
        },
        // GRN
        {
            label: 'GRNs to Approve',
            count: grns.data?.length || 0,
            href: '/grn',
            icon: ClipboardList,
            tone: 'emerald',
            show: !!user && user.role !== 'admin'
        },
        // Seller — active deliveries
        {
            label: 'Active Deliveries',
            count: (deliveries.data?.items || []).length,
            href: '/seller/delivery-management',
            icon: Truck,
            tone: 'cyan',
            show: user?.role === 'seller' && (isOrgAdmin || isLogisticsOfficer)
        },
        // Common quick actions
        {
            label: 'My Cart',
            count: 0,
            href: '/cart',
            icon: ShoppingCart,
            tone: 'slate',
            show: !!user && user.role !== 'admin'
        }
    ];

    const visible = cards.filter(c => c.show);
    if (visible.length === 0) return null;

    return (
        <div className="space-y-3">
            <p className="text-[10px] font-black uppercase tracking-widest text-[#12335f]">My Tasks {orgRole && `· ${orgRole.replace(/_/g, ' ')}`}</p>
            <div className="grid grid-cols-2 gap-3 md:grid-cols-3 xl:grid-cols-6">
                {visible.map(card => (
                    <button
                        key={card.label}
                        type="button"
                        onClick={() => router.push(card.href)}
                        className="group text-left rounded-xl border border-slate-200 bg-white p-4 hover:border-[#12335f]/30 hover:shadow-md transition-all"
                    >
                        <div className="flex items-center justify-between mb-2">
                            <div className={`flex h-8 w-8 items-center justify-center rounded-lg ${TONES[card.tone]}`}>
                                <card.icon className="h-4 w-4" />
                            </div>
                            <ArrowRight className="h-3 w-3 text-slate-400 group-hover:text-[#12335f] transition" />
                        </div>
                        <p className="text-2xl font-black text-slate-950">{card.count}</p>
                        <p className="text-[10px] font-bold uppercase tracking-wider text-slate-500 mt-0.5">{card.label}</p>
                    </button>
                ))}
            </div>
        </div>
    );
}

const TONES: Record<string, string> = {
    amber: 'bg-amber-100 text-amber-700',
    blue: 'bg-blue-100 text-blue-700',
    purple: 'bg-purple-100 text-purple-700',
    emerald: 'bg-emerald-100 text-emerald-700',
    cyan: 'bg-cyan-100 text-cyan-700',
    slate: 'bg-slate-100 text-slate-700'
};
