import dotenv from 'dotenv';
import path from 'path';
import { fileURLToPath } from 'url';
import { z } from 'zod';

const currentDir = path.dirname(fileURLToPath(import.meta.url));

const envBoolean = (defaultValue = false) =>
  z.preprocess(value => {
    if (value === undefined || value === null || value === '') return defaultValue;
    if (typeof value === 'boolean') return value;
    const normalized = String(value).trim().toLowerCase();
    if (['true', '1', 'yes', 'y', 'on'].includes(normalized)) return true;
    if (['false', '0', 'no', 'n', 'off'].includes(normalized)) return false;
    return value;
  }, z.boolean());

dotenv.config({
  path: [
    path.resolve(process.cwd(), '.env'),
    path.resolve(currentDir, '../../.env'),
    path.resolve(currentDir, '../../../.env')
  ],
  override: true
});

const envSchema = z.object({
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
  PORT: z.coerce.number().int().positive().default(5001),
  DATABASE_URL: z.string().min(1).optional(),
  JWT_SECRET: z.string().min(8, 'JWT_SECRET must be at least 8 characters').optional(),
  JWT_EXPIRES_IN: z.string().default('15m'),
  JWT_ACCESS_EXPIRES_IN: z.string().default('15m'),
  JWT_REFRESH_EXPIRES_IN: z.string().default('7d'),
  BCRYPT_COST: z.coerce.number().int().min(10).max(15).default(12),
  FAILED_LOGIN_LOCK_THRESHOLD: z.coerce.number().int().min(3).max(20).default(5),
  FAILED_LOGIN_LOCK_MINUTES: z.coerce.number().int().min(5).max(1440).default(30),
  FRONTEND_URL: z.string().optional(),
  CORS_ALLOW_VERCEL_PREVIEWS: envBoolean(true),
  REDIS_URL: z.string().optional(),
  REDIS_HOST: z.string().optional(),
  REDIS_PORT: z.coerce.number().int().default(6379),
  REDIS_PASSWORD: z.string().optional(),
  REDIS_DB: z.coerce.number().int().min(0).max(15).default(0),
  REDIS_TLS: envBoolean(false),
  REDIS_PREFIX: z.string().default('msme:'),
  CACHE_DRIVER: z.enum(['redis', 'valkey', 'memory']).default('redis'),
  RATE_LIMIT_WINDOW_MS: z.coerce.number().int().positive().default(15 * 60 * 1000),
  RATE_LIMIT_MAX: z.coerce.number().int().positive().default(300),
  REQUEST_BODY_LIMIT: z.string().default('1mb'),
  LOG_LEVEL: z.string().default('info'),
  CORS_ALLOWED_ORIGINS: z.string().optional(),
  STORAGE_PROVIDER: z.enum(['cloudinary', 'gcp']).default('cloudinary'),
  PAYMENT_PROVIDER: z.enum(['razorpay', 'cashfree', 'bank_transfer']).default('bank_transfer'),
  RAZORPAY_KEY_ID: z.string().optional(),
  RAZORPAY_KEY_SECRET: z.string().optional(),
  RAZORPAY_WEBHOOK_SECRET: z.string().optional(),
  CASHFREE_APP_ID: z.string().optional(),
  CASHFREE_SECRET_KEY: z.string().optional(),
  CASHFREE_WEBHOOK_SECRET: z.string().optional(),
  BANK_TRANSFER_VIRTUAL_ACCOUNT: z.string().optional(),
  CLOUDINARY_CLOUD_NAME: z.string().optional(),
  CLOUDINARY_API_KEY: z.string().optional(),
  CLOUDINARY_API_SECRET: z.string().optional(),
  GCP_STORAGE_BUCKET: z.string().optional(),
  GCP_PROJECT_ID: z.string().optional(),
  GCP_SERVICE_ACCOUNT_JSON: z.string().optional(),
  SMTP_HOST: z.string().default('smtp.gmail.com'),
  SMTP_PORT: z.coerce.number().int().positive().default(587),
  SMTP_USER: z.string().optional(),
  SMTP_PASS: z.string().optional(),
  APISETU_API_KEY: z.string().optional(),
  APISETU_CLIENT_ID: z.string().optional(),
  APISETU_GST_URL: z.string().url().default('https://apisetu.gov.in/gstn/v2/taxpayers/{gstin}'),
  APISETU_ALLOW_INSECURE_TLS: envBoolean(false)
});

const parsed = envSchema.safeParse(process.env);

if (!parsed.success) {
  const details = parsed.error.issues.map(issue => `${issue.path.join('.')}: ${issue.message}`).join('; ');
  throw new Error(`Invalid environment configuration: ${details}`);
}

const missingCritical = [
  ['DATABASE_URL', parsed.data.DATABASE_URL],
  ['JWT_SECRET', parsed.data.JWT_SECRET]
].filter(([, value]) => !value).map(([key]) => key);

if (missingCritical.length > 0) {
  throw new Error(`Missing critical environment variable(s): ${missingCritical.join(', ')}`);
}

const isTrueProduction = parsed.data.NODE_ENV === 'production' && process.env.VERCEL_ENV !== 'preview';

if (isTrueProduction) {
  if (parsed.data.JWT_SECRET && parsed.data.JWT_SECRET.length < 32) {
    throw new Error('JWT_SECRET must be at least 32 characters in production');
  }

  if (['debug', 'trace'].includes(parsed.data.LOG_LEVEL.toLowerCase())) {
    throw new Error('LOG_LEVEL must not be debug or trace in production');
  }

  if (parsed.data.APISETU_ALLOW_INSECURE_TLS) {
    throw new Error('APISETU_ALLOW_INSECURE_TLS must be false in production');
  }
}

export const env = {
  ...parsed.data,
  DATABASE_URL: parsed.data.DATABASE_URL as string,
  JWT_SECRET: parsed.data.JWT_SECRET as string
};

export const isProduction = env.NODE_ENV === 'production';
