import prisma from '../config/prisma.js';
import { isRedisReady, redis } from '../config/redis.js';
import { redisKeys } from '../constants/redis-keys.js';
import { ApiError } from '../utils/ApiError.js';
import { sha256 } from '../utils/crypto.js';

export type OtpPurpose =
  | 'registration_email'
  | 'registration_mobile'
  | 'forgot_password'
  | 'two_factor_login';

const OTP_TTL_SECONDS = 5 * 60;
const MAX_OTP_ATTEMPTS = 5;
const OTP_SEND_WINDOW_SECONDS = 15 * 60;
const MAX_OTP_SENDS = 5;

type OtpState = {
  otpHash: string;
  otpHashes?: string[];
  verified: boolean;
  attempts: number;
  createdAt: string;
  expiresAt: string;
  metadata?: Record<string, unknown>;
};

const normalizeIdentity = (identity: string) => identity.trim().toLowerCase();
const keyFor = (purpose: OtpPurpose, identity: string) => redisKeys.otp(purpose, identity);
const attemptsKeyFor = (purpose: OtpPurpose, identity: string) => redisKeys.otpAttempts(purpose, identity);
const sendCountKeyFor = (purpose: OtpPurpose, identity: string) => redisKeys.otpCooldown(purpose, identity);

export const generateOtp = () => String(Math.floor(100000 + Math.random() * 900000));

export const storeOtp = async (
  purpose: OtpPurpose,
  identity: string,
  otp: string,
  metadata?: Record<string, unknown>
) => {
  const normalizedIdentity = normalizeIdentity(identity);
  const now = new Date();
  const expiresAt = new Date(now.getTime() + OTP_TTL_SECONDS * 1000);
  const otpHash = sha256(otp);

  if (!redis || !isRedisReady()) {
    throw new ApiError(503, 'OTP service is temporarily unavailable', 'OTP_REDIS_UNAVAILABLE');
  }

  const sendCountKey = sendCountKeyFor(purpose, normalizedIdentity);
  const sendCount = Number(await redis.incr(sendCountKey));
  if (sendCount === 1) await redis.expire(sendCountKey, OTP_SEND_WINDOW_SECONDS);
  if (sendCount > MAX_OTP_SENDS) {
    await redis.decr(sendCountKey).catch(() => undefined);
    throw new ApiError(429, 'OTP resend limit reached. Please try again after 15 minutes.', 'OTP_RESEND_LIMIT');
  }

  const existingRaw = await redis.get(keyFor(purpose, normalizedIdentity));
  const existingState = existingRaw ? JSON.parse(existingRaw) as OtpState : null;
  const previousHashes = existingState && !existingState.verified && new Date(existingState.expiresAt) >= now
    ? existingState.otpHashes || [existingState.otpHash]
    : [];

  const state: OtpState = {
    otpHash,
    otpHashes: [otpHash, ...previousHashes.filter(hash => hash !== otpHash)].slice(0, MAX_OTP_SENDS),
    verified: false,
    attempts: existingState?.attempts || 0,
    createdAt: now.toISOString(),
    expiresAt: expiresAt.toISOString(),
    metadata
  };

  await redis.set(keyFor(purpose, normalizedIdentity), JSON.stringify(state), 'EX', OTP_TTL_SECONDS);
  await redis.set(attemptsKeyFor(purpose, normalizedIdentity), '0', 'EX', OTP_TTL_SECONDS);
  await prisma.otpVerification.create({
    data: {
      identifier: normalizedIdentity,
      identifierHash: sha256(normalizedIdentity),
      purpose,
      attempts: 0,
      verified: false,
      expiresAt
    }
  }).catch(() => undefined);

  return {
    sendsRemaining: Math.max(0, MAX_OTP_SENDS - sendCount)
  };
};

export const verifyOtp = async (purpose: OtpPurpose, identity: string, otp: string) => {
  const normalizedIdentity = normalizeIdentity(identity);

  if (!redis || !isRedisReady()) {
    throw new ApiError(503, 'OTP service is temporarily unavailable', 'OTP_REDIS_UNAVAILABLE');
  }

  const key = keyFor(purpose, normalizedIdentity);
  const raw = await redis.get(key);
  if (!raw) return { ok: false, reason: 'invalid' as const, attemptsRemaining: MAX_OTP_ATTEMPTS };

  const state = JSON.parse(raw) as OtpState;
  if (new Date(state.expiresAt) < new Date()) {
    await redis.del(key);
    return { ok: false, reason: 'expired' as const };
  }

  if (state.attempts >= MAX_OTP_ATTEMPTS) {
    await redis.del(key);
    return { ok: false, reason: 'max_attempts' as const, attemptsRemaining: 0 };
  }

  const submittedHash = sha256(otp);
  const validHashes = state.otpHashes || [state.otpHash];

  if (!validHashes.includes(submittedHash)) {
    state.attempts += 1;
    await redis.set(key, JSON.stringify(state), 'KEEPTTL');
    await redis.incr(attemptsKeyFor(purpose, normalizedIdentity));
    await prisma.otpVerification.updateMany({
      where: { identifierHash: sha256(normalizedIdentity), purpose, verified: false },
      data: { attempts: state.attempts }
    }).catch(() => undefined);
    return { ok: false, reason: 'invalid' as const, attemptsRemaining: Math.max(0, MAX_OTP_ATTEMPTS - state.attempts) };
  }

  await redis.set(key, JSON.stringify({ ...state, verified: true }), 'KEEPTTL');
  await prisma.otpVerification.updateMany({
    where: { identifierHash: sha256(normalizedIdentity), purpose, verified: false },
    data: { verified: true, verifiedAt: new Date(), attempts: state.attempts }
  }).catch(() => undefined);
  return { ok: true, reason: 'verified' as const, metadata: state.metadata };
};

export const assertOtpVerified = async (purpose: OtpPurpose, identity: string) => {
  const normalizedIdentity = normalizeIdentity(identity);

  if (!redis || !isRedisReady()) {
    throw new ApiError(503, 'OTP service is temporarily unavailable', 'OTP_REDIS_UNAVAILABLE');
  }

  const key = keyFor(purpose, normalizedIdentity);
  const raw = await redis.get(key);
  if (!raw) return { ok: false, reason: 'missing' as const };

  const state = JSON.parse(raw) as OtpState;
  if (new Date(state.expiresAt) < new Date()) {
    await redis.del(key);
    return { ok: false, reason: 'expired' as const };
  }

  return state.verified
    ? { ok: true, reason: 'verified' as const, metadata: state.metadata }
    : { ok: false, reason: 'unverified' as const };
};

export const consumeOtp = async (purpose: OtpPurpose, identity: string) => {
  const normalizedIdentity = normalizeIdentity(identity);

  if (!redis || !isRedisReady()) return;
  await redis.del(keyFor(purpose, normalizedIdentity));
  await redis.del(attemptsKeyFor(purpose, normalizedIdentity));
  await redis.del(sendCountKeyFor(purpose, normalizedIdentity));
};

export const storeEmailOtp = (email: string, otp: string) => storeOtp('registration_email', email, otp);
export const verifyEmailOtp = (email: string, otp: string) => verifyOtp('registration_email', email, otp);
export const assertEmailOtpVerified = (email: string) => assertOtpVerified('registration_email', email);
export const consumeEmailOtp = (email: string) => consumeOtp('registration_email', email);
export const generateOtpReference = () => sha256(`${Date.now()}:${Math.random()}`).slice(0, 16);
