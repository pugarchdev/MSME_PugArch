import type { CorsOptions } from 'cors';
import type { NextFunction, Request, Response } from 'express';
import { env, isProduction } from './env.js';

const staticOrigins = [
  'http://localhost:3000',
  'http://localhost:3001',
  'http://localhost:3002',
  'http://localhost:5001',
  'http://localhost:5002',
  'http://localhost:5173',
  'http://localhost:5174',
  'https://msme-portal-pug-arch-frontend.vercel.app',
  'https://msme-frontend.vercel.app',
  'https://msme-pugarch.vercel.app',
  'https://msme-pugarch-backend.vercel.app',
  'https://msme-portal-pug-arch-frontend-onet.vercel.app'
];

const configuredOrigins = [
  ...(isProduction ? [] : staticOrigins),
  ...(env.FRONTEND_URL ? env.FRONTEND_URL.split(',') : []),
  ...(env.CORS_ALLOWED_ORIGINS ? env.CORS_ALLOWED_ORIGINS.split(',') : [])
].map(origin => origin.trim()).filter(Boolean);

const isAllowedVercelFrontendOrigin = (origin: string) => {
  try {
    const url = new URL(origin);
    if (url.protocol !== 'https:') return false;

    const hostname = url.hostname;

    // Allow known production and static frontend domains
    const staticDomains = [
      'msme-portal-pug-arch-frontend.vercel.app',
      'msme-frontend.vercel.app',
      'msme-pugarch.vercel.app',
      'msme-portal-pug-arch-frontend-onet.vercel.app'
    ];
    if (staticDomains.includes(hostname)) return true;

    // Securely allow Vercel Preview Deployments for this specific project
    // Disable wildcard previews in production: !isProduction && ...
    const isLocalPreview = !isProduction && hostname.endsWith('.vercel.app');
    const isVercelPreview = env.CORS_ALLOW_VERCEL_PREVIEWS &&
      process.env.VERCEL_ENV === 'preview' &&
      hostname.endsWith('.vercel.app') &&
      (hostname.startsWith('msme-frontend-') || hostname.includes('-anands-projects-'));

    return isLocalPreview || isVercelPreview;
  } catch {
    return false;
  }
};

export const isAllowedCorsOrigin = (origin?: string) => {
  if (!origin) return true;

  try {
    new URL(origin);
  } catch {
    return false;
  }

  return configuredOrigins.includes(origin) || isAllowedVercelFrontendOrigin(origin);
};

export const applyCorsHeaders = (req: Request, res: Response) => {
  const origin = req.headers.origin;
  if (origin && isAllowedCorsOrigin(origin)) {
    res.setHeader('Access-Control-Allow-Origin', origin);
    res.setHeader('Access-Control-Allow-Credentials', 'true');
    res.setHeader('Vary', 'Origin');
  }

  res.setHeader('Access-Control-Allow-Methods', 'GET,HEAD,POST,PUT,PATCH,DELETE,OPTIONS');
  res.setHeader(
    'Access-Control-Allow-Headers',
    String(req.headers['access-control-request-headers'] || 'Content-Type, Authorization, X-Requested-With, X-Request-Id, Idempotency-Key')
  );
  res.setHeader('Access-Control-Max-Age', '86400');
};

export const preflightCors = (req: Request, res: Response, next: NextFunction) => {
  applyCorsHeaders(req, res);
  if (req.method === 'OPTIONS') return res.status(204).end();
  return next();
};

export const corsOptions: CorsOptions = {
  origin: (origin, callback) => {
    if (!origin) return callback(null, true);
    return callback(null, isAllowedCorsOrigin(origin));
  },
  credentials: true,
  methods: ['GET', 'HEAD', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization', 'X-Requested-With', 'X-Request-Id', 'Idempotency-Key'],
  optionsSuccessStatus: 204
};
