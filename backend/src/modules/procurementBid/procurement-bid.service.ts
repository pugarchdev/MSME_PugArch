import prisma from '../../config/prisma.js';
import { env } from '../../config/env.js';
import { ApiError } from '../../utils/ApiError.js';
import { uploadFile } from '../../services/storage/storage.service.js';
import type { AuthRequest, AuthenticatedUser } from '../../middleware/authenticate.js';
import { createOrReuseProcurementPOForAward } from './procurement-order.service.js';

const db = prisma as any;

type Actor = AuthenticatedUser;

const publicBidStatuses = ['PENDING_ADMIN_APPROVAL', 'OPEN', 'APPROVED', 'TECHNICAL_EVALUATION', 'TECHNICAL_EVALUATION_COMPLETED', 'FINANCIAL_EVALUATION', 'L1_GENERATED', 'AWARD_RECOMMENDED', 'AWARDED'];
const financialOpenStatuses = ['FINANCIAL_EVALUATION', 'L1_GENERATED', 'AWARD_RECOMMENDED', 'AWARDED'];
const sellerVerifiedStatuses = ['approved_for_procurement', 'approved'];
const activeUserStatuses = ['ACTIVE'];
const verifiedOrganizationStatuses = ['VERIFIED'];
const editableBidStatuses = ['DRAFT'];
const editableApprovalStatuses = ['DRAFT', 'REJECTED'];
const technicalEvaluationStatuses = ['CLOSED', 'EXPIRED', 'TECHNICAL_EVALUATION'];
const financialEvaluationReadyStatuses = ['TECHNICAL_EVALUATION_COMPLETED'];

const bidTransitions: Record<string, string[]> = {
  DRAFT: ['PENDING_ADMIN_APPROVAL', 'CANCELLED'],
  PENDING_ADMIN_APPROVAL: ['APPROVED', 'OPEN', 'DRAFT', 'CANCELLED'],
  APPROVED: ['OPEN', 'CANCELLED'],
  OPEN: ['CLOSED', 'EXPIRED', 'CANCELLED'],
  CLOSED: ['TECHNICAL_EVALUATION', 'CANCELLED'],
  EXPIRED: ['TECHNICAL_EVALUATION', 'CANCELLED'],
  TECHNICAL_EVALUATION: ['TECHNICAL_EVALUATION_COMPLETED', 'CANCELLED'],
  TECHNICAL_EVALUATION_COMPLETED: ['FINANCIAL_EVALUATION', 'CANCELLED'],
  FINANCIAL_EVALUATION: ['L1_GENERATED', 'AWARD_RECOMMENDED', 'CANCELLED'],
  L1_GENERATED: ['AWARD_RECOMMENDED', 'CANCELLED'],
  AWARD_RECOMMENDED: ['AWARDED', 'CANCELLED']
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

const bidInclude: any = {
  documents: true,
  buyer: { select: { id: true, name: true, email: true, role: true } },
  buyerOrganization: { select: { id: true, organizationName: true, organizationType: true, verificationStatus: true, city: true, district: true, state: true } },
  participations: {
    include: {
      seller: { select: { id: true, name: true, email: true, role: true, onboardingStatus: true } },
      documents: true,
      clarifications: { include: { files: true } },
      evaluations: true,
      awards: true
    }
  },
  clarifications: { include: { files: true } },
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
  const token = String(bidIdOrNumber);
  const bid = await db.procurementBid.findFirst({
    where: /^\d+$/.test(token) ? { OR: [{ id: Number(token) }, { bidNumber: token }] } : { bidNumber: token },
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

export const serializeBid = (bid: any, options: { actor?: Actor; detail?: boolean; includeParticipants?: boolean; includeFinancial?: boolean } = {}) => {
  const actor = options.actor;
  const isAdmin = actor?.role === 'admin' || actor?.role === 'master_admin';
  const isBuyerOwner = actor?.role === 'buyer' && bid.buyerId === actor.id;
  const canSeeParticipants = options.includeParticipants || isAdmin || isBuyerOwner;
  const canSeeFinancial = options.includeFinancial || isAdmin || (isBuyerOwner && financialOpenStatuses.includes(bid.status));

  const publicDocuments = (bid.documents || []).filter((doc: any) => {
    if (doc.visibility === 'PUBLIC') return true;
    if (doc.visibility === 'SELLER_AFTER_LOGIN' && actor?.role === 'seller') return true;
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
    evaluationMethod: bid.evaluationMethod,
    isEmdRequired: bid.isEmdRequired,
    emdAmount: moneyNumber(bid.emdAmount),
    documentFee: moneyNumber(bid.documentFee),
    allowClarification: bid.allowClarification,
    allowReverseAuction: bid.allowReverseAuction,
    allowBoq: bid.allowBoq,
    termsAndConditions: bid.termsAndConditions || [],
    eligibilityCriteria: bid.eligibilityCriteria || [],
    requiredDocuments: bid.requiredDocuments || [],
    rejectedReason: isAdmin || isBuyerOwner ? bid.rejectedReason : undefined,
    createdAt: bid.createdAt,
    updatedAt: bid.updatedAt,
    buyerOrganization: bid.buyerOrganization,
    documents: publicDocuments.map((doc: any) => ({
      id: doc.id,
      documentType: doc.documentType,
      fileName: doc.fileName,
      mimeType: doc.mimeType,
      fileSize: doc.fileSize,
      visibility: doc.visibility,
      fileAssetId: doc.fileAssetId
    })),
    participantsCount: bid.participations?.length || 0,
    participations: canSeeParticipants ? (bid.participations || []).map((p: any) => serializeParticipation(p, { canSeeFinancial })) : undefined,
    clarifications: isAdmin || isBuyerOwner ? bid.clarifications : undefined,
    evaluations: isAdmin || isBuyerOwner ? bid.evaluations : undefined,
    awards: bid.awards
  };
};

export const serializeParticipation = (p: any, options: { canSeeFinancial?: boolean } = {}) => ({
  id: p.id,
  bidId: p.bidId,
  sellerId: p.sellerId,
  seller: p.seller ? { id: p.seller.id, name: p.seller.name, role: p.seller.role } : undefined,
  participationNumber: p.participationNumber,
  technicalStatus: p.technicalStatus,
  financialStatus: p.financialStatus,
  finalStatus: p.finalStatus,
  rank: p.rank,
  quotedAmount: options.canSeeFinancial ? moneyNumber(p.quotedAmount) : maskedQuote.quotedAmount,
  gstPercentage: options.canSeeFinancial ? moneyNumber(p.gstPercentage) : maskedQuote.gstPercentage,
  totalAmount: options.canSeeFinancial ? moneyNumber(p.totalAmount) : maskedQuote.totalAmount,
  financialSealed: !options.canSeeFinancial,
  financialMessage: options.canSeeFinancial ? undefined : maskedQuote.message,
  makeBrand: p.makeBrand,
  model: p.model,
  offeredItemDescription: p.offeredItemDescription,
  submissionStatus: p.submissionStatus,
  submittedAt: p.submittedAt,
  technicalSubmittedAt: p.technicalSubmittedAt,
  financialSubmittedAt: p.financialSubmittedAt,
  isWithdrawn: p.isWithdrawn,
  rejectionReason: p.rejectionReason,
  documents: (p.documents || []).map((doc: any) => ({
    id: doc.id,
    documentCategory: doc.documentCategory,
    documentName: doc.documentName,
    fileName: doc.fileName,
    mimeType: doc.mimeType,
    fileSize: doc.fileSize,
    documentStatus: doc.documentStatus,
    uploadedAt: doc.uploadedAt,
    fileAssetId: doc.fileAssetId
  })),
  clarifications: p.clarifications,
  evaluations: p.evaluations,
  awards: p.awards
});

export const assertSellerVerified = async (actor: Actor) => {
  if (actor.role !== 'seller') throw new ApiError(403, 'Only verified sellers/vendors can participate in bids.', 'FORBIDDEN_ROLE');
  const user = await db.user.findUnique({
    where: { id: actor.id },
    include: { sellerProfile: true, organization: true }
  });
  assertActiveAccount(user, 'Seller');
  if (user?.organization?.isBlacklisted) throw new ApiError(403, 'Seller organization is blocked for procurement participation.', 'SELLER_NOT_VERIFIED');
  const profileVerified = user?.sellerProfile?.verificationStatusEnum === 'VERIFIED' || user?.sellerProfile?.panVerified || user?.sellerProfile?.isUdyamCertified;
  const orgVerified = user?.organization?.verificationStatus === 'VERIFIED';
  if (!user || (!sellerVerifiedStatuses.includes(String(user.onboardingStatus)) && !profileVerified && !orgVerified)) {
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
  const profileVerified = user?.buyerProfile?.verificationStatusEnum === 'VERIFIED';
  const legacyApproved = sellerVerifiedStatuses.includes(String(user?.onboardingStatus));
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
  if (actor.role === 'buyer' && bid.buyerId !== actor.id) {
    throw new ApiError(403, 'You cannot access another buyer bid.', 'FORBIDDEN_ROLE');
  }
};

export const listPublicBids = async (query: any) => {
  const page = Math.max(1, Number(query.page || 1));
  const pageSize = Math.min(50, Math.max(1, Number(query.pageSize || 12)));
  const where: any = {
    approvalStatus: { in: ['APPROVED', 'PENDING', 'SUBMITTED', 'PENDING_APPROVAL'] },
    status: { in: query.status ? [String(query.status).toUpperCase()] : publicBidStatuses }
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

  const [total, bids] = await Promise.all([
    db.procurementBid.count({ where }),
    db.procurementBid.findMany({
      where,
      include: { documents: true, buyerOrganization: true, participations: { select: { id: true } }, awards: true },
      orderBy: query.sort === 'value' ? { estimatedValue: 'desc' } : { endDate: 'asc' },
      skip: (page - 1) * pageSize,
      take: pageSize
    })
  ]);
  return { items: bids.map((bid: any) => serializeBid(bid)), total, page, pageSize };
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
      termsAndConditions: body.termsAndConditions || [],
      eligibilityCriteria: body.eligibilityCriteria || [],
      requiredDocuments: body.requiredDocuments || []
    }
  });
  await procurementAudit(req, 'BID_CREATED', 'ProcurementBid', bid.id, bid);
  return bid;
};

export const updateBuyerBid = async (req: AuthRequest, bidId: string, body: any) => {
  const bid = await resolveBid(bidId, {});
  assertBuyerOwner(req.user!, bid);
  if (!editableBidStatuses.includes(bid.status) && !editableApprovalStatuses.includes(bid.approvalStatus)) {
    throw new ApiError(400, 'Only draft or rejected bids can be edited.', 'INVALID_STATUS_TRANSITION');
  }
  const updated = await db.procurementBid.update({ where: { id: bid.id }, data: body });
  await procurementAudit(req, 'BID_UPDATED', 'ProcurementBid', bid.id, updated, bid);
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

export const submitForApproval = async (req: AuthRequest, bidId: string) => {
  const bid = await resolveBid(bidId, {});
  assertBuyerOwner(req.user!, bid);
  await assertBuyerVerified(req.user!);
  if (!editableBidStatuses.includes(bid.status) && !editableApprovalStatuses.includes(bid.approvalStatus)) {
    throw new ApiError(400, 'Only draft or rejected bids can be submitted for approval.', 'INVALID_STATUS_TRANSITION');
  }
  assertBidTransition(bid.status, 'PENDING_ADMIN_APPROVAL');
  const updated = await db.procurementBid.update({
    where: { id: bid.id },
    data: { status: 'PENDING_ADMIN_APPROVAL', approvalStatus: 'PENDING' }
  });
  await procurementAudit(req, 'BID_SUBMITTED_FOR_APPROVAL', 'ProcurementBid', bid.id, updated, bid);
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
  return updated;
};

export const startParticipation = async (req: AuthRequest, bidId: string) => {
  await assertSellerVerified(req.user!);
  const bid = await resolveBid(bidId, {});
  assertBidOpen(bid);
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

export const finalSubmitParticipation = async (req: AuthRequest, bidId: string, participationId: number) => {
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
  const updated = await db.procurementBidParticipation.update({
    where: { id: participation.id },
    data: { submissionStatus: 'SUBMITTED', technicalStatus: 'UNDER_REVIEW', submittedAt: now(), technicalSubmittedAt: now() }
  });
  await procurementAudit(req, 'PARTICIPATION_SUBMITTED', 'ProcurementBidParticipation', updated.id, updated);
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
  if (!['L1_GENERATED', 'FINANCIAL_EVALUATION'].includes(bid.status)) throw new ApiError(400, 'Financial evaluation is not opened.', 'FINANCIAL_NOT_OPENED');
  const participation = await db.procurementBidParticipation.findUnique({ where: { id: Number(body.participationId) } });
  if (!participation || participation.bidId !== bid.id) throw new ApiError(404, 'Participation not found', 'PARTICIPATION_NOT_FOUND');
  if (participation.technicalStatus !== 'QUALIFIED' || !participation.rank) throw new ApiError(400, 'Only ranked technically qualified sellers can be recommended.', 'INVALID_STATUS_TRANSITION');
  if (participation.rank !== 1 && !body.adminOverrideReason) {
    throw new ApiError(400, 'Only L1 seller can be recommended without admin override reason.', 'INVALID_STATUS_TRANSITION');
  }
  const award = await db.$transaction(async (tx: any) => {
    const created = await tx.procurementBidAward.create({
      data: {
        bidId: bid.id,
        participationId: participation.id,
        sellerId: participation.sellerId,
        awardedAmount: participation.totalAmount || participation.quotedAmount,
        awardStatus: 'RECOMMENDED',
        awardedById: req.user!.id,
        remarks: body.remarks || body.adminOverrideReason
      }
    });
    await tx.procurementBid.update({ where: { id: bid.id }, data: { status: 'AWARD_RECOMMENDED', lifecycleStage: 'AWARD_RECOMMENDED' } });
    return created;
  });
  await procurementAudit(req, 'AWARD_RECOMMENDED', 'ProcurementBidAward', award.id, award);
  return award;
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
