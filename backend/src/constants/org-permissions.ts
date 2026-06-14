import { OrgRole } from '@prisma/client';

export type OrgPermissionKey =
  | 'CATALOG_VIEW' | 'CATALOG_CREATE' | 'CATALOG_EDIT' | 'CATALOG_DELETE'
  | 'MARKETPLACE_VIEW' | 'MARKETPLACE_COMPARE' | 'CART_ADD' | 'CART_SUBMIT_FOR_APPROVAL'
  | 'REQUIREMENT_VIEW' | 'REQUIREMENT_CREATE' | 'REQUIREMENT_EDIT' | 'REQUIREMENT_PUBLISH' | 'REQUIREMENT_RESPONSE_COMPARE' | 'RFQ_CREATE' | 'RFQ_MANAGE'
  | 'TENDER_VIEW' | 'TENDER_CREATE' | 'TENDER_PUBLISH' | 'BID_EVALUATE_TECHNICAL' | 'BID_EVALUATE_FINANCIAL' | 'AWARD_RECOMMEND' | 'PURCHASE_ORDER_VIEW' | 'PURCHASE_ORDER_APPROVE'
  | 'REVERSE_AUCTION_VIEW' | 'REVERSE_AUCTION_CREATE' | 'REVERSE_AUCTION_MANAGE' | 'REVERSE_AUCTION_BID' | 'REVERSE_AUCTION_AWARD'
  | 'INVOICE_VIEW' | 'INVOICE_APPROVE' | 'PAYMENT_VIEW' | 'PAYMENT_INITIATE' | 'PAYMENT_OFFLINE_PROOF_UPLOAD' | 'PAYMENT_VERIFY' | 'ESCROW_VIEW' | 'ESCROW_RELEASE'
  | 'DELIVERY_VIEW' | 'DELIVERY_UPDATE' | 'GRN_VIEW' | 'GRN_CREATE' | 'GRN_APPROVE' | 'INSPECTION_APPROVE'
  | 'DISPUTE_VIEW' | 'DISPUTE_RAISE' | 'DISPUTE_RESPOND' | 'DISPUTE_RESOLVE_ORG_SIDE'
  | 'TEAM_VIEW' | 'TEAM_INVITE' | 'TEAM_ROLE_MANAGE' | 'TEAM_MEMBER_DISABLE' | 'ORG_SETTINGS_VIEW' | 'ORG_SETTINGS_EDIT' | 'BANNER_ELIGIBILITY_VIEW' | 'BANNER_UPLOAD'
  | 'REPORTS_VIEW' | 'REPORTS_EXPORT';

export const ORG_PERMISSION_CATALOG: Array<{ key: OrgPermissionKey; label: string; module: string; description: string }> = [
  { key: 'CATALOG_VIEW', label: 'View catalogue', module: 'Catalogue', description: 'Read product and service catalogue records.' },
  { key: 'CATALOG_CREATE', label: 'Create catalogue', module: 'Catalogue', description: 'Create products and services.' },
  { key: 'CATALOG_EDIT', label: 'Edit catalogue', module: 'Catalogue', description: 'Update organization catalogue records.' },
  { key: 'CATALOG_DELETE', label: 'Delete catalogue', module: 'Catalogue', description: 'Remove catalogue records.' },
  { key: 'MARKETPLACE_VIEW', label: 'View marketplace', module: 'Marketplace', description: 'Browse approved marketplace items.' },
  { key: 'MARKETPLACE_COMPARE', label: 'Compare items', module: 'Marketplace', description: 'Compare products, services, and responses.' },
  { key: 'CART_ADD', label: 'Add to cart', module: 'Marketplace', description: 'Add marketplace items to cart.' },
  { key: 'CART_SUBMIT_FOR_APPROVAL', label: 'Submit cart', module: 'Marketplace', description: 'Submit cart for procurement approval.' },
  { key: 'REQUIREMENT_VIEW', label: 'View requirements', module: 'Requirements/RFQ', description: 'Read buyer requirements and RFQs.' },
  { key: 'REQUIREMENT_CREATE', label: 'Create requirements', module: 'Requirements/RFQ', description: 'Draft buyer requirements.' },
  { key: 'REQUIREMENT_EDIT', label: 'Edit requirements', module: 'Requirements/RFQ', description: 'Update buyer requirements.' },
  { key: 'REQUIREMENT_PUBLISH', label: 'Publish requirements', module: 'Requirements/RFQ', description: 'Publish buyer requirements.' },
  { key: 'REQUIREMENT_RESPONSE_COMPARE', label: 'Compare responses', module: 'Requirements/RFQ', description: 'Compare seller responses.' },
  { key: 'RFQ_CREATE', label: 'Create RFQ', module: 'Requirements/RFQ', description: 'Create RFQ records.' },
  { key: 'RFQ_MANAGE', label: 'Manage RFQ', module: 'Requirements/RFQ', description: 'Manage RFQ lifecycle.' },
  { key: 'TENDER_VIEW', label: 'View tenders', module: 'Procurement', description: 'Read tenders and bids.' },
  { key: 'TENDER_CREATE', label: 'Create tender', module: 'Procurement', description: 'Draft tenders.' },
  { key: 'TENDER_PUBLISH', label: 'Publish tender', module: 'Procurement', description: 'Publish tenders.' },
  { key: 'BID_EVALUATE_TECHNICAL', label: 'Technical evaluation', module: 'Procurement', description: 'Evaluate technical bids.' },
  { key: 'BID_EVALUATE_FINANCIAL', label: 'Financial evaluation', module: 'Procurement', description: 'Evaluate financial bids.' },
  { key: 'AWARD_RECOMMEND', label: 'Recommend award', module: 'Procurement', description: 'Recommend L1/award outcomes.' },
  { key: 'PURCHASE_ORDER_VIEW', label: 'View PO', module: 'Procurement', description: 'Read purchase orders.' },
  { key: 'PURCHASE_ORDER_APPROVE', label: 'Approve PO', module: 'Procurement', description: 'Approve purchase orders.' },
  { key: 'REVERSE_AUCTION_VIEW', label: 'View auctions', module: 'Reverse Auction', description: 'Read reverse auction records.' },
  { key: 'REVERSE_AUCTION_CREATE', label: 'Create auction', module: 'Reverse Auction', description: 'Create reverse auctions.' },
  { key: 'REVERSE_AUCTION_MANAGE', label: 'Manage auction', module: 'Reverse Auction', description: 'Manage live auction lifecycle.' },
  { key: 'REVERSE_AUCTION_BID', label: 'Bid in auction', module: 'Reverse Auction', description: 'Submit seller bids.' },
  { key: 'REVERSE_AUCTION_AWARD', label: 'Award auction', module: 'Reverse Auction', description: 'Award L1 auction outcomes.' },
  { key: 'INVOICE_VIEW', label: 'View invoices', module: 'Finance', description: 'Read invoices.' },
  { key: 'INVOICE_APPROVE', label: 'Approve invoices', module: 'Finance', description: 'Approve or reject invoices.' },
  { key: 'PAYMENT_VIEW', label: 'View payments', module: 'Finance', description: 'Read payment records.' },
  { key: 'PAYMENT_INITIATE', label: 'Initiate payment', module: 'Finance', description: 'Create payment transactions.' },
  { key: 'PAYMENT_OFFLINE_PROOF_UPLOAD', label: 'Upload payment proof', module: 'Finance', description: 'Upload offline payment evidence.' },
  { key: 'PAYMENT_VERIFY', label: 'Verify payment', module: 'Finance', description: 'Verify payment proof.' },
  { key: 'ESCROW_VIEW', label: 'View escrow', module: 'Finance', description: 'Read escrow accounts.' },
  { key: 'ESCROW_RELEASE', label: 'Release escrow', module: 'Finance', description: 'Release escrow funds.' },
  { key: 'DELIVERY_VIEW', label: 'View delivery', module: 'Delivery/GRN', description: 'Read delivery records.' },
  { key: 'DELIVERY_UPDATE', label: 'Update delivery', module: 'Delivery/GRN', description: 'Update delivery lifecycle.' },
  { key: 'GRN_VIEW', label: 'View GRN', module: 'Delivery/GRN', description: 'Read goods receipt notes.' },
  { key: 'GRN_CREATE', label: 'Create GRN', module: 'Delivery/GRN', description: 'Create goods receipt notes.' },
  { key: 'GRN_APPROVE', label: 'Approve GRN', module: 'Delivery/GRN', description: 'Approve or reject GRNs.' },
  { key: 'INSPECTION_APPROVE', label: 'Approve inspection', module: 'Delivery/GRN', description: 'Approve inspection outcomes.' },
  { key: 'DISPUTE_VIEW', label: 'View disputes', module: 'Disputes', description: 'Read organization disputes.' },
  { key: 'DISPUTE_RAISE', label: 'Raise disputes', module: 'Disputes', description: 'Raise transaction disputes.' },
  { key: 'DISPUTE_RESPOND', label: 'Respond disputes', module: 'Disputes', description: 'Reply to dispute clarification.' },
  { key: 'DISPUTE_RESOLVE_ORG_SIDE', label: 'Close org dispute', module: 'Disputes', description: 'Close disputes from organization side.' },
  { key: 'TEAM_VIEW', label: 'View team', module: 'Team/Admin', description: 'Read team members and invitations.' },
  { key: 'TEAM_INVITE', label: 'Invite team', module: 'Team/Admin', description: 'Invite organization members.' },
  { key: 'TEAM_ROLE_MANAGE', label: 'Manage roles', module: 'Team/Admin', description: 'Create and assign organization roles.' },
  { key: 'TEAM_MEMBER_DISABLE', label: 'Disable members', module: 'Team/Admin', description: 'Deactivate team members.' },
  { key: 'ORG_SETTINGS_VIEW', label: 'View org settings', module: 'Team/Admin', description: 'Read organization settings.' },
  { key: 'ORG_SETTINGS_EDIT', label: 'Edit org settings', module: 'Team/Admin', description: 'Update organization settings.' },
  { key: 'BANNER_ELIGIBILITY_VIEW', label: 'View banner eligibility', module: 'Team/Admin', description: 'Read banner eligibility.' },
  { key: 'BANNER_UPLOAD', label: 'Upload banner', module: 'Team/Admin', description: 'Upload promotional banners.' },
  { key: 'REPORTS_VIEW', label: 'View reports', module: 'Reports', description: 'Read reports.' },
  { key: 'REPORTS_EXPORT', label: 'Export reports', module: 'Reports', description: 'Export reports.' }
];

export const ALL_ORG_PERMISSION_KEYS = ORG_PERMISSION_CATALOG.map(p => p.key);

const procurement = ['MARKETPLACE_VIEW', 'MARKETPLACE_COMPARE', 'CART_ADD', 'CART_SUBMIT_FOR_APPROVAL', 'REQUIREMENT_VIEW', 'REQUIREMENT_CREATE', 'REQUIREMENT_EDIT', 'REQUIREMENT_PUBLISH', 'REQUIREMENT_RESPONSE_COMPARE', 'RFQ_CREATE', 'RFQ_MANAGE', 'TENDER_VIEW', 'TENDER_CREATE', 'TENDER_PUBLISH', 'PURCHASE_ORDER_VIEW'] as OrgPermissionKey[];
const finance = ['INVOICE_VIEW', 'INVOICE_APPROVE', 'PAYMENT_VIEW', 'PAYMENT_INITIATE', 'PAYMENT_OFFLINE_PROOF_UPLOAD', 'PAYMENT_VERIFY', 'ESCROW_VIEW', 'ESCROW_RELEASE', 'DISPUTE_VIEW', 'DISPUTE_RESPOND'] as OrgPermissionKey[];
const technical = ['CATALOG_VIEW', 'MARKETPLACE_VIEW', 'TENDER_VIEW', 'BID_EVALUATE_TECHNICAL', 'GRN_VIEW', 'GRN_APPROVE', 'INSPECTION_APPROVE', 'DISPUTE_VIEW'] as OrgPermissionKey[];
const logistics = ['DELIVERY_VIEW', 'DELIVERY_UPDATE', 'GRN_VIEW', 'GRN_CREATE', 'DISPUTE_VIEW', 'DISPUTE_RESPOND'] as OrgPermissionKey[];
const viewer = ['CATALOG_VIEW', 'MARKETPLACE_VIEW', 'REQUIREMENT_VIEW', 'TENDER_VIEW', 'PURCHASE_ORDER_VIEW', 'INVOICE_VIEW', 'PAYMENT_VIEW', 'ESCROW_VIEW', 'DELIVERY_VIEW', 'GRN_VIEW', 'DISPUTE_VIEW', 'REPORTS_VIEW'] as OrgPermissionKey[];

export const DEFAULT_ORG_ROLE_TEMPLATES: Array<{ name: string; roleKey: string; orgRole: OrgRole; description: string; permissions: OrgPermissionKey[] }> = [
  { name: 'Org Admin', roleKey: 'org_admin', orgRole: OrgRole.ORG_ADMIN, description: 'Full organization access.', permissions: ALL_ORG_PERMISSION_KEYS },
  { name: 'Procurement Officer', roleKey: 'procurement_officer', orgRole: OrgRole.PROCUREMENT_OFFICER, description: 'Requirements, RFQ, cart, tender and PO access without finance approval.', permissions: procurement },
  { name: 'Product A Procurement Officer', roleKey: 'product_a_procurement_officer', orgRole: OrgRole.PROCUREMENT_OFFICER, description: 'Procurement template intended for product/category scoping.', permissions: procurement },
  { name: 'Finance Officer', roleKey: 'finance_officer', orgRole: OrgRole.FINANCE_OFFICER, description: 'Invoice, payment, escrow and finance dispute access.', permissions: finance },
  { name: 'Technical Officer', roleKey: 'technical_officer', orgRole: OrgRole.TECHNICAL_OFFICER, description: 'Technical evaluation, inspection and GRN approval access.', permissions: technical },
  { name: 'Logistics Officer', roleKey: 'logistics_officer', orgRole: OrgRole.LOGISTICS_OFFICER, description: 'Delivery and GRN operations access.', permissions: logistics },
  { name: 'Viewer', roleKey: 'viewer', orgRole: OrgRole.VIEWER, description: 'Read-only organization access.', permissions: viewer }
];

export const FALLBACK_ORG_ROLE_PERMISSIONS: Record<OrgRole, OrgPermissionKey[]> = Object.fromEntries(
  DEFAULT_ORG_ROLE_TEMPLATES.map(template => [template.orgRole, template.permissions])
) as Record<OrgRole, OrgPermissionKey[]>;
