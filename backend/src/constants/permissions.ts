export const PERMISSIONS = {
  USERS_READ: 'users:read',
  USERS_REVIEW: 'users:review',
  USERS_UNLOCK: 'users:unlock',
  TENDERS_READ: 'tenders:read',
  TENDERS_WRITE: 'tenders:write',
  TENDERS_BIDS_READ: 'tenders:bids:read',
  TENDERS_STATUS_WRITE: 'tenders:status:write',
  BIDS_READ: 'bids:read',
  BIDS_WRITE: 'bids:write',
  BIDS_STATUS_WRITE: 'bids:status:write',
  VENDORS_READ: 'vendors:read',
  QUOTATIONS_READ: 'quotations:read',
  QUOTATIONS_WRITE: 'quotations:write',
  ONBOARDING_WRITE_SELF: 'onboarding:write:self',
  ONBOARDING_REVIEW: 'onboarding:review',
  COMPLIANCE_READ: 'compliance:read',
  COMPLIANCE_OVERRIDE: 'compliance:override',
  AUDIT_READ: 'audit:read',
  FILES_WRITE: 'files:write',
  REVERSE_AUCTION_CREATE: 'reverse_auction:create',
  REVERSE_AUCTION_VIEW: 'reverse_auction:view',
  REVERSE_AUCTION_MANAGE: 'reverse_auction:manage',
  REVERSE_AUCTION_BID: 'reverse_auction:bid',
  REVERSE_AUCTION_AWARD: 'reverse_auction:award',
  COMPARE_MARKETPLACE_ITEMS: 'compare:marketplace_items',
  COMPARE_REQUIREMENT_RESPONSES: 'compare:requirement_responses',
  COMPARE_PROCUREMENT_BIDS: 'compare:procurement_bids',
  PAYMENT_PORTAL_INITIATE: 'payment:portal_initiate',
  PAYMENT_OFFLINE_PROOF_UPLOAD: 'payment:offline_proof_upload',
  PAYMENT_OFFLINE_PROOF_VERIFY: 'payment:offline_proof_verify',
  BANNER_VIEW: 'banner:view',
  BANNER_UPLOAD_ELIGIBLE_ORG: 'banner:upload_eligible_org',
  BANNER_MANAGE: 'banner:manage',
  RANKING_VIEW: 'ranking:view',
  RANKING_MANAGE: 'ranking:manage',
  USER_VIEW: 'user.view',
  USER_CREATE: 'user.create',
  USER_UPDATE: 'user.update',
  USER_DELETE: 'user.delete',
  ROLE_ASSIGN: 'role.assign',
  PERMISSION_MANAGE: 'permission.manage',
  FEATURE_TOGGLE: 'feature.toggle',
  COMPANY_MANAGE: 'company.manage',
  CONTENT_UPDATE: 'content.update',
  BRANDING_UPDATE: 'branding.update',
  ORGANIZATION_MANAGE: 'organization.manage',
  AUDIT_VIEW: 'audit.view',
  OVERRIDE: 'override'
} as const;

export type Permission = (typeof PERMISSIONS)[keyof typeof PERMISSIONS];

export const ROLE_PERMISSIONS: Record<string, Permission[]> = {
  master_admin: Object.values(PERMISSIONS),
  admin: Object.values(PERMISSIONS),
  buyer: [
    PERMISSIONS.TENDERS_READ,
    PERMISSIONS.TENDERS_WRITE,
    PERMISSIONS.TENDERS_BIDS_READ,
    PERMISSIONS.TENDERS_STATUS_WRITE,
    PERMISSIONS.BIDS_STATUS_WRITE,
    PERMISSIONS.VENDORS_READ,
    PERMISSIONS.BIDS_READ,
    PERMISSIONS.QUOTATIONS_READ,
    PERMISSIONS.QUOTATIONS_WRITE,
    PERMISSIONS.ONBOARDING_WRITE_SELF,
    PERMISSIONS.FILES_WRITE,
    PERMISSIONS.REVERSE_AUCTION_CREATE,
    PERMISSIONS.REVERSE_AUCTION_VIEW,
    PERMISSIONS.REVERSE_AUCTION_MANAGE,
    PERMISSIONS.REVERSE_AUCTION_AWARD,
    PERMISSIONS.COMPARE_REQUIREMENT_RESPONSES,
    PERMISSIONS.COMPARE_PROCUREMENT_BIDS,
    PERMISSIONS.PAYMENT_PORTAL_INITIATE,
    PERMISSIONS.PAYMENT_OFFLINE_PROOF_UPLOAD,
    PERMISSIONS.BANNER_VIEW,
    PERMISSIONS.BANNER_UPLOAD_ELIGIBLE_ORG
  ],
  seller: [
    PERMISSIONS.TENDERS_READ,
    PERMISSIONS.BIDS_WRITE,
    PERMISSIONS.BIDS_READ,
    PERMISSIONS.QUOTATIONS_READ,
    PERMISSIONS.ONBOARDING_WRITE_SELF,
    PERMISSIONS.FILES_WRITE,
    PERMISSIONS.REVERSE_AUCTION_VIEW,
    PERMISSIONS.REVERSE_AUCTION_BID,
    PERMISSIONS.COMPARE_MARKETPLACE_ITEMS,
    PERMISSIONS.BANNER_VIEW,
    PERMISSIONS.BANNER_UPLOAD_ELIGIBLE_ORG
  ],
  shg: [
    PERMISSIONS.TENDERS_READ,
    PERMISSIONS.BIDS_WRITE,
    PERMISSIONS.BIDS_READ,
    PERMISSIONS.QUOTATIONS_READ,
    PERMISSIONS.ONBOARDING_WRITE_SELF,
    PERMISSIONS.FILES_WRITE,
    PERMISSIONS.REVERSE_AUCTION_VIEW,
    PERMISSIONS.REVERSE_AUCTION_BID,
    PERMISSIONS.COMPARE_MARKETPLACE_ITEMS,
    PERMISSIONS.BANNER_VIEW,
    PERMISSIONS.BANNER_UPLOAD_ELIGIBLE_ORG
  ],
  financier: [
    PERMISSIONS.BANNER_VIEW
  ]
};

export const can = (user: { role?: string; permissions?: string[] } | undefined, permission: Permission | string) => {
  if (!user) return false;
  if (user.role === 'master_admin') return true;
  // Check dynamic permissions first (from RBAC database)
  if (user.permissions && Array.isArray(user.permissions) && user.permissions.length > 0) {
    return user.permissions.includes(permission as string);
  }
  // Fallback to static role-permission mapping
  return Boolean(user.role && ROLE_PERMISSIONS[user.role]?.includes(permission as Permission));
};

export const canAny = (user: { role?: string; permissions?: string[] } | undefined, permissions: (Permission | string)[]) =>
  permissions.some(p => can(user, p));

export const canAll = (user: { role?: string; permissions?: string[] } | undefined, permissions: (Permission | string)[]) =>
  permissions.every(p => can(user, p));

export const FOUNDATION_PERMISSION_CODES = {
  USER_CREATE: 'user.create',
  USER_BLOCK: 'user.block',
  ONBOARDING_REVIEW: 'onboarding.review',
  SELLER_CATALOGUE_CREATE: 'seller.catalogue.create',
  REQUIREMENT_CREATE: 'requirement.create',
  TENDER_CREATE: 'tender.create',
  TENDER_PUBLISH: 'tender.publish',
  BID_SUBMIT: 'bid.submit',
  BID_EVALUATE: 'bid.evaluate',
  PO_GENERATE: 'po.generate',
  DELIVERY_UPDATE: 'delivery.update',
  INSPECTION_CREATE: 'inspection.create',
  INVOICE_SUBMIT: 'invoice.submit',
  INVOICE_VERIFY: 'invoice.verify',
  PAYMENT_INITIATE: 'payment.initiate',
  ESCROW_RELEASE: 'escrow.release',
  DISPUTE_MANAGE: 'dispute.manage',
  AUDIT_VIEW: 'audit.view',
  ADMIN_REPORTS_VIEW: 'admin.reports.view',
  COMPLIANCE_REVIEW: 'compliance.review',
  FRAUD_REVIEW: 'fraud.review'
} as const;

export type FoundationPermissionCode =
  (typeof FOUNDATION_PERMISSION_CODES)[keyof typeof FOUNDATION_PERMISSION_CODES];

export const MASTER_FEATURES = [
  ['buyer-registration', 'Buyer Registration', 'registration'],
  ['seller-registration', 'Seller Registration', 'registration'],
  ['gst-verification', 'GST Verification', 'verification'],
  ['pan-verification', 'PAN Verification', 'verification'],
  ['aadhaar-verification', 'Aadhaar Verification', 'verification'],
  ['udyam-verification', 'Udyam Verification', 'verification'],
  ['cin-verification', 'CIN Verification', 'verification'],
  ['tender-management', 'Tender Management', 'procurement'],
  ['bid-submission', 'Bid Submission', 'procurement'],
  ['reverse-auction', 'Reverse Auction', 'procurement'],
  ['rate-contract', 'Rate Contract', 'procurement'],
  ['procurement-planning', 'Procurement Planning', 'procurement'],
  ['buyer-seller-matching', 'Buyer-Seller Matching', 'marketplace'],
  ['product-service-catalog', 'Product/Service Catalog', 'catalogue'],
  ['document-upload', 'Document Upload', 'documents'],
  ['document-verification', 'Document Verification', 'documents'],
  ['approval-workflow', 'Approval Workflow', 'workflow'],
  ['escrow-nodal-bank', 'Escrow/Nodal Bank Module', 'finance'],
  ['payment-module', 'Payment Module', 'finance'],
  ['razorpay-payment', 'Razorpay Payment', 'finance'],
  ['grievance-module', 'Grievance Module', 'support'],
  ['notifications', 'Notifications', 'communication'],
  ['email-otp', 'Email OTP', 'communication'],
  ['mobile-otp', 'Mobile OTP', 'communication'],
  ['reports-mis', 'Reports & MIS', 'reports'],
  ['dashboard-analytics', 'Dashboard Analytics', 'analytics'],
  ['audit-logs', 'Audit Logs', 'audit'],
  ['role-management', 'Role Management', 'access-control'],
  ['permission-management', 'Permission Management', 'access-control'],
  ['organization-management', 'Organization Management', 'organizations'],
  ['user-management', 'User Management', 'users'],
  ['compliance-risk', 'Compliance Risk', 'compliance'],
  ['procurement-readiness', 'Procurement Readiness', 'compliance'],
  ['lpi-logistics-partner', 'LPI / Logistics Partner Module', 'logistics'],
  ['search-filters', 'Search and Filters', 'search'],
  ['export-csv-pdf-excel', 'Export CSV/PDF/Excel', 'exports'],
  ['cms-content-management', 'CMS / Content Management', 'content'],
  ['branding-management', 'Branding Management', 'branding'],
  ['buyer-requirement-board', 'Enable buyer requirement board', 'requirements'],
  ['large-buyer-requirements-home', 'Enable large buyer requirements on home page', 'requirements'],
  ['requirement-posting', 'Enable requirement posting', 'requirements'],
  ['seller-response-requirements', 'Enable seller response to requirements', 'requirements'],
  ['guest-cart', 'Enable guest cart', 'cart'],
  ['cart-without-login', 'Enable cart without login', 'cart'],
  ['large-industries-section', 'Enable large industries section', 'organizations'],
  ['big-msmes-section', 'Enable big MSMEs section', 'organizations'],
  ['hamburger-sidebar', 'Enable hamburger sidebar', 'navigation'],
  ['organization-listing', 'Enable organization listing', 'organizations'],
  ['product-marketplace', 'Enable product marketplace', 'marketplace'],
  ['service-marketplace', 'Enable service marketplace', 'marketplace'],
  ['public-browsing', 'Enable public browsing', 'marketplace'],
  ['checkout', 'Enable checkout', 'cart'],
  ['request-quote', 'Enable request quote', 'quotations'],
  ['admin-bid-approval', 'Admin Bid Approval Requirement', 'procurement']
] as const;

export const MASTER_PERMISSION_CODES = [
  'user.view',
  'user.create',
  'user.update',
  'user.delete',
  'role.assign',
  'permission.manage',
  'buyer.approve',
  'seller.verify',
  'tender.create',
  'tender.publish',
  'bid.submit',
  'report.export',
  'feature.toggle',
  'company.manage',
  'content.update',
  'branding.update',
  'organization.manage',
  'audit.view',
  'override'
] as const;
