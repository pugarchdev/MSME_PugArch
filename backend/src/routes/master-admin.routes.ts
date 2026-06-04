import { Router, type Response, type NextFunction } from 'express';
import prisma from '../config/prisma.js';
import { authenticate, type AuthRequest } from '../middleware/authenticate.js';
import { authorize, requirePermission, createAuditLog } from '../middleware/authorize.js';
import { getPagination } from '../utils/pagination.js';
import { PERMISSIONS } from '../constants/permissions.js';

const router = Router();

const wrap = (handler: (req: AuthRequest, res: Response) => Promise<unknown>) =>
  (req: AuthRequest, res: Response, next: NextFunction) => {
    handler(req, res).catch(next);
  };

const masterOnly = [authenticate, authorize('master_admin')] as const;

const companySelect = {
  id: true,
  name: true,
  shortName: true,
  portalDisplayName: true,
  logoUrl: true,
  contactEmail: true,
  contactPhone: true,
  address: true,
  district: true,
  state: true,
  themeSettings: true,
  homepageContent: true,
  aboutContent: true,
  footerContent: true,
  grievanceContent: true,
  procurementPolicy: true,
  isActive: true,
  createdAt: true,
  updatedAt: true
};

const textOrNull = (value: unknown) => typeof value === 'string' && value.trim() ? value.trim() : null;
const numberOrUndefined = (value: unknown) => {
  const numeric = Number(value);
  return Number.isFinite(numeric) ? numeric : undefined;
};

const sortableOrder = (query: Record<string, unknown>, allowed: Record<string, string>, fallback: Record<string, 'asc' | 'desc'>) => {
  const sortBy = textOrNull(query.sortBy);
  const sortOrder = String(query.sortOrder || 'desc').toLowerCase() === 'asc' ? 'asc' : 'desc';
  const mapped = sortBy ? allowed[sortBy] : undefined;
  return mapped ? { [mapped]: sortOrder } : fallback;
};

const safeCount = async (delegate: any, args?: any) => {
  try {
    return await delegate.count(args);
  } catch {
    return 0;
  }
};

const safeFindMany = async <T>(delegate: any, args: any, fallback: T[] = []) => {
  if (!delegate?.findMany) return fallback;
  try {
    return await delegate.findMany(args);
  } catch {
    return fallback;
  }
};

const companyPayload = (body: Record<string, unknown>) => ({
  name: textOrNull(body.name) || textOrNull(body.companyName) || 'Untitled Company',
  shortName: textOrNull(body.shortName),
  portalDisplayName: textOrNull(body.portalDisplayName) || textOrNull(body.name) || 'MSME Portal',
  logoUrl: textOrNull(body.logoUrl),
  contactEmail: textOrNull(body.contactEmail),
  contactPhone: textOrNull(body.contactPhone),
  address: textOrNull(body.address),
  district: textOrNull(body.district),
  state: textOrNull(body.state),
  themeSettings: body.themeSettings && typeof body.themeSettings === 'object' ? body.themeSettings : undefined,
  homepageContent: textOrNull(body.homepageContent),
  aboutContent: textOrNull(body.aboutContent),
  footerContent: textOrNull(body.footerContent),
  grievanceContent: textOrNull(body.grievanceContent),
  procurementPolicy: textOrNull(body.procurementPolicy),
  isActive: typeof body.isActive === 'boolean' ? body.isActive : true
});

router.get('/master-admin/dashboard', ...masterOnly, wrap(async (_req, res) => {
  const [
    totalCompanies,
    activeCompanies,
    totalBuyers,
    totalSellers,
    totalAdmins,
    totalUsers,
    activeUsers,
    pendingApprovals,
    activeFeatures,
    totalOrganizations,
    activeOrganizations,
    pendingOrganizations,
    suspendedOrganizations,
    activeBids,
    totalOrders,
    totalPayments,
    pendingSettlements,
    openFraudAlerts,
    recentAuditLogs
  ] = await Promise.all([
    safeCount((prisma as any).company),
    safeCount((prisma as any).company, { where: { isActive: true } }),
    safeCount(prisma.user, { where: { role: 'buyer' } }),
    safeCount(prisma.user, { where: { role: 'seller' } }),
    safeCount(prisma.user, { where: { role: { in: ['admin', 'master_admin'] } } }),
    safeCount(prisma.user),
    safeCount(prisma.user, { where: { accountStatus: 'ACTIVE' as any } }),
    safeCount(prisma.user, { where: { onboardingStatus: { in: ['pending', 'pending_validation', 'under_compliance_review'] as any } } }),
    safeCount((prisma as any).companyFeature, { where: { enabled: true } }),
    safeCount(prisma.organization),
    safeCount(prisma.organization, { where: { verificationStatus: 'VERIFIED' as any } }),
    safeCount(prisma.organization, { where: { verificationStatus: { in: ['PENDING', 'UNDER_REVIEW'] as any } } }),
    safeCount(prisma.organization, { where: { OR: [{ isBlacklisted: true }, { verificationStatus: 'SUSPENDED' as any }] } }),
    safeCount((prisma as any).procurementBid, { where: { status: { in: ['OPEN', 'TECHNICAL_EVALUATION', 'FINANCIAL_EVALUATION', 'L1_GENERATED', 'AWARD_RECOMMENDED'] } } }),
    safeCount((prisma as any).purchaseOrder),
    safeCount((prisma as any).paymentTransaction),
    safeCount((prisma as any).paymentSettlement, { where: { status: 'PENDING' } }),
    safeCount((prisma as any).fraudAlert, { where: { status: 'OPEN' } }),
    safeFindMany(prisma.auditLog, { orderBy: { createdAt: 'desc' }, take: 8, include: { User: { select: { id: true, name: true, email: true, role: true } } } })
  ]);
  const databaseHealthy = [
    totalCompanies,
    totalOrganizations,
    totalUsers,
    activeBids,
    totalOrders,
    totalPayments,
    recentAuditLogs.length
  ].some(Boolean);

  res.json({
    summary: {
      totalCompanies,
      activeCompanies,
      totalOrganizations,
      activeOrganizations,
      pendingOrganizations,
      suspendedOrganizations,
      totalBuyers,
      totalSellers,
      totalAdmins,
      totalUsers,
      activeUsers,
      pendingApprovals,
      activeFeatures,
      activeBids,
      totalOrders,
      totalPayments,
      pendingSettlements,
      openFraudAlerts
    },
    systemHealth: { api: 'ok', database: databaseHealthy ? 'ok' : 'degraded' },
    recentAuditLogs
  });
}));

router.get('/master-admin/companies', ...masterOnly, wrap(async (req, res) => {
  const { skip, take, page, pageSize } = getPagination(req.query as Record<string, unknown>);
  const q = textOrNull(req.query.q) || textOrNull(req.query.search);
  const status = textOrNull(req.query.status);
  const where: any = {
    ...(status === 'active' ? { isActive: true } : status === 'inactive' || status === 'suspended' ? { isActive: false } : {}),
    ...(q ? {
    OR: [
      { name: { contains: q, mode: 'insensitive' } },
      { portalDisplayName: { contains: q, mode: 'insensitive' } },
      { district: { contains: q, mode: 'insensitive' } },
      { state: { contains: q, mode: 'insensitive' } }
    ]
  } : {})
  };
  const orderBy = sortableOrder(req.query as Record<string, unknown>, {
    name: 'name',
    portalDisplayName: 'portalDisplayName',
    district: 'district',
    state: 'state',
    createdAt: 'createdAt',
    updatedAt: 'updatedAt'
  }, { updatedAt: 'desc' });
  const [items, total] = await Promise.all([
    (prisma as any).company.findMany({ where, skip, take, orderBy, select: companySelect }),
    (prisma as any).company.count({ where })
  ]);
  res.json({ items, total, page, pageSize });
}));

router.post('/master-admin/companies', ...masterOnly, requirePermission(PERMISSIONS.COMPANY_MANAGE), wrap(async (req, res) => {
  const company = await (prisma as any).company.create({ data: companyPayload(req.body || {}), select: companySelect });
  await createAuditLog(req, { action: 'company.create', entityType: 'company', entityId: company.id, metadata: { name: company.name } });
  res.status(201).json(company);
}));

router.put('/master-admin/companies/:id', ...masterOnly, requirePermission(PERMISSIONS.COMPANY_MANAGE), wrap(async (req, res) => {
  const id = Number(req.params.id);
  const company = await (prisma as any).company.update({ where: { id }, data: companyPayload(req.body || {}), select: companySelect });
  await createAuditLog(req, { action: 'company.update', entityType: 'company', entityId: company.id });
  res.json(company);
}));

router.get('/master-admin/features', ...masterOnly, wrap(async (_req, res) => {
  const features = await (prisma as any).feature.findMany({ orderBy: [{ module: 'asc' }, { name: 'asc' }] });
  res.json({ items: features });
}));

router.get('/master-admin/companies/:id/features', ...masterOnly, wrap(async (req, res) => {
  const companyId = Number(req.params.id);
  const features = await (prisma as any).feature.findMany({
    orderBy: [{ module: 'asc' }, { name: 'asc' }],
    include: { companies: { where: { companyId } } }
  });
  res.json({
    items: features.map((feature: any) => ({
      id: feature.id,
      code: feature.code,
      name: feature.name,
      module: feature.module,
      description: feature.description,
      enabled: feature.companies[0]?.enabled ?? false
    }))
  });
}));

router.put('/master-admin/companies/:id/features', ...masterOnly, requirePermission(PERMISSIONS.FEATURE_TOGGLE), wrap(async (req, res) => {
  const companyId = Number(req.params.id);
  const features = Array.isArray(req.body?.features) ? req.body.features : [];
  for (const row of features) {
    const featureId = Number(row.featureId || row.id);
    if (!Number.isFinite(featureId)) continue;
    await (prisma as any).companyFeature.upsert({
      where: { companyId_featureId: { companyId, featureId } },
      update: { enabled: Boolean(row.enabled), updatedById: req.user?.id },
      create: { companyId, featureId, enabled: Boolean(row.enabled), updatedById: req.user?.id }
    });
  }
  await createAuditLog(req, { action: 'feature.toggle', entityType: 'company', entityId: companyId, metadata: { count: features.length } });
  res.json({ success: true });
}));

router.get('/master-admin/roles', ...masterOnly, wrap(async (req, res) => {
  const companyId = req.query.companyId ? Number(req.query.companyId) : undefined;
  const roles = await (prisma as any).rbacRole.findMany({
    where: companyId ? { OR: [{ companyId: null }, { companyId }] } : {},
    include: { permissions: { include: { permission: true } }, company: { select: { id: true, name: true } } },
    orderBy: [{ scope: 'asc' }, { name: 'asc' }]
  });
  res.json({ items: roles });
}));

router.post('/master-admin/roles', ...masterOnly, requirePermission(PERMISSIONS.PERMISSION_MANAGE), wrap(async (req, res) => {
  const code = String(req.body?.code || req.body?.name || '').trim().toUpperCase().replace(/[^A-Z0-9_]+/g, '_');
  if (!code) return res.status(400).json({ message: 'Role code is required' });
  const role = await (prisma as any).rbacRole.create({
    data: {
      code,
      name: textOrNull(req.body?.name) || code,
      description: textOrNull(req.body?.description),
      companyId: req.body?.companyId ? Number(req.body.companyId) : null,
      scope: req.body?.organizationScoped ? 'ORGANIZATION' : req.body?.companyId ? 'COMPANY' : 'GLOBAL',
      isSystemRole: false
    }
  });
  await createAuditLog(req, { action: 'role.create', entityType: 'role', entityId: role.id, metadata: { code } });
  res.status(201).json(role);
}));

router.put('/master-admin/roles/:id/permissions', ...masterOnly, requirePermission(PERMISSIONS.PERMISSION_MANAGE), wrap(async (req, res) => {
  const roleId = Number(req.params.id);
  const permissionIds = (Array.isArray(req.body?.permissionIds) ? req.body.permissionIds : []).map(Number).filter(Number.isFinite);
  await (prisma as any).rolePermission.deleteMany({ where: { roleId } });
  await (prisma as any).rolePermission.createMany({
    data: permissionIds.map((permissionId: number) => ({ roleId, permissionId })),
    skipDuplicates: true
  });
  await createAuditLog(req, { action: 'permission.manage', entityType: 'role', entityId: roleId, metadata: { permissionIds } });
  res.json({ success: true });
}));

router.get('/master-admin/permissions', ...masterOnly, wrap(async (_req, res) => {
  const permissions = await prisma.permission.findMany({ orderBy: [{ module: 'asc' }, { code: 'asc' }] });
  res.json({ items: permissions });
}));

router.get('/master-admin/users', ...masterOnly, wrap(async (req, res) => {
  const { skip, take, page, pageSize } = getPagination(req.query as Record<string, unknown>);
  const q = textOrNull(req.query.q) || textOrNull(req.query.search);
  const companyId = numberOrUndefined(req.query.companyId);
  const role = textOrNull(req.query.role);
  const status = textOrNull(req.query.status);
  const where: any = {
    ...(companyId ? { companyId } : {}),
    ...(role ? { role } : {}),
    ...(status ? { accountStatus: status as any } : {}),
    ...(q ? { OR: [{ name: { contains: q, mode: 'insensitive' } }, { email: { contains: q, mode: 'insensitive' } }, { userId: { contains: q, mode: 'insensitive' } }] } : {})
  };
  const orderBy = sortableOrder(req.query as Record<string, unknown>, {
    name: 'name',
    email: 'email',
    role: 'role',
    accountStatus: 'accountStatus',
    createdAt: 'createdAt'
  }, { createdAt: 'desc' });
  const [items, total] = await Promise.all([
    prisma.user.findMany({
      where,
      skip,
      take,
      orderBy,
      select: { id: true, userId: true, name: true, email: true, mobile: true, role: true, companyId: true, organizationId: true, onboardingStatus: true, accountStatus: true, createdAt: true, company: { select: { id: true, name: true } }, organization: { select: { id: true, organizationName: true, organizationType: true } } }
    }),
    prisma.user.count({ where })
  ]);
  res.json({ items, total, page, pageSize });
}));

router.post('/master-admin/users/:id/roles', ...masterOnly, requirePermission(PERMISSIONS.ROLE_ASSIGN), wrap(async (req, res) => {
  const userId = Number(req.params.id);
  const roleId = Number(req.body?.roleId);
  if (!Number.isFinite(roleId)) return res.status(400).json({ message: 'roleId is required' });
  const assignment = await (prisma as any).userRole.create({
    data: {
      userId,
      roleId,
      companyId: req.body?.companyId ? Number(req.body.companyId) : null,
      organizationId: req.body?.organizationId ? Number(req.body.organizationId) : null,
      assignedById: req.user?.id,
      isActive: true
    }
  });
  await createAuditLog(req, { action: 'role.assign', entityType: 'user', entityId: userId, metadata: { roleId } });
  res.status(201).json(assignment);
}));

router.get('/master-admin/organizations', ...masterOnly, wrap(async (req, res) => {
  const { skip, take, page, pageSize } = getPagination(req.query as Record<string, unknown>);
  const q = textOrNull(req.query.q) || textOrNull(req.query.search);
  const companyId = numberOrUndefined(req.query.companyId);
  const verificationStatus = textOrNull(req.query.status);
  const organizationType = textOrNull(req.query.organizationType);
  const where: any = {
    ...(companyId ? { companyId } : {}),
    ...(verificationStatus ? { verificationStatus: verificationStatus as any } : {}),
    ...(organizationType ? { organizationType: { contains: organizationType, mode: 'insensitive' } } : {}),
    ...(q ? {
      OR: [
        { organizationName: { contains: q, mode: 'insensitive' } },
        { gstin: { contains: q, mode: 'insensitive' } },
        { pan: { contains: q, mode: 'insensitive' } },
        { district: { contains: q, mode: 'insensitive' } },
        { state: { contains: q, mode: 'insensitive' } }
      ]
    } : {})
  };
  const orderBy = sortableOrder(req.query as Record<string, unknown>, {
    organizationName: 'organizationName',
    organizationType: 'organizationType',
    verificationStatus: 'verificationStatus',
    createdAt: 'createdAt',
    updatedAt: 'updatedAt'
  }, { updatedAt: 'desc' });
  const [items, total] = await Promise.all([
    prisma.organization.findMany({
      where,
      skip,
      take,
      orderBy,
      include: { company: { select: { id: true, name: true } }, users: { select: { id: true }, take: 1 } }
    }),
    prisma.organization.count({ where })
  ]);
  res.json({ items, total, page, pageSize });
}));

router.put('/master-admin/companies/:id/content', ...masterOnly, requirePermission(PERMISSIONS.CONTENT_UPDATE), wrap(async (req, res) => {
  const companyId = Number(req.params.id);
  const company = await (prisma as any).company.update({
    where: { id: companyId },
    data: {
      logoUrl: textOrNull(req.body?.logoUrl),
      portalDisplayName: textOrNull(req.body?.portalDisplayName) || undefined,
      homepageContent: textOrNull(req.body?.homepageContent),
      aboutContent: textOrNull(req.body?.aboutContent),
      footerContent: textOrNull(req.body?.footerContent),
      grievanceContent: textOrNull(req.body?.grievanceContent),
      procurementPolicy: textOrNull(req.body?.procurementPolicy),
      contactEmail: textOrNull(req.body?.contactEmail),
      contactPhone: textOrNull(req.body?.contactPhone)
    },
    select: companySelect
  });
  await createAuditLog(req, { action: 'content.update', entityType: 'company', entityId: companyId });
  res.json(company);
}));

router.get('/master-admin/audit-logs', ...masterOnly, wrap(async (req, res) => {
  const { skip, take, page, pageSize } = getPagination(req.query as Record<string, unknown>);
  const companyId = numberOrUndefined(req.query.companyId);
  const q = textOrNull(req.query.q) || textOrNull(req.query.search);
  const action = textOrNull(req.query.action);
  const entityType = textOrNull(req.query.entityType);
  const where: any = {
    ...(companyId ? { companyId } : {}),
    ...(action ? { action: { contains: action, mode: 'insensitive' } } : {}),
    ...(entityType ? { entityType: { contains: entityType, mode: 'insensitive' } } : {}),
    ...(q ? { OR: [{ action: { contains: q, mode: 'insensitive' } }, { entityType: { contains: q, mode: 'insensitive' } }] } : {})
  };
  const [items, total] = await Promise.all([
    prisma.auditLog.findMany({ where, skip, take, orderBy: { createdAt: 'desc' }, include: { User: { select: { id: true, name: true, email: true, role: true } } } }),
    prisma.auditLog.count({ where })
  ]);
  res.json({ items, total, page, pageSize });
}));

router.get('/master-admin/procurement', ...masterOnly, wrap(async (req, res) => {
  const { skip, take, page, pageSize } = getPagination(req.query as Record<string, unknown>);
  const q = textOrNull(req.query.q) || textOrNull(req.query.search);
  const status = textOrNull(req.query.status);
  const where: any = {
    ...(status ? { status: status as any } : {}),
    ...(q ? {
      OR: [
        { title: { contains: q, mode: 'insensitive' } },
        { bidNumber: { contains: q, mode: 'insensitive' } },
        { buyerOrganizationName: { contains: q, mode: 'insensitive' } },
        { category: { contains: q, mode: 'insensitive' } }
      ]
    } : {})
  };
  const orderBy = sortableOrder(req.query as Record<string, unknown>, {
    title: 'title',
    bidNumber: 'bidNumber',
    status: 'status',
    endDate: 'endDate',
    createdAt: 'createdAt',
    estimatedValue: 'estimatedValue'
  }, { updatedAt: 'desc' });
  const [items, total, summary] = await Promise.all([
    (prisma as any).procurementBid.findMany({
      where,
      skip,
      take,
      orderBy,
      select: {
        id: true,
        bidNumber: true,
        title: true,
        buyerOrganizationName: true,
        category: true,
        status: true,
        approvalStatus: true,
        lifecycleStage: true,
        estimatedValue: true,
        endDate: true,
        createdAt: true,
        _count: { select: { participations: true, documents: true, awards: true } }
      }
    }),
    (prisma as any).procurementBid.count({ where }),
    Promise.all([
      safeCount((prisma as any).procurementBid),
      safeCount((prisma as any).procurementBid, { where: { approvalStatus: 'PENDING' } }),
      safeCount((prisma as any).procurementBid, { where: { status: 'OPEN' } }),
      safeCount((prisma as any).procurementBid, { where: { status: 'TECHNICAL_EVALUATION' } }),
      safeCount((prisma as any).procurementBid, { where: { status: 'FINANCIAL_EVALUATION' } }),
      safeCount((prisma as any).procurementBid, { where: { status: 'AWARD_RECOMMENDED' } }),
      safeCount((prisma as any).procurementBidParticipation)
    ])
  ]);
  const [totalBids, pendingApprovals, activeBids, technicalEvaluation, financialEvaluation, awardRecommended, participations] = summary;
  res.json({ items, total, page, pageSize, summary: { totalBids, pendingApprovals, activeBids, technicalEvaluation, financialEvaluation, awardRecommended, participations } });
}));

router.get('/master-admin/payments', ...masterOnly, wrap(async (req, res) => {
  const { skip, take, page, pageSize } = getPagination(req.query as Record<string, unknown>);
  const q = textOrNull(req.query.q) || textOrNull(req.query.search);
  const status = textOrNull(req.query.status);
  const where: any = {
    ...(status ? { status } : {}),
    ...(q ? { OR: [{ referenceId: { contains: q, mode: 'insensitive' } }, { gateway: { contains: q, mode: 'insensitive' } }] } : {})
  };
  const orderBy = sortableOrder(req.query as Record<string, unknown>, {
    referenceId: 'referenceId',
    gateway: 'gateway',
    status: 'status',
    amount: 'amount',
    createdAt: 'createdAt',
    updatedAt: 'updatedAt'
  }, { createdAt: 'desc' });
  const [items, total, summary] = await Promise.all([
    (prisma as any).paymentTransaction.findMany({
      where,
      skip,
      take,
      orderBy,
      select: {
        id: true,
        referenceId: true,
        gateway: true,
        method: true,
        status: true,
        paymentStatus: true,
        amount: true,
        currency: true,
        createdAt: true,
        completedAt: true,
        purchaseOrderId: true,
        invoiceId: true,
        payer: { select: { id: true, name: true, email: true } },
        payee: { select: { id: true, name: true, email: true } }
      }
    }),
    (prisma as any).paymentTransaction.count({ where }),
    Promise.all([
      safeCount((prisma as any).paymentTransaction),
      safeCount((prisma as any).paymentTransaction, { where: { status: { in: ['failed', 'FAILED'] } } }),
      safeCount((prisma as any).paymentSettlement, { where: { status: 'PENDING' } }),
      safeCount((prisma as any).paymentSettlement, { where: { status: 'RELEASED' } }),
      safeCount((prisma as any).paymentWebhookEvent, { where: { processed: false } })
    ])
  ]);
  const [totalPayments, failedPayments, pendingSettlements, completedSettlements, pendingWebhooks] = summary;
  res.json({ items, total, page, pageSize, summary: { totalPayments, failedPayments, pendingSettlements, completedSettlements, pendingWebhooks } });
}));

router.get('/master-admin/email-settings', ...masterOnly, wrap(async (_req, res) => {
  res.json({
    smtp: {
      host: process.env.SMTP_HOST || 'smtp.gmail.com',
      port: Number(process.env.SMTP_PORT || 587),
      user: process.env.SMTP_USER ? maskSecret(process.env.SMTP_USER, 3) : null,
      fromEmail: process.env.SMTP_USER ? maskSecret(process.env.SMTP_USER, 3) : null,
      fromName: 'JsgSmile Portal',
      passwordConfigured: Boolean(process.env.SMTP_PASS)
    },
    notifications: {
      emailEnabled: Boolean(process.env.SMTP_USER && process.env.SMTP_PASS),
      templates: [
        'User registration',
        'Organization approval',
        'Bid published',
        'Seller participated',
        'Technical clarification',
        'Bid awarded',
        'PO generated',
        'Payment initiated',
        'Settlement completed'
      ]
    }
  });
}));

router.get('/master-admin/security-overview', ...masterOnly, wrap(async (_req, res) => {
  const [failedLogins, suspiciousActions, openFraudAlerts, roleChanges, fileAccessEvents, paymentActions] = await Promise.all([
    safeCount((prisma as any).loginEvent, { where: { success: false } }),
    safeCount((prisma as any).fraudAlert, { where: { status: 'OPEN' } }),
    safeCount((prisma as any).fraudAlert, { where: { status: 'OPEN' } }),
    safeCount(prisma.auditLog, { where: { action: { contains: 'role', mode: 'insensitive' } } }),
    safeCount(prisma.auditLog, { where: { OR: [{ entityType: { contains: 'file', mode: 'insensitive' } }, { action: { contains: 'file', mode: 'insensitive' } }] } }),
    safeCount(prisma.auditLog, { where: { OR: [{ entityType: { contains: 'payment', mode: 'insensitive' } }, { action: { contains: 'payment', mode: 'insensitive' } }, { action: { contains: 'settlement', mode: 'insensitive' } }] } })
  ]);
  res.json({
    summary: {
      failedLogins,
      suspiciousActions,
      openFraudAlerts,
      roleChanges,
      fileAccessEvents,
      paymentActions
    },
    controls: {
      cors: 'Explicit production origins required',
      previews: 'Preview wildcard CORS disabled in production',
      secrets: 'Secrets are masked and loaded from deployment environment',
      fileAccess: 'Authenticated signed URL access',
      sealedQuotes: 'Financial quotes restricted until evaluation stage',
      auditLogs: 'Sensitive actions audited'
    }
  });
}));

const maskSecret = (value: string, visible = 4) => {
  if (!value) return '';
  if (value.length <= visible * 2) return '*'.repeat(value.length);
  return `${value.slice(0, visible)}${'*'.repeat(Math.min(10, value.length - visible * 2))}${value.slice(-visible)}`;
};

export default router;
