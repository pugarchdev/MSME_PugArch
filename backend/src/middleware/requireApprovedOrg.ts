/**
 * requireApprovedOrg — enforces read-only mode for organisations that have
 * not yet been approved by the platform admin.
 *
 * GET / HEAD / OPTIONS requests are always allowed (read-only browsing).
 * All mutation methods (POST, PUT, PATCH, DELETE) are blocked with 403
 * until the organisation's verificationStatus is 'APPROVED'.
 *
 * Platform admins and users without an organisationId bypass this check.
 */
import type { NextFunction, Response } from 'express';
import prisma from '../config/prisma.js';
import { apiResponse } from '../utils/apiResponse.js';
import type { AuthRequest } from './authenticate.js';

const READ_METHODS = new Set(['GET', 'HEAD', 'OPTIONS']);

export const requireApprovedOrg = async (
    req: AuthRequest,
    res: Response,
    next: NextFunction
) => {
    // Read-only methods always pass
    if (READ_METHODS.has(req.method)) return next();

    // No user or platform admin — bypass
    if (!req.user || req.user.role === 'admin') return next();

    const orgId = req.user.organizationId;
    // Individual users without an org — bypass
    if (!orgId) return next();

    const org = await prisma.organization.findUnique({
        where: { id: orgId },
        select: { verificationStatus: true, organizationName: true }
    });

    if (!org) return next();

    if (org.verificationStatus !== 'VERIFIED') {
        return apiResponse.error(
            res,
            403,
            'Your organisation is pending platform approval. You have read-only access until approved.',
            'ORG_PENDING_APPROVAL'
        );
    }
    return next();
};
