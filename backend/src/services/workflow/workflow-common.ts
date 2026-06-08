import prisma from '../../config/prisma.js';
import { auditLog } from '../../modules/audit/audit.service.js';
import { notificationService } from '../notification.service.js';
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

export const auditWorkflowSoon = (actor: WorkflowActor, action: string, entityType: string, entityId?: number | string, metadata?: Record<string, unknown>) => {
  void auditWorkflow(actor, action, entityType, entityId, metadata).catch(error => {
    console.warn('[WorkflowAudit] Background audit failed', error instanceof Error ? error.message : error);
  });
};

export const notifyWorkflow = async (userId: number, title: string, message: string, type: string, redirectUrl = '/dashboard') => {
  await notificationService.notifyWithEmail(userId, {
    title,
    message,
    type,
    priority: 'medium',
    redirectUrl
  });
};

export const notifyWorkflowSoon = (userId: number, title: string, message: string, type: string, redirectUrl = '/dashboard') => {
  void notifyWorkflow(userId, title, message, type, redirectUrl).catch(error => {
    console.warn('[WorkflowNotify] Background notification failed', error instanceof Error ? error.message : error);
  });
};

export const assertRole = (actor: WorkflowActor, roles: string[]) => {
  if (!roles.includes(actor.role)) {
    const error = new Error('Access denied') as Error & { statusCode?: number; code?: string };
    error.statusCode = 403;
    error.code = 'ACCESS_DENIED';
    throw error;
  }
};
