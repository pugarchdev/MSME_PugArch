import type { Request } from 'express';
import prisma from '../../lib/prisma.js';
import { sha256 } from '../../utils/crypto.js';
import { normalizeSpaces } from '../../utils/sanitize.js';

export const deviceHashForRequest = (req: Request) =>
  sha256(`${normalizeSpaces(req.headers['user-agent'])}|${normalizeSpaces(req.ip || req.socket.remoteAddress)}`);

export const recordLoginEvent = async (payload: {
  req: Request;
  userId?: number | null;
  success: boolean;
  reason?: string;
}) => {
  try {
    await prisma.loginEvent.create({
      data: {
        userId: payload.userId || null,
        ipAddress: normalizeSpaces(payload.req.ip || payload.req.socket.remoteAddress),
        userAgent: normalizeSpaces(payload.req.headers['user-agent']),
        deviceHash: deviceHashForRequest(payload.req),
        success: payload.success,
        reason: payload.reason
      }
    });
  } catch (error) {
    console.error('[LoginEvent] Failed to record login event', error instanceof Error ? error.message : error);
  }
};
