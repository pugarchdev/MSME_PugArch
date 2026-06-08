import { ApiError } from '../../utils/ApiError.js';
import { auditWorkflow, auditWorkflowSoon, db, notifyWorkflow, notifyWorkflowSoon, numberSeries, roundMoney, type WorkflowActor } from './workflow-common.js';
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
    notifyWorkflowSoon(input.sellerId, 'Direct purchase request', 'A buyer sent you a direct purchase request.', 'direct_purchase_requested', '/seller/orders');
    auditWorkflowSoon(actor, 'workflow.direct_purchase.created', 'directPurchase', directPurchase.id);
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
    notifyWorkflowSoon(directPurchase.buyerId, accepted ? 'Direct purchase accepted' : 'Direct purchase rejected', `Direct purchase ${directPurchase.purchaseNumber} was ${accepted ? 'accepted' : 'rejected'}.`, 'direct_purchase_response', '/buyer/direct-purchase');
    auditWorkflowSoon(actor, accepted ? 'workflow.direct_purchase.accepted' : 'workflow.direct_purchase.rejected', 'directPurchase', directPurchaseId);
    return updated;
  },

  async createQuoteRequest(actor: WorkflowActor, input: { sellerId: number; subject: string; message: string; documentUrl?: string; estimatedValue?: number; deadlineDate?: Date }) {
    assertBuyer(actor);
    const quoteRequest = await db.quoteRequest.create({
      data: { ...input, buyerId: actor.id, status: 'pending', statusEnum: 'SENT' },
      include: {
        buyer: { select: { id: true, name: true, email: true } },
        seller: { select: { id: true, name: true, email: true } },
        quoteResponses: true
      }
    });

    if (input.documentUrl) {
      const match = input.documentUrl.match(/\/api\/files\/(\d+)/);
      const fileId = match ? Number(match[1]) : null;
      if (fileId) {
        await db.fileAsset.updateMany({
          where: { id: fileId },
          data: { entityType: 'quote', entityId: quoteRequest.id }
        });
      } else {
        await db.fileAsset.updateMany({
          where: { url: input.documentUrl },
          data: { entityType: 'quote', entityId: quoteRequest.id }
        });
      }
    }

    notifyWorkflowSoon(input.sellerId, 'New RFQ received', input.subject, 'quote_request_created', '/quotations');
    await auditWorkflow(actor, 'workflow.rfq.created', 'quoteRequest', quoteRequest.id);
    return quoteRequest;
  },

  async createQuoteResponse(actor: WorkflowActor, quoteRequestId: number, input: Record<string, unknown>) {
    const quoteRequest = await db.quoteRequest.findUnique({ where: { id: quoteRequestId }, include: { quoteResponses: true } });
    if (!quoteRequest || (actor.role !== 'admin' && quoteRequest.sellerId !== actor.id)) {
      throw new ApiError(404, 'Quote request not found', 'QUOTE_REQUEST_NOT_FOUND');
    }
    if (quoteRequest.quoteResponses.length > 0 || String(quoteRequest.status) !== 'pending') {
      throw new ApiError(409, 'RFQ response has already been submitted', 'QUOTE_RESPONSE_ALREADY_SUBMITTED');
    }
    const response = await db.$transaction(async (tx: any) => {
      const created = await tx.quoteResponse.create({
        data: { ...input, quoteRequestId, sellerId: quoteRequest.sellerId, responseNumber: numberSeries('QR'), status: 'SUBMITTED' }
      });
      await tx.quoteRequest.update({ where: { id: quoteRequestId }, data: { status: 'responded', statusEnum: 'RESPONDED' } });
      return created;
    });

    const responseDocUrl = (input.documentUrl as string) || undefined;
    if (responseDocUrl) {
      const match = responseDocUrl.match(/\/api\/files\/(\d+)/);
      const fileId = match ? Number(match[1]) : null;
      if (fileId) {
        await db.fileAsset.updateMany({
          where: { id: fileId },
          data: { entityType: 'quote', entityId: quoteRequestId }
        });
      } else {
        await db.fileAsset.updateMany({
          where: { url: responseDocUrl },
          data: { entityType: 'quote', entityId: quoteRequestId }
        });
      }
    }

    notifyWorkflowSoon(quoteRequest.buyerId, 'RFQ response received', quoteRequest.subject, 'quote_response_created', '/quotations');
    auditWorkflowSoon(actor, 'workflow.rfq.response_created', 'quoteResponse', response.id);
    return response;
  },

  async acceptQuoteResponseAndGeneratePO(actor: WorkflowActor, quoteResponseId: number, input: { tenderId?: number; bidId?: number; title?: string }) {
    assertBuyer(actor);
    const result = await db.$transaction(async (tx: any) => {
      const response = await tx.quoteResponse.findUnique({ where: { id: quoteResponseId }, include: { quoteRequest: true } });
      if (!response || (actor.role !== 'admin' && response.quoteRequest.buyerId !== actor.id)) {
        throw new ApiError(404, 'Quote response not found', 'QUOTE_RESPONSE_NOT_FOUND');
      }
      if (response.status === 'REJECTED') {
        throw new ApiError(409, 'Rejected RFQ response cannot be accepted', 'QUOTE_RESPONSE_FINALIZED');
      }
      const existingPO = await tx.purchaseOrder.findFirst({ where: { sourceType: 'rfq', sourceId: response.id } });
      if (existingPO) {
        const accepted = response.status === 'ACCEPTED'
          ? response
          : await tx.quoteResponse.update({ where: { id: quoteResponseId }, data: { status: 'ACCEPTED' } });
        await tx.quoteRequest.update({
          where: { id: response.quoteRequestId },
          data: { status: 'accepted', statusEnum: 'CLOSED' }
        });
        return { quoteResponse: accepted, purchaseOrder: existingPO, reused: true };
      }
      const accepted = await tx.quoteResponse.update({ where: { id: quoteResponseId }, data: { status: 'ACCEPTED' } });
      await tx.quoteRequest.update({
        where: { id: response.quoteRequestId },
        data: { status: 'accepted', statusEnum: 'CLOSED' }
      });
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
    }, {
      timeout: 15000
    });
    notifyWorkflowSoon(
      result.quoteResponse.sellerId,
      result.reused ? 'RFQ purchase order reopened' : 'RFQ response accepted',
      `Your response for "${result.purchaseOrder.title}" was accepted${result.reused ? ' and the existing purchase order is available.' : ' and a purchase order was generated.'}`,
      'quote_response_accepted',
      '/quotations'
    );
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
    }, {
      timeout: 15000
    });
    notifyWorkflowSoon(
      result.purchaseOrder.sellerId,
      result.reused ? 'Direct purchase PO reopened' : 'Purchase order generated',
      `A purchase order was ${result.reused ? 'opened again' : 'generated'} for ${result.purchaseOrder.title}.`,
      'direct_purchase_po_generated',
      '/seller/orders'
    );
    await auditWorkflow(actor, 'workflow.direct_purchase.po_generated', 'purchaseOrder', result.purchaseOrder.id, { directPurchaseId });
    return result;
  }
};
