import type { Response } from 'express';
import { maskSensitive } from './maskSensitive.js';

const logServerRouteError = (err: any, fallback: string) => {
  const statusCode = err?.statusCode || 500;
  if (statusCode < 500) return;

  console.error('[RouteError]', maskSensitive({
    fallback,
    code: err?.code,
    message: err?.message,
    meta: err?.meta,
    stack: err?.stack
  }));
};

export const safeRouteMessage = (err: any, fallback = 'Unable to complete request'): string => {
  const statusCode = err?.statusCode || 500;
  if (statusCode < 500) return err?.message || fallback;

  const message = String(err?.message || '');
  if (err?.code === 'P1001' || message.includes("Can't reach database server")) {
    return 'Database is temporarily unavailable. Please try again in a few minutes.';
  }
  if (
    ['P2021', 'P2022', 'P2023', 'P2025'].includes(String(err?.code || '')) ||
    message.includes('does not exist') ||
    message.includes('Unknown field') ||
    message.includes('relation') ||
    message.includes('column')
  ) {
    return 'Database schema is not up to date. Run Prisma migrations and redeploy the backend.';
  }
  if (message.includes('Invalid `prisma.') || message.includes('PrismaClient')) {
    return fallback;
  }
  return fallback;
};

export const handleSecureRouteError = (res: Response, err: any, fallback = 'Unable to complete request') => {
  if (err?.name === 'ZodError' || Array.isArray(err?.issues)) {
    const fieldErrors = err.issues.map((issue: any) => {
      const field = issue.path.join('.');
      return `${field ? field + ': ' : ''}${issue.message}`;
    });
    const combinedMessage = fieldErrors.join('; ');
    return res.status(400).json({
      success: false,
      message: combinedMessage || 'Validation failed',
      errors: err.issues,
      code: 'VALIDATION_ERROR'
    });
  }

  logServerRouteError(err, fallback);
  const statusCode = err?.statusCode || 500;
  return res.status(statusCode).json({
    success: false,
    message: safeRouteMessage(err, fallback),
    code: err?.code || 'REQUEST_FAILED'
  });
};

export const handleFinancialRouteError = (res: Response, err: any) => {
  logServerRouteError(err, 'Unable to complete financial operation');
  const statusCode = err?.statusCode || 500;
  return res.status(statusCode).json({
    success: false,
    message: statusCode >= 500 ? safeRouteMessage(err, 'Unable to complete financial operation') : err.message,
    code: err?.code || 'FINANCIAL_OPERATION_FAILED'
  });
};

export const toSafeUser = (user: any) => {
  if (!user) return null;
  const { password, ...safeUser } = user;
  return maskSensitive({ ...safeUser, _id: user.id });
};
