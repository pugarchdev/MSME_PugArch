import { Router, type NextFunction, type Request, type Response } from 'express';
import { z } from 'zod';
import prisma from '../config/prisma.js';
import { getOrSetCache } from '../services/cache.service.js';
import { apiResponse } from '../utils/apiResponse.js';
import { authenticate, type AuthRequest } from '../middleware/authenticate.js';
import { authorize } from '../middleware/authorize.js';
import { verifyAccessToken } from '../services/token.service.js';

const db = prisma as any;
const router = Router();

const paginationQuery = z.object({
    q: z.string().trim().max(120).optional(),
    categoryId: z.coerce.number().int().positive().optional(),
    location: z.string().trim().max(100).optional(),
    minPrice: z.coerce.number().nonnegative().optional(),
    maxPrice: z.coerce.number().nonnegative().optional(),
    verified: z.enum(['true', 'false']).optional(),
    sort: z.enum(['latest', 'price_asc', 'price_desc', 'name']).optional(),
    page: z.coerce.number().int().min(1).default(1),
    pageSize: z.coerce.number().int().min(1).max(50).default(12),
}).partial();

const ok = (res: Response, data: unknown) => res.json({ success: true, data });

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

const organizationLogoSelect = { id: true, url: true };
const organizationProfileBrandSelect = { logoUrl: true, isLargeIndustry: true, isBigMsme: true };

const safeBuyerOrganizationSelect = {
    id: true,
    organizationName: true,
    organizationType: true,
    city: true,
    district: true,
    state: true,
    verificationStatus: true,
    logoUrl: true,
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

const publicRequirementDetailSelect = {
    ...publicRequirementListSelect,
    requiredDocuments: true
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
    status: { in: ['PUBLISHED', 'OPEN', 'PENDING_APPROVAL'] },
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
    return decorateRequirement({
        id: -Number(requirement.id),
        sourceModel: 'REQUIREMENT',
        sourceId: requirement.id,
        title: requirement.title,
        requirementType: 'PRODUCT',
        categoryId: requirement.categoryId,
        description: requirement.description || requirement.title,
        quantity: null,
        unit: null,
        location: [organization.city, organization.district, organization.state].filter(Boolean).join(', ') || null,
        budgetMin: requirement.estimatedValue || null,
        budgetMax: requirement.estimatedValue || null,
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
        requirementNumber: requirement.requirementNumber
    });
};

const getPublicLegacyRequirementWhere = () => ({
    status: { in: ['SUBMITTED', 'APPROVED', 'SOURCING'] },
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
                approvalStatus: { in: ['APPROVED', 'PENDING', 'SUBMITTED', 'PENDING_APPROVAL'] },
                status: { in: ['PENDING_ADMIN_APPROVAL', 'OPEN', 'APPROVED', 'TECHNICAL_EVALUATION', 'TECHNICAL_EVALUATION_COMPLETED', 'FINANCIAL_EVALUATION', 'L1_GENERATED', 'AWARD_RECOMMENDED', 'AWARDED'] }
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
    pageSize: z.coerce.number().int().min(1).max(50).default(20)
}).partial();

const guestCartItemSchema = z.object({
    cartToken: z.string().trim().min(12).max(120),
    productId: z.coerce.number().int().positive().optional(),
    serviceId: z.coerce.number().int().positive().optional(),
    quantity: z.coerce.number().positive().default(1)
}).refine(value => Boolean(value.productId) !== Boolean(value.serviceId), {
    message: 'Either productId or serviceId is required'
});

// ─── Public: Home Page Aggregated Data ───────────────────────────────────────
router.get('/marketplace/home', async (_req: Request, res: Response) => {
    try {
        const [latestRequirements, latestTenders, latestBids] = await Promise.all([
            loadLatestRequirements(24),
            loadLatestTenders(6),
            loadLatestProcurementBids(6)
        ]);
        const data = await getOrSetCache('marketplace:home', async () => {
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
                        organization: { select: { id: true, organizationName: true, city: true, district: true, state: true, verificationStatus: true, logoUrl: true, logoFile: { select: organizationLogoSelect }, profile: { select: organizationProfileBrandSelect } } },
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
                    where: { verificationStatus: 'VERIFIED', isBlacklisted: false, deletedAt: null },
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
                        logoUrl: true,
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
                        logoUrl: true,
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
                        logoUrl: true,
                        profile: true,
                        _count: { select: { products: { where: { status: 'ACTIVE' } }, services: { where: { status: 'ACTIVE' } } } }
                    }
                }).catch(() => []),

                // Stats
                Promise.all([
                    db.organization.count({ where: { verificationStatus: 'VERIFIED', isBlacklisted: false } }).catch(() => 0),
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
router.get('/marketplace/banners', async (_req: Request, res: Response) => {
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
router.get('/marketplace/products', async (req: Request, res: Response) => {
    try {
        const query = paginationQuery.parse(req.query);
        const page = query.page || 1;
        const pageSize = query.pageSize || 12;
        const skip = (page - 1) * pageSize;

        const where: any = { status: 'ACTIVE' };
        if (query.q) {
            where.OR = [
                { name: { contains: query.q, mode: 'insensitive' } },
                { description: { contains: query.q, mode: 'insensitive' } },
                { brand: { contains: query.q, mode: 'insensitive' } }
            ];
        }
        if (query.categoryId) where.categoryId = query.categoryId;
        if (query.minPrice !== undefined || query.maxPrice !== undefined) {
            where.price = {};
            if (query.minPrice !== undefined) where.price.gte = query.minPrice;
            if (query.maxPrice !== undefined) where.price.lte = query.maxPrice;
        }

        let orderBy: any = { createdAt: 'desc' };
        if (query.sort === 'price_asc') orderBy = { price: 'asc' };
        else if (query.sort === 'price_desc') orderBy = { price: 'desc' };
        else if (query.sort === 'name') orderBy = { name: 'asc' };

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

        return ok(res, { products, total, page, pageSize, totalPages: Math.ceil(total / pageSize) });
    } catch (error) {
        console.error('[Marketplace Products]', error);
        return apiResponse.error(res, 500, 'Failed to load products', 'MARKETPLACE_PRODUCTS_ERROR');
    }
});

// ─── Public: Product Detail ──────────────────────────────────────────────────
router.get('/marketplace/products/:id', async (req: Request, res: Response) => {
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

        return ok(res, { product, relatedProducts: related });
    } catch (error) {
        console.error('[Marketplace Product Detail]', error);
        return apiResponse.error(res, 500, 'Failed to load product details', 'PRODUCT_DETAIL_ERROR');
    }
});

// ─── Public: Service Listing ─────────────────────────────────────────────────
router.get('/marketplace/services', async (req: Request, res: Response) => {
    try {
        const query = paginationQuery.parse(req.query);
        const page = query.page || 1;
        const pageSize = query.pageSize || 12;
        const skip = (page - 1) * pageSize;

        const where: any = { status: 'ACTIVE' };
        if (query.q) {
            where.OR = [
                { name: { contains: query.q, mode: 'insensitive' } },
                { description: { contains: query.q, mode: 'insensitive' } }
            ];
        }
        if (query.categoryId) where.categoryId = query.categoryId;

        let orderBy: any = { createdAt: 'desc' };
        if (query.sort === 'price_asc') orderBy = { basePrice: 'asc' };
        else if (query.sort === 'price_desc') orderBy = { basePrice: 'desc' };
        else if (query.sort === 'name') orderBy = { name: 'asc' };

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

        return ok(res, { services, total, page, pageSize, totalPages: Math.ceil(total / pageSize) });
    } catch (error) {
        console.error('[Marketplace Services]', error);
        return apiResponse.error(res, 500, 'Failed to load services', 'MARKETPLACE_SERVICES_ERROR');
    }
});

// ─── Public: Service Detail ──────────────────────────────────────────────────
router.get('/marketplace/services/:id', async (req: Request, res: Response) => {
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

        const related = await db.service.findMany({
            where: { status: 'ACTIVE', categoryId: service.categoryId, id: { not: id } },
            take: 4,
            include: {
                category: { select: { id: true, name: true } },
                organization: { select: { id: true, organizationName: true, city: true, state: true, verificationStatus: true } }
            }
        });

        return ok(res, { service, relatedServices: related });
    } catch (error) {
        console.error('[Marketplace Service Detail]', error);
        return apiResponse.error(res, 500, 'Failed to load service details', 'SERVICE_DETAIL_ERROR');
    }
});

// ─── Public: Verified Sellers ────────────────────────────────────────────────
router.get('/marketplace/sellers', async (req: Request, res: Response) => {
    try {
        const query = paginationQuery.parse(req.query);
        const page = query.page || 1;
        const pageSize = query.pageSize || 12;
        const skip = (page - 1) * pageSize;

        const where: any = { verificationStatus: 'VERIFIED', isBlacklisted: false, deletedAt: null };
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
                    logoUrl: true,
                    logoFile: { select: organizationLogoSelect },
                    profile: { select: organizationProfileBrandSelect },
                    _count: { select: { products: { where: { status: 'ACTIVE' } }, services: { where: { status: 'ACTIVE' } } } }
                }
            }),
            db.organization.count({ where })
        ]);

        return ok(res, { sellers, total, page, pageSize, totalPages: Math.ceil(total / pageSize) });
    } catch (error) {
        console.error('[Marketplace Sellers]', error);
        return apiResponse.error(res, 500, 'Failed to load sellers', 'MARKETPLACE_SELLERS_ERROR');
    }
});


// ─── Public: Verified Buyers ─────────────────────────────────────────────────
router.get('/marketplace/buyers', async (req: Request, res: Response) => {
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
                    logoUrl: true,
                    logoFile: { select: organizationLogoSelect },
                    profile: { select: organizationProfileBrandSelect },
                    _count: { select: { buyerRequirements: true } }
                }
            }),
            db.organization.count({ where })
        ]);

        return ok(res, { buyers, total, page, pageSize, totalPages: Math.ceil(total / pageSize) });
    } catch (error) {
        console.error('[Marketplace Buyers]', error);
        return apiResponse.error(res, 500, 'Failed to load buyers', 'MARKETPLACE_BUYERS_ERROR');
    }
});

// ─── Public: Notices ─────────────────────────────────────────────────────────
router.get('/marketplace/notices', async (_req: Request, res: Response) => {
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
router.get('/marketplace/requirements', async (req: Request, res: Response) => {
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
        console.error('[Marketplace Requirements]', error);
        return apiResponse.error(res, 500, 'Failed to load buyer requirements', 'BUYER_REQUIREMENTS_ERROR');
    }
});

router.get('/marketplace/requirements/:id', optionalAuthenticate, async (req: AuthRequest, res: Response) => {
    try {
        const id = Number(req.params.id);
        if (!id || id < 1) return apiResponse.error(res, 400, 'Invalid requirement ID', 'INVALID_ID');
        const requirement = await db.buyerRequirement.findFirst({ where: { id, status: { in: ['PUBLISHED', 'OPEN', 'CLOSED', 'AWARDED'] } }, select: publicRequirementDetailSelect });
        if (!requirement) return apiResponse.error(res, 404, 'Requirement not found', 'REQUIREMENT_NOT_FOUND');
        const [similar, ownResponse] = await Promise.all([
            db.buyerRequirement.findMany({
                where: { ...getPublicRequirementWhere(), id: { not: id }, OR: [{ categoryId: requirement.categoryId || undefined }, { requirementType: requirement.requirementType }] },
                take: 4,
                orderBy: { lastDate: 'asc' },
                select: publicRequirementListSelect
            }),
            req.user?.role === 'seller'
                ? db.requirementResponse.findFirst({
                    where: { requirementId: id, sellerUserId: Number(req.user.id) },
                    orderBy: { createdAt: 'desc' },
                    select: { id: true, status: true, createdAt: true, updatedAt: true }
                })
                : Promise.resolve(null)
        ]);
        return ok(res, { requirement: decorateRequirement(requirement), similarRequirements: similar.map(decorateRequirement), ownResponse });
    } catch (error) {
        console.error('[Marketplace Requirement Detail]', error);
        return apiResponse.error(res, 500, 'Failed to load requirement detail', 'REQUIREMENT_DETAIL_ERROR');
    }
});

router.get('/public/requirements/latest', async (req: Request, res: Response) => {
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

router.get('/marketplace/organizations/featured', async (_req: Request, res: Response) => {
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

router.get('/marketplace/search', async (req: Request, res: Response) => {
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
