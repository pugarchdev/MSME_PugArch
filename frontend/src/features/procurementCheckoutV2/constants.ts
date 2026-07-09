export const STEP_TITLES = [
  'Cart Review',
  'Buyer Details',
  'Consignee & Delivery',
  'Procurement Method',
  'Budget & Sanction',
  'Payment Authority',
  'Terms & Documents',
  'Preview & Submit',
] as const;

export const PROCUREMENT_METHOD_LABELS: Record<string, string> = {
  DIRECT_PURCHASE: 'Direct Purchase',
  L1_PURCHASE: 'L1 Purchase',
  BID_FROM_CART: 'Create Bid from Cart',
  RA_FROM_CART: 'Create RA from Cart',
  PAC_PROCUREMENT: 'PAC Procurement',
  SINGLE_SOURCE: 'Single Source Procurement',
  REPEAT_ORDER: 'Repeat Order Procurement',
};

export const DELIVERY_PERIOD_OPTIONS = [
  '7 Days',
  '15 Days',
  '30 Days',
  '45 Days',
  '60 Days',
  '90 Days',
  'Custom',
];

export const INSPECTION_TYPE_OPTIONS = [
  'No Inspection',
  'Department Inspection',
  'Post-delivery Inspection',
  'Third-party Inspection',
  'Joint Inspection',
];

export const PAYMENT_MODE_OPTIONS = [
  'PFMS',
  'State Treasury',
  'GeM Pool Account',
  'Department Payment System',
  'Bank Transfer',
  'Online Payment Gateway',
  'Other',
];

export const PAC_TECHNICAL_REASONS = [
  'Compatibility with existing system',
  'OEM spare part',
  'Patented technology',
  'Standardization with existing installed base',
  'Warranty continuity',
  'Safety / regulatory requirement',
  'No equivalent alternative available',
  'Other',
];

export const DEFAULT_CHECKOUT_FORM = {
  selectedMethod: '' as const,
  demandSplittingConfirmation: false,
  buyerDetails: {},
  consigneeDetails: { consigneeType: 'Single' },
  deliveryDetails: { deliveryPeriod: '30 Days', inspectionType: 'Department Inspection' },
  budgetSanction: { budgetAvailabilityConfirmed: 'Yes' },
  paymentAuthority: { paymentMode: 'PFMS', paymentTimeline: 'As per sanction' },
  priceReasonability: {},
  termsDocuments: {},
  declarations: {},
};
