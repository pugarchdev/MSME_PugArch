import { ApiError } from '../../utils/ApiError.js';
import { auditWorkflow, db, type WorkflowActor } from './workflow-common.js';

const assertCompletedPO = async (purchaseOrderId?: number) => {
  if (!purchaseOrderId) return null;
  const po = await db.purchaseOrder.findUnique({ where: { id: purchaseOrderId } });
  if (!po) throw new ApiError(404, 'Purchase order not found', 'PO_NOT_FOUND');
  if (!['completed', 'closed', 'delivered', 'inspection_accepted'].includes(String(po.status))) {
    throw new ApiError(409, 'Ratings can be submitted after order completion', 'ORDER_NOT_COMPLETE');
  }
  return po;
};

export const ratingWorkflow = {
  async rateSupplier(actor: WorkflowActor, input: Record<string, unknown>) {
    if (actor.role !== 'buyer' && actor.role !== 'admin') throw new ApiError(403, 'Buyer access required', 'BUYER_REQUIRED');
    const po = await assertCompletedPO(input.purchaseOrderId ? Number(input.purchaseOrderId) : undefined);
    if (po && actor.role !== 'admin' && po.buyerId !== actor.id) throw new ApiError(404, 'Purchase order not found', 'PO_NOT_FOUND');
    const rating = await db.supplierRating.create({ data: { ...input, buyerId: actor.id } });
    await auditWorkflow(actor, 'workflow.rating.supplier_created', 'supplierRating', rating.id);
    return rating;
  },

  async rateBuyer(actor: WorkflowActor, input: Record<string, unknown>) {
    if (actor.role !== 'seller' && actor.role !== 'admin') throw new ApiError(403, 'Seller access required', 'SELLER_REQUIRED');
    const po = await assertCompletedPO(input.purchaseOrderId ? Number(input.purchaseOrderId) : undefined);
    if (po && actor.role !== 'admin' && po.sellerId !== actor.id) throw new ApiError(404, 'Purchase order not found', 'PO_NOT_FOUND');
    const rating = await db.buyerRating.create({ data: { ...input, sellerId: actor.id } });
    await auditWorkflow(actor, 'workflow.rating.buyer_created', 'buyerRating', rating.id);
    return rating;
  }
};
