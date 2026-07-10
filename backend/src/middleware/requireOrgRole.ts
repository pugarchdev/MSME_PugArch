import type { NextFunction, Response } from 'express';
import type { OrgRole } from '@prisma/client';
import prisma from '../lib/prisma.js';
import { apiResponse } from '../utils/apiResponse.js';
import type { AuthRequest } from './authenticate.js';
import { getActivePermissionCodes, isMasterAdmin } from '../services/rbac.service.js';

const LEGACY_ORG_ROLE_PERMISSION_HINTS: Record<string, string[]> = {
  ORG_ADMIN: [
    'team.role.manage',
    'team.role.assign',
    'team.member.invite',
    'organization.update',
    'tender.create',
    'tender.update',
    'tender.publish',
    'bid.technical.evaluate',
    'bid.financial.evaluate',
    'award.recommend',
    'purchase_order.approve',
    'grn.approve',
    'invoice.approve',
    'payment.verify'
  ],
  PROCUREMENT_OFFICER: [
    'requirement.create',
    'requirement.publish',
    'tender.create',
    'tender.update',
    'tender.publish',
    'purchase_order.approve',
    'award.recommend'
  ],
  FINANCE_OFFICER: [
    'invoice.view',
    'invoice.approve',
    'payment.view',
    'payment.initiate',
    'payment.verify',
    'escrow.release',
    'purchase_order.approve'
  ],
  TECHNICAL_OFFICER: ['bid.technical.evaluate', 'grn.view', 'grn.create', 'grn.approve'],
  LOGISTICS_OFFICER: ['grn.view', 'grn.create', 'grn.approve', 'purchase_order.view'],
  VIEWER: ['dashboard.view', 'organization.view', 'report.view']
};

export const requireOrgRole = (...allowedRoles: OrgRole[]) => {
  return async (req: AuthRequest, res: Response, next: NextFunction) => {
    if (!req.user) {
      return apiResponse.error(res, 401, 'Authentication required', 'AUTH_REQUIRED');
    }

    if (isMasterAdmin(req.user)) return next();

    const orgId = req.user.organizationId;
    if (!orgId) {
      return apiResponse.error(res, 403, 'You must belong to an organisation to perform this action.', 'ORG_REQUIRED');
    }

    const membership = await prisma.orgMembership.findUnique({
      where: { userId_organizationId: { userId: req.user.id, organizationId: orgId } },
      select: { orgRole: true, isActive: true }
    });

    if (!membership || !membership.isActive) {
      return apiResponse.error(res, 403, 'You are not an active member of this organisation.', 'ORG_MEMBERSHIP_INACTIVE');
    }

    const requiredPermissions = Array.from(new Set(
      allowedRoles.flatMap(role => LEGACY_ORG_ROLE_PERMISSION_HINTS[String(role)] || [])
    ));
    const dynamicPermissions = await getActivePermissionCodes(req.user.id, { scopeType: 'ORGANIZATION', scopeId: orgId });
    const allowed = dynamicPermissions.includes('*') || requiredPermissions.some(permission => dynamicPermissions.includes(permission));

    if (!allowed) {
      return apiResponse.error(
        res,
        403,
        `Missing one of required permissions: ${requiredPermissions.join(', ') || 'unmapped legacy org permission'}.`,
        'PERMISSION_DENIED',
        { requiredPermissions }
      );
    }

    (req as any).orgMembership = membership;
    (req as any).orgRole = membership.orgRole;
    (req as any).orgPermissions = dynamicPermissions;
    return next();
  };
};
