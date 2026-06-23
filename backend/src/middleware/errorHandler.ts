import type { ErrorRequestHandler } from 'express';
import { isProduction } from '../config/env.js';
import { ApiError } from '../utils/ApiError.js';
import { apiResponse } from '../utils/apiResponse.js';

export const notFoundHandler: ErrorRequestHandler = (err, _req, _res, next) => next(err);

export const errorHandler: ErrorRequestHandler = (err, _req, res, _next) => {
  const statusCode = err instanceof ApiError ? err.statusCode : Number(err?.statusCode || 500);
  const message = err instanceof ApiError || statusCode < 500 ? err.message : 'Internal server error';

  if (statusCode >= 500) {
    console.error('[ErrorHandler]', err);
  }

  return apiResponse.error(
    res,
    statusCode,
    message,
    err?.code,
    (isProduction && statusCode >= 500) ? undefined : err?.details
  );
};
