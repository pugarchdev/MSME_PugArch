import type { CheckoutFormData } from './types';

export const validateStep = (
  step: number,
  form: CheckoutFormData,
  cart?: { items: { quantity: any; unitPrice: any }[] }
): Record<string, string> => {
  const errors: Record<string, string> = {};
  const method = form.selectedMethod;
  const cartTotal = cart?.items.reduce((s, i) => s + Number(i.quantity) * Number(i.unitPrice), 0) ?? 0;

  if (step === 2) {
    if (!form.buyerDetails.organizationName) errors.organizationName = 'Required';
    if (!form.buyerDetails.buyerOfficerName) errors.buyerOfficerName = 'Required';
    if (!form.buyerDetails.email) errors.email = 'Required';
  }

  if (step === 3) {
    if (!form.consigneeDetails.consigneeName) errors.consigneeName = 'Required';
    if (!form.deliveryDetails.deliveryAddress) errors.deliveryAddress = 'Required';
    if (!form.deliveryDetails.pinCode) errors.pinCode = 'Required';
  }

  if (step === 4) {
    if (!form.selectedMethod) errors.selectedMethod = 'Select a procurement method';
  }

  if (step === 5) {
    const budget = form.budgetSanction || {};
    const price = form.priceReasonability || {};

    if (budget.budgetAvailabilityConfirmed !== 'Yes') {
      errors.budgetAvailabilityConfirmed = 'Budget availability must be confirmed before procurement submission.';
    } else {
      if (!budget.financialYear) {
        errors.financialYear = 'Required';
      }

      if (!budget.fundSource) {
        errors.fundSource = 'Required';
      }

      if (!budget.sanctionAmount) {
        errors.sanctionAmount = 'Required';
      } else {
        const sanctionAmt = Number(budget.sanctionAmount);
        if (isNaN(sanctionAmt) || sanctionAmt <= 0) {
          errors.sanctionAmount = 'Amount must be positive';
        } else if (sanctionAmt < cartTotal) {
          errors.sanctionAmount = 'Sanction amount cannot be less than total payable amount.';
        }
      }

      // Budget Approval document is mandatory
      if (!budget.budgetApprovalDocumentId) {
        errors.budgetApprovalDocumentId = 'Budget approval document / fund availability certificate is required.';
      }

      // Sanction order logic
      const sanctionNo = String(budget.sanctionOrderNumber || '').trim();
      if (sanctionNo.length > 0) {
        if (!budget.sanctionDate) {
          errors.sanctionDate = 'Required when sanction order number is entered';
        } else {
          const sDate = new Date(String(budget.sanctionDate));
          if (!isNaN(sDate.getTime()) && sDate > new Date()) {
            errors.sanctionDate = 'Sanction date cannot be in the future';
          }
        }
        if (!budget.approvingAuthority) {
          errors.approvingAuthority = 'Required when sanction order number is entered';
        }
        if (!budget.sanctionOrderDocumentId) {
          errors.sanctionOrderDocumentId = 'Sanction order document upload is required when order number is entered';
        }
      } else {
        // Pending sanction
        if (!budget.approvalNote) {
          errors.approvalNote = 'Approval Note is required since sanction order is pending';
        }
      }
    }

    // Price Reasonability
    if (!price.estimatedPrice) {
      errors.estimatedPrice = 'Required';
    } else {
      const estPrice = Number(price.estimatedPrice);
      if (isNaN(estPrice) || estPrice <= 0) {
        errors.estimatedPrice = 'Price must be positive';
      } else if (Math.abs(estPrice - cartTotal) > 0.01 && !price.estimatedPriceOverrideReason) {
        errors.estimatedPriceOverrideReason = 'Required since estimated price deviates from cart total';
      }
    }

    if (method === 'DIRECT_PURCHASE') {
      if (!price.marketComparisonPrice) {
        errors.marketComparisonPrice = 'Required for Direct Purchase';
      }
      if (!price.priceReasonabilityRemarks) {
        errors.priceReasonabilityRemarks = 'Remarks are required for Direct Purchase';
      }
    } else if (method === 'PAC_PROCUREMENT' || method === 'SINGLE_SOURCE') {
      if (!price.priceReasonabilityRemarks) {
        errors.priceReasonabilityRemarks = `Remarks are mandatory for ${method === 'PAC_PROCUREMENT' ? 'PAC' : 'Single Source'}`;
      }
      // Check for PAC justification document in termsDocuments
      const docs = Array.isArray((form.termsDocuments as any)?.documents) ? (form.termsDocuments as any).documents : [];
      const hasPacDoc = docs.some((d: any) =>
        d.documentType === 'PAC Certificate' ||
        d.documentType === 'Proprietary Article Certificate' ||
        d.documentType === 'Other Supporting Document' ||
        d.documentType === 'Approval Document'
      );
      if (!hasPacDoc) {
        errors.pacCertificate = `${method === 'PAC_PROCUREMENT' ? 'PAC' : 'Single Source'} justification document is required (upload in Step 7)`;
      }
    } else if (method === 'REPEAT_ORDER') {
      if (!price.lastPurchasePrice) {
        errors.lastPurchasePrice = 'Last Purchase Price is required for Repeat Order';
      }
      if (!price.priceReasonabilityRemarks) {
        errors.priceReasonabilityRemarks = 'Remarks are mandatory for Repeat Order';
      }
    }

    // Check negative numbers for other inputs
    ['lastPurchasePrice', 'marketComparisonPrice', 'portalL1Price'].forEach(field => {
      const val = price[field];
      if (val) {
        const num = Number(val);
        if (!isNaN(num) && num < 0) {
          errors[field] = 'Price cannot be negative';
        }
      }
    });
  }

  if (step === 6) {
    if (!form.paymentAuthority.payingAuthorityName) errors.payingAuthorityName = 'Required';
    if (!form.paymentAuthority.paymentMode) errors.paymentMode = 'Required';
  }

  if (step === 8) {
    const d = form.declarations;
    if (!d.specsConfirmed) errors.specsConfirmed = 'Required';
    if (!d.priceReasonabilityConfirmed) errors.priceReasonabilityConfirmed = 'Required';
    if (!d.budgetConfirmed) errors.budgetConfirmed = 'Required';
    if (!d.noDemandSplitConfirmed) errors.noDemandSplitConfirmed = 'Required';
    if (!d.termsAccepted) errors.termsAccepted = 'Required';
  }

  return errors;
};
