import { Router, type Response } from 'express';
import { z } from 'zod';
import prisma from '../lib/prisma.js';
import { authenticate, optionalAuthenticate, type AuthRequest } from '../middleware/authenticate.js';
import { requirePermission } from '../middleware/auth.js';
import { redisKeys } from '../constants/redis-keys.js';
import { withDistributedLock } from '../utils/redisLock.js';
import { ApiError } from '../utils/ApiError.js';
import { apiResponse } from '../utils/apiResponse.js';
import { maskSensitive } from '../utils/maskSensitive.js';
import { auditLog } from '../modules/audit/audit.service.js';
import { notificationService } from '../services/notification.service.js';
import { logger } from '../config/logger.js';
import { upload } from '../config/storage.js';
import { uploadFile } from '../services/storage/storage.service.js';
import { env } from '../config/env.js';

const router = Router();
const db = prisma as any;
const orgScope = {
  scopeType: 'ORGANIZATION' as const,
  getScopeId: (req: AuthRequest) => req.user?.organizationId
};

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
  procurementMethod: z.enum(['REVERSE_AUCTION', 'BID_WITH_REVERSE_AUCTION']).default('REVERSE_AUCTION'),
  category: z.string().trim().max(160).optional(),
  subCategory: z.string().trim().max(160).optional(),
  currency: z.string().trim().length(3).default('INR'),
  buyerOrganization: z.string().trim().max(180).optional(),
  department: z.string().trim().max(160).optional(),
  purchaseGroup: z.string().trim().max(120).optional(),
  purchaseOrganization: z.string().trim().max(160).optional(),
  auctionType: z.enum(['ENGLISH_REVERSE', 'RANK_BASED_REVERSE']).default('ENGLISH_REVERSE'),
  auctionMode: z.enum(['ONLINE']).default('ONLINE'),
  linkedTenderId: z.coerce.number().int().positive().optional(),
  linkedBidId: z.coerce.number().int().positive().optional(),
  linkedRequirementId: z.coerce.number().int().positive().optional(),
  startAt: z.coerce.date(),
  endAt: z.coerce.date(),
  durationMinutes: z.coerce.number().int().positive().optional(),
  startingPrice: z.coerce.number().positive(),
  reservePrice: z.coerce.number().positive().optional(),
  minDecrementAmount: z.coerce.number().positive(),
  minDecrementPercent: z.coerce.number().min(0).max(100).optional(),
  autoExtensionEnabled: z.coerce.boolean().default(false),
  autoExtensionWindowMinutes: z.coerce.number().int().min(1).max(120).optional(),
  autoExtensionByMinutes: z.coerce.number().int().min(1).max(120).optional(),
  maxAutoExtensions: z.coerce.number().int().min(0).max(100).default(0),
  rankVisibility: z.enum(['SHOW_RANK_ONLY', 'SHOW_LOWEST_PRICE', 'HIDDEN']).default('SHOW_RANK_ONLY'),
  minimumQualifiedBidders: z.coerce.number().int().min(2).default(2),
  termsDocumentFileId: z.coerce.number().int().positive().optional(),
  termsDocumentName: z.string().trim().max(2000).optional(),
  buyerMonitorSettings: z.record(z.string(), z.unknown()).optional(),
  preBidStage: z.record(z.string(), z.unknown()).optional(),
  auctionTrigger: z.enum(['AFTER_TECHNICAL_QUALIFICATION', 'TOP_N_BIDDERS', 'ALL_TECHNICALLY_QUALIFIED']).optional(),
  visibilityMode: z.enum(['INVITED_SELLERS_ONLY', 'TECHNICALLY_QUALIFIED_ONLY']).default('INVITED_SELLERS_ONLY'),
  allowCompetitorNames: z.coerce.boolean().default(false),
  remarks: z.string().trim().max(1000).optional(),
  qualifiedVendors: z.array(z.object({
    sellerOrgId: z.coerce.number().int().positive(),
    sellerUserId: z.coerce.number().int().positive().optional()
  })).optional()
});

const createAuctionSchema = auctionFieldsSchema.refine(value => Boolean(value.linkedTenderId || value.linkedBidId || value.linkedRequirementId), {
  message: 'Link the auction to a tender, procurement bid, or buyer requirement',
  path: ['linkedTenderId']
}).refine(value => value.endAt > value.startAt, {
  message: 'Auction end time must be after start time',
  path: ['endAt']
}).refine(value => value.reservePrice === undefined || value.reservePrice <= value.startingPrice, {
  message: 'Reserve price must be less than or equal to starting price',
  path: ['reservePrice']
}).refine(value => !value.autoExtensionEnabled || Boolean(value.autoExtensionWindowMinutes && value.autoExtensionByMinutes && value.maxAutoExtensions > 0), {
  message: 'Auto extension trigger, duration, and maximum extensions are required when auto extension is enabled',
  path: ['autoExtensionWindowMinutes']
}).refine(value => !value.qualifiedVendors || value.qualifiedVendors.length >= value.minimumQualifiedBidders, {
  message: 'Qualified vendor list must satisfy minimum qualified bidders',
  path: ['qualifiedVendors']
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
const initialQuoteSchema = z.object({
  quotedAmount: z.coerce.number().positive(),
  gstPercentage: z.coerce.number().min(0).max(100).optional().default(0),
  totalAmount: z.coerce.number().positive().optional(),
  makeBrand: z.string().trim().max(160).optional(),
  model: z.string().trim().max(160).optional()
});
const qualificationReviewSchema = z.object({
  decision: z.enum(['QUALIFY', 'DISQUALIFY']),
  remarks: z.string().trim().max(1000).optional()
});

const isAdmin = (req: AuthRequest) => req.user?.role === 'admin' || req.user?.role === 'master_admin';

const canManageAuction = (req: AuthRequest, auction: any) =>
  isAdmin(req) ||
  auction.createdByUserId === req.user?.id ||
  (auction.buyerOrgId && auction.buyerOrgId === req.user?.organizationId);

const assertAuctionManager = (req: AuthRequest, auction: any) => {
  if (!canManageAuction(req, auction)) throw new ApiError(404, 'Auction not found', 'AUCTION_NOT_FOUND');
};

/**
 * A reverse auction is stored as a Requirement; the biddable Auction row has its own
 * id and links back via linkedRequirementId. Links across the app sometimes carry the
 * requirement id (or a public-opportunity id) instead of the auction id. Accept either:
 * try the auction primary key first, then fall back to the linked requirement id so a
 * stale/aliased link self-heals instead of 404-ing.
 */
const resolveAuctionId = async (rawId: number): Promise<number | null> => {
  if (!Number.isFinite(rawId)) return null;
  const direct = await db.auction.findUnique({ where: { id: rawId }, select: { id: true } });
  if (direct) return direct.id;
  const linked = await db.auction.findFirst({ where: { linkedRequirementId: rawId }, select: { id: true }, orderBy: { createdAt: 'desc' } });
  return linked?.id ?? null;
};

/**
 * True when the auction's linked requirement is publicly visible (open to all sellers).
 * The Requirement model has NO visibility column — selecting it throws, which used to
 * 500 every reverse-auction detail request. Openness lives in the wizard payload:
 * payload.vendors.selection === 'Open' (with payload.visibility as an explicit override).
 */
const isAuctionPublic = async (auction: any): Promise<boolean> => {
  if (!auction?.linkedRequirementId) return false;
  const requirement = await db.requirement.findUnique({
    where: { id: auction.linkedRequirementId },
    select: { payload: true }
  });
  const payload = (requirement?.payload || {}) as any;
  const explicit = String(payload.visibility || payload.basics?.visibility || '').toUpperCase();
  if (explicit) return explicit === 'PUBLIC';
  return String(payload.vendors?.selection || '').toLowerCase() === 'open';
};

/**
 * Auction status only changes on explicit buyer actions, so a row whose end time
 * passed (or whose scheduled window opened) keeps a stale DRAFT/SCHEDULED/LIVE
 * label forever. Derive the effective status from the clock at read time and
 * lazily persist it so every consumer (detail, list, live console) agrees.
 */
const TERMINAL_AUCTION_STATUSES = ['CLOSED', 'CANCELLED', 'AWARD_RECOMMENDED', 'AWARDED'];
const withEffectiveStatus = async (auction: any) => {
  if (!auction) return auction;
  const current = String(auction.statusEnum || auction.status || 'DRAFT').toUpperCase();
  if (TERMINAL_AUCTION_STATUSES.includes(current)) return auction;
  const now = Date.now();
  const start = auction.startTime ? new Date(auction.startTime).getTime() : NaN;
  const end = auction.endTime ? new Date(auction.endTime).getTime() : NaN;
  let effective = current;
  if (Number.isFinite(end) && end <= now) {
    effective = 'CLOSED';
  } else if (['SCHEDULED', 'LIVE', 'ACTIVE'].includes(current) && Number.isFinite(start) && start <= now) {
    effective = 'LIVE';
  }
  if (effective === current) return auction;
  const data: any = { status: effective, statusEnum: effective };
  if (effective === 'CLOSED' && !auction.actualClosedAt) data.actualClosedAt = new Date();
  await db.auction.update({ where: { id: auction.id }, data }).catch(() => undefined);
  return { ...auction, ...data };
};

/**
 * Wizard-created auctions carry only commercial fields; the procurement facts the
 * buyer filled (items, documents, delivery, consignees, timelines) live on the linked
 * Requirement payload. Attach a read-only summary so the seller detail page can show
 * everything without a second round trip.
 */
const linkedRequirementSummary = async (auction: any) => {
  if (!auction?.linkedRequirementId) return null;
  const requirement = await db.requirement.findUnique({
    where: { id: auction.linkedRequirementId },
    include: { items: true, category: true }
  });
  if (!requirement) return null;
  const payload = (requirement.payload || {}) as any;
  const basics = payload.basics || {};
  const tender = payload.tender || {};
  const documents = Array.isArray(payload.documents) ? payload.documents : [];
  return {
    id: requirement.id,
    requirementNumber: requirement.requirementNumber,
    title: requirement.title,
    description: requirement.description,
    canonicalMethod: requirement.canonicalMethod || requirement.procurementMethod,
    status: requirement.status,
    estimatedValue: requirement.estimatedValue,
    currency: requirement.currency,
    requiredBy: requirement.requiredBy,
    category: requirement.category?.name || basics.category || null,
    deliveryLocation: basics.deliveryLocation || tender.deliveryLocation || null,
    items: (requirement.items || []).map((item: any) => ({
      itemName: item.itemName,
      description: item.description,
      quantity: item.quantity,
      unitOfMeasure: item.unitOfMeasure,
      estimatedUnitPrice: item.estimatedUnitPrice
    })),
    documents: documents.map((doc: any) => ({ name: doc.name, fileName: doc.fileName || null, required: doc.required !== false })),
    consigneeDetails: Array.isArray(payload.consigneeDetails) ? payload.consigneeDetails : [],
    paymentTerms: payload.terms?.paymentTerms || basics.paymentTerms || null,
    bidStartDate: tender.bidStartDate || null,
    bidClosingDate: tender.bidClosingDate || null
  };
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

  const participants = await tx.auctionParticipant.findMany({
    where: { auctionId }
  });
  const participantMap = new Map<number, any>(participants.map(p => [Number(p.sellerOrgId), p]));

  let rank = 1;
  const participantUpdates = [];
  const bidUpdates = [];

  for (const bid of bestByOrg.values()) {
    const orgId = Number(bid.sellerOrgId || 0);
    const p = participantMap.get(orgId);
    const bidAmount = bid.amount || bid.bidAmount;

    if (p) {
      if (p.currentRank !== rank || toNumber(p.lastBidAmount) !== toNumber(bidAmount)) {
        participantUpdates.push(
          tx.auctionParticipant.updateMany({
            where: { auctionId, sellerOrgId: orgId },
            data: { currentRank: rank, lastBidAmount: bidAmount }
          })
        );
      }
    } else {
      participantUpdates.push(
        tx.auctionParticipant.updateMany({
          where: { auctionId, sellerOrgId: orgId },
          data: { currentRank: rank, lastBidAmount: bidAmount }
        })
      );
    }

    if (bid.rankAtSubmission !== rank) {
      bidUpdates.push(
        tx.auctionBid.update({
          where: { id: bid.id },
          data: { rankAtSubmission: rank }
        }).catch(() => undefined)
      );
    }
    rank += 1;
  }

  if (participantUpdates.length > 0) {
    await Promise.all(participantUpdates);
  }
  if (bidUpdates.length > 0) {
    await Promise.all(bidUpdates);
  }
};

router.get('/reverse-auctions/:id', optionalAuthenticate, async (req: AuthRequest, res: Response) => {
  try {
    const id = await resolveAuctionId(Number(req.params.id));
    if (!id) throw new ApiError(404, 'Auction not found', 'AUCTION_NOT_FOUND');
    let auction = await db.auction.findUnique({ where: { id }, include: auctionIncludeFor(req) });
    if (!auction) throw new ApiError(404, 'Auction not found', 'AUCTION_NOT_FOUND');
    auction = await withEffectiveStatus(auction);

    const isPublic = await isAuctionPublic(auction);
    let hasJoined = false;
    let authorized = false;

    if (isPublic) {
      authorized = true;
    }

    if (req.user) {
      if (isAdmin(req) || auction.createdByUserId === req.user.id || (auction.buyerOrgId && auction.buyerOrgId === req.user.organizationId)) {
        authorized = true;
      }
      const participant = await db.auctionParticipant.findFirst({
        where: { auctionId: id, sellerOrgId: req.user.organizationId || -1 }
      });
      if (participant) {
        hasJoined = true;
        authorized = true;
      }
    }

    if (!authorized) {
      return apiResponse.error(res, 404, 'Auction not found', 'AUCTION_NOT_FOUND');
    }

    // Filter competitor bids if needed
    if (req.user?.role === 'seller' && !auction.allowCompetitorNames) {
      auction.bids = (auction.bids || []).filter((bid: any) => bid.sellerId === req.user?.id || bid.sellerOrgId === req.user?.organizationId);
    } else if (!req.user || (req.user.role !== 'admin' && req.user.role !== 'master_admin' && auction.createdByUserId !== req.user.id && auction.buyerOrgId !== req.user.organizationId)) {
      if (!auction.allowCompetitorNames) {
        auction.bids = [];
      }
    }

    let buyerOrganizationName = 'Verified Buyer';
    if (auction.buyerOrgId) {
      const buyerOrg = await db.organization.findUnique({
        where: { id: auction.buyerOrgId },
        select: { organizationName: true }
      });
      if (buyerOrg) {
        buyerOrganizationName = buyerOrg.organizationName;
      }
    }

    const linkedRequirement = await linkedRequirementSummary(auction);
    return apiResponse.success(res, maskSensitive({ ...auction, isPublic, hasJoined, linkedRequirement, buyerOrganizationName }));
  } catch (error: any) {
    return apiResponse.error(res, error.statusCode || 500, error.message || 'Unable to load auction', error.code || 'REVERSE_AUCTION_DETAIL_ERROR');
  }
});

router.get('/reverse-auctions/:id/live-summary', optionalAuthenticate, async (req: AuthRequest, res: Response) => {
  try {
    const id = await resolveAuctionId(Number(req.params.id));
    if (!id) throw new ApiError(404, 'Auction not found', 'AUCTION_NOT_FOUND');
    let [auction, participant] = await Promise.all([
      db.auction.findUnique({ where: { id } }),
      req.user?.role === 'seller' ? db.auctionParticipant.findFirst({ where: { auctionId: id, sellerOrgId: req.user.organizationId || -1 } }) : Promise.resolve(null)
    ]);
    if (!auction) throw new ApiError(404, 'Auction not found', 'AUCTION_NOT_FOUND');
    auction = await withEffectiveStatus(auction);

    const isPublic = await isAuctionPublic(auction);
    let authorized = false;

    if (isPublic) {
      authorized = true;
    }

    if (req.user) {
      if (isAdmin(req) || auction.createdByUserId === req.user.id || (auction.buyerOrgId && auction.buyerOrgId === req.user.organizationId)) {
        authorized = true;
      }
      if (participant) {
        authorized = true;
      }
    }

    if (!authorized) {
      return apiResponse.error(res, 404, 'Auction not found', 'AUCTION_NOT_FOUND');
    }

    return apiResponse.success(res, {
      serverTime: new Date(),
      auction: maskSensitive({ ...auction, isPublic, hasJoined: !!participant }),
      participant: maskSensitive(participant),
      minimumNextBid: toNumber(auction.currentLowestAmount ?? auction.currentLowestBid ?? auction.currentBid ?? auction.startPrice) - toNumber(auction.minDecrementAmount ?? auction.minDecrement, 0)
    });
  } catch (error: any) {
    return apiResponse.error(res, error.statusCode || 500, error.message || 'Unable to load live summary', error.code || 'REVERSE_AUCTION_SUMMARY_ERROR');
  }
});

router.use('/reverse-auctions', authenticate);

router.post('/reverse-auctions', requirePermission('reverse_auction.create', orgScope), async (req: AuthRequest, res: Response) => {
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
        procurementMethod: payload.procurementMethod,
        category: payload.category || null,
        subCategory: payload.subCategory || null,
        auctionType: payload.auctionType,
        auctionMode: payload.auctionMode,
        auctionDurationMinutes: payload.durationMinutes || Math.max(1, Math.round((payload.endAt.getTime() - payload.startAt.getTime()) / 60000)),
        purchaseGroup: payload.purchaseGroup || null,
        purchaseOrganization: payload.purchaseOrganization || null,
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
        autoExtensionWindowMinutes: payload.autoExtensionWindowMinutes || 5,
        autoExtensionByMinutes: payload.autoExtensionByMinutes || 5,
        maxAutoExtensions: payload.maxAutoExtensions,
        currency: payload.currency.toUpperCase(),
        rankVisibility: payload.rankVisibility,
        minimumQualifiedBidders: payload.minimumQualifiedBidders,
        termsDocumentFileId: payload.termsDocumentFileId || null,
        termsDocumentName: payload.termsDocumentName || null,
        buyerMonitorSettings: payload.buyerMonitorSettings || undefined,
        preBidStage: payload.preBidStage || undefined,
        auctionTrigger: payload.auctionTrigger || null,
        auctionConfig: {
          procurementMethod: payload.procurementMethod,
          auctionType: payload.auctionType,
          auctionMode: payload.auctionMode,
          rankVisibility: payload.rankVisibility,
          minimumQualifiedBidders: payload.minimumQualifiedBidders,
          buyerOrganization: payload.buyerOrganization || null,
          department: payload.department || null,
          qualifiedVendorCount: payload.qualifiedVendors?.length || 0
        },
        visibilityMode: payload.visibilityMode,
        allowCompetitorNames: payload.allowCompetitorNames,
        remarks: payload.remarks || null,
        startTime: payload.startAt,
        endTime: payload.endAt,
        status: 'DRAFT',
        statusEnum: 'DRAFT'
      }
    });
    if (payload.qualifiedVendors?.length) {
      await db.auctionParticipant.createMany({
        data: payload.qualifiedVendors.map(seller => ({
          auctionId: auction.id,
          sellerOrgId: seller.sellerOrgId,
          sellerUserId: seller.sellerUserId || null,
          status: payload.procurementMethod === 'BID_WITH_REVERSE_AUCTION' ? 'TECHNICALLY_QUALIFIED' : 'INVITED'
        })),
        skipDuplicates: true
      });
    }
    await writeAuctionEvent(req, auction.id, 'created', 'Reverse auction created', { auctionCode: auction.auctionCode });
    return apiResponse.created(res, maskSensitive(auction), 'Reverse auction created');
  } catch (error: any) {
    return apiResponse.error(res, error.statusCode || 400, error.message || 'Unable to create reverse auction', error.code || 'REVERSE_AUCTION_CREATE_ERROR');
  }
});

router.get('/reverse-auctions', requirePermission('reverse_auction.view', orgScope), async (req: AuthRequest, res: Response) => {
  try {
    const page = Math.max(1, Number(req.query.page || 1));
    const pageSize = Math.min(500, Math.max(1, Number(req.query.pageSize || 20)));
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
    const withStatuses = await Promise.all(auctions.map((auction: any) => withEffectiveStatus(auction)));
    return apiResponse.success(res, { auctions: maskSensitive(withStatuses), total, page, pageSize, totalPages: Math.ceil(total / pageSize) });
  } catch (error: any) {
    return apiResponse.error(res, 500, 'Unable to load reverse auctions', 'REVERSE_AUCTION_LIST_ERROR');
  }
});



router.patch('/reverse-auctions/:id', requirePermission('reverse_auction.update', orgScope), async (req: AuthRequest, res: Response) => {
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
        procurementMethod: payload.procurementMethod,
        category: payload.category,
        subCategory: payload.subCategory,
        auctionType: payload.auctionType,
        auctionMode: payload.auctionMode,
        auctionDurationMinutes: payload.durationMinutes,
        purchaseGroup: payload.purchaseGroup,
        purchaseOrganization: payload.purchaseOrganization,
        currency: payload.currency?.toUpperCase(),
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
        rankVisibility: payload.rankVisibility,
        minimumQualifiedBidders: payload.minimumQualifiedBidders,
        termsDocumentFileId: payload.termsDocumentFileId,
        termsDocumentName: payload.termsDocumentName,
        buyerMonitorSettings: payload.buyerMonitorSettings,
        preBidStage: payload.preBidStage,
        auctionTrigger: payload.auctionTrigger,
        auctionConfig: payload.procurementMethod ? {
          procurementMethod: payload.procurementMethod,
          auctionType: payload.auctionType,
          auctionMode: payload.auctionMode,
          rankVisibility: payload.rankVisibility,
          minimumQualifiedBidders: payload.minimumQualifiedBidders
        } : undefined,
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

// Before an auction can go LIVE, enough sellers must have cleared the pre-bid
// qualification stage — otherwise the auction opens with no eligible bidders.
const assertEnoughQualifiedBidders = async (auction: any) => {
  const qualified = await db.auctionParticipant.count({ where: { auctionId: auction.id, status: 'TECHNICALLY_QUALIFIED' } });
  const minimum = Math.max(1, Number(auction.minimumQualifiedBidders) || 1);
  if (qualified < minimum) {
    throw new ApiError(400, `At least ${minimum} technically qualified bidder(s) are required before the auction can go live (currently ${qualified}).`, 'AUCTION_INSUFFICIENT_QUALIFIED');
  }
};

const transition = (target: string, enumStatus: string, extra?: (req: AuthRequest) => Record<string, unknown>, guard?: (auction: any) => Promise<void>) =>
  async (req: AuthRequest, res: Response) => {
    try {
      const id = Number(req.params.id);
      const auction = await db.auction.findUnique({ where: { id } });
      if (!auction) throw new ApiError(404, 'Auction not found', 'AUCTION_NOT_FOUND');
      assertAuctionManager(req, auction);
      const current = String(auction.status || 'DRAFT').toUpperCase();
      if (['CLOSED', 'CANCELLED'].includes(current)) {
        throw new ApiError(400, 'Cannot transition an auction that is closed or cancelled', 'AUCTION_ALREADY_FINALIZED');
      }
      if (guard) await guard(auction);
      const data = { status: target, statusEnum: enumStatus, ...(extra ? extra(req) : {}) };
      const updated = await db.auction.update({ where: { id }, data });
      await writeAuctionEvent(req, id, target.toLowerCase(), `Auction moved to ${target}`, data);
      return apiResponse.success(res, maskSensitive(updated));
    } catch (error: any) {
      return apiResponse.error(res, error.statusCode || 400, error.message || 'Unable to update auction status', error.code || 'REVERSE_AUCTION_STATUS_ERROR');
    }
  };

router.post('/reverse-auctions/:id/schedule', requirePermission('reverse_auction.publish', orgScope), transition('SCHEDULED', 'SCHEDULED'));
router.post('/reverse-auctions/:id/start', requirePermission('reverse_auction.publish', orgScope), transition('LIVE', 'LIVE', () => ({ actualStartedAt: new Date() }), assertEnoughQualifiedBidders));
router.post('/reverse-auctions/:id/pause', requirePermission('reverse_auction.update', orgScope), transition('PAUSED', 'PAUSED'));
router.post('/reverse-auctions/:id/resume', requirePermission('reverse_auction.publish', orgScope), transition('LIVE', 'LIVE'));
router.post('/reverse-auctions/:id/close', requirePermission('reverse_auction.close', orgScope), transition('CLOSED', 'CLOSED', () => ({ actualClosedAt: new Date() })));
router.post('/reverse-auctions/:id/cancel', requirePermission('reverse_auction.close', orgScope), async (req: AuthRequest, res: Response) => {
  req.body = { ...req.body, reason: cancelSchema.parse(req.body).reason };
  return transition('CANCELLED', 'CANCELLED', request => ({ cancellationReason: request.body.reason, actualClosedAt: new Date() }))(req, res);
});

router.post('/reverse-auctions/:id/invite-sellers', requirePermission('reverse_auction.invite_seller', orgScope), async (req: AuthRequest, res: Response) => {
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

    // Notify each invited seller — in-app + email. Fire-and-forget so a mail/SMTP
    // failure never blocks the invite response.
    void (async () => {
      const auctionTitle = auction.title || auction.auctionCode || `Reverse Auction #${id}`;
      const endsAt = auction.endTime ? new Date(auction.endTime).toLocaleString() : null;
      const redirectUrl = `/reverse-auctions/${id}`;
      for (const seller of payload.sellers) {
        // Prefer the explicitly named user; otherwise notify every user in the seller org.
        const targets = seller.sellerUserId
          ? [{ id: seller.sellerUserId }]
          : await db.user.findMany({ where: { organizationId: seller.sellerOrgId }, select: { id: true } });
        for (const u of targets) {
          await notificationService.notifyWithEmail(u.id, {
            title: 'Reverse Auction Invitation',
            message: `You have been invited to participate in the reverse auction "${auctionTitle}".${endsAt ? ` Bidding closes ${endsAt}.` : ''} Open the portal to review the terms and place your bids.`,
            type: 'reverse_auction_invite',
            priority: 'high',
            redirectUrl,
            emailSubject: `Reverse Auction Invitation — ${auctionTitle}`,
            emailHtml: `<p>Your organization has been invited to a reverse auction on the MSME Procurement Portal.</p>
<p><strong>Auction:</strong> ${auctionTitle}</p>
${endsAt ? `<p><strong>Bidding closes:</strong> ${endsAt}</p>` : ''}
<p>Log in to review the auction terms, accept the invitation, and submit your competitive bids.</p>`
          });
        }
      }
    })().catch(err => logger.warn({ err, auctionId: id }, 'Failed to notify invited sellers'));

    return apiResponse.success(res, { participants: maskSensitive(rows) }, 200, 'Sellers invited');
  } catch (error: any) {
    return apiResponse.error(res, error.statusCode || 400, error.message || 'Unable to invite sellers', error.code || 'REVERSE_AUCTION_INVITE_ERROR');
  }
});

router.get('/reverse-auctions/:id/participants', requirePermission('reverse_auction.view', orgScope), async (req: AuthRequest, res: Response) => {
  try {
    const id = await resolveAuctionId(Number(req.params.id));
    if (!id) throw new ApiError(404, 'Auction not found', 'AUCTION_NOT_FOUND');
    const auction = await db.auction.findUnique({ where: { id } });
    if (!auction) throw new ApiError(404, 'Auction not found', 'AUCTION_NOT_FOUND');
    const where: any = { auctionId: id };
    if (req.user?.role === 'seller') where.sellerOrgId = req.user.organizationId || -1;
    else assertAuctionManager(req, auction);
    const participants = await db.auctionParticipant.findMany({ where, orderBy: [{ currentRank: 'asc' }, { invitedAt: 'asc' }] });
    const orgIds = Array.from(new Set(participants.map((p: any) => p.sellerOrgId).filter(Boolean)));
    const orgs = await db.organization.findMany({
      where: { id: { in: orgIds } },
      select: { id: true, organizationName: true }
    });
    const orgMap = new Map(orgs.map((o: any) => [o.id, o.organizationName]));
    const mappedParticipants = participants.map((p: any) => ({
      ...p,
      sellerOrgName: orgMap.get(p.sellerOrgId) || `Organization #${p.sellerOrgId}`
    }));
    return apiResponse.success(res, { participants: maskSensitive(mappedParticipants) });
  } catch (error: any) {
    return apiResponse.error(res, error.statusCode || 500, error.message || 'Unable to load participants', error.code || 'REVERSE_AUCTION_PARTICIPANTS_ERROR');
  }
});

// ── Auction Clarifications (Q&A between sellers and the buyer) ──
// Stored in the polymorphic RequirementClarification table with entityType='AUCTION'
// and entityId=Auction.id (canonicalized via resolveAuctionId, so either id works).

const auctionClarificationAskBody = z.object({
  question: z.string().trim().min(3).max(2000),
  visibility: z.enum(['PUBLIC', 'PRIVATE']).optional().default('PUBLIC')
});

const auctionClarificationReplyBody = z.object({
  response: z.string().trim().min(1).max(3000)
});

const isAuctionManagerUser = (req: AuthRequest, auction: any) =>
  isAdmin(req) || auction.createdByUserId === req.user?.id || (req.user?.organizationId && auction.buyerOrgId === req.user.organizationId);

router.post('/reverse-auctions/:id/clarifications', requirePermission('reverse_auction.view', orgScope), async (req: AuthRequest, res: Response) => {
  try {
    const id = await resolveAuctionId(Number(req.params.id));
    if (!id) throw new ApiError(404, 'Auction not found', 'AUCTION_NOT_FOUND');
    const auction = await db.auction.findUnique({ where: { id } });
    if (!auction) throw new ApiError(404, 'Auction not found', 'AUCTION_NOT_FOUND');
    const body = auctionClarificationAskBody.parse(req.body);

    // Closed/awarded auctions no longer take questions.
    const status = String(auction.statusEnum || auction.status || '').toUpperCase();
    if (['CLOSED', 'CANCELLED', 'AWARD_RECOMMENDED', 'AWARDED'].includes(status)) {
      throw new ApiError(400, 'The clarification window has closed for this auction.', 'AUCTION_CLARIFICATION_CLOSED');
    }
    // Sellers ask; the buyer/manager may also post announcements.
    if (req.user?.role !== 'seller' && !isAuctionManagerUser(req, auction)) {
      throw new ApiError(403, 'Access denied', 'AUCTION_CLARIFICATION_FORBIDDEN');
    }

    const clarification = await db.requirementClarification.create({
      data: {
        entityType: 'AUCTION',
        entityId: id,
        question: body.question,
        visibility: body.visibility,
        askedById: req.user!.id
      }
    });

    // Notify the auction owner (best-effort).
    if (auction.createdByUserId && auction.createdByUserId !== req.user?.id) {
      void notificationService.notifyNow(auction.createdByUserId, {
        title: 'New Auction Clarification',
        message: `Regarding "${auction.title || auction.auctionCode}": ${body.question.substring(0, 100)}${body.question.length > 100 ? '…' : ''}`,
        type: 'auction_clarification',
        priority: 'medium',
        redirectUrl: `/reverse-auctions/${id}`
      }).catch(err => logger.warn({ err, auctionId: id }, 'Auction clarification notify failed'));
    }

    await writeAuctionEvent(req, id, 'clarification_asked', 'Clarification question asked', { clarificationId: clarification.id });
    return apiResponse.created(res, maskSensitive(clarification), 'Clarification submitted');
  } catch (error: any) {
    if (error instanceof z.ZodError) {
      return apiResponse.error(res, 400, 'Question must be 3-2000 characters.', 'VALIDATION_ERROR');
    }
    return apiResponse.error(res, error.statusCode || 500, error.message || 'Unable to submit clarification', error.code || 'AUCTION_CLARIFICATION_ERROR');
  }
});

router.post('/reverse-auctions/:id/clarifications/:clarId/reply', requirePermission('reverse_auction.view', orgScope), async (req: AuthRequest, res: Response) => {
  try {
    const id = await resolveAuctionId(Number(req.params.id));
    if (!id) throw new ApiError(404, 'Auction not found', 'AUCTION_NOT_FOUND');
    const auction = await db.auction.findUnique({ where: { id } });
    if (!auction) throw new ApiError(404, 'Auction not found', 'AUCTION_NOT_FOUND');
    const clarId = Number(req.params.clarId);
    const body = auctionClarificationReplyBody.parse(req.body);

    // Only the auction manager (buyer side) or admin can answer.
    if (!isAuctionManagerUser(req, auction)) {
      throw new ApiError(403, 'Only the auction owner can answer clarifications.', 'AUCTION_CLARIFICATION_FORBIDDEN');
    }

    const clarification = await db.requirementClarification.findUnique({ where: { id: clarId } });
    if (!clarification || clarification.entityType !== 'AUCTION' || clarification.entityId !== id) {
      throw new ApiError(404, 'Clarification not found', 'CLARIFICATION_NOT_FOUND');
    }
    if (clarification.response) {
      throw new ApiError(409, 'Clarification already answered.', 'ALREADY_ANSWERED');
    }

    const updated = await db.requirementClarification.update({
      where: { id: clarId },
      data: { response: body.response, answeredById: req.user!.id, answeredAt: new Date() }
    });

    void notificationService.notifyNow(clarification.askedById, {
      title: 'Auction Clarification Answered',
      message: `Your question on "${auction.title || auction.auctionCode}" has been answered.`,
      type: 'auction_clarification_replied',
      priority: 'medium',
      redirectUrl: `/reverse-auctions/${id}`
    }).catch(err => logger.warn({ err, auctionId: id }, 'Auction clarification reply notify failed'));

    await writeAuctionEvent(req, id, 'clarification_answered', 'Clarification answered', { clarificationId: clarId });
    return apiResponse.success(res, maskSensitive(updated));
  } catch (error: any) {
    if (error instanceof z.ZodError) {
      return apiResponse.error(res, 400, 'Reply must be 1-3000 characters.', 'VALIDATION_ERROR');
    }
    return apiResponse.error(res, error.statusCode || 500, error.message || 'Unable to submit reply', error.code || 'AUCTION_CLARIFICATION_ERROR');
  }
});

router.get('/reverse-auctions/:id/clarifications', requirePermission('reverse_auction.view', orgScope), async (req: AuthRequest, res: Response) => {
  try {
    const id = await resolveAuctionId(Number(req.params.id));
    if (!id) throw new ApiError(404, 'Auction not found', 'AUCTION_NOT_FOUND');
    const auction = await db.auction.findUnique({ where: { id } });
    if (!auction) throw new ApiError(404, 'Auction not found', 'AUCTION_NOT_FOUND');

    const clarifications = await db.requirementClarification.findMany({
      where: { entityType: 'AUCTION', entityId: id },
      orderBy: { askedAt: 'asc' }
    });

    // Buyer/manager sees all; sellers see PUBLIC threads + their own PRIVATE ones.
    const filtered = isAuctionManagerUser(req, auction)
      ? clarifications
      : clarifications.filter((c: any) => c.visibility === 'PUBLIC' || c.askedById === req.user?.id);

    return apiResponse.success(res, maskSensitive(filtered));
  } catch (error: any) {
    return apiResponse.error(res, error.statusCode || 500, error.message || 'Unable to load clarifications', error.code || 'AUCTION_CLARIFICATION_ERROR');
  }
});

/**
 * Self-enrolment for PUBLIC/OPEN reverse auctions. A verified seller opts in explicitly
 * (auditable) which creates their AuctionParticipant row and unlocks the bidding console.
 * Private/invite-only auctions reject self-join — they require a buyer invite.
 */router.post('/reverse-auctions/:id/join', requirePermission('reverse_auction.view', orgScope), async (req: AuthRequest, res: Response) => {
  try {
    if (req.user?.role !== 'seller') throw new ApiError(403, 'Only sellers can join an auction', 'AUCTION_JOIN_FORBIDDEN');
    const sellerOrgId = req.user.organizationId;
    if (!sellerOrgId) throw new ApiError(400, 'Seller organization is required to join', 'AUCTION_JOIN_NO_ORG');
    const id = await resolveAuctionId(Number(req.params.id));
    if (!id) throw new ApiError(404, 'Auction not found', 'AUCTION_NOT_FOUND');
    const auction = await db.auction.findUnique({ where: { id } });
    if (!auction) throw new ApiError(404, 'Auction not found', 'AUCTION_NOT_FOUND');

    const existing = await db.auctionParticipant.findFirst({ where: { auctionId: id, sellerOrgId } });
    if (existing) return apiResponse.success(res, { participant: maskSensitive(existing), alreadyJoined: true }, 200, 'Already participating');

    if (!(await isAuctionPublic(auction))) {
      throw new ApiError(403, 'This auction is invite-only. Please wait for the buyer to invite your organization.', 'AUCTION_INVITE_ONLY');
    }
    // Every reverse auction now runs a pre-bid qualification stage: joining only
    // creates the participant in INVITED / PENDING qualification. The seller must
    // upload the mandatory documents (plus an initial quote for the hybrid method)
    // and be promoted to TECHNICALLY_QUALIFIED by the buyer before bidding opens.
    const participant = await db.auctionParticipant.create({
      data: { auctionId: id, sellerOrgId, sellerUserId: req.user.id || null, status: 'INVITED', qualificationStatus: 'PENDING' }
    });
    await writeAuctionEvent(req, id, 'seller_joined', 'Seller joined public reverse auction', { sellerOrgId });
    return apiResponse.created(res, { participant: maskSensitive(participant), requiresQualification: true }, 'Joined auction — complete qualification to bid');
  } catch (error: any) {
    return apiResponse.error(res, error.statusCode || 500, error.message || 'Unable to join auction', error.code || 'REVERSE_AUCTION_JOIN_ERROR');
  }
});

// ── Pre-bid Qualification Stage ──────────────────────────────────────────────
// Sellers must qualify before the live auction: upload mandatory documents and,
// for BID_WITH_REVERSE_AUCTION, an initial commercial quote; then submit for
// buyer review. The buyer qualifies (-> TECHNICALLY_QUALIFIED, unlocks bidding)
// or disqualifies. This is the process behind the gate enforced in POST /bids.

const requiresInitialQuote = (auction: any) => String(auction?.procurementMethod || '') === 'BID_WITH_REVERSE_AUCTION';

// The seller's own participant row for an auction, or throw. Sellers self-serve
// their qualification, so the row must already exist (via invite or self-join).
const getOwnParticipant = async (req: AuthRequest, auctionId: number) => {
  const sellerOrgId = req.user?.organizationId;
  if (!sellerOrgId) throw new ApiError(400, 'Seller organization is required', 'AUCTION_NO_ORG');
  const participant = await db.auctionParticipant.findFirst({ where: { auctionId, sellerOrgId } });
  if (!participant) throw new ApiError(404, 'You are not a participant in this auction. Join or await an invite first.', 'AUCTION_PARTICIPANT_NOT_FOUND');
  return participant;
};

const assertQualificationEditable = (participant: any) => {
  if (participant.status === 'TECHNICALLY_QUALIFIED') throw new ApiError(400, 'You are already qualified for this auction.', 'AUCTION_ALREADY_QUALIFIED');
  if (participant.status === 'DISQUALIFIED') throw new ApiError(400, 'Your qualification was declined for this auction.', 'AUCTION_DISQUALIFIED');
  if (participant.qualificationStatus === 'SUBMITTED') throw new ApiError(400, 'Your qualification is already submitted and under review.', 'AUCTION_QUALIFICATION_SUBMITTED');
};

// Seller uploads one mandatory qualification document.
router.post('/reverse-auctions/:id/qualification/documents', requirePermission('reverse_auction.bid.submit', orgScope), upload.single('file'), async (req: AuthRequest & { file?: Express.Multer.File }, res: Response) => {
  try {
    if (req.user?.role !== 'seller') throw new ApiError(403, 'Only sellers can upload qualification documents', 'AUCTION_QUALIFICATION_FORBIDDEN');
    const auctionId = await resolveAuctionId(Number(req.params.id));
    if (!auctionId) throw new ApiError(404, 'Auction not found', 'AUCTION_NOT_FOUND');
    const auction = await db.auction.findUnique({ where: { id: auctionId } });
    if (!auction) throw new ApiError(404, 'Auction not found', 'AUCTION_NOT_FOUND');
    if (['CLOSED', 'CANCELLED', 'AWARDED', 'AWARD_RECOMMENDED'].includes(String(auction.statusEnum || auction.status || '').toUpperCase())) {
      throw new ApiError(400, 'This auction is no longer accepting qualification submissions.', 'AUCTION_QUALIFICATION_CLOSED');
    }
    const participant = await getOwnParticipant(req, auctionId);
    assertQualificationEditable(participant);
    if (!req.file) throw new ApiError(400, 'File is required', 'FILE_REQUIRED');

    const asset = await uploadFile(req.file, {
      ownerId: req.user!.id,
      ownerRole: req.user!.role,
      entityType: 'auction_qualification_document',
      entityId: participant.id,
      purpose: String(req.body.documentCategory || 'TECHNICAL'),
      ipAddress: req.ip,
      userAgent: req.headers['user-agent']
    }, env.STORAGE_PROVIDER);

    const doc = await db.auctionQualificationDocument.create({
      data: {
        auctionId,
        participantId: participant.id,
        sellerOrgId: participant.sellerOrgId,
        sellerUserId: req.user!.id,
        documentCategory: String(req.body.documentCategory || 'TECHNICAL'),
        documentName: String(req.body.documentName || req.body.documentCategory || 'Technical Document'),
        fileAssetId: asset.id,
        fileName: asset.originalName,
        fileUrl: asset.url,
        fileKey: asset.key,
        mimeType: asset.mimeType,
        fileSize: asset.size
      }
    });
    if (participant.qualificationStatus !== 'IN_PROGRESS') {
      await db.auctionParticipant.update({ where: { id: participant.id }, data: { qualificationStatus: 'IN_PROGRESS' } });
    }
    await writeAuctionEvent(req, auctionId, 'qualification_document_uploaded', 'Qualification document uploaded', { participantId: participant.id, documentCategory: doc.documentCategory });
    return apiResponse.created(res, { document: maskSensitive(doc) }, 'Document uploaded');
  } catch (error: any) {
    return apiResponse.error(res, error.statusCode || 500, error.message || 'Unable to upload document', error.code || 'AUCTION_QUALIFICATION_UPLOAD_ERROR');
  }
});

// Seller saves / updates their initial commercial quote (required for hybrid method).
router.post('/reverse-auctions/:id/qualification/initial-quote', requirePermission('reverse_auction.bid.submit', orgScope), async (req: AuthRequest, res: Response) => {
  try {
    if (req.user?.role !== 'seller') throw new ApiError(403, 'Only sellers can submit an initial quote', 'AUCTION_QUALIFICATION_FORBIDDEN');
    const auctionId = await resolveAuctionId(Number(req.params.id));
    if (!auctionId) throw new ApiError(404, 'Auction not found', 'AUCTION_NOT_FOUND');
    const auction = await db.auction.findUnique({ where: { id: auctionId } });
    if (!auction) throw new ApiError(404, 'Auction not found', 'AUCTION_NOT_FOUND');
    const participant = await getOwnParticipant(req, auctionId);
    assertQualificationEditable(participant);
    const payload = initialQuoteSchema.parse(req.body);
    const total = payload.totalAmount ?? payload.quotedAmount + (payload.quotedAmount * payload.gstPercentage / 100);
    const updated = await db.auctionParticipant.update({
      where: { id: participant.id },
      data: {
        initialQuoteAmount: payload.quotedAmount,
        initialQuoteGstPercent: payload.gstPercentage,
        initialQuoteTotal: total,
        makeBrand: payload.makeBrand || null,
        model: payload.model || null,
        qualificationStatus: participant.qualificationStatus === 'PENDING' ? 'IN_PROGRESS' : participant.qualificationStatus
      }
    });
    await writeAuctionEvent(req, auctionId, 'qualification_quote_saved', 'Initial commercial quote saved', { participantId: participant.id });
    // Quote amount is sensitive until the auction opens — never echo it back.
    return apiResponse.success(res, { participant: maskSensitive({ ...updated, initialQuoteAmount: 'MASKED', initialQuoteTotal: 'MASKED' }) }, 200, 'Initial quote saved');
  } catch (error: any) {
    return apiResponse.error(res, error.statusCode || 400, error.message || 'Unable to save initial quote', error.code || 'AUCTION_QUALIFICATION_QUOTE_ERROR');
  }
});

// Seller submits their qualification packet for buyer review.
router.post('/reverse-auctions/:id/qualification/submit', requirePermission('reverse_auction.bid.submit', orgScope), async (req: AuthRequest, res: Response) => {
  try {
    if (req.user?.role !== 'seller') throw new ApiError(403, 'Only sellers can submit qualification', 'AUCTION_QUALIFICATION_FORBIDDEN');
    const auctionId = await resolveAuctionId(Number(req.params.id));
    if (!auctionId) throw new ApiError(404, 'Auction not found', 'AUCTION_NOT_FOUND');
    const auction = await db.auction.findUnique({ where: { id: auctionId } });
    if (!auction) throw new ApiError(404, 'Auction not found', 'AUCTION_NOT_FOUND');
    const participant = await getOwnParticipant(req, auctionId);
    assertQualificationEditable(participant);

    const docCount = await db.auctionQualificationDocument.count({ where: { participantId: participant.id } });
    if (!docCount) throw new ApiError(400, 'Upload at least one mandatory document before submitting.', 'AUCTION_QUALIFICATION_NO_DOCUMENTS');
    if (requiresInitialQuote(auction) && participant.initialQuoteAmount == null) {
      throw new ApiError(400, 'An initial commercial quote is required to qualify for this auction.', 'AUCTION_QUALIFICATION_QUOTE_REQUIRED');
    }

    const updated = await db.auctionParticipant.update({
      where: { id: participant.id },
      data: { qualificationStatus: 'SUBMITTED', qualificationSubmittedAt: new Date() }
    });
    await writeAuctionEvent(req, auctionId, 'qualification_submitted', 'Seller submitted qualification for review', { participantId: participant.id });

    // Notify the auction manager(s) that a submission is awaiting review.
    void (async () => {
      const title = auction.title || auction.auctionCode || `Reverse Auction #${auctionId}`;
      if (auction.createdByUserId) {
        await notificationService.notifyWithEmail(auction.createdByUserId, {
          title: 'Auction Qualification Submitted',
          message: `A seller submitted qualification documents for "${title}". Review and qualify them to let them bid.`,
          type: 'reverse_auction_qualification',
          priority: 'high',
          redirectUrl: `/reverse-auctions/${auctionId}`,
          emailSubject: `Qualification submitted — ${title}`,
          emailHtml: `<p>A seller has submitted their qualification packet for the reverse auction "${title}".</p><p>Log in to review documents and qualify or decline the bidder.</p>`
        });
      }
    })().catch(err => logger.warn({ err, auctionId }, 'Failed to notify buyer of qualification submission'));

    return apiResponse.success(res, { participant: maskSensitive(updated) }, 200, 'Qualification submitted for review');
  } catch (error: any) {
    return apiResponse.error(res, error.statusCode || 400, error.message || 'Unable to submit qualification', error.code || 'AUCTION_QUALIFICATION_SUBMIT_ERROR');
  }
});

// Qualification overview. Sellers see their own packet; buyers/managers see every participant.
router.get('/reverse-auctions/:id/qualification', requirePermission('reverse_auction.view', orgScope), async (req: AuthRequest, res: Response) => {
  try {
    const auctionId = await resolveAuctionId(Number(req.params.id));
    if (!auctionId) throw new ApiError(404, 'Auction not found', 'AUCTION_NOT_FOUND');
    const auction = await db.auction.findUnique({ where: { id: auctionId } });
    if (!auction) throw new ApiError(404, 'Auction not found', 'AUCTION_NOT_FOUND');
    const isSeller = req.user?.role === 'seller';
    const where: any = { auctionId };
    if (isSeller) where.sellerOrgId = req.user?.organizationId || -1;
    else assertAuctionManager(req, auction);

    const participants = await db.auctionParticipant.findMany({
      where,
      include: { qualificationDocuments: { orderBy: { uploadedAt: 'desc' } } },
      orderBy: [{ qualificationSubmittedAt: 'asc' }, { invitedAt: 'asc' }]
    });
    const orgIds = Array.from(new Set(participants.map((p: any) => p.sellerOrgId).filter(Boolean)));
    const orgs = await db.organization.findMany({ where: { id: { in: orgIds } }, select: { id: true, organizationName: true } });
    const orgMap = new Map(orgs.map((o: any) => [o.id, o.organizationName]));

    // Sellers must not see rivals' quote amounts; buyers only see quotes once submitted.
    const mapped = participants.map((p: any) => {
      const base = { ...p, sellerOrgName: orgMap.get(p.sellerOrgId) || `Organization #${p.sellerOrgId}` };
      const ownRow = isSeller && p.sellerOrgId === req.user?.organizationId;
      if (!ownRow && isSeller) {
        return { id: p.id, sellerOrgId: p.sellerOrgId, sellerOrgName: base.sellerOrgName, status: p.status, qualificationStatus: p.qualificationStatus };
      }
      return base;
    });
    return apiResponse.success(res, {
      requiresInitialQuote: requiresInitialQuote(auction),
      participants: maskSensitive(mapped)
    });
  } catch (error: any) {
    return apiResponse.error(res, error.statusCode || 500, error.message || 'Unable to load qualification', error.code || 'AUCTION_QUALIFICATION_LOAD_ERROR');
  }
});

// Buyer reviews a submitted seller: qualify (unlock bidding) or disqualify.
router.post('/reverse-auctions/:id/qualification/:participantId/review', requirePermission('reverse_auction.invite_seller', orgScope), async (req: AuthRequest, res: Response) => {
  try {
    const auctionId = await resolveAuctionId(Number(req.params.id));
    if (!auctionId) throw new ApiError(404, 'Auction not found', 'AUCTION_NOT_FOUND');
    const auction = await db.auction.findUnique({ where: { id: auctionId } });
    if (!auction) throw new ApiError(404, 'Auction not found', 'AUCTION_NOT_FOUND');
    assertAuctionManager(req, auction);
    const payload = qualificationReviewSchema.parse(req.body);
    const participant = await db.auctionParticipant.findFirst({ where: { id: Number(req.params.participantId), auctionId } });
    if (!participant) throw new ApiError(404, 'Participant not found', 'AUCTION_PARTICIPANT_NOT_FOUND');
    if (participant.qualificationStatus !== 'SUBMITTED') {
      throw new ApiError(400, 'Only submitted qualifications can be reviewed.', 'AUCTION_QUALIFICATION_NOT_SUBMITTED');
    }

    const qualify = payload.decision === 'QUALIFY';
    const updated = await db.auctionParticipant.update({
      where: { id: participant.id },
      data: {
        status: qualify ? 'TECHNICALLY_QUALIFIED' : 'DISQUALIFIED',
        qualificationStatus: qualify ? 'QUALIFIED' : 'DISQUALIFIED',
        qualifiedAt: qualify ? new Date() : null,
        qualificationRemarks: payload.remarks || null,
        disqualificationReason: qualify ? null : (payload.remarks || 'Did not meet qualification criteria')
      }
    });
    await writeAuctionEvent(req, auctionId, qualify ? 'seller_qualified' : 'seller_disqualified', qualify ? 'Seller technically qualified' : 'Seller disqualified', { participantId: participant.id });

    void (async () => {
      const title = auction.title || auction.auctionCode || `Reverse Auction #${auctionId}`;
      const targets = participant.sellerUserId
        ? [{ id: participant.sellerUserId }]
        : await db.user.findMany({ where: { organizationId: participant.sellerOrgId }, select: { id: true } });
      for (const u of targets) {
        await notificationService.notifyWithEmail(u.id, {
          title: qualify ? 'Qualified for Reverse Auction' : 'Auction Qualification Declined',
          message: qualify
            ? `Your organization is qualified for "${title}". You can place bids once the auction goes live.`
            : `Your qualification for "${title}" was not accepted.${payload.remarks ? ` Reason: ${payload.remarks}` : ''}`,
          type: 'reverse_auction_qualification',
          priority: qualify ? 'high' : 'medium',
          redirectUrl: `/reverse-auctions/${auctionId}`,
          emailSubject: qualify ? `You are qualified — ${title}` : `Qualification update — ${title}`,
          emailHtml: qualify
            ? `<p>Congratulations — your organization has been technically qualified for the reverse auction "${title}".</p><p>Log in when the auction goes live to place your competitive bids.</p>`
            : `<p>Your qualification submission for "${title}" was not accepted.</p>${payload.remarks ? `<p><strong>Reason:</strong> ${payload.remarks}</p>` : ''}`
        });
      }
    })().catch(err => logger.warn({ err, auctionId }, 'Failed to notify seller of qualification decision'));

    return apiResponse.success(res, { participant: maskSensitive(updated) }, 200, qualify ? 'Seller qualified' : 'Seller disqualified');
  } catch (error: any) {
    return apiResponse.error(res, error.statusCode || 400, error.message || 'Unable to review qualification', error.code || 'AUCTION_QUALIFICATION_REVIEW_ERROR');
  }
});

router.post('/reverse-auctions/:id/bids', requirePermission('reverse_auction.bid.submit', orgScope), async (req: AuthRequest, res: Response) => {
  try {
    const auctionId = await resolveAuctionId(Number(req.params.id));
    if (!auctionId) throw new ApiError(404, 'Auction not found', 'AUCTION_NOT_FOUND');
    const payload = bidSchema.parse(req.body);
    const result = await withDistributedLock(redisKeys.lockAuction(auctionId), async () =>
      db.$transaction(async (tx: any) => {
        const auction = await tx.auction.findUnique({ where: { id: auctionId } });
        if (!auction) throw new ApiError(404, 'Auction not found', 'AUCTION_NOT_FOUND');
        // Both reverse-auction methods now run a pre-bid qualification stage, so only
        // participants the buyer promoted to TECHNICALLY_QUALIFIED may place live bids.
        const participant = await tx.auctionParticipant.findFirst({
          where: {
            auctionId,
            sellerOrgId: req.user?.organizationId || -1,
            status: 'TECHNICALLY_QUALIFIED'
          }
        });
        if (!participant) throw new ApiError(403, 'Only technically qualified sellers can bid. Complete the qualification stage first.', 'AUCTION_SELLER_NOT_QUALIFIED');
        const now = new Date();
        if (!['LIVE', 'active'].includes(String(auction.status))) throw new ApiError(409, 'Auction is not live', 'AUCTION_NOT_LIVE');
        if (auction.startTime > now || auction.endTime <= now) throw new ApiError(409, 'Auction is outside the bidding window', 'AUCTION_WINDOW_CLOSED');

        const current = toNumber(auction.currentLowestAmount ?? auction.currentLowestBid ?? auction.currentBid ?? auction.startPrice);
        const amountDecrement = toNumber(auction.minDecrementAmount ?? auction.minDecrement, 0);
        if (amountDecrement <= 0) throw new ApiError(400, 'Auction minimum decrement is not configured', 'AUCTION_MIN_DECREMENT_REQUIRED');
        const percentDecrement = auction.minDecrementPercent ? current * (toNumber(auction.minDecrementPercent) / 100) : 0;
        const requiredDecrement = Math.max(amountDecrement, percentDecrement);
        const maxAllowed = current - requiredDecrement;
        if (payload.amount > maxAllowed) {
          throw new ApiError(400, `Bid must be at least ${requiredDecrement.toFixed(2)} below current lowest amount`, 'AUCTION_MIN_DECREMENT');
        }
        // Reserve price is the buyer's floor: in a reverse auction sellers drive the
        // price down, so a bid under the reserve is rejected. (bidSchema already
        // guarantees amount > 0, so no separate positivity check is needed here.)
        const reserve = auction.reservePrice != null ? toNumber(auction.reservePrice) : null;
        if (reserve != null && reserve > 0 && payload.amount < reserve) {
          throw new ApiError(400, `Bid cannot be below the auction reserve price`, 'AUCTION_BELOW_RESERVE');
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

router.get('/reverse-auctions/:id/bids', requirePermission('reverse_auction.view', orgScope), async (req: AuthRequest, res: Response) => {
  try {
    const id = await resolveAuctionId(Number(req.params.id));
    if (!id) throw new ApiError(404, 'Auction not found', 'AUCTION_NOT_FOUND');
    const auction = await db.auction.findUnique({ where: { id } });
    if (!auction) throw new ApiError(404, 'Auction not found', 'AUCTION_NOT_FOUND');
    const where: any = { auctionId: id };
    if (req.user?.role === 'seller') where.OR = [{ sellerId: req.user.id }, { sellerOrgId: req.user.organizationId || -1 }];
    else assertAuctionManager(req, auction);
    const bids = await db.auctionBid.findMany({ where, orderBy: [{ amount: 'asc' }, { submittedAt: 'asc' }] });
    
    const orgIds = Array.from(new Set(bids.map((b: any) => b.sellerOrgId).filter(Boolean)));
    const orgs = await db.organization.findMany({
      where: { id: { in: orgIds as number[] } },
      select: { id: true, organizationName: true }
    });
    const orgMap = new Map(orgs.map((o: any) => [o.id, o.organizationName]));
    const mappedBids = bids.map((b: any) => ({
      ...b,
      sellerOrgName: orgMap.get(b.sellerOrgId) || `Organization #${b.sellerOrgId}`
    }));
    
    return apiResponse.success(res, { bids: maskSensitive(mappedBids) });
  } catch (error: any) {
    return apiResponse.error(res, error.statusCode || 500, error.message || 'Unable to load bids', error.code || 'REVERSE_AUCTION_BIDS_ERROR');
  }
});



router.get('/reverse-auctions/:id/result', requirePermission('reverse_auction.view', orgScope), async (req: AuthRequest, res: Response) => {
  try {
    const id = await resolveAuctionId(Number(req.params.id));
    if (!id) throw new ApiError(404, 'Auction not found', 'AUCTION_NOT_FOUND');
    const auction = await db.auction.findUnique({ where: { id } });
    if (!auction) throw new ApiError(404, 'Auction not found', 'AUCTION_NOT_FOUND');
    assertAuctionManager(req, auction);
    const participants = await db.auctionParticipant.findMany({ where: { auctionId: id }, orderBy: [{ currentRank: 'asc' }, { lastBidAmount: 'asc' }] });
    
    // Resolve organization names for the ranking table
    const orgIds = participants.map((p: any) => p.sellerOrgId).filter(Boolean);
    const orgs = await db.organization.findMany({
      where: { id: { in: orgIds } },
      select: { id: true, organizationName: true }
    });
    const orgMap = new Map(orgs.map((o: any) => [o.id, o.organizationName]));
    const ranking = participants.map((p: any) => ({
      ...p,
      sellerOrgName: orgMap.get(p.sellerOrgId) || `Organization #${p.sellerOrgId}`
    }));

    return apiResponse.success(res, { auction: maskSensitive(auction), ranking: maskSensitive(ranking) });
  } catch (error: any) {
    return apiResponse.error(res, error.statusCode || 500, error.message || 'Unable to load auction result', error.code || 'REVERSE_AUCTION_RESULT_ERROR');
  }
});

router.post('/reverse-auctions/:id/award-recommendation', requirePermission('reverse_auction.award', orgScope), async (req: AuthRequest, res: Response) => {
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
