/**
 * Admin script — attach a user to an organisation.
 *
 * Use cases:
 *   1. Unblock a tester whose GST verification hasn't been completed yet
 *      so they can use the cart / approval flows immediately.
 *   2. Move a user from one organisation to another (deactivates the old
 *      membership, creates a new ORG_ADMIN membership).
 *
 * Run with:
 *   tsx scripts/attach-user-to-org.ts --user-id 12 --org-id 5
 *   tsx scripts/attach-user-to-org.ts --user-id 12 --org-name "Acme Pvt Ltd"
 *   tsx scripts/attach-user-to-org.ts --email anand@example.com --org-name "Acme Pvt Ltd" --org-type STARTUP
 *
 * Or:
 *   npm run attach-user-to-org -- --email anand@example.com --org-name "Acme"
 *
 * Flags:
 *   --user-id <int>          Numeric user id (use either this or --email)
 *   --email <string>         User email (use either this or --user-id)
 *   --org-id <int>           Existing organisation id to attach to
 *   --org-name <string>      Org name to look up (or create with --create)
 *   --org-type <string>      OrganizationType when creating a new org (default STARTUP)
 *   --role <string>          OrgRole to assign (default ORG_ADMIN)
 *   --create                 If --org-name doesn't exist, create it (verified)
 *   --dry-run                Show what would happen without writing
 */

import 'dotenv/config';
import prisma from '../src/config/prisma.js';
import { OrgRole } from '@prisma/client';
import { ensureOrgMembership } from '../src/services/org-membership.service.js';

interface Args {
    userId?: number;
    email?: string;
    orgId?: number;
    orgName?: string;
    orgType?: string;
    role?: OrgRole;
    create?: boolean;
    dryRun?: boolean;
}

function parseArgs(): Args {
    const out: Args = {};
    const argv = process.argv.slice(2);
    for (let i = 0; i < argv.length; i += 1) {
        const flag = argv[i];
        const next = argv[i + 1];
        switch (flag) {
            case '--user-id':
                out.userId = Number(next);
                i += 1;
                break;
            case '--email':
                out.email = String(next).toLowerCase();
                i += 1;
                break;
            case '--org-id':
                out.orgId = Number(next);
                i += 1;
                break;
            case '--org-name':
                out.orgName = String(next);
                i += 1;
                break;
            case '--org-type':
                out.orgType = String(next).toUpperCase();
                i += 1;
                break;
            case '--role':
                out.role = String(next).toUpperCase() as OrgRole;
                i += 1;
                break;
            case '--create':
                out.create = true;
                break;
            case '--dry-run':
                out.dryRun = true;
                break;
            case '-h':
            case '--help':
                printUsage();
                process.exit(0);
        }
    }
    return out;
}

function printUsage() {
    console.log(`
Usage:
  tsx scripts/attach-user-to-org.ts --user-id <id> --org-id <id>
  tsx scripts/attach-user-to-org.ts --email <email> --org-name <name> [--create] [--org-type STARTUP]

Required: one of (--user-id | --email) AND one of (--org-id | --org-name)

Optional:
  --role ORG_ADMIN|PROCUREMENT_OFFICER|...   default ORG_ADMIN
  --create                                    create the org if --org-name doesn't exist
  --org-type STARTUP|MSME|...                 used only when --create is set
  --dry-run                                   show actions without writing
`);
}

async function main() {
    const args = parseArgs();

    if (!args.userId && !args.email) {
        console.error('✖ Missing user identifier. Pass --user-id or --email.');
        printUsage();
        process.exit(2);
    }
    if (!args.orgId && !args.orgName) {
        console.error('✖ Missing organisation identifier. Pass --org-id or --org-name.');
        printUsage();
        process.exit(2);
    }

    const role = (args.role || OrgRole.ORG_ADMIN) as OrgRole;
    const orgType = (args.orgType || 'STARTUP').toUpperCase();
    const dry = Boolean(args.dryRun);

    // Resolve user
    const user = await prisma.user.findFirst({
        where: args.userId ? { id: args.userId } : { email: args.email! },
        select: { id: true, name: true, email: true, role: true, organizationId: true }
    });
    if (!user) {
        console.error(`✖ User not found: ${JSON.stringify(args.userId ? { id: args.userId } : { email: args.email })}`);
        process.exit(3);
    }
    console.log(`▸ User: id=${user.id} email=${user.email} role=${user.role} currentOrg=${user.organizationId ?? 'none'}`);

    // Resolve / create org
    let org = args.orgId
        ? await prisma.organization.findUnique({ where: { id: args.orgId } })
        : await prisma.organization.findFirst({
            where: { organizationName: { equals: args.orgName!, mode: 'insensitive' }, deletedAt: null }
        });

    if (!org) {
        if (!args.create || !args.orgName) {
            console.error(`✖ Organisation not found: ${args.orgId ?? args.orgName}. Pass --create to create it.`);
            process.exit(4);
        }
        if (dry) {
            console.log(`[dry-run] would CREATE organisation: name="${args.orgName}" type=${orgType} status=VERIFIED`);
        } else {
            org = await prisma.organization.create({
                data: {
                    organizationName: args.orgName,
                    organizationType: orgType as any,
                    verificationStatus: 'VERIFIED' as any,
                    organizationOnboardingStatus: 'admin_attached'
                }
            });
            console.log(`✔ Created organisation: id=${org.id} name="${org.organizationName}"`);
        }
    } else {
        console.log(`▸ Org: id=${org.id} name="${org.organizationName}" status=${org.verificationStatus}`);
    }

    if (dry) {
        console.log(`[dry-run] would link user.id=${user.id} to org.id=${org?.id}`);
        console.log(`[dry-run] would create OrgMembership(role=${role}, isActive=true)`);
        console.log(`[dry-run] would set Organization.verificationStatus=VERIFIED`);
        await prisma.$disconnect();
        process.exit(0);
    }

    if (!org) {
        // Should not happen; satisfies type narrowing.
        console.error('✖ Org resolution failed unexpectedly.');
        process.exit(5);
    }

    // If the user has a different active org, deactivate the old membership so
    // permissions don't leak across orgs. We don't delete to preserve history.
    if (user.organizationId && user.organizationId !== org.id) {
        await prisma.orgMembership.updateMany({
            where: { userId: user.id, organizationId: user.organizationId, isActive: true },
            data: { isActive: false }
        });
        console.log(`▸ Deactivated old membership: user=${user.id} oldOrg=${user.organizationId}`);
    }

    await prisma.user.update({
        where: { id: user.id },
        data: { organizationId: org.id }
    });
    console.log(`✔ Linked user.organizationId=${org.id}`);

    const membership = await ensureOrgMembership({
        userId: user.id,
        organizationId: org.id,
        desiredRole: role,
        upgrade: true
    });
    console.log(`✔ OrgMembership: id=${membership.id} role=${membership.orgRole} active=${membership.isActive}`);

    // Mirror VERIFIED so the user actually unlocks the procurement features.
    if (org.verificationStatus !== 'VERIFIED') {
        await prisma.organization.update({
            where: { id: org.id },
            data: { verificationStatus: 'VERIFIED' as any }
        });
        console.log(`✔ Organisation verified: id=${org.id}`);
    }

    console.log('\n✔ Done. The user can now use cart, approvals, and other org-aware flows.');
    await prisma.$disconnect();
    process.exit(0);
}

main().catch(async (err) => {
    console.error('[attach-user-to-org] fatal error', err);
    await prisma.$disconnect();
    process.exit(1);
});
