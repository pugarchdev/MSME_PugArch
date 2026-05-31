import { Router, type Request, type Response } from 'express';
import { z } from 'zod';
import prisma from '../config/prisma.js';
import { getOrSetCache } from '../services/cache.service.js';
import { apiResponse } from '../utils/apiResponse.js';
import { authenticate, type AuthRequest } from '../middleware/authenticate.js';
import { authorize } from '../middleware/authorize.js';

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

const publicRequirementWhere = {
    status: { in: ['PUBLISHED', 'OPEN'] },
    lastDate: { gte: new Date(Date.now() - 24 * 60 * 60 * 1000) }
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
        const data = await getOrSetCache('marketplace:home', async () => {
            const [
                banners,
                categories,
                featuredProducts,
                featuredServices,
                verifiedSellers,
                notices,
                featuredRequirements,
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
                }),

                // Featured Products
                db.product.findMany({
                    where: { status: 'ACTIVE' },
                    orderBy: { createdAt: 'desc' },
                    take: 8,
                    include: {
                        category: { select: { id: true, name: true } },
                        seller: { select: { id: true, name: true, onboardingStatus: true } },
                        organization: { select: { id: true, organizationName: true, city: true, district: true, state: true, verificationStatus: true } },
                        images: { include: { fileAsset: { select: { id: true, url: true } } }, orderBy: [{ isPrimary: 'desc' }, { displayOrder: 'asc' }], take: 1 }
                    }
                }),

                // Featured Services
                db.service.findMany({
                    where: { status: 'ACTIVE' },
                    orderBy: { createdAt: 'desc' },
                    take: 8,
                    include: {
                        category: { select: { id: true, name: true } },
                        seller: { select: { id: true, name: true, onboardingStatus: true } },
                        organization: { select: { id: true, organizationName: true, city: true, district: true, state: true, verificationStatus: true } }
                    }
                }),

                // Verified Sellers
                db.organization.findMany({
                    where: { verificationStatus: 'VERIFIED', isBlacklisted: false, deletedAt: null },
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
                        _count: { select: { products: { where: { status: 'ACTIVE' } }, services: { where: { status: 'ACTIVE' } } } }
                    }
                }),

                // Notices
                db.marketplaceNotice?.findMany?.({
                    where: { isActive: true },
                    orderBy: { publishedAt: 'desc' },
                    take: 5
                }).catch(() => []),

                db.buyerRequirement?.findMany?.({
                    where: { status: { in: ['PUBLISHED', 'OPEN'] }, isFeatured: true },
                    orderBy: [{ isUrgent: 'desc' }, { lastDate: 'asc' }],
                    take: 6,
                    include: requirementIncludes
                }).catch(() => []),

                db.organization.findMany({
                    where: {
                        verificationStatus: 'VERIFIED',
                        isBlacklisted: false,
                        deletedAt: null,
                        OR: [
                            { profile: { isLargeIndustry: true } },
                            { organizationType: { in: ['PUBLIC_LIMITED', 'PSU', 'GOVERNMENT'] } }
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
                        profile: true,
                        _count: { select: { products: { where: { status: 'ACTIVE' } }, services: { where: { status: 'ACTIVE' } } } }
                    }
                }).catch(() => []),

                // Stats
                Promise.all([
                    db.organization.count({ where: { verificationStatus: 'VERIFIED', isBlacklisted: false } }).catch(() => 0),
                    db.user.count({ where: { role: 'buyer', onboardingStatus: { in: ['approved_for_procurement', 'approved'] } } }).catch(() => 0),
                    db.product.count({ where: { status: 'ACTIVE' } }).catch(() => 0),
                    db.service.count({ where: { status: 'ACTIVE' } }).catch(() => 0),
                    db.category.count({ where: { isActive: true } }).catch(() => 0),
                ]).then(([sellers, buyers, products, services, categories]) => ({
                    verifiedSellers: sellers,
                    registeredBuyers: buyers,
                    productsListed: products,
                    servicesListed: services,
                    categories
                }))
            ]);

            return { banners, categories, featuredProducts, featuredServices, featuredRequirements, verifiedSellers, largeIndustries, bigMsmes, notices, stats };
        }, 300); // Cache 5 minutes

        return ok(res, data);
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
                    organization: { select: { id: true, organizationName: true, city: true, district: true, state: true, verificationStatus: true } },
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
                    organization: { select: { id: true, organizationName: true, city: true, district: true, state: true, verificationStatus: true } }
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
            tab: z.enum(['all', 'products', 'services', 'closing_soon', 'large_industries', 'government']).optional()
        }).parse(req.query);
        const page = query.page || 1;
        const pageSize = query.pageSize || 12;
        const skip = (page - 1) * pageSize;
        const where: any = { status: { in: ['PUBLISHED', 'OPEN'] } };
        if (query.q) where.OR = [{ title: { contains: query.q, mode: 'insensitive' } }, { description: { contains: query.q, mode: 'insensitive' } }, { location: { contains: query.q, mode: 'insensitive' } }];
        if (query.type) where.requirementType = query.type;
        if (query.tab === 'products') where.requirementType = 'PRODUCT';
        if (query.tab === 'services') where.requirementType = 'SERVICE';
        if (query.tab === 'closing_soon') where.lastDate = { lte: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000) };
        if (query.tab === 'large_industries') where.buyerOrganization = { profile: { isLargeIndustry: true } };
        if (query.tab === 'government') where.buyerOrganization = { organizationType: { in: ['GOVERNMENT', 'PSU'] } };
        if (query.categoryId) where.categoryId = query.categoryId;
        if (query.location) where.location = { contains: query.location, mode: 'insensitive' };

        const [requirements, total] = await Promise.all([
            db.buyerRequirement.findMany({ where, orderBy: [{ isUrgent: 'desc' }, { lastDate: 'asc' }], skip, take: pageSize, include: requirementIncludes }),
            db.buyerRequirement.count({ where })
        ]);
        return ok(res, { requirements, total, page, pageSize, totalPages: Math.ceil(total / pageSize) });
    } catch (error) {
        console.error('[Marketplace Requirements]', error);
        return apiResponse.error(res, 500, 'Failed to load buyer requirements', 'BUYER_REQUIREMENTS_ERROR');
    }
});

router.get('/marketplace/requirements/:id', async (req: Request, res: Response) => {
    try {
        const id = Number(req.params.id);
        if (!id || id < 1) return apiResponse.error(res, 400, 'Invalid requirement ID', 'INVALID_ID');
        const requirement = await db.buyerRequirement.findFirst({ where: { id, status: { in: ['PUBLISHED', 'OPEN', 'CLOSED', 'AWARDED'] } }, include: requirementIncludes });
        if (!requirement) return apiResponse.error(res, 404, 'Requirement not found', 'REQUIREMENT_NOT_FOUND');
        const similar = await db.buyerRequirement.findMany({
            where: { id: { not: id }, status: { in: ['PUBLISHED', 'OPEN'] }, OR: [{ categoryId: requirement.categoryId || undefined }, { requirementType: requirement.requirementType }] },
            take: 4,
            orderBy: { lastDate: 'asc' },
            include: requirementIncludes
        });
        return ok(res, { requirement, similarRequirements: similar });
    } catch (error) {
        console.error('[Marketplace Requirement Detail]', error);
        return apiResponse.error(res, 500, 'Failed to load requirement detail', 'REQUIREMENT_DETAIL_ERROR');
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

router.post('/marketplace/requirements/:id/responses', authenticate, authorize('seller', 'admin', 'master_admin'), async (req: AuthRequest, res: Response) => {
    try {
        const id = Number(req.params.id);
        const body = responseSchema.parse(req.body);
        const seller = await prisma.user.findUnique({ where: { id: Number(req.user?.id) }, select: { onboardingStatus: true, organizationId: true } });
        if (req.user?.role === 'seller' && (!seller || !['approved_for_procurement', 'approved'].includes(String(seller.onboardingStatus)))) {
            return apiResponse.error(res, 403, 'Please complete seller onboarding and verification to respond to this requirement.', 'SELLER_VERIFICATION_REQUIRED');
        }
        const requirement = await db.buyerRequirement.findFirst({ where: { id, status: { in: ['PUBLISHED', 'OPEN'] } }, select: { id: true } });
        if (!requirement) return apiResponse.error(res, 404, 'Requirement not found or not open', 'REQUIREMENT_NOT_OPEN');
        const response = await db.requirementResponse.create({ data: { ...body, requirementId: id, sellerUserId: Number(req.user?.id), sellerOrganizationId: seller?.organizationId || req.user?.organizationId || null } });
        return ok(res, response);
    } catch (error) {
        console.error('[Requirement Response]', error);
        return apiResponse.error(res, 400, 'Unable to submit response', 'REQUIREMENT_RESPONSE_ERROR');
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
        const product = body.productId ? await db.product.findFirst({ where: { id: body.productId, status: 'ACTIVE' }, select: { id: true, price: true, organizationId: true } }) : null;
        const service = body.serviceId ? await db.service.findFirst({ where: { id: body.serviceId, status: 'ACTIVE' }, select: { id: true, basePrice: true, organizationId: true } }) : null;
        if (body.productId && !product) return apiResponse.error(res, 404, 'Product not found', 'PRODUCT_NOT_FOUND');
        if (body.serviceId && !service) return apiResponse.error(res, 404, 'Service not found', 'SERVICE_NOT_FOUND');
        const cart = await db.guestCart.upsert({ where: { cartToken: body.cartToken }, update: {}, create: { cartToken: body.cartToken } });
        const where = { guestCartId: cart.id, itemType: body.productId ? 'PRODUCT' : 'SERVICE', productId: body.productId || null, serviceId: body.serviceId || null };
        const existing = await db.guestCartItem.findFirst({ where });
        const item = existing
            ? await db.guestCartItem.update({ where: { id: existing.id }, data: { quantity: Number(existing.quantity) + body.quantity } })
            : await db.guestCartItem.create({ data: { ...where, quantity: body.quantity, priceSnapshot: product?.price || service?.basePrice || null, sellerOrganizationId: product?.organizationId || service?.organizationId || null } });
        const refreshed = await db.guestCart.findUnique({ where: { id: cart.id }, include: { items: { include: { product: true, service: true, sellerOrganization: true } } } });
        return ok(res, { cart: refreshed, item });
    } catch (error) {
        console.error('[Guest Cart Add]', error);
        return apiResponse.error(res, 400, 'Unable to add item to cart', 'GUEST_CART_ADD_ERROR');
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
