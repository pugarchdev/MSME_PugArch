import type { NextFunction, Response } from 'express';
import prisma from '../lib/prisma.js';
import { apiResponse } from '../utils/apiResponse.js';
import type { OrgPermissionKey } from '../constants/org-permissions.js';
import type { AuthRequest } from './authenticate.js';
import { getActivePermissionCodes, isMasterAdmin } from '../services/rbac.service.js';
import { requirePermission } from './authorize.js';

const ORG_PERMISSION_TO_RBAC: Partial<Record<OrgPermissionKey, string>> = {
  TEAM_VIEW: 'team.member.view',
  TEAM_INVITE: 'team.member.invite',
  TEAM_ROLE_MANAGE: 'team.role.manage',
  TEAM_MEMBER_DISABLE: 'team.member.disable',
  ORG_SETTINGS_VIEW: 'organization.view',
  ORG_SETTINGS_EDIT: 'organization.update',
  CATALOG_VIEW: 'catalogue.product.view',
  CATALOG_CREATE: 'catalogue.product.create',
  CATALOG_EDIT: 'catalogue.product.update',
  CATALOG_DELETE: 'catalogue.product.delete',
  MARKETPLACE_VIEW: 'marketplace.view',
  REQUIREMENT_VIEW: 'requirement.view',
  REQUIREMENT_CREATE: 'requirement.create',
  REQUIREMENT_PUBLISH: 'requirement.publish',
  TENDER_VIEW: 'tender.view',
  TENDER_CREATE: 'tender.create',
  TENDER_PUBLISH: 'tender.publish',
  BID_EVALUATE_TECHNICAL: 'bid.technical.evaluate',
  BID_EVALUATE_FINANCIAL: 'bid.financial.evaluate',
  AWARD_RECOMMEND: 'award.recommend',
  PURCHASE_ORDER_VIEW: 'purchase_order.view',
  PURCHASE_ORDER_APPROVE: 'purchase_order.approve',
  GRN_VIEW: 'grn.view',
  INVOICE_VIEW: 'invoice.view',
  INVOICE_APPROVE: 'invoice.approve',
  PAYMENT_VIEW: 'payment.view',
  PAYMENT_INITIATE: 'payment.initiate',
  PAYMENT_OFFLINE_PROOF_UPLOAD: 'payment.initiate',
  PAYMENT_VERIFY: 'payment.verify',
  ESCROW_VIEW: 'escrow.view',
  ESCROW_RELEASE: 'escrow.release',
  GRN_CREATE: 'grn.create',
  GRN_APPROVE: 'grn.approve',
  DISPUTE_VIEW: 'dispute.view',
  DISPUTE_RAISE: 'dispute.manage',
  DISPUTE_RESPOND: 'dispute.manage',
  DISPUTE_RESOLVE_ORG_SIDE: 'dispute.manage',
  REPORTS_VIEW: 'report.view',
  REPORTS_EXPORT: 'report.export'
};

export const getOrgPermissionKeys = async (userId: number, organizationId: number): Promise<{ membership: any; permissions: string[] }> => {
  const membership = await prisma.orgMembership.findUnique({
    where: { userId_organizationId: { userId, organizationId } },
    include: {
      customRole: {
        include: { permissions: true }
      }
    }
  });

  if (!membership || !membership.isActive) return { membership, permissions: [] };
  const scope = { scopeType: 'ORGANIZATION' as const, scopeId: organizationId };
  return { membership, permissions: await getActivePermissionCodes(userId, scope) };
};

export const requireOrgPermission = (permissionKey: OrgPermissionKey | string) => {
  return async (req: AuthRequest, res: Response, next: NextFunction) => {
    if (!req.user) return apiResponse.error(res, 401, 'Authentication required', 'AUTH_REQUIRED');
    if (isMasterAdmin(req.user)) return next();

    const organizationId = req.user.organizationId;
    if (!organizationId) {
      return apiResponse.error(res, 403, 'You must belong to an organisation to perform this action.', 'ORG_REQUIRED');
    }

    const { membership } = await getOrgPermissionKeys(req.user.id, organizationId);
    if (!membership || !membership.isActive) {
      return apiResponse.error(res, 403, 'You are not an active member of this organisation.', 'ORG_MEMBERSHIP_INACTIVE');
    }

    const dynamicPermission = ORG_PERMISSION_TO_RBAC[permissionKey as OrgPermissionKey] || String(permissionKey);
    if (!dynamicPermission) {
      return apiResponse.error(res, 403, `No dynamic permission mapping exists for organization permission: ${permissionKey}`, 'ORG_PERMISSION_UNMAPPED');
    }

    const scope = { scopeType: 'ORGANIZATION' as const, scopeId: organizationId };
    const permissions = await getActivePermissionCodes(req.user.id, scope);
    (req as any).orgMembership = membership;
    (req as any).orgPermissions = permissions;
    return requirePermission(dynamicPermission, {
      scopeType: 'ORGANIZATION',
      getScopeId: scopedReq => scopedReq.user?.organizationId
    })(req, res, next);
  };
};
