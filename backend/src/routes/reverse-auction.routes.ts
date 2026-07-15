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
  termsDocumentName: z.string().trim().max(260).optional(),
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

const transition = (target: string, enumStatus: string, extra?: (req: AuthRequest) => Record<string, unknown>) =>
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
      const data = { status: target, statusEnum: enumStatus, ...(extra ? extra(req) : {}) };
      const updated = await db.auction.update({ where: { id }, data });
      await writeAuctionEvent(req, id, target.toLowerCase(), `Auction moved to ${target}`, data);
      return apiResponse.success(res, maskSensitive(updated));
    } catch (error: any) {
      return apiResponse.error(res, error.statusCode || 400, error.message || 'Unable to update auction status', error.code || 'REVERSE_AUCTION_STATUS_ERROR');
    }
  };

router.post('/reverse-auctions/:id/schedule', requirePermission('reverse_auction.publish', orgScope), transition('SCHEDULED', 'SCHEDULED'));
router.post('/reverse-auctions/:id/start', requirePermission('reverse_auction.publish', orgScope), transition('LIVE', 'LIVE', () => ({ actualStartedAt: new Date() })));
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

/**
 * Self-enrolment for PUBLIC/OPEN reverse auctions. A verified seller opts in explicitly
 * (auditable) which creates their AuctionParticipant row and unlocks the bidding console.
 * Private/invite-only auctions reject self-join — they require a buyer invite.
 */
router.post('/reverse-auctions/:id/join', requirePermission('reverse_auction.view', orgScope), async (req: AuthRequest, res: Response) => {
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
    // BID_WITH_REVERSE_AUCTION requires technical qualification first, so self-join is not allowed there.
    if (String(auction.procurementMethod || '') === 'BID_WITH_REVERSE_AUCTION') {
      throw new ApiError(403, 'This auction requires technical qualification before bidding.', 'AUCTION_REQUIRES_QUALIFICATION');
    }

    const participant = await db.auctionParticipant.create({
      data: { auctionId: id, sellerOrgId, sellerUserId: req.user.id || null, status: 'INVITED' }
    });
    await writeAuctionEvent(req, id, 'seller_joined', 'Seller joined public reverse auction', { sellerOrgId });
    return apiResponse.created(res, { participant: maskSensitive(participant) }, 'Joined auction');
  } catch (error: any) {
    return apiResponse.error(res, error.statusCode || 500, error.message || 'Unable to join auction', error.code || 'REVERSE_AUCTION_JOIN_ERROR');
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
        const allowedParticipantStatuses = String(auction.procurementMethod || '') === 'BID_WITH_REVERSE_AUCTION'
          ? ['TECHNICALLY_QUALIFIED']
          : ['INVITED', 'ACCEPTED', 'TECHNICALLY_QUALIFIED'];
        const participant = await tx.auctionParticipant.findFirst({
          where: {
            auctionId,
            sellerOrgId: req.user?.organizationId || -1,
            status: { in: allowedParticipantStatuses }
          }
        });
        if (!participant) throw new ApiError(403, 'Only qualified sellers can participate in this auction', 'AUCTION_SELLER_NOT_QUALIFIED');
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
