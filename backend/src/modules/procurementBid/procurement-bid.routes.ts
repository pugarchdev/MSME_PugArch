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
import { getAccessTokenFromRequest } from '../../services/auth-cookie.service.js';
import { ApiError } from '../../utils/ApiError.js';
import { logger } from '../../config/logger.js';

const router = Router();

const optionalActor = async (req: AuthRequest) => {
  const authHeader = req.headers.authorization || '';
  const [scheme, headerToken] = authHeader.split(' ');
  const canUseHeaderToken = scheme === 'Bearer' && headerToken && !['null', 'undefined', 'cookie-session'].includes(headerToken);
  const token = canUseHeaderToken
    ? headerToken
    : (req.query.token && typeof req.query.token === 'string')
      ? req.query.token
      : getAccessTokenFromRequest(req);

  if (!token) return null;
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
      console.error('=================== [PROCUREMENT_ROUTE_ERROR] STACK TRACE ===================');
      console.error(err?.stack || err);
      console.error('=============================================================================');

      logger.error({
        err,
        message: err?.message,
        stack: err?.stack,
        code: err?.code,
        path: req.originalUrl || req.path,
        method: req.method,
        body: req.body,
        params: req.params,
        user: req.user
      }, '[PROCUREMENT_ROUTE_ERROR] Route execution exception');

      if (err instanceof ApiError) {
        return apiResponse.error(res, err.statusCode, err.message, err.code, err.details);
      }
      return apiResponse.error(res, err?.statusCode || 500, err?.message || 'Unable to complete procurement request', err?.code || 'REQUEST_FAILED', { stack: err?.stack });
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

const flexibleParticipationIdSchema = z.union([z.number(), z.string()]).transform(val => {
  if (typeof val === 'number') return val;
  const parsed = Number(String(val).replace(/^[^\d]+/, ''));
  return isNaN(parsed) ? val : parsed;
});

const idParamSchema = z.object({ bidId: z.string().trim().min(1) });
const participationParamSchema = idParamSchema.extend({ participationId: flexibleParticipationIdSchema });
const clarificationParamSchema = idParamSchema.extend({ clarificationId: z.coerce.number().int().positive() });

const financialQuoteSchema = z.object({
  quotedAmount: z.coerce.number().nonnegative(),
  gstPercentage: z.coerce.number().min(0).max(100).optional(),
  totalAmount: z.coerce.number().nonnegative().optional(),
  makeBrand: z.string().trim().max(160).optional(),
  model: z.string().trim().max(160).optional(),
  offeredItemDescription: z.string().trim().max(20000).optional()
});

const clarificationSchema = z.object({
  participationId: flexibleParticipationIdSchema,
  clarificationType: z.string().trim().min(2).max(80),
  question: z.string().trim().min(5).max(3000),
  dueDate: z.coerce.date().optional()
});

const technicalEvaluationSchema = z.object({
  evaluations: z.array(z.object({
    participationId: flexibleParticipationIdSchema,
    status: z.enum(['QUALIFIED', 'DISQUALIFIED']),
    remarks: z.string().trim().max(2000).optional(),
    score: z.coerce.number().min(0).max(100).optional()
  })).min(1)
});

const orderIdParamSchema = z.object({ orderId: z.coerce.number().int().positive() });
const awardIdParamSchema = z.object({ awardId: z.coerce.number().int().positive() });
const grnParamSchema = orderIdParamSchema.extend({ grnId: z.coerce.number().int().positive() });
const invoiceParamSchema = orderIdParamSchema.extend({ invoiceId: z.coerce.number().int().positive() });

router.get('/procurement-bids', asyncRoute(async (req, res) => {
  const actor = await optionalActor(req);
  const data = await service.listPublicBids(req.query, actor);
  return apiResponse.success(res, data, 200, 'Bids fetched successfully');
}));

router.get('/procurement-bids/my', authenticate, requireAccountType('seller', 'buyer', 'admin'), asyncRoute(async (req, res) => {
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

router.get('/procurement-bids/:bidId', validate({ params: idParamSchema }), asyncRoute(async (req, res) => {
  const actor = await optionalActor(req);
  const originalToken = req.params.bidId;
  let token = originalToken;

  if (token.startsWith('TENDER-') || token.startsWith('TND-')) {
    const data = await service.resolveTenderBidActivity(token);
    return apiResponse.success(res, data, 200, 'Tender opportunity details fetched successfully');
  }

  // Check if token refers to a Rate Contract in db.contract first
  if (token.startsWith('RC-') || token.startsWith('RATE-') || /^\d+$/.test(token)) {
    const rawNum = Number(token.replace(/^(RC-|RATE-)/, '')) || (/^\d+$/.test(token) ? Number(token) : 0);
    const validId = (rawNum > 0 && rawNum <= 2147483647) ? rawNum : 0;
    const rateContract = await (prisma as any).contract.findFirst({
      where: {
        contractType: 'RATE_CONTRACT',
        OR: [
          { contractNumber: token },
          { contractNumber: `RC-${token}` },
          ...(validId > 0 ? [{ id: validId }] : [])
        ]
      }
    });

    if (rateContract) {
      const meta = typeof rateContract.metadata === 'string' ? JSON.parse(rateContract.metadata) : (rateContract.metadata || {});
      const reqId = Number(meta.requirementId || 0);
      const reqNum = meta.requirementNumber;

      let srcReq = (reqId || reqNum) ? await (prisma as any).requirement.findFirst({
        where: { OR: [{ id: reqId }, { requirementNumber: reqNum }] },
        include: {
          items: true,
          organization: { select: { id: true, organizationName: true, organizationType: true, verificationStatus: true, city: true, district: true, state: true } },
          category: true,
          buyer: { select: { id: true, name: true, email: true, mobile: true, role: true, buyerProfile: { select: { departmentName: true, representativeName: true, email: true, mobile: true } } } },
        }
      }) : null;

      const realTitle = rateContract.title || meta.contractTitle || meta.title || srcReq?.title || `Annual Rate Contract ${rateContract.contractNumber}`;
      const realCategory = meta.contractCategory || srcReq?.category?.name || 'Rate Contract';
      const itemRateSchedule = Array.isArray(meta.itemRateSchedule) ? meta.itemRateSchedule : [];
      
      const items = (srcReq?.items && srcReq.items.length > 0)
        ? srcReq.items.map((i: any) => ({
            id: String(i.id),
            itemName: i.itemName || i.name || '',
            description: i.description || i.specifications || '',
            quantity: Number(i.quantity || 1),
            unit: i.unitOfMeasure || i.unit || 'Nos',
            unitOfMeasure: i.unitOfMeasure || i.unit || 'Nos',
            estimatedUnitPrice: i.estimatedUnitPrice ? Number(i.estimatedUnitPrice) : undefined,
            specifications: i.specifications || undefined
          }))
        : itemRateSchedule.map((i: any, idx: number) => ({
            id: String(idx + 1),
            itemName: i.itemName || `Rate Schedule Item ${idx + 1}`,
            description: i.specification || i.description || '',
            quantity: Number(i.estimatedAnnualQuantity || 1),
            unit: i.uom || 'Nos',
            unitOfMeasure: i.uom || 'Nos',
            estimatedUnitPrice: Number(i.baseRate || 0),
            specifications: i
          }));

      const selectedSupplierIds = (meta.selectedSuppliers || []).map((s: any) => Number(s.supplierId || s.id)).filter(Boolean);
      const reqIds = Array.from(new Set([rateContract.id, srcReq?.id, reqId].filter(Boolean) as number[]));
      
      const allPossibleResponses = await (prisma as any).requirementResponse.findMany({
        where: {
          OR: [
            ...(reqIds.length > 0 ? [{ requirementId: { in: reqIds } }] : []),
            ...(selectedSupplierIds.length > 0 ? [{ sellerUserId: { in: selectedSupplierIds } }] : []),
            ...(selectedSupplierIds.length > 0 ? [{ sellerOrganizationId: { in: selectedSupplierIds } }] : [])
          ]
        },
        include: {
          sellerUser: { select: { id: true, name: true, email: true, mobile: true, role: true, organizationId: true } },
          sellerOrganization: { select: { organizationName: true } }
        }
      }).catch(() => []);

      const rateContractItemNames = itemRateSchedule.map((i: any) => String(i.itemName || '').toLowerCase().trim()).filter(Boolean);

      const legacyResponses = allPossibleResponses.filter((r: any) => {
        if (reqIds.includes(r.requirementId)) return true;
        const respData = typeof r.responseData === 'string' ? JSON.parse(r.responseData) : (r.responseData || {});
        const lineItems = Array.isArray(respData.lineItems) ? respData.lineItems : [];
        return lineItems.some((item: any) => rateContractItemNames.includes(String(item.itemName || '').toLowerCase().trim()));
      });

      const mappedParticipations = legacyResponses.map((r: any) => {
        const respData = typeof r.responseData === 'string' ? JSON.parse(r.responseData) : (r.responseData || {});
        return {
          id: r.id,
          bidId: rateContract.id,
          sellerId: r.sellerUserId,
          seller: { ...r.sellerUser, organization: r.sellerOrganization },
          participationNumber: `PRT-${r.id}`,
          technicalStatus: r.status === 'SHORTLISTED' || r.status === 'ACCEPTED' ? 'QUALIFIED' : (r.status === 'REJECTED' ? 'DISQUALIFIED' : 'PENDING'),
          financialStatus: 'OPENED',
          financialSealed: false,
          finalStatus: r.status === 'ACCEPTED' ? 'AWARDED' : 'PENDING',
          submissionStatus: 'SUBMITTED',
          quotedAmount: r.offeredPrice,
          totalAmount: r.offeredPrice,
          offeredQuantity: r.offeredQuantity,
          deliveryTimeline: r.deliveryTimeline || respData.deliveryTimeline,
          terms: r.terms || respData.terms,
          makeBrand: respData.makeBrand || r.makeBrand,
          model: respData.model || r.model,
          offeredItemDescription: r.message || '',
          responseData: respData,
          lineItems: Array.isArray(respData.lineItems) ? respData.lineItems : [],
          createdAt: r.createdAt,
          submittedAt: r.createdAt,
        };
      });

      const formatDateStr = (val: any) => {
        if (!val) return '-';
        if (typeof val === 'string') return val.slice(0, 10);
        if (val instanceof Date) return val.toISOString().slice(0, 10);
        return String(val).slice(0, 10);
      };
      const startDateStr = formatDateStr(rateContract.startDate);
      const endDateStr = formatDateStr(rateContract.endDate);

      const synthesizedRateContract = {
        id: rateContract.id,
        bidNumber: rateContract.contractNumber || `RC-${rateContract.id}`,
        title: realTitle,
        description: meta.contractDescription || srcReq?.description || '',
        buyerId: meta.buyerId || srcReq?.buyerId || (actor?.id ? Number(actor.id) : 0),
        buyerOrganizationName: meta.buyerOrganizationName || srcReq?.organization?.organizationName || 'Buyer Organization',
        buyerType: 'Private Enterprise',
        departmentName: srcReq?.buyer?.buyerProfile?.departmentName || 'Procurement',
        category: realCategory,
        subCategory: meta.contractSubCategory || '',
        bidType: 'Rate Contract',
        procurementType: 'Rate Contract',
        quantity: items.reduce((sum: number, i: any) => sum + Number(i.quantity || 0), 0) || 1,
        unit: items[0]?.unitOfMeasure || 'Nos',
        estimatedValue: Number(rateContract.value || srcReq?.estimatedValue || 0),
        deliveryLocation: meta.deliverySla || srcReq?.deliveryLocation || 'Location specified in contract',
        startDate: rateContract.startDate || srcReq?.createdAt,
        endDate: rateContract.endDate || srcReq?.requiredBy || rateContract.createdAt,
        status: String(rateContract.status || 'ACTIVE'),
        approvalStatus: 'APPROVED',
        lifecycleStage: 'SELLER_PARTICIPATION',
        evaluationMethod: 'L1',
        isEmdRequired: Boolean(meta.securityDepositRequired),
        emdAmount: meta.securityDepositAmount ? Number(meta.securityDepositAmount) : null,
        packetType: 'SINGLE_PACKET',
        technicalPacket: {
          basics: {
            title: realTitle,
            description: meta.contractDescription,
            category: realCategory,
            deliveryLocation: meta.deliverySla
          },
          terms: {
            termsAndConditions: [
              `Validity: ${startDateStr} to ${endDateStr}`,
              `Rate Validity: ${meta.rateValidityPeriod || '-'}`,
              `Call-off Orders: ${meta.callOffOrderAllowed ? 'Allowed' : 'Not Allowed'}`,
              `Price Variation: ${meta.priceVariationClause || 'FIXED_PRICE'}`
            ]
          }
        },
        termsAndConditions: [
          `Validity: ${startDateStr} to ${endDateStr}`,
          `Rate Validity: ${meta.rateValidityPeriod || '-'}`,
          `Call-off Orders: ${meta.callOffOrderAllowed ? 'Allowed' : 'Not Allowed'}`,
          `Price Variation: ${meta.priceVariationClause || 'FIXED_PRICE'}`
        ],
        eligibilityCriteria: meta.selectedSuppliers ? meta.selectedSuppliers.map((s: any) => s.supplierName || `Supplier ${s.supplierId}`) : [],
        requiredDocuments: [],
        createdAt: rateContract.createdAt,
        updatedAt: rateContract.updatedAt,
        buyerOrganization: srcReq?.organization || { organizationName: meta.buyerOrganizationName },
        buyer: srcReq?.buyer || actor,
        documents: meta.contractDocument?.fileAssetId ? [{
          id: `rcdoc-${rateContract.id}`,
          documentType: 'RATE_CONTRACT_DOCUMENT',
          fileName: meta.contractDocument.fileName || 'Rate Contract Document',
          fileUrl: null
        }] : [],
        participations: mappedParticipations,
        participantsCount: mappedParticipations.length,
        items,
        sourceModel: 'RATE_CONTRACT',
        sourceId: rateContract.id
      };

      return apiResponse.success(res, synthesizedRateContract, 200, 'Rate Contract details fetched successfully');
    }
  }

  let bid: any;
  try {
    bid = await service.resolveBid(originalToken, { ...service.bidInclude, participations: { include: { seller: { include: { organization: true } }, documents: true } } });

    // MINIMAL FIX: Load legacy responses if native participations are empty
    if (bid && bid.participations && bid.participations.length === 0 && bid.bidNumber && bid.bidNumber.startsWith('REQ-')) {
      const legacyReq = await prisma.requirement.findFirst({ where: { requirementNumber: bid.bidNumber } });
      if (legacyReq) {
        const legacyResponses = await prisma.requirementResponse.findMany({
          where: { requirementId: legacyReq.id },
          include: {
            sellerUser: { select: { id: true, name: true, email: true, mobile: true, role: true, organizationId: true } },
            sellerOrganization: { select: { organizationName: true } }
          }
        });
        bid.participations = legacyResponses.map((r: any) => {
          const respData = typeof r.responseData === 'string' ? JSON.parse(r.responseData) : (r.responseData || {});
          const rawDocs: any[] = Array.isArray(respData.documents) ? respData.documents : [];
          const docs = rawDocs.map((d: any, idx: number) => ({
            id: d.id || `rdoc-${r.id}-${idx}`,
            documentName: d.documentName || d.name || d.fileName || 'Document',
            fileName: d.fileName || d.name || 'file.pdf',
            fileUrl: d.fileUrl || d.url || null,
            fileKey: d.fileKey || null,
            fileAssetId: d.fileAssetId || null,
            documentCategory: d.documentCategory || d.category || 'TECHNICAL_PROPOSAL',
            mimeType: d.mimeType || 'application/pdf',
            documentStatus: d.documentStatus || 'UPLOADED',
            uploadedAt: d.uploadedAt || r.createdAt,
          }));
          if (r.attachmentUrl && !docs.some((d: any) => d.fileUrl === r.attachmentUrl || d.url === r.attachmentUrl)) {
            docs.unshift({
              id: `att-${r.id}`,
              documentName: 'Uploaded Quote Attachment',
              fileName: 'Quotation_Attachment.pdf',
              fileUrl: r.attachmentUrl,
              fileKey: null,
              fileAssetId: null,
              documentCategory: 'TECHNICAL_PROPOSAL',
              mimeType: 'application/pdf',
              documentStatus: 'UPLOADED',
              uploadedAt: r.createdAt,
            });
          }
          return {
            id: r.id,
            bidId: bid.id,
            sellerId: r.sellerUserId,
            seller: { ...r.sellerUser, organization: r.sellerOrganization },
            participationNumber: `PRT-${r.id}`,
            technicalStatus: r.status === 'SHORTLISTED' || r.status === 'ACCEPTED' ? 'QUALIFIED' : (r.status === 'REJECTED' ? 'DISQUALIFIED' : 'PENDING'),
            financialStatus: 'OPENED',
            financialSealed: false,
            finalStatus: r.status === 'ACCEPTED' ? 'AWARDED' : 'PENDING',
            submissionStatus: 'SUBMITTED',
            quotedAmount: r.offeredPrice,
            totalAmount: r.offeredPrice,
            offeredQuantity: r.offeredQuantity,
            deliveryTimeline: r.deliveryTimeline || respData.deliveryTimeline,
            terms: r.terms || respData.terms,
            makeBrand: respData.makeBrand || r.makeBrand,
            model: respData.model || r.model,
            offeredItemDescription: r.message || '',
            responseData: respData,
            lineItems: Array.isArray(respData.lineItems) ? respData.lineItems : [],
            documents: docs,
            createdAt: r.createdAt,
            submittedAt: r.createdAt,
          };
        });
      }
    }
  } catch (err: any) {
    // Fallback: if no ProcurementBid found, check if this is a Requirement ID, Reference Number, or Rate Contract
    if (err?.code === 'BID_NOT_FOUND' && (/^\d+$/.test(token) || token.startsWith('REQ-') || token.startsWith('RFQ-') || token.startsWith('RC-') || token.startsWith('RATE-'))) {
      const parsedId = (token.startsWith('REQ-') || token.startsWith('RFQ-') || token.startsWith('RC-') || token.startsWith('RATE-'))
        ? Number(token.replace(/^(REQ-|RFQ-|RC-|RATE-)/, ''))
        : Number(token);
      let requirement = null;

      if (Number.isFinite(parsedId) && parsedId > 0 && parsedId <= 2147483647) {
        const buyerReq = await prisma.buyerRequirement.findFirst({
          where: { id: parsedId },
          include: {
            buyerOrganization: { select: { id: true, organizationName: true, organizationType: true, verificationStatus: true, city: true, district: true, state: true } },
            category: true,
            createdBy: { select: { id: true, name: true, email: true, mobile: true, role: true, buyerProfile: { select: { departmentName: true, representativeName: true, email: true, mobile: true } } } },
          }
        });
        if (buyerReq) {
          requirement = buyerReq as any;
          // Map to match the shape expected by the frontend
          requirement.organization = buyerReq.buyerOrganization;
          requirement.buyer = buyerReq.createdBy;
          requirement.buyerId = buyerReq.createdById;
          requirement.organizationId = buyerReq.buyerOrganizationId;
          requirement.requirementNumber = `REQ-${String(Math.abs(Number(buyerReq.id))).padStart(5, '0')}`;
          
          requirement.payload = {
            basics: {
              title: buyerReq.title,
              description: buyerReq.description,
              quantity: buyerReq.quantity,
              unit: buyerReq.unit,
              category: buyerReq.category?.name,
              budgetMin: buyerReq.budgetMin,
              budgetMax: buyerReq.budgetMax,
              deliveryLocation: buyerReq.location,
            },
            internal: {
              contactPerson: buyerReq.contactPerson,
              email: buyerReq.createdBy?.email || buyerReq.createdBy?.buyerProfile?.email,
              mobile: buyerReq.createdBy?.mobile || buyerReq.createdBy?.buyerProfile?.mobile,
            },
            schedule: {
              submissionDate: buyerReq.lastDate,
            },
            terms: {
              termsAndConditions: buyerReq.terms ? [buyerReq.terms] : [],
            },
            requiredDocs: buyerReq.requiredDocuments || [],
          };
        }
      }

      if (!requirement) {
        const searchToken = token.startsWith('RFQ-') ? token.replace('RFQ-', 'REQ-') : token;
        requirement = await prisma.requirement.findFirst({
          where: /^\d+$/.test(searchToken) ? { id: Number(searchToken) } : { requirementNumber: searchToken },
          include: {
            items: true,
            organization: { select: { id: true, organizationName: true, organizationType: true, verificationStatus: true, city: true, district: true, state: true } },
            category: true,
            buyer: { select: { id: true, name: true, email: true, mobile: true, role: true, buyerProfile: { select: { departmentName: true, representativeName: true, email: true, mobile: true } } } },
          }
        });
      }

      // Check RateContract if requirement still not resolved
      if (!requirement) {
        const contract = await (prisma as any).contract.findFirst({
          where: {
            OR: [
              { contractNumber: token },
              { id: Number(token.replace(/^(RC-|RATE-)/, '')) || 0 }
            ]
          }
        });
        if (contract) {
          const meta = (contract.metadata || {}) as any;
          const reqId = Number(meta.requirementId || 0);
          const reqNum = meta.requirementNumber;
          if (reqId || reqNum) {
            requirement = await prisma.requirement.findFirst({
              where: { OR: [{ id: reqId }, { requirementNumber: reqNum }] },
              include: {
                items: true,
                organization: { select: { id: true, organizationName: true, organizationType: true, verificationStatus: true, city: true, district: true, state: true } },
                category: true,
                buyer: { select: { id: true, name: true, email: true, mobile: true, role: true, buyerProfile: { select: { departmentName: true, representativeName: true, email: true, mobile: true } } } },
              }
            });
          }
          if (!requirement) {
            // Synthesize requirement directly from RateContract
            requirement = {
              id: contract.id,
              requirementNumber: contract.contractNumber || `RC-${contract.id}`,
              title: contract.title || meta.contractTitle || `Rate Contract ${contract.contractNumber}`,
              description: meta.contractDescription || '',
              buyerId: meta.buyerId || 0,
              organizationId: meta.buyerOrganizationId || 0,
              status: String(contract.status || 'ACTIVE'),
              estimatedValue: Number(contract.value || 0),
              createdAt: contract.createdAt,
              updatedAt: contract.updatedAt,
              items: Array.isArray(meta.itemRateSchedule) ? meta.itemRateSchedule.map((i: any) => ({
                itemName: i.itemName,
                quantity: i.estimatedAnnualQuantity,
                unitOfMeasure: i.uom,
                specifications: i
              })) : [],
              organization: { organizationName: meta.buyerOrganizationName || 'Buyer Org' },
              buyer: null,
              payload: {
                basics: {
                  title: contract.title,
                  description: meta.contractDescription,
                  category: meta.contractCategory,
                  deliveryLocation: meta.deliverySla
                }
              }
            } as any;
          }
        }
      }

      if (requirement) {
        let participations: any[] = [];
        if (actor?.role === 'buyer' || actor?.role === 'admin' || actor?.role === 'master_admin') {
            let targetRequirementId = requirement.id;

            if (!('createdById' in requirement)) {
                const shadowBuyerReq = await prisma.buyerRequirement.findFirst({
                    where: {
                        title: requirement.title,
                        description: requirement.description || requirement.title,
                        createdById: requirement.buyerId,
                        buyerOrganizationId: requirement.organizationId || requirement.buyer?.organizationId || null
                    }
                });
                if (shadowBuyerReq) {
                    targetRequirementId = shadowBuyerReq.id;
                }
            }

            const requirementIdsToQuery = Array.from(new Set([requirement.id, targetRequirementId].filter(Boolean) as number[]));
            const responses = await prisma.requirementResponse.findMany({
                where: { requirementId: { in: requirementIdsToQuery } },
                include: { 
                    sellerUser: { select: { id: true, name: true, email: true, mobile: true, role: true, organizationId: true } },
                    sellerOrganization: { select: { organizationName: true } }
                }
            });

            // Also query ProcurementBidParticipation if linked
            const bidParticipations = await (prisma as any).procurementBidParticipation.findMany({
                where: {
                  OR: [
                    { bidId: requirement.id },
                    { bid: { bidNumber: requirement.requirementNumber } }
                  ]
                },
                include: {
                  seller: { include: { organization: true } },
                  documents: true
                }
            }).catch(() => []);

            const mappedLegacy = responses.map((r: any) => {
                const respData = typeof r.responseData === 'string' ? JSON.parse(r.responseData) : (r.responseData || {});
                const rawDocs: any[] = Array.isArray(respData.documents) ? respData.documents : [];
                const docs = rawDocs.map((d: any, idx: number) => ({
                    id: d.id || `rdoc-${r.id}-${idx}`,
                    documentName: d.documentName || d.name || d.fileName || 'Document',
                    fileName: d.fileName || d.name || 'file.pdf',
                    fileUrl: d.fileUrl || d.url || null,
                    fileKey: d.fileKey || null,
                    fileAssetId: d.fileAssetId || null,
                    documentCategory: d.documentCategory || d.category || 'TECHNICAL_PROPOSAL',
                    mimeType: d.mimeType || 'application/pdf',
                    documentStatus: d.documentStatus || 'UPLOADED',
                    uploadedAt: d.uploadedAt || r.createdAt,
                }));
                if (r.attachmentUrl && !docs.some((d: any) => d.fileUrl === r.attachmentUrl || d.url === r.attachmentUrl)) {
                    docs.unshift({
                        id: `att-${r.id}`,
                        documentName: 'Uploaded Quote Attachment',
                        fileName: 'Quotation_Attachment.pdf',
                        fileUrl: r.attachmentUrl,
                        fileKey: null,
                        fileAssetId: null,
                        documentCategory: 'TECHNICAL_PROPOSAL',
                        mimeType: 'application/pdf',
                        documentStatus: 'UPLOADED',
                        uploadedAt: r.createdAt,
                    });
                }
                return {
                    id: r.id,
                    bidId: requirement.id,
                    sellerId: r.sellerUserId,
                    seller: {
                        ...r.sellerUser,
                        organization: r.sellerOrganization
                    },
                    participationNumber: `PRT-${r.id}`,
                    technicalStatus: r.status === 'SHORTLISTED' || r.status === 'ACCEPTED' ? 'QUALIFIED' : (r.status === 'REJECTED' ? 'DISQUALIFIED' : 'PENDING'),
                    financialStatus: 'OPENED',
                    financialSealed: false,
                    finalStatus: r.status === 'ACCEPTED' ? 'AWARDED' : 'PENDING',
                    submissionStatus: 'SUBMITTED',
                    quotedAmount: r.offeredPrice,
                    totalAmount: r.offeredPrice,
                    offeredQuantity: r.offeredQuantity,
                    deliveryTimeline: r.deliveryTimeline || respData.deliveryTimeline,
                    terms: r.terms || respData.terms,
                    makeBrand: respData.makeBrand || r.makeBrand,
                    model: respData.model || r.model,
                    offeredItemDescription: r.message || '',
                    responseData: respData,
                    lineItems: Array.isArray(respData.lineItems) ? respData.lineItems : [],
                    documents: docs,
                    createdAt: r.createdAt,
                    submittedAt: r.createdAt,
                };
            });

            participations = [...mappedLegacy, ...bidParticipations];
        }

        const payload = requirement.payload && typeof requirement.payload === 'object' ? requirement.payload as any : {};
        const reqMeta = (requirement as any).metadata || {};
        const isRateContract = Boolean(requirement.isRateContract || requirement.contractNumber || String(token).startsWith('RC-') || String(token).startsWith('RATE-'));
        const contractTitle = requirement.contractTitle || reqMeta.contractTitle || requirement.title || payload.basics?.title;

        // If legacy requirement doesn't have basics/internal/schedule/terms in payload, reconstruct them
        const basics = payload.basics || {
          title: contractTitle || requirement.title,
          description: requirement.description,
          quantity: requirement.items?.[0]?.quantity,
          unit: requirement.items?.[0]?.unitOfMeasure,
          category: requirement.category?.name,
          estimatedValue: requirement.estimatedValue,
          deliveryLocation: [requirement.organization?.district, requirement.organization?.state].filter(Boolean).join(', ')
        };
        const schedule = payload.schedule || {
          submissionDate: requirement.requiredBy || requirement.createdAt
        };
        const terms = payload.terms || {};
        const internal = payload.internal || {
          contactPerson: requirement.buyer?.buyerProfile?.contactPerson || requirement.buyer?.name,
          email: requirement.buyer?.email || requirement.buyer?.buyerProfile?.email,
          mobile: requirement.buyer?.mobile || requirement.buyer?.buyerProfile?.mobile
        };

        // Merge back into payload so frontend technicalPacket has these fields
        if (contractTitle && !basics.title) basics.title = contractTitle;
        payload.basics = basics;
        payload.schedule = schedule;
        payload.terms = terms;
        payload.internal = internal;
        
        let reqDocuments: any[] = [];
        if (requirement?.id) {
          const fileAssets = await (prisma as any).fileAsset.findMany({
            where: {
              OR: [
                { entityType: 'requirement', entityId: Number(requirement.id) },
                { entityType: 'procurement_bid', entityId: Number(requirement.id) }
              ],
              status: 'active'
            }
          }).catch(() => []);
          reqDocuments = (fileAssets || []).map((asset: any) => ({
            id: asset.id,
            documentType: 'REQUIRED_DOCUMENT',
            fileName: asset.originalName,
            mimeType: asset.mimeType,
            fileSize: asset.size,
            visibility: 'PUBLIC',
            fileAssetId: asset.id,
            fileUrl: asset.url || `/api/files/${asset.id}/view`
          }));
        }

        const resolvedTitle = contractTitle || requirement.title || basics.title || (requirement.requirementNumber ? `Rate Contract ${requirement.requirementNumber}` : 'Procurement Bid');

        const synthesized = {
          id: requirement.id,
          bidNumber: requirement.requirementNumber || `REQ-${requirement.id}`,
          title: resolvedTitle,
          description: requirement.description || basics.description || '',
          buyerId: requirement.buyerId,
          buyerOrganizationName: requirement.organization?.organizationName || internal.orgName || basics.buyerOrganizationName || '',
          buyerType: basics.buyerType || requirement.organization?.organizationType || 'Private Enterprise',
          departmentName: requirement.buyer?.buyerProfile?.departmentName || internal.departmentName || 'Procurement',
          category: basics.category || requirement.category?.name || (isRateContract ? 'Rate Contract' : 'General procurement'),
          subCategory: basics.subCategory || '',
          bidType: isRateContract ? 'Rate Contract' : (basics.whatAreYouBuying || 'Product'),
          procurementType: isRateContract ? 'Rate Contract' : (requirement.procurementMethod || payload.recommendation?.id || 'RFQ'),
          quantity: basics.quantity ? Number(basics.quantity) : (requirement.items?.[0]?.quantity || null),
          unit: basics.unit || requirement.items?.[0]?.unitOfMeasure || '',
          estimatedValue: Number(requirement.estimatedValue || basics.estimatedValue || 0),
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
          documents: reqDocuments,
          participations: participations,
          clarifications: [],
          evaluations: [],
          awards: [],
          participantsCount: participations.length,
          sourceModel: isRateContract ? 'RATE_CONTRACT' : 'REQUIREMENT',
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
  const sellerCanSeeParticipants = actor?.role === 'seller' && (bid.participations || []).some((p: any) => p.sellerId === Number(actor.id) || (actor.organizationId && p.seller?.organizationId === actor.organizationId));
  
  const sellerIds = (bid.participations || []).map((p: any) => p.sellerId);
  const sellerRatings = await service.getAverageRatingsForSellers(sellerIds);

  return apiResponse.success(res, service.serializeBid(bid, { actor: actor || undefined, detail: true, includeParticipants: sellerCanSeeParticipants, sellerRatings }), 200, 'Bid details fetched successfully');
}));

router.get('/procurement-bids/:bidId/timeline', validate({ params: idParamSchema }), asyncRoute(async (req, res) => {
  const bid = await service.resolveBid(req.params.bidId, {});
  const timeline = await service.getProcurementTimeline(bid.id);
  return apiResponse.success(res, timeline, 200, 'Procurement lifecycle timeline fetched');
}));

router.post('/procurement-bids/:bidId/participate', authenticate, requireAccountType('seller'), requirePermission('bid.submit'), validate({ params: idParamSchema }), asyncRoute(async (req, res) => {
  const participation = await service.startParticipation(req, req.params.bidId);
  return apiResponse.created(res, participation, 'Bid participation started');
}));

router.post('/procurement-bids/:bidId/participation/:participationId/technical-documents', authenticate, requireAccountType('seller'), requirePermission('bid.submit'), upload.single('file'), validate({ params: participationParamSchema }), asyncRoute(async (req, res) => {
  const category = String(req.body.documentCategory || 'TECHNICAL_COMPLIANCE');
  const doc = await service.uploadParticipationDocument(req, req.params.bidId, Number(req.params.participationId), category);
  return apiResponse.created(res, doc, 'Technical document uploaded');
}));

router.post('/procurement-bids/:bidId/participation/:participationId/financial-quote', authenticate, requireAccountType('seller'), requirePermission('bid.submit'), upload.single('file'), validate({ params: participationParamSchema, body: financialQuoteSchema }), asyncRoute(async (req, res) => {
  const data = await service.saveFinancialQuote(req, req.params.bidId, Number(req.params.participationId), req.body);
  return apiResponse.success(res, data, 200, 'Financial quote saved securely');
}));

router.post('/procurement-bids/:bidId/participation/:participationId/submit', authenticate, requireAccountType('seller'), requirePermission('bid.submit'), validate({ params: participationParamSchema, body: z.object({ acceptedTerms: z.boolean().optional() }).passthrough().optional() }), asyncRoute(async (req, res) => {
  const data = await service.finalSubmitParticipation(req, req.params.bidId, Number(req.params.participationId), req.body || {});
  return apiResponse.success(res, data, 200, 'Participation submitted successfully');
}));

router.get('/seller/procurement-bids', authenticate, requireAccountType('seller'), asyncRoute(async (req, res) => {
  const rows = await (prisma as any).procurementBidParticipation.findMany({
    where: { sellerId: req.user!.id },
    include: { bid: true, documents: true, clarifications: { include: { files: true } }, evaluations: true, awards: true },
    orderBy: { createdAt: 'desc' }
  });
  return apiResponse.success(res, rows.map((row: any) => ({ ...service.serializeParticipation(row, { canSeeFinancial: true, ownView: true }), bid: service.serializeBid(row.bid, { actor: req.user }) })), 200, 'Seller bids fetched');
}));

router.get('/seller/procurement-bids/:bidId/status', authenticate, requireAccountType('seller'), validate({ params: idParamSchema }), asyncRoute(async (req, res) => {
  const bid = await service.resolveBid(req.params.bidId, { participations: { where: { OR: [{ sellerId: req.user!.id }, ...(req.user!.organizationId ? [{ seller: { organizationId: req.user!.organizationId } }] : [])] }, include: { documents: true, clarifications: { include: { files: true } }, evaluations: true, awards: true } } });
  const participation = bid.participations?.[0];
  const isRestrictedBid = service.isRestrictedBidMethod(bid);
  if (isRestrictedBid) {
    if (!participation && !service.isActorInvitedToBid(req.user as any, bid)) {
      throw new ApiError(404, 'Bid not found', 'BID_NOT_FOUND');
    }
  }
  return apiResponse.success(res, { bid: service.serializeBid(bid, { actor: req.user }), participation: participation ? service.serializeParticipation(participation, { canSeeFinancial: true, bid, ownView: true }) : null }, 200, 'Bid status fetched');
}));

router.post('/procurement-bids/:bidId/clarifications/:clarificationId/respond', authenticate, requireAccountType('seller'), requirePermission('bid.submit'), upload.single('file'), validate({ params: clarificationParamSchema, body: z.object({ response: z.string().trim().min(2).max(5000) }) }), asyncRoute(async (req, res) => {
  const data = await service.respondClarification(req, req.params.bidId, Number(req.params.clarificationId), req.body.response);
  return apiResponse.success(res, data, 200, 'Clarification response submitted');
}));

router.post('/procurement-bids/:bidId/clarifications/ask', authenticate, requireAccountType('seller'), requirePermission('bid.submit'), validate({ params: idParamSchema, body: z.object({ question: z.string().trim().min(5).max(3000) }) }), asyncRoute(async (req, res) => {
  const data = await service.sellerAskClarification(req, req.params.bidId, req.body.question);
  return apiResponse.created(res, data, 'Clarification question submitted successfully');
}));

router.post('/buyer/procurement-bids', authenticate, requireAccountType('buyer'), requirePermission('tender.create'), validate({ body: bidBodySchema }), asyncRoute(async (req, res) => {
  const bid = await service.createBuyerBid(req, req.body);
  return apiResponse.created(res, bid, 'Bid draft created');
}));

router.put('/buyer/procurement-bids/:bidId', authenticate, requireAccountType('buyer'), requirePermission('tender.update'), validate({ params: idParamSchema, body: bidBaseSchema.partial() }), asyncRoute(async (req, res) => {
  const bid = await service.updateBuyerBid(req, req.params.bidId, req.body);
  return apiResponse.success(res, bid, 200, 'Bid updated');
}));

router.post('/buyer/procurement-bids/:bidId/documents', authenticate, requireAccountType('buyer'), requirePermission('tender.update'), upload.single('file'), validate({ params: idParamSchema }), asyncRoute(async (req, res) => {
  const doc = await service.uploadBuyerBidDocument(req, req.params.bidId, req.body);
  return apiResponse.created(res, doc, 'Bid document uploaded');
}));

router.post('/buyer/procurement-bids/:bidId/submit-for-approval', authenticate, requireAccountType('buyer'), requirePermission('tender.publish'), validate({ params: idParamSchema }), asyncRoute(async (req, res) => {
  const bid = await service.submitForApproval(req, req.params.bidId);
  return apiResponse.success(res, bid, 200, 'Bid submitted for admin approval');
}));

const enrichBidsWithResponses = async (bids: any[], buyerId?: number) => {
  if (!bids || !bids.length) return bids;

  try {
    const normalizeStr = (str: any) => String(str || '').trim().toLowerCase().replace(/[^a-z0-9]/g, '');

    // Fetch all non-draft RequirementResponses from DB
    const allReqResponses = await prisma.requirementResponse.findMany({
      where: {
        status: { not: 'DRAFT' }
      },
      include: {
        sellerUser: { select: { id: true, name: true, email: true, mobile: true, role: true, organizationId: true } },
        sellerOrganization: { select: { organizationName: true } },
        requirement: { select: { id: true, title: true, createdById: true, buyerOrganizationId: true } }
      }
    }).catch(() => []);

    // Fetch all BuyerRequirements, legacy Requirements, and QuoteResponses
    const [buyerReqs, legacyReqs, quoteRequests, quoteResponses] = await Promise.all([
      prisma.buyerRequirement.findMany({
        select: { id: true, title: true, createdById: true }
      }).catch(() => []),
      prisma.requirement.findMany({
        select: { id: true, title: true, requirementNumber: true, buyerId: true }
      }).catch(() => []),
      prisma.quoteRequest.findMany({
        select: { id: true, subject: true, buyerId: true }
      }).catch(() => []),
      prisma.quoteResponse.findMany({
        where: { status: { not: 'DRAFT' } },
        include: {
          seller: { select: { id: true, name: true, email: true, mobile: true, role: true, organizationId: true } },
          quoteRequest: { select: { id: true, subject: true, buyerId: true } }
        }
      }).catch(() => [])
    ]);

    for (const bid of bids) {
      if (!Array.isArray(bid.participations)) {
        bid.participations = [];
      }

      const existingSellerIds = new Set(bid.participations.map((p: any) => p.sellerId).filter(Boolean));
      const bidIdNum = Number(bid.id);
      const bidSourceIdNum = Number(bid.sourceId);
      const bidReqIdNum = Number(bid.requirementId || 0);
      const bidTitleNorm = normalizeStr(bid.title);
      const bidNumberNorm = normalizeStr(bid.bidNumber);
      const bidReqNumNorm = normalizeStr(bid.requirementNumber);

      // Match RequirementResponses
      for (const r of allReqResponses) {
        const reqId = Number(r.requirementId);
        const reqTitleNorm = normalizeStr(r.requirement?.title);

        const isDirectIdMatch = (bidIdNum > 0 && reqId === bidIdNum) || (bidSourceIdNum > 0 && reqId === bidSourceIdNum) || (bidReqIdNum > 0 && reqId === bidReqIdNum);
        const isTitleMatch = Boolean(bidTitleNorm && reqTitleNorm && bidTitleNorm === reqTitleNorm);

        // Check if reqId belongs to a buyerReq/legacyReq with matching title/number
        const matchedBuyerReq = buyerReqs.find(br => br.id === reqId && (normalizeStr(br.title) === bidTitleNorm || (bidReqNumNorm && normalizeStr(br.id) === bidReqNumNorm)));
        const matchedLegacyReq = legacyReqs.find(lr => lr.id === reqId && (normalizeStr(lr.title) === bidTitleNorm || (bidNumberNorm && normalizeStr(lr.requirementNumber) === bidNumberNorm) || (bidReqNumNorm && normalizeStr(lr.requirementNumber) === bidReqNumNorm)));

        if (isDirectIdMatch || isTitleMatch || matchedBuyerReq || matchedLegacyReq) {
          const sellerId = r.sellerUserId || r.sellerId;
          if (sellerId && !existingSellerIds.has(sellerId)) {
            existingSellerIds.add(sellerId);
            const respData = typeof r.responseData === 'string' ? JSON.parse(r.responseData) : (r.responseData || {});
            bid.participations.push({
              id: r.id,
              bidId: bid.id,
              sellerId: sellerId,
              seller: {
                ...r.sellerUser,
                organization: r.sellerOrganization
              },
              participationNumber: `PRT-REQ-${r.id}`,
              technicalStatus: r.status === 'SHORTLISTED' || r.status === 'ACCEPTED' ? 'QUALIFIED' : (r.status === 'REJECTED' ? 'DISQUALIFIED' : 'PENDING'),
              financialStatus: 'OPENED',
              financialSealed: false,
              finalStatus: r.status === 'ACCEPTED' ? 'AWARDED' : 'PENDING',
              submissionStatus: 'SUBMITTED',
              quotedAmount: Number(r.offeredPrice || 0),
              totalAmount: Number(r.offeredPrice || 0),
              offeredQuantity: r.offeredQuantity,
              deliveryTimeline: r.deliveryTimeline || respData.deliveryTimeline,
              terms: r.terms || respData.terms,
              makeBrand: respData.makeBrand || r.makeBrand,
              model: respData.model || r.model,
              offeredItemDescription: r.message || '',
              responseData: respData,
              lineItems: Array.isArray(respData.lineItems) ? respData.lineItems : [],
              documents: [],
              createdAt: r.createdAt,
              submittedAt: r.createdAt,
            });
          }
        }
      }

      // Match QuoteResponses
      for (const qr of quoteResponses) {
        const qReqId = Number(qr.quoteRequestId);
        const qSubjectNorm = normalizeStr(qr.quoteRequest?.subject);
        const isQuoteIdMatch = (bidSourceIdNum > 0 && qReqId === bidSourceIdNum) || (bidReqIdNum > 0 && qReqId === bidReqIdNum);
        const isQuoteSubjectMatch = Boolean(bidTitleNorm && qSubjectNorm && bidTitleNorm === qSubjectNorm);

        if (isQuoteIdMatch || isQuoteSubjectMatch) {
          const sellerId = qr.sellerId;
          if (sellerId && !existingSellerIds.has(sellerId)) {
            existingSellerIds.add(sellerId);
            bid.participations.push({
              id: qr.id,
              bidId: bid.id,
              sellerId: sellerId,
              seller: qr.seller,
              participationNumber: `PRT-QR-${qr.id}`,
              technicalStatus: 'QUALIFIED',
              financialStatus: 'OPENED',
              financialSealed: false,
              finalStatus: qr.status === 'ACCEPTED' ? 'AWARDED' : 'PENDING',
              submissionStatus: 'SUBMITTED',
              quotedAmount: Number(qr.totalAmount || 0),
              totalAmount: Number(qr.totalAmount || 0),
              offeredItemDescription: qr.notes || '',
              documents: [],
              createdAt: qr.createdAt,
              submittedAt: qr.createdAt,
            });
          }
        }
      }
    }
  } catch (err) {
    console.error('Error enriching bids with responses:', err);
  }

  return bids;
};

router.get('/buyer/procurement-bids', authenticate, requireAccountType('buyer'), asyncRoute(async (req, res) => {
  const bids = await (prisma as any).procurementBid.findMany({
    where: { buyerId: req.user!.id },
    include: {
      documents: true,
      participations: {
        where: { submissionStatus: { not: 'DRAFT' }, isWithdrawn: false },
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

  // Fetch Rate Contracts and synthesize bid objects for them if not already present
  const allRateContracts = await (prisma as any).contract.findMany({
    where: {
      contractType: 'RATE_CONTRACT'
    },
    orderBy: { updatedAt: 'desc' }
  }).catch(() => []);

  const rateContracts = allRateContracts.filter((c: any) => {
    const meta = typeof c.metadata === 'string' ? JSON.parse(c.metadata) : (c.metadata || {});
    return !meta.buyerId || Number(meta.buyerId) === req.user!.id || String(meta.buyerId) === String(req.user!.id);
  });

  for (const contract of rateContracts) {
    const meta = (contract.metadata || {}) as any;
    const contractNum = contract.contractNumber || `RC-${contract.id}`;
    const exists = bids.some((b: any) => b.bidNumber === contractNum || b.id === contract.id);
    if (!exists) {
      bids.push({
        id: contract.id,
        bidNumber: contractNum,
        title: contract.title || meta.contractTitle || `Annual Rate Contract ${contractNum}`,
        description: meta.contractDescription || contract.title || 'Rate Contract',
        buyerId: Number(meta.buyerId || req.user!.id),
        buyerOrganizationName: meta.buyerOrganizationName || '',
        procurementType: 'Rate Contract',
        bidType: 'Rate Contract',
        category: meta.contractCategory || 'Rate Contract',
        estimatedValue: Number(contract.value || 0),
        status: String(contract.status || 'ACTIVE'),
        approvalStatus: 'APPROVED',
        lifecycleStage: 'SELLER_PARTICIPATION',
        createdAt: contract.createdAt,
        updatedAt: contract.updatedAt,
        participations: [],
        documents: meta.contractDocument?.fileAssetId ? [{
          id: `rcdoc-${contract.id}`,
          documentType: 'RATE_CONTRACT_DOCUMENT',
          fileName: meta.contractDocument.fileName || 'Rate Contract Document',
          fileUrl: null
        }] : [],
        awards: [],
        buyer: req.user,
        sourceModel: 'RATE_CONTRACT',
        sourceId: contract.id,
        requirementId: meta.requirementId ? Number(meta.requirementId) : null,
        requirementNumber: meta.requirementNumber || null,
      });
    }
  }

  await enrichBidsWithResponses(bids, req.user!.id);
  return apiResponse.success(res, bids.map((bid: any) => service.serializeBid(bid, { actor: req.user, includeFinancial: true })), 200, 'Buyer bids fetched');
}));

router.get('/buyer/procurement-bids/:bidId/participants', authenticate, requireAccountType('buyer', 'admin'), requirePermission('tender.view'), validate({ params: idParamSchema }), asyncRoute(async (req, res) => {
  const bid = await service.resolveBid(req.params.bidId);
  service.assertBuyerOwner(req.user!, bid);
  await enrichBidsWithResponses([bid], req.user!.role === 'buyer' ? req.user!.id : undefined);
  const canSeeFinancial = ['FINANCIAL_EVALUATION', 'L1_GENERATED', 'AWARD_RECOMMENDED', 'AWARDED'].includes(bid.status);
  return apiResponse.success(res, (bid.participations || []).map((p: any) => service.serializeParticipation(p, { canSeeFinancial, bid })), 200, 'Participants fetched');
}));

router.post('/buyer/procurement-bids/:bidId/clarifications', authenticate, requireAccountType('buyer', 'admin'), requirePermission('tender.update'), validate({ params: idParamSchema, body: clarificationSchema }), asyncRoute(async (req, res) => {
  const data = await service.askClarification(req, req.params.bidId, req.body);
  return apiResponse.created(res, data, 'Clarification requested');
}));

router.post('/buyer/procurement-bids/:bidId/technical-evaluation', authenticate, requireAccountType('buyer', 'admin'), requirePermission('bid.technical.evaluate'), validate({ params: idParamSchema, body: technicalEvaluationSchema }), asyncRoute(async (req, res) => {
  const data = await service.evaluateTechnical(req, req.params.bidId, req.body);
  return apiResponse.success(res, data, 200, 'Technical evaluation saved');
}));

router.post('/buyer/procurement-bids/:bidId/complete-technical-evaluation', authenticate, requireAccountType('buyer', 'admin'), requirePermission('bid.technical.evaluate'), validate({ params: idParamSchema }), asyncRoute(async (req, res) => {
  const data = await service.completeTechnicalEvaluation(req, req.params.bidId);
  return apiResponse.success(res, data, 200, 'Technical evaluation completed');
}));

router.post('/buyer/procurement-bids/:bidId/open-financial-evaluation', authenticate, requireAccountType('buyer', 'admin'), requirePermission('bid.financial.evaluate'), validate({ params: idParamSchema }), asyncRoute(async (req, res) => {
  const data = await service.openFinancialEvaluation(req, req.params.bidId);
  return apiResponse.success(res, data, 200, 'Financial evaluation opened and L1/L2/L3/L4 ranking generated');
}));

router.post(['/buyer/procurement-bids/:bidId/recommend-award', '/buyer/bids/:bidId/recommend-award'], authenticate, requireAccountType('buyer', 'admin'), requirePermission('award.recommend'), validate({ params: idParamSchema, body: z.object({ participationId: flexibleParticipationIdSchema, remarks: z.string().trim().max(2000).optional(), adminOverrideReason: z.string().trim().max(2000).optional() }) }), asyncRoute(async (req, res) => {
  const data = await service.recommendAward(req, req.params.bidId, req.body);
  return apiResponse.created(res, data, 'Award recommendation created');
}));

router.get('/admin/procurement-bids', authenticate, requireAccountType('admin'), requirePermission('tender.view'), checkFeatureEnabled('admin-bid-approval'), asyncRoute(async (req, res) => {
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
  await enrichBidsWithResponses(bids);
  return apiResponse.success(res, bids.map((bid: any) => service.serializeBid(bid, { actor: req.user, includeParticipants: true, includeFinancial: true })), 200, 'Admin bids fetched');
}));

router.post('/admin/procurement-bids/:bidId/approve', authenticate, requireAccountType('admin'), requirePermission('tender.publish'), checkFeatureEnabled('admin-bid-approval'), validate({ params: idParamSchema }), asyncRoute(async (req, res) => {
  const data = await service.approveBid(req, req.params.bidId);
  return apiResponse.success(res, data, 200, 'Bid approved');
}));

router.post('/admin/procurement-bids/:bidId/reject', authenticate, requireAccountType('admin'), requirePermission('tender.publish'), checkFeatureEnabled('admin-bid-approval'), validate({ params: idParamSchema, body: z.object({ reason: z.string().trim().min(3).max(2000) }) }), asyncRoute(async (req, res) => {
  const data = await service.rejectBid(req, req.params.bidId, req.body.reason);
  return apiResponse.success(res, data, 200, 'Bid rejected');
}));

router.get('/admin/procurement-bids/:bidId/audit', authenticate, requireAccountType('admin'), requirePermission('report.view'), checkFeatureEnabled('admin-bid-approval'), validate({ params: idParamSchema }), asyncRoute(async (req, res) => {
  const bid = await service.resolveBid(req.params.bidId, {});
  const logs = await (prisma as any).procurementAuditLog.findMany({ where: { entityId: String(bid.id) }, orderBy: { createdAt: 'desc' } });
  return apiResponse.success(res, logs, 200, 'Audit trail fetched');
}));

router.get('/admin/procurement-bids/:bidId/participants', authenticate, requireAccountType('admin'), requirePermission('tender.view'), checkFeatureEnabled('admin-bid-approval'), validate({ params: idParamSchema }), asyncRoute(async (req, res) => {
  const bid = await service.resolveBid(req.params.bidId, { participations: { include: { seller: { select: { id: true, name: true, email: true, role: true } }, documents: true } } });
  return apiResponse.success(res, (bid.participations || []).map((p: any) => service.serializeParticipation(p, { canSeeFinancial: true })), 200, 'Admin bid participants fetched');
}));

router.post('/admin/procurement-bids/:bidId/final-award-approval', authenticate, requireAccountType('admin'), requirePermission('purchase_order.create'), checkFeatureEnabled('admin-bid-approval'), validate({ params: idParamSchema, body: z.object({ awardId: z.coerce.number().int().positive().optional(), remarks: z.string().trim().max(2000).optional() }) }), asyncRoute(async (req, res) => {
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
