import type { Express } from 'express';
import compression from 'compression';
import express from 'express';
import hpp from 'hpp';
import { env } from './env.js';
import { securityHeaders } from '../middleware/securityHeaders.js';
import { requestLogger } from '../middleware/requestLogger.js';
import { generalApiRateLimit } from '../middleware/rateLimit.js';
import { requestId } from '../middleware/requestId.js';
import { safeErrorResponse } from '../middleware/safeErrorResponse.js';
import { csrfProtection } from '../middleware/csrfProtection.js';
import { sanitizeInput } from '../middleware/sanitizeInput.js';

export const applySecurityMiddleware = (app: Express) => {
  app.disable('x-powered-by');
  app.set('trust proxy', 1);
  app.use(requestId);
  app.use(securityHeaders);
  app.use((_req, res, next) => {
    res.setHeader(
      'Permissions-Policy',
      'camera=(), microphone=(), geolocation=(), payment=(), usb=(), fullscreen=(self)'
    );
    next();
  });
  app.use(express.json({
    limit: env.REQUEST_BODY_LIMIT,
    verify: (req, _res, buffer) => {
      (req as any).rawBody = Buffer.from(buffer);
    }
  }));
  app.use(express.urlencoded({ extended: true, limit: env.REQUEST_BODY_LIMIT }));
  app.use(hpp());
  app.use(sanitizeInput);
  app.use(csrfProtection);
  app.use(compression({ threshold: 1024 }));
  app.use(safeErrorResponse);
  app.use(requestLogger);
  app.use('/api', generalApiRateLimit);
};
