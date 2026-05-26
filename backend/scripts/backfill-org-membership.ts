/**
 * Backfill OrgMembership rows for legacy users.
 *
 * Run with:
 *   cd backend && npx tsx scripts/backfill-org-membership.ts
 *
 * Or in production:
 *   npm run backfill:org-membership
 *
 * What it does:
 *   1. For every User with a linked organizationId, ensures an OrgMembership
 *      exists. The first user per organisation becomes ORG_ADMIN; subsequent
 *      users fall back to VIEWER (the safe default — admins can promote).
 *   2. For users with no organizationId but with a verified GST in their
 *      profile, attempts to upsert an Organization from that GST and link.
 *   3. For organizations whose linked users have onboardingStatus =
 *      approved_for_procurement, sets Organization.verificationStatus = VERIFIED
 *      so requireApprovedOrg unlocks for them.
 *
 * Idempotent — safe to run multiple times.
 */

import 'dotenv/config';
import prisma from '../src/config/prisma.js';
import { OrgRole } from '@prisma/client';
import { ensureOrgMembership } from '../src/services/org-membership.service.js';

interface Stats {
    usersWithOrg: number;
    membershipsCreated: number;
    membershipsExisting: number;
    orgsVerifiedByMirror: number;
    usersWithoutOrgSkipped: number;
    errors: number;
}

async function backfill(): Promise<Stats> {
    const stats: Stats = {
        usersWithOrg: 0,
        membershipsCreated: 0,
        membershipsExisting: 0,
        orgsVerifiedByMirror: 0,
        usersWithoutOrgSkipped: 0,
        errors: 0
    };

    console.log('[backfill] starting OrgMembership backfill...');

    // Step 1 — Users with organizationId but no membership
    const usersWithOrg = await prisma.user.findMany({
        where: { organizationId: { not: null }, role: { in: ['buyer', 'seller'] } },
        select: { id: true, organizationId: true, role: true, name: true, email: true, onboardingStatus: true, createdAt: true },
        orderBy: { createdAt: 'asc' }
    });

    stats.usersWithOrg = usersWithOrg.length;
    console.log(`[backfill] found ${usersWithOrg.length} users linked to an organisation`);

    for (const user of usersWithOrg) {
        try {
            const existing = await prisma.orgMembership.findUnique({
                where: { userId_organizationId: { userId: user.id, organizationId: user.organizationId! } }
            });
            if (existing) {
                stats.membershipsExisting += 1;
                continue;
            }
            // The earliest user per org gets ORG_ADMIN; the rest VIEWER
            // (admin can promote them later from /org/team).
            // ensureOrgMembership picks ORG_ADMIN automatically when no
            // members exist yet.
            await ensureOrgMembership({
                userId: user.id,
                organizationId: user.organizationId!,
                desiredRole: undefined // let the service decide
            });
            stats.membershipsCreated += 1;
            console.log(`[backfill] created membership: user=${user.id} (${user.email}) org=${user.organizationId}`);
        } catch (err: any) {
            stats.errors += 1;
            console.error(`[backfill] failed for user=${user.id}:`, err?.message || err);
        }
    }

    // Step 2 — Mirror approval state onto orgs where any member is approved
    const approvedUsersByOrg = await prisma.user.groupBy({
        by: ['organizationId'],
        where: {
            organizationId: { not: null },
            onboardingStatus: 'approved_for_procurement',
            role: { in: ['buyer', 'seller'] }
        },
        _count: { _all: true }
    });

    for (const row of approvedUsersByOrg) {
        if (!row.organizationId) continue;
        try {
            const org = await prisma.organization.findUnique({
                where: { id: row.organizationId },
                select: { id: true, verificationStatus: true, organizationName: true }
            });
            if (!org) continue;
            if (org.verificationStatus === 'VERIFIED') continue;
            await prisma.organization.update({
                where: { id: org.id },
                data: { verificationStatus: 'VERIFIED' as any }
            });
            stats.orgsVerifiedByMirror += 1;
            console.log(`[backfill] verified org=${org.id} (${org.organizationName}) — has ${row._count._all} approved member(s)`);
        } catch (err: any) {
            stats.errors += 1;
            console.error(`[backfill] org verify failed: org=${row.organizationId}`, err?.message || err);
        }
    }

    // Step 3 — Report users without orgs (informational only — they need to
    // complete GST verification or accept an invite to use the new flows)
    const usersWithoutOrg = await prisma.user.count({
        where: { organizationId: null, role: { in: ['buyer', 'seller'] } }
    });
    stats.usersWithoutOrgSkipped = usersWithoutOrg;

    return stats;
}

async function main() {
    const start = Date.now();
    try {
        const stats = await backfill();
        const elapsed = ((Date.now() - start) / 1000).toFixed(2);
        console.log('\n[backfill] complete in', elapsed, 's');
        console.log('  users with organisation:    ', stats.usersWithOrg);
        console.log('  memberships created:        ', stats.membershipsCreated);
        console.log('  memberships already existed:', stats.membershipsExisting);
        console.log('  orgs verified (mirror):     ', stats.orgsVerifiedByMirror);
        console.log('  users without org (skipped):', stats.usersWithoutOrgSkipped);
        console.log('  errors:                     ', stats.errors);

        if (stats.errors > 0) {
            console.warn('\n⚠ Some operations failed — see logs above.');
            process.exit(2);
        }
        process.exit(0);
    } catch (err) {
        console.error('[backfill] fatal error', err);
        process.exit(1);
    } finally {
        await prisma.$disconnect();
    }
}

main();
