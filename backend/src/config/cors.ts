import type { CorsOptions } from 'cors';
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

const vercelFrontendProjectPrefixes = [
  'msme-portal-pug-arch-frontend',
  'msme-portal-pugarch-frontend',
  'msme-frontend',
  'msme-pugarch'
];

const configuredOrigins = [
  ...(isProduction ? [] : staticOrigins),
  ...(env.FRONTEND_URL ? env.FRONTEND_URL.split(',') : []),
  ...(env.CORS_ALLOWED_ORIGINS ? env.CORS_ALLOWED_ORIGINS.split(',') : [])
].map(origin => origin.trim()).filter(Boolean);

const isAllowedVercelFrontendOrigin = (origin: string) => {
  try {
    const url = new URL(origin);
    if (url.protocol !== 'https:' || !url.hostname.endsWith('.vercel.app')) return false;

    if (env.CORS_ALLOW_VERCEL_PREVIEWS && url.hostname.endsWith('.vercel.app')) return true;

    return vercelFrontendProjectPrefixes.some(prefix =>
      url.hostname === `${prefix}.vercel.app` ||
      url.hostname.startsWith(`${prefix}-`)
    );
  } catch {
    return false;
  }
};

export const corsOptions: CorsOptions = {
  origin: (origin, callback) => {
    if (!origin) return callback(null, true);

    try {
      new URL(origin);
    } catch {
      return callback(null, false);
    }

    if (configuredOrigins.includes(origin) || isAllowedVercelFrontendOrigin(origin)) {
      return callback(null, true);
    }

    return callback(null, false);
  },
  credentials: true,
  methods: ['GET', 'HEAD', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization', 'X-Requested-With', 'X-Request-Id', 'Idempotency-Key'],
  optionsSuccessStatus: 204
};
