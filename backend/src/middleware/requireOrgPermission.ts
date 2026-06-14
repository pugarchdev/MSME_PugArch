import type { NextFunction, Response } from 'express';
import { OrgRole } from '@prisma/client';
import prisma from '../config/prisma.js';
import { apiResponse } from '../utils/apiResponse.js';
import { FALLBACK_ORG_ROLE_PERMISSIONS, type OrgPermissionKey } from '../constants/org-permissions.js';
import type { AuthRequest } from './authenticate.js';

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
  if (membership.orgRole === OrgRole.ORG_ADMIN) {
    return { membership, permissions: ['*'] };
  }

  const customPermissions = membership.customRole?.isActive
    ? membership.customRole.permissions.filter(row => row.allowed).map(row => row.permissionKey)
    : [];

  return {
    membership,
    permissions: customPermissions.length > 0
      ? customPermissions
      : (FALLBACK_ORG_ROLE_PERMISSIONS[membership.orgRole] || [])
  };
};

export const requireOrgPermission = (permissionKey: OrgPermissionKey) => {
  return async (req: AuthRequest, res: Response, next: NextFunction) => {
    if (!req.user) return apiResponse.error(res, 401, 'Authentication required', 'AUTH_REQUIRED');
    if (['admin', 'master_admin'].includes(req.user.role)) return next();

    const organizationId = req.user.organizationId;
    if (!organizationId) {
      return apiResponse.error(res, 403, 'You must belong to an organisation to perform this action.', 'ORG_REQUIRED');
    }

    const { membership, permissions } = await getOrgPermissionKeys(req.user.id, organizationId);
    if (!membership || !membership.isActive) {
      return apiResponse.error(res, 403, 'You are not an active member of this organisation.', 'ORG_MEMBERSHIP_INACTIVE');
    }

    if (!permissions.includes('*') && !permissions.includes(permissionKey)) {
      return apiResponse.error(res, 403, `Missing organization permission: ${permissionKey}`, 'ORG_PERMISSION_DENIED');
    }

    (req as any).orgMembership = membership;
    (req as any).orgPermissions = permissions;
    return next();
  };
};
