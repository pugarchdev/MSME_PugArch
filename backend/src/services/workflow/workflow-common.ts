import prisma from '../../config/prisma.js';
import { auditLog } from '../../modules/audit/audit.service.js';
import { publishNotificationEvent } from '../realtime.service.js';
import { randomToken } from '../../utils/crypto.js';
import { maskSensitive } from '../../utils/maskSensitive.js';

export const db = prisma as any;

export type WorkflowActor = {
  id: number;
  role: string;
  ipAddress?: string;
  userAgent?: string;
};

export const numberSeries = (prefix: string) =>
  `${prefix}-${new Date().getFullYear()}-${randomToken(6).toUpperCase()}`;

export const roundMoney = (value: number) => Number((Math.round(value * 100) / 100).toFixed(2));

export const auditWorkflow = (actor: WorkflowActor, action: string, entityType: string, entityId?: number | string, metadata?: Record<string, unknown>) =>
  auditLog({
    actorUserId: actor.id,
    actorRole: actor.role,
    action,
    entityType,
    entityId,
    ipAddress: actor.ipAddress,
    userAgent: actor.userAgent,
    metadata: maskSensitive(metadata || {})
  });

export const notifyWorkflow = async (userId: number, title: string, message: string, type: string) => {
  const notification = await db.notification.create({ data: { userId, title, message, type } }).catch(() => null);
  if (notification) await publishNotificationEvent(userId, notification);
};

export const assertRole = (actor: WorkflowActor, roles: string[]) => {
  if (!roles.includes(actor.role)) {
    const error = new Error('Access denied') as Error & { statusCode?: number; code?: string };
    error.statusCode = 403;
    error.code = 'ACCESS_DENIED';
    throw error;
  }
};
