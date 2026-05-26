/**
 * requireOrgRole — checks that the authenticated user holds one of the
 * specified intra-organisation roles in their current organisation.
 *
 * Platform admins bypass this check entirely (they can do everything).
 * Users without an organisationId are rejected unless the route explicitly
 * allows individual users.
 */
import type { NextFunction, Response } from 'express';
import type { OrgRole } from '@prisma/client';
import prisma from '../config/prisma.js';
import { apiResponse } from '../utils/apiResponse.js';
import type { AuthRequest } from './authenticate.js';

export const requireOrgRole = (...allowedRoles: OrgRole[]) => {
    return async (req: AuthRequest, res: Response, next: NextFunction) => {
        if (!req.user) {
            return apiResponse.error(res, 401, 'Authentication required', 'AUTH_REQUIRED');
        }

        // Platform admins bypass org-role checks
        if (req.user.role === 'admin') return next();

        const orgId = req.user.organizationId;
        if (!orgId) {
            return apiResponse.error(
                res,
                403,
                'You must belong to an organisation to perform this action.',
                'ORG_REQUIRED'
            );
        }

        const membership = await prisma.orgMembership.findUnique({
            where: { userId_organizationId: { userId: req.user.id, organizationId: orgId } },
            select: { orgRole: true, isActive: true }
        });

        if (!membership || !membership.isActive) {
            return apiResponse.error(
                res,
                403,
                'You are not an active member of this organisation.',
                'ORG_MEMBERSHIP_INACTIVE'
            );
        }

        if (!allowedRoles.includes(membership.orgRole)) {
            return apiResponse.error(
                res,
                403,
                `This action requires one of the following roles: ${allowedRoles.join(', ')}.`,
                'ORG_ROLE_INSUFFICIENT'
            );
        }

        // Attach orgRole to request for downstream use
        (req as any).orgRole = membership.orgRole;
        return next();
    };
};
