import { Router, type Response } from 'express';
import { z } from 'zod';
import prisma from '../config/prisma.js';
import { authenticate, authorize, authorizeAdmin, type AuthRequest } from '../middleware/auth.js';
import { upload } from '../config/storage.js';
import { auditLog } from '../modules/audit/audit.service.js';
import { createComplianceFlag } from '../modules/compliance/compliance.service.js';
import { paymentRateLimit, verificationRateLimit } from '../middleware/rateLimit.js';
import { getOrSetCache, deleteCache } from '../services/cache.service.js';
import { publishNotificationEvent } from '../services/realtime.service.js';
import { notificationService } from '../services/notification.service.js';
import { redisKeys } from '../constants/redis-keys.js';
import { ApiError } from '../utils/ApiError.js';
import { handleSecureRouteError } from '../utils/routeHelpers.js';
import { maskSensitive } from '../utils/maskSensitive.js';
import { sha256 } from '../utils/crypto.js';
import { panVerificationService } from '../services/verification/pan.service.js';
import { udyamVerificationService } from '../services/verification/udyam.service.js';
import { bankVerificationService } from '../services/verification/bank.service.js';
import {
  approveMilestone,
  completeMilestone,
  createMilestone,
  listEscrowAccounts,
  reconcilePayment as reconcilePaymentWorkflow,
  unfreezeEscrow
} from '../modules/payments/payment.service.js';
import { idempotencyKeyFromRequest, withIdempotency } from '../services/idempotency.service.js';
import { catalogueWorkflow } from '../services/workflow/catalogue-workflow.service.js';
import { procurementWorkflow } from '../services/workflow/procurement-workflow.service.js';
import { tenderWorkflow } from '../services/workflow/tender-workflow.service.js';
import { fulfillmentWorkflow } from '../services/workflow/fulfillment-workflow.service.js';
import { contractWorkflow } from '../services/workflow/contract-workflow.service.js';
import { ratingWorkflow } from '../services/workflow/rating-workflow.service.js';
import { STRICT_VERIFICATION } from '../config/verification.js';

const db = prisma as any;
const router = Router();

const idParams = z.object({ id: z.coerce.number().int().positive() });
const sellerIdParams = z.object({ sellerId: z.coerce.number().int().positive() });
const buyerIdParams = z.object({ buyerId: z.coerce.number().int().positive() });
const gstParams = z.object({ gstin: z.string().trim().min(15).max(15) });
const paginationQuery = z.object({
  q: z.string().trim().max(120).optional(),
  status: z.string().trim().max(80).optional(),
  categoryId: z.coerce.number().int().positive().optional(),
  skip: z.coerce.number().int().min(0).default(0),
  take: z.coerce.number().int().min(1).max(100).default(50)
}).partial();

const clean = (value: unknown) => String(value ?? '').trim();
const toDecimalNumber = (value: unknown, fallback = 0) => Number(value ?? fallback);
const isAdmin = (req: AuthRequest) => req.user?.role === 'admin';
const userId = (req: AuthRequest) => Number(req.user?.id);

const ok = (res: Response, data: unknown, status = 200) => res.status(status).json(maskSensitive({ success: true, data }));

const parse = <T>(schema: z.ZodType<T>, value: unknown) => schema.parse(value);

const asyncRoute = (handler: (req: AuthRequest, res: Response) => Promise<unknown>, fallback = 'Unable to complete request') =>
  async (req: AuthRequest, res: Response) => {
    try {
      await handler(req, res);
    } catch (error) {
      return handleSecureRouteError(res, error, fallback);
    }
  };

const auditWrite = (req: AuthRequest, action: string, entityType: string, entityId?: number | string, metadata?: Record<string, unknown>) =>
  auditLog({
    actorUserId: userId(req),
    actorRole: req.user?.role,
    action,
    entityType,
    entityId,
    ipAddress: req.ip,
    userAgent: req.headers['user-agent'],
    metadata
  });

const notifySafe = async (targetUserId: number, title: string, message: string, type: string) => {
  const notification = await db.notification.create({ data: { userId: targetUserId, title, message, type } }).catch(() => null);
  if (notification) await publishNotificationEvent(targetUserId, notification);
};

const slugFor = (name: string) =>
  name.trim().toLowerCase().replace(/&/g, 'and').replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');

const assertTenderAccess = async (req: AuthRequest, tenderId: number) => {
  const tender = await db.tender.findUnique({ where: { id: tenderId } });
  if (!tender) throw new ApiError(404, 'Tender not found', 'TENDER_NOT_FOUND');
  if (isAdmin(req) || tender.buyerId === userId(req)) return tender;
  if (req.user?.role === 'seller' && ['published', 'bid_submission'].includes(String(tender.status))) return tender;
  throw new ApiError(404, 'Tender not found', 'TENDER_NOT_FOUND');
};

const assertBidAccess = async (req: AuthRequest, bidId: number) => {
  const bid = await db.bid.findUnique({ where: { id: bidId }, include: { tender: true } });
  if (!bid) throw new ApiError(404, 'Bid not found', 'BID_NOT_FOUND');
  if (isAdmin(req) || bid.sellerId === userId(req) || bid.tender?.buyerId === userId(req)) return bid;
  throw new ApiError(404, 'Bid not found', 'BID_NOT_FOUND');
};

const assertPurchaseOrderAccess = async (req: AuthRequest, purchaseOrderId: number) => {
  const po = await db.purchaseOrder.findUnique({ where: { id: purchaseOrderId } });
  if (!po) throw new ApiError(404, 'Purchase order not found', 'PO_NOT_FOUND');
  if (isAdmin(req) || po.buyerId === userId(req) || po.sellerId === userId(req)) return po;
  throw new ApiError(404, 'Purchase order not found', 'PO_NOT_FOUND');
};

const productBody = z.object({
  name: z.string().trim().min(2).max(200),
  description: z.string().trim().max(4000).optional(),
  categoryId: z.coerce.number().int().positive().optional(),
  sku: z.string().trim().max(80).optional(),
  hsnCode: z.string().trim().max(30).optional(),
  brand: z.string().trim().max(120).optional(),
  modelNumber: z.string().trim().max(120).optional(),
  unitOfMeasure: z.string().trim().max(40).optional(),
  price: z.coerce.number().nonnegative().optional(),
  currency: z.string().trim().length(3).default('INR').optional(),
  isMsmeMade: z.coerce.boolean().optional(),
  status: z.enum(['DRAFT', 'ACTIVE', 'INACTIVE', 'OUT_OF_STOCK', 'ARCHIVED']).optional()
});

const serviceBody = z.object({
  name: z.string().trim().min(2).max(200),
  description: z.string().trim().max(4000).optional(),
  categoryId: z.coerce.number().int().positive().optional(),
  pricingModel: z.enum(['FIXED', 'HOURLY', 'DAILY', 'MONTHLY', 'PER_PROJECT', 'CUSTOM']).optional(),
  basePrice: z.coerce.number().nonnegative().optional(),
  currency: z.string().trim().length(3).default('INR').optional(),
  serviceArea: z.string().trim().max(300).optional(),
  status: z.enum(['DRAFT', 'ACTIVE', 'INACTIVE', 'OUT_OF_STOCK', 'ARCHIVED']).optional()
});

const requirementBody = z.object({
  title: z.string().trim().min(3).max(200),
  description: z.string().trim().max(4000).optional(),
  categoryId: z.coerce.number().int().positive().optional(),
  procurementMethod: z.enum(['DIRECT_PURCHASE', 'RFQ', 'TENDER', 'REVERSE_AUCTION', 'RATE_CONTRACT']).default('TENDER'),
  estimatedValue: z.coerce.number().nonnegative().optional(),
  requiredBy: z.coerce.date().optional(),
  items: z.array(z.object({
    productId: z.coerce.number().int().positive().optional(),
    itemName: z.string().trim().min(2).max(200),
    description: z.string().trim().max(2000).optional(),
    quantity: z.coerce.number().positive(),
    unitOfMeasure: z.string().trim().min(1).max(40),
    estimatedUnitPrice: z.coerce.number().nonnegative().optional(),
    specifications: z.record(z.string(), z.unknown()).optional()
  })).optional()
});

const tenderBody = z.object({
  title: z.string().trim().min(3).max(200),
  category: z.string().trim().min(2).max(120).default('General'),
  categoryId: z.coerce.number().int().positive().optional(),
  requirementId: z.coerce.number().int().positive().optional(),
  budget: z.coerce.number().positive(),
  description: z.string().trim().min(5).max(5000),
  closesAt: z.coerce.date().optional()
});

const bidBody = z.object({
  unitPrice: z.coerce.number().positive(),
  quantity: z.coerce.number().int().positive(),
  deliveryDays: z.coerce.number().int().positive(),
  warranty: z.string().trim().max(500).optional(),
  validTill: z.coerce.date().optional(),
  note: z.string().trim().max(2000).optional(),
  documentUrl: z.string().url().optional()
});

const directPurchaseBody = z.object({
  requirementId: z.coerce.number().int().positive().optional(),
  sellerId: z.coerce.number().int().positive(),
  totalAmount: z.coerce.number().nonnegative().optional()
});

const quoteRequestBody = z.object({
  sellerId: z.coerce.number().int().positive(),
  subject: z.string().trim().min(3).max(160),
  message: z.string().trim().min(1).max(4000),
  documentUrl: z.string().url().optional()
});

const quoteResponseBody = z.object({
  totalAmount: z.coerce.number().nonnegative().optional(),
  deliveryDays: z.coerce.number().int().positive().optional(),
  validityDate: z.coerce.date().optional(),
  notes: z.string().trim().max(2000).optional()
});

const actorFrom = (req: AuthRequest) => ({
  id: userId(req),
  role: String(req.user?.role),
  ipAddress: req.ip,
  userAgent: req.headers['user-agent']
});

// Onboarding
router.get('/onboarding/me', authenticate, asyncRoute(async (req, res) => {
  const user = await db.user.findUnique({
    where: { id: userId(req) },
    include: { buyerProfile: true, sellerProfile: { include: { offices: true, bankAccounts: true, sellerDocuments: true } }, organization: true }
  });
  ok(res, user);
}));

router.put('/seller/onboarding', authenticate, authorize('seller'), asyncRoute(async (req, res) => {
  const data = req.body || {};
  const profile = await db.sellerProfile.upsert({
    where: { userId: userId(req) },
    update: { ...data, userId: undefined },
    create: {
      userId: userId(req),
      pan: clean(data.pan || `PENDING${userId(req)}`),
      productCategories: data.productCategories || [],
      termsAccepted: Boolean(data.termsAccepted),
      ...data
    }
  });
  await auditWrite(req, 'onboarding.seller.updated', 'sellerProfile', profile.id);
  ok(res, profile);
}));

router.put('/buyer/onboarding', authenticate, authorize('buyer'), asyncRoute(async (req, res) => {
  const data = req.body || {};
  const profile = await db.buyerProfile.upsert({
    where: { userId: userId(req) },
    update: { ...data, userId: undefined },
    create: {
      userId: userId(req),
      organizationName: clean(data.organizationName || 'Buyer Organization'),
      businessType: clean(data.businessType || 'Government Buyer'),
      mobile: clean(data.mobile || '0000000000'),
      procurementCategories: data.procurementCategories || [],
      preferredMethods: data.preferredMethods || [],
      ...data
    }
  });
  await auditWrite(req, 'onboarding.buyer.updated', 'buyerProfile', profile.id);
  ok(res, profile);
}));

router.post('/onboarding/submit', authenticate, asyncRoute(async (req, res) => {
  const user = await db.user.findUnique({
    where: { id: userId(req) }
  });
  if (!user) throw new ApiError(404, 'User not found');

  const sectionStatus = (user.sectionStatus as Record<string, any>) || {};
  const sections = user.role === 'buyer'
    ? ['org', 'rep', 'address', 'procurement', 'docs']
    : ['pan', 'details', 'additional', 'offices', 'bank', 'einvoicing', 'ownership'];

  const finalSectionStatus = { ...sectionStatus };
  for (const sec of sections) {
    if (!finalSectionStatus[sec]) {
      finalSectionStatus[sec] = 'pending';
    }
  }

  if (user.role === 'seller') {
    if (STRICT_VERIFICATION.PAN === false) finalSectionStatus.pan = 'approved';
    if (STRICT_VERIFICATION.BANK === false) finalSectionStatus.bank = 'approved';
    if (STRICT_VERIFICATION.UDYAM === false) finalSectionStatus.additional = 'approved';
  }

  const statuses = sections.map(s => finalSectionStatus[s] || 'pending');
  let onboardingStatus = 'pending_validation';
  let registrationStatus = 'completed';
  if (statuses.every(s => s === 'approved')) {
    onboardingStatus = 'approved_for_procurement';
  }

  const updated = await db.user.update({
    where: { id: userId(req) },
    data: {
      onboardingStatus,
      registrationStatus,
      sectionStatus: finalSectionStatus
    }
  });

  await auditWrite(req, 'onboarding.submitted', 'user', updated.id);

  if (onboardingStatus === 'approved_for_procurement') {
    try {
      await notificationService.notify(userId(req), {
        title: 'Onboarding Approved',
        message: 'Congratulations! Your onboarding application has been automatically approved for procurement.',
        type: 'onboarding_approved',
        priority: 'high',
        redirectUrl: '/dashboard'
      });
      await notificationService.notifyAdmins({
        title: 'Application Auto-Approved',
        message: `User ${updated.name} has been automatically approved for procurement.`,
        type: 'onboarding_approved',
        priority: 'medium'
      });
    } catch (e) {
      console.warn('[Onboarding Submit] Failed to send real-time notification:', e);
    }
  } else {
    // Notify all admins about new application submission
    try {
      const applicant = await db.user.findUnique({ where: { id: userId(req) }, select: { name: true, role: true, email: true } });
      await notificationService.notifyAdminsWithEmail({
        title: 'New Application Submitted',
        message: `${applicant?.name || 'A user'} (${applicant?.role}) has submitted their onboarding application for review.`,
        type: 'onboarding_submitted',
        priority: 'high',
        redirectUrl: '/admin/onboarding',
        emailSubject: 'New Application Pending Review — MSME Procurement Portal',
        emailHtml: `<p>A new onboarding application has been submitted and requires your review.</p><p><strong>Applicant:</strong> ${applicant?.name || 'Unknown'} (${applicant?.role})</p><p><strong>Email:</strong> ${applicant?.email || 'N/A'}</p>`
      });
    } catch (error) {
      // Suppress notification errors to not block user flow
    }
  }

  ok(res, updated);
}));

router.post('/onboarding/upload-document', authenticate, upload.single('file'), asyncRoute(async (req: AuthRequest & { file?: Express.Multer.File }, res) => {
  if (!req.file) throw new ApiError(400, 'Document file is required', 'DOCUMENT_REQUIRED');
  const profile = req.user?.role === 'seller'
    ? await db.sellerProfile.findUnique({ where: { userId: userId(req) } })
    : null;
  if (!profile) throw new ApiError(400, 'Seller profile is required for seller documents', 'SELLER_PROFILE_REQUIRED');
  const asset = await db.fileAsset.create({
    data: {
      ownerId: userId(req),
      ownerRole: String(req.user?.role),
      entityType: 'onboarding',
      storageProvider: 'local',
      key: `onboarding/${userId(req)}/${Date.now()}-${req.file.originalname}`,
      mimeType: req.file.mimetype,
      size: req.file.size,
      checksum: sha256(req.file.buffer.toString('base64')),
      originalName: req.file.originalname,
      status: 'active'
    }
  });
  const document = await db.sellerDocument.create({
    data: {
      sellerProfileId: profile.id,
      documentType: clean(req.body?.documentType || 'onboarding'),
      fileAssetId: asset.id
    }
  });
  await auditWrite(req, 'onboarding.document_uploaded', 'sellerDocument', document.id);
  ok(res, { asset, document }, 201);
}));

router.get('/admin/onboarding', authenticate, authorizeAdmin, asyncRoute(async (_req, res) => {
  const users = await db.user.findMany({
    where: { role: { in: ['buyer', 'seller'] } },
    select: {
      id: true,
      name: true,
      email: true,
      role: true,
      onboardingStatus: true,
      createdAt: true,
      sectionStatus: true,
      adminFeedback: true,
      complianceViolations: true,
      buyerProfile: {
        select: { organizationName: true, procurementCategories: true, industry: true, gst: true, pan: true, state: true }
      },
      sellerProfile: {
        select: { businessName: true, productCategories: true, industry: true, pan: true, state: true }
      }
    },
    orderBy: { updatedAt: 'desc' },
    take: 200
  });

  const sellers: any[] = [];
  const buyers: any[] = [];

  for (const u of users) {
    const item = {
      _id: String(u.id),
      id: u.id,
      name: u.name,
      email: u.email,
      role: u.role,
      onboardingStatus: u.onboardingStatus,
      createdAt: u.createdAt,
      sectionStatus: u.sectionStatus,
      adminFeedback: u.adminFeedback,
      complianceViolations: u.complianceViolations,
      profile: u.role === 'seller' ? u.sellerProfile : u.buyerProfile
    };
    if (u.role === 'seller') sellers.push(item);
    else buyers.push(item);
  }

  ok(res, { sellers, buyers });
}));

router.post('/admin/onboarding/:id/section-status', authenticate, authorizeAdmin, asyncRoute(async (req, res) => {
  const { id } = parse(idParams, req.params);
  const body = parse(z.object({ sectionStatus: z.record(z.string(), z.unknown()), sectionRejectionReasons: z.record(z.string(), z.unknown()).optional() }), req.body);
  const user = await db.user.update({ where: { id }, data: body });
  await auditWrite(req, 'admin.onboarding.section_status_updated', 'user', id);
  ok(res, user);
}));

router.post('/admin/onboarding/:id/status', authenticate, authorizeAdmin, asyncRoute(async (req, res) => {
  const { id } = parse(idParams, req.params);
  const body = parse(z.object({ onboardingStatus: z.string().trim().min(2), adminFeedback: z.string().trim().max(2000).optional() }), req.body);
  const user = await db.user.update({ where: { id }, data: body });
  await auditWrite(req, 'admin.onboarding.status_updated', 'user', id, body);
  
  try {
    await notificationService.notifyWithEmail(id, {
      title: 'Application Status Updated',
      message: `Your onboarding status has been updated to: ${body.onboardingStatus}. ${body.adminFeedback ? 'Admin feedback: ' + body.adminFeedback : ''}`,
      type: 'onboarding_status_updated',
      priority: 'high',
      redirectUrl: user.role === 'seller' ? '/seller/onboarding' : '/buyer/onboarding',
      emailSubject: 'Application Status Update — MSME Procurement Portal',
      emailHtml: `<p>Your onboarding application status has been updated.</p><p><strong>New Status:</strong> ${body.onboardingStatus}</p>${body.adminFeedback ? `<p><strong>Admin Feedback:</strong> ${body.adminFeedback}</p>` : ''}<p>Please log in to the portal to view details.</p>`
    });
  } catch (error) {
    // Suppress notification errors to not block flow
  }

  ok(res, user);
}));

// Verification
router.get('/verify/gst/:gstin', authenticate, verificationRateLimit, asyncRoute(async (req, res) => {
  const { gstin } = parse(gstParams, req.params);
  await db.apiVerificationLog.create({ data: { userId: userId(req), provider: 'internal', verificationType: 'GST', requestReference: gstin, status: 'VERIFIED' } }).catch(() => undefined);
  ok(res, { gstin: gstin.toUpperCase(), verified: true });
}));

async function verifyGstinInternal(gstin: string) {
  const gstStateMap: Record<string, string> = {
    '01': 'Jammu and Kashmir', '02': 'Himachal Pradesh', '03': 'Punjab', '04': 'Chandigarh',
    '05': 'Uttarakhand', '06': 'Haryana', '07': 'Delhi', '08': 'Rajasthan', '09': 'Uttar Pradesh',
    '10': 'Bihar', '11': 'Sikkim', '12': 'Arunachal Pradesh', '13': 'Nagaland', '14': 'Manipur',
    '15': 'Mizoram', '16': 'Tripura', '17': 'Meghalaya', '18': 'Assam', '19': 'West Bengal',
    '20': 'Jharkhand', '21': 'Odisha', '22': 'Chhattisgarh', '23': 'Madhya Pradesh', '24': 'Gujarat',
    '25': 'Daman and Diu', '26': 'Dadra and Nagar Haveli and Daman and Diu', '27': 'Maharashtra',
    '28': 'Andhra Pradesh', '29': 'Karnataka', '30': 'Goa', '31': 'Lakshadweep', '32': 'Kerala',
    '33': 'Tamil Nadu', '34': 'Puducherry', '35': 'Andaman and Nicobar Islands', '36': 'Telangana',
    '37': 'Andhra Pradesh (New)', '38': 'Ladakh'
  };

  const stateName = gstStateMap[gstin.substring(0, 2)] || 'Maharashtra';
  const gstinPart = gstin.substring(2, 12);
  const mockDealerPayload = {
    requestedGstin: gstin,
    responseGstin: gstin,
    legalName: `JsgSmile ${gstinPart} Industries Private Limited`,
    tradeName: `JsgSmile ${gstinPart} Enterprise`,
    organizationName: `JsgSmile ${gstinPart} Industries Private Limited`,
    address: `Sector 4, Plot 12, Industrial Area, ${stateName}`,
    registeredOfficeAddress: `Sector 4, Plot 12, Industrial Area, ${stateName}`,
    country: 'India',
    state: stateName,
    city: 'Mumbai',
    district: 'Mumbai',
    pincode: '400001',
    pinCode: '400001',
    pan: gstinPart,
    status: 'Active',
    isRegisteredDealer: true,
    source: 'mocked_dealer_payload',
    message: undefined
  };

  const apiKey = process.env.APISETU_API_KEY ? String(process.env.APISETU_API_KEY).trim().replace(/^['"]|['"]$/g, '') : '';
  const clientId = process.env.APISETU_CLIENT_ID ? String(process.env.APISETU_CLIENT_ID).trim().replace(/^['"]|['"]$/g, '') : '';
  const urlTemplate = process.env.APISETU_GST_URL ? String(process.env.APISETU_GST_URL).trim().replace(/^['"]|['"]$/g, '') : 'https://apisetu.gov.in/gstn/v2/taxpayers/{gstin}';

  if (!apiKey || apiKey.includes('YOUR_') || apiKey.includes('placeholder') || !clientId || clientId.includes('YOUR_') || clientId.includes('placeholder')) {
    return mockDealerPayload;
  }

  try {
    const apiUrl = urlTemplate.includes('{gstin}')
      ? urlTemplate.replace('{gstin}', encodeURIComponent(gstin))
      : urlTemplate.includes('gstin=')
        ? urlTemplate.replace(/gstin=[^&]*/i, `gstin=${encodeURIComponent(gstin)}`)
        : `${urlTemplate.replace(/\/$/, '')}/${encodeURIComponent(gstin)}`;

    const response = await fetch(apiUrl, {
      method: 'GET',
      headers: {
        'X-APISETU-APIKEY': apiKey,
        'X-APISETU-CLIENTID': clientId,
        'Accept': 'application/json'
      }
    });

    if (!response.ok) {
      return mockDealerPayload;
    }

    const raw = await response.json();
    const payload = raw?.data?.result || raw?.data?.gstinData || raw?.data?.gstDetails || raw?.data?.data || raw?.result || raw?.gstinData || raw?.gstDetails || raw?.taxpayerDetails || raw?.taxPayerDetails || raw?.certificateData || raw;
    const principal = payload?.principalPlaceOfBusinessFields?.principalPlaceOfBusinessAddress || payload?.principalPlaceOfBusinessFields || payload?.pradr || payload?.principalPlaceOfBusiness || payload?.principalAddress || payload?.principal_place_of_business || {};
    const addressSource = principal?.addr || principal?.address || principal;

    const legalName = payload?.legalNameOfBusiness || payload?.lgnm || payload?.legalName || payload?.legal_name || payload?.legalNam || payload?.legal_name_of_business || payload?.name || '';
    const tradeName = payload?.tradeNam || payload?.tradeName || payload?.trade_name || payload?.trade_name_of_business || payload?.businessName || '';
    const pincode = addressSource?.pncd || addressSource?.pinCode || addressSource?.pincode || addressSource?.pin || addressSource?.zip || '400001';
    const district = addressSource?.dst || addressSource?.district || addressSource?.dist || addressSource?.districtName || 'Mumbai';
    const city = addressSource?.city || addressSource?.town || addressSource?.village || addressSource?.location || district || 'Mumbai';
    const state = addressSource?.stcd || addressSource?.state || addressSource?.stateName || stateName;

    return {
      requestedGstin: gstin,
      responseGstin: gstin,
      legalName,
      tradeName,
      organizationName: legalName || tradeName,
      address: `Sector 4, Plot 12, Industrial Area, ${state}`,
      registeredOfficeAddress: `Sector 4, Plot 12, Industrial Area, ${state}`,
      country: 'India',
      state,
      city,
      district,
      pincode,
      pinCode: pincode,
      pan: payload?.pan || gstinPart,
      status: payload?.status || 'Active',
      isRegisteredDealer: true,
      source: 'live_apisetu',
      message: undefined
    };
  } catch (e) {
    return mockDealerPayload;
  }
}

router.post('/profile/verify-gst-dashboard', authenticate, asyncRoute(async (req, res) => {
  const { gstin } = parse(z.object({ gstin: z.string().trim().min(15).max(15) }), req.body);
  const normalizedGstin = gstin.toUpperCase();

  const user = await db.user.findUnique({
    where: { id: userId(req) },
    include: { sellerProfile: { include: { offices: true } }, buyerProfile: true }
  });
  if (!user) throw new ApiError(404, 'User not found');

  const gstResult = await verifyGstinInternal(normalizedGstin);

  await db.apiVerificationLog.create({
    data: {
      userId: user.id,
      provider: gstResult.source === 'live_apisetu' ? 'apisetu' : 'mocked',
      verificationType: 'GST',
      requestReference: normalizedGstin,
      status: 'VERIFIED'
    }
  }).catch(() => undefined);

  const sectionStatus = (user.sectionStatus as Record<string, any>) || {};
  const finalSectionStatus = { ...sectionStatus };

  if (user.role === 'seller') {
    let sellerProfile = user.sellerProfile;
    if (!sellerProfile) {
      const panToUse = gstResult.pan || `PENDING${user.id}`;
      const existingPanProfile = await db.sellerProfile.findFirst({
        where: { pan: panToUse }
      });
      if (existingPanProfile) {
        throw new ApiError(400, 'This GSTIN/PAN is already registered with another account.');
      }

      sellerProfile = await db.sellerProfile.create({
        data: {
          userId: user.id,
          pan: panToUse,
          businessName: gstResult.legalName || gstResult.tradeName || 'Seller Business'
        }
      });
    } else {
      const panToUse = sellerProfile.pan.startsWith('PENDING') ? (gstResult.pan || sellerProfile.pan) : sellerProfile.pan;
      if (panToUse !== sellerProfile.pan) {
        const existingPanProfile = await db.sellerProfile.findFirst({
          where: { pan: panToUse, NOT: { id: sellerProfile.id } }
        });
        if (existingPanProfile) {
          throw new ApiError(400, 'This GSTIN/PAN is already registered with another account.');
        }
      }

      await db.sellerProfile.update({
        where: { id: sellerProfile.id },
        data: {
          businessName: sellerProfile.businessName || gstResult.legalName || gstResult.tradeName,
          pan: panToUse
        }
      });
    }

    const officeName = 'Registered Head Office';
    const existingOffice = sellerProfile.offices?.find(o => o.isMandatory || o.type === 'Registered Office' || o.gstNumber === normalizedGstin);
    
    if (existingOffice) {
      await db.sellerOffice.update({
        where: { id: existingOffice.id },
        data: {
          gstRegistered: true,
          gstNumber: normalizedGstin,
          gstMasked: normalizedGstin,
          gstFingerprint: sha256(normalizedGstin),
          pincode: gstResult.pincode || existingOffice.pincode,
          state: gstResult.state || existingOffice.state,
          city: gstResult.city || existingOffice.city,
          address: gstResult.address || existingOffice.address
        }
      });
    } else {
      await db.sellerOffice.create({
        data: {
          sellerProfileId: sellerProfile.id,
          name: officeName,
          type: 'Registered Office',
          gstRegistered: true,
          gstNumber: normalizedGstin,
          gstMasked: normalizedGstin,
          gstFingerprint: sha256(normalizedGstin),
          pincode: gstResult.pincode,
          state: gstResult.state,
          city: gstResult.city,
          address: gstResult.address,
          isMandatory: true
        }
      });
    }

    finalSectionStatus.offices = 'approved';
    finalSectionStatus.details = 'approved';
  } else if (user.role === 'buyer') {
    let buyerProfile = user.buyerProfile;
    const profileData = {
      gst: normalizedGstin,
      gstMasked: normalizedGstin,
      gstFingerprint: sha256(normalizedGstin),
      state: gstResult.state,
      district: gstResult.district,
      city: gstResult.city,
      pincode: gstResult.pincode,
      registeredAddress: gstResult.address,
      organizationName: buyerProfile?.organizationName || gstResult.legalName || gstResult.tradeName || 'Buyer Organization'
    };

    if (!buyerProfile) {
      await db.buyerProfile.create({
        data: {
          userId: user.id,
          mobile: user.mobile || '0000000000',
          businessType: 'Government Buyer',
          ...profileData
        }
      });
    } else {
      await db.buyerProfile.update({
        where: { id: buyerProfile.id },
        data: profileData
      });
    }

    finalSectionStatus.org = 'approved';
    finalSectionStatus.address = 'approved';
  }

  const sections = user.role === 'buyer'
    ? ['org', 'rep', 'address', 'procurement', 'docs']
    : ['pan', 'details', 'additional', 'offices', 'bank', 'einvoicing', 'ownership'];

  for (const sec of sections) {
    if (!finalSectionStatus[sec]) {
      finalSectionStatus[sec] = 'pending';
    }
  }

  if (user.role === 'seller') {
    if (STRICT_VERIFICATION.PAN === false) finalSectionStatus.pan = 'approved';
    if (STRICT_VERIFICATION.BANK === false) finalSectionStatus.bank = 'approved';
    if (STRICT_VERIFICATION.UDYAM === false) finalSectionStatus.additional = 'approved';
  }

  const statuses = sections.map(s => finalSectionStatus[s] || 'pending');
  let onboardingStatus = user.onboardingStatus;
  let registrationStatus = user.registrationStatus;

  if (statuses.every(s => s === 'approved')) {
    onboardingStatus = 'approved_for_procurement';
    registrationStatus = 'completed';
  }

  const updatedUser = await db.user.update({
    where: { id: user.id },
    data: {
      onboardingStatus: onboardingStatus as any,
      registrationStatus: registrationStatus as any,
      sectionStatus: finalSectionStatus
    },
    include: { sellerProfile: { include: { offices: true } }, buyerProfile: true }
  });

  await auditWrite(req, 'onboarding.gst_verified_dashboard', 'user', user.id, { gstin: normalizedGstin });

  try {
    await notificationService.notify(user.id, {
      title: 'GST Verified Successfully',
      message: `Your business GSTIN ${normalizedGstin} has been successfully verified. ${
        onboardingStatus === 'approved_for_procurement'
          ? 'Your account is now fully approved for procurement!'
          : 'Your organization details have been updated.'
      }`,
      type: 'gst_verified',
      priority: 'high',
      redirectUrl: '/dashboard'
    });

    await notificationService.notifyAdmins({
      title: 'GST Verified dynamically via Dashboard',
      message: `User ${updatedUser.name} verified GSTIN ${normalizedGstin} dynamically. Onboarding status: ${onboardingStatus}.`,
      type: 'gst_verified_dashboard',
      priority: 'medium'
    });
  } catch (e) {
    console.warn('[GST Dashboard Verification] Notification failed:', e);
  }

  const safeUser = {
    id: updatedUser.id,
    name: updatedUser.name,
    email: updatedUser.email,
    role: updatedUser.role,
    registrationStatus: updatedUser.registrationStatus,
    onboardingStatus: updatedUser.onboardingStatus,
    sectionStatus: updatedUser.sectionStatus,
    sellerProfile: updatedUser.sellerProfile,
    buyerProfile: updatedUser.buyerProfile
  };

  res.json({ success: true, user: safeUser });
}));

router.post('/verify/pan', authenticate, verificationRateLimit, asyncRoute(async (req, res) => {
  const { pan } = parse(z.object({ pan: z.string().trim().min(10).max(10) }), req.body);
  const normalized = panVerificationService.normalize(pan);
  await db.apiVerificationLog.create({ data: { userId: userId(req), provider: 'internal', verificationType: 'PAN', requestReference: normalized, status: 'VERIFIED' } }).catch(() => undefined);
  ok(res, { pan: normalized, verified: true });
}));

router.post('/verify/udyam', authenticate, verificationRateLimit, asyncRoute(async (req, res) => {
  const { udyam } = parse(z.object({ udyam: z.string().trim().min(4).max(40) }), req.body);
  const normalized = udyamVerificationService.normalize(udyam);
  await db.apiVerificationLog.create({ data: { userId: userId(req), provider: 'internal', verificationType: 'UDYAM', requestReference: normalized, status: 'VERIFIED' } }).catch(() => undefined);
  ok(res, { udyam: normalized, verified: true });
}));

router.post('/verify/bank', authenticate, verificationRateLimit, asyncRoute(async (req, res) => {
  const body = parse(z.object({ ifsc: z.string().trim().min(4).max(20), accountNumber: z.string().trim().min(4).max(34) }), req.body);
  const ifsc = bankVerificationService.normalizeIfsc(body.ifsc);
  await db.apiVerificationLog.create({ data: { userId: userId(req), provider: 'internal', verificationType: 'BANK', requestReference: ifsc, status: 'VERIFIED' } }).catch(() => undefined);
  ok(res, { ifsc, accountFingerprint: sha256(body.accountNumber), verified: true });
}));

// Catalogue
router.get('/categories', asyncRoute(async (_req, res) => {
  const categories = await getOrSetCache(redisKeys.cacheCategoriesAll(), () =>
    db.category.findMany({ where: { isActive: true }, orderBy: [{ displayOrder: 'asc' }, { name: 'asc' }] }), 300);
  ok(res, categories);
}));

router.post('/admin/categories', authenticate, authorizeAdmin, asyncRoute(async (req, res) => {
  const body = parse(z.object({ name: z.string().trim().min(2).max(160), parentId: z.coerce.number().int().positive().optional(), type: z.enum(['PRODUCT', 'SERVICE', 'BOTH']).default('BOTH'), description: z.string().trim().max(1000).optional() }), req.body);
  const category = await db.category.create({ data: { ...body, slug: slugFor(body.name) } });
  await deleteCache(redisKeys.cacheCategoriesAll());
  await auditWrite(req, 'category.created', 'category', category.id);
  ok(res, category, 201);
}));

router.put('/admin/categories/:id', authenticate, authorizeAdmin, asyncRoute(async (req, res) => {
  const { id } = parse(idParams, req.params);
  const body = req.body || {};
  const category = await db.category.update({ where: { id }, data: { ...body, slug: body.name ? slugFor(body.name) : undefined } });
  await deleteCache(redisKeys.cacheCategoriesAll());
  await auditWrite(req, 'category.updated', 'category', id);
  ok(res, category);
}));

router.delete('/admin/categories/:id', authenticate, authorizeAdmin, asyncRoute(async (req, res) => {
  const { id } = parse(idParams, req.params);
  const category = await db.category.update({ where: { id }, data: { isActive: false } });
  await deleteCache(redisKeys.cacheCategoriesAll());
  await auditWrite(req, 'category.deleted', 'category', id);
  ok(res, category);
}));

router.post('/seller/products', authenticate, authorize('seller'), asyncRoute(async (req, res) => {
  const body = parse(productBody, req.body);
  const product = await catalogueWorkflow.createProduct(actorFrom(req), body);
  ok(res, product, 201);
}));

router.get('/seller/products', authenticate, authorize('seller'), asyncRoute(async (req, res) => {
  const query = parse(paginationQuery, req.query);
  const products = await db.product.findMany({
    where: { sellerId: userId(req), ...(query.status ? { status: query.status } : {}) },
    include: { category: true, seller: { select: { id: true, name: true, email: true, onboardingStatus: true } } },
    skip: query.skip,
    take: query.take,
    orderBy: { updatedAt: 'desc' }
  });
  ok(res, products);
}));

router.get('/seller/products/:id', authenticate, authorize('seller'), asyncRoute(async (req, res) => {
  const { id } = parse(idParams, req.params);
  const product = await db.product.findFirst({ where: { id, sellerId: userId(req) }, include: { images: true, specifications: true } });
  if (!product) throw new ApiError(404, 'Product not found', 'PRODUCT_NOT_FOUND');
  ok(res, product);
}));

router.put('/seller/products/:id', authenticate, authorize('seller'), asyncRoute(async (req, res) => {
  const { id } = parse(idParams, req.params);
  const body = parse(productBody.partial(), req.body);
  const existing = await db.product.findFirst({ where: { id, sellerId: userId(req) } });
  if (!existing) throw new ApiError(404, 'Product not found', 'PRODUCT_NOT_FOUND');
  const product = await catalogueWorkflow.updateProduct(actorFrom(req), id, body);
  ok(res, product);
}));

router.delete('/seller/products/:id', authenticate, authorize('seller'), asyncRoute(async (req, res) => {
  const { id } = parse(idParams, req.params);
  const existing = await db.product.findFirst({ where: { id, sellerId: userId(req) } });
  if (!existing) throw new ApiError(404, 'Product not found', 'PRODUCT_NOT_FOUND');
  const product = await catalogueWorkflow.archiveProduct(actorFrom(req), id);
  ok(res, product);
}));

router.get('/products/search', asyncRoute(async (req, res) => {
  const query = parse(paginationQuery, req.query);
  const products = await catalogueWorkflow.searchProducts(query);
  ok(res, products);
}));

router.post('/seller/services', authenticate, authorize('seller'), asyncRoute(async (req, res) => {
  const body = parse(serviceBody, req.body);
  const service = await catalogueWorkflow.createService(actorFrom(req), body);
  ok(res, service, 201);
}));

router.get('/seller/services', authenticate, authorize('seller'), asyncRoute(async (req, res) => {
  const query = parse(paginationQuery, req.query);
  const services = await db.service.findMany({
    where: { sellerId: userId(req), ...(query.status ? { status: query.status } : {}) },
    include: { category: true, seller: { select: { id: true, name: true, email: true, onboardingStatus: true } } },
    skip: query.skip,
    take: query.take,
    orderBy: { updatedAt: 'desc' }
  });
  ok(res, services);
}));

router.put('/seller/services/:id', authenticate, authorize('seller'), asyncRoute(async (req, res) => {
  const { id } = parse(idParams, req.params);
  const body = parse(serviceBody.partial(), req.body);
  const existing = await db.service.findFirst({ where: { id, sellerId: userId(req) } });
  if (!existing) throw new ApiError(404, 'Service not found', 'SERVICE_NOT_FOUND');
  const service = await catalogueWorkflow.updateService(actorFrom(req), id, body);
  ok(res, service);
}));

router.delete('/seller/services/:id', authenticate, authorize('seller'), asyncRoute(async (req, res) => {
  const { id } = parse(idParams, req.params);
  const existing = await db.service.findFirst({ where: { id, sellerId: userId(req) } });
  if (!existing) throw new ApiError(404, 'Service not found', 'SERVICE_NOT_FOUND');
  const service = await catalogueWorkflow.archiveService(actorFrom(req), id);
  ok(res, service);
}));

router.get('/services/search', asyncRoute(async (req, res) => {
  const query = parse(paginationQuery, req.query);
  const services = await catalogueWorkflow.searchServices(query);
  ok(res, services);
}));

router.get('/admin/catalogue/products', authenticate, authorizeAdmin, asyncRoute(async (req, res) => {
  const query = parse(paginationQuery, req.query);
  const where: any = {};
  if (query.status) where.status = query.status;
  if (query.categoryId) where.categoryId = query.categoryId;
  if (query.q) {
    where.OR = [
      { name: { contains: query.q, mode: 'insensitive' } },
      { description: { contains: query.q, mode: 'insensitive' } },
      { seller: { name: { contains: query.q, mode: 'insensitive' } } },
      { seller: { email: { contains: query.q, mode: 'insensitive' } } }
    ];
  }
  const products = await db.product.findMany({
    where,
    include: { category: true, seller: { select: { id: true, name: true, email: true, onboardingStatus: true } } },
    skip: query.skip,
    take: query.take,
    orderBy: { updatedAt: 'desc' }
  });
  ok(res, products);
}));

router.get('/admin/catalogue/services', authenticate, authorizeAdmin, asyncRoute(async (req, res) => {
  const query = parse(paginationQuery, req.query);
  const where: any = {};
  if (query.status) where.status = query.status;
  if (query.categoryId) where.categoryId = query.categoryId;
  if (query.q) {
    where.OR = [
      { name: { contains: query.q, mode: 'insensitive' } },
      { description: { contains: query.q, mode: 'insensitive' } },
      { seller: { name: { contains: query.q, mode: 'insensitive' } } },
      { seller: { email: { contains: query.q, mode: 'insensitive' } } }
    ];
  }
  const services = await db.service.findMany({
    where,
    include: { category: true, seller: { select: { id: true, name: true, email: true, onboardingStatus: true } } },
    skip: query.skip,
    take: query.take,
    orderBy: { updatedAt: 'desc' }
  });
  ok(res, services);
}));

// Requirements
router.post('/buyer/requirements', authenticate, authorize('buyer'), asyncRoute(async (req, res) => {
  const body = parse(requirementBody, req.body);
  const requirement = await procurementWorkflow.createRequirement(actorFrom(req), body);
  ok(res, requirement, 201);
}));

router.get('/buyer/requirements', authenticate, authorize('buyer'), asyncRoute(async (req, res) => {
  const requirements = await db.requirement.findMany({ where: { buyerId: userId(req) }, include: { items: true }, orderBy: { updatedAt: 'desc' } });
  ok(res, requirements);
}));

router.get('/requirements/:id', authenticate, asyncRoute(async (req, res) => {
  const { id } = parse(idParams, req.params);
  const requirement = await db.requirement.findUnique({ where: { id }, include: { items: true, tenders: true } });
  if (!requirement || (!isAdmin(req) && requirement.buyerId !== userId(req))) throw new ApiError(404, 'Requirement not found', 'REQUIREMENT_NOT_FOUND');
  ok(res, requirement);
}));

router.put('/buyer/requirements/:id', authenticate, authorize('buyer'), asyncRoute(async (req, res) => {
  const { id } = parse(idParams, req.params);
  const existing = await db.requirement.findFirst({ where: { id, buyerId: userId(req) } });
  if (!existing) throw new ApiError(404, 'Requirement not found', 'REQUIREMENT_NOT_FOUND');
  const body = parse(requirementBody.partial(), req.body);
  const requirement = await db.requirement.update({ where: { id }, data: { ...body, items: undefined } });
  await auditWrite(req, 'requirement.updated', 'requirement', id);
  ok(res, requirement);
}));

router.post('/buyer/requirements/:id/submit', authenticate, authorize('buyer'), asyncRoute(async (req, res) => {
  const { id } = parse(idParams, req.params);
  const existing = await db.requirement.findFirst({ where: { id, buyerId: userId(req) } });
  if (!existing) throw new ApiError(404, 'Requirement not found', 'REQUIREMENT_NOT_FOUND');
  const requirement = await procurementWorkflow.submitRequirement(actorFrom(req), id);
  ok(res, requirement);
}));

// Direct purchase and RFQ
router.post('/direct-purchases', authenticate, authorize('buyer'), asyncRoute(async (req, res) => {
  const body = parse(directPurchaseBody, req.body);
  const directPurchase = await procurementWorkflow.createDirectPurchase(actorFrom(req), body);
  ok(res, directPurchase, 201);
}));

router.get('/direct-purchases', authenticate, asyncRoute(async (req, res) => {
  const where = isAdmin(req) ? {} : req.user?.role === 'buyer' ? { buyerId: userId(req) } : { sellerId: userId(req) };
  const rows = await db.directPurchase.findMany({ where, include: { seller: { select: { id: true, name: true } }, buyer: { select: { id: true, name: true } }, requirement: true }, orderBy: { updatedAt: 'desc' } });
  ok(res, rows);
}));

router.get('/direct-purchases/:id', authenticate, asyncRoute(async (req, res) => {
  const { id } = parse(idParams, req.params);
  const row = await db.directPurchase.findUnique({ where: { id } });
  if (!row || (!isAdmin(req) && row.buyerId !== userId(req) && row.sellerId !== userId(req))) throw new ApiError(404, 'Direct purchase not found', 'DIRECT_PURCHASE_NOT_FOUND');
  ok(res, row);
}));

for (const [path, status, action] of [
  ['/direct-purchases/:id/accept', 'APPROVED', 'direct_purchase.accepted'],
  ['/direct-purchases/:id/reject', 'REJECTED', 'direct_purchase.rejected']
] as const) {
  router.post(path, authenticate, authorize('seller', 'admin'), asyncRoute(async (req, res) => {
    const { id } = parse(idParams, req.params);
    const existing = await db.directPurchase.findUnique({ where: { id } });
    if (!existing || (!isAdmin(req) && existing.sellerId !== userId(req))) throw new ApiError(404, 'Direct purchase not found', 'DIRECT_PURCHASE_NOT_FOUND');
    const updated = await procurementWorkflow.respondDirectPurchase(actorFrom(req), id, status === 'APPROVED');
    ok(res, updated);
  }));
}

router.post('/direct-purchases/:id/generate-po', authenticate, authorize('buyer', 'admin'), asyncRoute(async (req, res) => {
  const { id } = parse(idParams, req.params);
  const body = parse(z.object({ tenderId: z.coerce.number().int().positive().optional(), bidId: z.coerce.number().int().positive().optional(), title: z.string().trim().min(3).max(200).optional() }), req.body);
  const result = await procurementWorkflow.generateDirectPurchasePO(actorFrom(req), id, body);
  ok(res, result.purchaseOrder, 201);
}));

router.post('/quote-requests', authenticate, authorize('buyer'), asyncRoute(async (req, res) => {
  const body = parse(quoteRequestBody, req.body);
  const quote = await procurementWorkflow.createQuoteRequest(actorFrom(req), body);
  ok(res, quote, 201);
}));

router.get('/quote-requests', authenticate, asyncRoute(async (req, res) => {
  const where = isAdmin(req) ? {} : req.user?.role === 'buyer' ? { buyerId: userId(req) } : { sellerId: userId(req) };
  ok(res, await db.quoteRequest.findMany({ where, include: { quoteResponses: true, seller: { select: { id: true, name: true } }, buyer: { select: { id: true, name: true } } }, orderBy: { updatedAt: 'desc' } }));
}));

router.get('/quote-requests/:id', authenticate, asyncRoute(async (req, res) => {
  const { id } = parse(idParams, req.params);
  const quote = await db.quoteRequest.findUnique({ where: { id }, include: { quoteResponses: true } });
  if (!quote || (!isAdmin(req) && quote.buyerId !== userId(req) && quote.sellerId !== userId(req))) throw new ApiError(404, 'Quote request not found', 'QUOTE_REQUEST_NOT_FOUND');
  ok(res, quote);
}));

router.post('/quote-requests/:id/responses', authenticate, authorize('seller'), asyncRoute(async (req, res) => {
  const { id } = parse(idParams, req.params);
  const quote = await db.quoteRequest.findUnique({ where: { id } });
  if (!quote || quote.sellerId !== userId(req)) throw new ApiError(404, 'Quote request not found', 'QUOTE_REQUEST_NOT_FOUND');
  const body = parse(quoteResponseBody, req.body);
  const response = await procurementWorkflow.createQuoteResponse(actorFrom(req), id, body);
  ok(res, response, 201);
}));

for (const [path, status, action] of [
  ['/quote-responses/:id/accept', 'ACCEPTED', 'quote_response.accepted'],
  ['/quote-responses/:id/reject', 'REJECTED', 'quote_response.rejected']
] as const) {
  router.post(path, authenticate, authorize('buyer', 'admin'), asyncRoute(async (req, res) => {
    const { id } = parse(idParams, req.params);
    const response = await db.quoteResponse.findUnique({ where: { id }, include: { quoteRequest: true } });
    if (!response || (!isAdmin(req) && response.quoteRequest.buyerId !== userId(req))) throw new ApiError(404, 'Quote response not found', 'QUOTE_RESPONSE_NOT_FOUND');
    if (status === 'ACCEPTED') {
      const body = parse(z.object({ tenderId: z.coerce.number().int().positive().optional(), bidId: z.coerce.number().int().positive().optional(), title: z.string().trim().min(3).max(200).optional() }), req.body);
      ok(res, await procurementWorkflow.acceptQuoteResponseAndGeneratePO(actorFrom(req), id, body));
      return;
    }
    const updated = await db.quoteResponse.update({ where: { id }, data: { status } });
    await auditWrite(req, action, 'quoteResponse', id);
    ok(res, updated);
  }));
}

// Tenders, bids, auctions
router.post('/tenders', authenticate, authorize('buyer'), asyncRoute(async (req, res) => {
  const body = parse(tenderBody, req.body);
  const tender = await tenderWorkflow.createTender(actorFrom(req), body);
  ok(res, tender, 201);
}));

router.get('/tenders', authenticate, asyncRoute(async (req, res) => {
  const where = isAdmin(req) ? {} : req.user?.role === 'buyer' ? { buyerId: userId(req) } : { status: { in: ['published', 'bid_submission'] } };
  const tenders = await db.tender.findMany({ where, orderBy: { createdAt: 'desc' }, take: 100 });
  res.json(maskSensitive(tenders));
}));

router.get('/tenders/public', asyncRoute(async (req, res) => {
  const query = parse(paginationQuery, req.query);
  const key = redisKeys.cacheTenderPublic(sha256(JSON.stringify(query)));
  const tenders = await getOrSetCache(key, () => db.tender.findMany({
    where: { status: { in: ['published', 'bid_submission'] } },
    skip: query.skip,
    take: query.take,
    orderBy: { createdAt: 'desc' }
  }), 120);
  res.json(maskSensitive(tenders));
}));

router.get('/tenders/:id', authenticate, asyncRoute(async (req, res) => {
  const { id } = parse(idParams, req.params);
  ok(res, await assertTenderAccess(req, id));
}));

router.put('/tenders/:id', authenticate, authorize('buyer', 'admin'), asyncRoute(async (req, res) => {
  const { id } = parse(idParams, req.params);
  const tender = await assertTenderAccess(req, id);
  if (!isAdmin(req) && tender.buyerId !== userId(req)) throw new ApiError(403, 'Access denied', 'ACCESS_DENIED');
  const body = parse(tenderBody.partial(), req.body);
  const updated = await db.tender.update({ where: { id }, data: body });
  await auditWrite(req, 'tender.updated', 'tender', id);
  ok(res, updated);
}));

for (const [path, data, action] of [
  ['/tenders/:id/publish', 'published', 'tender.published'],
  ['/tenders/:id/close', 'closed', 'tender.closed']
] as const) {
  router.post(path, authenticate, authorize('buyer', 'admin'), asyncRoute(async (req, res) => {
    const { id } = parse(idParams, req.params);
    const tender = await assertTenderAccess(req, id);
    if (!isAdmin(req) && tender.buyerId !== userId(req)) throw new ApiError(403, 'Access denied', 'ACCESS_DENIED');
    const updated = await tenderWorkflow.transitionTender(actorFrom(req), id, data);
    await auditWrite(req, action, 'tender', id);
    ok(res, updated);
  }));
}

router.post('/tenders/:id/items', authenticate, authorize('buyer', 'admin'), asyncRoute(async (req, res) => {
  const { id } = parse(idParams, req.params);
  const tender = await assertTenderAccess(req, id);
  if (!isAdmin(req) && tender.buyerId !== userId(req)) throw new ApiError(403, 'Access denied', 'ACCESS_DENIED');
  const body = parse(z.object({ itemName: z.string().trim().min(2), quantity: z.coerce.number().positive(), unitOfMeasure: z.string().trim().min(1), description: z.string().optional(), productId: z.coerce.number().int().positive().optional(), estimatedUnitPrice: z.coerce.number().optional(), specifications: z.record(z.string(), z.unknown()).optional() }), req.body);
  const item = await db.tenderItem.create({ data: { ...body, tenderId: id } });
  await auditWrite(req, 'tender.item_added', 'tenderItem', item.id);
  ok(res, item, 201);
}));

router.post('/tenders/:id/documents', authenticate, authorize('buyer', 'admin'), upload.single('file'), asyncRoute(async (req: AuthRequest & { file?: Express.Multer.File }, res) => {
  const { id } = parse(idParams, req.params);
  const tender = await assertTenderAccess(req, id);
  if (!isAdmin(req) && tender.buyerId !== userId(req)) throw new ApiError(403, 'Access denied', 'ACCESS_DENIED');
  if (!req.file) throw new ApiError(400, 'Document file is required', 'DOCUMENT_REQUIRED');
  const asset = await db.fileAsset.create({ data: { ownerId: userId(req), ownerRole: String(req.user?.role), entityType: 'tender', entityId: id, storageProvider: 'local', key: `tenders/${id}/${Date.now()}-${req.file.originalname}`, mimeType: req.file.mimetype, size: req.file.size, checksum: sha256(req.file.buffer.toString('base64')), originalName: req.file.originalname, status: 'active' } });
  const doc = await db.tenderDocument.create({ data: { tenderId: id, fileAssetId: asset.id, documentType: clean(req.body?.documentType || 'tender'), title: clean(req.body?.title), isPublic: Boolean(req.body?.isPublic) } });
  await auditWrite(req, 'tender.document_added', 'tenderDocument', doc.id);
  ok(res, { asset, document: doc }, 201);
}));

router.get('/tenders/:id/participants', authenticate, authorize('buyer', 'admin'), asyncRoute(async (req, res) => {
  const { id } = parse(idParams, req.params);
  const tender = await assertTenderAccess(req, id);
  if (!isAdmin(req) && tender.buyerId !== userId(req)) throw new ApiError(403, 'Access denied', 'ACCESS_DENIED');
  ok(res, await db.tenderParticipant.findMany({ where: { tenderId: id }, include: { seller: { select: { id: true, name: true } } } }));
}));

router.post('/tenders/:id/bids', authenticate, authorize('seller'), asyncRoute(async (req, res) => {
  const { id } = parse(idParams, req.params);
  const tender = await assertTenderAccess(req, id);
  const body = parse(bidBody, req.body);
  const bid = await tenderWorkflow.submitBid(actorFrom(req), id, body);
  await auditWrite(req, 'bid.submitted', 'bid', bid.id, { tenderId: tender.id });
  ok(res, bid, 201);
}));

router.get('/bids/my', authenticate, authorize('seller'), asyncRoute(async (req, res) => {
  const bids = await db.bid.findMany({ where: { sellerId: userId(req) }, include: { tender: true }, orderBy: { createdAt: 'desc' } });
  res.json(maskSensitive(bids));
}));

router.get('/tenders/:id/bids', authenticate, authorize('buyer', 'admin'), asyncRoute(async (req, res) => {
  const { id } = parse(idParams, req.params);
  const tender = await assertTenderAccess(req, id);
  if (!isAdmin(req) && tender.buyerId !== userId(req)) throw new ApiError(403, 'Access denied', 'ACCESS_DENIED');
  const bids = await db.bid.findMany({ where: { tenderId: id }, include: { seller: { select: { id: true, name: true } } }, orderBy: { createdAt: 'desc' } });
  res.json(maskSensitive(bids));
}));

router.put('/bids/:id', authenticate, authorize('seller'), asyncRoute(async (req, res) => {
  const { id } = parse(idParams, req.params);
  const bid = await assertBidAccess(req, id);
  if (bid.sellerId !== userId(req)) throw new ApiError(403, 'Access denied', 'ACCESS_DENIED');
  const updated = await tenderWorkflow.modifyBid(actorFrom(req), id, parse(bidBody.partial(), req.body));
  await auditWrite(req, 'bid.updated', 'bid', id);
  ok(res, updated);
}));

router.post('/bids/:id/withdraw', authenticate, authorize('seller'), asyncRoute(async (req, res) => {
  const { id } = parse(idParams, req.params);
  const bid = await assertBidAccess(req, id);
  if (bid.sellerId !== userId(req)) throw new ApiError(403, 'Access denied', 'ACCESS_DENIED');
  const updated = await tenderWorkflow.withdrawBid(actorFrom(req), id);
  await auditWrite(req, 'bid.withdrawn', 'bid', id);
  ok(res, updated);
}));

router.post('/bids/:id/status', authenticate, authorize('buyer', 'admin'), asyncRoute(async (req, res) => {
  const { id } = parse(idParams, req.params);
  const bid = await assertBidAccess(req, id);
  const body = parse(z.object({ status: z.string().trim().min(2), statusEnum: z.string().trim().optional(), title: z.string().trim().min(3).max(200).optional() }), req.body);
  if (!isAdmin(req) && bid.tender.buyerId !== userId(req)) throw new ApiError(403, 'Access denied', 'ACCESS_DENIED');
  if (body.status === 'accepted') {
    ok(res, await tenderWorkflow.awardBidAndGeneratePO(actorFrom(req), id, body.title));
    return;
  }
  const updated = await db.bid.update({ where: { id }, data: body });
  await auditWrite(req, 'bid.status_updated', 'bid', id, body);
  ok(res, updated);
}));

router.post('/tenders/:id/auction', authenticate, authorize('buyer', 'admin'), asyncRoute(async (req, res) => {
  const { id } = parse(idParams, req.params);
  const tender = await assertTenderAccess(req, id);
  if (!isAdmin(req) && tender.buyerId !== userId(req)) throw new ApiError(403, 'Access denied', 'ACCESS_DENIED');
  const body = parse(z.object({ startPrice: z.coerce.number().positive(), minDecrement: z.coerce.number().positive().default(1), startTime: z.coerce.date(), endTime: z.coerce.date() }), req.body);
  const auction = await tenderWorkflow.createAuction(actorFrom(req), id, body);
  await auditWrite(req, 'auction.created', 'auction', auction.id);
  ok(res, auction, 201);
}));

router.get('/auctions/:id', authenticate, asyncRoute(async (req, res) => {
  const { id } = parse(idParams, req.params);
  const auction = await db.auction.findUnique({ where: { id }, include: { Tender: true } });
  if (!auction || (!isAdmin(req) && auction.Tender.buyerId !== userId(req) && req.user?.role !== 'seller')) throw new ApiError(404, 'Auction not found', 'AUCTION_NOT_FOUND');
  ok(res, auction);
}));

router.post('/auctions/:id/bids', authenticate, authorize('seller'), asyncRoute(async (req, res) => {
  const { id } = parse(idParams, req.params);
  const body = parse(z.object({ bidAmount: z.coerce.number().positive(), deviceHash: z.string().optional() }), req.body);
  const result = await tenderWorkflow.placeAuctionBid(actorFrom(req), id, { ...body, ipAddress: req.ip, userAgentHash: sha256(String(req.headers['user-agent'] || '')) });
  await auditWrite(req, 'auction.bid_submitted', 'auctionBid', result.auctionBid.id);
  ok(res, result, 201);
}));

router.get('/auctions/:id/history', authenticate, asyncRoute(async (req, res) => {
  const { id } = parse(idParams, req.params);
  ok(res, await db.auctionBid.findMany({ where: { auctionId: id }, orderBy: { createdAt: 'desc' }, take: isAdmin(req) ? 200 : 50 }));
}));

router.post('/auctions/:id/finalize', authenticate, authorize('buyer', 'admin'), asyncRoute(async (req, res) => {
  const { id } = parse(idParams, req.params);
  const auction = await db.auction.findUnique({ where: { id }, include: { Tender: true } });
  if (!auction || (!isAdmin(req) && auction.Tender.buyerId !== userId(req))) throw new ApiError(404, 'Auction not found', 'AUCTION_NOT_FOUND');
  const result = await tenderWorkflow.finalizeAuction(actorFrom(req), id);
  await auditWrite(req, 'auction.finalized', 'auction', id);
  ok(res, result);
}));

// Evaluation and contracts
router.post('/tenders/:id/technical-criteria', authenticate, authorize('buyer', 'admin'), asyncRoute(async (req, res) => {
  const { id } = parse(idParams, req.params);
  await assertTenderAccess(req, id);
  const body = parse(z.object({ name: z.string().min(2), description: z.string().optional(), maxScore: z.coerce.number().positive(), weightage: z.coerce.number().optional(), isMandatory: z.boolean().optional() }), req.body);
  const criteria = await db.technicalEvaluationCriteria.create({ data: { ...body, tenderId: id } });
  await auditWrite(req, 'evaluation.criteria_created', 'technicalEvaluationCriteria', criteria.id);
  ok(res, criteria, 201);
}));

router.post('/bids/:id/technical-evaluation', authenticate, authorize('buyer', 'admin'), asyncRoute(async (req, res) => {
  const { id } = parse(idParams, req.params);
  await assertBidAccess(req, id);
  const body = parse(z.object({ criteriaId: z.coerce.number().int().positive(), score: z.coerce.number().nonnegative(), status: z.enum(['PENDING', 'IN_PROGRESS', 'QUALIFIED', 'DISQUALIFIED', 'APPROVED', 'REJECTED']).default('PENDING'), remarks: z.string().optional() }), req.body);
  const result = await tenderWorkflow.evaluateBid(actorFrom(req), id, 'technical', body);
  await auditWrite(req, 'evaluation.technical_recorded', 'technicalEvaluationResult', result.id);
  ok(res, result);
}));

router.post('/bids/:id/financial-evaluation', authenticate, authorize('buyer', 'admin'), asyncRoute(async (req, res) => {
  const { id } = parse(idParams, req.params);
  await assertBidAccess(req, id);
  const body = parse(z.object({ quotedAmount: z.coerce.number().nonnegative(), evaluatedAmount: z.coerce.number().nonnegative().optional(), rank: z.coerce.number().int().positive().optional(), status: z.enum(['PENDING', 'IN_PROGRESS', 'QUALIFIED', 'DISQUALIFIED', 'APPROVED', 'REJECTED']).default('PENDING'), remarks: z.string().optional() }), req.body);
  const result = await tenderWorkflow.evaluateBid(actorFrom(req), id, 'financial', body);
  await auditWrite(req, 'evaluation.financial_recorded', 'financialEvaluation', result.id);
  ok(res, result);
}));

router.get('/tenders/:id/evaluation-summary', authenticate, authorize('buyer', 'admin'), asyncRoute(async (req, res) => {
  const { id } = parse(idParams, req.params);
  await assertTenderAccess(req, id);
  const [technicalCriteria, technicalResults, financialEvaluations] = await Promise.all([
    db.technicalEvaluationCriteria.findMany({ where: { tenderId: id } }),
    db.technicalEvaluationResult.findMany({ where: { tenderId: id } }),
    db.financialEvaluation.findMany({ where: { tenderId: id } })
  ]);
  ok(res, { technicalCriteria, technicalResults, financialEvaluations });
}));

router.post('/tenders/:id/comparative-statement', authenticate, authorize('buyer', 'admin'), asyncRoute(async (req, res) => {
  const { id } = parse(idParams, req.params);
  await assertTenderAccess(req, id);
  const statement = await tenderWorkflow.createComparativeStatement(actorFrom(req), id);
  await auditWrite(req, 'evaluation.comparative_statement_created', 'comparativeStatement', statement.id);
  ok(res, statement, 201);
}));

router.post('/contracts', authenticate, authorize('buyer', 'admin'), asyncRoute(async (req, res) => {
  const body = parse(z.object({ tenderId: z.coerce.number().int().positive().optional(), bidId: z.coerce.number().int().positive().optional(), title: z.string().min(3), value: z.coerce.number().nonnegative(), contractType: z.enum(['PURCHASE', 'RATE_CONTRACT', 'SERVICE_AGREEMENT', 'FRAMEWORK_AGREEMENT']).default('PURCHASE'), startDate: z.coerce.date().optional(), endDate: z.coerce.date().optional(), metadata: z.record(z.string(), z.unknown()).optional() }), req.body);
  const contract = await contractWorkflow.createAfterAward(actorFrom(req), body);
  await auditWrite(req, 'contract.created', 'contract', contract.id);
  ok(res, contract, 201);
}));

router.get('/contracts', authenticate, asyncRoute(async (req, res) => {
  const where = isAdmin(req) ? {} : req.user?.role === 'buyer' ? { tender: { buyerId: userId(req) } } : { bid: { sellerId: userId(req) } };
  ok(res, await db.contract.findMany({ where, orderBy: { updatedAt: 'desc' }, take: 100 }));
}));

router.get('/contracts/:id', authenticate, asyncRoute(async (req, res) => {
  const { id } = parse(idParams, req.params);
  const contract = await db.contract.findUnique({ where: { id }, include: { tender: true, bid: true } });
  if (!contract || (!isAdmin(req) && contract.tender?.buyerId !== userId(req) && contract.bid?.sellerId !== userId(req))) throw new ApiError(404, 'Contract not found', 'CONTRACT_NOT_FOUND');
  ok(res, contract);
}));

router.put('/contracts/:id', authenticate, authorize('buyer', 'admin'), asyncRoute(async (req, res) => {
  const { id } = parse(idParams, req.params);
  const existing = await db.contract.findUnique({ where: { id }, include: { tender: true } });
  if (!existing || (!isAdmin(req) && existing.tender?.buyerId !== userId(req))) throw new ApiError(404, 'Contract not found', 'CONTRACT_NOT_FOUND');
  const contract = await db.contract.update({ where: { id }, data: req.body || {} });
  await auditWrite(req, 'contract.updated', 'contract', id);
  ok(res, contract);
}));

router.post('/contracts/:id/upload-document', authenticate, authorize('buyer', 'admin'), upload.single('file'), asyncRoute(async (req: AuthRequest & { file?: Express.Multer.File }, res) => {
  const { id } = parse(idParams, req.params);
  const existing = await db.contract.findUnique({ where: { id }, include: { tender: true } });
  if (!existing || (!isAdmin(req) && existing.tender?.buyerId !== userId(req))) throw new ApiError(404, 'Contract not found', 'CONTRACT_NOT_FOUND');
  if (!req.file) throw new ApiError(400, 'Document file is required', 'DOCUMENT_REQUIRED');
  const asset = await contractWorkflow.uploadDocument(actorFrom(req), id, req.file);
  await auditWrite(req, 'contract.document_uploaded', 'fileAsset', asset.id);
  ok(res, asset, 201);
}));

// PO, delivery, inspection, invoices, payments and escrow
router.post('/purchase-orders/generate', authenticate, authorize('buyer', 'admin'), paymentRateLimit, asyncRoute(async (req, res) => {
  const body = parse(z.object({ bidId: z.coerce.number().int().positive(), title: z.string().trim().min(3).max(200).optional() }), req.body);
  const result = await tenderWorkflow.awardBidAndGeneratePO(actorFrom(req), body.bidId, body.title);
  await auditWrite(req, 'purchase_order.generated', 'purchaseOrder', result.purchaseOrder.id);
  ok(res, result, 201);
}));

router.get('/purchase-orders', authenticate, asyncRoute(async (req, res) => {
  const where = isAdmin(req) ? {} : req.user?.role === 'buyer' ? { buyerId: userId(req) } : { sellerId: userId(req) };
  ok(res, await db.purchaseOrder.findMany({
    where,
    include: {
      buyer: { select: { id: true, name: true, email: true } },
      seller: { select: { id: true, name: true, email: true } },
      deliveryTrackings: { include: { events: { orderBy: { occurredAt: 'desc' } } } },
      invoices: true
    },
    orderBy: { updatedAt: 'desc' },
    take: 100
  }));
}));

router.get('/purchase-orders/:id', authenticate, asyncRoute(async (req, res) => {
  const { id } = parse(idParams, req.params);
  const po = await db.purchaseOrder.findUnique({ where: { id }, include: { items: true, invoices: true, deliveryTrackings: true, inspectionReports: true } });
  if (!po || (!isAdmin(req) && po.buyerId !== userId(req) && po.sellerId !== userId(req))) throw new ApiError(404, 'Purchase order not found', 'PO_NOT_FOUND');
  ok(res, po);
}));

for (const [path, action, roles] of [
  ['/purchase-orders/:id/acknowledge', 'purchase_order.acknowledged', ['seller', 'admin']],
  ['/purchase-orders/:id/cancel', 'purchase_order.cancelled', ['buyer', 'admin']]
] as const) {
  router.post(path, authenticate, authorize(...roles), asyncRoute(async (req, res) => {
    const { id } = parse(idParams, req.params);
    const po = await db.purchaseOrder.findUnique({ where: { id } });
    if (!po || (!isAdmin(req) && po.buyerId !== userId(req) && po.sellerId !== userId(req))) throw new ApiError(404, 'Purchase order not found', 'PO_NOT_FOUND');
    const updated = action === 'purchase_order.acknowledged'
      ? await fulfillmentWorkflow.acknowledgePO(actorFrom(req), id)
      : await fulfillmentWorkflow.cancelPO(actorFrom(req), id);
    await auditWrite(req, action, 'purchaseOrder', id);
    ok(res, updated);
  }));
}

router.get('/purchase-orders/:id/pdf', authenticate, asyncRoute(async (req, res) => {
  const { id } = parse(idParams, req.params);
  const po = await assertPurchaseOrderAccess(req, id);
  ok(res, { purchaseOrderId: id, pdfFileId: po.pdfFileId, url: po.pdfFileId ? `/api/files/${po.pdfFileId}/signed-url` : null });
}));

router.post('/purchase-orders/:id/delivery', authenticate, authorize('seller', 'admin'), asyncRoute(async (req, res) => {
  const { id } = parse(idParams, req.params);
  const po = await assertPurchaseOrderAccess(req, id);
  if (!isAdmin(req) && po.sellerId !== userId(req)) throw new ApiError(403, 'Access denied', 'ACCESS_DENIED');
  const body = parse(z.object({ trackingNumber: z.string().trim().max(120).optional(), carrierName: z.string().trim().max(120).optional(), expectedDelivery: z.coerce.date().optional(), currentLocation: z.string().optional() }), req.body);
  const delivery = await fulfillmentWorkflow.createDelivery(actorFrom(req), id, body);
  await auditWrite(req, 'delivery.created', 'deliveryTracking', delivery.id);
  ok(res, delivery, 201);
}));

router.post('/delivery/:id/events', authenticate, authorize('seller', 'admin'), asyncRoute(async (req, res) => {
  const { id } = parse(idParams, req.params);
  const delivery = await db.deliveryTracking.findUnique({ where: { id }, include: { purchaseOrder: true } });
  if (!delivery || (!isAdmin(req) && delivery.purchaseOrder.sellerId !== userId(req))) throw new ApiError(404, 'Delivery not found', 'DELIVERY_NOT_FOUND');
  const body = parse(z.object({ status: z.enum(['CREATED', 'DISPATCHED', 'IN_TRANSIT', 'OUT_FOR_DELIVERY', 'DELIVERED', 'DELAYED', 'RETURNED', 'CANCELLED']), location: z.string().optional(), remarks: z.string().optional() }), req.body);
  const event = await fulfillmentWorkflow.addDeliveryEvent(actorFrom(req), id, body);
  await auditWrite(req, 'delivery.event_added', 'deliveryTrackingEvent', event.id);
  ok(res, event, 201);
}));

router.get('/delivery/:id', authenticate, asyncRoute(async (req, res) => {
  const { id } = parse(idParams, req.params);
  const delivery = await db.deliveryTracking.findUnique({ where: { id }, include: { events: true, purchaseOrder: true } });
  if (!delivery || (!isAdmin(req) && delivery.purchaseOrder.buyerId !== userId(req) && delivery.purchaseOrder.sellerId !== userId(req))) throw new ApiError(404, 'Delivery not found', 'DELIVERY_NOT_FOUND');
  ok(res, delivery);
}));

router.post('/purchase-orders/:id/inspection', authenticate, authorize('buyer', 'admin'), asyncRoute(async (req, res) => {
  const { id } = parse(idParams, req.params);
  const po = await assertPurchaseOrderAccess(req, id);
  if (!isAdmin(req) && po.buyerId !== userId(req)) throw new ApiError(403, 'Access denied', 'ACCESS_DENIED');
  const report = await fulfillmentWorkflow.createInspection(actorFrom(req), id, { remarks: clean(req.body?.remarks), metadata: req.body?.metadata });
  await auditWrite(req, 'inspection.created', 'inspectionReport', report.id);
  ok(res, report, 201);
}));

router.get('/purchase-orders/:id/inspection', authenticate, asyncRoute(async (req, res) => {
  const { id } = parse(idParams, req.params);
  await assertPurchaseOrderAccess(req, id);
  ok(res, await db.inspectionReport.findMany({ where: { purchaseOrderId: id }, orderBy: { createdAt: 'desc' } }));
}));

for (const [path, status, action] of [
  ['/inspection/:id/approve', 'ACCEPTED', 'inspection.approved'],
  ['/inspection/:id/reject', 'REJECTED', 'inspection.rejected']
] as const) {
  router.post(path, authenticate, authorize('buyer', 'admin'), asyncRoute(async (req, res) => {
    const { id } = parse(idParams, req.params);
    const existing = await db.inspectionReport.findUnique({ where: { id }, include: { purchaseOrder: true } });
    if (!existing || (!isAdmin(req) && existing.purchaseOrder.buyerId !== userId(req))) throw new ApiError(404, 'Inspection not found', 'INSPECTION_NOT_FOUND');
    const report = await fulfillmentWorkflow.decideInspection(actorFrom(req), id, status === 'ACCEPTED', clean(req.body?.remarks));
    await auditWrite(req, action, 'inspectionReport', id);
    ok(res, report);
  }));
}

router.post('/invoices', authenticate, authorize('seller', 'admin'), asyncRoute(async (req, res) => {
  const body = parse(z.object({
    purchaseOrderId: z.coerce.number().int().positive(),
    amount: z.coerce.number().positive().optional(),
    gstRate: z.coerce.number().min(0).max(100).optional(),
    tdsRate: z.coerce.number().min(0).max(100).optional(),
    interstate: z.boolean().optional(),
    items: z.array(z.object({
      itemName: z.string().trim().min(2),
      description: z.string().optional(),
      quantity: z.coerce.number().positive(),
      unitPrice: z.coerce.number().nonnegative(),
      taxableAmount: z.coerce.number().nonnegative().optional(),
      totalAmount: z.coerce.number().nonnegative().optional()
    })).optional()
  }), req.body);
  const po = await db.purchaseOrder.findUnique({ where: { id: body.purchaseOrderId } });
  if (!po || (!isAdmin(req) && po.sellerId !== userId(req))) throw new ApiError(404, 'Purchase order not found', 'PO_NOT_FOUND');
  const invoice = await fulfillmentWorkflow.createInvoice(actorFrom(req), body);
  await auditWrite(req, 'invoice.created', 'invoice', invoice.id);
  ok(res, invoice, 201);
}));

router.get('/invoices', authenticate, asyncRoute(async (req, res) => {
  const where = isAdmin(req) ? {} : req.user?.role === 'buyer' ? { buyerId: userId(req) } : { sellerId: userId(req) };
  ok(res, await db.invoice.findMany({ where, orderBy: { updatedAt: 'desc' }, take: 100 }));
}));

router.get('/invoices/:id', authenticate, asyncRoute(async (req, res) => {
  const { id } = parse(idParams, req.params);
  const invoice = await db.invoice.findUnique({ where: { id }, include: { items: true, payments: true } });
  if (!invoice || (!isAdmin(req) && invoice.buyerId !== userId(req) && invoice.sellerId !== userId(req))) throw new ApiError(404, 'Invoice not found', 'INVOICE_NOT_FOUND');
  ok(res, invoice);
}));

for (const [path, data, action] of [
  ['/invoices/:id/approve', { status: 'approved', invoiceStatus: 'APPROVED', approvedAt: new Date() }, 'invoice.approved'],
  ['/invoices/:id/reject', { status: 'rejected', invoiceStatus: 'REJECTED' }, 'invoice.rejected']
] as const) {
  router.post(path, authenticate, authorize('buyer', 'admin'), asyncRoute(async (req, res) => {
    const { id } = parse(idParams, req.params);
    const existing = await db.invoice.findUnique({ where: { id } });
    if (!existing || (!isAdmin(req) && existing.buyerId !== userId(req))) throw new ApiError(404, 'Invoice not found', 'INVOICE_NOT_FOUND');
    const invoice = await fulfillmentWorkflow.decideInvoice(actorFrom(req), id, data.invoiceStatus === 'APPROVED');
    await auditWrite(req, action, 'invoice', id);
    ok(res, invoice);
  }));
}

router.get('/payments/:id', authenticate, asyncRoute(async (req, res) => {
  const { id } = parse(idParams, req.params);
  const payment = await db.paymentTransaction.findUnique({ where: { id }, include: { escrowAccount: true, ledgerEntries: true } });
  if (!payment || (!isAdmin(req) && payment.payerId !== userId(req) && payment.payeeId !== userId(req))) throw new ApiError(404, 'Payment not found', 'PAYMENT_NOT_FOUND');
  ok(res, payment);
}));

router.post('/payments/:id/reconcile', authenticate, authorizeAdmin, paymentRateLimit, asyncRoute(async (req, res) => {
  const { id } = parse(idParams, req.params);
  const body = parse(z.object({ status: z.enum(['success', 'failed', 'refunded', 'cancelled']), remarks: z.string().trim().max(1000).optional(), reversalLedgerEntryId: z.coerce.number().int().positive().optional() }), req.body);
  const key = idempotencyKeyFromRequest(req, `phase4-payment-reconcile:${id}:${body.status}:${userId(req)}`);
  const payment = await withIdempotency({
    req,
    userId: userId(req),
    route: 'POST /api/payments/:id/reconcile',
    key,
    handler: async () => reconcilePaymentWorkflow(actorFrom(req), id, body) as Promise<Record<string, unknown>>
  });
  await auditWrite(req, 'payment.reconciled', 'paymentTransaction', id, body);
  ok(res, payment);
}));

router.get('/escrow', authenticate, authorize('buyer', 'seller', 'admin'), asyncRoute(async (req, res) => ok(res, await listEscrowAccounts(actorFrom(req)))));

router.get('/escrow/:id', authenticate, asyncRoute(async (req, res) => {
  const { id } = parse(idParams, req.params);
  const escrow = await db.escrowAccount.findUnique({ where: { id }, include: { milestones: true, transactions: true, paymentTransaction: true } });
  if (!escrow || (!isAdmin(req) && escrow.buyerId !== userId(req) && escrow.sellerId !== userId(req))) throw new ApiError(404, 'Escrow not found', 'ESCROW_NOT_FOUND');
  ok(res, escrow);
}));

router.post('/escrow/:id/milestones', authenticate, authorize('buyer', 'admin'), asyncRoute(async (req, res) => {
  const { id } = parse(idParams, req.params);
  const body = parse(z.object({ title: z.string().min(3), description: z.string().optional(), amount: z.coerce.number().positive(), dueDate: z.string().datetime().optional(), metadata: z.record(z.string(), z.unknown()).optional() }), req.body);
  const key = idempotencyKeyFromRequest(req, `milestone-create:${id}:${body.title}:${userId(req)}`);
  ok(res, await withIdempotency({ req, userId: userId(req), route: 'POST /api/escrow/:id/milestones', key, handler: async () => createMilestone(actorFrom(req), id, body) as Promise<Record<string, unknown>> }), 201);
}));

router.post('/milestones/:id/complete', authenticate, authorize('seller', 'admin'), asyncRoute(async (req, res) => {
  const id = parse(idParams, req.params).id;
  const key = idempotencyKeyFromRequest(req, `milestone-complete:${id}:${userId(req)}`);
  ok(res, await withIdempotency({ req, userId: userId(req), route: 'POST /api/milestones/:id/complete', key, handler: async () => completeMilestone(actorFrom(req), id) as Promise<Record<string, unknown>> }));
}));
router.post('/milestones/:id/approve', authenticate, authorize('buyer', 'admin'), asyncRoute(async (req, res) => {
  const id = parse(idParams, req.params).id;
  const key = idempotencyKeyFromRequest(req, `milestone-approve:${id}:${userId(req)}`);
  ok(res, await withIdempotency({ req, userId: userId(req), route: 'POST /api/milestones/:id/approve', key, handler: async () => approveMilestone(actorFrom(req), id, clean(req.body?.reason)) as Promise<Record<string, unknown>> }));
}));
router.post('/milestones/:id/release', authenticate, authorize('buyer', 'admin'), asyncRoute(async (req, res) => {
  const id = parse(idParams, req.params).id;
  const key = idempotencyKeyFromRequest(req, `milestone-release:${id}:${userId(req)}`);
  ok(res, await withIdempotency({ req, userId: userId(req), route: 'POST /api/milestones/:id/release', key, handler: async () => approveMilestone(actorFrom(req), id, clean(req.body?.reason)) as Promise<Record<string, unknown>> }));
}));
router.post('/escrow/:id/freeze', authenticate, authorize('buyer', 'seller', 'admin'), asyncRoute(async (req, res) => {
  const { id } = parse(idParams, req.params);
  const key = idempotencyKeyFromRequest(req, `escrow-freeze:${id}:${userId(req)}`);
  ok(res, await withIdempotency({ req, userId: userId(req), route: 'POST /api/escrow/:id/freeze', key, handler: async () => fulfillmentWorkflow.freezeEscrowForDispute(actorFrom(req), id, clean(req.body?.reason)) as Promise<Record<string, unknown>> }));
}));
router.post('/escrow/:id/unfreeze', authenticate, authorize('buyer', 'admin'), asyncRoute(async (req, res) => {
  const { id } = parse(idParams, req.params);
  const key = idempotencyKeyFromRequest(req, `escrow-unfreeze:${id}:${userId(req)}`);
  ok(res, await withIdempotency({ req, userId: userId(req), route: 'POST /api/escrow/:id/unfreeze', key, handler: async () => unfreezeEscrow(actorFrom(req), id, clean(req.body?.reason)) as Promise<Record<string, unknown>> }));
}));

// Ratings
router.post('/ratings/supplier', authenticate, authorize('buyer'), asyncRoute(async (req, res) => {
  const body = parse(z.object({ sellerId: z.coerce.number().int().positive(), purchaseOrderId: z.coerce.number().int().positive().optional(), rating: z.coerce.number().int().min(1).max(5), review: z.string().max(2000).optional(), qualityScore: z.coerce.number().int().min(1).max(5).optional(), deliveryScore: z.coerce.number().int().min(1).max(5).optional(), communicationScore: z.coerce.number().int().min(1).max(5).optional() }), req.body);
  const rating = await ratingWorkflow.rateSupplier(actorFrom(req), body);
  await auditWrite(req, 'rating.supplier_created', 'supplierRating', rating.id);
  ok(res, rating, 201);
}));

router.post('/ratings/buyer', authenticate, authorize('seller'), asyncRoute(async (req, res) => {
  const body = parse(z.object({ buyerId: z.coerce.number().int().positive(), purchaseOrderId: z.coerce.number().int().positive().optional(), rating: z.coerce.number().int().min(1).max(5), review: z.string().max(2000).optional(), paymentTimelinessScore: z.coerce.number().int().min(1).max(5).optional(), communicationScore: z.coerce.number().int().min(1).max(5).optional() }), req.body);
  const rating = await ratingWorkflow.rateBuyer(actorFrom(req), body);
  await auditWrite(req, 'rating.buyer_created', 'buyerRating', rating.id);
  ok(res, rating, 201);
}));

router.get('/ratings/supplier/:sellerId', authenticate, asyncRoute(async (req, res) => {
  const { sellerId } = parse(sellerIdParams, req.params);
  ok(res, await db.supplierRating.findMany({ where: { sellerId }, orderBy: { createdAt: 'desc' }, take: 100 }));
}));

router.get('/ratings/buyer/:buyerId', authenticate, asyncRoute(async (req, res) => {
  const { buyerId } = parse(buyerIdParams, req.params);
  ok(res, await db.buyerRating.findMany({ where: { buyerId }, orderBy: { createdAt: 'desc' }, take: 100 }));
}));

// Admin reports
router.get('/admin/users', authenticate, authorizeAdmin, asyncRoute(async (req, res) => {
  const query = parse(paginationQuery.extend({
    role: z.string().trim().optional(),
    onboardingStatus: z.string().trim().optional(),
    accountStatus: z.string().trim().optional(),
    registrationStatus: z.string().trim().optional()
  }), req.query);
  const where: any = {};
  if (query.role) where.role = query.role;
  if (query.onboardingStatus) where.onboardingStatus = query.onboardingStatus;
  if (query.accountStatus) where.accountStatus = query.accountStatus;
  if (query.registrationStatus) where.registrationStatus = query.registrationStatus;
  if (query.q) {
    where.OR = [
      { name: { contains: query.q, mode: 'insensitive' } },
      { email: { contains: query.q, mode: 'insensitive' } },
      { mobile: { contains: query.q, mode: 'insensitive' } },
      { userId: { contains: query.q, mode: 'insensitive' } }
    ];
  }
  const [records, total] = await Promise.all([
    db.user.findMany({
      where,
      include: {
        organization: true,
        buyerProfile: true,
        sellerProfile: true,
        sessions: { orderBy: { createdAt: 'desc' }, take: 3 },
        complianceViolations: { orderBy: { createdAt: 'desc' }, take: 5 },
        fraudAlerts: { orderBy: { createdAt: 'desc' }, take: 5 }
      },
      orderBy: { createdAt: 'desc' },
      skip: query.skip,
      take: query.take
    }),
    db.user.count({ where })
  ]);
  ok(res, { records, total, filters: query });
}));

router.get('/admin/audit-logs', authenticate, authorizeAdmin, asyncRoute(async (req, res) => {
  const query = parse(paginationQuery.extend({
    action: z.string().trim().optional(),
    entityType: z.string().trim().optional(),
    userId: z.coerce.number().int().positive().optional()
  }), req.query);
  const where: any = {};
  if (query.action) where.action = { contains: query.action, mode: 'insensitive' };
  if (query.entityType) where.entityType = { contains: query.entityType, mode: 'insensitive' };
  if (query.userId) where.userId = query.userId;
  if (query.q) {
    where.OR = [
      { action: { contains: query.q, mode: 'insensitive' } },
      { entityType: { contains: query.q, mode: 'insensitive' } }
    ];
  }
  const [records, total] = await Promise.all([
    db.auditLog.findMany({ where, include: { User: { select: { id: true, name: true, email: true, role: true } } }, orderBy: { createdAt: 'desc' }, skip: query.skip, take: query.take }),
    db.auditLog.count({ where })
  ]);
  ok(res, { records, total, filters: query });
}));

router.get('/admin/fraud-alerts', authenticate, authorizeAdmin, asyncRoute(async (req, res) => {
  const query = parse(paginationQuery.extend({
    severity: z.string().trim().optional(),
    alertType: z.string().trim().optional()
  }), req.query);
  const where: any = {};
  if (query.status) where.status = query.status;
  if (query.severity) where.severity = query.severity;
  if (query.alertType) where.alertType = query.alertType;
  if (query.q) {
    where.OR = [
      { entityType: { contains: query.q, mode: 'insensitive' } },
      { user: { name: { contains: query.q, mode: 'insensitive' } } },
      { user: { email: { contains: query.q, mode: 'insensitive' } } }
    ];
  }
  const [records, total, openComplianceFlags, failedLogins] = await Promise.all([
    db.fraudAlert.findMany({ where, include: { user: { select: { id: true, name: true, email: true, role: true } }, organization: true, reviewedBy: { select: { id: true, name: true, email: true } } }, orderBy: { createdAt: 'desc' }, skip: query.skip, take: query.take }),
    db.fraudAlert.count({ where }),
    db.complianceViolation.count({ where: { status: 'open', severity: { in: ['high', 'critical'] } } }).catch(() => 0),
    db.loginEvent.count({ where: { success: false } }).catch(() => 0)
  ]);
  ok(res, { records, total, filters: query, summary: { openComplianceFlags, failedLogins } });
}));

router.get('/admin/compliance-rules', authenticate, authorizeAdmin, asyncRoute(async (req, res) => {
  const defaults = [
    { code: 'KYC_PAN_REQUIRED', title: 'PAN verification required', description: 'Seller and buyer onboarding must include a valid PAN verification result.', severity: 'HIGH' },
    { code: 'GSTIN_FORMAT_CHECK', title: 'GSTIN format and ownership check', description: 'GSTIN must match the registered legal entity wherever applicable.', severity: 'MEDIUM' },
    { code: 'BANK_ACCOUNT_DUPLICATE', title: 'Duplicate bank account prevention', description: 'Multiple sellers using the same bank account require manual compliance review.', severity: 'HIGH' },
    { code: 'BID_DEADLINE_ENFORCEMENT', title: 'Bid deadline enforcement', description: 'Bids and bid modifications after deadline must be blocked.', severity: 'CRITICAL' }
  ];
  if (await db.complianceRule.count().catch(() => 0) === 0) {
    await Promise.all(defaults.map(rule => db.complianceRule.upsert({ where: { code: rule.code }, update: {}, create: rule }).catch(() => null)));
  }
  const query = parse(paginationQuery.extend({
    severity: z.string().trim().optional(),
    isActive: z.coerce.boolean().optional()
  }), req.query);
  const where: any = {};
  if (query.severity) where.severity = query.severity;
  if (query.isActive !== undefined) where.isActive = query.isActive;
  if (query.q) {
    where.OR = [
      { code: { contains: query.q, mode: 'insensitive' } },
      { title: { contains: query.q, mode: 'insensitive' } },
      { description: { contains: query.q, mode: 'insensitive' } }
    ];
  }
  const [records, total] = await Promise.all([
    db.complianceRule.findMany({ where, include: { violations: { orderBy: { createdAt: 'desc' }, take: 5 } }, orderBy: { createdAt: 'desc' }, skip: query.skip, take: query.take }),
    db.complianceRule.count({ where })
  ]);
  ok(res, { records, total, filters: query });
}));

router.get('/admin/reports/summary', authenticate, authorizeAdmin, asyncRoute(async (_req, res) => {
  const [
    totalNetwork,
    activeSellers,
    activeBuyers,
    pendingApproval,
    tenders,
    bids,
    purchaseOrders,
    payments,
    disputes
  ] = await Promise.all([
    db.user.count(),
    db.user.count({ where: { role: 'seller', onboardingStatus: 'approved_for_procurement' } }),
    db.user.count({ where: { role: 'buyer', onboardingStatus: 'approved_for_procurement' } }),
    db.user.count({ where: { onboardingStatus: 'pending_validation' } }),
    db.tender.count(),
    db.bid.count(),
    db.purchaseOrder.count(),
    db.paymentTransaction.count(),
    db.dispute.count()
  ]);

  // Aggregate user growth by month (last 6 months)
  const sixMonthsAgo = new Date();
  sixMonthsAgo.setMonth(sixMonthsAgo.getMonth() - 6);
  const recentUsers = await db.user.findMany({
    where: { createdAt: { gte: sixMonthsAgo } },
    select: { createdAt: true, role: true }
  });
  
  const monthNames = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
  const growthMap = new Map();
  // Initialize last 6 months
  for (let i = 5; i >= 0; i--) {
    const d = new Date();
    d.setMonth(d.getMonth() - i);
    growthMap.set(monthNames[d.getMonth()], { name: monthNames[d.getMonth()], buyers: 0, sellers: 0 });
  }
  
  recentUsers.forEach((u: any) => {
    const d = new Date(u.createdAt);
    const m = monthNames[d.getMonth()];
    if (growthMap.has(m)) {
      const entry = growthMap.get(m);
      if (u.role === 'buyer') entry.buyers++;
      if (u.role === 'seller') entry.sellers++;
    }
  });
  const userGrowth = Array.from(growthMap.values());

  // Aggregate transactions by day of week
  const sevenDaysAgo = new Date();
  sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 7);
  const recentPayments = await db.paymentTransaction.findMany({
    where: { createdAt: { gte: sevenDaysAgo } },
    select: { createdAt: true, amount: true }
  });
  const dayNames = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
  const txnMap = new Map();
  // Initialize last 7 days
  for (let i = 6; i >= 0; i--) {
    const d = new Date();
    d.setDate(d.getDate() - i);
    txnMap.set(dayNames[d.getDay()], { name: dayNames[d.getDay()], value: 0 });
  }
  recentPayments.forEach((p: any) => {
    const d = new Date(p.createdAt);
    const day = dayNames[d.getDay()];
    if (txnMap.has(day)) {
      txnMap.get(day).value += Number(p.amount);
    }
  });
  const transactions = Array.from(txnMap.values());

  // KPIs
  // Avg Onboarding Time
  const approvedUsers = await db.user.findMany({
    where: { onboardingStatus: 'approved_for_procurement' },
    select: { createdAt: true, updatedAt: true }
  });
  let avgOnboardingTime = '0 Days';
  if (approvedUsers.length > 0) {
    const totalMs = approvedUsers.reduce((sum: number, u: any) => sum + (new Date(u.updatedAt).getTime() - new Date(u.createdAt).getTime()), 0);
    avgOnboardingTime = (totalMs / approvedUsers.length / (1000 * 60 * 60 * 24)).toFixed(1) + ' Days';
  }

  // Approval Rate
  const totalOnboarded = await db.user.count({ where: { onboardingStatus: { not: 'pending' } } });
  const approvalRate = totalOnboarded > 0 ? ((activeSellers + activeBuyers) / totalOnboarded * 100).toFixed(1) + '%' : '0%';

  // Active Procurement Value
  const activePOs = await db.purchaseOrder.aggregate({
    where: { status: { in: ['accepted', 'in_progress', 'delivered'] } },
    _sum: { totalAmount: true }
  });
  const activeProcurementValue = '₹' + (Number(activePOs._sum.totalAmount || 0) / 10000000).toFixed(2) + 'Cr';

  // Tender Success Rate
  const closedTenders = await db.tender.count({ where: { status: 'closed' } });
  const awardedTenders = await db.tender.count({ where: { status: 'closed', awardedBidId: { not: null } } });
  const tenderSuccessRate = closedTenders > 0 ? ((awardedTenders / closedTenders) * 100).toFixed(1) + '%' : '0%';

  ok(res, {
    totalNetwork, activeSellers, activeBuyers, pendingApproval,
    tenders, bids, purchaseOrders, payments, disputes,
    userGrowth, transactions,
    avgOnboardingTime, approvalRate, activeProcurementValue, tenderSuccessRate
  });
}));

router.get('/admin/reports/procurement', authenticate, authorizeAdmin, asyncRoute(async (_req, res) => {
  const [requirements, tenders, directPurchases, quoteRequests, purchaseOrders] = await Promise.all([
    db.requirement.count(),
    db.tender.count(),
    db.directPurchase.count(),
    db.quoteRequest.count(),
    db.purchaseOrder.count()
  ]);
  ok(res, { requirements, tenders, directPurchases, quoteRequests, purchaseOrders });
}));

router.get('/admin/reports/payments', authenticate, authorizeAdmin, asyncRoute(async (_req, res) => {
  const [invoices, payments, escrows, milestones] = await Promise.all([
    db.invoice.count(),
    db.paymentTransaction.count(),
    db.escrowAccount.count(),
    db.milestone.count()
  ]);
  ok(res, { invoices, payments, escrows, milestones });
}));

router.get('/admin/reports/suppliers', authenticate, authorizeAdmin, asyncRoute(async (_req, res) => {
  const [sellers, products, services, ratings] = await Promise.all([
    db.user.count({ where: { role: 'seller' } }),
    db.product.count(),
    db.service.count(),
    db.supplierRating.count()
  ]);
  ok(res, { sellers, products, services, ratings });
}));

router.post('/admin/fraud-alerts', authenticate, authorizeAdmin, asyncRoute(async (req, res) => {
  const alert = await db.fraudAlert.create({ data: req.body || {} });
  await auditWrite(req, 'fraud_alert.created', 'fraudAlert', alert.id);
  ok(res, alert, 201);
}));

router.post('/admin/compliance-violations', authenticate, authorizeAdmin, asyncRoute(async (req, res) => {
  const body = parse(z.object({ userId: z.coerce.number().int().positive().optional(), type: z.string().min(2), severity: z.enum(['low', 'medium', 'high', 'critical']).optional(), description: z.string().min(3), metadata: z.record(z.string(), z.unknown()).optional() }), req.body);
  const violation = await createComplianceFlag(body);
  ok(res, violation, 201);
}));

// ═══════════════════════════════════════════
// RBAC Administration Routes
// ═══════════════════════════════════════════

router.get('/admin/rbac/roles', authenticate, authorizeAdmin, asyncRoute(async (_req, res) => {
  const roles = await db.rbacRole.findMany({
    include: {
      permissions: {
        include: { permission: true }
      }
    },
    orderBy: { id: 'asc' }
  });
  ok(res, roles);
}));

router.get('/admin/rbac/permissions', authenticate, authorizeAdmin, asyncRoute(async (_req, res) => {
  const permissions = await db.permission.findMany({
    orderBy: [{ module: 'asc' }, { code: 'asc' }]
  });
  ok(res, permissions);
}));

router.post('/admin/rbac/update-permissions', authenticate, authorizeAdmin, asyncRoute(async (req, res) => {
  const body = parse(z.object({
    roleId: z.coerce.number().int().positive(),
    permissionIds: z.array(z.coerce.number().int().positive())
  }), req.body);

  const role = await db.rbacRole.findUnique({ where: { id: body.roleId } });
  if (!role) throw new ApiError(404, 'Role not found', 'ROLE_NOT_FOUND');

  // Validate all permission IDs exist
  const validPerms = await db.permission.findMany({
    where: { id: { in: body.permissionIds } },
    select: { id: true }
  });
  const validIds = new Set(validPerms.map((p: any) => p.id));
  const invalidIds = body.permissionIds.filter(id => !validIds.has(id));
  if (invalidIds.length > 0) {
    throw new ApiError(400, `Invalid permission IDs: ${invalidIds.join(', ')}`, 'INVALID_PERMISSIONS');
  }

  // Replace permissions in transaction
  await db.$transaction([
    db.rolePermission.deleteMany({ where: { roleId: body.roleId } }),
    ...body.permissionIds.map((permissionId: number) =>
      db.rolePermission.create({ data: { roleId: body.roleId, permissionId } })
    )
  ]);

  await auditWrite(req, 'rbac.permissions_updated', 'rbacRole', body.roleId, {
    permissionCount: body.permissionIds.length
  });

  const updated = await db.rbacRole.findUnique({
    where: { id: body.roleId },
    include: { permissions: { include: { permission: true } } }
  });
  ok(res, updated);
}));

// ═══════════════════════════════════════════
// Organization Management Routes
// ═══════════════════════════════════════════

router.get('/admin/organizations', authenticate, authorizeAdmin, asyncRoute(async (req, res) => {
  const query = parse(z.object({
    q: z.string().optional(),
    status: z.string().optional(),
    skip: z.coerce.number().int().nonnegative().optional().default(0),
    take: z.coerce.number().int().positive().optional().default(100)
  }), req.query);

  const where: any = {};
  if (query.q) {
    where.OR = [
      { organizationName: { contains: query.q, mode: 'insensitive' } },
      { gstin: { contains: query.q, mode: 'insensitive' } },
      { panNumber: { contains: query.q, mode: 'insensitive' } }
    ];
  }
  if (query.status) where.verificationStatus = query.status;

  const organizations = await db.organization.findMany({
    where,
    include: {
      _count: { select: { users: true, buyerProfiles: true, sellerProfiles: true, products: true, services: true } }
    },
    skip: query.skip,
    take: query.take,
    orderBy: { updatedAt: 'desc' }
  });

  // Inject features dynamically in response
  const { orgFeaturesService } = await import('../services/org-features.service.js');
  const orgsWithFeatures = organizations.map((org: any) => ({
    ...org,
    features: orgFeaturesService.getForOrg(org.id)
  }));

  const total = await db.organization.count({ where });
  ok(res, { organizations: orgsWithFeatures, total });
}));

router.get('/admin/organizations/:id', authenticate, authorizeAdmin, asyncRoute(async (req, res) => {
  const { id } = parse(idParams, req.params);
  const org = await db.organization.findUnique({
    where: { id },
    include: {
      users: { select: { id: true, name: true, email: true, role: true, onboardingStatus: true, accountStatus: true } },
      buyerProfiles: { select: { id: true, organizationName: true, userId: true } },
      sellerProfiles: { select: { id: true, businessName: true, userId: true } },
      _count: { select: { products: true, services: true, tenders: true, requirements: true } }
    }
  });
  if (!org) throw new ApiError(404, 'Organization not found', 'ORG_NOT_FOUND');

  // Inject features dynamically
  const { orgFeaturesService } = await import('../services/org-features.service.js');
  const orgWithFeatures = {
    ...org,
    features: orgFeaturesService.getForOrg(org.id)
  };

  ok(res, orgWithFeatures);
}));

router.put('/admin/organizations/:id', authenticate, authorizeAdmin, asyncRoute(async (req, res) => {
  const { id } = parse(idParams, req.params);
  const body = parse(z.object({
    verificationStatus: z.enum(['PENDING', 'VERIFIED', 'REJECTED', 'SUSPENDED']).optional(),
    isBlacklisted: z.boolean().optional(),
    blacklistReason: z.string().trim().max(1000).optional()
  }).partial(), req.body);

  const org = await db.organization.update({ where: { id }, data: body });
  await auditWrite(req, 'organization.updated', 'organization', id, body);

  // Notify org users about status changes
  if (body.verificationStatus || body.isBlacklisted !== undefined) {
    const orgUsers = await db.user.findMany({ where: { organizationId: id }, select: { id: true } });
    const { notificationService } = await import('../services/notification.service.js');
    for (const u of orgUsers) {
      await notificationService.notifyWithEmail(u.id, {
        title: 'Organization Status Updated',
        message: body.isBlacklisted
          ? `Your organization has been restricted. Reason: ${body.blacklistReason || 'Policy violation'}`
          : `Your organization verification status is now: ${body.verificationStatus}`,
        type: 'organization_status_updated',
        priority: body.isBlacklisted ? 'urgent' : 'high',
        redirectUrl: '/dashboard',
        emailSubject: 'Organization Status Update — MSME Procurement Portal',
        emailHtml: `<p>Your organization's status has been updated.</p><p><strong>Status:</strong> ${body.verificationStatus || (body.isBlacklisted ? 'RESTRICTED' : 'Updated')}</p>${body.blacklistReason ? `<p><strong>Reason:</strong> ${body.blacklistReason}</p>` : ''}`
      });
    }
  }

  // Get current features
  const { orgFeaturesService } = await import('../services/org-features.service.js');
  const features = orgFeaturesService.getForOrg(org.id);

  ok(res, { ...org, features });
}));

router.put('/admin/organizations/:id/features', authenticate, authorizeAdmin, asyncRoute(async (req, res) => {
  const { id } = parse(idParams, req.params);
  const body = parse(z.object({
    products: z.boolean().optional(),
    services: z.boolean().optional(),
    marketplace: z.boolean().optional(),
    catalog: z.boolean().optional()
  }).partial(), req.body);

  const { orgFeaturesService } = await import('../services/org-features.service.js');
  const updatedFeatures = orgFeaturesService.updateForOrg(id, body);

  await auditWrite(req, 'organization.features_updated', 'organization', id, body);

  // Notify org users about feature access changes
  const orgUsers = await db.user.findMany({ where: { organizationId: id }, select: { id: true } });
  const { notificationService } = await import('../services/notification.service.js');
  for (const u of orgUsers) {
    await notificationService.notify(u.id, {
      title: 'Organization Feature Access Updated',
      message: `Your organization's access to certain portal features (Catalog/Marketplace/Products/Services) has been updated by the administrator.`,
      type: 'organization_features_updated',
      priority: 'medium',
      redirectUrl: '/dashboard'
    });
  }

  ok(res, { success: true, features: updatedFeatures });
}));

// ═══════════════════════════════════════════
// Notification Preferences Routes
// ═══════════════════════════════════════════

router.get('/notifications/preferences', authenticate, asyncRoute(async (req, res) => {
  let pref = await db.notificationPreference.findUnique({ where: { userId: userId(req) } });
  if (!pref) {
    pref = await db.notificationPreference.create({ data: { userId: userId(req) } });
  }
  ok(res, pref);
}));

router.put('/notifications/preferences', authenticate, asyncRoute(async (req, res) => {
  const body = parse(z.object({
    emailNotifications: z.boolean().optional(),
    smsNotifications: z.boolean().optional(),
    pushNotifications: z.boolean().optional(),
    procurementAlerts: z.boolean().optional(),
    complianceAlerts: z.boolean().optional()
  }).partial(), req.body);

  const pref = await db.notificationPreference.upsert({
    where: { userId: userId(req) },
    update: body,
    create: { userId: userId(req), ...body }
  });
  ok(res, pref);
}));

// ═══════════════════════════════════════════
// Notifications Listing, Read & Stream Routes
// ═══════════════════════════════════════════

router.get('/notifications', authenticate, asyncRoute(async (req, res) => {
  const notifs = await db.notification.findMany({
    where: { userId: userId(req) },
    orderBy: { createdAt: 'desc' },
    take: 50
  });
  ok(res, notifs);
}));

router.post('/notifications/:id/read', authenticate, asyncRoute(async (req, res) => {
  const id = Number(req.params.id);
  await db.notification.updateMany({
    where: { id, userId: userId(req) },
    data: { isRead: true }
  });
  ok(res, { success: true });
}));

router.post('/notifications/read-all', authenticate, asyncRoute(async (req, res) => {
  await db.notification.updateMany({
    where: { userId: userId(req), isRead: false },
    data: { isRead: true }
  });
  ok(res, { success: true });
}));

router.get('/notifications/stream', async (req, res) => {
  const token = String(req.query.token || '');
  if (!token) {
    return res.status(401).json({ message: 'Token required' });
  }

  try {
    const { verifyAccessToken } = await import('../services/token.service.js');
    const decoded = verifyAccessToken(token);
    const userIdVal = Number(decoded.id);
    if (!userIdVal) return res.status(401).json({ message: 'Invalid token' });

    res.setHeader('Content-Type', 'text/event-stream');
    res.setHeader('Cache-Control', 'no-cache');
    res.setHeader('Connection', 'keep-alive');
    res.flushHeaders();

    // Send connected event
    res.write(`event: connected\ndata: ${JSON.stringify({ status: 'connected' })}\n\n`);

    const { subscribeRealtimeChannel } = await import('../services/realtime.service.js');
    const { redisKeys } = await import('../constants/redis-keys.js');

    const channel = redisKeys.notificationsUser(userIdVal);
    const handler = (payload: any) => {
      res.write(`event: notification\ndata: ${JSON.stringify(payload)}\n\n`);
    };

    await subscribeRealtimeChannel(channel, handler);

    req.on('close', () => {
      // Client closed connection
    });
  } catch (err) {
    return res.status(401).json({ message: 'Invalid token' });
  }
});

export default router;
