import type { Response } from 'express';
import { maskSensitive } from './maskSensitive.js';

const isDatabaseUnavailableError = (err: any) => {
  const message = String(err?.message || '');
  return (
    err?.code === 'P1001' ||
    err?.code === 'P2024' ||
    message.includes("Can't reach database server") ||
    message.toLowerCase().includes('timed out fetching a new connection')
  );
};

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
  if (isDatabaseUnavailableError(err)) {
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

const routeStatusCode = (err: any) => {
  if (isDatabaseUnavailableError(err)) {
    return 503;
  }
  return err?.statusCode || 500;
};

const routeErrorCode = (err: any, fallbackCode: string) => {
  if (isDatabaseUnavailableError(err)) {
    return 'DATABASE_UNAVAILABLE';
  }
  return err?.code || fallbackCode;
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
  const statusCode = routeStatusCode(err);
  return res.status(statusCode).json({
    success: false,
    message: safeRouteMessage(err, fallback),
    code: routeErrorCode(err, 'REQUEST_FAILED')
  });
};

export const handleFinancialRouteError = (res: Response, err: any) => {
  logServerRouteError(err, 'Unable to complete financial operation');
  const statusCode = routeStatusCode(err);
  return res.status(statusCode).json({
    success: false,
    message: statusCode >= 500 ? safeRouteMessage(err, 'Unable to complete financial operation') : err.message,
    code: routeErrorCode(err, 'FINANCIAL_OPERATION_FAILED')
  });
};

export const toSafeUser = (user: any) => {
  if (!user) return null;
  const { password, ...safeUser } = user;
  return maskSensitive({ ...safeUser, _id: user.id });
};
