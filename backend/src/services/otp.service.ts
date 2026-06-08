import prisma from '../config/prisma.js';
import { logger } from '../config/logger.js';
import { isRedisReady, redis } from '../config/redis.js';
import { redisKeys } from '../constants/redis-keys.js';
import { ApiError } from '../utils/ApiError.js';
import { sha256 } from '../utils/crypto.js';

export type OtpPurpose =
  | 'registration_email'
  | 'registration_mobile'
  | 'forgot_password'
  | 'two_factor_login'
  | 'ownership_submission'
  | 'buyer_profile_update'
  | 'seller_profile_update';

const OTP_TTL_SECONDS = 5 * 60;
const MAX_OTP_ATTEMPTS = 5;
const OTP_SEND_WINDOW_SECONDS = 15 * 60;
const MAX_OTP_SENDS = 5;

type OtpState = {
  id?: number;
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

export const generateOtp = () => String(Math.floor(100000 + Math.random() * 900000));

const normalizeHashList = (value: unknown, fallback: string): string[] => {
  if (Array.isArray(value)) return value.filter((item): item is string => typeof item === 'string');
  if (typeof value === 'string') {
    try {
      const parsed = JSON.parse(value);
      if (Array.isArray(parsed)) return parsed.filter((item): item is string => typeof item === 'string');
    } catch {
      return [value];
    }
  }
  return [fallback];
};

const latestDbState = async (purpose: OtpPurpose, normalizedIdentity: string): Promise<OtpState | null> => {
  try {
    const rows = await prisma.$queryRawUnsafe<Array<{
      id: number;
      otpHash: string | null;
      otpHashes: unknown;
      verified: boolean;
      attempts: number;
      expiresAt: Date;
      createdAt: Date;
      metadata: Record<string, unknown> | null;
    }>>(
      `SELECT "id", "otpHash", "otpHashes", "verified", "attempts", "expiresAt", "createdAt", "metadata"
       FROM "OtpVerification"
       WHERE "identifierHash" = $1
         AND "purpose" = $2
         AND "verified" = false
         AND "expiresAt" >= NOW()
         AND "otpHash" IS NOT NULL
       ORDER BY "createdAt" DESC
       LIMIT 1`,
      sha256(normalizedIdentity),
      purpose
    );

    const record = rows[0];
    if (!record?.otpHash) return null;

    return {
      id: record.id,
      otpHash: record.otpHash,
      otpHashes: normalizeHashList(record.otpHashes, record.otpHash),
      verified: Boolean(record.verified),
      attempts: Number(record.attempts || 0),
      createdAt: record.createdAt.toISOString(),
      expiresAt: record.expiresAt.toISOString(),
      metadata: record.metadata || undefined
    };
  } catch {
    return null;
  }
};

const latestVerifiedDbState = async (purpose: OtpPurpose, normalizedIdentity: string): Promise<OtpState | null> => {
  try {
    const rows = await prisma.$queryRawUnsafe<Array<{
      id: number;
      otpHash: string | null;
      otpHashes: unknown;
      verified: boolean;
      attempts: number;
      expiresAt: Date;
      createdAt: Date;
      metadata: Record<string, unknown> | null;
    }>>(
      `SELECT "id", "otpHash", "otpHashes", "verified", "attempts", "expiresAt", "createdAt", "metadata"
       FROM "OtpVerification"
       WHERE "identifierHash" = $1
         AND "purpose" = $2
         AND "verified" = true
         AND "expiresAt" >= NOW()
       ORDER BY "verifiedAt" DESC NULLS LAST, "createdAt" DESC
       LIMIT 1`,
      sha256(normalizedIdentity),
      purpose
    );

    const record = rows[0];
    if (!record) return null;

    return {
      id: record.id,
      otpHash: record.otpHash || '',
      otpHashes: record.otpHash ? normalizeHashList(record.otpHashes, record.otpHash) : [],
      verified: true,
      attempts: Number(record.attempts || 0),
      createdAt: record.createdAt.toISOString(),
      expiresAt: record.expiresAt.toISOString(),
      metadata: record.metadata || undefined
    };
  } catch (error) {
    logger.error({ err: error, purpose }, '[OTP] DB fallback lookup failed for verified OTP');
    return null;
  }
};

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
  }

  await prisma.otpVerification.create({
    data: {
      identifier: normalizedIdentity,
      identifierHash: sha256(normalizedIdentity),
      purpose,
      otpHash,
      otpHashes: state.otpHashes,
      metadata,
      attempts: 0,
      verified: false,
      expiresAt
    } as any
  }).catch((error) => {
    // OTP must be persisted to DB - it's the cross-instance source of truth
    // when Redis is unavailable. If this fails, verification will mysteriously
    // fail when the verify request lands on a different lambda instance.
    logger.error({ err: error, purpose }, '[OTP] Failed to persist OTP to database');
    throw new ApiError(500, 'Unable to issue verification code right now. Please try again.', 'OTP_PERSIST_FAILED');
  });

  return {
    sendsRemaining: Math.max(0, MAX_OTP_SENDS - sendCount)
  };
};

export const verifyOtp = async (purpose: OtpPurpose, identity: string, otp: string) => {
  const normalizedIdentity = normalizeIdentity(identity);
  const useRedis = redis && isRedisReady();
  const key = keyFor(purpose, normalizedIdentity);

  let state: OtpState | null = null;

  if (useRedis) {
    try {
      const raw = await redis.get(key);
      if (raw) state = JSON.parse(raw) as OtpState;
    } catch (error) {
      logger.error({ err: error, purpose }, '[OTP] Redis lookup failed during verification; falling back to DB');
    }
  } else {
    // In-memory store is per-instance only; on serverless platforms different
    // lambda instances handle send vs. verify so the map is unreliable.
    // We still consult it as an opportunistic cache before going to the DB.
    state = localOtpStore.get(key) || null;
  }

  // Authoritative fallback: persistent DB record. This is what makes verification
  // work across different serverless instances when Redis is unavailable.
  if (!state) {
    state = await latestDbState(purpose, normalizedIdentity);
  }

  if (!state) {
    logger.warn({ purpose, useRedis }, '[OTP] No active OTP state found in cache or DB');
    return { ok: false, reason: 'invalid' as const, attemptsRemaining: MAX_OTP_ATTEMPTS };
  }

  if (new Date(state.expiresAt) < new Date()) {
    if (useRedis) {
      await redis.del(key).catch(error =>
        logger.warn({ err: error }, '[OTP] Failed to clear expired Redis OTP state')
      );
    } else {
      localOtpStore.delete(key);
    }
    return { ok: false, reason: 'expired' as const };
  }

  if (state.attempts >= MAX_OTP_ATTEMPTS) {
    if (useRedis) {
      await redis.del(key).catch(error =>
        logger.warn({ err: error }, '[OTP] Failed to clear locked Redis OTP state')
      );
    } else {
      localOtpStore.delete(key);
    }
    return { ok: false, reason: 'max_attempts' as const, attemptsRemaining: 0 };
  }

  const submittedHash = sha256(otp);
  const validHashes = state.otpHashes && state.otpHashes.length > 0
    ? state.otpHashes
    : (state.otpHash ? [state.otpHash] : []);

  if (!validHashes.includes(submittedHash)) {
    state.attempts += 1;
    if (useRedis) {
      await redis.set(key, JSON.stringify(state), 'KEEPTTL').catch(error =>
        logger.warn({ err: error }, '[OTP] Failed to update Redis attempts counter')
      );
      await redis.incr(attemptsKeyFor(purpose, normalizedIdentity)).catch(() => undefined);
    } else {
      localOtpStore.set(key, state);
    }
    await prisma.otpVerification.updateMany({
      where: state.id ? { id: state.id } : { identifierHash: sha256(normalizedIdentity), purpose, verified: false },
      data: { attempts: state.attempts }
    }).catch(error => {
      logger.error({ err: error, purpose }, '[OTP] Failed to persist failed attempt counter');
    });
    return { ok: false, reason: 'invalid' as const, attemptsRemaining: Math.max(0, MAX_OTP_ATTEMPTS - state.attempts) };
  }

  state.verified = true;
  if (useRedis) {
    await redis.set(key, JSON.stringify(state), 'KEEPTTL').catch(error =>
      logger.warn({ err: error }, '[OTP] Failed to flag OTP verified in Redis')
    );
  } else {
    localOtpStore.set(key, state);
  }

  await prisma.otpVerification.updateMany({
    where: state.id ? { id: state.id } : { identifierHash: sha256(normalizedIdentity), purpose, verified: false },
    data: { verified: true, verifiedAt: new Date(), attempts: state.attempts }
  }).catch(error => {
    // This MUST succeed for assertOtpVerified() to find a verified record on
    // a different lambda instance during the subsequent /register call.
    logger.error({ err: error, purpose }, '[OTP] Failed to persist verified state to DB');
  });

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

  if (!state) {
    state = await latestVerifiedDbState(purpose, normalizedIdentity);
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
  }

  await prisma.otpVerification.updateMany({
    where: {
      identifierHash: sha256(normalizedIdentity),
      purpose,
      expiresAt: { gt: new Date() }
    },
    data: { expiresAt: new Date() }
  }).catch(() => undefined);
};

export const storeEmailOtp = (email: string, otp: string) => storeOtp('registration_email', email, otp);
export const verifyEmailOtp = (email: string, otp: string) => verifyOtp('registration_email', email, otp);
export const assertEmailOtpVerified = (email: string) => assertOtpVerified('registration_email', email);
export const consumeEmailOtp = (email: string) => consumeOtp('registration_email', email);
export const generateOtpReference = () => sha256(`${Date.now()}:${Math.random()}`).slice(0, 16);
