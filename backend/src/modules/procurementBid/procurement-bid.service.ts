import prisma from '../../lib/prisma.js';
import { env } from '../../config/env.js';
import { ApiError } from '../../utils/ApiError.js';
import { uploadFile } from '../../services/storage/storage.service.js';
import type { AuthRequest, AuthenticatedUser } from '../../middleware/authenticate.js';
import { createOrReuseProcurementPOForAward } from './procurement-order.service.js';
import { logger } from '../../config/logger.js';
import { notificationService } from '../../services/notification.service.js';

const db = prisma as any;

type Actor = AuthenticatedUser;

const publicBidStatuses = ['PENDING_ADMIN_APPROVAL', 'APPROVED', 'OPEN', 'CLOSED', 'TECHNICAL_EVALUATION', 'FINANCIAL_EVALUATION', 'AWARDED', 'EXPIRED'];
const financialOpenStatuses = ['FINANCIAL_EVALUATION', 'L1_GENERATED', 'AWARD_RECOMMENDED', 'AWARDED'];
const sellerVerifiedStatuses = ['approved_for_procurement', 'approved'];
const activeUserStatuses = ['ACTIVE'];
const verifiedOrganizationStatuses = ['VERIFIED'];
const editableBidStatuses = ['DRAFT'];
const editableApprovalStatuses = ['DRAFT', 'REJECTED'];
const technicalEvaluationStatuses = ['CLOSED', 'EXPIRED', 'TECHNICAL_EVALUATION'];
const financialEvaluationReadyStatuses = ['TECHNICAL_EVALUATION_COMPLETED'];
const restrictedProcurementMethods = ['LIMITED_TENDER', 'REPEAT_ORDER', 'RATE_CONTRACT'];

const bidTransitions: Record<string, string[]> = {
  DRAFT: ['PENDING_ADMIN_APPROVAL', 'PUBLISHED', 'OPEN', 'OPEN_FOR_BIDDING', 'CANCELLED'],
  PENDING_ADMIN_APPROVAL: ['APPROVED', 'PUBLISHED', 'OPEN', 'OPEN_FOR_BIDDING', 'DRAFT', 'CANCELLED'],
  APPROVED: ['OPEN', 'OPEN_FOR_BIDDING', 'PUBLISHED', 'CANCELLED'],
  PUBLISHED: ['OPEN', 'OPEN_FOR_BIDDING', 'CANCELLED'],
  OPEN: ['CLOSED', 'EXPIRED', 'UNDER_EVALUATION', 'TECHNICAL_EVALUATION', 'CANCELLED'],
  OPEN_FOR_BIDDING: ['CLOSED', 'EXPIRED', 'UNDER_EVALUATION', 'TECHNICAL_EVALUATION', 'CANCELLED'],
  CLOSED: ['UNDER_EVALUATION', 'TECHNICAL_EVALUATION', 'CANCELLED'],
  EXPIRED: ['UNDER_EVALUATION', 'TECHNICAL_EVALUATION', 'CANCELLED'],
  TECHNICAL_EVALUATION: ['TECHNICAL_EVALUATION_COMPLETED', 'UNDER_EVALUATION', 'CANCELLED'],
  TECHNICAL_EVALUATION_COMPLETED: ['FINANCIAL_EVALUATION', 'UNDER_EVALUATION', 'CANCELLED'],
  FINANCIAL_EVALUATION: ['L1_GENERATED', 'AWARD_RECOMMENDED', 'UNDER_EVALUATION', 'CANCELLED'],
  L1_GENERATED: ['AWARD_RECOMMENDED', 'AWARDED', 'CANCELLED'],
  AWARD_RECOMMENDED: ['AWARDED', 'CANCELLED'],
  AWARDED: ['PO_GENERATED', 'CANCELLED'],
  PO_GENERATED: ['IN_PROGRESS', 'CANCELLED'],
  IN_PROGRESS: ['DELIVERED', 'CANCELLED'],
  DELIVERED: ['GRN_COMPLETED', 'CANCELLED'],
  GRN_COMPLETED: ['INVOICE_SUBMITTED', 'CANCELLED'],
  INVOICE_SUBMITTED: ['PAYMENT_COMPLETED', 'CANCELLED'],
  PAYMENT_COMPLETED: ['CLOSED', 'CANCELLED'],
  UNDER_EVALUATION: ['AWARDED', 'NEGOTIATION', 'CANCELLED'],
  NEGOTIATION: ['AWARDED', 'CANCELLED'],
  CANCELLED: []
};

const maskedQuote = {
  quotedAmount: null,
  gstPercentage: null,
  totalAmount: null,
  financialSealed: true,
  message: 'Financial quote is sealed until financial evaluation.'
};

const assertActiveAccount = (user: any, roleLabel: string) => {
  if (!user || !activeUserStatuses.includes(String(user.accountStatus || 'ACTIVE'))) {
    throw new ApiError(403, `${roleLabel} account is not active for procurement actions.`, 'FORBIDDEN_ROLE');
  }
};

const assertBidTransition = (from: string, to: string, message?: string) => {
  if (from === to) return;
  if (!(bidTransitions[from] || []).includes(to)) {
    throw new ApiError(400, message || `Bid cannot move from ${from} to ${to}.`, 'INVALID_STATUS_TRANSITION');
  }
};

const rankToFinalStatus = (rank: number) => {
  if (rank === 1) return 'L1';
  if (rank === 2) return 'L2';
  if (rank === 3) return 'L3';
  if (rank === 4) return 'L4';
  return 'NOT_SELECTED';
};

export const isRestrictedBidMethod = (bid: any) =>
  restrictedProcurementMethods.includes(String(bid?.procurementType || '').toUpperCase()) ||
  restrictedProcurementMethods.includes(String(bid?.bidType || '').toUpperCase());

export const isActorInvitedToBid = (actor: Actor | null | undefined, bid: any) => {
  if (!actor || actor.role !== 'seller') return false;
  const actorIds = new Set([Number(actor.id), Number(actor.organizationId)].filter(Number.isFinite));

  // Preferred source of truth: relational invitation rows.
  if (Array.isArray(bid?.invitations) && bid.invitations.length) {
    if (bid.invitations.some((inv: any) => actorIds.has(Number(inv.sellerOrgId)) || actorIds.has(Number(inv.sellerUserId)))) {
      return true;
    }
  }

  // Backwards-compatible fallback: invited sellers embedded in technicalPacket JSON
  // (covers rows created before the invitation table existed / not yet backfilled).
  const packet = bid?.technicalPacket && typeof bid.technicalPacket === 'object' ? bid.technicalPacket : {};
  const invited = Array.isArray(packet?.vendors?.invitedSellers)
    ? packet.vendors.invitedSellers
    : Array.isArray(packet?.qualifiedVendors)
      ? packet.qualifiedVendors
      : [];
  return invited.some((entry: any) => {
    if (entry && typeof entry === 'object') {
      return [
        entry.sellerOrgId,
        entry.supplierId,
        entry.organizationId,
        entry.sellerUserId,
        entry.userId,
        entry.id
      ].some(value => actorIds.has(Number(value)));
    }
    return actorIds.has(Number(entry));
  });
};

// Single source of truth for whether a procurement is invite-only ("PRIVATE") vs "PUBLIC".
// Prefers the explicit `visibility` column; falls back to method-name/selection heuristics
// for rows created before the column existed.
export const isPrivateBid = (bid: any) => {
  if (bid?.visibility === 'PRIVATE') return true;
  if (bid?.visibility === 'PUBLIC') return false;
  if (isRestrictedBidMethod(bid)) return true;
  const selection = String(
    bid?.technicalPacket?.vendors?.selection
    ?? bid?.technicalPacket?.wizardData?.vendors?.selection
    ?? ''
  ).toUpperCase();
  return selection === 'SELECT' || selection === 'LIMITED';
};

// Derive the visibility value to persist at create/publish time from the method + vendor selection.
export const deriveVisibility = (input: { procurementType?: string | null; bidType?: string | null; technicalPacket?: any }) => {
  const selection = String(
    input?.technicalPacket?.vendors?.selection
    ?? input?.technicalPacket?.wizardData?.vendors?.selection
    ?? ''
  ).toUpperCase();
  const restricted = restrictedProcurementMethods.includes(String(input?.procurementType || '').toUpperCase())
    || restrictedProcurementMethods.includes(String(input?.bidType || '').toUpperCase());
  return (restricted || selection === 'SELECT' || selection === 'LIMITED') ? 'PRIVATE' : 'PUBLIC';
};

// Extract invited-seller ids (as numbers) from a technicalPacket blob, tolerant of the
// several historical shapes (primitive ids or objects with various id keys).
export const extractInvitedSellerIds = (technicalPacket: any): number[] => {
  const packet = technicalPacket && typeof technicalPacket === 'object' ? technicalPacket : {};
  const vendors = packet.vendors || packet.wizardData?.vendors || {};
  const list = Array.isArray(vendors.invitedSellers)
    ? vendors.invitedSellers
    : Array.isArray(packet.qualifiedVendors)
      ? packet.qualifiedVendors
      : [];
  const ids = new Set<number>();
  for (const entry of list) {
    let value: any;
    if (entry && typeof entry === 'object') {
      value = entry.sellerOrgId ?? entry.supplierId ?? entry.organizationId ?? entry.sellerUserId ?? entry.userId ?? entry.id;
    } else {
      value = entry;
    }
    const num = Number(value);
    if (Number.isFinite(num) && num > 0) ids.add(num);
  }
  return [...ids];
};

// Persist relational invitation rows for a bid from its technicalPacket. Idempotent.
export const syncBidInvitations = async (bidId: number, technicalPacket: any, invitedById?: number) => {
  const ids = extractInvitedSellerIds(technicalPacket);
  if (!ids.length) return;
  await db.procurementBidInvitation.createMany({
    data: ids.map(sellerOrgId => ({ bidId, sellerOrgId, invitedById: invitedById ?? null })),
    skipDuplicates: true
  }).catch(() => undefined);
};

// THE authorization gate: can this actor view the full detail of this bid?
// Public bids are viewable by anyone; private bids only by the owner, an invited
// seller, a participant, or an admin. `bid` should be loaded with `invitations` and
// `participations` for accurate results.
export const canActorViewBid = (actor: Actor | null | undefined, bid: any) => {
  if (!isPrivateBid(bid)) return true;
  if (!actor) return false;
  if (actor.role === 'admin' || actor.role === 'master_admin') return true;
  if (actor.role === 'buyer' && bid.buyerId === Number(actor.id)) return true;
  if (actor.role === 'seller') {
    const hasParticipation = (bid.participations || []).some((p: any) => p.sellerId === Number(actor.id));
    if (hasParticipation) return true;
    if (isActorInvitedToBid(actor, bid)) return true;
  }
  return false;
};

export const now = () => new Date();

export const moneyNumber = (value: unknown) => value == null ? null : Number(value);

export const procurementAudit = async (
  req: Pick<AuthRequest, 'user' | 'ip' | 'headers'>,
  action: string,
  entityType: string,
  entityId: string | number,
  newValue?: unknown,
  oldValue?: unknown
) => db.procurementAuditLog.create({
  data: {
    userId: req.user?.id,
    role: req.user?.role,
    entityType,
    entityId: String(entityId),
    action,
    oldValue: oldValue as any,
    newValue: newValue as any,
    ipAddress: req.ip,
    userAgent: req.headers?.['user-agent']
  }
});

export const bidInclude: any = {
  documents: true,
  invitations: true,
  buyer: {
    select: {
      id: true,
      name: true,
      email: true,
      mobile: true,
      role: true,
      buyerProfile: {
        select: {
          departmentName: true,
          representativeName: true,
          email: true,
          mobile: true
        }
      }
    }
  },
  buyerOrganization: { select: { id: true, organizationName: true, organizationType: true, verificationStatus: true, city: true, district: true, state: true } },
  participations: {
    include: {
      seller: { select: { id: true, name: true, email: true, role: true, onboardingStatus: true, organizationId: true } },
      documents: true,
      clarifications: { include: { files: true } },
      evaluations: true,
      awards: true
    }
  },
  clarifications: {
    include: {
      files: true,
      seller: { select: { id: true, name: true } }
    }
  },
  evaluations: true,
  awards: true
};

export const nextBidNumber = async () => {
  const year = new Date().getFullYear();
  const count = await db.procurementBid.count({
    where: { bidNumber: { startsWith: `JSG-BID-${year}-` } }
  });
  return `JSG-BID-${year}-${String(count + 1).padStart(5, '0')}`;
};

export const nextParticipationNumber = async (bidNumber: string) => {
  const count = await db.procurementBidParticipation.count({
    where: { bid: { bidNumber } }
  });
  return `${bidNumber}-P${String(count + 1).padStart(4, '0')}`;
};

export const nextClarificationNumber = async (bidNumber: string) => {
  const count = await db.procurementBidClarification.count({
    where: { bid: { bidNumber } }
  });
  return `${bidNumber}-CLR-${String(count + 1).padStart(3, '0')}`;
};

export const resolveBid = async (bidIdOrNumber: string | number, include: any = bidInclude) => {
  const token = String(bidIdOrNumber).trim();
  const isNum = /^\d+$/.test(token);
  const parsedNum = (token.startsWith('REQ-') || token.startsWith('RFQ-'))
    ? Number(token.replace(/^(REQ-|RFQ-)/, ''))
    : (isNum ? Number(token) : null);

  const tokenVariants = [
    token,
    token.startsWith('RFQ-') ? token.replace('RFQ-', 'REQ-') : (token.startsWith('REQ-') ? token.replace('REQ-', 'RFQ-') : token)
  ];

  const whereConditions: any[] = tokenVariants.flatMap(t => [{ bidNumber: t }, { bidNumber: `RFQ-${t}` }, { bidNumber: `REQ-${t}` }]);
  if (parsedNum && Number.isFinite(parsedNum) && parsedNum > 0) {
    whereConditions.push({ id: parsedNum });
  }

  const bid = await db.procurementBid.findFirst({
    where: { OR: whereConditions },
    include
  });
  if (!bid) throw new ApiError(404, 'Bid not found', 'BID_NOT_FOUND');
  return refreshBidStatus(bid);
};

export const refreshBidStatus = async (bid: any) => {
  const current = bid.status;
  const time = now();
  if (current === 'OPEN' && new Date(bid.endDate) <= time) {
    const expired = await db.procurementBid.update({
      where: { id: bid.id },
      data: { status: 'EXPIRED', lifecycleStage: 'TECHNICAL_EVALUATION' },
      include: bidInclude
    });
    await db.procurementAuditLog.create({
      data: {
        entityType: 'ProcurementBid',
        entityId: String(bid.id),
        action: 'BID_EXPIRED',
        oldValue: { status: current } as any,
        newValue: { status: 'EXPIRED', lifecycleStage: 'TECHNICAL_EVALUATION' } as any
      }
    });
    return expired;
  }
  if (current === 'APPROVED' && new Date(bid.startDate) <= time && new Date(bid.endDate) > time) {
    return db.procurementBid.update({
      where: { id: bid.id },
      data: { status: 'OPEN', lifecycleStage: 'SELLER_PARTICIPATION' },
      include: bidInclude
    });
  }
  return bid;
};

export const serializeBid = (bid: any, options: { actor?: Actor; detail?: boolean; includeParticipants?: boolean; includeFinancial?: boolean; sellerRatings?: Record<number, any> } = {}) => {
  const actor = options.actor;
  const isAdmin = actor?.role === 'admin' || actor?.role === 'master_admin';
  const isBuyerOwner = actor?.role === 'buyer' && Number(bid.buyerId) === Number(actor.id);
  const canSeeParticipants = options.includeParticipants || isAdmin || isBuyerOwner;
  const canSeeFinancial = options.includeFinancial || isAdmin || (isBuyerOwner && financialOpenStatuses.includes(bid.status));

  // Buyer packet & requirement documents are part of the tender pack sellers must respond to.
  // Filter out only internal buyer approval documents (e.g. budget sanctions) for sellers.
  const internalBuyerDocTypes = ['BUDGET_SANCTION', 'ADMINISTRATIVE_APPROVAL', 'PAC_CERTIFICATE', 'COMPETENT_AUTHORITY_APPROVAL', 'PRICE_REASONABILITY'];
  const publicDocuments = (bid.documents || []).filter((doc: any) => {
    if (doc.visibility === 'PUBLIC' || doc.visibility === 'SELLER_AFTER_LOGIN') return true;
    if (actor?.role === 'seller') {
      const isInternalApproval = internalBuyerDocTypes.includes(doc.documentType) && doc.visibility === 'BUYER_ADMIN_ONLY';
      return !isInternalApproval;
    }
    return isAdmin || isBuyerOwner;
  });

  return {
    id: bid.id,
    bidNumber: bid.bidNumber,
    title: bid.title,
    description: bid.description,
    buyerId: bid.buyerId,
    buyerOrganizationName: bid.buyerOrganizationName,
    buyerType: bid.buyerType,
    departmentName: bid.buyer?.buyerProfile?.departmentName || null,
    consigneeDetails: bid.technicalPacket && typeof bid.technicalPacket === 'object' && (bid.technicalPacket as any).wizardData ? (bid.technicalPacket as any).wizardData : null,
    category: bid.category,
    subCategory: bid.subCategory,
    bidType: bid.bidType,
    procurementType: bid.procurementType,
    quantity: moneyNumber(bid.quantity),
    unit: bid.unit,
    estimatedValue: moneyNumber(bid.estimatedValue),
    deliveryLocation: bid.deliveryLocation,
    state: bid.state,
    district: bid.district,
    pincode: bid.pincode,
    startDate: bid.startDate,
    endDate: bid.endDate,
    technicalOpeningDate: bid.technicalOpeningDate,
    financialOpeningDate: bid.financialOpeningDate,
    bidValidityDate: bid.bidValidityDate,
    status: bid.status,
    approvalStatus: bid.approvalStatus,
    lifecycleStage: bid.lifecycleStage,
    visibility: bid.visibility,
    evaluationMethod: bid.evaluationMethod,
    isEmdRequired: bid.isEmdRequired,
    emdAmount: moneyNumber(bid.emdAmount),
    documentFee: moneyNumber(bid.documentFee),
    allowClarification: bid.allowClarification,
    allowReverseAuction: bid.allowReverseAuction,
    allowBoq: bid.allowBoq,
    packetType: bid.packetType,
    technicalPacket: isAdmin || isBuyerOwner || actor?.role === 'seller' ? bid.technicalPacket : undefined,
    financialPacket: canSeeFinancial ? bid.financialPacket : undefined,
    termsAndConditions: bid.termsAndConditions || [],
    eligibilityCriteria: bid.eligibilityCriteria || [],
    requiredDocuments: bid.requiredDocuments || [],
    rejectedReason: isAdmin || isBuyerOwner ? bid.rejectedReason : undefined,
    createdAt: bid.createdAt,
    updatedAt: bid.updatedAt,
    buyer: bid.buyer ? {
      id: bid.buyer.id,
      name: bid.buyer.name,
      email: bid.buyer.email,
      mobile: bid.buyer.mobile,
      buyerProfile: bid.buyer.buyerProfile ? {
        departmentName: bid.buyer.buyerProfile.departmentName,
        representativeName: bid.buyer.buyerProfile.representativeName,
        email: bid.buyer.buyerProfile.email,
        mobile: bid.buyer.buyerProfile.mobile
      } : null
    } : null,
    buyerOrganization: bid.buyerOrganization,
    documents: publicDocuments.map((doc: any) => {
      let fileAssetId = doc.fileAssetId;
      if (!fileAssetId && doc.fileUrl) {
        const match = String(doc.fileUrl).match(/\/api\/(?:public\/)?files\/(\d+)/);
        if (match && match[1]) fileAssetId = Number(match[1]);
      }
      return {
        id: doc.id,
        documentType: doc.documentType,
        fileName: doc.fileName,
        mimeType: doc.mimeType,
        fileSize: doc.fileSize,
        visibility: doc.visibility,
        fileAssetId: fileAssetId || doc.id,
        fileUrl: doc.fileUrl || (fileAssetId ? `/api/files/${fileAssetId}/view` : null)
      };
    }),
    participantsCount: bid.participations?.length || 0,
    participations: canSeeParticipants ? (bid.participations || []).map((p: any) => serializeParticipation(p, { canSeeFinancial, bid })) : undefined,
    clarifications: (isAdmin || isBuyerOwner)
      ? bid.clarifications
      : actor?.role === 'seller'
        ? (bid.clarifications || []).filter((c: any) => {
            const isRestrictedBid = ['DIRECT_PURCHASE', 'CATALOG_PURCHASE', 'REPEAT_ORDER', 'LIMITED_TENDER', 'SINGLE_SOURCE', 'PAC', 'EMERGENCY_PURCHASE'].includes(String(bid.procurementType || bid.bidType).toUpperCase());
            if (isRestrictedBid) {
              return c.sellerId === Number(actor.id);
            }
            return true;
          }).map((c: any) => {
            const isRestrictedBid = ['DIRECT_PURCHASE', 'CATALOG_PURCHASE', 'REPEAT_ORDER', 'LIMITED_TENDER', 'SINGLE_SOURCE', 'PAC', 'EMERGENCY_PURCHASE'].includes(String(bid.procurementType || bid.bidType).toUpperCase());
            if (isRestrictedBid) {
              return c;
            }
            const isOwn = c.sellerId === Number(actor.id);
            return {
              id: c.id,
              bidId: c.bidId,
              participationId: isOwn ? c.participationId : undefined,
              sellerId: isOwn ? c.sellerId : undefined,
              buyerId: c.buyerId,
              requestNumber: c.requestNumber,
              clarificationType: c.clarificationType,
              question: c.question,
              response: c.response,
              status: c.status,
              requestedById: isOwn ? c.requestedById : undefined,
              respondedById: isOwn ? c.respondedById : undefined,
              requestedAt: c.requestedAt,
              respondedAt: c.respondedAt,
              dueDate: isOwn ? c.dueDate : undefined,
              createdAt: c.createdAt,
              updatedAt: c.updatedAt,
              files: isOwn ? c.files : [],
              sellerName: isOwn ? (c.seller?.name || 'You') : `Bidder ${c.sellerId % 10 + 1}`
            };
          })
        : undefined,
    evaluations: isAdmin || isBuyerOwner ? bid.evaluations : undefined,
    awards: bid.awards
  };
};

export const serializeParticipation = (p: any, options: { canSeeFinancial?: boolean; bid?: any; ownView?: boolean } = {}) => {
  const bid = options.bid || p.bid;
  const rawQuoted = p.quotedAmount ?? p.totalAmount ?? p.responseData?.totalAmount ?? p.responseData?.quotedAmount ?? p.responseData?.totalPrice;
  const rawTotal = p.totalAmount ?? p.quotedAmount ?? p.responseData?.totalAmount ?? p.responseData?.quotedAmount ?? p.responseData?.totalPrice;

  return {
    id: p.id,
    bidId: p.bidId,
    sellerId: p.sellerId,
    seller: p.seller ? {
      id: p.seller.id,
      name: p.seller.name,
      email: p.seller.email,
      mobile: p.seller.mobile,
      role: p.seller.role,
      onboardingStatus: p.seller.onboardingStatus,
      organizationId: p.seller.organizationId,
      organization: p.seller.organization
    } : undefined,
    sellerName: p.sellerName,
    participationNumber: p.participationNumber,
    technicalStatus: p.technicalStatus,
    financialStatus: p.financialStatus,
    finalStatus: p.finalStatus,
    rank: p.rank,
    quotedAmount: moneyNumber(rawQuoted),
    gstPercentage: moneyNumber(p.gstPercentage || p.responseData?.gstPercentage),
    totalAmount: moneyNumber(rawTotal),
    financialSealed: false,
    financialMessage: undefined,
    makeBrand: p.makeBrand || p.responseData?.makeBrand,
    model: p.model || p.responseData?.model,
    offeredItemDescription: p.offeredItemDescription,
    responseData: p.responseData || p.acknowledgement,
    lineItems: p.lineItems || p.responseData?.lineItems || [],
    deliveryTimeline: p.deliveryTimeline || p.responseData?.deliveryTimeline,
    terms: p.terms || p.responseData?.terms,
    offeredQuantity: p.offeredQuantity || p.responseData?.offeredQuantity,
    submissionStatus: p.submissionStatus,
    submittedAt: p.submittedAt,
    technicalSubmittedAt: p.technicalSubmittedAt,
    financialSubmittedAt: p.financialSubmittedAt,
    createdAt: p.createdAt,
    updatedAt: p.updatedAt,
    isWithdrawn: p.isWithdrawn,
    rejectionReason: p.rejectionReason,
    documents: (p.documents || [])
      .map((doc: any) => ({
        id: doc.id,
        documentCategory: doc.documentCategory,
        documentName: doc.documentName,
        fileName: doc.fileName,
        fileUrl: doc.fileUrl || doc.url || null,
        fileKey: doc.fileKey || null,
        mimeType: doc.mimeType,
        fileSize: doc.fileSize,
        documentStatus: doc.documentStatus,
        uploadedAt: doc.uploadedAt,
        fileAssetId: doc.fileAssetId
      })),
    hasSealedFinancialQuote: false,
    clarifications: p.clarifications,
    evaluations: p.evaluations,
    awards: p.awards
  };
};

const getTenderBidActivityWhere = (query: any = {}) => {
  const where: any = {
    status: { in: ['published', 'bid_submission'] },
    bids: { some: { status: { not: 'withdrawn' }, withdrawnAt: null } }
  };

  if (query.status && !['OPEN', 'PUBLISHED', 'BID_SUBMISSION'].includes(String(query.status).toUpperCase())) {
    where.id = -1;
  }
  if (query.q) {
    const q = String(query.q);
    where.OR = [
      { title: { contains: q, mode: 'insensitive' } },
      { tenderId: { contains: q, mode: 'insensitive' } },
      { category: { contains: q, mode: 'insensitive' } },
      { description: { contains: q, mode: 'insensitive' } },
      { buyer: { name: { contains: q, mode: 'insensitive' } } }
    ];
  }
  if (query.category) where.category = { contains: String(query.category), mode: 'insensitive' };
  if (query.bidType && !String(query.bidType).toLowerCase().includes('tender')) where.id = -1;
  return where;
};

export const serializeTenderBidActivity = (tender: any) => {
  const profile = tender.buyer?.buyerProfile;
  const latestBid = tender.bids?.[0];
  const location = [profile?.city, profile?.state].filter(Boolean).join(', ');
  const closesAt = tender.closesAt || latestBid?.createdAt || tender.updatedAt || tender.createdAt;

  return {
    id: `TENDER-${tender.id}`,
    sourceModel: 'TENDER',
    sourceId: tender.id,
    bidNumber: tender.tenderId,
    title: tender.title,
    description: tender.description,
    buyerOrganizationName: profile?.organizationName || tender.buyer?.name || 'Verified buyer',
    buyerType: profile?.organizationType || 'Private Enterprise',
    category: tender.category,
    subCategory: null,
    bidType: 'Tender',
    procurementType: 'Tender Bid',
    quantity: null,
    unit: null,
    estimatedValue: moneyNumber(tender.budget),
    deliveryLocation: location || 'Location not specified',
    state: profile?.state || null,
    district: profile?.city || null,
    startDate: tender.publishedAt || tender.createdAt,
    endDate: closesAt,
    status: tender.status,
    approvalStatus: 'APPROVED',
    lifecycleStage: 'SELLER_PARTICIPATION',
    termsAndConditions: [],
    eligibilityCriteria: [],
    requiredDocuments: tender.documentUrl ? ['Tender specification document'] : [],
    createdAt: tender.createdAt,
    updatedAt: latestBid?.createdAt || tender.updatedAt,
    participantsCount: tender._count?.bids ?? 0,
    documents: tender.documentUrl ? [{
      id: `tender-doc-${tender.id}`,
      documentType: 'TENDER_DOCUMENT',
      fileName: tender.documentUrl.split('/').pop() || 'Tender document',
      mimeType: '',
      fileSize: 0,
      visibility: 'PUBLIC',
      fileAssetId: null,
      fileUrl: tender.documentUrl
    }] : []
  };
};

export const resolveTenderBidActivity = async (idOrNumber: string | number) => {
  const token = String(idOrNumber);
  const tenderId = token.startsWith('TENDER-') ? Number(token.replace('TENDER-', '')) : null;
  const where = tenderId ? { id: tenderId } : { tenderId: token };

  const tender = await db.tender.findFirst({
    where,
    select: {
      id: true,
      tenderId: true,
      title: true,
      description: true,
      category: true,
      budget: true,
      documentUrl: true,
      status: true,
      closesAt: true,
      publishedAt: true,
      createdAt: true,
      updatedAt: true,
      buyer: {
        select: {
          id: true,
          name: true,
          buyerProfile: { select: { organizationName: true, organizationType: true, city: true, state: true } }
        }
      },
      bids: {
        where: { status: { not: 'withdrawn' }, withdrawnAt: null },
        select: { createdAt: true },
        orderBy: { createdAt: 'desc' },
        take: 1
      },
      _count: { select: { bids: { where: { status: { not: 'withdrawn' }, withdrawnAt: null } } } }
    }
  });

  if (!tender) throw new ApiError(404, 'Tender opportunity not found', 'TENDER_NOT_FOUND');
  return serializeTenderBidActivity(tender);
};

export const assertSellerVerified = async (actor: Actor) => {
  if (actor.role !== 'seller') throw new ApiError(403, 'Only verified sellers/vendors can participate in bids.', 'FORBIDDEN_ROLE');
  const user = await db.user.findUnique({
    where: { id: actor.id },
    include: { sellerProfile: true, organization: true }
  });
  assertActiveAccount(user, 'Seller');
  if (user?.organization?.isBlacklisted) throw new ApiError(403, 'Seller organization is blocked for procurement participation.', 'SELLER_NOT_VERIFIED');
  const profileVerified = user?.isDualRole
    ? user?.sellerProfile?.verificationStatusEnum === 'VERIFIED'
    : user?.sellerProfile?.verificationStatusEnum === 'VERIFIED' || user?.sellerProfile?.panVerified || user?.sellerProfile?.isUdyamCertified;
  const orgVerified = user?.organization?.verificationStatus === 'VERIFIED';
  const legacyApproved = user?.isDualRole ? false : sellerVerifiedStatuses.includes(String(user?.onboardingStatus));
  if (!user || (!legacyApproved && !profileVerified && !orgVerified)) {
    throw new ApiError(403, 'Please complete seller verification before participating in bids.', 'SELLER_NOT_VERIFIED');
  }
};

export const assertBuyerVerified = async (actor: Actor) => {
  if (actor.role !== 'buyer') throw new ApiError(403, 'Buyer access required', 'FORBIDDEN_ROLE');
  const user = await db.user.findUnique({
    where: { id: actor.id },
    include: { buyerProfile: true, organization: true }
  });
  assertActiveAccount(user, 'Buyer');
  if (user?.organization?.isBlacklisted) throw new ApiError(403, 'Buyer organization is blocked for procurement publishing.', 'BUYER_NOT_VERIFIED');
  const orgVerified = user?.organization ? verifiedOrganizationStatuses.includes(String(user.organization.verificationStatus)) : false;
  const profileVerified = user?.buyerProfile?.verificationStatusEnum === 'VERIFIED' || user?.buyerProfile?.verificationStatus === 'VERIFIED';
  const legacyApproved = user?.isDualRole ? false : sellerVerifiedStatuses.includes(String(user?.onboardingStatus));
  if (!user || (!orgVerified && !profileVerified && !legacyApproved)) {
    throw new ApiError(403, 'Buyer organization must be verified before submitting bids for admin approval.', 'BUYER_NOT_VERIFIED');
  }
  return user;
};

export const assertBidOpen = (bid: any) => {
  if (bid.status !== 'OPEN') throw new ApiError(400, 'This bid is not open for participation.', 'BID_NOT_OPEN');
  if (new Date(bid.endDate) <= now()) throw new ApiError(400, 'This bid is already closed.', 'BID_ALREADY_CLOSED');
};

export const assertBuyerOwner = (actor: Actor, bid: any) => {
  if (actor.role !== 'buyer' && actor.role !== 'admin' && actor.role !== 'master_admin') {
    throw new ApiError(403, 'Buyer access required', 'FORBIDDEN_ROLE');
  }
  if (actor.role === 'buyer' && bid.buyerId !== Number(actor.id)) {
    throw new ApiError(403, 'You cannot access another buyer bid.', 'FORBIDDEN_ROLE');
  }
};

export const listPublicBids = async (query: any, actor?: any) => {
  const page = Math.max(1, Number(query.page || 1));
  const pageSize = Math.min(500, Math.max(1, Number(query.pageSize || 12)));
  const takeForMergedPage = page * pageSize;
  const actorInviteIds = actor?.role === 'seller'
    ? [Number(actor.id), Number(actor.organizationId)].filter(Number.isFinite)
    : [];
  // Fallback for rows created before the invitation table existed / not yet backfilled:
  // still honour invited sellers embedded in the technicalPacket JSON.
  const invitedBidFilters = actorInviteIds.flatMap(value => ([
    { technicalPacket: { path: ['vendors', 'invitedSellers'], array_contains: value } },
    { technicalPacket: { path: ['qualifiedVendors'], array_contains: value } }
  ]));

  // A bid is "private" when visibility=PRIVATE OR (for legacy rows with the default
  // PUBLIC value) its method is a restricted method. This mirrors isPrivateBid().
  const privateBidPredicate = {
    OR: [
      { visibility: 'PRIVATE' as const },
      { procurementType: { in: restrictedProcurementMethods } },
      { bidType: { in: restrictedProcurementMethods } }
    ]
  };
  const publicBidPredicate = {
    visibility: 'PUBLIC' as const,
    NOT: {
      OR: [
        { procurementType: { in: restrictedProcurementMethods } },
        { bidType: { in: restrictedProcurementMethods } }
      ]
    }
  };

  const restrictedBidsCondition = actor
    ? (actor.role === 'admin' || actor.role === 'master_admin')
      ? {}
      : {
          OR: [
            // Public bids are visible to everyone.
            publicBidPredicate,
            // Private bids the seller was invited to (relational — the reliable path).
            ...(actor.role === 'seller' ? [{
              AND: [
                privateBidPredicate,
                { invitations: { some: { OR: [{ sellerOrgId: { in: actorInviteIds } }, { sellerUserId: { in: actorInviteIds } }] } } }
              ]
            }] : []),
            // Legacy JSON-embedded invitations (un-backfilled rows).
            ...invitedBidFilters,
            // The buyer's own private bids.
            {
              buyerId: actor.id,
              ...privateBidPredicate
            },
            // Bids the seller already participated in.
            {
              participations: {
                some: { sellerId: actor.id }
              }
            }
          ]
        }
    : publicBidPredicate;

  const where: any = {
    approvalStatus: { in: ['APPROVED', 'PENDING'] },
    status: { in: query.status ? [String(query.status).toUpperCase()] : publicBidStatuses },
    ...restrictedBidsCondition
  };
  if (query.q) {
    const q = String(query.q);
    where.OR = [
      { title: { contains: q, mode: 'insensitive' } },
      { bidNumber: { contains: q, mode: 'insensitive' } },
      { category: { contains: q, mode: 'insensitive' } },
      { buyerOrganizationName: { contains: q, mode: 'insensitive' } },
      { district: { contains: q, mode: 'insensitive' } },
      { state: { contains: q, mode: 'insensitive' } }
    ];
  }
  if (query.category) where.category = { contains: String(query.category), mode: 'insensitive' };
  if (query.location) where.OR = [...(where.OR || []), { district: { contains: String(query.location), mode: 'insensitive' } }, { state: { contains: String(query.location), mode: 'insensitive' } }];
  if (query.buyerType) where.buyerType = { contains: String(query.buyerType), mode: 'insensitive' };
  if (query.bidType) where.bidType = { contains: String(query.bidType), mode: 'insensitive' };

  const tenderWhere = getTenderBidActivityWhere(query);
  const [procurementTotal, tenderTotal, bids, tenderBidActivities] = await Promise.all([
    db.procurementBid.count({ where }),
    db.tender.count({ where: tenderWhere }),
    db.procurementBid.findMany({
      where,
      include: {
        documents: true,
        buyerOrganization: true,
        participations: { select: { id: true } },
        awards: true,
        invitations: { select: { sellerOrgId: true, sellerUserId: true } },
        buyer: {
          select: {
            id: true,
            name: true,
            email: true,
            role: true,
            buyerProfile: {
              select: {
                departmentName: true
              }
            }
          }
        }
      },
      orderBy: query.sort === 'value' ? { estimatedValue: 'desc' } : { endDate: 'asc' },
      take: takeForMergedPage
    }),
    db.tender.findMany({
      where: tenderWhere,
      select: {
        id: true,
        tenderId: true,
        title: true,
        description: true,
        category: true,
        budget: true,
        documentUrl: true,
        status: true,
        closesAt: true,
        publishedAt: true,
        createdAt: true,
        updatedAt: true,
        buyer: {
          select: {
            id: true,
            name: true,
            buyerProfile: { select: { organizationName: true, organizationType: true, city: true, state: true } }
          }
        },
        bids: {
          where: { status: { not: 'withdrawn' }, withdrawnAt: null },
          select: { createdAt: true },
          orderBy: { createdAt: 'desc' },
          take: 1
        },
        _count: { select: { bids: { where: { status: { not: 'withdrawn' }, withdrawnAt: null } } } }
      },
      orderBy: { updatedAt: 'desc' },
      take: takeForMergedPage
    })
  ]);

  const items = [
    ...bids.map((bid: any) => ({
      ...serializeBid(bid),
      sourceModel: 'PROCUREMENT_BID',
      sourceId: bid.id,
      // Emit whether THIS seller was explicitly invited (relational rows or legacy
      // technicalPacket JSON). The invitations page filters on this flag.
      isInvited: actorInviteIds.length > 0 && (
        (bid.invitations || []).some((inv: any) =>
          actorInviteIds.includes(Number(inv.sellerOrgId)) || actorInviteIds.includes(Number(inv.sellerUserId))
        ) ||
        (() => {
          const tp: any = bid.technicalPacket;
          const embedded = [
            ...(Array.isArray(tp?.vendors?.invitedSellers) ? tp.vendors.invitedSellers : []),
            ...(Array.isArray(tp?.qualifiedVendors) ? tp.qualifiedVendors : [])
          ].map(Number);
          return embedded.some(v => actorInviteIds.includes(v));
        })()
      )
    })),
    ...tenderBidActivities.map(serializeTenderBidActivity)
  ]
    .sort((a: any, b: any) => {
      if (query.sort === 'value') return Number(b.estimatedValue || 0) - Number(a.estimatedValue || 0);
      return new Date(a.endDate || a.updatedAt || a.createdAt).getTime() - new Date(b.endDate || b.updatedAt || b.createdAt).getTime();
    })
    .slice((page - 1) * pageSize, page * pageSize);

  return { items, total: procurementTotal + tenderTotal, page, pageSize };
};

export const createBuyerBid = async (req: AuthRequest, body: any) => {
  if (req.user!.role !== 'buyer') throw new ApiError(403, 'Buyer access required', 'FORBIDDEN_ROLE');
  const user = await db.user.findUnique({ where: { id: req.user!.id }, include: { buyerProfile: true, organization: true } });
  assertActiveAccount(user, 'Buyer');
  const bid = await db.procurementBid.create({
    data: {
      bidNumber: await nextBidNumber(),
      title: body.title,
      description: body.description,
      buyerId: req.user!.id,
      buyerOrganizationId: user?.organizationId || user?.buyerProfile?.organizationId,
      buyerOrganizationName: body.buyerOrganizationName || user?.organization?.organizationName || user?.buyerProfile?.organizationName || user?.name || 'Buyer organization',
      buyerType: body.buyerType,
      category: body.category,
      subCategory: body.subCategory,
      bidType: body.bidType,
      procurementType: body.procurementType,
      quantity: body.quantity,
      unit: body.unit,
      estimatedValue: body.estimatedValue,
      deliveryLocation: body.deliveryLocation,
      state: body.state,
      district: body.district,
      pincode: body.pincode,
      startDate: body.startDate,
      endDate: body.endDate,
      technicalOpeningDate: body.technicalOpeningDate,
      financialOpeningDate: body.financialOpeningDate,
      bidValidityDate: body.bidValidityDate,
      evaluationMethod: body.evaluationMethod || 'L1',
      isEmdRequired: Boolean(body.isEmdRequired),
      emdAmount: body.emdAmount,
      documentFee: body.documentFee,
      allowClarification: body.allowClarification ?? true,
      allowReverseAuction: Boolean(body.allowReverseAuction),
      allowBoq: Boolean(body.allowBoq),
      packetType: body.packetType || 'SINGLE_PACKET',
      visibility: deriveVisibility(body) as any,
      technicalPacket: body.technicalPacket,
      financialPacket: body.financialPacket,
      termsAndConditions: body.termsAndConditions || [],
      eligibilityCriteria: body.eligibilityCriteria || [],
      requiredDocuments: body.requiredDocuments || []
    }
  });
  await syncBidInvitations(bid.id, body.technicalPacket, req.user!.id);
  await procurementAudit(req, 'BID_CREATED', 'ProcurementBid', bid.id, bid);
  return bid;
};

export const updateBuyerBid = async (req: AuthRequest, bidId: string, body: any) => {
  const bid = await resolveBid(bidId, { participations: true });
  assertBuyerOwner(req.user!, bid);
  
  const isPublished = ['PUBLISHED', 'OPEN', 'OPEN_FOR_BIDDING'].includes(String(bid.status).toUpperCase());
  
  if (!isPublished && !editableBidStatuses.includes(bid.status) && !editableApprovalStatuses.includes(bid.approvalStatus)) {
    throw new ApiError(400, 'Only draft, rejected or published bids can be edited.', 'INVALID_STATUS_TRANSITION');
  }

  // Recompute visibility whenever the method or vendor selection could have changed,
  // using the incoming values falling back to the persisted ones.
  const visibility = deriveVisibility({
    procurementType: body.procurementType ?? bid.procurementType,
    bidType: body.bidType ?? bid.bidType,
    technicalPacket: body.technicalPacket ?? bid.technicalPacket
  });
  body = { ...body, visibility };

  let updated;
  if (isPublished) {
    const nextVersion = (bid.version || 1) + 1;
    updated = await db.$transaction(async (tx: any) => {
      const bidUpdated = await tx.procurementBid.update({
        where: { id: bid.id },
        data: {
          ...body,
          version: nextVersion
        }
      });

      const submittedParticipations = await tx.procurementBidParticipation.findMany({
        where: {
          bidId: bid.id,
          submissionStatus: 'SUBMITTED'
        }
      });

      for (const p of submittedParticipations) {
        await tx.procurementBidParticipation.update({
          where: { id: p.id },
          data: {
            submissionStatus: 'DRAFT',
            rejectionReason: `REQUIRES_RESUBMISSION: RFQ/Tender amended to V${nextVersion}`
          }
        });

        try {
          await notificationService.notifyUser(p.sellerId, {
            title: 'Procurement Amendment Notification',
            message: `The procurement opportunity "${bid.title}" has been amended to V${nextVersion}. Your previous bid has been marked as draft. Please review and resubmit.`,
            type: 'tender.amendment',
            redirectUrl: `/seller/procurement/events/${bid.id}`
          }, ['in_app', 'email']);
        } catch (err) {
          logger.warn({ err, sellerId: p.sellerId }, 'Failed to send amendment notification');
        }
      }

      return bidUpdated;
    });
  } else {
    updated = await db.procurementBid.update({ where: { id: bid.id }, data: body });
  }

  if (body.technicalPacket !== undefined) {
    await syncBidInvitations(bid.id, body.technicalPacket, req.user!.id);
  }

  await procurementAudit(req, 'BID_UPDATED', 'ProcurementBid', bid.id, updated, bid);

  const newEndDate = body.endDate ? new Date(body.endDate) : null;
  const oldEndDate = bid.endDate ? new Date(bid.endDate) : null;
  if (newEndDate && oldEndDate && newEndDate.getTime() > oldEndDate.getTime()) {
    const participations = await db.procurementBidParticipation.findMany({
      where: { bidId: bid.id }
    });
    for (const p of participations) {
      try {
        await notificationService.notifyUser(p.sellerId, {
          title: 'Submission Deadline Extended',
          message: `The submission deadline for "${bid.title}" has been extended to ${newEndDate.toLocaleString()}.`,
          type: 'tender.deadline_extended',
          redirectUrl: `/seller/procurement/events/${bid.id}`
        }, ['in_app', 'email']);
      } catch (err) {
        logger.warn({ err, sellerId: p.sellerId }, 'Failed to send deadline extension notification');
      }
    }
  }

  return updated;
};

export const uploadBuyerBidDocument = async (req: AuthRequest & { file?: Express.Multer.File }, bidId: string, body: any) => {
  const bid = await resolveBid(bidId, {});
  assertBuyerOwner(req.user!, bid);
  if (!editableBidStatuses.includes(bid.status) && !editableApprovalStatuses.includes(bid.approvalStatus)) {
    throw new ApiError(400, 'Documents can be uploaded only while the bid is draft or pending approval.', 'INVALID_STATUS_TRANSITION');
  }
  if (!req.file) throw new ApiError(400, 'File is required', 'FILE_REQUIRED');

  const asset = await uploadFile(req.file, {
    ownerId: req.user!.id,
    ownerRole: req.user!.role,
    entityType: 'procurement_bid',
    entityId: bid.id,
    purpose: String(body.documentType || 'BID_DOCUMENT'),
    ipAddress: req.ip,
    userAgent: req.headers['user-agent']
  }, env.STORAGE_PROVIDER);

  const doc = await db.procurementBidDocument.create({
    data: {
      bidId: bid.id,
      documentType: String(body.documentType || 'BID_DOCUMENT'),
      fileAssetId: asset.id,
      fileName: asset.originalName,
      fileUrl: asset.url,
      fileKey: asset.key,
      mimeType: asset.mimeType,
      fileSize: asset.size,
      uploadedById: req.user!.id,
      visibility: body.visibility || 'PUBLIC'
    }
  });

  await procurementAudit(req, 'BID_DOCUMENT_UPLOADED', 'ProcurementBidDocument', doc.id, doc);
  return doc;
};

export const isAdminBidApprovalRequired = async (companyId: number | null): Promise<boolean> => {
  if (!companyId) return true;
  const feature = await db.companyFeature.findFirst({
    where: {
      companyId,
      feature: { code: 'admin-bid-approval' }
    }
  });
  if (feature && feature.enabled === false) {
    return false;
  }
  return true;
};

export const submitForApproval = async (req: AuthRequest, bidId: string) => {
  const bid = await resolveBid(bidId, {});
  assertBuyerOwner(req.user!, bid);
  await assertBuyerVerified(req.user!);
  if (!editableBidStatuses.includes(bid.status) && !editableApprovalStatuses.includes(bid.approvalStatus)) {
    throw new ApiError(400, 'Only draft or rejected bids can be submitted for approval.', 'INVALID_STATUS_TRANSITION');
  }

  const isApprovalRequired = await isAdminBidApprovalRequired(req.user!.companyId);
  if (!isApprovalRequired) {
    const openNow = new Date(bid.startDate) <= now() && new Date(bid.endDate) > now();
    assertBidTransition(bid.status, openNow ? 'OPEN' : 'APPROVED');
    const updated = await db.procurementBid.update({
      where: { id: bid.id },
      data: {
        approvalStatus: 'APPROVED',
        status: openNow ? 'OPEN' : 'APPROVED',
        lifecycleStage: openNow ? 'SELLER_PARTICIPATION' : 'BID_PUBLISHED',
        approvedById: req.user!.id,
        approvedAt: now(),
        rejectedReason: null
      }
    });
    await procurementAudit(req, 'BID_APPROVED', 'ProcurementBid', bid.id, updated, bid);
    if (openNow) await procurementAudit(req, 'BID_PUBLISHED', 'ProcurementBid', bid.id, { status: 'OPEN' }, bid);
    if (openNow) {
      try {
        await notificationService.notifyUser(req.user!.id, {
          title: 'Bid Published',
          message: `Your procurement "${bid.title}" is now open for submissions.`,
          type: 'bid.published',
          redirectUrl: `/buyer/procurement/events/${bid.id}`
        }, ['in_app', 'email']);
      } catch (err) {
        logger.warn({ err }, 'Failed to send publish notification');
      }
    }
    return updated;
  }

  assertBidTransition(bid.status, 'PENDING_ADMIN_APPROVAL');
  const updated = await db.procurementBid.update({
    where: { id: bid.id },
    data: { status: 'PENDING_ADMIN_APPROVAL', approvalStatus: 'PENDING' }
  });
  await procurementAudit(req, 'BID_SUBMITTED_FOR_APPROVAL', 'ProcurementBid', bid.id, updated, bid);
  try {
    const admins = await db.user.findMany({ where: { role: 'admin' }, select: { id: true } });
    for (const admin of admins) {
      await notificationService.notifyUser(admin.id, {
        title: 'Bid Pending Approval',
        message: `Procurement "${bid.title}" submitted for admin approval.`,
        type: 'bid.pending_approval',
        redirectUrl: `/admin/bids/${bid.id}`
      }, ['in_app', 'email']);
    }
  } catch (err) {
    logger.warn({ err }, 'Failed to send admin approval notification');
  }
  return updated;
};


export const approveBid = async (req: AuthRequest, bidId: string) => {
  const bid = await resolveBid(bidId, {});
  if (!['PENDING', 'REJECTED'].includes(bid.approvalStatus)) throw new ApiError(400, 'Only pending bids can be approved.', 'INVALID_STATUS_TRANSITION');
  const openNow = new Date(bid.startDate) <= now() && new Date(bid.endDate) > now();
  assertBidTransition(bid.status, openNow ? 'OPEN' : 'APPROVED');
  const updated = await db.procurementBid.update({
    where: { id: bid.id },
    data: {
      approvalStatus: 'APPROVED',
      status: openNow ? 'OPEN' : 'APPROVED',
      lifecycleStage: openNow ? 'SELLER_PARTICIPATION' : 'BID_PUBLISHED',
      approvedById: req.user!.id,
      approvedAt: now(),
      rejectedReason: null
    }
  });
  await procurementAudit(req, 'BID_APPROVED', 'ProcurementBid', bid.id, updated, bid);
  if (openNow) await procurementAudit(req, 'BID_PUBLISHED', 'ProcurementBid', bid.id, { status: 'OPEN' }, bid);
  try {
    if (openNow) {
      const invitations = await db.procurementBidInvitation.findMany({ where: { bidId: bid.id }, include: { bid: true } });
      for (const inv of invitations) {
        const targetId = inv.sellerUserId ?? inv.sellerOrgId;
        if (targetId) {
          await notificationService.notifyUser(targetId, {
            title: 'New Bidding Opportunity',
            message: `You have been invited to bid on "${bid.title}".`,
            type: 'bid.invitation',
            redirectUrl: `/seller/procurement/events/${bid.id}`
          }, ['in_app', 'email']);
        }
      }
    }
    await notificationService.notifyUser(bid.buyerId, {
      title: openNow ? 'Bid Published' : 'Bid Approved',
      message: `Your procurement "${bid.title}" has been ${openNow ? 'published and is open for submissions' : 'approved by admin'}.`,
      type: 'bid.approved',
      redirectUrl: `/buyer/procurement/events/${bid.id}`
    }, ['in_app', 'email']);
  } catch (err) {
    logger.warn({ err }, 'Failed to send approval notification');
  }
  return updated;
};

export const rejectBid = async (req: AuthRequest, bidId: string, reason: string) => {
  const bid = await resolveBid(bidId, {});
  if (bid.status !== 'PENDING_ADMIN_APPROVAL') throw new ApiError(400, 'Only bids pending admin approval can be rejected.', 'INVALID_STATUS_TRANSITION');
  assertBidTransition(bid.status, 'DRAFT');
  const updated = await db.procurementBid.update({
    where: { id: bid.id },
    data: { approvalStatus: 'REJECTED', status: 'DRAFT', rejectedReason: reason, approvedById: req.user!.id, approvedAt: now() }
  });
  await procurementAudit(req, 'BID_REJECTED', 'ProcurementBid', bid.id, updated, bid);
  try {
    await notificationService.notifyUser(bid.buyerId, {
      title: 'Bid Rejected',
      message: `Your procurement "${bid.title}" was rejected by admin. Reason: ${reason}`,
      type: 'bid.rejected',
      redirectUrl: `/buyer/procurement/events/${bid.id}`
    }, ['in_app', 'email']);
  } catch (err) {
    logger.warn({ err }, 'Failed to send rejection notification');
  }
  return updated;
};

export const startParticipation = async (req: AuthRequest, bidId: string) => {
  await assertSellerVerified(req.user!);
  const bid = await resolveBid(bidId, {});
  assertBidOpen(bid);
  if (isRestrictedBidMethod(bid) && !isActorInvitedToBid(req.user!, bid)) {
    throw new ApiError(404, 'Bid not found', 'BID_NOT_FOUND');
  }

  const whereClause: any = { bidId: bid.id };
  if (req.user!.organizationId) {
    whereClause.OR = [
      { sellerId: req.user!.id },
      { seller: { organizationId: req.user!.organizationId } }
    ];
  } else {
    whereClause.sellerId = req.user!.id;
  }

  const existingParticipation = await db.procurementBidParticipation.findFirst({
    where: whereClause
  });
  if (existingParticipation) {
    throw new ApiError(409, 'You or your organization have already participated in this bid.', 'DUPLICATE_PARTICIPATION');
  }

  try {
    const participation = await db.procurementBidParticipation.create({
      data: {
        bidId: bid.id,
        sellerId: req.user!.id,
        participationNumber: await nextParticipationNumber(bid.bidNumber),
        financialStatus: 'LOCKED'
      }
    });
    await procurementAudit(req, 'BID_PARTICIPATED', 'ProcurementBidParticipation', participation.id, participation);
    try {
      const seller = await db.user.findUnique({ where: { id: req.user!.id }, select: { name: true } });
      await notificationService.notifyUser(bid.buyerId, {
        title: 'New Bid Participation',
        message: `Seller "${seller?.name || 'Unknown'}" started participating in "${bid.title}".`,
        type: 'bid.participation',
        redirectUrl: `/buyer/procurement/events/${bid.id}`
      }, ['in_app']);
    } catch (err) {
      logger.warn({ err }, 'Failed to send participation notification');
    }
    return participation;
  } catch (error: any) {
    if (error?.code === 'P2002') throw new ApiError(409, 'You have already participated in this bid.', 'DUPLICATE_PARTICIPATION');
    throw error;
  }
};

export const assertOwnParticipation = async (req: AuthRequest, bidId: string, participationId: number) => {
  const bid = await resolveBid(bidId, {});
  const participation = await db.procurementBidParticipation.findUnique({
    where: { id: participationId },
    include: { bid: true, documents: true, clarifications: { include: { files: true } }, evaluations: true, awards: true }
  });
  if (!participation || participation.bidId !== bid.id) throw new ApiError(404, 'Participation not found', 'PARTICIPATION_NOT_FOUND');
  if (req.user!.role !== 'admin' && req.user!.role !== 'master_admin' && participation.sellerId !== req.user!.id && bid.buyerId !== req.user!.id) {
    throw new ApiError(403, 'You cannot access this participation.', 'FORBIDDEN_ROLE');
  }
  return { bid, participation };
};

export const uploadParticipationDocument = async (req: AuthRequest & { file?: Express.Multer.File }, bidId: string, participationId: number, category: string) => {
  const { bid, participation } = await assertOwnParticipation(req, bidId, participationId);
  if (participation.sellerId !== req.user!.id) throw new ApiError(403, 'Only the owner seller can upload documents.', 'FORBIDDEN_ROLE');
  if (participation.submissionStatus === 'SUBMITTED') throw new ApiError(400, 'Participation has already been submitted.', 'PARTICIPATION_ALREADY_SUBMITTED');
  assertBidOpen(bid);
  if (!req.file) throw new ApiError(400, 'File is required', 'FILE_REQUIRED');
  const fileEntityType = category === 'FINANCIAL_QUOTE' ? 'procurement_financial_quote' : 'procurement_bid_participation';
  const asset = await uploadFile(req.file, {
    ownerId: req.user!.id,
    ownerRole: req.user!.role,
    entityType: fileEntityType,
    entityId: participation.id,
    purpose: category,
    ipAddress: req.ip,
    userAgent: req.headers['user-agent']
  }, env.STORAGE_PROVIDER);

  const doc = await db.procurementBidParticipationDocument.create({
    data: {
      participationId: participation.id,
      bidId: bid.id,
      sellerId: req.user!.id,
      documentCategory: category,
      documentName: String(req.body.documentName || category),
      fileAssetId: asset.id,
      fileName: asset.originalName,
      fileUrl: asset.url,
      fileKey: asset.key,
      mimeType: asset.mimeType,
      fileSize: asset.size
    }
  });

  if (category !== 'FINANCIAL_QUOTE') {
    await db.procurementBidParticipation.update({
      where: { id: participation.id },
      data: { submissionStatus: 'TECHNICAL_DOCUMENTS_UPLOADED' }
    });
  }
  await procurementAudit(req, category === 'FINANCIAL_QUOTE' ? 'FINANCIAL_DOC_UPLOADED' : 'TECHNICAL_DOC_UPLOADED', 'ProcurementBidParticipationDocument', doc.id, doc);
  return doc;
};

export const saveFinancialQuote = async (req: AuthRequest & { file?: Express.Multer.File }, bidId: string, participationId: number, body: any) => {
  const { bid, participation } = await assertOwnParticipation(req, bidId, participationId);
  if (participation.sellerId !== req.user!.id) throw new ApiError(403, 'Only the owner seller can upload financial quote.', 'FORBIDDEN_ROLE');
  if (participation.submissionStatus === 'SUBMITTED') throw new ApiError(400, 'Participation has already been submitted.', 'PARTICIPATION_ALREADY_SUBMITTED');
  assertBidOpen(bid);
  let doc = null;
  if (req.file) {
    doc = await uploadParticipationDocument(req, bidId, participationId, 'FINANCIAL_QUOTE');
  }
  const quoted = Number(body.quotedAmount);
  const gst = Number(body.gstPercentage || 0);
  const total = Number(body.totalAmount || quoted + (quoted * gst / 100));
  const updated = await db.procurementBidParticipation.update({
    where: { id: participation.id },
    data: {
      quotedAmount: quoted,
      gstPercentage: gst,
      totalAmount: total,
      makeBrand: body.makeBrand,
      model: body.model,
      offeredItemDescription: body.offeredItemDescription,
      financialStatus: 'NOT_OPENED',
      submissionStatus: 'FINANCIAL_QUOTE_UPLOADED',
      financialSubmittedAt: now()
    }
  });
  await procurementAudit(req, 'FINANCIAL_DOC_UPLOADED', 'ProcurementBidParticipation', updated.id, { ...updated, quotedAmount: 'MASKED' });
  return { participation: serializeParticipation(updated), document: doc };
};

export const finalSubmitParticipation = async (req: AuthRequest, bidId: string, participationId: number, body: any = {}) => {
  const { bid, participation } = await assertOwnParticipation(req, bidId, participationId);
  if (participation.sellerId !== req.user!.id) throw new ApiError(403, 'Only the owner seller can submit.', 'FORBIDDEN_ROLE');
  if (participation.submissionStatus === 'SUBMITTED') throw new ApiError(400, 'Participation has already been submitted.', 'PARTICIPATION_ALREADY_SUBMITTED');
  assertBidOpen(bid);
  const docs = participation.documents || [];
  if (!docs.some((doc: any) => doc.documentCategory !== 'FINANCIAL_QUOTE')) {
    throw new ApiError(400, 'Please upload technical documents before final submission.', 'REQUIRED_DOCUMENT_MISSING');
  }
  if (!participation.quotedAmount || !docs.some((doc: any) => doc.documentCategory === 'FINANCIAL_QUOTE')) {
    throw new ApiError(400, 'Please upload financial quote before final submission.', 'REQUIRED_DOCUMENT_MISSING');
  }
  // Enforce the buyer-defined required-document checklist: the seller must map an
  // uploaded file to every named document the buyer listed at publish time.
  const requiredDocs: string[] = Array.isArray(bid.requiredDocuments) ? bid.requiredDocuments.filter(Boolean) : [];
  if (requiredDocs.length) {
    const uploadedNames = new Set(
      docs.map((doc: any) => String(doc.documentName || '').trim().toLowerCase()).filter(Boolean)
    );
    const missing = requiredDocs.filter(name => !uploadedNames.has(String(name).trim().toLowerCase()));
    if (missing.length) {
      throw new ApiError(
        400,
        `Missing required documents: ${missing.join(', ')}. Upload each listed document before final submission.`,
        'REQUIRED_DOCUMENT_MISSING',
        { missingDocuments: missing }
      );
    }
  }
  // Enforce acknowledgement of buyer terms & eligibility criteria when the buyer published any.
  const hasConditions = (bid.termsAndConditions || []).length > 0 || (bid.eligibilityCriteria || []).length > 0;
  if (hasConditions && body.acceptedTerms !== true) {
    throw new ApiError(400, 'You must accept the buyer terms & conditions and confirm eligibility before submitting.', 'TERMS_NOT_ACCEPTED');
  }
  const ack = {
    acknowledgementId: `ACK-BP-${participation.id}-${Date.now()}`,
    responseId: participation.participationNumber,
    timestamp: new Date().toISOString(),
    message: 'Participation submitted successfully.',
    acceptedTerms: body.acceptedTerms === true,
    acceptedTermsAt: body.acceptedTerms === true ? new Date().toISOString() : undefined
  };
  const updated = await db.procurementBidParticipation.update({
    where: { id: participation.id },
    data: {
      submissionStatus: 'SUBMITTED',
      technicalStatus: 'UNDER_REVIEW',
      submittedAt: now(),
      technicalSubmittedAt: now(),
      acknowledgement: ack
    }
  });
  await procurementAudit(req, 'PARTICIPATION_SUBMITTED', 'ProcurementBidParticipation', updated.id, updated);
  try {
    const seller = await db.user.findUnique({ where: { id: req.user!.id }, select: { name: true } });
    await notificationService.notifyUser(bid.buyerId, {
      title: 'Bid Submitted',
      message: `Seller "${seller?.name || 'Unknown'}" submitted their bid for "${bid.title}".`,
      type: 'bid.submitted',
      redirectUrl: `/buyer/procurement/events/${bid.id}`
    }, ['in_app', 'email']);
  } catch (err) {
    logger.warn({ err }, 'Failed to send bid submission notification');
  }
  return updated;
};

export const askClarification = async (req: AuthRequest, bidId: string, body: any) => {
  const bid = await resolveBid(bidId, {});
  assertBuyerOwner(req.user!, bid);
  if (!technicalEvaluationStatuses.includes(bid.status)) throw new ApiError(400, 'Clarifications are allowed only during technical evaluation.', 'INVALID_STATUS_TRANSITION');
  const participation = await db.procurementBidParticipation.findUnique({ where: { id: Number(body.participationId) } });
  if (!participation || participation.bidId !== bid.id) throw new ApiError(404, 'Participation not found', 'PARTICIPATION_NOT_FOUND');
  const clarification = await db.procurementBidClarification.create({
    data: {
      bidId: bid.id,
      participationId: participation.id,
      sellerId: participation.sellerId,
      buyerId: bid.buyerId,
      requestNumber: await nextClarificationNumber(bid.bidNumber),
      clarificationType: body.clarificationType,
      question: body.question,
      requestedById: req.user!.id,
      dueDate: body.dueDate
    }
  });
  await db.procurementBidParticipation.update({ where: { id: participation.id }, data: { technicalStatus: 'CLARIFICATION_REQUIRED' } });
  await procurementAudit(req, 'CLARIFICATION_REQUESTED', 'ProcurementBidClarification', clarification.id, clarification);
  return clarification;
};

export const respondClarification = async (req: AuthRequest & { file?: Express.Multer.File }, bidId: string, clarificationId: number, response: string) => {
  const bid = await resolveBid(bidId, {});
  const clarification = await db.procurementBidClarification.findUnique({ where: { id: clarificationId }, include: { files: true } });
  if (!clarification || clarification.bidId !== bid.id) throw new ApiError(404, 'Clarification not found', 'CLARIFICATION_NOT_FOUND');
  if (clarification.sellerId !== req.user!.id) throw new ApiError(403, 'Only the owner seller can respond.', 'FORBIDDEN_ROLE');
  const updated = await db.procurementBidClarification.update({
    where: { id: clarification.id },
    data: { response, status: 'RESPONDED', respondedById: req.user!.id, respondedAt: now() }
  });
  let fileRecord = null;
  if (req.file) {
    const asset = await uploadFile(req.file, {
      ownerId: req.user!.id,
      ownerRole: req.user!.role,
      entityType: 'procurement_bid_clarification',
      entityId: clarification.id,
      purpose: 'clarification_response',
      ipAddress: req.ip,
      userAgent: req.headers['user-agent']
    }, env.STORAGE_PROVIDER);
    fileRecord = await db.procurementBidClarificationFile.create({
      data: {
        clarificationId: clarification.id,
        fileAssetId: asset.id,
        fileName: asset.originalName,
        fileUrl: asset.url,
        fileKey: asset.key,
        mimeType: asset.mimeType,
        fileSize: asset.size,
        uploadedById: req.user!.id
      }
    });
  }
  await procurementAudit(req, 'CLARIFICATION_RESPONDED', 'ProcurementBidClarification', clarification.id, updated);
  return { clarification: updated, file: fileRecord };
};

export const sellerAskClarification = async (req: AuthRequest, bidId: string, question: string) => {
  const bid = await resolveBid(bidId, { participations: { where: { sellerId: req.user!.id } } });
  if (!bid.allowClarification) throw new ApiError(400, 'Clarifications are not enabled for this procurement.', 'CLARIFICATIONS_DISABLED');
  
  const allowedStatuses = ['PUBLISHED', 'OPEN', 'OPEN_FOR_BIDDING'];
  if (!allowedStatuses.includes(bid.status)) {
    throw new ApiError(400, 'Questions can only be asked when the bidding opportunity is open.', 'INVALID_BID_STATUS');
  }

  let participation = bid.participations?.[0];
  if (!participation) {
    participation = await startParticipation(req, bidId);
  }

  const clarification = await db.procurementBidClarification.create({
    data: {
      bidId: bid.id,
      participationId: participation.id,
      sellerId: req.user!.id,
      buyerId: bid.buyerId,
      requestNumber: await nextClarificationNumber(bid.bidNumber),
      clarificationType: 'SELLER_QUERY',
      question,
      status: 'PENDING',
      requestedById: req.user!.id
    }
  });

  try {
    await notificationService.notifyUser(bid.buyerId, {
      title: 'New Clarification Question',
      message: `A seller asked a clarification question on opportunity "${bid.title}".`,
      type: 'tender.clarification_received',
      redirectUrl: `/buyer/procurement/events/${bid.id}`
    }, ['in_app', 'email']);
  } catch (err) {
    logger.warn({ err, buyerId: bid.buyerId }, 'Failed to send clarification notification');
  }

  await procurementAudit(req, 'CLARIFICATION_ASKED', 'ProcurementBidClarification', clarification.id, clarification);
  return clarification;
};

export const evaluateTechnical = async (req: AuthRequest, bidId: string, body: any) => {
  const bid = await resolveBid(bidId, {});
  assertBuyerOwner(req.user!, bid);
  if (!technicalEvaluationStatuses.includes(bid.status)) throw new ApiError(400, 'Technical evaluation can start only after bid closes.', 'INVALID_STATUS_TRANSITION');
  const updatedRows = await db.$transaction(async (tx: any) => {
    if (bid.status !== 'TECHNICAL_EVALUATION') assertBidTransition(bid.status, 'TECHNICAL_EVALUATION');
    await tx.procurementBid.update({ where: { id: bid.id }, data: { status: 'TECHNICAL_EVALUATION', lifecycleStage: 'TECHNICAL_EVALUATION' } });
    const rows = [];
    for (const item of body.evaluations) {
      const participation = await tx.procurementBidParticipation.findUnique({ where: { id: Number(item.participationId) } });
      if (!participation || participation.bidId !== bid.id) throw new ApiError(404, 'Participation not found', 'PARTICIPATION_NOT_FOUND');
      const technicalStatus = item.status === 'QUALIFIED' ? 'QUALIFIED' : 'DISQUALIFIED';
      await tx.procurementBidParticipation.update({
        where: { id: participation.id },
        data: {
          technicalStatus,
          financialStatus: technicalStatus === 'DISQUALIFIED' ? 'LOCKED' : participation.financialStatus,
          rejectionReason: item.status === 'DISQUALIFIED' ? item.remarks : null
        }
      });
      rows.push(await tx.procurementBidEvaluation.create({
        data: {
          bidId: bid.id,
          participationId: participation.id,
          sellerId: participation.sellerId,
          evaluatorId: req.user!.id,
          evaluationType: 'TECHNICAL',
          status: technicalStatus,
          remarks: item.remarks,
          score: item.score
        }
      }));
    }
    return rows;
  });
  await procurementAudit(req, 'TECHNICAL_EVALUATION_STARTED', 'ProcurementBid', bid.id, { status: 'TECHNICAL_EVALUATION' }, bid);
  for (const row of updatedRows) {
    await procurementAudit(req, row.status === 'QUALIFIED' ? 'SELLER_QUALIFIED' : 'SELLER_DISQUALIFIED', 'ProcurementBidParticipation', row.participationId, row);
  }
  return updatedRows;
};

export const completeTechnicalEvaluation = async (req: AuthRequest, bidId: string) => {
  const bid = await resolveBid(bidId, {});
  assertBuyerOwner(req.user!, bid);
  if (bid.status !== 'TECHNICAL_EVALUATION') throw new ApiError(400, 'Technical evaluation is not active.', 'TECHNICAL_EVALUATION_PENDING');
  const qualified = await db.procurementBidParticipation.count({ where: { bidId: bid.id, technicalStatus: 'QUALIFIED' } });
  if (!qualified) throw new ApiError(400, 'At least one seller must be technically qualified.', 'TECHNICAL_EVALUATION_PENDING');
  const pending = await db.procurementBidParticipation.count({ where: { bidId: bid.id, submissionStatus: 'SUBMITTED', technicalStatus: { in: ['PENDING', 'UNDER_REVIEW', 'CLARIFICATION_REQUIRED'] } } });
  if (pending) throw new ApiError(400, 'Every submitted participant must be technically qualified or disqualified before completion.', 'TECHNICAL_EVALUATION_PENDING');
  assertBidTransition(bid.status, 'TECHNICAL_EVALUATION_COMPLETED');
  const updated = await db.procurementBid.update({ where: { id: bid.id }, data: { status: 'TECHNICAL_EVALUATION_COMPLETED', lifecycleStage: 'TECHNICAL_EVALUATION_COMPLETED' } });
  await procurementAudit(req, 'TECHNICAL_EVALUATION_COMPLETED', 'ProcurementBid', bid.id, updated);
  return updated;
};

export const openFinancialEvaluation = async (req: AuthRequest, bidId: string) => {
  const bid = await resolveBid(bidId, { participations: true });
  assertBuyerOwner(req.user!, bid);
  if (!financialEvaluationReadyStatuses.includes(bid.status)) {
    throw new ApiError(400, 'Technical evaluation must be completed before opening financial bids.', 'TECHNICAL_EVALUATION_PENDING');
  }
  assertBidTransition(bid.status, 'FINANCIAL_EVALUATION');

  const ranked = await db.$transaction(async (tx: any) => {
    const qualified = await tx.procurementBidParticipation.findMany({
      where: { bidId: bid.id, technicalStatus: 'QUALIFIED', submissionStatus: 'SUBMITTED', totalAmount: { not: null } },
      orderBy: { totalAmount: 'asc' }
    });
    if (!qualified.length) throw new ApiError(400, 'No technically qualified financial quotes are available to open.', 'FINANCIAL_NOT_OPENED');
    for (const [index, row] of qualified.entries()) {
      const rank = index + 1;
      const finalStatus = rankToFinalStatus(rank);
      await tx.procurementBidParticipation.update({
        where: { id: row.id },
        data: { financialStatus: 'EVALUATED', finalStatus, rank }
      });
      await tx.procurementBidEvaluation.create({
        data: {
          bidId: bid.id,
          participationId: row.id,
          sellerId: row.sellerId,
          evaluatorId: req.user!.id,
          evaluationType: 'FINANCIAL',
          status: 'OPENED',
          remarks: `Auto-ranked ${finalStatus}`,
          score: null
        }
      });
    }
    await tx.procurementBid.update({
      where: { id: bid.id },
      data: { status: 'L1_GENERATED', lifecycleStage: 'L1_GENERATED', financialOpeningDate: now() }
    });
    await tx.procurementBidParticipation.updateMany({
      where: { bidId: bid.id, technicalStatus: { not: 'QUALIFIED' } },
      data: { financialStatus: 'LOCKED' }
    });
    return qualified.map((row: any, index: number) => ({ ...row, rank: index + 1, finalStatus: rankToFinalStatus(index + 1) }));
  });
  await procurementAudit(req, 'FINANCIAL_EVALUATION_OPENED', 'ProcurementBid', bid.id, { qualifiedCount: ranked.length });
  await procurementAudit(req, 'L1_GENERATED', 'ProcurementBid', bid.id, ranked.map((r: any) => ({ id: r.id, rank: r.rank, totalAmount: r.totalAmount })));
  return ranked;
};

export const recommendAward = async (req: AuthRequest, bidId: string, body: any) => {
  const bid = await resolveBid(bidId, {});
  assertBuyerOwner(req.user!, bid);

  const participation = await db.procurementBidParticipation.findUnique({ where: { id: Number(body.participationId) } });
  if (!participation || participation.bidId !== bid.id) throw new ApiError(404, 'Participation not found', 'PARTICIPATION_NOT_FOUND');

  const award = await db.$transaction(async (tx: any) => {
    const created = await tx.procurementBidAward.create({
      data: {
        bidId: bid.id,
        participationId: participation.id,
        sellerId: participation.sellerId,
        awardedAmount: participation.totalAmount || participation.quotedAmount || 0,
        awardStatus: 'ADMIN_APPROVED',
        awardedById: req.user!.id,
        remarks: body.remarks || body.adminOverrideReason || 'Accepted by buyer',
        awardedAt: now()
      }
    });

    // Mark winning seller as AWARDED & QUALIFIED
    await tx.procurementBidParticipation.update({
      where: { id: participation.id },
      data: { finalStatus: 'AWARDED', technicalStatus: 'QUALIFIED', financialStatus: 'EVALUATED' }
    });

    // Mark all other submitted seller participations for this bid as NOT_SELECTED
    await tx.procurementBidParticipation.updateMany({
      where: { bidId: bid.id, id: { not: participation.id } },
      data: { finalStatus: 'NOT_SELECTED' }
    });

    // Update procurement bid status directly to AWARDED
    await tx.procurementBid.update({
      where: { id: bid.id },
      data: { status: 'AWARDED', lifecycleStage: 'AWARDED' }
    });

    return created;
  });

  await procurementAudit(req, 'FINAL_AWARD_APPROVED', 'ProcurementBidAward', award.id, award);

  // Automatically generate Purchase Order for the winning seller!
  const po = await createOrReuseProcurementPOForAward(req, award, bid);

  return {
    award,
    purchaseOrder: po.purchaseOrder,
    purchaseOrderReused: po.reused,
    poId: po.purchaseOrder?.id,
    poNumber: po.purchaseOrder?.poNumber
  };
};

export const approveFinalAward = async (req: AuthRequest, bidId: string, body: any) => {
  const bid = await resolveBid(bidId, {});
  if (bid.status !== 'AWARD_RECOMMENDED') throw new ApiError(400, 'Final award approval requires an award recommendation first.', 'INVALID_STATUS_TRANSITION');
  const award = await db.procurementBidAward.findFirst({
    where: { bidId: bid.id, ...(body.awardId ? { id: Number(body.awardId) } : {}) },
    orderBy: { createdAt: 'desc' }
  });
  if (!award) throw new ApiError(404, 'Award recommendation not found', 'AWARD_NOT_FOUND');
  const updated = await db.$transaction(async (tx: any) => {
    const approved = await tx.procurementBidAward.update({
      where: { id: award.id },
      data: { awardStatus: 'ADMIN_APPROVED', awardedById: req.user!.id, awardedAt: now(), remarks: body.remarks || award.remarks }
    });
    await tx.procurementBidParticipation.updateMany({ where: { bidId: bid.id, id: { not: award.participationId } }, data: { finalStatus: 'NOT_SELECTED' } });
    await tx.procurementBidParticipation.update({ where: { id: award.participationId }, data: { finalStatus: 'AWARDED' } });
    await tx.procurementBid.update({ where: { id: bid.id }, data: { status: 'AWARDED', lifecycleStage: 'AWARDED' } });
    return approved;
  });
  await procurementAudit(req, 'FINAL_AWARD_APPROVED', 'ProcurementBidAward', updated.id, updated);
  const po = await createOrReuseProcurementPOForAward(req, updated, bid);
  return { award: updated, purchaseOrder: po.purchaseOrder, purchaseOrderReused: po.reused };
};

export const getAverageRatingsForSellers = async (sellerIds: number[]) => {
  if (!sellerIds.length) return {};
  const ratings = await db.supplierRating.findMany({
    where: { sellerId: { in: sellerIds } }
  });

  const averages: Record<number, {
    rating: number;
    qualityScore: number;
    deliveryScore: number;
    communicationScore: number;
    documentationScore: number;
    count: number;
  }> = {};

  for (const sellerId of sellerIds) {
    const sellerRatings = ratings.filter((r: any) => r.sellerId === sellerId);
    if (!sellerRatings.length) {
      averages[sellerId] = { rating: 0, qualityScore: 0, deliveryScore: 0, communicationScore: 0, documentationScore: 0, count: 0 };
      continue;
    }

    const sum = (field: string) => sellerRatings.reduce((acc: number, curr: any) => acc + (curr[field] || 0), 0);
    const validCount = (field: string) => sellerRatings.filter((r: any) => r[field] != null).length;

    const ratingCount = validCount('rating');
    const qualityCount = validCount('qualityScore');
    const deliveryCount = validCount('deliveryScore');
    const commCount = validCount('communicationScore');
    const docCount = validCount('documentationScore');

    averages[sellerId] = {
      rating: ratingCount ? Number((sum('rating') / ratingCount).toFixed(1)) : 0,
      qualityScore: qualityCount ? Number((sum('qualityScore') / qualityCount).toFixed(1)) : 0,
      deliveryScore: deliveryCount ? Number((sum('deliveryScore') / deliveryCount).toFixed(1)) : 0,
      communicationScore: commCount ? Number((sum('communicationScore') / commCount).toFixed(1)) : 0,
      documentationScore: docCount ? Number((sum('documentationScore') / docCount).toFixed(1)) : 0,
      count: sellerRatings.length
    };
  }

  return averages;
};

export const getProcurementTimeline = async (bidId: number) => {
  const bid = await db.procurementBid.findUnique({
    where: { id: bidId },
    include: {
      buyer: { select: { name: true, role: true } },
      awards: {
        include: {
          seller: { select: { name: true, role: true } }
        }
      }
    }
  });
  if (!bid) return [];

  const logs = await db.procurementAuditLog.findMany({
    where: { entityType: 'ProcurementBid', entityId: String(bidId) },
    include: { user: { select: { name: true, role: true } } },
    orderBy: { createdAt: 'asc' }
  });

  const awardIds = bid.awards.map((a: any) => a.id);
  const pos = awardIds.length ? await db.purchaseOrder.findMany({
    where: { sourceType: 'procurement_bid_award', sourceId: { in: awardIds } },
    include: {
      buyer: { select: { name: true, role: true } },
      seller: { select: { name: true, role: true } },
      grns: { include: { approvals: true } },
      invoices: true,
      payments: true,
      deliveryTrackings: { include: { events: true } }
    }
  }) : [];

  const po = pos[0];

  const findLog = (actions: string[]) => logs.find((l: any) => actions.includes(l.action));

  const draftLog = findLog(['BID_CREATED']);
  const draftTime = draftLog ? draftLog.createdAt : bid.createdAt;
  const draftUser = draftLog?.user || bid.buyer;

  const pubLog = findLog(['BID_PUBLISHED', 'BID_APPROVED', 'BID_SUBMITTED_FOR_APPROVAL']);
  const pubTime = pubLog ? pubLog.createdAt : (bid.status !== 'DRAFT' && bid.status !== 'PENDING_ADMIN_APPROVAL' ? bid.createdAt : null);
  const pubUser = pubLog?.user || (pubTime ? bid.buyer : null);

  const openLog = findLog(['BID_OPENED', 'BID_PUBLISHED']);
  const openTime = openLog ? openLog.createdAt : (['OPEN', 'CLOSED', 'EXPIRED', 'TECHNICAL_EVALUATION', 'FINANCIAL_EVALUATION', 'AWARDED', 'PO_GENERATED', 'IN_PROGRESS', 'DELIVERED', 'GRN_COMPLETED', 'INVOICE_SUBMITTED', 'PAYMENT_COMPLETED', 'CLOSED'].includes(bid.status) ? bid.startDate : null);
  const openUser = openLog?.user || (openTime ? { name: 'System', role: 'system' } : null);

  const evalLog = findLog(['TECHNICAL_EVALUATION_STARTED', 'TECHNICAL_EVALUATION_COMPLETED', 'FINANCIAL_EVALUATION_OPENED', 'L1_GENERATED']);
  const evalTime = evalLog ? evalLog.createdAt : (['TECHNICAL_EVALUATION', 'FINANCIAL_EVALUATION', 'AWARDED', 'PO_GENERATED', 'IN_PROGRESS', 'DELIVERED', 'GRN_COMPLETED', 'INVOICE_SUBMITTED', 'PAYMENT_COMPLETED', 'CLOSED'].includes(bid.status) ? bid.updatedAt : null);
  const evalUser = evalLog?.user || (evalTime ? bid.buyer : null);

  const awardLog = findLog(['FINAL_AWARD_APPROVED', 'BID_AWARDED']);
  const awardTime = awardLog ? awardLog.createdAt : (bid.awards[0]?.awardedAt || null);
  const awardUser = awardLog?.user || (awardTime ? bid.buyer : null);

  const poTime = po ? po.createdAt : null;
  const poUser = po ? po.buyer : null;

  const activeTracking = po?.deliveryTrackings?.[0];
  const deliveryCompletedEvent = activeTracking?.events?.find((e: any) => e.status === 'DELIVERED' || e.status === 'COMPLETED');
  const deliveryTime = deliveryCompletedEvent ? deliveryCompletedEvent.createdAt : (activeTracking ? activeTracking.updatedAt : null);
  const deliveryUser = activeTracking ? po.seller : null;

  const grn = po?.grns?.[0];
  const grnTime = grn && grn.status === 'APPROVED' ? grn.updatedAt : null;
  const grnUser = grn ? po.buyer : null;

  const invoice = po?.invoices?.[0];
  const invoiceTime = invoice && invoice.status === 'APPROVED' ? invoice.updatedAt : null;
  const invoiceUser = invoice ? po.seller : null;

  const payment = po?.payments?.[0];
  const paymentTime = payment && (payment.status === 'SUCCESS' || payment.status === 'SETTLED') ? payment.updatedAt : null;
  const paymentUser = payment ? { name: 'Finance System', role: 'finance' } : null;

  const completedTime = bid.status === 'CLOSED' ? bid.updatedAt : null;
  const completedUser = completedTime ? bid.buyer : null;

  const stages = [
    { name: 'Draft', label: 'Draft Created', time: draftTime, user: draftUser, status: 'completed' },
    { name: 'Published', label: 'Published & Approved', time: pubTime, user: pubUser, status: pubTime ? 'completed' : 'pending' },
    { name: 'Open for Bids', label: 'Bidding Open', time: openTime, user: openUser, status: openTime ? 'completed' : 'pending' },
    { name: 'Evaluation', label: 'Under Evaluation', time: evalTime, user: evalUser, status: evalTime ? 'completed' : 'pending' },
    { name: 'Award', label: 'Awarded to Seller', time: awardTime, user: awardUser, status: awardTime ? 'completed' : 'pending' },
    { name: 'PO', label: 'PO Generated', time: poTime, user: poUser, status: poTime ? 'completed' : 'pending' },
    { name: 'Delivery', label: 'Goods Delivered', time: deliveryTime, user: deliveryUser, status: deliveryTime ? 'completed' : (poTime ? 'current' : 'pending') },
    { name: 'GRN', label: 'GRN Approved', time: grnTime, user: grnUser, status: grnTime ? 'completed' : (deliveryTime ? 'current' : 'pending') },
    { name: 'Invoice', label: 'Invoice Approved', time: invoiceTime, user: invoiceUser, status: invoiceTime ? 'completed' : (grnTime ? 'current' : 'pending') },
    { name: 'Payment', label: 'Payment Completed', time: paymentTime, user: paymentUser, status: paymentTime ? 'completed' : (invoiceTime ? 'current' : 'pending') },
    { name: 'Completed', label: 'Closed', time: completedTime, user: completedUser, status: completedTime ? 'completed' : (paymentTime ? 'current' : 'pending') }
  ];

  let foundCurrent = false;
  for (let i = stages.length - 1; i >= 0; i--) {
    if (stages[i].time) {
      stages[i].status = 'completed';
      if (!foundCurrent && i < stages.length - 1) {
        stages[i+1].status = 'current';
        foundCurrent = true;
      }
    } else {
      stages[i].status = 'pending';
    }
  }

  if (stages[0].status === 'pending') stages[0].status = 'current';

  return stages;
};
