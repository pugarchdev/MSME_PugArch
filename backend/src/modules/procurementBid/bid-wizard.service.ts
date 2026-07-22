import prisma from '../../lib/prisma.js';
import { ApiError } from '../../utils/ApiError.js';
import type { AuthRequest } from '../../middleware/auth.js';
import * as procurementBidService from './procurement-bid.service.js';
import {
  sanitizeText,
  validateWizardStep
} from './bid-wizard.validation.js';
import type { BidType, BidWizardFormData, PacketType, StepValidationResult } from './bid-wizard.types.js';

const db = prisma as any;

const BID_TYPE_LABELS: Record<BidType, string> = {
  PRODUCT_BID: 'Product Bid',
  SERVICE_BID: 'Service Bid',
  CUSTOM_BID: 'Custom Bid',
  BOQ_BID: 'BOQ Based Bid',
  BID_WITH_RA: 'Bid with Reverse Auction',
  REVERSE_AUCTION: 'Reverse Auction',
  PAC_BID: 'PAC / Proprietary Bid'
};

const normalizeDate = (value: unknown, fallback: Date) => {
  const date = value ? new Date(String(value)) : fallback;
  return Number.isNaN(date.getTime()) ? fallback : date;
};

const arrayFrom = (value: unknown): string[] => {
  if (!value) return [];
  if (Array.isArray(value)) return value.map(item => String(item)).filter(Boolean);
  return [String(value)].filter(Boolean);
};

const positiveNumberOrUndefined = (value: unknown) => {
  const number = Number(value);
  return Number.isFinite(number) && number >= 0 ? number : undefined;
};

const compact = <T>(items: Array<T | null | undefined | false | ''>): T[] => items.filter(Boolean) as T[];

const asFileAssetIds = (value: unknown): number[] => {
  if (!value) return [];
  if (Array.isArray(value)) {
    return value.flatMap(item => {
      if (typeof item === 'number') return [item];
      if (item && typeof item === 'object') {
        const record = item as Record<string, any>;
        const id = Number(record.fileAssetId || record.fileId || record.id);
        return Number.isFinite(id) && id > 0 ? [id] : [];
      }
      return [];
    });
  }
  const id = Number(value);
  return Number.isFinite(id) && id > 0 ? [id] : [];
};

const collectDocumentSpecs = (formData: BidWizardFormData, bidType: BidType, packetType: PacketType) => {
  const step4 = formData.step4 || {};
  const step6 = formData.step6 || {};
  const step7 = formData.step7 || {};
  const specs = [
    ...asFileAssetIds(step7.technicalSpecificationDocumentIds).map(fileAssetId => ({ fileAssetId, documentType: 'TECHNICAL_SPECIFICATION', visibility: 'PUBLIC' })),
    ...asFileAssetIds(step7.budgetSanctionDocumentIds).map(fileAssetId => ({ fileAssetId, documentType: 'BUDGET_SANCTION', visibility: 'BUYER_ADMIN_ONLY' })),
    ...asFileAssetIds(step7.administrativeApprovalDocumentIds).map(fileAssetId => ({ fileAssetId, documentType: 'ADMINISTRATIVE_APPROVAL', visibility: 'BUYER_ADMIN_ONLY' })),
    ...asFileAssetIds(step7.scopeOfWorkDocumentIds).map(fileAssetId => ({ fileAssetId, documentType: 'SCOPE_OF_WORK', visibility: 'PUBLIC' })),
    ...asFileAssetIds(step7.boqDocumentIds).map(fileAssetId => ({ fileAssetId, documentType: 'BOQ_DOCUMENT', visibility: 'PUBLIC' })),
    ...asFileAssetIds(step7.pacCertificateDocumentIds).map(fileAssetId => ({ fileAssetId, documentType: 'PAC_CERTIFICATE', visibility: 'BUYER_ADMIN_ONLY' })),
    ...asFileAssetIds(step7.drawingDocumentIds).map(fileAssetId => ({ fileAssetId, documentType: 'DRAWINGS_LAYOUTS', visibility: 'PUBLIC' })),
    ...asFileAssetIds(step7.additionalTermDocumentIds).map(fileAssetId => ({ fileAssetId, documentType: 'ADDITIONAL_TERMS', visibility: 'PUBLIC' })),
    ...asFileAssetIds(step4.boqDocumentUploads).map(fileAssetId => ({ fileAssetId, documentType: 'BOQ_DOCUMENT', visibility: 'PUBLIC' })),
    ...asFileAssetIds(step4.pacCertificateUploads).map(fileAssetId => ({ fileAssetId, documentType: 'PAC_CERTIFICATE', visibility: 'BUYER_ADMIN_ONLY' })),
    ...asFileAssetIds(step4.competentAuthorityApprovalUploads).map(fileAssetId => ({ fileAssetId, documentType: 'COMPETENT_AUTHORITY_APPROVAL', visibility: 'BUYER_ADMIN_ONLY' })),
    ...asFileAssetIds(step4.priceReasonabilityDocumentUploads).map(fileAssetId => ({ fileAssetId, documentType: 'PRICE_REASONABILITY', visibility: 'BUYER_ADMIN_ONLY' })),
    ...asFileAssetIds(step6.technicalPacket?.technicalDocumentUploads).map(fileAssetId => ({ fileAssetId, documentType: 'TECHNICAL_PACKET_DOCUMENT', visibility: 'SELLER_AFTER_LOGIN' })),
    ...asFileAssetIds(step7.financialPacket?.financialDocumentUploads).map(fileAssetId => ({ fileAssetId, documentType: 'FINANCIAL_PACKET_DOCUMENT', visibility: 'SELLER_AFTER_LOGIN' })),
    ...asFileAssetIds(step7.financialPacket?.boqPriceSchedule).map(fileAssetId => ({ fileAssetId, documentType: 'FINANCIAL_BOQ_PRICE_SCHEDULE', visibility: 'SELLER_AFTER_LOGIN' })),
  ];

  return specs.filter((spec, index, all) =>
    all.findIndex(other => other.fileAssetId === spec.fileAssetId && other.documentType === spec.documentType) === index
  );
};

const validateRequiredDocumentUploads = (formData: BidWizardFormData, bidType: BidType, packetType: PacketType) => {
  const step4 = formData.step4 || {};
  const step7 = formData.step7 || {};
  const missing = compact([
    asFileAssetIds(step7.technicalSpecificationDocumentIds).length === 0 && 'technicalSpecificationDocumentIds',
    asFileAssetIds(step7.budgetSanctionDocumentIds).length === 0 && 'budgetSanctionDocumentIds',
    asFileAssetIds(step7.administrativeApprovalDocumentIds).length === 0 && 'administrativeApprovalDocumentIds',
    ['SERVICE_BID', 'CUSTOM_BID', 'BOQ_BID'].includes(bidType) && asFileAssetIds(step7.scopeOfWorkDocumentIds).length === 0 && 'scopeOfWorkDocumentIds',
    bidType === 'BOQ_BID' && asFileAssetIds(step4.boqDocumentUploads).length === 0 && asFileAssetIds(step7.boqDocumentIds).length === 0 && 'boqDocumentIds',
    bidType === 'PAC_BID' && asFileAssetIds(step4.pacCertificateUploads).length === 0 && asFileAssetIds(step7.pacCertificateDocumentIds).length === 0 && 'pacCertificateDocumentIds',
    bidType === 'PAC_BID' && asFileAssetIds(step4.competentAuthorityApprovalUploads).length === 0 && 'competentAuthorityApprovalUploads',
    bidType === 'PAC_BID' && asFileAssetIds(step4.priceReasonabilityDocumentUploads).length === 0 && 'priceReasonabilityDocumentUploads',
    packetType === 'TWO_PACKET' && asFileAssetIds(formData.step6?.technicalPacket?.technicalDocumentUploads).length === 0 && 'technicalPacket.technicalDocumentUploads',
    packetType === 'TWO_PACKET' && asFileAssetIds(step7.financialPacket?.financialDocumentUploads).length === 0 && 'financialPacket.financialDocumentUploads',
  ]);
  return missing;
};

const attachDraftDocumentsToBid = async (req: AuthRequest, bidId: number, formData: BidWizardFormData, bidType: BidType, packetType: PacketType) => {
  const specs = collectDocumentSpecs(formData, bidType, packetType);
  if (!specs.length) return [];
  const rows = [];

  for (const spec of specs) {
    const asset = await db.fileAsset.findUnique({ where: { id: spec.fileAssetId } });
    if (!asset) throw new ApiError(400, `Uploaded document ${spec.fileAssetId} was not found.`, 'FILE_ASSET_NOT_FOUND');
    if (asset.ownerId !== req.user!.id && req.user!.role !== 'admin' && req.user!.role !== 'master_admin') {
      throw new ApiError(403, 'You cannot attach another user document.', 'FORBIDDEN_FILE_ASSET');
    }
    rows.push(await db.procurementBidDocument.create({
      data: {
        bidId,
        documentType: spec.documentType,
        fileAssetId: asset.id,
        fileName: asset.originalName,
        fileUrl: asset.url || `/api/files/${asset.id}/view`,
        fileKey: asset.key,
        mimeType: asset.mimeType,
        fileSize: asset.size,
        uploadedById: req.user!.id,
        visibility: spec.visibility
      }
    }));
  }

  return rows;
};

export const resolveOtherValues = (value: unknown): unknown => {
  if (Array.isArray(value)) return value.map(resolveOtherValues);
  if (value && typeof value === 'object') {
    const record = value as Record<string, any>;
    if (typeof record.dropdownValue === 'string') {
      if (record.dropdownValue === 'Other' && typeof record.otherValue === 'string') {
        return record.otherValue.trim();
      }
      if (record.dropdownValue !== 'Other') {
        return record.dropdownValue.trim();
      }
    }
    return Object.fromEntries(Object.entries(record).map(([key, nested]) => [key, resolveOtherValues(nested)]));
  }
  return value;
};

const DOCUMENT_FIELD_LABELS: Record<string, string> = {
  technicalSpecificationDocumentIds: 'Technical Specification Document',
  budgetSanctionDocumentIds: 'Budget Sanction Document',
  administrativeApprovalDocumentIds: 'Administrative Approval Document',
  scopeOfWorkDocumentIds: 'Scope of Work Document',
  boqDocumentIds: 'BOQ Document',
  pacCertificateDocumentIds: 'PAC Certificate',
  competentAuthorityApprovalUploads: 'Competent Authority Approval',
  priceReasonabilityDocumentUploads: 'Price Reasonability Document',
  'technicalPacket.technicalDocumentUploads': 'Technical packet documents',
  'financialPacket.financialDocumentUploads': 'Financial packet documents',
};

const documentValidationErrors = (missingFields: string[]) =>
  Object.fromEntries(
    missingFields.map((field) => [
      field,
      [`${DOCUMENT_FIELD_LABELS[field] || field} is required`],
    ])
  );

export const assertDraftOwner = async (draftId: number, buyerId: number) => {
  const draft = await db.bidWizardDraft.findUnique({ where: { id: draftId } });
  if (!draft) throw new ApiError(404, 'Bid wizard draft not found', 'DRAFT_NOT_FOUND');
  if (draft.buyerId !== buyerId) {
    throw new ApiError(403, 'You cannot access another buyer draft.', 'FORBIDDEN_ROLE');
  }
  return draft;
};

export const createDraft = async (buyerId: number, bidType: BidType, initialData: Record<string, any> = {}) => {
  const normalized = sanitizeText(resolveOtherValues(initialData)) as Record<string, any>;
  const formData = {
    ...normalized,
    step1: {
      ...(normalized.step1 || {}),
      bidType
    }
  };

  return db.bidWizardDraft.create({
    data: {
      buyerId,
      bidType,
      currentStep: 1,
      completedSteps: [],
      formData,
      validationState: {},
      lastSavedAt: new Date(),
      draftStatus: 'DRAFT'
    }
  });
};

export const getDraft = async (draftId: number, buyerId: number) => assertDraftOwner(draftId, buyerId);

export const updateDraft = async (
  draftId: number,
  buyerId: number,
  step: number | undefined,
  formData: Record<string, any>,
  validationState: Record<string, any> | null | undefined,
  completedSteps: number[] | undefined
) => {
  const draft = await assertDraftOwner(draftId, buyerId);
  if (draft.draftStatus !== 'DRAFT') {
    throw new ApiError(400, 'Only draft bid wizard records can be updated.', 'DRAFT_LOCKED');
  }
  const mergedFormData = sanitizeText(resolveOtherValues({
    ...(draft.formData || {}),
    ...(formData || {})
  }));
  const currentStep = step || draft.currentStep || 1;

  return db.bidWizardDraft.update({
    where: { id: draft.id },
    data: {
      currentStep,
      formData: mergedFormData,
      validationState: validationState ?? draft.validationState ?? {},
      completedSteps: completedSteps || draft.completedSteps || [],
      lastSavedAt: new Date()
    }
  });
};

export const validateStep = (step: number, formData: Record<string, any>, bidType?: BidType, packetType?: PacketType): StepValidationResult => {
  const resolvedFormData = resolveOtherValues(formData) as Record<string, any>;
  const payload = resolvedFormData[`step${step}`] || resolvedFormData;
  const inferredBidType = (bidType || resolvedFormData?.step1?.bidType || payload?.bidType) as BidType;
  const inferredPacketType = (packetType || resolvedFormData?.step1?.packetType || payload?.packetType) as PacketType;
  const result = validateWizardStep(step, payload, inferredBidType, inferredPacketType);
  if (!result.valid) return result;

  const missingDocuments = validateRequiredDocumentUploads(resolvedFormData as BidWizardFormData, inferredBidType, inferredPacketType);
  if (missingDocuments.length === 0) return result;

  const stepDocumentFields: Record<number, string[]> = {
    4: ['boqDocumentIds', 'pacCertificateDocumentIds', 'competentAuthorityApprovalUploads', 'priceReasonabilityDocumentUploads'],
    6: ['technicalPacket.technicalDocumentUploads'],
    7: [
      'technicalSpecificationDocumentIds',
      'budgetSanctionDocumentIds',
      'administrativeApprovalDocumentIds',
      'scopeOfWorkDocumentIds',
      'boqDocumentIds',
      'pacCertificateDocumentIds',
      'competentAuthorityApprovalUploads',
      'priceReasonabilityDocumentUploads',
      'financialPacket.financialDocumentUploads',
    ],
  };

  const relevantMissing = missingDocuments.filter((field) => (stepDocumentFields[step] || []).includes(field));
  if (relevantMissing.length === 0) return result;

  return {
    valid: false,
    errors: documentValidationErrors(relevantMissing),
  };
};

export const validateAllSteps = (formData: BidWizardFormData, bidType: BidType, packetType: PacketType) => {
  const errors: Record<string, Record<string, string[]>> = {};
  for (let step = 1; step <= 9; step += 1) {
    const result = validateStep(step, formData, bidType, packetType);
    if (!result.valid) errors[String(step)] = result.errors;
  }
  const missingDocuments = validateRequiredDocumentUploads(formData, bidType, packetType);
  if (missingDocuments.length > 0) {
    errors['7'] = {
      ...(errors['7'] || {}),
      ...documentValidationErrors(missingDocuments),
    };
  }
  const totalQuantity = Number(formData.step4?.quantity || 0);
  if (formData.step5?.consigneeType === 'MULTIPLE' && totalQuantity > 0) {
    const allocated = (formData.step5.multipleConsignees || []).reduce((sum: number, row: any) => sum + Number(row.quantity || 0), 0);
    if (allocated !== totalQuantity) {
      errors['5'] = {
        ...(errors['5'] || {}),
        multipleConsignees: [`Consignee quantity allocation (${allocated}) must equal item quantity (${totalQuantity})`]
      };
    }
  }
  return {
    valid: Object.keys(errors).length === 0,
    errors
  };
};

export const compilePreview = async (draftId: number, buyerId: number) => {
  const draft = await assertDraftOwner(draftId, buyerId);
  const formData = resolveOtherValues(draft.formData || {}) as BidWizardFormData;
  const step1 = formData.step1 || {};
  const bidType = (step1.bidType || draft.bidType) as BidType;
  const packetType = (step1.packetType || 'SINGLE_PACKET') as PacketType;
  const validation = validateAllSteps(formData, bidType, packetType);

  return {
    draftId: draft.id,
    bidType,
    bidTypeLabel: BID_TYPE_LABELS[bidType],
    packetType,
    currentStep: draft.currentStep,
    completedSteps: draft.completedSteps || [],
    lastSavedAt: draft.lastSavedAt,
    valid: validation.valid,
    validationErrors: validation.errors,
    steps: formData
  };
};

const transformDraftToProcurementBidPayload = async (draft: any, buyerId: number) => {
  const formData = resolveOtherValues(draft.formData || {}) as BidWizardFormData;
  const step1 = formData.step1 || {};
  const step2 = formData.step2 || {};
  const step3 = formData.step3 || {};
  const step4 = formData.step4 || {};
  const step5 = formData.step5 || {};
  const step6 = formData.step6 || {};
  const step7 = formData.step7 || {};
  const step8 = formData.step8 || {};
  const bidType = (step1.bidType || draft.bidType) as BidType;
  const packetType = (step1.packetType || 'SINGLE_PACKET') as PacketType;
  const now = new Date();
  const startDate = normalizeDate(step3.publishingDate, now);
  const endDate = normalizeDate(step3.closingDate, new Date(Date.now() + 7 * 24 * 60 * 60 * 1000));
  const validityDays = Number(String(step3.validityPeriod || '').match(/\d+/)?.[0] || 90);
  const bidValidityDate = new Date(endDate.getTime() + validityDays * 24 * 60 * 60 * 1000);
  const buyer = await db.user.findUnique({
    where: { id: buyerId },
    include: { buyerProfile: true, organization: true }
  });

  const eligibilityCriteria = [
    step6.minimumExperienceRequired ? `Minimum experience: ${step6.minimumExperience || 'Required'}` : '',
    step6.minimumTurnoverRequired ? `Minimum turnover: ${step6.minimumTurnover || 'Required'}` : '',
    step6.similarWorkExperienceRequired ? `Similar work experience count: ${step6.similarWorkCount || 'Required'}` : '',
    ...arrayFrom(step6.bidderDocuments),
    step6.msePreference ? 'MSE preference applicable' : '',
    step6.makeInIndiaPreference ? 'Make in India / local content preference applicable' : '',
    step6.blacklistingDeclarationRequired ? 'Blacklisting declaration required' : '',
    step6.conflictOfInterestDeclarationRequired ? 'Conflict of interest declaration required' : ''
  ].filter(Boolean);

  const requiredDocuments = [
    'Technical Specification Document',
    'Budget Sanction Document',
    'Administrative Approval Document',
    bidType === 'SERVICE_BID' || bidType === 'CUSTOM_BID' || bidType === 'BOQ_BID' ? 'Scope of Work' : '',
    bidType === 'BOQ_BID' ? 'BOQ Document' : '',
    bidType === 'PAC_BID' ? 'PAC Certificate' : '',
    ...(step7.documentUploads || []).map((doc: any) => doc.documentType || doc.name || '').filter(Boolean)
  ].filter(Boolean);

  const termsAndConditions = [
    `Payment terms: ${step7.paymentTerms || 'Not specified'}`,
    step7.advancePaymentAllowed ? 'Advance payment allowed' : 'Advance payment not allowed',
    step7.partPaymentAllowed ? 'Part payment allowed' : 'Part payment not allowed',
    step7.gstInvoiceRequired ? 'GST invoice required' : 'GST invoice not required',
    step8.corrigendumAllowed ? 'Corrigendum allowed' : 'Corrigendum not allowed',
    step8.clarificationWindowRequired ? 'Clarification window required' : 'Clarification window not required',
    step8.splittingQuantityAllowed ? 'Splitting quantity allowed' : 'Splitting quantity not allowed',
    step8.rateContractRequired ? 'Rate contract required' : 'Rate contract not required'
  ];

  let items: any[] = [];
  if (bidType === 'BOQ_BID' && Array.isArray(step4.lineItems)) {
    items = step4.lineItems.map((item: any, idx: number) => ({
      id: idx + 1,
      itemName: item.itemName || item.name || item.title || item.itemDescription || `BOQ Item ${idx + 1}`,
      description: item.description || item.specifications || '',
      quantity: Number(item.quantity) || 1,
      unitOfMeasure: item.unit || item.unitOfMeasure || item.uom || 'Nos',
      estimatedUnitPrice: positiveNumberOrUndefined(item.estimatedUnitPrice || item.unitPrice || item.rate),
      estimatedTotal: positiveNumberOrUndefined(item.estimatedTotal || item.totalPrice || item.amount),
      technicalSpecification: item.technicalSpecification || item.specifications,
      brand: item.brand,
      make: item.make,
      model: item.model,
      hsn: item.hsn,
      sac: item.sac,
      warranty: item.warranty,
      deliverySchedule: item.deliverySchedule
    }));
  } else if (bidType === 'PRODUCT_BID') {
    items = [{
      id: 1,
      itemName: step4.productName || 'Product',
      description: step4.productDescription || step4.technicalSpecification || '',
      quantity: Number(step4.quantity) || 1,
      unitOfMeasure: step4.unitOfMeasurement || 'Nos',
      technicalSpecification: step4.technicalSpecification,
      brand: step4.brand,
      make: step4.make,
      model: step4.model,
      hsn: step4.hsnCode || step4.hsn,
      warranty: step4.warranty,
      deliverySchedule: step4.deliverySchedule
    }];
  } else if (bidType === 'SERVICE_BID') {
    items = [{
      id: 1,
      itemName: step4.serviceCategory || 'Service',
      description: step4.scopeOfWork || '',
      quantity: Number(step4.numberOfPersonnel) || 1,
      unitOfMeasure: 'Months/Persons',
      sac: step4.sacCode || step4.sac,
      deliverySchedule: step4.deliverySchedule
    }];
  } else {
    items = [{
      id: 1,
      itemName: step3.title || 'Sourcing Item',
      description: step4.detailedScopeOfWork || step4.proprietaryJustification || step3.shortDescription || '',
      quantity: Number(step4.quantity) || 1,
      unitOfMeasure: step4.unitOfMeasurement || 'Lot'
    }];
  }

  return {
    title: step3.title,
    description: step3.shortDescription,
    buyerOrganizationName: step2.organizationName || buyer?.organization?.organizationName || buyer?.buyerProfile?.organizationName,
    buyerType: step2.ministry || buyer?.buyerProfile?.organizationType || 'Government / Department Buyer',
    category: step3.procurementCategory,
    subCategory: step3.sector,
    bidType: BID_TYPE_LABELS[bidType],
    procurementType: step1.procurementMethod,
    quantity: positiveNumberOrUndefined(step4.quantity),
    unit: step4.unitOfMeasurement || step4.unit,
    estimatedValue: positiveNumberOrUndefined(step3.estimatedValue),
    deliveryLocation: step5.deliveryAddress || step4.deliveryLocation || step5.deliveryDistrict,
    state: step2.state,
    district: step5.deliveryDistrict || step2.district,
    pincode: step5.pincode,
    startDate,
    endDate,
    technicalOpeningDate: packetType === 'TWO_PACKET' ? normalizeDate(step3.technicalOpeningDate, endDate) : undefined,
    financialOpeningDate: packetType === 'TWO_PACKET' ? normalizeDate(step3.financialOpeningDate, new Date(endDate.getTime() + 24 * 60 * 60 * 1000)) : undefined,
    bidValidityDate,
    evaluationMethod: step6.evaluationMethod || step4.evaluationMethod || 'L1',
    isEmdRequired: Boolean(step6.emdRequired),
    emdAmount: positiveNumberOrUndefined(step6.emdAmount),
    documentFee: 0,
    allowClarification: Boolean(step8.sellerQueryAllowed || step8.clarificationWindowRequired),
    allowReverseAuction: Boolean(step1.isReverseAuctionRequired || bidType === 'BID_WITH_RA' || bidType === 'REVERSE_AUCTION'),
    allowBoq: Boolean(bidType === 'BOQ_BID'),
    packetType,
    technicalPacket: {
      ...(packetType === 'TWO_PACKET' ? (step6.technicalPacket || {}) : {}),
      items,
      wizardData: {
        procurementMethod: step1.procurementMethod,
        bidType: BID_TYPE_LABELS[bidType] || bidType,
        packetType: packetType,
        preBidMeetingRequired: step8.preBidMeetingRequired,
        preBidMeetingDate: step8.preBidMeetingDate || step3.preBidDate || null,
        preBidMode: step3.preBidMode || null,
        preBidVenue: step3.preBidVenue || null,
        siteVisitRequired: step8.siteVisitRequired,
        consigneeType: step5.consigneeType || null,
        consigneeName: step5.consigneeName || null,
        consigneeDesignation: step5.consigneeDesignation || null,
        consigneeMobile: step5.consigneeMobile || null,
        consigneeEmail: step5.consigneeEmail || null,
        multipleConsignees: step5.multipleConsignees || [],
        installationSiteSame: step5.installationSiteSame ?? true,
        delayPenaltyApplicable: step5.delayPenaltyApplicable ?? false,
        installationAddress: step5.installationAddress || null,
        inspectionOfficer: step5.inspectionOfficer || null,
        penaltyDetails: step5.penaltyDetails || null,
        acceptanceCriteria: step5.acceptanceCriteria || null,
        deliveryPeriod: step5.deliveryPeriod || null,
        cancellationAllowedBeforeClosing: step8.cancellationAllowedBeforeClosing ?? false,
        sellerQueryAllowed: step8.sellerQueryAllowed ?? false,
        documentResubmissionAllowed: step8.documentResubmissionAllowed ?? false,
        multipleAwardAllowed: step8.multipleAwardAllowed ?? false,
        raTriggerStage: step4.raTriggerStage || null,
        raDuration: step4.raDuration || null,
        minimumDecrementValue: step4.minimumDecrementValue || null,
        raStartPrice: step4.raStartPrice || null,
        eligibleSellersForRa: step4.eligibleSellersForRa || null,
        raWinnerRule: step4.raWinnerRule || null,
        makeInIndiaPreference: step6.makeInIndiaPreference ?? false,
        msePreference: step6.msePreference ?? false,
        blacklistingDeclarationRequired: step6.blacklistingDeclarationRequired ?? true,
        conflictOfInterestDeclarationRequired: step6.conflictOfInterestDeclarationRequired ?? true,
        pbgRequired: step6.pbgRequired ?? false,
        pbgPercentage: step6.pbgPercentage || null,
        paymentTerms: step7.paymentTerms || null,
        gstInvoiceRequired: step7.gstInvoiceRequired ?? true,
        advancePaymentAllowed: step7.advancePaymentAllowed ?? false,
        partPaymentAllowed: step7.partPaymentAllowed ?? false,
        ewayBillRequired: step7.ewayBillRequired ?? false,
        invoiceRequired: step7.invoiceRequired ?? false,
        clarificationWindowRequired: step8.clarificationWindowRequired ?? false,
        corrigendumAllowed: step8.corrigendumAllowed ?? false,
        rateContractRequired: step8.rateContractRequired ?? false,
        splittingQuantityAllowed: step8.splittingQuantityAllowed ?? false,
        experienceRequired: step6.experienceRequired,
        turnoverRequired: step6.turnoverRequired,
        similarWorkRequired: step6.similarWorkRequired,
        buyerName: step2.buyerName || null,
        buyerDesignation: step2.designation || null,
        buyerEmail: step2.email || null,
        buyerMobile: step2.mobile || null,
        buyerAddress: step2.officeAddress || null,
        taluka: step2.taluka || null,
        villageOrCity: step2.villageOrCity || null,
        financialYear: step2.financialYear || null,
        departmentFileNumber: step2.departmentFileNumber || null,
        departmentReferenceNumber: step2.departmentReferenceNumber || null,
        competentAuthorityName: step2.competentAuthorityName || null,
        competentAuthorityDesignation: step2.competentAuthorityDesignation || null,
        budgetHead: step3.budgetHead || null,
        procurementPurpose: step3.procurementPurpose || null,
        priority: step3.priority || null,
      }
    },
    financialPacket: packetType === 'TWO_PACKET' ? step7.financialPacket || null : null,
    termsAndConditions,
    eligibilityCriteria,
    requiredDocuments
  };
};

export const submitBid = async (req: AuthRequest, draftId: number, submitForApproval = true) => {
  const draft = await assertDraftOwner(draftId, req.user!.id);
  if (draft.draftStatus !== 'DRAFT') {
    throw new ApiError(400, 'This draft has already been submitted or cancelled.', 'DRAFT_LOCKED');
  }
  const formData = resolveOtherValues(draft.formData || {}) as BidWizardFormData;
  const bidType = (formData.step1?.bidType || draft.bidType) as BidType;
  const packetType = (formData.step1?.packetType || 'SINGLE_PACKET') as PacketType;
  const validation = validateAllSteps(formData, bidType, packetType);
  if (!validation.valid) {
    await db.bidWizardDraft.update({
      where: { id: draft.id },
      data: { validationState: validation.errors, lastSavedAt: new Date() }
    });
    throw new ApiError(400, 'Bid wizard draft has validation errors.', 'VALIDATION_FAILED', validation.errors);
  }

  const payload = await transformDraftToProcurementBidPayload(draft, req.user!.id);
  const bid = await procurementBidService.createBuyerBid(req, payload);
  const attachedDocuments = await attachDraftDocumentsToBid(req, bid.id, formData, bidType, packetType);
  const submittedBid = await procurementBidService.submitForApproval(req, String(bid.id));

  await db.bidWizardDraft.update({
    where: { id: draft.id },
    data: {
      draftStatus: 'SUBMITTED',
      currentStep: 9,
      completedSteps: [1, 2, 3, 4, 5, 6, 7, 8, 9],
      validationState: {},
      lastSavedAt: new Date()
    }
  });

  await procurementBidService.procurementAudit(req, 'BID_WIZARD_SUBMITTED', 'BidWizardDraft', draft.id, {
    procurementBidId: submittedBid.id,
    bidType,
    packetType
  });

  return {
    draftId: draft.id,
    procurementBid: submittedBid,
    attachedDocuments,
    requestedAction: submitForApproval ? 'SUBMIT_FOR_APPROVAL' : 'PUBLISH_IF_ALLOWED'
  };
};

export const deleteDraft = async (draftId: number, buyerId: number) => {
  const draft = await assertDraftOwner(draftId, buyerId);
  if (draft.draftStatus !== 'DRAFT') {
    return db.bidWizardDraft.update({
      where: { id: draft.id },
      data: { draftStatus: 'CANCELLED', lastSavedAt: new Date() }
    });
  }
  return db.bidWizardDraft.delete({ where: { id: draft.id } });
};
