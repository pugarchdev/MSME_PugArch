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
    totalBuyers,
    totalSellers,
    totalUsers,
    pendingApprovals,
    activeFeatures,
    recentAuditLogs
  ] = await Promise.all([
    (prisma as any).company.count(),
    prisma.user.count({ where: { role: 'buyer' } }),
    prisma.user.count({ where: { role: 'seller' } }),
    prisma.user.count(),
    prisma.user.count({ where: { onboardingStatus: { in: ['pending', 'pending_validation', 'under_compliance_review'] as any } } }),
    (prisma as any).companyFeature.count({ where: { enabled: true } }),
    prisma.auditLog.findMany({ orderBy: { createdAt: 'desc' }, take: 8, include: { User: { select: { id: true, name: true, email: true, role: true } } } })
  ]);

  res.json({
    summary: { totalCompanies, totalBuyers, totalSellers, totalUsers, pendingApprovals, activeFeatures },
    systemHealth: { api: 'ok', database: 'ok' },
    recentAuditLogs
  });
}));

router.get('/master-admin/companies', ...masterOnly, wrap(async (req, res) => {
  const { skip, take, page, pageSize } = getPagination(req.query as Record<string, unknown>);
  const q = textOrNull(req.query.q);
  const where = q ? {
    OR: [
      { name: { contains: q, mode: 'insensitive' } },
      { portalDisplayName: { contains: q, mode: 'insensitive' } },
      { district: { contains: q, mode: 'insensitive' } },
      { state: { contains: q, mode: 'insensitive' } }
    ]
  } : {};
  const [items, total] = await Promise.all([
    (prisma as any).company.findMany({ where, skip, take, orderBy: { updatedAt: 'desc' }, select: companySelect }),
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
  const q = textOrNull(req.query.q);
  const companyId = req.query.companyId ? Number(req.query.companyId) : undefined;
  const where: any = {
    ...(companyId ? { companyId } : {}),
    ...(q ? { OR: [{ name: { contains: q, mode: 'insensitive' } }, { email: { contains: q, mode: 'insensitive' } }, { userId: { contains: q, mode: 'insensitive' } }] } : {})
  };
  const [items, total] = await Promise.all([
    prisma.user.findMany({
      where,
      skip,
      take,
      orderBy: { createdAt: 'desc' },
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
  const q = textOrNull(req.query.q);
  const companyId = req.query.companyId ? Number(req.query.companyId) : undefined;
  const where: any = {
    ...(companyId ? { companyId } : {}),
    ...(q ? { organizationName: { contains: q, mode: 'insensitive' } } : {})
  };
  const [items, total] = await Promise.all([
    prisma.organization.findMany({
      where,
      skip,
      take,
      orderBy: { updatedAt: 'desc' },
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
  const companyId = req.query.companyId ? Number(req.query.companyId) : undefined;
  const where = companyId ? { companyId } : {};
  const [items, total] = await Promise.all([
    prisma.auditLog.findMany({ where, skip, take, orderBy: { createdAt: 'desc' }, include: { User: { select: { id: true, name: true, email: true, role: true } } } }),
    prisma.auditLog.count({ where })
  ]);
  res.json({ items, total, page, pageSize });
}));

export default router;
