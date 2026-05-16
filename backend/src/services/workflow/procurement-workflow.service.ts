import { ApiError } from '../../utils/ApiError.js';
import { auditWorkflow, db, notifyWorkflow, numberSeries, roundMoney, type WorkflowActor } from './workflow-common.js';
import { statusTransitions, poStatusEnumFor } from './status-transition.service.js';

type RequirementInput = {
  title: string;
  description?: string;
  categoryId?: number;
  procurementMethod?: string;
  estimatedValue?: number;
  requiredBy?: Date;
  items?: Array<Record<string, unknown>>;
};

const assertBuyer = (actor: WorkflowActor) => {
  if (actor.role !== 'buyer' && actor.role !== 'admin') throw new ApiError(403, 'Buyer access required', 'BUYER_REQUIRED');
};

export const procurementWorkflow = {
  async createRequirement(actor: WorkflowActor, input: RequirementInput) {
    assertBuyer(actor);
    const requirement = await db.$transaction(async (tx: any) => tx.requirement.create({
      data: {
        requirementNumber: numberSeries('REQ'),
        buyerId: actor.id,
        title: input.title,
        description: input.description,
        categoryId: input.categoryId,
        procurementMethod: input.procurementMethod || 'TENDER',
        estimatedValue: input.estimatedValue,
        requiredBy: input.requiredBy,
        status: 'DRAFT',
        items: input.items?.length ? { create: input.items } : undefined
      },
      include: { items: true }
    }));
    await auditWorkflow(actor, 'workflow.requirement.created', 'requirement', requirement.id);
    return requirement;
  },

  async submitRequirement(actor: WorkflowActor, requirementId: number) {
    const requirement = await db.requirement.findUnique({ where: { id: requirementId } });
    if (!requirement || (actor.role !== 'admin' && requirement.buyerId !== actor.id)) {
      throw new ApiError(404, 'Requirement not found', 'REQUIREMENT_NOT_FOUND');
    }
    const updated = await db.requirement.update({ where: { id: requirementId }, data: { status: 'SUBMITTED' } });
    await auditWorkflow(actor, 'workflow.requirement.submitted', 'requirement', requirementId);
    return updated;
  },

  async createDirectPurchase(actor: WorkflowActor, input: { requirementId?: number; sellerId: number; totalAmount?: number }) {
    assertBuyer(actor);
    const directPurchase = await db.directPurchase.create({
      data: {
        requirementId: input.requirementId,
        buyerId: actor.id,
        sellerId: input.sellerId,
        purchaseNumber: numberSeries('DP'),
        status: 'REQUESTED',
        totalAmount: input.totalAmount
      }
    });
    await notifyWorkflow(input.sellerId, 'Direct purchase request', 'A buyer sent you a direct purchase request.', 'direct_purchase_requested');
    await auditWorkflow(actor, 'workflow.direct_purchase.created', 'directPurchase', directPurchase.id);
    return directPurchase;
  },

  async respondDirectPurchase(actor: WorkflowActor, directPurchaseId: number, accepted: boolean) {
    const directPurchase = await db.directPurchase.findUnique({ where: { id: directPurchaseId } });
    if (!directPurchase || (actor.role !== 'admin' && directPurchase.sellerId !== actor.id)) {
      throw new ApiError(404, 'Direct purchase not found', 'DIRECT_PURCHASE_NOT_FOUND');
    }
    const updated = await db.directPurchase.update({
      where: { id: directPurchaseId },
      data: { status: accepted ? 'APPROVED' : 'REJECTED', approvedAt: accepted ? new Date() : null }
    });
    await notifyWorkflow(directPurchase.buyerId, accepted ? 'Direct purchase accepted' : 'Direct purchase rejected', `Direct purchase ${directPurchase.purchaseNumber} was ${accepted ? 'accepted' : 'rejected'}.`, 'direct_purchase_response');
    await auditWorkflow(actor, accepted ? 'workflow.direct_purchase.accepted' : 'workflow.direct_purchase.rejected', 'directPurchase', directPurchaseId);
    return updated;
  },

  async createQuoteRequest(actor: WorkflowActor, input: { sellerId: number; subject: string; message: string; documentUrl?: string }) {
    assertBuyer(actor);
    const quoteRequest = await db.quoteRequest.create({
      data: { ...input, buyerId: actor.id, status: 'pending', statusEnum: 'SENT' }
    });
    await notifyWorkflow(input.sellerId, 'New RFQ', input.subject, 'quote_request_created');
    await auditWorkflow(actor, 'workflow.rfq.created', 'quoteRequest', quoteRequest.id);
    return quoteRequest;
  },

  async createQuoteResponse(actor: WorkflowActor, quoteRequestId: number, input: Record<string, unknown>) {
    const quoteRequest = await db.quoteRequest.findUnique({ where: { id: quoteRequestId } });
    if (!quoteRequest || (actor.role !== 'admin' && quoteRequest.sellerId !== actor.id)) {
      throw new ApiError(404, 'Quote request not found', 'QUOTE_REQUEST_NOT_FOUND');
    }
    const response = await db.$transaction(async (tx: any) => {
      const created = await tx.quoteResponse.create({
        data: { ...input, quoteRequestId, sellerId: quoteRequest.sellerId, responseNumber: numberSeries('QR'), status: 'SUBMITTED' }
      });
      await tx.quoteRequest.update({ where: { id: quoteRequestId }, data: { status: 'responded', statusEnum: 'RESPONDED' } });
      return created;
    });
    await notifyWorkflow(quoteRequest.buyerId, 'RFQ response received', quoteRequest.subject, 'quote_response_created');
    await auditWorkflow(actor, 'workflow.rfq.response_created', 'quoteResponse', response.id);
    return response;
  },

  async acceptQuoteResponseAndGeneratePO(actor: WorkflowActor, quoteResponseId: number, input: { tenderId?: number; bidId?: number; title?: string }) {
    assertBuyer(actor);
    const result = await db.$transaction(async (tx: any) => {
      const response = await tx.quoteResponse.findUnique({ where: { id: quoteResponseId }, include: { quoteRequest: true } });
      if (!response || (actor.role !== 'admin' && response.quoteRequest.buyerId !== actor.id)) {
        throw new ApiError(404, 'Quote response not found', 'QUOTE_RESPONSE_NOT_FOUND');
      }
      const existingPO = await tx.purchaseOrder.findFirst({ where: { sourceType: 'rfq', sourceId: response.id } });
      if (existingPO) return { quoteResponse: response, purchaseOrder: existingPO, reused: true };
      const accepted = await tx.quoteResponse.update({ where: { id: quoteResponseId }, data: { status: 'ACCEPTED' } });
      const amount = roundMoney(Number(response.totalAmount || 0));
      const po = await tx.purchaseOrder.create({
        data: {
          poNumber: numberSeries('PO-RFQ'),
          tenderId: input.tenderId || null,
          bidId: input.bidId || null,
          buyerId: response.quoteRequest.buyerId,
          sellerId: response.sellerId,
          title: input.title || response.quoteRequest.subject,
          amount,
          totalValue: amount,
          status: 'generated',
          poStatus: poStatusEnumFor('generated'),
          sourceType: 'rfq',
          sourceId: response.id
        }
      });
      return { quoteResponse: accepted, purchaseOrder: po, reused: false };
    });
    await auditWorkflow(actor, 'workflow.rfq.accepted_po_generated', 'purchaseOrder', result.purchaseOrder.id, { quoteResponseId });
    return result;
  },

  async generateDirectPurchasePO(actor: WorkflowActor, directPurchaseId: number, input: { tenderId?: number; bidId?: number; title?: string }) {
    assertBuyer(actor);
    const result = await db.$transaction(async (tx: any) => {
      const directPurchase = await tx.directPurchase.findUnique({ where: { id: directPurchaseId } });
      if (!directPurchase || (actor.role !== 'admin' && directPurchase.buyerId !== actor.id)) {
        throw new ApiError(404, 'Direct purchase not found', 'DIRECT_PURCHASE_NOT_FOUND');
      }
      if (directPurchase.status !== 'APPROVED') {
        throw new ApiError(409, 'Direct purchase must be accepted before PO generation', 'DIRECT_PURCHASE_NOT_ACCEPTED');
      }
      const existingPO = await tx.purchaseOrder.findFirst({ where: { sourceType: 'direct_purchase', sourceId: directPurchase.id } });
      if (existingPO) return { directPurchase, purchaseOrder: existingPO, reused: true };
      const amount = roundMoney(Number(directPurchase.totalAmount || 0));
      const po = await tx.purchaseOrder.create({
        data: {
          poNumber: numberSeries('PO-DP'),
          tenderId: input.tenderId || null,
          bidId: input.bidId || null,
          buyerId: directPurchase.buyerId,
          sellerId: directPurchase.sellerId,
          title: input.title || `Direct purchase ${directPurchase.purchaseNumber}`,
          amount,
          totalValue: amount,
          status: 'generated',
          poStatus: poStatusEnumFor('generated'),
          sourceType: 'direct_purchase',
          sourceId: directPurchase.id
        }
      });
      return { directPurchase, purchaseOrder: po, reused: false };
    });
    await auditWorkflow(actor, 'workflow.direct_purchase.po_generated', 'purchaseOrder', result.purchaseOrder.id, { directPurchaseId });
    return result;
  }
};
