/**
 * Org Membership service — single source of truth for creating
 * OrgMembership rows.
 *
 * Used in three places:
 *   1. Backfill script (creates memberships for legacy users)
 *   2. GST-verify hook (when a user gets linked to an Organization)
 *   3. Admin onboarding approval (idempotent insurance)
 *
 * Rule: every (user, organization) pair gets exactly one OrgMembership.
 * The first user for an org is ORG_ADMIN; subsequent users get a sensible
 * default OrgRole based on their platform role:
 *   - admin platform role  → not applicable (admins have no membership)
 *   - buyer / seller       → ORG_ADMIN if first; otherwise inherit invitee role
 *
 * For the backfill, every existing user becomes ORG_ADMIN of their org —
 * the assumption is that legacy users were the only person on their account
 * before multi-tenant roles existed.
 */

import prisma from '../config/prisma.js';
import { OrgRole } from '@prisma/client';

export interface EnsureMembershipParams {
    userId: number;
    organizationId: number;
    /** Role to assign if creating; ignored if a membership already exists. */
    desiredRole?: OrgRole;
    /** Who triggered the creation. Optional. */
    invitedById?: number | null;
    /** Override: when true, will upgrade an existing membership's role. */
    upgrade?: boolean;
}

/**
 * Ensure (user, organization) has an OrgMembership. Idempotent — safe to call
 * multiple times. Returns the membership row.
 */
export async function ensureOrgMembership(params: EnsureMembershipParams) {
    const existing = await prisma.orgMembership.findUnique({
        where: {
            userId_organizationId: {
                userId: params.userId,
                organizationId: params.organizationId
            }
        }
    });

    if (existing) {
        // If caller wants to upgrade and the desired role is "higher", apply it.
        if (params.upgrade && params.desiredRole && roleRank(params.desiredRole) > roleRank(existing.orgRole)) {
            return prisma.orgMembership.update({
                where: { id: existing.id },
                data: { orgRole: params.desiredRole, isActive: true }
            });
        }
        // Re-activate if it was deactivated.
        if (!existing.isActive) {
            return prisma.orgMembership.update({
                where: { id: existing.id },
                data: { isActive: true }
            });
        }
        return existing;
    }

    // Decide the role: explicit > first-user-is-admin > VIEWER fallback
    let role: OrgRole = params.desiredRole || OrgRole.VIEWER;
    if (!params.desiredRole) {
        const memberCount = await prisma.orgMembership.count({
            where: { organizationId: params.organizationId }
        });
        if (memberCount === 0) role = OrgRole.ORG_ADMIN;
    }

    const now = new Date();
    return prisma.orgMembership.create({
        data: {
            userId: params.userId,
            organizationId: params.organizationId,
            orgRole: role,
            isActive: true,
            invitedById: params.invitedById ?? null,
            invitedAt: now,
            acceptedAt: now
        }
    });
}

/**
 * Hook called when a user is linked to an organisation for the first time
 * (e.g. after GST verification). Creates the membership as ORG_ADMIN if no
 * other members exist for that org yet, otherwise as VIEWER.
 */
export async function onUserLinkedToOrganization(userId: number, organizationId: number) {
    return ensureOrgMembership({ userId, organizationId });
}

const RANK: Record<OrgRole, number> = {
    ORG_ADMIN: 6,
    PROCUREMENT_OFFICER: 5,
    FINANCE_OFFICER: 4,
    TECHNICAL_OFFICER: 3,
    LOGISTICS_OFFICER: 2,
    VIEWER: 1
};

const roleRank = (r: OrgRole) => RANK[r] ?? 0;
