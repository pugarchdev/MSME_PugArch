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

const optionalString = () =>
  z.preprocess(value => {
    if (value === undefined || value === null) return undefined;
    const trimmed = String(value).trim();
    return trimmed ? trimmed : undefined;
  }, z.string().optional());

const optionalUrl = () =>
  z.preprocess(value => {
    if (value === undefined || value === null) return undefined;
    const trimmed = String(value).trim();
    return trimmed ? trimmed : undefined;
  }, z.string().url().optional());

dotenv.config({
  path: [
    path.resolve(process.cwd(), '.env'),
    path.resolve(currentDir, '../../.env'),
    path.resolve(currentDir, '../../../.env')
  ],
  override: true
});

const isEnvValueEmpty = (val: unknown): boolean => {
  if (val === undefined || val === null) return true;
  const str = String(val).trim();
  return str === '' || str === 'undefined' || str === 'null';
};

const withFallback = <T extends z.ZodTypeAny>(fallbackKeys: string[], schema: T): T => {
  return z.preprocess(val => {
    if (!isEnvValueEmpty(val)) {
      return val;
    }
    for (const key of fallbackKeys) {
      const fb = process.env[key];
      if (!isEnvValueEmpty(fb)) {
        return fb;
      }
    }
    return undefined;
  }, schema) as unknown as T;
};

const envSchema = z.object({
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
  PORT: z.coerce.number().int().positive().default(5001),
  DATABASE_URL: withFallback(['POSTGRES_PRISMA_URL', 'POSTGRES_URL'], z.string().min(1).optional()),
  JWT_SECRET: z.string().min(8, 'JWT_SECRET must be at least 8 characters').optional(),
  JWT_EXPIRES_IN: z.string().default('2h'),
  JWT_ACCESS_EXPIRES_IN: z.string().default('2h'),
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
  SMS_ENABLED: envBoolean(false),
  SMS_PROVIDER: z.enum(['msg91']).default('msg91'),
  MSG91_AUTH_KEY: optionalString(),
  MSG91_SENDER_ID: optionalString(),
  MSG91_BASE_URL: z.string().url().default('https://control.msg91.com'),
  MSG91_COMMON_OTP_TEMPLATE_ID: optionalString(),
  APISETU_API_KEY: z.string().optional(),
  APISETU_CLIENT_ID: z.string().optional(),
  APISETU_GST_URL: z.string().url().default('https://apisetu.gov.in/gstn/v2/taxpayers/{gstin}'),
  APISETU_ALLOW_INSECURE_TLS: envBoolean(false),
  MERIPEHCHAAN_CLIENT_ID: optionalString(),
  MERIPEHCHAAN_CLIENT_SECRET: optionalString(),
  MERIPEHCHAAN_AUTH_URL: withFallback(['authorization_endpoint', 'AUTHORIZATION_ENDPOINT'], optionalUrl()),
  MERIPEHCHAAN_TOKEN_URL: withFallback(['token_endpoint', 'TOKEN_ENDPOINT'], optionalUrl()),
  MERIPEHCHAAN_USERINFO_URL: withFallback(['userinfo_endpoint', 'USERINFO_ENDPOINT'], optionalUrl()),
  MERIPEHCHAAN_JWKS_URL: withFallback(['jwks_uri', 'JWKS_URI'], optionalUrl()),
  MERIPEHCHAAN_ISSUER: withFallback(['issuer', 'ISSUER'], optionalString()),
  MERIPEHCHAAN_REDIRECT_URI: optionalUrl(),
  MERIPEHCHAAN_SCOPES: z.string().default('openid profile email'),
  MERIPEHCHAAN_ACR: optionalString(),
  AADHAAR_KYC_SESSION_TTL_MINUTES: z.coerce.number().int().min(1).max(1440).default(60)
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

const normalizeDatabaseUrl = (value?: string) => {
  if (!value) return value;

  let cleaned = value.trim();
  if (
    (cleaned.startsWith('"') && cleaned.endsWith('"')) ||
    (cleaned.startsWith("'") && cleaned.endsWith("'"))
  ) {
    cleaned = cleaned.slice(1, -1).trim();
  }

  try {
    const url = new URL(cleaned);
    if (url.protocol !== 'postgresql:' && url.protocol !== 'postgres:') return cleaned;

    url.searchParams.delete('channel_binding');
    if (!url.searchParams.has('connect_timeout')) {
      url.searchParams.set('connect_timeout', '30');
    }

    return url.toString();
  } catch {
    return cleaned;
  }
};

const databaseUrl = normalizeDatabaseUrl(parsed.data.DATABASE_URL);
if (!databaseUrl) {
  throw new Error('DATABASE_URL is required');
}
process.env.DATABASE_URL = databaseUrl;

export const env = {
  ...parsed.data,
  DATABASE_URL: databaseUrl,
  JWT_SECRET: parsed.data.JWT_SECRET
};

export const isProduction = env.NODE_ENV === 'production';

// ---------------------------------------------------------------------------
// MeriPehchaan / Aadhaar KYC startup configuration report
// Logs presence/absence of each required variable WITHOUT exposing values.
// ---------------------------------------------------------------------------
const kycConfigReport = () => {
  const scopes = env.MERIPEHCHAAN_SCOPES || '';
  const needsIdToken = scopes.split(/\s+/).includes('openid');

  const checks: Array<[string, boolean, string?]> = [
    ['MERIPEHCHAAN_CLIENT_ID', Boolean(env.MERIPEHCHAAN_CLIENT_ID)],
    ['MERIPEHCHAAN_CLIENT_SECRET', Boolean(env.MERIPEHCHAAN_CLIENT_SECRET)],
    ['MERIPEHCHAAN_AUTH_URL', Boolean(env.MERIPEHCHAAN_AUTH_URL)],
    ['MERIPEHCHAAN_TOKEN_URL', Boolean(env.MERIPEHCHAAN_TOKEN_URL)],
    ['MERIPEHCHAAN_USERINFO_URL', Boolean(env.MERIPEHCHAAN_USERINFO_URL), 'optional but recommended'],
    ['MERIPEHCHAAN_REDIRECT_URI', Boolean(env.MERIPEHCHAAN_REDIRECT_URI)],
    ['MERIPEHCHAAN_JWKS_URL', Boolean(env.MERIPEHCHAAN_JWKS_URL), needsIdToken ? 'REQUIRED (openid scope active)' : 'optional'],
    ['MERIPEHCHAAN_ISSUER', Boolean(env.MERIPEHCHAAN_ISSUER), 'recommended for full id_token validation'],
    ['FRONTEND_URL', Boolean(env.FRONTEND_URL)],
  ];

  const lines = checks.map(([key, present, note]) => {
    const status = present ? '✓ present' : '✗ MISSING';
    return `  ${status.padEnd(12)} ${key}${note ? ` (${note})` : ''}`;
  });

  const missingRequired = checks
    .filter(([, present, note]) => !present && (!note || note.includes('REQUIRED') || (!note.includes('optional') && !note.includes('recommended'))))
    .map(([key]) => key);

  // Also flag JWKS as missing-required when openid is in scopes.
  const missingJwks = needsIdToken && !env.MERIPEHCHAAN_JWKS_URL;
  if (missingJwks && !missingRequired.includes('MERIPEHCHAAN_JWKS_URL')) {
    missingRequired.push('MERIPEHCHAAN_JWKS_URL');
  }

  console.log('[MeriPehchaan KYC] Configuration status:');
  lines.forEach(l => console.log(l));

  if (missingRequired.length > 0) {
    console.warn(`[MeriPehchaan KYC] WARNING: The following required variable(s) are missing. Aadhaar KYC will return KYC_NOT_CONFIGURED (503) until they are set: ${missingRequired.join(', ')}`);
  } else {
    console.log('[MeriPehchaan KYC] All required variables are present. Service is ready.');
  }

  if (env.MERIPEHCHAAN_REDIRECT_URI) {
    // Log the redirect URI (not a secret) so it is easy to cross-check against the API Setu dashboard.
    console.log(`[MeriPehchaan KYC] Callback URL: ${env.MERIPEHCHAAN_REDIRECT_URI}`);
    console.log('[MeriPehchaan KYC] Ensure this exact URL is registered as the redirect/callback URI in the API Setu / MeriPehchaan Auth Partner dashboard.');
  }
};

kycConfigReport();
