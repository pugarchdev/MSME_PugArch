import type { BidType, PacketType, WizardFormData } from '../types/steps';

const required = (value: any) => {
  if (value && typeof value === 'object') {
    const dropdownVal = value.dropdownValue;
    const otherVal = value.otherValue;
    if (dropdownVal === 'Other') {
      return otherVal !== undefined && otherVal !== null && String(otherVal).trim() !== '';
    }
    if (dropdownVal !== undefined && dropdownVal !== null && String(dropdownVal).trim() !== '') {
      return true;
    }
    return false;
  }
  return value !== undefined && value !== null && String(value).trim() !== '';
};

const hasUploadedFiles = (value: any) => {
  if (!Array.isArray(value) || value.length === 0) return false;
  return value.some((item) => {
    if (typeof item === 'number') return item > 0;
    if (item && typeof item === 'object') {
      return Number(item.fileAssetId || item.fileId || item.id) > 0;
    }
    return false;
  });
};

const error = (message: string) => [message];

export const validateStepClient = (step: number, formData: WizardFormData, bidType: BidType | null, packetType: PacketType) => {
  const data = formData[`step${step}` as keyof WizardFormData] || {};
  const errors: Record<string, string[]> = {};
  const need = (field: string, label: string) => {
    if (!required(data[field])) errors[field] = error(`${label} is required`);
  };

  if (step === 1) ['bidType', 'procurementMethod', 'packetType', 'bidCreationMode'].forEach(field => need(field, field));
  if (step === 2) ['organizationName', 'ministry', 'buyerName', 'designation', 'email', 'mobile', 'state', 'district', 'taluka', 'financialYear', 'competentAuthorityName', 'competentAuthorityDesignation'].forEach(field => need(field, field));
  if (step === 3) ['title', 'shortDescription', 'procurementCategory', 'sector', 'estimatedValue', 'procurementPurpose', 'priority', 'publishingDate', 'closingDate', 'validityPeriod'].forEach(field => need(field, field));
  if (step === 4) {
    const common = bidType === 'SERVICE_BID'
      ? ['serviceCategory', 'scopeOfWork', 'serviceLocation', 'contractDuration', 'startDate', 'endDate', 'serviceReportFrequency']
      : bidType === 'CUSTOM_BID'
        ? ['background', 'detailedScopeOfWork', 'deliverables', 'projectTimeline', 'financialProposalFormat', 'evaluationMethod']
        : bidType === 'BOQ_BID'
          ? ['boqTitle', 'boqEntryMode', 'priceQuoteBasis', 'boqValidationStatus']
          : bidType === 'PAC_BID'
            ? ['oemBrandName', 'modelName', 'proprietaryJustification', 'technicalReason', 'alternativesNotSuitableReason']
            : bidType === 'REVERSE_AUCTION'
              ? ['raTriggerStage', 'raDuration', 'minimumDecrementValue', 'raStartPrice', 'eligibleSellersForRa', 'raWinnerRule']
              : ['productCategory', 'productName', 'productDescription', 'quantity', 'unitOfMeasurement', 'technicalSpecification', 'inspectionType', 'deliveryLocation', 'deliveryPeriod'];
    common.forEach(field => need(field, field));
  }
  if (step === 5) ['consigneeType', 'consigneeName', 'consigneeDesignation', 'consigneeMobile', 'deliveryAddress', 'deliveryDistrict', 'pincode', 'deliveryPeriod', 'acceptanceCriteria'].forEach(field => need(field, field));
  if (step === 6) {
    need('evaluationMethod', 'Evaluation method');
    if (!Array.isArray(data.bidderDocuments) || data.bidderDocuments.length === 0) errors.bidderDocuments = error('At least one bidder document is required');
    if (data.emdRequired && !Number(data.emdAmount || 0)) errors.emdAmount = error('EMD amount is required');
    if (packetType === 'TWO_PACKET' && !data.technicalPacket?.technicalEvaluationMethod) errors.technicalPacket = error('Technical packet details are required');
    if (packetType === 'TWO_PACKET' && !hasUploadedFiles(data.technicalPacket?.technicalDocumentUploads)) {
      errors['technicalPacket.technicalDocumentUploads'] = error('Technical packet documents are required');
    }
  }
  if (step === 7) {
    need('paymentTerms', 'Payment terms');
    const requireDocs = (field: string, label: string) => {
      if (!hasUploadedFiles(data[field])) errors[field] = error(`${label} is required`);
    };
    requireDocs('technicalSpecificationDocumentIds', 'Technical Specification Document');
    requireDocs('budgetSanctionDocumentIds', 'Budget Sanction Document');
    requireDocs('administrativeApprovalDocumentIds', 'Administrative Approval Document');
    if (['SERVICE_BID', 'CUSTOM_BID', 'BOQ_BID'].includes(bidType || '')) {
      requireDocs('scopeOfWorkDocumentIds', 'Scope of Work Document');
    }
    if (bidType === 'BOQ_BID') {
      const step4 = formData.step4 || {};
      if (!hasUploadedFiles(data.boqDocumentIds) && !hasUploadedFiles(step4.boqDocumentUploads)) {
        errors.boqDocumentIds = error('BOQ Document is required');
      }
    }
    if (bidType === 'PAC_BID') {
      const step4 = formData.step4 || {};
      if (!hasUploadedFiles(data.pacCertificateDocumentIds) && !hasUploadedFiles(step4.pacCertificateUploads)) {
        errors.pacCertificateDocumentIds = error('PAC Certificate is required');
      }
      if (!hasUploadedFiles(step4.competentAuthorityApprovalUploads)) {
        errors.competentAuthorityApprovalUploads = error('Competent Authority Approval is required');
      }
      if (!hasUploadedFiles(step4.priceReasonabilityDocumentUploads)) {
        errors.priceReasonabilityDocumentUploads = error('Price Reasonability Document is required');
      }
    }
    if (packetType === 'TWO_PACKET' && !data.financialPacket?.financialEvaluationMethod) errors.financialPacket = error('Financial packet details are required');
    if (packetType === 'TWO_PACKET' && !hasUploadedFiles(data.financialPacket?.financialDocumentUploads)) {
      errors['financialPacket.financialDocumentUploads'] = error('Financial packet documents are required');
    }
  }
  if (step === 9) {
    if (!data.buyerDeclarationAccepted) errors.buyerDeclarationAccepted = error('Buyer declaration is required');
    if (!data.restrictiveConditionsDeclarationAccepted) errors.restrictiveConditionsDeclarationAccepted = error('Procurement rules declaration is required');
  }

  return { valid: Object.keys(errors).length === 0, errors };
};
