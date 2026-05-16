import { redisKeys } from '../../constants/redis-keys.js';
import { deleteCache, getOrSetCache } from '../cache.service.js';
import { auditWorkflow, db, type WorkflowActor } from './workflow-common.js';
import { sha256 } from '../../utils/crypto.js';
import { ApiError } from '../../utils/ApiError.js';

const assertSellerOwner = async (model: 'product' | 'service', id: number, actor: WorkflowActor) => {
  const record = await db[model].findFirst({ where: { id, sellerId: actor.id } });
  if (!record && actor.role !== 'admin') throw new ApiError(404, `${model} not found`, `${model.toUpperCase()}_NOT_FOUND`);
  return record || db[model].findUnique({ where: { id } });
};

export const catalogueWorkflow = {
  async createProduct(actor: WorkflowActor, input: Record<string, unknown>) {
    const product = await db.product.create({ data: { ...input, sellerId: actor.id, status: input.status || 'ACTIVE' } });
    await auditWorkflow(actor, 'workflow.catalogue.product_created', 'product', product.id);
    return product;
  },

  async updateProduct(actor: WorkflowActor, productId: number, input: Record<string, unknown>) {
    await assertSellerOwner('product', productId, actor);
    const product = await db.product.update({ where: { id: productId }, data: input });
    await auditWorkflow(actor, 'workflow.catalogue.product_updated', 'product', product.id);
    return product;
  },

  async archiveProduct(actor: WorkflowActor, productId: number) {
    await assertSellerOwner('product', productId, actor);
    const product = await db.product.update({ where: { id: productId }, data: { status: 'ARCHIVED' } });
    await auditWorkflow(actor, 'workflow.catalogue.product_archived', 'product', product.id);
    return product;
  },

  async createService(actor: WorkflowActor, input: Record<string, unknown>) {
    const service = await db.service.create({ data: { ...input, sellerId: actor.id, status: input.status || 'ACTIVE' } });
    await auditWorkflow(actor, 'workflow.catalogue.service_created', 'service', service.id);
    return service;
  },

  async updateService(actor: WorkflowActor, serviceId: number, input: Record<string, unknown>) {
    await assertSellerOwner('service', serviceId, actor);
    const service = await db.service.update({ where: { id: serviceId }, data: input });
    await auditWorkflow(actor, 'workflow.catalogue.service_updated', 'service', service.id);
    return service;
  },

  async archiveService(actor: WorkflowActor, serviceId: number) {
    await assertSellerOwner('service', serviceId, actor);
    const service = await db.service.update({ where: { id: serviceId }, data: { status: 'ARCHIVED' } });
    await auditWorkflow(actor, 'workflow.catalogue.service_archived', 'service', service.id);
    return service;
  },

  async searchProducts(query: Record<string, unknown>) {
    const cacheKey = redisKeys.cacheProductSearch(sha256(JSON.stringify(query)));
    return getOrSetCache(cacheKey, () => db.product.findMany({
      where: {
        status: 'ACTIVE',
        ...(query.q ? { name: { contains: String(query.q), mode: 'insensitive' } } : {}),
        ...(query.categoryId ? { categoryId: Number(query.categoryId) } : {})
      },
      include: { category: true, seller: { select: { id: true, name: true } } },
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
        ...(query.q ? { name: { contains: String(query.q), mode: 'insensitive' } } : {}),
        ...(query.categoryId ? { categoryId: Number(query.categoryId) } : {})
      },
      include: { category: true, seller: { select: { id: true, name: true } } },
      skip: Number(query.skip || 0),
      take: Number(query.take || 50),
      orderBy: { updatedAt: 'desc' }
    }), 120);
  },

  async invalidateCategories() {
    await deleteCache(redisKeys.cacheCategoriesAll());
  }
};
