/**
 * Rating module service - thin layer over the existing rating-workflow that
 * adds aggregation, pagination, and duplicate-prevention. The legacy
 * /ratings/supplier and /ratings/buyer routes remain functional; this service
 * just provides richer read APIs the UI needs (averages, distribution, my
 * rating for a PO).
 */

import prisma from '../../config/prisma.js';
import { ApiError } from '../../utils/ApiError.js';

const db = prisma as any;

const STAR_BUCKETS = [1, 2, 3, 4, 5] as const;

const distribution = (rows: Array<{ rating: number }>) => {
    const counts: Record<number, number> = { 1: 0, 2: 0, 3: 0, 4: 0, 5: 0 };
    for (const row of rows) {
        const star = Math.max(1, Math.min(5, Math.round(row.rating || 0)));
        counts[star] = (counts[star] || 0) + 1;
    }
    return STAR_BUCKETS.map(star => ({ star, count: counts[star] || 0 }));
};

const summarise = (rows: Array<{ rating: number; qualityScore?: number | null; deliveryScore?: number | null; communicationScore?: number | null; paymentTimelinessScore?: number | null }>) => {
    if (rows.length === 0) {
        return {
            count: 0,
            average: 0,
            distribution: distribution([]),
            averages: { quality: 0, delivery: 0, communication: 0, paymentTimeliness: 0 }
        };
    }
    const sum = rows.reduce((acc, row) => acc + (row.rating || 0), 0);
    const score = (key: 'qualityScore' | 'deliveryScore' | 'communicationScore' | 'paymentTimelinessScore') => {
        const filtered = rows.filter(row => typeof row[key] === 'number');
        if (filtered.length === 0) return 0;
        return Number((filtered.reduce((acc, row) => acc + Number(row[key] || 0), 0) / filtered.length).toFixed(2));
    };
    return {
        count: rows.length,
        average: Number((sum / rows.length).toFixed(2)),
        distribution: distribution(rows),
        averages: {
            quality: score('qualityScore'),
            delivery: score('deliveryScore'),
            communication: score('communicationScore'),
            paymentTimeliness: score('paymentTimelinessScore')
        }
    };
};

export const ratingsService = {
    async getSupplierRatings(
        sellerId: number,
        opts: { skip?: number; take?: number } = {}
    ) {
        const take = Math.min(50, Math.max(1, opts.take ?? 20));
        const skip = Math.max(0, opts.skip ?? 0);
        const [rows, all, total] = await Promise.all([
            db.supplierRating.findMany({
                where: { sellerId },
                orderBy: { createdAt: 'desc' },
                skip,
                take,
                include: {
                    buyer: { select: { id: true, name: true } },
                    // PO fields are optional; left out of the include to keep payload lean.
                }
            }),
            db.supplierRating.findMany({
                where: { sellerId },
                select: { rating: true, qualityScore: true, deliveryScore: true, communicationScore: true }
            }),
            db.supplierRating.count({ where: { sellerId } })
        ]);
        return {
            records: rows,
            total,
            skip,
            take,
            summary: summarise(all)
        };
    },

    async getBuyerRatings(
        buyerId: number,
        opts: { skip?: number; take?: number } = {}
    ) {
        const take = Math.min(50, Math.max(1, opts.take ?? 20));
        const skip = Math.max(0, opts.skip ?? 0);
        const [rows, all, total] = await Promise.all([
            db.buyerRating.findMany({
                where: { buyerId },
                orderBy: { createdAt: 'desc' },
                skip,
                take,
                include: {
                    seller: { select: { id: true, name: true } }
                }
            }),
            db.buyerRating.findMany({
                where: { buyerId },
                select: { rating: true, paymentTimelinessScore: true, communicationScore: true }
            }),
            db.buyerRating.count({ where: { buyerId } })
        ]);
        return {
            records: rows,
            total,
            skip,
            take,
            summary: summarise(all)
        };
    },

    /**
     * Returns the actor's rating for a specific purchase order (if any). Used by
     * the UI to decide whether to show a "Rate this delivery" CTA or a
     * "You rated this 4★" badge.
     */
    async getMyRatingForPO(actorId: number, actorRole: string, purchaseOrderId: number) {
        if (actorRole === 'buyer') {
            const rating = await db.supplierRating.findFirst({
                where: { buyerId: actorId, purchaseOrderId }
            });
            return { kind: 'supplier' as const, rating };
        }
        if (actorRole === 'seller') {
            const rating = await db.buyerRating.findFirst({
                where: { sellerId: actorId, purchaseOrderId }
            });
            return { kind: 'buyer' as const, rating };
        }
        return { kind: null, rating: null };
    },

    /**
     * One-call summary used by listing pages - cheap aggregate without the
     * individual rows.
     */
    async getSupplierSummary(sellerId: number) {
        const rows = await db.supplierRating.findMany({
            where: { sellerId },
            select: { rating: true, qualityScore: true, deliveryScore: true, communicationScore: true }
        });
        return summarise(rows);
    },

    async getBuyerSummary(buyerId: number) {
        const rows = await db.buyerRating.findMany({
            where: { buyerId },
            select: { rating: true, paymentTimelinessScore: true, communicationScore: true }
        });
        return summarise(rows);
    },

    /**
     * Bulk summaries for many sellers in a single query. The marketplace lists
     * dozens of sellers per page, so individual roundtrips would be wasteful.
     */
    async getSupplierSummariesForSellers(sellerIds: number[]) {
        if (sellerIds.length === 0) return {} as Record<number, ReturnType<typeof summarise>>;
        const rows: Array<{ sellerId: number; rating: number; qualityScore: number | null; deliveryScore: number | null; communicationScore: number | null }> =
            await db.supplierRating.findMany({
                where: { sellerId: { in: sellerIds } },
                select: {
                    sellerId: true,
                    rating: true,
                    qualityScore: true,
                    deliveryScore: true,
                    communicationScore: true
                }
            });
        const grouped: Record<number, typeof rows> = {};
        for (const row of rows) {
            (grouped[row.sellerId] ||= []).push(row);
        }
        const out: Record<number, ReturnType<typeof summarise>> = {};
        for (const sellerId of sellerIds) {
            out[sellerId] = summarise(grouped[sellerId] || []);
        }
        return out;
    },

    /**
     * Duplicate guard. The existing rating-workflow doesn't enforce one-rating-
     * per-PO; we add it here so accidental double-clicks don't pollute averages.
     */
    async assertNotAlreadyRatedPO(actorId: number, actorRole: string, purchaseOrderId?: number) {
        if (!purchaseOrderId) return;
        if (actorRole === 'buyer') {
            const existing = await db.supplierRating.findFirst({ where: { buyerId: actorId, purchaseOrderId } });
            if (existing) {
                throw new ApiError(
                    409,
                    'You have already rated this purchase order. Edit your rating instead of creating a new one.',
                    'RATING_ALREADY_EXISTS',
                    { ratingId: existing.id }
                );
            }
        } else if (actorRole === 'seller') {
            const existing = await db.buyerRating.findFirst({ where: { sellerId: actorId, purchaseOrderId } });
            if (existing) {
                throw new ApiError(
                    409,
                    'You have already rated this purchase order. Edit your rating instead of creating a new one.',
                    'RATING_ALREADY_EXISTS',
                    { ratingId: existing.id }
                );
            }
        }
    },

    async updateSupplierRating(actorId: number, ratingId: number, data: any) {
        const rating = await db.supplierRating.findUnique({ where: { id: ratingId } });
        if (!rating) throw new ApiError(404, 'Rating not found', 'RATING_NOT_FOUND');
        if (rating.buyerId !== actorId) throw new ApiError(403, 'You can only edit your own ratings', 'RATING_FORBIDDEN');
        return db.supplierRating.update({ where: { id: ratingId }, data });
    },

    async updateBuyerRating(actorId: number, ratingId: number, data: any) {
        const rating = await db.buyerRating.findUnique({ where: { id: ratingId } });
        if (!rating) throw new ApiError(404, 'Rating not found', 'RATING_NOT_FOUND');
        if (rating.sellerId !== actorId) throw new ApiError(403, 'You can only edit your own ratings', 'RATING_FORBIDDEN');
        return db.buyerRating.update({ where: { id: ratingId }, data });
    }
};

export type RatingSummary = Awaited<ReturnType<typeof ratingsService.getSupplierSummary>>;
