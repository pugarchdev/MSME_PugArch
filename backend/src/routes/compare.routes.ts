import { Router, type Response } from 'express';
import { z } from 'zod';
import prisma from '../lib/prisma.js';
import { authenticate, type AuthRequest } from '../middleware/authenticate.js';
import { authorize } from '../middleware/authorize.js';
import { apiResponse } from '../utils/apiResponse.js';
import { maskSensitive } from '../utils/maskSensitive.js';

const router = Router();
const db = prisma as any;

const parseIds = (value: unknown) =>
  String(value || '')
    .split(',')
    .map(part => Number(part.trim()))
    .filter(id => Number.isInteger(id) && id > 0)
    .slice(0, 4);

const parseTypedCompareIds = (value: unknown) => {
  const raw = String(value || '')
    .split(',')
    .map(part => part.trim())
    .filter(Boolean)
    .slice(0, 4);
  const productIds: number[] = [];
  const serviceIds: number[] = [];
  for (const item of raw) {
    const [prefix, idText] = item.includes(':') ? item.split(':') : ['product', item];
    const id = Number(idText);
    if (!Number.isInteger(id) || id <= 0) continue;
    if (prefix.toLowerCase().startsWith('service')) serviceIds.push(id);
    else productIds.push(id);
  }
  return { productIds, serviceIds };
};

const isPrivileged = (req: AuthRequest) => req.user?.role === 'admin' || req.user?.role === 'master_admin';

const compareQuerySchema = z.object({
  ids: z.string().trim().optional(),
  productIds: z.string().trim().optional(),
  serviceIds: z.string().trim().optional()
}).passthrough();

router.get('/marketplace/compare', async (req, res: Response) => {
  try {
    const query = compareQuerySchema.parse(req.query);
    const typed = parseTypedCompareIds(query.ids);
    const productIds = [...typed.productIds, ...parseIds(query.productIds)];
    const serviceIds = [...typed.serviceIds, ...parseIds(query.serviceIds)];
    if (productIds.length + serviceIds.length === 0) {
      return apiResponse.success(res, { items: [], limit: 4 });
    }
    if (productIds.length + serviceIds.length > 4) {
      return apiResponse.error(res, 400, 'You can compare up to 4 items', 'COMPARE_LIMIT_EXCEEDED');
    }

    const [products, services] = await Promise.all([
      productIds.length
        ? db.product.findMany({
            where: { id: { in: productIds }, status: 'ACTIVE' },
            include: {
              organization: { select: { id: true, organizationName: true, verificationStatus: true, city: true, state: true, district: true } },
              category: { select: { id: true, name: true, slug: true } },
              images: { include: { fileAsset: true }, orderBy: [{ isPrimary: 'desc' }, { displayOrder: 'asc' }], take: 1 },
              specifications: true,
              certifications: true
            }
          })
        : Promise.resolve([]),
      serviceIds.length
        ? db.service.findMany({
            where: { id: { in: serviceIds }, status: 'ACTIVE' },
            include: {
              organization: { select: { id: true, organizationName: true, verificationStatus: true, city: true, state: true, district: true } },
              category: { select: { id: true, name: true, slug: true } },
              certifications: true
            }
          })
        : Promise.resolve([])
    ]);

    const locationOf = (organization: any) => [organization?.city, organization?.district, organization?.state].filter(Boolean).join(', ');
    const productItems = products.map((product: any) => ({
      type: 'PRODUCT',
      id: product.id,
      name: product.name,
      description: product.description,
      imageUrl: product.images?.[0]?.fileAsset?.url || null,
      sellerOrganization: product.organization,
      category: product.category,
      price: product.price,
      currency: product.currency,
      taxInfo: product.taxRate,
      unit: product.unitOfMeasure,
      pricingModel: null,
      brand: product.brand,
      modelNumber: product.modelNumber,
      sku: product.sku,
      hsnCode: product.hsnCode,
      discount: product.discount,
      status: product.status,
      itemCondition: product.itemCondition,
      isMsmeMade: product.isMsmeMade,
      moq: null,
      deliveryTime: null,
      location: locationOf(product.organization),
      warranty: null,
      availableQuantity: null,
      verificationStatus: product.organization?.verificationStatus,
      technicalSpecs: product.specifications,
      documents: product.certifications,
      lastUpdated: product.updatedAt,
      createdAt: product.createdAt,
      detailUrl: `/marketplace/products/${product.id}`
    }));
    const serviceItems = services.map((service: any) => ({
      type: 'SERVICE',
      id: service.id,
      name: service.name,
      description: service.description,
      imageUrl: null,
      sellerOrganization: service.organization,
      category: service.category,
      price: service.basePrice,
      currency: service.currency,
      taxInfo: service.taxRate,
      unit: service.pricingModel,
      pricingModel: service.pricingModel,
      brand: null,
      modelNumber: null,
      sku: null,
      hsnCode: null,
      discount: service.discount,
      status: service.status,
      itemCondition: null,
      isMsmeMade: false,
      serviceArea: service.serviceArea,
      moq: null,
      deliveryTime: service.deliveryTimeline || null,
      location: service.serviceArea || locationOf(service.organization),
      warranty: null,
      availableQuantity: null,
      verificationStatus: service.organization?.verificationStatus,
      technicalSpecs: [],
      documents: service.certifications,
      lastUpdated: service.updatedAt,
      createdAt: service.createdAt,
      detailUrl: `/marketplace/services/${service.id}`
    }));
    const items = [...productItems, ...serviceItems];
    const numericPrices = items.map(item => Number(item.price)).filter(Number.isFinite);
    const lowestPrice = numericPrices.length ? Math.min(...numericPrices) : null;
    const highestPrice = numericPrices.length ? Math.max(...numericPrices) : null;
    const verifiedCount = items.filter(item => String(item.verificationStatus || '').toUpperCase() === 'VERIFIED').length;
    return apiResponse.success(res, { items: maskSensitive(items), highlights: { lowestPrice, highestPrice, verifiedCount }, limit: 4 });
  } catch (error: any) {
    return apiResponse.error(res, error.statusCode || 400, error.message || 'Unable to compare marketplace items', error.code || 'MARKETPLACE_COMPARE_ERROR');
  }
});

router.get('/requirements/:id/responses/compare', authenticate, authorize('buyer', 'admin', 'master_admin'), async (req: AuthRequest, res: Response) => {
  try {
    const requirementId = Number(req.params.id);
    const responseIds = parseIds(req.query.responseIds);
    if (responseIds.length === 0) return apiResponse.error(res, 400, 'Select at least one response to compare', 'COMPARE_RESPONSE_IDS_REQUIRED');
    const requirement = await db.buyerRequirement.findUnique({ where: { id: requirementId } });
    if (!requirement) return apiResponse.error(res, 404, 'Requirement not found', 'REQUIREMENT_NOT_FOUND');
    const ownsRequirement = requirement.createdById === req.user?.id || requirement.buyerOrganizationId === req.user?.organizationId;
    if (!isPrivileged(req) && !ownsRequirement) return apiResponse.error(res, 404, 'Requirement not found', 'REQUIREMENT_NOT_FOUND');
    const responses = await db.requirementResponse.findMany({
      where: { id: { in: responseIds }, requirementId, status: { not: 'DRAFT' } },
      include: {
        sellerOrganization: { select: { id: true, organizationName: true, verificationStatus: true, city: true, district: true, state: true } },
        sellerUser: { select: { id: true, name: true, email: true, mobile: true } }
      },
      orderBy: [{ offeredPrice: 'asc' }, { createdAt: 'asc' }]
    });
    const ranked = responses.map((response: any, index: number) => ({
      id: response.id,
      sellerOrganization: response.sellerOrganization,
      quotedPrice: response.offeredPrice,
      deliveryTimeline: response.deliveryTimeline,
      paymentTerms: response.terms,
      warranty: null,
      technicalCompliance: response.status,
      documentsStatus: response.attachmentUrl ? 'UPLOADED' : 'NOT_UPLOADED',
      location: [response.sellerOrganization?.city, response.sellerOrganization?.district, response.sellerOrganization?.state].filter(Boolean).join(', '),
      remarks: response.message,
      eligibilityStatus: response.status,
      technicalScore: null,
      financialScore: null,
      rank: index + 1,
      reverseAuctionFinalPrice: null
    }));
    return apiResponse.success(res, { requirement: maskSensitive(requirement), responses: maskSensitive(ranked) });
  } catch (error: any) {
    return apiResponse.error(res, error.statusCode || 500, error.message || 'Unable to compare responses', error.code || 'REQUIREMENT_RESPONSE_COMPARE_ERROR');
  }
});

router.get('/procurement-bids/:id/submissions/compare', authenticate, authorize('buyer', 'admin', 'master_admin'), async (req: AuthRequest, res: Response) => {
  try {
    const bidId = Number(req.params.id);
    const submissionIds = parseIds(req.query.submissionIds);
    if (submissionIds.length === 0) return apiResponse.error(res, 400, 'Select at least one submission to compare', 'COMPARE_SUBMISSION_IDS_REQUIRED');
    const bid = await db.procurementBid.findUnique({ where: { id: bidId } });
    if (!bid) return apiResponse.error(res, 404, 'Procurement bid not found', 'PROCUREMENT_BID_NOT_FOUND');
    const ownsBid = bid.buyerId === req.user?.id || bid.buyerOrganizationId === req.user?.organizationId;
    if (!isPrivileged(req) && !ownsBid) return apiResponse.error(res, 404, 'Procurement bid not found', 'PROCUREMENT_BID_NOT_FOUND');
    const submissions = await db.procurementBidParticipation.findMany({
      where: { id: { in: submissionIds }, bidId },
      include: {
        seller: { select: { id: true, name: true, email: true, organizationId: true } },
        documents: true,
        evaluations: true
      },
      orderBy: [{ totalAmount: 'asc' }, { submittedAt: 'asc' }]
    });
    const ranked = submissions.map((submission: any, index: number) => ({
      id: submission.id,
      sellerOrganization: submission.seller?.organizationId ? { id: submission.seller.organizationId } : null,
      seller: submission.seller,
      quotedPrice: submission.quotedAmount,
      taxBreakup: { gstPercentage: submission.gstPercentage, totalAmount: submission.totalAmount },
      deliveryTimeline: null,
      paymentTerms: null,
      warranty: null,
      technicalCompliance: submission.technicalStatus,
      requiredDocumentsStatus: submission.documents,
      certificates: submission.documents,
      eligibilityStatus: submission.finalStatus,
      technicalScore: submission.evaluations?.reduce((sum: number, row: any) => sum + Number(row.score || 0), 0) || null,
      financialScore: submission.totalAmount,
      rank: submission.rank || index + 1,
      reverseAuctionFinalPrice: null,
      remarks: submission.rejectionReason
    }));
    return apiResponse.success(res, { bid: maskSensitive(bid), submissions: maskSensitive(ranked) });
  } catch (error: any) {
    return apiResponse.error(res, error.statusCode || 500, error.message || 'Unable to compare procurement submissions', error.code || 'PROCUREMENT_SUBMISSION_COMPARE_ERROR');
  }
});

router.get('/quote-requests/:id/responses/compare', authenticate, authorize('buyer', 'admin', 'master_admin'), async (req: AuthRequest, res: Response) => {
  try {
    const quoteRequestId = Number(req.params.id);
    const quote = await db.quoteRequest.findUnique({
      where: { id: quoteRequestId },
      include: {
        buyer: {
          select: { id: true, name: true, email: true }
        },
        quoteResponses: {
          where: { status: { not: 'DRAFT' } },
          include: {
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
                    msmeCategory: true,
                    city: true,
                    state: true
                  }
                }
              }
            }
          },
          orderBy: [{ rank: { sort: 'asc', nulls: 'last' } }, { evaluatedPrice: 'asc' }, { totalAmount: 'asc' }, { createdAt: 'asc' }]
        }
      }
    });
    if (!quote) return apiResponse.error(res, 404, 'Quote request not found', 'QUOTE_REQUEST_NOT_FOUND');
    const ownsQuote = quote.buyerId === req.user?.id || quote.buyer?.id === req.user?.id;
    if (!isPrivileged(req) && !ownsQuote) return apiResponse.error(res, 404, 'Quote request not found', 'QUOTE_REQUEST_NOT_FOUND');

    const responses = quote.quoteResponses || [];

    // Label each response with L1/L2/L3 rank
    const ranked = responses.map((r: any) => {
      const priceForEval = r.evaluatedPrice ? Number(r.evaluatedPrice) : Number(r.totalAmount || 0);
      const rankLabel = r.rank ? `L${r.rank}` : null;
      const isDisqualified = r.technicalStatus === 'NOT_QUALIFIED';
      return {
        ...r,
        priceForEval,
        rankLabel,
        isDisqualified
      };
    });

    // Compute highlights using evaluatedPrice where available
    const prices = ranked.map((r: any) => r.priceForEval).filter((v: number) => v > 0);
    const lowestPrice = prices.length ? Math.min(...prices) : 0;
    const highestPrice = prices.length ? Math.max(...prices) : 0;
    const averagePrice = prices.length ? prices.reduce((a: number, b: number) => a + b, 0) / prices.length : 0;
    const priceDiff = highestPrice - lowestPrice;

    const deliveryDaysList = ranked.map((r: any) => ({ id: r.id, days: r.deliveryDays || Infinity }));
    const minDeliveryDays = deliveryDaysList.length ? Math.min(...deliveryDaysList.map((d: any) => d.days)) : Infinity;

    return apiResponse.success(res, {
      quoteRequest: maskSensitive(quote),
      responses: maskSensitive(ranked),
      highlights: { lowestPrice, highestPrice, averagePrice, priceDiff, minDeliveryDays }
    });
  } catch (error: any) {
    return apiResponse.error(res, error.statusCode || 500, error.message || 'Unable to compare quotations', error.code || 'QUOTE_RESPONSE_COMPARE_ERROR');
  }
});

export default router;
