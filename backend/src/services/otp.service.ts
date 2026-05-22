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

// In-Memory fallback store when Redis is not ready/configured (e.g. preview environments)
const localOtpStore = new Map<string, OtpState>();
const localSendCounts = new Map<string, { count: number; expiresAt: number }>();

const normalizeIdentity = (identity: string) => identity.trim().toLowerCase();
const keyFor = (purpose: OtpPurpose, identity: string) => redisKeys.otp(purpose, identity);
const attemptsKeyFor = (purpose: OtpPurpose, identity: string) => redisKeys.otpAttempts(purpose, identity);
const sendCountKeyFor = (purpose: OtpPurpose, identity: string) => redisKeys.otpCooldown(purpose, identity);

const dbOtpIdentity = (purpose: OtpPurpose, identity: string) => `${purpose}:${identity}`;

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

  const useRedis = redis && isRedisReady();

  let sendCount = 1;
  if (useRedis) {
    const sendCountKey = sendCountKeyFor(purpose, normalizedIdentity);
    sendCount = Number(await redis.incr(sendCountKey));
    if (sendCount === 1) await redis.expire(sendCountKey, OTP_SEND_WINDOW_SECONDS);
    if (sendCount > MAX_OTP_SENDS) {
      await redis.decr(sendCountKey).catch(() => undefined);
      throw new ApiError(429, 'OTP resend limit reached. Please try again after 15 minutes.', 'OTP_RESEND_LIMIT');
    }
  } else {
    const cooldownKey = `${purpose}:${normalizedIdentity}:cooldown`;
    const nowTime = Date.now();
    const existing = localSendCounts.get(cooldownKey);
    if (existing && existing.expiresAt > nowTime) {
      sendCount = existing.count + 1;
      if (sendCount > MAX_OTP_SENDS) {
        throw new ApiError(429, 'OTP resend limit reached. Please try again after 15 minutes.', 'OTP_RESEND_LIMIT');
      }
      existing.count = sendCount;
    } else {
      localSendCounts.set(cooldownKey, { count: 1, expiresAt: nowTime + OTP_SEND_WINDOW_SECONDS * 1000 });
    }
  }

  let existingState: OtpState | null = null;
  if (useRedis) {
    const existingRaw = await redis.get(keyFor(purpose, normalizedIdentity));
    existingState = existingRaw ? JSON.parse(existingRaw) as OtpState : null;
  } else {
    existingState = localOtpStore.get(keyFor(purpose, normalizedIdentity)) || null;
  }

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

  if (useRedis) {
    await redis.set(keyFor(purpose, normalizedIdentity), JSON.stringify(state), 'EX', OTP_TTL_SECONDS);
    await redis.set(attemptsKeyFor(purpose, normalizedIdentity), '0', 'EX', OTP_TTL_SECONDS);
  } else {
    localOtpStore.set(keyFor(purpose, normalizedIdentity), state);
    await prisma.otp.create({
      data: {
        email: dbOtpIdentity(purpose, normalizedIdentity),
        otp,
        isVerified: false,
        expiresAt
      }
    }).catch(() => undefined);
  }

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
  const useRedis = redis && isRedisReady();
  const key = keyFor(purpose, normalizedIdentity);

  let raw: string | null = null;
  let state: OtpState | null = null;

  if (useRedis) {
    raw = await redis.get(key);
    if (raw) state = JSON.parse(raw) as OtpState;
  } else {
    state = localOtpStore.get(key) || null;
  }

  if (!state && !useRedis) {
    const dbRecord = await prisma.otp.findFirst({
      where: {
        email: dbOtpIdentity(purpose, normalizedIdentity),
        isVerified: false,
        expiresAt: { gte: new Date() }
      },
      orderBy: { createdAt: 'desc' }
    }).catch(() => null);

    if (dbRecord) {
      state = {
        otpHash: sha256(dbRecord.otp),
        otpHashes: [sha256(dbRecord.otp)],
        verified: false,
        attempts: 0,
        createdAt: dbRecord.createdAt.toISOString(),
        expiresAt: dbRecord.expiresAt.toISOString()
      };
      localOtpStore.set(key, state);
    }
  }

  if (!state) return { ok: false, reason: 'invalid' as const, attemptsRemaining: MAX_OTP_ATTEMPTS };

  if (new Date(state.expiresAt) < new Date()) {
    if (useRedis) {
      await redis.del(key);
    } else {
      localOtpStore.delete(key);
    }
    return { ok: false, reason: 'expired' as const };
  }

  if (state.attempts >= MAX_OTP_ATTEMPTS) {
    if (useRedis) {
      await redis.del(key);
    } else {
      localOtpStore.delete(key);
    }
    return { ok: false, reason: 'max_attempts' as const, attemptsRemaining: 0 };
  }

  const submittedHash = sha256(otp);
  const validHashes = state.otpHashes || [state.otpHash];

  if (!validHashes.includes(submittedHash)) {
    state.attempts += 1;
    if (useRedis) {
      await redis.set(key, JSON.stringify(state), 'KEEPTTL');
      await redis.incr(attemptsKeyFor(purpose, normalizedIdentity));
    } else {
      localOtpStore.set(key, state);
    }
    await prisma.otpVerification.updateMany({
      where: { identifierHash: sha256(normalizedIdentity), purpose, verified: false },
      data: { attempts: state.attempts }
    }).catch(() => undefined);
    return { ok: false, reason: 'invalid' as const, attemptsRemaining: Math.max(0, MAX_OTP_ATTEMPTS - state.attempts) };
  }

  state.verified = true;
  if (useRedis) {
    await redis.set(key, JSON.stringify(state), 'KEEPTTL');
  } else {
    localOtpStore.set(key, state);
    await prisma.otp.updateMany({
      where: {
        email: dbOtpIdentity(purpose, normalizedIdentity),
        isVerified: false,
        expiresAt: { gte: new Date() }
      },
      data: { isVerified: true }
    }).catch(() => undefined);
  }

  await prisma.otpVerification.updateMany({
    where: { identifierHash: sha256(normalizedIdentity), purpose, verified: false },
    data: { verified: true, verifiedAt: new Date(), attempts: state.attempts }
  }).catch(() => undefined);

  return { ok: true, reason: 'verified' as const, metadata: state.metadata };
};

export const assertOtpVerified = async (purpose: OtpPurpose, identity: string) => {
  const normalizedIdentity = normalizeIdentity(identity);
  const useRedis = redis && isRedisReady();
  const key = keyFor(purpose, normalizedIdentity);

  let state: OtpState | null = null;

  if (useRedis) {
    const raw = await redis.get(key);
    if (raw) state = JSON.parse(raw) as OtpState;
  } else {
    state = localOtpStore.get(key) || null;
  }

  if (!state) return { ok: false, reason: 'missing' as const };

  if (new Date(state.expiresAt) < new Date()) {
    if (useRedis) {
      await redis.del(key);
    } else {
      localOtpStore.delete(key);
    }
    return { ok: false, reason: 'expired' as const };
  }

  return state.verified
    ? { ok: true, reason: 'verified' as const, metadata: state.metadata }
    : { ok: false, reason: 'unverified' as const };
};

export const consumeOtp = async (purpose: OtpPurpose, identity: string) => {
  const normalizedIdentity = normalizeIdentity(identity);
  const useRedis = redis && isRedisReady();

  if (useRedis) {
    await redis.del(keyFor(purpose, normalizedIdentity));
    await redis.del(attemptsKeyFor(purpose, normalizedIdentity));
    await redis.del(sendCountKeyFor(purpose, normalizedIdentity));
  } else {
    localOtpStore.delete(keyFor(purpose, normalizedIdentity));
    localSendCounts.delete(`${purpose}:${normalizedIdentity}:cooldown`);
    await prisma.otp.deleteMany({
      where: { email: dbOtpIdentity(purpose, normalizedIdentity) }
    }).catch(() => undefined);
  }
};

export const storeEmailOtp = (email: string, otp: string) => storeOtp('registration_email', email, otp);
export const verifyEmailOtp = (email: string, otp: string) => verifyOtp('registration_email', email, otp);
export const assertEmailOtpVerified = (email: string) => assertOtpVerified('registration_email', email);
export const consumeEmailOtp = (email: string) => consumeOtp('registration_email', email);
export const generateOtpReference = () => sha256(`${Date.now()}:${Math.random()}`).slice(0, 16);
