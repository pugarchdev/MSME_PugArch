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
  updatedAt: true,
  _count: { select: { users: true, organizations: true, features: true, buyerRequirements: true } }
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
const allowedMarketplaceStatuses = new Set(['DRAFT', 'ACTIVE', 'INACTIVE', 'OUT_OF_STOCK', 'ARCHIVED']);
const allowedOrderStatuses = new Set(['generated', 'issued', 'accepted', 'in_fulfillment', 'delivered', 'completed', 'closed', 'cancelled', 'escrow_held']);
const allowedInvoiceStatuses = new Set(['submitted', 'under_review', 'approved', 'rejected', 'paid', 'cancelled']);
const allowedPaymentStatuses = new Set(['initiated', 'pending', 'processing', 'success', 'failed', 'refunded', 'cancelled', 'settled', 'escrow_released', 'on_hold', 'dispute']);
const allowedPaymentStatusEnums = new Set(['INITIATED', 'PENDING', 'PROCESSING', 'SUCCESS', 'FAILED', 'REFUNDED', 'CANCELLED', 'PAYMENT_PENDING', 'PORTAL_PAYMENT_INITIATED', 'PORTAL_PAYMENT_SUCCESS', 'PORTAL_PAYMENT_FAILED', 'OFFLINE_PROOF_UPLOADED', 'OFFLINE_PROOF_UNDER_REVIEW', 'OFFLINE_PROOF_VERIFIED', 'OFFLINE_PROOF_REJECTED', 'SETTLEMENT_PENDING', 'SETTLED']);
const allowedEscrowStatuses = new Set(['held', 'funded', 'frozen', 'released', 'dispute', 'cancelled']);
const allowedEscrowStatusEnums = new Set(['HELD', 'FUNDED', 'RELEASED', 'REFUNDED', 'DISPUTED', 'FROZEN']);

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

const searchText = (value: unknown) => textOrNull(value) || '';
const searchLimit = (value: unknown) => Math.min(Math.max(Number(value) || 5, 1), 10);
const searchItem = (type: string, item: Record<string, any>, title: string, subtitle?: string | null, href?: string, status?: string | null) => ({
  id: item.id,
  type,
  title,
  subtitle: subtitle || null,
  status: status || null,
  company: item.company?.portalDisplayName || item.company?.name || null,
  updatedAt: item.updatedAt || item.createdAt || null,
  href
});

const csvCell = (value: unknown) => {
  if (value === null || value === undefined) return '';
  const text = typeof value === 'object' ? JSON.stringify(value) : String(value);
  return `"${text.replace(/"/g, '""').replace(/\r?\n/g, ' ')}"`;
};

const sendCsv = (res: Response, filename: string, rows: Array<Record<string, unknown>>) => {
  const columns = Array.from(rows.reduce((set, row) => {
    Object.keys(row).forEach(key => set.add(key));
    return set;
  }, new Set<string>()));
  const csv = [
    columns.join(','),
    ...rows.map(row => columns.map(column => csvCell(row[column])).join(','))
  ].join('\n');
  res.setHeader('Content-Type', 'text/csv; charset=utf-8');
  res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
  res.send(csv);
};

const flattenRecord = (record: Record<string, any>) => {
  const flattened: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(record)) {
    if (value instanceof Date) flattened[key] = value.toISOString();
    else if (value && typeof value === 'object' && !Array.isArray(value)) {
      for (const [nestedKey, nestedValue] of Object.entries(value)) {
        flattened[`${key}_${nestedKey}`] = nestedValue instanceof Date ? nestedValue.toISOString() : nestedValue;
      }
    } else flattened[key] = value;
  }
  return flattened;
};

const exportDateWhere = (query: Record<string, unknown>) => {
  const from = textOrNull(query.from);
  const to = textOrNull(query.to);
  if (!from && !to) return {};
  return {
    createdAt: {
      ...(from ? { gte: new Date(from) } : {}),
      ...(to ? { lte: new Date(to) } : {})
    }
  };
};

const archiveUserDeleteBlocked = async (req: AuthRequest, id: number, reason: string, metadata: Record<string, unknown>) => {
  const user = await prisma.user.update({ where: { id }, data: { accountStatus: 'DELETED' as any, sessionVersion: { increment: 1 } }, select: userSelect });
  await createAuditLog(req, { action: 'user.archive.deleteBlocked', entityType: 'user', entityId: id, metadata: { reason, ...metadata } });
  return user;
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
    isActive: 'isActive',
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
  const reason = ensureReason(res, req.body, 'create company');
  if (!reason) return;
  const company = await (prisma as any).company.create({ data: companyPayload(req.body || {}), select: companySelect });
  await createAuditLog(req, { action: 'company.create', entityType: 'company', entityId: company.id, metadata: { name: company.name, reason } });
  res.status(201).json(company);
}));

router.put('/master-admin/companies/:id', ...masterOnly, requirePermission(PERMISSIONS.COMPANY_MANAGE), wrap(async (req, res) => {
  const id = Number(req.params.id);
  const reason = ensureReason(res, req.body, 'update company');
  if (!reason) return;
  const company = await (prisma as any).company.update({ where: { id }, data: companyPayload(req.body || {}), select: companySelect });
  await createAuditLog(req, { action: 'company.update', entityType: 'company', entityId: company.id, metadata: { reason } });
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
  const reason = ensureReason(res, req.body, 'archive company');
  if (!reason) return;
  const company = await (prisma as any).company.update({ where: { id }, data: { isActive: false }, select: companySelect });
  await createAuditLog(req, { action: 'company.archive', entityType: 'company', entityId: id, metadata: { reason, requestedVia: 'DELETE' } });
  jsonOk(res, company, 'Company archived successfully. Historical records were preserved.');
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
  const reason = ensureReason(res, req.body, 'update feature controls');
  if (!reason) return;
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
  await createAuditLog(req, { action: 'feature.toggle', entityType: 'company', entityId: companyId, metadata: { count: features.length, reason } });
  res.json({ success: true });
}));

router.post('/master-admin/companies/:id/features/:featureKey/enable', ...masterOnly, requirePermission(PERMISSIONS.FEATURE_TOGGLE), wrap(async (req, res) => {
  const companyId = Number(req.params.id);
  const reason = ensureReason(res, req.body, 'enable feature');
  if (!reason) return;
  const feature = await (prisma as any).feature.findUnique({ where: { code: req.params.featureKey } });
  if (!feature) return jsonError(res, 404, 'Feature not found.', 'ACTION_NOT_ALLOWED');
  await (prisma as any).companyFeature.upsert({
    where: { companyId_featureId: { companyId, featureId: feature.id } },
    update: { enabled: true, updatedById: req.user?.id },
    create: { companyId, featureId: feature.id, enabled: true, updatedById: req.user?.id }
  });
  await createAuditLog(req, { action: 'feature.enable', entityType: 'company', entityId: companyId, metadata: { featureKey: feature.code, reason } });
  jsonOk(res, { featureKey: feature.code, enabled: true }, 'Feature enabled');
}));

router.post('/master-admin/companies/:id/features/:featureKey/disable', ...masterOnly, requirePermission(PERMISSIONS.FEATURE_TOGGLE), wrap(async (req, res) => {
  const companyId = Number(req.params.id);
  const reason = ensureReason(res, req.body, 'disable feature');
  if (!reason) return;
  const feature = await (prisma as any).feature.findUnique({ where: { code: req.params.featureKey } });
  if (!feature) return jsonError(res, 404, 'Feature not found.', 'ACTION_NOT_ALLOWED');
  await (prisma as any).companyFeature.upsert({
    where: { companyId_featureId: { companyId, featureId: feature.id } },
    update: { enabled: false, updatedById: req.user?.id },
    create: { companyId, featureId: feature.id, enabled: false, updatedById: req.user?.id }
  });
  await createAuditLog(req, { action: 'feature.disable', entityType: 'company', entityId: companyId, metadata: { featureKey: feature.code, reason } });
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
    onboardingStatus: 'onboardingStatus',
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
    state: 'state',
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
  const reason = ensureReason(res, req.body, 'update branding content');
  if (!reason) return;
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
  await createAuditLog(req, { action: 'content.update', entityType: 'company', entityId: companyId, metadata: { reason } });
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
  const orderBy = sortableOrder(req.query as Record<string, unknown>, {
    action: 'action',
    entityType: 'entityType',
    entityId: 'entityId',
    createdAt: 'createdAt'
  }, { createdAt: 'desc' });
  const [items, total] = await Promise.all([
    prisma.auditLog.findMany({
      where,
      skip,
      take,
      orderBy,
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
  const reason = ensureReason(res, req.body, 'create organization');
  if (!reason) return;
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
    await createAuditLog(req, { action: 'organization.create', entityType: 'organization', entityId: organization.id, metadata: { name: organization.organizationName, reason } });
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
  const reason = ensureReason(res, req.body, 'update organization');
  if (!reason) return;
  try {
    const data = organizationPayload(req.body || {}, true);
    const organization: any = await prisma.organization.update({ where: { id }, data, select: organizationSelect as any });
    await createAuditLog(req, { action: 'organization.update', entityType: 'organization', entityId: id, metadata: { name: organization.organizationName, reason } });
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

// PATCH /master-admin/organizations/:id/close
router.patch('/master-admin/organizations/:id/close', ...masterOnly, wrap(async (req, res) => {
  const id = Number(req.params.id);
  const { reason, confirm, documentNote } = req.body || {};
  if (!reason || typeof reason !== 'string' || reason.trim() === '') {
    return res.status(400).json({ error: 'REASON_REQUIRED', message: 'Reason is required for this action.' });
  }
  if (confirm !== true) {
    return res.status(400).json({ error: 'CONFIRMATION_REQUIRED', message: 'Confirmation is required for this action.' });
  }

  const organization = await prisma.organization.findUnique({ where: { id } });
  if (!organization) {
    return res.status(404).json({ error: 'ORGANIZATION_NOT_FOUND', message: 'Organization not found.' });
  }

  const { getOrganizationClosureBlockers } = await import('../utils/closureBlockers.js');
  const blockers = await getOrganizationClosureBlockers(id);
  if (blockers) {
    return res.status(409).json(blockers);
  }

  const updated = await prisma.organization.update({
    where: { id },
    data: {
      verificationStatus: 'CLOSED' as any,
      closedAt: new Date(),
      closedBy: req.user?.id,
      closureReason: reason,
      blacklistReason: reason
    },
    select: organizationSelect as any
  });

  await createAuditLog(req, {
    action: 'ORGANIZATION_CLOSED',
    entityType: 'organization',
    entityId: id,
    metadata: {
      reason,
      documentNote,
      oldValue: { verificationStatus: organization.verificationStatus },
      newValue: { verificationStatus: 'CLOSED' }
    }
  });

  return res.json({ success: true, organization: updated, message: 'Organization closed successfully.' });
}));

// PATCH /master-admin/organizations/:id/archive
router.patch('/master-admin/organizations/:id/archive', ...masterOnly, wrap(async (req, res) => {
  const id = Number(req.params.id);
  const { reason, confirm, documentNote } = req.body || {};
  if (!reason || typeof reason !== 'string' || reason.trim() === '') {
    return res.status(400).json({ error: 'REASON_REQUIRED', message: 'Reason is required for this action.' });
  }
  if (confirm !== true) {
    return res.status(400).json({ error: 'CONFIRMATION_REQUIRED', message: 'Confirmation is required for this action.' });
  }

  const organization = await prisma.organization.findUnique({ where: { id } });
  if (!organization) {
    return res.status(404).json({ error: 'ORGANIZATION_NOT_FOUND', message: 'Organization not found.' });
  }

  const { getOrganizationClosureBlockers } = await import('../utils/closureBlockers.js');
  const blockers = await getOrganizationClosureBlockers(id);
  if (blockers) {
    return res.status(409).json(blockers);
  }

  const updated = await prisma.organization.update({
    where: { id },
    data: {
      verificationStatus: 'ARCHIVED' as any,
      archivedAt: new Date(),
      archivedBy: req.user?.id,
      closureReason: reason
    },
    select: organizationSelect as any
  });

  await createAuditLog(req, {
    action: 'ORGANIZATION_ARCHIVED',
    entityType: 'organization',
    entityId: id,
    metadata: {
      reason,
      documentNote,
      oldValue: { verificationStatus: organization.verificationStatus },
      newValue: { verificationStatus: 'ARCHIVED' }
    }
  });

  return res.json({ success: true, organization: updated, message: 'Organization archived successfully.' });
}));

// PATCH /master-admin/organizations/:id/restore
router.patch('/master-admin/organizations/:id/restore', ...masterOnly, wrap(async (req, res) => {
  const id = Number(req.params.id);
  const { reason, documentNote } = req.body || {};
  if (!reason || typeof reason !== 'string' || reason.trim() === '') {
    return res.status(400).json({ error: 'REASON_REQUIRED', message: 'Reason is required for this action.' });
  }

  const organization = await prisma.organization.findUnique({ where: { id } });
  if (!organization) {
    return res.status(404).json({ error: 'ORGANIZATION_NOT_FOUND', message: 'Organization not found.' });
  }

  const updated = await prisma.organization.update({
    where: { id },
    data: {
      verificationStatus: 'VERIFIED' as any,
      closedAt: null,
      closedBy: null,
      archivedAt: null,
      archivedBy: null,
      closureReason: null
    },
    select: organizationSelect as any
  });

  await createAuditLog(req, {
    action: 'ORGANIZATION_RESTORED',
    entityType: 'organization',
    entityId: id,
    metadata: {
      reason,
      documentNote,
      oldValue: { verificationStatus: organization.verificationStatus },
      newValue: { verificationStatus: 'VERIFIED' }
    }
  });

  return res.json({ success: true, organization: updated, message: 'Organization restored successfully.' });
}));

// PATCH /master-admin/organizations/:id/allow-gst-reuse
router.patch('/master-admin/organizations/:id/allow-gst-reuse', ...masterOnly, wrap(async (req, res) => {
  const id = Number(req.params.id);
  const { reason, confirm, documentNote } = req.body || {};
  if (!reason || typeof reason !== 'string' || reason.trim() === '') {
    return res.status(400).json({ error: 'REASON_REQUIRED', message: 'Reason is required for this action.' });
  }
  if (confirm !== true) {
    return res.status(400).json({ error: 'CONFIRMATION_REQUIRED', message: 'Confirmation is required for this action.' });
  }

  const organization = await prisma.organization.findUnique({ where: { id } });
  if (!organization) {
    return res.status(404).json({ error: 'ORGANIZATION_NOT_FOUND', message: 'Organization not found.' });
  }

  if (organization.verificationStatus !== 'CLOSED' && organization.verificationStatus !== 'ARCHIVED') {
    return res.status(400).json({ error: 'GST_REUSE_NOT_ALLOWED', message: 'GST reuse can only be allowed for CLOSED or ARCHIVED organizations.' });
  }

  const updated = await prisma.organization.update({
    where: { id },
    data: {
      gstReuseAllowed: true,
      gstReuseAllowedBy: req.user?.id,
      gstReuseAllowedAt: new Date(),
      gstReuseReason: reason
    },
    select: organizationSelect as any
  });

  await createAuditLog(req, {
    action: 'ORGANIZATION_GST_REUSE_ALLOWED',
    entityType: 'organization',
    entityId: id,
    metadata: {
      reason,
      documentNote,
      oldValue: { gstReuseAllowed: organization.gstReuseAllowed },
      newValue: { gstReuseAllowed: true }
    }
  });

  return res.json({ success: true, organization: updated, message: 'GST reuse allowed successfully.' });
}));

// PATCH /master-admin/organizations/:id/revoke-gst-reuse
router.patch('/master-admin/organizations/:id/revoke-gst-reuse', ...masterOnly, wrap(async (req, res) => {
  const id = Number(req.params.id);
  const { reason, confirm, documentNote } = req.body || {};
  if (!reason || typeof reason !== 'string' || reason.trim() === '') {
    return res.status(400).json({ error: 'REASON_REQUIRED', message: 'Reason is required for this action.' });
  }
  if (confirm !== true) {
    return res.status(400).json({ error: 'CONFIRMATION_REQUIRED', message: 'Confirmation is required for this action.' });
  }

  const organization = await prisma.organization.findUnique({ where: { id } });
  if (!organization) {
    return res.status(404).json({ error: 'ORGANIZATION_NOT_FOUND', message: 'Organization not found.' });
  }

  const updated = await prisma.organization.update({
    where: { id },
    data: {
      gstReuseAllowed: false,
      gstReuseAllowedBy: null,
      gstReuseAllowedAt: null,
      gstReuseReason: null
    },
    select: organizationSelect as any
  });

  await createAuditLog(req, {
    action: 'ORGANIZATION_GST_REUSE_REVOKED',
    entityType: 'organization',
    entityId: id,
    metadata: {
      reason,
      documentNote,
      oldValue: { gstReuseAllowed: organization.gstReuseAllowed },
      newValue: { gstReuseAllowed: false }
    }
  });

  return res.json({ success: true, organization: updated, message: 'GST reuse revoked successfully.' });
}));

router.delete('/master-admin/organizations/:id', ...masterOnly, requirePermission(PERMISSIONS.ORGANIZATION_MANAGE), wrap(async (req, res) => {
  const id = Number(req.params.id);
  const reason = ensureReason(res, req.body, 'archive organization');
  if (!reason) return;
  const organization = await prisma.organization.update({
    where: { id },
    data: { verificationStatus: 'SUSPENDED' as any, isBlacklisted: true, blacklistReason: reason },
    select: organizationSelect as any
  });
  await createAuditLog(req, { action: 'organization.archive', entityType: 'organization', entityId: id, metadata: { reason, requestedVia: 'DELETE' } });
  jsonOk(res, organization, 'Organization archived successfully. Historical records were preserved.');
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
  const reason = ensureReason(res, req.body, 'update organization theme');
  if (!reason) return;
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
  await createAuditLog(req, { action: 'organization.theme.update', entityType: 'organization', entityId: organizationId, metadata: { companyId: organization.companyId, reason } });
  jsonOk(res, { organizationId, companyId: organization.companyId, ...theme }, 'Theme updated successfully');
}));

router.post('/master-admin/organizations/:id/theme/reset', ...masterOnly, requirePermission(PERMISSIONS.BRANDING_UPDATE), wrap(async (req, res) => {
  const organizationId = Number(req.params.id);
  const reason = ensureReason(res, req.body, 'reset organization theme');
  if (!reason) return;
  const organization = await getOrganizationCompany(organizationId);
  if (!organization?.companyId) return jsonError(res, 400, 'Organization must be assigned to a company before theme settings can be reset.', 'ACTION_NOT_ALLOWED');
  await (prisma as any).companySetting.deleteMany({ where: { companyId: organization.companyId, key: `organization:${organizationId}:theme` } });
  await createAuditLog(req, { action: 'organization.theme.reset', entityType: 'organization', entityId: organizationId, metadata: { companyId: organization.companyId, reason } });
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
  const reason = ensureReason(res, req.body, 'update organization feature controls');
  if (!reason) return;
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
  await createAuditLog(req, { action: 'organization.features.update', entityType: 'organization', entityId: organization.id, metadata: { companyId: organization.companyId, count: features.length, reason } });
  jsonOk(res, { count: features.length }, 'Feature controls updated successfully');
}));

router.post('/master-admin/organizations/:id/features/:featureKey/enable', ...masterOnly, requirePermission(PERMISSIONS.FEATURE_TOGGLE), wrap(async (req, res) => {
  const organization = await getOrganizationCompany(Number(req.params.id));
  const reason = ensureReason(res, req.body, 'enable organization feature');
  if (!reason) return;
  if (!organization?.companyId) return jsonError(res, 400, 'Organization must be assigned to a company before feature settings can be stored.', 'ACTION_NOT_ALLOWED');
  const feature = await (prisma as any).feature.findUnique({ where: { code: req.params.featureKey } });
  if (!feature) return jsonError(res, 404, 'Feature not found.', 'ACTION_NOT_ALLOWED');
  await (prisma as any).companyFeature.upsert({
    where: { companyId_featureId: { companyId: organization.companyId, featureId: feature.id } },
    update: { enabled: true, updatedById: req.user?.id },
    create: { companyId: organization.companyId, featureId: feature.id, enabled: true, updatedById: req.user?.id }
  });
  await createAuditLog(req, { action: 'organization.feature.enable', entityType: 'organization', entityId: organization.id, metadata: { companyId: organization.companyId, featureKey: feature.code, reason } });
  jsonOk(res, { featureKey: feature.code, enabled: true }, 'Feature enabled');
}));

router.post('/master-admin/organizations/:id/features/:featureKey/disable', ...masterOnly, requirePermission(PERMISSIONS.FEATURE_TOGGLE), wrap(async (req, res) => {
  const organization = await getOrganizationCompany(Number(req.params.id));
  const reason = ensureReason(res, req.body, 'disable organization feature');
  if (!reason) return;
  if (!organization?.companyId) return jsonError(res, 400, 'Organization must be assigned to a company before feature settings can be stored.', 'ACTION_NOT_ALLOWED');
  const feature = await (prisma as any).feature.findUnique({ where: { code: req.params.featureKey } });
  if (!feature) return jsonError(res, 404, 'Feature not found.', 'ACTION_NOT_ALLOWED');
  await (prisma as any).companyFeature.upsert({
    where: { companyId_featureId: { companyId: organization.companyId, featureId: feature.id } },
    update: { enabled: false, updatedById: req.user?.id },
    create: { companyId: organization.companyId, featureId: feature.id, enabled: false, updatedById: req.user?.id }
  });
  await createAuditLog(req, { action: 'organization.feature.disable', entityType: 'organization', entityId: organization.id, metadata: { companyId: organization.companyId, featureKey: feature.code, reason } });
  jsonOk(res, { featureKey: feature.code, enabled: false }, 'Feature disabled');
}));

router.post('/master-admin/users', ...masterOnly, requirePermission(PERMISSIONS.USER_CREATE), wrap(async (req, res) => {
  const reason = ensureReason(res, req.body, 'create user');
  if (!reason) return;
  try {
    const data = await userPayload(req.body || {});
    const existing = await prisma.user.findUnique({ where: { email: data.email }, select: { id: true } });
    if (existing) return jsonError(res, 409, 'A user with this email already exists.', 'DUPLICATE_EMAIL');
    const user = await prisma.user.create({ data: { ...data, userId: data.email }, select: userSelect });
    await createAuditLog(req, { action: 'user.create', entityType: 'user', entityId: user.id, metadata: { email: user.email, role: user.role, reason } });
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
  const reason = ensureReason(res, req.body, 'update user');
  if (!reason) return;
  try {
    const data = await userPayload(req.body || {}, true);
    if (data.email) {
      const existing = await prisma.user.findFirst({ where: { email: data.email, id: { not: id } }, select: { id: true } });
      if (existing) return jsonError(res, 409, 'A user with this email already exists.', 'DUPLICATE_EMAIL');
      data.userId = data.email;
    }
    const user = await prisma.user.update({ where: { id }, data, select: userSelect });
    await createAuditLog(req, { action: 'user.update', entityType: 'user', entityId: id, metadata: { email: user.email, role: user.role, reason } });
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
  const reason = ensureReason(res, req.body, 'archive user');
  if (!reason) return;
  const user = await archiveUserDeleteBlocked(req, id, reason, { requestedVia: 'DELETE' });
  jsonOk(res, user, 'User archived successfully. Historical records were preserved.');
}));

router.post('/master-admin/users/:id/reset-password', ...masterOnly, requirePermission(PERMISSIONS.USER_UPDATE), wrap(async (req, res) => {
  const id = Number(req.params.id);
  const reason = ensureReason(res, req.body, 'reset user password');
  if (!reason) return;
  const temporaryPassword = textOrNull(req.body?.temporaryPassword) || `JsgSmile@${randomToken(8)}Aa1!`;
  const user = await prisma.user.update({
    where: { id },
    data: { password: await hashPassword(temporaryPassword), passwordResetVersion: { increment: 1 }, sessionVersion: { increment: 1 } },
    select: userSelect
  });
  await createAuditLog(req, { action: 'user.password.reset', entityType: 'user', entityId: id, metadata: { reason } });
  jsonOk(res, { user, temporaryPassword }, 'Temporary password generated. Share it through an approved secure channel.');
}));

router.post('/master-admin/users/:id/invite', ...masterOnly, requirePermission(PERMISSIONS.USER_UPDATE), wrap(async (req, res) => {
  const id = Number(req.params.id);
  const reason = ensureReason(res, req.body, 'invite user');
  if (!reason) return;
  const user = await prisma.user.update({ where: { id }, data: { accountStatus: 'PENDING' as any }, select: userSelect });
  await createAuditLog(req, { action: 'user.invite.marked', entityType: 'user', entityId: id, metadata: { reason } });
  jsonOk(res, user, 'User marked as invited/pending. Email delivery depends on SMTP configuration.');
}));

router.post('/master-admin/users/:id/change-role', ...masterOnly, requirePermission(PERMISSIONS.ROLE_ASSIGN), wrap(async (req, res) => {
  const id = Number(req.params.id);
  const reason = ensureReason(res, req.body, 'change user role');
  if (!reason) return;
  const role = textOrNull(req.body?.role);
  if (!role || !allowedRoles.has(role)) return jsonError(res, 400, 'Invalid role selected.', 'INVALID_ROLE');
  const user = await prisma.user.update({ where: { id }, data: { role: role as any, sessionVersion: { increment: 1 } }, select: userSelect });
  await createAuditLog(req, { action: 'user.role.change', entityType: 'user', entityId: id, metadata: { role, reason } });
  jsonOk(res, user, 'User role changed successfully');
}));

router.post('/master-admin/users/:id/change-organization', ...masterOnly, requirePermission(PERMISSIONS.USER_UPDATE), wrap(async (req, res) => {
  const id = Number(req.params.id);
  const reason = ensureReason(res, req.body, 'change user organization');
  if (!reason) return;
  const organizationId = numberOrUndefined(req.body?.organizationId);
  if (!organizationId) return jsonError(res, 400, 'Organization is required.', 'VALIDATION_ERROR');
  const organization = await prisma.organization.findUnique({ where: { id: organizationId }, select: { id: true, companyId: true } });
  if (!organization) return jsonError(res, 404, 'Organization not found.', 'ORGANIZATION_NOT_FOUND');
  const user = await prisma.user.update({ where: { id }, data: { organizationId, companyId: organization.companyId || undefined }, select: userSelect });
  await createAuditLog(req, { action: 'user.organization.change', entityType: 'user', entityId: id, metadata: { organizationId, reason } });
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
    buyerOrganizationName: 'buyerOrganizationName',
    approvalStatus: 'approvalStatus',
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

router.get('/master-admin/tenders', ...masterOnly, wrap(async (req, res) => {
  const { skip, take, page, pageSize } = getPagination(req.query as Record<string, unknown>);
  const q = textOrNull(req.query.q) || textOrNull(req.query.search);
  const status = textOrNull(req.query.status);
  const where: any = {
    ...(status ? { status: status as any } : {}),
    ...(q ? {
      OR: [
        { tenderId: { contains: q, mode: 'insensitive' } },
        { title: { contains: q, mode: 'insensitive' } },
        { category: { contains: q, mode: 'insensitive' } },
        { buyer: { name: { contains: q, mode: 'insensitive' } } },
        { organization: { organizationName: { contains: q, mode: 'insensitive' } } }
      ]
    } : {})
  };
  const orderBy = sortableOrder(req.query as Record<string, unknown>, {
    tenderId: 'tenderId',
    title: 'title',
    category: 'category',
    status: 'status',
    budget: 'budget',
    closesAt: 'closesAt',
    publishedAt: 'publishedAt',
    createdAt: 'createdAt',
    updatedAt: 'updatedAt'
  }, { createdAt: 'desc' });
  const [items, total, summary] = await Promise.all([
    prisma.tender.findMany({
      where,
      skip,
      take,
      orderBy,
      select: {
        id: true,
        tenderId: true,
        title: true,
        category: true,
        status: true,
        budget: true,
        bidsCount: true,
        closesAt: true,
        publishedAt: true,
        createdAt: true,
        buyer: { select: { id: true, name: true, email: true } },
        organization: { select: { id: true, organizationName: true, organizationType: true } },
        _count: { select: { bids: true, tenderParticipants: true, purchaseOrders: true } }
      }
    }),
    prisma.tender.count({ where }),
    Promise.all([
      safeCount(prisma.tender),
      safeCount(prisma.tender, { where: { status: 'draft' as any } }),
      safeCount(prisma.tender, { where: { status: { in: ['published', 'bid_submission'] as any } } }),
      safeCount(prisma.tender, { where: { status: { in: ['awarded', 'closed'] as any } } })
    ])
  ]);
  const [totalTenders, draftTenders, activeTenders, completedTenders] = summary;
  res.json({ items, total, page, pageSize, summary: { totalTenders, draftTenders, activeTenders, completedTenders } });
}));

router.get('/master-admin/rfqs', ...masterOnly, wrap(async (req, res) => {
  const { skip, take, page, pageSize } = getPagination(req.query as Record<string, unknown>);
  const q = textOrNull(req.query.q) || textOrNull(req.query.search);
  const status = textOrNull(req.query.status);
  const where: any = {
    ...(status ? { status } : {}),
    ...(q ? {
      OR: [
        { subject: { contains: q, mode: 'insensitive' } },
        { message: { contains: q, mode: 'insensitive' } },
        { buyer: { name: { contains: q, mode: 'insensitive' } } },
        { seller: { name: { contains: q, mode: 'insensitive' } } }
      ]
    } : {})
  };
  const orderBy = sortableOrder(req.query as Record<string, unknown>, {
    subject: 'subject',
    status: 'status',
    estimatedValue: 'estimatedValue',
    deadlineDate: 'deadlineDate',
    createdAt: 'createdAt',
    updatedAt: 'updatedAt'
  }, { createdAt: 'desc' });
  const [items, total, summary] = await Promise.all([
    prisma.quoteRequest.findMany({
      where,
      skip,
      take,
      orderBy,
      select: {
        id: true,
        subject: true,
        status: true,
        estimatedValue: true,
        deadlineDate: true,
        createdAt: true,
        buyer: { select: { id: true, name: true, email: true } },
        seller: { select: { id: true, name: true, email: true } },
        _count: { select: { quoteResponses: true } }
      }
    }),
    prisma.quoteRequest.count({ where }),
    Promise.all([
      safeCount(prisma.quoteRequest),
      safeCount(prisma.quoteRequest, { where: { status: 'pending' } }),
      safeCount(prisma.quoteRequest, { where: { status: { in: ['accepted', 'completed'] } } }),
      safeCount(prisma.quoteResponse)
    ])
  ]);
  const [totalRfqs, pendingRfqs, completedRfqs, responses] = summary;
  res.json({ items, total, page, pageSize, summary: { totalRfqs, pendingRfqs, completedRfqs, responses } });
}));

router.get('/master-admin/orders', ...masterOnly, wrap(async (req, res) => {
  const { skip, take, page, pageSize } = getPagination(req.query as Record<string, unknown>);
  const q = textOrNull(req.query.q) || textOrNull(req.query.search);
  const status = textOrNull(req.query.status);
  const where: any = {
    ...(status ? { status } : {}),
    ...(q ? {
      OR: [
        { poNumber: { contains: q, mode: 'insensitive' } },
        { title: { contains: q, mode: 'insensitive' } },
        { sourceType: { contains: q, mode: 'insensitive' } },
        { buyer: { name: { contains: q, mode: 'insensitive' } } },
        { seller: { name: { contains: q, mode: 'insensitive' } } }
      ]
    } : {})
  };
  const orderBy = sortableOrder(req.query as Record<string, unknown>, {
    poNumber: 'poNumber',
    title: 'title',
    status: 'status',
    amount: 'amount',
    totalValue: 'totalValue',
    expectedDelivery: 'expectedDelivery',
    createdAt: 'createdAt',
    updatedAt: 'updatedAt'
  }, { createdAt: 'desc' });
  const [items, total, summary] = await Promise.all([
    prisma.purchaseOrder.findMany({
      where,
      skip,
      take,
      orderBy,
      select: {
        id: true,
        poNumber: true,
        title: true,
        amount: true,
        totalValue: true,
        currency: true,
        status: true,
        sourceType: true,
        expectedDelivery: true,
        createdAt: true,
        buyer: { select: { id: true, name: true, email: true } },
        seller: { select: { id: true, name: true, email: true } },
        tender: { select: { id: true, tenderId: true, title: true } },
        _count: { select: { invoices: true, payments: true, grns: true } }
      }
    }),
    prisma.purchaseOrder.count({ where }),
    Promise.all([
      safeCount(prisma.purchaseOrder),
      safeCount(prisma.purchaseOrder, { where: { status: { in: ['generated', 'issued', 'accepted'] } } }),
      safeCount(prisma.purchaseOrder, { where: { status: { in: ['in_fulfillment', 'delivered'] } } }),
      safeCount(prisma.purchaseOrder, { where: { status: { in: ['completed', 'closed'] } } })
    ])
  ]);
  const [totalOrders, activeOrders, deliveryOrders, completedOrders] = summary;
  res.json({ items, total, page, pageSize, summary: { totalOrders, activeOrders, deliveryOrders, completedOrders } });
}));

router.post('/master-admin/orders/:id/status', ...masterOnly, requirePermission(PERMISSIONS.OVERRIDE), wrap(async (req, res) => {
  const id = Number(req.params.id);
  const reason = ensureReason(res, req.body, 'update order status');
  if (!reason) return;
  const status = textOrNull(req.body?.status)?.toLowerCase();
  if (!status || !allowedOrderStatuses.has(status)) return jsonError(res, 400, 'Invalid order status selected.', 'VALIDATION_ERROR');
  const previous = await prisma.purchaseOrder.findUnique({ where: { id }, select: { id: true, poNumber: true, status: true, poStatus: true, version: true } });
  if (!previous) return jsonError(res, 404, 'Purchase order not found.', 'NOT_FOUND');
  const poStatusCandidate = normalizedEnum(status);
  const poStatus = poStatusCandidate && ['GENERATED', 'ISSUED', 'ACCEPTED', 'IN_FULFILLMENT', 'DELIVERED', 'CLOSED', 'CANCELLED'].includes(poStatusCandidate)
    ? poStatusCandidate
    : undefined;
  const order = await prisma.purchaseOrder.update({
    where: { id },
    data: { status, ...(poStatus ? { poStatus: poStatus as any } : {}), version: { increment: 1 } },
    select: { id: true, poNumber: true, title: true, status: true, poStatus: true, updatedAt: true }
  });
  await createAuditLog(req, {
    action: 'purchase-order.status.override',
    entityType: 'purchaseOrder',
    entityId: id,
    metadata: { reason, oldValue: { status: previous.status, poStatus: previous.poStatus }, newValue: { status, poStatus: poStatus || previous.poStatus }, poNumber: previous.poNumber }
  });
  jsonOk(res, order, 'Order status updated with audit reason');
}));

router.get('/master-admin/invoices', ...masterOnly, wrap(async (req, res) => {
  const { skip, take, page, pageSize } = getPagination(req.query as Record<string, unknown>);
  const q = textOrNull(req.query.q) || textOrNull(req.query.search);
  const status = textOrNull(req.query.status);
  const where: any = {
    ...(status ? { status } : {}),
    ...(q ? {
      OR: [
        { invoiceNumber: { contains: q, mode: 'insensitive' } },
        { purchaseOrder: { poNumber: { contains: q, mode: 'insensitive' } } },
        { buyer: { name: { contains: q, mode: 'insensitive' } } },
        { seller: { name: { contains: q, mode: 'insensitive' } } }
      ]
    } : {})
  };
  const orderBy = sortableOrder(req.query as Record<string, unknown>, {
    invoiceNumber: 'invoiceNumber',
    status: 'status',
    amount: 'amount',
    currency: 'currency',
    approvedAt: 'approvedAt',
    createdAt: 'createdAt',
    updatedAt: 'updatedAt'
  }, { createdAt: 'desc' });
  const [items, total, summary] = await Promise.all([
    prisma.invoice.findMany({
      where,
      skip,
      take,
      orderBy,
      select: {
        id: true,
        invoiceNumber: true,
        amount: true,
        currency: true,
        status: true,
        invoiceStatus: true,
        taxableAmount: true,
        totalTaxAmount: true,
        tdsAmount: true,
        approvedAt: true,
        createdAt: true,
        purchaseOrder: { select: { id: true, poNumber: true, title: true, status: true } },
        buyer: { select: { id: true, name: true, email: true } },
        seller: { select: { id: true, name: true, email: true } },
        _count: { select: { items: true, payments: true, paymentSettlements: true } }
      }
    }),
    prisma.invoice.count({ where }),
    Promise.all([
      safeCount(prisma.invoice),
      safeCount(prisma.invoice, { where: { status: 'submitted' } }),
      safeCount(prisma.invoice, { where: { status: 'approved' } }),
      safeCount(prisma.invoice, { where: { status: 'paid' } })
    ])
  ]);
  const [totalInvoices, submittedInvoices, approvedInvoices, paidInvoices] = summary;
  res.json({ items, total, page, pageSize, summary: { totalInvoices, submittedInvoices, approvedInvoices, paidInvoices } });
}));

router.post('/master-admin/invoices/:id/status', ...masterOnly, requirePermission(PERMISSIONS.OVERRIDE), wrap(async (req, res) => {
  const id = Number(req.params.id);
  const reason = ensureReason(res, req.body, 'update invoice status');
  if (!reason) return;
  const status = textOrNull(req.body?.status)?.toLowerCase();
  if (!status || !allowedInvoiceStatuses.has(status)) return jsonError(res, 400, 'Invalid invoice status selected.', 'VALIDATION_ERROR');
  const previous = await prisma.invoice.findUnique({ where: { id }, select: { id: true, invoiceNumber: true, status: true, invoiceStatus: true, version: true } });
  if (!previous) return jsonError(res, 404, 'Invoice not found.', 'NOT_FOUND');
  const invoiceStatusCandidate = normalizedEnum(status);
  const invoice = await prisma.invoice.update({
    where: { id },
    data: { status, invoiceStatus: invoiceStatusCandidate as any, version: { increment: 1 }, ...(status === 'approved' ? { approvedAt: new Date() } : {}) },
    select: { id: true, invoiceNumber: true, status: true, invoiceStatus: true, approvedAt: true, updatedAt: true }
  });
  await createAuditLog(req, {
    action: 'invoice.status.override',
    entityType: 'invoice',
    entityId: id,
    metadata: { reason, oldValue: { status: previous.status, invoiceStatus: previous.invoiceStatus }, newValue: { status, invoiceStatus: invoiceStatusCandidate }, invoiceNumber: previous.invoiceNumber }
  });
  jsonOk(res, invoice, 'Invoice status updated with audit reason');
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
    currency: 'currency',
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

router.post('/master-admin/payments/:id/status', ...masterOnly, requirePermission(PERMISSIONS.OVERRIDE), wrap(async (req, res) => {
  const id = Number(req.params.id);
  const reason = ensureReason(res, req.body, 'update payment status');
  if (!reason) return;
  const status = textOrNull(req.body?.status)?.toLowerCase();
  if (!status || !allowedPaymentStatuses.has(status)) return jsonError(res, 400, 'Invalid payment status selected.', 'VALIDATION_ERROR');
  const previous = await (prisma as any).paymentTransaction.findUnique({ where: { id }, select: { id: true, referenceId: true, status: true, paymentStatus: true, version: true } });
  if (!previous) return jsonError(res, 404, 'Payment transaction not found.', 'NOT_FOUND');
  const paymentStatusCandidate = normalizedEnum(status);
  const paymentStatus = paymentStatusCandidate && allowedPaymentStatusEnums.has(paymentStatusCandidate) ? paymentStatusCandidate : undefined;
  const payment = await (prisma as any).paymentTransaction.update({
    where: { id },
    data: {
      status,
      ...(paymentStatus ? { paymentStatus: paymentStatus as any } : {}),
      version: { increment: 1 }
    },
    select: { id: true, referenceId: true, status: true, paymentStatus: true, amount: true, currency: true, updatedAt: true }
  });
  await createAuditLog(req, {
    action: 'payment.status.override',
    entityType: 'paymentTransaction',
    entityId: id,
    metadata: { reason, oldValue: { status: previous.status, paymentStatus: previous.paymentStatus }, newValue: { status, paymentStatus: paymentStatus || previous.paymentStatus }, referenceId: previous.referenceId }
  });
  jsonOk(res, payment, 'Payment status updated with audit reason');
}));

router.get('/master-admin/escrow-accounts', ...masterOnly, wrap(async (req, res) => {
  const { skip, take, page, pageSize } = getPagination(req.query as Record<string, unknown>);
  const q = textOrNull(req.query.q) || textOrNull(req.query.search);
  const status = textOrNull(req.query.status);
  const where: any = {
    ...(status ? { status } : {}),
    ...(q ? {
      OR: [
        { status: { contains: q, mode: 'insensitive' } },
        { paymentTransaction: { referenceId: { contains: q, mode: 'insensitive' } } },
        { purchaseOrder: { poNumber: { contains: q, mode: 'insensitive' } } },
        { buyer: { name: { contains: q, mode: 'insensitive' } } },
        { buyer: { email: { contains: q, mode: 'insensitive' } } },
        { seller: { name: { contains: q, mode: 'insensitive' } } },
        { seller: { email: { contains: q, mode: 'insensitive' } } }
      ]
    } : {})
  };
  const [items, total, summary] = await Promise.all([
    (prisma as any).escrowAccount.findMany({
      where,
      skip,
      take,
      orderBy: { updatedAt: 'desc' },
      select: {
        id: true,
        amount: true,
        currency: true,
        status: true,
        escrowStatus: true,
        fundedAt: true,
        frozenAt: true,
        releasedAt: true,
        createdAt: true,
        updatedAt: true,
        paymentTransaction: { select: { id: true, referenceId: true, status: true } },
        purchaseOrder: { select: { id: true, poNumber: true, title: true, status: true } },
        buyer: { select: { name: true, email: true } },
        seller: { select: { name: true, email: true } },
        _count: { select: { transactions: true, milestones: true } }
      }
    }),
    safeCount((prisma as any).escrowAccount, { where }),
    Promise.all([
      safeCount((prisma as any).escrowAccount),
      safeCount((prisma as any).escrowAccount, { where: { status: { in: ['held', 'funded'] } } }),
      safeCount((prisma as any).escrowAccount, { where: { status: 'frozen' } }),
      safeCount((prisma as any).escrowAccount, { where: { status: 'released' } })
    ])
  ]);
  const [totalEscrows, heldEscrows, frozenEscrows, releasedEscrows] = summary;
  res.json({ items, total, page, pageSize, summary: { totalEscrows, heldEscrows, frozenEscrows, releasedEscrows } });
}));

router.post('/master-admin/escrow-accounts/:id/status', ...masterOnly, requirePermission(PERMISSIONS.OVERRIDE), wrap(async (req, res) => {
  const id = Number(req.params.id);
  const reason = ensureReason(res, req.body, 'update escrow status');
  if (!reason) return;
  const status = textOrNull(req.body?.status)?.toLowerCase();
  if (!status || !allowedEscrowStatuses.has(status)) return jsonError(res, 400, 'Invalid escrow status selected.', 'VALIDATION_ERROR');
  const previous = await (prisma as any).escrowAccount.findUnique({ where: { id }, select: { id: true, status: true, escrowStatus: true, version: true } });
  if (!previous) return jsonError(res, 404, 'Escrow account not found.', 'NOT_FOUND');
  const escrowStatusCandidate = normalizedEnum(status === 'dispute' ? 'disputed' : status);
  const escrowStatus = escrowStatusCandidate && allowedEscrowStatusEnums.has(escrowStatusCandidate) ? escrowStatusCandidate : undefined;
  const escrow = await (prisma as any).escrowAccount.update({
    where: { id },
    data: {
      status,
      ...(escrowStatus ? { escrowStatus: escrowStatus as any } : {}),
      version: { increment: 1 }
    },
    select: { id: true, amount: true, currency: true, status: true, escrowStatus: true, updatedAt: true }
  });
  await createAuditLog(req, {
    action: 'escrow.status.override',
    entityType: 'escrowAccount',
    entityId: id,
    metadata: { reason, oldValue: { status: previous.status, escrowStatus: previous.escrowStatus }, newValue: { status, escrowStatus: escrowStatus || previous.escrowStatus } }
  });
  jsonOk(res, escrow, 'Escrow status updated with audit reason');
}));

router.get('/master-admin/payment-settlements', ...masterOnly, wrap(async (req, res) => {
  const { skip, take, page, pageSize } = getPagination(req.query as Record<string, unknown>);
  const q = textOrNull(req.query.q) || textOrNull(req.query.search);
  const status = normalizedEnum(req.query.status);
  const where: any = {
    ...(status ? { status: status as any } : {}),
    ...(q ? {
      OR: [
        { transactionReference: { contains: q, mode: 'insensitive' } },
        { remarks: { contains: q, mode: 'insensitive' } },
        { invoice: { invoiceNumber: { contains: q, mode: 'insensitive' } } },
        { paymentTransaction: { referenceId: { contains: q, mode: 'insensitive' } } }
      ]
    } : {})
  };
  const [items, total, summary] = await Promise.all([
    (prisma as any).paymentSettlement.findMany({
      where,
      skip,
      take,
      orderBy: { updatedAt: 'desc' },
      select: {
        id: true,
        status: true,
        transactionReference: true,
        deductionAmount: true,
        penaltyAmount: true,
        netReleasedAmount: true,
        invoiceVerifiedAt: true,
        approvedAt: true,
        releasedAt: true,
        rejectedAt: true,
        rejectionReason: true,
        createdAt: true,
        updatedAt: true,
        invoice: { select: { id: true, invoiceNumber: true, status: true, amount: true } },
        paymentTransaction: { select: { id: true, referenceId: true, status: true, amount: true } }
      }
    }),
    safeCount((prisma as any).paymentSettlement, { where }),
    Promise.all([
      safeCount((prisma as any).paymentSettlement),
      safeCount((prisma as any).paymentSettlement, { where: { status: 'PENDING' as any } }),
      safeCount((prisma as any).paymentSettlement, { where: { status: 'APPROVED' as any } }),
      safeCount((prisma as any).paymentSettlement, { where: { status: 'RELEASED' as any } })
    ])
  ]);
  const [totalSettlements, pendingSettlements, approvedSettlements, releasedSettlements] = summary;
  res.json({ items, total, page, pageSize, summary: { totalSettlements, pendingSettlements, approvedSettlements, releasedSettlements } });
}));

router.get('/master-admin/documents', ...masterOnly, wrap(async (req, res) => {
  const { skip, take, page, pageSize } = getPagination(req.query as Record<string, unknown>);
  const q = textOrNull(req.query.q) || textOrNull(req.query.search);
  const status = textOrNull(req.query.status);
  const where: any = {
    ...(status ? { status } : {}),
    ...(q ? {
      OR: [
        { originalName: { contains: q, mode: 'insensitive' } },
        { entityType: { contains: q, mode: 'insensitive' } },
        { mimeType: { contains: q, mode: 'insensitive' } },
        { owner: { name: { contains: q, mode: 'insensitive' } } },
        { owner: { email: { contains: q, mode: 'insensitive' } } }
      ]
    } : {})
  };
  const [items, total, summary] = await Promise.all([
    (prisma as any).fileAsset.findMany({
      where,
      skip,
      take,
      orderBy: { createdAt: 'desc' },
      select: {
        id: true,
        originalName: true,
        entityType: true,
        entityId: true,
        mimeType: true,
        size: true,
        status: true,
        url: true,
        key: true,
        storageProvider: true,
        createdAt: true,
        updatedAt: true,
        owner: { select: { id: true, name: true, email: true, company: { select: { id: true, name: true, portalDisplayName: true } }, organization: { select: { id: true, organizationName: true } } } }
      }
    }),
    safeCount((prisma as any).fileAsset, { where }),
    Promise.all([
      safeCount((prisma as any).fileAsset),
      safeCount((prisma as any).fileAsset, { where: { status: 'active' } }),
      safeCount((prisma as any).fileAsset, { where: { url: { not: null } } })
    ])
  ]);
  const [totalDocuments, activeDocuments, documentsWithUrl] = summary;
  res.json({ items, total, page, pageSize, summary: { totalDocuments, activeDocuments, documentsWithUrl } });
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
  const reason = ensureReason(res, req.body, 'update email settings');
  if (!reason) return;
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
  await createAuditLog(req, { action: 'email.settings.update', entityType: 'portal', entityId: company.id, metadata: { reason, passwordUpdated: Boolean(password) } });
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
  const reason = ensureReason(res, req.body, 'update portal settings');
  if (!reason) return;
  let company = await (prisma as any).company.findFirst({ orderBy: { id: 'asc' }, select: { id: true } });
  if (!company) {
    company = await (prisma as any).company.create({ data: { name: 'JsgSmile', portalDisplayName: 'JsgSmile Portal', isActive: true }, select: { id: true } });
  }
  const updated = await (prisma as any).company.update({ where: { id: company.id }, data: companyPayload(req.body || {}), select: companySelect });
  await createAuditLog(req, { action: 'portal.settings.update', entityType: 'portal', entityId: company.id, metadata: { reason } });
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
  const [organizations, users, procurementBids, tenders, rfqs, buyerRequirements, purchaseOrders, invoices, payments, products, services, documents, auditLogs] = await Promise.all([
    safeCount(prisma.organization),
    safeCount(prisma.user),
    safeCount((prisma as any).procurementBid),
    safeCount(prisma.tender),
    safeCount(prisma.quoteRequest),
    safeCount((prisma as any).buyerRequirement),
    safeCount((prisma as any).purchaseOrder),
    safeCount(prisma.invoice),
    safeCount((prisma as any).paymentTransaction),
    safeCount((prisma as any).product),
    safeCount((prisma as any).service),
    safeCount((prisma as any).fileAsset),
    safeCount(prisma.auditLog)
  ]);
  jsonOk(res, { organizations, users, procurementBids, tenders, rfqs, buyerRequirements, purchaseOrders, invoices, payments, products, services, documents, auditLogs, generatedAt: new Date().toISOString() });
}));

router.get('/master-admin/reports/export', ...masterOnly, wrap(async (req, res) => {
  const module = searchText(req.query.module || req.query.type).toLowerCase();
  const reason = textOrNull(req.query.reason);
  if (!reason) return jsonError(res, 400, 'Reason is required to export Master Admin data.', 'VALIDATION_ERROR');
  const take = Math.min(Math.max(Number(req.query.limit) || 1000, 1), 5000);
  const status = textOrNull(req.query.status);
  const companyId = numberOrUndefined(req.query.companyId);
  const dateWhere = exportDateWhere(req.query as Record<string, unknown>);
  let rows: Array<Record<string, unknown>> = [];
  const whereWithDate = (extra: Record<string, unknown> = {}) => ({ ...dateWhere, ...extra });

  if (module === 'companies') {
    rows = await (prisma as any).company.findMany({
      take,
      orderBy: { updatedAt: 'desc' },
      select: { id: true, name: true, shortName: true, portalDisplayName: true, contactEmail: true, contactPhone: true, district: true, state: true, isActive: true, createdAt: true, updatedAt: true }
    });
  } else if (module === 'organizations') {
    rows = await prisma.organization.findMany({
      where: whereWithDate({ ...(companyId ? { companyId } : {}), ...(status ? { verificationStatus: status as any } : {}) }),
      take,
      orderBy: { updatedAt: 'desc' },
      select: { id: true, organizationName: true, organizationType: true, gstin: true, panNumber: true, udyamNumber: true, verificationStatus: true, isBlacklisted: true, city: true, district: true, state: true, createdAt: true, updatedAt: true, company: { select: { name: true, portalDisplayName: true } } }
    }) as any;
  } else if (module === 'users') {
    rows = await prisma.user.findMany({
      where: whereWithDate({ ...(companyId ? { companyId } : {}), ...(status ? { accountStatus: status as any } : {}) }),
      take,
      orderBy: { updatedAt: 'desc' },
      select: { id: true, userId: true, name: true, email: true, mobile: true, role: true, onboardingStatus: true, accountStatus: true, emailVerified: true, mobileVerified: true, lastLoginAt: true, createdAt: true, updatedAt: true, company: { select: { name: true, portalDisplayName: true } }, organization: { select: { organizationName: true } } }
    }) as any;
  } else if (module === 'procurement-bids' || module === 'procurement-records') {
    rows = await (prisma as any).procurementBid.findMany({
      where: whereWithDate({ ...(status ? { status: status as any } : {}) }),
      take,
      orderBy: { updatedAt: 'desc' },
      select: { id: true, bidNumber: true, title: true, buyerOrganizationName: true, buyerType: true, category: true, bidType: true, estimatedValue: true, deliveryLocation: true, status: true, approvalStatus: true, startDate: true, endDate: true, createdAt: true, updatedAt: true }
    });
  } else if (module === 'tenders') {
    rows = await prisma.tender.findMany({
      where: whereWithDate({ ...(status ? { status: status as any } : {}) }),
      take,
      orderBy: { updatedAt: 'desc' },
      select: { id: true, tenderId: true, title: true, category: true, status: true, budget: true, bidsCount: true, publishedAt: true, closesAt: true, createdAt: true, updatedAt: true, organization: { select: { organizationName: true } }, buyer: { select: { name: true, email: true } } }
    }) as any;
  } else if (module === 'rfqs') {
    rows = await prisma.quoteRequest.findMany({
      where: whereWithDate({ ...(status ? { status } : {}) }),
      take,
      orderBy: { updatedAt: 'desc' },
      select: { id: true, subject: true, status: true, estimatedValue: true, deadlineDate: true, createdAt: true, updatedAt: true, buyer: { select: { name: true, email: true } }, seller: { select: { name: true, email: true } } }
    }) as any;
  } else if (module === 'buyer-requirements') {
    rows = await (prisma as any).buyerRequirement.findMany({
      where: whereWithDate({ ...(companyId ? { companyId } : {}), ...(status ? { status: status as any } : {}) }),
      take,
      orderBy: { updatedAt: 'desc' },
      select: { id: true, title: true, requirementType: true, status: true, location: true, budgetMin: true, budgetMax: true, lastDate: true, isFeatured: true, isUrgent: true, createdAt: true, updatedAt: true, company: { select: { name: true, portalDisplayName: true } }, buyerOrganization: { select: { organizationName: true } } }
    });
  } else if (module === 'orders') {
    rows = await (prisma as any).purchaseOrder.findMany({
      where: whereWithDate({ ...(status ? { status } : {}) }),
      take,
      orderBy: { updatedAt: 'desc' },
      select: { id: true, poNumber: true, title: true, amount: true, totalValue: true, currency: true, status: true, sourceType: true, expectedDelivery: true, createdAt: true, updatedAt: true, buyer: { select: { name: true, email: true } }, seller: { select: { name: true, email: true } } }
    });
  } else if (module === 'invoices') {
    rows = await prisma.invoice.findMany({
      where: whereWithDate({ ...(status ? { status } : {}) }),
      take,
      orderBy: { updatedAt: 'desc' },
      select: { id: true, invoiceNumber: true, amount: true, currency: true, status: true, invoiceStatus: true, taxableAmount: true, totalTaxAmount: true, tdsAmount: true, approvedAt: true, createdAt: true, updatedAt: true, purchaseOrder: { select: { poNumber: true, title: true } }, buyer: { select: { name: true, email: true } }, seller: { select: { name: true, email: true } } }
    }) as any;
  } else if (module === 'payments') {
    rows = await (prisma as any).paymentTransaction.findMany({
      where: whereWithDate({ ...(status ? { status } : {}) }),
      take,
      orderBy: { updatedAt: 'desc' },
      select: { id: true, referenceId: true, gateway: true, method: true, gatewayOrderId: true, gatewayPaymentId: true, amount: true, currency: true, status: true, paymentStatus: true, completedAt: true, paidAt: true, createdAt: true, updatedAt: true, payer: { select: { name: true, email: true } }, payee: { select: { name: true, email: true } } }
    });
  } else if (module === 'products') {
    rows = await (prisma as any).product.findMany({
      where: whereWithDate({ ...(status ? { status: status as any } : {}) }),
      take,
      orderBy: { updatedAt: 'desc' },
      select: { id: true, name: true, sku: true, hsnCode: true, brand: true, price: true, currency: true, status: true, isMsmeMade: true, createdAt: true, updatedAt: true, seller: { select: { name: true, email: true } }, organization: { select: { organizationName: true } }, category: { select: { name: true } } }
    });
  } else if (module === 'services') {
    rows = await (prisma as any).service.findMany({
      where: whereWithDate({ ...(status ? { status: status as any } : {}) }),
      take,
      orderBy: { updatedAt: 'desc' },
      select: { id: true, name: true, pricingModel: true, basePrice: true, currency: true, serviceArea: true, status: true, createdAt: true, updatedAt: true, seller: { select: { name: true, email: true } }, organization: { select: { organizationName: true } }, category: { select: { name: true } } }
    });
  } else if (module === 'documents') {
    rows = await (prisma as any).fileAsset.findMany({
      where: whereWithDate({ ...(status ? { status } : {}) }),
      take,
      orderBy: { updatedAt: 'desc' },
      select: { id: true, originalName: true, entityType: true, entityId: true, storageProvider: true, mimeType: true, size: true, status: true, createdAt: true, updatedAt: true, owner: { select: { name: true, email: true } } }
    });
  } else if (module === 'audit-logs') {
    rows = await prisma.auditLog.findMany({
      where: whereWithDate({ ...(companyId ? { companyId } : {}), ...(status ? { action: { contains: status, mode: 'insensitive' } } : {}) }),
      take,
      orderBy: { createdAt: 'desc' },
      select: { id: true, action: true, entityType: true, entityId: true, details: true, oldValue: true, newValue: true, ipAddress: true, userAgent: true, createdAt: true, User: { select: { name: true, email: true, role: true } }, company: { select: { name: true, portalDisplayName: true } } }
    }) as any;
  } else {
    return jsonError(res, 400, 'Unsupported export module.', 'VALIDATION_ERROR');
  }

  await createAuditLog(req, { action: 'data.export', entityType: 'master-admin-report', metadata: { module, reason, rows: rows.length, status, companyId: companyId || null } });
  const safeModule = module.replace(/[^a-z0-9-]+/g, '-');
  sendCsv(res, `master-admin-${safeModule}-${new Date().toISOString().slice(0, 10)}.csv`, rows.map(row => flattenRecord(row as Record<string, any>)));
}));

router.get('/master-admin/marketplace/products', ...masterOnly, wrap(async (req, res) => {
  const { skip, take, page, pageSize } = getPagination(req.query as Record<string, unknown>);
  const q = textOrNull(req.query.q) || textOrNull(req.query.search);
  const status = normalizedEnum(req.query.status);
  const where: any = {
    ...(status ? { status: status as any } : {}),
    ...(q ? {
      OR: [
        { name: { contains: q, mode: 'insensitive' } },
        { sku: { contains: q, mode: 'insensitive' } },
        { brand: { contains: q, mode: 'insensitive' } },
        { hsnCode: { contains: q, mode: 'insensitive' } },
        { seller: { name: { contains: q, mode: 'insensitive' } } },
        { organization: { organizationName: { contains: q, mode: 'insensitive' } } },
        { category: { name: { contains: q, mode: 'insensitive' } } }
      ]
    } : {})
  };
  const orderBy = sortableOrder(req.query as Record<string, unknown>, {
    name: 'name',
    sku: 'sku',
    brand: 'brand',
    price: 'price',
    status: 'status',
    createdAt: 'createdAt',
    updatedAt: 'updatedAt'
  }, { updatedAt: 'desc' });
  const [items, total, summary] = await Promise.all([
    (prisma as any).product.findMany({
      where,
      skip,
      take,
      orderBy,
      select: {
        id: true,
        name: true,
        sku: true,
        brand: true,
        price: true,
        currency: true,
        status: true,
        isMsmeMade: true,
        updatedAt: true,
        seller: { select: { id: true, name: true, email: true } },
        organization: { select: { id: true, organizationName: true } },
        category: { select: { id: true, name: true, type: true } },
        _count: { select: { images: true, cartItems: true, guestCartItems: true } }
      }
    }),
    (prisma as any).product.count({ where }),
    Promise.all([
      safeCount((prisma as any).product),
      safeCount((prisma as any).product, { where: { status: 'ACTIVE' as any } }),
      safeCount((prisma as any).product, { where: { status: 'DRAFT' as any } }),
      safeCount((prisma as any).product, { where: { status: 'ARCHIVED' as any } })
    ])
  ]);
  const [totalProducts, activeProducts, draftProducts, archivedProducts] = summary;
  res.json({ items, total, page, pageSize, summary: { totalProducts, activeProducts, draftProducts, archivedProducts } });
}));

router.get('/master-admin/marketplace/services', ...masterOnly, wrap(async (req, res) => {
  const { skip, take, page, pageSize } = getPagination(req.query as Record<string, unknown>);
  const q = textOrNull(req.query.q) || textOrNull(req.query.search);
  const status = normalizedEnum(req.query.status);
  const where: any = {
    ...(status ? { status: status as any } : {}),
    ...(q ? {
      OR: [
        { name: { contains: q, mode: 'insensitive' } },
        { serviceArea: { contains: q, mode: 'insensitive' } },
        { seller: { name: { contains: q, mode: 'insensitive' } } },
        { organization: { organizationName: { contains: q, mode: 'insensitive' } } },
        { category: { name: { contains: q, mode: 'insensitive' } } }
      ]
    } : {})
  };
  const orderBy = sortableOrder(req.query as Record<string, unknown>, {
    name: 'name',
    basePrice: 'basePrice',
    status: 'status',
    serviceArea: 'serviceArea',
    createdAt: 'createdAt',
    updatedAt: 'updatedAt'
  }, { updatedAt: 'desc' });
  const [items, total, summary] = await Promise.all([
    (prisma as any).service.findMany({
      where,
      skip,
      take,
      orderBy,
      select: {
        id: true,
        name: true,
        pricingModel: true,
        basePrice: true,
        currency: true,
        serviceArea: true,
        status: true,
        updatedAt: true,
        seller: { select: { id: true, name: true, email: true } },
        organization: { select: { id: true, organizationName: true } },
        category: { select: { id: true, name: true, type: true } },
        _count: { select: { cartItems: true, guestCartItems: true } }
      }
    }),
    (prisma as any).service.count({ where }),
    Promise.all([
      safeCount((prisma as any).service),
      safeCount((prisma as any).service, { where: { status: 'ACTIVE' as any } }),
      safeCount((prisma as any).service, { where: { status: 'DRAFT' as any } }),
      safeCount((prisma as any).service, { where: { status: 'ARCHIVED' as any } })
    ])
  ]);
  const [totalServices, activeServices, draftServices, archivedServices] = summary;
  res.json({ items, total, page, pageSize, summary: { totalServices, activeServices, draftServices, archivedServices } });
}));

const marketplaceStatusAction = (delegateName: 'product' | 'service', entityType: 'marketplace-product' | 'marketplace-service', reasonAction: string) => wrap(async (req, res) => {
  const id = Number(req.params.id);
  const reason = ensureReason(res, req.body, reasonAction);
  if (!reason) return;
  const status = normalizedEnum(req.body?.status);
  if (!status || !allowedMarketplaceStatuses.has(status)) return jsonError(res, 400, 'Invalid marketplace status selected.', 'VALIDATION_ERROR');
  const delegate = (prisma as any)[delegateName];
  const previous = await delegate.findUnique({ where: { id }, select: { id: true, status: true, name: true } });
  if (!previous) return jsonError(res, 404, 'Marketplace listing not found.', 'NOT_FOUND');
  const item = await delegate.update({
    where: { id },
    data: { status: status as any },
    select: {
      id: true,
      name: true,
      status: true,
      updatedAt: true,
      seller: { select: { id: true, name: true, email: true } },
      organization: { select: { id: true, organizationName: true } },
      category: { select: { id: true, name: true, type: true } }
    }
  });
  await createAuditLog(req, {
    action: `${entityType}.status.update`,
    entityType,
    entityId: id,
    metadata: { reason, name: previous.name, oldValue: { status: previous.status }, newValue: { status } }
  });
  jsonOk(res, item, 'Marketplace listing status updated successfully');
});

router.post('/master-admin/marketplace/products/:id/status', ...masterOnly, requirePermission(PERMISSIONS.CONTENT_UPDATE), marketplaceStatusAction('product', 'marketplace-product', 'update marketplace-product status'));
router.post('/master-admin/marketplace/services/:id/status', ...masterOnly, requirePermission(PERMISSIONS.CONTENT_UPDATE), marketplaceStatusAction('service', 'marketplace-service', 'update marketplace-service status'));

router.get('/master-admin/search', ...masterOnly, wrap(async (req, res) => {
  const q = searchText(req.query.q || req.query.search);
  const type = searchText(req.query.type || 'all').toLowerCase();
  const take = searchLimit(req.query.limit);
  if (q.length < 2) return jsonOk(res, { items: [], total: 0, query: q });

  const include = (name: string) => type === 'all' || type === name;
  const searches: Array<Promise<any[]>> = [];

  if (include('companies')) searches.push(safeFindMany((prisma as any).company, {
    where: { OR: [{ name: { contains: q, mode: 'insensitive' } }, { portalDisplayName: { contains: q, mode: 'insensitive' } }, { district: { contains: q, mode: 'insensitive' } }, { state: { contains: q, mode: 'insensitive' } }] },
    take,
    orderBy: { updatedAt: 'desc' },
    select: { id: true, name: true, portalDisplayName: true, district: true, state: true, isActive: true, updatedAt: true }
  }).then(rows => rows.map((row: any) => searchItem('company', row, row.portalDisplayName || row.name, [row.district, row.state].filter(Boolean).join(', '), `/master-admin/companies`, row.isActive ? 'ACTIVE' : 'INACTIVE'))));

  if (include('users')) searches.push(safeFindMany(prisma.user, {
    where: { OR: [{ name: { contains: q, mode: 'insensitive' } }, { email: { contains: q, mode: 'insensitive' } }, { mobile: { contains: q, mode: 'insensitive' } }, { userId: { contains: q, mode: 'insensitive' } }] },
    take,
    orderBy: { updatedAt: 'desc' },
    select: { id: true, name: true, email: true, role: true, accountStatus: true, updatedAt: true, company: { select: { name: true, portalDisplayName: true } }, organization: { select: { organizationName: true } } }
  }).then(rows => rows.map((row: any) => searchItem('user', row, row.name, `${row.email || 'No email'}${row.organization?.organizationName ? ` - ${row.organization.organizationName}` : ''}`, `/master-admin/users`, `${row.role}:${row.accountStatus}`))));

  if (include('organizations')) searches.push(safeFindMany(prisma.organization, {
    where: { OR: [{ organizationName: { contains: q, mode: 'insensitive' } }, { gstin: { contains: q, mode: 'insensitive' } }, { panNumber: { contains: q, mode: 'insensitive' } }, { udyamNumber: { contains: q, mode: 'insensitive' } }] },
    take,
    orderBy: { updatedAt: 'desc' },
    select: { id: true, organizationName: true, organizationType: true, verificationStatus: true, updatedAt: true, company: { select: { name: true, portalDisplayName: true } } }
  }).then(rows => rows.map((row: any) => searchItem('organization', row, row.organizationName, row.organizationType, `/master-admin/organizations`, row.verificationStatus))));

  if (include('tenders')) searches.push(safeFindMany(prisma.tender, {
    where: { OR: [{ tenderId: { contains: q, mode: 'insensitive' } }, { title: { contains: q, mode: 'insensitive' } }, { category: { contains: q, mode: 'insensitive' } }, { organization: { organizationName: { contains: q, mode: 'insensitive' } } }] },
    take,
    orderBy: { updatedAt: 'desc' },
    select: { id: true, tenderId: true, title: true, status: true, closesAt: true, updatedAt: true, organization: { select: { organizationName: true, company: { select: { name: true, portalDisplayName: true } } } } }
  }).then(rows => rows.map((row: any) => searchItem('tender', { ...row, company: row.organization?.company }, row.title, row.tenderId || row.organization?.organizationName, `/master-admin/procurement`, row.status))));

  if (include('rfqs')) searches.push(safeFindMany(prisma.quoteRequest, {
    where: { OR: [{ subject: { contains: q, mode: 'insensitive' } }, { message: { contains: q, mode: 'insensitive' } }, { buyer: { name: { contains: q, mode: 'insensitive' } } }, { seller: { name: { contains: q, mode: 'insensitive' } } }] },
    take,
    orderBy: { updatedAt: 'desc' },
    select: { id: true, subject: true, status: true, deadlineDate: true, updatedAt: true, buyer: { select: { name: true, company: { select: { name: true, portalDisplayName: true } } } }, seller: { select: { name: true } } }
  }).then(rows => rows.map((row: any) => searchItem('rfq', { ...row, company: row.buyer?.company }, row.subject, [row.buyer?.name, row.seller?.name].filter(Boolean).join(' -> '), `/master-admin/procurement`, row.status))));

  if (include('buyer-requirements')) searches.push(safeFindMany((prisma as any).buyerRequirement, {
    where: { OR: [{ title: { contains: q, mode: 'insensitive' } }, { description: { contains: q, mode: 'insensitive' } }, { location: { contains: q, mode: 'insensitive' } }, { buyerOrganization: { organizationName: { contains: q, mode: 'insensitive' } } }] },
    take,
    orderBy: { updatedAt: 'desc' },
    select: { id: true, title: true, status: true, requirementType: true, lastDate: true, updatedAt: true, company: { select: { name: true, portalDisplayName: true } }, buyerOrganization: { select: { organizationName: true } } }
  }).then(rows => rows.map((row: any) => searchItem('buyer requirement', row, row.title, row.buyerOrganization?.organizationName || row.requirementType, `/master-admin/procurement`, row.status))));

  if (include('procurement-bids')) searches.push(safeFindMany((prisma as any).procurementBid, {
    where: { OR: [{ bidNumber: { contains: q, mode: 'insensitive' } }, { title: { contains: q, mode: 'insensitive' } }, { category: { contains: q, mode: 'insensitive' } }, { buyerOrganizationName: { contains: q, mode: 'insensitive' } }] },
    take,
    orderBy: { updatedAt: 'desc' },
    select: { id: true, bidNumber: true, title: true, status: true, approvalStatus: true, buyerOrganizationName: true, updatedAt: true }
  }).then(rows => rows.map((row: any) => searchItem('procurement bid', row, row.title, row.bidNumber || row.buyerOrganizationName, `/master-admin/procurement`, `${row.status}:${row.approvalStatus}`))));

  if (include('orders')) searches.push(safeFindMany((prisma as any).purchaseOrder, {
    where: { OR: [{ poNumber: { contains: q, mode: 'insensitive' } }, { title: { contains: q, mode: 'insensitive' } }, { buyer: { name: { contains: q, mode: 'insensitive' } } }, { seller: { name: { contains: q, mode: 'insensitive' } } }] },
    take,
    orderBy: { updatedAt: 'desc' },
    select: { id: true, poNumber: true, title: true, status: true, updatedAt: true, buyer: { select: { name: true, company: { select: { name: true, portalDisplayName: true } } } }, seller: { select: { name: true } } }
  }).then(rows => rows.map((row: any) => searchItem('order', { ...row, company: row.buyer?.company }, row.title || row.poNumber, [row.buyer?.name, row.seller?.name].filter(Boolean).join(' -> '), `/master-admin/orders`, row.status))));

  if (include('invoices')) searches.push(safeFindMany(prisma.invoice, {
    where: { OR: [{ invoiceNumber: { contains: q, mode: 'insensitive' } }, { purchaseOrder: { poNumber: { contains: q, mode: 'insensitive' } } }, { buyer: { name: { contains: q, mode: 'insensitive' } } }, { seller: { name: { contains: q, mode: 'insensitive' } } }] },
    take,
    orderBy: { updatedAt: 'desc' },
    select: { id: true, invoiceNumber: true, status: true, amount: true, updatedAt: true, purchaseOrder: { select: { poNumber: true } }, buyer: { select: { name: true, company: { select: { name: true, portalDisplayName: true } } } }, seller: { select: { name: true } } }
  }).then(rows => rows.map((row: any) => searchItem('invoice', { ...row, company: row.buyer?.company }, row.invoiceNumber, row.purchaseOrder?.poNumber, `/master-admin/payments`, row.status))));

  if (include('payments')) searches.push(safeFindMany((prisma as any).paymentTransaction, {
    where: { OR: [{ referenceId: { contains: q, mode: 'insensitive' } }, { providerPaymentId: { contains: q, mode: 'insensitive' } }, { gatewayOrderId: { contains: q, mode: 'insensitive' } }, { payer: { name: { contains: q, mode: 'insensitive' } } }, { payee: { name: { contains: q, mode: 'insensitive' } } }] },
    take,
    orderBy: { updatedAt: 'desc' },
    select: { id: true, referenceId: true, status: true, amount: true, updatedAt: true, payer: { select: { name: true, company: { select: { name: true, portalDisplayName: true } } } }, payee: { select: { name: true } } }
  }).then(rows => rows.map((row: any) => searchItem('payment', { ...row, company: row.payer?.company }, row.referenceId, [row.payer?.name, row.payee?.name].filter(Boolean).join(' -> '), `/master-admin/payments`, row.status))));

  if (include('products')) searches.push(safeFindMany((prisma as any).product, {
    where: { OR: [{ name: { contains: q, mode: 'insensitive' } }, { sku: { contains: q, mode: 'insensitive' } }, { brand: { contains: q, mode: 'insensitive' } }, { seller: { name: { contains: q, mode: 'insensitive' } } }, { organization: { organizationName: { contains: q, mode: 'insensitive' } } }] },
    take,
    orderBy: { updatedAt: 'desc' },
    select: { id: true, name: true, sku: true, status: true, updatedAt: true, seller: { select: { name: true, company: { select: { name: true, portalDisplayName: true } } } }, organization: { select: { organizationName: true } } }
  }).then(rows => rows.map((row: any) => searchItem('product', { ...row, company: row.seller?.company }, row.name, row.sku || row.organization?.organizationName || row.seller?.name, `/master-admin/marketplace`, row.status))));

  if (include('services')) searches.push(safeFindMany((prisma as any).service, {
    where: { OR: [{ name: { contains: q, mode: 'insensitive' } }, { description: { contains: q, mode: 'insensitive' } }, { serviceArea: { contains: q, mode: 'insensitive' } }, { seller: { name: { contains: q, mode: 'insensitive' } } }, { organization: { organizationName: { contains: q, mode: 'insensitive' } } }] },
    take,
    orderBy: { updatedAt: 'desc' },
    select: { id: true, name: true, status: true, serviceArea: true, updatedAt: true, seller: { select: { name: true, company: { select: { name: true, portalDisplayName: true } } } }, organization: { select: { organizationName: true } } }
  }).then(rows => rows.map((row: any) => searchItem('service', { ...row, company: row.seller?.company }, row.name, row.serviceArea || row.organization?.organizationName || row.seller?.name, `/master-admin/marketplace`, row.status))));

  if (include('documents')) searches.push(safeFindMany((prisma as any).fileAsset, {
    where: { OR: [{ originalName: { contains: q, mode: 'insensitive' } }, { entityType: { contains: q, mode: 'insensitive' } }, { mimeType: { contains: q, mode: 'insensitive' } }, { owner: { name: { contains: q, mode: 'insensitive' } } }] },
    take,
    orderBy: { updatedAt: 'desc' },
    select: { id: true, originalName: true, entityType: true, status: true, updatedAt: true, owner: { select: { name: true, company: { select: { name: true, portalDisplayName: true } } } } }
  }).then(rows => rows.map((row: any) => searchItem('document', { ...row, company: row.owner?.company }, row.originalName, row.entityType || row.owner?.name, `/master-admin/organizations`, row.status))));

  const items = (await Promise.all(searches)).flat().sort((a, b) => new Date(b.updatedAt || 0).getTime() - new Date(a.updatedAt || 0).getTime());
  jsonOk(res, { items, total: items.length, query: q, type });
}));

router.get('/master-admin/system-health', ...masterOnly, wrap(async (_req, res) => {
  const startedAt = Date.now();
  let database: 'ok' | 'degraded' = 'ok';
  try {
    await prisma.$queryRaw`SELECT 1`;
  } catch {
    database = 'degraded';
  }
  const [failedApiCalls, failedPayments, pendingWebhooks, auditEvents, activeUsers, storageFiles] = await Promise.all([
    safeCount((prisma as any).apiLog, { where: { statusCode: { gte: 500 } } }),
    safeCount((prisma as any).paymentTransaction, { where: { status: { in: ['failed', 'FAILED'] } } }),
    safeCount((prisma as any).paymentWebhookEvent, { where: { processed: false } }),
    safeCount(prisma.auditLog),
    safeCount(prisma.user, { where: { accountStatus: 'ACTIVE' as any } }),
    safeCount((prisma as any).fileAsset, { where: { status: 'active' } })
  ]);
  jsonOk(res, {
    generatedAt: new Date().toISOString(),
    latencyMs: Date.now() - startedAt,
    status: database === 'ok' && failedApiCalls === 0 ? 'ok' : 'degraded',
    checks: {
      frontend: 'available',
      backendApi: 'ok',
      database,
      payments: failedPayments > 0 ? 'attention' : 'ok',
      webhooks: pendingWebhooks > 0 ? 'attention' : 'ok',
      fileStorage: storageFiles > 0 ? 'configured' : 'unknown'
    },
    counts: { failedApiCalls, failedPayments, pendingWebhooks, auditEvents, activeUsers, storageFiles }
  });
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
