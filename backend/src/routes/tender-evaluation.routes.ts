/**
 * Tender Evaluation Routes — Two-bid system per the procurement flowchart.
 *
 *   GET  /api/tender-eval/:tenderId/criteria              — list scoring criteria
 *   POST /api/tender-eval/:tenderId/criteria              — define a criterion
 *   GET  /api/tender-eval/:tenderId/technical             — technical evaluation grid
 *   POST /api/tender-eval/:tenderId/technical/:bidId      — submit / update tech scores for a bid
 *   POST /api/tender-eval/:tenderId/open-financial        — unlock financial bids (admin/proc head)
 *   GET  /api/tender-eval/:tenderId/financial             — financial bids of qualified vendors
 *   POST /api/tender-eval/:tenderId/financial/:bidId      — finalise financial evaluation
 *   GET  /api/tender-eval/:tenderId/ranking               — auto L1/L2/L3
 *   POST /api/tender-eval/:tenderId/comparative           — generate comparative statement
 *   GET  /api/tender-eval/:tenderId/comparative           — get latest comparative statement
 */
import { Router, type Response } from 'express';
import { z } from 'zod';
import prisma from '../config/prisma.js';
import { authenticate, authorize } from '../middleware/auth.js';
import { requireOrgRole } from '../middleware/requireOrgRole.js';
import { requireApprovedOrg } from '../middleware/requireApprovedOrg.js';
import { ApiError } from '../utils/ApiError.js';
import { apiResponse } from '../utils/apiResponse.js';
import { auditLog } from '../modules/audit/audit.service.js';
import type { AuthRequest } from '../middleware/authenticate.js';

const router = Router();

const asyncRoute = (handler: (req: AuthRequest, res: Response) => Promise<unknown>) =>
    async (req: AuthRequest, res: Response) => {
        try { await handler(req, res); }
        catch (err: any) {
            const status = err?.statusCode || 500;
            const message = status < 500 ? err.message : 'Unable to complete request';
            return apiResponse.error(res, status, message, err?.code || 'REQUEST_FAILED');
        }
    };

const ok = (res: Response, data: unknown, status = 200) =>
    res.status(status).json({ success: true, data });

const userId = (req: AuthRequest) => req.user!.id;

const assertTenderOwnership = async (tenderId: number, organizationId: number) => {
    const tender = await prisma.tender.findUnique({
        where: { id: tenderId },
        select: { id: true, buyerId: true, status: true, organizationId: true, title: true, tenderId: true, budget: true }
    });
    if (!tender) throw new ApiError(404, 'Tender not found', 'TENDER_NOT_FOUND');
    if (tender.organizationId !== organizationId) {
        // Fallback: check via buyerId's organization
        const buyer = await prisma.user.findUnique({
            where: { id: tender.buyerId },
            select: { organizationId: true }
        });
        if (buyer?.organizationId !== organizationId) {
            throw new ApiError(403, 'Tender does not belong to your organisation', 'TENDER_NOT_IN_ORG');
        }
    }
    return tender;
};

// ─── Schemas ─────────────────────────────────────────────────────────────────

const criterionSchema = z.object({
    name: z.string().trim().min(2).max(120),
    description: z.string().trim().max(2000).optional(),
    maxScore: z.coerce.number().positive().max(1000),
    weightage: z.coerce.number().min(0).max(100).optional(),
    isMandatory: z.boolean().optional()
});

const techScoresSchema = z.object({
    scores: z.array(z.object({
        criteriaId: z.coerce.number().int().positive(),
        score: z.coerce.number().min(0),
        remarks: z.string().trim().max(1000).optional()
    })).min(1)
});

const financialEvalSchema = z.object({
    evaluatedAmount: z.coerce.number().nonnegative().optional(),
    remarks: z.string().trim().max(2000).optional()
});

// ─── Criteria ────────────────────────────────────────────────────────────────

router.get(
    '/tender-eval/:tenderId/criteria',
    authenticate,
    authorize('buyer', 'seller'),
    asyncRoute(async (req, res) => {
        const tenderId = Number(req.params.tenderId);
        const list = await prisma.technicalEvaluationCriteria.findMany({
            where: { tenderId },
            orderBy: { id: 'asc' }
        });
        ok(res, list);
    })
);

router.post(
    '/tender-eval/:tenderId/criteria',
    authenticate,
    authorize('buyer'),
    requireApprovedOrg,
    requireOrgRole('ORG_ADMIN', 'PROCUREMENT_OFFICER', 'TECHNICAL_OFFICER'),
    asyncRoute(async (req, res) => {
        const tenderId = Number(req.params.tenderId);
        const body = criterionSchema.parse(req.body);
        await assertTenderOwnership(tenderId, req.user!.organizationId!);

        const created = await prisma.technicalEvaluationCriteria.create({
            data: { tenderId, ...body }
        });

        await auditLog({
            actorUserId: userId(req),
            actorRole: req.user!.role,
            action: 'tender.criteria.created',
            entityType: 'tender',
            entityId: tenderId,
            ipAddress: req.ip,
            metadata: { criteriaId: created.id, name: body.name }
        });

        ok(res, created, 201);
    })
);

// ─── GET /api/tender-eval/:tenderId/technical ────────────────────────────────

router.get(
    '/tender-eval/:tenderId/technical',
    authenticate,
    authorize('buyer'),
    asyncRoute(async (req, res) => {
        const tenderId = Number(req.params.tenderId);
        await assertTenderOwnership(tenderId, req.user!.organizationId!);

        const [criteria, bids, results] = await Promise.all([
            prisma.technicalEvaluationCriteria.findMany({
                where: { tenderId },
                orderBy: { id: 'asc' }
            }),
            prisma.bid.findMany({
                where: { tenderId },
                include: { seller: { select: { id: true, name: true, email: true } } }
            }),
            prisma.technicalEvaluationResult.findMany({
                where: { tenderId },
                include: { evaluator: { select: { id: true, name: true } } }
            })
        ]);

        // Aggregate scores per bid
        const bidScores = bids.map(bid => {
            const bidResults = results.filter(r => r.bidId === bid.id);
            const totalScore = bidResults.reduce((sum, r) => sum + Number(r.score), 0);
            const maxScore = criteria.reduce((sum, c) => sum + Number(c.maxScore), 0);
            const percent = maxScore > 0 ? (totalScore / maxScore) * 100 : 0;
            return {
                bid,
                results: bidResults,
                totalScore,
                maxScore,
                percent: Math.round(percent * 100) / 100,
                qualified: percent >= 60, // 60% threshold for technical qualification
                isFullyEvaluated: bidResults.length === criteria.length
            };
        });

        ok(res, { criteria, bidScores });
    })
);

// ─── POST /api/tender-eval/:tenderId/technical/:bidId ────────────────────────

router.post(
    '/tender-eval/:tenderId/technical/:bidId',
    authenticate,
    authorize('buyer'),
    requireApprovedOrg,
    requireOrgRole('ORG_ADMIN', 'TECHNICAL_OFFICER', 'PROCUREMENT_OFFICER'),
    asyncRoute(async (req, res) => {
        const tenderId = Number(req.params.tenderId);
        const bidId = Number(req.params.bidId);
        const body = techScoresSchema.parse(req.body);

        await assertTenderOwnership(tenderId, req.user!.organizationId!);

        const bid = await prisma.bid.findUnique({ where: { id: bidId } });
        if (!bid || bid.tenderId !== tenderId) {
            throw new ApiError(404, 'Bid not found in this tender', 'BID_NOT_FOUND');
        }

        // Validate scores against criteria max
        const criteria = await prisma.technicalEvaluationCriteria.findMany({
            where: { tenderId, id: { in: body.scores.map(s => s.criteriaId) } }
        });
        for (const score of body.scores) {
            const c = criteria.find(c => c.id === score.criteriaId);
            if (!c) throw new ApiError(400, `Criteria ${score.criteriaId} not in tender`, 'INVALID_CRITERIA');
            if (score.score > Number(c.maxScore)) {
                throw new ApiError(400, `Score ${score.score} exceeds max ${c.maxScore} for "${c.name}"`, 'SCORE_OUT_OF_RANGE');
            }
        }

        // Upsert each result
        await prisma.$transaction(
            body.scores.map(s =>
                prisma.technicalEvaluationResult.upsert({
                    where: { bidId_criteriaId: { bidId, criteriaId: s.criteriaId } },
                    create: {
                        tenderId, bidId, criteriaId: s.criteriaId,
                        evaluatorId: userId(req),
                        score: s.score, remarks: s.remarks,
                        status: 'COMPLETED' as any, evaluatedAt: new Date()
                    },
                    update: {
                        evaluatorId: userId(req),
                        score: s.score, remarks: s.remarks,
                        status: 'COMPLETED' as any, evaluatedAt: new Date()
                    }
                })
            )
        );

        await auditLog({
            actorUserId: userId(req),
            actorRole: req.user!.role,
            action: 'tender.technical.evaluated',
            entityType: 'bid',
            entityId: bidId,
            ipAddress: req.ip,
            metadata: { tenderId, scoreCount: body.scores.length }
        });

        ok(res, { success: true });
    })
);

// ─── POST /api/tender-eval/:tenderId/open-financial ──────────────────────────

router.post(
    '/tender-eval/:tenderId/open-financial',
    authenticate,
    authorize('buyer'),
    requireApprovedOrg,
    requireOrgRole('ORG_ADMIN', 'PROCUREMENT_OFFICER'),
    asyncRoute(async (req, res) => {
        const tenderId = Number(req.params.tenderId);
        const tender = await assertTenderOwnership(tenderId, req.user!.organizationId!);

        if (tender.status !== 'tech_evaluation' && tender.status !== 'tech_bid_opening' && tender.status !== 'bid_submission' && tender.status !== 'closed') {
            // We're permissive here — buyer may want to open financial after partial tech eval
        }

        const updated = await prisma.tender.update({
            where: { id: tenderId },
            data: { status: 'financial_opening' as any }
        });

        await auditLog({
            actorUserId: userId(req),
            actorRole: req.user!.role,
            action: 'tender.financial.opened',
            entityType: 'tender',
            entityId: tenderId,
            ipAddress: req.ip
        });

        ok(res, updated);
    })
);

// ─── GET /api/tender-eval/:tenderId/financial ────────────────────────────────

router.get(
    '/tender-eval/:tenderId/financial',
    authenticate,
    authorize('buyer'),
    asyncRoute(async (req, res) => {
        const tenderId = Number(req.params.tenderId);
        await assertTenderOwnership(tenderId, req.user!.organizationId!);

        const [bids, financialEvals, criteria, results] = await Promise.all([
            prisma.bid.findMany({
                where: { tenderId },
                include: { seller: { select: { id: true, name: true, email: true } } }
            }),
            prisma.financialEvaluation.findMany({
                where: { tenderId },
                include: { evaluator: { select: { id: true, name: true } } }
            }),
            prisma.technicalEvaluationCriteria.findMany({ where: { tenderId } }),
            prisma.technicalEvaluationResult.findMany({ where: { tenderId } })
        ]);

        const maxScore = criteria.reduce((s, c) => s + Number(c.maxScore), 0);

        // Only show qualified bids (>= 60% tech score)
        const qualified = bids.filter(bid => {
            const bidResults = results.filter(r => r.bidId === bid.id);
            if (bidResults.length === 0) return false;
            const total = bidResults.reduce((s, r) => s + Number(r.score), 0);
            return maxScore > 0 && (total / maxScore) >= 0.6;
        });

        const enriched = qualified.map(bid => {
            const fin = financialEvals.find(f => f.bidId === bid.id);
            const bidResults = results.filter(r => r.bidId === bid.id);
            const techScore = bidResults.reduce((s, r) => s + Number(r.score), 0);
            const total = Number(bid.unitPrice) * bid.quantity;
            return {
                bid,
                quotedAmount: total,
                evaluatedAmount: fin ? Number(fin.evaluatedAmount || total) : total,
                technicalScore: techScore,
                technicalPercent: maxScore > 0 ? Math.round((techScore / maxScore) * 100 * 100) / 100 : 0,
                financialEvaluation: fin
            };
        });

        ok(res, enriched);
    })
);

// ─── POST /api/tender-eval/:tenderId/financial/:bidId ────────────────────────

router.post(
    '/tender-eval/:tenderId/financial/:bidId',
    authenticate,
    authorize('buyer'),
    requireApprovedOrg,
    requireOrgRole('ORG_ADMIN', 'FINANCE_OFFICER', 'PROCUREMENT_OFFICER'),
    asyncRoute(async (req, res) => {
        const tenderId = Number(req.params.tenderId);
        const bidId = Number(req.params.bidId);
        const body = financialEvalSchema.parse(req.body);

        await assertTenderOwnership(tenderId, req.user!.organizationId!);

        const bid = await prisma.bid.findUnique({ where: { id: bidId } });
        if (!bid || bid.tenderId !== tenderId) {
            throw new ApiError(404, 'Bid not found in this tender', 'BID_NOT_FOUND');
        }

        const quotedAmount = Number(bid.unitPrice) * bid.quantity;
        const evaluatedAmount = body.evaluatedAmount ?? quotedAmount;

        const fin = await prisma.financialEvaluation.upsert({
            where: { tenderId_bidId: { tenderId, bidId } },
            create: {
                tenderId, bidId, evaluatorId: userId(req),
                quotedAmount, evaluatedAmount, status: 'COMPLETED' as any,
                remarks: body.remarks, evaluatedAt: new Date()
            },
            update: {
                evaluatorId: userId(req),
                evaluatedAmount, status: 'COMPLETED' as any,
                remarks: body.remarks, evaluatedAt: new Date()
            }
        });

        await auditLog({
            actorUserId: userId(req),
            actorRole: req.user!.role,
            action: 'tender.financial.evaluated',
            entityType: 'bid',
            entityId: bidId,
            ipAddress: req.ip,
            metadata: { tenderId, evaluatedAmount }
        });

        ok(res, fin);
    })
);

// ─── GET /api/tender-eval/:tenderId/ranking ──────────────────────────────────

router.get(
    '/tender-eval/:tenderId/ranking',
    authenticate,
    authorize('buyer'),
    asyncRoute(async (req, res) => {
        const tenderId = Number(req.params.tenderId);
        await assertTenderOwnership(tenderId, req.user!.organizationId!);

        const [bids, criteria, results, financialEvals] = await Promise.all([
            prisma.bid.findMany({
                where: { tenderId },
                include: { seller: { select: { id: true, name: true, email: true } } }
            }),
            prisma.technicalEvaluationCriteria.findMany({ where: { tenderId } }),
            prisma.technicalEvaluationResult.findMany({ where: { tenderId } }),
            prisma.financialEvaluation.findMany({ where: { tenderId } })
        ]);

        const maxScore = criteria.reduce((s, c) => s + Number(c.maxScore), 0);

        const enriched = bids
            .map(bid => {
                const bidResults = results.filter(r => r.bidId === bid.id);
                const techScore = bidResults.reduce((s, r) => s + Number(r.score), 0);
                const techPercent = maxScore > 0 ? (techScore / maxScore) * 100 : 0;
                const fin = financialEvals.find(f => f.bidId === bid.id);
                const finalAmount = fin ? Number(fin.evaluatedAmount || fin.quotedAmount) : Number(bid.unitPrice) * bid.quantity;
                return {
                    bid,
                    technicalScore: techScore,
                    technicalPercent: Math.round(techPercent * 100) / 100,
                    qualified: techPercent >= 60,
                    quotedAmount: Number(bid.unitPrice) * bid.quantity,
                    evaluatedAmount: finalAmount
                };
            })
            .filter(b => b.qualified)
            .sort((a, b) => a.evaluatedAmount - b.evaluatedAmount);

        // Assign L1, L2, L3 ranks
        const ranked = enriched.map((entry, idx) => ({
            ...entry,
            rank: idx + 1,
            label: idx === 0 ? 'L1' : idx === 1 ? 'L2' : idx === 2 ? 'L3' : `L${idx + 1}`
        }));

        // Persist ranks for downstream use
        await prisma.$transaction(
            ranked.map(r =>
                prisma.financialEvaluation.updateMany({
                    where: { tenderId, bidId: r.bid.id },
                    data: { rank: r.rank }
                })
            )
        );

        ok(res, ranked);
    })
);

// ─── POST /api/tender-eval/:tenderId/comparative ─────────────────────────────

router.post(
    '/tender-eval/:tenderId/comparative',
    authenticate,
    authorize('buyer'),
    requireApprovedOrg,
    requireOrgRole('ORG_ADMIN', 'PROCUREMENT_OFFICER'),
    asyncRoute(async (req, res) => {
        const tenderId = Number(req.params.tenderId);
        const tender = await assertTenderOwnership(tenderId, req.user!.organizationId!);

        const [bids, criteria, results, financialEvals] = await Promise.all([
            prisma.bid.findMany({
                where: { tenderId },
                include: { seller: { select: { id: true, name: true, email: true } } }
            }),
            prisma.technicalEvaluationCriteria.findMany({ where: { tenderId } }),
            prisma.technicalEvaluationResult.findMany({ where: { tenderId } }),
            prisma.financialEvaluation.findMany({ where: { tenderId } })
        ]);

        const maxScore = criteria.reduce((s, c) => s + Number(c.maxScore), 0);

        const summary = {
            tender: { id: tender.id, tenderId: tender.tenderId, title: tender.title, budget: tender.budget },
            criteria: criteria.map(c => ({ id: c.id, name: c.name, maxScore: Number(c.maxScore), weightage: Number(c.weightage || 0) })),
            bids: bids.map(bid => {
                const bidResults = results.filter(r => r.bidId === bid.id);
                const techScore = bidResults.reduce((s, r) => s + Number(r.score), 0);
                const techPercent = maxScore > 0 ? (techScore / maxScore) * 100 : 0;
                const fin = financialEvals.find(f => f.bidId === bid.id);
                const quoted = Number(bid.unitPrice) * bid.quantity;
                return {
                    bidId: bid.id,
                    seller: bid.seller,
                    technicalScore: techScore,
                    technicalPercent: Math.round(techPercent * 100) / 100,
                    qualified: techPercent >= 60,
                    quotedAmount: quoted,
                    evaluatedAmount: fin ? Number(fin.evaluatedAmount || quoted) : quoted,
                    rank: fin?.rank,
                    individualScores: bidResults.map(r => ({ criteriaId: r.criteriaId, score: Number(r.score), remarks: r.remarks }))
                };
            }),
            generatedAt: new Date().toISOString()
        };

        // Find recommended bid (L1 qualified)
        const sortedQualified = summary.bids
            .filter(b => b.qualified)
            .sort((a, b) => a.evaluatedAmount - b.evaluatedAmount);
        const recommendedBidId = sortedQualified[0]?.bidId;

        // Get next version
        const last = await prisma.comparativeStatement.findFirst({
            where: { tenderId },
            orderBy: { version: 'desc' }
        });
        const version = (last?.version || 0) + 1;

        const cs = await prisma.comparativeStatement.create({
            data: {
                tenderId,
                bidId: recommendedBidId,
                version,
                summary,
                recommended: !!recommendedBidId
            }
        });

        await auditLog({
            actorUserId: userId(req),
            actorRole: req.user!.role,
            action: 'tender.comparative.generated',
            entityType: 'tender',
            entityId: tenderId,
            ipAddress: req.ip,
            metadata: { version, recommendedBidId }
        });

        ok(res, cs, 201);
    })
);

// ─── GET /api/tender-eval/:tenderId/comparative ──────────────────────────────

router.get(
    '/tender-eval/:tenderId/comparative',
    authenticate,
    authorize('buyer'),
    asyncRoute(async (req, res) => {
        const tenderId = Number(req.params.tenderId);
        await assertTenderOwnership(tenderId, req.user!.organizationId!);

        const cs = await prisma.comparativeStatement.findFirst({
            where: { tenderId },
            orderBy: { version: 'desc' }
        });
        ok(res, cs);
    })
);

export default router;
