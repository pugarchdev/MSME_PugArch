import { z } from 'zod';
import type { BidType, PacketType, StepValidationResult } from './bid-wizard.types.js';

export const bidTypeSchema = z.enum([
  'PRODUCT_BID',
  'SERVICE_BID',
  'CUSTOM_BID',
  'BOQ_BID',
  'BID_WITH_RA',
  'REVERSE_AUCTION',
  'PAC_BID'
]);

export const packetTypeSchema = z.enum(['SINGLE_PACKET', 'TWO_PACKET']);

const requiredString = (label: string, max = 4000) =>
  z.string().trim().min(1, `${label} is required`).max(max, `${label} is too long`);

const optionalString = (max = 4000) => z.string().trim().max(max).optional().or(z.literal(''));
const yesNoBoolean = z.boolean();
const booleanWithDefault = z.boolean().optional().default(false);
const fileIds = z.preprocess((value) => {
  if (!Array.isArray(value)) return value;
  return value.map((item) => {
    if (typeof item === 'number') return item;
    if (item && typeof item === 'object') {
      const record = item as Record<string, any>;
      return record.fileAssetId || record.fileId || record.id;
    }
    return item;
  });
}, z.array(z.coerce.number().int().positive()).optional().default([]));

export const createDraftSchema = z.object({
  bidType: bidTypeSchema,
  initialData: z.record(z.string(), z.any()).optional().default({})
});

export const updateDraftSchema = z.object({
  currentStep: z.coerce.number().int().min(1).max(9).optional(),
  step: z.coerce.number().int().min(1).max(9).optional(),
  formData: z.record(z.string(), z.any()).optional().default({}),
  validationState: z.record(z.string(), z.any()).nullable().optional(),
  completedSteps: z.array(z.coerce.number().int().min(1).max(9)).optional().default([])
});

export const validateStepRequestSchema = z.object({
  step: z.coerce.number().int().min(1).max(9),
  formData: z.record(z.string(), z.any()).default({}),
  bidType: bidTypeSchema.optional(),
  packetType: packetTypeSchema.optional()
});

export const submitDraftSchema = z.object({
  draftId: z.coerce.number().int().positive(),
  submitForApproval: z.boolean().optional().default(true)
});

export const step1Schema = z.object({
  bidType: bidTypeSchema,
  procurementMethod: z.enum(['DIRECT_PURCHASE', 'L1_PURCHASE', 'E_BID', 'E_BID_WITH_RA', 'REVERSE_AUCTION', 'PAC_PROCUREMENT', 'LIMITED_TENDER', 'RFQ']),
  packetType: packetTypeSchema,
  isReverseAuctionRequired: yesNoBoolean,
  isPacRequired: yesNoBoolean,
  bidCreationMode: z.enum(['FRESH_BID', 'RE_BID', 'CORRIGENDUM', 'CANCELLED_RECREATED'])
});

export const step2Schema = z.object({
  organizationName: requiredString('Organization name', 220),
  ministry: requiredString('Ministry', 180),
  buyerName: requiredString('Buyer name', 160),
  designation: requiredString('Designation', 160),
  email: z.string().trim().email('Valid email is required'),
  mobile: requiredString('Mobile', 30),
  officeAddress: optionalString(1000),
  state: requiredString('State', 80),
  district: requiredString('District', 80),
  taluka: requiredString('Taluka', 80),
  villageOrCity: optionalString(120),
  financialYear: requiredString('Financial year', 20),
  departmentFileNumber: optionalString(120),
  departmentReferenceNumber: optionalString(120),
  competentAuthorityName: requiredString('Competent authority name', 160),
  competentAuthorityDesignation: requiredString('Competent authority designation', 160)
});

export const step3Schema = z.object({
  title: requiredString('Bid title', 220),
  shortDescription: requiredString('Short description', 4000),
  procurementCategory: requiredString('Procurement category', 120),
  sector: requiredString('Sector', 120),
  estimatedValue: z.coerce.number().positive('Estimated bid value is required'),
  budgetConfirmed: yesNoBoolean,
  budgetHead: optionalString(180),
  procurementPurpose: requiredString('Procurement purpose', 4000),
  priority: requiredString('Priority', 40),
  publishingDate: z.coerce.date(),
  closingDate: z.coerce.date(),
  validityPeriod: requiredString('Bid validity period', 80),
  preBidMeetingRequired: z.boolean().optional().default(false),
  preBidDate: z.coerce.date().optional(),
  preBidMode: optionalString(80),
  preBidVenue: optionalString(220)
}).refine(data => data.closingDate > data.publishingDate, {
  path: ['closingDate'],
  message: 'Closing date must be after publishing date'
});

export const step4ProductSchema = z.object({
  productCategory: requiredString('Product category', 160),
  productName: requiredString('Product name', 220),
  productDescription: requiredString('Product description', 4000),
  quantity: z.coerce.number().positive('Quantity is required'),
  unitOfMeasurement: requiredString('Unit of measurement', 40),
  technicalSpecification: requiredString('Technical specification', 8000),
  specificationFormat: requiredString('Specification format', 120),
  brandRestriction: requiredString('Brand restriction', 160),
  warrantyRequired: booleanWithDefault,
  installationRequired: booleanWithDefault,
  testingCommissioningRequired: booleanWithDefault,
  inspectionType: requiredString('Inspection type', 120),
  deliveryLocation: optionalString(400),
  deliveryPeriod: optionalString(120)
});

export const step4ServiceSchema = z.object({
  serviceCategory: requiredString('Service category', 160),
  scopeOfWork: requiredString('Scope of work', 8000),
  serviceLocation: requiredString('Service location', 400),
  contractDuration: requiredString('Contract duration', 120),
  startDate: z.coerce.date(),
  endDate: z.coerce.date(),
  manpowerRequired: booleanWithDefault,
  numberOfPersonnel: z.coerce.number().positive().optional(),
  skillLevel: optionalString(120),
  workingHours: optionalString(120),
  shiftType: optionalString(120),
  slaRequired: booleanWithDefault,
  slaDetails: optionalString(4000),
  statutoryComplianceRequired: booleanWithDefault,
  serviceReportFrequency: requiredString('Service report frequency', 120)
}).refine(data => data.endDate > data.startDate, {
  path: ['endDate'],
  message: 'End date must be after start date'
});

export const step4CustomSchema = z.object({
  background: requiredString('Background/problem statement', 8000),
  detailedScopeOfWork: requiredString('Detailed scope of work', 8000),
  deliverables: requiredString('Deliverables', 4000),
  projectTimeline: requiredString('Project timeline', 400),
  milestonesRequired: booleanWithDefault,
  technicalProposalRequired: booleanWithDefault,
  financialProposalFormat: requiredString('Financial proposal format', 120),
  evaluationMethod: requiredString('Evaluation method', 120)
});

export const step4BoqSchema = z.object({
  boqTitle: requiredString('BOQ title', 220),
  boqEntryMode: z.enum(['UPLOAD', 'MANUAL']),
  boqDocumentUploads: fileIds,
  lineItems: z.array(z.record(z.string(), z.any())).optional().default([]),
  priceQuoteBasis: requiredString('Price quote basis', 120),
  gstApplicable: z.boolean().optional().default(true),
  boqValidationStatus: requiredString('BOQ validation status', 120)
}).refine(data => data.boqEntryMode === 'UPLOAD' ? data.boqDocumentUploads.length > 0 : data.lineItems.length > 0, {
  path: ['lineItems'],
  message: 'BOQ upload or manual line items are required'
});

export const step4PacSchema = z.object({
  oemBrandName: requiredString('OEM/brand name', 220),
  modelName: requiredString('Model/product code', 220),
  proprietaryJustification: requiredString('Proprietary justification', 8000),
  technicalReason: requiredString('Technical reason for PAC', 8000),
  alternativeProductAnalysisDone: booleanWithDefault,
  alternativesNotSuitableReason: requiredString('Alternative analysis reason', 8000),
  pacCertificateUploads: fileIds,
  competentAuthorityApprovalUploads: fileIds,
  priceReasonabilityDocumentUploads: fileIds
});

export const reverseAuctionFieldsSchema = z.object({
  raTriggerStage: requiredString('RA trigger stage', 120),
  raDuration: requiredString('RA duration', 120),
  autoExtensionRequired: booleanWithDefault,
  minimumDecrementValue: z.coerce.number().positive('Minimum decrement is required'),
  raStartPrice: z.coerce.number().positive('RA start price is required'),
  eligibleSellersForRa: requiredString('Eligible sellers for RA', 1000),
  raWinnerRule: requiredString('RA winner rule', 400)
});

export const step5Schema = z.object({
  consigneeType: z.enum(['SINGLE', 'MULTIPLE']),
  consigneeName: requiredString('Consignee name', 160),
  consigneeDesignation: requiredString('Consignee designation', 160),
  consigneeMobile: requiredString('Consignee mobile', 30),
  deliveryAddress: requiredString('Delivery address', 800),
  deliveryDistrict: requiredString('Delivery district', 80),
  pincode: requiredString('PIN code', 12),
  deliveryPeriod: requiredString('Delivery period', 120),
  acceptanceCriteria: requiredString('Acceptance criteria', 4000),
  multipleConsignees: z.array(z.record(z.string(), z.any())).optional().default([]),
  installationSiteSame: z.boolean().optional().default(true),
  installationAddress: optionalString(800),
  inspectionOfficer: optionalString(160),
  delayPenaltyApplicable: z.boolean().optional().default(false),
  penaltyDetails: optionalString(1000)
}).refine(data => data.consigneeType !== 'MULTIPLE' || data.multipleConsignees.length > 0, {
  path: ['multipleConsignees'],
  message: 'At least one consignee row is required'
}).refine(data => data.consigneeType !== 'MULTIPLE' || data.multipleConsignees.every((row: any) => String(row.name || '').trim() && Number(row.quantity || 0) > 0), {
  path: ['multipleConsignees'],
  message: 'Each consignee must include name and quantity'
});

export const technicalPacketSchema = z.object({
  technicalEligibilityCriteria: z.array(requiredString('Technical eligibility criterion')).min(1),
  minimumExperience: optionalString(120),
  minimumTurnover: z.coerce.number().nonnegative().optional(),
  similarWorkExperience: optionalString(500),
  certifications: z.array(z.string()).optional().default([]),
  technicalProposalRequired: yesNoBoolean,
  complianceSheet: yesNoBoolean,
  pastWorkDocuments: z.array(z.string()).optional().default([]),
  oemAuthorization: z.boolean().optional(),
  technicalDocumentUploads: fileIds,
  technicalEvaluationMethod: requiredString('Technical evaluation method', 160),
  technicalQualificationScore: z.coerce.number().min(0).max(100).optional(),
  technicalCommitteeIds: z.array(z.coerce.number().int().positive()).optional().default([])
});

export const step6Schema = z.object({
  evaluationMethod: requiredString('Evaluation method', 120),
  technicalQualificationRequired: yesNoBoolean,
  minimumExperienceRequired: yesNoBoolean,
  minimumExperience: optionalString(120),
  minimumTurnoverRequired: yesNoBoolean,
  minimumTurnover: z.coerce.number().nonnegative().optional(),
  similarWorkExperienceRequired: yesNoBoolean,
  similarWorkCount: z.coerce.number().nonnegative().optional(),
  bidderDocuments: z.array(z.string()).min(1, 'Bidder documents are required'),
  msePreference: yesNoBoolean,
  makeInIndiaPreference: yesNoBoolean,
  emdRequired: yesNoBoolean,
  emdAmount: z.coerce.number().nonnegative().optional(),
  pbgRequired: yesNoBoolean,
  pbgPercentage: z.coerce.number().nonnegative().optional(),
  blacklistingDeclarationRequired: yesNoBoolean,
  conflictOfInterestDeclarationRequired: yesNoBoolean,
  technicalPacket: technicalPacketSchema.optional()
}).refine(data => !data.emdRequired || Number(data.emdAmount || 0) > 0, { path: ['emdAmount'], message: 'EMD amount is required' })
  .refine(data => !data.pbgRequired || Number(data.pbgPercentage || 0) > 0, { path: ['pbgPercentage'], message: 'PBG percentage is required' });

export const financialPacketSchema = z.object({
  financialQuoteFormat: z.enum(['ITEM_WISE', 'TOTAL_BOQ', 'PERCENTAGE', 'LOT_WISE']),
  boqPriceSchedule: fileIds,
  taxGstDetails: z.object({
    gstIncluded: yesNoBoolean,
    gstRate: z.coerce.number().min(0).max(100)
  }),
  paymentTerms: requiredString('Payment terms', 1000),
  priceValidityDays: z.coerce.number().int().positive(),
  financialDocumentUploads: fileIds,
  financialOpeningRules: requiredString('Financial opening rules', 1000),
  financialEvaluationMethod: requiredString('Financial evaluation method', 160)
});

export const step7Schema = z.object({
  documentUploads: z.array(z.record(z.string(), z.any())).optional().default([]),
  technicalSpecificationDocumentIds: fileIds,
  budgetSanctionDocumentIds: fileIds,
  administrativeApprovalDocumentIds: fileIds,
  scopeOfWorkDocumentIds: fileIds,
  boqDocumentIds: fileIds,
  pacCertificateDocumentIds: fileIds,
  drawingDocumentIds: fileIds,
  additionalTermDocumentIds: fileIds,
  paymentTerms: requiredString('Payment terms', 1000),
  advancePaymentAllowed: yesNoBoolean,
  partPaymentAllowed: yesNoBoolean,
  invoiceRequired: yesNoBoolean,
  gstInvoiceRequired: yesNoBoolean,
  ewayBillRequired: z.boolean().optional().default(false),
  financialPacket: financialPacketSchema.optional()
});

export const step8Schema = z.object({
  corrigendumAllowed: yesNoBoolean,
  cancellationAllowedBeforeClosing: yesNoBoolean,
  clarificationWindowRequired: yesNoBoolean,
  sellerQueryAllowed: yesNoBoolean,
  documentResubmissionAllowed: yesNoBoolean,
  splittingQuantityAllowed: yesNoBoolean,
  multipleAwardAllowed: yesNoBoolean,
  rateContractRequired: yesNoBoolean
});

export const step9Schema = z.object({
  buyerDeclarationAccepted: z.literal(true, { error: 'Buyer declaration is required' }),
  restrictiveConditionsDeclarationAccepted: z.literal(true, { error: 'Non-restrictive conditions declaration is required' })
});

const step4SchemaForBidType = (bidType?: BidType) => {
  if (bidType === 'SERVICE_BID') return step4ServiceSchema;
  if (bidType === 'CUSTOM_BID') return step4CustomSchema;
  if (bidType === 'BOQ_BID') return step4BoqSchema;
  if (bidType === 'PAC_BID') return step4PacSchema;
  if (bidType === 'REVERSE_AUCTION') return reverseAuctionFieldsSchema;
  if (bidType === 'BID_WITH_RA') return step4ProductSchema.merge(reverseAuctionFieldsSchema);
  return step4ProductSchema;
};

export const schemaForStep = (step: number, bidType?: BidType) => {
  if (step === 1) return step1Schema;
  if (step === 2) return step2Schema;
  if (step === 3) return step3Schema;
  if (step === 4) return step4SchemaForBidType(bidType);
  if (step === 5) return step5Schema;
  if (step === 6) return step6Schema;
  if (step === 7) return step7Schema;
  if (step === 8) return step8Schema;
  return step9Schema;
};

export const formatZodErrors = (error: z.ZodError): Record<string, string[]> => {
  const errors: Record<string, string[]> = {};
  for (const issue of error.issues) {
    const key = issue.path.join('.') || 'form';
    errors[key] = [...(errors[key] || []), issue.message];
  }
  return errors;
};

export const validateWizardStep = (step: number, payload: any, bidType?: BidType, packetType?: PacketType): StepValidationResult => {
  const result = schemaForStep(step, bidType).safeParse(payload || {});
  if (!result.success) return { valid: false, errors: formatZodErrors(result.error) };
  if (packetType === 'TWO_PACKET' && step === 6 && !payload?.technicalPacket) {
    return { valid: false, errors: { technicalPacket: ['Technical packet is required for two packet bids'] } };
  }
  if (packetType === 'TWO_PACKET' && step === 7 && !payload?.financialPacket) {
    return { valid: false, errors: { financialPacket: ['Financial packet is required for two packet bids'] } };
  }
  return { valid: true, errors: {} };
};

export const sanitizeText = (value: unknown): unknown => {
  if (typeof value === 'string') {
    return value.replace(/[<>]/g, '').replace(/\s+/g, ' ').trim();
  }
  if (Array.isArray(value)) return value.map(sanitizeText);
  if (value && typeof value === 'object') {
    return Object.fromEntries(Object.entries(value as Record<string, unknown>).map(([key, nested]) => [key, sanitizeText(nested)]));
  }
  return value;
};
