import { Router, type NextFunction, type Request, type Response } from 'express';
import { z } from 'zod';
import prisma from '../config/prisma.js';
import { getOrSetCache } from '../services/cache.service.js';
import { redisKeys } from '../constants/redis-keys.js';
import { apiResponse } from '../utils/apiResponse.js';
import { authenticate, type AuthRequest } from '../middleware/authenticate.js';
import { authorize, checkFeatureEnabled } from '../middleware/authorize.js';
import { verifyAccessToken } from '../services/token.service.js';
import { longCache, shortCache } from '../middleware/httpCache.js';
import { sha256 } from '../utils/crypto.js';

const db = prisma as any;
const router = Router();

const paginationQuery = z.object({
    q: z.string().trim().max(120).optional(),
    categoryId: z.coerce.number().int().positive().optional(),
    category: z.string().trim().max(120).optional(),
    type: z.enum(['PRODUCT', 'SERVICE', 'BOTH']).optional(),
    location: z.string().trim().max(100).optional(),
    district: z.string().trim().max(100).optional(),
    minPrice: z.coerce.number().nonnegative().optional(),
    maxPrice: z.coerce.number().nonnegative().optional(),
    priceMin: z.coerce.number().nonnegative().optional(),
    priceMax: z.coerce.number().nonnegative().optional(),
    discount: z.enum(['true', 'active', 'false']).optional(),
    verified: z.enum(['true', 'false']).optional(),
    verifiedSeller: z.enum(['true', 'false']).optional(),
    sort: z.enum(['popular', 'newest', 'latest', 'price_asc', 'price_desc', 'discount', 'most_purchased', 'verified', 'name']).optional(),
    page: z.coerce.number().int().min(1).default(1),
    pageSize: z.coerce.number().int().min(1).max(100).default(12),
}).partial();

const ok = (res: Response, data: unknown) => res.json({ success: true, data });
const stableCacheHash = (value: unknown) => sha256(JSON.stringify(value));

const optionalAuthenticate = async (req: AuthRequest, _res: Response, next: NextFunction) => {
    const authHeader = req.headers.authorization || '';
    const [scheme, token] = authHeader.split(' ');
    if (scheme !== 'Bearer' || !token) return next();

    try {
        const decoded = verifyAccessToken(token);
        const user = await prisma.user.findUnique({
            where: { id: Number(decoded.id) },
            select: { id: true, role: true, sessionVersion: true, accountStatus: true, organizationId: true, companyId: true }
        });
        if (user && user.accountStatus === 'ACTIVE' && user.role === decoded.role && user.sessionVersion === Number(decoded.sessionVersion)) {
            req.user = {
                id: user.id,
                role: user.role,
                sessionVersion: user.sessionVersion,
                permissions: [],
                organizationId: user.organizationId,
                companyId: user.companyId,
                enabledFeatures: []
            };
        }
    } catch {
        // Public marketplace pages should remain public if an optional token is stale.
    }

    return next();
};

const checkFeatureIfAuthenticated = (featureCode: string) => {
    return async (req: AuthRequest, res: Response, next: NextFunction) => {
        if (!req.user) return next();
        // If user has no company context, allow through — marketplace pages are public
        // and should not block authenticated users who lack a companyId.
        if (!req.user.companyId) return next();
        return checkFeatureEnabled(featureCode)(req, res, next);
    };
};

const organizationLogoSelect = { id: true, url: true };
const organizationProfileBrandSelect = { logoUrl: true, isLargeIndustry: true, isBigMsme: true };
const sellerOrganizationWhere = {
    verificationStatus: 'VERIFIED',
    isBlacklisted: false,
    deletedAt: null,
    OR: [
        { users: { some: { role: 'shg', accountStatus: 'ACTIVE' } } },
        { users: { some: { role: 'seller', accountStatus: 'ACTIVE' } } },
        { sellerProfiles: { some: {} } },
        { shgProfiles: { some: { applicationStatus: 'APPROVED', marketplaceEnabled: true } } },
        { products: { some: {} } },
        { services: { some: {} } },
        { profile: { isBigMsme: true } },
        { organizationType: 'SHG' },
        { organizationType: 'MSME' }
    ]
};

const safeBuyerOrganizationSelect = {
    id: true,
    organizationName: true,
    organizationType: true,
    city: true,
    district: true,
    state: true,
    verificationStatus: true,
    logoFile: { select: organizationLogoSelect },
    profile: true
};

const requirementCategorySelect = { id: true, name: true, slug: true };

const publicRequirementListSelect = {
    id: true,
    title: true,
    requirementType: true,
    categoryId: true,
    description: true,
    quantity: true,
    unit: true,
    location: true,
    budgetMin: true,
    budgetMax: true,
    lastDate: true,
    visibility: true,
    status: true,
    isFeatured: true,
    isUrgent: true,
    approvedAt: true,
    createdAt: true,
    updatedAt: true,
    category: { select: requirementCategorySelect },
    buyerOrganization: { select: safeBuyerOrganizationSelect },
    _count: { select: { responses: true } }
};


const publicLegacyRequirementSelect = {
    id: true,
    requirementNumber: true,
    title: true,
    description: true,
    procurementMethod: true,
    status: true,
    estimatedValue: true,
    currency: true,
    requiredBy: true,
    createdAt: true,
    updatedAt: true,
    buyer: {
        select: {
            id: true,
            name: true,
            buyerProfile: { select: { organizationName: true, organizationType: true, city: true, district: true, state: true } }
        }
    },
    organization: { select: safeBuyerOrganizationSelect },
    category: { select: requirementCategorySelect },
    _count: { select: { tenders: true } }
};

const publicLegacyRequirementDetailSelect = {
    ...publicLegacyRequirementSelect,
    payload: true,
    items: {
        select: {
            id: true,
            productId: true,
            itemName: true,
            description: true,
            quantity: true,
            unitOfMeasure: true,
            estimatedUnitPrice: true,
            specifications: true,
            product: { select: { id: true, name: true, hsnCode: true, unitOfMeasure: true } }
        },
        orderBy: { id: 'asc' as const }
    },
    directPurchases: {
        select: {
            deliveryAddressText: true,
            department: true,
            budgetHead: true,
            costCenter: true,
            justification: true,
            remarks: true,
            deliveryInstructions: true,
            requiredDeliveryDate: true,
            totalAmount: true
        },
        take: 1,
        orderBy: { createdAt: 'desc' as const }
    }
};

const publicRequirementDetailSelect = {
    ...publicRequirementListSelect,
    requiredDocuments: true,
    contactPerson: true,
    terms: true,
    attachmentUrl: true
};

const ownerRequirementSelect = {
    ...publicRequirementDetailSelect,
    companyId: true,
    buyerOrganizationId: true,
    createdById: true,
    approvedById: true,
    contactPerson: true
};

const buyerResponseSelect = {
    id: true,
    requirementId: true,
    sellerOrganizationId: true,
    sellerUserId: true,
    offeredPrice: true,
    offeredQuantity: true,
    deliveryTimeline: true,
    message: true,
    attachmentUrl: true,
    terms: true,
    status: true,
    createdAt: true,
    updatedAt: true,
    sellerUser: { select: { id: true, name: true, email: true, mobile: true, onboardingStatus: true } },
    sellerOrganization: { select: safeBuyerOrganizationSelect }
};

const sellerResponseSelect = {
    id: true,
    requirementId: true,
    sellerOrganizationId: true,
    sellerUserId: true,
    offeredPrice: true,
    offeredQuantity: true,
    deliveryTimeline: true,
    message: true,
    attachmentUrl: true,
    terms: true,
    status: true,
    createdAt: true,
    updatedAt: true,
    requirement: { select: publicRequirementListSelect }
};

const requirementIncludes = {
    category: { select: { id: true, name: true, slug: true } },
    buyerOrganization: {
        select: {
            id: true,
            organizationName: true,
            organizationType: true,
            city: true,
            district: true,
            state: true,
            verificationStatus: true,
            profile: true
        }
    },
    _count: { select: { responses: true } }
};

const getPublicRequirementWhere = () => ({
    status: { in: ['PUBLISHED', 'OPEN'] },
    lastDate: { gte: new Date() }
});

const closingSoonMs = 7 * 24 * 60 * 60 * 1000;

const computeRequirementState = (requirement: any) => {
    const rawStatus = String(requirement?.status || '').toUpperCase();
    const lastDateMs = requirement?.lastDate ? new Date(requirement.lastDate).getTime() : 0;
    const msRemaining = lastDateMs - Date.now();
    const daysRemaining = Number.isFinite(msRemaining) ? Math.max(0, Math.ceil(msRemaining / (24 * 60 * 60 * 1000))) : 0;

    if (rawStatus === 'AWARDED') return { code: 'AWARDED', label: 'Awarded', daysRemaining, timeRemaining: 'Awarded' };
    if (['CLOSED', 'CANCELLED', 'REJECTED'].includes(rawStatus) || (lastDateMs > 0 && msRemaining <= 0)) {
        return { code: 'CLOSED', label: 'Closed', daysRemaining: 0, timeRemaining: 'Closed' };
    }
    if (rawStatus === 'UNDER_REVIEW') return { code: 'UNDER_EVALUATION', label: 'Under Evaluation', daysRemaining, timeRemaining: 'Under evaluation' };
    if (msRemaining <= closingSoonMs) return { code: 'CLOSING_SOON', label: 'Closing Soon', daysRemaining, timeRemaining: `${daysRemaining}d left` };
    return { code: 'OPEN', label: 'Open', daysRemaining, timeRemaining: `${daysRemaining}d left` };
};

const decorateRequirement = (requirement: any) => {
    if (!requirement) return requirement;
    const state = computeRequirementState(requirement);
    return {
        ...requirement,
        requirementNumber: requirement.requirementNumber || `REQ-${String(Math.abs(Number(requirement.id))).padStart(5, '0')}`,
        bidStatus: state.code,
        computedStatus: state.code,
        statusLabel: state.label,
        daysRemaining: state.daysRemaining,
        timeRemaining: state.timeRemaining
    };
};

const mapLegacyRequirementToPublic = (requirement: any) => {
    if (!requirement) return requirement;
    const profile = requirement.buyer?.buyerProfile || {};
    const organization = requirement.organization || {
        id: requirement.buyer?.id || requirement.id,
        organizationName: profile.organizationName || requirement.buyer?.name || 'Verified buyer',
        organizationType: profile.organizationType || 'BUYER',
        city: profile.city,
        district: profile.district,
        state: profile.state,
        verificationStatus: 'VERIFIED'
    };
    const requiredBy = requirement.requiredBy || new Date(Date.now() + 30 * 24 * 60 * 60 * 1000);
    const items = Array.isArray(requirement.items) ? requirement.items : [];
    const totalQty = items.reduce((sum: number, item: any) => sum + Number(item.quantity || 0), 0);
    const primaryUnit = items[0]?.unitOfMeasure || null;
    const directPurchase = Array.isArray(requirement.directPurchases) ? requirement.directPurchases[0] : null;
    const procurementMethod = String(requirement.procurementMethod || '').replace(/_/g, ' ');
    const itemSummary = items.length
        ? items.map((item: any) => item.itemName).filter(Boolean).join(', ')
        : null;

    return decorateRequirement({
        id: -Number(requirement.id),
        sourceModel: 'REQUIREMENT',
        sourceId: requirement.id,
        title: requirement.title,
        requirementType: 'PRODUCT',
        categoryId: requirement.categoryId,
        description: requirement.description || requirement.title,
        quantity: totalQty > 0 ? totalQty : null,
        unit: primaryUnit,
        location: [organization.city, organization.district, organization.state].filter(Boolean).join(', ') || directPurchase?.deliveryAddressText || null,
        budgetMin: requirement.estimatedValue || directPurchase?.totalAmount || null,
        budgetMax: requirement.estimatedValue || directPurchase?.totalAmount || null,
        lastDate: requiredBy,
        visibility: 'PUBLIC',
        status: requirement.status === 'FULFILLED' ? 'AWARDED' : requirement.status === 'CANCELLED' ? 'CANCELLED' : 'OPEN',
        isFeatured: false,
        isUrgent: false,
        approvedAt: requirement.updatedAt,
        createdAt: requirement.createdAt,
        updatedAt: requirement.updatedAt,
        category: requirement.category,
        buyerOrganization: organization,
        _count: { responses: requirement._count?.tenders || 0 },
        requirementNumber: requirement.requirementNumber,
        procurementMethod: requirement.procurementMethod,
        procurementMethodLabel: procurementMethod || null,
        estimatedValue: requirement.estimatedValue || directPurchase?.totalAmount || null,
        currency: requirement.currency || 'INR',
        items: items.map((item: any) => ({
            id: item.id,
            productId: item.productId,
            itemName: item.itemName,
            description: item.description,
            quantity: item.quantity,
            unitOfMeasure: item.unitOfMeasure,
            estimatedUnitPrice: item.estimatedUnitPrice,
            specifications: item.specifications,
            product: item.product || null
        })),
        itemSummary,
        directPurchase: directPurchase
            ? {
                deliveryAddressText: directPurchase.deliveryAddressText,
                department: directPurchase.department,
                budgetHead: directPurchase.budgetHead,
                costCenter: directPurchase.costCenter,
                justification: directPurchase.justification,
                remarks: directPurchase.remarks,
                deliveryInstructions: directPurchase.deliveryInstructions,
                requiredDeliveryDate: directPurchase.requiredDeliveryDate,
                totalAmount: directPurchase.totalAmount
            }
            : null,
        payload: requirement.payload
    });
};

const getPublicLegacyRequirementWhere = () => ({
    status: { in: ['APPROVED', 'SOURCING'] },
    AND: [{ OR: [{ requiredBy: null }, { requiredBy: { gte: new Date() } }] }]
});


const loadLatestTenders = async (take = 6) => {
    const tenders = await db.tender?.findMany?.({
        where: { status: { in: ['published', 'bid_submission'] } },
        orderBy: [{ publishedAt: 'desc' }, { createdAt: 'desc' }],
        take,
        select: {
            id: true,
            tenderId: true,
            title: true,
            category: true,
            budget: true,
            description: true,
            status: true,
            closesAt: true,
            publishedAt: true,
            createdAt: true,
            buyer: { select: { id: true, name: true, buyerProfile: { select: { organizationName: true, state: true, district: true } } } },
            _count: { select: { bids: { where: { status: { not: 'withdrawn' } } } } }
        }
    }).catch(() => []);

    return (tenders || []).map((tender: any) => ({
        ...tender,
        bidsCount: tender._count?.bids ?? tender.bidsCount ?? 0,
        _count: undefined
    }));
};

const loadLatestProcurementBids = async (take = 6) => {
    const [procurementBids, tenderBidActivities] = await Promise.all([
        db.procurementBid?.findMany?.({
            where: {
                approvalStatus: 'APPROVED',
                status: { in: ['OPEN', 'APPROVED', 'TECHNICAL_EVALUATION', 'TECHNICAL_EVALUATION_COMPLETED', 'FINANCIAL_EVALUATION', 'L1_GENERATED', 'AWARD_RECOMMENDED', 'AWARDED'] }
            },
            orderBy: [{ startDate: 'desc' }, { createdAt: 'desc' }],
            take,
            select: {
                id: true,
                bidNumber: true,
                title: true,
                description: true,
                buyerOrganizationName: true,
                buyerType: true,
                category: true,
                subCategory: true,
                bidType: true,
                quantity: true,
                unit: true,
                estimatedValue: true,
                deliveryLocation: true,
                state: true,
                district: true,
                startDate: true,
                endDate: true,
                status: true,
                approvalStatus: true,
                lifecycleStage: true,
                createdAt: true,
                buyerOrganization: { select: safeBuyerOrganizationSelect },
                _count: { select: { participations: true } }
            }
        }).catch(() => []),
        db.bid?.findMany?.({
            where: {
                status: { not: 'withdrawn' },
                withdrawnAt: null,
                tender: { status: { in: ['published', 'bid_submission'] } }
            },
            orderBy: { createdAt: 'desc' },
            take: take * 4,
            select: {
                createdAt: true,
                tender: {
                    select: {
                        id: true,
                        tenderId: true,
                        title: true,
                        description: true,
                        category: true,
                        budget: true,
                        status: true,
                        closesAt: true,
                        publishedAt: true,
                        createdAt: true,
                        buyer: {
                            select: {
                                id: true,
                                name: true,
                                buyerProfile: { select: { organizationName: true, city: true, district: true, state: true } }
                            }
                        },
                        _count: { select: { bids: { where: { status: { not: 'withdrawn' }, withdrawnAt: null } } } }
                    }
                }
            }
        }).catch(() => [])
    ]);

    const procurementRows = (procurementBids || []).map((bid: any) => ({
        ...bid,
        sourceModel: 'PROCUREMENT_BID',
        sourceId: bid.id,
        activityAt: bid.startDate || bid.createdAt,
        quantity: bid.quantity == null ? null : Number(bid.quantity),
        estimatedValue: bid.estimatedValue == null ? null : Number(bid.estimatedValue),
        participantsCount: bid._count?.participations ?? 0,
        _count: undefined
    }));

    const seenTenderIds = new Set<number>();
    const tenderRows = (tenderBidActivities || []).flatMap((activity: any) => {
        const tender = activity.tender;
        if (!tender || seenTenderIds.has(tender.id)) return [];
        seenTenderIds.add(tender.id);

        const profile = tender.buyer?.buyerProfile;
        const location = [profile?.city, profile?.district, profile?.state].filter(Boolean).join(', ');
        return [{
            id: -tender.id,
            sourceModel: 'TENDER',
            sourceId: tender.id,
            bidNumber: tender.tenderId,
            title: tender.title,
            description: tender.description,
            buyerOrganizationName: profile?.organizationName || tender.buyer?.name || 'Verified buyer',
            buyerType: 'Tender',
            category: tender.category,
            subCategory: null,
            bidType: 'Tender',
            quantity: null,
            unit: null,
            estimatedValue: tender.budget == null ? null : Number(tender.budget),
            deliveryLocation: location || 'Location not specified',
            state: profile?.state || null,
            district: profile?.district || null,
            startDate: tender.publishedAt || tender.createdAt,
            endDate: tender.closesAt || activity.createdAt,
            status: tender.status,
            approvalStatus: 'APPROVED',
            lifecycleStage: 'BID_SUBMISSION',
            createdAt: tender.createdAt,
            activityAt: activity.createdAt,
            participantsCount: tender._count?.bids ?? 0
        }];
    });

    return [...procurementRows, ...tenderRows]
        .sort((a: any, b: any) => new Date(b.activityAt || b.createdAt).getTime() - new Date(a.activityAt || a.createdAt).getTime())
        .slice(0, take);
};

const loadLatestRequirements = async (take = 6) => {
    const [buyerRequirements, legacyRequirements] = await Promise.all([
        db.buyerRequirement?.findMany?.({
            where: getPublicRequirementWhere(),
            orderBy: { createdAt: 'desc' },
            take,
            select: publicRequirementListSelect
        }).catch(() => []),
        db.requirement?.findMany?.({
            where: getPublicLegacyRequirementWhere(),
            orderBy: { updatedAt: 'desc' },
            take,
            select: publicLegacyRequirementSelect
        }).catch(() => [])
    ]);
    return [
        ...(buyerRequirements || []).map(decorateRequirement),
        ...(legacyRequirements || []).map(mapLegacyRequirementToPublic)
    ]
        .sort((a: any, b: any) => new Date(b.createdAt || b.updatedAt || 0).getTime() - new Date(a.createdAt || a.updatedAt || 0).getTime())
        .slice(0, take);
};

const requirementSchema = z.object({
    title: z.string().trim().min(3).max(180),
    requirementType: z.enum(['PRODUCT', 'SERVICE']),
    categoryId: z.coerce.number().int().positive().optional(),
    description: z.string().trim().min(10).max(5000),
    quantity: z.coerce.number().positive().optional(),
    unit: z.string().trim().max(40).optional(),
    location: z.string().trim().max(160).optional(),
    budgetMin: z.coerce.number().nonnegative().optional(),
    budgetMax: z.coerce.number().nonnegative().optional(),
    lastDate: z.coerce.date(),
    visibility: z.enum(['PUBLIC', 'VERIFIED_SELLERS_ONLY']).default('PUBLIC'),
    requiredDocuments: z.array(z.string().trim().max(120)).optional(),
    contactPerson: z.string().trim().max(120).optional(),
    attachmentUrl: z.string().trim().max(500).optional(),
    terms: z.string().trim().max(3000).optional()
});

const responseSchema = z.object({
    offeredPrice: z.coerce.number().nonnegative().optional(),
    offeredQuantity: z.coerce.number().positive().optional(),
    deliveryTimeline: z.string().trim().max(120).optional(),
    message: z.string().trim().min(10).max(3000),
    attachmentUrl: z.string().trim().max(500).optional(),
    terms: z.string().trim().max(2000).optional()
});

const responseListQuery = z.object({
    page: z.coerce.number().int().min(1).default(1),
    pageSize: z.coerce.number().int().min(1).max(100).default(20)
}).partial();

const guestCartItemSchema = z.object({
    cartToken: z.string().trim().min(12).max(120),
    productId: z.coerce.number().int().positive().optional(),
    serviceId: z.coerce.number().int().positive().optional(),
    quantity: z.coerce.number().positive().default(1)
}).refine(value => Boolean(value.productId) !== Boolean(value.serviceId), {
    message: 'Either productId or serviceId is required'
});

const marketplaceHomeLayoutQuery = z.object({
    categoryId: z.coerce.number().int().positive().optional(),
    category: z.string().trim().max(120).optional(),
    district: z.string().trim().max(100).optional(),
    limit: z.coerce.number().int().min(1).max(24).default(12),
    role: z.string().trim().max(40).optional()
}).partial();

const marketplaceInteractionSchema = z.object({
    itemId: z.coerce.number().int().positive().optional(),
    itemType: z.enum(['PRODUCT', 'SERVICE']).optional(),
    categoryId: z.coerce.number().int().positive().optional(),
    action: z.enum(['VIEW', 'CATEGORY_CLICK', 'ADD_TO_CART', 'COMPARE', 'ORDER', 'REQUIREMENT_POSTED', 'SEARCH']),
    metadata: z.record(z.string(), z.unknown()).optional()
});

const adminHomeSectionSchema = z.object({
    title: z.string().trim().min(2).max(120).optional(),
    enabled: z.coerce.boolean().optional(),
    displayOrder: z.coerce.number().int().min(0).max(999).optional(),
    itemLimit: z.coerce.number().int().min(1).max(24).optional(),
    ruleType: z.enum(['AUTO_POPULAR', 'AUTO_DISCOUNTED', 'AUTO_MOST_PURCHASED', 'MANUAL_FEATURED', 'LOCAL_MSME', 'HERSHG', 'SERVICES', 'BUYER_REQUIREMENTS']).optional()
});

const defaultHomeSections = [
    { key: 'popular_picks', title: 'Popular Picks', enabled: true, displayOrder: 10, itemLimit: 12, ruleType: 'AUTO_POPULAR' },
    { key: 'most_purchased', title: 'Mostly Purchased Items', enabled: true, displayOrder: 20, itemLimit: 12, ruleType: 'AUTO_MOST_PURCHASED' },
    { key: 'discounted_products', title: 'Discounted Products and Offers', enabled: true, displayOrder: 30, itemLimit: 12, ruleType: 'AUTO_DISCOUNTED' },
    { key: 'local_msme', title: 'Local MSME Products', enabled: true, displayOrder: 40, itemLimit: 12, ruleType: 'LOCAL_MSME' },
    { key: 'hershg_products', title: 'SHG and Women SHG Products', enabled: true, displayOrder: 50, itemLimit: 12, ruleType: 'HERSHG' },
    { key: 'services', title: 'Services You May Need', enabled: true, displayOrder: 60, itemLimit: 12, ruleType: 'SERVICES' },
    { key: 'buyer_requirements', title: 'Trending Buyer Requirements', enabled: true, displayOrder: 70, itemLimit: 8, ruleType: 'BUYER_REQUIREMENTS' }
] as const;

const safeCategorySelect = { id: true, name: true, slug: true, type: true, displayOrder: true };
const safeProductInclude = {
    category: { select: safeCategorySelect },
    seller: { select: { id: true, name: true, onboardingStatus: true } },
    organization: {
        select: {
            id: true,
            organizationName: true,
            organizationType: true,
            city: true,
            district: true,
            state: true,
            verificationStatus: true,
            logoFile: { select: organizationLogoSelect },
            profile: { select: organizationProfileBrandSelect }
        }
    },
    images: { include: { fileAsset: { select: { id: true, url: true } } }, orderBy: [{ isPrimary: 'desc' as const }, { displayOrder: 'asc' as const }], take: 1 }
};
const safeServiceInclude = {
    category: { select: safeCategorySelect },
    seller: { select: { id: true, name: true, onboardingStatus: true } },
    organization: {
        select: {
            id: true,
            organizationName: true,
            organizationType: true,
            city: true,
            district: true,
            state: true,
            verificationStatus: true,
            logoFile: { select: organizationLogoSelect },
            profile: { select: organizationProfileBrandSelect }
        }
    }
};

const catalogueFileAssetSelect = { id: true, entityId: true, url: true, mimeType: true, originalName: true };
const catalogueEntityType = (itemType: 'product' | 'service') => itemType === 'service' ? 'catalogue_service' : 'catalogue_product';

const loadCatalogueFilesForItems = async (
    itemType: 'product' | 'service',
    itemIds: number[],
    options: { imageOnly?: boolean } = {}
) => {
    const ids = Array.from(new Set(itemIds.filter(id => Number.isFinite(id) && id > 0)));
    if (ids.length === 0) return new Map<number, any[]>();

    const files = await db.fileAsset.findMany({
        where: {
            entityType: { in: ['catalogue', catalogueEntityType(itemType)] },
            entityId: { in: ids },
            status: 'active',
            ...(options.imageOnly ? { mimeType: { startsWith: 'image/' } } : {})
        },
        select: catalogueFileAssetSelect,
        orderBy: { createdAt: 'asc' }
    }).catch(() => []);

    const byItemId = new Map<number, any[]>();
    for (const file of files || []) {
        const entityId = Number((file as any).entityId || 0);
        if (!entityId) continue;
        const current = byItemId.get(entityId) || [];
        current.push(file);
        byItemId.set(entityId, current);
    }
    return byItemId;
};

const attachCatalogueFilesToItems = async (
    items: any[],
    itemType: 'product' | 'service',
    options: { imageOnly?: boolean } = {}
) => {
    if (!Array.isArray(items) || items.length === 0) return items || [];
    const filesByItemId = await loadCatalogueFilesForItems(itemType, items.map(item => Number(item.id)), options);
    return items.map((item) => {
        const catalogueFiles = filesByItemId.get(Number(item.id)) || [];
        const catalogueImages = catalogueFiles
            .filter(file => String(file.mimeType || '').toLowerCase().startsWith('image/'))
            .map((file, index) => ({
                id: file.id,
                altText: file.originalName || `${item.name || 'Catalogue'} image ${index + 1}`,
                displayOrder: index,
                isPrimary: index === 0,
                fileAsset: file
            }));

        return {
            ...item,
            catalogueFiles,
            images: itemType === 'service'
                ? catalogueImages
                : [...(item.images || []), ...catalogueImages.filter(image => !(item.images || []).some((existing: any) => existing.fileAsset?.id === image.fileAsset.id))]
        };
    });
};

const attachCatalogueFilesToItem = async (item: any, itemType: 'product' | 'service') => {
    if (!item?.id) return item;
    const [withFiles] = await attachCatalogueFilesToItems([item], itemType);
    return withFiles || item;
};

const approvedSellerStatuses = ['approved_for_procurement'];
const publicSellerApprovalWhere = {
    OR: [
        { organization: { verificationStatus: 'VERIFIED', isBlacklisted: false, deletedAt: null } },
        { seller: { onboardingStatus: { in: approvedSellerStatuses } } }
    ]
};

const publicItemWhere = (extra: Record<string, any> = {}) => {
    const { AND, OR, ...rest } = extra;
    const andConditions: any[] = [publicSellerApprovalWhere];
    if (Array.isArray(AND)) andConditions.push(...AND);
    else if (AND) andConditions.push(AND);
    if (OR) andConditions.push({ OR });
    return { status: 'ACTIVE', ...rest, AND: andConditions };
};

const productPublicWhere = (extra: Record<string, any> = {}) => publicItemWhere(extra);
const servicePublicWhere = (extra: Record<string, any> = {}) => publicItemWhere(extra);

const activeOfferWhere = () => ({
    isOfferActive: true,
    originalPrice: { gt: 0 },
    discountPrice: { gt: 0 },
    OR: [{ offerStartAt: null }, { offerStartAt: { lte: new Date() } }],
    AND: [{ OR: [{ offerEndAt: null }, { offerEndAt: { gte: new Date() } }] }]
});

const resolveCategoryId = async (query: { categoryId?: number; category?: string }) => {
    if (query.categoryId) return query.categoryId;
    if (!query.category) return undefined;
    const category = await db.category.findFirst({
        where: {
            isActive: true,
            OR: [
                { slug: query.category },
                { name: { equals: query.category, mode: 'insensitive' } }
            ]
        },
        select: { id: true }
    }).catch(() => null);
    return category?.id;
};

const isOfferActiveNow = (item: any) => {
    if (!item?.isOfferActive) return false;
    const now = Date.now();
    const start = item.offerStartAt ? new Date(item.offerStartAt).getTime() : 0;
    const end = item.offerEndAt ? new Date(item.offerEndAt).getTime() : Number.POSITIVE_INFINITY;
    return start <= now && now <= end;
};

const offerFor = (item: any, basePrice: number) => {
    const explicitOriginal = Number(item?.originalPrice || 0);
    const explicitDiscount = Number(item?.discountPrice || 0);
    const explicitPercent = Number(item?.discountPercent || 0);
    if (isOfferActiveNow(item) && explicitOriginal > 0 && explicitDiscount > 0 && explicitDiscount < explicitOriginal) {
        return {
            originalPrice: explicitOriginal,
            discountPrice: explicitDiscount,
            discountPercent: explicitPercent > 0 ? explicitPercent : Math.round(((explicitOriginal - explicitDiscount) / explicitOriginal) * 100),
            isOfferActive: true
        };
    }
    const percent = Number(item?.discount || 0);
    if (basePrice > 0 && percent > 0 && percent < 100) {
        const discountPrice = Math.round(basePrice * (1 - percent / 100) * 100) / 100;
        return {
            originalPrice: basePrice,
            discountPrice,
            discountPercent: percent,
            isOfferActive: true
        };
    }
    return {
        originalPrice: null,
        discountPrice: null,
        discountPercent: null,
        isOfferActive: false
    };
};

const normalizeMarketplaceItem = (item: any, itemType: 'PRODUCT' | 'SERVICE', metrics: Record<string, any> = {}) => {
    const basePrice = Number(itemType === 'SERVICE' ? item.basePrice || 0 : item.price || 0);
    const offer = offerFor(item, basePrice);
    const category = item.category || {};
    const organization = item.organization || {};
    const imageUrl = itemType === 'PRODUCT'
        ? item.images?.[0]?.fileAsset?.url || item.imageUrl || null
        : item.imageUrl || item.images?.[0]?.fileAsset?.url || null;
    return {
        id: item.id,
        itemType,
        name: item.name,
        imageUrl,
        categoryId: item.categoryId || category.id || null,
        categoryName: category.name || null,
        categorySlug: category.slug || null,
        sellerId: item.sellerId || item.seller?.id || null,
        sellerName: organization.organizationName || item.seller?.name || 'Verified MSME seller',
        sellerVerified: organization.verificationStatus === 'VERIFIED',
        price: offer.isOfferActive && offer.discountPrice ? offer.discountPrice : basePrice || null,
        originalPrice: offer.originalPrice,
        discountPrice: offer.discountPrice,
        discountPercent: offer.discountPercent,
        unit: itemType === 'SERVICE' ? item.pricingModel : item.unitOfMeasure,
        moq: item.bulkMinQuantity || null,
        location: [organization.city, organization.district, organization.state].filter(Boolean).join(', ') || item.serviceArea || null,
        district: organization.district || null,
        rating: item.rating || null,
        totalOrders: Number(metrics.totalOrders || item.totalOrders || item.orderCount || 0),
        totalQuantity: metrics.totalQuantity || null,
        totalValue: metrics.totalValue || null,
        lastPurchasedAt: metrics.lastPurchasedAt || null,
        isOfferActive: offer.isOfferActive,
        offerLabel: item.offerLabel || null,
        bulkDealAvailable: Boolean(item.bulkDealAvailable),
        detailUrl: `/marketplace/${itemType === 'SERVICE' ? 'services' : 'products'}/${item.id}`
    };
};

const ensureMarketplaceHomeSections = async () => {
    if (!db.marketplaceHomeSection) return defaultHomeSections.map(section => ({ ...section }));
    await Promise.all(defaultHomeSections.map(section =>
        db.marketplaceHomeSection.upsert({
            where: { key: section.key },
            update: {},
            create: section
        }).catch(() => null)
    ));
    const sections = await db.marketplaceHomeSection.findMany({ orderBy: [{ displayOrder: 'asc' }, { key: 'asc' }] }).catch(() => []);
    return sections?.length ? sections : defaultHomeSections.map(section => ({ ...section }));
};

const loadFeaturedCategories = async () => getOrSetCache(redisKeys.cacheMarketplaceFeaturedCategories(), async () => {
    const categories = await db.category.findMany({
        where: { isActive: true },
        orderBy: [{ displayOrder: 'asc' }, { name: 'asc' }],
        take: 24,
        select: {
            id: true,
            name: true,
            slug: true,
            type: true,
            displayOrder: true,
            _count: {
                select: {
                    products: { where: productPublicWhere() },
                    services: { where: servicePublicWhere() }
                }
            }
        }
    }).catch(() => []);
    return (categories || []).map((category: any) => ({
        id: category.id,
        name: category.name,
        slug: category.slug,
        icon: category.slug,
        type: category.type,
        productCount: category._count?.products || 0,
        serviceCount: category._count?.services || 0,
        displayOrder: category.displayOrder
    }));
}, 300);

const purchaseCompletionWhere = {
    OR: [
        { poStatus: { in: ['ACCEPTED', 'DELIVERED', 'CLOSED'] } },
        { status: { in: ['accepted', 'delivered', 'closed', 'completed', 'fulfilled', 'paid'] } },
        { invoices: { some: { OR: [{ invoiceStatus: { in: ['APPROVED', 'PAID'] } }, { status: { in: ['approved', 'paid'] } }] } } },
        { payments: { some: { OR: [{ paymentStatus: { in: ['SUCCESS', 'SETTLED', 'PORTAL_PAYMENT_SUCCESS', 'OFFLINE_PROOF_VERIFIED'] } }, { status: { in: ['success', 'settled', 'paid', 'completed'] } }] } } }
    ],
    NOT: [
        { poStatus: { in: ['CANCELLED'] } },
        { status: { in: ['cancelled', 'rejected', 'failed', 'draft', 'pending'] } }
    ]
};

const loadMostPurchasedItems = async (limit = 12, categoryId?: number, buyerId?: number) => {
    const rows = await db.purchaseOrderItem.findMany({
        where: {
            productId: { not: null },
            purchaseOrder: {
                ...(buyerId ? { buyerId } : {}),
                ...purchaseCompletionWhere
            }
        },
        orderBy: { createdAt: 'desc' },
        take: Math.max(limit * 10, 80),
        include: {
            product: { include: safeProductInclude },
            purchaseOrder: { select: { id: true, buyerId: true, createdAt: true, acceptedAt: true, status: true, poStatus: true } }
        }
    }).catch(() => []);

    const aggregate = new Map<number, any>();
    for (const row of rows || []) {
        const product = row.product;
        if (!product || product.status !== 'ACTIVE') continue;
        if (categoryId && product.categoryId !== categoryId) continue;
        const current = aggregate.get(product.id) || { product, totalQuantity: 0, orderCount: 0, totalValue: 0, lastPurchasedAt: null };
        current.totalQuantity += Number(row.quantity || 0);
        current.orderCount += 1;
        current.totalValue += Number(row.totalAmount || 0);
        const at = row.purchaseOrder?.acceptedAt || row.purchaseOrder?.createdAt || row.createdAt;
        if (!current.lastPurchasedAt || new Date(at).getTime() > new Date(current.lastPurchasedAt).getTime()) current.lastPurchasedAt = at;
        aggregate.set(product.id, current);
    }

    return Array.from(aggregate.values())
        .sort((a, b) => (b.orderCount - a.orderCount) || (b.totalQuantity - a.totalQuantity))
        .slice(0, limit)
        .map(row => normalizeMarketplaceItem(row.product, 'PRODUCT', {
            totalOrders: row.orderCount,
            totalQuantity: row.totalQuantity,
            totalValue: row.totalValue,
            lastPurchasedAt: row.lastPurchasedAt
        }));
};

const loadTrendingRequirements = async (limit = 8) => loadLatestRequirements(limit);

const buildHomeLayout = async (params: z.infer<typeof marketplaceHomeLayoutQuery>, user?: AuthRequest['user']) => {
    const limit = Math.min(Math.max(Number(params.limit || 12), 1), 24);
    const categoryId = await resolveCategoryId({ categoryId: params.categoryId, category: params.category });
    const district = params.district?.trim();
    const districtFilter = district ? { organization: { district: { contains: district, mode: 'insensitive' } } } : {};
    const categoryFilter = categoryId ? { categoryId } : {};

    const [
        banners,
        categories,
        sectionConfigs,
        popularProducts,
        popularServices,
        discountedProducts,
        discountedServices,
        mostPurchased,
        localProducts,
        herShgProducts,
        trendingRequirements,
        verifiedSellers
    ] = await Promise.all([
        db.marketplaceBanner?.findMany?.({
            where: {
                isActive: true,
                status: 'ACTIVE',
                displayLocation: 'HOME_HERO',
                OR: [{ startAt: null }, { startAt: { lte: new Date() } }],
                AND: [{ OR: [{ endAt: null }, { endAt: { gte: new Date() } }] }]
            },
            orderBy: [{ priority: 'desc' }, { displayOrder: 'asc' }],
            take: 10
        }).catch(() => []),
        loadFeaturedCategories(),
        ensureMarketplaceHomeSections(),
        db.product.findMany({
            where: productPublicWhere({ ...categoryFilter, ...districtFilter }),
            orderBy: [{ updatedAt: 'desc' }, { createdAt: 'desc' }],
            take: limit,
            include: safeProductInclude
        }).catch(() => []),
        db.service.findMany({
            where: servicePublicWhere({ ...categoryFilter, ...districtFilter }),
            orderBy: [{ updatedAt: 'desc' }, { createdAt: 'desc' }],
            take: limit,
            include: safeServiceInclude
        }).catch(() => []),
        db.product.findMany({
            where: productPublicWhere({ ...categoryFilter, ...activeOfferWhere() }),
            orderBy: [{ discountPercent: 'desc' }, { updatedAt: 'desc' }],
            take: limit,
            include: safeProductInclude
        }).catch(() => []),
        db.service.findMany({
            where: servicePublicWhere({ ...categoryFilter, ...activeOfferWhere() }),
            orderBy: [{ discountPercent: 'desc' }, { updatedAt: 'desc' }],
            take: limit,
            include: safeServiceInclude
        }).catch(() => []),
        loadMostPurchasedItems(limit, categoryId, user?.role === 'buyer' ? Number(user.id) : undefined),
        db.product.findMany({
            where: productPublicWhere({
                ...categoryFilter,
                organization: { OR: [{ district: { contains: 'Jharsuguda', mode: 'insensitive' } }, { state: { contains: 'Odisha', mode: 'insensitive' } }] }
            }),
            orderBy: [{ updatedAt: 'desc' }],
            take: limit,
            include: safeProductInclude
        }).catch(() => []),
        db.product.findMany({
            where: productPublicWhere({
                ...categoryFilter,
                OR: [
                    { organization: { organizationName: { contains: 'SHG', mode: 'insensitive' } } },
                    { organization: { organizationName: { contains: 'Women', mode: 'insensitive' } } },
                    { category: { name: { contains: 'SHG', mode: 'insensitive' } } },
                    { category: { name: { contains: 'Women', mode: 'insensitive' } } }
                ]
            }),
            orderBy: [{ updatedAt: 'desc' }],
            take: limit,
            include: safeProductInclude
        }).catch(() => []),
        loadTrendingRequirements(Math.min(limit, 8)),
        db.organization.findMany({
            where: sellerOrganizationWhere,
            orderBy: { updatedAt: 'desc' },
            take: 16,
            select: {
                id: true,
                organizationName: true,
                organizationType: true,
                city: true,
                district: true,
                state: true,
                verificationStatus: true,
                logoFile: { select: organizationLogoSelect },
                profile: { select: organizationProfileBrandSelect },
                _count: { select: { products: { where: { status: 'ACTIVE' } }, services: { where: { status: 'ACTIVE' } } } }
            }
        }).catch(() => [])
    ]);

    const [
        popularServicesWithFiles,
        discountedServicesWithFiles
    ] = await Promise.all([
        attachCatalogueFilesToItems(popularServices, 'service', { imageOnly: true }),
        attachCatalogueFilesToItems(discountedServices, 'service', { imageOnly: true })
    ]);

    const sectionData: Record<string, any> = {
        popular_picks: {
            key: 'popular_picks',
            title: 'Popular Picks',
            subtitle: 'Frequently selected marketplace items',
            layout: 'carousel',
            items: [...popularProducts.map((item: any) => normalizeMarketplaceItem(item, 'PRODUCT')), ...popularServicesWithFiles.map((item: any) => normalizeMarketplaceItem(item, 'SERVICE'))].slice(0, limit)
        },
        most_purchased: {
            key: 'most_purchased',
            title: 'Mostly Purchased Items',
            subtitle: 'Commonly procured items by buyers',
            layout: 'carousel',
            items: mostPurchased
        },
        discounted_products: {
            key: 'discounted_products',
            title: 'Discounted Products and Offers',
            subtitle: 'Active seller offers and rate benefits',
            layout: 'carousel',
            items: [...discountedProducts.map((item: any) => normalizeMarketplaceItem(item, 'PRODUCT')), ...discountedServicesWithFiles.map((item: any) => normalizeMarketplaceItem(item, 'SERVICE'))].slice(0, limit)
        },
        local_msme: {
            key: 'local_msme',
            title: 'Local MSME Products',
            subtitle: 'Jharsuguda and Odisha seller listings',
            layout: 'carousel',
            items: localProducts.map((item: any) => normalizeMarketplaceItem(item, 'PRODUCT'))
        },
        hershg_products: {
            key: 'hershg_products',
            title: 'SHG and Women SHG Products',
            subtitle: 'Listings identified from verified seller metadata',
            layout: 'carousel',
            items: herShgProducts.map((item: any) => normalizeMarketplaceItem(item, 'PRODUCT'))
        },
        services: {
            key: 'services',
            title: 'Services You May Need',
            subtitle: 'Professional services from verified providers',
            layout: 'carousel',
            items: popularServicesWithFiles.map((item: any) => normalizeMarketplaceItem(item, 'SERVICE'))
        },
        buyer_requirements: {
            key: 'buyer_requirements',
            title: 'Trending Buyer Requirements',
            subtitle: 'Open procurement needs and RFQs',
            layout: 'list',
            items: trendingRequirements
        }
    };

    const sections = (sectionConfigs || [])
        .filter((section: any) => section.enabled)
        .sort((a: any, b: any) => Number(a.displayOrder || 0) - Number(b.displayOrder || 0))
        .map((section: any) => {
            const data = sectionData[section.key] || sectionData.popular_picks;
            return {
                ...data,
                title: section.title || data.title,
                items: Array.isArray(data.items) ? data.items.slice(0, Number(section.itemLimit || limit)) : []
            };
        });

    return { banners: banners || [], categories, sections, verifiedSellers };
};

// ─── Public: Home Page Aggregated Data ───────────────────────────────────────
router.get('/marketplace/categories/featured', longCache(300), async (_req: Request, res: Response) => {
    try {
        return ok(res, { categories: await loadFeaturedCategories() });
    } catch (error) {
        console.error('[Marketplace Featured Categories]', error);
        return apiResponse.error(res, 500, 'Failed to load featured categories', 'MARKETPLACE_CATEGORIES_ERROR');
    }
});

router.get('/marketplace/home-layout', optionalAuthenticate, shortCache(60), async (req: AuthRequest, res: Response) => {
    try {
        const query = marketplaceHomeLayoutQuery.parse(req.query);
        const cacheIdentity = { ...query, user: req.user?.role === 'buyer' ? req.user?.id : 'public' };
        const cacheKey = redisKeys.cacheMarketplaceHomeLayout(stableCacheHash(cacheIdentity));
        const data = await getOrSetCache(cacheKey, () => buildHomeLayout(query, req.user), req.user ? 60 : 180);
        return ok(res, data);
    } catch (error) {
        console.error('[Marketplace Home Layout]', error);
        return apiResponse.error(res, 500, 'Failed to load marketplace home layout', 'MARKETPLACE_HOME_LAYOUT_ERROR');
    }
});

router.post('/marketplace/interactions', optionalAuthenticate, async (req: AuthRequest, res: Response) => {
    try {
        const body = marketplaceInteractionSchema.parse(req.body);
        if (!req.user?.id) return ok(res, { tracked: false, storage: 'guest' });
        const since = new Date(Date.now() - 60_000);
        const recentCount = await db.marketplaceInteraction?.count?.({
            where: { userId: Number(req.user.id), action: body.action, createdAt: { gte: since } }
        }).catch(() => 0);
        if (recentCount > 60) return ok(res, { tracked: false, rateLimited: true });

        const metadata = body.metadata
            ? Object.fromEntries(Object.entries(body.metadata).slice(0, 12).map(([key, value]) => [key.slice(0, 40), typeof value === 'string' ? value.slice(0, 200) : value]))
            : undefined;

        const interaction = await db.marketplaceInteraction?.create?.({
            data: {
                userId: Number(req.user.id),
                organizationId: req.user.organizationId || null,
                itemId: body.itemId || null,
                itemType: body.itemType || null,
                categoryId: body.categoryId || null,
                action: body.action,
                metadata
            },
            select: { id: true, action: true, createdAt: true }
        }).catch(() => null);
        return ok(res, { tracked: Boolean(interaction), interaction });
    } catch (error) {
        console.error('[Marketplace Interaction]', error);
        return ok(res, { tracked: false });
    }
});

router.get('/marketplace/recommendations', authenticate, authorize('buyer', 'admin', 'master_admin'), async (req: AuthRequest, res: Response) => {
    try {
        const userIdValue = Number(req.user?.id);
        const organizationId = req.user?.organizationId || undefined;
        const [interactions, cartItems, buyerProfile, buyAgain] = await Promise.all([
            db.marketplaceInteraction?.findMany?.({
                where: {
                    OR: [
                        { userId: userIdValue },
                        ...(organizationId ? [{ organizationId }] : [])
                    ],
                    createdAt: { gte: new Date(Date.now() - 90 * 24 * 60 * 60 * 1000) }
                },
                orderBy: { createdAt: 'desc' },
                take: 80,
                select: { categoryId: true, itemId: true, itemType: true, action: true }
            }).catch(() => []),
            organizationId ? db.cartItem.findMany({
                where: { cart: { organizationId, status: 'ACTIVE' } },
                include: { product: { select: { categoryId: true } }, service: { select: { categoryId: true } } },
                take: 50
            }).catch(() => []) : Promise.resolve([]),
            db.buyerProfile.findFirst({
                where: { OR: [{ userId: userIdValue }, ...(organizationId ? [{ organizationId }] : [])] },
                select: { procurementCategories: true }
            }).catch(() => null),
            loadMostPurchasedItems(8, undefined, userIdValue)
        ]);

        const categoryIds = new Set<number>();
        for (const interaction of interactions || []) if (interaction.categoryId) categoryIds.add(Number(interaction.categoryId));
        for (const item of cartItems || []) {
            if (item.product?.categoryId) categoryIds.add(Number(item.product.categoryId));
            if (item.service?.categoryId) categoryIds.add(Number(item.service.categoryId));
        }

        const profileCategories = buyerProfile?.procurementCategories || [];
        if (profileCategories.length) {
            const matched = await db.category.findMany({
                where: {
                    isActive: true,
                    OR: profileCategories.slice(0, 8).map((name: string) => ({ name: { contains: name, mode: 'insensitive' } }))
                },
                select: { id: true }
            }).catch(() => []);
            matched.forEach((category: any) => categoryIds.add(category.id));
        }

        const categoryFilter = categoryIds.size ? { categoryId: { in: Array.from(categoryIds).slice(0, 12) } } : {};
        const [yourChoicesProducts, similarProducts, discountedProducts, fallbackProducts] = await Promise.all([
            db.product.findMany({ where: productPublicWhere(categoryFilter), include: safeProductInclude, orderBy: { updatedAt: 'desc' }, take: 8 }).catch(() => []),
            db.product.findMany({ where: productPublicWhere(categoryFilter), include: safeProductInclude, orderBy: { createdAt: 'desc' }, take: 8 }).catch(() => []),
            db.product.findMany({ where: productPublicWhere({ ...categoryFilter, ...activeOfferWhere() }), include: safeProductInclude, orderBy: { updatedAt: 'desc' }, take: 8 }).catch(() => []),
            db.product.findMany({ where: productPublicWhere(), include: safeProductInclude, orderBy: { updatedAt: 'desc' }, take: 8 }).catch(() => [])
        ]);

        const sections = [
            {
                key: 'your_choices',
                title: 'Your Choices',
                subtitle: 'Based on your marketplace activity and categories',
                layout: 'carousel',
                items: (yourChoicesProducts.length ? yourChoicesProducts : fallbackProducts).map((item: any) => normalizeMarketplaceItem(item, 'PRODUCT'))
            },
            {
                key: 'buy_again',
                title: 'Buy Again',
                subtitle: 'From previous completed procurement records',
                layout: 'carousel',
                items: buyAgain
            },
            {
                key: 'similar_to_cart',
                title: 'Similar to Your Cart',
                subtitle: 'Matching active cart categories',
                layout: 'carousel',
                items: similarProducts.map((item: any) => normalizeMarketplaceItem(item, 'PRODUCT'))
            },
            {
                key: 'discounted_in_categories',
                title: 'Discounted Items in Your Categories',
                subtitle: 'Active offers only',
                layout: 'carousel',
                items: discountedProducts.map((item: any) => normalizeMarketplaceItem(item, 'PRODUCT'))
            }
        ].filter(section => section.items.length > 0).slice(0, 5);

        const categories = await loadFeaturedCategories();
        return ok(res, { sections, categories, fallback: sections.length === 0 });
    } catch (error) {
        console.error('[Marketplace Recommendations]', error);
        return apiResponse.error(res, 500, 'Failed to load recommendations', 'MARKETPLACE_RECOMMENDATIONS_ERROR');
    }
});

router.get('/admin/marketplace/home-sections', authenticate, authorize('admin', 'master_admin'), async (_req: AuthRequest, res: Response) => {
    try {
        return ok(res, { sections: await ensureMarketplaceHomeSections() });
    } catch (error) {
        console.error('[Admin Marketplace Sections]', error);
        return apiResponse.error(res, 500, 'Failed to load marketplace home sections', 'ADMIN_MARKETPLACE_SECTIONS_ERROR');
    }
});

router.patch('/admin/marketplace/home-sections/:key', authenticate, authorize('admin', 'master_admin'), async (req: AuthRequest, res: Response) => {
    try {
        const key = String(req.params.key || '').trim();
        const body = adminHomeSectionSchema.parse(req.body);
        const existingDefault = defaultHomeSections.find(section => section.key === key);
        if (!existingDefault) return apiResponse.error(res, 404, 'Marketplace section not found', 'MARKETPLACE_SECTION_NOT_FOUND');
        const section = await db.marketplaceHomeSection.upsert({
            where: { key },
            update: body,
            create: { ...existingDefault, ...body }
        });
        return ok(res, section);
    } catch (error) {
        console.error('[Admin Marketplace Section Update]', error);
        return apiResponse.error(res, 400, 'Unable to update marketplace home section', 'ADMIN_MARKETPLACE_SECTION_UPDATE_ERROR');
    }
});

router.get('/marketplace/home', shortCache(60), async (_req: Request, res: Response) => {
    try {
        const [latestRequirements, latestTenders, latestBids] = await Promise.all([
            loadLatestRequirements(24),
            loadLatestTenders(6),
            loadLatestProcurementBids(6)
        ]);
        const data = await getOrSetCache(redisKeys.cacheMarketplaceHome(), async () => {
            const [
                banners,
                categories,
                featuredProducts,
                featuredServices,
                verifiedSellers,
                notices,
                largeIndustries,
                bigMsmes,
                stats
            ] = await Promise.all([
                // Banners
                db.marketplaceBanner?.findMany?.({
                    where: { isActive: true },
                    orderBy: { displayOrder: 'asc' },
                    take: 10
                }).catch(() => []),

                // Categories
                db.category.findMany({
                    where: { isActive: true },
                    orderBy: [{ displayOrder: 'asc' }, { name: 'asc' }],
                    include: {
                        _count: { select: { products: { where: { status: 'ACTIVE' } }, services: { where: { status: 'ACTIVE' } } } }
                    }
                }).catch(() => []),

                // Featured Products
                db.product.findMany({
                    where: { status: 'ACTIVE' },
                    orderBy: { createdAt: 'desc' },
                    take: 12,
                    include: {
                        category: { select: { id: true, name: true } },
                        seller: { select: { id: true, name: true, onboardingStatus: true } },
                        organization: { select: { id: true, organizationName: true, city: true, district: true, state: true, verificationStatus: true, logoFile: { select: organizationLogoSelect }, profile: { select: organizationProfileBrandSelect } } },
                        images: { include: { fileAsset: { select: { id: true, url: true } } }, orderBy: [{ isPrimary: 'desc' }, { displayOrder: 'asc' }], take: 1 }
                    }
                }).catch(() => []),

                // Featured Services
                db.service.findMany({
                    where: { status: 'ACTIVE' },
                    orderBy: { createdAt: 'desc' },
                    take: 8,
                    include: {
                        category: { select: { id: true, name: true } },
                        seller: { select: { id: true, name: true, onboardingStatus: true } },
                        organization: { select: { id: true, organizationName: true, city: true, district: true, state: true, verificationStatus: true, logoFile: { select: organizationLogoSelect }, profile: { select: organizationProfileBrandSelect } } }
                    }
                }).catch(() => []),

                // Verified Sellers
                db.organization.findMany({
                    where: sellerOrganizationWhere,
                    orderBy: { updatedAt: 'desc' },
                    take: 16,
                    select: {
                        id: true,
                        organizationName: true,
                        organizationType: true,
                        city: true,
                        district: true,
                        state: true,
                        verificationStatus: true,
                        logoFile: { select: organizationLogoSelect },
                        profile: { select: organizationProfileBrandSelect },
                        _count: { select: { products: { where: { status: 'ACTIVE' } }, services: { where: { status: 'ACTIVE' } } } }
                    }
                }).catch(() => []),

                // Notices
                db.marketplaceNotice?.findMany?.({
                    where: { isActive: true },
                    orderBy: { publishedAt: 'desc' },
                    take: 5
                }).catch(() => []),

                db.organization.findMany({
                    where: {
                        verificationStatus: 'VERIFIED',
                        isBlacklisted: false,
                        deletedAt: null,
                        OR: [
                            { users: { some: { role: 'buyer', accountStatus: 'ACTIVE' } } },
                            { buyerProfiles: { some: {} } },
                            { buyerRequirements: { some: {} } },
                            { procurementBids: { some: {} } },
                            { tenders: { some: {} } },
                            { profile: { isLargeIndustry: true } },
                            { organizationType: { in: ['PUBLIC_LIMITED', 'PSU', 'GOVERNMENT'] } }
                        ]
                    },
                    orderBy: { updatedAt: 'desc' },
                    take: 24,
                    select: {
                        id: true,
                        organizationName: true,
                        organizationType: true,
                        city: true,
                        district: true,
                        state: true,
                        verificationStatus: true,
                        logoFile: { select: organizationLogoSelect },
                        profile: true,
                        _count: { select: { buyerRequirements: true } }
                    }
                }).catch(() => []),

                db.organization.findMany({
                    where: {
                        verificationStatus: 'VERIFIED',
                        isBlacklisted: false,
                        deletedAt: null,
                        OR: [
                            { profile: { isBigMsme: true } },
                            { organizationType: 'MSME' }
                        ]
                    },
                    orderBy: { updatedAt: 'desc' },
                    take: 8,
                    select: {
                        id: true,
                        organizationName: true,
                        organizationType: true,
                        city: true,
                        district: true,
                        state: true,
                        verificationStatus: true,
                        logoFile: { select: organizationLogoSelect },
                        profile: true,
                        _count: { select: { products: { where: { status: 'ACTIVE' } }, services: { where: { status: 'ACTIVE' } } } }
                    }
                }).catch(() => []),

                // Stats
                Promise.all([
                    db.organization.count({ where: sellerOrganizationWhere }).catch(() => 0),
                    db.user.count({ where: { role: 'buyer', accountStatus: 'ACTIVE', onboardingStatus: { in: ['approved_for_procurement', 'approved'] } } }).catch(() => 0),
                    db.organization.count({
                        where: {
                            verificationStatus: 'VERIFIED',
                            isBlacklisted: false,
                            deletedAt: null,
                            OR: [
                                { users: { some: { role: 'buyer', accountStatus: 'ACTIVE' } } },
                                { buyerProfiles: { some: {} } },
                                { buyerRequirements: { some: {} } },
                                { procurementBids: { some: {} } },
                                { tenders: { some: {} } },
                                { profile: { isLargeIndustry: true } },
                                { organizationType: { in: ['PUBLIC_LIMITED', 'PSU', 'GOVERNMENT'] } }
                            ]
                        }
                    }).catch(() => 0),
                    db.product.count({ where: { status: 'ACTIVE' } }).catch(() => 0),
                    db.service.count({ where: { status: 'ACTIVE' } }).catch(() => 0),
                    db.category.count({ where: { isActive: true } }).catch(() => 0),
                ]).then(([sellers, buyerUsers, buyerOrganizations, products, services, categories]) => ({
                    verifiedSellers: sellers,
                    registeredBuyers: Math.max(buyerUsers, buyerOrganizations),
                    productsListed: products,
                    servicesListed: services,
                    categories
                }))
            ]);

            return { banners, categories, featuredProducts, featuredServices, featuredRequirements: [], verifiedSellers, largeIndustries, bigMsmes, notices, stats };
        }, 300); // Cache 5 minutes

        return ok(res, { ...data, featuredRequirements: latestRequirements, latestTenders, latestBids });
    } catch (error) {
        console.error('[Marketplace Home]', error);
        return apiResponse.error(res, 500, 'Failed to load marketplace data', 'MARKETPLACE_HOME_ERROR');
    }
});

// ─── Public: Banners ─────────────────────────────────────────────────────────
router.get('/marketplace/banners', shortCache(60), async (_req: Request, res: Response) => {
    try {
        const banners = await db.marketplaceBanner?.findMany?.({
            where: { isActive: true },
            orderBy: { displayOrder: 'asc' }
        }).catch(() => []);
        return ok(res, banners || []);
    } catch {
        return ok(res, []);
    }
});

// ─── Public: Product Listing ─────────────────────────────────────────────────
router.get('/marketplace/products', optionalAuthenticate, checkFeatureIfAuthenticated('product-marketplace'), shortCache(45), async (req: AuthRequest, res: Response) => {
    try {
        const query = paginationQuery.parse(req.query);
        const page = query.page || 1;
        const pageSize = query.pageSize || 12;
        const skip = (page - 1) * pageSize;
        const categoryId = await resolveCategoryId(query);

        const where: any = productPublicWhere();
        if (query.q) {
            where.OR = [
                { name: { contains: query.q, mode: 'insensitive' } },
                { description: { contains: query.q, mode: 'insensitive' } },
                { brand: { contains: query.q, mode: 'insensitive' } },
                { category: { name: { contains: query.q, mode: 'insensitive' } } },
                { organization: { organizationName: { contains: query.q, mode: 'insensitive' } } }
            ];
        }
        if (categoryId) where.categoryId = categoryId;
        const minPrice = query.priceMin ?? query.minPrice;
        const maxPrice = query.priceMax ?? query.maxPrice;
        if (minPrice !== undefined || maxPrice !== undefined) {
            where.price = {};
            if (minPrice !== undefined) where.price.gte = minPrice;
            if (maxPrice !== undefined) where.price.lte = maxPrice;
        }
        const district = query.district || query.location;
        if (district) {
            where.AND = [...(where.AND || []), {
                organization: {
                    OR: [
                        { district: { contains: district, mode: 'insensitive' } },
                        { city: { contains: district, mode: 'insensitive' } },
                        { state: { contains: district, mode: 'insensitive' } }
                    ]
                }
            }];
        }
        if (query.verified === 'true' || query.verifiedSeller === 'true') {
            where.AND = [...(where.AND || []), { organization: { verificationStatus: 'VERIFIED' } }];
        }
        if (query.discount === 'true' || query.discount === 'active' || query.sort === 'discount') {
            const offer = activeOfferWhere();
            where.AND = [...(where.AND || []), ...(Array.isArray(offer.AND) ? offer.AND : []), { OR: offer.OR }];
            where.isOfferActive = offer.isOfferActive;
            where.originalPrice = offer.originalPrice;
            where.discountPrice = offer.discountPrice;
        }

        let orderBy: any = { createdAt: 'desc' };
        if (query.sort === 'newest' || query.sort === 'latest') orderBy = { createdAt: 'desc' };
        if (query.sort === 'price_asc') orderBy = { price: 'asc' };
        else if (query.sort === 'price_desc') orderBy = { price: 'desc' };
        else if (query.sort === 'name') orderBy = { name: 'asc' };
        else if (query.sort === 'discount') orderBy = [{ discountPercent: 'desc' }, { updatedAt: 'desc' }];
        else if (query.sort === 'verified') orderBy = [{ updatedAt: 'desc' }];
        else if (query.sort === 'popular') orderBy = [{ updatedAt: 'desc' }];

        let mostPurchasedIds: number[] = [];
        if (query.sort === 'most_purchased') {
            const mostPurchased = await loadMostPurchasedItems(100, categoryId);
            mostPurchasedIds = mostPurchased.map(item => item.id);
            if (mostPurchasedIds.length) where.id = { in: mostPurchasedIds };
        }

        const [products, total] = await Promise.all([
            db.product.findMany({
                where,
                orderBy,
                skip,
                take: pageSize,
                include: {
                    category: { select: { id: true, name: true } },
                    seller: { select: { id: true, name: true, onboardingStatus: true } },
                    organization: { select: { id: true, organizationName: true, city: true, district: true, state: true, verificationStatus: true, logoFile: { select: organizationLogoSelect }, profile: { select: organizationProfileBrandSelect } } },
                    images: { include: { fileAsset: { select: { id: true, url: true } } }, orderBy: [{ isPrimary: 'desc' }, { displayOrder: 'asc' }], take: 1 }
                }
            }),
            db.product.count({ where })
        ]);

        const sortedProducts = mostPurchasedIds.length
            ? [...products].sort((a: any, b: any) => mostPurchasedIds.indexOf(a.id) - mostPurchasedIds.indexOf(b.id))
            : products;
        return ok(res, { products: sortedProducts, total, page, pageSize, totalPages: Math.ceil(total / pageSize) });
    } catch (error) {
        if (error instanceof z.ZodError) {
            return apiResponse.error(res, 400, error.issues.map(e => `${e.path.join('.')}: ${e.message}`).join(', '), 'VALIDATION_ERROR');
        }
        console.error('[Marketplace Products]', error);
        return apiResponse.error(res, 500, 'Failed to load products', 'MARKETPLACE_PRODUCTS_ERROR');
    }
});

// ─── Public: Product Detail ──────────────────────────────────────────────────
router.get('/marketplace/products/:id', optionalAuthenticate, checkFeatureIfAuthenticated('product-marketplace'), shortCache(60), async (req: AuthRequest, res: Response) => {
    try {
        const id = Number(req.params.id);
        if (!id || id < 1) return apiResponse.error(res, 400, 'Invalid product ID', 'INVALID_ID');

        const product = await db.product.findFirst({
            where: { id, status: 'ACTIVE' },
            include: {
                category: { select: { id: true, name: true } },
                seller: { select: { id: true, name: true, onboardingStatus: true } },
                organization: { select: { id: true, organizationName: true, city: true, district: true, state: true, verificationStatus: true, gstin: true } },
                images: { include: { fileAsset: { select: { id: true, url: true, originalName: true } } }, orderBy: [{ isPrimary: 'desc' }, { displayOrder: 'asc' }] },
                specifications: { orderBy: { name: 'asc' } },
                certifications: { include: { fileAsset: { select: { id: true, url: true } } } }
            }
        });

        if (!product) return apiResponse.error(res, 404, 'Product not found', 'PRODUCT_NOT_FOUND');
        const productWithFiles = await attachCatalogueFilesToItem(product, 'product');

        // Related products from same category
        const related = await db.product.findMany({
            where: { status: 'ACTIVE', categoryId: product.categoryId, id: { not: id } },
            take: 4,
            include: {
                category: { select: { id: true, name: true } },
                organization: { select: { id: true, organizationName: true, city: true, state: true, verificationStatus: true } },
                images: { include: { fileAsset: { select: { id: true, url: true } } }, orderBy: [{ isPrimary: 'desc' }], take: 1 }
            }
        });

        return ok(res, { product: productWithFiles, relatedProducts: related });
    } catch (error) {
        console.error('[Marketplace Product Detail]', error);
        return apiResponse.error(res, 500, 'Failed to load product details', 'PRODUCT_DETAIL_ERROR');
    }
});

// ─── Public: Service Listing ─────────────────────────────────────────────────
router.get('/marketplace/services', optionalAuthenticate, checkFeatureIfAuthenticated('service-marketplace'), shortCache(45), async (req: AuthRequest, res: Response) => {
    try {
        const query = paginationQuery.parse(req.query);
        const page = query.page || 1;
        const pageSize = query.pageSize || 12;
        const skip = (page - 1) * pageSize;
        const categoryId = await resolveCategoryId(query);

        const where: any = servicePublicWhere();
        if (query.q) {
            where.OR = [
                { name: { contains: query.q, mode: 'insensitive' } },
                { description: { contains: query.q, mode: 'insensitive' } },
                { category: { name: { contains: query.q, mode: 'insensitive' } } },
                { organization: { organizationName: { contains: query.q, mode: 'insensitive' } } }
            ];
        }
        if (categoryId) where.categoryId = categoryId;
        const minPrice = query.priceMin ?? query.minPrice;
        const maxPrice = query.priceMax ?? query.maxPrice;
        if (minPrice !== undefined || maxPrice !== undefined) {
            where.basePrice = {};
            if (minPrice !== undefined) where.basePrice.gte = minPrice;
            if (maxPrice !== undefined) where.basePrice.lte = maxPrice;
        }
        const district = query.district || query.location;
        if (district) {
            where.AND = [...(where.AND || []), {
                organization: {
                    OR: [
                        { district: { contains: district, mode: 'insensitive' } },
                        { city: { contains: district, mode: 'insensitive' } },
                        { state: { contains: district, mode: 'insensitive' } }
                    ]
                }
            }];
        }
        if (query.verified === 'true' || query.verifiedSeller === 'true') {
            where.AND = [...(where.AND || []), { organization: { verificationStatus: 'VERIFIED' } }];
        }
        if (query.discount === 'true' || query.discount === 'active' || query.sort === 'discount') {
            const offer = activeOfferWhere();
            where.AND = [...(where.AND || []), ...(Array.isArray(offer.AND) ? offer.AND : []), { OR: offer.OR }];
            where.isOfferActive = offer.isOfferActive;
            where.originalPrice = offer.originalPrice;
            where.discountPrice = offer.discountPrice;
        }

        let orderBy: any = { createdAt: 'desc' };
        if (query.sort === 'newest' || query.sort === 'latest') orderBy = { createdAt: 'desc' };
        else if (query.sort === 'price_asc') orderBy = { basePrice: 'asc' };
        else if (query.sort === 'price_desc') orderBy = { basePrice: 'desc' };
        else if (query.sort === 'name') orderBy = { name: 'asc' };
        else if (query.sort === 'discount') orderBy = [{ discountPercent: 'desc' }, { updatedAt: 'desc' }];
        else if (query.sort === 'verified' || query.sort === 'popular' || query.sort === 'most_purchased') orderBy = [{ updatedAt: 'desc' }];

        const [services, total] = await Promise.all([
            db.service.findMany({
                where,
                orderBy,
                skip,
                take: pageSize,
                include: {
                    category: { select: { id: true, name: true } },
                    seller: { select: { id: true, name: true, onboardingStatus: true } },
                    organization: { select: { id: true, organizationName: true, city: true, district: true, state: true, verificationStatus: true, logoFile: { select: organizationLogoSelect }, profile: { select: organizationProfileBrandSelect } } }
                }
            }),
            db.service.count({ where })
        ]);

        const servicesWithFiles = await attachCatalogueFilesToItems(services, 'service', { imageOnly: true });
        return ok(res, { services: servicesWithFiles, total, page, pageSize, totalPages: Math.ceil(total / pageSize) });
    } catch (error) {
        if (error instanceof z.ZodError) {
            return apiResponse.error(res, 400, error.issues.map(e => `${e.path.join('.')}: ${e.message}`).join(', '), 'VALIDATION_ERROR');
        }
        console.error('[Marketplace Services]', error);
        return apiResponse.error(res, 500, 'Failed to load services', 'MARKETPLACE_SERVICES_ERROR');
    }
});

// ─── Public: Service Detail ──────────────────────────────────────────────────
router.get('/marketplace/services/:id', optionalAuthenticate, checkFeatureIfAuthenticated('service-marketplace'), shortCache(60), async (req: AuthRequest, res: Response) => {
    try {
        const id = Number(req.params.id);
        if (!id || id < 1) return apiResponse.error(res, 400, 'Invalid service ID', 'INVALID_ID');

        const service = await db.service.findFirst({
            where: { id, status: 'ACTIVE' },
            include: {
                category: { select: { id: true, name: true } },
                seller: { select: { id: true, name: true, onboardingStatus: true } },
                organization: { select: { id: true, organizationName: true, city: true, district: true, state: true, verificationStatus: true, gstin: true } },
                certifications: { include: { fileAsset: { select: { id: true, url: true } } } }
            }
        });

        if (!service) return apiResponse.error(res, 404, 'Service not found', 'SERVICE_NOT_FOUND');
        const serviceWithFiles = await attachCatalogueFilesToItem(service, 'service');

        const related = await db.service.findMany({
            where: { status: 'ACTIVE', categoryId: service.categoryId, id: { not: id } },
            take: 4,
            include: {
                category: { select: { id: true, name: true } },
                organization: { select: { id: true, organizationName: true, city: true, state: true, verificationStatus: true } }
            }
        });
        const relatedWithFiles = await attachCatalogueFilesToItems(related, 'service', { imageOnly: true });

        return ok(res, { service: serviceWithFiles, relatedServices: relatedWithFiles });
    } catch (error) {
        console.error('[Marketplace Service Detail]', error);
        return apiResponse.error(res, 500, 'Failed to load service details', 'SERVICE_DETAIL_ERROR');
    }
});

// ─── Public: Verified Sellers ────────────────────────────────────────────────
router.get('/marketplace/sellers', shortCache(60), async (req: Request, res: Response) => {
    try {
        const query = paginationQuery.parse(req.query);
        const page = query.page || 1;
        const pageSize = query.pageSize || 12;
        const skip = (page - 1) * pageSize;

        const where: any = { ...sellerOrganizationWhere };
        if (query.q) {
            where.organizationName = { contains: query.q, mode: 'insensitive' };
        }

        const [sellers, total] = await Promise.all([
            db.organization.findMany({
                where,
                orderBy: { updatedAt: 'desc' },
                skip,
                take: pageSize,
                select: {
                    id: true,
                    organizationName: true,
                    organizationType: true,
                    city: true,
                    district: true,
                    state: true,
                    verificationStatus: true,
                    logoFile: { select: organizationLogoSelect },
                    profile: { select: organizationProfileBrandSelect },
                    users: {
                        where: {
                            role: { in: ['seller', 'shg'] },
                            accountStatus: 'ACTIVE'
                        },
                        select: {
                            id: true
                        }
                    },
                    _count: { select: { products: { where: { status: 'ACTIVE' } }, services: { where: { status: 'ACTIVE' } } } }
                }
            }),
            db.organization.count({ where })
        ]);

        const mappedSellers = sellers.map((org: any) => {
            const sellerUser = org.users?.[0];
            return {
                id: org.id,
                organizationName: org.organizationName,
                organizationType: org.organizationType,
                city: org.city,
                district: org.district,
                state: org.state,
                verificationStatus: org.verificationStatus,
                logoFile: org.logoFile,
                profile: org.profile,
                _count: org._count,
                sellerUserId: sellerUser ? sellerUser.id : null
            };
        });

        return ok(res, { sellers: mappedSellers, total, page, pageSize, totalPages: Math.ceil(total / pageSize) });
    } catch (error) {
        if (error instanceof z.ZodError) {
            return apiResponse.error(res, 400, error.issues.map(e => `${e.path.join('.')}: ${e.message}`).join(', '), 'VALIDATION_ERROR');
        }
        console.error('[Marketplace Sellers]', error);
        return apiResponse.error(res, 500, 'Failed to load sellers', 'MARKETPLACE_SELLERS_ERROR');
    }
});


router.get('/marketplace/sellers/:id', shortCache(60), async (req: Request, res: Response) => {
    try {
        const id = Number(req.params.id);
        const org = await db.organization.findUnique({
            where: { id },
            include: {
                logoFile: { select: organizationLogoSelect },
                profile: { select: { logoUrl: true, bannerUrl: true } },
                sellerProfiles: {
                    include: {
                        offices: true
                    }
                },
                users: {
                    where: { role: 'seller' },
                    select: {
                        id: true,
                        name: true,
                        email: true,
                        mobile: true
                    }
                }
            }
        });
        if (!org) {
            return apiResponse.error(res, 404, 'Seller Organization not found', 'SELLER_NOT_FOUND');
        }
        
        const primaryProfile = org.sellerProfiles?.[0] || {};
        const sellerUser = org.users?.[0] || {};
        
        const vendor = {
            id: org.id,
            sellerUserId: sellerUser.id || null,
            name: org.organizationName,
            sellerName: org.users?.map((u: any) => u.name).filter(Boolean).join(', ') || sellerUser.name || null,
            city: org.city,
            state: org.state,
            email: org.users?.map((u: any) => u.email).filter(Boolean).join(', ') || sellerUser.email || null,
            mobile: org.users?.map((u: any) => u.mobile).filter(Boolean).join(', ') || sellerUser.mobile || null,
            logoUrl: org.profile?.logoUrl || org.logoFile?.url || null,
            bannerUrl: org.profile?.bannerUrl || null,
            sellerProfile: {
                ...primaryProfile,
                businessName: org.organizationName,
                offices: primaryProfile.offices || [],
                website: org.website || primaryProfile.website || null,
                productCategories: primaryProfile.productCategories || []
            }
        };

        return ok(res, vendor);
    } catch (error) {
        console.error('[Marketplace Seller Detail]', error);
        return apiResponse.error(res, 500, 'Failed to load seller details', 'SELLER_DETAIL_ERROR');
    }
});


// ─── Public: Verified Buyers ─────────────────────────────────────────────────
router.get('/marketplace/buyers', shortCache(60), async (req: Request, res: Response) => {
    try {
        const query = paginationQuery.parse(req.query);
        const page = query.page || 1;
        const pageSize = query.pageSize || 12;
        const skip = (page - 1) * pageSize;
        const where: any = {
            verificationStatus: 'VERIFIED',
            isBlacklisted: false,
            deletedAt: null,
            OR: [
                { users: { some: { role: 'buyer', accountStatus: 'ACTIVE' } } },
                { buyerProfiles: { some: {} } },
                { buyerRequirements: { some: {} } },
                { procurementBids: { some: {} } },
                { tenders: { some: {} } },
                { profile: { isLargeIndustry: true } },
                { organizationType: { in: ['PUBLIC_LIMITED', 'PSU', 'GOVERNMENT'] } }
            ]
        };
        if (query.q) where.organizationName = { contains: query.q, mode: 'insensitive' };

        const [buyers, total] = await Promise.all([
            db.organization.findMany({
                where,
                orderBy: { updatedAt: 'desc' },
                skip,
                take: pageSize,
                select: {
                    id: true,
                    organizationName: true,
                    organizationType: true,
                    city: true,
                    district: true,
                    state: true,
                    verificationStatus: true,
                    logoFile: { select: organizationLogoSelect },
                    profile: { select: organizationProfileBrandSelect },
                    _count: { select: { buyerRequirements: true } }
                }
            }),
            db.organization.count({ where })
        ]);

        return ok(res, { buyers, total, page, pageSize, totalPages: Math.ceil(total / pageSize) });
    } catch (error) {
        if (error instanceof z.ZodError) {
            return apiResponse.error(res, 400, error.issues.map(e => `${e.path.join('.')}: ${e.message}`).join(', '), 'VALIDATION_ERROR');
        }
        console.error('[Marketplace Buyers]', error);
        return apiResponse.error(res, 500, 'Failed to load buyers', 'MARKETPLACE_BUYERS_ERROR');
    }
});

// ─── Public: Notices ─────────────────────────────────────────────────────────
router.get('/marketplace/notices', shortCache(60), async (_req: Request, res: Response) => {
    try {
        const notices = await db.marketplaceNotice?.findMany?.({
            where: { isActive: true },
            orderBy: { publishedAt: 'desc' },
            take: 10
        }).catch(() => []);
        return ok(res, notices || []);
    } catch {
        return ok(res, []);
    }
});

// ─── Public: Search ──────────────────────────────────────────────────────────
router.get('/marketplace/requirements', shortCache(30), async (req: Request, res: Response) => {
    try {
        const query = paginationQuery.extend({
            type: z.enum(['PRODUCT', 'SERVICE']).optional(),
            tab: z.enum(['all', 'products', 'services', 'closing_soon', 'large_industries', 'government']).optional(),
            buyerOrganizationId: z.coerce.number().int().positive().optional()
        }).parse(req.query);
        const page = query.page || 1;
        const pageSize = query.pageSize || 12;
        const skip = (page - 1) * pageSize;
        const where: any = { ...getPublicRequirementWhere() };
        if (query.q) where.OR = [{ title: { contains: query.q, mode: 'insensitive' } }, { description: { contains: query.q, mode: 'insensitive' } }, { location: { contains: query.q, mode: 'insensitive' } }];
        if (query.type) where.requirementType = query.type;
        if (query.tab === 'products') where.requirementType = 'PRODUCT';
        if (query.tab === 'services') where.requirementType = 'SERVICE';
        if (query.tab === 'closing_soon') where.lastDate = { gte: new Date(), lte: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000) };
        if (query.tab === 'large_industries') where.buyerOrganization = { profile: { isLargeIndustry: true } };
        if (query.tab === 'government') where.buyerOrganization = { organizationType: { in: ['GOVERNMENT', 'PSU'] } };
        if (query.categoryId) where.categoryId = query.categoryId;
        if (query.buyerOrganizationId) where.buyerOrganizationId = query.buyerOrganizationId;
        if (query.location) where.location = { contains: query.location, mode: 'insensitive' };

        const legacyWhere: any = { ...getPublicLegacyRequirementWhere() };
        if (query.q) legacyWhere.AND = [
            ...(Array.isArray(legacyWhere.AND) ? legacyWhere.AND : []),
            { OR: [
                { title: { contains: query.q, mode: 'insensitive' } },
                { description: { contains: query.q, mode: 'insensitive' } },
                { organization: { OR: [
                    { organizationName: { contains: query.q, mode: 'insensitive' } },
                    { city: { contains: query.q, mode: 'insensitive' } },
                    { district: { contains: query.q, mode: 'insensitive' } },
                    { state: { contains: query.q, mode: 'insensitive' } }
                ] } }
            ] }
        ];
        if (query.tab === 'services' || query.type === 'SERVICE') legacyWhere.id = -1;
        if (query.tab === 'closing_soon') legacyWhere.requiredBy = { gte: new Date(), lte: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000) };
        if (query.tab === 'large_industries') legacyWhere.organization = { profile: { isLargeIndustry: true } };
        if (query.tab === 'government') legacyWhere.organization = { organizationType: { in: ['GOVERNMENT', 'PSU'] } };
        if (query.categoryId) legacyWhere.categoryId = query.categoryId;
        if (query.buyerOrganizationId) legacyWhere.organizationId = query.buyerOrganizationId;
        if (query.location) legacyWhere.organization = {
            ...(legacyWhere.organization || {}),
            OR: [
                { city: { contains: query.location, mode: 'insensitive' } },
                { district: { contains: query.location, mode: 'insensitive' } },
                { state: { contains: query.location, mode: 'insensitive' } }
            ]
        };

        const [buyerRequirements, buyerTotal, legacyRequirements, legacyTotal] = await Promise.all([
            db.buyerRequirement.findMany({ where, orderBy: [{ isUrgent: 'desc' }, { lastDate: 'asc' }, { createdAt: 'desc' }], take: pageSize * page, select: publicRequirementListSelect }),
            db.buyerRequirement.count({ where }),
            db.requirement.findMany({ where: legacyWhere, orderBy: [{ requiredBy: 'asc' }, { updatedAt: 'desc' }], take: pageSize * page, select: publicLegacyRequirementSelect }).catch(() => []),
            db.requirement.count({ where: legacyWhere }).catch(() => 0)
        ]);
        const combined = [
            ...buyerRequirements.map(decorateRequirement),
            ...(legacyRequirements || []).map(mapLegacyRequirementToPublic)
        ].sort((a: any, b: any) => {
            const urgent = Number(Boolean(b.isUrgent)) - Number(Boolean(a.isUrgent));
            if (urgent) return urgent;
            return new Date(a.lastDate || 0).getTime() - new Date(b.lastDate || 0).getTime();
        });
        const total = buyerTotal + legacyTotal;
        return ok(res, { requirements: combined.slice(skip, skip + pageSize), total, page, pageSize, totalPages: Math.ceil(total / pageSize) });
    } catch (error) {
        if (error instanceof z.ZodError) {
            return apiResponse.error(res, 400, error.issues.map(e => `${e.path.join('.')}: ${e.message}`).join(', '), 'VALIDATION_ERROR');
        }
        console.error('[Marketplace Requirements]', error);
        return apiResponse.error(res, 500, 'Failed to load buyer requirements', 'BUYER_REQUIREMENTS_ERROR');
    }
});

router.get('/marketplace/requirements/:id', optionalAuthenticate, shortCache(30), async (req: AuthRequest, res: Response) => {
    try {
        const id = Number(req.params.id);
        if (isNaN(id) || id === 0) return apiResponse.error(res, 400, 'Invalid requirement ID', 'INVALID_ID');

        let requirement: any = null;
        let isLegacy = false;

        if (id < 0) {
            const legacyId = Math.abs(id);
            const legacyReq = await db.requirement.findFirst({
                where: { id: legacyId },
                select: publicLegacyRequirementDetailSelect
            });
            if (!legacyReq) {
                return apiResponse.error(res, 404, 'Requirement not found', 'REQUIREMENT_NOT_FOUND');
            }
            requirement = mapLegacyRequirementToPublic(legacyReq);
            isLegacy = true;
        } else {
            const buyerReq = await db.buyerRequirement.findFirst({
                where: { id, status: { in: ['PUBLISHED', 'OPEN', 'CLOSED', 'AWARDED'] } },
                select: publicRequirementDetailSelect
            });
            if (buyerReq) {
                requirement = decorateRequirement(buyerReq);
            } else {
                const legacyReq = await db.requirement.findFirst({
                    where: { id },
                    select: publicLegacyRequirementDetailSelect
                });
                if (legacyReq) {
                    requirement = mapLegacyRequirementToPublic(legacyReq);
                    isLegacy = true;
                }
            }
        }

        if (!requirement) {
            return apiResponse.error(res, 404, 'Requirement not found', 'REQUIREMENT_NOT_FOUND');
        }

        let similar: any[] = [];
        let ownResponse: any = null;

        if (!isLegacy) {
            const [similarList, response] = await Promise.all([
                db.buyerRequirement.findMany({
                    where: {
                        ...getPublicRequirementWhere(),
                        id: { not: requirement.id },
                        OR: [
                            { categoryId: requirement.categoryId || undefined },
                            { requirementType: requirement.requirementType }
                        ]
                    },
                    take: 4,
                    orderBy: { lastDate: 'asc' },
                    select: publicRequirementListSelect
                }),
                req.user?.role === 'seller'
                    ? db.requirementResponse.findFirst({
                        where: { requirementId: requirement.id, sellerUserId: Number(req.user.id) },
                        orderBy: { createdAt: 'desc' },
                        select: { id: true, status: true, createdAt: true, updatedAt: true }
                    })
                    : Promise.resolve(null)
            ]);
            similar = similarList.map(decorateRequirement);
            ownResponse = response;
        } else {
            const similarList = await db.buyerRequirement.findMany({
                where: {
                    ...getPublicRequirementWhere(),
                    OR: [
                        { categoryId: requirement.categoryId || undefined },
                        { requirementType: requirement.requirementType }
                    ]
                },
                take: 4,
                orderBy: { lastDate: 'asc' },
                select: publicRequirementListSelect
            });
            similar = similarList.map(decorateRequirement);
        }

        return ok(res, { requirement, similarRequirements: similar, ownResponse });
    } catch (error) {
        console.error('[Marketplace Requirement Detail]', error);
        return apiResponse.error(res, 500, 'Failed to load requirement detail', 'REQUIREMENT_DETAIL_ERROR');
    }
});

router.get('/public/requirements/latest', shortCache(30), async (req: Request, res: Response) => {
    try {
        const take = Math.min(Math.max(Number(req.query.limit) || 6, 1), 12);
        return ok(res, await loadLatestRequirements(take));
    } catch (error) {
        console.error('[Public Latest Requirements]', error);
        return apiResponse.error(res, 500, 'Failed to load latest requirements', 'PUBLIC_REQUIREMENTS_ERROR');
    }
});

router.post('/buyer/requirements', authenticate, authorize('buyer', 'admin', 'master_admin'), async (req: AuthRequest, res: Response) => {
    try {
        const body = requirementSchema.parse(req.body);
        const actor = await prisma.user.findUnique({ where: { id: Number(req.user?.id) }, select: { onboardingStatus: true, organizationId: true, companyId: true } });
        if (req.user?.role === 'buyer' && (!actor || !['approved_for_procurement', 'approved'].includes(String(actor.onboardingStatus)))) {
            return apiResponse.error(res, 403, 'Please complete buyer onboarding and organization verification to continue.', 'BUYER_VERIFICATION_REQUIRED');
        }
        const requirement = await db.buyerRequirement.create({
            data: { ...body, companyId: actor?.companyId || req.user?.companyId || null, buyerOrganizationId: actor?.organizationId || req.user?.organizationId || null, createdById: req.user?.id, status: 'PENDING_APPROVAL' },
            include: requirementIncludes
        });
        return ok(res, requirement);
    } catch (error) {
        console.error('[Create Buyer Requirement]', error);
        return apiResponse.error(res, 400, 'Unable to post buyer requirement', 'BUYER_REQUIREMENT_CREATE_ERROR');
    }
});

router.post('/marketplace/requirements/:id/responses', authenticate, authorize('seller'), async (req: AuthRequest, res: Response) => {
    try {
        const id = Number(req.params.id);
        const body = responseSchema.parse(req.body);
        if (req.user?.role !== 'seller') {
            return apiResponse.error(res, 403, 'Only seller accounts can respond to buyer requirements.', 'SELLER_ROLE_REQUIRED');
        }
        const seller = await prisma.user.findUnique({ where: { id: Number(req.user?.id) }, select: { id: true, onboardingStatus: true, organizationId: true } });
        if (req.user?.role === 'seller' && (!seller || !['approved_for_procurement', 'approved'].includes(String(seller.onboardingStatus)))) {
            return apiResponse.error(res, 403, 'Please complete seller onboarding and verification to respond to this requirement.', 'SELLER_VERIFICATION_REQUIRED');
        }
        const sellerOrganizationId = seller?.organizationId || req.user?.organizationId || null;

        const response = await db.$transaction(async (tx: any) => {
            const requirement = await tx.buyerRequirement.findFirst({
                where: { id, ...getPublicRequirementWhere() },
                select: { id: true, buyerOrganizationId: true, createdById: true, lastDate: true, status: true }
            });
            if (!requirement) {
                throw new Error('REQUIREMENT_NOT_OPEN');
            }
            if (requirement.createdById === Number(req.user?.id) || (sellerOrganizationId && requirement.buyerOrganizationId === sellerOrganizationId)) {
                throw new Error('SELLER_CANNOT_RESPOND_TO_OWN_REQUIREMENT');
            }

            const existing = await tx.requirementResponse.findFirst({
                where: {
                    requirementId: id,
                    sellerUserId: Number(req.user?.id),
                    status: { in: ['SUBMITTED', 'UNDER_REVIEW', 'SHORTLISTED', 'ACCEPTED'] }
                },
                select: { id: true, status: true }
            });
            if (existing) {
                throw new Error('REQUIREMENT_RESPONSE_EXISTS');
            }

            return tx.requirementResponse.create({
                data: { ...body, requirementId: id, sellerUserId: Number(req.user?.id), sellerOrganizationId },
                select: { id: true, requirementId: true, sellerOrganizationId: true, sellerUserId: true, status: true, createdAt: true, updatedAt: true }
            });
        });
        return ok(res, response);
    } catch (error) {
        if (error instanceof Error && error.message === 'REQUIREMENT_NOT_OPEN') {
            return apiResponse.error(res, 404, 'Requirement not found or not open', 'REQUIREMENT_NOT_OPEN');
        }
        if (error instanceof Error && error.message === 'SELLER_CANNOT_RESPOND_TO_OWN_REQUIREMENT') {
            return apiResponse.error(res, 403, 'You cannot submit a seller response to your own buyer requirement.', 'OWN_REQUIREMENT_RESPONSE_FORBIDDEN');
        }
        if (error instanceof Error && error.message === 'REQUIREMENT_RESPONSE_EXISTS') {
            return apiResponse.error(res, 409, 'You have already submitted a response to this requirement.', 'REQUIREMENT_RESPONSE_EXISTS');
        }
        console.error('[Requirement Response]', error);
        return apiResponse.error(res, 400, 'Unable to submit response', 'REQUIREMENT_RESPONSE_ERROR');
    }
});

router.get('/buyer/requirements/:id/responses', authenticate, authorize('buyer', 'admin', 'master_admin'), async (req: AuthRequest, res: Response) => {
    try {
        const id = Number(req.params.id);
        if (!id || id < 1) return apiResponse.error(res, 400, 'Invalid requirement ID', 'INVALID_ID');
        const query = responseListQuery.parse(req.query);
        const page = query.page || 1;
        const pageSize = query.pageSize || 20;
        const skip = (page - 1) * pageSize;
        const isPrivileged = req.user?.role === 'admin' || req.user?.role === 'master_admin';
        const ownershipFilters: any[] = [{ createdById: Number(req.user?.id) }];
        if (req.user?.organizationId) ownershipFilters.push({ buyerOrganizationId: req.user.organizationId });

        const requirement = await db.buyerRequirement.findFirst({
            where: {
                id,
                ...(isPrivileged ? {} : { OR: ownershipFilters })
            },
            select: ownerRequirementSelect
        });
        if (!requirement) return apiResponse.error(res, 404, 'Requirement not found', 'REQUIREMENT_NOT_FOUND');

        const [responses, total] = await Promise.all([
            db.requirementResponse.findMany({
                where: { requirementId: id },
                orderBy: { createdAt: 'desc' },
                skip,
                take: pageSize,
                select: buyerResponseSelect
            }),
            db.requirementResponse.count({ where: { requirementId: id } })
        ]);

        return ok(res, {
            requirement: decorateRequirement(requirement),
            responses: responses.map((response: any) => ({
                ...response,
                sellerUser: response.sellerUser
                    ? { ...response.sellerUser, phone: response.sellerUser.mobile }
                    : response.sellerUser
            })),
            total,
            page,
            pageSize,
            totalPages: Math.ceil(total / pageSize)
        });
    } catch (error) {
        console.error('[Buyer Requirement Responses]', error);
        return apiResponse.error(res, 500, 'Failed to load seller responses', 'BUYER_REQUIREMENT_RESPONSES_ERROR');
    }
});

router.get('/seller/requirement-responses', authenticate, authorize('seller', 'admin', 'master_admin'), async (req: AuthRequest, res: Response) => {
    try {
        const query = responseListQuery.parse(req.query);
        const page = query.page || 1;
        const pageSize = query.pageSize || 20;
        const skip = (page - 1) * pageSize;
        const responseFilters: any[] = [{ sellerUserId: Number(req.user?.id) }];
        if (req.user?.organizationId) responseFilters.push({ sellerOrganizationId: req.user.organizationId });
        const where = {
            ...(req.user?.role === 'admin' || req.user?.role === 'master_admin' ? {} : { OR: responseFilters })
        };
        const [responses, total] = await Promise.all([
            db.requirementResponse.findMany({
                where,
                orderBy: { createdAt: 'desc' },
                skip,
                take: pageSize,
                select: sellerResponseSelect
            }),
            db.requirementResponse.count({ where })
        ]);

        return ok(res, {
            responses: responses.map((response: any) => ({
                ...response,
                requirement: decorateRequirement(response.requirement)
            })),
            total,
            page,
            pageSize,
            totalPages: Math.ceil(total / pageSize)
        });
    } catch (error) {
        console.error('[Seller Requirement Responses]', error);
        return apiResponse.error(res, 500, 'Failed to load submitted requirement responses', 'SELLER_REQUIREMENT_RESPONSES_ERROR');
    }
});

router.put('/admin/buyer-requirements/:id/status', authenticate, authorize('admin', 'master_admin'), async (req: AuthRequest, res: Response) => {
    try {
        const id = Number(req.params.id);
        const status = z.enum(['PUBLISHED', 'OPEN', 'REJECTED', 'CLOSED', 'CANCELLED', 'AWARDED']).parse(req.body?.status);
        const requirement = await db.buyerRequirement.update({
            where: { id },
            data: {
                status,
                approvedById: ['PUBLISHED', 'OPEN'].includes(status) ? req.user?.id : undefined,
                approvedAt: ['PUBLISHED', 'OPEN'].includes(status) ? new Date() : undefined,
                rejectionReason: status === 'REJECTED' ? String(req.body?.rejectionReason || '') : null
            },
            include: requirementIncludes
        });
        return ok(res, requirement);
    } catch (error) {
        console.error('[Admin Requirement Status]', error);
        return apiResponse.error(res, 400, 'Unable to update requirement status', 'REQUIREMENT_STATUS_ERROR');
    }
});

router.put('/admin/buyer-requirements/:id/feature', authenticate, authorize('admin', 'master_admin'), async (req: AuthRequest, res: Response) => {
    try {
        const id = Number(req.params.id);
        const requirement = await db.buyerRequirement.update({
            where: { id },
            data: { isFeatured: Boolean(req.body?.isFeatured), isUrgent: Boolean(req.body?.isUrgent) },
            include: requirementIncludes
        });
        return ok(res, requirement);
    } catch (error) {
        console.error('[Admin Requirement Feature]', error);
        return apiResponse.error(res, 400, 'Unable to update requirement feature status', 'REQUIREMENT_FEATURE_ERROR');
    }
});

router.post('/marketplace/guest-cart/items', async (req: Request, res: Response) => {
    try {
        const body = guestCartItemSchema.parse(req.body);
        const [product, service, cart] = await Promise.all([
            body.productId ? db.product.findFirst({ where: { id: body.productId, status: 'ACTIVE' }, select: { id: true, price: true, organizationId: true } }) : Promise.resolve(null),
            body.serviceId ? db.service.findFirst({ where: { id: body.serviceId, status: 'ACTIVE' }, select: { id: true, basePrice: true, organizationId: true } }) : Promise.resolve(null),
            db.guestCart.upsert({ where: { cartToken: body.cartToken }, update: {}, create: { cartToken: body.cartToken } })
        ]);
        if (body.productId && !product) return apiResponse.error(res, 404, 'Product not found', 'PRODUCT_NOT_FOUND');
        if (body.serviceId && !service) return apiResponse.error(res, 404, 'Service not found', 'SERVICE_NOT_FOUND');

        const itemType = body.productId ? 'PRODUCT' : 'SERVICE';
        const productId = body.productId || null;
        const serviceId = body.serviceId || null;

        const existing = await db.guestCartItem.findFirst({
            where: {
                guestCartId: cart.id,
                itemType,
                productId,
                serviceId
            }
        });

        let item;
        if (existing) {
            item = await db.guestCartItem.update({
                where: { id: existing.id },
                data: { quantity: Number(existing.quantity) + body.quantity }
            });
        } else {
            item = await db.guestCartItem.create({
                data: {
                    guestCartId: cart.id,
                    itemType,
                    productId,
                    serviceId,
                    quantity: body.quantity,
                    priceSnapshot: product?.price || service?.basePrice || null,
                    sellerOrganizationId: product?.organizationId || service?.organizationId || null
                }
            });
        }

        const refreshed = await db.guestCart.findUnique({ where: { id: cart.id }, include: { items: { include: { product: true, service: true, sellerOrganization: true } } } });
        return ok(res, { cart: refreshed, item });
    } catch (error) {
        console.error('[Guest Cart Add]', error);
        return apiResponse.error(res, 400, 'Unable to add item to cart', 'GUEST_CART_ADD_ERROR');
    }
});

router.put('/marketplace/guest-cart/items', async (req: Request, res: Response) => {
    try {
        const body = z.object({
            cartToken: z.string().trim().min(12).max(120),
            productId: z.coerce.number().int().positive().optional(),
            serviceId: z.coerce.number().int().positive().optional(),
            quantity: z.coerce.number().int().min(0)
        }).refine(v => Boolean(v.productId) !== Boolean(v.serviceId)).parse(req.body);

        const [cart, product, service] = await Promise.all([
            db.guestCart.findUnique({ where: { cartToken: body.cartToken } }),
            body.productId ? db.product.findFirst({ where: { id: body.productId, status: 'ACTIVE' }, select: { price: true, organizationId: true } }) : Promise.resolve(null),
            body.serviceId ? db.service.findFirst({ where: { id: body.serviceId, status: 'ACTIVE' }, select: { basePrice: true, organizationId: true } }) : Promise.resolve(null),
        ]);
        if (!cart) return apiResponse.error(res, 404, 'Cart not found', 'CART_NOT_FOUND');

        const itemType = body.productId ? 'PRODUCT' : 'SERVICE';
        const productId = body.productId || null;
        const serviceId = body.serviceId || null;

        if (body.quantity === 0) {
            await db.guestCartItem.deleteMany({
                where: { guestCartId: cart.id, itemType, productId, serviceId }
            });
        } else {
            const existing = await db.guestCartItem.findFirst({
                where: {
                    guestCartId: cart.id,
                    itemType,
                    productId,
                    serviceId
                }
            });

            if (existing) {
                await db.guestCartItem.update({
                    where: { id: existing.id },
                    data: { quantity: body.quantity }
                });
            } else {
                await db.guestCartItem.create({
                    data: {
                        guestCartId: cart.id,
                        itemType,
                        productId,
                        serviceId,
                        quantity: body.quantity,
                        priceSnapshot: product?.price || service?.basePrice || null,
                        sellerOrganizationId: product?.organizationId || service?.organizationId || null
                    }
                });
            }
        }
        
        const refreshed = await db.guestCart.findUnique({ where: { id: cart.id }, include: { items: { include: { product: true, service: true, sellerOrganization: true } } } });
        return ok(res, { cart: refreshed });
    } catch (error) {
        console.error('[Guest Cart Update]', error);
        return apiResponse.error(res, 400, 'Unable to update cart item', 'GUEST_CART_UPDATE_ERROR');
    }
});

router.get('/marketplace/guest-cart/:cartToken', async (req: Request, res: Response) => {
    try {
        const cart = await db.guestCart.findUnique({ where: { cartToken: String(req.params.cartToken) }, include: { items: { include: { product: { include: { images: { include: { fileAsset: true }, take: 1 } } }, service: true, sellerOrganization: true } } } });
        return ok(res, cart || { cartToken: req.params.cartToken, items: [] });
    } catch {
        return ok(res, { cartToken: req.params.cartToken, items: [] });
    }
});

router.get('/marketplace/organizations/featured', shortCache(60), async (_req: Request, res: Response) => {
    try {
        const [largeIndustries, bigMsmes] = await Promise.all([
            db.organization.findMany({ where: { profile: { isLargeIndustry: true }, isBlacklisted: false, deletedAt: null }, include: { profile: true }, take: 12 }),
            db.organization.findMany({ where: { profile: { isBigMsme: true }, isBlacklisted: false, deletedAt: null }, include: { profile: true }, take: 12 })
        ]);
        return ok(res, { largeIndustries, bigMsmes });
    } catch {
        return ok(res, { largeIndustries: [], bigMsmes: [] });
    }
});

router.get('/marketplace/search', shortCache(15), async (req: Request, res: Response) => {
    try {
        const q = String(req.query.q || '').trim();
        if (!q || q.length < 2) return ok(res, { products: [], services: [], sellers: [] });

        const [products, services, sellers] = await Promise.all([
            db.product.findMany({
                where: { status: 'ACTIVE', OR: [{ name: { contains: q, mode: 'insensitive' } }, { description: { contains: q, mode: 'insensitive' } }] },
                take: 5,
                select: { id: true, name: true, price: true, currency: true }
            }),
            db.service.findMany({
                where: { status: 'ACTIVE', OR: [{ name: { contains: q, mode: 'insensitive' } }, { description: { contains: q, mode: 'insensitive' } }] },
                take: 5,
                select: { id: true, name: true, pricingModel: true, basePrice: true }
            }),
            db.organization.findMany({
                where: { verificationStatus: 'VERIFIED', isBlacklisted: false, organizationName: { contains: q, mode: 'insensitive' } },
                take: 5,
                select: { id: true, organizationName: true, city: true, state: true }
            })
        ]);

        return ok(res, { products, services, sellers });
    } catch (error) {
        console.error('[Marketplace Search]', error);
        return apiResponse.error(res, 500, 'Search failed', 'MARKETPLACE_SEARCH_ERROR');
    }
});

export default router;
