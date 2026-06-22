import prisma from '../../config/prisma.js';
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
    ...asFileAssetIds(step6.technicalPacket?.technicalDocumentUploads).map(fileAssetId => ({ fileAssetId, documentType: 'TECHNICAL_PACKET_DOCUMENT', visibility: 'BUYER_ADMIN_ONLY' })),
    ...asFileAssetIds(step7.financialPacket?.financialDocumentUploads).map(fileAssetId => ({ fileAssetId, documentType: 'FINANCIAL_PACKET_DOCUMENT', visibility: 'BUYER_ADMIN_ONLY' })),
    ...asFileAssetIds(step7.financialPacket?.boqPriceSchedule).map(fileAssetId => ({ fileAssetId, documentType: 'FINANCIAL_BOQ_PRICE_SCHEDULE', visibility: 'BUYER_ADMIN_ONLY' })),
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
    if (record.dropdownValue === 'Other' && typeof record.otherValue === 'string') {
      return record.otherValue.trim();
    }
    return Object.fromEntries(Object.entries(record).map(([key, nested]) => [key, resolveOtherValues(nested)]));
  }
  return value;
};

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
  const inferredBidType = bidType || resolvedFormData?.step1?.bidType || payload?.bidType;
  const inferredPacketType = packetType || resolvedFormData?.step1?.packetType || payload?.packetType;
  return validateWizardStep(step, payload, inferredBidType, inferredPacketType);
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
      ...Object.fromEntries(missingDocuments.map(field => [field, ['Required document upload is missing']]))
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
    technicalPacket: packetType === 'TWO_PACKET' ? step6.technicalPacket || null : null,
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
