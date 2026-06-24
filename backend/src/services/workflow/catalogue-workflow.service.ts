import { redisKeys } from '../../constants/redis-keys.js';
import { deleteCache, getOrSetCache, invalidateByPattern } from '../cache.service.js';
import { auditWorkflow, db, type WorkflowActor } from './workflow-common.js';
import { sha256 } from '../../utils/crypto.js';
import { ApiError } from '../../utils/ApiError.js';

type SpecInput = { name: string; value: string; unit?: string | null };

const assertSellerOwner = async (model: 'product' | 'service', id: number, actor: WorkflowActor, client = db) => {
  const record = await client[model].findFirst({ where: { id, sellerId: actor.id } });
  if (!record && actor.role !== 'admin') throw new ApiError(404, `${model} not found`, `${model.toUpperCase()}_NOT_FOUND`);
  return record || client[model].findUnique({ where: { id } });
};

const assertApprovedSeller = async (actor: WorkflowActor) => {
  if (actor.role === 'admin') return;
  const user = await db.user.findUnique({ where: { id: actor.id }, select: { role: true, onboardingStatus: true } });
  if (user?.role !== 'seller' || !['approved_for_procurement', 'approved'].includes(String(user.onboardingStatus))) {
    throw new ApiError(
      403,
      'Your seller account must be approved before you can create or change catalogue items.',
      'SELLER_NOT_APPROVED'
    );
  }
};

const invalidateCatalogueSearchCaches = async () => {
  await Promise.all([
    invalidateByPattern('cache:product_search:*'),
    invalidateByPattern('cache:vendor_search:*'),
    deleteCache('marketplace:home:v2').catch(() => undefined),
    invalidateByPattern('cache:marketplace:*').catch(() => undefined)
  ]);
};

const productCatalogueEntityType = 'catalogue_product';
const serviceCatalogueEntityType = 'catalogue_service';

const syncProductSpecifications = async (client: any, productId: number, specifications?: SpecInput[]) => {
  if (specifications === undefined) return;
  await client.productSpecification.deleteMany({ where: { productId } });
  const rows = (specifications || []).filter(s => s?.name?.trim() && s?.value?.trim());
  if (rows.length > 0) {
    await client.productSpecification.createMany({
      data: rows.map(s => ({
        productId,
        name: s.name.trim(),
        value: s.value.trim(),
        unit: s.unit?.trim() || null
      }))
    });
  }
};

const syncServiceSpecifications = async (client: any, serviceId: number, specifications?: SpecInput[]) => {
  if (specifications === undefined) return;
  await client.serviceSpecification.deleteMany({ where: { serviceId } });
  const rows = (specifications || []).filter(s => s?.name?.trim() && s?.value?.trim());
  if (rows.length > 0) {
    await client.serviceSpecification.createMany({
      data: rows.map(s => ({
        serviceId,
        name: s.name.trim(),
        value: s.value.trim(),
        unit: s.unit?.trim() || null
      }))
    });
  }
};

const linkProductFiles = async (client: any, actor: WorkflowActor, productId: number, imageIds?: number[], documentIds?: number[]) => {
  if (Array.isArray(imageIds) && imageIds.length > 0) {
    await client.fileAsset.updateMany({
      where: { id: { in: imageIds }, ownerId: actor.id },
      data: { entityId: productId, entityType: productCatalogueEntityType }
    });
    await client.productImage.createMany({
      data: imageIds.map((fileAssetId, index) => ({
        productId,
        fileAssetId,
        isPrimary: index === 0,
        displayOrder: index
      }))
    });
  }
  if (Array.isArray(documentIds) && documentIds.length > 0) {
    await client.fileAsset.updateMany({
      where: { id: { in: documentIds }, ownerId: actor.id },
      data: { entityId: productId, entityType: productCatalogueEntityType }
    });
  }
};

const linkServiceFiles = async (client: any, actor: WorkflowActor, serviceId: number, imageIds?: number[], documentIds?: number[]) => {
  const fileIds = [...(imageIds || []), ...(documentIds || [])];
  if (fileIds.length > 0) {
    await client.fileAsset.updateMany({
      where: { id: { in: fileIds }, ownerId: actor.id },
      data: { entityId: serviceId, entityType: serviceCatalogueEntityType }
    });
  }
};

export const catalogueWorkflow = {
  async createProductWithClient(client: any, actor: WorkflowActor, input: Record<string, any>) {
    const { imageIds, documentIds, specifications, ...data } = input;
    const sellerUser = await client.user.findUnique({ where: { id: actor.id }, select: { organizationId: true } });
    const product = await client.product.create({
      data: {
        ...data,
        sellerId: actor.id,
        organizationId: sellerUser?.organizationId || null,
        status: data.status || 'DRAFT'
      }
    });
    await syncProductSpecifications(client, product.id, specifications);
    await linkProductFiles(client, actor, product.id, imageIds, documentIds);
    return product;
  },

  async createServiceWithClient(client: any, actor: WorkflowActor, input: Record<string, any>) {
    const { imageIds, documentIds, specifications, ...data } = input;
    const sellerUser = await client.user.findUnique({ where: { id: actor.id }, select: { organizationId: true } });
    const service = await client.service.create({
      data: {
        ...data,
        sellerId: actor.id,
        organizationId: sellerUser?.organizationId || null,
        status: data.status || 'DRAFT'
      }
    });
    await syncServiceSpecifications(client, service.id, specifications);
    await linkServiceFiles(client, actor, service.id, imageIds, documentIds);
    return service;
  },

  async createProduct(actor: WorkflowActor, input: Record<string, any>) {
    await assertApprovedSeller(actor);
    const product = await this.createProductWithClient(db, actor, input);
    await auditWorkflow(actor, 'workflow.catalogue.product_created', 'product', product.id);
    await invalidateCatalogueSearchCaches();
    return product;
  },

  async updateProduct(actor: WorkflowActor, productId: number, input: Record<string, any>) {
    await assertApprovedSeller(actor);
    await assertSellerOwner('product', productId, actor);
    const { imageIds, documentIds, specifications, ...data } = input;
    const product = await db.product.update({ where: { id: productId }, data });
    await syncProductSpecifications(db, productId, specifications);

    if (imageIds !== undefined) {
      const oldImages = await db.productImage.findMany({ where: { productId } });
      const oldFileAssetIds = oldImages.map((img: any) => img.fileAssetId);
      await db.productImage.deleteMany({ where: { productId } });

      if (oldFileAssetIds.length > 0) {
        await db.fileAsset.updateMany({
          where: { id: { in: oldFileAssetIds }, entityId: productId, entityType: { in: ['catalogue', productCatalogueEntityType] } },
          data: { entityId: null }
        });
      }

      if (Array.isArray(imageIds) && imageIds.length > 0) {
        await linkProductFiles(db, actor, productId, imageIds, undefined);
      }
    }

    if (documentIds !== undefined) {
      await db.fileAsset.updateMany({
        where: { entityId: productId, entityType: { in: ['catalogue', productCatalogueEntityType] }, mimeType: { not: { startsWith: 'image/' } } },
        data: { entityId: null }
      });

      if (Array.isArray(documentIds) && documentIds.length > 0) {
        await linkProductFiles(db, actor, productId, undefined, documentIds);
      }
    }

    await auditWorkflow(actor, 'workflow.catalogue.product_updated', 'product', product.id);
    await invalidateCatalogueSearchCaches();
    return product;
  },

  async duplicateProduct(actor: WorkflowActor, productId: number) {
    await assertApprovedSeller(actor);
    const existing = await db.product.findFirst({
      where: { id: productId, sellerId: actor.id },
      include: { specifications: true }
    });
    if (!existing) throw new ApiError(404, 'Product not found', 'PRODUCT_NOT_FOUND');

    const copy = await this.createProduct(actor, {
      name: `${existing.name} (Copy)`,
      description: existing.description,
      categoryId: existing.categoryId,
      price: existing.price,
      taxRate: existing.taxRate,
      discount: existing.discount,
      originalPrice: existing.originalPrice,
      discountPrice: existing.discountPrice,
      discountPercent: existing.discountPercent,
      offerLabel: existing.offerLabel,
      offerStartAt: existing.offerStartAt,
      offerEndAt: existing.offerEndAt,
      isOfferActive: existing.isOfferActive,
      bulkDealAvailable: existing.bulkDealAvailable,
      bulkMinQuantity: existing.bulkMinQuantity,
      currency: existing.currency,
      hsnCode: existing.hsnCode,
      brand: existing.brand,
      modelNumber: existing.modelNumber,
      unitOfMeasure: existing.unitOfMeasure,
      itemCondition: existing.itemCondition,
      isMsmeMade: existing.isMsmeMade,
      sku: existing.sku ? `${existing.sku}-COPY-${Date.now().toString(36).slice(-4)}` : null,
      status: 'DRAFT',
      specifications: existing.specifications.map((s: any) => ({ name: s.name, value: s.value, unit: s.unit }))
    });
    return copy;
  },

  async archiveProduct(actor: WorkflowActor, productId: number) {
    await assertApprovedSeller(actor);
    await assertSellerOwner('product', productId, actor);
    const product = await db.product.update({ where: { id: productId }, data: { status: 'ARCHIVED' } });
    await auditWorkflow(actor, 'workflow.catalogue.product_archived', 'product', product.id);
    await invalidateCatalogueSearchCaches();
    return product;
  },

  async setProductStatus(actor: WorkflowActor, productId: number, status: string) {
    await assertApprovedSeller(actor);
    await assertSellerOwner('product', productId, actor);
    const product = await db.product.update({ where: { id: productId }, data: { status } });
    await auditWorkflow(actor, 'workflow.catalogue.product_status_changed', 'product', product.id, { status });
    await invalidateCatalogueSearchCaches();
    return product;
  },

  async createService(actor: WorkflowActor, input: Record<string, any>) {
    await assertApprovedSeller(actor);
    const service = await this.createServiceWithClient(db, actor, input);
    await auditWorkflow(actor, 'workflow.catalogue.service_created', 'service', service.id);
    await invalidateCatalogueSearchCaches();
    return service;
  },

  async updateService(actor: WorkflowActor, serviceId: number, input: Record<string, any>) {
    await assertApprovedSeller(actor);
    await assertSellerOwner('service', serviceId, actor);
    const { imageIds, documentIds, specifications, ...data } = input;
    const service = await db.service.update({ where: { id: serviceId }, data });
    await syncServiceSpecifications(db, serviceId, specifications);

    if (imageIds !== undefined || documentIds !== undefined) {
      await db.fileAsset.updateMany({
        where: { entityId: serviceId, entityType: { in: ['catalogue', serviceCatalogueEntityType] } },
        data: { entityId: null }
      });
      await linkServiceFiles(db, actor, serviceId, imageIds, documentIds);
    }

    await auditWorkflow(actor, 'workflow.catalogue.service_updated', 'service', service.id);
    await invalidateCatalogueSearchCaches();
    return service;
  },

  async duplicateService(actor: WorkflowActor, serviceId: number) {
    await assertApprovedSeller(actor);
    const existing = await db.service.findFirst({
      where: { id: serviceId, sellerId: actor.id },
      include: { specifications: true }
    });
    if (!existing) throw new ApiError(404, 'Service not found', 'SERVICE_NOT_FOUND');

    const copy = await this.createService(actor, {
      name: `${existing.name} (Copy)`,
      description: existing.description,
      categoryId: existing.categoryId,
      pricingModel: existing.pricingModel,
      basePrice: existing.basePrice,
      taxRate: existing.taxRate,
      discount: existing.discount,
      originalPrice: existing.originalPrice,
      discountPrice: existing.discountPrice,
      discountPercent: existing.discountPercent,
      offerLabel: existing.offerLabel,
      offerStartAt: existing.offerStartAt,
      offerEndAt: existing.offerEndAt,
      isOfferActive: existing.isOfferActive,
      bulkDealAvailable: existing.bulkDealAvailable,
      bulkMinQuantity: existing.bulkMinQuantity,
      currency: existing.currency,
      serviceArea: existing.serviceArea,
      scopeOfWork: existing.scopeOfWork,
      deliverables: existing.deliverables,
      inclusions: existing.inclusions,
      exclusions: existing.exclusions,
      duration: existing.duration,
      slaResponseTime: existing.slaResponseTime,
      status: 'DRAFT',
      specifications: existing.specifications.map((s: any) => ({ name: s.name, value: s.value, unit: s.unit }))
    });
    return copy;
  },

  async archiveService(actor: WorkflowActor, serviceId: number) {
    await assertApprovedSeller(actor);
    await assertSellerOwner('service', serviceId, actor);
    const service = await db.service.update({ where: { id: serviceId }, data: { status: 'ARCHIVED' } });
    await auditWorkflow(actor, 'workflow.catalogue.service_archived', 'service', service.id);
    await invalidateCatalogueSearchCaches();
    return service;
  },

  async setServiceStatus(actor: WorkflowActor, serviceId: number, status: string) {
    await assertApprovedSeller(actor);
    await assertSellerOwner('service', serviceId, actor);
    const service = await db.service.update({ where: { id: serviceId }, data: { status } });
    await auditWorkflow(actor, 'workflow.catalogue.service_status_changed', 'service', service.id, { status });
    await invalidateCatalogueSearchCaches();
    return service;
  },

  async searchProducts(query: Record<string, unknown>) {
    const cacheKey = redisKeys.cacheProductSearch(sha256(JSON.stringify(query)));
    return getOrSetCache(cacheKey, () => db.product.findMany({
      where: {
        status: 'ACTIVE',
        ...(query.sellerId ? { sellerId: Number(query.sellerId) } : {}),
        ...(query.organizationId ? { organizationId: Number(query.organizationId) } : {}),
        ...(query.q ? { name: { contains: String(query.q), mode: 'insensitive' } } : {}),
        ...(query.categoryId ? { categoryId: Number(query.categoryId) } : {})
      },
      include: {
        category: true,
        seller: { select: { id: true, name: true } },
        images: { include: { fileAsset: true }, orderBy: [{ isPrimary: 'desc' }, { displayOrder: 'asc' }] },
        specifications: true,
        certifications: { include: { fileAsset: true } }
      },
      skip: Number(query.skip || 0),
      take: Number(query.take || 50),
      orderBy: { updatedAt: 'desc' }
    }), 120);
  },

  async searchServices(query: Record<string, unknown>) {
    const cacheKey = redisKeys.cacheVendorSearch(sha256(JSON.stringify({ type: 'service', query })));
    return getOrSetCache(cacheKey, () => db.service.findMany({
      where: {
        status: 'ACTIVE',
        ...(query.sellerId ? { sellerId: Number(query.sellerId) } : {}),
        ...(query.organizationId ? { organizationId: Number(query.organizationId) } : {}),
        ...(query.q ? { name: { contains: String(query.q), mode: 'insensitive' } } : {}),
        ...(query.categoryId ? { categoryId: Number(query.categoryId) } : {})
      },
      include: {
        category: true,
        seller: { select: { id: true, name: true } },
        specifications: true,
        certifications: { include: { fileAsset: true } }
      },
      skip: Number(query.skip || 0),
      take: Number(query.take || 50),
      orderBy: { updatedAt: 'desc' }
    }), 120);
  },

  async invalidateCategories() {
    await deleteCache(redisKeys.cacheCategoriesAll());
  }
};
