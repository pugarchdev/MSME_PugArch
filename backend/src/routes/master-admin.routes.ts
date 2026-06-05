import { Router, type Response, type NextFunction } from 'express';
import prisma from '../config/prisma.js';
import { authenticate, type AuthRequest } from '../middleware/authenticate.js';
import { authorize, requirePermission, createAuditLog } from '../middleware/authorize.js';
import { getPagination } from '../utils/pagination.js';
import { PERMISSIONS } from '../constants/permissions.js';
import { hashPassword } from '../services/password.service.js';
import { randomToken } from '../utils/crypto.js';

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

const companyListSelect = {
  id: true,
  name: true,
  shortName: true,
  portalDisplayName: true,
  contactEmail: true,
  contactPhone: true,
  district: true,
  state: true,
  isActive: true,
  createdAt: true,
  updatedAt: true
};

const textOrNull = (value: unknown) => typeof value === 'string' && value.trim() ? value.trim() : null;
const numberOrUndefined = (value: unknown) => {
  const numeric = Number(value);
  return Number.isFinite(numeric) ? numeric : undefined;
};
const jsonOk = (res: Response, data: unknown, message = 'Operation successful', status = 200) =>
  res.status(status).json({ success: true, message, data });
const jsonError = (res: Response, status: number, message: string, errorCode: string) =>
  res.status(status).json({ success: false, message, errorCode });

const allowedRoles = new Set(['master_admin', 'admin', 'buyer', 'seller']);
const allowedUserStatuses = new Set(['PENDING', 'ACTIVE', 'BLOCKED', 'SUSPENDED', 'DELETED']);
const allowedVerificationStatuses = new Set(['PENDING', 'UNDER_REVIEW', 'VERIFIED', 'REJECTED', 'SUSPENDED', 'FAILED', 'MANUAL_REVIEW_REQUIRED', 'EXPIRED']);
const allowedOrganizationTypes = new Set(['MSME', 'PROPRIETORSHIP', 'PARTNERSHIP', 'PRIVATE_LIMITED', 'PUBLIC_LIMITED', 'LLP', 'TRUST', 'SOCIETY', 'STARTUP', 'NGO', 'EDUCATIONAL_INSTITUTION', 'GOVERNMENT', 'PSU']);

const normalizedEnum = (value: unknown) => textOrNull(value)?.toUpperCase().replace(/[\s-]+/g, '_');
const requiredReason = (body: any) => textOrNull(body?.reason);

const ensureReason = (res: Response, body: any, action: string) => {
  const reason = requiredReason(body);
  if (!reason) {
    jsonError(res, 400, `Reason is required to ${action}.`, 'VALIDATION_ERROR');
    return null;
  }
  return reason;
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

const organizationSelect = {
  id: true,
  organizationName: true,
  organizationType: true,
  gstin: true,
  panNumber: true,
  cinNumber: true,
  udyamNumber: true,
  addressLine1: true,
  addressLine2: true,
  city: true,
  district: true,
  state: true,
  pincode: true,
  website: true,
  companyId: true,
  verificationStatus: true,
  isBlacklisted: true,
  blacklistReason: true,
  createdAt: true,
  updatedAt: true,
  company: { select: { id: true, name: true } }
};

const organizationListSelect = {
  id: true,
  organizationName: true,
  organizationType: true,
  gstin: true,
  panNumber: true,
  udyamNumber: true,
  district: true,
  state: true,
  pincode: true,
  companyId: true,
  verificationStatus: true,
  isBlacklisted: true,
  createdAt: true,
  updatedAt: true,
  company: { select: { id: true, name: true } },
  _count: { select: { users: true } }
};

const userSelect = {
  id: true,
  userId: true,
  name: true,
  email: true,
  mobile: true,
  role: true,
  companyId: true,
  organizationId: true,
  onboardingStatus: true,
  accountStatus: true,
  emailVerified: true,
  lastLoginAt: true,
  createdAt: true,
  updatedAt: true,
  company: { select: { id: true, name: true } },
  organization: { select: { id: true, organizationName: true, organizationType: true } }
};

const organizationPayload = (body: Record<string, unknown>, partial = false) => {
  const type = normalizedEnum(body.organizationType) || 'MSME';
  const verificationStatus = normalizedEnum(body.verificationStatus);
  if (!allowedOrganizationTypes.has(type)) throw new Error('INVALID_ORGANIZATION_TYPE');
  if (verificationStatus && !allowedVerificationStatuses.has(verificationStatus)) throw new Error('INVALID_STATUS');
  const data: any = {
    organizationName: textOrNull(body.organizationName) || textOrNull(body.name),
    organizationType: type,
    gstin: textOrNull(body.gstin) || textOrNull(body.gstNumber),
    panNumber: textOrNull(body.panNumber) || textOrNull(body.pan),
    cinNumber: textOrNull(body.cinNumber) || textOrNull(body.cin),
    udyamNumber: textOrNull(body.udyamNumber),
    addressLine1: textOrNull(body.addressLine1) || textOrNull(body.address),
    addressLine2: textOrNull(body.addressLine2),
    city: textOrNull(body.city),
    district: textOrNull(body.district),
    state: textOrNull(body.state),
    pincode: textOrNull(body.pincode),
    website: textOrNull(body.website),
    companyId: numberOrUndefined(body.companyId),
    verificationStatus: verificationStatus || undefined,
    isBlacklisted: typeof body.isBlacklisted === 'boolean' ? body.isBlacklisted : undefined,
    blacklistReason: textOrNull(body.blacklistReason)
  };
  Object.keys(data).forEach(key => data[key] === undefined && delete data[key]);
  if (!partial && !data.organizationName) throw new Error('ORGANIZATION_NAME_REQUIRED');
  return data;
};

const userPayload = async (body: Record<string, unknown>, partial = false) => {
  const role = textOrNull(body.role);
  const status = normalizedEnum(body.accountStatus || body.status);
  if (role && !allowedRoles.has(role)) throw new Error('INVALID_ROLE');
  if (status && !allowedUserStatuses.has(status)) throw new Error('INVALID_STATUS');
  const password = textOrNull(body.password);
  const data: any = {
    name: textOrNull(body.name),
    email: textOrNull(body.email)?.toLowerCase(),
    mobile: textOrNull(body.mobile),
    role: role || undefined,
    companyId: numberOrUndefined(body.companyId),
    organizationId: numberOrUndefined(body.organizationId),
    accountStatus: status || undefined
  };
  if (password) data.password = await hashPassword(password);
  Object.keys(data).forEach(key => data[key] === undefined && delete data[key]);
  if (!partial) {
    if (!data.name) throw new Error('USER_NAME_REQUIRED');
    if (!data.email) throw new Error('USER_EMAIL_REQUIRED');
    if (!data.role) throw new Error('INVALID_ROLE');
    if (!data.password) data.password = await hashPassword(`JsgSmile@${randomToken(8)}Aa1!`);
  }
  return data;
};

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
    safeFindMany(prisma.auditLog, {
      orderBy: { createdAt: 'desc' },
      take: 8,
      select: {
        id: true,
        action: true,
        entityType: true,
        entityId: true,
        createdAt: true,
        User: { select: { id: true, name: true, email: true, role: true } }
      }
    })
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

router.get('/master-admin/overview', ...masterOnly, wrap(async (_req, res) => {
  const [
    totalOrganizations,
    activeOrganizations,
    suspendedOrganizations,
    totalUsers,
    activeUsers,
    suspendedUsers,
    activeBids,
    totalOrders,
    totalPayments,
    pendingSettlements,
    fraudAlerts,
    pendingApprovals
  ] = await Promise.all([
    safeCount(prisma.organization),
    safeCount(prisma.organization, { where: { verificationStatus: 'VERIFIED' as any, isBlacklisted: false } }),
    safeCount(prisma.organization, { where: { OR: [{ verificationStatus: 'SUSPENDED' as any }, { isBlacklisted: true }] } }),
    safeCount(prisma.user),
    safeCount(prisma.user, { where: { accountStatus: 'ACTIVE' as any } }),
    safeCount(prisma.user, { where: { accountStatus: 'SUSPENDED' as any } }),
    safeCount((prisma as any).procurementBid, { where: { status: { in: ['OPEN', 'TECHNICAL_EVALUATION', 'FINANCIAL_EVALUATION', 'L1_GENERATED', 'AWARD_RECOMMENDED'] } } }),
    safeCount((prisma as any).purchaseOrder),
    safeCount((prisma as any).paymentTransaction),
    safeCount((prisma as any).paymentSettlement, { where: { status: 'PENDING' } }),
    safeCount((prisma as any).fraudAlert, { where: { status: 'OPEN' } }),
    safeCount((prisma as any).procurementBid, { where: { approvalStatus: 'PENDING' } })
  ]);
  jsonOk(res, {
    summary: {
      totalOrganizations,
      activeOrganizations,
      suspendedOrganizations,
      totalUsers,
      activeUsers,
      suspendedUsers,
      activeBids,
      totalOrders,
      totalPayments,
      pendingSettlements,
      fraudAlerts,
      pendingApprovals
    }
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
    (prisma as any).company.findMany({ where, skip, take, orderBy, select: companyListSelect }),
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

const companyStatusAction = (action: 'activate' | 'inactivate' | 'suspend' | 'reactivate' | 'archive') =>
  wrap(async (req, res) => {
    const id = Number(req.params.id);
    const reason = ensureReason(res, req.body, action);
    if (!reason) return;
    const isActive = action === 'activate' || action === 'reactivate';
    const company = await (prisma as any).company.update({
      where: { id },
      data: { isActive },
      select: companySelect
    });
    await createAuditLog(req, { action: `company.${action}`, entityType: 'company', entityId: id, metadata: { reason } });
    jsonOk(res, company, `Company ${action} successful`);
  });

router.post('/master-admin/companies/:id/activate', ...masterOnly, requirePermission(PERMISSIONS.COMPANY_MANAGE), companyStatusAction('activate'));
router.post('/master-admin/companies/:id/inactivate', ...masterOnly, requirePermission(PERMISSIONS.COMPANY_MANAGE), companyStatusAction('inactivate'));
router.post('/master-admin/companies/:id/suspend', ...masterOnly, requirePermission(PERMISSIONS.COMPANY_MANAGE), companyStatusAction('suspend'));
router.post('/master-admin/companies/:id/reactivate', ...masterOnly, requirePermission(PERMISSIONS.COMPANY_MANAGE), companyStatusAction('reactivate'));
router.post('/master-admin/companies/:id/archive', ...masterOnly, requirePermission(PERMISSIONS.COMPANY_MANAGE), companyStatusAction('archive'));

router.delete('/master-admin/companies/:id', ...masterOnly, requirePermission(PERMISSIONS.COMPANY_MANAGE), wrap(async (req, res) => {
  const id = Number(req.params.id);
  const reason = ensureReason(res, req.body, 'delete company');
  if (!reason) return;
  if (textOrNull(req.body?.confirmation) !== 'DELETE') return jsonError(res, 400, 'Type DELETE to confirm permanent deletion.', 'VALIDATION_ERROR');
  const [users, organizations, orders, payments] = await Promise.all([
    safeCount(prisma.user, { where: { companyId: id } }),
    safeCount(prisma.organization, { where: { companyId: id } }),
    safeCount((prisma as any).purchaseOrder, { where: { OR: [{ buyer: { companyId: id } }, { seller: { companyId: id } }] } }),
    safeCount((prisma as any).paymentTransaction, { where: { OR: [{ payer: { companyId: id } }, { payee: { companyId: id } }] } })
  ]);
  if (users || organizations || orders || payments) {
    const company = await (prisma as any).company.update({ where: { id }, data: { isActive: false }, select: companySelect });
    await createAuditLog(req, { action: 'company.archive.deleteBlocked', entityType: 'company', entityId: id, metadata: { reason, users, organizations, orders, payments } });
    return jsonOk(res, company, 'Company has dependencies, so it was archived instead of permanently deleted.');
  }
  await (prisma as any).company.delete({ where: { id } });
  await createAuditLog(req, { action: 'company.delete', entityType: 'company', entityId: id, metadata: { reason } });
  jsonOk(res, { id }, 'Company permanently deleted');
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

router.post('/master-admin/companies/:id/features/:featureKey/enable', ...masterOnly, requirePermission(PERMISSIONS.FEATURE_TOGGLE), wrap(async (req, res) => {
  const companyId = Number(req.params.id);
  const feature = await (prisma as any).feature.findUnique({ where: { code: req.params.featureKey } });
  if (!feature) return jsonError(res, 404, 'Feature not found.', 'ACTION_NOT_ALLOWED');
  await (prisma as any).companyFeature.upsert({
    where: { companyId_featureId: { companyId, featureId: feature.id } },
    update: { enabled: true, updatedById: req.user?.id },
    create: { companyId, featureId: feature.id, enabled: true, updatedById: req.user?.id }
  });
  await createAuditLog(req, { action: 'feature.enable', entityType: 'company', entityId: companyId, metadata: { featureKey: feature.code, reason: textOrNull(req.body?.reason) } });
  jsonOk(res, { featureKey: feature.code, enabled: true }, 'Feature enabled');
}));

router.post('/master-admin/companies/:id/features/:featureKey/disable', ...masterOnly, requirePermission(PERMISSIONS.FEATURE_TOGGLE), wrap(async (req, res) => {
  const companyId = Number(req.params.id);
  const feature = await (prisma as any).feature.findUnique({ where: { code: req.params.featureKey } });
  if (!feature) return jsonError(res, 404, 'Feature not found.', 'ACTION_NOT_ALLOWED');
  await (prisma as any).companyFeature.upsert({
    where: { companyId_featureId: { companyId, featureId: feature.id } },
    update: { enabled: false, updatedById: req.user?.id },
    create: { companyId, featureId: feature.id, enabled: false, updatedById: req.user?.id }
  });
  await createAuditLog(req, { action: 'feature.disable', entityType: 'company', entityId: companyId, metadata: { featureKey: feature.code, reason: textOrNull(req.body?.reason) } });
  jsonOk(res, { featureKey: feature.code, enabled: false }, 'Feature disabled');
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
      select: organizationListSelect as any
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
    prisma.auditLog.findMany({
      where,
      skip,
      take,
      orderBy: { createdAt: 'desc' },
      select: {
        id: true,
        action: true,
        entityType: true,
        entityId: true,
        companyId: true,
        ipAddress: true,
        createdAt: true,
        User: { select: { id: true, name: true, email: true, role: true } }
      }
    }),
    prisma.auditLog.count({ where })
  ]);
  res.json({ items, total, page, pageSize });
}));

router.post('/master-admin/organizations', ...masterOnly, requirePermission(PERMISSIONS.ORGANIZATION_MANAGE), wrap(async (req, res) => {
  try {
    const data = organizationPayload(req.body || {});
    const duplicate = await prisma.organization.findFirst({
      where: {
        OR: [
          { organizationName: data.organizationName },
          ...(data.gstin ? [{ gstin: data.gstin }] : []),
          ...(data.panNumber ? [{ panNumber: data.panNumber }] : [])
        ]
      },
      select: { id: true }
    });
    if (duplicate) return jsonError(res, 409, 'An organization with matching name, GST, or PAN already exists.', 'DUPLICATE_ORGANIZATION');
    const organization: any = await prisma.organization.create({ data, select: organizationSelect as any });
    await createAuditLog(req, { action: 'organization.create', entityType: 'organization', entityId: organization.id, metadata: { name: organization.organizationName } });
    jsonOk(res, organization, 'Organization created successfully', 201);
  } catch (error: any) {
    const code = String(error?.message || '');
    if (code === 'INVALID_ORGANIZATION_TYPE') return jsonError(res, 400, 'Invalid organization type selected.', 'VALIDATION_ERROR');
    if (code === 'INVALID_STATUS') return jsonError(res, 400, 'Invalid organization status selected.', 'INVALID_STATUS');
    return jsonError(res, 400, 'Organization name is required.', 'VALIDATION_ERROR');
  }
}));

router.get('/master-admin/organizations/:id', ...masterOnly, wrap(async (req, res) => {
  const id = Number(req.params.id);
  const organization = await prisma.organization.findUnique({ where: { id }, select: organizationSelect as any });
  if (!organization) return jsonError(res, 404, 'Organization not found.', 'ORGANIZATION_NOT_FOUND');
  jsonOk(res, organization);
}));

router.put('/master-admin/organizations/:id', ...masterOnly, requirePermission(PERMISSIONS.ORGANIZATION_MANAGE), wrap(async (req, res) => {
  const id = Number(req.params.id);
  try {
    const data = organizationPayload(req.body || {}, true);
    const organization: any = await prisma.organization.update({ where: { id }, data, select: organizationSelect as any });
    await createAuditLog(req, { action: 'organization.update', entityType: 'organization', entityId: id, metadata: { name: organization.organizationName } });
    jsonOk(res, organization, 'Organization updated successfully');
  } catch (error: any) {
    const code = String(error?.message || '');
    if (code === 'INVALID_ORGANIZATION_TYPE') return jsonError(res, 400, 'Invalid organization type selected.', 'VALIDATION_ERROR');
    if (code === 'INVALID_STATUS') return jsonError(res, 400, 'Invalid organization status selected.', 'INVALID_STATUS');
    return jsonError(res, 404, 'Organization not found or update is invalid.', 'ORGANIZATION_NOT_FOUND');
  }
}));

const organizationStatusAction = (action: 'activate' | 'inactivate' | 'suspend' | 'reactivate' | 'archive') =>
  wrap(async (req, res) => {
    const id = Number(req.params.id);
    const reason = ensureReason(res, req.body, action);
    if (!reason) return;
    const data: any = action === 'activate' || action === 'reactivate'
      ? { verificationStatus: 'VERIFIED', isBlacklisted: false, blacklistReason: null }
      : action === 'inactivate'
        ? { verificationStatus: 'UNDER_REVIEW', blacklistReason: reason }
        : { verificationStatus: 'SUSPENDED', isBlacklisted: true, blacklistReason: reason };
    const organization = await prisma.organization.update({ where: { id }, data, select: organizationSelect as any });
    await createAuditLog(req, { action: `organization.${action}`, entityType: 'organization', entityId: id, metadata: { reason } });
    jsonOk(res, organization, `Organization ${action} successful`);
  });

router.post('/master-admin/organizations/:id/activate', ...masterOnly, requirePermission(PERMISSIONS.ORGANIZATION_MANAGE), organizationStatusAction('activate'));
router.post('/master-admin/organizations/:id/inactivate', ...masterOnly, requirePermission(PERMISSIONS.ORGANIZATION_MANAGE), organizationStatusAction('inactivate'));
router.post('/master-admin/organizations/:id/suspend', ...masterOnly, requirePermission(PERMISSIONS.ORGANIZATION_MANAGE), organizationStatusAction('suspend'));
router.post('/master-admin/organizations/:id/reactivate', ...masterOnly, requirePermission(PERMISSIONS.ORGANIZATION_MANAGE), organizationStatusAction('reactivate'));
router.post('/master-admin/organizations/:id/archive', ...masterOnly, requirePermission(PERMISSIONS.ORGANIZATION_MANAGE), organizationStatusAction('archive'));

router.delete('/master-admin/organizations/:id', ...masterOnly, requirePermission(PERMISSIONS.ORGANIZATION_MANAGE), wrap(async (req, res) => {
  const id = Number(req.params.id);
  const reason = ensureReason(res, req.body, 'delete organization');
  if (!reason) return;
  if (textOrNull(req.body?.confirmation) !== 'DELETE') return jsonError(res, 400, 'Type DELETE to confirm permanent deletion.', 'VALIDATION_ERROR');
  const [users, products, services, bids, orders] = await Promise.all([
    safeCount(prisma.user, { where: { organizationId: id } }),
    safeCount((prisma as any).product, { where: { organizationId: id } }),
    safeCount((prisma as any).service, { where: { organizationId: id } }),
    safeCount((prisma as any).procurementBid, { where: { organizationId: id } }),
    safeCount((prisma as any).purchaseOrder, { where: { OR: [{ buyerOrganizationId: id }, { sellerOrganizationId: id }] } })
  ]);
  if (users || products || services || bids || orders) {
    const organization = await prisma.organization.update({
      where: { id },
      data: { verificationStatus: 'SUSPENDED' as any, isBlacklisted: true, blacklistReason: reason },
      select: organizationSelect as any
    });
    await createAuditLog(req, { action: 'organization.archive.deleteBlocked', entityType: 'organization', entityId: id, metadata: { reason, users, products, services, bids, orders } });
    return jsonOk(res, organization, 'Organization has dependencies, so it was archived instead of permanently deleted.');
  }
  await prisma.organization.delete({ where: { id } });
  await createAuditLog(req, { action: 'organization.delete', entityType: 'organization', entityId: id, metadata: { reason } });
  jsonOk(res, { id }, 'Organization permanently deleted');
}));

const getOrganizationCompany = async (organizationId: number): Promise<any | null> => {
  const organization: any = await prisma.organization.findUnique({
    where: { id: organizationId },
    select: { id: true, organizationName: true, companyId: true, company: { select: companySelect } as any }
  } as any);
  if (!organization) return null;
  if (organization.companyId) return organization;
  const company = await (prisma as any).company.findFirst({ where: { isActive: true }, select: companySelect });
  if (!company) return organization;
  return { ...organization, companyId: company.id, company };
};

const defaultTheme = {
  themeName: 'JsgSmile Default',
  primaryColor: '#12335f',
  secondaryColor: '#0f766e',
  accentColor: '#c27803',
  sidebarStyle: 'compact',
  dashboardLayout: 'governance',
  enableCompactMode: true,
  enableRoundedCards: false,
  logoUrl: null,
  faviconUrl: null
};

router.get('/master-admin/organizations/:id/theme', ...masterOnly, wrap(async (req, res) => {
  const organizationId = Number(req.params.id);
  const organization = await getOrganizationCompany(organizationId);
  if (!organization) return jsonError(res, 404, 'Organization not found.', 'ORGANIZATION_NOT_FOUND');
  const key = `organization:${organizationId}:theme`;
  const setting = organization.companyId ? await (prisma as any).companySetting.findUnique({
    where: { companyId_key: { companyId: organization.companyId, key } }
  }) : null;
  jsonOk(res, {
    organizationId,
    companyId: organization.companyId,
    ...(defaultTheme),
    ...((organization.company as any)?.themeSettings || {}),
    ...(setting?.value || {})
  });
}));

router.put('/master-admin/organizations/:id/theme', ...masterOnly, requirePermission(PERMISSIONS.BRANDING_UPDATE), wrap(async (req, res) => {
  const organizationId = Number(req.params.id);
  const organization = await getOrganizationCompany(organizationId);
  if (!organization?.companyId) return jsonError(res, 400, 'Organization must be assigned to a company before theme settings can be stored.', 'ACTION_NOT_ALLOWED');
  const theme = {
    themeName: textOrNull(req.body?.themeName) || defaultTheme.themeName,
    primaryColor: textOrNull(req.body?.primaryColor) || defaultTheme.primaryColor,
    secondaryColor: textOrNull(req.body?.secondaryColor) || defaultTheme.secondaryColor,
    accentColor: textOrNull(req.body?.accentColor) || defaultTheme.accentColor,
    logoUrl: textOrNull(req.body?.logoUrl),
    faviconUrl: textOrNull(req.body?.faviconUrl),
    dashboardLayout: textOrNull(req.body?.dashboardLayout) || defaultTheme.dashboardLayout,
    sidebarStyle: textOrNull(req.body?.sidebarStyle) || defaultTheme.sidebarStyle,
    enableCompactMode: typeof req.body?.enableCompactMode === 'boolean' ? req.body.enableCompactMode : true,
    enableRoundedCards: typeof req.body?.enableRoundedCards === 'boolean' ? req.body.enableRoundedCards : false,
    customCssJson: req.body?.customCssJson && typeof req.body.customCssJson === 'object' ? req.body.customCssJson : undefined
  };
  const key = `organization:${organizationId}:theme`;
  await (prisma as any).companySetting.upsert({
    where: { companyId_key: { companyId: organization.companyId, key } },
    update: { value: theme },
    create: { companyId: organization.companyId, key, value: theme }
  });
  await createAuditLog(req, { action: 'organization.theme.update', entityType: 'organization', entityId: organizationId, metadata: { companyId: organization.companyId, reason: textOrNull(req.body?.reason) } });
  jsonOk(res, { organizationId, companyId: organization.companyId, ...theme }, 'Theme updated successfully');
}));

router.post('/master-admin/organizations/:id/theme/reset', ...masterOnly, requirePermission(PERMISSIONS.BRANDING_UPDATE), wrap(async (req, res) => {
  const organizationId = Number(req.params.id);
  const organization = await getOrganizationCompany(organizationId);
  if (!organization?.companyId) return jsonError(res, 400, 'Organization must be assigned to a company before theme settings can be reset.', 'ACTION_NOT_ALLOWED');
  await (prisma as any).companySetting.deleteMany({ where: { companyId: organization.companyId, key: `organization:${organizationId}:theme` } });
  await createAuditLog(req, { action: 'organization.theme.reset', entityType: 'organization', entityId: organizationId, metadata: { companyId: organization.companyId, reason: textOrNull(req.body?.reason) } });
  jsonOk(res, { organizationId, companyId: organization.companyId, ...defaultTheme }, 'Theme reset successfully');
}));

router.get('/master-admin/organizations/:id/features', ...masterOnly, wrap(async (req, res) => {
  const organization = await getOrganizationCompany(Number(req.params.id));
  if (!organization) return jsonError(res, 404, 'Organization not found.', 'ORGANIZATION_NOT_FOUND');
  if (!organization.companyId) return jsonOk(res, { items: [] }, 'Organization has no company feature context.');
  const features = await (prisma as any).feature.findMany({
    orderBy: [{ module: 'asc' }, { name: 'asc' }],
    include: { companies: { where: { companyId: organization.companyId } } }
  });
  jsonOk(res, {
    items: features.map((feature: any) => ({
      id: feature.id,
      code: feature.code,
      featureKey: feature.code,
      name: feature.name,
      featureName: feature.name,
      module: feature.module,
      description: feature.description,
      enabled: feature.companies[0]?.enabled ?? false,
      isEnabled: feature.companies[0]?.enabled ?? false,
      updatedAt: feature.companies[0]?.updatedAt ?? null
    }))
  });
}));

router.put('/master-admin/organizations/:id/features', ...masterOnly, requirePermission(PERMISSIONS.FEATURE_TOGGLE), wrap(async (req, res) => {
  const organization = await getOrganizationCompany(Number(req.params.id));
  if (!organization?.companyId) return jsonError(res, 400, 'Organization must be assigned to a company before feature settings can be stored.', 'ACTION_NOT_ALLOWED');
  req.params.id = String(organization.companyId);
  const features = Array.isArray(req.body?.features) ? req.body.features : [];
  for (const row of features) {
    const feature = row.featureKey || row.code ? await (prisma as any).feature.findUnique({ where: { code: String(row.featureKey || row.code) } }) : null;
    const featureId = Number(row.featureId || row.id || feature?.id);
    if (!Number.isFinite(featureId)) continue;
    await (prisma as any).companyFeature.upsert({
      where: { companyId_featureId: { companyId: organization.companyId, featureId } },
      update: { enabled: Boolean(row.enabled ?? row.isEnabled), updatedById: req.user?.id },
      create: { companyId: organization.companyId, featureId, enabled: Boolean(row.enabled ?? row.isEnabled), updatedById: req.user?.id }
    });
  }
  await createAuditLog(req, { action: 'organization.features.update', entityType: 'organization', entityId: organization.id, metadata: { companyId: organization.companyId, count: features.length, reason: textOrNull(req.body?.reason) } });
  jsonOk(res, { count: features.length }, 'Feature controls updated successfully');
}));

router.post('/master-admin/organizations/:id/features/:featureKey/enable', ...masterOnly, requirePermission(PERMISSIONS.FEATURE_TOGGLE), wrap(async (req, res) => {
  const organization = await getOrganizationCompany(Number(req.params.id));
  if (!organization?.companyId) return jsonError(res, 400, 'Organization must be assigned to a company before feature settings can be stored.', 'ACTION_NOT_ALLOWED');
  const feature = await (prisma as any).feature.findUnique({ where: { code: req.params.featureKey } });
  if (!feature) return jsonError(res, 404, 'Feature not found.', 'ACTION_NOT_ALLOWED');
  await (prisma as any).companyFeature.upsert({
    where: { companyId_featureId: { companyId: organization.companyId, featureId: feature.id } },
    update: { enabled: true, updatedById: req.user?.id },
    create: { companyId: organization.companyId, featureId: feature.id, enabled: true, updatedById: req.user?.id }
  });
  await createAuditLog(req, { action: 'organization.feature.enable', entityType: 'organization', entityId: organization.id, metadata: { companyId: organization.companyId, featureKey: feature.code, reason: textOrNull(req.body?.reason) } });
  jsonOk(res, { featureKey: feature.code, enabled: true }, 'Feature enabled');
}));

router.post('/master-admin/organizations/:id/features/:featureKey/disable', ...masterOnly, requirePermission(PERMISSIONS.FEATURE_TOGGLE), wrap(async (req, res) => {
  const organization = await getOrganizationCompany(Number(req.params.id));
  if (!organization?.companyId) return jsonError(res, 400, 'Organization must be assigned to a company before feature settings can be stored.', 'ACTION_NOT_ALLOWED');
  const feature = await (prisma as any).feature.findUnique({ where: { code: req.params.featureKey } });
  if (!feature) return jsonError(res, 404, 'Feature not found.', 'ACTION_NOT_ALLOWED');
  await (prisma as any).companyFeature.upsert({
    where: { companyId_featureId: { companyId: organization.companyId, featureId: feature.id } },
    update: { enabled: false, updatedById: req.user?.id },
    create: { companyId: organization.companyId, featureId: feature.id, enabled: false, updatedById: req.user?.id }
  });
  await createAuditLog(req, { action: 'organization.feature.disable', entityType: 'organization', entityId: organization.id, metadata: { companyId: organization.companyId, featureKey: feature.code, reason: textOrNull(req.body?.reason) } });
  jsonOk(res, { featureKey: feature.code, enabled: false }, 'Feature disabled');
}));

router.post('/master-admin/users', ...masterOnly, requirePermission(PERMISSIONS.USER_CREATE), wrap(async (req, res) => {
  try {
    const data = await userPayload(req.body || {});
    const existing = await prisma.user.findUnique({ where: { email: data.email }, select: { id: true } });
    if (existing) return jsonError(res, 409, 'A user with this email already exists.', 'DUPLICATE_EMAIL');
    const user = await prisma.user.create({ data: { ...data, userId: data.email }, select: userSelect });
    await createAuditLog(req, { action: 'user.create', entityType: 'user', entityId: user.id, metadata: { email: user.email, role: user.role } });
    jsonOk(res, user, 'User created successfully', 201);
  } catch (error: any) {
    const code = String(error?.message || '');
    if (code === 'INVALID_ROLE') return jsonError(res, 400, 'Invalid role selected.', 'INVALID_ROLE');
    if (code === 'INVALID_STATUS') return jsonError(res, 400, 'Invalid user status selected.', 'INVALID_STATUS');
    return jsonError(res, 400, 'Name, email, and role are required.', 'VALIDATION_ERROR');
  }
}));

router.get('/master-admin/users/:id', ...masterOnly, wrap(async (req, res) => {
  const id = Number(req.params.id);
  const user = await prisma.user.findUnique({ where: { id }, select: userSelect });
  if (!user) return jsonError(res, 404, 'User not found.', 'USER_NOT_FOUND');
  jsonOk(res, user);
}));

router.put('/master-admin/users/:id', ...masterOnly, requirePermission(PERMISSIONS.USER_UPDATE), wrap(async (req, res) => {
  const id = Number(req.params.id);
  try {
    const data = await userPayload(req.body || {}, true);
    if (data.email) {
      const existing = await prisma.user.findFirst({ where: { email: data.email, id: { not: id } }, select: { id: true } });
      if (existing) return jsonError(res, 409, 'A user with this email already exists.', 'DUPLICATE_EMAIL');
      data.userId = data.email;
    }
    const user = await prisma.user.update({ where: { id }, data, select: userSelect });
    await createAuditLog(req, { action: 'user.update', entityType: 'user', entityId: id, metadata: { email: user.email, role: user.role } });
    jsonOk(res, user, 'User updated successfully');
  } catch (error: any) {
    const code = String(error?.message || '');
    if (code === 'INVALID_ROLE') return jsonError(res, 400, 'Invalid role selected.', 'INVALID_ROLE');
    if (code === 'INVALID_STATUS') return jsonError(res, 400, 'Invalid user status selected.', 'INVALID_STATUS');
    return jsonError(res, 404, 'User not found or update is invalid.', 'USER_NOT_FOUND');
  }
}));

const userStatusAction = (action: 'activate' | 'inactivate' | 'suspend' | 'reactivate' | 'archive') =>
  wrap(async (req, res) => {
    const id = Number(req.params.id);
    const reason = ensureReason(res, req.body, action);
    if (!reason) return;
    const accountStatus = action === 'activate' || action === 'reactivate' ? 'ACTIVE' : action === 'archive' ? 'DELETED' : action === 'suspend' ? 'SUSPENDED' : 'BLOCKED';
    const user = await prisma.user.update({ where: { id }, data: { accountStatus: accountStatus as any, sessionVersion: { increment: 1 } }, select: userSelect });
    await createAuditLog(req, { action: `user.${action}`, entityType: 'user', entityId: id, metadata: { reason, accountStatus } });
    jsonOk(res, user, `User ${action} successful`);
  });

router.post('/master-admin/users/:id/activate', ...masterOnly, requirePermission(PERMISSIONS.USER_UPDATE), userStatusAction('activate'));
router.post('/master-admin/users/:id/inactivate', ...masterOnly, requirePermission(PERMISSIONS.USER_UPDATE), userStatusAction('inactivate'));
router.post('/master-admin/users/:id/suspend', ...masterOnly, requirePermission(PERMISSIONS.USER_UPDATE), userStatusAction('suspend'));
router.post('/master-admin/users/:id/reactivate', ...masterOnly, requirePermission(PERMISSIONS.USER_UPDATE), userStatusAction('reactivate'));
router.post('/master-admin/users/:id/archive', ...masterOnly, requirePermission(PERMISSIONS.USER_DELETE), userStatusAction('archive'));

router.delete('/master-admin/users/:id', ...masterOnly, requirePermission(PERMISSIONS.USER_DELETE), wrap(async (req, res) => {
  const id = Number(req.params.id);
  const reason = ensureReason(res, req.body, 'delete user');
  if (!reason) return;
  if (textOrNull(req.body?.confirmation) !== 'DELETE') return jsonError(res, 400, 'Type DELETE to confirm permanent deletion.', 'VALIDATION_ERROR');
  const [payments, orders, bids, auditLogs] = await Promise.all([
    safeCount((prisma as any).paymentTransaction, { where: { OR: [{ payerId: id }, { payeeId: id }] } }),
    safeCount((prisma as any).purchaseOrder, { where: { OR: [{ buyerId: id }, { sellerId: id }] } }),
    safeCount((prisma as any).procurementBid, { where: { createdById: id } }),
    safeCount(prisma.auditLog, { where: { userId: id } })
  ]);
  if (payments || orders || bids || auditLogs) {
    const user = await prisma.user.update({ where: { id }, data: { accountStatus: 'DELETED' as any, sessionVersion: { increment: 1 } }, select: userSelect });
    await createAuditLog(req, { action: 'user.archive.deleteBlocked', entityType: 'user', entityId: id, metadata: { reason, payments, orders, bids, auditLogs } });
    return jsonOk(res, user, 'User has dependencies, so the account was archived instead of permanently deleted.');
  }
  await prisma.user.delete({ where: { id } });
  await createAuditLog(req, { action: 'user.delete', entityType: 'user', entityId: id, metadata: { reason } });
  jsonOk(res, { id }, 'User permanently deleted');
}));

router.post('/master-admin/users/:id/reset-password', ...masterOnly, requirePermission(PERMISSIONS.USER_UPDATE), wrap(async (req, res) => {
  const id = Number(req.params.id);
  const temporaryPassword = textOrNull(req.body?.temporaryPassword) || `JsgSmile@${randomToken(8)}Aa1!`;
  const user = await prisma.user.update({
    where: { id },
    data: { password: await hashPassword(temporaryPassword), passwordResetVersion: { increment: 1 }, sessionVersion: { increment: 1 } },
    select: userSelect
  });
  await createAuditLog(req, { action: 'user.password.reset', entityType: 'user', entityId: id, metadata: { reason: textOrNull(req.body?.reason) || 'Master admin reset' } });
  jsonOk(res, { user, temporaryPassword }, 'Temporary password generated. Share it through an approved secure channel.');
}));

router.post('/master-admin/users/:id/invite', ...masterOnly, requirePermission(PERMISSIONS.USER_UPDATE), wrap(async (req, res) => {
  const id = Number(req.params.id);
  const user = await prisma.user.update({ where: { id }, data: { accountStatus: 'PENDING' as any }, select: userSelect });
  await createAuditLog(req, { action: 'user.invite.marked', entityType: 'user', entityId: id, metadata: { reason: textOrNull(req.body?.reason) || 'Master admin invite' } });
  jsonOk(res, user, 'User marked as invited/pending. Email delivery depends on SMTP configuration.');
}));

router.post('/master-admin/users/:id/change-role', ...masterOnly, requirePermission(PERMISSIONS.ROLE_ASSIGN), wrap(async (req, res) => {
  const id = Number(req.params.id);
  const role = textOrNull(req.body?.role);
  if (!role || !allowedRoles.has(role)) return jsonError(res, 400, 'Invalid role selected.', 'INVALID_ROLE');
  const user = await prisma.user.update({ where: { id }, data: { role: role as any, sessionVersion: { increment: 1 } }, select: userSelect });
  await createAuditLog(req, { action: 'user.role.change', entityType: 'user', entityId: id, metadata: { role, reason: textOrNull(req.body?.reason) } });
  jsonOk(res, user, 'User role changed successfully');
}));

router.post('/master-admin/users/:id/change-organization', ...masterOnly, requirePermission(PERMISSIONS.USER_UPDATE), wrap(async (req, res) => {
  const id = Number(req.params.id);
  const organizationId = numberOrUndefined(req.body?.organizationId);
  if (!organizationId) return jsonError(res, 400, 'Organization is required.', 'VALIDATION_ERROR');
  const organization = await prisma.organization.findUnique({ where: { id: organizationId }, select: { id: true, companyId: true } });
  if (!organization) return jsonError(res, 404, 'Organization not found.', 'ORGANIZATION_NOT_FOUND');
  const user = await prisma.user.update({ where: { id }, data: { organizationId, companyId: organization.companyId || undefined }, select: userSelect });
  await createAuditLog(req, { action: 'user.organization.change', entityType: 'user', entityId: id, metadata: { organizationId, reason: textOrNull(req.body?.reason) } });
  jsonOk(res, user, 'User organization changed successfully');
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
  const company = await (prisma as any).company.findFirst({ orderBy: { id: 'asc' }, select: { id: true } });
  const stored = company ? await (prisma as any).companySetting.findUnique({
    where: { companyId_key: { companyId: company.id, key: 'portal-email-settings' } }
  }) : null;
  const storedValue = stored?.value || {};
  res.json({
    smtp: {
      host: storedValue.host || process.env.SMTP_HOST || '',
      port: Number(storedValue.port || process.env.SMTP_PORT || 587),
      secure: Boolean(storedValue.secure),
      user: storedValue.username ? maskSecret(String(storedValue.username), 3) : process.env.SMTP_USER ? maskSecret(process.env.SMTP_USER, 3) : null,
      username: storedValue.username ? maskSecret(String(storedValue.username), 3) : process.env.SMTP_USER ? maskSecret(process.env.SMTP_USER, 3) : null,
      fromEmail: storedValue.fromEmail ? maskSecret(String(storedValue.fromEmail), 3) : process.env.SMTP_USER ? maskSecret(process.env.SMTP_USER, 3) : null,
      fromName: storedValue.fromName || 'JsgSmile Portal',
      replyToEmail: storedValue.replyToEmail || null,
      emailEnabled: storedValue.emailEnabled ?? Boolean(process.env.SMTP_USER && process.env.SMTP_PASS),
      passwordConfigured: Boolean(storedValue.passwordConfigured || process.env.SMTP_PASS)
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

router.put('/master-admin/email-settings', ...masterOnly, requirePermission(PERMISSIONS.CONTENT_UPDATE), wrap(async (req, res) => {
  let company = await (prisma as any).company.findFirst({ orderBy: { id: 'asc' }, select: { id: true } });
  if (!company) {
    company = await (prisma as any).company.create({
      data: { name: 'JsgSmile', portalDisplayName: 'JsgSmile Portal', isActive: true },
      select: { id: true }
    });
  }
  const current = await (prisma as any).companySetting.findUnique({ where: { companyId_key: { companyId: company.id, key: 'portal-email-settings' } } });
  const currentValue = current?.value || {};
  const password = textOrNull(req.body?.password);
  const value = {
    host: textOrNull(req.body?.host) || textOrNull(req.body?.smtpHost) || currentValue.host || '',
    port: Number(req.body?.port || req.body?.smtpPort || currentValue.port || 587),
    secure: Boolean(req.body?.secure ?? currentValue.secure),
    username: textOrNull(req.body?.username) || textOrNull(req.body?.user) || currentValue.username || '',
    passwordConfigured: Boolean(password || currentValue.passwordConfigured),
    passwordUpdatedAt: password ? new Date().toISOString() : currentValue.passwordUpdatedAt,
    fromEmail: textOrNull(req.body?.fromEmail) || currentValue.fromEmail || '',
    fromName: textOrNull(req.body?.fromName) || currentValue.fromName || 'JsgSmile Portal',
    replyToEmail: textOrNull(req.body?.replyToEmail) || currentValue.replyToEmail || '',
    emailEnabled: typeof req.body?.emailEnabled === 'boolean' ? req.body.emailEnabled : Boolean(currentValue.emailEnabled)
  };
  await (prisma as any).companySetting.upsert({
    where: { companyId_key: { companyId: company.id, key: 'portal-email-settings' } },
    update: { value },
    create: { companyId: company.id, key: 'portal-email-settings', value }
  });
  await createAuditLog(req, { action: 'email.settings.update', entityType: 'portal', entityId: company.id, metadata: { reason: textOrNull(req.body?.reason), passwordUpdated: Boolean(password) } });
  jsonOk(res, {
    smtp: {
      ...value,
      username: value.username ? maskSecret(value.username, 3) : null,
      passwordConfigured: value.passwordConfigured
    }
  }, 'Email settings saved successfully');
}));

router.post('/master-admin/email-settings/test', ...masterOnly, requirePermission(PERMISSIONS.CONTENT_UPDATE), wrap(async (req, res) => {
  const to = textOrNull(req.body?.to);
  if (!to || !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(to)) return jsonError(res, 400, 'Valid test email recipient is required.', 'VALIDATION_ERROR');
  await createAuditLog(req, { action: 'email.settings.test', entityType: 'portal', metadata: { to: maskSecret(to, 2) } });
  jsonOk(res, { to: maskSecret(to, 2), deliveryAttempted: false }, 'SMTP test request recorded. Live delivery uses deployment SMTP credentials.');
}));

router.get('/master-admin/portal-settings', ...masterOnly, wrap(async (_req, res) => {
  const company = await (prisma as any).company.findFirst({ orderBy: { id: 'asc' }, select: companySelect });
  jsonOk(res, { company });
}));

router.put('/master-admin/portal-settings', ...masterOnly, requirePermission(PERMISSIONS.CONTENT_UPDATE), wrap(async (req, res) => {
  let company = await (prisma as any).company.findFirst({ orderBy: { id: 'asc' }, select: { id: true } });
  if (!company) {
    company = await (prisma as any).company.create({ data: { name: 'JsgSmile', portalDisplayName: 'JsgSmile Portal', isActive: true }, select: { id: true } });
  }
  const updated = await (prisma as any).company.update({ where: { id: company.id }, data: companyPayload(req.body || {}), select: companySelect });
  await createAuditLog(req, { action: 'portal.settings.update', entityType: 'portal', entityId: company.id, metadata: { reason: textOrNull(req.body?.reason) } });
  jsonOk(res, updated, 'Portal settings updated successfully');
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

router.get('/master-admin/reports', ...masterOnly, wrap(async (_req, res) => {
  const [organizations, users, procurementBids, purchaseOrders, payments, auditLogs] = await Promise.all([
    safeCount(prisma.organization),
    safeCount(prisma.user),
    safeCount((prisma as any).procurementBid),
    safeCount((prisma as any).purchaseOrder),
    safeCount((prisma as any).paymentTransaction),
    safeCount(prisma.auditLog)
  ]);
  jsonOk(res, { organizations, users, procurementBids, purchaseOrders, payments, auditLogs, generatedAt: new Date().toISOString() });
}));

router.get('/master-admin/procurement-overview', ...masterOnly, wrap(async (_req, res) => {
  const [totalBids, pendingApprovals, activeBids, technicalEvaluation, financialEvaluation, awardRecommended, cancelled] = await Promise.all([
    safeCount((prisma as any).procurementBid),
    safeCount((prisma as any).procurementBid, { where: { approvalStatus: 'PENDING' } }),
    safeCount((prisma as any).procurementBid, { where: { status: 'OPEN' } }),
    safeCount((prisma as any).procurementBid, { where: { status: 'TECHNICAL_EVALUATION' } }),
    safeCount((prisma as any).procurementBid, { where: { status: 'FINANCIAL_EVALUATION' } }),
    safeCount((prisma as any).procurementBid, { where: { status: 'AWARD_RECOMMENDED' } }),
    safeCount((prisma as any).procurementBid, { where: { status: { in: ['CANCELLED', 'EXPIRED'] } } })
  ]);
  jsonOk(res, { totalBids, pendingApprovals, activeBids, technicalEvaluation, financialEvaluation, awardRecommended, cancelled });
}));

router.get('/master-admin/payment-overview', ...masterOnly, wrap(async (_req, res) => {
  const [totalPayments, failedPayments, pendingSettlements, completedSettlements, pendingWebhooks] = await Promise.all([
    safeCount((prisma as any).paymentTransaction),
    safeCount((prisma as any).paymentTransaction, { where: { status: { in: ['failed', 'FAILED'] } } }),
    safeCount((prisma as any).paymentSettlement, { where: { status: 'PENDING' } }),
    safeCount((prisma as any).paymentSettlement, { where: { status: 'RELEASED' } }),
    safeCount((prisma as any).paymentWebhookEvent, { where: { processed: false } })
  ]);
  jsonOk(res, { totalPayments, failedPayments, pendingSettlements, completedSettlements, pendingWebhooks });
}));

const maskSecret = (value: string, visible = 4) => {
  if (!value) return '';
  if (value.length <= visible * 2) return '*'.repeat(value.length);
  return `${value.slice(0, visible)}${'*'.repeat(Math.min(10, value.length - visible * 2))}${value.slice(-visible)}`;
};

export default router;
