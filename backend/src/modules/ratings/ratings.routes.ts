/**
 * Rating module HTTP routes.
 *
 * Mounted at /api/ratings. Provides aggregate-friendly read endpoints, a "did
 * I rate this PO?" lookup, and PUT for editing your own rating. The legacy
 * POST /api/ratings/supplier and POST /api/ratings/buyer endpoints continue to
 * live in phase4.routes.ts; this module wraps them with duplicate guards via
 * a small middleware.
 */

import { Router, type Response } from 'express';
import { z } from 'zod';
import { authenticate, type AuthRequest } from '../../middleware/auth.js';
import { handleSecureRouteError } from '../../utils/routeHelpers.js';
import { maskSensitive } from '../../utils/maskSensitive.js';
import { ratingsService } from './ratings.service.js';

const router = Router();

const ok = (res: Response, data: unknown, status = 200) =>
    res.status(status).json(maskSensitive({ success: true, data }));

const wrap =
    (handler: (req: AuthRequest, res: Response) => Promise<unknown>, fallback = 'Unable to complete request') =>
        async (req: AuthRequest, res: Response) => {
            try {
                await handler(req, res);
            } catch (error) {
                return handleSecureRouteError(res, error, fallback);
            }
        };

const positiveInt = z.coerce.number().int().positive();
const paginationQuery = z.object({
    skip: z.coerce.number().int().min(0).optional(),
    take: z.coerce.number().int().min(1).max(50).optional(),
    page: z.coerce.number().int().min(1).optional(),
    pageSize: z.coerce.number().int().min(1).max(50).optional()
}).partial();

const computeWindow = (query: z.infer<typeof paginationQuery>) => {
    const take = query.pageSize ?? query.take ?? 20;
    const skip = query.page ? (query.page - 1) * take : (query.skip ?? 0);
    return { skip, take };
};

const updateBody = z.object({
    rating: z.coerce.number().int().min(1).max(5).optional(),
    review: z.string().max(2000).optional(),
    qualityScore: z.coerce.number().int().min(1).max(5).optional(),
    deliveryScore: z.coerce.number().int().min(1).max(5).optional(),
    communicationScore: z.coerce.number().int().min(1).max(5).optional(),
    paymentTimelinessScore: z.coerce.number().int().min(1).max(5).optional()
}).strict();

/* --------- Read APIs --------- */

router.get('/supplier/:sellerId', authenticate, wrap(async (req, res) => {
    const sellerId = positiveInt.parse(req.params.sellerId);
    const query = paginationQuery.parse(req.query);
    const result = await ratingsService.getSupplierRatings(sellerId, computeWindow(query));
    ok(res, result);
}));

router.get('/buyer/:buyerId', authenticate, wrap(async (req, res) => {
    const buyerId = positiveInt.parse(req.params.buyerId);
    const query = paginationQuery.parse(req.query);
    const result = await ratingsService.getBuyerRatings(buyerId, computeWindow(query));
    ok(res, result);
}));

router.get('/supplier/:sellerId/summary', authenticate, wrap(async (req, res) => {
    const sellerId = positiveInt.parse(req.params.sellerId);
    const summary = await ratingsService.getSupplierSummary(sellerId);
    ok(res, summary);
}));

router.get('/buyer/:buyerId/summary', authenticate, wrap(async (req, res) => {
    const buyerId = positiveInt.parse(req.params.buyerId);
    const summary = await ratingsService.getBuyerSummary(buyerId);
    ok(res, summary);
}));

router.post('/supplier/bulk-summary', authenticate, wrap(async (req, res) => {
    const body = z.object({
        sellerIds: z.array(positiveInt).min(1).max(100)
    }).parse(req.body || {});
    const summaries = await ratingsService.getSupplierSummariesForSellers(body.sellerIds);
    ok(res, summaries);
}));

router.get('/me/for-po/:purchaseOrderId', authenticate, wrap(async (req, res) => {
    const purchaseOrderId = positiveInt.parse(req.params.purchaseOrderId);
    const result = await ratingsService.getMyRatingForPO(
        Number(req.user?.id),
        String(req.user?.role),
        purchaseOrderId
    );
    ok(res, result);
}));

/* --------- Edit own rating --------- */

router.put('/supplier/:id', authenticate, wrap(async (req, res) => {
    const id = positiveInt.parse(req.params.id);
    const data = updateBody.parse(req.body || {});
    const updated = await ratingsService.updateSupplierRating(Number(req.user?.id), id, data);
    ok(res, updated);
}));

router.put('/buyer/:id', authenticate, wrap(async (req, res) => {
    const id = positiveInt.parse(req.params.id);
    const data = updateBody.parse(req.body || {});
    const updated = await ratingsService.updateBuyerRating(Number(req.user?.id), id, data);
    ok(res, updated);
}));

export default router;
