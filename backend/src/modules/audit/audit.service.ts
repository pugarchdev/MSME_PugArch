import prisma from '../../config/prisma.js';
import { maskSensitive } from '../../utils/maskSensitive.js';

type AuditPayload = {
  actorId?: number | null;
  actorUserId?: number | null;
  actorRole?: string | null;
  action: string;
  entityType?: string;
  entityId?: string | number;
  ipAddress?: string;
  userAgent?: string;
  requestId?: string;
  metadata?: Record<string, unknown>;
};

const persistAuditLog = async (payload: AuditPayload) => {
  const actorId = payload.actorId ?? payload.actorUserId ?? null;
  const safeMetadata = maskSensitive({
    actorRole: payload.actorRole,
    ipAddress: payload.ipAddress,
    userAgent: payload.userAgent,
    requestId: payload.requestId,
    ...(payload.metadata || {})
  });

  try {
    if ('auditLog' in prisma) {
      await (prisma as any).auditLog.create({
        data: {
          userId: actorId,
          action: payload.action,
          entityType: payload.entityType,
          entityId: payload.entityId && !Number.isNaN(Number(payload.entityId)) ? Number(payload.entityId) : null,
          details: safeMetadata
        }
      });
      return;
    }
  } catch (error) {
    console.error('[Audit] Failed to persist audit log', error instanceof Error ? error.message : error);
  }

  console.log('[Audit]', JSON.stringify(maskSensitive(payload)));
};

export const auditLog = async (payload: AuditPayload) => {
  void persistAuditLog(payload).catch(error => {
    console.error('[Audit] Background audit failed', error instanceof Error ? error.message : error);
  });
};

export const auditLogWithRequest = (req: { id?: string; user?: { id?: number; role?: string }; ip?: string; headers?: { 'user-agent'?: string } }, payload: Omit<AuditPayload, 'actorUserId' | 'actorRole' | 'ipAddress' | 'userAgent' | 'requestId'>) => {
  return auditLog({
    ...payload,
    actorUserId: req.user?.id,
    actorRole: req.user?.role,
    ipAddress: req.ip,
    userAgent: req.headers?.['user-agent'],
    requestId: req.id
  });
};
