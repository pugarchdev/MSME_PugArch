import { Router } from 'express';
import { randomBytes } from 'crypto';
import { z } from 'zod';
import prisma from '../lib/prisma.js';
import { authenticate } from '../middleware/authenticate.js';
import { asyncHandler } from '../utils/asyncHandler.js';
import { apiResponse } from '../utils/apiResponse.js';
import { auditLog } from '../modules/audit/audit.service.js';
import { ACCOUNT_TYPE_IDS, DEFAULT_DYNAMIC_ROLE_TEMPLATES, RBAC_PERMISSION_CATALOG } from '../constants/dynamic-rbac.js';
import { assertCanAssignRole, assertCanManageRole, ensureAssignablePermissions, getActivePermissionCodes, isMasterAdmin, userHasPermission, type RbacScope } from '../services/rbac.service.js';

const router = Router();
router.use(authenticate);

const roleScopeSchema = z.enum(['PLATFORM', 'DISTRICT', 'ORGANIZATION']);
const roleStatusSchema = z.enum(['ACTIVE', 'INACTIVE', 'ARCHIVED']);
const idParamSchema = z.object({ id: z.coerce.number().int().positive() });
const userIdParamSchema = z.object({ userId: z.coerce.number().int().positive() });

const roleBodySchema = z.object({
  name: z.string().trim().min(2).max(120),
  description: z.string().trim().max(1000).optional().nullable(),
  scopeType: roleScopeSchema,
  scopeId: z.union([z.string(), z.number()]).optional().nullable(),
  status: roleStatusSchema.optional().default('ACTIVE'),
  permissionCodes: z.array(z.string().trim().min(1)).optional(),
  permissionIds: z.array(z.coerce.number().int().positive()).optional(),
  isDefault: z.boolean().optional()
});

const permissionUpdateSchema = z.object({
  permissionCodes: z.array(z.string().trim().min(1)).optional(),
  permissionIds: z.array(z.coerce.number().int().positive()).optional()
});

const assignmentBodySchema = z.object({
  roleId: z.coerce.number().int().positive(),
  scopeType: roleScopeSchema,
  scopeId: z.union([z.string(), z.number()]).optional().nullable(),
  expiresAt: z.coerce.date().optional().nullable()
});

const assignmentStatusSchema = z.object({
  isActive: z.boolean()
});

const inviteSchema = z.object({
  name: z.string().trim().min(2).max(120).optional(),
  email: z.string().trim().email(),
  mobile: z.string().trim().max(20).optional(),
  accountType: z.enum(['MASTER_ADMIN', 'SUPERADMIN', 'SELLER', 'BUYER', 'SHG']).optional(),
  roleIds: z.array(z.coerce.number().int().positive()).default([])
});

const scopeIdForWrite = (scopeType: string, scopeId: string | number | null | undefined, req: any) => {
  if (scopeType === 'PLATFORM') return null;
  if (scopeType === 'DISTRICT') return scopeId == null ? (req.user?.companyId ? String(req.user.companyId) : null) : String(scopeId);
  return scopeId == null ? (req.user?.organizationId ? String(req.user.organizationId) : null) : String(scopeId);
};

const assertCanManageScope = async (req: any, scope: RbacScope) => {
  return assertCanManageRole(req.user, String(scope.scopeType), scope.scopeId);
};

const assertCanInviteScope = async (req: any, scope: RbacScope) => {
  const user = req.user;
  if (isMasterAdmin(user)) return;
  const scopeType = String(scope.scopeType);
  const scopeId = scope.scopeId == null ? null : String(scope.scopeId);
  if (scopeType === 'PLATFORM') {
    const error = new Error('Only Master Admin can invite platform users.');
    (error as any).statusCode = 403;
    (error as any).code = 'PLATFORM_SCOPE_DENIED';
    throw error;
  }
  if (scopeType === 'DISTRICT' && scopeId && user.companyId && scopeId !== String(user.companyId)) {
    const error = new Error('Cannot invite users outside your district scope.');
    (error as any).statusCode = 403;
    (error as any).code = 'CROSS_SCOPE_DENIED';
    throw error;
  }
  if (scopeType === 'ORGANIZATION' && (!scopeId || !user.organizationId || scopeId !== String(user.organizationId))) {
    const error = new Error('Cannot invite users outside your organization scope.');
    (error as any).statusCode = 403;
    (error as any).code = 'CROSS_SCOPE_DENIED';
    throw error;
  }
  if (!(await userHasPermission(user, 'team.member.invite', scope))) {
    const error = new Error('Missing permission: team.member.invite');
    (error as any).statusCode = 403;
    (error as any).code = 'PERMISSION_DENIED';
    throw error;
  }
};

const roleWhereForUser = (req: any) => {
  if (isMasterAdmin(req.user)) return {};
  if (req.user?.role === 'admin' || req.user?.accountType === 'SUPERADMIN') {
    return { OR: [{ scopeType: 'DISTRICT', scopeId: String(req.user.companyId || '') }, { scopeType: 'PLATFORM', isDefault: true }] };
  }
  if (req.user?.organizationId) {
    return { OR: [{ scopeType: 'ORGANIZATION', scopeId: String(req.user.organizationId) }, { scopeType: 'PLATFORM', isDefault: true }] };
  }
  return { id: -1 };
};

const getPermissionIds = async (body: { permissionIds?: number[]; permissionCodes?: string[] }) => {
  if (body.permissionIds?.length) {
    const rows = await prisma.permission.findMany({ where: { id: { in: body.permissionIds } }, select: { id: true, code: true } });
    return { ids: rows.map(p => p.id), codes: rows.map(p => p.code) };
  }
  const codes = body.permissionCodes || [];
  const rows = await prisma.permission.findMany({ where: { code: { in: codes } }, select: { id: true, code: true } });
  return { ids: rows.map(p => p.id), codes: rows.map(p => p.code) };
};

const writeAudit = (req: any, action: string, entityType: string, entityId?: number, metadata?: Record<string, unknown>) =>
  auditLog({
    actorUserId: req.user?.id,
    actorRole: req.user?.role,
    action,
    entityType,
    entityId,
    ipAddress: req.ip,
    userAgent: req.headers['user-agent'],
    metadata
  });

router.get('/rbac/roles', asyncHandler(async (req, res) => {
  const roles = await (prisma as any).rbacRole.findMany({
    where: roleWhereForUser(req),
    include: { permissions: { where: { allowed: true }, include: { permission: true } }, _count: { select: { users: true } } },
    orderBy: [{ scopeType: 'asc' }, { name: 'asc' }]
  });
  return apiResponse.success(res, roles);
}));

router.post('/rbac/roles', asyncHandler(async (req, res) => {
  const body = roleBodySchema.parse(req.body);
  const scopeId = scopeIdForWrite(body.scopeType, body.scopeId, req);
  const scope = { scopeType: body.scopeType, scopeId };
  await assertCanManageScope(req, scope);

  const { ids, codes } = await getPermissionIds(body);
  await ensureAssignablePermissions((req as any).user, codes, scope);
  const role = await (prisma as any).rbacRole.create({
    data: {
      code: `${body.scopeType}_${scopeId || 'ROOT'}_${body.name}`.toUpperCase().replace(/[^A-Z0-9]+/g, '_').replace(/^_|_$/g, '').slice(0, 180),
      name: body.name,
      description: body.description || null,
      scopeType: body.scopeType,
      scope: body.scopeType,
      scopeId,
      status: body.status,
      isSystemRole: false,
      isDefault: body.isDefault || false,
      companyId: body.scopeType === 'DISTRICT' && scopeId ? Number(scopeId) : null,
      createdById: (req as any).user?.id,
      permissions: { create: ids.map(permissionId => ({ permissionId, allowed: true })) }
    },
    include: { permissions: { include: { permission: true } } }
  });
  await writeAudit(req, 'rbac.role.created', 'rbacRole', role.id, { scope });
  return apiResponse.created(res, role, 'Role created');
}));

router.get('/rbac/roles/:id', asyncHandler(async (req, res) => {
  const { id } = idParamSchema.parse(req.params);
  const role = await (prisma as any).rbacRole.findFirst({
    where: { id, ...roleWhereForUser(req) },
    include: { permissions: { include: { permission: true } }, users: { include: { user: { select: { id: true, name: true, email: true, role: true, accountType: true } } } } }
  });
  if (!role) return apiResponse.error(res, 404, 'Role not found', 'ROLE_NOT_FOUND');
  return apiResponse.success(res, role);
}));

router.put('/rbac/roles/:id', asyncHandler(async (req, res) => {
  const { id } = idParamSchema.parse(req.params);
  const body = roleBodySchema.partial().parse(req.body);
  const role = await (prisma as any).rbacRole.findUnique({ where: { id }, include: { permissions: { include: { permission: true } } } });
  if (!role) return apiResponse.error(res, 404, 'Role not found', 'ROLE_NOT_FOUND');
  const scope = { scopeType: body.scopeType || role.scopeType, scopeId: scopeIdForWrite(body.scopeType || role.scopeType, body.scopeId ?? role.scopeId, req) };
  await assertCanManageScope(req, scope);
  if (body.permissionCodes || body.permissionIds) {
    const { ids, codes } = await getPermissionIds(body);
    await ensureAssignablePermissions((req as any).user, codes, scope);
    await (prisma as any).rolePermission.deleteMany({ where: { roleId: id } });
    if (ids.length) await (prisma as any).rolePermission.createMany({ data: ids.map(permissionId => ({ roleId: id, permissionId, allowed: true })) });
  }
  const updated = await (prisma as any).rbacRole.update({
    where: { id },
    data: {
      ...(body.name ? { name: body.name } : {}),
      ...(body.description !== undefined ? { description: body.description || null } : {}),
      ...(body.status ? { status: body.status } : {}),
      ...(body.scopeType ? { scopeType: body.scopeType, scope: body.scopeType } : {}),
      ...(scope.scopeId !== role.scopeId ? { scopeId: scope.scopeId } : {})
    },
    include: { permissions: { include: { permission: true } } }
  });
  await writeAudit(req, 'rbac.role.updated', 'rbacRole', id, { scope, permissionsChanged: Boolean(body.permissionCodes || body.permissionIds) });
  return apiResponse.success(res, updated);
}));

router.delete('/rbac/roles/:id', asyncHandler(async (req, res) => {
  const { id } = idParamSchema.parse(req.params);
  const role = await (prisma as any).rbacRole.findUnique({ where: { id } });
  if (!role) return apiResponse.error(res, 404, 'Role not found', 'ROLE_NOT_FOUND');
  await assertCanManageScope(req, { scopeType: role.scopeType, scopeId: role.scopeId });
  const updated = await (prisma as any).rbacRole.update({ where: { id }, data: { status: 'ARCHIVED' } });
  await writeAudit(req, 'rbac.role.archived', 'rbacRole', id);
  return apiResponse.success(res, updated);
}));

router.patch('/rbac/roles/:id/archive', asyncHandler(async (req, res) => {
  const { id } = idParamSchema.parse(req.params);
  const role = await (prisma as any).rbacRole.findUnique({ where: { id } });
  if (!role) return apiResponse.error(res, 404, 'Role not found', 'ROLE_NOT_FOUND');
  await assertCanManageScope(req, { scopeType: role.scopeType, scopeId: role.scopeId });
  const updated = await (prisma as any).rbacRole.update({ where: { id }, data: { status: 'ARCHIVED' } });
  await writeAudit(req, 'rbac.role.archived', 'rbacRole', id);
  return apiResponse.success(res, updated);
}));

router.get('/rbac/roles/:id/permissions', asyncHandler(async (req, res) => {
  const { id } = idParamSchema.parse(req.params);
  const role = await (prisma as any).rbacRole.findFirst({ where: { id, ...roleWhereForUser(req) }, include: { permissions: { include: { permission: true } } } });
  if (!role) return apiResponse.error(res, 404, 'Role not found', 'ROLE_NOT_FOUND');
  return apiResponse.success(res, role.permissions);
}));

router.post('/rbac/roles/:id/permissions', asyncHandler(async (req, res) => {
  const { id } = idParamSchema.parse(req.params);
  const body = permissionUpdateSchema.parse(req.body);
  const role = await (prisma as any).rbacRole.findUnique({ where: { id } });
  if (!role) return apiResponse.error(res, 404, 'Role not found', 'ROLE_NOT_FOUND');
  const scope = { scopeType: role.scopeType, scopeId: role.scopeId };
  await assertCanManageScope(req, scope);
  const { ids, codes } = await getPermissionIds(body);
  await ensureAssignablePermissions((req as any).user, codes, scope);
  await (prisma as any).rolePermission.deleteMany({ where: { roleId: id } });
  if (ids.length) await (prisma as any).rolePermission.createMany({ data: ids.map(permissionId => ({ roleId: id, permissionId, allowed: true })) });
  const updated = await (prisma as any).rbacRole.findUnique({ where: { id }, include: { permissions: { include: { permission: true } } } });
  await writeAudit(req, 'rbac.role.permissions_updated', 'rbacRole', id, { count: ids.length });
  return apiResponse.success(res, updated);
}));

router.get('/rbac/permissions', asyncHandler(async (_req, res) => {
  const permissions = await prisma.permission.findMany({ orderBy: [{ module: 'asc' }, { code: 'asc' }] });
  return apiResponse.success(res, permissions);
}));

router.get('/rbac/permissions/grouped', asyncHandler(async (_req, res) => {
  const permissions = await prisma.permission.findMany({ orderBy: [{ module: 'asc' }, { code: 'asc' }] });
  const grouped = permissions.reduce((acc: Record<string, typeof permissions>, permission) => {
    const module = permission.module || 'Other';
    acc[module] = acc[module] || [];
    acc[module].push(permission);
    return acc;
  }, {});
  return apiResponse.success(res, grouped);
}));

router.get('/rbac/users/:userId/roles', asyncHandler(async (req, res) => {
  const { userId } = userIdParamSchema.parse(req.params);
  const target = await prisma.user.findUnique({ where: { id: userId }, select: { organizationId: true, companyId: true } });
  if (!target) return apiResponse.error(res, 404, 'User not found', 'USER_NOT_FOUND');
  if (!isMasterAdmin((req as any).user) && target.organizationId !== (req as any).user?.organizationId && target.companyId !== (req as any).user?.companyId) {
    return apiResponse.error(res, 403, 'Cannot view role assignments outside your scope', 'RBAC_SCOPE_DENIED');
  }
  const assignments = await (prisma as any).userRole.findMany({
    where: { userId },
    include: { role: { include: { permissions: { include: { permission: true } } } } },
    orderBy: { assignedAt: 'desc' }
  });
  return apiResponse.success(res, assignments);
}));

router.post('/rbac/users/:userId/roles', asyncHandler(async (req, res) => {
  const { userId } = userIdParamSchema.parse(req.params);
  const body = assignmentBodySchema.parse(req.body);
  const scope = { scopeType: body.scopeType, scopeId: scopeIdForWrite(body.scopeType, body.scopeId, req) };
  await assertCanAssignRole((req as any).user, userId, body.roleId, body.scopeType, scope.scopeId);
  const assignmentData = {
      userId,
      roleId: body.roleId,
      scopeType: body.scopeType,
      scopeId: scope.scopeId,
      companyId: body.scopeType === 'DISTRICT' && scope.scopeId ? Number(scope.scopeId) : null,
      organizationId: body.scopeType === 'ORGANIZATION' && scope.scopeId ? Number(scope.scopeId) : null,
      assignedById: (req as any).user?.id,
      expiresAt: body.expiresAt || null,
      isActive: true
    };
  const existing = await (prisma as any).userRole.findFirst({
    where: { userId, roleId: body.roleId, scopeType: body.scopeType, scopeId: scope.scopeId }
  });
  const assignment = existing
    ? await (prisma as any).userRole.update({ where: { id: existing.id }, data: assignmentData, include: { role: true } })
    : await (prisma as any).userRole.create({ data: assignmentData, include: { role: true } });
  await writeAudit(req, 'rbac.user_role.assigned', 'userRole', assignment.id, { userId, roleId: body.roleId, scope });
  return apiResponse.created(res, assignment, 'Role assigned');
}));

router.delete('/rbac/users/:userId/roles/:assignmentId', asyncHandler(async (req, res) => {
  const { userId } = userIdParamSchema.parse(req.params);
  const assignmentId = z.coerce.number().int().positive().parse(req.params.assignmentId);
  if (userId === (req as any).user?.id && !isMasterAdmin((req as any).user)) {
    return apiResponse.error(res, 403, 'You cannot change your own role assignments.', 'SELF_ESCALATION_DENIED');
  }
  const assignment = await (prisma as any).userRole.findUnique({ where: { id: assignmentId } });
  if (!assignment || assignment.userId !== userId) return apiResponse.error(res, 404, 'Assignment not found', 'ASSIGNMENT_NOT_FOUND');
  await assertCanManageScope(req, { scopeType: assignment.scopeType, scopeId: assignment.scopeId });
  await (prisma as any).userRole.delete({ where: { id: assignmentId } });
  await writeAudit(req, 'rbac.user_role.removed', 'userRole', assignmentId, { userId });
  return apiResponse.success(res, { id: assignmentId });
}));

router.patch('/rbac/users/:userId/roles/:assignmentId/status', asyncHandler(async (req, res) => {
  const { userId } = userIdParamSchema.parse(req.params);
  const assignmentId = z.coerce.number().int().positive().parse(req.params.assignmentId);
  const body = assignmentStatusSchema.parse(req.body);
  if (userId === (req as any).user?.id && !isMasterAdmin((req as any).user)) {
    return apiResponse.error(res, 403, 'You cannot change your own role assignments.', 'SELF_ESCALATION_DENIED');
  }
  const assignment = await (prisma as any).userRole.findUnique({ where: { id: assignmentId } });
  if (!assignment || assignment.userId !== userId) return apiResponse.error(res, 404, 'Assignment not found', 'ASSIGNMENT_NOT_FOUND');
  await assertCanManageScope(req, { scopeType: assignment.scopeType, scopeId: assignment.scopeId });
  const updated = await (prisma as any).userRole.update({ where: { id: assignmentId }, data: { isActive: body.isActive } });
  await writeAudit(req, 'rbac.user_role.status_updated', 'userRole', assignmentId, { userId, isActive: body.isActive });
  return apiResponse.success(res, updated);
}));

router.get('/auth/me/permissions', asyncHandler(async (req, res) => {
  const user = (req as any).user;
  const permissions = isMasterAdmin(user) ? ['*'] : await getActivePermissionCodes(user.id, user.activeScope);
  return apiResponse.success(res, { permissions, activeScope: user.activeScope, accountType: user.accountType, accountTypeId: user.accountTypeId });
}));

router.get('/team/members', asyncHandler(async (req, res) => {
  const user = (req as any).user;
  const where = isMasterAdmin(user)
    ? {}
    : user.organizationId
      ? { organizationId: user.organizationId }
      : { companyId: user.companyId };
  const members = await (prisma as any).user.findMany({
    where,
    select: { id: true, name: true, email: true, mobile: true, role: true, accountType: true, accountTypeId: true, accountStatus: true, organizationId: true, companyId: true, roles: { include: { role: true } } },
    orderBy: { name: 'asc' },
    take: 500
  });
  return apiResponse.success(res, members.map((member: any) => ({
    ...member,
    accountType: member.accountType?.code || null
  })));
}));

router.post('/team/invite', asyncHandler(async (req, res) => {
  const body = inviteSchema.parse(req.body);
  const user = (req as any).user;
  const scope = isMasterAdmin(user)
    ? { scopeType: 'PLATFORM' as const, scopeId: null }
    : user.organizationId
    ? { scopeType: 'ORGANIZATION' as const, scopeId: String(user.organizationId) }
    : { scopeType: 'DISTRICT' as const, scopeId: user.companyId ? String(user.companyId) : null };
  await assertCanInviteScope(req, scope);
  for (const roleId of body.roleIds) {
    await assertCanAssignRole(user, -1, roleId, scope.scopeType, scope.scopeId);
  }
  const token = randomBytes(32).toString('hex');
  const accountTypeId = body.accountType ? ACCOUNT_TYPE_IDS[body.accountType] : user.organizationId ? user.accountTypeId : ACCOUNT_TYPE_IDS.SUPERADMIN;
  const invitation = await (prisma as any).scopedInvitation.create({
    data: {
      name: body.name || null,
      email: body.email,
      mobile: body.mobile || null,
      accountTypeId,
      scopeType: scope.scopeType,
      scopeId: scope.scopeId,
      roleIds: body.roleIds,
      token,
      expiresAt: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000),
      invitedById: user.id
    }
  });
  await writeAudit(req, 'team.invite.created', 'scopedInvitation', invitation.id, { email: body.email, roleIds: body.roleIds, scope });
  return apiResponse.created(res, invitation, 'Invitation created');
}));

router.patch('/team/members/:id/disable', asyncHandler(async (req, res) => {
  const { id } = idParamSchema.parse(req.params);
  if (id === (req as any).user?.id) return apiResponse.error(res, 403, 'You cannot disable your own account.', 'SELF_DISABLE_DENIED');
  const target = await prisma.user.findUnique({ where: { id }, select: { organizationId: true, companyId: true } });
  if (!target) return apiResponse.error(res, 404, 'Member not found', 'USER_NOT_FOUND');
  const scope = target.organizationId ? { scopeType: 'ORGANIZATION' as const, scopeId: String(target.organizationId) } : { scopeType: 'DISTRICT' as const, scopeId: String(target.companyId) };
  await assertCanManageScope(req, scope);
  const updated = await prisma.user.update({ where: { id }, data: { accountStatus: 'BLOCKED' as any, sessionVersion: { increment: 1 } } });
  await writeAudit(req, 'team.member.disabled', 'user', id);
  return apiResponse.success(res, updated);
}));

router.patch('/team/members/:id/roles', asyncHandler(async (req, res) => {
  req.params.userId = req.params.id;
  return apiResponse.error(res, 400, 'Use POST /api/rbac/users/:userId/roles or assignment status endpoints for role changes.', 'USE_RBAC_ASSIGNMENT_API');
}));

router.get('/rbac/audit-logs', asyncHandler(async (req, res) => {
  if (!isMasterAdmin((req as any).user) && !(await userHasPermission((req as any).user, 'audit.view', (req as any).user.activeScope))) {
    return apiResponse.error(res, 403, 'Missing permission: audit.view', 'PERMISSION_DENIED');
  }
  const logs = await prisma.auditLog.findMany({
    where: { action: { startsWith: 'rbac.' } },
    orderBy: { createdAt: 'desc' },
    take: 200,
    include: { User: { select: { id: true, name: true, email: true } } }
  });
  return apiResponse.success(res, logs);
}));

router.post('/rbac/seed-defaults', asyncHandler(async (req, res) => {
  if (!isMasterAdmin((req as any).user)) return apiResponse.error(res, 403, 'Only Master Admin can seed RBAC defaults.', 'MASTER_ADMIN_REQUIRED');
  const permissionRecords = new Map<string, { id: number }>();
  for (const [code, module, action, resource, description] of RBAC_PERMISSION_CATALOG) {
    const row = await (prisma as any).permission.upsert({
      where: { code },
      update: { module, action, resource, description, isSystem: true },
      create: { code, module, action, resource, description, isSystem: true },
      select: { id: true, code: true }
    });
    permissionRecords.set(code, row);
  }
  for (const template of DEFAULT_DYNAMIC_ROLE_TEMPLATES) {
    const role = await (prisma as any).rbacRole.upsert({
      where: { code: template.code },
      update: { name: template.name, description: template.description, scopeType: 'PLATFORM', scope: 'PLATFORM', isDefault: true, isSystemRole: true, status: 'ACTIVE' },
      create: { code: template.code, name: template.name, description: template.description, scopeType: 'PLATFORM', scope: 'PLATFORM', isDefault: true, isSystemRole: true, status: 'ACTIVE' },
      select: { id: true }
    });
    const rows = template.permissionCodes
      .map(code => permissionRecords.get(code))
      .filter(Boolean)
      .map(permission => ({ roleId: role.id, permissionId: permission!.id, allowed: true }));
    if (rows.length) await (prisma as any).rolePermission.createMany({ data: rows, skipDuplicates: true });
  }
  return apiResponse.success(res, { permissions: permissionRecords.size, templates: DEFAULT_DYNAMIC_ROLE_TEMPLATES.length });
}));

export default router;
