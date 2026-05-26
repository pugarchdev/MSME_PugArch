/**
 * AuctionLivePage — real-time reverse auction with countdown + bid history.
 *
 * Route: /auctions/:id/live
 *
 * - Both buyer and sellers view this; sellers see a bid input; buyer sees finalize.
 * - Polls auction state every 5s (no SSE for now).
 */
import { useEffect, useMemo, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
    AlertTriangle, ArrowLeft, Award, CheckCircle2, Clock, Gavel, History,
    Loader2, RefreshCw, Send, TrendingDown
} from 'lucide-react';
import { useRouter } from 'next/navigation';
import { useAuth } from '../../../hooks/useAuth';
import { Button } from '../../../components/ui/button';
import { Card, CardContent } from '../../../components/ui/card';
import { EntityIdLink } from '../../shared/EntityIdLink';
import { InlineError, LoadingState } from '../../shared/FeatureStates';
import { formatCurrency, formatDateTime, formatRelative } from '../../shared/format';
import { runWithToast } from '../../../lib/toast';
import { toast } from 'sonner';
import {
    fetchAuction, fetchAuctionHistory, finalizeAuction, placeAuctionBid
} from '../api';

interface Props { id: number }

export default function AuctionLivePage({ id }: Props) {
    const router = useRouter();
    const { user } = useAuth();
    const qc = useQueryClient();

    const auction = useQuery({
        queryKey: ['auction', id] as const,
        queryFn: () => fetchAuction(id),
        enabled: id > 0,
        refetchInterval: 5_000
    });
    const history = useQuery({
        queryKey: ['auction-history', id] as const,
        queryFn: () => fetchAuctionHistory(id),
        enabled: id > 0,
        refetchInterval: 5_000
    });

    const placeMut = useMutation({
        mutationFn: (amount: number) => placeAuctionBid(id, amount),
        onSuccess: () => {
            qc.invalidateQueries({ queryKey: ['auction', id] });
            qc.invalidateQueries({ queryKey: ['auction-history', id] });
        }
    });

    const finalizeMut = useMutation({
        mutationFn: () => finalizeAuction(id),
        onSuccess: () => {
            qc.invalidateQueries({ queryKey: ['auction', id] });
            qc.invalidateQueries({ queryKey: ['auction-history', id] });
        }
    });

    const [countdown, setCountdown] = useState<string>('');
    const [bidAmount, setBidAmount] = useState<string>('');

    // Live countdown ticker
    useEffect(() => {
        if (!auction.data?.endTime) return;
        const tick = () => {
            const end = new Date(auction.data!.endTime).getTime();
            const now = Date.now();
            const diff = end - now;
            if (diff <= 0) { setCountdown('Auction ended'); return; }
            const hours = Math.floor(diff / 3600_000);
            const minutes = Math.floor((diff % 3600_000) / 60_000);
            const seconds = Math.floor((diff % 60_000) / 1000);
            setCountdown(`${String(hours).padStart(2, '0')}:${String(minutes).padStart(2, '0')}:${String(seconds).padStart(2, '0')}`);
        };
        tick();
        const t = setInterval(tick, 1000);
        return () => clearInterval(t);
    }, [auction.data?.endTime]);

    if (auction.isLoading) return <LoadingState label="Loading auction..." />;
    if (auction.error) return <InlineError message={(auction.error as Error).message} onRetry={() => auction.refetch()} />;
    if (!auction.data) return null;

    const a = auction.data;
    const bids = history.data || [];

    const isSeller = user?.role === 'seller';
    const isBuyer = user?.role === 'buyer' && a.Tender?.buyerId === Number(user?.id);
    const isAdmin = user?.role === 'admin';
    const isLive = a.status === 'active' || a.status === 'in_progress';
    const hasEnded = new Date(a.endTime).getTime() <= Date.now();
    const canFinalize = (isBuyer || isAdmin) && (hasEnded || a.status === 'active') && a.status !== 'finalized';

    const lowestSoFar = useMemo(() => {
        if (a.currentLowestBid !== null && a.currentLowestBid !== undefined) return Number(a.currentLowestBid);
        if (bids.length === 0) return Number(a.startPrice);
        return Math.min(...bids.map(b => Number(b.bidAmount)));
    }, [a, bids]);

    const minNextBid = lowestSoFar - Number(a.minDecrement);

    const handlePlaceBid = async () => {
        const amount = Number(bidAmount);
        if (!Number.isFinite(amount) || amount <= 0) { toast.error('Enter a valid amount'); return; }
        if (amount > lowestSoFar - Number(a.minDecrement)) {
            toast.error(`Bid must be at most ${formatCurrency(minNextBid)} (current ${formatCurrency(lowestSoFar)} − min decrement ${formatCurrency(a.minDecrement)})`);
            return;
        }
        await runWithToast(() => placeMut.mutateAsync(amount), {
            loading: 'Placing bid...', success: 'Bid placed', error: 'Bid failed'
        });
        setBidAmount('');
    };

    return (
        <div className="space-y-4">
            <div className="flex flex-col gap-3 border-b border-slate-200 pb-4 md:flex-row md:items-end md:justify-between">
                <div className="min-w-0">
                    <button onClick={() => router.back()} className="inline-flex items-center text-[10px] font-black uppercase tracking-widest text-[#12335f] hover:underline">
                        <ArrowLeft className="mr-1 h-3 w-3" /> Back
                    </button>
                    <div className="mt-1 flex items-center gap-2 flex-wrap">
                        <h1 className="text-2xl font-black text-slate-950">Live Reverse Auction</h1>
                        <EntityIdLink label={`AUC-${a.id}`} id={a.id} size="sm" onClick={() => { }} />
                        {a.Tender && <EntityIdLink label={a.Tender.tenderId} id={a.Tender.id} size="sm" onClick={() => router.push(`/buyer/tenders/${a.Tender!.id}`)} />}
                        <span className={`inline-flex rounded-md border px-2 py-0.5 text-[10px] font-black uppercase ${a.status === 'finalized' ? 'border-emerald-200 bg-emerald-50 text-emerald-800' : isLive ? 'border-cyan-200 bg-cyan-50 text-cyan-800 animate-pulse' : 'border-slate-200 bg-slate-50 text-slate-700'}`}>
                            {a.status}
                        </span>
                    </div>
                    {a.Tender && (
                        <p className="mt-1 text-sm font-bold text-slate-700 text-wrap-anywhere">{a.Tender.title}</p>
                    )}
                </div>
                <Button variant="outline" onClick={() => { auction.refetch(); history.refetch(); }} className="h-10 rounded-lg text-xs font-black uppercase">
                    <RefreshCw className={`mr-2 h-4 w-4 ${auction.isFetching ? 'animate-spin' : ''}`} /> Refresh
                </Button>
            </div>

            {/* Hero panel */}
            <div className="grid gap-3 lg:grid-cols-3">
                <Card className="lg:col-span-2">
                    <CardContent className="p-6 text-center bg-gradient-to-br from-[#0b1f3a] to-[#12335f] text-white rounded-lg">
                        <p className="text-[10px] font-black uppercase tracking-widest text-blue-200">Current Lowest Bid</p>
                        <p className="mt-2 text-5xl font-black tracking-tight">{formatCurrency(lowestSoFar)}</p>
                        {a.currentWinnerId && (
                            <p className="mt-1 text-xs text-blue-200">
                                Leader: Seller #{a.currentWinnerId}
                            </p>
                        )}
                        <div className="mt-4 inline-flex items-center gap-2 rounded-lg border border-white/20 bg-white/5 px-4 py-2">
                            <Clock className="h-5 w-5" />
                            <p className="text-2xl font-mono font-black tracking-widest">{countdown}</p>
                        </div>
                        <p className="mt-2 text-[10px] text-blue-200">Started {formatRelative(a.startTime)} · Ends {formatDateTime(a.endTime)}</p>
                    </CardContent>
                </Card>

                <Card>
                    <CardContent className="p-4 space-y-2">
                        <p className="text-[10px] font-black uppercase tracking-widest text-slate-500">Auction Rules</p>
                        <Stat label="Start Price" value={formatCurrency(a.startPrice)} />
                        <Stat label="Min Decrement" value={formatCurrency(a.minDecrement)} />
                        <Stat label="Total Bids" value={String(bids.length)} />
                    </CardContent>
                </Card>
            </div>

            {/* Bid input (sellers) */}
            {isSeller && isLive && !hasEnded && (
                <Card className="border-cyan-200 bg-cyan-50/40">
                    <CardContent className="p-5 space-y-3">
                        <div className="flex items-center gap-2">
                            <Gavel className="h-5 w-5 text-cyan-700" />
                            <p className="text-sm font-black uppercase tracking-wider text-cyan-800">Place Your Bid</p>
                        </div>
                        <p className="text-xs font-semibold text-slate-700">
                            Your bid must be at most <span className="font-black">{formatCurrency(minNextBid)}</span> (lowest − minimum decrement of {formatCurrency(a.minDecrement)}).
                        </p>
                        <div className="flex gap-2">
                            <input
                                type="number"
                                step="0.01"
                                value={bidAmount}
                                onChange={e => setBidAmount(e.target.value)}
                                placeholder={String(minNextBid)}
                                className="h-11 flex-1 rounded-lg border border-cyan-300 bg-white px-3 text-lg font-mono font-black text-cyan-900 outline-none focus:ring-2 focus:ring-cyan-500/30"
                            />
                            <Button onClick={handlePlaceBid} disabled={placeMut.isPending} className="bg-cyan-700 text-white hover:bg-cyan-800">
                                {placeMut.isPending ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Send className="mr-2 h-4 w-4" />}
                                Place Bid
                            </Button>
                        </div>
                    </CardContent>
                </Card>
            )}

            {/* Buyer finalize action */}
            {canFinalize && (
                <Card className="border-emerald-200 bg-emerald-50/40">
                    <CardContent className="p-5 space-y-3">
                        <div className="flex items-center gap-2">
                            <Award className="h-5 w-5 text-emerald-700" />
                            <p className="text-sm font-black uppercase tracking-wider text-emerald-800">Finalize Auction</p>
                        </div>
                        <p className="text-xs font-semibold text-slate-700">
                            {hasEnded ? 'The auction has ended.' : 'You can finalize early if you wish.'} Current leader will win the contract.
                        </p>
                        <Button
                            onClick={async () => {
                                if (!window.confirm('Finalize and award to current leader?')) return;
                                await runWithToast(() => finalizeMut.mutateAsync(), {
                                    loading: 'Finalizing...', success: 'Auction finalized', error: 'Finalize failed'
                                });
                            }}
                            disabled={finalizeMut.isPending}
                            className="bg-emerald-600 text-white"
                        >
                            {finalizeMut.isPending ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <CheckCircle2 className="mr-2 h-4 w-4" />}
                            Finalize Auction
                        </Button>
                    </CardContent>
                </Card>
            )}

            {/* Bid history */}
            <Card>
                <CardContent className="p-0">
                    <div className="border-b border-slate-100 bg-slate-50/60 px-4 py-3">
                        <div className="flex items-center gap-2">
                            <History className="h-4 w-4 text-slate-500" />
                            <p className="text-[10px] font-black uppercase tracking-widest text-slate-500">Bid History ({bids.length})</p>
                        </div>
                    </div>
                    {bids.length === 0 ? (
                        <p className="p-8 text-center text-xs font-semibold text-slate-500">No bids yet. Sellers can place the first one.</p>
                    ) : (
                        <div className="divide-y divide-slate-100">
                            {bids.map((b, idx) => (
                                <div key={b.id} className="flex items-center justify-between px-4 py-3">
                                    <div className="flex items-center gap-3">
                                        <span className={`flex h-7 w-7 items-center justify-center rounded-full text-[10px] font-black ${idx === 0 ? 'bg-emerald-100 text-emerald-700' : 'bg-slate-100 text-slate-600'}`}>
                                            #{bids.length - idx}
                                        </span>
                                        <div>
                                            <p className="text-xs font-black text-slate-900">{b.seller?.name || `Seller #${b.sellerId}`}</p>
                                            <p className="text-[10px] text-slate-500">{formatRelative(b.createdAt)}</p>
                                        </div>
                                    </div>
                                    <div className="text-right">
                                        <p className={`text-base font-black ${idx === 0 ? 'text-emerald-700' : 'text-slate-700'}`}>
                                            {formatCurrency(b.bidAmount)}
                                        </p>
                                        {idx === 0 && (
                                            <p className="text-[10px] font-black uppercase text-emerald-700 inline-flex items-center gap-1">
                                                <TrendingDown className="h-3 w-3" /> Leader
                                            </p>
                                        )}
                                    </div>
                                </div>
                            ))}
                        </div>
                    )}
                </CardContent>
            </Card>
        </div>
    );
}

function Stat({ label, value }: { label: string; value: string }) {
    return (
        <div className="flex items-center justify-between">
            <p className="text-[10px] font-bold uppercase text-slate-500">{label}</p>
            <p className="text-xs font-black text-slate-900">{value}</p>
        </div>
    );
}
