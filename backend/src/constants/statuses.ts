// SYNC: Keep in sync with frontend/src/constants/statuses.ts
export const ONBOARDING_STATUSES = {
  PENDING: 'pending',
  UNDER_COMPLIANCE_REVIEW: 'under_compliance_review',
  APPROVED_FOR_PROCUREMENT: 'approved_for_procurement',
  RESUBMISSION_REQUIRED: 'resubmission_required',
  REJECTED: 'rejected'
} as const;

export const TENDER_STATUSES = {
  DRAFT: 'draft',
  PUBLISHED: 'published',
  CLOSED: 'closed',
  AWARDED: 'awarded',
  CANCELLED: 'cancelled'
} as const;

export const USER_STATUSES = {
  PENDING: 'PENDING',
  ACTIVE: 'ACTIVE',
  BLOCKED: 'BLOCKED',
  SUSPENDED: 'SUSPENDED',
  DELETED: 'DELETED'
} as const;

export const VERIFICATION_STATUSES = {
  PENDING: 'PENDING',
  UNDER_REVIEW: 'UNDER_REVIEW',
  VERIFIED: 'VERIFIED',
  REJECTED: 'REJECTED',
  FAILED: 'FAILED',
  MANUAL_REVIEW_REQUIRED: 'MANUAL_REVIEW_REQUIRED',
  EXPIRED: 'EXPIRED'
} as const;

export const APPROVAL_STATUSES = {
  DRAFT: 'DRAFT',
  PENDING: 'PENDING',
  UNDER_REVIEW: 'UNDER_REVIEW',
  APPROVED: 'APPROVED',
  REJECTED: 'REJECTED',
  RESUBMISSION_REQUIRED: 'RESUBMISSION_REQUIRED'
} as const;

export const PRODUCT_STATUSES = {
  DRAFT: 'DRAFT',
  ACTIVE: 'ACTIVE',
  INACTIVE: 'INACTIVE',
  OUT_OF_STOCK: 'OUT_OF_STOCK',
  ARCHIVED: 'ARCHIVED'
} as const;

export const FILE_STATUSES = {
  ACTIVE: 'ACTIVE',
  ARCHIVED: 'ARCHIVED',
  DELETED: 'DELETED',
  QUARANTINED: 'QUARANTINED'
} as const;

export const SEVERITIES = {
  LOW: 'LOW',
  MEDIUM: 'MEDIUM',
  HIGH: 'HIGH',
  CRITICAL: 'CRITICAL'
} as const;
