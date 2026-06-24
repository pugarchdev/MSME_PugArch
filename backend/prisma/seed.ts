import '../src/config/env.js';
import { PrismaClient } from '@prisma/client';
import bcrypt from 'bcryptjs';
import { MASTER_FEATURES } from '../src/constants/permissions.js';

const prisma = new PrismaClient();

const roles = [
  ['MASTER_ADMIN', 'Master Admin', 'Super owner for all companies, features, content, and permissions'],
  ['SUPER_ADMIN', 'Super Admin', 'Full platform administration'],
  ['ADMIN', 'Admin', 'Operational platform administration'],
  ['VERIFICATION_OFFICER', 'Verification Officer', 'KYC/KYB verification review'],
  ['BUYER', 'Buyer', 'Buyer organization user'],
  ['SELLER', 'Seller', 'Seller organization user'],
  ['FINANCE_OFFICER', 'Finance Officer', 'Invoice, payment, and escrow operations'],
  ['AUDITOR', 'Auditor', 'Read-only audit and compliance review'],
  ['SUPPORT_AGENT', 'Support Agent', 'Support, grievance, and dispute triage'],
  ['FINANCIER', 'Financier', 'Financing partner for invoice factoring / bill discounting']
] as const;

const permissions = [
  ['user.view', 'user', 'View users'],
  ['user.create', 'user', 'Create platform users'],
  ['user.update', 'user', 'Update users'],
  ['user.delete', 'user', 'Delete or deactivate users'],
  ['role.assign', 'role', 'Assign roles to users'],
  ['permission.manage', 'permission', 'Manage permission matrix'],
  ['buyer.approve', 'buyer', 'Approve buyer onboarding'],
  ['seller.verify', 'seller', 'Verify seller onboarding'],
  ['report.export', 'reports', 'Export reports'],
  ['feature.toggle', 'features', 'Enable or disable company features'],
  ['company.manage', 'company', 'Manage companies and districts'],
  ['content.update', 'content', 'Update CMS content'],
  ['branding.update', 'branding', 'Update branding settings'],
  ['organization.manage', 'organization', 'Manage organizations'],
  ['override', 'system', 'Override normal portal restrictions'],
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
  MASTER_ADMIN: permissions.map(([code]) => code),
  SUPER_ADMIN: permissions.map(([code]) => code),
  ADMIN: permissions.map(([code]) => code).filter((code) => code !== 'escrow.release'),
  VERIFICATION_OFFICER: ['onboarding.review', 'compliance.review', 'fraud.review', 'audit.view'],
  BUYER: ['requirement.create', 'tender.create', 'tender.publish', 'po.generate', 'inspection.create', 'payment.initiate', 'dispute.manage'],
  SELLER: ['seller.catalogue.create', 'bid.submit', 'delivery.update', 'invoice.submit', 'dispute.manage'],
  FINANCE_OFFICER: ['invoice.verify', 'payment.initiate', 'escrow.release', 'audit.view'],
  AUDITOR: ['audit.view', 'admin.reports.view', 'compliance.review', 'fraud.review'],
  SUPPORT_AGENT: ['dispute.manage', 'compliance.review'],
  FINANCIER: []
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

const marketplaceCategories = [
  { name: 'Electrical & Electronics', type: 'BOTH', displayOrder: 10 },
  { name: 'Mechanical & Engineering', type: 'BOTH', displayOrder: 20 },
  { name: 'Construction & Building Materials', type: 'PRODUCT', displayOrder: 30 },
  { name: 'Industrial Chemicals', type: 'PRODUCT', displayOrder: 40 },
  { name: 'Refractories', type: 'PRODUCT', displayOrder: 50 },
  { name: 'Automobile Parts & Services', type: 'BOTH', displayOrder: 60 },
  { name: 'Tyres & Rubber Products', type: 'PRODUCT', displayOrder: 70 },
  { name: 'IT & Computer Equipment', type: 'PRODUCT', displayOrder: 80 },
  { name: 'Office Equipment & Stationery', type: 'PRODUCT', displayOrder: 90 },
  { name: 'Medical & Healthcare Supplies', type: 'PRODUCT', displayOrder: 100 },
  { name: 'Agriculture & Nursery', type: 'BOTH', displayOrder: 110 },
  { name: 'Safety Equipment & Industrial Safety', type: 'PRODUCT', displayOrder: 120 },
  { name: 'Fuel, Oil & Gas', type: 'PRODUCT', displayOrder: 130 },
  { name: 'Hydraulics & Pneumatics', type: 'PRODUCT', displayOrder: 140 },
  { name: 'Steel & Metal Products', type: 'PRODUCT', displayOrder: 150 },
  { name: 'Cement & Concrete Products', type: 'PRODUCT', displayOrder: 160 },
  { name: 'Pipes, Tiles & Hardware', type: 'PRODUCT', displayOrder: 170 },
  { name: 'Industrial Machinery & Spare Parts', type: 'PRODUCT', displayOrder: 180 },
  { name: 'Automation & Robotics', type: 'BOTH', displayOrder: 190 },
  { name: 'Fabrication & Welding Services', type: 'SERVICE', displayOrder: 200 },
  { name: 'Bearings & Mechanical Components', type: 'PRODUCT', displayOrder: 210 },
  { name: 'Electrical Cables & Power Equipment', type: 'PRODUCT', displayOrder: 220 },
  { name: 'Industrial Consumables', type: 'PRODUCT', displayOrder: 230 },
  { name: 'Packaging & Printing', type: 'BOTH', displayOrder: 240 },
  { name: 'Polymer & Plastic Products', type: 'PRODUCT', displayOrder: 250 },
  { name: 'Trading & Distribution', type: 'SERVICE', displayOrder: 260 },
  { name: 'Logistics & Supply Services', type: 'SERVICE', displayOrder: 270 },
  { name: 'Tools & Industrial Hardware', type: 'PRODUCT', displayOrder: 280 },
  { name: 'Laboratory Equipment & Chemicals', type: 'PRODUCT', displayOrder: 290 },
  { name: 'Engineering Consultancy Services', type: 'SERVICE', displayOrder: 300 },
  { name: 'Industrial Maintenance Services', type: 'SERVICE', displayOrder: 310 },
  { name: 'Construction & Civil Work Services', type: 'SERVICE', displayOrder: 320 },
  { name: 'Environmental & Waste Management', type: 'SERVICE', displayOrder: 330 },
  { name: 'Telecom & Communication Equipment', type: 'PRODUCT', displayOrder: 340 },
  { name: 'Furniture & Interior Supplies', type: 'PRODUCT', displayOrder: 350 },
  { name: 'General Industrial Supplier', type: 'BOTH', displayOrder: 360 },
  { name: 'Mining & Coal Equipment', type: 'PRODUCT', displayOrder: 370 },
  { name: 'Power & Energy Equipment', type: 'PRODUCT', displayOrder: 380 },
  { name: 'Gas Equipment & Cylinders', type: 'PRODUCT', displayOrder: 390 },
  { name: 'Conveyor & Material Handling Equipment', type: 'PRODUCT', displayOrder: 400 },
  { name: 'Pumps, Motors & Hydraulics', type: 'PRODUCT', displayOrder: 410 },
  { name: 'Industrial Seals & Gaskets', type: 'PRODUCT', displayOrder: 420 },
  { name: 'Welding & Cutting Equipment', type: 'PRODUCT', displayOrder: 430 },
  { name: 'Industrial Fasteners & Components', type: 'PRODUCT', displayOrder: 440 },
  { name: 'Retail & Commercial Supply', type: 'BOTH', displayOrder: 450 },
  { name: 'FMCG & Daily Utility Supply', type: 'PRODUCT', displayOrder: 460 },
  { name: 'Textile & Garments Supply', type: 'PRODUCT', displayOrder: 470 },
  { name: 'OEM / Manufacturing Vendor', type: 'BOTH', displayOrder: 480 },
  { name: 'Repair & Service Provider', type: 'SERVICE', displayOrder: 490 },
  { name: 'Multi-category Industrial Vendor', type: 'BOTH', displayOrder: 500 }
] as const;

const slugFor = (name: string) =>
  name.trim().toLowerCase().replace(/&/g, 'and').replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');

async function main() {
  const roleRecords = new Map<string, { id: number }>();
  const permissionRecords = new Map<string, { id: number }>();

  for (const [code, name, description] of roles) {
    const role = await prisma.rbacRole.upsert({
      where: { code },
      update: { name, description, isSystemRole: true, scope: 'GLOBAL' },
      create: { code, name, description, isSystemRole: true, scope: 'GLOBAL' },
      select: { id: true }
    });
    roleRecords.set(code, role);
  }

  for (const [code, module, description] of permissions) {
    const action = code.includes('.') ? code.split('.').pop() : null;
    const permission = await prisma.permission.upsert({
      where: { code },
      update: { module, description, action },
      create: { code, module, description, action },
      select: { id: true }
    });
    permissionRecords.set(code, permission);
  }

  const masterEmail = process.env.MASTER_ADMIN_EMAIL;
  const masterPassword = process.env.MASTER_ADMIN_PASSWORD;
  if (masterEmail && masterPassword) {
    const passwordHash = await bcrypt.hash(masterPassword, 12);
    const masterUser = await prisma.user.upsert({
      where: { email: masterEmail },
      update: {
        name: process.env.MASTER_ADMIN_NAME || 'Master Admin',
        password: passwordHash,
        role: 'master_admin' as any,
        registrationStatus: 'completed',
        onboardingStatus: 'approved_for_procurement',
        accountStatus: 'ACTIVE',
        companyId: null
      },
      create: {
        name: process.env.MASTER_ADMIN_NAME || 'Master Admin',
        email: masterEmail,
        userId: 'MASTER_ADMIN',
        password: passwordHash,
        role: 'master_admin' as any,
        registrationStatus: 'completed',
        onboardingStatus: 'approved_for_procurement',
        accountStatus: 'ACTIVE',
        companyId: null
      },
      select: { id: true }
    });
    const masterRole = roleRecords.get('MASTER_ADMIN');
    if (masterRole) {
      const existingAssignment = await (prisma as any).userRole.findFirst({
        where: { userId: masterUser.id, roleId: masterRole.id, companyId: null, organizationId: null },
        select: { id: true }
      });
      if (existingAssignment) {
        await (prisma as any).userRole.update({ where: { id: existingAssignment.id }, data: { isActive: true } });
      } else {
        await (prisma as any).userRole.create({ data: { userId: masterUser.id, roleId: masterRole.id, isActive: true } });
      }
    }
  }

  const rolePermissionRows: Array<{ roleId: number; permissionId: number }> = [];
  for (const [roleCode, permissionCodes] of Object.entries(rolePermissionCodes)) {
    const role = roleRecords.get(roleCode);
    if (!role) continue;

    for (const permissionCode of permissionCodes) {
      const permission = permissionRecords.get(permissionCode);
      if (!permission) continue;
      rolePermissionRows.push({ roleId: role.id, permissionId: permission.id });
    }
  }
  await prisma.rolePermission.createMany({
    data: rolePermissionRows,
    skipDuplicates: true
  });

  for (const [code, title, description, severity] of complianceRules) {
    await prisma.complianceRule.upsert({
      where: { code },
      update: { title, description, severity, isActive: true },
      create: { code, title, description, severity, isActive: true }
    });
  }

  for (const [code, name, module] of MASTER_FEATURES) {
    await prisma.feature.upsert({
      where: { code },
      update: { name, module, isSystem: true },
      create: { code, name, module, isSystem: true }
    });
  }

  const companies = await prisma.company.findMany({ select: { id: true } });
  const allFeatures = await prisma.feature.findMany({ select: { id: true } });
  if (companies.length > 0 && allFeatures.length > 0) {
    const companyFeatureData = [];
    for (const company of companies) {
      for (const feature of allFeatures) {
        companyFeatureData.push({
          companyId: company.id,
          featureId: feature.id,
          enabled: true
        });
      }
    }
    await prisma.companyFeature.createMany({
      data: companyFeatureData,
      skipDuplicates: true
    });
  }

  for (const category of marketplaceCategories) {
    await prisma.category.upsert({
      where: { slug: slugFor(category.name) },
      update: {
        name: category.name,
        type: category.type,
        displayOrder: category.displayOrder,
        isActive: true
      },
      create: {
        name: category.name,
        slug: slugFor(category.name),
        type: category.type,
        displayOrder: category.displayOrder,
        isActive: true
      }
    });
  }

  const newSlugs = marketplaceCategories.map(c => slugFor(c.name));
  await prisma.category.updateMany({
    where: { slug: { notIn: newSlugs } },
    data: { isActive: false }
  });

  const preservedPlatformUsers = await prisma.user.findMany({
    where: { role: { in: ['admin', 'master_admin'] as any } },
    select: { id: true, role: true }
  });

  for (const user of preservedPlatformUsers) {
    const roleCode = String(user.role).toUpperCase();
    const role = roleRecords.get(roleCode);
    if (!role) continue;
    const existingAssignment = await (prisma as any).userRole.findFirst({
      where: { userId: user.id, roleId: role.id, companyId: null, organizationId: null },
      select: { id: true }
    });
    if (existingAssignment) {
      await (prisma as any).userRole.update({ where: { id: existingAssignment.id }, data: { isActive: true } });
    } else {
      await (prisma as any).userRole.create({ data: { userId: user.id, roleId: role.id, isActive: true } });
    }
  }

  const counts = await Promise.all([
    prisma.rbacRole.count(),
    prisma.permission.count(),
    prisma.rolePermission.count(),
    (prisma as any).userRole.count(),
    prisma.complianceRule.count(),
    prisma.feature.count(),
    prisma.category.count()
  ]);

  console.log(JSON.stringify({
    roles: counts[0],
    permissions: counts[1],
    rolePermissions: counts[2],
    userRoles: counts[3],
    complianceRules: counts[4],
    features: counts[5],
    categories: counts[6]
  }, null, 2));
}

main()
  .catch((error) => {
    console.error('Seed failed', error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
