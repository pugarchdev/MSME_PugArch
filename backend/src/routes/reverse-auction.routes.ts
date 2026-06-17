import { Router, type Response } from 'express';
import { z } from 'zod';
import prisma from '../config/prisma.js';
import { authenticate, type AuthRequest } from '../middleware/authenticate.js';
import { authorize } from '../middleware/authorize.js';
import { redisKeys } from '../constants/redis-keys.js';
import { withDistributedLock } from '../utils/redisLock.js';
import { ApiError } from '../utils/ApiError.js';
import { apiResponse } from '../utils/apiResponse.js';
import { maskSensitive } from '../utils/maskSensitive.js';
import { auditLog } from '../modules/audit/audit.service.js';

const router = Router();
const db = prisma as any;

const toNumber = (value: unknown, fallback = 0) => {
  const n = Number(value);
  return Number.isFinite(n) ? n : fallback;
};

const nextAuctionCode = () => `RA-${new Date().getFullYear()}-${Math.random().toString(36).slice(2, 8).toUpperCase()}`;

const actor = (req: AuthRequest) => ({
  actorUserId: req.user?.id,
  actorRole: req.user?.role,
  ipAddress: req.ip,
  userAgent: req.headers['user-agent']
});

const writeAuctionEvent = async (req: AuthRequest, auctionId: number, eventType: string, message: string, values?: Record<string, unknown>) => {
  await Promise.all([
    db.auctionEventLog.create({
      data: {
        auctionId,
        actorUserId: req.user?.id || null,
        actorOrgId: req.user?.organizationId || null,
        eventType,
        message,
        newValue: values || undefined
      }
    }).catch(() => undefined),
    auditLog({
      ...actor(req),
      action: `reverse_auction.${eventType}`,
      entityType: 'auction',
      entityId: auctionId,
      metadata: maskSensitive(values || {})
    })
  ]);
};

const auctionFieldsSchema = z.object({
  title: z.string().trim().min(3).max(180),
  description: z.string().trim().max(3000).optional(),
  linkedTenderId: z.coerce.number().int().positive().optional(),
  linkedBidId: z.coerce.number().int().positive().optional(),
  linkedRequirementId: z.coerce.number().int().positive().optional(),
  startAt: z.coerce.date(),
  endAt: z.coerce.date(),
  startingPrice: z.coerce.number().positive(),
  reservePrice: z.coerce.number().positive().optional(),
  minDecrementAmount: z.coerce.number().positive().default(1),
  minDecrementPercent: z.coerce.number().min(0).max(100).optional(),
  autoExtensionEnabled: z.coerce.boolean().default(false),
  autoExtensionWindowMinutes: z.coerce.number().int().min(1).max(120).default(5),
  autoExtensionByMinutes: z.coerce.number().int().min(1).max(120).default(5),
  maxAutoExtensions: z.coerce.number().int().min(0).max(100).default(0),
  visibilityMode: z.enum(['INVITED_SELLERS_ONLY', 'TECHNICALLY_QUALIFIED_ONLY']).default('INVITED_SELLERS_ONLY'),
  allowCompetitorNames: z.coerce.boolean().default(false),
  remarks: z.string().trim().max(1000).optional()
});

const createAuctionSchema = auctionFieldsSchema.refine(value => Boolean(value.linkedTenderId || value.linkedBidId || value.linkedRequirementId), {
  message: 'Link the auction to a tender, procurement bid, or buyer requirement',
  path: ['linkedTenderId']
}).refine(value => value.endAt > value.startAt, {
  message: 'Auction end time must be after start time',
  path: ['endAt']
});

const updateAuctionSchema = auctionFieldsSchema.omit({ linkedTenderId: true, linkedBidId: true, linkedRequirementId: true }).partial();
const inviteSchema = z.object({
  sellers: z.array(z.object({
    sellerOrgId: z.coerce.number().int().positive(),
    sellerUserId: z.coerce.number().int().positive().optional()
  })).min(1).max(100)
});
const bidSchema = z.object({ amount: z.coerce.number().positive(), deviceHash: z.string().trim().max(128).optional() });
const cancelSchema = z.object({ reason: z.string().trim().min(5).max(500) });
const awardSchema = z.object({ participantId: z.coerce.number().int().positive().optional(), remarks: z.string().trim().max(1000).optional() });

const isAdmin = (req: AuthRequest) => req.user?.role === 'admin' || req.user?.role === 'master_admin';

const canManageAuction = (req: AuthRequest, auction: any) =>
  isAdmin(req) ||
  auction.createdByUserId === req.user?.id ||
  (auction.buyerOrgId && auction.buyerOrgId === req.user?.organizationId);

const assertAuctionManager = (req: AuthRequest, auction: any) => {
  if (!canManageAuction(req, auction)) throw new ApiError(404, 'Auction not found', 'AUCTION_NOT_FOUND');
};

const auctionIncludeFor = (req: AuthRequest) => ({
  bids: req.user?.role === 'seller'
    ? { where: { OR: [{ sellerId: req.user.id }, { sellerOrgId: req.user.organizationId || -1 }] }, orderBy: { submittedAt: 'desc' } }
    : { orderBy: { submittedAt: 'desc' }, take: 200 }
});

const recalculateRanks = async (tx: any, auctionId: number) => {
  const bids = await tx.auctionBid.findMany({
    where: { auctionId, isValid: true },
    orderBy: [{ amount: 'asc' }, { bidAmount: 'asc' }, { submittedAt: 'asc' }]
  });
  const bestByOrg = new Map<number, any>();
  for (const bid of bids) {
    const orgId = Number(bid.sellerOrgId || 0);
    if (orgId && !bestByOrg.has(orgId)) bestByOrg.set(orgId, bid);
  }
  let rank = 1;
  for (const bid of bestByOrg.values()) {
    await tx.auctionParticipant.updateMany({
      where: { auctionId, sellerOrgId: bid.sellerOrgId },
      data: { currentRank: rank, lastBidAmount: bid.amount || bid.bidAmount }
    });
    await tx.auctionBid.update({ where: { id: bid.id }, data: { rankAtSubmission: rank } }).catch(() => undefined);
    rank += 1;
  }
};

router.use('/reverse-auctions', authenticate);

router.post('/reverse-auctions', authorize('buyer', 'admin', 'master_admin'), async (req: AuthRequest, res: Response) => {
  try {
    const payload = createAuctionSchema.parse(req.body);
    const auction = await db.auction.create({
      data: {
        tenderId: payload.linkedTenderId || null,
        linkedBidId: payload.linkedBidId || null,
        linkedRequirementId: payload.linkedRequirementId || null,
        auctionCode: nextAuctionCode(),
        referenceNo: payload.linkedTenderId ? `TENDER-${payload.linkedTenderId}` : payload.linkedBidId ? `PBID-${payload.linkedBidId}` : `REQ-${payload.linkedRequirementId}`,
        title: payload.title,
        description: payload.description || null,
        buyerOrgId: req.user?.organizationId || null,
        createdByUserId: req.user?.id,
        startPrice: payload.startingPrice,
        basePrice: payload.startingPrice,
        reservePrice: payload.reservePrice || null,
        currentBid: payload.startingPrice,
        currentLowestBid: null,
        currentLowestAmount: null,
        minDecrement: payload.minDecrementAmount,
        minDecrementAmount: payload.minDecrementAmount,
        minDecrementPercent: payload.minDecrementPercent || null,
        autoExtensionEnabled: payload.autoExtensionEnabled,
        autoExtensionWindowMinutes: payload.autoExtensionWindowMinutes,
        autoExtensionByMinutes: payload.autoExtensionByMinutes,
        maxAutoExtensions: payload.maxAutoExtensions,
        visibilityMode: payload.visibilityMode,
        allowCompetitorNames: payload.allowCompetitorNames,
        remarks: payload.remarks || null,
        startTime: payload.startAt,
        endTime: payload.endAt,
        status: 'DRAFT',
        statusEnum: 'DRAFT'
      }
    });
    await writeAuctionEvent(req, auction.id, 'created', 'Reverse auction created', { auctionCode: auction.auctionCode });
    return apiResponse.created(res, maskSensitive(auction), 'Reverse auction created');
  } catch (error: any) {
    return apiResponse.error(res, error.statusCode || 400, error.message || 'Unable to create reverse auction', error.code || 'REVERSE_AUCTION_CREATE_ERROR');
  }
});

router.get('/reverse-auctions', authorize('buyer', 'seller', 'admin', 'master_admin'), async (req: AuthRequest, res: Response) => {
  try {
    const page = Math.max(1, Number(req.query.page || 1));
    const pageSize = Math.min(50, Math.max(1, Number(req.query.pageSize || 20)));
    const status = req.query.status ? String(req.query.status) : undefined;
    const where: any = status ? { status } : {};
    if (req.user?.role === 'seller') {
      where.participants = undefined;
      const participantRows = await db.auctionParticipant.findMany({
        where: { sellerOrgId: req.user.organizationId || -1 },
        select: { auctionId: true }
      });
      where.id = { in: participantRows.map((row: any) => row.auctionId) };
    } else if (!isAdmin(req)) {
      where.OR = [{ createdByUserId: req.user?.id }, { buyerOrgId: req.user?.organizationId || -1 }];
    }
    const [auctions, total] = await Promise.all([
      db.auction.findMany({ where, orderBy: { createdAt: 'desc' }, skip: (page - 1) * pageSize, take: pageSize }),
      db.auction.count({ where })
    ]);
    return apiResponse.success(res, { auctions: maskSensitive(auctions), total, page, pageSize, totalPages: Math.ceil(total / pageSize) });
  } catch (error: any) {
    return apiResponse.error(res, 500, 'Unable to load reverse auctions', 'REVERSE_AUCTION_LIST_ERROR');
  }
});

router.get('/reverse-auctions/:id', authorize('buyer', 'seller', 'admin', 'master_admin'), async (req: AuthRequest, res: Response) => {
  try {
    const id = Number(req.params.id);
    const auction = await db.auction.findUnique({ where: { id }, include: auctionIncludeFor(req) });
    if (!auction) throw new ApiError(404, 'Auction not found', 'AUCTION_NOT_FOUND');
    if (req.user?.role === 'seller') {
      const participant = await db.auctionParticipant.findFirst({ where: { auctionId: id, sellerOrgId: req.user.organizationId || -1 } });
      if (!participant) throw new ApiError(404, 'Auction not found', 'AUCTION_NOT_FOUND');
      if (!auction.allowCompetitorNames) {
        auction.bids = (auction.bids || []).filter((bid: any) => bid.sellerId === req.user?.id || bid.sellerOrgId === req.user?.organizationId);
      }
    } else {
      assertAuctionManager(req, auction);
    }
    return apiResponse.success(res, maskSensitive(auction));
  } catch (error: any) {
    return apiResponse.error(res, error.statusCode || 500, error.message || 'Unable to load auction', error.code || 'REVERSE_AUCTION_DETAIL_ERROR');
  }
});

router.patch('/reverse-auctions/:id', authorize('buyer', 'admin', 'master_admin'), async (req: AuthRequest, res: Response) => {
  try {
    const id = Number(req.params.id);
    const current = await db.auction.findUnique({ where: { id } });
    if (!current) throw new ApiError(404, 'Auction not found', 'AUCTION_NOT_FOUND');
    assertAuctionManager(req, current);
    if (!['DRAFT', 'SCHEDULED', 'PAUSED'].includes(String(current.status))) {
      throw new ApiError(409, 'Only draft, scheduled, or paused auctions can be edited', 'AUCTION_NOT_EDITABLE');
    }
    const payload = updateAuctionSchema.parse(req.body);
    const updated = await db.auction.update({
      where: { id },
      data: {
        title: payload.title,
        description: payload.description,
        startTime: payload.startAt,
        endTime: payload.endAt,
        startPrice: payload.startingPrice,
        basePrice: payload.startingPrice,
        reservePrice: payload.reservePrice,
        minDecrement: payload.minDecrementAmount,
        minDecrementAmount: payload.minDecrementAmount,
        minDecrementPercent: payload.minDecrementPercent,
        autoExtensionEnabled: payload.autoExtensionEnabled,
        autoExtensionWindowMinutes: payload.autoExtensionWindowMinutes,
        autoExtensionByMinutes: payload.autoExtensionByMinutes,
        maxAutoExtensions: payload.maxAutoExtensions,
        visibilityMode: payload.visibilityMode,
        allowCompetitorNames: payload.allowCompetitorNames,
        remarks: payload.remarks
      }
    });
    await writeAuctionEvent(req, id, 'updated', 'Reverse auction updated', payload);
    return apiResponse.success(res, maskSensitive(updated), 200, 'Reverse auction updated');
  } catch (error: any) {
    return apiResponse.error(res, error.statusCode || 400, error.message || 'Unable to update auction', error.code || 'REVERSE_AUCTION_UPDATE_ERROR');
  }
});

const transition = (target: string, enumStatus: string, extra?: (req: AuthRequest) => Record<string, unknown>) =>
  async (req: AuthRequest, res: Response) => {
    try {
      const id = Number(req.params.id);
      const auction = await db.auction.findUnique({ where: { id } });
      if (!auction) throw new ApiError(404, 'Auction not found', 'AUCTION_NOT_FOUND');
      assertAuctionManager(req, auction);
      const data = { status: target, statusEnum: enumStatus, ...(extra ? extra(req) : {}) };
      const updated = await db.auction.update({ where: { id }, data });
      await writeAuctionEvent(req, id, target.toLowerCase(), `Auction moved to ${target}`, data);
      return apiResponse.success(res, maskSensitive(updated));
    } catch (error: any) {
      return apiResponse.error(res, error.statusCode || 400, error.message || 'Unable to update auction status', error.code || 'REVERSE_AUCTION_STATUS_ERROR');
    }
  };

router.post('/reverse-auctions/:id/schedule', authorize('buyer', 'admin', 'master_admin'), transition('SCHEDULED', 'SCHEDULED'));
router.post('/reverse-auctions/:id/start', authorize('buyer', 'admin', 'master_admin'), transition('LIVE', 'LIVE', () => ({ actualStartedAt: new Date() })));
router.post('/reverse-auctions/:id/pause', authorize('buyer', 'admin', 'master_admin'), transition('PAUSED', 'PAUSED'));
router.post('/reverse-auctions/:id/resume', authorize('buyer', 'admin', 'master_admin'), transition('LIVE', 'LIVE'));
router.post('/reverse-auctions/:id/close', authorize('buyer', 'admin', 'master_admin'), transition('CLOSED', 'CLOSED', () => ({ actualClosedAt: new Date() })));
router.post('/reverse-auctions/:id/cancel', authorize('buyer', 'admin', 'master_admin'), async (req: AuthRequest, res: Response) => {
  req.body = { ...req.body, reason: cancelSchema.parse(req.body).reason };
  return transition('CANCELLED', 'CANCELLED', request => ({ cancellationReason: request.body.reason, actualClosedAt: new Date() }))(req, res);
});

router.post('/reverse-auctions/:id/invite-sellers', authorize('buyer', 'admin', 'master_admin'), async (req: AuthRequest, res: Response) => {
  try {
    const id = Number(req.params.id);
    const auction = await db.auction.findUnique({ where: { id } });
    if (!auction) throw new ApiError(404, 'Auction not found', 'AUCTION_NOT_FOUND');
    assertAuctionManager(req, auction);
    const payload = inviteSchema.parse(req.body);
    const rows = [];
    for (const seller of payload.sellers) {
      rows.push(await db.auctionParticipant.upsert({
        where: { auctionId_sellerOrgId: { auctionId: id, sellerOrgId: seller.sellerOrgId } },
        update: { sellerUserId: seller.sellerUserId || undefined, status: 'INVITED' },
        create: { auctionId: id, sellerOrgId: seller.sellerOrgId, sellerUserId: seller.sellerUserId || null, status: 'INVITED' }
      }));
    }
    await writeAuctionEvent(req, id, 'sellers_invited', 'Sellers invited to reverse auction', { count: rows.length });
    return apiResponse.success(res, { participants: maskSensitive(rows) }, 200, 'Sellers invited');
  } catch (error: any) {
    return apiResponse.error(res, error.statusCode || 400, error.message || 'Unable to invite sellers', error.code || 'REVERSE_AUCTION_INVITE_ERROR');
  }
});

router.get('/reverse-auctions/:id/participants', authorize('buyer', 'seller', 'admin', 'master_admin'), async (req: AuthRequest, res: Response) => {
  try {
    const id = Number(req.params.id);
    const auction = await db.auction.findUnique({ where: { id } });
    if (!auction) throw new ApiError(404, 'Auction not found', 'AUCTION_NOT_FOUND');
    const where: any = { auctionId: id };
    if (req.user?.role === 'seller') where.sellerOrgId = req.user.organizationId || -1;
    else assertAuctionManager(req, auction);
    const participants = await db.auctionParticipant.findMany({ where, orderBy: [{ currentRank: 'asc' }, { invitedAt: 'asc' }] });
    return apiResponse.success(res, { participants: maskSensitive(participants) });
  } catch (error: any) {
    return apiResponse.error(res, error.statusCode || 500, error.message || 'Unable to load participants', error.code || 'REVERSE_AUCTION_PARTICIPANTS_ERROR');
  }
});

router.post('/reverse-auctions/:id/bids', authorize('seller'), async (req: AuthRequest, res: Response) => {
  try {
    const auctionId = Number(req.params.id);
    const payload = bidSchema.parse(req.body);
    const result = await withDistributedLock(redisKeys.lockAuction(auctionId), async () =>
      db.$transaction(async (tx: any) => {
        const auction = await tx.auction.findUnique({ where: { id: auctionId } });
        if (!auction) throw new ApiError(404, 'Auction not found', 'AUCTION_NOT_FOUND');
        const participant = await tx.auctionParticipant.findFirst({
          where: {
            auctionId,
            sellerOrgId: req.user?.organizationId || -1,
            status: { in: ['INVITED', 'ACCEPTED', 'TECHNICALLY_QUALIFIED'] }
          }
        });
        if (!participant) throw new ApiError(403, 'Only invited or qualified sellers can bid', 'AUCTION_SELLER_NOT_INVITED');
        const now = new Date();
        if (!['LIVE', 'active'].includes(String(auction.status))) throw new ApiError(409, 'Auction is not live', 'AUCTION_NOT_LIVE');
        if (auction.startTime > now || auction.endTime <= now) throw new ApiError(409, 'Auction is outside the bidding window', 'AUCTION_WINDOW_CLOSED');

        const current = toNumber(auction.currentLowestAmount ?? auction.currentLowestBid ?? auction.currentBid ?? auction.startPrice);
        const amountDecrement = toNumber(auction.minDecrementAmount ?? auction.minDecrement, 1);
        const percentDecrement = auction.minDecrementPercent ? current * (toNumber(auction.minDecrementPercent) / 100) : 0;
        const requiredDecrement = Math.max(amountDecrement, percentDecrement);
        const maxAllowed = current - requiredDecrement;
        if (payload.amount > maxAllowed) {
          throw new ApiError(400, `Bid must be at least ${requiredDecrement.toFixed(2)} below current lowest amount`, 'AUCTION_MIN_DECREMENT');
        }

        const msToEnd = new Date(auction.endTime).getTime() - now.getTime();
        const shouldExtend = auction.autoExtensionEnabled &&
          auction.extensionCount < auction.maxAutoExtensions &&
          msToEnd <= auction.autoExtensionWindowMinutes * 60_000;
        const endTime = shouldExtend
          ? new Date(new Date(auction.endTime).getTime() + auction.autoExtensionByMinutes * 60_000)
          : auction.endTime;

        const bid = await tx.auctionBid.create({
          data: {
            auctionId,
            participantId: participant.id,
            sellerOrgId: req.user?.organizationId || null,
            sellerId: req.user?.id,
            bidAmount: payload.amount,
            amount: payload.amount,
            ipAddress: req.ip,
            userAgent: String(req.headers['user-agent'] || '').slice(0, 500),
            deviceHash: payload.deviceHash || null
          }
        });
        const updatedAuction = await tx.auction.update({
          where: { id: auctionId },
          data: {
            currentBid: payload.amount,
            currentLowestBid: payload.amount,
            currentLowestAmount: payload.amount,
            currentWinnerId: req.user?.id,
            endTime,
            extensionCount: shouldExtend ? { increment: 1 } : undefined
          }
        });
        await recalculateRanks(tx, auctionId);
        return { auction: updatedAuction, auctionBid: bid };
      }), { ttlMs: 10_000 }
    );
    await writeAuctionEvent(req, auctionId, 'bid_submitted', 'Seller submitted reverse auction bid', { amount: payload.amount });
    return apiResponse.created(res, maskSensitive(result), 'Bid submitted');
  } catch (error: any) {
    return apiResponse.error(res, error.statusCode || 400, error.message || 'Unable to submit bid', error.code || 'REVERSE_AUCTION_BID_ERROR');
  }
});

router.get('/reverse-auctions/:id/bids', authorize('buyer', 'seller', 'admin', 'master_admin'), async (req: AuthRequest, res: Response) => {
  try {
    const id = Number(req.params.id);
    const auction = await db.auction.findUnique({ where: { id } });
    if (!auction) throw new ApiError(404, 'Auction not found', 'AUCTION_NOT_FOUND');
    const where: any = { auctionId: id };
    if (req.user?.role === 'seller') where.OR = [{ sellerId: req.user.id }, { sellerOrgId: req.user.organizationId || -1 }];
    else assertAuctionManager(req, auction);
    const bids = await db.auctionBid.findMany({ where, orderBy: [{ amount: 'asc' }, { submittedAt: 'asc' }] });
    return apiResponse.success(res, { bids: maskSensitive(bids) });
  } catch (error: any) {
    return apiResponse.error(res, error.statusCode || 500, error.message || 'Unable to load bids', error.code || 'REVERSE_AUCTION_BIDS_ERROR');
  }
});

router.get('/reverse-auctions/:id/live-summary', authorize('buyer', 'seller', 'admin', 'master_admin'), async (req: AuthRequest, res: Response) => {
  try {
    const id = Number(req.params.id);
    const [auction, participant] = await Promise.all([
      db.auction.findUnique({ where: { id } }),
      req.user?.role === 'seller' ? db.auctionParticipant.findFirst({ where: { auctionId: id, sellerOrgId: req.user.organizationId || -1 } }) : Promise.resolve(null)
    ]);
    if (!auction) throw new ApiError(404, 'Auction not found', 'AUCTION_NOT_FOUND');
    if (req.user?.role === 'seller' && !participant) throw new ApiError(404, 'Auction not found', 'AUCTION_NOT_FOUND');
    if (req.user?.role !== 'seller') assertAuctionManager(req, auction);
    return apiResponse.success(res, {
      serverTime: new Date(),
      auction: maskSensitive(auction),
      participant: maskSensitive(participant),
      minimumNextBid: toNumber(auction.currentLowestAmount ?? auction.currentLowestBid ?? auction.currentBid ?? auction.startPrice) - toNumber(auction.minDecrementAmount ?? auction.minDecrement, 1)
    });
  } catch (error: any) {
    return apiResponse.error(res, error.statusCode || 500, error.message || 'Unable to load live summary', error.code || 'REVERSE_AUCTION_SUMMARY_ERROR');
  }
});

router.get('/reverse-auctions/:id/result', authorize('buyer', 'admin', 'master_admin'), async (req: AuthRequest, res: Response) => {
  try {
    const id = Number(req.params.id);
    const auction = await db.auction.findUnique({ where: { id } });
    if (!auction) throw new ApiError(404, 'Auction not found', 'AUCTION_NOT_FOUND');
    assertAuctionManager(req, auction);
    const participants = await db.auctionParticipant.findMany({ where: { auctionId: id }, orderBy: [{ currentRank: 'asc' }, { lastBidAmount: 'asc' }] });
    return apiResponse.success(res, { auction: maskSensitive(auction), ranking: maskSensitive(participants) });
  } catch (error: any) {
    return apiResponse.error(res, error.statusCode || 500, error.message || 'Unable to load auction result', error.code || 'REVERSE_AUCTION_RESULT_ERROR');
  }
});

router.post('/reverse-auctions/:id/award-recommendation', authorize('buyer', 'admin', 'master_admin'), async (req: AuthRequest, res: Response) => {
  try {
    const id = Number(req.params.id);
    const payload = awardSchema.parse(req.body);
    const auction = await db.auction.findUnique({ where: { id } });
    if (!auction) throw new ApiError(404, 'Auction not found', 'AUCTION_NOT_FOUND');
    assertAuctionManager(req, auction);
    const winner = payload.participantId
      ? await db.auctionParticipant.findFirst({ where: { id: payload.participantId, auctionId: id } })
      : await db.auctionParticipant.findFirst({ where: { auctionId: id, currentRank: 1 } });
    const updated = await db.auction.update({
      where: { id },
      data: {
        status: 'AWARD_RECOMMENDED',
        statusEnum: 'AWARD_RECOMMENDED',
        winnerSellerId: winner?.sellerUserId || null,
        remarks: payload.remarks || auction.remarks
      }
    });
    await writeAuctionEvent(req, id, 'award_recommended', 'Award recommendation generated', { participantId: winner?.id, sellerOrgId: winner?.sellerOrgId });
    return apiResponse.success(res, { auction: maskSensitive(updated), winner: maskSensitive(winner) }, 200, 'Award recommendation generated');
  } catch (error: any) {
    return apiResponse.error(res, error.statusCode || 400, error.message || 'Unable to recommend award', error.code || 'REVERSE_AUCTION_AWARD_ERROR');
  }
});

export default router;
