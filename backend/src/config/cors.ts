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
  'https://msme-pugarch.vercel.app',
  'https://msme-pugarch-backend.vercel.app',
  'https://msme-portal-pug-arch-frontend-onet.vercel.app'
];

const configuredOrigins = [
  ...(isProduction ? [] : staticOrigins),
  ...(env.FRONTEND_URL ? env.FRONTEND_URL.split(',') : []),
  ...(env.CORS_ALLOWED_ORIGINS ? env.CORS_ALLOWED_ORIGINS.split(',') : [])
].map(origin => origin.trim()).filter(Boolean);

export const corsOptions: CorsOptions = {
  origin: (origin, callback) => {
    if (!origin) return callback(null, true);

    let hostname = '';
    try {
      hostname = new URL(origin).hostname;
    } catch {
      return callback(new Error(`CORS blocked for invalid origin: ${origin}`));
    }

    const isAllowedPreview = !isProduction && /^msme(-portal)?-pugarch-frontend(-[a-z0-9-]+)*\.vercel\.app$/.test(hostname);
    if (configuredOrigins.includes(origin) || isAllowedPreview) {
      return callback(null, true);
    }

    return callback(new Error(`CORS blocked for origin: ${origin}`));
  },
  credentials: true
};
