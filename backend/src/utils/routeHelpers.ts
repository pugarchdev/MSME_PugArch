import type { Response } from 'express';
import { maskSensitive } from './maskSensitive.js';

export const safeRouteMessage = (err: any, fallback = 'Unable to complete request'): string => {
  const statusCode = err?.statusCode || 500;
  if (statusCode < 500) return err?.message || fallback;

  const message = String(err?.message || '');
  if (err?.code === 'P1001' || message.includes("Can't reach database server")) {
    return 'Database is temporarily unavailable. Please try again in a few minutes.';
  }
  if (message.includes('Invalid `prisma.') || message.includes('PrismaClient')) {
    return fallback;
  }
  return fallback;
};

export const handleSecureRouteError = (res: Response, err: any, fallback = 'Unable to complete request') => {
  const statusCode = err?.statusCode || 500;
  return res.status(statusCode).json({
    success: false,
    message: safeRouteMessage(err, fallback),
    code: err?.code || 'REQUEST_FAILED'
  });
};

export const handleFinancialRouteError = (res: Response, err: any) => {
  const statusCode = err?.statusCode || 500;
  return res.status(statusCode).json({
    success: false,
    message: statusCode >= 500 ? 'Unable to complete financial operation' : err.message,
    code: err?.code || 'FINANCIAL_OPERATION_FAILED'
  });
};

export const toSafeUser = (user: any) => {
  if (!user) return null;
  const { password, ...safeUser } = user;
  return maskSensitive({ ...safeUser, _id: user.id });
};
