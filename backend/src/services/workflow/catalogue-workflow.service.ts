import { redisKeys } from '../../constants/redis-keys.js';
import { deleteCache, getOrSetCache, invalidateByPattern } from '../cache.service.js';
import { auditWorkflow, db, type WorkflowActor } from './workflow-common.js';
import { sha256 } from '../../utils/crypto.js';
import { ApiError } from '../../utils/ApiError.js';

const assertSellerOwner = async (model: 'product' | 'service', id: number, actor: WorkflowActor) => {
  const record = await db[model].findFirst({ where: { id, sellerId: actor.id } });
  if (!record && actor.role !== 'admin') throw new ApiError(404, `${model} not found`, `${model.toUpperCase()}_NOT_FOUND`);
  return record || db[model].findUnique({ where: { id } });
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
    invalidateByPattern('cache:vendor_search:*')
  ]);
};

const productCatalogueEntityType = 'catalogue_product';
const serviceCatalogueEntityType = 'catalogue_service';

export const catalogueWorkflow = {
  async createProduct(actor: WorkflowActor, input: Record<string, any>) {
    await assertApprovedSeller(actor);
    const { imageIds, documentIds, ...data } = input;
    const sellerUser = await db.user.findUnique({ where: { id: actor.id }, select: { organizationId: true } });
    const product = await db.product.create({
      data: {
        ...data,
        sellerId: actor.id,
        organizationId: sellerUser?.organizationId || null,
        status: data.status || 'ACTIVE'
      }
    });

    if (Array.isArray(imageIds) && imageIds.length > 0) {
      await db.fileAsset.updateMany({
        where: { id: { in: imageIds }, ownerId: actor.id },
        data: { entityId: product.id, entityType: productCatalogueEntityType }
      });
      await db.productImage.createMany({
        data: imageIds.map((fileAssetId, index) => ({
          productId: product.id,
          fileAssetId,
          isPrimary: index === 0,
          displayOrder: index
        }))
      });
    }

    if (Array.isArray(documentIds) && documentIds.length > 0) {
      await db.fileAsset.updateMany({
        where: { id: { in: documentIds }, ownerId: actor.id },
        data: { entityId: product.id, entityType: productCatalogueEntityType }
      });
    }

    await auditWorkflow(actor, 'workflow.catalogue.product_created', 'product', product.id);
    await invalidateCatalogueSearchCaches();
    return product;
  },

  async updateProduct(actor: WorkflowActor, productId: number, input: Record<string, any>) {
    await assertApprovedSeller(actor);
    await assertSellerOwner('product', productId, actor);
    const { imageIds, documentIds, ...data } = input;
    const product = await db.product.update({ where: { id: productId }, data });

    if (imageIds !== undefined) {
      const oldImages = await db.productImage.findMany({ where: { productId } });
      const oldFileAssetIds = oldImages.map(img => img.fileAssetId);
      await db.productImage.deleteMany({ where: { productId } });

      if (oldFileAssetIds.length > 0) {
        await db.fileAsset.updateMany({
          where: { id: { in: oldFileAssetIds }, entityId: productId, entityType: { in: ['catalogue', productCatalogueEntityType] } },
          data: { entityId: null }
        });
      }

      if (Array.isArray(imageIds) && imageIds.length > 0) {
        await db.fileAsset.updateMany({
          where: { id: { in: imageIds }, ownerId: actor.id },
          data: { entityId: productId, entityType: productCatalogueEntityType }
        });
        await db.productImage.createMany({
          data: imageIds.map((fileAssetId, index) => ({
            productId,
            fileAssetId,
            isPrimary: index === 0,
            displayOrder: index
          }))
        });
      }
    }

    if (documentIds !== undefined) {
      await db.fileAsset.updateMany({
        where: { entityId: productId, entityType: { in: ['catalogue', productCatalogueEntityType] }, mimeType: { not: { startsWith: 'image/' } } },
        data: { entityId: null }
      });

      if (Array.isArray(documentIds) && documentIds.length > 0) {
        await db.fileAsset.updateMany({
          where: { id: { in: documentIds }, ownerId: actor.id },
          data: { entityId: productId, entityType: productCatalogueEntityType }
        });
      }
    }

    await auditWorkflow(actor, 'workflow.catalogue.product_updated', 'product', product.id);
    await invalidateCatalogueSearchCaches();
    return product;
  },

  async archiveProduct(actor: WorkflowActor, productId: number) {
    await assertApprovedSeller(actor);
    await assertSellerOwner('product', productId, actor);
    const product = await db.product.update({ where: { id: productId }, data: { status: 'ARCHIVED' } });
    await auditWorkflow(actor, 'workflow.catalogue.product_archived', 'product', product.id);
    await invalidateCatalogueSearchCaches();
    return product;
  },

  async createService(actor: WorkflowActor, input: Record<string, any>) {
    await assertApprovedSeller(actor);
    const { imageIds, documentIds, ...data } = input;
    const sellerUser = await db.user.findUnique({ where: { id: actor.id }, select: { organizationId: true } });
    const service = await db.service.create({
      data: {
        ...data,
        sellerId: actor.id,
        organizationId: sellerUser?.organizationId || null,
        status: data.status || 'ACTIVE'
      }
    });

    const fileIds = [...(imageIds || []), ...(documentIds || [])];
    if (fileIds.length > 0) {
      await db.fileAsset.updateMany({
        where: { id: { in: fileIds }, ownerId: actor.id },
        data: { entityId: service.id, entityType: serviceCatalogueEntityType }
      });
    }

    await auditWorkflow(actor, 'workflow.catalogue.service_created', 'service', service.id);
    await invalidateCatalogueSearchCaches();
    return service;
  },

  async updateService(actor: WorkflowActor, serviceId: number, input: Record<string, any>) {
    await assertApprovedSeller(actor);
    await assertSellerOwner('service', serviceId, actor);
    const { imageIds, documentIds, ...data } = input;
    const service = await db.service.update({ where: { id: serviceId }, data });

    if (imageIds !== undefined || documentIds !== undefined) {
      await db.fileAsset.updateMany({
        where: { entityId: serviceId, entityType: { in: ['catalogue', serviceCatalogueEntityType] } },
        data: { entityId: null }
      });

      const fileIds = [...(imageIds || []), ...(documentIds || [])];
      if (fileIds.length > 0) {
        await db.fileAsset.updateMany({
          where: { id: { in: fileIds }, ownerId: actor.id },
          data: { entityId: serviceId, entityType: serviceCatalogueEntityType }
        });
      }
    }

    await auditWorkflow(actor, 'workflow.catalogue.service_updated', 'service', service.id);
    await invalidateCatalogueSearchCaches();
    return service;
  },

  async archiveService(actor: WorkflowActor, serviceId: number) {
    await assertApprovedSeller(actor);
    await assertSellerOwner('service', serviceId, actor);
    const service = await db.service.update({ where: { id: serviceId }, data: { status: 'ARCHIVED' } });
    await auditWorkflow(actor, 'workflow.catalogue.service_archived', 'service', service.id);
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
