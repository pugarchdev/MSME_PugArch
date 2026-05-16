import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

const roles = [
  ['SUPER_ADMIN', 'Super Admin', 'Full platform administration'],
  ['ADMIN', 'Admin', 'Operational platform administration'],
  ['VERIFICATION_OFFICER', 'Verification Officer', 'KYC/KYB verification review'],
  ['BUYER', 'Buyer', 'Buyer organization user'],
  ['SELLER', 'Seller', 'Seller organization user'],
  ['FINANCE_OFFICER', 'Finance Officer', 'Invoice, payment, and escrow operations'],
  ['AUDITOR', 'Auditor', 'Read-only audit and compliance review'],
  ['SUPPORT_AGENT', 'Support Agent', 'Support, grievance, and dispute triage']
] as const;

const permissions = [
  ['user.create', 'user', 'Create platform users'],
  ['user.block', 'user', 'Block or suspend users'],
  ['onboarding.review', 'onboarding', 'Review onboarding submissions'],
  ['seller.catalogue.create', 'catalogue', 'Create seller catalogue entries'],
  ['requirement.create', 'requirements', 'Create procurement requirements'],
  ['tender.create', 'tenders', 'Create tenders'],
  ['tender.publish', 'tenders', 'Publish tenders'],
  ['bid.submit', 'bids', 'Submit bids'],
  ['bid.evaluate', 'bids', 'Evaluate bids'],
  ['po.generate', 'purchase-orders', 'Generate purchase orders'],
  ['delivery.update', 'delivery', 'Update delivery status'],
  ['inspection.create', 'inspection', 'Create inspection records'],
  ['invoice.submit', 'invoices', 'Submit invoices'],
  ['invoice.verify', 'invoices', 'Verify invoices'],
  ['payment.initiate', 'payments', 'Initiate payments'],
  ['escrow.release', 'escrow', 'Release escrow funds'],
  ['dispute.manage', 'disputes', 'Manage disputes'],
  ['audit.view', 'audit', 'View audit logs'],
  ['admin.reports.view', 'admin', 'View admin reports'],
  ['compliance.review', 'compliance', 'Review compliance flags'],
  ['fraud.review', 'fraud', 'Review fraud alerts']
] as const;

const rolePermissionCodes: Record<string, string[]> = {
  SUPER_ADMIN: permissions.map(([code]) => code),
  ADMIN: permissions.map(([code]) => code).filter((code) => code !== 'escrow.release'),
  VERIFICATION_OFFICER: ['onboarding.review', 'compliance.review', 'fraud.review', 'audit.view'],
  BUYER: ['requirement.create', 'tender.create', 'tender.publish', 'po.generate', 'inspection.create', 'payment.initiate', 'dispute.manage'],
  SELLER: ['seller.catalogue.create', 'bid.submit', 'delivery.update', 'invoice.submit', 'dispute.manage'],
  FINANCE_OFFICER: ['invoice.verify', 'payment.initiate', 'escrow.release', 'audit.view'],
  AUDITOR: ['audit.view', 'admin.reports.view', 'compliance.review', 'fraud.review'],
  SUPPORT_AGENT: ['dispute.manage', 'compliance.review']
};

const complianceRules = [
  ['MISSING_REQUIRED_DOCUMENT', 'Missing required document', 'A mandatory onboarding or verification document is missing.', 'HIGH'],
  ['EXPIRED_CERTIFICATE', 'Expired certificate', 'A certificate or statutory document is expired.', 'MEDIUM'],
  ['DUPLICATE_IDENTIFIER', 'Duplicate identifier', 'A PAN, GST, bank, or Aadhaar hash appears on multiple unrelated profiles.', 'HIGH'],
  ['INVALID_GST', 'Invalid GST', 'GST verification failed or returned inconsistent data.', 'HIGH'],
  ['INVALID_PAN', 'Invalid PAN', 'PAN verification failed or returned inconsistent data.', 'HIGH'],
  ['INVALID_BANK', 'Invalid bank details', 'Bank account verification failed or returned inconsistent data.', 'HIGH'],
  ['SUSPICIOUS_REGISTRATION', 'Suspicious registration', 'Registration pattern requires manual compliance review.', 'CRITICAL'],
  ['POLICY_VIOLATION', 'Policy violation', 'A platform policy or procurement control was violated.', 'HIGH']
] as const;

const categories = [
  ['IT Equipment', 'it-equipment', 'PRODUCT'],
  ['Office Supplies', 'office-supplies', 'PRODUCT'],
  ['Machinery', 'machinery', 'PRODUCT'],
  ['Services', 'services', 'SERVICE'],
  ['Construction', 'construction', 'BOTH'],
  ['Consulting', 'consulting', 'SERVICE'],
  ['Furniture', 'furniture', 'PRODUCT'],
  ['Medical Supplies', 'medical-supplies', 'PRODUCT'],
  ['Logistics', 'logistics', 'SERVICE'],
  ['Software & Cloud', 'software-cloud', 'BOTH']
] as const;

async function main() {
  const roleRecords = new Map<string, { id: number }>();
  const permissionRecords = new Map<string, { id: number }>();

  for (const [code, name, description] of roles) {
    const role = await prisma.rbacRole.upsert({
      where: { code },
      update: { name, description, isSystemRole: true },
      create: { code, name, description, isSystemRole: true },
      select: { id: true }
    });
    roleRecords.set(code, role);
  }

  for (const [code, module, description] of permissions) {
    const permission = await prisma.permission.upsert({
      where: { code },
      update: { module, description },
      create: { code, module, description },
      select: { id: true }
    });
    permissionRecords.set(code, permission);
  }

  for (const [roleCode, permissionCodes] of Object.entries(rolePermissionCodes)) {
    const role = roleRecords.get(roleCode);
    if (!role) continue;

    for (const permissionCode of permissionCodes) {
      const permission = permissionRecords.get(permissionCode);
      if (!permission) continue;

      await prisma.rolePermission.upsert({
        where: {
          roleId_permissionId: {
            roleId: role.id,
            permissionId: permission.id
          }
        },
        update: {},
        create: {
          roleId: role.id,
          permissionId: permission.id
        }
      });
    }
  }

  for (const [code, title, description, severity] of complianceRules) {
    await prisma.complianceRule.upsert({
      where: { code },
      update: { title, description, severity, isActive: true },
      create: { code, title, description, severity, isActive: true }
    });
  }

  for (const [name, slug, type] of categories) {
    await prisma.category.upsert({
      where: { slug },
      update: { name, type, isActive: true },
      create: { name, slug, type, isActive: true }
    });
  }
}

main()
  .finally(async () => {
    await prisma.$disconnect();
  })
  .catch(async (error) => {
    console.error('Seed failed', error);
    await prisma.$disconnect();
    process.exit(1);
  });
