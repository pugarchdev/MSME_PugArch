export const UserStatus = {
  PENDING: 'PENDING',
  ACTIVE: 'ACTIVE',
  BLOCKED: 'BLOCKED',
  SUSPENDED: 'SUSPENDED',
  DELETED: 'DELETED'
} as const;

export const OrganizationType = {
  MSME: 'MSME',
  PROPRIETORSHIP: 'PROPRIETORSHIP',
  PARTNERSHIP: 'PARTNERSHIP',
  PRIVATE_LIMITED: 'PRIVATE_LIMITED',
  PUBLIC_LIMITED: 'PUBLIC_LIMITED',
  LLP: 'LLP',
  TRUST: 'TRUST',
  SOCIETY: 'SOCIETY',
  STARTUP: 'STARTUP',
  NGO: 'NGO',
  EDUCATIONAL_INSTITUTION: 'EDUCATIONAL_INSTITUTION',
  GOVERNMENT: 'GOVERNMENT',
  PSU: 'PSU'
} as const;

export const VerificationStatus = {
  PENDING: 'PENDING',
  UNDER_REVIEW: 'UNDER_REVIEW',
  VERIFIED: 'VERIFIED',
  REJECTED: 'REJECTED',
  FAILED: 'FAILED',
  MANUAL_REVIEW_REQUIRED: 'MANUAL_REVIEW_REQUIRED',
  EXPIRED: 'EXPIRED'
} as const;

export const MSMECategory = {
  MICRO: 'MICRO',
  SMALL: 'SMALL',
  MEDIUM: 'MEDIUM',
  NOT_APPLICABLE: 'NOT_APPLICABLE'
} as const;

export const ProcurementMethod = {
  DIRECT_PURCHASE: 'DIRECT_PURCHASE',
  RFQ: 'RFQ',
  TENDER: 'TENDER',
  REVERSE_AUCTION: 'REVERSE_AUCTION',
  RATE_CONTRACT: 'RATE_CONTRACT'
} as const;

export const CanonicalProcurementMethod = {
  DIRECT_PURCHASE: 'DIRECT_PURCHASE',
  CATALOG_PURCHASE: 'CATALOG_PURCHASE',
  RFQ: 'RFQ',
  RFP: 'RFP',
  RFI: 'RFI',
  SEALED_TENDER: 'SEALED_TENDER',
  OPEN_TENDER: 'OPEN_TENDER',
  LIMITED_TENDER: 'LIMITED_TENDER',
  TWO_PACKET_BID: 'TWO_PACKET_BID',
  REVERSE_AUCTION: 'REVERSE_AUCTION',
  BID_WITH_REVERSE_AUCTION: 'BID_WITH_REVERSE_AUCTION',
  RATE_CONTRACT: 'RATE_CONTRACT',
  REPEAT_ORDER: 'REPEAT_ORDER',
  SINGLE_SOURCE: 'SINGLE_SOURCE',
  PAC: 'PAC',
  EMERGENCY_PURCHASE: 'EMERGENCY_PURCHASE',
  BOQ_BASED_BID: 'BOQ_BASED_BID',
} as const;

export type CanonicalProcurementMethodType = typeof CanonicalProcurementMethod[keyof typeof CanonicalProcurementMethod];

export const CANONICAL_METHOD_LABELS: Record<string, string> = {
  DIRECT_PURCHASE: 'Direct Purchase',
  CATALOG_PURCHASE: 'Catalogue Purchase',
  RFQ: 'RFQ',
  RFP: 'RFP',
  RFI: 'RFI',
  SEALED_TENDER: 'Sealed Tender',
  OPEN_TENDER: 'Open Tender',
  LIMITED_TENDER: 'Limited Tender',
  TWO_PACKET_BID: 'Two Packet Bid',
  REVERSE_AUCTION: 'Reverse Auction',
  BID_WITH_REVERSE_AUCTION: 'Bid with Reverse Auction',
  RATE_CONTRACT: 'Rate Contract',
  REPEAT_ORDER: 'Repeat Order',
  SINGLE_SOURCE: 'Single Source',
  PAC: 'PAC / Proprietary',
  EMERGENCY_PURCHASE: 'Emergency Purchase',
  BOQ_BASED_BID: 'BOQ Based Bid',
};

export const EXCEPTION_PROCUREMENT_METHODS = new Set([
  'PAC', 'SINGLE_SOURCE', 'EMERGENCY_PURCHASE',
]);

export const isExceptionProcurement = (method: string): boolean =>
  EXCEPTION_PROCUREMENT_METHODS.has(method);

export const ApprovalStatus = {
  DRAFT: 'DRAFT',
  PENDING: 'PENDING',
  UNDER_REVIEW: 'UNDER_REVIEW',
  APPROVED: 'APPROVED',
  REJECTED: 'REJECTED',
  RESUBMISSION_REQUIRED: 'RESUBMISSION_REQUIRED'
} as const;

export const ProductStatus = {
  DRAFT: 'DRAFT',
  ACTIVE: 'ACTIVE',
  INACTIVE: 'INACTIVE',
  OUT_OF_STOCK: 'OUT_OF_STOCK',
  ARCHIVED: 'ARCHIVED'
} as const;

export const CategoryType = {
  PRODUCT: 'PRODUCT',
  SERVICE: 'SERVICE',
  BOTH: 'BOTH'
} as const;

export const PricingModel = {
  FIXED: 'FIXED',
  HOURLY: 'HOURLY',
  DAILY: 'DAILY',
  MONTHLY: 'MONTHLY',
  PER_PROJECT: 'PER_PROJECT',
  CUSTOM: 'CUSTOM'
} as const;

export const StorageProvider = {
  CLOUDINARY: 'CLOUDINARY',
  GCP: 'GCP',
  LOCAL: 'LOCAL'
} as const;

export const FileStatus = {
  ACTIVE: 'ACTIVE',
  ARCHIVED: 'ARCHIVED',
  DELETED: 'DELETED',
  QUARANTINED: 'QUARANTINED'
} as const;

export const Severity = {
  LOW: 'LOW',
  MEDIUM: 'MEDIUM',
  HIGH: 'HIGH',
  CRITICAL: 'CRITICAL'
} as const;

export const PaymentGateway = {
  RAZORPAY: 'RAZORPAY',
  CASHFREE: 'CASHFREE',
  BANK_TRANSFER: 'BANK_TRANSFER',
  MANUAL: 'MANUAL'
} as const;

export const PaymentMethod = {
  UPI: 'UPI',
  CARD: 'CARD',
  NET_BANKING: 'NET_BANKING',
  BANK_TRANSFER: 'BANK_TRANSFER',
  CORPORATE_ACCOUNT: 'CORPORATE_ACCOUNT'
} as const;

export const QuantityUnit = {
  NOS: 'Nos',
  KG: 'Kg',
  TON: 'Ton',
  MT: 'MT',
  BAG: 'Bag',
  BOX: 'Box',
  PACKET: 'Packet',
  SET: 'Set',
  PAIR: 'Pair',
  ROLL: 'Roll',
  LITRE: 'Litre',
  METER: 'Meter',
  FEET: 'Feet',
  PIECE: 'Piece',
  UNIT: 'Unit',
  COIL: 'Coil',
  DRUM: 'Drum',
  BUNDLE: 'Bundle',
  CARTON: 'Carton',
  CYLINDER: 'Cylinder',
  DOZEN: 'Dozen',
  SHEET: 'Sheet',
  PLATE: 'Plate',
  BUCKET: 'Bucket',
  KIT: 'Kit',
  BOTTLE: 'Bottle',
  CONTAINER: 'Container',
  CUM: 'Cum',
  SQ_FT: 'SqFt',
  SQ_METER: 'SqMeter'
} as const;

export const MSMEType = {
  MSME: 'MSME',
  NON_MSME: 'NON_MSME',
  LOCAL_MSME: 'LOCAL_MSME',
  ANCILLARY_UNIT: 'ANCILLARY_UNIT',
  STARTUP_MSME: 'STARTUP_MSME'
} as const;

export const VendorType = {
  MANUFACTURER: 'MANUFACTURER',
  TRADER: 'TRADER',
  DISTRIBUTOR: 'DISTRIBUTOR',
  DEALER: 'DEALER',
  SERVICE_PROVIDER: 'SERVICE_PROVIDER',
  CONTRACTOR: 'CONTRACTOR',
  OEM: 'OEM',
  RETAIL_SUPPLIER: 'RETAIL_SUPPLIER',
  WHOLESALER: 'WHOLESALER'
} as const;

export const RegistrationType = {
  GST_REGISTERED: 'GST_REGISTERED',
  UDYAM_REGISTERED: 'UDYAM_REGISTERED',
  NSIC_REGISTERED: 'NSIC_REGISTERED',
  ISO_CERTIFIED: 'ISO_CERTIFIED',
  PAN_AVAILABLE: 'PAN_AVAILABLE'
} as const;

export const ItemCondition = {
  NEW: 'NEW',
  REFURBISHED: 'REFURBISHED',
  USED: 'USED',
  CUSTOM_MANUFACTURED: 'CUSTOM_MANUFACTURED'
} as const;

export const PaymentTerms = {
  ADVANCE_PAYMENT: 'ADVANCE_PAYMENT',
  CREDIT_PAYMENT: 'CREDIT_PAYMENT',
  PARTIAL_ADVANCE: 'PARTIAL_ADVANCE',
  MILESTONE_BASED: 'MILESTONE_BASED',
  ON_DELIVERY: 'ON_DELIVERY'
} as const;

export const DeliveryType = {
  IMMEDIATE_DELIVERY: 'IMMEDIATE_DELIVERY',
  SCHEDULED_DELIVERY: 'SCHEDULED_DELIVERY',
  URGENT_DELIVERY: 'URGENT_DELIVERY',
  PARTIAL_DELIVERY: 'PARTIAL_DELIVERY',
  PROJECT_DELIVERY: 'PROJECT_DELIVERY'
} as const;
