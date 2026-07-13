import { Router, type Response } from 'express';
import { z } from 'zod';
import { authenticate, checkFeatureEnabled, requireAccountType, requirePermission, type AuthRequest } from '../../middleware/auth.js';
import { upload } from '../../config/storage.js';
import prisma from '../../lib/prisma.js';
import { apiResponse } from '../../utils/apiResponse.js';
import { maskSensitive } from '../../utils/maskSensitive.js';
import { validate } from '../../middleware/validate.js';
import * as service from './procurement-bid.service.js';
import * as orderService from './procurement-order.service.js';
import { verifyAccessToken } from '../../services/token.service.js';
import { ApiError } from '../../utils/ApiError.js';

const router = Router();


const optionalActor = async (req: AuthRequest) => {
  const authHeader = req.headers.authorization || '';
  const [scheme, token] = authHeader.split(' ');
  if (scheme !== 'Bearer' || !token) return null;
  try {
    const decoded = verifyAccessToken(token);
    const user = await prisma.user.findUnique({
      where: { id: Number(decoded.id) },
      select: { id: true, role: true, sessionVersion: true, accountStatus: true, organizationId: true }
    });
    if (!user || user.accountStatus !== 'ACTIVE' || user.role !== decoded.role || user.sessionVersion !== Number(decoded.sessionVersion)) return null;
    return { id: user.id, role: user.role, sessionVersion: user.sessionVersion, organizationId: user.organizationId, permissions: [], enabledFeatures: [] };
  } catch {
    return null;
  }
};

const asyncRoute = (handler: (req: AuthRequest & { file?: Express.Multer.File }, res: Response) => Promise<unknown>) =>
  async (req: AuthRequest & { file?: Express.Multer.File }, res: Response) => {
    try {
      await handler(req, res);
    } catch (err: any) {
      return apiResponse.error(res, err?.statusCode || 500, err?.statusCode && err.statusCode < 500 ? err.message : 'Unable to complete procurement request', err?.code || 'REQUEST_FAILED', err?.details);
    }
  };

const bidBaseSchema = z.object({
  title: z.string().trim().min(3).max(220),
  description: z.string().trim().min(10).max(8000),
  buyerOrganizationName: z.string().trim().max(220).optional(),
  buyerType: z.string().trim().min(2).max(100),
  category: z.string().trim().min(2).max(120),
  subCategory: z.string().trim().max(120).optional(),
  bidType: z.string().trim().min(2).max(80),
  procurementType: z.string().trim().max(80).optional(),
  quantity: z.coerce.number().positive().optional(),
  unit: z.string().trim().max(40).optional(),
  estimatedValue: z.coerce.number().nonnegative().optional(),
  deliveryLocation: z.string().trim().min(2).max(400),
  state: z.string().trim().max(80).optional(),
  district: z.string().trim().max(80).optional(),
  pincode: z.string().trim().max(12).optional(),
  startDate: z.coerce.date(),
  endDate: z.coerce.date(),
  technicalOpeningDate: z.coerce.date().optional(),
  financialOpeningDate: z.coerce.date().optional(),
  bidValidityDate: z.coerce.date().optional(),
  evaluationMethod: z.string().trim().max(40).optional(),
  isEmdRequired: z.boolean().optional(),
  emdAmount: z.coerce.number().nonnegative().optional(),
  documentFee: z.coerce.number().nonnegative().optional(),
  allowClarification: z.boolean().optional(),
  allowReverseAuction: z.boolean().optional(),
  allowBoq: z.boolean().optional(),
  termsAndConditions: z.array(z.string().trim().min(1)).optional(),
  eligibilityCriteria: z.array(z.string().trim().min(1)).optional(),
  requiredDocuments: z.array(z.string().trim().min(1)).optional()
});

const bidBodySchema = bidBaseSchema.refine(data => data.endDate > data.startDate, { message: 'End date must be after start date', path: ['endDate'] });

const idParamSchema = z.object({ bidId: z.string().trim().min(1) });
const participationParamSchema = idParamSchema.extend({ participationId: z.coerce.number().int().positive() });
const clarificationParamSchema = idParamSchema.extend({ clarificationId: z.coerce.number().int().positive() });

const financialQuoteSchema = z.object({
  quotedAmount: z.coerce.number().positive(),
  gstPercentage: z.coerce.number().min(0).max(100).optional(),
  totalAmount: z.coerce.number().positive().optional(),
  makeBrand: z.string().trim().max(160).optional(),
  model: z.string().trim().max(160).optional(),
  offeredItemDescription: z.string().trim().max(2000).optional()
});

const clarificationSchema = z.object({
  participationId: z.coerce.number().int().positive(),
  clarificationType: z.string().trim().min(2).max(80),
  question: z.string().trim().min(5).max(3000),
  dueDate: z.coerce.date().optional()
});

const technicalEvaluationSchema = z.object({
  evaluations: z.array(z.object({
    participationId: z.coerce.number().int().positive(),
    status: z.enum(['QUALIFIED', 'DISQUALIFIED']),
    remarks: z.string().trim().max(2000).optional(),
    score: z.coerce.number().min(0).max(100).optional()
  })).min(1)
});

const orderIdParamSchema = z.object({ orderId: z.coerce.number().int().positive() });
const awardIdParamSchema = z.object({ awardId: z.coerce.number().int().positive() });
const grnParamSchema = orderIdParamSchema.extend({ grnId: z.coerce.number().int().positive() });
const invoiceParamSchema = orderIdParamSchema.extend({ invoiceId: z.coerce.number().int().positive() });

router.get('/bids', asyncRoute(async (req, res) => {
  const actor = await optionalActor(req);
  const data = await service.listPublicBids(req.query, actor);
  return apiResponse.success(res, data, 200, 'Bids fetched successfully');
}));

router.get('/bids/my', authenticate, requireAccountType('seller', 'buyer', 'admin'), asyncRoute(async (req, res) => {
  const role = String(req.user?.role || '');
  const currentUserId = Number(req.user?.id);
  const where = role === 'seller'
    ? { sellerId: currentUserId }
    : role === 'buyer'
      ? { tender: { buyerId: currentUserId } }
      : {};

  const bids = await prisma.bid.findMany({
    where,
    include: {
      tender: {
        include: {
          buyer: {
            select: {
              id: true,
              name: true,
              email: true,
              mobile: true,
              buyerProfile: {
                select: {
                  organizationName: true,
                  organizationType: true,
                  city: true,
                  state: true
                }
              }
            }
          }
        }
      },
      seller: {
        select: {
          id: true,
          name: true,
          email: true,
          mobile: true,
          sellerProfile: {
            select: {
              businessName: true,
              organizationType: true,
              offices: {
                select: {
                  city: true,
                  state: true
                }
              }
            }
          }
        }
      }
    },
    orderBy: { createdAt: 'desc' }
  });

  return res.json(maskSensitive(bids));
}));

router.get('/bids/:bidId', validate({ params: idParamSchema }), asyncRoute(async (req, res) => {
  const actor = await optionalActor(req);
  const token = req.params.bidId;
  if (token.startsWith('TENDER-') || token.startsWith('TND-')) {
    const data = await service.resolveTenderBidActivity(token);
    return apiResponse.success(res, data, 200, 'Tender opportunity details fetched successfully');
  }

  let bid: any;
  try {
    bid = await service.resolveBid(token);
  } catch (err: any) {
    // Fallback: if no ProcurementBid found, check if this is a Requirement ID
    if (err?.code === 'BID_NOT_FOUND' && /^\d+$/.test(token)) {
      const requirement = await prisma.requirement.findUnique({
        where: { id: Number(token) },
        include: {
          items: true,
          organization: { select: { id: true, organizationName: true, organizationType: true, verificationStatus: true, city: true, district: true, state: true } },
          category: true,
          buyer: { select: { id: true, name: true, email: true, role: true, buyerProfile: { select: { departmentName: true } } } },
        }
      });
      if (requirement) {
        const payload = requirement.payload && typeof requirement.payload === 'object' ? requirement.payload as any : {};
        const basics = payload.basics || {};
        const schedule = payload.schedule || {};
        const terms = payload.terms || {};
        const internal = payload.internal || {};
        const synthesized = {
          id: requirement.id,
          bidNumber: requirement.requirementNumber || `REQ-${requirement.id}`,
          title: requirement.title || basics.title || 'Procurement Requirement',
          description: requirement.description || basics.description || '',
          buyerId: requirement.buyerId,
          buyerOrganizationName: requirement.organization?.organizationName || internal.orgName || basics.buyerOrganizationName || '',
          buyerType: basics.buyerType || requirement.organization?.organizationType || 'Private Enterprise',
          departmentName: requirement.buyer?.buyerProfile?.departmentName || internal.departmentName || '',
          category: basics.category || requirement.category?.name || '',
          subCategory: basics.subCategory || '',
          bidType: basics.whatAreYouBuying || 'Product',
          procurementType: requirement.procurementMethod || payload.recommendation?.id || 'RFQ',
          quantity: basics.quantity ? Number(basics.quantity) : (requirement.items?.[0]?.quantity || null),
          unit: basics.unit || requirement.items?.[0]?.unitOfMeasure || '',
          estimatedValue: requirement.estimatedValue || basics.estimatedValue || 0,
          deliveryLocation: basics.deliveryLocation || internal.deliveryAddress || [requirement.organization?.district, requirement.organization?.state].filter(Boolean).join(', ') || '',
          state: requirement.organization?.state || '',
          district: requirement.organization?.district || '',
          startDate: requirement.createdAt,
          endDate: requirement.requiredBy || schedule.submissionDate || requirement.createdAt,
          technicalOpeningDate: schedule.technicalOpeningDate || null,
          financialOpeningDate: schedule.financialOpeningDate || null,
          status: requirement.status === 'APPROVED' ? 'OPEN' : requirement.status || 'OPEN',
          approvalStatus: requirement.status || 'APPROVED',
          lifecycleStage: 'SELLER_PARTICIPATION',
          evaluationMethod: payload.evaluation?.evaluationMethod || 'L1',
          isEmdRequired: false,
          emdAmount: null,
          documentFee: null,
          allowClarification: true,
          allowReverseAuction: false,
          packetType: 'SINGLE_PACKET',
          technicalPacket: payload,
          termsAndConditions: terms.termsAndConditions || [],
          eligibilityCriteria: terms.eligibilityCriteria || basics.eligibilityCriteria || [],
          requiredDocuments: payload.requiredDocs || [],
          createdAt: requirement.createdAt,
          updatedAt: requirement.updatedAt,
          buyerOrganization: requirement.organization,
          buyer: requirement.buyer,
          documents: [],
          participations: [],
          clarifications: [],
          evaluations: [],
          awards: [],
          participantsCount: 0,
          sourceModel: 'REQUIREMENT',
          sourceId: requirement.id,
          consigneeDetails: payload.consigneeDetails || null,
          items: requirement.items || [],
        };
        return apiResponse.success(res, synthesized, 200, 'Requirement-based bid details fetched successfully');
      }
    }
    throw err;
  }

  // Access gate: public bids are viewable by anyone; private (invite-only) bids only by
  // the owner, an invited seller, a participant, or an admin. 404 (not 403) to avoid
  // leaking the existence of a private procurement.
  if (!service.canActorViewBid(actor as any, bid)) {
    throw new ApiError(404, 'Bid not found', 'BID_NOT_FOUND');
  }
  const sellerCanSeeParticipants = actor?.role === 'seller' && (bid.participations || []).some((p: any) => p.sellerId === actor.id);
  
  const sellerIds = (bid.participations || []).map((p: any) => p.sellerId);
  const sellerRatings = await service.getAverageRatingsForSellers(sellerIds);

  return apiResponse.success(res, service.serializeBid(bid, { actor: actor || undefined, detail: true, includeParticipants: sellerCanSeeParticipants, sellerRatings }), 200, 'Bid details fetched successfully');
}));

router.get('/bids/:bidId/timeline', validate({ params: idParamSchema }), asyncRoute(async (req, res) => {
  const bid = await service.resolveBid(req.params.bidId, {});
  const timeline = await service.getProcurementTimeline(bid.id);
  return apiResponse.success(res, timeline, 200, 'Procurement lifecycle timeline fetched');
}));

router.post('/bids/:bidId/participate', authenticate, requireAccountType('seller'), requirePermission('bid.submit'), validate({ params: idParamSchema }), asyncRoute(async (req, res) => {
  const participation = await service.startParticipation(req, req.params.bidId);
  return apiResponse.created(res, participation, 'Bid participation started');
}));

router.post('/bids/:bidId/participation/:participationId/technical-documents', authenticate, requireAccountType('seller'), requirePermission('bid.submit'), upload.single('file'), validate({ params: participationParamSchema }), asyncRoute(async (req, res) => {
  const category = String(req.body.documentCategory || 'TECHNICAL_COMPLIANCE');
  const doc = await service.uploadParticipationDocument(req, req.params.bidId, Number(req.params.participationId), category);
  return apiResponse.created(res, doc, 'Technical document uploaded');
}));

router.post('/bids/:bidId/participation/:participationId/financial-quote', authenticate, requireAccountType('seller'), requirePermission('bid.submit'), upload.single('file'), validate({ params: participationParamSchema, body: financialQuoteSchema }), asyncRoute(async (req, res) => {
  const data = await service.saveFinancialQuote(req, req.params.bidId, Number(req.params.participationId), req.body);
  return apiResponse.success(res, data, 200, 'Financial quote saved securely');
}));

router.post('/bids/:bidId/participation/:participationId/submit', authenticate, requireAccountType('seller'), requirePermission('bid.submit'), validate({ params: participationParamSchema }), asyncRoute(async (req, res) => {
  const data = await service.finalSubmitParticipation(req, req.params.bidId, Number(req.params.participationId));
  return apiResponse.success(res, data, 200, 'Participation submitted successfully');
}));

router.get('/seller/bids', authenticate, requireAccountType('seller'), asyncRoute(async (req, res) => {
  const rows = await (prisma as any).procurementBidParticipation.findMany({
    where: { sellerId: req.user!.id },
    include: { bid: true, documents: true, clarifications: { include: { files: true } }, evaluations: true, awards: true },
    orderBy: { createdAt: 'desc' }
  });
  return apiResponse.success(res, rows.map((row: any) => ({ ...service.serializeParticipation(row, { canSeeFinancial: true }), bid: service.serializeBid(row.bid, { actor: req.user }) })), 200, 'Seller bids fetched');
}));

router.get('/seller/bids/:bidId/status', authenticate, requireAccountType('seller'), validate({ params: idParamSchema }), asyncRoute(async (req, res) => {
  const bid = await service.resolveBid(req.params.bidId, { participations: { where: { sellerId: req.user!.id }, include: { documents: true, clarifications: { include: { files: true } }, evaluations: true, awards: true } } });
  const participation = bid.participations?.[0];
  const isRestrictedBid = service.isRestrictedBidMethod(bid);
  if (isRestrictedBid) {
    if (!participation && !service.isActorInvitedToBid(req.user as any, bid)) {
      throw new ApiError(404, 'Bid not found', 'BID_NOT_FOUND');
    }
  }
  return apiResponse.success(res, { bid: service.serializeBid(bid, { actor: req.user }), participation: participation ? service.serializeParticipation(participation, { canSeeFinancial: true, bid }) : null }, 200, 'Bid status fetched');
}));

router.post('/bids/:bidId/clarifications/:clarificationId/respond', authenticate, requireAccountType('seller'), requirePermission('bid.submit'), upload.single('file'), validate({ params: clarificationParamSchema, body: z.object({ response: z.string().trim().min(2).max(5000) }) }), asyncRoute(async (req, res) => {
  const data = await service.respondClarification(req, req.params.bidId, Number(req.params.clarificationId), req.body.response);
  return apiResponse.success(res, data, 200, 'Clarification response submitted');
}));

router.post('/bids/:bidId/clarifications/ask', authenticate, requireAccountType('seller'), requirePermission('bid.submit'), validate({ params: idParamSchema, body: z.object({ question: z.string().trim().min(5).max(3000) }) }), asyncRoute(async (req, res) => {
  const data = await service.sellerAskClarification(req, req.params.bidId, req.body.question);
  return apiResponse.created(res, data, 'Clarification question submitted successfully');
}));

router.post('/buyer/bids', authenticate, requireAccountType('buyer'), requirePermission('tender.create'), validate({ body: bidBodySchema }), asyncRoute(async (req, res) => {
  const bid = await service.createBuyerBid(req, req.body);
  return apiResponse.created(res, bid, 'Bid draft created');
}));

router.put('/buyer/bids/:bidId', authenticate, requireAccountType('buyer'), requirePermission('tender.update'), validate({ params: idParamSchema, body: bidBaseSchema.partial() }), asyncRoute(async (req, res) => {
  const bid = await service.updateBuyerBid(req, req.params.bidId, req.body);
  return apiResponse.success(res, bid, 200, 'Bid updated');
}));

router.post('/buyer/bids/:bidId/documents', authenticate, requireAccountType('buyer'), requirePermission('tender.update'), upload.single('file'), validate({ params: idParamSchema }), asyncRoute(async (req, res) => {
  const doc = await service.uploadBuyerBidDocument(req, req.params.bidId, req.body);
  return apiResponse.created(res, doc, 'Bid document uploaded');
}));

router.post('/buyer/bids/:bidId/submit-for-approval', authenticate, requireAccountType('buyer'), requirePermission('tender.publish'), validate({ params: idParamSchema }), asyncRoute(async (req, res) => {
  const bid = await service.submitForApproval(req, req.params.bidId);
  return apiResponse.success(res, bid, 200, 'Bid submitted for admin approval');
}));

router.get('/buyer/bids', authenticate, requireAccountType('buyer'), asyncRoute(async (req, res) => {
  const bids = await (prisma as any).procurementBid.findMany({
    where: { buyerId: req.user!.id },
    include: {
      documents: true,
      participations: {
        where: { submissionStatus: 'SUBMITTED', isWithdrawn: false },
        include: {
          seller: { select: { id: true, name: true, email: true, role: true, onboardingStatus: true } },
          documents: true,
          clarifications: { include: { files: true } },
          evaluations: true,
          awards: true
        }
      },
      awards: true,
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
    orderBy: { createdAt: 'desc' }
  });
  return apiResponse.success(res, bids.map((bid: any) => service.serializeBid(bid, { actor: req.user, includeFinancial: true })), 200, 'Buyer bids fetched');
}));

router.get('/buyer/bids/:bidId/participants', authenticate, requireAccountType('buyer', 'admin'), requirePermission('tender.view'), validate({ params: idParamSchema }), asyncRoute(async (req, res) => {
  const bid = await service.resolveBid(req.params.bidId);
  service.assertBuyerOwner(req.user!, bid);
  const canSeeFinancial = ['FINANCIAL_EVALUATION', 'L1_GENERATED', 'AWARD_RECOMMENDED', 'AWARDED'].includes(bid.status);
  return apiResponse.success(res, (bid.participations || []).map((p: any) => service.serializeParticipation(p, { canSeeFinancial })), 200, 'Participants fetched');
}));

router.post('/buyer/bids/:bidId/clarifications', authenticate, requireAccountType('buyer', 'admin'), requirePermission('tender.update'), validate({ params: idParamSchema, body: clarificationSchema }), asyncRoute(async (req, res) => {
  const data = await service.askClarification(req, req.params.bidId, req.body);
  return apiResponse.created(res, data, 'Clarification requested');
}));

router.post('/buyer/bids/:bidId/technical-evaluation', authenticate, requireAccountType('buyer', 'admin'), requirePermission('bid.technical.evaluate'), validate({ params: idParamSchema, body: technicalEvaluationSchema }), asyncRoute(async (req, res) => {
  const data = await service.evaluateTechnical(req, req.params.bidId, req.body);
  return apiResponse.success(res, data, 200, 'Technical evaluation saved');
}));

router.post('/buyer/bids/:bidId/complete-technical-evaluation', authenticate, requireAccountType('buyer', 'admin'), requirePermission('bid.technical.evaluate'), validate({ params: idParamSchema }), asyncRoute(async (req, res) => {
  const data = await service.completeTechnicalEvaluation(req, req.params.bidId);
  return apiResponse.success(res, data, 200, 'Technical evaluation completed');
}));

router.post('/buyer/bids/:bidId/open-financial-evaluation', authenticate, requireAccountType('buyer', 'admin'), requirePermission('bid.financial.evaluate'), validate({ params: idParamSchema }), asyncRoute(async (req, res) => {
  const data = await service.openFinancialEvaluation(req, req.params.bidId);
  return apiResponse.success(res, data, 200, 'Financial evaluation opened and L1/L2/L3/L4 ranking generated');
}));

router.post('/buyer/bids/:bidId/recommend-award', authenticate, requireAccountType('buyer', 'admin'), requirePermission('award.recommend'), validate({ params: idParamSchema, body: z.object({ participationId: z.coerce.number().int().positive(), remarks: z.string().trim().max(2000).optional(), adminOverrideReason: z.string().trim().max(2000).optional() }) }), asyncRoute(async (req, res) => {
  const data = await service.recommendAward(req, req.params.bidId, req.body);
  return apiResponse.created(res, data, 'Award recommendation created');
}));

router.get('/admin/bids', authenticate, requireAccountType('admin'), requirePermission('tender.view'), checkFeatureEnabled('admin-bid-approval'), asyncRoute(async (req, res) => {
  const bids = await (prisma as any).procurementBid.findMany({
    include: {
      documents: true,
      participations: true,
      awards: true,
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
    orderBy: { createdAt: 'desc' }
  });
  return apiResponse.success(res, bids.map((bid: any) => service.serializeBid(bid, { actor: req.user, includeParticipants: true, includeFinancial: true })), 200, 'Admin bids fetched');
}));

router.post('/admin/bids/:bidId/approve', authenticate, requireAccountType('admin'), requirePermission('tender.publish'), checkFeatureEnabled('admin-bid-approval'), validate({ params: idParamSchema }), asyncRoute(async (req, res) => {
  const data = await service.approveBid(req, req.params.bidId);
  return apiResponse.success(res, data, 200, 'Bid approved');
}));

router.post('/admin/bids/:bidId/reject', authenticate, requireAccountType('admin'), requirePermission('tender.publish'), checkFeatureEnabled('admin-bid-approval'), validate({ params: idParamSchema, body: z.object({ reason: z.string().trim().min(3).max(2000) }) }), asyncRoute(async (req, res) => {
  const data = await service.rejectBid(req, req.params.bidId, req.body.reason);
  return apiResponse.success(res, data, 200, 'Bid rejected');
}));

router.get('/admin/bids/:bidId/audit', authenticate, requireAccountType('admin'), requirePermission('report.view'), checkFeatureEnabled('admin-bid-approval'), validate({ params: idParamSchema }), asyncRoute(async (req, res) => {
  const bid = await service.resolveBid(req.params.bidId, {});
  const logs = await (prisma as any).procurementAuditLog.findMany({ where: { entityId: String(bid.id) }, orderBy: { createdAt: 'desc' } });
  return apiResponse.success(res, logs, 200, 'Audit trail fetched');
}));

router.get('/admin/bids/:bidId/participants', authenticate, requireAccountType('admin'), requirePermission('tender.view'), checkFeatureEnabled('admin-bid-approval'), validate({ params: idParamSchema }), asyncRoute(async (req, res) => {
  const bid = await service.resolveBid(req.params.bidId, { participations: { include: { seller: { select: { id: true, name: true, email: true, role: true } }, documents: true } } });
  return apiResponse.success(res, (bid.participations || []).map((p: any) => service.serializeParticipation(p, { canSeeFinancial: true })), 200, 'Admin bid participants fetched');
}));

router.post('/admin/bids/:bidId/final-award-approval', authenticate, requireAccountType('admin'), requirePermission('purchase_order.create'), checkFeatureEnabled('admin-bid-approval'), validate({ params: idParamSchema, body: z.object({ awardId: z.coerce.number().int().positive().optional(), remarks: z.string().trim().max(2000).optional() }) }), asyncRoute(async (req, res) => {
  const data = await service.approveFinalAward(req, req.params.bidId, req.body);
  return apiResponse.success(res, data, 200, 'Final award approved and PO generated');
}));

router.get('/admin/procurement/reports', authenticate, requireAccountType('admin'), requirePermission('report.view'), asyncRoute(async (req, res) => {
  const [bids, participations, awards] = await Promise.all([
    (prisma as any).procurementBid.count(),
    (prisma as any).procurementBidParticipation.count(),
    (prisma as any).procurementBidAward.count()
  ]);
  return apiResponse.success(res, { bids, participations, awards, generatedAt: new Date().toISOString() }, 200, 'Procurement report generated');
}));

router.get('/orders/procurement', authenticate, asyncRoute(async (req, res) => {
  const data = await orderService.listProcurementOrders(req.user!, req.query);
  return apiResponse.success(res, data, 200, 'Procurement orders fetched');
}));

router.get('/orders/procurement/:orderId', authenticate, validate({ params: orderIdParamSchema }), asyncRoute(async (req, res) => {
  const data = await orderService.loadProcurementOrder(req.user!, Number(req.params.orderId));
  return apiResponse.success(res, data, 200, 'Procurement order fetched');
}));

router.get('/seller/awards', authenticate, requireAccountType('seller'), asyncRoute(async (req, res) => {
  const data = await orderService.listSellerAwards(req.user!);
  return apiResponse.success(res, data, 200, 'Seller awards fetched');
}));

router.post('/seller/awards/:awardId/accept', authenticate, requireAccountType('seller'), requirePermission('purchase_order.approve'), validate({ params: awardIdParamSchema }), asyncRoute(async (req, res) => {
  const data = await orderService.acceptSellerAward(req, Number(req.params.awardId), req.body || {});
  return apiResponse.success(res, data, 200, 'Award accepted and delivery opened');
}));

router.post('/seller/awards/:awardId/reject', authenticate, requireAccountType('seller'), requirePermission('purchase_order.approve'), validate({ params: awardIdParamSchema, body: z.object({ reason: z.string().trim().min(5).max(2000) }) }), asyncRoute(async (req, res) => {
  const data = await orderService.rejectSellerAward(req, Number(req.params.awardId), req.body.reason);
  return apiResponse.success(res, data, 200, 'Award rejected');
}));

router.post('/orders/:orderId/delivery/update', authenticate, validate({ params: orderIdParamSchema }), asyncRoute(async (req, res) => {
  const data = await orderService.updateOrderDelivery(req, Number(req.params.orderId), req.body || {});
  return apiResponse.success(res, data, 200, 'Delivery updated');
}));

router.post('/orders/:orderId/delivery/documents', authenticate, upload.single('file'), validate({ params: orderIdParamSchema }), asyncRoute(async (req, res) => {
  const data = await orderService.addDeliveryDocument(req, Number(req.params.orderId), req.body || {});
  return apiResponse.created(res, data, 'Delivery document attached');
}));

router.get('/orders/:orderId/delivery', authenticate, validate({ params: orderIdParamSchema }), asyncRoute(async (req, res) => {
  const order = await orderService.loadProcurementOrder(req.user!, Number(req.params.orderId));
  return apiResponse.success(res, order.deliveryTrackings?.[0] || null, 200, 'Delivery fetched');
}));

router.post('/orders/:orderId/grn', authenticate, validate({ params: orderIdParamSchema }), asyncRoute(async (req, res) => {
  const data = await orderService.createOrderGrn(req, Number(req.params.orderId), req.body || {});
  return apiResponse.created(res, data, 'GRN created');
}));

router.put('/orders/:orderId/grn/:grnId', authenticate, validate({ params: grnParamSchema }), asyncRoute(async (req, res) => {
  const order = await orderService.loadProcurementOrder(req.user!, Number(req.params.orderId));
  if (req.user?.role !== 'admin' && order.buyerId !== req.user?.id) return apiResponse.error(res, 403, 'Buyer access required', 'FORBIDDEN_ROLE');
  const data = await (prisma as any).goodsReceiptNote.update({ where: { id: Number(req.params.grnId) }, data: req.body || {}, include: { items: true, documents: true } });
  return apiResponse.success(res, data, 200, 'GRN updated');
}));

router.post('/orders/:orderId/grn/:grnId/approve', authenticate, validate({ params: grnParamSchema }), asyncRoute(async (req, res) => {
  const data = await orderService.approveOrderGrn(req, Number(req.params.orderId), Number(req.params.grnId), req.body || {});
  return apiResponse.success(res, data, 200, 'GRN approved');
}));

router.post('/orders/:orderId/grn/:grnId/reject', authenticate, validate({ params: grnParamSchema, body: z.object({ rejectionReason: z.string().trim().min(5).max(2000).optional(), reason: z.string().trim().min(5).max(2000).optional() }) }), asyncRoute(async (req, res) => {
  const data = await orderService.rejectOrderGrn(req, Number(req.params.orderId), Number(req.params.grnId), req.body.rejectionReason || req.body.reason || 'Rejected by buyer');
  return apiResponse.success(res, data, 200, 'GRN rejected');
}));

router.post('/orders/:orderId/invoice', authenticate, validate({ params: orderIdParamSchema }), asyncRoute(async (req, res) => {
  const data = await orderService.createOrderInvoice(req, Number(req.params.orderId), req.body || {});
  return apiResponse.created(res, data, 'Invoice submitted');
}));

router.post('/orders/:orderId/invoice/upload', authenticate, upload.single('file'), validate({ params: orderIdParamSchema }), asyncRoute(async (req, res) => {
  const data = await orderService.uploadOrderInvoice(req, Number(req.params.orderId), req.body || {});
  return apiResponse.created(res, data, 'Invoice uploaded');
}));

router.post('/orders/:orderId/invoice/:invoiceId/approve', authenticate, validate({ params: invoiceParamSchema }), asyncRoute(async (req, res) => {
  const data = await orderService.approveOrderInvoice(req, Number(req.params.orderId), Number(req.params.invoiceId));
  return apiResponse.success(res, data, 200, 'Invoice approved');
}));

router.post('/orders/:orderId/invoice/:invoiceId/reject', authenticate, validate({ params: invoiceParamSchema, body: z.object({ reason: z.string().trim().min(5).max(2000) }) }), asyncRoute(async (req, res) => {
  const data = await orderService.rejectOrderInvoice(req, Number(req.params.orderId), Number(req.params.invoiceId), req.body.reason);
  return apiResponse.success(res, data, 200, 'Invoice rejected');
}));

router.post('/orders/:orderId/payment/initiate', authenticate, validate({ params: orderIdParamSchema }), asyncRoute(async (req, res) => {
  const data = await orderService.initiateOrderPayment(req, Number(req.params.orderId), req.body || {});
  return apiResponse.created(res, data, 'Payment initiated');
}));

router.get('/orders/:orderId/payment/status', authenticate, validate({ params: orderIdParamSchema }), asyncRoute(async (req, res) => {
  const data = await orderService.getOrderPaymentStatus(req.user!, Number(req.params.orderId));
  return apiResponse.success(res, data, 200, 'Payment status fetched');
}));

router.post('/orders/:orderId/settlement/mark-confirmed', authenticate, requireAccountType('admin'), requirePermission('payment.verify'), validate({ params: orderIdParamSchema }), asyncRoute(async (req, res) => {
  const data = await orderService.markSettlementConfirmed(req, Number(req.params.orderId), req.body || {});
  return apiResponse.success(res, data, 200, 'Settlement confirmed');
}));

router.get('/admin/settlements', authenticate, requireAccountType('admin'), requirePermission('report.view'), asyncRoute(async (req, res) => {
  const data = await orderService.listAdminSettlements(req.user!, req.query);
  return apiResponse.success(res, data, 200, 'Settlements fetched');
}));

export default router;
