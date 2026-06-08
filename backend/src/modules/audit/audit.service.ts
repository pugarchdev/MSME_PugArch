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
  metadata?: Record<string, unknown>;
};

const persistAuditLog = async (payload: AuditPayload) => {
  const actorId = payload.actorId ?? payload.actorUserId ?? null;
  const safeMetadata = maskSensitive({
    actorRole: payload.actorRole,
    ipAddress: payload.ipAddress,
    userAgent: payload.userAgent,
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
