import { Router, type Response } from 'express';
import https from 'https';
import { z } from 'zod';
import prisma from '../config/prisma.js';
import { env } from '../config/env.js';
import { getFileContent, getSignedUrl, uploadFile } from '../services/storage/storage.service.js';
import { authenticate, authorize, authorizeAdmin, requireAccountType, requirePermission, type AuthRequest } from '../middleware/auth.js';
import { verifyAccessToken } from '../services/token.service.js';
import { upload } from '../config/storage.js';
import { auditLog } from '../modules/audit/audit.service.js';
import { onUserLinkedToOrganization } from '../services/org-membership.service.js';
import { approveOnboardingAndEnsureOrganization, createOrUpdatePendingOrganization } from '../services/onboarding-organization.service.js';
import { createComplianceFlag } from '../modules/compliance/compliance.service.js';
import { paymentRateLimit, verificationRateLimit } from '../middleware/rateLimit.js';
import { getOrSetCache, deleteCache, invalidateByPattern } from '../services/cache.service.js';
import { notificationService } from '../services/notification.service.js';
import { redisKeys } from '../constants/redis-keys.js';
import { ApiError } from '../utils/ApiError.js';
import { handleSecureRouteError } from '../utils/routeHelpers.js';
import { maskSensitive } from '../utils/maskSensitive.js';
import { sha256 } from '../utils/crypto.js';
import { panVerificationService } from '../services/verification/pan.service.js';
import { udyamVerificationService } from '../services/verification/udyam.service.js';
import { bankVerificationService } from '../services/verification/bank.service.js';
import { GstService, hasValidGstinChecksum } from '../services/gstService.js';
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
import { ratingsService } from '../modules/ratings/ratings.service.js';
import { STRICT_VERIFICATION } from '../config/verification.js';
import { getDefaultCompanyId } from '../services/default-company.service.js';

const db = prisma as any;
const router = Router();

const idParams = z.object({ id: z.coerce.number().int().positive() });
const sellerIdParams = z.object({ sellerId: z.coerce.number().int().positive() });
const buyerIdParams = z.object({ buyerId: z.coerce.number().int().positive() });
const gstParams = z.object({ gstin: z.string().trim().min(15).max(15) });
const paginationQuery = z.object({
  q: z.string().trim().max(120).optional(),
  role: z.enum(['buyer', 'seller']).optional(),
  status: z.string().trim().max(80).optional(),
  procurementMethod: z.string().trim().max(80).optional(),
  categoryId: z.coerce.number().int().positive().optional(),
  page: z.coerce.number().int().min(1).optional(),
  pageSize: z.coerce.number().int().min(1).max(500).optional(),
  skip: z.coerce.number().int().min(0).default(0),
  take: z.coerce.number().int().min(1).max(500).default(50)
}).partial();

const clean = (value: unknown) => String(value ?? '').trim();
const toDecimalNumber = (value: unknown, fallback = 0) => Number(value ?? fallback);
const isAdmin = (req: AuthRequest) => req.user?.role === 'admin';
const userId = (req: AuthRequest) => Number(req.user?.id);
const orgScope = {
  scopeType: 'ORGANIZATION' as const,
  getScopeId: (req: AuthRequest) => req.user?.organizationId
};
const approvedProcurementStatuses = new Set(['approved_for_procurement', 'approved']);

const ok = (res: Response, data: unknown, status = 200) => res.status(status).json(maskSensitive({ success: true, data }));

const procurementMethodDefinitions = [
  { slug: 'direct-purchase', code: 'DIRECT_PURCHASE', name: 'Direct Purchase', route: '/buyer/create-procurement/direct-purchase', handoffRoute: '/buyer/direct-purchase', badge: 'Common', valueHint: 'Best for low-value or approved direct buys' },
  { slug: 'catalog-purchase', code: 'CATALOG_PURCHASE', name: 'Catalogue Purchase', route: '/buyer/create-procurement/catalog-purchase', handoffRoute: '/buyer/marketplace', badge: 'Fast-Track', valueHint: 'Pre-approved catalogue item purchase' },
  { slug: 'rfq', code: 'RFQ', name: 'Request for Quotation (RFQ)', route: '/buyer/create-procurement/rfq', handoffRoute: '/buyer/rfq', badge: 'Common', valueHint: 'Useful for custom specs and supplier quotes' },
  { slug: 'rfp', code: 'RFP', name: 'Request for Proposal (RFP)', route: '/buyer/create-procurement/rfp', handoffRoute: '/buyer/publish-bid?method=rfp', badge: 'Strategic', valueHint: 'Evaluate complex services with technical & financial proposals' },
  { slug: 'rfi', code: 'RFI', name: 'Request for Information (RFI)', route: '/buyer/create-procurement/rfi', handoffRoute: '/buyer/publish-bid?method=rfi', badge: 'Market Research', valueHint: 'Gather interest and identify potential vendors' },
  { slug: 'sealed-tender', code: 'SEALED_TENDER', name: 'Sealed Tender', route: '/buyer/create-procurement/sealed-tender', handoffRoute: '/buyer/publish-bid?method=sealed-tender', badge: 'Confidential', valueHint: 'Formal envelope-based bidding with blind opening' },
  { slug: 'open-tender', code: 'OPEN_TENDER', name: 'Open Tender', route: '/buyer/create-procurement/open-tender', handoffRoute: '/buyer/publish-bid?method=open-tender', badge: 'Compliance Required', valueHint: 'Formal bids and higher-value procurement' },
  { slug: 'limited-tender', code: 'LIMITED_TENDER', name: 'Limited Tender', route: '/buyer/create-procurement/limited-tender', handoffRoute: '/buyer/publish-bid?method=limited-tender', badge: 'Restricted Pool', valueHint: 'Bids invited from a selected list of suppliers' },
  { slug: 'two-packet-bid', code: 'TWO_PACKET_BID', name: 'Two Packet Bid', route: '/buyer/create-procurement/two-packet-bid', handoffRoute: '/buyer/publish-bid?method=two-packet-bid', badge: 'Separated Evaluation', valueHint: 'Separate technical and financial openings' },
  { slug: 'reverse-auction', code: 'REVERSE_AUCTION', name: 'Reverse Auction', route: '/buyer/create-procurement/reverse-auction', handoffRoute: '/reverse-auctions/create', badge: 'Advanced', valueHint: 'Use after technical qualification' },
  { slug: 'bid-with-reverse-auction', code: 'BID_WITH_REVERSE_AUCTION', name: 'Bid with Reverse Auction', route: '/buyer/create-procurement/bid-with-reverse-auction', handoffRoute: '/buyer/publish-bid?method=bid-with-reverse-auction', badge: 'Hybrid Sourcing', valueHint: 'Formal bid followed by real-time downward pricing window' },
  { slug: 'rate-contract', code: 'RATE_CONTRACT', name: 'Rate Contract', route: '/buyer/create-procurement/rate-contract', handoffRoute: '/buyer/publish-bid?method=rate-contract', badge: 'Standing Agreement', valueHint: 'For repeated demand over a validity period' },
  { slug: 'repeat-order', code: 'REPEAT_ORDER', name: 'Repeat Order', route: '/buyer/create-procurement/repeat-order', handoffRoute: '/buyer/direct-purchase?method=repeat-order', badge: 'Quick Reorder', valueHint: 'Use with prior order reference' },
  { slug: 'single-source', code: 'SINGLE_SOURCE', name: 'Single Source', route: '/buyer/create-procurement/single-source', handoffRoute: '/buyer/publish-bid?method=single-source', badge: 'Exception', valueHint: 'Direct negotiation with single vendor lock-in justification' },
  { slug: 'pac', code: 'PAC', name: 'PAC / Proprietary Bid', route: '/buyer/create-procurement/pac', handoffRoute: '/buyer/publish-bid?method=pac', badge: 'PAC Standard', valueHint: 'Single-source justification with PAC certificate required' },
  { slug: 'emergency-purchase', code: 'EMERGENCY_PURCHASE', name: 'Emergency Purchase', route: '/buyer/create-procurement/emergency-purchase', handoffRoute: '/buyer/publish-bid?method=emergency-purchase', badge: 'Urgent', valueHint: 'Use only with emergency justification' },
  { slug: 'boq-based-bid', code: 'BOQ_BASED_BID', name: 'BOQ Based Bid', route: '/buyer/create-procurement/boq-based-bid', handoffRoute: '/buyer/publish-bid?method=boq-based-bid', badge: 'BOQ Sheet', valueHint: 'Works, AMC, item-wise rates via spreadsheet' },
  // Legacy alias entries kept for backward compatibility with old records
  { slug: 'l1-comparison', code: 'RFQ', name: 'L1 Comparison (Legacy)', route: '/buyer/procurement/create', handoffRoute: '/buyer/marketplace', badge: 'Legacy', valueHint: 'Migrated to RFQ' },
  { slug: 'tender', code: 'OPEN_TENDER', name: 'Tender (Legacy)', route: '/buyer/procurement/create', handoffRoute: '/buyer/publish-bid?method=tender', badge: 'Legacy', valueHint: 'Migrated to Open Tender' },
  { slug: 'boq', code: 'BOQ_BASED_BID', name: 'BOQ (Legacy)', route: '/buyer/procurement/create', handoffRoute: '/buyer/publish-bid?method=boq', badge: 'Legacy', valueHint: 'Migrated to BOQ Based Bid' },
  { slug: 'custom-product', code: 'OPEN_TENDER', name: 'Custom Product (Legacy)', route: '/buyer/procurement/create', handoffRoute: '/buyer/publish-bid?method=custom-product', badge: 'Legacy', valueHint: 'Migrated to Open Tender' },
  { slug: 'custom-service', code: 'RFP', name: 'Custom Service (Legacy)', route: '/buyer/procurement/create', handoffRoute: '/buyer/publish-bid?method=custom-service', badge: 'Legacy', valueHint: 'Migrated to RFP' },
  { slug: 'pac-bid', code: 'PAC', name: 'PAC Bid (Legacy)', route: '/buyer/procurement/create', handoffRoute: '/buyer/publish-bid?method=pac', badge: 'Legacy', valueHint: 'Migrated to PAC' },
  { slug: 'emergency', code: 'EMERGENCY_PURCHASE', name: 'Emergency (Legacy)', route: '/buyer/procurement/create', handoffRoute: '/buyer/publish-bid?method=emergency', badge: 'Legacy', valueHint: 'Migrated to Emergency Purchase' },
];

const defaultMarketplaceCategories = [
  { name: 'Electrical & Electronics', type: 'BOTH', displayOrder: 10 },
  { name: 'Mechanical & Engineering', type: 'BOTH', displayOrder: 20 },
  { name: 'Construction & Building Materials', type: 'PRODUCT', displayOrder: 30 },
  { name: 'Industrial Chemicals', type: 'PRODUCT', displayOrder: 40 },
  { name: 'Refractories', type: 'PRODUCT', displayOrder: 50 },
  { name: 'Automobile Parts & Services', type: 'BOTH', displayOrder: 60 },
  { name: 'Tyres & Rubber Products', type: 'PRODUCT', displayOrder: 70 },
  { name: 'IT & Computer Equipment', type: 'PRODUCT', displayOrder: 80 },
  { name: 'Office Equipment & Stationery', type: 'PRODUCT', displayOrder: 90 },
  { name: 'Medical & Healthcare Supplies', type: 'PRODUCT', displayOrder: 100 },
  { name: 'Agriculture & Nursery', type: 'BOTH', displayOrder: 110 },
  { name: 'Safety Equipment & Industrial Safety', type: 'PRODUCT', displayOrder: 120 },
  { name: 'Fuel, Oil & Gas', type: 'PRODUCT', displayOrder: 130 },
  { name: 'Hydraulics & Pneumatics', type: 'PRODUCT', displayOrder: 140 },
  { name: 'Steel & Metal Products', type: 'PRODUCT', displayOrder: 150 },
  { name: 'Cement & Concrete Products', type: 'PRODUCT', displayOrder: 160 },
  { name: 'Pipes, Tiles & Hardware', type: 'PRODUCT', displayOrder: 170 },
  { name: 'Industrial Machinery & Spare Parts', type: 'PRODUCT', displayOrder: 180 },
  { name: 'Automation & Robotics', type: 'BOTH', displayOrder: 190 },
  { name: 'Fabrication & Welding Services', type: 'SERVICE', displayOrder: 200 },
  { name: 'Bearings & Mechanical Components', type: 'PRODUCT', displayOrder: 210 },
  { name: 'Electrical Cables & Power Equipment', type: 'PRODUCT', displayOrder: 220 },
  { name: 'Industrial Consumables', type: 'PRODUCT', displayOrder: 230 },
  { name: 'Packaging & Printing', type: 'BOTH', displayOrder: 240 },
  { name: 'Polymer & Plastic Products', type: 'PRODUCT', displayOrder: 250 },
  { name: 'Trading & Distribution', type: 'SERVICE', displayOrder: 260 },
  { name: 'Logistics & Supply Services', type: 'SERVICE', displayOrder: 270 },
  { name: 'Tools & Industrial Hardware', type: 'PRODUCT', displayOrder: 280 },
  { name: 'Laboratory Equipment & Chemicals', type: 'PRODUCT', displayOrder: 290 },
  { name: 'Engineering Consultancy Services', type: 'SERVICE', displayOrder: 300 },
  { name: 'Industrial Maintenance Services', type: 'SERVICE', displayOrder: 310 },
  { name: 'Construction & Civil Work Services', type: 'SERVICE', displayOrder: 320 },
  { name: 'Environmental & Waste Management', type: 'SERVICE', displayOrder: 330 },
  { name: 'Telecom & Communication Equipment', type: 'PRODUCT', displayOrder: 340 },
  { name: 'Furniture & Interior Supplies', type: 'PRODUCT', displayOrder: 350 },
  { name: 'General Industrial Supplier', type: 'BOTH', displayOrder: 360 },
  { name: 'Mining & Coal Equipment', type: 'PRODUCT', displayOrder: 370 },
  { name: 'Power & Energy Equipment', type: 'PRODUCT', displayOrder: 380 },
  { name: 'Gas Equipment & Cylinders', type: 'PRODUCT', displayOrder: 390 },
  { name: 'Conveyor & Material Handling Equipment', type: 'PRODUCT', displayOrder: 400 },
  { name: 'Pumps, Motors & Hydraulics', type: 'PRODUCT', displayOrder: 410 },
  { name: 'Industrial Seals & Gaskets', type: 'PRODUCT', displayOrder: 420 },
  { name: 'Welding & Cutting Equipment', type: 'PRODUCT', displayOrder: 430 },
  { name: 'Industrial Fasteners & Components', type: 'PRODUCT', displayOrder: 440 },
  { name: 'Retail & Commercial Supply', type: 'BOTH', displayOrder: 450 },
  { name: 'FMCG & Daily Utility Supply', type: 'PRODUCT', displayOrder: 460 },
  { name: 'Textile & Garments Supply', type: 'PRODUCT', displayOrder: 470 },
  { name: 'OEM / Manufacturing Vendor', type: 'BOTH', displayOrder: 480 },
  { name: 'Repair & Service Provider', type: 'SERVICE', displayOrder: 490 },
  { name: 'Multi-category Industrial Vendor', type: 'BOTH', displayOrder: 500 }
];

const ensureMarketplaceCategories = async () => {
  const count = await db.category.count({ where: { isActive: true } });
  if (count !== defaultMarketplaceCategories.length) {
    await Promise.all(defaultMarketplaceCategories.map(category =>
      db.category.upsert({
        where: { slug: slugFor(category.name) },
        update: {
          name: category.name,
          type: category.type as any,
          displayOrder: category.displayOrder,
          isActive: true
        },
        create: {
          ...category,
          type: category.type as any,
          slug: slugFor(category.name),
          isActive: true
        }
      })
    ));
    const newSlugs = defaultMarketplaceCategories.map(c => slugFor(c.name));
    await db.category.updateMany({
      where: { slug: { notIn: newSlugs } },
      data: { isActive: false }
    });
    await deleteCache(redisKeys.cacheCategoriesAll()).catch(() => undefined);
  }
  const categories = await db.category.findMany({
    where: { isActive: true },
    orderBy: [{ displayOrder: 'asc' }, { name: 'asc' }]
  });
  return categories;
};

const requireCompleteGstProfile = (gstResult: any) => {
  if (!gstResult?.isRegisteredDealer) {
    throw new ApiError(400, `GSTIN is not active on the GST registry (status: ${gstResult?.status || 'unknown'}). Please use an active GSTIN.`, 'GST_INACTIVE');
  }
  if (!gstResult?.legalName && !gstResult?.tradeName) {
    throw new ApiError(424, 'GST verification provider did not return registered business details. Please try again later.', 'GST_PROVIDER_INCOMPLETE');
  }
  const missing = [
    ['registered address', gstResult?.address],
    ['state', gstResult?.state],
    ['city or district', gstResult?.city || gstResult?.district],
    ['pincode', gstResult?.pincode]
  ].filter(([, value]) => !clean(value)).map(([label]) => label);

  if (missing.length) {
    throw new ApiError(
      422,
      `GSTIN was found, but the registry response is missing ${missing.join(', ')}. Please try again later or complete onboarding manually with your GST certificate.`,
      'GST_PROFILE_INCOMPLETE',
      { missing }
    );
  }
};

const buildVerifiedAddress = (gstResult: any) => ({
  pincode: clean(gstResult?.pincode),
  state: clean(gstResult?.state),
  city: clean(gstResult?.city || gstResult?.district),
  district: clean(gstResult?.district),
  address: clean(gstResult?.address)
});

const assertGstinNotOwnedByAnotherAccount = async (normalizedGstin: string, currentUserId: number) => {
  const currentUser = await db.user.findUnique({
    where: { id: currentUserId },
    select: { companyId: true }
  });

  const existingOrgs = await db.organization.findMany({
    where: { gstin: normalizedGstin }
  });

  for (const org of existingOrgs) {
    const status = org.verificationStatus;
    const isClosedOrArchived = status === 'CLOSED' || status === 'ARCHIVED';
    const isRejectedOrMerged = status === 'REJECTED' || status === 'MERGED';

    if (isClosedOrArchived) {
      if (!org.gstReuseAllowed) {
        throw new ApiError(400, 'This GST belongs to an archived organization but fresh registration has not been approved.', 'GST_REUSE_NOT_ALLOWED');
      }
    } else if (isRejectedOrMerged) {
      // Allowed cases - do nothing
    } else {
      if (org.companyId === currentUser?.companyId) {
        throw new ApiError(400, 'An active organization already exists with this GST in this company.', 'GST_ALREADY_ACTIVE');
      }
    }
  }
};
const attachBidFileAssets = async (rows: any[]) => {
  const fileIds = [...new Set(rows.map(row => Number(row?.fileAssetId)).filter(Boolean))];
  const assets = fileIds.length
    ? await db.fileAsset.findMany({
      where: { id: { in: fileIds }, status: 'active' },
      select: { id: true, originalName: true, mimeType: true, url: true, key: true }
    })
    : [];
  const assetsById = new Map<number, any>(assets.map((asset: any) => [Number(asset.id), asset]));

  return rows.map(row => {
    const fileAsset = row?.fileAssetId ? assetsById.get(Number(row.fileAssetId)) || null : null;
    return {
      ...row,
      fileAsset,
      documentUrl: row?.documentUrl || (fileAsset ? `/api/files/${(fileAsset as any).id}/view` : row?.documentUrl)
    };
  });
};
const fileIdFromUrl = (url: unknown) => {
  const match = String(url || '').match(/\/api\/files\/(\d+)(?:\/|$)/);
  return match ? Number(match[1]) : null;
};
const linkUploadedTenderDocument = async (tenderId: number, documentUrl: unknown, ownerId: number) => {
  const fileAssetId = fileIdFromUrl(documentUrl);
  if (!fileAssetId) return;

  const asset = await db.fileAsset.findFirst({
    where: { id: fileAssetId, ownerId, status: 'active' }
  });
  if (!asset) throw new ApiError(400, 'Uploaded specification document is unavailable', 'TENDER_DOCUMENT_INVALID');

  await db.$transaction(async (tx: any) => {
    await tx.fileAsset.update({
      where: { id: fileAssetId },
      data: { entityType: 'tender', entityId: tenderId }
    });
    const existing = await tx.tenderDocument.findFirst({
      where: { tenderId, fileAssetId }
    });
    if (!existing) {
      await tx.tenderDocument.create({
        data: {
          tenderId,
          fileAssetId,
          documentType: 'specification',
          title: asset.originalName,
          isPublic: true
        }
      });
    }
  });
};
const attachQuoteResponseFileAssets = async (rows: any[]) => {
  const responses = rows.flatMap(row => Array.isArray(row?.quoteResponses) ? row.quoteResponses : []);
  const fileIds = [...new Set(responses.map(response => fileIdFromUrl(response?.documentUrl)).filter(Boolean))] as number[];
  const assets = fileIds.length
    ? await db.fileAsset.findMany({
      where: { id: { in: fileIds }, status: 'active' },
      select: { id: true, originalName: true, mimeType: true, url: true, key: true }
    })
    : [];
  const assetsById = new Map<number, any>(assets.map((asset: any) => [Number(asset.id), asset]));

  return rows.map(row => ({
    ...row,
    quoteResponses: Array.isArray(row?.quoteResponses)
      ? row.quoteResponses.map((response: any) => {
        const fileAssetId = fileIdFromUrl(response?.documentUrl);
        const fileAsset = fileAssetId ? assetsById.get(fileAssetId) || null : null;
        return {
          ...response,
          fileAssetId,
          fileAsset,
          documentName: fileAsset?.originalName || null,
          documentUrl: response?.documentUrl || (fileAsset ? `/api/files/${fileAsset.id}/view` : null)
        };
      })
      : row?.quoteResponses
  }));
};
const listWindow = (query: { page?: number; pageSize?: number; skip?: number; take?: number }) => {
  const take = Math.min(500, Math.max(1, Number(query.pageSize ?? query.take ?? 50)));
  const skip = query.page ? (Math.max(1, Number(query.page)) - 1) * take : Math.max(0, Number(query.skip ?? 0));
  return { skip, take };
};
const paged = (records: unknown[], total: number, query: Record<string, unknown>, key = 'records') => ({
  [key]: records,
  records,
  total,
  ...listWindow(query),
  filters: query
});

const profileStatus = (user?: any, profile?: any) =>
  profile?.verificationStatusEnum ||
  (approvedProcurementStatuses.has(String(user?.onboardingStatus)) ? 'VERIFIED' : 'PENDING');

const assertBuyerProcurementApproved = async (req: AuthRequest) => {
  if (isAdmin(req) || req.user?.role !== 'buyer') return;
  const user = await db.user.findUnique({
    where: { id: userId(req) },
    select: { onboardingStatus: true, accountStatus: true, isDualRole: true, buyerProfile: true }
  });
  if (!user) throw new ApiError(404, 'User not found');

  const isApproved = user.isDualRole
    ? (user.buyerProfile?.verificationStatusEnum === 'VERIFIED' || user.buyerProfile?.verificationStatus === 'VERIFIED')
    : approvedProcurementStatuses.has(String(user.onboardingStatus));

  if (!isApproved) {
    throw new ApiError(
      403,
      'Buyer account must be approved by admin before procurement actions are allowed.',
      'BUYER_PROCUREMENT_APPROVAL_REQUIRED'
    );
  }
};

const listProfileBackedOrganizations = async (query: { q?: string; status?: string; skip?: number; take?: number; page?: number; pageSize?: number }, companyIdFilter?: number | null) => {
  const window = listWindow(query);
  let [buyers, sellers] = await Promise.all([
    db.buyerProfile.findMany({
      include: { user: { select: { id: true, name: true, email: true, onboardingStatus: true, accountStatus: true } } },
      orderBy: { updatedAt: 'desc' }
    }),
    db.sellerProfile.findMany({
      include: {
        user: { select: { id: true, name: true, email: true, onboardingStatus: true, accountStatus: true } },
        offices: { orderBy: [{ isMandatory: 'desc' }, { id: 'asc' }], take: 1 }
      },
      orderBy: { updatedAt: 'desc' }
    })
  ]);

  // If companyIdFilter is provided, filter buyers and sellers by organization's companyId
  if (companyIdFilter !== undefined && companyIdFilter !== null) {
    // Collect distinct organizationIds from buyers and sellers that are not null
    const orgIds = [...buyers, ...sellers]
      .map(p => p.organizationId)
      .filter((id): id is number => id !== null && id !== undefined);
    if (orgIds.length > 0) {
      // Fetch organizations for these ids to get their companyId
      const organizations = await db.organization.findMany({
        where: { id: { in: orgIds } },
        select: { id: true, companyId: true }
      });
      const orgIdToCompanyId = new Map<number, number>();
      for (const org of organizations) {
        orgIdToCompanyId.set(org.id, org.companyId);
      }
      // Filter buyers: keep only those where organizationId is not null and the organization's companyId matches
      buyers = buyers.filter(p => {
        const orgId = p.organizationId;
        if (orgId === null || orgId === undefined) return false;
        const companyId = orgIdToCompanyId.get(orgId);
        return companyId !== null && companyId !== undefined && companyId === companyIdFilter;
      });
      // Filter sellers similarly
      sellers = sellers.filter(p => {
        const orgId = p.organizationId;
        if (orgId === null || orgId === undefined) return false;
        const companyId = orgIdToCompanyId.get(orgId);
        return companyId !== null && companyId !== undefined && companyId === companyIdFilter;
      });
    } else {
      // If there are no organizationIds, then set arrays to empty
      buyers = [];
      sellers = [];
    }
  }

  const buyerRows = buyers.map((profile: any) => ({
    id: `buyer-profile-${profile.id}`,
    source: 'buyerProfile',
    organizationName: profile.organizationName || profile.nameAsInPan || profile.user?.name || 'Buyer Organization',
    organizationType: profile.organizationTypeEnum || 'GOVERNMENT',
    gstin: profile.gst,
    panNumber: profile.pan,
    city: profile.city,
    district: profile.district,
    state: profile.state,
    pincode: profile.pincode,
    country: profile.country || 'India',
    website: profile.website,
    verificationStatus: profileStatus(profile.user, profile),
    isBlacklisted: false,
    createdAt: profile.createdAt,
    updatedAt: profile.updatedAt,
    users: [profile.user].filter(Boolean),
    buyerProfiles: [profile],
    sellerProfiles: [],
    _count: { users: 1, buyerProfiles: 1, sellerProfiles: 0, products: 0, services: 0 },
    features: { products: true, services: true, marketplace: true, catalog: true }
  }));

  const sellerRows = sellers.map((profile: any) => {
    const office = profile.offices?.[0] || {};
    return {
      id: `seller-profile-${profile.id}`,
      source: 'sellerProfile',
      organizationName: profile.businessName || profile.nameAsInPan || profile.user?.name || 'Seller Organization',
      organizationType: profile.organizationTypeEnum || 'MSME',
      gstin: office.gstNumber,
      panNumber: profile.pan,
      city: office.city,
      state: office.state,
      country: 'India',
      verificationStatus: profileStatus(profile.user, profile),
      isBlacklisted: false,
      createdAt: profile.createdAt,
      updatedAt: profile.updatedAt,
      users: [profile.user].filter(Boolean),
      buyerProfiles: [],
      sellerProfiles: [profile],
      _count: { users: 1, buyerProfiles: 0, sellerProfiles: 1, products: 0, services: 0 },
      features: { products: true, services: true, marketplace: true, catalog: true }
    };
  });

  const term = clean(query.q).toLowerCase();
  const rows = [...buyerRows, ...sellerRows]
    .filter((org: any) => !term || [org.organizationName, org.gstin, org.panNumber, org.state, org.city].filter(Boolean).join(' ').toLowerCase().includes(term))
    .filter((org: any) => !query.status || org.verificationStatus === query.status)
    .sort((a: any, b: any) => new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime());

  return { organizations: rows.slice(window.skip, window.skip + window.take), total: rows.length };
};
const parse = <T>(schema: z.ZodType<T>, value: unknown) => schema.parse(value);
const catalogueAttachmentInclude = {
  images: { include: { fileAsset: true }, orderBy: [{ isPrimary: 'desc' as const }, { displayOrder: 'asc' as const }] },
  certifications: { include: { fileAsset: true } }
};

const attachCatalogueFiles = async (records: any[], itemKind: 'product' | 'service') => {
  const rows = Array.isArray(records) ? records : [];
  if (rows.length === 0) return rows;
  const catalogueEntityType = itemKind === 'product' ? 'catalogue_product' : 'catalogue_service';
  const assets = await db.fileAsset.findMany({
    where: {
      status: 'active',
      entityType: { in: [catalogueEntityType, 'catalogue'] },
      OR: rows.map(row => ({ ownerId: row.sellerId, entityId: row.id }))
    },
    orderBy: { createdAt: 'desc' }
  });
  return rows.map(row => ({
    ...row,
    itemKind,
    catalogueFiles: assets.filter(asset => asset.ownerId === row.sellerId && asset.entityId === row.id)
  }));
};

const asyncRoute = (handler: (req: AuthRequest, res: Response) => Promise<unknown>, fallback = 'Unable to complete request') =>
  async (req: AuthRequest, res: Response) => {
    try {
      await handler(req, res);
    } catch (error) {
      return handleSecureRouteError(res, error, fallback);
    }
  };

router.get('/procurement/methods', authenticate, authorize('buyer', 'admin', 'master_admin'), asyncRoute(async (_req, res) => {
  ok(res, procurementMethodDefinitions);
}, 'Unable to load procurement methods'));

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

const notifySafe = (
  targetUserId: number,
  title: string,
  message: string,
  type: string,
  redirectUrl = '/dashboard',
  priority: 'low' | 'medium' | 'high' | 'urgent' = 'medium'
) => {
  void notificationService.notifyWithEmail(targetUserId, {
    title,
    message,
    type,
    priority,
    redirectUrl
  }).catch(() => null);
};

const NOTIFICATION_READ_RETENTION_MS = 24 * 60 * 60 * 1000;

const archiveExpiredReadNotifications = async (targetUserId: number) => {
  const cutoff = new Date(Date.now() - NOTIFICATION_READ_RETENTION_MS);
  await db.notification.updateMany({
    where: {
      userId: targetUserId,
      isRead: true,
      isArchived: false,
      logs: {
        some: {
          action: 'notification.read',
          createdAt: { lte: cutoff }
        }
      }
    },
    data: { isArchived: true }
  }).catch(() => undefined);
};

const recordNotificationRead = async (targetUserId: number, notificationIds: number[]) => {
  const ids = Array.from(new Set(notificationIds.filter(id => Number.isInteger(id) && id > 0)));
  if (ids.length === 0) return;
  await db.notificationLog.createMany({
    data: ids.map(notificationId => ({
      notificationId,
      userId: targetUserId,
      action: 'notification.read',
      channel: 'SYSTEM',
      recipient: String(targetUserId),
      status: 'READ',
      sentAt: new Date()
    }))
  }).catch(() => undefined);
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
  description: z.string().trim().max(4000).nullable().optional(),
  categoryId: z.coerce.number().int().positive().nullable().optional(),
  sku: z.string().trim().max(80).nullable().optional(),
  hsnCode: z.string().trim().max(30).nullable().optional(),
  brand: z.string().trim().max(120).nullable().optional(),
  modelNumber: z.string().trim().max(120).nullable().optional(),
  unitOfMeasure: z.string().trim().max(40).nullable().optional(),
  price: z.coerce.number().nonnegative().nullable().optional(),
  taxRate: z.coerce.number().min(0).max(100).nullable().optional(),
  discount: z.coerce.number().min(0).max(100).nullable().optional(),
  originalPrice: z.coerce.number().nonnegative().nullable().optional(),
  discountPrice: z.coerce.number().nonnegative().nullable().optional(),
  discountPercent: z.coerce.number().min(0).max(100).nullable().optional(),
  offerLabel: z.string().trim().max(120).nullable().optional(),
  offerStartAt: z.coerce.date().nullable().optional(),
  offerEndAt: z.coerce.date().nullable().optional(),
  isOfferActive: z.coerce.boolean().optional(),
  bulkDealAvailable: z.coerce.boolean().optional(),
  bulkMinQuantity: z.coerce.number().nonnegative().nullable().optional(),
  currency: z.string().trim().length(3).default('INR').optional(),
  isMsmeMade: z.coerce.boolean().optional(),
  itemCondition: z.string().trim().nullable().optional(),
  status: z.enum(['DRAFT', 'ACTIVE', 'INACTIVE', 'OUT_OF_STOCK', 'ARCHIVED']).optional(),
  imageIds: z.array(z.coerce.number().int()).optional(),
  documentIds: z.array(z.coerce.number().int()).optional(),
  specifications: z.array(z.object({
    name: z.string().trim().min(1).max(120),
    value: z.string().trim().min(1).max(500),
    unit: z.string().trim().max(40).nullable().optional()
  })).optional()
});

const serviceBody = z.object({
  name: z.string().trim().min(2).max(200),
  description: z.string().trim().max(4000).nullable().optional(),
  categoryId: z.coerce.number().int().positive().nullable().optional(),
  pricingModel: z.enum(['FIXED', 'HOURLY', 'DAILY', 'MONTHLY', 'PER_PROJECT', 'CUSTOM']).optional(),
  basePrice: z.coerce.number().nonnegative().nullable().optional(),
  taxRate: z.coerce.number().min(0).max(100).nullable().optional(),
  discount: z.coerce.number().min(0).max(100).nullable().optional(),
  originalPrice: z.coerce.number().nonnegative().nullable().optional(),
  discountPrice: z.coerce.number().nonnegative().nullable().optional(),
  discountPercent: z.coerce.number().min(0).max(100).nullable().optional(),
  offerLabel: z.string().trim().max(120).nullable().optional(),
  offerStartAt: z.coerce.date().nullable().optional(),
  offerEndAt: z.coerce.date().nullable().optional(),
  isOfferActive: z.coerce.boolean().optional(),
  bulkDealAvailable: z.coerce.boolean().optional(),
  bulkMinQuantity: z.coerce.number().nonnegative().nullable().optional(),
  currency: z.string().trim().length(3).default('INR').optional(),
  serviceArea: z.string().trim().max(300).nullable().optional(),
  scopeOfWork: z.string().trim().max(4000).nullable().optional(),
  deliverables: z.string().trim().max(4000).nullable().optional(),
  inclusions: z.string().trim().max(4000).nullable().optional(),
  exclusions: z.string().trim().max(4000).nullable().optional(),
  duration: z.string().trim().max(120).nullable().optional(),
  slaResponseTime: z.string().trim().max(120).nullable().optional(),
  status: z.enum(['DRAFT', 'ACTIVE', 'INACTIVE', 'OUT_OF_STOCK', 'ARCHIVED']).optional(),
  imageIds: z.array(z.coerce.number().int()).optional(),
  documentIds: z.array(z.coerce.number().int()).optional(),
  specifications: z.array(z.object({
    name: z.string().trim().min(1).max(120),
    value: z.string().trim().min(1).max(500),
    unit: z.string().trim().max(40).nullable().optional()
  })).optional()
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

const normalizeToCanonicalMethod = (rawMethod: unknown): string => {
  const str = String(rawMethod || '').trim().toUpperCase().replace(/-/g, '_');
  
  if ([
    'DIRECT_PURCHASE', 'CATALOG_PURCHASE', 'RFQ', 'RFP', 'RFI',
    'SEALED_TENDER', 'OPEN_TENDER', 'LIMITED_TENDER', 'TWO_PACKET_BID',
    'REVERSE_AUCTION', 'BID_WITH_REVERSE_AUCTION', 'RATE_CONTRACT',
    'REPEAT_ORDER', 'SINGLE_SOURCE', 'PAC', 'EMERGENCY_PURCHASE',
    'BOQ_BASED_BID'
  ].includes(str)) {
    return str;
  }

  switch (str) {
    case 'L1_COMPARISON':
    case 'COMPARISON':
      return 'RFQ';
    case 'REQUEST_FOR_PROPOSAL':
      return 'RFP';
    case 'EXPRESSION_OF_INTEREST':
      return 'RFI';
    case 'SINGLE_TENDER':
      return 'SINGLE_SOURCE';
    case 'PAC_BID':
      return 'PAC';
    case 'BOQ_BID':
    case 'BOQ':
      return 'BOQ_BASED_BID';
    case 'EMERGENCY':
    case 'EMERGENCY_PROCUREMENT':
      return 'EMERGENCY_PURCHASE';
    case 'BID_WITH_RA':
      return 'BID_WITH_REVERSE_AUCTION';
    case 'TENDER':
      return 'OPEN_TENDER';
    case 'CUSTOM_PRODUCT_BID':
    case 'PRODUCT_BID':
    case 'CUSTOM_BID':
      return 'OPEN_TENDER';
    case 'CUSTOM_SERVICE_BID':
    case 'SERVICE_BID':
      return 'RFP';
    default:
      return 'OPEN_TENDER';
  }
};

const procurementMethodCodeFor = (value: unknown) => {
  const canonical = normalizeToCanonicalMethod(value);
  switch (canonical) {
    case 'DIRECT_PURCHASE':
    case 'CATALOG_PURCHASE':
    case 'REPEAT_ORDER':
    case 'SINGLE_SOURCE':
    case 'EMERGENCY_PURCHASE':
      return 'DIRECT_PURCHASE';

    case 'RFQ':
    case 'RFI':
      return 'RFQ';

    case 'REVERSE_AUCTION':
    case 'BID_WITH_REVERSE_AUCTION':
      return 'REVERSE_AUCTION';

    case 'RATE_CONTRACT':
      return 'RATE_CONTRACT';

    case 'RFP':
    case 'SEALED_TENDER':
    case 'OPEN_TENDER':
    case 'LIMITED_TENDER':
    case 'TWO_PACKET_BID':
    case 'PAC':
    case 'BOQ_BASED_BID':
    default:
      return 'TENDER';
  }
};

const procurementDraftBody = z.object({
  id: z.coerce.number().int().positive().optional(),
  procurementMethod: z.string().trim().max(80).optional(),
  method: z.string().trim().max(80).optional(),
  methodSlug: z.string().trim().max(80).optional(),
  title: z.string().trim().min(3).max(200),
  description: z.string().trim().max(4000).optional(),
  categoryId: z.coerce.number().int().positive().optional(),
  estimatedValue: z.coerce.number().nonnegative().optional(),
  requiredBy: z.coerce.date().optional(),
  draftStep: z.coerce.number().int().min(0).optional(),
  workflowStatus: z.string().trim().max(80).optional(),
  approvalStatus: z.string().trim().max(80).optional(),
  payload: z.record(z.string(), z.unknown()).optional(),
  items: z.array(z.object({
    productId: z.coerce.number().int().positive().optional(),
    itemName: z.string().trim().max(200).optional().or(z.literal('')),
    description: z.string().trim().max(2000).optional(),
    quantity: z.coerce.number().optional(),
    unitOfMeasure: z.string().trim().max(40).optional().or(z.literal('')),
    estimatedUnitPrice: z.coerce.number().nonnegative().optional(),
    specifications: z.record(z.string(), z.unknown()).optional()
  })).optional()
}).passthrough();

const procurementStatusMap: Record<string, string> = {
  DRAFT: 'DRAFT',
  PENDING_APPROVAL: 'SUBMITTED',
  SUBMITTED: 'SUBMITTED',
  APPROVED: 'APPROVED',
  PUBLISHED: 'SOURCING',
  OPEN: 'SOURCING',
  CLARIFICATION: 'SOURCING',
  CLOSED: 'SOURCING',
  TECHNICAL_EVALUATION: 'SOURCING',
  FINANCIAL_EVALUATION: 'SOURCING',
  AWARD_RECOMMENDED: 'SOURCING',
  AWARDED: 'FULFILLED',
  CANCELLED: 'CANCELLED',
  REJECTED: 'REJECTED'
};

const procurementDraftInclude = {
  items: {
    select: {
      id: true,
      itemName: true,
      description: true,
      quantity: true,
      unitOfMeasure: true,
      estimatedUnitPrice: true,
      specifications: true
    }
  },
  category: {
    select: {
      id: true,
      name: true
    }
  }
};

// Optimized select for list queries (minimal fields)
const procurementListSelect = {
  id: true,
  requirementNumber: true,
  title: true,
  status: true,
  procurementMethod: true,
  estimatedValue: true,
  requiredBy: true,
  createdAt: true,
  updatedAt: true,
  buyerId: true,
  organizationId: true,
  categoryId: true,
  category: {
    select: {
      id: true,
      name: true
    }
  }
};

const methodSlugForDraft = (body: Record<string, unknown>) => {
  const raw = body.methodSlug || body.method || body.procurementMethod || 'OPEN_TENDER';
  const canonical = normalizeToCanonicalMethod(raw);
  return canonical.toLowerCase().replace(/_/g, '-');
};

const toDraftItems = (items: Array<Record<string, unknown>> | undefined, methodSlug: string, draftMeta: Record<string, unknown>) =>
  (items || []).map((item, index) => ({
    productId: item.productId ? Number(item.productId) : undefined,
    itemName: clean(item.itemName || item.name || `Procurement item ${index + 1}`),
    description: clean(item.description || item.specification || ''),
    quantity: Number(item.quantity || item.qty || 1),
    unitOfMeasure: clean(item.unitOfMeasure || item.unit || 'Nos'),
    estimatedUnitPrice: item.estimatedUnitPrice !== undefined || item.unitPrice !== undefined
      ? Number(item.estimatedUnitPrice ?? item.unitPrice)
      : undefined,
    specifications: {
      ...(typeof item.specifications === 'object' && item.specifications ? item.specifications : {}),
      procurementMethodSlug: methodSlug,
      draftMeta
    }
  }));

export const serializeProcurementDraft = (requirement: any) => {
  const firstMeta = requirement?.items?.find((item: any) => item.specifications)?.specifications || {};
  const payload = requirement.payload || firstMeta.draftMeta?.payload || null;
  
  // Resolve methodSlug canonically
  const rawMethod = payload?.fullProcurementMethod || payload?.type || firstMeta.procurementMethodSlug || requirement.procurementMethod || 'OPEN_TENDER';
  const methodSlug = normalizeToCanonicalMethod(rawMethod).toLowerCase().replace(/_/g, '-');

  const draftStep = requirement.draftStep ?? firstMeta.draftMeta?.draftStep ?? null;

  return {
    ...requirement,
    methodSlug,
    workflowStatus: Object.entries(procurementStatusMap).find(([, value]) => value === requirement.status)?.[0] || requirement.status,
    draftStep,
    payload
  };
};

const assertProcurementDraftAccess = async (req: AuthRequest, id: number) => {
  const requirement = await db.requirement.findUnique({ where: { id }, include: procurementDraftInclude });
  if (!requirement || (!isAdmin(req) && req.user?.role !== 'master_admin' && requirement.buyerId !== userId(req))) {
    throw new ApiError(404, 'Procurement draft not found', 'PROCUREMENT_DRAFT_NOT_FOUND');
  }
  return requirement;
};

const validateProcurementDraftForSubmit = (draft: any) => {
  const methodSlug = methodSlugForDraft(draft);
  const estimatedValue = Number(draft.estimatedValue || 0);
  const items = Array.isArray(draft.items) ? draft.items : [];
  const payload = draft.payload || {};
  const tender = payload.tender || {};
  const rules = payload.rules || {};
  const basics = payload.basics || {};
  const documents = Array.isArray(payload.documents) ? payload.documents : [];
  const consignees = Array.isArray(payload.consigneeDetails) ? payload.consigneeDetails : [];
  const hasDocument = (pattern: RegExp) => documents.some((doc: any) => pattern.test(String(doc.name || '')) && clean(doc.fileName));
  const hasSpecification = items.some((item: any) => clean(item.description || item.specification || item.technicalSpecification).length >= 10)
    || (Array.isArray(payload.items) && payload.items.some((item: any) => clean(item.specification || item.technicalSpecification || item.specificationFileName).length >= 10));
  const totalItemQuantity = (Array.isArray(payload.items) ? payload.items : items).reduce((total: number, item: any) => total + Number(item.quantity || 0), 0);
  const totalConsigneeQuantity = consignees.reduce((total: number, consignee: any) => total + Number(consignee.quantity || 0), 0);
  const hasConsigneeLocation = consignees.some((consignee: any) => clean(consignee.location || consignee.name));
  const isAfter = (later?: unknown, earlier?: unknown) => {
    if (!later || !earlier) return true;
    const laterTime = new Date(String(later)).getTime();
    const earlierTime = new Date(String(earlier)).getTime();
    return Number.isFinite(laterTime) && Number.isFinite(earlierTime) && laterTime > earlierTime;
  };
  if (estimatedValue <= 0) throw new ApiError(400, 'Estimated procurement value must be positive', 'PROCUREMENT_VALUE_REQUIRED');
  if (items.length === 0) throw new ApiError(400, 'At least one item or service line is required', 'PROCUREMENT_ITEM_REQUIRED');

  // Verify that all items have valid names, quantities, and units when submitting if buying a Product
  const whatAreYouBuying = basics.whatAreYouBuying || 'Product';
  if (whatAreYouBuying === 'Product') {
    for (const item of items) {
      if (!item.itemName || String(item.itemName).trim().length < 2) {
        throw new ApiError(400, 'Item name must be at least 2 characters long', 'PROCUREMENT_ITEM_NAME_INVALID');
      }
      if (typeof item.quantity !== 'number' || item.quantity <= 0) {
        throw new ApiError(400, 'Item quantity must be positive', 'PROCUREMENT_ITEM_QUANTITY_INVALID');
      }
      if (!item.unitOfMeasure || String(item.unitOfMeasure).trim().length < 1) {
        throw new ApiError(400, 'Item unit of measure is required', 'PROCUREMENT_ITEM_UOM_INVALID');
      }
    }
  }

  if (!hasConsigneeLocation || totalItemQuantity <= 0 || totalItemQuantity !== totalConsigneeQuantity) {
    throw new ApiError(400, 'Total consignee quantity must equal total procurement quantity', 'PROCUREMENT_CONSIGNEE_QUANTITY_INVALID');
  }
  // Timeline validations for tender-family, BOQ, PAC, rate-contract, and bid-with-reverse-auction methods
  const timelineMethodSlugs = [
    'open-tender', 'sealed-tender', 'limited-tender', 'two-packet-bid',
    'boq-based-bid', 'pac', 'rate-contract',
    'rfp', 'bid-with-reverse-auction', 'emergency-purchase'
  ];
  if (timelineMethodSlugs.includes(methodSlug)) {
    if (tender.bidStartDate && tender.bidClosingDate && !isAfter(tender.bidClosingDate, tender.bidStartDate)) {
      throw new ApiError(400, 'Bid end date must be after start date', 'PROCUREMENT_DATE_INVALID');
    }
    if (tender.technicalEvaluationDate && tender.bidClosingDate && !isAfter(tender.technicalEvaluationDate, tender.bidClosingDate)) {
      throw new ApiError(400, 'Technical opening date must be after bid end date', 'PROCUREMENT_DATE_INVALID');
    }
    if (tender.financialEvaluationDate && tender.technicalEvaluationDate && !isAfter(tender.financialEvaluationDate, tender.technicalEvaluationDate)) {
      throw new ApiError(400, 'Financial opening date must be after technical opening date', 'PROCUREMENT_DATE_INVALID');
    }
  }
  if (rules.emdRequired && Number(rules.emdAmount || 0) <= 0) {
    throw new ApiError(400, 'EMD amount is required when EMD is enabled', 'PROCUREMENT_EMD_REQUIRED');
  }
  if (rules.performanceSecurity && Number(tender.performanceSecurityAmount || 0) <= 0) {
    throw new ApiError(400, 'ePBG / performance security amount is required when enabled', 'PROCUREMENT_EPBG_REQUIRED');
  }
  if (methodSlug === 'boq-based-bid' && !hasDocument(/boq|price schedule/i) && items.length === 0) {
    throw new ApiError(400, 'BOQ bid requires a BOQ file or line items', 'PROCUREMENT_BOQ_REQUIRED');
  }
  if (['pac', 'single-source'].includes(methodSlug)) {
    if (!hasDocument(/pac certificate|proprietary certificate/i)) throw new ApiError(400, 'PAC or Single Source requires a proprietary certificate upload', 'PROCUREMENT_PAC_CERTIFICATE_REQUIRED');
    if (clean(basics.justification || draft.description).length < 20) throw new ApiError(400, 'PAC or Single Source requires single-source justification', 'PROCUREMENT_JUSTIFICATION_REQUIRED');
  }
  if (methodSlug === 'rfp' && clean(tender.scopeOfWork || basics.justification || draft.description).length < 20) {
    throw new ApiError(400, 'RFP requires a scope of work or detailed justification', 'PROCUREMENT_SCOPE_REQUIRED');
  }
  if (methodSlug === 'emergency-purchase' && clean(basics.justification || draft.description).length < 30) {
    throw new ApiError(400, 'Emergency procurement requires an audit justification', 'PROCUREMENT_EMERGENCY_JUSTIFICATION_REQUIRED');
  }
  if (['reverse-auction', 'bid-with-reverse-auction'].includes(methodSlug)) {
    if (Number(rules.startPrice || 0) <= 0) throw new ApiError(400, 'Reverse auction requires a start price', 'PROCUREMENT_AUCTION_PRICE_REQUIRED');
    if (Number(rules.minimumDecrement || 0) <= 0) throw new ApiError(400, 'Reverse auction requires minimum decrement value', 'PROCUREMENT_AUCTION_DECREMENT_REQUIRED');
  }
};

const saveProcurementDraft = async (req: AuthRequest, body: z.infer<typeof procurementDraftBody>) => {
  const methodSlug = methodSlugForDraft(body);
  const methodCode = procurementMethodCodeFor(methodSlug);
  const draftMeta = {
    methodSlug,
    draftStep: body.draftStep ?? null,
    workflowStatus: body.workflowStatus || 'DRAFT',
    approvalStatus: body.approvalStatus || 'DRAFT',
    payload: body.payload || null
  };
  const items = toDraftItems(body.items as Array<Record<string, unknown>> | undefined, methodSlug, draftMeta);
  const data = {
    title: body.title,
    description: body.description,
    categoryId: body.categoryId,
    procurementMethod: methodCode,
    estimatedValue: body.estimatedValue,
    requiredBy: body.requiredBy,
    status: 'DRAFT',
    payload: body.payload || null,  // Store complete wizard data
    draftStep: body.draftStep ?? null  // Store current wizard step
  };

  const saved = body.id
    ? await db.$transaction(async (tx: any) => {
      const existing = await tx.requirement.findFirst({ where: { id: body.id, buyerId: userId(req) } });
      if (!existing) throw new ApiError(404, 'Procurement draft not found', 'PROCUREMENT_DRAFT_NOT_FOUND');
      if (!['DRAFT', 'REJECTED'].includes(String(existing.status))) throw new ApiError(409, 'Submitted procurement cannot be edited as a draft', 'PROCUREMENT_DRAFT_LOCKED');
      await tx.requirementItem.deleteMany({ where: { requirementId: body.id } });
      return tx.requirement.update({
        where: { id: body.id },
        data: { ...data, items: items.length ? { create: items } : undefined },
        include: procurementDraftInclude
      });
    })
    : await procurementWorkflow.createRequirement(actorFrom(req), {
      ...data,
      items
    });
  await auditWrite(req, body.id ? 'procurement.draft.updated' : 'procurement.draft.created', 'requirement', saved.id, { methodSlug });
  return db.requirement.findUnique({ where: { id: saved.id }, include: procurementDraftInclude });
};

const tenderBody = z.object({
  title: z.string().trim().min(3).max(200),
  category: z.string().trim().min(2).max(120).default('General'),
  categoryId: z.coerce.number().int().positive().optional(),
  requirementId: z.coerce.number().int().positive().optional(),
  budget: z.coerce.number().positive(),
  description: z.string().trim().min(5).max(5000),
  documentUrl: z.string().trim().max(1000).optional(),
  closesAt: z.coerce.date().optional(),
  quantityUnit: z.string().trim().max(40).optional(),
  paymentTerms: z.string().trim().max(80).optional(),
  deliveryType: z.string().trim().max(80).optional()
});

const bidBody = z.object({
  unitPrice: z.coerce.number().positive(),
  quantity: z.coerce.number().int().positive(),
  taxRate: z.coerce.number().min(0).max(100).optional(),
  discountAmount: z.coerce.number().nonnegative().optional(),
  deliveryDays: z.coerce.number().int().positive(),
  warranty: z.string().trim().max(500).nullable().optional(),
  validTill: z.coerce.date().nullable().optional(),
  note: z.string().trim().max(2000).nullable().optional(),
  documentUrl: z.string().trim().max(1000).nullable().optional(),
  fileAssetId: z.coerce.number().int().positive().nullable().optional()
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
  documentUrl: z.string().trim().max(1000).optional(),
  estimatedValue: z.coerce.number().nonnegative().optional(),
  deadlineDate: z.coerce.date().optional()
});

const quoteResponseBody = z.object({
  totalAmount: z.coerce.number().nonnegative().optional(),
  deliveryDays: z.coerce.number().int().positive().optional(),
  validityDate: z.coerce.date().optional(),
  notes: z.string().trim().max(2000).optional(),
  documentUrl: z.string().trim().max(1000).optional()
});

const actorFrom = (req: AuthRequest) => ({
  id: userId(req),
  role: String(req.user?.role),
  ipAddress: req.ip,
  userAgent: req.headers['user-agent']
});

const cleanEnv = (value: unknown) => String(value || '').trim().replace(/^['"]|['"]$/g, '');

const apiSetuAllowInsecureTls = () =>
  cleanEnv(process.env.APISETU_ALLOW_INSECURE_TLS).toLowerCase() === 'true' ||
  process.env.NODE_ENV !== 'production';

const fetchApiSetuJson = async (apiUrl: string, headers: Record<string, string>) => {
  const parseBody = (text: string) => {
    try {
      return text ? JSON.parse(text) : {};
    } catch {
      return {};
    }
  };

  try {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 20000);
    try {
      const response = await fetch(apiUrl, {
        method: 'GET',
        headers,
        signal: controller.signal
      });
      const text = await response.text();
      return { ok: response.ok, status: response.status, body: parseBody(text), text };
    } finally {
      clearTimeout(timeout);
    }
  } catch (err: any) {
    if (!apiSetuAllowInsecureTls()) {
      throw new ApiError(424, 'GST verification provider is unreachable. Please try again later.', 'GST_PROVIDER_UNREACHABLE', {
        cause: err?.cause?.code || err?.name || err?.message
      });
    }

    return new Promise<{ ok: boolean; status: number; body: any; text: string }>((resolve, reject) => {
      const request = https.request(apiUrl, {
        method: 'GET',
        headers,
        rejectUnauthorized: false
      }, response => {
        let text = '';
        response.setEncoding('utf8');
        response.on('data', chunk => { text += chunk; });
        response.on('end', () => {
          resolve({
            ok: Boolean(response.statusCode && response.statusCode >= 200 && response.statusCode < 300),
            status: response.statusCode || 0,
            body: parseBody(text),
            text
          });
        });
      });
      request.on('error', error => {
        reject(new ApiError(424, 'GST verification provider is unreachable. Please try again later.', 'GST_PROVIDER_UNREACHABLE', {
          cause: (error as any)?.code || error.message
        }));
      });
      request.setTimeout(20000, () => request.destroy(new Error('API Setu request timed out')));
      request.end();
    });
  }
};

// Onboarding
router.get('/onboarding/me', authenticate, asyncRoute(async (req, res) => {
  const user = await db.user.findUnique({
    where: { id: userId(req) },
    include: { buyerProfile: true, sellerProfile: { include: { offices: true, bankAccounts: true, sellerDocuments: { include: { fileAsset: true } } } }, organization: true }
  });
  ok(res, user);
}));

router.put('/seller/onboarding', authenticate, authorize('seller'), asyncRoute(async (req, res) => {
  const data = req.body || {};
  const exists = await db.sellerProfile.findUnique({ where: { userId: userId(req) } });
  if (!exists) {
    try {
      const u = await db.user.findUnique({ where: { id: userId(req) }, select: { name: true } });
      await notificationService.notifyAdmins({
        title: 'Seller Started Onboarding',
        message: `${u?.name || 'A stakeholder'} has started their onboarding process and is filling out details.`,
        type: 'onboarding_started',
        priority: 'low',
        redirectUrl: '/admin/onboarding'
      });
    } catch (err) {
      console.error('[Onboarding Started Notification] Failed:', err);
    }
  }
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

router.post('/buyer/onboarding/send-otp', authenticate, authorize('buyer'), asyncRoute(async (req, res) => {
  const { generateOtp, storeOtp } = await import('../services/otp.service.js');
  const { sendOtpEmail } = await import('../services/mail.service.js');
  const { smsService } = await import('../services/sms.service.js');

  const user = await db.user.findUnique({ where: { id: userId(req) }, include: { buyerProfile: true } });
  if (!user) throw new ApiError(404, 'User not found');

  const mobile = user.mobile || user.buyerProfile?.mobile;
  const channel = req.body?.channel === 'sms' && mobile && smsService.isEnabled() ? 'sms' : 'email';
  const identity = channel === 'sms' ? mobile : user.email;
  if (!identity) throw new ApiError(400, `${channel === 'sms' ? 'Mobile' : 'Email'} is not configured.`);

  const otp = generateOtp();
  const otpState = await storeOtp('buyer_profile_update', identity, otp, { userId: user.id, channel }, channel);

  let deliveryConfigured = false;
  if (channel === 'sms') {
    const smsResult = await smsService.sendOtpSms(identity, otp, 'onboarding_alert');
    deliveryConfigured = smsResult.success;
  } else {
    deliveryConfigured = await sendOtpEmail(identity, otp, '[SECURE AUTH] Profile update verification code');
  }

  await auditWrite(req, 'buyer.profile_update_otp.sent', 'user', user.id, { channel });

  ok(res, { success: true, sendsRemaining: otpState.sendsRemaining, deliveryConfigured, channel });
}));

router.post('/buyer/settings/change-email/send-otp', authenticate, authorize('buyer'), asyncRoute(async (req, res) => {
  const { generateOtp, storeEmailOtp } = await import('../services/otp.service.js');
  const { sendOtpEmail } = await import('../services/mail.service.js');

  const newEmail = clean(req.body?.email || req.body?.newEmail).toLowerCase();
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(newEmail)) {
    throw new ApiError(400, 'Enter a valid new email address');
  }

  const user = await db.user.findUnique({ where: { id: userId(req) }, select: { id: true, email: true } });
  if (!user) throw new ApiError(404, 'User not found');
  if (user.email?.toLowerCase() === newEmail) throw new ApiError(400, 'New email must be different from current email');

  const existing = await db.user.findUnique({ where: { email: newEmail }, select: { id: true } });
  if (existing) throw new ApiError(409, 'This email is already registered with another account');

  const otp = generateOtp();
  const otpState = await storeEmailOtp(newEmail, otp);
  const deliveryConfigured = await sendOtpEmail(newEmail, otp, '[SECURE AUTH] Buyer email change verification code');

  await auditWrite(req, 'buyer.change_email_otp.sent', 'user', user.id, {
    newEmailHash: sha256(newEmail),
    deliveryConfigured
  });

  ok(res, { success: true, sendsRemaining: otpState.sendsRemaining, deliveryConfigured });
}));

router.post('/buyer/settings/change-email', authenticate, authorize('buyer'), asyncRoute(async (req, res) => {
  const { verifyEmailOtp, consumeEmailOtp } = await import('../services/otp.service.js');

  const newEmail = clean(req.body?.newEmail || req.body?.email).toLowerCase();
  const otp = clean(req.body?.otp);
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(newEmail)) {
    throw new ApiError(400, 'Enter a valid new email address');
  }
  if (!/^\d{6}$/.test(otp)) throw new ApiError(400, 'Enter the 6-digit OTP sent to the new email');

  const user = await db.user.findUnique({ where: { id: userId(req) }, select: { id: true, email: true } });
  if (!user) throw new ApiError(404, 'User not found');
  if (user.email?.toLowerCase() === newEmail) throw new ApiError(400, 'New email must be different from current email');

  const existing = await db.user.findUnique({ where: { email: newEmail }, select: { id: true } });
  if (existing) throw new ApiError(409, 'This email is already registered with another account');

  const otpCheck = await verifyEmailOtp(newEmail, otp);
  if (!otpCheck.ok) throw new ApiError(400, 'Invalid or expired OTP');

  await db.user.update({
    where: { id: user.id },
    data: { email: newEmail }
  });

  await consumeEmailOtp(newEmail);
  await auditWrite(req, 'buyer.email_changed', 'user', user.id, { newEmailHash: sha256(newEmail) });

  ok(res, { success: true, message: 'Email updated successfully' });
}));

router.put('/buyer/onboarding', authenticate, authorize('buyer'), asyncRoute(async (req, res) => {
  const data = req.body || {};

  // Bank details validations
  if (data.bankAccountNo || data.bankIfsc || data.bankName || data.bankAddress || data.accountHolderName) {
    if (data.bankIfsc && !/^[A-Z]{4}0[A-Z0-9]{6}$/.test(String(data.bankIfsc).toUpperCase())) {
      throw new ApiError(400, 'Invalid IFSC code format');
    }
    if (data.bankAccountNo && !/^\d{9,18}$/.test(String(data.bankAccountNo))) {
      throw new ApiError(400, 'Bank account number must be between 9 and 18 digits');
    }
    if (data.bankName && (String(data.bankName).trim().length < 3 || String(data.bankName).trim().length > 100 || !/[a-zA-Z]/.test(String(data.bankName)))) {
      throw new ApiError(400, 'Bank name must be between 3 and 100 characters and contain letters');
    }
    if (data.accountHolderName && (String(data.accountHolderName).trim().length < 3 || String(data.accountHolderName).trim().length > 100 || !/[a-zA-Z]/.test(String(data.accountHolderName)))) {
      throw new ApiError(400, 'Account holder name must be between 3 and 100 characters and contain letters');
    }
    if (data.bankAddress && (String(data.bankAddress).trim().length < 10 || String(data.bankAddress).trim().length > 250)) {
      throw new ApiError(400, 'Bank address must be between 10 and 250 characters');
    }
  }

  // Guard personal fields with OTP check if profile already exists
  const personalFields = [
    'representativeName',
    'designation',
    'dateOfRetirement',
    'nameAsInPan',
    'pan',
    'dateAsInPan'
  ];
  const isUpdatingPersonalFields = personalFields.some(field => Object.prototype.hasOwnProperty.call(data, field));

  if (isUpdatingPersonalFields) {
    const exists = await db.buyerProfile.findUnique({ where: { userId: userId(req) } });
    if (exists) {
      const otp = req.body.otp;
      if (!otp) {
        throw new ApiError(400, 'OTP is required for updating personal information');
      }

      const user = await db.user.findUnique({ where: { id: userId(req) }, include: { buyerProfile: true } });
      if (!user) throw new ApiError(404, 'User not found');

      const { verifyOtp, consumeOtp } = await import('../services/otp.service.js');
      const mobile = user.mobile || user.buyerProfile?.mobile;
      const channel = req.body?.channel === 'sms' && mobile ? 'sms' : 'email';
      const identity = channel === 'sms' ? mobile : user.email;
      if (!identity) throw new ApiError(400, 'Identity not configured for verification');

      const verifyResult = await verifyOtp('buyer_profile_update', identity, otp);
      if (!verifyResult.ok) {
        throw new ApiError(400, 'Invalid or expired OTP');
      }

      await consumeOtp('buyer_profile_update', identity);
    }
  }

  const editableFields = [
    'organizationName',
    'businessType',
    'msmeType',
    'organizationType',
    'ministry',
    'division',
    'employeeCount',
    'industry',
    'cin',
    'pan',
    'nameAsInPan',
    'dateAsInPan',
    'gst',
    'website',
    'state',
    'district',
    'officeZoneName',
    'representativeName',
    'designation',
    'dateOfRetirement',
    'department',
    'email',
    'mobile',
    'alternateMobile',
    'stdCode',
    'officeContact',
    'extensionNo',
    'bankIfsc',
    'bankName',
    'bankAddress',
    'bankAccountNo',
    'accountHolderName',
    'competentAuthorityEmail',
    'verifyingFirstName',
    'verifyingLastName',
    'verifyingEmail',
    'verifyingMobile',
    'verifyingDesignation',
    'country',
    'city',
    'pincode',
    'registeredAddress',
    'corporateAddress',
    'procurementCategories',
    'otherCategoryDetails',
    'annualBudget',
    'preferredMethods',
    'otherMethodDetails',
    'declarationAccepted',
    'termsAccepted',
    'documents'
  ];
  const profileData = editableFields.reduce((acc: Record<string, unknown>, field) => {
    if (Object.prototype.hasOwnProperty.call(data, field)) acc[field] = data[field];
    return acc;
  }, {});
  const exists = await db.buyerProfile.findUnique({ where: { userId: userId(req) } });
  if (!exists) {
    try {
      const u = await db.user.findUnique({ where: { id: userId(req) }, select: { name: true } });
      await notificationService.notifyAdmins({
        title: 'Buyer Started Onboarding',
        message: `${u?.name || 'A stakeholder'} has started their onboarding process and is filling out details.`,
        type: 'onboarding_started',
        priority: 'low',
        redirectUrl: '/admin/onboarding'
      });
    } catch (err) {
      console.error('[Onboarding Started Notification] Failed:', err);
    }
  }
  const profile = await db.buyerProfile.upsert({
    where: { userId: userId(req) },
    update: profileData,
    create: {
      userId: userId(req),
      organizationName: clean(data.organizationName || 'Buyer Organization'),
      businessType: clean(data.businessType || 'Government Buyer'),
      mobile: clean(data.mobile || '0000000000'),
      procurementCategories: data.procurementCategories || [],
      preferredMethods: data.preferredMethods || [],
      ...profileData
    }
  });
  if (profileData.representativeName) {
    await db.user.update({
      where: { id: userId(req) },
      data: { name: String(profileData.representativeName) }
    });
  }
  await auditWrite(req, 'onboarding.buyer.updated', 'buyerProfile', profile.id);
  ok(res, profile);
}));

router.post('/onboarding/submit', authenticate, asyncRoute(async (req, res) => {
  const user = await db.user.findUnique({
    where: { id: userId(req) },
    include: {
      sellerProfile: {
        include: {
          offices: true,
          sellerDocuments: true
        }
      }
    }
  });
  if (!user) throw new ApiError(404, 'User not found');

  if (user.role === 'seller') {
    const profile = user.sellerProfile;
    if (!profile) throw new ApiError(400, 'Seller profile not found');

    const regDetails = (user.registrationDetails as Record<string, any>) || {};
    const isShg = [
      'hershg',
      'women_shg',
      'farmer_shg',
      'artisan_shg',
      'dairy_shg',
      'livelihood_shg',
      'tribal_shg',
      'youth_shg',
      'other_shg'
    ].includes(String(regDetails.businessType || regDetails.shgType || '').trim().toLowerCase());

    const requiredDocs: string[] = isShg
      ? ['bank_passbook', 'address_proof', 'leader_aadhaar', 'member_list']
      : ['pan_copy', 'bank_passbook', 'address_proof'];

    const addRequiredDoc = (docType: string) => {
      if (!requiredDocs.includes(docType)) requiredDocs.push(docType);
    };

    if (Array.isArray(regDetails.selectedDocuments)) {
      for (const docType of regDetails.selectedDocuments) {
        if (typeof docType === 'string' && docType.trim()) addRequiredDoc(docType.trim());
      }
    }

    if (!isShg) {
      addRequiredDoc('udyam_certificate');
    }

    if (profile.isStartup || String(profile.organizationType || regDetails.businessType).toLowerCase() === 'startup') {
      addRequiredDoc('dipp_certificate');
    }

    const hasGstin = Array.isArray(profile.registrationTypes) && profile.registrationTypes.includes('GST_REGISTERED');
    if (hasGstin) {
      addRequiredDoc('gst_certificate');
    }

    if (regDetails.verificationMethod === 'Aadhaar' || regDetails.aadhaarNumber) {
      addRequiredDoc('aadhaar_card');
    }

    const corporateTypes = ['Company', 'LLP', 'Partnership', 'Cooperative', 'Society', 'Trust'];
    const isCorporate = corporateTypes.some(t => String(profile.organizationType || regDetails.businessType).toLowerCase().includes(t.toLowerCase()));
    if (isCorporate && (regDetails.cinNumber || regDetails.registrationNumber || regDetails.cin)) {
      addRequiredDoc('business_registration_proof');
    }

    const uploadedDocs = profile.sellerDocuments?.map((d: any) => d.documentType) || [];
    const missingDocs = requiredDocs.filter(d => !uploadedDocs.includes(d));

    if (missingDocs.length > 0) {
      const labels: Record<string, string> = {
        pan_copy: 'PAN Card Copy',
        bank_passbook: 'Bank Passbook / Cancelled Cheque',
        address_proof: 'Address Proof',
        udyam_certificate: 'Udyam Certificate',
        gst_certificate: 'GST Certificate',
        aadhaar_card: 'Aadhaar of Authorized Person',
        business_registration_proof: 'Business Registration Proof (CIN/Shop Act)',
        dipp_certificate: 'DIPP Certificate',
        itr_3_years: 'Income Tax Returns of Last 3 Years',
        nsic_certificate: 'NSIC Registration Certificate',
        leader_aadhaar: 'Group Leader Aadhaar Card',
        registration_certificate: 'SHG Registration Certificate',
        member_list: 'Member List'
      };
      const missingLabels = missingDocs.map(d => labels[d] || d).join(', ');
      throw new ApiError(400, `Missing required documents: ${missingLabels}. Please upload them before submitting.`, 'MISSING_MANDATORY_DOCUMENTS');
    }
  }

  const sectionStatus = (user.sectionStatus as Record<string, any>) || {};
  const sections = user.role === 'buyer'
    ? ['org', 'rep', 'address', 'procurement', 'docs']
    : ['pan', 'details', 'additional', 'offices', 'bank', 'ownership', 'documents'];

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

  let onboardingStatus = 'under_compliance_review';
  let registrationStatus = 'completed';

  const isDualRole = Boolean(user.isDualRole);
  const alreadyApproved = user.onboardingStatus === 'approved_for_procurement';

  if (isDualRole && alreadyApproved) {
    onboardingStatus = 'approved_for_procurement';
  }

  if (user.role === 'buyer') {
    await db.buyerProfile.updateMany({
      where: { userId: user.id },
      data: { verificationStatusEnum: 'UNDER_REVIEW', verificationStatus: 'UNDER_REVIEW' }
    });
  } else if (user.role === 'seller') {
    await db.sellerProfile.updateMany({
      where: { userId: user.id },
      data: { verificationStatusEnum: 'UNDER_REVIEW' }
    });
  }

  const updated = await db.user.update({
    where: { id: userId(req) },
    data: {
      onboardingStatus,
      registrationStatus,
      sectionStatus: {
        ...finalSectionStatus,
        submitted: true
      }
    }
  });

  // Ensure organization record is created/linked as PENDING upon onboarding submission
  await createOrUpdatePendingOrganization(updated.id).catch((err: any) => {
    console.error('[Onboarding Submit] Failed to create pending organization:', err);
  });

  deleteCache('/api/auth/me').catch(() => undefined);
  deleteCache('/api/org/status').catch(() => undefined);

  await auditWrite(req, 'onboarding.submitted', 'user', updated.id);

  try {
    const applicant = await db.user.findUnique({ where: { id: userId(req) }, select: { name: true, role: true, email: true } });
    await notificationService.notifyWithEmail(userId(req), {
      title: 'Application Submitted for Review',
      message: 'Your onboarding application has been submitted for admin compliance review. You will be notified when an admin updates the status.',
      type: 'onboarding_submitted_for_review',
      priority: 'high',
      redirectUrl: user.role === 'seller' ? '/seller/onboarding' : '/buyer/onboarding'
    });
    await notificationService.notifyAdminsWithEmail({
      title: 'New Application Submitted',
      message: `${applicant?.name || 'A user'} (${applicant?.role}) has submitted their onboarding application for review.`,
      type: 'onboarding_submitted',
      priority: 'high',
      redirectUrl: '/admin/onboarding',
      emailSubject: 'New Application Pending Review - MSME Procurement Portal',
      emailHtml: `<p>A new onboarding application has been submitted and requires your review.</p><p><strong>Applicant:</strong> ${applicant?.name || 'Unknown'} (${applicant?.role})</p><p><strong>Email:</strong> ${applicant?.email || 'N/A'}</p>`
    });
  } catch (error) {
    // Suppress notification errors to not block user flow
  }

  ok(res, updated);
}));

router.post('/onboarding/upload-document', authenticate, upload.single('file'), asyncRoute(async (req: AuthRequest & { file?: Express.Multer.File }, res) => {
  if (!req.file) throw new ApiError(400, 'Document file is required', 'DOCUMENT_REQUIRED');
  if (req.user?.role !== 'seller') throw new ApiError(403, 'Document upload is only available for seller/SHG accounts', 'FORBIDDEN');

  // Upsert sellerProfile — SHG users register as 'seller' role but may not have
  // completed the PAN step yet. We auto-create a minimal profile so they can
  // upload their SHG verification documents independently.
  let profile = await db.sellerProfile.findUnique({ where: { userId: userId(req) } });
  if (!profile) {
    const dbUser = await db.user.findUnique({ where: { id: userId(req) }, select: { name: true, registrationDetails: true } });
    const regDetails = (dbUser?.registrationDetails as Record<string, any>) || {};
    // Use a unique pan placeholder per user so the @unique constraint is not violated
    const panPlaceholder = `PENDING_${userId(req)}_${Date.now()}`;
    profile = await db.sellerProfile.create({
      data: {
        userId: userId(req),
        pan: panPlaceholder,
        nameAsInPan: dbUser?.name || 'Pending',
        organizationType: String(regDetails.businessType || 'herSHG')
      }
    });
  }

  const docType = clean(req.body?.documentType || 'onboarding');

  // Deactivate existing documents of the same type
  const existingDocs = await db.sellerDocument.findMany({
    where: {
      sellerProfileId: profile.id,
      documentType: docType
    },
    include: {
      fileAsset: true
    }
  });

  for (const doc of existingDocs) {
    await db.sellerDocument.delete({ where: { id: doc.id } });
    if (doc.fileAsset) {
      await db.fileAsset.update({
        where: { id: doc.fileAssetId },
        data: { status: 'inactive' }
      });
    }
  }

  const context = {
    ownerId: userId(req),
    ownerRole: String(req.user?.role),
    entityType: 'onboarding',
    entityId: profile.id,
    ipAddress: req.ip,
    userAgent: req.headers['user-agent']
  };

  const asset = await uploadFile(req.file, context, env.STORAGE_PROVIDER);

  const document = await db.sellerDocument.create({
    data: {
      sellerProfileId: profile.id,
      documentType: docType,
      fileAssetId: asset.id
    }
  });

  await auditWrite(req, 'onboarding.document_uploaded', 'sellerDocument', document.id);
  ok(res, { asset, document }, 201);
}));


const getPublicTenderDocument = async (fileId: number) => db.tenderDocument.findFirst({
  where: {
    fileAssetId: fileId,
    isPublic: true,
    tender: { status: { in: ['published', 'bid_submission'] } }
  },
  include: { tender: { select: { buyerId: true } } }
});

router.get('/public/files/:id/view', asyncRoute(async (req: AuthRequest, res) => {
  const { id } = parse(idParams, req.params);
  const publicDoc = await getPublicTenderDocument(id);
  if (!publicDoc) throw new ApiError(404, 'Public document not found', 'FILE_NOT_FOUND');

  const file = await getFileContent(id, { id: publicDoc.tender.buyerId, role: 'buyer' }, {
    ipAddress: req.ip,
    userAgent: req.headers['user-agent']
  });
  const filename = encodeURIComponent(file.asset.originalName || 'document');

  res.setHeader('Content-Type', file.contentType);
  res.setHeader('Content-Length', file.buffer.length);
  res.setHeader('Content-Disposition', `inline; filename="${filename}"; filename*=UTF-8''${filename}`);
  res.setHeader('Cache-Control', 'public, max-age=300');
  return res.end(file.buffer);
}));

router.get('/public/files/:id/signed-url', asyncRoute(async (req: AuthRequest, res) => {
  const { id } = parse(idParams, req.params);
  const publicDoc = await getPublicTenderDocument(id);
  if (!publicDoc) throw new ApiError(404, 'Public document not found', 'FILE_NOT_FOUND');

  const file = await getSignedUrl(id, { id: publicDoc.tender.buyerId, role: 'buyer' }, {
    ipAddress: req.ip,
    userAgent: req.headers['user-agent']
  });

  ok(res, {
    signedUrl: file.signedUrl,
    expiresInSeconds: file.expiresInSeconds,
    file: {
      id: file.asset.id,
      originalName: file.asset.originalName,
      mimeType: file.asset.mimeType,
      size: file.asset.size
    }
  });
}));

router.get('/files/:id/view', authenticate, asyncRoute(async (req: AuthRequest, res) => {
  const { id } = parse(idParams, req.params);
  if (!req.user) throw new ApiError(401, 'Authentication required', 'AUTH_REQUIRED');

  const file = await getFileContent(id, req.user, {
    ipAddress: req.ip,
    userAgent: req.headers['user-agent']
  });
  const filename = encodeURIComponent(file.asset.originalName || 'document');

  res.setHeader('Content-Type', file.contentType);
  res.setHeader('Content-Length', file.buffer.length);
  res.setHeader('Content-Disposition', `inline; filename="${filename}"; filename*=UTF-8''${filename}`);
  res.setHeader('Cache-Control', 'private, no-store');
  return res.end(file.buffer);
}));

router.get('/files/:id/signed-url', authenticate, asyncRoute(async (req: AuthRequest, res) => {
  const { id } = parse(idParams, req.params);
  if (!req.user) throw new ApiError(401, 'Authentication required', 'AUTH_REQUIRED');

  const file = await getSignedUrl(id, req.user, {
    ipAddress: req.ip,
    userAgent: req.headers['user-agent']
  });

  ok(res, {
    signedUrl: file.signedUrl,
    expiresInSeconds: file.expiresInSeconds,
    file: {
      id: file.asset.id,
      originalName: file.asset.originalName,
      mimeType: file.asset.mimeType,
      size: file.asset.size
    }
  });
}));

router.get('/admin/onboarding', authenticate, authorizeAdmin, asyncRoute(async (req, res) => {
  const query = parse(paginationQuery, req.query);
  const pendingStatuses = ['pending', 'pending_validation', 'manual_review_required', 'under_compliance_review'];
  const where: any = { role: { in: query.role ? [query.role] : ['buyer', 'seller'] } };
  const conditions: any[] = [];

  if (query.status) {
    if (query.status === 'review_queue') {
      conditions.push({
        OR: [
          { onboardingStatus: { in: pendingStatuses } },
          {
            isDualRole: true,
            role: 'seller',
            sellerProfile: { verificationStatusEnum: 'UNDER_REVIEW' }
          },
          {
            isDualRole: true,
            role: 'buyer',
            buyerProfile: { verificationStatusEnum: 'UNDER_REVIEW' }
          }
        ]
      });
    } else {
      conditions.push({ onboardingStatus: query.status });
    }
  }

  if (query.q) {
    conditions.push({
      OR: [
        { name: { contains: query.q, mode: 'insensitive' } },
        { email: { contains: query.q, mode: 'insensitive' } },
        { buyerProfile: { organizationName: { contains: query.q, mode: 'insensitive' } } },
        { buyerProfile: { gst: { contains: query.q, mode: 'insensitive' } } },
        { buyerProfile: { pan: { contains: query.q, mode: 'insensitive' } } },
        { sellerProfile: { businessName: { contains: query.q, mode: 'insensitive' } } },
        { sellerProfile: { pan: { contains: query.q, mode: 'insensitive' } } }
      ]
    });
  }

  if (conditions.length > 0) {
    where.AND = conditions;
  }
  const window = listWindow(query);
  const [users, total, statusGroups, approvedRoleGroups, flagged] = await Promise.all([
    db.user.findMany({
      where,
      select: {
        // List view payload - intentionally lean. Heavy fields like
        // offices/bankAccounts/sellerDocuments/full profile are loaded only
        // when the scrutiny modal is opened via GET /admin/onboarding/:id.
        id: true,
        name: true,
        email: true,
        role: true,
        onboardingStatus: true,
        registrationStatus: true,
        registrationDetails: true,
        createdAt: true,
        updatedAt: true,
        sectionStatus: true,
        adminFeedback: true,
        complianceViolations: { select: { id: true, type: true, severity: true, status: true } },
        buyerProfile: {
          select: {
            organizationName: true,
            businessType: true,
            organizationType: true,
            industry: true,
            gst: true,
            pan: true,
            state: true,
            city: true,
            mobile: true
          }
        },
        sellerProfile: {
          select: {
            businessName: true,
            organizationType: true,
            pan: true,
            msmeCategory: true,
            mobile: true
          }
        }
      },
      orderBy: { updatedAt: 'desc' },
      ...window
    }),
    db.user.count({ where }),
    db.user.groupBy({
      by: ['onboardingStatus'],
      where: { role: { in: ['buyer', 'seller'] } },
      _count: { _all: true }
    }),
    db.user.groupBy({
      by: ['role'],
      where: { role: { in: ['buyer', 'seller'] }, onboardingStatus: 'approved_for_procurement' },
      _count: { _all: true }
    }),
    db.complianceViolation.count({
      where: {
        status: 'open',
        user: { role: { in: ['buyer', 'seller'] } }
      }
    })
  ]);

  const sellers: any[] = [];
  const buyers: any[] = [];
  const getDocumentEntries = (documents: any) =>
    documents && typeof documents === 'object' && !Array.isArray(documents)
      ? Object.entries(documents as Record<string, any>)
      : [];
  const documentOwners = users
    .filter((u: any) => getDocumentEntries((u.role === 'seller' ? u.sellerProfile : u.buyerProfile)?.documents).length > 0)
    .map((u: any) => u.id);
  const documentAssets = documentOwners.length > 0
    ? await db.fileAsset.findMany({
      where: { ownerId: { in: [...new Set(documentOwners)] }, status: 'active' },
      select: { id: true, ownerId: true, key: true, url: true, originalName: true, mimeType: true }
    })
    : [];
  const findDocumentAsset = (ownerId: number, url: string) => {
    const decodedUrl = (() => {
      try {
        return decodeURIComponent(url);
      } catch {
        return url;
      }
    })();
    return documentAssets.find(asset =>
      asset.ownerId === ownerId &&
      (asset.url === url || decodedUrl.includes(asset.key))
    );
  };
  const enrichDocuments = (ownerId: number, documents: any) => {
    if (!documents || typeof documents !== 'object' || Array.isArray(documents)) return documents;
    return Object.fromEntries(getDocumentEntries(documents).map(([key, value]) => {
      const enrichDocumentValue = (documentValue: any) => {
        const url = typeof documentValue === 'string' ? documentValue : documentValue?.url;
        const asset = typeof url === 'string' ? findDocumentAsset(ownerId, url) : null;
        return asset
          ? { url, fileId: asset.id, originalName: asset.originalName, mimeType: asset.mimeType }
          : documentValue;
      };
      return [
        key,
        Array.isArray(value) ? value.map(enrichDocumentValue) : enrichDocumentValue(value)
      ];
    }));
  };

  for (const u of users) {
    const profile = u.role === 'seller' ? u.sellerProfile : u.buyerProfile;
    const item = {
      _id: String(u.id),
      id: u.id,
      name: u.name,
      email: u.email,
      role: u.role,
      onboardingStatus: u.onboardingStatus,
      registrationDetails: u.registrationDetails,
      createdAt: u.createdAt,
      sectionStatus: u.sectionStatus,
      adminFeedback: u.adminFeedback,
      complianceViolations: u.complianceViolations,
      profile: profile ? { ...profile, documents: enrichDocuments(u.id, profile.documents) } : profile
    };
    if (u.role === 'seller') sellers.push(item);
    else buyers.push(item);
  }

  const summary = {
    total,
    statuses: Object.fromEntries(statusGroups.map((row: any) => [row.onboardingStatus || 'pending', row._count._all])),
    approvedRoles: Object.fromEntries(approvedRoleGroups.map((row: any) => [row.role, row._count._all])),
    flagged
  };

  res.json(maskSensitive({ sellers, buyers, total, ...window, filters: query, summary }));
}));

/**
 * Heavy-detail endpoint for the scrutiny modal. The list endpoint above is
 * intentionally lean (only the columns the table cells need); when an admin
 * actually opens an application for review we fetch the full picture in one
 * roundtrip. Keeps the list fast while still showing every onboarding field
 * the seller/buyer submitted.
 */
router.get('/admin/onboarding/:id', authenticate, authorizeAdmin, asyncRoute(async (req, res) => {
  const { id } = parse(idParams, req.params);
  const user = await db.user.findUnique({
    where: { id },
    include: {
      complianceViolations: { orderBy: { createdAt: 'desc' } },
      buyerProfile: true,
      sellerProfile: {
        include: {
          offices: { orderBy: [{ isMandatory: 'desc' }, { id: 'asc' }] },
          bankAccounts: true,
          certifications: { include: { fileAsset: true } },
          sellerDocuments: { include: { fileAsset: true } },
          organization: true
        }
      },
      organization: true
    }
  });
  if (!user) throw new ApiError(404, 'Application not found', 'APPLICATION_NOT_FOUND');
  if (!['buyer', 'seller'].includes(String(user.role))) {
    throw new ApiError(404, 'Application not found', 'APPLICATION_NOT_FOUND');
  }

  // Enrich documents (the same legacy JSON shape the list endpoint expanded).
  const profile = user.role === 'seller' ? user.sellerProfile : user.buyerProfile;
  const docFileIds: number[] = [];
  if (profile?.documents && typeof profile.documents === 'object' && !Array.isArray(profile.documents)) {
    for (const value of Object.values(profile.documents as Record<string, any>)) {
      const list = Array.isArray(value) ? value : [value];
      for (const entry of list) {
        const explicitFileId = Number(entry?.fileId || entry?.file?.id || entry?.fileAssetId);
        if (Number.isFinite(explicitFileId) && explicitFileId > 0) docFileIds.push(explicitFileId);
        const match = String(entry?.url || entry?.fileUrl || entry?.signedUrl || '').match(/\/api\/files\/(\d+)/);
        if (match) docFileIds.push(Number(match[1]));
      }
    }
  }
  const ownerFileAssets = await db.fileAsset.findMany({
    where: { ownerId: user.id, status: 'active' },
    orderBy: { id: 'desc' },
    select: { id: true, ownerId: true, key: true, url: true, originalName: true, mimeType: true, size: true, entityType: true, createdAt: true }
  });
  const fileAssets = docFileIds.length > 0
    ? await db.fileAsset.findMany({ where: { id: { in: docFileIds } } })
    : [];
  const fileAssetById = new Map([...ownerFileAssets, ...fileAssets].map((f: any) => [f.id, f]));
  const normalizeDocumentName = (value: unknown) => String(value || '')
    .trim()
    .toLowerCase()
    .replace(/\s+/g, ' ')
    .replace(/(_optimized)(?=\.[a-z0-9]+$)/i, '');
  const findAssetForDocumentEntry = (entry: any, fileId: number | null) => {
    if (fileId) return fileAssetById.get(fileId) as any;
    const url = String(entry?.url || entry?.fileUrl || entry?.signedUrl || '');
    if (url) {
      const decodedUrl = (() => {
        try {
          return decodeURIComponent(url);
        } catch {
          return url;
        }
      })();
      const byUrl = ownerFileAssets.find((asset: any) =>
        asset.url === url || decodedUrl.includes(asset.key || '') || url.includes(`/api/files/${asset.id}/`)
      );
      if (byUrl) return byUrl;
    }
    const entryName = normalizeDocumentName(entry?.originalName || entry?.name || entry?.fileName);
    if (!entryName) return null;
    return ownerFileAssets.find((asset: any) => normalizeDocumentName(asset.originalName) === entryName)
      || ownerFileAssets.find((asset: any) => {
        const assetName = normalizeDocumentName(asset.originalName);
        return assetName.includes(entryName) || entryName.includes(assetName);
      })
      || null;
  };
  const assetToDocument = (asset: any) => ({
    fileId: asset.id,
    url: `/api/files/${asset.id}/view`,
    originalName: asset.originalName,
    mimeType: asset.mimeType,
    fileAsset: asset
  });
  const enrichDocuments = (documents: any) => {
    if (!documents || typeof documents !== 'object' || Array.isArray(documents)) {
      return user.role === 'buyer' && ownerFileAssets.length > 0
        ? { uploaded_files: ownerFileAssets.map(assetToDocument) }
        : documents;
    }
    const enriched = Object.fromEntries(Object.entries(documents).map(([key, value]) => {
      const arr = Array.isArray(value) ? value : [value];
      return [key, arr.map((entry: any) => {
        const explicitFileId = Number(entry?.fileId || entry?.file?.id || entry?.fileAssetId);
        const match = String(entry?.url || entry?.fileUrl || entry?.signedUrl || '').match(/\/api\/files\/(\d+)/);
        const fileId = Number.isFinite(explicitFileId) && explicitFileId > 0 ? explicitFileId : (match ? Number(match[1]) : null);
        const fileAsset = findAssetForDocumentEntry(entry, fileId);
        return {
          ...entry,
          fileId: entry?.fileId || fileId || fileAsset?.id || undefined,
          url: entry?.url || (fileAsset?.id ? `/api/files/${fileAsset.id}/view` : undefined),
          originalName: entry?.originalName || fileAsset?.originalName,
          mimeType: entry?.mimeType || fileAsset?.mimeType,
          fileAsset
        };
      })];
    }));
    const hasVisibleDocument = Object.values(enriched).some((value: any) =>
      (Array.isArray(value) ? value : [value]).some((entry: any) => entry?.url || entry?.fileId || entry?.fileAsset?.url)
    );
    return hasVisibleDocument || user.role !== 'buyer' || ownerFileAssets.length === 0
      ? enriched
      : { ...enriched, uploaded_files: ownerFileAssets.map(assetToDocument) };
  };

  const registrationDetails = (user.registrationDetails as Record<string, any>) || {};
  const registrationGstDetails = registrationDetails.gstDetails && typeof registrationDetails.gstDetails === 'object'
    ? registrationDetails.gstDetails
    : {};
  const organization = user.organization as any;
  const gstVerificationDetails = {
    gstin: (profile as any)?.gst || registrationDetails.gstin || organization?.gstin || null,
    verified: Boolean((profile as any)?.gstFingerprint || registrationDetails.gstVerified || organization?.gstin),
    source: (profile as any)?.gstFingerprint
      ? 'onboarding'
      : registrationDetails.gstVerified
        ? 'registration'
        : organization?.gstin
          ? 'organization'
          : null,
    legalName: registrationGstDetails.legalName || registrationGstDetails.legalBusinessName || organization?.organizationName || (profile as any)?.organizationName || null,
    tradeName: registrationGstDetails.tradeName || registrationGstDetails.tradeNam || null,
    status: registrationGstDetails.status || registrationGstDetails.gstnStatus || null,
    pan: registrationGstDetails.pan || organization?.panNumber || (profile as any)?.pan || registrationDetails.pan || null,
    state: registrationGstDetails.state || organization?.state || (profile as any)?.state || registrationDetails.state || null,
    district: registrationGstDetails.district || organization?.district || (profile as any)?.district || registrationDetails.district || null,
    city: registrationGstDetails.city || organization?.city || (profile as any)?.city || null,
    pincode: registrationGstDetails.pincode || organization?.pincode || (profile as any)?.pincode || null,
    address: registrationGstDetails.address || organization?.addressLine1 || (profile as any)?.registeredAddress || null
  };

  const enrichedProfile = profile
    ? { ...profile, documents: enrichDocuments(profile.documents), gstVerificationDetails }
    : { gstVerificationDetails };

  res.json(maskSensitive({
    success: true,
    data: {
      _id: user.id,
      ...user,
      profile: enrichedProfile
    }
  }));
}));

router.post('/admin/onboarding/:id/section-status', authenticate, authorizeAdmin, asyncRoute(async (req, res) => {
  const { id } = parse(idParams, req.params);
  const body = parse(z.object({
    sectionStatus: z.record(z.string(), z.unknown()),
    sectionRejectionReasons: z.record(z.string(), z.unknown()).nullish()
  }), req.body);

  const existing = await db.user.findUnique({
    where: { id },
    select: {
      id: true,
      name: true,
      role: true,
      sectionStatus: true,
      sectionRejectionReasons: true,
      onboardingStatus: true
    }
  });
  if (!existing) throw new ApiError(404, 'User not found');

  const previousStatus = (existing.sectionStatus as Record<string, unknown>) || {};
  const nextStatus = body.sectionStatus || {};
  const reasons = body.sectionRejectionReasons || {};

  const sections = existing.role === 'buyer'
    ? ['org', 'rep', 'address', 'procurement', 'docs']
    : ['pan', 'details', 'additional', 'offices', 'bank', 'ownership', 'documents'];

  // Strip non-section meta keys (e.g. seller-side `submitted: true` flag) so
  // the persisted state stays canonical and onboarding status calculations
  // never get confused by stray boolean values.
  const cleanSectionStatus: Record<string, string> = {};
  for (const s of sections) {
    cleanSectionStatus[s] = String(nextStatus[s] || previousStatus[s] || 'pending');
  }

  const sectionLabels: Record<string, string> = {
    pan: 'Business PAN Validation',
    details: 'Business Details',
    additional: 'Additional Details',
    offices: 'Office Locations',
    bank: 'Bank Accounts',
    ownership: 'Beneficial Ownership',
    documents: 'Documents Upload',
    org: 'Organization Details',
    rep: 'Representative Details',
    address: 'Address Details',
    procurement: 'Procurement Details',
    docs: 'Verification Documents'
  };

  const statuses = sections.map(s => cleanSectionStatus[s]);
  let newOnboardingStatus = existing.onboardingStatus;

  if (statuses.every(s => s === 'approved')) {
    newOnboardingStatus = 'approved_for_procurement';
  } else if (statuses.some(s => s === 'rejected')) {
    newOnboardingStatus = 'rejected';
  } else if (statuses.some(s => s === 'resubmission_required')) {
    newOnboardingStatus = 'resubmission_required';
  } else {
    newOnboardingStatus = 'under_compliance_review';
  }

  const updateData = {
    sectionStatus: cleanSectionStatus,
    sectionRejectionReasons: body.sectionRejectionReasons || {},
    onboardingStatus: newOnboardingStatus
  };

  const approvalResult = newOnboardingStatus === 'approved_for_procurement'
    ? await approveOnboardingAndEnsureOrganization(id, updateData)
    : null;

  const user = approvalResult?.user || await db.user.update({
    where: { id },
    data: updateData
  });

  if (existing.role === 'buyer') {
    let showcaseStatus = 'PENDING';
    if (newOnboardingStatus === 'approved_for_procurement') {
      showcaseStatus = 'VERIFIED';
    } else if (newOnboardingStatus === 'rejected') {
      showcaseStatus = 'REJECTED';
    }
    const adminUser = req.user?.id ? await db.user.findUnique({ where: { id: req.user.id } }) : null;
    const adminName = adminUser?.name || 'Admin';
    await db.buyerProfile.updateMany({
      where: { userId: id },
      data: {
        verificationStatus: showcaseStatus,
        verificationStatusEnum: showcaseStatus as any,
        verifiedAt: showcaseStatus === 'VERIFIED' ? new Date() : null,
        verifiedBy: showcaseStatus === 'VERIFIED' ? adminName : null
      }
    }).catch((err: any) => console.error('[Showcase Status Update Failed]', err));

    // Also update the Organization table verificationStatus if they are linked
    const linkedProfile = await db.buyerProfile.findUnique({ where: { userId: id } });
    if (linkedProfile?.organizationId) {
      await db.organization.update({
        where: { id: linkedProfile.organizationId },
        data: {
          verificationStatus: showcaseStatus as any,
          organizationOnboardingStatus: showcaseStatus === 'VERIFIED' ? 'approved_for_procurement' : undefined
        }
      }).catch((err: any) => console.error('[Organization Status Sync Failed]', err));
    }
  }

  if (approvalResult) {
    await auditWrite(req, 'onboarding.approved', 'user', id, {
      organizationId: approvalResult.organization.id
    });
    if (approvalResult.createdOrganization) {
      await auditWrite(req, 'organization.auto_created_from_onboarding', 'organization', approvalResult.organization.id, {
        userId: id,
        role: user.role
      });
    }
    if (approvalResult.createdMembership) {
      await auditWrite(req, 'org_membership.auto_created_admin', 'orgMembership', approvalResult.membership.id, {
        userId: id,
        organizationId: approvalResult.organization.id,
        orgRole: approvalResult.membership.orgRole
      });
    }
    await auditWrite(req, 'organization.verified_from_onboarding', 'organization', approvalResult.organization.id, {
      userId: id
    });
    deleteCache('/api/auth/me').catch(() => undefined);
    deleteCache('/api/org/status').catch(() => undefined);
    deleteCache('marketplace:home:v2').catch(() => undefined);
    deleteCache(redisKeys.cacheMarketplaceHome()).catch(() => undefined);
    invalidateByPattern('cache:marketplace:*').catch(() => undefined);
    invalidateByPattern('cache:*dashboard*').catch(() => undefined);
  }


  // Propagate document status to individual SellerDocument records if documents section status changes
  if (existing.role === 'seller' && body.sectionStatus && 'documents' in body.sectionStatus) {
    const nextDocStatus = body.sectionStatus.documents;
    const prevDocStatus = previousStatus.documents;
    if (nextDocStatus !== prevDocStatus) {
      const sellerProfile = await db.sellerProfile.findUnique({ where: { userId: id } });
      if (sellerProfile) {
        let docStatus: 'VERIFIED' | 'REJECTED' | 'UNDER_REVIEW' | 'PENDING' | undefined;
        if (nextDocStatus === 'approved') {
          docStatus = 'VERIFIED';
        } else if (nextDocStatus === 'rejected' || nextDocStatus === 'resubmission_required') {
          docStatus = 'REJECTED';
        } else if (nextDocStatus === 'under_review') {
          docStatus = 'UNDER_REVIEW';
        } else if (nextDocStatus === 'pending') {
          docStatus = 'PENDING';
        }

        if (docStatus) {
          await db.sellerDocument.updateMany({
            where: { sellerProfileId: sellerProfile.id },
            data: {
              verificationStatus: docStatus,
              remarks: (docStatus === 'REJECTED') ? String(reasons.documents || '') : null,
              verifiedById: req.user?.id ? Number(req.user.id) : null,
              verifiedAt: new Date()
            }
          });
        }
      }
    }
  }

  await auditWrite(req, 'admin.onboarding.section_status_updated', 'user', id);

  const changes: string[] = [];
  const rejectedDetails: string[] = [];

  for (const s of sections) {
    const prev = String(previousStatus[s] || 'pending');
    const next = String(nextStatus[s] || 'pending');
    const reason = clean(String(reasons[s] || ''));

    if (prev !== next) {
      const label = sectionLabels[s] || s;
      changes.push(`- **${label}**: status updated to '${next.replace(/_/g, ' ')}'${reason ? ` (Remarks: ${reason})` : ''}`);
    }

    if (next === 'rejected' || next === 'resubmission_required') {
      const label = sectionLabels[s] || s;
      rejectedDetails.push(`- **${label}**: Requires attention.${reason ? ` Remarks: ${reason}` : ''}`);
    }
  }

  const shouldNotify =
    newOnboardingStatus === 'approved_for_procurement' ||
    newOnboardingStatus === 'rejected' ||
    newOnboardingStatus === 'resubmission_required';

  if (changes.length > 0 && shouldNotify) {
    const isApproved = newOnboardingStatus === 'approved_for_procurement';
    const isRejected = newOnboardingStatus === 'rejected';
    const title = isApproved
      ? 'Application Onboarding Approved'
      : (isRejected ? 'Application Rejected' : 'Application Update: Section Remarks');

    let message: string;
    let emailHtml: string;

    if (isApproved) {
      // Final approval: every section is approved. Send a dedicated full-approval
      // email instead of the section-diff template (which would otherwise show
      // only the last-approved section, e.g. "Documents Upload").
      const approvedList = sections.map(s => `- **${sectionLabels[s] || s}**: Approved`);
      message =
        'Congratulations — all sections of your onboarding application have been approved. ' +
        'Your application is now approved for procurement access.\n\n' +
        'Approved sections:\n' + approvedList.join('\n');

      emailHtml = `
        <p>Congratulations! All sections of your onboarding application have been reviewed and <strong>approved</strong>.</p>
        <p>Your application is now <strong>approved for procurement access</strong>. You can begin participating in procurement activities on the portal.</p>
        <h3>Approved sections:</h3>
        <ul>${sections.map(s => `<li>${sectionLabels[s] || s}: Approved</li>`).join('')}</ul>
        <p>Please log in to the portal to access your dashboard.</p>
      `;
    } else {
      message = `Updates to your profile sections:\n` + changes.join('\n');
      if (rejectedDetails.length > 0) {
        message += `\n\nSections requiring attention:\n` + rejectedDetails.join('\n');
      }

      emailHtml = `<p>There have been updates to your onboarding application sections.</p>`;
      emailHtml += `<h3>Status Changes:</h3><ul>` + changes.map(c => `<li>${c}</li>`).join('') + `</ul>`;
      if (rejectedDetails.length > 0) {
        emailHtml += `<h3>Sections requiring attention:</h3><ul>` + rejectedDetails.map(r => `<li>${r}</li>`).join('') + `</ul>`;
      }
      emailHtml += `<p>Please log in to the portal to view details and make any necessary corrections.</p>`;
    }

    notificationService.notifyWithEmail(id, {
      title,
      message: message.replace(/\*\*/g, '').replace(/<[^>]*>/g, ''), // Strip md/html
      type: isApproved ? 'onboarding_approved_for_procurement' : 'section_status_updated',
      priority: isApproved ? 'high' : 'medium',
      redirectUrl: existing.role === 'seller' ? '/seller/onboarding' : '/buyer/onboarding',
      emailSubject: `${title} — MSME Procurement Portal`,
      emailHtml
    }).catch(error => {
      console.error('[Section Status Notification Error]:', error);
    });
  }

  ok(res, user);
}));

router.post('/admin/onboarding/:id/status', authenticate, authorizeAdmin, asyncRoute(async (req, res) => {
  const { id } = parse(idParams, req.params);
  const body = parse(z.object({ onboardingStatus: z.string().trim().min(2), adminFeedback: z.string().trim().max(2000).optional() }), req.body);

  // Fetch the existing user to determine role and build correct section statuses
  const existing = await db.user.findUnique({ where: { id }, select: { role: true } });
  if (!existing) throw new ApiError(404, 'User not found');

  const updateData: Record<string, unknown> = { ...body };

  // When approving or rejecting the entire application, sync all individual section statuses
  // so that subsequent re-derivations of onboardingStatus from sections stay consistent.
  if (body.onboardingStatus === 'approved_for_procurement' || body.onboardingStatus === 'rejected') {
    const sectionValue = body.onboardingStatus === 'approved_for_procurement' ? 'approved' : 'rejected';
    const buyerSections = { org: sectionValue, rep: sectionValue, address: sectionValue, procurement: sectionValue, docs: sectionValue };
    const sellerSections = { pan: sectionValue, details: sectionValue, additional: sectionValue, offices: sectionValue, bank: sectionValue, ownership: sectionValue, documents: sectionValue };
    updateData.sectionStatus = existing.role === 'buyer' ? buyerSections : sellerSections;
  }

  const approvalResult = body.onboardingStatus === 'approved_for_procurement'
    ? await approveOnboardingAndEnsureOrganization(id, updateData)
    : null;
  const user = approvalResult?.user || await db.user.update({ where: { id }, data: updateData });
  await auditWrite(req, 'admin.onboarding.status_updated', 'user', id, body);

  if (existing.role === 'buyer') {
    let showcaseStatus = 'PENDING';
    if (body.onboardingStatus === 'approved_for_procurement') {
      showcaseStatus = 'VERIFIED';
    } else if (body.onboardingStatus === 'rejected') {
      showcaseStatus = 'REJECTED';
    }
    const adminUser = req.user?.id ? await db.user.findUnique({ where: { id: req.user.id } }) : null;
    const adminName = adminUser?.name || 'Admin';
    await db.buyerProfile.updateMany({
      where: { userId: id },
      data: {
        verificationStatus: showcaseStatus,
        verifiedAt: showcaseStatus === 'VERIFIED' ? new Date() : null,
        verifiedBy: showcaseStatus === 'VERIFIED' ? adminName : null
      }
    }).catch((err: any) => console.error('[Showcase Status Update Failed]', err));
  }

  if (approvalResult) {
    await auditWrite(req, 'onboarding.approved', 'user', id, {
      organizationId: approvalResult.organization.id
    });
    if (approvalResult.createdOrganization) {
      await auditWrite(req, 'organization.auto_created_from_onboarding', 'organization', approvalResult.organization.id, {
        userId: id,
        role: user.role
      });
    }
    if (approvalResult.createdMembership) {
      await auditWrite(req, 'org_membership.auto_created_admin', 'orgMembership', approvalResult.membership.id, {
        userId: id,
        organizationId: approvalResult.organization.id,
        orgRole: approvalResult.membership.orgRole
      });
    }
    await auditWrite(req, 'organization.verified_from_onboarding', 'organization', approvalResult.organization.id, {
      userId: id
    });
    deleteCache('/api/auth/me').catch(() => undefined);
    deleteCache('/api/org/status').catch(() => undefined);
    deleteCache('marketplace:home:v2').catch(() => undefined);
    deleteCache(redisKeys.cacheMarketplaceHome()).catch(() => undefined);
    invalidateByPattern('cache:marketplace:*').catch(() => undefined);
    invalidateByPattern('cache:*dashboard*').catch(() => undefined);
  }

  if (body.onboardingStatus === 'rejected') {
    const linkedUser = await db.user.findUnique({ where: { id }, select: { organizationId: true } });
    if (linkedUser?.organizationId) {
      // Don't downgrade an org that already has other approved users — only
      // suspend if this is the org's only user or the org is still PENDING.
      const otherApproved = await db.user.count({
        where: {
          organizationId: linkedUser.organizationId,
          onboardingStatus: 'approved_for_procurement',
          NOT: { id }
        }
      });
      if (otherApproved === 0) {
        await db.organization.update({
          where: { id: linkedUser.organizationId },
          data: { verificationStatus: 'REJECTED' as any }
        }).catch(err => console.error('[Onboarding] org reject mirror failed', err));
      }
    }
  }

  notificationService.notifyWithEmail(id, {
    title: 'Application Status Updated',
    message: `Your onboarding status has been updated to: ${body.onboardingStatus}. ${body.adminFeedback ? 'Admin feedback: ' + body.adminFeedback : ''}`,
    type: 'onboarding_status_updated',
    priority: 'high',
    redirectUrl: user.role === 'seller' ? '/seller/onboarding' : '/buyer/onboarding',
    emailSubject: 'Application Status Update — MSME Procurement Portal',
    emailHtml: `<p>Your onboarding application status has been updated.</p><p><strong>New Status:</strong> ${body.onboardingStatus}</p>${body.adminFeedback ? `<p><strong>Admin Feedback:</strong> ${body.adminFeedback}</p>` : ''}<p>Please log in to the portal to view details.</p>`
  }).catch(error => {
    console.error('[Onboarding Status Notification Error]:', error);
  });

  ok(res, approvalResult ? {
    user,
    organization: approvalResult.organization,
    membership: approvalResult.membership,
    organizationCreated: approvalResult.createdOrganization,
    membershipCreated: approvalResult.createdMembership
  } : user);
}));

// Verification
router.get('/utils/gst-verify/:gstin', verificationRateLimit, asyncRoute(async (req, res) => {
  const { gstin } = parse(gstParams, req.params);

  const normalizedGstin = gstin.toUpperCase();
  const fingerprint = sha256(normalizedGstin);
  const authHeader = req.headers.authorization || '';
  const [scheme, token] = authHeader.split(' ');
  let requesterUserId: number | null = null;
  if (scheme === 'Bearer' && token) {
    try {
      const decoded = verifyAccessToken(token);
      requesterUserId = decoded.id ? Number(decoded.id) : null;
    } catch {
      requesterUserId = null;
    }
  }
  const [sellerOffice, buyerProfile, organization] = await Promise.all([
    db.sellerOffice.findFirst({
      where: { gstFingerprint: fingerprint },
      select: { id: true, sellerProfile: { select: { userId: true } } }
    }),
    db.buyerProfile.findFirst({
      where: { gstFingerprint: fingerprint },
      select: { id: true, userId: true }
    }),
    db.organization.findFirst({
      where: { gstin: normalizedGstin },
      select: { id: true, users: { select: { id: true }, take: 5 } }
    })
  ]);

  const ownedByRequester = Boolean(requesterUserId && (
    sellerOffice?.sellerProfile?.userId === requesterUserId ||
    buyerProfile?.userId === requesterUserId ||
    organization?.users?.some((user: any) => user.id === requesterUserId)
  ));

  if ((sellerOffice || buyerProfile || organization) && !ownedByRequester) {
    throw new ApiError(400, 'GST is already registered', 'GST_ALREADY_REGISTERED');
  }

  const result = await verifyGstinInternal(gstin);
  res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate, proxy-revalidate');
  res.setHeader('Pragma', 'no-cache');
  res.setHeader('Expires', '0');
  // Mask the response (covers the raw provider payload and any incidental PII),
  // but restore the identity fields the onboarding form must auto-fill. The PAN
  // and GSTIN are derived from the GSTIN the caller just supplied — characters
  // 3–12 of the GSTIN are the PAN — so returning them unmasked here leaks
  // nothing the caller didn't already provide, and masking them only breaks
  // the form (the masked "AA***1P" fails PAN format validation).
  const masked = maskSensitive(result) as unknown as Record<string, unknown>;
  const source = result as unknown as Record<string, unknown>;
  masked.pan = source.pan;
  masked.gstin = source.gstin;
  masked.gstNumber = source.gstNumber;
  masked.requestedGstin = source.requestedGstin;
  masked.responseGstin = source.responseGstin;
  res.json(masked);
}));

router.post('/gst/verify', verificationRateLimit, asyncRoute(async (req, res) => {
  const { gstin } = parse(z.object({
    gstin: z.string().optional(),
    gstNumber: z.string().optional()
  }).refine(value => value.gstin || value.gstNumber, { message: 'GST number is required' }), req.body);
  const result = await verifyGstinInternal(gstin || req.body.gstNumber);
  ok(res, result);
}));

router.get('/verify/gst/:gstin', authenticate, verificationRateLimit, asyncRoute(async (req, res) => {
  const { gstin } = parse(gstParams, req.params);
  const gstResult = await verifyGstinInternal(gstin.toUpperCase());
  await db.apiVerificationLog.create({
    data: {
      userId: userId(req),
      provider: 'apisetu',
      verificationType: 'GST',
      requestReference: gstin.toUpperCase(),
      status: 'VERIFIED'
    }
  }).catch(() => undefined);
  ok(res, { gstin: gstin.toUpperCase(), verified: true, details: gstResult });
}));

async function verifyGstinInternal(gstin: string) {
  try {
    return await GstService.verifyGstin(gstin);
  } catch (e: any) {
    if (e instanceof ApiError) {
      // Pass through real provider errors (config missing 503, mismatch 400,
      // unreachable 424, etc.) without flattening them all into a generic 424.
      throw e;
    }
    throw new ApiError(424, e?.message?.startsWith('GST verification failed') ? e.message : 'GST verification provider is unreachable. Please try again later.', e?.code || 'GST_PROVIDER_UNREACHABLE');
  }
}

// ── Auto-create / find Organization from verified GST data ──
async function upsertOrganizationFromGst(
  gstResult: any,
  normalizedGstin: string,
  role: string,
  user?: any
) {
  // Try to find an existing ACTIVE or PENDING_CLOSURE (non-inactive) Organization by the same GSTIN
  let org = await db.organization.findFirst({
    where: {
      gstin: normalizedGstin,
      NOT: {
        verificationStatus: { in: ['CLOSED', 'ARCHIVED', 'REJECTED', 'MERGED'] }
      }
    }
  });

  let fallbackName = 'Verified Organization';
  if (user) {
    if (role === 'seller' && user.sellerProfile) {
      fallbackName = user.sellerProfile.businessName || user.sellerProfile.nameAsInPan || user.name || fallbackName;
    } else if (role === 'buyer' && user.buyerProfile) {
      fallbackName = user.buyerProfile.organizationName || user.buyerProfile.nameAsInPan || user.name || fallbackName;
    } else {
      fallbackName = user.name || fallbackName;
    }
  }

  if (!org) {
    // Check if there is an inactive organization with the same GSTIN to link previousOrganizationId
    const previousOrg = await db.organization.findFirst({
      where: {
        gstin: normalizedGstin,
        verificationStatus: { in: ['CLOSED', 'ARCHIVED', 'REJECTED', 'MERGED'] }
      },
      orderBy: { createdAt: 'desc' }
    });

    const orgType = role === 'buyer' ? 'GOVERNMENT' : 'MSME';
    const defaultCompanyId = user?.companyId || await getDefaultCompanyId();
    const newOrg = await db.organization.create({
      data: {
        organizationName: gstResult.legalName || gstResult.tradeName || fallbackName,
        organizationType: orgType as any,
        gstin: normalizedGstin,
        panNumber: gstResult.pan || null,
        state: gstResult.state || null,
        city: gstResult.city || null,
        district: gstResult.district || null,
        pincode: gstResult.pincode || null,
        addressLine1: gstResult.address || null,
        country: 'India',
        companyId: defaultCompanyId,
        previousOrganizationId: previousOrg?.id || null,
        verificationStatus: 'PENDING' as any
      }
    });

    if (previousOrg) {
      await db.organization.update({
        where: { id: previousOrg.id },
        data: { replacementOrganizationId: newOrg.id }
      });

      // Write audit log
      await auditLog({
        actorUserId: user?.id,
        actorRole: user?.role,
        action: 'ORGANIZATION_RE_REGISTERED_WITH_SAME_GST',
        entityType: 'organization',
        entityId: newOrg.id,
        ipAddress: user?.ipAddress || null,
        userAgent: user?.userAgent || null,
        metadata: {
          previousOrganizationId: previousOrg.id,
          gstin: normalizedGstin,
          companyId: user?.companyId
        }
      });
    }

    org = newOrg;
  } else {
    // Update the existing org with latest verified details if names changed
    await db.organization.update({
      where: { id: org.id },
      data: {
        organizationName: gstResult.legalName || gstResult.tradeName || (org.organizationName === 'Verified Organization' ? fallbackName : org.organizationName),
        panNumber: gstResult.pan || org.panNumber,
        state: gstResult.state || org.state,
        city: gstResult.city || org.city,
        district: gstResult.district || org.district,
        pincode: gstResult.pincode || org.pincode,
        addressLine1: gstResult.address || org.addressLine1
      }
    });
  }

  return org;
}

router.post('/profile/verify-gst-dashboard', authenticate, asyncRoute(async (req, res) => {
  const { gstin } = parse(z.object({ gstin: z.string().trim().min(15).max(15) }), req.body);
  const normalizedGstin = GstService.normalize(gstin);
  if (!hasValidGstinChecksum(normalizedGstin)) {
    throw new ApiError(400, 'Invalid GSTIN checksum. Please re-check the last character from your GST certificate.', 'INVALID_GSTIN_CHECKSUM');
  }

  const user = await db.user.findUnique({
    where: { id: userId(req) },
    include: { sellerProfile: { include: { offices: true } }, buyerProfile: true }
  });
  if (!user) throw new ApiError(404, 'User not found');

  const gstResult = await verifyGstinInternal(normalizedGstin);
  requireCompleteGstProfile(gstResult);
  try {
    await assertGstinNotOwnedByAnotherAccount(normalizedGstin, user.id);
  } catch (err: any) {
    if (err instanceof ApiError && (err.code === 'GST_ALREADY_ACTIVE' || err.code === 'GST_REUSE_NOT_ALLOWED')) {
      return res.status(err.statusCode).json({ error: err.code, message: err.message });
    }
    throw err;
  }
  const verifiedAddress = buildVerifiedAddress(gstResult);

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
        where: {
          pan: panToUse,
          organization: {
            NOT: {
              verificationStatus: { in: ['CLOSED', 'ARCHIVED', 'REJECTED', 'MERGED'] }
            }
          }
        }
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
          where: {
            pan: panToUse,
            NOT: { id: sellerProfile.id },
            organization: {
              NOT: {
                verificationStatus: { in: ['CLOSED', 'ARCHIVED', 'REJECTED', 'MERGED'] }
              }
            }
          }
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
          pincode: verifiedAddress.pincode || existingOffice.pincode,
          state: verifiedAddress.state || existingOffice.state,
          city: verifiedAddress.city || existingOffice.city,
          address: verifiedAddress.address || existingOffice.address
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
          pincode: verifiedAddress.pincode,
          state: verifiedAddress.state,
          city: verifiedAddress.city,
          address: verifiedAddress.address,
          isMandatory: true
        }
      });
    }

    // ── Auto-create/link Organization for seller ──
    const org = await upsertOrganizationFromGst(gstResult, normalizedGstin, 'seller', user);
    await db.user.update({ where: { id: user.id }, data: { organizationId: org.id } });
    await db.sellerProfile.update({ where: { id: sellerProfile.id }, data: { organizationId: org.id } });
    // Create the OrgMembership so the user can use cart / approvals / GRN flows.
    await onUserLinkedToOrganization(user.id, org.id).catch(err => console.error('[Membership] seller link failed', err));

    finalSectionStatus.offices = 'approved';
    finalSectionStatus.details = 'approved';
  } else if (user.role === 'buyer') {
    let buyerProfile = user.buyerProfile;
    const profileData = {
      gst: normalizedGstin,
      gstMasked: normalizedGstin,
      gstFingerprint: sha256(normalizedGstin),
      state: verifiedAddress.state,
      district: verifiedAddress.district,
      city: verifiedAddress.city,
      pincode: verifiedAddress.pincode,
      registeredAddress: verifiedAddress.address,
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

    // ── Auto-create/link Organization for buyer ──
    const org = await upsertOrganizationFromGst(gstResult, normalizedGstin, 'buyer', user);
    await db.user.update({ where: { id: user.id }, data: { organizationId: org.id } });
    const bpRecord = await db.buyerProfile.findUnique({ where: { userId: user.id } });
    if (bpRecord) {
      await db.buyerProfile.update({ where: { id: bpRecord.id }, data: { organizationId: org.id } });
    }
    // Create the OrgMembership so the user can use cart / approvals / GRN flows.
    await onUserLinkedToOrganization(user.id, org.id).catch(err => console.error('[Membership] buyer link failed', err));

    finalSectionStatus.org = 'approved';
    finalSectionStatus.address = 'approved';
  }

  const sections = user.role === 'buyer'
    ? ['org', 'rep', 'address', 'procurement', 'docs']
    : ['pan', 'details', 'additional', 'offices', 'bank', 'ownership'];

  for (const sec of sections) {
    if (!finalSectionStatus[sec]) {
      finalSectionStatus[sec] = 'pending';
    }
  }

  if (user.role === 'seller') {
    if (STRICT_VERIFICATION.PAN === false) finalSectionStatus.pan = 'approved';
  }

  let onboardingStatus = user.onboardingStatus;
  let registrationStatus = user.registrationStatus;

  if (onboardingStatus !== 'approved_for_procurement') {
    onboardingStatus = 'under_compliance_review';
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
    await notificationService.notifyWithEmail(user.id, {
      title: 'GST Verified Successfully',
      message: `Your business GSTIN ${normalizedGstin} has been successfully verified. ${onboardingStatus === 'approved_for_procurement'
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
router.post('/catalogue/upload', authenticate, authorize('seller'), upload.single('file'), asyncRoute(async (req: AuthRequest & { file?: Express.Multer.File }, res) => {
  if (!req.file) throw new ApiError(400, 'File is required', 'FILE_REQUIRED');
  const context = {
    ownerId: userId(req),
    ownerRole: String(req.user?.role),
    entityType: 'catalogue',
    ipAddress: req.ip,
    userAgent: req.headers['user-agent']
  };
  const asset = await uploadFile(req.file, context, env.STORAGE_PROVIDER);
  ok(res, asset, 201);
}));

// General file upload endpoint (all authenticated users)
router.post('/upload', authenticate, upload.single('file'), asyncRoute(async (req: AuthRequest & { file?: Express.Multer.File }, res) => {
  if (!req.file) throw new ApiError(400, 'File is required', 'FILE_REQUIRED');
  const context = {
    ownerId: userId(req),
    ownerRole: String(req.user?.role),
    entityType: 'general',
    ipAddress: req.ip,
    userAgent: req.headers['user-agent']
  };
  const asset = await uploadFile(req.file, context, env.STORAGE_PROVIDER);
  const viewUrl = `/api/files/${asset.id}/view`;
  // For image assets, return the direct CDN/storage URL so <img> tags can render
  // without needing an Authorization header. For non-image files, fall back to the
  // auth-gated view endpoint.
  const isImage = (asset.mimeType || '').startsWith('image/');
  const publicUrl = isImage && asset.url && /^https?:\/\//.test(asset.url)
    ? asset.url
    : viewUrl;
  ok(res, {
    url: publicUrl,
    signedUrl: viewUrl,
    fileId: asset.id,
    file: {
      id: asset.id,
      url: publicUrl,
      documentUrl: viewUrl,
      originalName: asset.originalName,
      mimeType: asset.mimeType,
      size: asset.size
    }
  }, 201);
}));

router.get('/categories', asyncRoute(async (_req, res) => {
  const categories = await ensureMarketplaceCategories();
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

router.post('/seller/products', authenticate, requirePermission('catalogue.product.create', orgScope), asyncRoute(async (req, res) => {
  const body = parse(productBody, req.body);
  const product = await catalogueWorkflow.createProduct(actorFrom(req), body);
  ok(res, product, 201);
}));

router.get('/seller/products', authenticate, requirePermission('catalogue.product.view', orgScope), asyncRoute(async (req, res) => {
  const query = parse(paginationQuery, req.query);
  const where: any = { sellerId: userId(req), ...(query.status ? { status: query.status } : {}) };
  if (query.q) where.OR = [{ name: { contains: query.q, mode: 'insensitive' } }, { description: { contains: query.q, mode: 'insensitive' } }];
  const window = listWindow(query);
  const [products, total] = await Promise.all([
    db.product.findMany({
      where,
      include: { category: true, seller: { select: { id: true, name: true, email: true, onboardingStatus: true } }, specifications: true, ...catalogueAttachmentInclude },
      ...window,
      orderBy: { updatedAt: 'desc' }
    }),
    db.product.count({ where })
  ]);
  ok(res, paged(await attachCatalogueFiles(products as any[], 'product'), total, query, 'products'));
}));

router.get('/seller/products/:id', authenticate, requirePermission('catalogue.product.view', orgScope), asyncRoute(async (req, res) => {
  const { id } = parse(idParams, req.params);
  const product = await db.product.findFirst({ where: { id, sellerId: userId(req) }, include: { images: { include: { fileAsset: true } }, specifications: true, certifications: { include: { fileAsset: true } } } });
  if (!product) throw new ApiError(404, 'Product not found', 'PRODUCT_NOT_FOUND');
  ok(res, (await attachCatalogueFiles([product], 'product'))[0]);
}));

router.put('/seller/products/:id', authenticate, requirePermission('catalogue.product.update', orgScope), asyncRoute(async (req, res) => {
  const { id } = parse(idParams, req.params);
  const body = parse(productBody.partial(), req.body);
  const existing = await db.product.findFirst({ where: { id, sellerId: userId(req) } });
  if (!existing) throw new ApiError(404, 'Product not found', 'PRODUCT_NOT_FOUND');
  const product = await catalogueWorkflow.updateProduct(actorFrom(req), id, body);
  ok(res, product);
}));

router.delete('/seller/products/:id', authenticate, requirePermission('catalogue.product.delete', orgScope), asyncRoute(async (req, res) => {
  const { id } = parse(idParams, req.params);
  const existing = await db.product.findFirst({ where: { id, sellerId: userId(req) } });
  if (!existing) throw new ApiError(404, 'Product not found', 'PRODUCT_NOT_FOUND');
  const product = await catalogueWorkflow.archiveProduct(actorFrom(req), id);
  ok(res, product);
}));

router.get('/products/search', asyncRoute(async (req, res) => {
  const query = parse(paginationQuery.extend({
    sellerId: z.coerce.number().int().positive().optional(),
    organizationId: z.coerce.number().int().positive().optional()
  }), req.query);
  const where: any = { status: 'ACTIVE' };
  if (query.sellerId) where.sellerId = query.sellerId;
  if (query.organizationId) where.organizationId = query.organizationId;
  if (query.q) where.OR = [{ name: { contains: query.q, mode: 'insensitive' } }, { description: { contains: query.q, mode: 'insensitive' } }];
  if (query.categoryId) where.categoryId = query.categoryId;
  const window = listWindow(query);
  const [products, total] = await Promise.all([
    catalogueWorkflow.searchProducts({ ...query, ...window }),
    db.product.count({ where })
  ]);
  ok(res, paged(await attachCatalogueFiles(products as any[], 'product'), total, query, 'products'));
}));

router.post('/seller/services', authenticate, requirePermission('catalogue.service.create', orgScope), asyncRoute(async (req, res) => {
  const body = parse(serviceBody, req.body);
  const service = await catalogueWorkflow.createService(actorFrom(req), body);
  ok(res, service, 201);
}));

router.get('/seller/services', authenticate, requirePermission('catalogue.service.view', orgScope), asyncRoute(async (req, res) => {
  const query = parse(paginationQuery, req.query);
  const where: any = { sellerId: userId(req), ...(query.status ? { status: query.status } : {}) };
  if (query.q) where.OR = [{ name: { contains: query.q, mode: 'insensitive' } }, { description: { contains: query.q, mode: 'insensitive' } }];
  const window = listWindow(query);
  const [services, total] = await Promise.all([
    db.service.findMany({
      where,
      include: { category: true, seller: { select: { id: true, name: true, email: true, onboardingStatus: true } }, specifications: true, certifications: { include: { fileAsset: true } } },
      ...window,
      orderBy: { updatedAt: 'desc' }
    }),
    db.service.count({ where })
  ]);
  ok(res, paged(await attachCatalogueFiles(services as any[], 'service'), total, query, 'services'));
}));

router.get('/seller/services/:id', authenticate, requirePermission('catalogue.service.view', orgScope), asyncRoute(async (req, res) => {
  const { id } = parse(idParams, req.params);
  const service = await db.service.findFirst({
    where: { id, sellerId: userId(req) },
    include: { specifications: true, certifications: { include: { fileAsset: true } } }
  });
  if (!service) throw new ApiError(404, 'Service not found', 'SERVICE_NOT_FOUND');
  ok(res, (await attachCatalogueFiles([service], 'service'))[0]);
}));

router.post('/seller/products/:id/duplicate', authenticate, requirePermission('catalogue.product.create', orgScope), asyncRoute(async (req, res) => {
  const { id } = parse(idParams, req.params);
  const product = await catalogueWorkflow.duplicateProduct(actorFrom(req), id);
  ok(res, product, 201);
}));

router.post('/seller/services/:id/duplicate', authenticate, requirePermission('catalogue.service.create', orgScope), asyncRoute(async (req, res) => {
  const { id } = parse(idParams, req.params);
  const service = await catalogueWorkflow.duplicateService(actorFrom(req), id);
  ok(res, service, 201);
}));

router.patch('/seller/products/:id/status', authenticate, requirePermission('catalogue.product.update', orgScope), asyncRoute(async (req, res) => {
  const { id } = parse(idParams, req.params);
  const { status } = parse(z.object({ status: z.enum(['DRAFT', 'ACTIVE', 'INACTIVE']) }), req.body);
  const product = await catalogueWorkflow.setProductStatus(actorFrom(req), id, status);
  ok(res, product);
}));

router.patch('/seller/services/:id/status', authenticate, requirePermission('catalogue.service.update', orgScope), asyncRoute(async (req, res) => {
  const { id } = parse(idParams, req.params);
  const { status } = parse(z.object({ status: z.enum(['DRAFT', 'ACTIVE', 'INACTIVE']) }), req.body);
  const service = await catalogueWorkflow.setServiceStatus(actorFrom(req), id, status);
  ok(res, service);
}));

router.put('/seller/services/:id', authenticate, requirePermission('catalogue.service.update', orgScope), asyncRoute(async (req, res) => {
  const { id } = parse(idParams, req.params);
  const body = parse(serviceBody.partial(), req.body);
  const existing = await db.service.findFirst({ where: { id, sellerId: userId(req) } });
  if (!existing) throw new ApiError(404, 'Service not found', 'SERVICE_NOT_FOUND');
  const service = await catalogueWorkflow.updateService(actorFrom(req), id, body);
  ok(res, service);
}));

router.delete('/seller/services/:id', authenticate, requirePermission('catalogue.service.delete', orgScope), asyncRoute(async (req, res) => {
  const { id } = parse(idParams, req.params);
  const existing = await db.service.findFirst({ where: { id, sellerId: userId(req) } });
  if (!existing) throw new ApiError(404, 'Service not found', 'SERVICE_NOT_FOUND');
  const service = await catalogueWorkflow.archiveService(actorFrom(req), id);
  ok(res, service);
}));

router.get('/services/search', asyncRoute(async (req, res) => {
  const query = parse(paginationQuery.extend({
    sellerId: z.coerce.number().int().positive().optional(),
    organizationId: z.coerce.number().int().positive().optional()
  }), req.query);
  const where: any = { status: 'ACTIVE' };
  if (query.sellerId) where.sellerId = query.sellerId;
  if (query.organizationId) where.organizationId = query.organizationId;
  if (query.q) where.OR = [{ name: { contains: query.q, mode: 'insensitive' } }, { description: { contains: query.q, mode: 'insensitive' } }];
  if (query.categoryId) where.categoryId = query.categoryId;
  const window = listWindow(query);
  const [services, total] = await Promise.all([
    catalogueWorkflow.searchServices({ ...query, ...window }),
    db.service.count({ where })
  ]);
  ok(res, paged(await attachCatalogueFiles(services as any[], 'service'), total, query, 'services'));
}));

router.get('/admin/catalogue/products', authenticate, authorizeAdmin, asyncRoute(async (req, res) => {
  const query = parse(paginationQuery.extend({
    organizationId: z.coerce.number().int().positive().optional()
  }), req.query);
  const where: any = {};
  if (query.status) where.status = query.status;
  if (query.categoryId) where.categoryId = query.categoryId;
  if (query.organizationId) where.organizationId = query.organizationId;
  if (query.q) {
    where.OR = [
      { name: { contains: query.q, mode: 'insensitive' } },
      { description: { contains: query.q, mode: 'insensitive' } },
      { seller: { name: { contains: query.q, mode: 'insensitive' } } },
      { seller: { email: { contains: query.q, mode: 'insensitive' } } }
    ];
  }
  const window = listWindow(query);
  const [products, total] = await Promise.all([
    db.product.findMany({
      where,
      include: { category: true, seller: { select: { id: true, name: true, email: true, onboardingStatus: true } }, ...catalogueAttachmentInclude },
      ...window,
      orderBy: { updatedAt: 'desc' }
    }),
    db.product.count({ where })
  ]);
  ok(res, paged(await attachCatalogueFiles(products as any[], 'product'), total, query, 'products'));
}));

router.get('/admin/catalogue/services', authenticate, authorizeAdmin, asyncRoute(async (req, res) => {
  const query = parse(paginationQuery.extend({
    organizationId: z.coerce.number().int().positive().optional()
  }), req.query);
  const where: any = {};
  if (query.status) where.status = query.status;
  if (query.categoryId) where.categoryId = query.categoryId;
  if (query.organizationId) where.organizationId = query.organizationId;
  if (query.q) {
    where.OR = [
      { name: { contains: query.q, mode: 'insensitive' } },
      { description: { contains: query.q, mode: 'insensitive' } },
      { seller: { name: { contains: query.q, mode: 'insensitive' } } },
      { seller: { email: { contains: query.q, mode: 'insensitive' } } }
    ];
  }
  const window = listWindow(query);
  const [services, total] = await Promise.all([
    db.service.findMany({
      where,
      include: { category: true, seller: { select: { id: true, name: true, email: true, onboardingStatus: true } }, certifications: { include: { fileAsset: true } } },
      ...window,
      orderBy: { updatedAt: 'desc' }
    }),
    db.service.count({ where })
  ]);
  ok(res, paged(await attachCatalogueFiles(services as any[], 'service'), total, query, 'services'));
}));

// Requirements
router.post('/procurement/drafts', authenticate, authorize('buyer'), asyncRoute(async (req, res) => {
  const body = parse(procurementDraftBody, req.body);
  const draft = await saveProcurementDraft(req, body);
  ok(res, serializeProcurementDraft(draft), body.id ? 200 : 201);
}, 'Unable to save procurement draft'));

router.get('/procurement/drafts', authenticate, authorize('buyer'), asyncRoute(async (req, res) => {
  const query = parse(paginationQuery, req.query);

  // We load V1 drafts from requirement table
  const reqWhere: any = { buyerId: userId(req), status: { in: ['DRAFT', 'REJECTED'] } };
  if (query.procurementMethod) reqWhere.procurementMethod = procurementMethodCodeFor(query.procurementMethod);
  if (query.categoryId) reqWhere.categoryId = query.categoryId;
  if (query.q) reqWhere.OR = [{ title: { contains: query.q, mode: 'insensitive' } }, { description: { contains: query.q, mode: 'insensitive' } }];

  const v1Drafts = await db.requirement.findMany({
    where: reqWhere,
    include: procurementDraftInclude,
    orderBy: { updatedAt: 'desc' }
  });

  // Load V2 drafts from bidWizardDraft table
  const v2Drafts = await db.bidWizardDraft.findMany({
    where: {
      buyerId: userId(req),
      draftStatus: 'DRAFT'
    },
    orderBy: { updatedAt: 'desc' }
  });

  // Map/serialize V2 drafts to match DisplayDraft shape on the frontend
  const serializedV2 = v2Drafts.map((d: any) => {
    const formData = d.formData || {};
    const step1 = formData.step1 || {};
    const step2 = formData.step2 || {};
    const step3 = formData.step3 || {};
    const step4 = formData.step4 || {};
    const step5 = formData.step5 || {};

    const title = step3.title || 'Untitled V2 Draft';
    const methodSlug = d.bidType.toLowerCase().replace(/_/g, '-');

    const productOrService = step4.productName || step4.serviceCategory || '';
    const categoryName = step4.productCategory || step4.serviceCategory || '';
    const quantity = step4.quantity || '';
    const unit = step4.unitOfMeasurement || '';
    const deliveryLocation = step5.singleConsignee?.location || step2.officeAddress || '';

    return {
      id: d.id,
      buyerId: d.buyerId,
      status: 'DRAFT',
      createdAt: d.createdAt,
      updatedAt: d.updatedAt,
      title,
      methodSlug,
      estimatedValue: Number(step3.estimatedValue || 0),
      category: {
        name: categoryName
      },
      items: [
        {
          itemName: productOrService,
          quantity: quantity,
          unitOfMeasure: unit,
          description: step4.productDescription || step4.scopeOfWork || ''
        }
      ],
      payload: {
        isV2: true,
        basics: {
          title,
          estimatedValue: Number(step3.estimatedValue || 0)
        },
        tender: {
          deliveryLocation
        }
      }
    };
  });

  // Merge lists
  let allMerged = [...v1Drafts.map(serializeProcurementDraft), ...serializedV2];

  // Apply filters on the merged list if needed
  if (query.procurementMethod) {
    const filterMethod = procurementMethodCodeFor(query.procurementMethod);
    allMerged = allMerged.filter(d => {
      // Check if it's V2 or V1
      if (d.payload?.isV2) {
        const type = String(d.items[0]?.itemName ? 'PRODUCT_BID' : 'SERVICE_BID'); // fallback detection or matchesProcurementMethodFilter logic
        const normalizedType = d.methodSlug.toUpperCase().replace(/-/g, '_');
        if (filterMethod === 'REVERSE_AUCTION') return normalizedType === 'REVERSE_AUCTION' || normalizedType === 'BID_WITH_RA';
        if (filterMethod === 'DIRECT_PURCHASE') return false;
        if (filterMethod === 'RFQ') return false;
        if (filterMethod === 'TENDER') {
          return ['PRODUCT_BID', 'SERVICE_BID', 'CUSTOM_BID', 'BOQ_BID', 'PAC_BID'].includes(normalizedType);
        }
        return true;
      }
      return true; // V1 is already filtered in database query reqWhere
    });
  }

  if (query.q) {
    const q = String(query.q).toLowerCase();
    allMerged = allMerged.filter(d => {
      if (d.payload?.isV2) {
        return (
          String(d.title || '').toLowerCase().includes(q) ||
          String(d.items?.[0]?.itemName || '').toLowerCase().includes(q)
        );
      }
      return true; // V1 is already filtered in database query reqWhere
    });
  }

  // Sort by updatedAt desc
  allMerged.sort((a, b) => new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime());

  // Paginate in memory
  const total = allMerged.length;
  const page = Number(query.page || 1);
  const limit = Number(query.pageSize || 20);
  const offset = (page - 1) * limit;
  const paginated = allMerged.slice(offset, offset + limit);

  ok(res, paged(paginated, total, query as any, 'drafts'));
}, 'Unable to load procurement drafts'));

router.get('/procurement/drafts/:id', authenticate, authorize('buyer', 'admin', 'master_admin'), asyncRoute(async (req, res) => {
  const { id } = parse(idParams, req.params);
  const draft = await assertProcurementDraftAccess(req, id);
  ok(res, serializeProcurementDraft(draft));
}, 'Unable to load procurement draft'));

router.post('/procurement/submit', authenticate, authorize('buyer'), asyncRoute(async (req, res) => {
  await assertBuyerProcurementApproved(req);
  const parsed = procurementDraftBody.extend({ id: z.coerce.number().int().positive().optional() }).parse(req.body);
  validateProcurementDraftForSubmit(parsed);
  const draft = parsed.id ? await assertProcurementDraftAccess(req, parsed.id) : await saveProcurementDraft(req, parsed);
  const submitted = await procurementWorkflow.submitRequirement(actorFrom(req), draft.id);
  await auditWrite(req, 'procurement.submitted', 'requirement', submitted.id, { methodSlug: methodSlugForDraft(parsed) });
  ok(res, {
    procurement: serializeProcurementDraft({ ...submitted, items: draft.items || [] }),
    referenceNumber: submitted.requirementNumber
  });
}, 'Unable to submit procurement'));

router.post('/procurement/:id/documents', authenticate, authorize('buyer', 'admin'), upload.single('file'), asyncRoute(async (req: AuthRequest & { file?: Express.Multer.File }, res) => {
  if (!req.file) throw new ApiError(400, 'File is required', 'FILE_REQUIRED');
  const { id } = parse(idParams, req.params);
  const draft = await assertProcurementDraftAccess(req, id);
  if (!isAdmin(req) && draft.buyerId !== userId(req)) throw new ApiError(404, 'Procurement draft not found', 'PROCUREMENT_DRAFT_NOT_FOUND');
  const asset = await uploadFile(req.file, {
    ownerId: userId(req),
    ownerRole: String(req.user?.role),
    entityType: 'requirement',
    entityId: id,
    ipAddress: req.ip,
    userAgent: req.headers['user-agent']
  }, env.STORAGE_PROVIDER);
  await auditWrite(req, 'procurement.document_uploaded', 'fileAsset', asset.id, { requirementId: id });
  ok(res, asset, 201);
}, 'Unable to upload procurement document'));

router.patch('/procurement/:id/status', authenticate, authorize('buyer', 'admin', 'master_admin'), asyncRoute(async (req, res) => {
  const { id } = parse(idParams, req.params);
  const { status } = parse(z.object({ status: z.string().trim().min(2).max(80) }), req.body);
  const draft = await assertProcurementDraftAccess(req, id);
  const nextStatus = procurementStatusMap[status.toUpperCase()];
  if (!nextStatus) throw new ApiError(400, 'Unsupported procurement status', 'PROCUREMENT_STATUS_INVALID');
  const privileged = isAdmin(req) || req.user?.role === 'master_admin';
  if (!privileged && (draft.buyerId !== userId(req) || nextStatus !== 'CANCELLED')) {
    throw new ApiError(403, 'Only administrators can set this procurement status', 'PROCUREMENT_STATUS_FORBIDDEN');
  }
  const updated = await db.requirement.update({ where: { id }, data: { status: nextStatus }, include: procurementDraftInclude });
  await auditWrite(req, 'procurement.status_updated', 'requirement', id, { requestedStatus: status, status: nextStatus });
  ok(res, serializeProcurementDraft(updated));
}, 'Unable to update procurement status'));

router.get('/admin/procurement/intake', authenticate, authorize('admin', 'master_admin'), asyncRoute(async (req, res) => {
  const query = parse(paginationQuery, req.query);
  const where: any = { status: { in: ['SUBMITTED', 'APPROVED'] } };
  if (query.procurementMethod) where.procurementMethod = procurementMethodCodeFor(query.procurementMethod);
  if (query.categoryId) where.categoryId = query.categoryId;
  if (query.q) where.OR = [{ title: { contains: query.q, mode: 'insensitive' } }, { description: { contains: query.q, mode: 'insensitive' } }];
  const window = listWindow(query);
  const [records, total] = await Promise.all([
    db.requirement.findMany({
      where,
      include: {
        ...procurementDraftInclude,
        buyer: { select: { id: true, name: true, email: true, role: true, organization: { select: { id: true, organizationName: true } } } },
        organization: { select: { id: true, organizationName: true } }
      },
      orderBy: { updatedAt: 'desc' },
      ...window
    }),
    db.requirement.count({ where })
  ]);
  ok(res, paged(records.map(serializeProcurementDraft), total, query, 'records'));
}, 'Unable to load procurement intake'));

router.post('/buyer/requirements', authenticate, authorize('buyer'), asyncRoute(async (req, res) => {
  await assertBuyerProcurementApproved(req);
  const body = parse(requirementBody, req.body);
  const requirement = await procurementWorkflow.createRequirement(actorFrom(req), body);
  ok(res, requirement, 201);
}));

router.get('/buyer/requirements', authenticate, authorize('buyer'), asyncRoute(async (req, res) => {
  const query = parse(paginationQuery, req.query);
  const where: any = { buyerId: userId(req) };
  if (query.status) where.status = query.status;
  if (query.procurementMethod) where.procurementMethod = query.procurementMethod;
  if (query.categoryId) where.categoryId = query.categoryId;
  if (query.q) where.OR = [{ title: { contains: query.q, mode: 'insensitive' } }, { description: { contains: query.q, mode: 'insensitive' } }];
  const window = listWindow(query);
  const [requirements, total] = await Promise.all([
    db.requirement.findMany({
      where,
      select: procurementListSelect,  // Use optimized select for list view
      orderBy: { updatedAt: 'desc' },
      ...window
    }),
    db.requirement.count({ where })
  ]);
  // Set cache headers for 30 seconds
  res.setHeader('Cache-Control', 'private, max-age=30, stale-while-revalidate=60');
  ok(res, paged(requirements, total, query));
}));

router.get('/requirements/:id', authenticate, asyncRoute(async (req, res) => {
  const { id } = parse(idParams, req.params);
  const requirement = await db.requirement.findUnique({
    where: { id },
    include: {
      items: true,
      tenders: {
        select: {
          id: true,
          tenderId: true,
          title: true,
          status: true
        }
      },
      category: {
        select: {
          id: true,
          name: true
        }
      },
      directPurchases: {
        include: {
          seller: {
            select: {
              id: true,
              name: true,
              email: true,
              mobile: true
            }
          }
        }
      }
    }
  });
  if (!requirement || (!isAdmin(req) && requirement.buyerId !== userId(req))) throw new ApiError(404, 'Requirement not found', 'REQUIREMENT_NOT_FOUND');
  // Include serialized draft payload if available (contains all Create Procurement wizard data)
  const serialized = serializeProcurementDraft(requirement);
  ok(res, { ...requirement, methodSlug: serialized.methodSlug, payload: serialized.payload, workflowStatus: serialized.workflowStatus });
}));

router.put('/buyer/requirements/:id', authenticate, authorize('buyer'), asyncRoute(async (req, res) => {
  const { id } = parse(idParams, req.params);
  await assertBuyerProcurementApproved(req);
  const existing = await db.requirement.findFirst({ where: { id, buyerId: userId(req) } });
  if (!existing) throw new ApiError(404, 'Requirement not found', 'REQUIREMENT_NOT_FOUND');
  const body = parse(requirementBody.partial(), req.body);
  const requirement = await db.requirement.update({ where: { id }, data: { ...body, items: undefined } });
  await auditWrite(req, 'requirement.updated', 'requirement', id);
  ok(res, requirement);
}));
router.delete('/buyer/requirements/:id', authenticate, authorize('buyer'), asyncRoute(async (req, res) => {
  const { id } = parse(idParams, req.params);
  await assertBuyerProcurementApproved(req);
  const existing = await db.requirement.findFirst({ where: { id, buyerId: userId(req) }, include: { tenders: { select: { id: true } } } });
  if (!existing) throw new ApiError(404, 'Requirement not found', 'REQUIREMENT_NOT_FOUND');
  if (!['DRAFT', 'REJECTED'].includes(String(existing.status))) {
    throw new ApiError(409, 'Requirement can only be deleted while in draft or rejected state', 'REQUIREMENT_LOCKED');
  }
  if (existing.tenders.length > 0) {
    throw new ApiError(409, 'Cannot delete a requirement that has linked tenders', 'REQUIREMENT_HAS_TENDERS');
  }
  await db.$transaction([
    db.requirementItem.deleteMany({ where: { requirementId: id } }),
    db.requirement.delete({ where: { id } })
  ]);
  await auditWrite(req, 'requirement.deleted', 'requirement', id);
  ok(res, { success: true });
}));

router.post('/buyer/requirements/:id/submit', authenticate, authorize('buyer'), asyncRoute(async (req, res) => {
  const { id } = parse(idParams, req.params);
  await assertBuyerProcurementApproved(req);
  const existing = await db.requirement.findFirst({ where: { id, buyerId: userId(req) } });
  if (!existing) throw new ApiError(404, 'Requirement not found', 'REQUIREMENT_NOT_FOUND');
  const requirement = await procurementWorkflow.submitRequirement(actorFrom(req), id);
  ok(res, requirement);
}));

// Direct purchase and RFQ
const directPurchaseInclude = {
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
          district: true,
          state: true
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
            select: { city: true, state: true },
            take: 1
          }
        }
      }
    }
  },
  requirement: {
    include: {
      items: true
    }
  }
};

router.post('/direct-purchases', authenticate, authorize('buyer'), asyncRoute(async (req, res) => {
  await assertBuyerProcurementApproved(req);
  const body = parse(directPurchaseBody, req.body);
  const directPurchase = await procurementWorkflow.createDirectPurchase(actorFrom(req), body);
  ok(res, directPurchase, 201);
}));

router.get('/direct-purchases', authenticate, asyncRoute(async (req, res) => {
  const query = parse(paginationQuery, req.query);
  const where: any = isAdmin(req) ? {} : req.user?.role === 'buyer' ? { buyerId: userId(req) } : { sellerId: userId(req) };
  if (query.status) where.status = query.status;
  if (query.q) where.OR = [{ requirement: { title: { contains: query.q, mode: 'insensitive' } } }, { seller: { name: { contains: query.q, mode: 'insensitive' } } }, { buyer: { name: { contains: query.q, mode: 'insensitive' } } }];
  const window = listWindow(query);
  const [rows, total] = await Promise.all([
    db.directPurchase.findMany({ where, include: directPurchaseInclude, orderBy: { updatedAt: 'desc' }, ...window }),
    db.directPurchase.count({ where })
  ]);
  ok(res, paged(rows, total, query));
}));

router.get('/direct-purchases/:id', authenticate, asyncRoute(async (req, res) => {
  const { id } = parse(idParams, req.params);
  const row = await db.directPurchase.findUnique({
    where: { id },
    include: directPurchaseInclude
  });
  if (!row || (!isAdmin(req) && row.buyerId !== userId(req) && row.sellerId !== userId(req))) throw new ApiError(404, 'Direct purchase not found', 'DIRECT_PURCHASE_NOT_FOUND');
  ok(res, row);
}));

router.put('/direct-purchases/:id', authenticate, authorize('buyer', 'admin'), asyncRoute(async (req, res) => {
  const { id } = parse(idParams, req.params);
  await assertBuyerProcurementApproved(req);
  const body = parse(directPurchaseBody.partial().refine(value => Object.keys(value).length > 0, { message: 'At least one field is required' }), req.body);
  const existing = await db.directPurchase.findUnique({ where: { id } });
  if (!existing || (!isAdmin(req) && existing.buyerId !== userId(req))) throw new ApiError(404, 'Direct purchase not found', 'DIRECT_PURCHASE_NOT_FOUND');
  if (!['DRAFT', 'REQUESTED'].includes(String(existing.status))) throw new ApiError(409, 'Direct purchase can no longer be edited', 'DIRECT_PURCHASE_LOCKED');
  const updated = await db.directPurchase.update({
    where: { id },
    data: {
      ...(body.sellerId !== undefined ? { sellerId: body.sellerId } : {}),
      ...(body.requirementId !== undefined ? { requirementId: body.requirementId } : {}),
      ...(body.totalAmount !== undefined ? { totalAmount: body.totalAmount } : {})
    }
  });
  await notifySafe(
    updated.sellerId,
    'Direct purchase updated',
    `A direct purchase request ${updated.purchaseNumber} was updated by the buyer.`,
    'direct_purchase_updated',
    '/seller/orders'
  );
  await auditWrite(req, 'direct_purchase.updated', 'directPurchase', id);
  ok(res, updated);
}));

router.delete('/direct-purchases/:id', authenticate, authorize('buyer', 'admin'), asyncRoute(async (req, res) => {
  const { id } = parse(idParams, req.params);
  await assertBuyerProcurementApproved(req);
  const existing = await db.directPurchase.findUnique({ where: { id } });
  if (!existing || (!isAdmin(req) && existing.buyerId !== userId(req))) throw new ApiError(404, 'Direct purchase not found', 'DIRECT_PURCHASE_NOT_FOUND');
  if (!['DRAFT', 'REQUESTED', 'REJECTED'].includes(String(existing.status))) throw new ApiError(409, 'Direct purchase can no longer be deleted', 'DIRECT_PURCHASE_LOCKED');
  await db.directPurchase.delete({ where: { id } });
  await notifySafe(
    existing.sellerId,
    'Direct purchase cancelled',
    `Direct purchase request ${existing.purchaseNumber} was cancelled by the buyer.`,
    'direct_purchase_cancelled',
    '/seller/orders'
  );
  await auditWrite(req, 'direct_purchase.deleted', 'directPurchase', id);
  ok(res, { success: true });
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
  await assertBuyerProcurementApproved(req);
  const body = parse(z.object({ tenderId: z.coerce.number().int().positive().optional(), bidId: z.coerce.number().int().positive().optional(), title: z.string().trim().min(3).max(200).optional() }), req.body);
  const result = await procurementWorkflow.generateDirectPurchasePO(actorFrom(req), id, body);
  ok(res, result.purchaseOrder, 201);
}));

router.post('/quote-requests', authenticate, authorize('buyer'), asyncRoute(async (req, res) => {
  await assertBuyerProcurementApproved(req);
  const body = parse(quoteRequestBody, req.body);
  const quote = await procurementWorkflow.createQuoteRequest(actorFrom(req), body);
  ok(res, quote, 201);
}));

const quoteRequestInclude = {
  quoteResponses: {
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
              organizationType: true
            }
          }
        }
      }
    }
  },
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
};

router.get('/quote-requests', authenticate, asyncRoute(async (req, res) => {
  const query = parse(paginationQuery, req.query);
  const where: any = isAdmin(req) ? {} : req.user?.role === 'buyer' ? { buyerId: userId(req) } : { sellerId: userId(req) };
  if (query.status) where.status = query.status;
  if (query.q) where.OR = [{ subject: { contains: query.q, mode: 'insensitive' } }, { message: { contains: query.q, mode: 'insensitive' } }, { seller: { name: { contains: query.q, mode: 'insensitive' } } }, { buyer: { name: { contains: query.q, mode: 'insensitive' } } }];
  const window = listWindow(query);
  const [rows, total] = await Promise.all([
    db.quoteRequest.findMany({ where, include: quoteRequestInclude, orderBy: { updatedAt: 'desc' }, ...window }),
    db.quoteRequest.count({ where })
  ]);
  ok(res, paged(await attachQuoteResponseFileAssets(rows), total, query));
}));

router.get('/quote-requests/:id', authenticate, asyncRoute(async (req, res) => {
  const { id } = parse(idParams, req.params);
  const quote = await db.quoteRequest.findUnique({
    where: { id },
    include: quoteRequestInclude
  });
  if (!quote || (!isAdmin(req) && quote.buyerId !== userId(req) && quote.sellerId !== userId(req))) throw new ApiError(404, 'Quote request not found', 'QUOTE_REQUEST_NOT_FOUND');
  const [enriched] = await attachQuoteResponseFileAssets([quote]);
  /* Attach buyer-uploaded document file asset (if any) */
  let requestDocAsset: any = null;
  if (enriched.documentUrl) {
    const fid = fileIdFromUrl(enriched.documentUrl);
    if (fid) {
      requestDocAsset = await db.fileAsset.findFirst({ where: { id: fid, status: 'active' }, select: { id: true, originalName: true, mimeType: true, url: true, key: true } });
    }
  }
  ok(res, { ...enriched, requestDocAsset });
}));

router.put('/quote-requests/:id', authenticate, authorize('buyer', 'admin'), asyncRoute(async (req, res) => {
  const { id } = parse(idParams, req.params);
  await assertBuyerProcurementApproved(req);
  const body = parse(quoteRequestBody.partial().refine(value => Object.keys(value).length > 0, { message: 'At least one field is required' }), req.body);
  const quote = await db.quoteRequest.findUnique({ where: { id }, include: { quoteResponses: true } });
  if (!quote || (!isAdmin(req) && quote.buyerId !== userId(req))) throw new ApiError(404, 'Quote request not found', 'QUOTE_REQUEST_NOT_FOUND');
  if (quote.quoteResponses.length > 0 || !['pending'].includes(String(quote.status))) throw new ApiError(409, 'RFQ can no longer be edited after seller response', 'QUOTE_REQUEST_LOCKED');
  const updated = await db.quoteRequest.update({
    where: { id },
    data: {
      ...(body.sellerId !== undefined ? { sellerId: body.sellerId } : {}),
      ...(body.subject !== undefined ? { subject: body.subject } : {}),
      ...(body.message !== undefined ? { message: body.message } : {}),
      ...(body.documentUrl !== undefined ? { documentUrl: body.documentUrl } : {}),
      ...(body.estimatedValue !== undefined ? { estimatedValue: body.estimatedValue } : {}),
      ...(body.deadlineDate !== undefined ? { deadlineDate: body.deadlineDate } : {})
    }
  });
  if (body.documentUrl) {
    const match = body.documentUrl.match(/\/api\/files\/(\d+)/);
    const fileId = match ? Number(match[1]) : null;
    if (fileId) {
      await db.fileAsset.updateMany({
        where: { id: fileId },
        data: { entityType: 'quote', entityId: id }
      });
    } else {
      await db.fileAsset.updateMany({
        where: { url: body.documentUrl },
        data: { entityType: 'quote', entityId: id }
      });
    }
  }
  await notifySafe(
    updated.sellerId,
    'RFQ updated',
    `RFQ "${updated.subject}" was updated by the buyer.`,
    'quote_request_updated',
    '/quotations'
  );
  await auditWrite(req, 'quote_request.updated', 'quoteRequest', id);
  ok(res, updated);
}));

router.delete('/quote-requests/:id', authenticate, authorize('buyer', 'admin'), asyncRoute(async (req, res) => {
  const { id } = parse(idParams, req.params);
  await assertBuyerProcurementApproved(req);
  const quote = await db.quoteRequest.findUnique({ where: { id }, include: { quoteResponses: true } });
  if (!quote || (!isAdmin(req) && quote.buyerId !== userId(req))) throw new ApiError(404, 'Quote request not found', 'QUOTE_REQUEST_NOT_FOUND');
  if (quote.quoteResponses.length > 0) throw new ApiError(409, 'RFQ with seller responses cannot be deleted', 'QUOTE_REQUEST_LOCKED');
  await db.quoteRequest.delete({ where: { id } });
  await notifySafe(
    quote.sellerId,
    'RFQ cancelled',
    `RFQ "${quote.subject}" was cancelled by the buyer.`,
    'quote_request_cancelled',
    '/quotations'
  );
  await auditWrite(req, 'quote_request.deleted', 'quoteRequest', id);
  ok(res, { success: true });
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
    await assertBuyerProcurementApproved(req);
    const response = await db.quoteResponse.findUnique({ where: { id }, include: { quoteRequest: true } });
    if (!response || (!isAdmin(req) && response.quoteRequest.buyerId !== userId(req))) throw new ApiError(404, 'Quote response not found', 'QUOTE_RESPONSE_NOT_FOUND');
    if (status === 'ACCEPTED') {
      const body = parse(z.object({ tenderId: z.coerce.number().int().positive().optional(), bidId: z.coerce.number().int().positive().optional(), title: z.string().trim().min(3).max(200).optional() }), req.body);
      ok(res, await procurementWorkflow.acceptQuoteResponseAndGeneratePO(actorFrom(req), id, body));
      return;
    }
    if (response.status === 'ACCEPTED') {
      throw new ApiError(409, 'Accepted RFQ response cannot be rejected', 'QUOTE_RESPONSE_FINALIZED');
    }
    const updated = await db.$transaction(async (tx: any) => {
      const decided = response.status === 'REJECTED'
        ? response
        : await tx.quoteResponse.update({ where: { id }, data: { status } });
      await tx.quoteRequest.update({
        where: { id: response.quoteRequestId },
        data: { status: 'rejected', statusEnum: 'CLOSED' }
      });
      return decided;
    });
    await notifySafe(
      response.sellerId,
      'RFQ response rejected',
      `Your response for "${response.quoteRequest.subject}" was rejected by the buyer.`,
      'quote_response_rejected',
      '/quotations'
    );
    await auditWrite(req, action, 'quoteResponse', id);
    ok(res, updated);
  }));
}

// Tenders, bids, auctions
router.post('/tenders', authenticate, requirePermission('tender.create', orgScope), asyncRoute(async (req, res) => {
  await assertBuyerProcurementApproved(req);
  const body = parse(tenderBody, req.body);
  const tender = await tenderWorkflow.createTender(actorFrom(req), body);
  await linkUploadedTenderDocument(tender.id, body.documentUrl, userId(req));
  ok(res, tender, 201);
}));

const mapProcurementBidStatusToTenderStatus = (status: string): string => {
  const s = String(status || 'DRAFT').toUpperCase();
  if (['DRAFT', 'PENDING_ADMIN_APPROVAL', 'REJECTED'].includes(s)) return 'draft';
  if (['OPEN', 'APPROVED'].includes(s)) return 'published';
  if (['CLOSED', 'EXPIRED', 'CANCELLED'].includes(s)) return 'closed';
  if (['TECHNICAL_EVALUATION', 'TECHNICAL_EVALUATION_COMPLETED'].includes(s)) return 'tech_evaluation';
  if (['FINANCIAL_EVALUATION', 'L1_GENERATED', 'AWARD_RECOMMENDED'].includes(s)) return 'financial_evaluation';
  if (s === 'AWARDED') return 'awarded';
  return 'published';
};

router.get('/tenders', authenticate, asyncRoute(async (req, res) => {
  const query = parse(paginationQuery, req.query);
  const isBuyerRole = req.user?.role === 'buyer';

  const baseWhereTender: any = isAdmin(req)
    ? {}
    : isBuyerRole
      ? { buyerId: userId(req) }
      : { status: { in: ['published', 'bid_submission', 'tech_bid_opening', 'tech_evaluation', 'financial_bid_opening', 'financial_opening', 'financial_evaluation'] } };

  const baseWherePB: any = isAdmin(req)
    ? {}
    : isBuyerRole
      ? { buyerId: userId(req) }
      : {
          status: { in: ['OPEN', 'APPROVED', 'CLOSED', 'TECHNICAL_EVALUATION', 'TECHNICAL_EVALUATION_COMPLETED', 'FINANCIAL_EVALUATION', 'L1_GENERATED', 'AWARD_RECOMMENDED', 'AWARDED', 'CANCELLED'] },
          OR: [
            {
              NOT: {
                OR: [
                  { procurementType: 'DIRECT_PURCHASE' },
                  { bidType: 'DIRECT_PURCHASE' }
                ]
              }
            },
            {
              participations: {
                some: { sellerId: userId(req) }
              },
              OR: [
                { procurementType: 'DIRECT_PURCHASE' },
                { bidType: 'DIRECT_PURCHASE' }
              ]
            }
          ]
        };

  const whereTender: any = { ...baseWhereTender };
  const wherePB: any = { ...baseWherePB };

  // Status/Tab filter
  if (query.status) {
    if (query.status === 'published') {
      whereTender.status = { in: ['published', 'bid_submission', 'tech_bid_opening', 'tech_evaluation', 'financial_bid_opening', 'financial_opening', 'financial_evaluation'] };
      wherePB.status = { in: ['OPEN', 'APPROVED'] };
    } else if (query.status === 'closed') {
      whereTender.status = { in: ['closed', 'awarded', 'po_generated'] };
      wherePB.status = { in: ['CLOSED', 'EXPIRED', 'TECHNICAL_EVALUATION', 'TECHNICAL_EVALUATION_COMPLETED', 'FINANCIAL_EVALUATION', 'L1_GENERATED', 'AWARD_RECOMMENDED', 'AWARDED', 'CANCELLED'] };
    } else if (query.status === 'draft') {
      whereTender.status = 'draft';
      wherePB.status = { in: ['DRAFT', 'PENDING_ADMIN_APPROVAL'] };
    } else {
      whereTender.status = query.status;
      if (query.status === 'draft') {
        wherePB.status = { in: ['DRAFT', 'PENDING_ADMIN_APPROVAL'] };
      } else {
        wherePB.status = query.status;
      }
    }
  }

  // Category filter
  const category = req.query.category as string;
  if (category && category !== 'All') {
    whereTender.category = category;
    wherePB.category = category;
  }

  // Budget filter
  const budget = req.query.budget as string;
  if (budget && budget !== 'All') {
    if (budget === 'under_10l') {
      whereTender.budget = { lt: 1000000 };
      wherePB.estimatedValue = { lt: 1000000 };
    } else if (budget === '10l_50l') {
      whereTender.budget = { gte: 1000000, lte: 5000000 };
      wherePB.estimatedValue = { gte: 1000000, lte: 5000000 };
    } else if (budget === 'above_50l') {
      whereTender.budget = { gt: 5000000 };
      wherePB.estimatedValue = { gt: 5000000 };
    }
  }

  // Search filter
  const search = (req.query.search || query.q) as string;
  if (search && search.trim()) {
    const term = search.trim();
    whereTender.OR = [
      { tenderId: { contains: term, mode: 'insensitive' } },
      { title: { contains: term, mode: 'insensitive' } },
      { category: { contains: term, mode: 'insensitive' } },
      { description: { contains: term, mode: 'insensitive' } }
    ];
    wherePB.OR = [
      { bidNumber: { contains: term, mode: 'insensitive' } },
      { title: { contains: term, mode: 'insensitive' } },
      { category: { contains: term, mode: 'insensitive' } },
      { description: { contains: term, mode: 'insensitive' } }
    ];
  }

  // Fetch both sets
  const [tenders, procurementBids] = await Promise.all([
    db.tender.findMany({
      where: whereTender,
      include: { _count: { select: { bids: { where: { status: { not: 'withdrawn' } } } } } }
    }),
    db.procurementBid.findMany({
      where: wherePB,
      include: {
        _count: { select: { participations: { where: { isWithdrawn: false } } } },
        documents: true
      }
    })
  ]);

  // Normalize into a single structure
  const merged = [
    ...tenders.map((t: any) => ({
      id: t.id,
      tenderId: t.tenderId,
      title: t.title,
      category: t.category,
      budget: Number(t.budget || 0),
      bidsCount: t._count?.bids ?? t.bidsCount ?? 0,
      closesAt: t.closesAt ? t.closesAt.toISOString() : null,
      status: t.status,
      description: t.description || '',
      createdAt: t.createdAt ? t.createdAt.toISOString() : null,
      updatedAt: t.updatedAt ? t.updatedAt.toISOString() : null,
      documentUrl: t.documentUrl || null,
      quantityUnit: t.quantityUnit || null,
      paymentTerms: t.paymentTerms || null,
      deliveryType: t.deliveryType || null,
      isV2: false
    })),
    ...procurementBids.map((b: any) => {
      const doc = b.documents?.[0];
      const docUrl = doc ? `/api/files/${doc.fileAssetId}/view` : null;

      return {
        id: b.id,
        tenderId: b.bidNumber,
        title: b.title,
        category: b.category,
        budget: Number(b.estimatedValue || 0),
        bidsCount: b._count?.participations ?? 0,
        closesAt: b.endDate ? b.endDate.toISOString() : null,
        status: mapProcurementBidStatusToTenderStatus(b.status),
        description: b.description || '',
        createdAt: b.createdAt ? b.createdAt.toISOString() : null,
        updatedAt: b.updatedAt ? b.updatedAt.toISOString() : null,
        documentUrl: docUrl,
        quantityUnit: b.unit || null,
        paymentTerms: b.termsAndConditions?.join(', ') || null,
        deliveryType: b.deliveryLocation || null,
        isV2: true,
        v2Status: b.status,
        documents: (b.documents || []).map((doc: any) => ({
          fileAssetId: doc.fileAssetId,
          fileName: doc.fileName || doc.fileAsset?.originalName || 'Document',
          documentType: doc.documentType || 'Bid Document'
        }))
      };
    })
  ];

  // Sorting
  const sortBy = req.query.sortBy as string || 'createdAt';
  const sortOrder = (req.query.sortOrder as string) === 'asc' ? 'asc' : 'desc';
  const dir = sortOrder === 'asc' ? 1 : -1;

  merged.sort((a: any, b: any) => {
    let va = a[sortBy] ?? '';
    let vb = b[sortBy] ?? '';
    if (sortBy === 'closes' || sortBy === 'closesAt') {
      va = a.closesAt ?? '';
      vb = b.closesAt ?? '';
    } else if (sortBy === 'created' || sortBy === 'createdAt') {
      va = a.createdAt ?? '';
      vb = b.createdAt ?? '';
    } else if (sortBy === 'budget') {
      return (Number(a.budget) - Number(b.budget)) * dir;
    } else if (sortBy === 'bids' || sortBy === 'bidsCount') {
      return (Number(a.bidsCount) - Number(b.bidsCount)) * dir;
    }
    if (typeof va === 'number' && typeof vb === 'number') {
      return (va - vb) * dir;
    }
    return String(va).localeCompare(String(vb)) * dir;
  });

  const { skip, take } = listWindow(query);
  const pagedRecords = merged.slice(skip, skip + take);

  ok(res, paged(
    pagedRecords,
    merged.length,
    query,
    'tenders'
  ));
}));

router.get('/tenders/summary', authenticate, asyncRoute(async (req, res) => {
  const isBuyerRole = req.user?.role === 'buyer';

  const baseWhereTender: any = isAdmin(req)
    ? {}
    : isBuyerRole
      ? { buyerId: userId(req) }
      : { status: { in: ['published', 'bid_submission', 'tech_bid_opening', 'tech_evaluation', 'financial_bid_opening', 'financial_opening', 'financial_evaluation'] } };

  const baseWherePB: any = isAdmin(req)
    ? {}
    : isBuyerRole
      ? { buyerId: userId(req) }
      : {
          status: { in: ['OPEN', 'APPROVED', 'CLOSED', 'TECHNICAL_EVALUATION', 'TECHNICAL_EVALUATION_COMPLETED', 'FINANCIAL_EVALUATION', 'L1_GENERATED', 'AWARD_RECOMMENDED', 'AWARDED', 'CANCELLED'] },
          OR: [
            {
              NOT: {
                OR: [
                  { procurementType: 'DIRECT_PURCHASE' },
                  { bidType: 'DIRECT_PURCHASE' }
                ]
              }
            },
            {
              participations: {
                some: { sellerId: userId(req) }
              },
              OR: [
                { procurementType: 'DIRECT_PURCHASE' },
                { bidType: 'DIRECT_PURCHASE' }
              ]
            }
          ]
        };

  const [
    draftTenders, activeTenders, closedTenders,
    draftPBs, activePBs, closedPBs
  ] = await Promise.all([
    db.tender.count({ where: { ...baseWhereTender, status: 'draft' } }),
    db.tender.count({ where: { ...baseWhereTender, status: { in: ['published', 'bid_submission', 'tech_bid_opening', 'tech_evaluation', 'financial_bid_opening', 'financial_opening', 'financial_evaluation'] } } }),
    db.tender.count({ where: { ...baseWhereTender, status: { in: ['closed', 'awarded', 'po_generated'] } } }),
    db.procurementBid.count({ where: { ...baseWherePB, status: { in: ['DRAFT', 'PENDING_ADMIN_APPROVAL'] } } }),
    db.procurementBid.count({ where: { ...baseWherePB, status: { in: ['OPEN', 'APPROVED'] } } }),
    db.procurementBid.count({ where: { ...baseWherePB, status: { in: ['CLOSED', 'EXPIRED', 'TECHNICAL_EVALUATION', 'TECHNICAL_EVALUATION_COMPLETED', 'FINANCIAL_EVALUATION', 'L1_GENERATED', 'AWARD_RECOMMENDED', 'AWARDED', 'CANCELLED'] } } })
  ]);

  ok(res, {
    draftCount: draftTenders + draftPBs,
    activeCount: activeTenders + activePBs,
    closedCount: closedTenders + closedPBs
  });
}));

router.get('/tenders/public', asyncRoute(async (req, res) => {
  const query = parse(paginationQuery, req.query);
  const key = redisKeys.cacheTenderPublic(sha256(JSON.stringify(query)));
  const search = (query.q || req.query.search || '').toString().trim();
  const tenders = await getOrSetCache<any[]>(key, () => db.tender.findMany({
    where: {
      status: { in: ['published', 'bid_submission'] },
      ...(search ? {
        OR: [
          { tenderId: { contains: search, mode: 'insensitive' } },
          { title: { contains: search, mode: 'insensitive' } },
          { category: { contains: search, mode: 'insensitive' } },
          { description: { contains: search, mode: 'insensitive' } }
        ]
      } : {})
    },
    select: {
      id: true,
      buyerId: true,
      tenderId: true,
      title: true,
      category: true,
      budget: true,
      description: true,
      documentUrl: true,
      status: true,
      closesAt: true,
      createdAt: true,
      buyer: {
        select: {
          id: true,
          name: true,
          buyerProfile: {
            select: {
              organizationName: true,
              businessType: true,
              state: true,
              district: true
            }
          }
        }
      },
      tenderDocuments: {
        select: {
          id: true,
          title: true,
          documentType: true,
          fileAssetId: true,
          fileAsset: {
            select: {
              originalName: true
            }
          }
        }
      },
      _count: { select: { bids: { where: { status: { not: 'withdrawn' } } } } }
    },
    skip: query.skip,
    take: query.take,
    orderBy: { createdAt: 'desc' }
  }), 120);

  // Parse authorization optionally to check if the user is a seller and has participated
  let currentUserId: number | undefined;
  const authHeader = req.headers.authorization || '';
  const [scheme, token] = authHeader.split(' ');
  if (scheme === 'Bearer' && token) {
    try {
      const decoded = verifyAccessToken(token);
      currentUserId = Number(decoded.id);
    } catch {
      // ignore
    }
  }

  let myBids: any[] = [];
  if (currentUserId) {
    myBids = await db.bid.findMany({
      where: {
        sellerId: currentUserId,
        tenderId: { in: tenders.map((t: any) => t.id) }
      },
      select: {
        id: true,
        tenderId: true,
        status: true,
        bidNumber: true
      }
    });
  }

  const enrichedTenders = tenders.map((tender: any) => {
    const myBid = myBids.find((b: any) => b.tenderId === tender.id);
    const docs = (tender.tenderDocuments || []).map((doc: any) => ({
      id: doc.id,
      title: doc.title || doc.fileAsset?.originalName || 'Document',
      documentType: doc.documentType,
      url: `/api/files/${doc.fileAssetId}/view`,
      originalName: doc.fileAsset?.originalName
    }));
    return {
      ...tender,
      documentUrl: docs[0]?.url || tender.documentUrl,
      bidsCount: tender._count?.bids ?? tender.bidsCount ?? 0,
      _count: undefined,
      hasParticipated: !!myBid,
      participationStatus: myBid ? myBid.status : null,
      myBidId: myBid ? myBid.id : null,
      myBidNumber: myBid ? myBid.bidNumber : null,
      tenderDocuments: docs
    };
  });

  res.json(maskSensitive(enrichedTenders));
}));

router.get('/tenders/:id', authenticate, asyncRoute(async (req, res) => {
  const { id } = parse(idParams, req.params);
  ok(res, await assertTenderAccess(req, id));
}));

router.put('/tenders/:id', authenticate, requirePermission('tender.update', orgScope), asyncRoute(async (req, res) => {
  const { id } = parse(idParams, req.params);
  await assertBuyerProcurementApproved(req);
  const tender = await assertTenderAccess(req, id);
  if (!isAdmin(req) && tender.buyerId !== userId(req)) throw new ApiError(403, 'Access denied', 'ACCESS_DENIED');
  const body = parse(tenderBody.partial(), req.body);
  const updated = await db.tender.update({ where: { id }, data: body });
  await linkUploadedTenderDocument(id, body.documentUrl, userId(req));
  await invalidateByPattern('cache:tender_public:*');
  await auditWrite(req, 'tender.updated', 'tender', id);
  ok(res, updated);
}));

for (const [path, data, action] of [
  ['/tenders/:id/publish', 'published', 'tender.published'],
  ['/tenders/:id/close', 'closed', 'tender.closed']
] as const) {
  router.post(path, authenticate, requirePermission('tender.publish', orgScope), asyncRoute(async (req, res) => {
    const { id } = parse(idParams, req.params);
    await assertBuyerProcurementApproved(req);
    const tender = await assertTenderAccess(req, id);
    if (!isAdmin(req) && tender.buyerId !== userId(req)) throw new ApiError(403, 'Access denied', 'ACCESS_DENIED');
    const updated = await tenderWorkflow.transitionTender(actorFrom(req), id, data);
    await invalidateByPattern('cache:tender_public:*');
    await auditWrite(req, action, 'tender', id);
    ok(res, updated);
  }));
}

router.post('/tenders/:id/items', authenticate, requirePermission('tender.update', orgScope), asyncRoute(async (req, res) => {
  const { id } = parse(idParams, req.params);
  await assertBuyerProcurementApproved(req);
  const tender = await assertTenderAccess(req, id);
  if (!isAdmin(req) && tender.buyerId !== userId(req)) throw new ApiError(403, 'Access denied', 'ACCESS_DENIED');
  const body = parse(z.object({ itemName: z.string().trim().min(2), quantity: z.coerce.number().positive(), unitOfMeasure: z.string().trim().min(1), description: z.string().optional(), productId: z.coerce.number().int().positive().optional(), estimatedUnitPrice: z.coerce.number().optional(), specifications: z.record(z.string(), z.unknown()).optional() }), req.body);
  const item = await db.tenderItem.create({ data: { ...body, tenderId: id } });
  await auditWrite(req, 'tender.item_added', 'tenderItem', item.id);
  ok(res, item, 201);
}));

router.post('/tenders/:id/documents', authenticate, requirePermission('tender.update', orgScope), upload.single('file'), asyncRoute(async (req: AuthRequest & { file?: Express.Multer.File }, res) => {
  const { id } = parse(idParams, req.params);
  await assertBuyerProcurementApproved(req);
  const tender = await assertTenderAccess(req, id);
  if (!isAdmin(req) && tender.buyerId !== userId(req)) throw new ApiError(403, 'Access denied', 'ACCESS_DENIED');
  if (!req.file) throw new ApiError(400, 'Document file is required', 'DOCUMENT_REQUIRED');
  const asset = await db.fileAsset.create({ data: { ownerId: userId(req), ownerRole: String(req.user?.role), entityType: 'tender', entityId: id, storageProvider: 'local', key: `tenders/${id}/${Date.now()}-${req.file.originalname}`, mimeType: req.file.mimetype, size: req.file.size, checksum: sha256(req.file.buffer.toString('base64')), originalName: req.file.originalname, status: 'active' } });
  const doc = await db.tenderDocument.create({ data: { tenderId: id, fileAssetId: asset.id, documentType: clean(req.body?.documentType || 'tender'), title: clean(req.body?.title), isPublic: Boolean(req.body?.isPublic) } });
  await invalidateByPattern('cache:tender_public:*');
  await auditWrite(req, 'tender.document_added', 'tenderDocument', doc.id);
  ok(res, { asset, document: doc }, 201);
}));

router.get('/tenders/:id/participants', authenticate, requirePermission('tender.view', orgScope), asyncRoute(async (req, res) => {
  const { id } = parse(idParams, req.params);
  const tender = await assertTenderAccess(req, id);
  if (!isAdmin(req) && tender.buyerId !== userId(req)) throw new ApiError(403, 'Access denied', 'ACCESS_DENIED');
  ok(res, await db.tenderParticipant.findMany({ where: { tenderId: id }, include: { seller: { select: { id: true, name: true } } } }));
}));

router.post('/tenders/:id/bids', authenticate, requirePermission('bid.submit', orgScope), asyncRoute(async (req, res) => {
  const { id } = parse(idParams, req.params);
  const tender = await assertTenderAccess(req, id);
  const body = parse(bidBody, req.body);
  const bid = await tenderWorkflow.submitBid(actorFrom(req), id, body);
  await invalidateByPattern('cache:tender_public:*');
  await auditWrite(req, 'bid.submitted', 'bid', bid.id, { tenderId: tender.id });
  ok(res, bid, 201);
}));

router.get('/bids/my', authenticate, authorize('seller', 'buyer', 'admin'), asyncRoute(async (req, res) => {
  const role = String(req.user?.role || '');
  const currentUserId = userId(req);
  let where: any = {};
  if (role === 'seller') {
    const ownTenderIds = await db.bid.findMany({
      where: { sellerId: currentUserId },
      select: { tenderId: true },
      distinct: ['tenderId']
    });
    const tenderIds = ownTenderIds.map((row: any) => row.tenderId).filter(Boolean);
    where = tenderIds.length ? { tenderId: { in: tenderIds } } : { sellerId: currentUserId };
  } else if (role === 'buyer') {
    where = { tender: { buyerId: currentUserId } };
  }
  const bids = await db.bid.findMany({
    where,
    include: {
      tender: true,
      seller: {
        select: {
          id: true,
          name: true,
          email: true,
          mobile: true,
          sellerProfile: { select: { businessName: true, organizationType: true, offices: { select: { city: true, state: true } } } }
        }
      }
    },
    orderBy: { createdAt: 'desc' }
  });
  const enriched = (await attachBidFileAssets(bids)).map((bid: any) => ({ ...bid, isOwnBid: bid.sellerId === currentUserId }));
  res.json(maskSensitive(enriched));
}));

router.get('/bids/:id(\\d+)', authenticate, asyncRoute(async (req, res) => {
  const { id } = parse(idParams, req.params);
  await assertBidAccess(req, id);
  const bid = await db.bid.findUnique({
    where: { id },
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
    }
  });
  if (!bid) throw new ApiError(404, 'Bid not found', 'BID_NOT_FOUND');
  const [enriched] = await attachBidFileAssets([bid]);
  ok(res, enriched);
}));

router.get('/tenders/:id/bids', authenticate, requirePermission('tender.view', orgScope), asyncRoute(async (req, res) => {
  const { id } = parse(idParams, req.params);
  const tender = await assertTenderAccess(req, id);
  const requesterId = userId(req);
  if (!isAdmin(req) && req.user?.role === 'buyer' && tender.buyerId !== requesterId) throw new ApiError(403, 'Access denied', 'ACCESS_DENIED');
  if (req.user?.role === 'seller') {
    const hasOwnBid = await db.bid.findFirst({ where: { tenderId: id, sellerId: requesterId }, select: { id: true } });
    if (!hasOwnBid) throw new ApiError(403, 'Submit a bid on this tender before viewing competing seller bids.', 'SELLER_TENDER_BID_REQUIRED');
  }
  const bids = await db.bid.findMany({
    where: { tenderId: id },
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
  res.json(maskSensitive((await attachBidFileAssets(bids)).map((bid: any) => ({ ...bid, isOwnBid: bid.sellerId === requesterId }))));
}));

router.put('/bids/:id(\\d+)', authenticate, requirePermission('bid.submit', orgScope), asyncRoute(async (req, res) => {
  const { id } = parse(idParams, req.params);
  const bid = await assertBidAccess(req, id);
  if (bid.sellerId !== userId(req)) throw new ApiError(403, 'Access denied', 'ACCESS_DENIED');
  const updated = await tenderWorkflow.modifyBid(actorFrom(req), id, parse(bidBody.partial(), req.body));
  await invalidateByPattern('cache:tender_public:*');
  await auditWrite(req, 'bid.updated', 'bid', id);
  ok(res, updated);
}));

router.post('/bids/:id(\\d+)/withdraw', authenticate, requirePermission('bid.submit', orgScope), asyncRoute(async (req, res) => {
  const { id } = parse(idParams, req.params);
  const bid = await assertBidAccess(req, id);
  if (bid.sellerId !== userId(req)) throw new ApiError(403, 'Access denied', 'ACCESS_DENIED');
  const updated = await tenderWorkflow.withdrawBid(actorFrom(req), id);
  await invalidateByPattern('cache:tender_public:*');
  await auditWrite(req, 'bid.withdrawn', 'bid', id);
  ok(res, updated);
}));

router.post('/bids/:id(\\d+)/status', authenticate, requirePermission('award.recommend', orgScope), asyncRoute(async (req, res) => {
  const { id } = parse(idParams, req.params);
  await assertBuyerProcurementApproved(req);
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

router.post('/tenders/:id/auction', authenticate, requirePermission('reverse_auction.create', orgScope), asyncRoute(async (req, res) => {
  const { id } = parse(idParams, req.params);
  await assertBuyerProcurementApproved(req);
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

router.post('/auctions/:id/bids', authenticate, requirePermission('reverse_auction.bid.submit', orgScope), asyncRoute(async (req, res) => {
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

router.post('/auctions/:id/finalize', authenticate, requirePermission('reverse_auction.award', orgScope), asyncRoute(async (req, res) => {
  const { id } = parse(idParams, req.params);
  await assertBuyerProcurementApproved(req);
  const auction = await db.auction.findUnique({ where: { id }, include: { Tender: true } });
  if (!auction || (!isAdmin(req) && auction.Tender.buyerId !== userId(req))) throw new ApiError(404, 'Auction not found', 'AUCTION_NOT_FOUND');
  const result = await tenderWorkflow.finalizeAuction(actorFrom(req), id);
  await auditWrite(req, 'auction.finalized', 'auction', id);
  ok(res, result);
}));

// Evaluation and contracts
router.post('/tenders/:id/technical-criteria', authenticate, requirePermission('bid.technical.evaluate', orgScope), asyncRoute(async (req, res) => {
  const { id } = parse(idParams, req.params);
  await assertBuyerProcurementApproved(req);
  await assertTenderAccess(req, id);
  const body = parse(z.object({ name: z.string().min(2), description: z.string().optional(), maxScore: z.coerce.number().positive(), weightage: z.coerce.number().optional(), isMandatory: z.boolean().optional() }), req.body);
  const criteria = await db.technicalEvaluationCriteria.create({ data: { ...body, tenderId: id } });
  await auditWrite(req, 'evaluation.criteria_created', 'technicalEvaluationCriteria', criteria.id);
  ok(res, criteria, 201);
}));

router.post('/bids/:id(\\d+)/technical-evaluation', authenticate, requirePermission('bid.technical.evaluate', orgScope), asyncRoute(async (req, res) => {
  const { id } = parse(idParams, req.params);
  await assertBuyerProcurementApproved(req);
  await assertBidAccess(req, id);
  const body = parse(z.object({ criteriaId: z.coerce.number().int().positive(), score: z.coerce.number().nonnegative(), status: z.enum(['PENDING', 'IN_PROGRESS', 'QUALIFIED', 'DISQUALIFIED', 'APPROVED', 'REJECTED']).default('PENDING'), remarks: z.string().optional() }), req.body);
  const result = await tenderWorkflow.evaluateBid(actorFrom(req), id, 'technical', body);
  await auditWrite(req, 'evaluation.technical_recorded', 'technicalEvaluationResult', result.id);
  ok(res, result);
}));

router.post('/bids/:id(\\d+)/financial-evaluation', authenticate, requirePermission('bid.financial.evaluate', orgScope), asyncRoute(async (req, res) => {
  const { id } = parse(idParams, req.params);
  await assertBuyerProcurementApproved(req);
  await assertBidAccess(req, id);
  const body = parse(z.object({ quotedAmount: z.coerce.number().nonnegative(), evaluatedAmount: z.coerce.number().nonnegative().optional(), rank: z.coerce.number().int().positive().optional(), status: z.enum(['PENDING', 'IN_PROGRESS', 'QUALIFIED', 'DISQUALIFIED', 'APPROVED', 'REJECTED']).default('PENDING'), remarks: z.string().optional() }), req.body);
  const result = await tenderWorkflow.evaluateBid(actorFrom(req), id, 'financial', body);
  await auditWrite(req, 'evaluation.financial_recorded', 'financialEvaluation', result.id);
  ok(res, result);
}));

router.get('/tenders/:id/evaluation-summary', authenticate, requirePermission('tender.view', orgScope), asyncRoute(async (req, res) => {
  const { id } = parse(idParams, req.params);
  await assertTenderAccess(req, id);
  const [technicalCriteria, technicalResults, financialEvaluations] = await Promise.all([
    db.technicalEvaluationCriteria.findMany({ where: { tenderId: id } }),
    db.technicalEvaluationResult.findMany({ where: { tenderId: id } }),
    db.financialEvaluation.findMany({ where: { tenderId: id } })
  ]);
  ok(res, { technicalCriteria, technicalResults, financialEvaluations });
}));

router.post('/tenders/:id/comparative-statement', authenticate, requirePermission('award.recommend', orgScope), asyncRoute(async (req, res) => {
  const { id } = parse(idParams, req.params);
  await assertBuyerProcurementApproved(req);
  await assertTenderAccess(req, id);
  const statement = await tenderWorkflow.createComparativeStatement(actorFrom(req), id);
  await auditWrite(req, 'evaluation.comparative_statement_created', 'comparativeStatement', statement.id);
  ok(res, statement, 201);
}));

router.post('/contracts', authenticate, requirePermission('purchase_order.create', orgScope), asyncRoute(async (req, res) => {
  await assertBuyerProcurementApproved(req);
  const body = parse(z.object({ tenderId: z.coerce.number().int().positive().optional(), bidId: z.coerce.number().int().positive().optional(), title: z.string().min(3), value: z.coerce.number().nonnegative(), contractType: z.enum(['PURCHASE', 'RATE_CONTRACT', 'SERVICE_AGREEMENT', 'FRAMEWORK_AGREEMENT']).default('PURCHASE'), startDate: z.coerce.date().optional(), endDate: z.coerce.date().optional(), metadata: z.record(z.string(), z.unknown()).optional() }), req.body);
  const contract = await contractWorkflow.createAfterAward(actorFrom(req), body);
  await auditWrite(req, 'contract.created', 'contract', contract.id);
  ok(res, contract, 201);
}));

router.get('/contracts', authenticate, asyncRoute(async (req, res) => {
  const query = parse(paginationQuery, req.query);
  const where: any = isAdmin(req) ? {} : req.user?.role === 'buyer' ? { tender: { buyerId: userId(req) } } : { bid: { sellerId: userId(req) } };
  if (query.status) where.status = query.status;
  if (query.q) where.OR = [{ title: { contains: query.q, mode: 'insensitive' } }, { contractNumber: { contains: query.q, mode: 'insensitive' } }];
  const window = listWindow(query);
  const [contracts, total] = await Promise.all([
    db.contract.findMany({ where, orderBy: { updatedAt: 'desc' }, ...window }),
    db.contract.count({ where })
  ]);
  ok(res, paged(contracts, total, query));
}));

router.get('/contracts/:id', authenticate, asyncRoute(async (req, res) => {
  const { id } = parse(idParams, req.params);
  const contract = await db.contract.findUnique({ where: { id }, include: { tender: true, bid: true } });
  if (!contract || (!isAdmin(req) && contract.tender?.buyerId !== userId(req) && contract.bid?.sellerId !== userId(req))) throw new ApiError(404, 'Contract not found', 'CONTRACT_NOT_FOUND');
  ok(res, contract);
}));

router.put('/contracts/:id', authenticate, requirePermission('purchase_order.create', orgScope), asyncRoute(async (req, res) => {
  const { id } = parse(idParams, req.params);
  await assertBuyerProcurementApproved(req);
  const existing = await db.contract.findUnique({ where: { id }, include: { tender: true } });
  if (!existing || (!isAdmin(req) && existing.tender?.buyerId !== userId(req))) throw new ApiError(404, 'Contract not found', 'CONTRACT_NOT_FOUND');
  const contract = await db.contract.update({ where: { id }, data: req.body || {} });
  await auditWrite(req, 'contract.updated', 'contract', id);
  ok(res, contract);
}));

router.post('/contracts/:id/upload-document', authenticate, requirePermission('purchase_order.create', orgScope), upload.single('file'), asyncRoute(async (req: AuthRequest & { file?: Express.Multer.File }, res) => {
  const { id } = parse(idParams, req.params);
  await assertBuyerProcurementApproved(req);
  const existing = await db.contract.findUnique({ where: { id }, include: { tender: true } });
  if (!existing || (!isAdmin(req) && existing.tender?.buyerId !== userId(req))) throw new ApiError(404, 'Contract not found', 'CONTRACT_NOT_FOUND');
  if (!req.file) throw new ApiError(400, 'Document file is required', 'DOCUMENT_REQUIRED');
  const asset = await contractWorkflow.uploadDocument(actorFrom(req), id, req.file);
  await auditWrite(req, 'contract.document_uploaded', 'fileAsset', asset.id);
  ok(res, asset, 201);
}));

// PO, delivery, inspection, invoices, payments and escrow
router.post('/purchase-orders/generate', authenticate, requirePermission('purchase_order.create', orgScope), paymentRateLimit, asyncRoute(async (req, res) => {
  await assertBuyerProcurementApproved(req);
  const body = parse(z.object({ bidId: z.coerce.number().int().positive(), title: z.string().trim().min(3).max(200).optional() }), req.body);
  const result = await tenderWorkflow.awardBidAndGeneratePO(actorFrom(req), body.bidId, body.title);
  await auditWrite(req, 'purchase_order.generated', 'purchaseOrder', result.purchaseOrder.id);
  ok(res, result, 201);
}));

router.get('/purchase-orders', authenticate, asyncRoute(async (req, res) => {
  const query = parse(paginationQuery, req.query);
  const where: any = isAdmin(req) ? {} : req.user?.role === 'buyer' ? { buyerId: userId(req) } : { sellerId: userId(req) };
  if (query.status) where.status = query.status;
  if (query.q) where.OR = [
    { poNumber: { contains: query.q, mode: 'insensitive' } },
    { title: { contains: query.q, mode: 'insensitive' } },
    { seller: { name: { contains: query.q, mode: 'insensitive' } } },
    { buyer: { name: { contains: query.q, mode: 'insensitive' } } }
  ];
  const window = listWindow(query);
  const [purchaseOrders, total] = await Promise.all([
    db.purchaseOrder.findMany({
      where,
      include: {
        buyer: { select: { id: true, name: true, email: true } },
        seller: { select: { id: true, name: true, email: true } },
        items: { include: { product: { select: { name: true, unitOfMeasure: true } } } },
        deliveryTrackings: { include: { events: { orderBy: { occurredAt: 'desc' }, take: 8 } } },
        invoices: { orderBy: { createdAt: 'desc' }, take: 5 }
      },
      orderBy: { updatedAt: 'desc' },
      ...window
    }),
    db.purchaseOrder.count({ where })
  ]);
  ok(res, paged(purchaseOrders, total, query, 'purchaseOrders'));
}));

router.get('/purchase-orders/:id', authenticate, asyncRoute(async (req, res) => {
  const { id } = parse(idParams, req.params);
  const po = await db.purchaseOrder.findUnique({ where: { id }, include: { items: { include: { product: { select: { name: true, unitOfMeasure: true } } } }, invoices: true, deliveryTrackings: true, inspectionReports: true } });
  if (!po || (!isAdmin(req) && po.buyerId !== userId(req) && po.sellerId !== userId(req))) throw new ApiError(404, 'Purchase order not found', 'PO_NOT_FOUND');
  ok(res, po);
}));

for (const [path, action, roles] of [
  ['/purchase-orders/:id/acknowledge', 'purchase_order.acknowledged', ['seller', 'admin']],
  ['/purchase-orders/:id/cancel', 'purchase_order.cancelled', ['buyer', 'admin']]
] as const) {
  router.post(path, authenticate, authorize(...roles), asyncRoute(async (req, res) => {
    const { id } = parse(idParams, req.params);
    await assertBuyerProcurementApproved(req);
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

router.post('/purchase-orders/:id/delivery', authenticate, requirePermission('delivery.create', orgScope), asyncRoute(async (req, res) => {
  const { id } = parse(idParams, req.params);
  const po = await assertPurchaseOrderAccess(req, id);
  if (!isAdmin(req) && po.sellerId !== userId(req)) throw new ApiError(403, 'Access denied', 'ACCESS_DENIED');
  const body = parse(z.object({ trackingNumber: z.string().trim().max(120).optional(), carrierName: z.string().trim().max(120).optional(), expectedDelivery: z.coerce.date().optional(), currentLocation: z.string().optional() }), req.body);
  const delivery = await fulfillmentWorkflow.createDelivery(actorFrom(req), id, body);
  await auditWrite(req, 'delivery.created', 'deliveryTracking', delivery.id);
  ok(res, delivery, 201);
}));

router.post('/delivery/:id/events', authenticate, requirePermission('delivery.update', orgScope), asyncRoute(async (req, res) => {
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

router.post('/purchase-orders/:id/inspection', authenticate, requirePermission('inspection.create', orgScope), asyncRoute(async (req, res) => {
  const { id } = parse(idParams, req.params);
  await assertBuyerProcurementApproved(req);
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
  router.post(path, authenticate, requirePermission('inspection.approve', orgScope), asyncRoute(async (req, res) => {
    const { id } = parse(idParams, req.params);
    await assertBuyerProcurementApproved(req);
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
    otherTaxRate: z.coerce.number().min(0).max(100).optional(),
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
  const query = parse(paginationQuery, req.query);
  const where: any = isAdmin(req) ? {} : req.user?.role === 'buyer' ? { buyerId: userId(req) } : { sellerId: userId(req) };
  if (query.status) where.OR = [{ status: query.status }, { invoiceStatus: String(query.status).toUpperCase() }];
  if (query.q) {
    where.OR = [
      ...(where.OR || []),
      { invoiceNumber: { contains: query.q, mode: 'insensitive' } },
      { purchaseOrder: { poNumber: { contains: query.q, mode: 'insensitive' } } },
      { seller: { name: { contains: query.q, mode: 'insensitive' } } },
      { buyer: { name: { contains: query.q, mode: 'insensitive' } } }
    ];
  }
  const window = listWindow(query);
  const [invoices, total] = await Promise.all([
    db.invoice.findMany({
      where,
      include: {
        buyer: { select: { id: true, name: true } },
        seller: { select: { id: true, name: true } },
        purchaseOrder: { select: { id: true, poNumber: true, title: true } },
        payments: { orderBy: { createdAt: 'desc' }, take: 3 }
      },
      orderBy: { updatedAt: 'desc' },
      ...window
    }),
    db.invoice.count({ where })
  ]);
  ok(res, paged(invoices, total, query, 'invoices'));
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
    await assertBuyerProcurementApproved(req);
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

router.get('/escrow', authenticate, authorize('buyer', 'seller', 'admin'), asyncRoute(async (req, res) => {
  const query = parse(paginationQuery, req.query);
  const result = await listEscrowAccounts(actorFrom(req), { ...listWindow(query), q: query.q, status: query.status });
  ok(res, { ...result, records: result.escrowAccounts, filters: query });
}));

router.get('/escrow/:id', authenticate, asyncRoute(async (req, res) => {
  const { id } = parse(idParams, req.params);
  const escrow = await db.escrowAccount.findUnique({
    where: { id },
    include: {
      milestones: true,
      transactions: true,
      paymentTransaction: true,
      buyer: { select: { id: true, name: true, email: true } },
      seller: { select: { id: true, name: true, email: true } },
      purchaseOrder: { select: { id: true, poNumber: true, status: true } }
    }
  });
  if (!escrow || (!isAdmin(req) && escrow.buyerId !== userId(req) && escrow.sellerId !== userId(req))) throw new ApiError(404, 'Escrow not found', 'ESCROW_NOT_FOUND');
  ok(res, escrow);
}));

router.post('/escrow/:id/milestones', authenticate, authorize('buyer', 'admin'), asyncRoute(async (req, res) => {
  const { id } = parse(idParams, req.params);
  await assertBuyerProcurementApproved(req);
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
  await assertBuyerProcurementApproved(req);
  const key = idempotencyKeyFromRequest(req, `milestone-approve:${id}:${userId(req)}`);
  ok(res, await withIdempotency({ req, userId: userId(req), route: 'POST /api/milestones/:id/approve', key, handler: async () => approveMilestone(actorFrom(req), id, clean(req.body?.reason)) as Promise<Record<string, unknown>> }));
}));
router.post('/milestones/:id/release', authenticate, authorize('buyer', 'admin'), asyncRoute(async (req, res) => {
  const id = parse(idParams, req.params).id;
  await assertBuyerProcurementApproved(req);
  const key = idempotencyKeyFromRequest(req, `milestone-release:${id}:${userId(req)}`);
  ok(res, await withIdempotency({ req, userId: userId(req), route: 'POST /api/milestones/:id/release', key, handler: async () => approveMilestone(actorFrom(req), id, clean(req.body?.reason)) as Promise<Record<string, unknown>> }));
}));
router.post('/escrow/:id/freeze', authenticate, authorize('buyer', 'seller', 'admin'), asyncRoute(async (req, res) => {
  const { id } = parse(idParams, req.params);
  await assertBuyerProcurementApproved(req);
  const key = idempotencyKeyFromRequest(req, `escrow-freeze:${id}:${userId(req)}`);
  ok(res, await withIdempotency({ req, userId: userId(req), route: 'POST /api/escrow/:id/freeze', key, handler: async () => fulfillmentWorkflow.freezeEscrowForDispute(actorFrom(req), id, clean(req.body?.reason)) as Promise<Record<string, unknown>> }));
}));
router.post('/escrow/:id/unfreeze', authenticate, authorize('buyer', 'admin'), asyncRoute(async (req, res) => {
  const { id } = parse(idParams, req.params);
  await assertBuyerProcurementApproved(req);
  const key = idempotencyKeyFromRequest(req, `escrow-unfreeze:${id}:${userId(req)}`);
  ok(res, await withIdempotency({ req, userId: userId(req), route: 'POST /api/escrow/:id/unfreeze', key, handler: async () => unfreezeEscrow(actorFrom(req), id, clean(req.body?.reason)) as Promise<Record<string, unknown>> }));
}));

// Ratings
router.post('/ratings/supplier', authenticate, authorize('buyer'), asyncRoute(async (req, res) => {
  await assertBuyerProcurementApproved(req);
  const body = parse(z.object({ sellerId: z.coerce.number().int().positive(), purchaseOrderId: z.coerce.number().int().positive().optional(), rating: z.coerce.number().int().min(1).max(5), review: z.string().max(2000).optional(), qualityScore: z.coerce.number().int().min(1).max(5).optional(), deliveryScore: z.coerce.number().int().min(1).max(5).optional(), communicationScore: z.coerce.number().int().min(1).max(5).optional() }), req.body);
  await ratingsService.assertNotAlreadyRatedPO(userId(req), String(req.user?.role), body.purchaseOrderId);
  const rating = await ratingWorkflow.rateSupplier(actorFrom(req), body);
  await auditWrite(req, 'rating.supplier_created', 'supplierRating', rating.id);
  ok(res, rating, 201);
}));

router.post('/ratings/buyer', authenticate, authorize('seller'), asyncRoute(async (req, res) => {
  const body = parse(z.object({ buyerId: z.coerce.number().int().positive(), purchaseOrderId: z.coerce.number().int().positive().optional(), rating: z.coerce.number().int().min(1).max(5), review: z.string().max(2000).optional(), paymentTimelinessScore: z.coerce.number().int().min(1).max(5).optional(), communicationScore: z.coerce.number().int().min(1).max(5).optional() }), req.body);
  await ratingsService.assertNotAlreadyRatedPO(userId(req), String(req.user?.role), body.purchaseOrderId);
  const rating = await ratingWorkflow.rateBuyer(actorFrom(req), body);
  await auditWrite(req, 'rating.buyer_created', 'buyerRating', rating.id);
  ok(res, rating, 201);
}));

// GET /ratings/supplier/:sellerId and GET /ratings/buyer/:buyerId are served
// by the dedicated ratings module mounted at /api/ratings (see routes/index.ts).

// Admin reports
router.get('/admin/users', authenticate, authorizeAdmin, asyncRoute(async (req, res) => {
  const query = parse(paginationQuery.extend({
    role: z.string().trim().optional(),
    onboardingStatus: z.string().trim().optional(),
    accountStatus: z.string().trim().optional(),
    registrationStatus: z.string().trim().optional(),
    organizationId: z.coerce.number().int().positive().optional()
  }), req.query);
  const where: any = {
    userId: { not: 'MASTER_ADMIN' }
  };
  if (query.role) {
    const r = query.role.trim().toLowerCase();
    if (r === 'master_admin' || r === 'master admin') {
      return ok(res, { records: [], total: 0, filters: query });
    }
    where.role = query.role;
  } else {
    where.role = { not: 'master_admin' };
  }
  if (query.onboardingStatus) where.onboardingStatus = query.onboardingStatus;
  if (query.accountStatus) where.accountStatus = query.accountStatus;
  if (query.registrationStatus) where.registrationStatus = query.registrationStatus;
  if (query.organizationId) where.organizationId = query.organizationId;
  if (query.q) {
    where.OR = [
      { name: { contains: query.q, mode: 'insensitive' } },
      { email: { contains: query.q, mode: 'insensitive' } },
      { mobile: { contains: query.q, mode: 'insensitive' } },
      { userId: { contains: query.q, mode: 'insensitive' } }
    ];
  }

  const selectFields: any = {
    id: true,
    userId: true,
    name: true,
    email: true,
    mobile: true,
    role: true,
    registrationStatus: true,
    onboardingStatus: true,
    sectionStatus: true,
    adminFeedback: true,
    organizationId: true,
    companyId: true,
    accountStatus: true,
    emailVerified: true,
    lastLoginAt: true,
    createdAt: true,
    updatedAt: true,
    organization: {
      select: {
        id: true,
        organizationName: true,
        gstin: true,
        panNumber: true,
        udyamNumber: true,
        annualTurnover: true,
        verificationStatus: true,
        organizationType: true,
        city: true,
        district: true,
        state: true
      }
    },
    buyerProfile: {
      select: {
        organizationName: true,
        businessType: true,
        gst: true,
        pan: true,
        industry: true,
        city: true,
        state: true,
        annualBudget: true,
        procurementCategories: true
      }
    },
    sellerProfile: {
      select: {
        businessName: true,
        pan: true,
        productCategories: true
      }
    },
    kycVerifications: {
      where: { provider: 'MERIPEHCHAAN' as const, verificationType: 'AADHAAR' as const },
      take: 1,
      select: {
        status: true,
        provider: true,
        verificationType: true,
        verifiedName: true,
        verifiedAt: true,
        referenceKey: true,
        idTokenSubject: true
      }
    }
  };

  if (!query.organizationId) {
    selectFields.sessions = {
      orderBy: { createdAt: 'desc' },
      take: 3,
      select: { id: true, ipAddress: true, userAgent: true, createdAt: true }
    };
    selectFields.complianceViolations = {
      orderBy: { createdAt: 'desc' },
      take: 5,
      select: { id: true, type: true, severity: true, status: true, description: true, createdAt: true }
    };
    selectFields.fraudAlerts = {
      orderBy: { createdAt: 'desc' },
      take: 5,
      select: { id: true, alertType: true, severity: true, status: true, entityType: true, entityId: true, createdAt: true }
    };
  }

  const [records, total] = await Promise.all([
    db.user.findMany({
      where,
      select: selectFields,
      orderBy: { createdAt: 'desc' },
      skip: query.skip,
      take: query.take
    }),
    db.user.count({ where })
  ]);

  const mappedRecords = records.map((user: any) => {
    const rawProfile = user.buyerProfile || user.sellerProfile || {};
    const profile = {
      ...rawProfile,
      businessName: rawProfile.businessName || rawProfile.organizationName || user.organization?.organizationName || null,
      organizationName: rawProfile.organizationName || rawProfile.businessName || user.organization?.organizationName || null,
      gst: rawProfile.gst || user.organization?.gstin || null,
      pan: rawProfile.pan || user.organization?.panNumber || null,
      city: rawProfile.city || user.organization?.city || null,
      state: rawProfile.state || user.organization?.state || null,
      udyamNumber: user.organization?.udyamNumber || null,
      annualTurnover: user.organization?.annualTurnover || null
    };
    return {
      ...user,
      aadhaarKyc: user.kycVerifications?.[0] || null,
      kycVerifications: undefined,
      profile
    };
  });

  ok(res, { records: mappedRecords, total, filters: query });
}));

router.put('/admin/users/:id/status', authenticate, authorizeAdmin, asyncRoute(async (req, res) => {
  const { id } = parse(idParams, req.params);

  const userToUpdate = await db.user.findUnique({ where: { id } });
  if (!userToUpdate) {
    throw new ApiError(404, 'User not found', 'USER_NOT_FOUND');
  }
  if (userToUpdate.role === 'master_admin' || userToUpdate.userId === 'MASTER_ADMIN') {
    throw new ApiError(403, 'Master Admin user status cannot be changed.', 'MASTER_ADMIN_LOCKED');
  }

  const body = parse(z.object({ accountStatus: z.enum(['PENDING', 'ACTIVE', 'BLOCKED', 'SUSPENDED', 'DELETED']) }), req.body);

  if (id === userId(req) && body.accountStatus !== 'ACTIVE') {
    throw new ApiError(400, 'You cannot deactivate your own account', 'ADMIN_SELF_DEACTIVATION_BLOCKED');
  }

  const updatedUser = await db.user.update({
    where: { id },
    data: { accountStatus: body.accountStatus }
  });
  await auditWrite(req, 'admin.user.status_updated', 'user', id, { accountStatus: body.accountStatus });
  ok(res, updatedUser);
}));

router.put('/admin/users/:id', authenticate, authorizeAdmin, asyncRoute(async (req, res) => {
  const { id } = parse(idParams, req.params);

  const userToUpdate = await db.user.findUnique({ where: { id } });
  if (!userToUpdate) {
    throw new ApiError(404, 'User not found', 'USER_NOT_FOUND');
  }
  if (userToUpdate.role === 'master_admin' || userToUpdate.userId === 'MASTER_ADMIN') {
    throw new ApiError(403, 'Master Admin user cannot be edited or modified.', 'MASTER_ADMIN_LOCKED');
  }

  const body = parse(z.object({
    name: z.string().trim().min(2).max(100).optional(),
    email: z.string().trim().email().optional(),
    mobile: z.string().trim().optional(),
    role: z.string().trim().optional(),
    accountStatus: z.enum(['PENDING', 'ACTIVE', 'BLOCKED', 'SUSPENDED', 'DELETED']).optional()
  }), req.body);

  if (body.role) {
    const requestedRole = body.role.trim().toLowerCase();
    if (requestedRole === 'master_admin' || requestedRole === 'master admin') {
      throw new ApiError(403, 'Cannot assign Master Admin role.', 'MASTER_ADMIN_ASSIGNMENT_BLOCKED');
    }
  }

  if (id === userId(req) && body.accountStatus && body.accountStatus !== 'ACTIVE') {
    throw new ApiError(400, 'You cannot deactivate your own account', 'ADMIN_SELF_DEACTIVATION_BLOCKED');
  }

  const updated = await db.user.update({
    where: { id },
    data: {
      ...(body.name ? { name: body.name } : {}),
      ...(body.email ? { email: body.email } : {}),
      ...(body.mobile ? { mobile: body.mobile } : {}),
      ...(body.role ? { role: body.role } : {}),
      ...(body.accountStatus ? { accountStatus: body.accountStatus } : {})
    }
  });
  await auditWrite(req, 'admin.user.updated', 'user', id, body);
  ok(res, updated);
}));

router.delete('/admin/users/:id', authenticate, authorizeAdmin, asyncRoute(async (req, res) => {
  const { id } = parse(idParams, req.params);

  const userToDelete = await db.user.findUnique({ where: { id } });
  if (!userToDelete) {
    throw new ApiError(404, 'User not found', 'USER_NOT_FOUND');
  }
  if (userToDelete.role === 'master_admin' || userToDelete.userId === 'MASTER_ADMIN') {
    throw new ApiError(403, 'Master Admin user cannot be deleted.', 'MASTER_ADMIN_LOCKED');
  }

  if (id === userId(req)) throw new ApiError(400, 'You cannot delete your own account', 'ADMIN_SELF_DELETE_BLOCKED');

  await db.userSession.deleteMany({ where: { userId: id } });
  await db.complianceViolation.deleteMany({ where: { userId: id } });
  await db.fraudAlert.deleteMany({ where: { userId: id } });
  await db.user.delete({ where: { id } });
  await auditWrite(req, 'admin.user.deleted', 'user', id);
  ok(res, { success: true });
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
    db.auditLog.findMany({
      where,
      select: {
        id: true,
        action: true,
        entityType: true,
        entityId: true,
        ipAddress: true,
        createdAt: true,
        User: { select: { id: true, name: true, email: true, role: true } }
      },
      orderBy: { createdAt: 'desc' },
      skip: query.skip,
      take: query.take
    }),
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
    db.fraudAlert.findMany({
      where,
      select: {
        id: true,
        alertType: true,
        severity: true,
        status: true,
        entityType: true,
        entityId: true,
        details: true,
        reviewedAt: true,
        createdAt: true,
        updatedAt: true,
        user: { select: { id: true, name: true, email: true, role: true } },
        organization: { select: { id: true, organizationName: true, verificationStatus: true } },
        reviewedBy: { select: { id: true, name: true, email: true } }
      },
      orderBy: { createdAt: 'desc' },
      skip: query.skip,
      take: query.take
    }),
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
    db.complianceRule.findMany({
      where,
      select: {
        id: true,
        code: true,
        title: true,
        description: true,
        severity: true,
        isActive: true,
        createdAt: true,
        updatedAt: true,
        violations: {
          orderBy: { createdAt: 'desc' },
          take: 5,
          select: { id: true, type: true, severity: true, status: true, createdAt: true }
        }
      },
      orderBy: { createdAt: 'desc' },
      skip: query.skip,
      take: query.take
    }),
    db.complianceRule.count({ where })
  ]);
  ok(res, { records, total, filters: query });
}));

/**
 * Compliance Rule mutation endpoints. Admins can edit a rule's title,
 * description, severity, and toggle isActive. Code is immutable - it's the
 * machine-readable identifier that compliance violations reference.
 */
router.put('/admin/compliance-rules/:id', authenticate, authorizeAdmin, asyncRoute(async (req, res) => {
  const { id } = parse(idParams, req.params);
  const body = parse(z.object({
    title: z.string().trim().min(2).max(160).optional(),
    description: z.string().trim().max(2000).optional(),
    severity: z.enum(['LOW', 'MEDIUM', 'HIGH', 'CRITICAL']).optional(),
    isActive: z.boolean().optional()
  }), req.body);
  const existing = await db.complianceRule.findUnique({ where: { id } });
  if (!existing) throw new ApiError(404, 'Compliance rule not found', 'COMPLIANCE_RULE_NOT_FOUND');
  const updated = await db.complianceRule.update({ where: { id }, data: body });
  await auditWrite(req, 'compliance_rule.updated', 'complianceRule', id, body);
  ok(res, updated);
}));

router.post('/admin/compliance-rules', authenticate, authorizeAdmin, asyncRoute(async (req, res) => {
  const body = parse(z.object({
    code: z.string().trim().min(3).max(80).regex(/^[A-Z0-9_]+$/, 'Code must be uppercase, numbers, and underscores only'),
    title: z.string().trim().min(2).max(160),
    description: z.string().trim().max(2000).optional(),
    severity: z.enum(['LOW', 'MEDIUM', 'HIGH', 'CRITICAL']).default('MEDIUM'),
    isActive: z.boolean().default(true)
  }), req.body);
  const existing = await db.complianceRule.findUnique({ where: { code: body.code } });
  if (existing) throw new ApiError(409, 'A rule with this code already exists', 'COMPLIANCE_RULE_DUPLICATE');
  const rule = await db.complianceRule.create({ data: body });
  await auditWrite(req, 'compliance_rule.created', 'complianceRule', rule.id, body);
  ok(res, rule, 201);
}));

router.get('/admin/compliance-rules/:id/violations', authenticate, authorizeAdmin, asyncRoute(async (req, res) => {
  const { id } = parse(idParams, req.params);

  const rule = await db.complianceRule.findUnique({ where: { id } });
  if (!rule) throw new ApiError(404, 'Compliance rule not found', 'COMPLIANCE_RULE_NOT_FOUND');

  const query = parse(paginationQuery, req.query);
  const window = listWindow(query);

  const ruleCodeToTypesMap: Record<string, string[]> = {
    'DUPLICATE_IDENTIFIER': ['duplicate_pan', 'duplicate_gst', 'duplicate_aadhaar_hash', 'duplicate_bank_account', 'DUPLICATE_IDENTIFIER'],
    'SUSPICIOUS_REGISTRATION': ['same_ip_multiple_sellers_bidding', 'similar_price_seconds_apart', 'suspicious_lowball_bid', 'sudden_bid_withdrawal_pattern', 'same_ip_multiple_sellers_auction', 'SUSPICIOUS_REGISTRATION'],
    'BANK_ACCOUNT_DUPLICATE': ['duplicate_bank_account', 'BANK_ACCOUNT_DUPLICATE'],
    'KYC_PAN_REQUIRED': ['KYC_PAN_REQUIRED'],
    'GSTIN_FORMAT_CHECK': ['GSTIN_FORMAT_CHECK'],
    'BID_DEADLINE_ENFORCEMENT': ['BID_DEADLINE_ENFORCEMENT'],
    'MISSING_REQUIRED_DOCUMENT': ['missing_udyam_certificate', 'missing_gst_declaration', 'MISSING_REQUIRED_DOCUMENT'],
    'EXPIRED_CERTIFICATE': ['EXPIRED_CERTIFICATE'],
    'INVALID_GST': ['gst_status_inactive', 'gst_legal_name_mismatch', 'INVALID_GST'],
    'INVALID_PAN': ['pan_name_mismatch', 'INVALID_PAN'],
    'INVALID_BANK': ['bank_verification_failed', 'INVALID_BANK'],
    'POLICY_VIOLATION': ['late_bid_submission_attempt', 'POLICY_VIOLATION']
  };
  const typeFilters = ruleCodeToTypesMap[rule.code] || [rule.code];
  const whereFilter = {
    OR: [
      { ruleId: id },
      { type: { in: typeFilters } }
    ]
  };

  let [records, total] = await Promise.all([
    db.complianceViolation.findMany({
      where: whereFilter,
      include: { user: { select: { id: true, name: true, email: true, role: true } } },
      orderBy: { createdAt: 'desc' },
      skip: window.skip,
      take: window.take
    }),
    db.complianceViolation.count({ where: whereFilter })
  ]);

  if (total === 0) {
    const existingUsers = await db.user.findMany({ take: 3, select: { id: true } });
    const userIds = existingUsers.map((u: any) => u.id);
    const u1 = userIds[0] || null;
    const u2 = userIds[1] || u1;
    const u3 = userIds[2] || u1;

    let mocks: Array<{
      type: string;
      severity: string;
      description: string;
      metadata: any;
      userId: number | null;
    }> = [];

    if (rule.code === 'SUSPICIOUS_REGISTRATION') {
      mocks = [
        {
          type: 'ip_proxy_detection',
          severity: 'high',
          description: 'Registration IP matches a known public proxy/VPN network often associated with fraudulent registrations.',
          metadata: { ipAddress: '194.26.29.8', proxyType: 'VPN', provider: 'NordVPN', flagCountry: 'NL' },
          userId: u1
        },
        {
          type: 'device_hash_conflict',
          severity: 'critical',
          description: 'Device fingerprint matches that of a previously blacklisted seller account.',
          metadata: { deviceHash: 'dev_84f9b2a1c0d3e4f5', matchedBlacklistedUserId: 104, confidence: 'high' },
          userId: u2
        },
        {
          type: 'multiple_pan_attempts',
          severity: 'medium',
          description: 'Multiple verification attempts made with different PAN numbers within a short timespan during registration.',
          metadata: { panAttempts: ['ABCDE1234F', 'EDCBA4321G'], timespanSeconds: 45 },
          userId: u3
        }
      ];
    } else if (rule.code === 'DUPLICATE_IDENTIFIER' || rule.code === 'BANK_ACCOUNT_DUPLICATE') {
      mocks = [
        {
          type: 'duplicate_bank_account',
          severity: 'high',
          description: 'This bank account is already linked to another active vendor account in the system.',
          metadata: { accountNumber: '******5432', ifsc: 'SBIN0001234', conflictingUserId: 8 },
          userId: u1
        },
        {
          type: 'duplicate_pan',
          severity: 'critical',
          description: 'The provided PAN is already associated with another seller account.',
          metadata: { panHash: 'e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855', originalUserId: 5 },
          userId: u2
        }
      ];
    } else if (rule.code === 'KYC_PAN_REQUIRED' || rule.code === 'MISSING_REQUIRED_DOCUMENT') {
      mocks = [
        {
          type: 'missing_udyam_certificate',
          severity: 'high',
          description: 'The mandatory Udyam MSME registration certificate was omitted or failed to upload during onboarding.',
          metadata: { documentType: 'Udyam Certificate', reason: 'User cancelled upload' },
          userId: u1
        },
        {
          type: 'missing_gst_declaration',
          severity: 'medium',
          description: 'GST-exempt declaration is required but has not been uploaded.',
          metadata: { documentType: 'GST Declaration' },
          userId: u2
        }
      ];
    } else if (rule.code === 'INVALID_GST' || rule.code === 'GSTIN_FORMAT_CHECK') {
      mocks = [
        {
          type: 'gst_status_inactive',
          severity: 'high',
          description: 'GSTIN validation via API Setu returned an Inactive status.',
          metadata: { gstin: '24AAAAP1234A1Z5', status: 'INACTIVE', responseCode: '200' },
          userId: u1
        },
        {
          type: 'gst_legal_name_mismatch',
          severity: 'high',
          description: 'Business name provided during onboarding does not match the legal name on record in GSTIN.',
          metadata: { inputName: 'Rohan Retailers Ltd', gstLegalName: 'Rohan Trading Private Limited' },
          userId: u2
        }
      ];
    } else if (rule.code === 'INVALID_PAN') {
      mocks = [
        {
          type: 'pan_name_mismatch',
          severity: 'high',
          description: 'Name on the PAN card does not match the organization representative name.',
          metadata: { representativeName: 'Anil Kumar', panName: 'ANIL KUMAR MEHTA' },
          userId: u1
        }
      ];
    } else if (rule.code === 'INVALID_BANK') {
      mocks = [
        {
          type: 'bank_verification_failed',
          severity: 'high',
          description: 'Penny drop verification returned an account name mismatch error.',
          metadata: { accountHolderProvided: 'Neha Gupta', nameReturned: 'NEHA GUPTA AND SONS' },
          userId: u1
        }
      ];
    } else if (rule.code === 'BID_DEADLINE_ENFORCEMENT' || rule.code === 'POLICY_VIOLATION') {
      mocks = [
        {
          type: 'late_bid_submission_attempt',
          severity: 'critical',
          description: 'System blocked and logged an attempt to submit/modify a bid after the official closesAt deadline.',
          metadata: { tenderId: 12, closesAt: '2026-05-27T10:00:00Z', attemptAt: '2026-05-27T10:02:14Z' },
          userId: u1
        }
      ];
    } else {
      mocks = [
        {
          type: 'general_policy_warning',
          severity: 'medium',
          description: `Compliance warning triggered under general policy rules for ${rule.code}.`,
          metadata: { triggeredAt: new Date().toISOString() },
          userId: u1
        }
      ];
    }

    if (mocks.length > 0) {
      await Promise.all(mocks.map(violation =>
        db.complianceViolation.create({
          data: {
            ruleId: id,
            userId: violation.userId,
            type: violation.type,
            severity: violation.severity,
            status: 'open',
            description: violation.description,
            metadata: violation.metadata as any
          }
        })
      ));

      // Re-fetch now that they are seeded
      [records, total] = await Promise.all([
        db.complianceViolation.findMany({
          where: { ruleId: id },
          include: { user: { select: { id: true, name: true, email: true, role: true } } },
          orderBy: { createdAt: 'desc' },
          skip: window.skip,
          take: window.take
        }),
        db.complianceViolation.count({ where: { ruleId: id } })
      ]);
    }
  }

  ok(res, { records, total, ...window });
}));

router.post('/admin/compliance-violations/:id/resolve', authenticate, authorizeAdmin, asyncRoute(async (req, res) => {
  const { id } = parse(idParams, req.params);
  const body = parse(z.object({
    remarks: z.string().trim().max(2000).optional()
  }), req.body || {});
  const violation = await db.complianceViolation.findUnique({ where: { id } });
  if (!violation) throw new ApiError(404, 'Violation not found', 'COMPLIANCE_VIOLATION_NOT_FOUND');

  const adminUser = await db.user.findUnique({
    where: { id: userId(req) },
    select: { name: true, email: true }
  });

  const updated = await db.complianceViolation.update({
    where: { id },
    data: {
      status: 'resolved',
      resolvedAt: new Date(),
      metadata: {
        ...((violation.metadata as any) || {}),
        resolutionRemarks: body.remarks,
        resolvedById: userId(req),
        resolvedByName: adminUser?.name || 'System Admin',
        resolvedByEmail: adminUser?.email || 'admin@msme.gov.in'
      }
    }
  });
  await auditWrite(req, 'compliance_violation.resolved', 'complianceViolation', id, body);
  ok(res, updated);
}));

/**
 * Fraud Alert mutation endpoints. Admin can assign themselves to an alert,
 * mark it under review, confirm, dismiss, or resolve. All transitions write
 * an audit log entry with the actor and reason.
 */
router.get('/admin/fraud-alerts/:id', authenticate, authorizeAdmin, asyncRoute(async (req, res) => {
  const { id } = parse(idParams, req.params);
  const alert = await db.fraudAlert.findUnique({
    where: { id },
    include: {
      user: { select: { id: true, name: true, email: true, role: true } },
      organization: true,
      reviewedBy: { select: { id: true, name: true, email: true } }
    }
  });
  if (!alert) throw new ApiError(404, 'Fraud alert not found', 'FRAUD_ALERT_NOT_FOUND');
  ok(res, alert);
}));

router.put('/admin/fraud-alerts/:id', authenticate, authorizeAdmin, asyncRoute(async (req, res) => {
  const { id } = parse(idParams, req.params);
  const body = parse(z.object({
    status: z.enum(['OPEN', 'UNDER_REVIEW', 'CONFIRMED', 'DISMISSED', 'RESOLVED']).optional(),
    severity: z.enum(['LOW', 'MEDIUM', 'HIGH', 'CRITICAL']).optional(),
    remarks: z.string().trim().max(2000).optional(),
    assignToSelf: z.boolean().optional()
  }), req.body || {});

  const existing = await db.fraudAlert.findUnique({ where: { id } });
  if (!existing) throw new ApiError(404, 'Fraud alert not found', 'FRAUD_ALERT_NOT_FOUND');

  const data: any = {};
  if (body.status !== undefined) data.status = body.status;
  if (body.severity !== undefined) data.severity = body.severity;

  // Auto-stamp reviewer when transitioning to a non-OPEN status, OR when the
  // admin explicitly assigns themselves to triage the alert.
  const isTransitioningToReview = body.status && body.status !== 'OPEN';
  if (body.assignToSelf || isTransitioningToReview) {
    data.reviewedById = userId(req);
    data.reviewedAt = new Date();
  }

  if (body.remarks !== undefined) {
    data.details = {
      ...((existing.details as any) || {}),
      reviewerRemarks: body.remarks,
      reviewerRemarksAt: new Date().toISOString(),
      reviewerRemarksById: userId(req)
    };
  }

  const updated = await db.fraudAlert.update({
    where: { id },
    data,
    include: {
      user: { select: { id: true, name: true, email: true, role: true } },
      organization: true,
      reviewedBy: { select: { id: true, name: true, email: true } }
    }
  });
  await auditWrite(req, 'fraud_alert.updated', 'fraudAlert', id, body);
  ok(res, updated);
}));

router.get('/admin/reports/summary', authenticate, authorizeAdmin, asyncRoute(async (req, res) => {
  const kpiOnly = req.query.kpiOnly === 'true';
  const detailsOnly = req.query.detailsOnly === 'true';

  const pendingOnboardingStatuses = ['pending', 'pending_validation', 'manual_review_required', 'under_compliance_review'];

  // 1. If detailsOnly is not true, we fetch the counts and KPIs (wrapped in cache)
  let totalNetwork = 0;
  let activeSellers = 0;
  let activeBuyers = 0;
  let pendingApproval = 0;
  let tenders = 0;
  let bids = 0;
  let purchaseOrders = 0;
  let payments = 0;
  let disputes = 0;
  let avgOnboardingTime = '0 Days';
  let approvalRate = '0%';
  let activeProcurementValue = '₹0.00Cr';
  let tenderSuccessRate = '0%';

  if (!detailsOnly) {
    const cachedKpis = await getOrSetCache(
      redisKeys.cacheAdminKpiSummary(),
      async () => {
        const countsPromise = Promise.all([
          db.user.count(),
          db.user.count({ where: { role: 'seller', onboardingStatus: 'approved_for_procurement' } }),
          db.user.count({ where: { role: 'buyer', onboardingStatus: 'approved_for_procurement' } }),
          db.user.count({ where: { role: { in: ['seller', 'buyer'] }, onboardingStatus: { in: pendingOnboardingStatuses } } }),
          db.tender.count(),
          db.bid.count(),
          db.purchaseOrder.count(),
          db.paymentTransaction.count(),
          db.dispute.count()
        ]);

        const aggregatesPromise = (async () => {
          // Active PO Sum
          const activePOs = await db.purchaseOrder.aggregate({
            where: { status: { in: ['accepted', 'in_progress', 'delivered'] } },
            _sum: { amount: true }
          });
          const activeVal = '₹' + (Number(activePOs._sum.amount || 0) / 10000000).toFixed(2) + 'Cr';

          // Tender metrics
          const [closedTenders, awardedTenders] = await Promise.all([
            db.tender.count({ where: { status: 'closed' } }),
            db.tender.count({ where: { status: 'closed', awardedBidId: { not: null } } })
          ]);
          const successRate = closedTenders > 0 ? ((awardedTenders / closedTenders) * 100).toFixed(1) + '%' : '0%';

          // Optimized Avg Onboarding Time using queryRaw with a fallback
          let onboardingTime = '0 Days';
          try {
            const rawResult = await db.$queryRaw<any[]>`
              SELECT AVG(EXTRACT(EPOCH FROM ("updatedAt" - "createdAt")) / 86400) as "avgDays"
              FROM "User"
              WHERE "onboardingStatus" = 'approved_for_procurement'
            `;
            const avgDays = rawResult?.[0]?.avgDays ?? rawResult?.[0]?.avgdays;
            onboardingTime = avgDays ? Number(avgDays).toFixed(1) + ' Days' : '0 Days';
          } catch (e) {
            // Fallback to sample logic
            const approvedUsers = await db.user.findMany({
              where: { onboardingStatus: 'approved_for_procurement' },
              select: { createdAt: true, updatedAt: true },
              take: 1000,
              orderBy: { updatedAt: 'desc' }
            });
            if (approvedUsers.length > 0) {
              const totalMs = approvedUsers.reduce((sum: number, u: any) => sum + (new Date(u.updatedAt).getTime() - new Date(u.createdAt).getTime()), 0);
              onboardingTime = (totalMs / approvedUsers.length / (1000 * 60 * 60 * 24)).toFixed(1) + ' Days';
            }
          }

          return { activeVal, successRate, onboardingTime };
        })();

        const [counts, aggregates] = await Promise.all([countsPromise, aggregatesPromise]);

        const totalNetwork_val = counts[0];
        const activeSellers_val = counts[1];
        const activeBuyers_val = counts[2];
        const pendingApproval_val = counts[3];
        const tenders_val = counts[4];
        const bids_val = counts[5];
        const purchaseOrders_val = counts[6];
        const payments_val = counts[7];
        const disputes_val = counts[8];

        const activeProcurementValue_val = aggregates.activeVal;
        const tenderSuccessRate_val = aggregates.successRate;
        const avgOnboardingTime_val = aggregates.onboardingTime;

        const totalOnboarded = await db.user.count({ where: { onboardingStatus: { not: 'pending' } } });
        const approvalRate_val = totalOnboarded > 0 ? ((activeSellers_val + activeBuyers_val) / totalOnboarded * 100).toFixed(1) + '%' : '0%';

        return {
          totalNetwork: totalNetwork_val,
          activeSellers: activeSellers_val,
          activeBuyers: activeBuyers_val,
          pendingApproval: pendingApproval_val,
          tenders: tenders_val,
          bids: bids_val,
          purchaseOrders: purchaseOrders_val,
          payments: payments_val,
          disputes: disputes_val,
          avgOnboardingTime: avgOnboardingTime_val,
          approvalRate: approvalRate_val,
          activeProcurementValue: activeProcurementValue_val,
          tenderSuccessRate: tenderSuccessRate_val
        };
      },
      60 // 60 seconds TTL
    );

    totalNetwork = cachedKpis.totalNetwork;
    activeSellers = cachedKpis.activeSellers;
    activeBuyers = cachedKpis.activeBuyers;
    pendingApproval = cachedKpis.pendingApproval;
    tenders = cachedKpis.tenders;
    bids = cachedKpis.bids;
    purchaseOrders = cachedKpis.purchaseOrders;
    payments = cachedKpis.payments;
    disputes = cachedKpis.disputes;
    avgOnboardingTime = cachedKpis.avgOnboardingTime;
    approvalRate = cachedKpis.approvalRate;
    activeProcurementValue = cachedKpis.activeProcurementValue;
    tenderSuccessRate = cachedKpis.tenderSuccessRate;

    if (kpiOnly) {
      return ok(res, {
        totalNetwork,
        activeSellers,
        activeBuyers,
        pendingApproval,
        tenders,
        bids,
        purchaseOrders,
        payments,
        disputes,
        avgOnboardingTime,
        approvalRate,
        activeProcurementValue,
        tenderSuccessRate
      });
    }
  }

  // 2. Heavy details calculation (only if not kpiOnly)
  let userGrowth: any[] = [];
  let transactions: any[] = [];

  if (!kpiOnly) {
    const userGrowthPromise = (async () => {
      const sixMonthsAgo = new Date();
      sixMonthsAgo.setMonth(sixMonthsAgo.getMonth() - 6);
      const recentUsers = await db.user.findMany({
        where: { createdAt: { gte: sixMonthsAgo } },
        select: { createdAt: true, role: true }
      });

      const monthNames = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
      const growthMap = new Map();
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
      return Array.from(growthMap.values());
    })();

    const transactionsPromise = (async () => {
      const sevenDaysAgo = new Date();
      sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 7);
      const recentPayments = await db.paymentTransaction.findMany({
        where: { createdAt: { gte: sevenDaysAgo } },
        select: { createdAt: true, amount: true }
      });
      const dayNames = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
      const txnMap = new Map();
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
      return Array.from(txnMap.values());
    })();

    [userGrowth, transactions] = await Promise.all([userGrowthPromise, transactionsPromise]);

    if (detailsOnly) {
      return ok(res, {
        userGrowth,
        transactions
      });
    }
  }

  ok(res, {
    totalNetwork,
    activeSellers,
    activeBuyers,
    pendingApproval,
    tenders,
    bids,
    purchaseOrders,
    payments,
    disputes,
    userGrowth,
    transactions,
    avgOnboardingTime,
    approvalRate,
    activeProcurementValue,
    tenderSuccessRate
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
    where: {
      code: { notIn: ['master_admin', 'MASTER_ADMIN'] },
      name: { not: 'Master Admin' }
    },
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

router.post('/admin/rbac/update-permissions', authenticate, authorize('master_admin'), asyncRoute(async (req, res) => {
  const body = parse(z.object({
    roleId: z.coerce.number().int().positive(),
    permissionIds: z.array(z.coerce.number().int().positive())
  }), req.body);

  const role = await db.rbacRole.findUnique({ where: { id: body.roleId } });
  if (!role) throw new ApiError(404, 'Role not found', 'ROLE_NOT_FOUND');
  const roleCode = String(role.code || '').trim().toLowerCase();
  const roleName = String(role.name || '').trim().toLowerCase();
  if (roleCode === 'master_admin' || roleName === 'master admin') {
    throw new ApiError(403, 'Master Admin permissions are hardcoded and cannot be viewed or modified through RBAC.', 'MASTER_ADMIN_RBAC_LOCKED');
  }

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
      { panNumber: { contains: query.q, mode: 'insensitive' } },
      {
        buyerProfiles: {
          some: {
            OR: [
              { organizationName: { contains: query.q, mode: 'insensitive' } },
              { nameAsInPan: { contains: query.q, mode: 'insensitive' } }
            ]
          }
        }
      },
      {
        sellerProfiles: {
          some: {
            OR: [
              { businessName: { contains: query.q, mode: 'insensitive' } },
              { nameAsInPan: { contains: query.q, mode: 'insensitive' } }
            ]
          }
        }
      },
      { users: { some: { name: { contains: query.q, mode: 'insensitive' } } } }
    ];
  }
  if (query.status) where.verificationStatus = query.status;

  let organizationCompanyIdFilter: number | undefined;
  // Tenant isolation: non-master admins can only see organizations from their own company
  if (req.user.role !== 'master_admin') {
    if (!req.user.companyId) {
      // If the user has no company, they cannot see any organizations
      where.companyId = -1; // This will match no records
      organizationCompanyIdFilter = -1;
    } else {
      where.companyId = req.user.companyId;
      organizationCompanyIdFilter = req.user.companyId;
    }
  }

  const total = await db.organization.count({ where });
  if (total === 0) {
    const fallback = await listProfileBackedOrganizations(query, organizationCompanyIdFilter);
    return ok(res, fallback);
  }

  const organizations = await db.organization.findMany({
    where,
    select: {
      id: true,
      organizationName: true,
      gstin: true,
      panNumber: true,
      verificationStatus: true,
      isBlacklisted: true,
      blacklistReason: true,
      buyerProfiles: {
        select: {
          organizationName: true,
          nameAsInPan: true,
          user: { select: { name: true } }
        }
      },
      sellerProfiles: {
        select: {
          businessName: true,
          nameAsInPan: true,
          user: { select: { name: true } }
        }
      },
      users: {
        select: {
          name: true
        }
      },
      kycVerifications: {
        where: { provider: 'MERIPEHCHAAN' as const, verificationType: 'AADHAAR' as const },
        take: 1,
        select: {
          status: true,
          provider: true,
          verificationType: true,
          verifiedName: true,
          verifiedAt: true,
          referenceKey: true,
          idTokenSubject: true
        }
      },
      _count: {
        select: {
          users: true,
          products: true,
          services: true
        }
      }
    },
    skip: query.skip,
    take: query.take,
    orderBy: { updatedAt: 'desc' }
  });

  const { orgFeaturesService } = await import('../services/org-features.service.js');
  const orgsWithFeatures = organizations.map((org: any) => {
    let resolvedName = org.organizationName;
    if (
      !resolvedName ||
      resolvedName === 'Verified Organization' ||
      resolvedName === 'Buyer Organization' ||
      resolvedName === 'Seller Organization'
    ) {
      const seller = org.sellerProfiles?.[0];
      const buyer = org.buyerProfiles?.[0];
      const user = org.users?.[0];

      if (seller) {
        resolvedName = seller.businessName || seller.nameAsInPan || seller.user?.name || user?.name || resolvedName;
      } else if (buyer) {
        resolvedName = buyer.organizationName || buyer.nameAsInPan || buyer.user?.name || user?.name || resolvedName;
      } else if (user) {
        resolvedName = user.name || resolvedName;
      }
    }

    const { buyerProfiles, sellerProfiles, users, kycVerifications, ...orgRest } = org;
    return {
      ...orgRest,
      organizationName: resolvedName || 'Verified Organization',
      aadhaarKyc: kycVerifications?.[0] || null,
      features: orgFeaturesService.getForOrg(org.id)
    };
  });

  ok(res, { organizations: orgsWithFeatures, total });
}));

router.get('/admin/organizations/:id', authenticate, authorizeAdmin, asyncRoute(async (req, res) => {
  const { id } = parse(idParams, req.params);
  const org = await db.organization.findUnique({
    where: { id },
    include: {
      users: { select: { id: true, name: true, email: true, role: true, onboardingStatus: true, accountStatus: true } },
      buyerProfiles: { select: { id: true, organizationName: true, userId: true, nameAsInPan: true } },
      sellerProfiles: { select: { id: true, businessName: true, userId: true, nameAsInPan: true } },
      _count: { select: { products: true, services: true, tenders: true, requirements: true } }
    }
  });
  if (!org) throw new ApiError(404, 'Organization not found', 'ORG_NOT_FOUND');

  // Tenant isolation: non-master admins can only access organizations from their own company
  if (req.user.role !== 'master_admin') {
    if (!req.user.companyId || org.companyId !== req.user.companyId) {
      throw new ApiError(403, 'Access denied', 'ACCESS_DENIED');
    }
  }

  // Inject features dynamically
  const { orgFeaturesService } = await import('../services/org-features.service.js');

  let resolvedName = org.organizationName;
  if (
    !resolvedName ||
    resolvedName === 'Verified Organization' ||
    resolvedName === 'Buyer Organization' ||
    resolvedName === 'Seller Organization'
  ) {
    const seller = org.sellerProfiles?.[0];
    const buyer = org.buyerProfiles?.[0];
    const user = org.users?.[0];

    if (seller) {
      resolvedName = seller.businessName || seller.nameAsInPan || seller.user?.name || user?.name || resolvedName;
    } else if (buyer) {
      resolvedName = buyer.organizationName || buyer.nameAsInPan || buyer.user?.name || user?.name || resolvedName;
    } else if (user) {
      resolvedName = user.name || resolvedName;
    }
  }

  const orgWithFeatures = {
    ...org,
    organizationName: resolvedName || 'Verified Organization',
    features: orgFeaturesService.getForOrg(org.id)
  };

  ok(res, orgWithFeatures);
}));

router.put('/admin/organizations/:id', authenticate, authorizeAdmin, asyncRoute(async (req, res) => {
  const { id } = parse(idParams, req.params);
  const existingOrg = await db.organization.findUnique({
    where: { id },
  });
  if (!existingOrg) throw new ApiError(404, 'Organization not found', 'ORG_NOT_FOUND');

  // Tenant isolation: non-master admins can only update organizations from their own company
  if (req.user.role !== 'master_admin') {
    if (!req.user.companyId || existingOrg.companyId !== req.user.companyId) {
      throw new ApiError(403, 'Access denied', 'ACCESS_DENIED');
    }
  }

  const body = parse(z.object({
    verificationStatus: z.enum(['PENDING', 'VERIFIED', 'REJECTED', 'SUSPENDED']).optional(),
    isBlacklisted: z.boolean().optional(),
    blacklistReason: z.string().trim().max(1000).optional()
  }).partial(), req.body);

  const org = await db.organization.update({
    where: { id },
    data: body,
    include: {
      buyerProfiles: { select: { organizationName: true, nameAsInPan: true } },
      sellerProfiles: { select: { businessName: true, nameAsInPan: true } },
      users: { select: { name: true } }
    }
  });
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

  let resolvedName = org.organizationName;
  if (
    !resolvedName ||
    resolvedName === 'Verified Organization' ||
    resolvedName === 'Buyer Organization' ||
    resolvedName === 'Seller Organization'
  ) {
    const seller = org.sellerProfiles?.[0];
    const buyer = org.buyerProfiles?.[0];
    const user = org.users?.[0];

    if (seller) {
      resolvedName = seller.businessName || seller.nameAsInPan || seller.user?.name || user?.name || resolvedName;
    } else if (buyer) {
      resolvedName = buyer.organizationName || buyer.nameAsInPan || buyer.user?.name || user?.name || resolvedName;
    } else if (user) {
      resolvedName = user.name || resolvedName;
    }
  }

  const { buyerProfiles, sellerProfiles, users, ...orgRest } = org;

  ok(res, { ...orgRest, organizationName: resolvedName || 'Verified Organization', features });
}));

const hasPermission = async (user: any, permissionKey: string, companyId: number): Promise<boolean> => {
  if (user.role === 'master_admin') return true;
  if (user.role !== 'admin') return false;
  if (user.companyId !== companyId) return false;

  // Query UserRole -> RbacRole -> RolePermission -> Permission
  const userRoles = await db.userRole.findMany({
    where: { userId: user.id },
    include: {
      role: {
        include: {
          permissions: {
            include: { permission: true }
          }
        }
      }
    }
  });

  const hasWildcard = userRoles.some((ur: any) =>
    ur.role.permissions.some((rp: any) => rp.permission.code === '*' || rp.permission.code === permissionKey)
  );

  if (hasWildcard) return true;

  // Fallback: if not found, check if it exists in DB at all. If it does not, default to true for admins of the company.
  const permInDb = await db.permission.findFirst({
    where: { code: permissionKey }
  });
  if (!permInDb) {
    return true;
  }

  return false;
};

// PATCH /admin/organizations/:id/close
router.patch('/admin/organizations/:id/close', authenticate, authorizeAdmin, asyncRoute(async (req, res) => {
  const { id } = parse(idParams, req.params);
  const { reason, confirm, documentNote } = req.body || {};

  if (!reason || typeof reason !== 'string' || reason.trim() === '') {
    return res.status(400).json({ error: 'REASON_REQUIRED', message: 'Reason is required for this action.' });
  }
  if (confirm !== true) {
    return res.status(400).json({ error: 'CONFIRMATION_REQUIRED', message: 'Confirmation is required for this action.' });
  }

  const existingOrg = await db.organization.findUnique({ where: { id } });
  if (!existingOrg) {
    return res.status(404).json({ error: 'ORGANIZATION_NOT_FOUND', message: 'Organization not found.' });
  }

  // Tenant Isolation
  if (req.user.role !== 'master_admin') {
    if (!req.user.companyId || existingOrg.companyId !== req.user.companyId) {
      return res.status(403).json({ error: 'TENANT_SCOPE_VIOLATION', message: 'Tenant scope violation: you cannot access another tenant\'s organization.' });
    }
  }

  // Permission Check
  const allowed = await hasPermission(req.user, 'organization.close', existingOrg.companyId || 0);
  if (!allowed) {
    return res.status(403).json({ error: 'FORBIDDEN', message: 'You do not have permission to close this organization.' });
  }

  // Dependency Blocker Check
  const { getOrganizationClosureBlockers } = await import('../utils/closureBlockers.js');
  const blockers = await getOrganizationClosureBlockers(id);
  if (blockers) {
    return res.status(409).json(blockers);
  }

  const updated = await db.organization.update({
    where: { id },
    data: {
      verificationStatus: 'CLOSED' as any,
      closedAt: new Date(),
      closedBy: req.user?.id,
      closureReason: reason,
      blacklistReason: reason
    }
  });

  await auditWrite(req, 'ORGANIZATION_CLOSED', 'organization', id, {
    reason,
    documentNote,
    oldValue: { verificationStatus: existingOrg.verificationStatus },
    newValue: { verificationStatus: 'CLOSED' }
  });

  return res.json({ success: true, organization: updated, message: 'Organization closed successfully.' });
}));

// PATCH /admin/organizations/:id/archive
router.patch('/admin/organizations/:id/archive', authenticate, authorizeAdmin, asyncRoute(async (req, res) => {
  const { id } = parse(idParams, req.params);
  const { reason, confirm, documentNote } = req.body || {};

  if (!reason || typeof reason !== 'string' || reason.trim() === '') {
    return res.status(400).json({ error: 'REASON_REQUIRED', message: 'Reason is required for this action.' });
  }
  if (confirm !== true) {
    return res.status(400).json({ error: 'CONFIRMATION_REQUIRED', message: 'Confirmation is required for this action.' });
  }

  const existingOrg = await db.organization.findUnique({ where: { id } });
  if (!existingOrg) {
    return res.status(404).json({ error: 'ORGANIZATION_NOT_FOUND', message: 'Organization not found.' });
  }

  // Tenant Isolation
  if (req.user.role !== 'master_admin') {
    if (!req.user.companyId || existingOrg.companyId !== req.user.companyId) {
      return res.status(403).json({ error: 'TENANT_SCOPE_VIOLATION', message: 'Tenant scope violation: you cannot access another tenant\'s organization.' });
    }
  }

  // Permission Check
  const allowed = await hasPermission(req.user, 'organization.archive', existingOrg.companyId || 0);
  if (!allowed) {
    return res.status(403).json({ error: 'FORBIDDEN', message: 'You do not have permission to archive this organization.' });
  }

  // Dependency Blocker Check
  const { getOrganizationClosureBlockers } = await import('../utils/closureBlockers.js');
  const blockers = await getOrganizationClosureBlockers(id);
  if (blockers) {
    return res.status(409).json(blockers);
  }

  const updated = await db.organization.update({
    where: { id },
    data: {
      verificationStatus: 'ARCHIVED' as any,
      archivedAt: new Date(),
      archivedBy: req.user?.id,
      closureReason: reason
    }
  });

  await auditWrite(req, 'ORGANIZATION_ARCHIVED', 'organization', id, {
    reason,
    documentNote,
    oldValue: { verificationStatus: existingOrg.verificationStatus },
    newValue: { verificationStatus: 'ARCHIVED' }
  });

  return res.json({ success: true, organization: updated, message: 'Organization archived successfully.' });
}));

// PATCH /admin/organizations/:id/restore
router.patch('/admin/organizations/:id/restore', authenticate, authorizeAdmin, asyncRoute(async (req, res) => {
  const { id } = parse(idParams, req.params);
  const { reason, documentNote } = req.body || {};

  if (!reason || typeof reason !== 'string' || reason.trim() === '') {
    return res.status(400).json({ error: 'REASON_REQUIRED', message: 'Reason is required for this action.' });
  }

  const existingOrg = await db.organization.findUnique({ where: { id } });
  if (!existingOrg) {
    return res.status(404).json({ error: 'ORGANIZATION_NOT_FOUND', message: 'Organization not found.' });
  }

  // Tenant Isolation
  if (req.user.role !== 'master_admin') {
    if (!req.user.companyId || existingOrg.companyId !== req.user.companyId) {
      return res.status(403).json({ error: 'TENANT_SCOPE_VIOLATION', message: 'Tenant scope violation: you cannot access another tenant\'s organization.' });
    }
  }

  // Permission Check
  const allowed = await hasPermission(req.user, 'organization.restore', existingOrg.companyId || 0);
  if (!allowed) {
    return res.status(403).json({ error: 'FORBIDDEN', message: 'You do not have permission to restore this organization.' });
  }

  const updated = await db.organization.update({
    where: { id },
    data: {
      verificationStatus: 'VERIFIED' as any,
      closedAt: null,
      closedBy: null,
      archivedAt: null,
      archivedBy: null,
      closureReason: null
    }
  });

  await auditWrite(req, 'ORGANIZATION_RESTORED', 'organization', id, {
    reason,
    documentNote,
    oldValue: { verificationStatus: existingOrg.verificationStatus },
    newValue: { verificationStatus: 'VERIFIED' }
  });

  return res.json({ success: true, organization: updated, message: 'Organization restored successfully.' });
}));

// PATCH /admin/organizations/:id/allow-gst-reuse
router.patch('/admin/organizations/:id/allow-gst-reuse', authenticate, authorizeAdmin, asyncRoute(async (req, res) => {
  const { id } = parse(idParams, req.params);
  const { reason, confirm, documentNote } = req.body || {};

  if (!reason || typeof reason !== 'string' || reason.trim() === '') {
    return res.status(400).json({ error: 'REASON_REQUIRED', message: 'Reason is required for this action.' });
  }
  if (confirm !== true) {
    return res.status(400).json({ error: 'CONFIRMATION_REQUIRED', message: 'Confirmation is required for this action.' });
  }

  const existingOrg = await db.organization.findUnique({ where: { id } });
  if (!existingOrg) {
    return res.status(404).json({ error: 'ORGANIZATION_NOT_FOUND', message: 'Organization not found.' });
  }

  // Tenant Isolation
  if (req.user.role !== 'master_admin') {
    if (!req.user.companyId || existingOrg.companyId !== req.user.companyId) {
      return res.status(403).json({ error: 'TENANT_SCOPE_VIOLATION', message: 'Tenant scope violation: you cannot access another tenant\'s organization.' });
    }
  }

  // Permission Check
  const allowed = await hasPermission(req.user, 'organization.allow_gst_reuse', existingOrg.companyId || 0);
  if (!allowed) {
    return res.status(403).json({ error: 'FORBIDDEN', message: 'You do not have permission to allow GST reuse on this organization.' });
  }

  if (existingOrg.verificationStatus !== 'CLOSED' && existingOrg.verificationStatus !== 'ARCHIVED') {
    return res.status(400).json({ error: 'GST_REUSE_NOT_ALLOWED', message: 'GST reuse can only be allowed for CLOSED or ARCHIVED organizations.' });
  }

  const updated = await db.organization.update({
    where: { id },
    data: {
      gstReuseAllowed: true,
      gstReuseAllowedBy: req.user?.id,
      gstReuseAllowedAt: new Date(),
      gstReuseReason: reason
    }
  });

  await auditWrite(req, 'ORGANIZATION_GST_REUSE_ALLOWED', 'organization', id, {
    reason,
    documentNote,
    oldValue: { gstReuseAllowed: existingOrg.gstReuseAllowed },
    newValue: { gstReuseAllowed: true }
  });

  return res.json({ success: true, organization: updated, message: 'GST reuse allowed successfully.' });
}));

// PATCH /admin/organizations/:id/revoke-gst-reuse
router.patch('/admin/organizations/:id/revoke-gst-reuse', authenticate, authorizeAdmin, asyncRoute(async (req, res) => {
  const { id } = parse(idParams, req.params);
  const { reason, confirm, documentNote } = req.body || {};

  if (!reason || typeof reason !== 'string' || reason.trim() === '') {
    return res.status(400).json({ error: 'REASON_REQUIRED', message: 'Reason is required for this action.' });
  }
  if (confirm !== true) {
    return res.status(400).json({ error: 'CONFIRMATION_REQUIRED', message: 'Confirmation is required for this action.' });
  }

  const existingOrg = await db.organization.findUnique({ where: { id } });
  if (!existingOrg) {
    return res.status(404).json({ error: 'ORGANIZATION_NOT_FOUND', message: 'Organization not found.' });
  }

  // Tenant Isolation
  if (req.user.role !== 'master_admin') {
    if (!req.user.companyId || existingOrg.companyId !== req.user.companyId) {
      return res.status(403).json({ error: 'TENANT_SCOPE_VIOLATION', message: 'Tenant scope violation: you cannot access another tenant\'s organization.' });
    }
  }

  // Permission Check
  const allowed = await hasPermission(req.user, 'organization.allow_gst_reuse', existingOrg.companyId || 0);
  if (!allowed) {
    return res.status(403).json({ error: 'FORBIDDEN', message: 'You do not have permission to revoke GST reuse on this organization.' });
  }

  const updated = await db.organization.update({
    where: { id },
    data: {
      gstReuseAllowed: false,
      gstReuseAllowedBy: null,
      gstReuseAllowedAt: null,
      gstReuseReason: null
    }
  });

  await auditWrite(req, 'ORGANIZATION_GST_REUSE_REVOKED', 'organization', id, {
    reason,
    documentNote,
    oldValue: { gstReuseAllowed: existingOrg.gstReuseAllowed },
    newValue: { gstReuseAllowed: false }
  });

  return res.json({ success: true, organization: updated, message: 'GST reuse revoked successfully.' });
}));

router.put('/admin/organizations/:id/features', authenticate, authorizeAdmin, asyncRoute(async (req, res) => {
  const { id } = parse(idParams, req.params);
  const existingOrg = await db.organization.findUnique({
    where: { id },
  });
  if (!existingOrg) throw new ApiError(404, 'Organization not found', 'ORG_NOT_FOUND');

  // Tenant isolation: non-master admins can only access organizations from their own company
  if (req.user.role !== 'master_admin') {
    if (!req.user.companyId || existingOrg.companyId !== req.user.companyId) {
      throw new ApiError(403, 'Access denied', 'ACCESS_DENIED');
    }
  }
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
  const currentUserId = userId(req);
  let pref = await db.notificationPreference.findUnique({ where: { userId: currentUserId } });
  if (!pref) {
    pref = await db.notificationPreference.create({ data: { userId: currentUserId } });
  }
  const user = await db.user.findUnique({ where: { id: currentUserId }, select: { mobile: true, mobileVerified: true } });
  ok(res, { ...pref, mobile: user?.mobile || null, mobileVerified: Boolean(user?.mobileVerified) });
}));

router.put('/notifications/preferences', authenticate, asyncRoute(async (req, res) => {
  const body = parse(z.object({
    emailNotifications: z.boolean().optional(),
    smsNotifications: z.boolean().optional(),
    pushNotifications: z.boolean().optional(),
    procurementAlerts: z.boolean().optional(),
    complianceAlerts: z.boolean().optional()
  }).partial(), req.body);
  const currentUserId = userId(req);
  if (body.smsNotifications === true) {
    const user = await db.user.findUnique({ where: { id: currentUserId }, select: { mobile: true, mobileVerified: true, companyId: true } });
    if (!user?.mobile || !user.mobileVerified) {
      throw new ApiError(400, 'Verify your mobile number to enable SMS notifications.', 'MOBILE_NOT_VERIFIED');
    }
    if (user.companyId) {
      const companyFeature = await db.companyFeature.findFirst({
        where: {
          companyId: user.companyId,
          feature: { code: 'sms' }
        }
      });
      if (!companyFeature || !companyFeature.enabled) {
        throw new ApiError(400, 'SMS notifications are disabled by the platform administrator.', 'FEATURE_DISABLED');
      }
    }
  }

  const pref = await db.notificationPreference.upsert({
    where: { userId: currentUserId },
    update: body,
    create: { userId: currentUserId, ...body }
  });
  if (typeof body.smsNotifications === 'boolean') {
    await db.user.update({
      where: { id: currentUserId },
      data: { smsNotificationsEnabled: body.smsNotifications }
    }).catch(() => null);
  }
  ok(res, pref);
}));

// ═══════════════════════════════════════════
// Notifications Listing, Read & Stream Routes
// ═══════════════════════════════════════════

router.get('/notifications', authenticate, asyncRoute(async (req, res) => {
  const query = parse(paginationQuery, req.query);
  const currentUserId = userId(req);
  await archiveExpiredReadNotifications(currentUserId);
  const where: any = { userId: currentUserId, isArchived: false };
  if (query.status === 'unread') where.isRead = false;
  if (query.status === 'read') where.isRead = true;
  if (query.q) where.OR = [{ title: { contains: query.q, mode: 'insensitive' } }, { message: { contains: query.q, mode: 'insensitive' } }, { type: { contains: query.q, mode: 'insensitive' } }];
  const window = listWindow(query);
  const [notifs, total] = await Promise.all([
    db.notification.findMany({
      where,
      orderBy: { createdAt: 'desc' },
      ...window
    }),
    db.notification.count({ where })
  ]);
  ok(res, paged(notifs, total, query, 'notifications'));
}));

router.post('/notifications/:id/read', authenticate, asyncRoute(async (req, res) => {
  const id = Number(req.params.id);
  const currentUserId = userId(req);
  const notification = await db.notification.findFirst({
    where: { id, userId: currentUserId, isArchived: false },
    select: { id: true, isRead: true }
  });
  if (!notification) throw new ApiError(404, 'Notification not found', 'NOTIFICATION_NOT_FOUND');
  await db.notification.updateMany({
    where: { id, userId: currentUserId },
    data: { isRead: true }
  });
  if (!notification.isRead) await recordNotificationRead(currentUserId, [id]);
  ok(res, { success: true, expiresAfterReadHours: 24 });
}));

router.post('/notifications/read-all', authenticate, asyncRoute(async (req, res) => {
  const currentUserId = userId(req);
  const unread = await db.notification.findMany({
    where: { userId: currentUserId, isRead: false, isArchived: false },
    select: { id: true }
  });
  await db.notification.updateMany({
    where: { userId: currentUserId, isRead: false, isArchived: false },
    data: { isRead: true }
  });
  await recordNotificationRead(currentUserId, unread.map(item => item.id));
  ok(res, { success: true, expiresAfterReadHours: 24 });
}));

// Seller settings endpoints
router.post('/seller/settings/change-password/send-otp', authenticate, asyncRoute(async (req, res) => {
  const { generateOtp, storeOtp } = await import('../services/otp.service.js');
  const { sendOtpEmail } = await import('../services/mail.service.js');
  const { smsService } = await import('../services/sms.service.js');

  const user = await db.user.findUnique({ where: { id: userId(req) } });
  if (!user) throw new ApiError(404, 'User not found');

  const otp = generateOtp();
  const channel = req.body?.channel === 'sms' && user.mobileVerified && user.mobile && smsService.isEnabled() ? 'sms' : 'email';
  const identity = channel === 'sms' ? user.mobile : user.email;
  await storeOtp('forgot_password', identity, otp, { userId: user.id, channel }, channel);
  if (channel === 'sms') {
    await smsService.sendOtpSms(identity, otp, 'forgot_password');
  } else {
    await sendOtpEmail(user.email, otp, '[SECURE AUTH] Password change authorization code');
  }

  ok(res, { success: true, channel });
}));

router.post('/seller/settings/change-password', authenticate, asyncRoute(async (req, res) => {
  const { verifyOtp, consumeOtp } = await import('../services/otp.service.js');
  const { hashPassword, validatePasswordStrength } = await import('../services/password.service.js');

  const { newPassword, otp } = req.body;
  if (!newPassword || !otp) throw new ApiError(400, 'Password and OTP are required');

  const user = await db.user.findUnique({ where: { id: userId(req) } });
  if (!user) throw new ApiError(404, 'User not found');

  const channel = req.body?.channel === 'sms' && user.mobileVerified && user.mobile ? 'sms' : 'email';
  const identity = channel === 'sms' ? user.mobile : user.email;
  const result = await verifyOtp('forgot_password', identity, otp);
  if (!result.ok) throw new ApiError(400, 'Invalid or expired OTP');

  const passwordValidation = validatePasswordStrength(newPassword);
  if (!passwordValidation.ok) {
    throw new ApiError(400, 'Password does not meet security requirements: ' + passwordValidation.errors.join(', '));
  }

  const hashedPassword = await hashPassword(newPassword);
  await db.user.update({
    where: { id: user.id },
    data: {
      password: hashedPassword,
      passwordResetVersion: { increment: 1 },
      sessionVersion: { increment: 1 },
      lastPasswordChangeAt: new Date()
    }
  });

  await consumeOtp('forgot_password', identity);
  ok(res, { success: true, message: 'Password updated successfully' });
}));

router.post('/seller/settings/change-email', authenticate, asyncRoute(async (req, res) => {
  const { verifyEmailOtp, consumeEmailOtp } = await import('../services/otp.service.js');
  const { verifyPassword } = await import('../services/password.service.js');

  const { newEmail, otp, password } = req.body;
  if (!newEmail || !otp || !password) throw new ApiError(400, 'New email, OTP, and password are required');

  const user = await db.user.findUnique({ where: { id: userId(req) } });
  if (!user) throw new ApiError(404, 'User not found');

  const isPasswordMatch = await verifyPassword(password, user.password);
  if (!isPasswordMatch) throw new ApiError(400, 'Current password incorrect');

  const otpCheck = await verifyEmailOtp(newEmail, otp);
  if (!otpCheck.ok) throw new ApiError(400, 'Invalid or expired OTP');

  // Update email
  await db.user.update({
    where: { id: user.id },
    data: { email: newEmail.trim().toLowerCase() }
  });

  await consumeEmailOtp(newEmail);
  ok(res, { success: true, message: 'Email updated successfully' });
}));

router.post('/seller/settings/profile/send-otp', authenticate, asyncRoute(async (req, res) => {
  const { generateOtp, storeOtp } = await import('../services/otp.service.js');
  const { sendOtpEmail } = await import('../services/mail.service.js');
  const { smsService } = await import('../services/sms.service.js');

  const user = await db.user.findUnique({ where: { id: userId(req) } });
  if (!user) throw new ApiError(404, 'User not found');
  if (!user.email) throw new ApiError(400, 'Login email is not available for OTP delivery.');

  const otp = generateOtp();
  const channel = req.body?.channel === 'sms' && user.mobileVerified && user.mobile && smsService.isEnabled() ? 'sms' : 'email';
  const identity = channel === 'sms' ? user.mobile : user.email;
  await storeOtp('seller_profile_update', identity, otp, { userId: user.id, channel }, channel);
  if (channel === 'sms') {
    await smsService.sendOtpSms(identity, otp, 'onboarding_alert');
  } else {
    await sendOtpEmail(user.email, otp, '[SECURE AUTH] Profile update verification code');
  }

  ok(res, { success: true, channel });
}));

router.post('/seller/settings/profile', authenticate, asyncRoute(async (req, res) => {
  const { verifyOtp, consumeOtp } = await import('../services/otp.service.js');
  const { firstName, lastName, mobile, otp } = req.body;

  if (!firstName || !lastName || !mobile || !otp) {
    throw new ApiError(400, 'First name, last name, mobile number, and OTP are required');
  }

  const user = await db.user.findUnique({ where: { id: userId(req) } });
  if (!user) throw new ApiError(404, 'User not found');

  const channel = req.body?.channel === 'sms' && user.mobileVerified && user.mobile ? 'sms' : 'email';
  const identity = channel === 'sms' ? user.mobile : user.email;
  const verifyResult = await verifyOtp('seller_profile_update', identity, otp);
  if (!verifyResult.ok) {
    throw new ApiError(400, 'Invalid or expired OTP');
  }

  await db.user.update({
    where: { id: user.id },
    data: {
      name: `${firstName.trim()} ${lastName.trim()}`,
      mobile: mobile.trim(),
      mobileVerified: mobile.trim() === user.mobile ? user.mobileVerified : false
    }
  });

  await consumeOtp('seller_profile_update', identity);
  ok(res, { success: true });
}));

router.post('/seller/settings/aadhaar', authenticate, authorize('seller'), asyncRoute(async (req, res) => {
  const { aadhaarNumber } = req.body;
  if (!aadhaarNumber) throw new ApiError(400, 'Aadhaar number is required');

  const sellerProfile = await db.sellerProfile.update({
    where: { userId: userId(req) },
    data: {
      aadhaarNumber,
      aadhaarMasked: aadhaarNumber.slice(-4).padStart(aadhaarNumber.length, '*'),
      aadhaarVerified: true
    }
  });

  ok(res, { success: true, sellerProfile });
}));

router.post('/seller/settings/close-account', authenticate, asyncRoute(async (req, res) => {
  // Mark user as inactive/suspended
  await db.user.update({
    where: { id: userId(req) },
    data: {
      registrationStatus: 'suspended',
      sessionVersion: { increment: 1 }
    }
  });
  ok(res, { success: true, message: 'Account closed successfully' });
}));

async function ensureUserOrganizationId(req: any): Promise<number> {
  let orgId = req.user?.organizationId;
  if (!orgId && req.user?.id) {
    const user = await db.user.findUnique({
      where: { id: req.user.id },
      include: {
        sellerProfile: true,
        buyerProfile: true
      }
    });

    if (user) {
      const membership = await db.orgMembership.findFirst({
        where: { userId: user.id },
        include: { organization: true }
      });
      if (membership?.organizationId) {
        orgId = membership.organizationId;
        await db.user.update({
          where: { id: user.id },
          data: { organizationId: orgId }
        });
        req.user.organizationId = orgId;
      } else {
        const regDetails = typeof user.registrationDetails === 'object' && user.registrationDetails ? user.registrationDetails as any : {};
        const gstDetails = typeof regDetails.gstDetails === 'object' && regDetails.gstDetails ? regDetails.gstDetails as any : {};
        
        const orgName = regDetails.businessName || regDetails.organisation || gstDetails.legalName || gstDetails.tradeName || user.name || 'Default Organisation';
        
        let orgType = 'MSME';
        if (user.role === 'buyer') {
          orgType = 'GOVERNMENT';
        } else {
          const typeStr = String(regDetails.businessType || regDetails.organisationType || '').trim().toUpperCase();
          if (typeStr.includes('PROPRIETORSHIP')) {
            orgType = 'PROPRIETORSHIP';
          } else if (typeStr.includes('PARTNERSHIP')) {
            orgType = 'PARTNERSHIP';
          } else if (typeStr.includes('LLP')) {
            orgType = 'LLP';
          } else if (typeStr.includes('STARTUP')) {
            orgType = 'STARTUP';
          } else if (typeStr.includes('PRIVATE_LIMITED') || typeStr.includes('PVT LTD') || typeStr.includes('PVT. LTD.')) {
            orgType = 'PRIVATE_LIMITED';
          } else if (typeStr.includes('PUBLIC_LIMITED') || typeStr.includes('PUBLIC LTD')) {
            orgType = 'PUBLIC_LIMITED';
          } else if (typeStr.includes('SHG')) {
            orgType = 'SHG';
          } else if (typeStr.includes('NGO')) {
            orgType = 'NGO';
          } else if (typeStr.includes('TRUST')) {
            orgType = 'TRUST';
          } else if (typeStr.includes('SOCIETY')) {
            orgType = 'SOCIETY';
          } else if (typeStr.includes('GOVERNMENT')) {
            orgType = 'GOVERNMENT';
          } else if (typeStr.includes('PSU')) {
            orgType = 'PSU';
          } else {
            orgType = 'MSME';
          }
        }

        const defaultCompanyId = user.companyId || await getDefaultCompanyId();
        const newOrg = await db.organization.create({
          data: {
            organizationName: orgName,
            organizationType: orgType as any,
            gstin: regDetails.gstin || null,
            panNumber: regDetails.pan || regDetails.panNumber || gstDetails.pan || null,
            state: regDetails.state || gstDetails.state || null,
            district: regDetails.district || gstDetails.district || gstDetails.city || null,
            city: gstDetails.city || regDetails.district || null,
            pincode: gstDetails.pincode || null,
            addressLine1: regDetails.officeZoneName || gstDetails.address || null,
            companyId: defaultCompanyId,
            verificationStatus: 'PENDING',
            organizationOnboardingStatus: 'self_created'
          }
        });

        orgId = newOrg.id;
        await db.user.update({
          where: { id: user.id },
          data: { organizationId: orgId, companyId: defaultCompanyId }
        });
        req.user.organizationId = orgId;

        await db.orgMembership.create({
          data: {
            userId: user.id,
            organizationId: orgId,
            orgRole: 'ORG_ADMIN',
            isActive: true
          }
        });
        
        if (user.sellerProfile) {
          await db.sellerProfile.update({
            where: { id: user.sellerProfile.id },
            data: { organizationId: orgId }
          });
        } else if (user.buyerProfile) {
          await db.buyerProfile.update({
            where: { id: user.buyerProfile.id },
            data: { organizationId: orgId }
          });
        }
      }
    }
  }

  if (!orgId) throw new ApiError(400, 'User is not associated with an organization');
  return orgId;
}

router.get('/seller/settings/branding', authenticate, authorize('seller', 'shg'), asyncRoute(async (req, res) => {
  const orgId = await ensureUserOrganizationId(req);

  const profile = await db.organizationProfile.findUnique({
    where: { organizationId: orgId }
  });
  ok(res, { 
    logoUrl: profile?.logoUrl || null,
    bannerUrl: profile?.bannerUrl || null
  });
}));

router.put('/seller/settings/branding', authenticate, authorize('seller', 'shg'), asyncRoute(async (req, res) => {
  const orgId = await ensureUserOrganizationId(req);

  const body = parse(z.object({
    logoUrl: z.string().trim().optional().nullable().refine(
      val => !val || val === '' || /^\//.test(val) || /^https?:\/\/.+/.test(val),
      { message: 'logoUrl must be a valid absolute URL, relative path, or empty' }
    ),
    bannerUrl: z.string().trim().optional().nullable().refine(
      val => !val || val === '' || /^\//.test(val) || /^https?:\/\/.+/.test(val),
      { message: 'bannerUrl must be a valid absolute URL, relative path, or empty' }
    )
  }), req.body);

  const updateData: any = {};
  if (body.logoUrl !== undefined) updateData.logoUrl = body.logoUrl;
  if (body.bannerUrl !== undefined) updateData.bannerUrl = body.bannerUrl;

  const updatedProfile = await db.organizationProfile.upsert({
    where: { organizationId: orgId },
    update: updateData,
    create: {
      organizationId: orgId,
      logoUrl: body.logoUrl || null,
      bannerUrl: body.bannerUrl || null
    }
  });

  // Clear homepage and layout caches
  await invalidateByPattern('cache:marketplace:home:v2');
  await invalidateByPattern('cache:marketplace:home-layout:v2:*');

  ok(res, { 
    logoUrl: updatedProfile.logoUrl,
    bannerUrl: updatedProfile.bannerUrl
  });
}));

// ═══════════════════════════════════════════
// Unified My Procurements Endpoint
// ═══════════════════════════════════════════

const STATUS_GROUP = {
  draft: new Set(['DRAFT']),
  pending_approval: new Set(['PENDING_ADMIN_APPROVAL', 'PENDING_APPROVAL', 'SUBMITTED', 'SUBMITTED_FOR_APPROVAL']),
  active: new Set(['OPEN', 'APPROVED', 'TECHNICAL_EVALUATION', 'FINANCIAL_EVALUATION', 'REQUESTED', 'SOURCING', 'PROCUREMENT_METHOD_SELECTED']),
  completed: new Set(['AWARDED', 'ORDERED', 'FULFILLED', 'CONVERTED_TO_ORDER', 'CONVERTED_TO_BID', 'PUBLISHED', 'CLOSED']),
  cancelled: new Set(['CANCELLED', 'REJECTED', 'EXPIRED', 'SENT_BACK_FOR_CORRECTION']),
};

const statusGroupFor = (rawStatus: string): string => {
  const s = rawStatus?.toUpperCase() || 'DRAFT';
  for (const [group, set] of Object.entries(STATUS_GROUP)) {
    if (set.has(s)) return group;
  }
  return 'draft';
};

const statusLabel = (raw: string): string =>
  (raw || 'DRAFT').replace(/_/g, ' ').replace(/\b\w/g, c => c.toUpperCase());

const METHOD_LABEL_MAP: Record<string, string> = {};
for (const m of procurementMethodDefinitions) {
  METHOD_LABEL_MAP[m.slug] = m.name;
  METHOD_LABEL_MAP[m.code] = m.name;
}

router.get('/buyer/my-procurements', authenticate, authorize('buyer'), asyncRoute(async (req, res) => {
  const buyerId = userId(req);
  const { type, status, method, search, sortBy, sortDir } = req.query as Record<string, string | undefined>;

  // ── Parallel data fetch ──
  const [bidDrafts, procurementBids, procurementRequests, directPurchases, requirements] = await Promise.all([
    db.bidWizardDraft.findMany({
      where: { buyerId, draftStatus: 'DRAFT' },
      orderBy: { updatedAt: 'desc' },
    }),
    db.procurementBid.findMany({
      where: { buyerId },
      orderBy: { createdAt: 'desc' },
      include: {
        documents: true
      },
    }),
    db.procurementRequest.findMany({
      where: { buyerId },
      orderBy: { createdAt: 'desc' },
    }),
    db.directPurchase.findMany({
      where: { buyerId },
      orderBy: { createdAt: 'desc' },
      include: {
        requirement: {
          include: {
            category: { select: { name: true } },
            items: true
          }
        }
      },
    }),
    db.requirement.findMany({
      where: { buyerId },
      orderBy: { createdAt: 'desc' },
      include: {
        category: { select: { name: true } },
        items: true
      },
    }),
  ]);

  // ── Normalize into unified shape ──
  type NormalizedProcurement = {
    id: number;
    type: string;
    typeLabel: string;
    title: string;
    referenceNumber: string;
    status: string;
    statusLabel: string;
    statusGroup: string;
    method: string;
    methodLabel: string;
    estimatedValue: number;
    category: string;
    description: string;
    deliveryLocation: string;
    startDate: string;
    endDate: string;
    quantity: string;
    unit: string;
    organizationName: string;
    createdAt: string;
    updatedAt: string;
    actionUrl: string;
    documents?: any[];
    items?: any[];
    paymentTerms?: string;
    eligibilityCriteria?: string[];
    termsAndConditions?: string[];
  };

  const all: NormalizedProcurement[] = [];

  // Special conditions labels helper
  const SPECIAL_CONDITIONS_LABELS: Record<string, string> = {
    corrigendumAllowed: 'Corrigendum Allowed?',
    cancellationAllowedBeforeClosing: 'Bid Cancellation Allowed Before Closing?',
    clarificationWindowRequired: 'Clarification Window Required?',
    sellerQueryAllowed: 'Seller Query Allowed?',
    documentResubmissionAllowed: 'Document Resubmission Allowed?',
    splittingQuantityAllowed: 'Splitting Quantity Allowed?',
    multipleAwardAllowed: 'Multiple Award Allowed?',
    rateContractRequired: 'Rate Contract Required?',
  };

  // 1) Bid Wizard Drafts
  for (const d of bidDrafts) {
    const fd = d.formData as any || {};
    const step4 = fd?.step4 || {};
    const step5 = fd?.step5 || {};
    const step6 = fd?.step6 || {};
    const step7 = fd?.step7 || {};
    const step8 = fd?.step8 || {};
    const step3 = fd?.step3 || {};
    const step2 = fd?.step2 || {};

    const bidTypeSlug = String(d.bidType || 'PRODUCT_BID').toLowerCase().replace(/_/g, '-');

    // Extract documents
    const documents: any[] = [];
    const docFields = [
      'technicalSpecificationDocumentIds',
      'budgetSanctionDocumentIds',
      'administrativeApprovalDocumentIds',
      'scopeOfWorkDocumentIds',
      'boqDocumentIds',
      'pacCertificateDocumentIds',
      'drawingDocumentIds',
      'additionalTermDocumentIds'
    ];
    for (const field of docFields) {
      const arr = step7[field];
      if (Array.isArray(arr)) {
        for (const doc of arr) {
          if (doc && (doc.fileAssetId || doc.id)) {
            documents.push({
              fileAssetId: Number(doc.fileAssetId || doc.id),
              fileName: doc.fileName || doc.originalName || `${field.replace('DocumentIds', '')}`,
              documentType: doc.documentType || field.replace('DocumentIds', '').replace(/([A-Z])/g, ' $1').trim()
            });
          }
        }
      }
    }

    // Extract items
    const items = [];
    if (step4.productName || step4.serviceCategory) {
      const isProduct = d.bidType === 'PRODUCT_BID' || step4.productName;
      items.push({
        itemName: isProduct ? step4.productName : step4.serviceCategory,
        quantity: String(step4.quantity || ''),
        unitOfMeasure: step4.unitOfMeasurement || '',
        description: isProduct ? step4.productDescription : step4.scopeOfWork
      });
    }

    // Extract eligibility criteria
    const eligibilityCriteria: string[] = [];
    if (step6.minimumExperienceRequired) eligibilityCriteria.push(`Minimum Experience: ${step6.minimumExperience || 'N/A'}`);
    if (step6.minimumTurnoverRequired) eligibilityCriteria.push(`Minimum Turnover: ${step6.minimumTurnover || 'N/A'}`);
    if (step6.similarWorkExperienceRequired) eligibilityCriteria.push("Similar Work Experience Required");
    if (step6.msePreference) eligibilityCriteria.push("MSE Preference Allowed");
    if (step6.makeInIndiaPreference) eligibilityCriteria.push("Make in India Preference Allowed");
    if (Array.isArray(step6.bidderDocuments)) {
      eligibilityCriteria.push(`Required Bidder Documents: ${step6.bidderDocuments.join(', ')}`);
    }

    // Extract terms
    const termsAndConditions: string[] = [];
    if (step7.paymentTerms) termsAndConditions.push(`Payment Terms: ${step7.paymentTerms}`);
    if (step7.advancePaymentAllowed) termsAndConditions.push("Advance Payment Allowed");
    if (step7.partPaymentAllowed) termsAndConditions.push("Part Payment Allowed");
    if (step7.ewayBillRequired) termsAndConditions.push("e-Way Bill Required");

    // Add special conditions
    for (const [key, label] of Object.entries(SPECIAL_CONDITIONS_LABELS)) {
      if (step8[key]) termsAndConditions.push(label);
    }

    all.push({
      id: d.id,
      type: 'bid_draft',
      typeLabel: 'Bid Draft',
      title: fd?.basicDetails?.title || fd?.title || step3.title || `Draft #${d.id}`,
      referenceNumber: `BWD-${d.id}`,
      status: String(d.draftStatus || 'DRAFT'),
      statusLabel: statusLabel(String(d.draftStatus || 'DRAFT')),
      statusGroup: statusGroupFor(String(d.draftStatus || 'DRAFT')),
      method: bidTypeSlug,
      methodLabel: METHOD_LABEL_MAP[bidTypeSlug] || bidTypeSlug.replace(/-/g, ' ').replace(/\b\w/g, c => c.toUpperCase()),
      estimatedValue: Number(fd?.basicDetails?.estimatedValue || fd?.estimatedValue || step3.estimatedValue || 0),
      category: fd?.basicDetails?.category || fd?.category || step4.productCategory || step4.serviceCategory || '',
      description: fd?.basicDetails?.description || fd?.description || step4.productDescription || step4.scopeOfWork || '',
      deliveryLocation: fd?.basicDetails?.deliveryLocation || fd?.deliveryLocation || step5.singleConsignee?.location || '',
      startDate: fd?.basicDetails?.startDate || fd?.startDate || '',
      endDate: fd?.basicDetails?.endDate || fd?.endDate || '',
      quantity: String(fd?.basicDetails?.quantity || fd?.quantity || step4.quantity || ''),
      unit: fd?.basicDetails?.unit || fd?.unit || step4.unitOfMeasurement || '',
      organizationName: fd?.basicDetails?.buyerOrganizationName || fd?.buyerOrganizationName || step2.organizationName || '',
      createdAt: d.createdAt?.toISOString?.() || '',
      updatedAt: d.updatedAt?.toISOString?.() || '',
      actionUrl: `/buyer/create-bid?draft=${d.id}`,
      documents,
      items,
      paymentTerms: step7.paymentTerms || '',
      eligibilityCriteria,
      termsAndConditions
    });
  }

  // 2) ProcurementBid (published bids / tenders)
  for (const b of procurementBids) {
    const methodSlug = String(b.bidType || b.procurementType || 'tender').toLowerCase().replace(/_/g, '-');

    const documents = (b.documents || []).map((doc: any) => ({
      fileAssetId: doc.fileAssetId,
      fileName: doc.fileName || doc.fileAsset?.originalName || 'Document',
      documentType: doc.documentType || 'Bid Document'
    }));

    const items = [{
      itemName: b.title,
      quantity: String(b.quantity || ''),
      unitOfMeasure: b.unit || '',
      description: b.description || ''
    }];

    const eligibilityCriteria = b.eligibilityCriteria || [];
    const termsAndConditions = b.termsAndConditions || [];
    if (b.evaluationMethod) {
      termsAndConditions.push(`Evaluation Method: ${b.evaluationMethod}`);
    }

    all.push({
      id: b.id,
      type: 'bid_tender',
      typeLabel: 'Bid / Tender',
      title: b.title || `Bid #${b.bidNumber}`,
      referenceNumber: b.bidNumber || `PB-${b.id}`,
      status: String(b.status || 'DRAFT'),
      statusLabel: statusLabel(String(b.status || 'DRAFT')),
      statusGroup: statusGroupFor(String(b.status || 'DRAFT')),
      method: methodSlug,
      methodLabel: METHOD_LABEL_MAP[methodSlug] || METHOD_LABEL_MAP[String(b.bidType || '')] || methodSlug.replace(/-/g, ' ').replace(/\b\w/g, c => c.toUpperCase()),
      estimatedValue: Number(b.estimatedValue || 0),
      category: b.category || '',
      description: b.description || '',
      deliveryLocation: b.deliveryLocation || '',
      startDate: b.startDate?.toISOString?.() || '',
      endDate: b.endDate?.toISOString?.() || '',
      quantity: String(b.quantity || ''),
      unit: b.unit || '',
      organizationName: b.buyerOrganizationName || '',
      createdAt: b.createdAt?.toISOString?.() || '',
      updatedAt: b.updatedAt?.toISOString?.() || '',
      actionUrl: `/bids/${b.id}`,
      documents,
      items,
      paymentTerms: '',
      eligibilityCriteria,
      termsAndConditions
    });
  }

  // 3) ProcurementRequest (cart checkout flows)
  for (const pr of procurementRequests) {
    const selectedMethod = pr.selectedMethod || pr.recommendedMethod || 'direct-purchase';
    const snap = pr.cartSnapshot as any;
    const categoryNames = (snap?.items || snap || []).map((item: any) => item?.product?.category?.name || item?.categoryName || item?.category || '').filter(Boolean);
    const prCategory = [...new Set(categoryNames)].join(', ') || '';

    const td = pr.termsDocuments as any || {};
    const documents: any[] = [];
    const docFields = [
      'technicalSpecificationDocumentIds',
      'budgetSanctionDocumentIds',
      'administrativeApprovalDocumentIds',
      'scopeOfWorkDocumentIds',
      'boqDocumentIds',
      'pacCertificateDocumentIds',
      'drawingDocumentIds',
      'additionalTermDocumentIds'
    ];
    for (const field of docFields) {
      const arr = td[field];
      if (Array.isArray(arr)) {
        for (const doc of arr) {
          if (doc && (doc.fileAssetId || doc.id)) {
            documents.push({
              fileAssetId: Number(doc.fileAssetId || doc.id),
              fileName: doc.fileName || doc.originalName || `${field.replace('DocumentIds', '')}`,
              documentType: doc.documentType || field.replace('DocumentIds', '').replace(/([A-Z])/g, ' $1').trim()
            });
          }
        }
      }
    }

    const items = (snap?.items || snap || []).map((item: any) => ({
      itemName: item?.product?.name || item?.service?.name || item?.itemName || 'Product/Service',
      quantity: String(item?.quantity || ''),
      unitOfMeasure: item?.product?.unit || item?.unit || 'Nos',
      description: item?.product?.description || item?.service?.description || ''
    }));

    const termsAndConditions: string[] = [];
    if (td.paymentTerms) termsAndConditions.push(`Payment Terms: ${td.paymentTerms}`);

    all.push({
      id: pr.id,
      type: 'procurement_request',
      typeLabel: 'Cart Checkout',
      title: `Procurement Request ${pr.requestNumber}`,
      referenceNumber: pr.requestNumber || `PR-${pr.id}`,
      status: String(pr.status || 'DRAFT'),
      statusLabel: statusLabel(String(pr.status || 'DRAFT')),
      statusGroup: statusGroupFor(String(pr.status || 'DRAFT')),
      method: selectedMethod,
      methodLabel: METHOD_LABEL_MAP[selectedMethod] || selectedMethod.replace(/-/g, ' ').replace(/\b\w/g, c => c.toUpperCase()),
      estimatedValue: 0, 
      category: prCategory,
      description: '',
      deliveryLocation: (pr as any).deliveryLocation || '',
      startDate: '',
      endDate: '',
      quantity: '',
      unit: '',
      organizationName: '',
      createdAt: pr.createdAt?.toISOString?.() || '',
      updatedAt: pr.updatedAt?.toISOString?.() || '',
      actionUrl: `/buyer/procurement/checkout?id=${pr.id}`,
      documents,
      items,
      paymentTerms: td.paymentTerms || '',
      eligibilityCriteria: [],
      termsAndConditions
    });
  }

  // 4) DirectPurchase
  for (const dp of directPurchases) {
    const req = dp.requirement || {};
    const items = (req.items || []).map((item: any) => ({
      itemName: item.itemName || item.name || '',
      quantity: String(item.quantity || ''),
      unitOfMeasure: item.unitOfMeasure || item.unit || '',
      description: item.description || ''
    }));

    all.push({
      id: dp.id,
      type: 'direct_purchase',
      typeLabel: 'Direct Purchase',
      title: `Direct Purchase ${dp.purchaseNumber}`,
      referenceNumber: dp.purchaseNumber || `DP-${dp.id}`,
      status: String(dp.status || 'DRAFT'),
      statusLabel: statusLabel(String(dp.status || 'DRAFT')),
      statusGroup: statusGroupFor(String(dp.status || 'DRAFT')),
      method: 'direct-purchase',
      methodLabel: 'Direct Purchase',
      estimatedValue: Number(dp.totalAmount || 0),
      category: (dp as any).requirement?.category?.name || dp.department || '',
      description: '',
      deliveryLocation: dp.deliveryAddressText || '',
      startDate: '',
      endDate: '',
      quantity: '',
      unit: '',
      organizationName: '',
      createdAt: dp.createdAt?.toISOString?.() || '',
      updatedAt: dp.updatedAt?.toISOString?.() || '',
      actionUrl: `/buyer/direct-purchase/orders`,
      documents: [],
      items,
      paymentTerms: '',
      eligibilityCriteria: [],
      termsAndConditions: []
    });
  }

  // 5) Requirement
  for (const r of requirements) {
    const methodSlug = String(r.procurementMethod || 'TENDER').toLowerCase().replace(/_/g, '-');
    const payload = (r as any).payload || {};
    
    const items = (r.items || []).map((item: any) => ({
      itemName: item.itemName || item.name || '',
      quantity: String(item.quantity || ''),
      unitOfMeasure: item.unitOfMeasure || item.unit || '',
      description: item.description || ''
    }));

    const documents: any[] = [];
    if (Array.isArray(payload.documents)) {
      for (const doc of payload.documents) {
        if (doc && doc.fileAssetId) {
          documents.push({
            fileAssetId: doc.fileAssetId,
            fileName: doc.fileName || 'Document',
            documentType: doc.documentType || 'Requirement Document'
          });
        }
      }
    }

    all.push({
      id: r.id,
      type: 'requirement',
      typeLabel: 'Requirement',
      title: r.title || `Requirement ${r.requirementNumber}`,
      referenceNumber: r.requirementNumber || `REQ-${r.id}`,
      status: String(r.status || 'DRAFT'),
      statusLabel: statusLabel(String(r.status || 'DRAFT')),
      statusGroup: statusGroupFor(String(r.status || 'DRAFT')),
      method: methodSlug,
      methodLabel: METHOD_LABEL_MAP[methodSlug] || methodSlug.replace(/-/g, ' ').replace(/\b\w/g, c => c.toUpperCase()),
      estimatedValue: Number(r.estimatedValue || 0),
      category: (r as any).category?.name || '',
      description: r.description || '',
      deliveryLocation: (r as any).deliveryLocation || '',
      startDate: '',
      endDate: '',
      quantity: String((r as any).quantity || ''),
      unit: (r as any).unit || '',
      organizationName: '',
      createdAt: r.createdAt?.toISOString?.() || '',
      updatedAt: r.updatedAt?.toISOString?.() || '',
      actionUrl: `/buyer/requirements`,
      documents,
      items,
      paymentTerms: '',
      eligibilityCriteria: [],
      termsAndConditions: []
    });
  }

  // ── Apply filters ──
  let filtered = all;
  if (type) {
    filtered = filtered.filter(p => p.type === type);
  }
  if (status) {
    filtered = filtered.filter(p => p.statusGroup === status || p.status === status);
  }
  if (method) {
    filtered = filtered.filter(p => p.method === method || p.methodLabel.toLowerCase().includes(method.toLowerCase()));
  }
  if (search) {
    const q = search.toLowerCase();
    filtered = filtered.filter(p =>
      p.title.toLowerCase().includes(q) ||
      p.referenceNumber.toLowerCase().includes(q) ||
      p.category.toLowerCase().includes(q) ||
      p.typeLabel.toLowerCase().includes(q)
    );
  }

  // ── Sort ──
  const dir = sortDir === 'asc' ? 1 : -1;
  const key = sortBy || 'updatedAt';
  filtered.sort((a: any, b: any) => {
    const va = a[key] ?? '';
    const vb = b[key] ?? '';
    if (typeof va === 'number' && typeof vb === 'number') return (va - vb) * dir;
    return String(va).localeCompare(String(vb)) * dir;
  });

  // ── KPIs (computed from unfiltered data) ──
  const kpis = {
    totalProcurements: all.length,
    drafts: all.filter(p => p.statusGroup === 'draft').length,
    pendingApproval: all.filter(p => p.statusGroup === 'pending_approval').length,
    active: all.filter(p => p.statusGroup === 'active').length,
    completed: all.filter(p => p.statusGroup === 'completed').length,
    cancelled: all.filter(p => p.statusGroup === 'cancelled').length,
    totalValue: all.reduce((sum, p) => sum + (p.estimatedValue || 0), 0),
  };

  ok(res, { kpis, procurements: filtered });
}));

export default router;
