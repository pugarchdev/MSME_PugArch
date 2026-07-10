import prisma from '../../lib/prisma.js';
import { ApiError } from '../../utils/ApiError.js';
import { auditLog } from '../audit/audit.service.js';
import { createApprovalChain } from '../../services/approval-chain.service.js';
import { numberSeries } from '../../services/workflow/workflow-common.js';
import { getProcurementModeSettings } from '../procurementMode/procurement-mode.service.js';
import { notificationService } from '../../services/notification.service.js';
import { broadMethodForCanonical, normalizeCanonicalMethod } from '../../utils/procurement-methods.js';

const generatePoNumber = () => numberSeries('PO');

export const getProcurementRequestForOrg = async (id: number, organizationId: number, buyerId: number) => {
  const request = await prisma.procurementRequest.findFirst({
    where: { id, organizationId, buyerId },
  });
  if (!request) throw new ApiError(404, 'Procurement request not found.', 'NOT_FOUND');
  return request;
};

export const saveProcurementCheckoutDraft = async (
  id: number,
  organizationId: number,
  buyerId: number,
  patch: {
    buyerDetails?: Record<string, unknown>;
    consigneeDetails?: Record<string, unknown>;
    deliveryDetails?: Record<string, unknown>;
    budgetSanction?: Record<string, unknown>;
    paymentAuthority?: Record<string, unknown>;
    priceReasonability?: Record<string, unknown>;
    termsDocuments?: Record<string, unknown>;
    declarations?: Record<string, unknown>;
    selectedMethod?: string;
  }
) => {
  await getProcurementRequestForOrg(id, organizationId, buyerId);
  return prisma.procurementRequest.update({
    where: { id },
    data: {
      ...patch,
      status: patch.selectedMethod ? 'PROCUREMENT_METHOD_SELECTED' : undefined,
      updatedAt: new Date(),
    },
  });
};

export const validateBudgetSanction = (request: any) => {
  const budget = (request.budgetSanction || {}) as Record<string, any>;
  const price = (request.priceReasonability || {}) as Record<string, any>;
  const method = request.selectedMethod;
  const cartSnap = request.cartSnapshot as { items?: any[]; totalValue?: number } | null;

  // 1. Recalculate total payable amount from cart snapshot items
  const items = cartSnap?.items || [];
  let totalPayableAmount = 0;
  for (const item of items) {
    const qty = Number(item.quantity || 0);
    const priceVal = Number(item.unitPrice || item.price || 0);
    totalPayableAmount += qty * priceVal;
  }

  // 2. Budget availability confirmed: mandatory, must be true
  const budgetConfirmed = budget.budgetAvailabilityConfirmed === 'Yes' || budget.budgetAvailabilityConfirmed === true;
  if (!budgetConfirmed) {
    throw new ApiError(400, 'Budget availability must be confirmed before procurement submission.', 'BUDGET_NOT_CONFIRMED');
  }

  // 3. Sanction Amount is mandatory and must be >= total payable amount
  const sanctionAmount = Number(budget.sanctionAmount || 0);
  if (!budget.sanctionAmount || isNaN(sanctionAmount) || sanctionAmount <= 0) {
    throw new ApiError(400, 'Sanction Amount is mandatory and must be positive.', 'INVALID_SANCTION_AMOUNT');
  }
  if (sanctionAmount < totalPayableAmount) {
    throw new ApiError(400, 'Sanction amount cannot be less than total payable amount.', 'SANCTION_AMOUNT_INSUFFICIENT');
  }

  // 4. Estimated Price exists and matches calculated total unless override reason is provided
  const estimatedPrice = Number(price.estimatedPrice || 0);
  if (!price.estimatedPrice || isNaN(estimatedPrice) || estimatedPrice <= 0) {
    throw new ApiError(400, 'Estimated Price is mandatory and must be positive.', 'INVALID_ESTIMATED_PRICE');
  }
  if (Math.abs(estimatedPrice - totalPayableAmount) > 0.01) {
    if (!price.estimatedPriceOverrideReason || String(price.estimatedPriceOverrideReason).trim().length === 0) {
      throw new ApiError(400, 'Estimated price mismatch. Please provide Estimated Price Override Reason.', 'ESTIMATED_PRICE_OVERRIDE_REASON_REQUIRED');
    }
  }

  // 5. Sanction Date must not be a future date
  if (budget.sanctionDate) {
    const sDate = new Date(budget.sanctionDate);
    if (!isNaN(sDate.getTime()) && sDate > new Date()) {
      throw new ApiError(400, 'Sanction Date cannot be in the future.', 'INVALID_SANCTION_DATE');
    }
  }

  // 6. If Sanction Order Number exists, Sanction Date, Approving Authority, and Sanction Order Upload are required
  if (budget.sanctionOrderNumber && String(budget.sanctionOrderNumber).trim().length > 0) {
    if (!budget.sanctionDate) {
      throw new ApiError(400, 'Sanction Date is required if Sanction Order Number is entered.', 'SANCTION_DATE_REQUIRED');
    }
    if (!budget.approvingAuthority || String(budget.approvingAuthority).trim().length === 0) {
      throw new ApiError(400, 'Approving Authority is required if Sanction Order Number is entered.', 'APPROVING_AUTHORITY_REQUIRED');
    }
    if (!budget.sanctionOrderDocumentId) {
      throw new ApiError(400, 'Sanction Order document upload is required if Sanction Order Number is entered.', 'SANCTION_ORDER_DOCUMENT_REQUIRED');
    }
  }

  // 7. If sanction is pending (i.e. no Sanction Order Number), require Approval Note and document upload
  if (!budget.sanctionOrderNumber || String(budget.sanctionOrderNumber).trim().length === 0) {
    if (!budget.approvalNote || String(budget.approvalNote).trim().length === 0) {
      throw new ApiError(400, 'Approval Note is required since Sanction Order is pending.', 'APPROVAL_NOTE_REQUIRED');
    }
    if (!budget.budgetApprovalDocumentId) {
      throw new ApiError(400, 'Budget Approval Document / Fund Availability Certificate is required.', 'BUDGET_APPROVAL_DOCUMENT_REQUIRED');
    }
  }

  // 9. Financial Year & Fund Source are required
  if (!budget.financialYear || String(budget.financialYear).trim().length === 0) {
    throw new ApiError(400, 'Financial Year is required.', 'FINANCIAL_YEAR_REQUIRED');
  }
  if (!budget.fundSource || String(budget.fundSource).trim().length === 0) {
    throw new ApiError(400, 'Fund Source / Grant Type is required.', 'FUND_SOURCE_REQUIRED');
  }

  // 10. Budget Approval Document is mandatory when confirmed
  if (!budget.budgetApprovalDocumentId) {
    throw new ApiError(400, 'Budget Approval Document / Fund Availability Certificate is required.', 'BUDGET_APPROVAL_DOCUMENT_REQUIRED');
  }

  // 11. Procurement method specific rules
  if (method === 'DIRECT_PURCHASE') {
    if (!price.marketComparisonPrice) {
      throw new ApiError(400, 'Market Comparison Price is recommended or required for Direct Purchase.', 'MARKET_COMPARISON_PRICE_REQUIRED');
    }
    if (!price.priceReasonabilityRemarks || String(price.priceReasonabilityRemarks).trim().length === 0) {
      throw new ApiError(400, 'Price Reasonability Remarks are required for Direct Purchase.', 'PRICE_REMARKS_REQUIRED');
    }
  } else if (method === 'PAC_PROCUREMENT' || method === 'SINGLE_SOURCE') {
    if (!price.priceReasonabilityRemarks || String(price.priceReasonabilityRemarks).trim().length === 0) {
      throw new ApiError(400, `Price Reasonability Remarks are mandatory for ${method === 'PAC_PROCUREMENT' ? 'PAC' : 'Single Source'}.`, 'PRICE_REMARKS_REQUIRED');
    }
    const docs = (request.termsDocuments as any)?.documents || [];
    const hasCert = docs.some((d: any) =>
      d.documentType === 'PAC Certificate' ||
      d.documentType === 'Proprietary Article Certificate' ||
      d.documentType === 'Other Supporting Document' ||
      d.documentType === 'Approval Document'
    );
    if (!hasCert) {
      throw new ApiError(400, `${method === 'PAC_PROCUREMENT' ? 'PAC' : 'Single Source'} justification document is required.`, 'JUSTIFICATION_DOCUMENT_REQUIRED');
    }
  } else if (method === 'REPEAT_ORDER') {
    if (!price.lastPurchasePrice || Number(price.lastPurchasePrice) <= 0) {
      throw new ApiError(400, 'Last Purchase Price is required for Repeat Order.', 'LPP_REQUIRED');
    }
    if (!price.priceReasonabilityRemarks || String(price.priceReasonabilityRemarks).trim().length === 0) {
      throw new ApiError(400, 'Price Reasonability Remarks are mandatory for Repeat Order.', 'PRICE_REMARKS_REQUIRED');
    }
  }
};

export const submitProcurementRequestForApproval = async (
  id: number,
  organizationId: number,
  buyerId: number
) => {
  const request = await getProcurementRequestForOrg(id, organizationId, buyerId);
  if (!request.selectedMethod) {
    throw new ApiError(400, 'Procurement method must be selected before submission.', 'METHOD_REQUIRED');
  }

  validateBudgetSanction(request);

  const cartValue = Number((request.cartSnapshot as { totalValue?: number })?.totalValue || 0);
  const settings = await getProcurementModeSettings(organizationId);

  const updated = await prisma.procurementRequest.update({
    where: { id },
    data: {
      status: 'SUBMITTED_FOR_APPROVAL',
      submittedAt: new Date(),
    },
  });

  if (settings.internalApprovalRequired) {
    await createApprovalChain({
      entityType: 'direct_purchase',
      entityId: id,
      organizationId,
      totalValue: cartValue,
      initiatorUserId: buyerId,
    });
  }

  await auditLog({
    actorUserId: buyerId,
    action: 'procurement.checkout.submitted',
    entityType: 'procurement_request',
    entityId: id,
  });

  return updated;
};

export const finalizeDirectPurchaseFromCheckout = async (
  requestId: number,
  organizationId: number,
  buyerId: number
) => {
  const request = await getProcurementRequestForOrg(requestId, organizationId, buyerId);
  validateBudgetSanction(request);

  if (request.selectedMethod !== 'DIRECT_PURCHASE' && request.selectedMethod !== 'L1_PURCHASE') {
    throw new ApiError(409, 'Only Direct Purchase or L1 Purchase can be finalized to order.', 'INVALID_METHOD');
  }

  if (!['APPROVED', 'PROCUREMENT_METHOD_SELECTED', 'SUBMITTED_FOR_APPROVAL'].includes(request.status)) {
    throw new ApiError(409, `Cannot finalize request in status ${request.status}.`, 'INVALID_STATUS');
  }

  const settings = await getProcurementModeSettings(organizationId);
  const cartValue = Number((request.cartSnapshot as { totalValue?: number })?.totalValue || 0);

  if (request.selectedMethod === 'DIRECT_PURCHASE' && cartValue > settings.directPurchaseMaxValue) {
    throw new ApiError(409, 'Direct Purchase threshold exceeded.', 'THRESHOLD_EXCEEDED');
  }

  const cartId = request.cartId;
  if (!cartId) throw new ApiError(400, 'Procurement request has no linked cart.', 'CART_MISSING');

  const cart = await prisma.cart.findFirst({
    where: { id: cartId, organizationId },
    include: { items: true },
  });
  if (!cart || cart.items.length === 0) {
    throw new ApiError(400, 'Cart is empty or unavailable.', 'CART_EMPTY');
  }

  const membership = await prisma.orgMembership.findUnique({
    where: { userId_organizationId: { userId: buyerId, organizationId } },
  });
  const orgRole = membership?.orgRole;
  const isAutoApprove = orgRole === 'ORG_ADMIN' || orgRole === 'PROCUREMENT_OFFICER';

  const createdOrders: { poId: number; poNumber: string; sellerId: number }[] = [];
  const createdDirectPurchases: number[] = [];

  await prisma.$transaction(async (tx) => {
    const itemsBySeller: Record<number, typeof cart.items> = {};
    for (const item of cart.items) {
      if (!itemsBySeller[item.sellerId]) itemsBySeller[item.sellerId] = [];
      itemsBySeller[item.sellerId].push(item);
    }

    for (const [sellerIdStr, items] of Object.entries(itemsBySeller)) {
      const sellerId = Number(sellerIdStr);
      let totalAmount = 0;
      const requirementItemsData: Array<Record<string, unknown>> = [];
      const poItemsData: Array<Record<string, unknown>> = [];

      for (const item of items) {
        let unitPrice = Number(item.unitPrice);
        let taxRate = 0;
        let description = '';
        let itemName = item.itemName;
        let unitOfMeasure = item.unitOfMeasure;

        if (item.productId) {
          const product = await tx.product.findUnique({ where: { id: item.productId }, include: { specifications: true } });
          if (!product || product.status !== 'ACTIVE') {
            throw new ApiError(400, `Product ${item.itemName} is unavailable.`, 'PRODUCT_UNAVAILABLE');
          }
          unitPrice = Number(product.discountPrice || product.price || 0);
          taxRate = Number(product.taxRate || 0);
          description = product.description || '';
          itemName = product.name;
          unitOfMeasure = product.unitOfMeasure || 'units';
        } else if (item.serviceId) {
          const service = await tx.service.findUnique({ where: { id: item.serviceId } });
          if (!service || service.status !== 'ACTIVE') {
            throw new ApiError(400, `Service ${item.itemName} is unavailable.`, 'SERVICE_UNAVAILABLE');
          }
          unitPrice = Number(service.discountPrice || service.basePrice || 0);
          taxRate = Number(service.taxRate || 0);
          description = service.description || '';
          itemName = service.name;
          unitOfMeasure = 'service';
        }

        const qty = Number(item.quantity);
        const excl = qty * unitPrice;
        const lineTotal = excl + excl * (taxRate / 100);
        totalAmount += lineTotal;

        requirementItemsData.push({
          productId: item.productId,
          itemName,
          description,
          quantity: item.quantity,
          unitOfMeasure,
          estimatedUnitPrice: unitPrice,
        });

        poItemsData.push({
          productId: item.productId,
          itemName,
          quantity: item.quantity,
          unitOfMeasure,
          unitPrice,
          totalAmount: lineTotal,
        });
      }

      const deliveryDetails = (request.deliveryDetails || {}) as Record<string, unknown>;
      const budgetSanction = (request.budgetSanction || {}) as Record<string, unknown>;
      const canonicalMethod = normalizeCanonicalMethod(request.selectedMethod || 'DIRECT_PURCHASE');

      const requirement = await tx.requirement.create({
        data: {
          requirementNumber: numberSeries('REQ'),
          buyerId,
          organizationId,
          title: `Marketplace ${request.selectedMethod} — Seller #${sellerId}`,
          description: 'Created from procurement checkout wizard.',
          procurementMethod: broadMethodForCanonical(canonicalMethod),
          canonicalMethod,
          status: isAutoApprove ? 'APPROVED' : 'SUBMITTED',
          estimatedValue: totalAmount,
          payload: {
            procurementRequestId: request.id,
            fullProcurementMethod: canonicalMethod,
            checkoutSnapshot: request.cartSnapshot,
            buyerDetails: request.buyerDetails,
            consigneeDetails: request.consigneeDetails,
            deliveryDetails: request.deliveryDetails,
          },
          items: { create: requirementItemsData as never },
        },
      });

      const directPurchase = await tx.directPurchase.create({
        data: {
          requirementId: requirement.id,
          buyerId,
          sellerId,
          purchaseNumber: numberSeries('DP'),
          status: isAutoApprove ? 'APPROVED' : 'PENDING_APPROVAL',
          totalAmount,
          department: String(budgetSanction.department || budgetSanction.budgetHead || ''),
          budgetHead: String(budgetSanction.budgetHead || ''),
          costCenter: String(budgetSanction.costCenter || budgetSanction.budgetHead || ''),
          justification: String((request.declarations as Record<string, unknown>)?.methodJustification || 'Marketplace cart checkout'),
          deliveryAddressText: String(deliveryDetails.deliveryAddress || ''),
          approvalStatus: isAutoApprove ? 'SKIPPED' : 'PENDING_APPROVAL',
          workflowStatus: isAutoApprove ? 'READY_TO_SEND_TO_SELLER' : 'PENDING_APPROVAL',
          approvedAt: isAutoApprove ? new Date() : null,
        },
      });

      if (!isAutoApprove) {
        await createApprovalChain({
          entityType: 'direct_purchase',
          entityId: directPurchase.id,
          organizationId,
          totalValue: totalAmount,
          initiatorUserId: buyerId,
        });
      }

      const poNum = generatePoNumber();

      // Construct a better, more descriptive PO title
      let poTitle = `PO from Procurement Checkout #${request.requestNumber}`;
      if (poItemsData.length > 0) {
        const firstItem = poItemsData[0].itemName;
        if (poItemsData.length === 1) {
          poTitle = `Procurement of ${firstItem}`;
        } else {
          poTitle = `Procurement of ${firstItem} & ${poItemsData.length - 1} other items`;
        }
      }

      // Parse expected delivery date from delivery details (e.g. "30 Days")
      const deliveryPeriodStr = String(deliveryDetails.deliveryPeriod || '30 Days');
      const deliveryDaysMatch = deliveryPeriodStr.match(/(\d+)/);
      const deliveryDays = deliveryDaysMatch ? parseInt(deliveryDaysMatch[1], 10) : 30;
      const expectedDelivery = new Date();
      expectedDelivery.setDate(expectedDelivery.getDate() + deliveryDays);

      const po = await tx.purchaseOrder.create({
        data: {
          poNumber: poNum,
          buyerId,
          sellerId,
          title: poTitle,
          amount: totalAmount,
          totalValue: totalAmount,
          status: 'ORDER_PLACED',
          poStatus: 'GENERATED',
          sourceType: 'procurement_checkout',
          sourceId: request.id,
          purchaseRequestId: request.id,
          deliveryAddress: String(deliveryDetails.deliveryAddress || ''),
          expectedDelivery,
          items: { create: poItemsData as never },
          metadata: {
            procurementRequestId: request.id,
            directPurchaseId: directPurchase.id,
            sellerAcceptance: 'PENDING',
            termsDocuments: request.termsDocuments || null,
          },
        },
      });

      await tx.deliveryWorkflow.create({
        data: { purchaseOrderId: po.id, status: 'created' },
      });

      createdOrders.push({ poId: po.id, poNumber: poNum, sellerId });
      createdDirectPurchases.push(directPurchase.id);

      try {
        await notificationService.notify(sellerId, {
          title: 'New Order — Seller Acceptance Pending',
          message: `Purchase Order ${poNum} requires your acceptance.`,
          type: 'purchase_order_created',
          priority: 'high',
          redirectUrl: '/seller/orders',
        });
      } catch {
        // non-fatal
      }
    }

    await tx.cart.update({
      where: { id: cart.id },
      data: { status: 'CONVERTED_TO_ORDER', convertedAt: new Date() },
    });

    await tx.procurementRequest.update({
      where: { id: request.id },
      data: {
        status: 'CONVERTED_TO_ORDER',
        approvedAt: new Date(),
        cartSnapshot: {
          ...(request.cartSnapshot as object),
          frozenAt: new Date().toISOString(),
          orders: createdOrders,
        },
      },
    });
  }, { timeout: 60000 });

  await auditLog({
    actorUserId: buyerId,
    action: 'procurement.order.generated',
    entityType: 'procurement_request',
    entityId: requestId,
    metadata: { orders: createdOrders, method: request.selectedMethod },
  });

  return { orders: createdOrders, directPurchaseIds: createdDirectPurchases };
};

export const convertCartToBidDraft = async (
  requestId: number,
  organizationId: number,
  buyerId: number
) => {
  const request = await getProcurementRequestForOrg(requestId, organizationId, buyerId);
  validateBudgetSanction(request);

  if (!['BID_FROM_CART', 'RA_FROM_CART', 'PAC_PROCUREMENT'].includes(request.selectedMethod || '')) {
    throw new ApiError(409, 'Request is not configured for bid/RA/PAC conversion.', 'INVALID_METHOD');
  }

  const cartSnap = request.cartSnapshot as { items?: unknown[]; totalValue?: number } | null;
  const draft = await prisma.bidWizardDraft.create({
    data: {
      buyerId,
      bidType: request.selectedMethod === 'RA_FROM_CART' ? 'REVERSE_AUCTION' : request.selectedMethod === 'PAC_PROCUREMENT' ? 'PAC_BID' : 'PRODUCT_BID',
      currentStep: 4,
      formData: {
        fromCart: true,
        cartId: request.cartId,
        procurementRequestId: request.id,
        step2: request.buyerDetails || {},
        step4: { items: cartSnap?.items || [] },
        step5: request.deliveryDetails || {},
        estimatedValue: cartSnap?.totalValue,
        pacJustification: request.pacJustification,
        step7: request.termsDocuments || {},
      },
      draftStatus: 'DRAFT',
    },
  });

  await prisma.procurementRequest.update({
    where: { id: request.id },
    data: { status: 'CONVERTED_TO_BID' },
  });

  await auditLog({
    actorUserId: buyerId,
    action: 'procurement.converted_to_bid',
    entityType: 'procurement_request',
    entityId: request.id,
    metadata: { bidWizardDraftId: draft.id },
  });

  return { bidWizardDraftId: draft.id, redirectPath: `/buyer/create-bid?draft=${draft.id}&fromCart=${request.cartId}` };
};
