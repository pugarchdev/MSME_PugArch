import 'dotenv/config';
import { PrismaClient } from '@prisma/client';
import bcrypt from 'bcryptjs';

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
  ['SUPPORT_AGENT', 'Support Agent', 'Support, grievance, and dispute triage']
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
  SUPPORT_AGENT: ['dispute.manage', 'compliance.review']
};

const features = [
  ['buyer-registration', 'Buyer Registration', 'registration'],
  ['seller-registration', 'Seller Registration', 'registration'],
  ['gst-verification', 'GST Verification', 'verification'],
  ['pan-verification', 'PAN Verification', 'verification'],
  ['aadhaar-verification', 'Aadhaar Verification', 'verification'],
  ['udyam-verification', 'Udyam Verification', 'verification'],
  ['cin-verification', 'CIN Verification', 'verification'],
  ['tender-management', 'Tender Management', 'procurement'],
  ['bid-submission', 'Bid Submission', 'procurement'],
  ['reverse-auction', 'Reverse Auction', 'procurement'],
  ['rate-contract', 'Rate Contract', 'procurement'],
  ['procurement-planning', 'Procurement Planning', 'procurement'],
  ['buyer-seller-matching', 'Buyer-Seller Matching', 'marketplace'],
  ['product-service-catalog', 'Product/Service Catalog', 'catalogue'],
  ['document-upload', 'Document Upload', 'documents'],
  ['document-verification', 'Document Verification', 'documents'],
  ['approval-workflow', 'Approval Workflow', 'workflow'],
  ['escrow-nodal-bank', 'Escrow/Nodal Bank Module', 'finance'],
  ['payment-module', 'Payment Module', 'finance'],
  ['razorpay-payment', 'Razorpay Payment', 'finance'],
  ['grievance-module', 'Grievance Module', 'support'],
  ['notifications', 'Notifications', 'communication'],
  ['email-otp', 'Email OTP', 'communication'],
  ['mobile-otp', 'Mobile OTP', 'communication'],
  ['reports-mis', 'Reports & MIS', 'reports'],
  ['dashboard-analytics', 'Dashboard Analytics', 'analytics'],
  ['audit-logs', 'Audit Logs', 'audit'],
  ['role-management', 'Role Management', 'access-control'],
  ['permission-management', 'Permission Management', 'access-control'],
  ['organization-management', 'Organization Management', 'organizations'],
  ['user-management', 'User Management', 'users'],
  ['compliance-risk', 'Compliance Risk', 'compliance'],
  ['procurement-readiness', 'Procurement Readiness', 'compliance'],
  ['lpi-logistics-partner', 'LPI / Logistics Partner Module', 'logistics'],
  ['search-filters', 'Search and Filters', 'search'],
  ['export-csv-pdf-excel', 'Export CSV/PDF/Excel', 'exports'],
  ['cms-content-management', 'CMS / Content Management', 'content'],
  ['branding-management', 'Branding Management', 'branding'],
  ['buyer-requirement-board', 'Enable buyer requirement board', 'requirements'],
  ['large-buyer-requirements-home', 'Enable large buyer requirements on home page', 'requirements'],
  ['requirement-posting', 'Enable requirement posting', 'requirements'],
  ['seller-response-requirements', 'Enable seller response to requirements', 'requirements'],
  ['guest-cart', 'Enable guest cart', 'cart'],
  ['cart-without-login', 'Enable cart without login', 'cart'],
  ['large-industries-section', 'Enable large industries section', 'organizations'],
  ['big-msmes-section', 'Enable big MSMEs section', 'organizations'],
  ['hamburger-sidebar', 'Enable hamburger sidebar', 'navigation'],
  ['organization-listing', 'Enable organization listing', 'organizations'],
  ['product-marketplace', 'Enable product marketplace', 'marketplace'],
  ['service-marketplace', 'Enable service marketplace', 'marketplace'],
  ['public-browsing', 'Enable public browsing', 'marketplace'],
  ['checkout', 'Enable checkout', 'cart'],
  ['request-quote', 'Enable request quote', 'quotations']
] as const;

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

  let defaultCompany = await (prisma as any).company.findFirst({
    where: { shortName: 'JSG' },
    select: { id: true }
  });
  if (!defaultCompany) {
    defaultCompany = await (prisma as any).company.create({
      data: {
        name: 'Jharsuguda District',
        shortName: 'JSG',
        portalDisplayName: 'JsgSmile',
        district: 'Jharsuguda',
        state: 'Odisha',
        homepageContent: 'Welcome to the district MSME procurement portal.',
        aboutContent: 'Digital procurement, onboarding, and supplier enablement for district MSMEs.',
        footerContent: 'JsgSmile MSME procurement portal',
        grievanceContent: 'Submit and track procurement grievances through the portal.',
        procurementPolicy: 'District procurement policy content can be managed by administrators.'
      },
      select: { id: true }
    });
  }

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

  for (const [code, name, module] of features) {
    const feature = await (prisma as any).feature.upsert({
      where: { code },
      update: { name, module, isSystem: true },
      create: { code, name, module, isSystem: true },
      select: { id: true }
    });
    await (prisma as any).companyFeature.upsert({
      where: { companyId_featureId: { companyId: defaultCompany.id, featureId: feature.id } },
      update: { enabled: true },
      create: { companyId: defaultCompany.id, featureId: feature.id, enabled: true }
    });
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

  const defaultPasswordHash = await bcrypt.hash('Pass@1234567', 12);
  const categoryRecords = await prisma.category.findMany({ take: 1 });
  const categoryId = categoryRecords.length > 0 ? categoryRecords[0].id : null;

  for (let i = 1; i <= 10; i++) {
    const orgName = `Seed Organization ${i}`;
    let org = await prisma.organization.findFirst({ where: { organizationName: orgName } });
    if (!org) {
      org = await prisma.organization.create({
        data: {
          organizationName: orgName,
          organizationType: 'PRIVATE_LIMITED',
          companyId: defaultCompany.id,
        }
      });
    }

    const sellerEmail = `seller${i}@gmail.com`;
    const buyerEmail = `buyer${i}@gmail.com`;

    const sellerUser = await prisma.user.upsert({
      where: { email: sellerEmail },
      update: { password: defaultPasswordHash, organizationId: org.id },
      create: {
        name: `Seller ${i}`,
        email: sellerEmail,
        userId: `SELLER_${i}`,
        password: defaultPasswordHash,
        role: 'seller' as any,
        registrationStatus: 'completed',
        onboardingStatus: 'approved_for_procurement',
        accountStatus: 'ACTIVE',
        organizationId: org.id,
        companyId: defaultCompany.id,
      }
    });

    const buyerUser = await prisma.user.upsert({
      where: { email: buyerEmail },
      update: { password: defaultPasswordHash, organizationId: org.id },
      create: {
        name: `Buyer ${i}`,
        email: buyerEmail,
        userId: `BUYER_${i}`,
        password: defaultPasswordHash,
        role: 'buyer' as any,
        registrationStatus: 'completed',
        onboardingStatus: 'approved_for_procurement',
        accountStatus: 'ACTIVE',
        organizationId: org.id,
        companyId: defaultCompany.id,
      }
    });

    for (let j = 1; j <= 10; j++) {
      const productName = `Seed Product ${i}-${j}`;
      const serviceName = `Seed Service ${i}-${j}`;

      let product = await prisma.product.findFirst({ where: { name: productName, sellerId: sellerUser.id } });
      if (!product) {
        const fileAsset = await prisma.fileAsset.create({
          data: {
            ownerId: sellerUser.id,
            ownerRole: 'seller',
            entityType: 'product',
            storageProvider: 'LOCAL',
            key: `product_images/seed_${i}_${j}.jpg`,
            url: `https://picsum.photos/seed/${i}${j}/400/400`,
            mimeType: 'image/jpeg',
            size: 1024,
            checksum: `dummy-checksum-${i}-${j}`,
            originalName: `seed_${i}_${j}.jpg`
          }
        });

        const docAsset = await prisma.fileAsset.create({
          data: {
            ownerId: sellerUser.id,
            ownerRole: 'seller',
            entityType: 'product_cert',
            storageProvider: 'LOCAL',
            key: `product_docs/cert_${i}_${j}.pdf`,
            url: `https://www.w3.org/WAI/ER/tests/xhtml/testfiles/resources/pdf/dummy.pdf`,
            mimeType: 'application/pdf',
            size: 2048,
            checksum: `dummy-doc-checksum-${i}-${j}`,
            originalName: `cert_${i}_${j}.pdf`
          }
        });

        product = await prisma.product.create({
          data: {
            name: productName,
            description: `This is a properly seeded product for org ${i}.`,
            price: 100 * j,
            currency: 'INR',
            status: 'ACTIVE' as any,
            sellerId: sellerUser.id,
            organizationId: org.id,
            categoryId: categoryId,
            images: {
              create: {
                fileAssetId: fileAsset.id,
                altText: productName,
                isPrimary: true
              }
            },
            certifications: {
              create: {
                name: `Product Certification ${i}-${j}`,
                fileAssetId: docAsset.id,
                verificationStatus: 'VERIFIED' as any
              }
            }
          }
        });
      }

      let service = await prisma.service.findFirst({ where: { name: serviceName, sellerId: sellerUser.id } });
      if (!service) {
        const docAsset = await prisma.fileAsset.create({
          data: {
            ownerId: sellerUser.id,
            ownerRole: 'seller',
            entityType: 'service_cert',
            storageProvider: 'LOCAL',
            key: `service_docs/cert_${i}_${j}.pdf`,
            url: `https://www.w3.org/WAI/ER/tests/xhtml/testfiles/resources/pdf/dummy.pdf`,
            mimeType: 'application/pdf',
            size: 2048,
            checksum: `dummy-svc-doc-checksum-${i}-${j}`,
            originalName: `svc_cert_${i}_${j}.pdf`
          }
        });

        service = await prisma.service.create({
          data: {
            name: serviceName,
            description: `This is a properly seeded service for org ${i}.`,
            basePrice: 500 * j,
            currency: 'INR',
            status: 'ACTIVE' as any,
            pricingModel: 'FIXED' as any,
            sellerId: sellerUser.id,
            organizationId: org.id,
            categoryId: categoryId,
            certifications: {
              create: {
                name: `Service Certification ${i}-${j}`,
                fileAssetId: docAsset.id,
                verificationStatus: 'VERIFIED' as any
              }
            }
          }
        });
      }
    }
  }
}

main()
  .catch((error) => {
    console.error('Seed failed', error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
