import { env } from './src/config/env.js';
import https from 'https';
import { pathToFileURL } from 'url';

import type { Response } from 'express';
import { z } from 'zod';

// Import Prisma Client
import prisma from './src/lib/prisma.js';
import { Role, RegistrationStatus } from '@prisma/client';
import { authenticate, authorize, authorizeAdmin } from './src/middleware/auth.js';
import type { AuthRequest } from './src/middleware/auth.js';
import nodemailer from 'nodemailer';
import { createApp } from './src/app.js';
import { logger } from './src/config/logger.js';
import { connectRedis, isRedisReady, redis } from './src/config/redis.js';
import { configureCloudinary } from './src/config/cloudinary.js';
import { upload } from './src/config/storage.js';
import { errorHandler } from './src/middleware/errorHandler.js';
import { checkOwnership } from './src/middleware/ownership.js';
import {
  authLoginRateLimit,
  catalogueSearchRateLimit,
  forgotPasswordRateLimit,
  otpSendRateLimit,
  paymentRateLimit,
  uploadRateLimit,
  verificationRateLimit
} from './src/middleware/rateLimit.js';
import { auditLog } from './src/modules/audit/audit.service.js';
import { createComplianceFlag, flagDuplicateBankAccount, flagDuplicateSellerIdentifiers, markUserForManualReview } from './src/modules/compliance/compliance.service.js';
import { recordLoginEvent } from './src/modules/auth/login-event.service.js';
import { assertEmailOtpVerified, consumeEmailOtp, consumeOtp, generateOtp, storeEmailOtp, storeOtp, verifyEmailOtp, verifyOtp } from './src/services/otp.service.js';
import { sendOtpEmail } from './src/services/mail.service.js';
import { notificationService } from './src/services/notification.service.js';
import { GstService } from './src/services/gstService.js';
import { hashPassword, validatePasswordStrength, verifyPassword } from './src/services/password.service.js';
import { issueAuthResponse, signAccessToken, verifyAccessToken, verifyRefreshToken } from './src/services/token.service.js';
import {
  deleteFile as deleteStoredFile,
  getFileContent as getStoredFileContent,
  getSignedUrl as getStoredFileSignedUrl,
  uploadFile as uploadStoredFile
} from './src/services/storage/storage.service.js';
import {
  acceptBidAndGeneratePurchaseOrder,
  acceptInspectionAndEnableInvoice,
  acceptPurchaseOrderAndCreateDelivery,
  approveInvoiceAndCreatePayment,
  submitInvoiceForPurchaseOrder
} from './src/services/financial-workflow.service.js';
import { idempotencyKeyFromRequest, withIdempotency } from './src/services/idempotency.service.js';
import paymentRoutes from './src/modules/payments/payment.routes.js';
import {
  approveMilestone,
  completeMilestone,
  createMilestone,
  freezeEscrow,
  listEscrowAccounts,
  refundEscrow
} from './src/modules/payments/payment.service.js';
import { createMilestoneSchema, milestoneReasonSchema } from './src/modules/payments/payment.validation.js';
import { createHashFingerprint, randomToken, sha256 } from './src/utils/crypto.js';
import { ApiError } from './src/utils/ApiError.js';
import { STRICT_VERIFICATION } from './src/config/verification.js';
import { maskAadhaar, maskBankAccount, maskGST, maskPAN, maskSensitive, maskValue } from './src/utils/maskSensitive.js';
import { redisKeys } from './src/constants/redis-keys.js';

// Cloudinary Configuration
if (configureCloudinary()) {
  logger.info('Cloudinary configured successfully');
}

logger.info({ apiSetuConfigured: Boolean(env.APISETU_API_KEY) }, 'Backend environment loaded');

const serverlessApp = createApp();

export default serverlessApp;

// Nodemailer Transporter
const transporter = nodemailer.createTransport({
  host: env.SMTP_HOST,
  port: env.SMTP_PORT,
  secure: false,
  auth: {
    user: env.SMTP_USER,
    pass: env.SMTP_PASS,
  },
  tls: {
    rejectUnauthorized: false
  },
  connectionTimeout: 10000, // 10 seconds
  greetingTimeout: 10000,
});

const app = serverlessApp;

app.use('/api/utils/gst-verify', verificationRateLimit);
app.use('/api/gst', verificationRateLimit);
app.use('/api/pan', verificationRateLimit);
app.use('/api/udyam', verificationRateLimit);
app.use('/api/bank', verificationRateLimit);
app.use('/api/upload', uploadRateLimit);
app.use('/api/files', uploadRateLimit);
app.use('/api/payments', paymentRateLimit);
app.use('/api/catalogue/search', catalogueSearchRateLimit);
app.use('/api/catalog/search', catalogueSearchRateLimit);
app.use('/api', (req, res, next) => {
  const writeMethods = new Set(['POST', 'PUT', 'PATCH', 'DELETE']);
  if (!writeMethods.has(req.method)) return next();

  res.on('finish', () => {
    if (res.statusCode < 400) {
      void auditLog({
        actorUserId: req.user?.id,
        actorRole: req.user?.role,
        action: 'api.write.completed',
        entityType: req.path.split('/').filter(Boolean)[0] || 'api',
        ipAddress: req.ip,
        userAgent: req.headers['user-agent'],
        metadata: maskSensitive({
          method: req.method,
          path: req.originalUrl,
          params: req.params,
          query: req.query,
          statusCode: res.statusCode
        })
      });
    }
  });

  return next();
});

const ensureOnboardingEditable = async (
  userId: number
): Promise<{ editable: boolean; status?: number; message?: string }> => {
  // Force unlock for all statuses as requested by USER
  return { editable: true };
};

const normalizeSpaces = (value: unknown) => String(value || '').replace(/\s+/g, ' ').trim();
const normalizeStringList = (value: unknown) =>
  Array.isArray(value)
    ? value.map(item => normalizeSpaces(item)).filter(Boolean)
    : [];
const onboardingPatterns = {
  pan: /^[A-Z]{3}[ABCFGHLJPT][A-Z]\d{4}[A-Z]$/,
  gst: /^\d{2}[A-Z]{5}\d{4}[A-Z][1-9A-Z]Z[0-9A-Z]$/,
  mobile: /^[6-9]\d{9}$/,
  pincode: /^[1-9]\d{5}$/,
  ifsc: /^[A-Z]{4}0[A-Z0-9]{6}$/,
  bankAccount: /^\d{9,18}$/,
  name: /^[A-Za-z][A-Za-z .'-]{1,99}$/,
  orgName: /^[A-Za-z0-9 .,&()/-]{2,160}$/
};
const isPastOrToday = (value: unknown) => {
  const parsed = value ? new Date(String(value)) : null;
  if (!parsed || Number.isNaN(parsed.getTime())) return false;
  const today = new Date();
  today.setHours(23, 59, 59, 999);
  return parsed <= today;
};
const validateSellerOnboardingPayload = (rawData: any) => {
  const errors: Record<string, string> = {};
  const pan = normalizeSpaces(rawData.pan).toUpperCase();
  if (!onboardingPatterns.pan.test(pan)) errors.pan = 'Business PAN must follow valid government PAN format, e.g. ABCDE1234F.';
  if (!onboardingPatterns.name.test(normalizeSpaces(rawData.nameAsInPan))) errors.nameAsInPan = 'Name as per PAN is required and must contain valid name characters.';
  if (rawData.dateAsInPan && !isPastOrToday(rawData.dateAsInPan)) errors.dateAsInPan = 'PAN date cannot be invalid or future dated.';
  if (!onboardingPatterns.orgName.test(normalizeSpaces(rawData.businessName))) errors.businessName = 'Business / organisation name is required and contains invalid characters.';
  if (rawData.dateOfIncorporation && !isPastOrToday(rawData.dateOfIncorporation)) errors.dateOfIncorporation = 'Date of incorporation cannot be invalid or future dated.';
  if (rawData.turnoverMax3Yrs && !/^[A-Za-z0-9 .,/()-]{1,80}$/.test(normalizeSpaces(rawData.turnoverMax3Yrs))) {
    errors.turnoverMax3Yrs = 'Turnover declaration contains invalid characters.';
  }
  return errors;
};
const validateBuyerOnboardingPayload = (rawData: any, mobile: unknown) => {
  const errors: Record<string, string> = {};
  if (!onboardingPatterns.orgName.test(normalizeSpaces(rawData.organizationName))) errors.organizationName = 'Organization name is required and contains invalid characters.';
  if (!normalizeSpaces(rawData.businessType)) errors.businessType = 'Business type is required.';
  if (!normalizeSpaces(rawData.industry)) errors.industry = 'Industry / sector is required.';
  if (rawData.pan && !onboardingPatterns.pan.test(normalizeSpaces(rawData.pan).toUpperCase())) errors.pan = 'PAN must follow valid government PAN format.';
  if (rawData.gst && !onboardingPatterns.gst.test(normalizeSpaces(rawData.gst).toUpperCase())) errors.gst = 'GSTIN must follow valid 15 character format.';
  if (!normalizeSpaces(rawData.country)) errors.country = 'Country is required.';
  if (!normalizeSpaces(rawData.state)) errors.state = 'State is required.';
  if (!normalizeSpaces(rawData.city)) errors.city = 'City is required.';
  if (!onboardingPatterns.pincode.test(normalizeSpaces(rawData.pincode))) errors.pincode = 'PIN code must be a valid 6 digit Indian PIN.';
  if (normalizeSpaces(rawData.registeredAddress).length < 10) errors.registeredAddress = 'Registered office address must be complete.';
  if (!onboardingPatterns.name.test(normalizeSpaces(rawData.representativeName))) errors.representativeName = 'Authorized representative name is required and must be valid.';
  if (!normalizeSpaces(rawData.designation)) errors.designation = 'Designation is required.';
  if (!normalizeSpaces(rawData.department)) errors.department = 'Department is required.';
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(normalizeSpaces(rawData.email || ''))) errors.email = 'Representative email must be valid.';
  if (!onboardingPatterns.mobile.test(normalizeSpaces(mobile))) errors.mobile = 'Mobile number must be a valid 10 digit Indian mobile number.';
  if (rawData.alternateMobile && !onboardingPatterns.mobile.test(normalizeSpaces(rawData.alternateMobile))) errors.alternateMobile = 'Alternate mobile number must be valid.';
  if (!Array.isArray(rawData.procurementCategories) || rawData.procurementCategories.length === 0) errors.procurementCategories = 'Select at least one procurement category.';
  if (!normalizeSpaces(rawData.annualBudget)) errors.annualBudget = 'Annual budget range is required.';
  if (!Array.isArray(rawData.preferredMethods) || rawData.preferredMethods.length === 0) errors.preferredMethods = 'Select at least one procurement method.';
  const documents = rawData.documents && typeof rawData.documents === 'object' ? rawData.documents : {};
  const hasDocument = (document: any) => Array.isArray(document) ? document.length > 0 : Boolean(document);
  ['panCard', 'regCert', 'addressProof'].forEach((docKey) => {
    if (!hasDocument(documents[docKey])) errors[`documents.${docKey}`] = 'Mandatory buyer document is required.';
  });
  if (rawData.gst && !hasDocument(documents.gstCert)) errors['documents.gstCert'] = 'GST certificate is required when GSTIN is provided.';
  if (!rawData.declaration || !rawData.agreeTerms) errors.declaration = 'Declarations and terms must be accepted.';
  return errors;
};
const notificationClients = new Map<number, Set<Response>>();
const localActionBudget = new Map<string, { count: number; resetAt: number }>();

const emitNotification = (userId: number, notification: any) => {
  const clients = notificationClients.get(userId);
  if (!clients) return;
  for (const client of clients) {
    if (client.destroyed || client.writableEnded) {
      clients.delete(client);
      continue;
    }
    try {
      client.write('event: notification\n');
      client.write(`data: ${JSON.stringify(notification)}\n\n`);
    } catch {
      clients.delete(client);
    }
  }
  if (clients.size === 0) notificationClients.delete(userId);
};

const sanitizePortalText = (value: unknown, maxLength = 2000) =>
  normalizeSpaces(value)
    .replace(/[\u0000-\u001F\u007F]/g, '')
    .replace(/[<>]/g, '')
    .slice(0, maxLength);

const NOTIFICATION_READ_RETENTION_MS = 24 * 60 * 60 * 1000;

const archiveExpiredReadNotifications = async (targetUserId: number) => {
  const cutoff = new Date(Date.now() - NOTIFICATION_READ_RETENTION_MS);
  await prisma.notification.updateMany({
    where: {
      userId: targetUserId,
      isRead: true,
      isArchived: false,
      logs: {
        some: {
          action: 'notification.read',
          createdAt: { lte: cutoff }
        }
      }
    },
    data: { isArchived: true }
  }).catch(() => undefined);
};

const recordNotificationRead = async (targetUserId: number, notificationIds: number[]) => {
  const ids = Array.from(new Set(notificationIds.filter(id => Number.isInteger(id) && id > 0)));
  if (ids.length === 0) return;
  await prisma.notificationLog.createMany({
    data: ids.map(notificationId => ({
      notificationId,
      userId: targetUserId,
      action: 'notification.read',
      channel: 'SYSTEM',
      recipient: String(targetUserId),
      status: 'READ',
      sentAt: new Date()
    }))
  }).catch(() => undefined);
};

const createNotificationSafe = async (payload: {
  userId: number;
  title: string;
  message: string;
  type: string;
  priority?: 'low' | 'medium' | 'high' | 'urgent';
  redirectUrl?: string;
}) => {
  try {
    const notification = await notificationService.notifyWithEmail(payload.userId, {
      title: sanitizePortalText(payload.title, 120),
      message: sanitizePortalText(maskSensitive(payload.message), 500),
      type: sanitizePortalText(payload.type, 80),
      priority: payload.priority || 'medium',
      redirectUrl: payload.redirectUrl || '/dashboard'
    });
    if (notification) emitNotification(payload.userId, notification);
    return notification;
  } catch (err) {
    console.error('[Notification] Failed to create notification:', err);
    return null;
  }
};

const toSafeUser = (user: any) => {
  const { password, ...safeUser } = user;
  return maskSensitive({ ...safeUser, _id: user.id });
};

const sensitiveProfileFields = (payload: {
  pan?: unknown;
  gst?: unknown;
  gstNumber?: unknown;
  aadhaarNumber?: unknown;
  accountNumber?: unknown;
  ifsc?: unknown;
}) => ({
  panMasked: payload.pan ? maskPAN(payload.pan) : undefined,
  panFingerprint: payload.pan ? createHashFingerprint(payload.pan, 'pan') : undefined,
  gstMasked: payload.gst || payload.gstNumber ? maskGST(payload.gst || payload.gstNumber) : undefined,
  gstFingerprint: payload.gst || payload.gstNumber ? createHashFingerprint(payload.gst || payload.gstNumber, 'gst') : undefined,
  aadhaarMasked: payload.aadhaarNumber ? maskAadhaar(payload.aadhaarNumber) : undefined,
  aadhaarHash: payload.aadhaarNumber ? createHashFingerprint(payload.aadhaarNumber, 'aadhaar') : undefined,
  aadhaarFingerprint: payload.aadhaarNumber ? createHashFingerprint(payload.aadhaarNumber, 'aadhaar') : undefined,
  accountNumberMasked: payload.accountNumber ? maskBankAccount(payload.accountNumber) : undefined,
  accountNumberHash: payload.ifsc && payload.accountNumber
    ? createHashFingerprint(`${payload.ifsc}:${payload.accountNumber}`, 'bank')
    : undefined,
  bankFingerprint: payload.ifsc && payload.accountNumber
    ? createHashFingerprint(`${payload.ifsc}:${payload.accountNumber}`, 'bank')
    : undefined
});

const financialActor = (req: AuthRequest) => ({
  id: Number(req.user?.id),
  role: String(req.user?.role),
  ipAddress: req.ip,
  userAgent: req.headers['user-agent']
});

const allowedFileEntityTypes = new Set([
  'onboarding',
  'tender',
  'bid',
  'quote',
  'contract',
  'delivery',
  'inspection',
  'invoice',
  'dispute',
  'grievance',
  'message',
  'catalogue',
  'catalogue_product',
  'catalogue_service',
  'general'
]);

const normalizeFileEntityType = (value: unknown) => {
  const entityType = normalizeSpaces(value || 'general').toLowerCase().replace(/[^a-z0-9_-]/g, '_') || 'general';
  const normalized = entityType === 'quotation' || entityType === 'quotations' ? 'quote' : entityType;
  if (!allowedFileEntityTypes.has(normalized)) {
    throw new ApiError(400, 'Unsupported file entity type', 'FILE_ENTITY_TYPE_INVALID');
  }
  return normalized;
};

const buildFileUploadContext = (req: AuthRequest) => {
  if (!req.user) throw new ApiError(401, 'Authentication required', 'AUTH_REQUIRED');
  const entityType = normalizeFileEntityType(req.body?.entityType || req.query?.entityType);
  const rawEntityId = req.body?.entityId || req.query?.entityId;
  const entityId = rawEntityId === undefined || rawEntityId === null || rawEntityId === ''
    ? null
    : Number(rawEntityId);

  if (entityId !== null && (!Number.isInteger(entityId) || entityId <= 0)) {
    throw new ApiError(400, 'Invalid file entity id', 'FILE_ENTITY_ID_INVALID');
  }

  return {
    ownerId: req.user.id,
    ownerRole: req.user.role,
    entityType,
    entityId,
    purpose: normalizeSpaces(req.body?.purpose || req.query?.purpose),
    ipAddress: req.ip,
    userAgent: req.headers['user-agent']
  };
};

const canAttachFileToEntity = async (
  context: ReturnType<typeof buildFileUploadContext>,
  user: NonNullable<AuthRequest['user']>
) => {
  if (user.role === 'admin') return true;
  if (!context.entityId) return true;
  if (context.entityType === 'onboarding' || context.entityType === 'general') return context.entityId === user.id;
  if (context.entityType === 'tender') return checkOwnership('tender', context.entityId, user);
  if (context.entityType === 'bid') return checkOwnership('bid', context.entityId, user);
  if (context.entityType === 'quote') return checkOwnership('quote', context.entityId, user);

  return context.ownerId === user.id;
};

const toFileResponse = (asset: any) => ({
  id: asset.id,
  entityType: asset.entityType,
  entityId: asset.entityId,
  storageProvider: asset.storageProvider,
  mimeType: asset.mimeType,
  size: asset.size,
  originalName: asset.originalName,
  status: asset.status,
  createdAt: asset.createdAt
});

const handleUploadRouteError = (res: any, err: any) => {
  const statusCode = err?.statusCode || 500;
  const message = statusCode >= 500 ? 'Upload failed' : err.message;
  return res.status(statusCode).json({
    success: false,
    message,
    code: err?.code || 'FILE_UPLOAD_FAILED'
  });
};

const isDatabaseUnavailableError = (err: any) => {
  const message = String(err?.message || '');
  return err?.code === 'P1001' || message.includes("Can't reach database server");
};

const routeStatusCode = (err: any) => isDatabaseUnavailableError(err) ? 503 : err?.statusCode || 500;
const routeErrorCode = (err: any, fallbackCode: string) => isDatabaseUnavailableError(err) ? 'DATABASE_UNAVAILABLE' : err?.code || fallbackCode;

const handleFinancialRouteError = (res: any, err: any) => {
  const statusCode = routeStatusCode(err);
  return res.status(statusCode).json({
    success: false,
    message: statusCode >= 500 ? safeRouteMessage(err, 'Unable to complete financial operation') : err.message,
    code: routeErrorCode(err, 'FINANCIAL_OPERATION_FAILED')
  });
};

const safeRouteMessage = (err: any, fallback = 'Unable to complete request') => {
  const statusCode = err?.statusCode || 500;
  if (statusCode < 500) return err?.message || fallback;

  const message = String(err?.message || '');
  if (isDatabaseUnavailableError(err)) {
    return 'Database is temporarily unavailable. Please try again in a few minutes.';
  }
  if (
    ['P2021', 'P2022', 'P2023', 'P2025'].includes(String(err?.code || '')) ||
    message.includes('does not exist') ||
    message.includes('Unknown field') ||
    message.includes('relation') ||
    message.includes('column')
  ) {
    return 'Database schema is not up to date. Run Prisma migrations and redeploy the backend.';
  }
  if (message.includes('Invalid `prisma.') || message.includes('PrismaClient')) {
    return fallback;
  }
  return fallback;
};

const prismaUniqueMessage = (err: any) => {
  if (err?.code !== 'P2002') return null;
  const target = Array.isArray(err?.meta?.target)
    ? err.meta.target.join(', ')
    : String(err?.meta?.target || '');
  if (/panFingerprint|pan/i.test(target)) {
    return 'PAN is already associated with another seller account.';
  }
  if (/email/i.test(target)) return 'Email address already in use. Please use unique details.';
  if (/mobile/i.test(target)) return 'Mobile number already in use. Please use unique details.';
  return 'This record already exists. Please use unique details.';
};

const handleSecureRouteError = (res: any, err: any, fallback = 'Unable to complete request') => {
  const uniqueMessage = prismaUniqueMessage(err);
  const statusCode = uniqueMessage ? 409 : routeStatusCode(err);
  return res.status(statusCode).json({
    success: false,
    message: uniqueMessage || safeRouteMessage(err, fallback),
    code: uniqueMessage ? err?.code || 'REQUEST_FAILED' : routeErrorCode(err, 'REQUEST_FAILED')
  });
};

const withRedisLock = async <T,>(key: string, ttlMs: number, handler: () => Promise<T>) => {
  if (!redis || !isRedisReady()) {
    throw new ApiError(503, 'Critical operation lock service is unavailable. Please retry shortly.', 'REDIS_LOCK_UNAVAILABLE');
  }

  const lockKey = key;
  const token = randomToken(16);
  const acquired = await (redis as any).set(lockKey, token, 'PX', ttlMs, 'NX');
  if (acquired !== 'OK') {
    throw new ApiError(409, 'Another operation is already in progress. Please retry.', 'LOCK_CONFLICT');
  }

  try {
    return await handler();
  } finally {
    await redis.eval(
      "if redis.call('get', KEYS[1]) == ARGV[1] then return redis.call('del', KEYS[1]) else return 0 end",
      1,
      lockKey,
      token
    ).catch(error => console.warn('[RedisLock] Failed to release lock:', error));
  }
};

const consumeActionBudget = async (req: AuthRequest, scope: string, limit: number, windowSeconds: number) => {
  const userPart = req.user?.id ? `u:${req.user.id}` : `ip:${req.ip}`;
  const key = redisKeys.actionBudget(scope, userPart);
  if (redis && isRedisReady()) {
    const count = await redis.incr(key);
    if (count === 1) await redis.expire(key, windowSeconds);
    if (count > limit) {
      await auditLog({
        actorUserId: req.user?.id,
        actorRole: req.user?.role,
        action: 'security.spam_attempt',
        entityType: scope,
        ipAddress: req.ip,
        userAgent: req.headers['user-agent'],
        metadata: { limit, windowSeconds }
      });
      throw new ApiError(429, 'Too many requests. Please slow down and try again.', 'SPAM_RATE_LIMITED');
    }
    return;
  }

  const now = Date.now();
  const current = localActionBudget.get(key);
  if (!current || current.resetAt <= now) {
    localActionBudget.set(key, { count: 1, resetAt: now + windowSeconds * 1000 });
    return;
  }
  current.count += 1;
  if (current.count > limit) {
    throw new ApiError(429, 'Too many requests. Please slow down and try again.', 'SPAM_RATE_LIMITED');
  }
};


const notifyAdminsOfApplication = async (applicant: any, organizationName: string, applicationType: 'buyer' | 'seller') => {
  try {
    const timestamp = new Date().toLocaleString('en-IN');
    await notificationService.notifyAdminsWithEmail({
      title: `${applicationType === 'buyer' ? 'Buyer' : 'Seller'} application submitted`,
      message: `${applicant.name} (${organizationName || 'Organization not provided'}) submitted a ${applicationType} application for review on ${timestamp}. Status: Under compliance review.`,
      type: `${applicationType}_application_submitted`,
      priority: 'high',
      redirectUrl: `/admin/onboarding`
    });
  } catch (err) {
    console.error('[Notification] Failed to notify admins:', err);
  }
};

const profileOrganizationName = (user: any) =>
  normalizeSpaces(
    user?.sellerProfile?.businessName ||
    user?.buyerProfile?.organizationName ||
    user?.name ||
    'Organization not provided'
  );

const applicationTypeLabel = (role: unknown) => String(role) === 'seller' ? 'Seller' : 'Buyer';

const sectionLabel = (role: unknown, section: string) => {
  const buyerLabels: Record<string, string> = {
    org: 'Organisation Details',
    rep: 'Authorized Representative',
    address: 'Address Details',
    procurement: 'Procurement Profile',
    docs: 'Documents'
  };
  const sellerLabels: Record<string, string> = {
    pan: 'Business PAN Validation',
    details: 'Business Details',
    additional: 'Additional Details',
    offices: 'Office Locations',
    bank: 'Bank Accounts',
    einvoicing: 'E-Invoicing',
    ownership: 'Beneficial Ownership',
    documents: 'Documents Upload'
  };
  return String(role) === 'buyer' ? (buyerLabels[section] || section) : (sellerLabels[section] || section);
};

const statusMessage = (status: string, reason?: string) => {
  if (status === 'approved_for_procurement') return 'Your application has been approved for procurement access.';
  if (status === 'rejected') return `Your application has been rejected.${reason ? ` Reason: ${reason}` : ''}`;
  if (status === 'resubmission_required') return `Changes are required before approval.${reason ? ` Details: ${reason}` : ''}`;
  if (status === 'manual_review_required') return 'Your application requires manual compliance review.';
  if (status === 'under_compliance_review') return 'Your application is under compliance review.';
  return `Your application status has been updated to ${status}.`;
};

const positiveNumber = z.coerce.number().finite().positive();
const optionalCleanUrl = z.preprocess(value => {
  if (value === undefined || value === null || value === '') return undefined;
  return String(value).trim();
}, z.string().url().max(2000).optional());

const tenderCreateSchema = z.object({
  title: z.string().trim().min(3).max(160),
  category: z.string().trim().min(2).max(80),
  budget: positiveNumber.max(1_000_000_000),
  description: z.string().trim().min(10).max(5000),
  documentUrl: optionalCleanUrl,
  closesAt: z.coerce.date().optional()
});

const tenderEditSchema = tenderCreateSchema.partial().refine(value => Object.keys(value).length > 0, {
  message: 'At least one tender field is required'
});

const tenderStatusSchema = z.object({
  status: z.enum([
    'draft',
    'approved',
    'published',
    'bid_submission',
    'tech_bid_opening',
    'tech_evaluation',
    'financial_bid_opening',
    'financial_opening',
    'financial_evaluation',
    'awarded',
    'po_generated',
    'closed'
  ]),
  overrideReason: z.string().trim().min(10).max(500).optional()
});

const bidSchema = z.object({
  unitPrice: positiveNumber.max(1_000_000_000),
  quantity: z.coerce.number().int().positive().max(10_000_000),
  deliveryDays: z.coerce.number().int().positive().max(3650),
  warranty: z.string().trim().max(500).optional().nullable(),
  validTill: z.coerce.date().optional().nullable(),
  note: z.string().trim().max(2000).optional().nullable(),
  documentUrl: optionalCleanUrl,
  fileAssetId: z.coerce.number().int().positive().optional().nullable()
});

const auctionCreateSchema = z.object({
  tenderId: z.coerce.number().int().positive(),
  startPrice: positiveNumber.max(1_000_000_000),
  minDecrement: positiveNumber.max(1_000_000).default(1),
  startTime: z.coerce.date(),
  endTime: z.coerce.date()
}).refine(value => value.endTime > value.startTime, {
  message: 'Auction end time must be after start time',
  path: ['endTime']
});

const auctionBidSchema = z.object({
  bidAmount: positiveNumber.max(1_000_000_000),
  deviceHash: z.string().trim().max(128).optional()
});

const adminOverrideSchema = z.object({
  status: z.enum(['scheduled', 'active', 'frozen', 'cancelled', 'finalized']),
  reason: z.string().trim().min(10).max(500)
});

const idArraySchema = z.array(z.coerce.number().int().positive()).max(5).default([]);
const conversationCreateSchema = z.object({
  tenderId: z.coerce.number().int().positive().optional(),
  buyerId: z.coerce.number().int().positive().optional(),
  sellerId: z.coerce.number().int().positive().optional(),
  subject: z.string().trim().min(3).max(160),
  initialMessage: z.string().trim().max(2000).optional(),
  fileAssetIds: idArraySchema.optional()
});
const messageCreateSchema = z.object({
  content: z.string().trim().min(1).max(2000),
  fileAssetIds: idArraySchema.optional()
});
const disputeCreateSchema = z.object({
  purchaseOrderId: z.coerce.number().int().positive().optional(),
  paymentTransactionId: z.coerce.number().int().positive().optional(),
  escrowAccountId: z.coerce.number().int().positive().optional(),
  counterpartyId: z.coerce.number().int().positive().optional(),
  category: z.string().trim().min(3).max(80),
  reason: z.string().trim().min(10).max(4000),
  evidenceFileIds: idArraySchema.optional()
}).refine(value => Boolean(value.purchaseOrderId || value.paymentTransactionId || value.escrowAccountId || value.counterpartyId), {
  message: 'A related transaction or counterparty is required'
});
const disputeMessageSchema = z.object({
  content: z.string().trim().min(1).max(3000),
  internal: z.boolean().optional(),
  evidenceFileIds: idArraySchema.optional()
});
const disputeStatusSchema = z.object({
  status: z.enum(['open', 'under_review', 'frozen', 'resolved', 'rejected', 'closed']),
  remarks: z.string().trim().min(10).max(1000).optional()
});
const grievanceCreateSchema = z.object({
  category: z.string().trim().min(3).max(80),
  subject: z.string().trim().min(5).max(160),
  description: z.string().trim().min(10).max(4000),
  priority: z.enum(['low', 'normal', 'high', 'urgent']).default('normal'),
  fileAssetIds: idArraySchema.optional()
});
const grievanceCommentSchema = z.object({
  content: z.string().trim().min(1).max(3000),
  internal: z.boolean().optional(),
  fileAssetIds: idArraySchema.optional()
});
const grievanceAssignSchema = z.object({
  assignedAdminId: z.coerce.number().int().positive(),
  remarks: z.string().trim().min(5).max(500).optional()
});
const grievanceStatusSchema = z.object({
  status: z.enum(['open', 'assigned', 'in_progress', 'waiting_on_user', 'resolved', 'closed', 'rejected']),
  remarks: z.string().trim().min(10).max(1000).optional()
});

const parseSchema = <T,>(schema: z.ZodType<T>, payload: unknown) => {
  const parsed = schema.safeParse(payload);
  if (!parsed.success) {
    throw new ApiError(400, 'Invalid request payload', 'VALIDATION_FAILED', parsed.error.flatten());
  }
  return parsed.data;
};

const bidOpenStatuses = new Set([
  'financial_bid_opening',
  'financial_opening',
  'financial_evaluation',
  'awarded',
  'po_generated',
  'closed'
]);
const bidSubmissionStatuses = new Set(['published', 'bid_submission']);
const terminalTenderStatuses = new Set(['awarded', 'po_generated', 'closed']);
const validTenderStatuses = new Set([
  'draft',
  'approved',
  'published',
  'bid_submission',
  'tech_bid_opening',
  'tech_evaluation',
  'financial_bid_opening',
  'financial_opening',
  'financial_evaluation',
  'awarded',
  'po_generated',
  'closed'
]);
const buyerTenderTransitions: Record<string, string[]> = {
  draft: ['published'],
  approved: ['published'],
  published: ['bid_submission', 'closed'],
  bid_submission: ['tech_bid_opening', 'closed'],
  tech_bid_opening: ['tech_evaluation', 'closed'],
  tech_evaluation: ['financial_bid_opening', 'financial_opening', 'closed'],
  financial_bid_opening: ['financial_opening', 'financial_evaluation', 'closed'],
  financial_opening: ['financial_evaluation', 'closed'],
  financial_evaluation: ['awarded', 'closed']
};

const isTenderDeadlineActive = (tender: { closesAt?: Date | null }) =>
  !tender.closesAt || tender.closesAt.getTime() > Date.now();

const assertTenderOpenForBid = (tender: any) => {
  if (!bidSubmissionStatuses.has(String(tender.status))) {
    throw new ApiError(409, 'Tender is not accepting bids', 'TENDER_NOT_OPEN');
  }
  if (!isTenderDeadlineActive(tender)) {
    throw new ApiError(409, 'Tender bid deadline has passed', 'TENDER_DEADLINE_CLOSED');
  }
};

const canBuyerViewBidDetails = (tender: any, user: NonNullable<AuthRequest['user']>) =>
  user.role === 'admin' || (user.role === 'buyer' && tender.buyerId === Number(user.id) && bidOpenStatuses.has(String(tender.status)));

const toBidResponse = (bid: any, user: NonNullable<AuthRequest['user']>) => {
  if (user.role === 'admin') return maskSensitive(bid);
  if (user.role === 'seller' && bid.sellerId === Number(user.id)) return maskSensitive(bid);
  if (user.role === 'buyer' && bid.tender?.buyerId === Number(user.id) && bidOpenStatuses.has(String(bid.tender.status))) {
    return maskSensitive(bid);
  }

  return maskSensitive({
    id: bid.id,
    tenderId: bid.tenderId,
    sellerId: bid.sellerId,
    status: bid.status,
    createdAt: bid.createdAt,
    updatedAt: bid.updatedAt,
    isRestricted: true,
    seller: bid.seller ? {
      id: bid.seller.id,
      name: bid.seller.name,
      sellerProfile: bid.seller.sellerProfile ? {
        businessName: bid.seller.sellerProfile.businessName,
        organizationType: bid.seller.sellerProfile.organizationType
      } : undefined
    } : undefined
  });
};

const attachBidFileAssets = async (bids: any[]) => {
  const rows = Array.isArray(bids) ? bids : [];
  const missing = rows.filter(bid => bid?.documentUrl && !bid?.fileAssetId);
  if (missing.length === 0) return rows;

  const ownerIds = Array.from(new Set(missing.map(bid => Number(bid.sellerId)).filter(Boolean)));
  const assets = await prisma.fileAsset.findMany({
    where: { ownerId: { in: ownerIds }, status: 'active' },
    select: { id: true, ownerId: true, key: true, url: true }
  });

  const matched = rows.map(bid => {
    if (!bid?.documentUrl || bid.fileAssetId) return bid;
    const decodedUrl = (() => {
      try {
        return decodeURIComponent(String(bid.documentUrl));
      } catch {
        return String(bid.documentUrl);
      }
    })();
    const asset = assets.find(file =>
      file.ownerId === bid.sellerId &&
      (file.url === bid.documentUrl || decodedUrl.includes(file.key))
    );
    return asset ? { ...bid, fileAssetId: asset.id } : bid;
  });

  await Promise.all(matched
    .filter(bid => bid.fileAssetId && missing.some(item => item.id === bid.id))
    .map(bid => prisma.fileAsset.updateMany({
      where: { id: bid.fileAssetId, ownerId: bid.sellerId, status: 'active' },
      data: { entityType: 'bid', entityId: bid.id }
    })));

  return matched;
};

const requestDeviceHash = (req: AuthRequest) =>
  normalizeSpaces(req.headers['x-device-hash'] || req.headers['x-client-device'] || '');

const flagSuspiciousBidPatterns = async (payload: {
  tender: any;
  bid: any;
  sellerId: number;
  ipAddress?: string;
  deviceHash?: string;
  action: 'submitted' | 'modified' | 'withdrawn' | 'auction_bid';
}) => {
  try {
    const flags: Array<Parameters<typeof createComplianceFlag>[0]> = [];
    const bidValue = Number(payload.bid.unitPrice || payload.bid.bidAmount || 0) * Number(payload.bid.quantity || 1);

    if (payload.ipAddress) {
      const sameIpBid = await prisma.bid.findFirst({
        where: {
          tenderId: payload.tender.id,
          sellerId: { not: payload.sellerId },
          lastIpAddress: payload.ipAddress
        },
        select: { id: true, sellerId: true }
      });
      if (sameIpBid) {
        flags.push({
          userId: payload.sellerId,
          type: 'same_ip_multiple_sellers_bidding',
          severity: 'high',
          description: 'Multiple sellers submitted bids for the same tender from the same IP address',
          metadata: { tenderId: payload.tender.id, matchingBidId: sameIpBid.id, matchingSellerId: sameIpBid.sellerId }
        });
      }
    }

    const nearbyBid = await prisma.bid.findFirst({
      where: {
        tenderId: payload.tender.id,
        sellerId: { not: payload.sellerId },
        createdAt: { gte: new Date(Date.now() - 15_000) },
        unitPrice: {
          gte: Number(payload.bid.unitPrice || 0) * 0.99,
          lte: Number(payload.bid.unitPrice || 0) * 1.01
        }
      },
      select: { id: true, sellerId: true }
    });
    if (nearbyBid) {
      flags.push({
        userId: payload.sellerId,
        type: 'similar_price_seconds_apart',
        severity: 'medium',
        description: 'Similar bid prices were submitted seconds apart on the same tender',
        metadata: { tenderId: payload.tender.id, matchingBidId: nearbyBid.id, matchingSellerId: nearbyBid.sellerId }
      });
    }

    if (payload.tender.budget && bidValue > 0 && bidValue < Number(payload.tender.budget) * 0.5) {
      flags.push({
        userId: payload.sellerId,
        type: 'suspicious_lowball_bid',
        severity: 'medium',
        description: 'Bid value is materially below the tender budget',
        metadata: { tenderId: payload.tender.id, bidValue, budget: payload.tender.budget }
      });
    }

    if (payload.action === 'withdrawn') {
      const withdrawals = await prisma.bid.count({
        where: {
          sellerId: payload.sellerId,
          status: 'withdrawn',
          withdrawnAt: { gte: new Date(Date.now() - 30 * 24 * 60 * 60 * 1000) }
        }
      });
      if (withdrawals >= 3) {
        flags.push({
          userId: payload.sellerId,
          type: 'sudden_bid_withdrawal_pattern',
          severity: 'medium',
          description: 'Seller has multiple recent bid withdrawals',
          metadata: { withdrawalsLast30Days: withdrawals }
        });
      }
    }

    for (const flag of flags) await createComplianceFlag(flag);
  } catch (err) {
    console.warn('[Compliance] Failed to flag bid pattern:', err);
  }
};

const assertFileAssetsAccessible = async (fileAssetIds: number[] = [], user: NonNullable<AuthRequest['user']>) => {
  const uniqueIds = [...new Set(fileAssetIds.map(Number).filter(Boolean))];
  if (uniqueIds.length === 0) return [];
  const assets = await prisma.fileAsset.findMany({
    where: { id: { in: uniqueIds } },
    select: { id: true, ownerId: true, ownerRole: true, entityType: true, entityId: true, status: true }
  });
  if (assets.length !== uniqueIds.length) throw new ApiError(404, 'Attachment not found', 'FILE_NOT_FOUND');
  if (user.role !== 'admin' && assets.some(asset => asset.ownerId !== Number(user.id) || asset.status !== 'active')) {
    throw new ApiError(404, 'Attachment not found', 'FILE_NOT_FOUND');
  }
  return assets;
};

const canAccessConversation = (conversation: any, user: NonNullable<AuthRequest['user']>) =>
  user.role === 'admin' || conversation.buyerId === Number(user.id) || conversation.sellerId === Number(user.id);

const canAccessDispute = (dispute: any, user: NonNullable<AuthRequest['user']>) =>
  user.role === 'admin' || dispute.buyerId === Number(user.id) || dispute.sellerId === Number(user.id) || dispute.raisedById === Number(user.id);

const canAccessGrievance = (grievance: any, user: NonNullable<AuthRequest['user']>) =>
  user.role === 'admin' || grievance.userId === Number(user.id) || grievance.assignedAdminId === Number(user.id);

const resolveDisputeParties = async (payload: z.infer<typeof disputeCreateSchema>, actor: NonNullable<AuthRequest['user']>) => {
  if (payload.purchaseOrderId) {
    const po = await prisma.purchaseOrder.findUnique({ where: { id: payload.purchaseOrderId } });
    if (!po) throw new ApiError(404, 'Purchase order not found', 'PO_NOT_FOUND');
    return { buyerId: po.buyerId, sellerId: po.sellerId, purchaseOrderId: po.id };
  }
  if (payload.escrowAccountId) {
    const escrow = await prisma.escrowAccount.findUnique({ where: { id: payload.escrowAccountId } });
    if (!escrow) throw new ApiError(404, 'Escrow account not found', 'ESCROW_NOT_FOUND');
    return { buyerId: escrow.buyerId, sellerId: escrow.sellerId, escrowAccountId: escrow.id };
  }
  if (payload.paymentTransactionId) {
    const payment = await prisma.paymentTransaction.findUnique({ where: { id: payload.paymentTransactionId } });
    if (!payment) throw new ApiError(404, 'Payment not found', 'PAYMENT_NOT_FOUND');
    return { buyerId: payment.payerId, sellerId: payment.payeeId, paymentTransactionId: payment.id };
  }
  if (!payload.counterpartyId) throw new ApiError(400, 'Counterparty is required', 'COUNTERPARTY_REQUIRED');
  if (actor.role === 'buyer') return { buyerId: Number(actor.id), sellerId: payload.counterpartyId };
  if (actor.role === 'seller') return { buyerId: payload.counterpartyId, sellerId: Number(actor.id) };
  throw new ApiError(400, 'Admin-created disputes must reference a transaction', 'DISPUTE_ENTITY_REQUIRED');
};

const grievanceSlaDueAt = (priority: string) => {
  const hours = priority === 'urgent' ? 24 : priority === 'high' ? 72 : priority === 'low' ? 14 * 24 : 7 * 24;
  return new Date(Date.now() + hours * 60 * 60 * 1000);
};

const validateSellerBankPayload = (body: any) => {
  const values = {
    ifsc: normalizeSpaces(body.ifsc).toUpperCase(),
    bankName: normalizeSpaces(body.bankName),
    bankAddress: normalizeSpaces(body.bankAddress),
    holderName: normalizeSpaces(body.holderName),
    accountNumber: String(body.accountNumber || '').trim(),
    isPrimary: Boolean(body.isPrimary)
  };
  const errors: Record<string, string> = {};
  const ifscRegex = /^[A-Z]{4}0[A-Z0-9]{6}$/;
  const bankNameRegex = /^[A-Za-z0-9 .,&()/-]+$/;
  const holderRegex = /^[A-Za-z .'-]+$/;
  const accountRegex = /^\d{9,18}$/;

  if (!values.ifsc) errors.ifsc = 'IFSC code is required';
  else if (!ifscRegex.test(values.ifsc)) errors.ifsc = 'Invalid IFSC format';

  if (!values.bankName) errors.bankName = 'Bank name is required';
  else if (values.bankName.length < 2 || values.bankName.length > 100) errors.bankName = 'Bank name must be 2 to 100 characters';
  else if (!bankNameRegex.test(values.bankName)) errors.bankName = 'Bank name contains invalid characters';

  if (!values.bankAddress) errors.bankAddress = 'Bank address is required';
  else if (values.bankAddress.length < 10 || values.bankAddress.length > 250) errors.bankAddress = 'Bank address must be 10 to 250 characters';

  if (!values.holderName) errors.holderName = 'Account holder name is required';
  else if (values.holderName.length < 2) errors.holderName = 'Account holder name must be at least 2 characters';
  else if (!holderRegex.test(values.holderName)) errors.holderName = 'Account holder name contains invalid characters';

  if (!values.accountNumber) errors.accountNumber = 'Bank account number is required';
  else if (!accountRegex.test(values.accountNumber)) errors.accountNumber = 'Account number must be 9 to 18 digits';

  return { values, errors, isValid: Object.keys(errors).length === 0 };
};

const compactParts = (...parts: unknown[]) =>
  parts
    .map(part => normalizeSpaces(part))
    .filter(Boolean);

const pickFirstValue = (...values: unknown[]) => {
  for (const value of values) {
    const normalized = normalizeSpaces(value);
    if (normalized) return normalized;
  }
  return '';
};

const cleanEnv = (value: unknown) => normalizeSpaces(value).replace(/^['"]|['"]$/g, '');
const getApiSetuConfig = () => ({
  apiKey: cleanEnv(process.env.APISETU_API_KEY),
  clientId: cleanEnv(process.env.APISETU_CLIENT_ID),
  urlTemplate: cleanEnv(process.env.APISETU_GST_URL || 'https://apisetu.gov.in/gstn/v2/taxpayers/{gstin}')
});

const fetchApiSetuJson = async (apiUrl: string, headers: Record<string, string>) => {
  try {
    const response = await fetch(apiUrl, { method: 'GET', headers });
    const text = await response.text();
    const body = text ? JSON.parse(text) : {};
    return { ok: response.ok, status: response.status, body, text };
  } catch (err: any) {
    const allowInsecureTls =
      cleanEnv(process.env.APISETU_ALLOW_INSECURE_TLS).toLowerCase() === 'true' ||
      process.env.NODE_ENV !== 'production';

    const isCertificateChainError =
      err?.cause?.code === 'SELF_SIGNED_CERT_IN_CHAIN' ||
      /certificate/i.test(String(err?.cause?.message || err?.message || ''));

    if (!allowInsecureTls) {
      throw err;
    }

    console.warn('[GST Verify] Node TLS rejected API Setu certificate chain. Retrying with APISETU_ALLOW_INSECURE_TLS fallback.');
    return new Promise<{ ok: boolean; status: number; body: any; text: string }>((resolve, reject) => {
      const request = https.request(apiUrl, {
        method: 'GET',
        headers,
        rejectUnauthorized: false
      }, response => {
        let text = '';
        response.setEncoding('utf8');
        response.on('data', chunk => { text += chunk; });
        response.on('end', () => {
          let body: any = {};
          try {
            body = text ? JSON.parse(text) : {};
          } catch {
            body = {};
          }
          resolve({
            ok: Boolean(response.statusCode && response.statusCode >= 200 && response.statusCode < 300),
            status: response.statusCode || 0,
            body,
            text
          });
        });
      });
      request.on('error', reject);
      request.setTimeout(20000, () => request.destroy(new Error('API Setu request timed out')));
      request.end();
    });
  }
};

const getNestedValue = (source: any, paths: string[]) => {
  for (const path of paths) {
    const value = path.split('.').reduce((current, key) => {
      if (current === undefined || current === null) return undefined;
      return current[key];
    }, source);
    const normalized = normalizeSpaces(value);
    if (normalized) return normalized;
  }
  return '';
};

const resolveGstPayload = (raw: any) =>
  raw?.data?.result ||
  raw?.data?.gstinData ||
  raw?.data?.gstDetails ||
  raw?.data?.data ||
  raw?.result ||
  raw?.gstinData ||
  raw?.gstDetails ||
  raw?.taxpayerDetails ||
  raw?.taxPayerDetails ||
  raw?.certificateData ||
  raw;

const normalizeGstDetails = (raw: any, requestedGstin: string) => {
  const payload = resolveGstPayload(raw);
  const principal =
    payload?.principalPlaceOfBusinessFields?.principalPlaceOfBusinessAddress ||
    payload?.principalPlaceOfBusinessFields ||
    payload?.pradr ||
    payload?.principalPlaceOfBusiness ||
    payload?.principalAddress ||
    payload?.principal_place_of_business ||
    {};
  const addressSource = principal?.addr || principal?.address || principal;
  const requested = requestedGstin.toUpperCase();
  const responseGstin = pickFirstValue(
    payload?.gstin,
    payload?.gstIn,
    payload?.GSTIN,
    payload?.gstIdentificationNumber,
    getNestedValue(raw, ['data.gstin', 'data.GSTIN', 'result.gstin'])
  ).toUpperCase();

  const legalName = pickFirstValue(payload?.legalNameOfBusiness, payload?.lgnm, payload?.legalName, payload?.legal_name, payload?.legalNam, payload?.legal_name_of_business, payload?.name);
  const tradeName = pickFirstValue(payload?.tradeNam, payload?.tradeName, payload?.trade_name, payload?.trade_name_of_business, payload?.businessName);
  const pincode = pickFirstValue(addressSource?.pncd, addressSource?.pinCode, addressSource?.pincode, addressSource?.pin, addressSource?.zip);
  const district = pickFirstValue(addressSource?.dst, addressSource?.district, addressSource?.dist, addressSource?.districtName);
  const city = pickFirstValue(addressSource?.city, addressSource?.town, addressSource?.village, addressSource?.location, district);
  const state = pickFirstValue(addressSource?.stcd, addressSource?.state, addressSource?.stateName);
  const address = compactParts(
    addressSource?.bno,
    addressSource?.buildingNumber,
    addressSource?.bnm,
    addressSource?.buildingName,
    addressSource?.flno,
    addressSource?.floorNumber,
    addressSource?.floor,
    addressSource?.st,
    addressSource?.streetName,
    addressSource?.street,
    addressSource?.loc,
    addressSource?.location,
    addressSource?.locality,
    addressSource?.landMark,
    addressSource?.city,
    district,
    state,
    pincode
  ).join(', ');

  return {
    requestedGstin: requested,
    responseGstin,
    legalName,
    tradeName,
    organizationName: legalName || tradeName,
    address,
    registeredOfficeAddress: address,
    country: 'India',
    state,
    city,
    district,
    pincode,
    pinCode: pincode,
    pan: pickFirstValue(payload?.pan, payload?.PAN, payload?.panNo, payload?.panNumber) || requested.substring(2, 12),
    status: pickFirstValue(payload?.gstnStatus, payload?.sts, payload?.status, payload?.authStatus) || 'Active',
    raw
  };
};

app.get("/", (req, res) => {
  res.json({
    message: "JsgSmile Portal - Jharsuguda Synergy for MSME and Industry Linkage Ecosystem API (Prisma/PostgreSQL) is running",
    health: "/api/test"
  });
});

app.get("/api/test", (req, res) => res.json({ message: "API working" }));

// --- Tender APIs ---
app.get('/api/tenders', authenticate, authorize('buyer', 'admin'), async (req: AuthRequest, res) => {
  try {
    const tenders = await prisma.tender.findMany({
      where: req.user?.role === 'admin' ? {} : { buyerId: Number(req.user?.id) },
      orderBy: { createdAt: 'desc' }
    });
    res.json(maskSensitive(tenders));
  } catch (err: any) {
    handleSecureRouteError(res, err, 'Unable to load tenders');
  }
});

app.get('/api/tenders/public', authenticate, authorize('seller', 'buyer', 'admin'), async (req: AuthRequest, res) => {
  try {
    const include: any = { buyer: { include: { buyerProfile: true } } };
    if (req.user?.role === 'seller') {
      include.bids = {
        where: { sellerId: Number(req.user.id) },
        select: { id: true, status: true, createdAt: true },
        take: 1
      };
    }

    const tenders = await prisma.tender.findMany({
      where: { status: 'published' },
      include,
      orderBy: { createdAt: 'desc' }
    });
    const response = tenders.map((tender: any) => {
      const myBid = Array.isArray(tender.bids) ? tender.bids[0] : null;
      const { bids, ...safeTender } = tender;
      return {
        ...safeTender,
        hasParticipated: Boolean(myBid),
        participationStatus: myBid?.status,
        myBidId: myBid?.id
      };
    });
    res.json(maskSensitive(response));
  } catch (err: any) {
    handleSecureRouteError(res, err, 'Unable to load tenders');
  }
});

app.get('/api/tenders/:id', authenticate, authorize('buyer', 'seller', 'admin'), async (req: AuthRequest, res) => {
  try {
    const tenderId = Number(req.params.id);
    if (!tenderId) return res.status(400).json({ message: 'Invalid tender id' });

    const tender = await prisma.tender.findUnique({
      where: { id: tenderId },
      include: { buyer: { include: { buyerProfile: true } } }
    });
    if (!tender) return res.status(404).json({ message: 'Tender not found' });

    const isOwnerBuyer = req.user?.role === 'buyer' && tender.buyerId === Number(req.user.id);
    const isPublishedForSeller = req.user?.role === 'seller' && tender.status === 'published';
    const isAdmin = req.user?.role === 'admin';
    if (!isOwnerBuyer && !isPublishedForSeller && !isAdmin) {
      return res.status(404).json({ message: 'Tender not found' });
    }

    res.json(maskSensitive(tender));
  } catch (err: any) {
    return handleSecureRouteError(res, err, 'Unable to load tender');
  }
});

// GST Verification Utility
app.get('/api/utils/gst-verify/:gstin', async (req, res) => {
  try {
    res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate, proxy-revalidate');
    res.setHeader('Pragma', 'no-cache');
    res.setHeader('Expires', '0');
    const normalized = await GstService.verifyGstin(String(req.params.gstin || ''));
    logger.debug({
      gstinHash: sha256(normalized.requestedGstin),
      responseGstin: normalized.responseGstin || 'not_returned',
      state: normalized.state,
      city: normalized.city,
      pincode: normalized.pincode,
      hasAddress: Boolean(normalized.address)
    }, 'Mapped GST provider output');
    res.json(maskSensitive(normalized));
  } catch (err: any) {
    logger.error({ err, requestId: req.id }, 'GST verification failed.');
    res.status(err?.statusCode || 500).json({ message: err?.message || 'GST verification failed' });
  }
});

app.post('/api/gst/verify', async (req, res) => {
  try {
    const normalized = await GstService.verifyGstin(req.body?.gstNumber || req.body?.gstin);
    res.json(maskSensitive({ success: true, data: normalized }));
  } catch (err: any) {
    res.status(err?.statusCode || 500).json({ success: false, message: err?.message || 'GST verification failed' });
  }
});

// --- Bid / Quotation APIs ---
app.post('/api/tenders/:id/bids', authenticate, authorize('seller'), async (req: AuthRequest, res) => {
  try {
    const tenderId = Number(req.params.id);
    const sellerId = Number(req.user?.id);
    const payload = parseSchema(bidSchema, req.body);

    // Check if tender exists and is active
    const tender = await prisma.tender.findUnique({
      where: { id: tenderId }
    });

    if (!tender) return res.status(404).json({ message: 'Tender not found' });
    assertTenderOpenForBid(tender);
    if (tender.buyerId === sellerId) {
      return res.status(403).json({ message: 'Buyers cannot bid on their own tenders' });
    }
    if (payload.validTill && payload.validTill < new Date()) {
      return res.status(400).json({ message: 'Bid validity date must be in the future' });
    }

    const bid = await prisma.$transaction(async (tx) => {
      const existing = await tx.bid.findUnique({
        where: { bidCompoundId: { tenderId, sellerId } } as any,
        select: { id: true, status: true }
      });
      if (existing && ['accepted', 'rejected'].includes(existing.status)) {
        throw new ApiError(409, 'Bid can no longer be modified', 'BID_LOCKED');
      }

      const bidData = {
        ...payload,
        validTill: payload.validTill || null,
        warranty: payload.warranty || null,
        note: payload.note || null,
        documentUrl: payload.documentUrl || null,
        fileAssetId: payload.fileAssetId || null,
        lastIpAddress: req.ip,
        lastUserAgentHash: sha256(String(req.headers['user-agent'] || '')),
        deviceHash: requestDeviceHash(req) || null,
        status: 'pending',
        withdrawnAt: null
      };
      const savedBid = await tx.bid.upsert({
        where: {
          bidCompoundId: { tenderId, sellerId }
        } as any,
        update: {
          ...bidData
        },
        create: {
          ...bidData,
          tenderId,
          sellerId
        }
      });

      if (!existing) {
        await tx.tender.update({
          where: { id: tenderId },
          data: { bidsCount: { increment: 1 } }
        });
      }
      if (payload.fileAssetId) {
        await tx.fileAsset.updateMany({
          where: { id: payload.fileAssetId, ownerId: sellerId, status: 'active' },
          data: { entityType: 'bid', entityId: savedBid.id }
        });
      }
      return savedBid;
    });

    await flagSuspiciousBidPatterns({
      tender,
      bid,
      sellerId,
      ipAddress: req.ip,
      deviceHash: requestDeviceHash(req),
      action: bid.createdAt.getTime() === bid.updatedAt.getTime() ? 'submitted' : 'modified'
    });

    await auditLog({
      actorUserId: sellerId,
      actorRole: req.user?.role,
      action: 'bid.submitted_or_modified',
      entityType: 'bid',
      entityId: bid.id,
      ipAddress: req.ip,
      userAgent: req.headers['user-agent'],
      metadata: { tenderId, status: bid.status }
    });

    res.json(maskSensitive(bid));
  } catch (err: any) {
    handleSecureRouteError(res, err, 'Unable to submit bid');
  }
});

app.get('/api/tenders/:id/bids', authenticate, authorize('buyer', 'admin'), async (req: AuthRequest, res) => {
  try {
    const tenderId = Number(req.params.id);
    const tender = await prisma.tender.findUnique({ where: { id: tenderId }, select: { id: true, buyerId: true, status: true } });
    if (!tender || (req.user?.role !== 'admin' && tender.buyerId !== Number(req.user?.id))) {
      return res.status(404).json({ message: 'Tender not found' });
    }
    const bids = await prisma.bid.findMany({
      where: { tenderId, status: { not: 'withdrawn' } },
      include: {
        tender: { select: { id: true, buyerId: true, status: true } },
        seller: {
          include: {
            sellerProfile: true
          }
        }
      },
      orderBy: { unitPrice: 'asc' } as any
    });
    const enrichedBids = await attachBidFileAssets(bids);
    res.json(enrichedBids.map(bid => toBidResponse(bid, req.user!)));
  } catch (err: any) {
    handleSecureRouteError(res, err, 'Unable to load bids');
  }
});

app.get('/api/bids/my', authenticate, authorize('seller'), async (req: AuthRequest, res) => {
  try {
    const bids = await prisma.bid.findMany({
      where: { sellerId: Number(req.user?.id) },
      include: { tender: true },
      orderBy: { createdAt: 'desc' }
    });
    res.json(maskSensitive(await attachBidFileAssets(bids)));
  } catch (err: any) {
    handleSecureRouteError(res, err, 'Unable to load bids');
  }
});

app.get('/api/bids/:id', authenticate, authorize('seller', 'buyer', 'admin'), async (req: AuthRequest, res) => {
  try {
    const bidId = Number(req.params.id);
    const allowed = await checkOwnership('bid', bidId, req.user!);
    if (!allowed) return res.status(404).json({ message: 'Bid not found' });

    const bid = await prisma.bid.findUnique({
      where: { id: bidId },
      include: {
        tender: true,
        seller: { include: { sellerProfile: true } }
      }
    });
    if (!bid) return res.status(404).json({ message: 'Bid not found' });
    const [enrichedBid] = await attachBidFileAssets([bid]);
    res.json(toBidResponse(enrichedBid, req.user!));
  } catch (err: any) {
    handleSecureRouteError(res, err, 'Unable to load bid');
  }
});

app.put('/api/bids/:id', authenticate, authorize('seller'), async (req: AuthRequest, res) => {
  try {
    const bidId = Number(req.params.id);
    const payload = parseSchema(bidSchema.partial().refine(value => Object.keys(value).length > 0, {
      message: 'At least one quotation field is required'
    }), req.body);

    const existingBid = await prisma.bid.findUnique({
      where: { id: bidId },
      include: { tender: true }
    });
    if (!existingBid || existingBid.sellerId !== Number(req.user?.id)) {
      return res.status(404).json({ message: 'Bid not found' });
    }
    if (['accepted', 'rejected'].includes(existingBid.status)) {
      return res.status(409).json({ message: 'Accepted or rejected quotations cannot be edited' });
    }
    if (payload.validTill && payload.validTill < new Date()) {
      return res.status(400).json({ message: 'Bid validity date must be in the future' });
    }

    const bid = await prisma.bid.update({
      where: { id: bidId },
      data: {
        ...payload,
        ...(payload.validTill !== undefined ? { validTill: payload.validTill || null } : {}),
        ...(payload.warranty !== undefined ? { warranty: payload.warranty || null } : {}),
        ...(payload.note !== undefined ? { note: payload.note || null } : {}),
        ...(payload.documentUrl !== undefined ? { documentUrl: payload.documentUrl || null } : {}),
        ...(payload.fileAssetId !== undefined ? { fileAssetId: payload.fileAssetId || null } : {}),
        modifiedAt: new Date(),
        lastIpAddress: req.ip,
        lastUserAgentHash: sha256(String(req.headers['user-agent'] || '')),
        deviceHash: requestDeviceHash(req) || null
      },
      include: { tender: true }
    });
    if (payload.fileAssetId) {
      await prisma.fileAsset.updateMany({
        where: { id: payload.fileAssetId, ownerId: Number(req.user?.id), status: 'active' },
        data: { entityType: 'bid', entityId: bid.id }
      });
    }

    await auditLog({
      actorUserId: Number(req.user?.id),
      actorRole: req.user?.role,
      action: 'bid.modified',
      entityType: 'bid',
      entityId: bid.id,
      ipAddress: req.ip,
      userAgent: req.headers['user-agent'],
      metadata: { tenderId: bid.tenderId }
    });

    res.json(maskSensitive(bid));
  } catch (err: any) {
    handleSecureRouteError(res, err, 'Unable to update bid');
  }
});

app.post('/api/bids/:id/visibility', authenticate, authorize('seller'), async (req: AuthRequest, res) => {
  try {
    const bidId = Number(req.params.id);
    const active = Boolean(req.body?.active);
    const existingBid = await prisma.bid.findUnique({
      where: { id: bidId },
      include: { tender: true }
    });
    if (!existingBid || existingBid.sellerId !== Number(req.user?.id)) {
      return res.status(404).json({ message: 'Bid not found' });
    }
    if (['accepted', 'rejected'].includes(existingBid.status)) {
      return res.status(409).json({ message: 'Accepted or rejected quotations cannot be changed' });
    }
    if (active && (!bidSubmissionStatuses.has(String(existingBid.tender.status)) || !isTenderDeadlineActive(existingBid.tender))) {
      return res.status(409).json({ message: 'This tender is no longer accepting active quotations' });
    }

    const bid = await prisma.bid.update({
      where: { id: bidId },
      data: {
        status: active ? 'pending' : 'withdrawn',
        withdrawnAt: active ? null : new Date(),
        modifiedAt: new Date()
      },
      include: { tender: true }
    });

    await auditLog({
      actorUserId: Number(req.user?.id),
      actorRole: req.user?.role,
      action: active ? 'bid.activated' : 'bid.inactivated',
      entityType: 'bid',
      entityId: bid.id,
      ipAddress: req.ip,
      userAgent: req.headers['user-agent'],
      metadata: { tenderId: bid.tenderId }
    });

    res.json(maskSensitive(bid));
  } catch (err: any) {
    handleSecureRouteError(res, err, 'Unable to update quotation status');
  }
});

app.delete('/api/bids/:id', authenticate, authorize('seller'), async (req: AuthRequest, res) => {
  try {
    const bidId = Number(req.params.id);
    const existingBid = await prisma.bid.findUnique({
      where: { id: bidId },
      include: { tender: true, purchaseOrder: true }
    });
    if (!existingBid || existingBid.sellerId !== Number(req.user?.id)) {
      return res.status(404).json({ message: 'Bid not found' });
    }
    if (existingBid.purchaseOrder || existingBid.status === 'accepted') {
      return res.status(409).json({ message: 'Awarded quotations cannot be deleted' });
    }

    await prisma.$transaction(async (tx) => {
      await tx.bid.delete({ where: { id: bidId } });
      await tx.tender.update({
        where: { id: existingBid.tenderId },
        data: { bidsCount: { decrement: existingBid.tender.bidsCount > 0 ? 1 : 0 } }
      }).catch(() => undefined);
    });

    await auditLog({
      actorUserId: Number(req.user?.id),
      actorRole: req.user?.role,
      action: 'bid.deleted',
      entityType: 'bid',
      entityId: bidId,
      ipAddress: req.ip,
      userAgent: req.headers['user-agent'],
      metadata: { tenderId: existingBid.tenderId }
    });

    res.json({ success: true });
  } catch (err: any) {
    handleSecureRouteError(res, err, 'Unable to delete bid');
  }
});

app.post('/api/bids/:id/status', authenticate, authorize('buyer', 'admin'), async (req: AuthRequest, res) => {
  try {
    const bidId = Number(req.params.id);
    const { status } = req.body; // accepted, rejected
    if (!['accepted', 'rejected', 'pending'].includes(String(status))) {
      return res.status(400).json({ message: 'Invalid bid status' });
    }

    if (status === 'accepted') {
      const bidForStage = await prisma.bid.findUnique({
        where: { id: bidId },
        include: { tender: true }
      });
      if (!bidForStage || (req.user?.role !== 'admin' && bidForStage.tender.buyerId !== Number(req.user?.id))) {
        return res.status(404).json({ message: 'Bid not found' });
      }
      if (req.user?.role !== 'admin' && !bidOpenStatuses.has(String(bidForStage.tender.status))) {
        return res.status(409).json({ message: 'Bids cannot be accepted before the financial opening stage' });
      }
      const key = idempotencyKeyFromRequest(req, `bid-status:${bidId}:${status}:${req.user?.id}`);
      const result = await withIdempotency({
        req,
        userId: Number(req.user?.id),
        route: 'POST /api/bids/:id/status:accepted',
        key,
        handler: async () => {
          const workflow = await acceptBidAndGeneratePurchaseOrder(bidId, financialActor(req));
          return {
            success: true,
            bid: maskSensitive(workflow.bid),
            purchaseOrder: maskSensitive(workflow.purchaseOrder)
          };
        }
      });
      return res.json(result);
    }

    const existingBid = await prisma.bid.findUnique({
      where: { id: bidId },
      include: { tender: true }
    });
    if (!existingBid || (req.user?.role !== 'admin' && existingBid.tender.buyerId !== Number(req.user?.id))) {
      return res.status(404).json({ message: 'Bid not found' });
    }

    const bid = await prisma.bid.update({
      where: { id: bidId },
      data: { status }
    });

    await auditLog({
      actorUserId: Number(req.user?.id),
      actorRole: req.user?.role,
      action: 'bid.status_updated',
      entityType: 'bid',
      entityId: bid.id,
      ipAddress: req.ip,
      userAgent: req.headers['user-agent'],
      metadata: { before: { status: existingBid.status }, after: { status } }
    });

    res.json(maskSensitive(bid));
  } catch (err: any) {
    return handleFinancialRouteError(res, err);
  }
});

app.post('/api/bids/:id/withdraw', authenticate, authorize('seller'), async (req: AuthRequest, res) => {
  try {
    const bidId = Number(req.params.id);
    const bid = await prisma.bid.findUnique({
      where: { id: bidId },
      include: { tender: true }
    });
    if (!bid || bid.sellerId !== Number(req.user?.id)) {
      return res.status(404).json({ message: 'Bid not found' });
    }
    if (!bidSubmissionStatuses.has(String(bid.tender.status)) || !isTenderDeadlineActive(bid.tender)) {
      return res.status(409).json({ message: 'Bid withdrawal is closed for this tender' });
    }
    if (['accepted', 'rejected'].includes(bid.status)) {
      return res.status(409).json({ message: 'Bid can no longer be withdrawn' });
    }

    const updated = await prisma.bid.update({
      where: { id: bid.id },
      data: { status: 'withdrawn', withdrawnAt: new Date() }
    });

    await flagSuspiciousBidPatterns({
      tender: bid.tender,
      bid: updated,
      sellerId: Number(req.user?.id),
      ipAddress: req.ip,
      deviceHash: requestDeviceHash(req),
      action: 'withdrawn'
    });

    await auditLog({
      actorUserId: Number(req.user?.id),
      actorRole: req.user?.role,
      action: 'bid.withdrawn',
      entityType: 'bid',
      entityId: updated.id,
      ipAddress: req.ip,
      userAgent: req.headers['user-agent'],
      metadata: { tenderId: bid.tenderId }
    });

    res.json(maskSensitive(updated));
  } catch (err: any) {
    handleSecureRouteError(res, err, 'Unable to withdraw bid');
  }
});

app.post('/api/tenders', authenticate, authorize('buyer'), async (req: AuthRequest, res) => {
  try {
    if (!req.user || req.user.role !== 'buyer') {
      return res.status(403).json({ message: 'Only buyers can create tenders' });
    }

    const payload = parseSchema(tenderCreateSchema, req.body);
    const closesAt = payload.closesAt || new Date(Date.now() + 15 * 24 * 60 * 60 * 1000);
    if (closesAt <= new Date(Date.now() + 60 * 60 * 1000)) {
      return res.status(400).json({ message: 'Tender deadline must be at least one hour in the future' });
    }

    const tenderId = `T-2026-${Math.floor(1000 + Math.random() * 9000)}`;

    const tender = await prisma.tender.create({
      data: {
        title: payload.title,
        category: payload.category,
        budget: Number(payload.budget),
        description: payload.description,
        documentUrl: payload.documentUrl,
        buyerId: Number(req.user.id),
        tenderId,
        closesAt
      }
    });

    await auditLog({
      actorUserId: Number(req.user.id),
      actorRole: req.user.role,
      action: 'tender.created',
      entityType: 'tender',
      entityId: tender.id,
      ipAddress: req.ip,
      userAgent: req.headers['user-agent'],
      metadata: { tenderId: tender.tenderId, status: tender.status }
    });

    res.status(201).json(tender);
  } catch (err: any) {
    handleSecureRouteError(res, err, 'Unable to create tender');
  }
});

app.put('/api/tenders/:id', authenticate, authorize('buyer'), async (req: AuthRequest, res) => {
  try {
    const tenderId = Number(req.params.id);
    const payload = parseSchema(tenderEditSchema, req.body);
    const tender = await prisma.tender.findUnique({ where: { id: tenderId } });
    if (!tender || tender.buyerId !== Number(req.user?.id)) {
      return res.status(404).json({ message: 'Tender not found' });
    }
    if (terminalTenderStatuses.has(String(tender.status))) {
      return res.status(409).json({ message: 'Tender can no longer be modified' });
    }

    const draftOnlyFields = ['title', 'category', 'budget', 'description'];
    const changedKeys = Object.keys(payload);
    if (tender.status !== 'draft' && changedKeys.some(key => draftOnlyFields.includes(key))) {
      return res.status(409).json({ message: 'Published tender can only update allowed operational fields' });
    }
    if (payload.closesAt && payload.closesAt <= new Date()) {
      return res.status(400).json({ message: 'Tender deadline must be in the future' });
    }

    const updatedTender = await prisma.tender.update({
      where: { id: tender.id },
      data: {
        ...(payload.title !== undefined ? { title: payload.title } : {}),
        ...(payload.category !== undefined ? { category: payload.category } : {}),
        ...(payload.budget !== undefined ? { budget: Number(payload.budget) } : {}),
        ...(payload.description !== undefined ? { description: payload.description } : {}),
        ...(payload.documentUrl !== undefined ? { documentUrl: payload.documentUrl } : {}),
        ...(payload.closesAt !== undefined ? { closesAt: payload.closesAt } : {})
      }
    });

    await auditLog({
      actorUserId: Number(req.user?.id),
      actorRole: req.user?.role,
      action: 'tender.modified',
      entityType: 'tender',
      entityId: updatedTender.id,
      ipAddress: req.ip,
      userAgent: req.headers['user-agent'],
      metadata: { before: maskSensitive(tender), changedFields: changedKeys }
    });

    res.json(maskSensitive(updatedTender));
  } catch (err: any) {
    handleSecureRouteError(res, err, 'Unable to update tender');
  }
});

app.delete('/api/tenders/:id', authenticate, authorize('buyer'), async (req: AuthRequest, res) => {
  try {
    const tenderId = Number(req.params.id);
    const tender = await prisma.tender.findUnique({
      where: { id: tenderId },
      include: { bids: { select: { id: true } } }
    });
    if (!tender || tender.buyerId !== Number(req.user?.id)) {
      return res.status(404).json({ message: 'Tender not found' });
    }
    if (tender.bids.length > 0 || !['draft', 'approved'].includes(String(tender.status))) {
      return res.status(409).json({ message: 'Only draft tenders without bids can be deleted' });
    }

    await prisma.tender.delete({ where: { id: tender.id } });

    await auditLog({
      actorUserId: Number(req.user?.id),
      actorRole: req.user?.role,
      action: 'tender.deleted',
      entityType: 'tender',
      entityId: tender.id,
      ipAddress: req.ip,
      userAgent: req.headers['user-agent'],
      metadata: { tenderId: tender.tenderId, status: tender.status }
    });

    res.json({ success: true });
  } catch (err: any) {
    handleSecureRouteError(res, err, 'Unable to delete tender');
  }
});

app.put('/api/tenders/:id/status', authenticate, authorize('buyer', 'admin'), async (req: AuthRequest, res) => {
  try {
    const { status, overrideReason } = parseSchema(tenderStatusSchema, req.body);
    const tenderId = Number(req.params.id);

    const tender = await prisma.tender.findUnique({
      where: { id: tenderId }
    });

    if (!tender || (req.user?.role !== 'admin' && tender.buyerId !== Number(req.user?.id))) {
      return res.status(404).json({ message: 'Tender not found or unauthorized' });
    }
    if (!validTenderStatuses.has(status)) {
      return res.status(400).json({ message: 'Invalid tender status' });
    }
    if (req.user?.role === 'admin') {
      if (!overrideReason) return res.status(400).json({ message: 'Admin override reason is required' });
    } else if (!buyerTenderTransitions[String(tender.status)]?.includes(status)) {
      return res.status(409).json({ message: 'Invalid tender status transition' });
    }

    const updatedTender = await prisma.tender.update({
      where: { id: tenderId },
      data: { status }
    });

    await auditLog({
      actorUserId: Number(req.user?.id),
      actorRole: req.user?.role,
      action: req.user?.role === 'admin' ? 'tender.admin_override' : (status === 'published' ? 'tender.published' : 'tender.status_updated'),
      entityType: 'tender',
      entityId: updatedTender.id,
      ipAddress: req.ip,
      userAgent: req.headers['user-agent'],
      metadata: { before: { status: tender.status }, after: { status }, overrideReason }
    });

    res.json(updatedTender);
  } catch (err: any) {
    handleSecureRouteError(res, err, 'Unable to update tender status');
  }
});

// --- Reverse Auction APIs ---
app.post('/api/auctions', authenticate, authorize('buyer', 'admin'), async (req: AuthRequest, res) => {
  try {
    const payload = parseSchema(auctionCreateSchema, req.body);
    const tender = await prisma.tender.findUnique({
      where: { id: payload.tenderId },
      include: { Auction: true }
    });
    if (!tender || (req.user?.role !== 'admin' && tender.buyerId !== Number(req.user?.id))) {
      return res.status(404).json({ message: 'Tender not found' });
    }
    if (tender.Auction) return res.status(409).json({ message: 'Auction already exists for this tender' });
    if (terminalTenderStatuses.has(String(tender.status))) {
      return res.status(409).json({ message: 'Cannot create auction for a terminal tender' });
    }

    const now = new Date();
    const auction = await prisma.auction.create({
      data: {
        tenderId: tender.id,
        startPrice: Number(payload.startPrice),
        currentBid: Number(payload.startPrice),
        minDecrement: Number(payload.minDecrement),
        startTime: payload.startTime,
        endTime: payload.endTime,
        status: payload.startTime <= now && payload.endTime > now ? 'active' : 'scheduled'
      }
    });

    await auditLog({
      actorUserId: Number(req.user?.id),
      actorRole: req.user?.role,
      action: 'auction.created',
      entityType: 'auction',
      entityId: auction.id,
      ipAddress: req.ip,
      userAgent: req.headers['user-agent'],
      metadata: { tenderId: tender.id, startPrice: payload.startPrice, minDecrement: payload.minDecrement }
    });

    res.status(201).json(maskSensitive(auction));
  } catch (err: any) {
    handleSecureRouteError(res, err, 'Unable to create auction');
  }
});

app.get('/api/auctions/:id', authenticate, authorize('buyer', 'seller', 'admin'), async (req: AuthRequest, res) => {
  try {
    const auctionId = Number(req.params.id);
    const auction = await prisma.auction.findUnique({
      where: { id: auctionId },
      include: {
        Tender: true,
        bids: req.user?.role === 'seller'
          ? { where: { sellerId: Number(req.user.id) }, orderBy: { createdAt: 'desc' } }
          : { orderBy: { createdAt: 'desc' }, take: 100 }
      }
    });
    if (!auction) return res.status(404).json({ message: 'Auction not found' });
    const isOwnerBuyer = req.user?.role === 'buyer' && auction.Tender.buyerId === Number(req.user.id);
    const isSeller = req.user?.role === 'seller' && auction.status !== 'cancelled';
    const isAdmin = req.user?.role === 'admin';
    if (!isOwnerBuyer && !isSeller && !isAdmin) return res.status(404).json({ message: 'Auction not found' });
    res.json(maskSensitive(auction));
  } catch (err: any) {
    handleSecureRouteError(res, err, 'Unable to load auction');
  }
});

app.post('/api/auctions/:id/bids', authenticate, authorize('seller'), async (req: AuthRequest, res) => {
  try {
    const auctionId = Number(req.params.id);
    const payload = parseSchema(auctionBidSchema, req.body);
    const sellerId = Number(req.user?.id);

    const result = await withRedisLock(redisKeys.lockAuction(auctionId), 5000, async () =>
      prisma.$transaction(async (tx) => {
        const auction = await tx.auction.findUnique({
          where: { id: auctionId },
          include: { Tender: true }
        });
        if (!auction) throw new ApiError(404, 'Auction not found', 'AUCTION_NOT_FOUND');
        if (auction.Tender.buyerId === sellerId) throw new ApiError(403, 'Buyer cannot bid on own auction', 'OWN_AUCTION_BID');

        const now = new Date();
        if (auction.status === 'scheduled' && auction.startTime <= now && auction.endTime > now) {
          await tx.auction.update({ where: { id: auction.id }, data: { status: 'active' } });
          auction.status = 'active';
        }
        if (auction.status !== 'active') throw new ApiError(409, 'Auction is not active', 'AUCTION_NOT_ACTIVE');
        if (auction.startTime > now) throw new ApiError(409, 'Auction has not started', 'AUCTION_NOT_STARTED');
        if (auction.endTime <= now) {
          await tx.auction.update({ where: { id: auction.id }, data: { status: 'frozen' } });
          throw new ApiError(409, 'Auction has ended', 'AUCTION_ENDED');
        }

        const currentBid = Number(auction.currentBid ?? auction.startPrice);
        const maxAllowedBid = currentBid - Number(auction.minDecrement || 1);
        if (Number(payload.bidAmount) > maxAllowedBid) {
          throw new ApiError(400, `Bid must be at least ${auction.minDecrement} below current bid`, 'AUCTION_MIN_DECREMENT');
        }

        const auctionBid = await tx.auctionBid.create({
          data: {
            auctionId: auction.id,
            sellerId,
            bidAmount: Number(payload.bidAmount),
            ipAddress: req.ip,
            userAgentHash: sha256(String(req.headers['user-agent'] || '')),
            deviceHash: payload.deviceHash || requestDeviceHash(req) || null
          }
        });

        const updatedAuction = await tx.auction.update({
          where: { id: auction.id },
          data: { currentBid: Number(payload.bidAmount) }
        });

        return { auction: updatedAuction, auctionBid, tender: auction.Tender };
      })
    );

    const sameIpAuctionBid = await prisma.auctionBid.findFirst({
      where: {
        auctionId: result.auction.id,
        sellerId: { not: sellerId },
        ipAddress: req.ip
      },
      select: { id: true, sellerId: true }
    });
    if (sameIpAuctionBid) {
      await createComplianceFlag({
        userId: sellerId,
        type: 'same_ip_multiple_sellers_auction',
        severity: 'high',
        description: 'Multiple sellers placed reverse auction bids from the same IP address',
        metadata: { auctionId: result.auction.id, matchingAuctionBidId: sameIpAuctionBid.id, matchingSellerId: sameIpAuctionBid.sellerId }
      });
    }

    await auditLog({
      actorUserId: sellerId,
      actorRole: req.user?.role,
      action: 'auction.bid_placed',
      entityType: 'auctionBid',
      entityId: result.auctionBid.id,
      ipAddress: req.ip,
      userAgent: req.headers['user-agent'],
      metadata: { auctionId: result.auction.id, tenderId: result.tender.id, bidAmount: result.auctionBid.bidAmount }
    });

    res.status(201).json(maskSensitive(result));
  } catch (err: any) {
    handleSecureRouteError(res, err, 'Unable to place auction bid');
  }
});

app.post('/api/auctions/:id/finalize', authenticate, authorize('buyer', 'admin'), async (req: AuthRequest, res) => {
  try {
    const auctionId = Number(req.params.id);
    const result = await withRedisLock(`${redisKeys.lockAuction(auctionId)}:finalize`, 10_000, async () =>
      prisma.$transaction(async (tx) => {
        const auction = await tx.auction.findUnique({
          where: { id: auctionId },
          include: { Tender: true }
        });
        if (!auction) throw new ApiError(404, 'Auction not found', 'AUCTION_NOT_FOUND');
        if (req.user?.role !== 'admin' && auction.Tender.buyerId !== Number(req.user?.id)) {
          throw new ApiError(404, 'Auction not found', 'AUCTION_NOT_FOUND');
        }
        const overrideReason = normalizeSpaces(req.body?.overrideReason);
        if (auction.endTime > new Date() && req.user?.role !== 'admin') {
          throw new ApiError(409, 'Auction cannot be finalized before end time', 'AUCTION_NOT_ENDED');
        }
        if (auction.endTime > new Date() && !overrideReason) {
          throw new ApiError(400, 'Admin override reason is required', 'ADMIN_REASON_REQUIRED');
        }

        const winningBid = await tx.auctionBid.findFirst({
          where: { auctionId: auction.id },
          orderBy: [{ bidAmount: 'asc' }, { createdAt: 'asc' }]
        });

        const updatedAuction = await tx.auction.update({
          where: { id: auction.id },
          data: {
            status: 'finalized',
            finalizedAt: new Date(),
            winnerSellerId: winningBid?.sellerId || null,
            overrideReason: overrideReason || null
          }
        });

        return { auction: updatedAuction, winningBid };
      })
    );

    await auditLog({
      actorUserId: Number(req.user?.id),
      actorRole: req.user?.role,
      action: 'auction.finalized',
      entityType: 'auction',
      entityId: result.auction.id,
      ipAddress: req.ip,
      userAgent: req.headers['user-agent'],
      metadata: { winnerSellerId: result.auction.winnerSellerId, winningBidId: result.winningBid?.id }
    });

    if (result.auction.winnerSellerId) {
      await auditLog({
        actorUserId: Number(req.user?.id),
        actorRole: req.user?.role,
        action: 'auction.winner_selected',
        entityType: 'auction',
        entityId: result.auction.id,
        ipAddress: req.ip,
        userAgent: req.headers['user-agent'],
        metadata: { winnerSellerId: result.auction.winnerSellerId }
      });
    }

    res.json(maskSensitive(result));
  } catch (err: any) {
    handleSecureRouteError(res, err, 'Unable to finalize auction');
  }
});

app.post('/api/auctions/:id/override', authenticate, authorizeAdmin, async (req: AuthRequest, res) => {
  try {
    const auctionId = Number(req.params.id);
    const payload = parseSchema(adminOverrideSchema, req.body);
    const auction = await prisma.auction.update({
      where: { id: auctionId },
      data: {
        status: payload.status,
        overrideReason: payload.reason,
        ...(payload.status === 'finalized' ? { finalizedAt: new Date() } : {})
      }
    });

    await auditLog({
      actorUserId: Number(req.user?.id),
      actorRole: req.user?.role,
      action: 'auction.admin_override',
      entityType: 'auction',
      entityId: auction.id,
      ipAddress: req.ip,
      userAgent: req.headers['user-agent'],
      metadata: { status: payload.status, reason: payload.reason }
    });

    res.json(maskSensitive(auction));
  } catch (err: any) {
    handleSecureRouteError(res, err, 'Unable to override auction');
  }
});

const finalizeEndedAuctionsJob = async () => {
  if (!redis || !isRedisReady()) return;
  const dueAuctions = await prisma.auction.findMany({
    where: {
      status: { in: ['active', 'scheduled'] },
      endTime: { lte: new Date() }
    },
    select: { id: true },
    take: 25
  });

  for (const dueAuction of dueAuctions) {
    await withRedisLock(`${redisKeys.lockAuction(dueAuction.id)}:finalize`, 10_000, async () => {
      const result = await prisma.$transaction(async (tx) => {
        const auction = await tx.auction.findUnique({ where: { id: dueAuction.id } });
        if (!auction || auction.status === 'finalized' || auction.status === 'cancelled') return null;
        const winningBid = await tx.auctionBid.findFirst({
          where: { auctionId: auction.id },
          orderBy: [{ bidAmount: 'asc' }, { createdAt: 'asc' }]
        });
        const updatedAuction = await tx.auction.update({
          where: { id: auction.id },
          data: {
            status: 'finalized',
            finalizedAt: new Date(),
            winnerSellerId: winningBid?.sellerId || null
          }
        });
        return { auction: updatedAuction, winningBid };
      });

      if (result) {
        await auditLog({
          action: 'auction.finalized_job',
          entityType: 'auction',
          entityId: result.auction.id,
          metadata: { winnerSellerId: result.auction.winnerSellerId, winningBidId: result.winningBid?.id }
        });
        if (result.auction.winnerSellerId) {
          await auditLog({
            action: 'auction.winner_selected',
            entityType: 'auction',
            entityId: result.auction.id,
            metadata: { winnerSellerId: result.auction.winnerSellerId }
          });
        }
      }
    }).catch(error => console.warn('[AuctionFinalizer] Skipped auction finalization:', error instanceof Error ? error.message : error));
  }
};

// --- Seed Data Logic ---
try {
  const userCount = await prisma.user.count();
  if (userCount === 0 && env.NODE_ENV !== 'production') {
    console.log('Seeding sample data for Prisma...');
    const hashedPassword = await hashPassword('SampleData@12345');

    // Admin
    await prisma.user.create({
      data: {
        name: 'Admin User',
        email: 'admin@jsgsmile.com',
        password: hashedPassword,
        role: 'admin',
        registrationStatus: 'completed',
        onboardingStatus: 'approved_for_procurement'
      }
    });

    // Sample Users
    const sampleUsers = [
      { name: 'Rajesh Kumar', email: 'rajesh@texcorp.com', role: 'seller' as const },
      { name: 'Suresh Raina', email: 'suresh@buildcon.com', role: 'buyer' as const },
    ];

    for (const u of sampleUsers) {
      const user = await prisma.user.create({
        data: {
          name: u.name,
          email: u.email,
          password: hashedPassword,
          role: u.role,
          registrationStatus: 'completed',
          onboardingStatus: 'approved_for_procurement'
        }
      });

      if (u.role === 'seller') {
        await prisma.sellerProfile.create({
          data: {
            userId: user.id,
            organizationType: 'Pvt Ltd',
            pan: 'ABCDE1234F',
            nameAsInPan: u.name,
            panVerified: true,
            businessName: 'TEXCORP',
            productCategories: ['Textiles'],
          }
        });
      } else {
        await prisma.buyerProfile.create({
          data: {
            userId: user.id,
            organizationName: 'BUILDCON',
            businessType: 'Partnership',
            industry: 'Construction',
            pan: 'BCDEF2345G',
            representativeName: u.name,
            mobile: '9123456789',
            state: 'Karnataka',
            city: 'Bangalore',
            pincode: '560001',
            registeredAddress: '45, Tech Center, MG Road',
            gst: '29BCDEF2345G1Z2',
          }
        });

        // Add a tender for the buyer
        await prisma.tender.create({
          data: {
            buyerId: user.id,
            tenderId: 'T-2026-0001',
            title: 'Office Furniture Supply',
            category: 'Furniture',
            budget: 500000,
            description: 'Need ergonomic chairs and desks.',
            status: 'published',
            closesAt: new Date(Date.now() + 10 * 24 * 60 * 60 * 1000)
          }
        });
      }
    }
    console.log('Seeding completed.');
  }
} catch (err: any) {
  const message = String(err?.message || '');
  if (message.includes("Can't reach database server")) {
    console.warn('Seeding skipped: database server is unreachable.');
  } else {
    console.error('Seeding error:', err);
  }
}

const handleSecureUpload = async (req: AuthRequest & { file?: Express.Multer.File }, res: any, legacy = false) => {
  try {
    if (!req.user) throw new ApiError(401, 'Authentication required', 'AUTH_REQUIRED');
    if (!req.file) throw new ApiError(400, 'No file uploaded', 'FILE_REQUIRED');

    const context = buildFileUploadContext(req);
    if (!(await canAttachFileToEntity(context, req.user))) {
      await auditLog({
        actorUserId: req.user.id,
        actorRole: req.user.role,
        action: 'file.upload_denied',
        entityType: 'file',
        ipAddress: req.ip,
        userAgent: req.headers['user-agent'],
        metadata: { relatedEntityType: context.entityType, relatedEntityId: context.entityId }
      });
      throw new ApiError(404, 'Resource not found', 'FILE_ENTITY_NOT_FOUND');
    }

    const asset = await uploadStoredFile(req.file, context, env.STORAGE_PROVIDER);
    const signed = await getStoredFileSignedUrl(asset.id, req.user, {
      ipAddress: req.ip,
      userAgent: req.headers['user-agent']
    });

    const payload = {
      success: true,
      file: toFileResponse(asset),
      signedUrl: signed.signedUrl,
      expiresInSeconds: signed.expiresInSeconds
    };

    if (legacy) {
      return res.json({
        ...payload,
        url: signed.signedUrl,
        publicId: asset.key,
        fileId: asset.id
      });
    }

    return res.status(201).json(payload);
  } catch (err: any) {
    return handleUploadRouteError(res, err);
  }
};

// --- File Upload ---
app.post('/api/upload', authenticate, upload.single('file'), (req: AuthRequest & { file?: Express.Multer.File }, res: any) =>
  handleSecureUpload(req, res, true)
);

app.post('/api/files/upload', authenticate, upload.single('file'), (req: AuthRequest & { file?: Express.Multer.File }, res: any) =>
  handleSecureUpload(req, res)
);

app.get('/api/files/:id/signed-url', authenticate, async (req: AuthRequest, res: any) => {
  try {
    if (!req.user) throw new ApiError(401, 'Authentication required', 'AUTH_REQUIRED');
    const fileId = Number(req.params.id);
    if (!Number.isInteger(fileId) || fileId <= 0) throw new ApiError(400, 'Invalid file id', 'FILE_ID_INVALID');

    const signed = await getStoredFileSignedUrl(fileId, req.user, {
      ipAddress: req.ip,
      userAgent: req.headers['user-agent']
    });

    return res.json({
      success: true,
      file: toFileResponse(signed.asset),
      signedUrl: signed.signedUrl,
      expiresInSeconds: signed.expiresInSeconds
    });
  } catch (err: any) {
    return handleUploadRouteError(res, err);
  }
});

app.get('/api/files/:id/view', authenticate, async (req: AuthRequest, res: any) => {
  try {
    if (!req.user) throw new ApiError(401, 'Authentication required', 'AUTH_REQUIRED');
    const fileId = Number(req.params.id);
    if (!Number.isInteger(fileId) || fileId <= 0) throw new ApiError(400, 'Invalid file id', 'FILE_ID_INVALID');

    const file = await getStoredFileContent(fileId, req.user, {
      ipAddress: req.ip,
      userAgent: req.headers['user-agent']
    });
    const filename = encodeURIComponent(file.asset.originalName || 'document');

    res.setHeader('Content-Type', file.contentType);
    res.setHeader('Content-Length', file.buffer.length);
    res.setHeader('Content-Disposition', `inline; filename="${filename}"; filename*=UTF-8''${filename}`);
    res.setHeader('Cache-Control', 'private, no-store');
    return res.end(file.buffer);
  } catch (err: any) {
    return handleUploadRouteError(res, err);
  }
});

app.delete('/api/files/:id', authenticate, async (req: AuthRequest, res: any) => {
  try {
    if (!req.user) throw new ApiError(401, 'Authentication required', 'AUTH_REQUIRED');
    const fileId = Number(req.params.id);
    if (!Number.isInteger(fileId) || fileId <= 0) throw new ApiError(400, 'Invalid file id', 'FILE_ID_INVALID');

    const asset = await deleteStoredFile(fileId, req.user, {
      ipAddress: req.ip,
      userAgent: req.headers['user-agent']
    });

    return res.json({ success: true, file: toFileResponse(asset) });
  } catch (err: any) {
    return handleUploadRouteError(res, err);
  }
});

// --- Profile APIs ---
app.post('/api/seller/register', authenticate, authorize('seller'), async (req: AuthRequest, res) => {
  try {
    const userId = Number(req.user?.id);
    const editCheck = await ensureOnboardingEditable(userId);
    if (!editCheck.editable) return res.status(editCheck.status || 403).json({ message: editCheck.message });
    const { password, ...rawData } = req.body;

    if (password || rawData.email || rawData.mobile || rawData.dob) {
      const updateData: any = {};
      if (password) {
        const passwordValidation = validatePasswordStrength(String(password));
        if (!passwordValidation.ok) {
          return res.status(400).json({ message: 'Password does not meet security requirements', errors: passwordValidation.errors });
        }
        updateData.password = await hashPassword(password);
        updateData.passwordResetVersion = { increment: 1 };
        updateData.sessionVersion = { increment: 1 };
        updateData.lastPasswordChangeAt = new Date();
      }
      if (rawData.email) {
        const existingEmail = await prisma.user.findFirst({
          where: { email: String(rawData.email).trim().toLowerCase(), id: { not: userId } },
          select: { id: true }
        });
        if (existingEmail) return res.status(409).json({ message: 'Email address already in use. Please use unique details.' });
        updateData.email = String(rawData.email).trim().toLowerCase();
      }
      if (rawData.mobile) {
        const existingMobile = await prisma.user.findFirst({
          where: { mobile: String(rawData.mobile).trim(), id: { not: userId } },
          select: { id: true }
        });
        if (existingMobile) return res.status(409).json({ message: 'Mobile number already in use. Please use unique details.' });
        updateData.mobile = rawData.mobile;
      }
      if (rawData.dob && !isNaN(Date.parse(rawData.dob))) updateData.dob = new Date(rawData.dob);
      await prisma.user.update({ where: { id: userId }, data: updateData });
    }

    // Filter only allowed fields for SellerProfile (GeM Style)
    const requestedPan = normalizeSpaces(rawData.pan).toUpperCase();
    if (!requestedPan) {
      return res.status(400).json({ message: 'Business PAN is required before saving seller details.' });
    }
    const existingProfile = await prisma.sellerProfile.findUnique({
      where: { userId }
    });

    let panToUse = requestedPan;
    const isPanMasked = requestedPan.includes('*');
    if (isPanMasked && existingProfile) {
      panToUse = existingProfile.pan;
    }

    let aadhaarNumberToUse = rawData.aadhaarNumber;
    const isAadhaarMasked = rawData.aadhaarNumber && String(rawData.aadhaarNumber).includes('*');
    if (isAadhaarMasked && existingProfile) {
      aadhaarNumberToUse = existingProfile.aadhaarNumber;
    }

    const sellerValidationErrors = validateSellerOnboardingPayload({ ...rawData, pan: panToUse });
    if (Object.keys(sellerValidationErrors).length > 0) {
      return res.status(400).json({
        message: Object.values(sellerValidationErrors)[0],
        errors: sellerValidationErrors
      });
    }

    const sensitiveFields = sensitiveProfileFields({ pan: panToUse, aadhaarNumber: aadhaarNumberToUse });

    // If it was masked and we resolved it from the DB, preserve its DB hashes/masks directly to be safe
    if (isPanMasked && existingProfile) {
      sensitiveFields.panMasked = existingProfile.panMasked;
      sensitiveFields.panFingerprint = existingProfile.panFingerprint;
    }
    if (isAadhaarMasked && existingProfile) {
      sensitiveFields.aadhaarMasked = existingProfile.aadhaarMasked;
      sensitiveFields.aadhaarHash = existingProfile.aadhaarHash;
      sensitiveFields.aadhaarFingerprint = existingProfile.aadhaarFingerprint;
    }

    const profileData: any = {
      organizationType: rawData.organizationType,
      pan: panToUse,
      ...sensitiveFields,
      nameAsInPan: rawData.nameAsInPan,
      dateAsInPan: (rawData.dateAsInPan && !isNaN(Date.parse(rawData.dateAsInPan))) ? new Date(rawData.dateAsInPan) : null,
      panVerified: rawData.panVerified ?? false,
      businessName: rawData.businessName,
      dateOfIncorporation: (rawData.dateOfIncorporation && !isNaN(Date.parse(rawData.dateOfIncorporation))) ? new Date(rawData.dateOfIncorporation) : null,
      detailsUpdated: rawData.detailsUpdated ?? false,
      isStartup: rawData.isStartup ?? false,
      isUdyamCertified: rawData.isUdyamCertified ?? false,
      participateInBid: rawData.participateInBid ?? false,
      turnoverMax3Yrs: rawData.turnoverMax3Yrs,
      eInvoicingExcluded: rawData.eInvoicingExcluded ?? false,
      ownershipDeclarationAccepted: rawData.ownershipDeclarationAccepted ?? false,
      ownershipVerified: rawData.ownershipVerified ?? false,
      msmeCategory: rawData.msmeCategory,
      productCategories: normalizeStringList(rawData.productCategories),
      otherCategoryDetails: rawData.otherCategoryDetails,
      productList: rawData.productList,
      detailedProductName: rawData.detailedProductName,
      hsnCode: rawData.hsnCode,
      brand: rawData.brand,
      specifications: rawData.specifications,
      documents: rawData.documents,
      mobile: rawData.mobile,
      dob: (rawData.dob && !isNaN(Date.parse(rawData.dob))) ? new Date(rawData.dob) : null,
      roleInOrg: rawData.roleInOrg,
      termsAccepted: rawData.agreeTerms ?? false
    };

    const isPanChanging = panToUse && (!existingProfile || (existingProfile.pan !== panToUse && !isPanMasked));
    if (isPanChanging) {
      const requestedPanFingerprint = createHashFingerprint(panToUse, 'pan');
      const duplicatePan = await prisma.sellerProfile.findFirst({
        where: {
          userId: { not: userId },
          OR: [{ pan: panToUse }, { panFingerprint: requestedPanFingerprint }]
        },
        select: { userId: true }
      });
      if (duplicatePan) {
        await flagDuplicateSellerIdentifiers({ userId, pan: panToUse });
        await markUserForManualReview(userId);
        return res.status(409).json({ message: 'PAN is already associated with another seller account. Application moved to compliance review.' });
      }
    }

    const gstNumbers = [
      rawData.gst,
      rawData.gstNumber,
      ...(Array.isArray(rawData.offices) ? rawData.offices.map((office: any) => office?.gstNumber) : [])
    ].filter(Boolean);
    const flags = await flagDuplicateSellerIdentifiers({
      userId,
      pan: panToUse,
      gstNumbers,
      aadhaarNumber: null
    });
    if (flags.length > 0) await markUserForManualReview(userId);

    const profile = await prisma.sellerProfile.upsert({
      where: { userId },
      update: profileData,
      create: { ...profileData, userId }
    });
    const completedSection = normalizeSpaces(rawData._completedSection);
    const sellerSections = ['pan', 'details', 'additional', 'offices', 'bank', 'einvoicing', 'ownership', 'documents'];
    if (sellerSections.includes(completedSection)) {
      const existingUser = await prisma.user.findUnique({
        where: { id: userId },
        select: { sectionStatus: true }
      });
      await prisma.user.update({
        where: { id: userId },
        data: {
          sectionStatus: {
            ...((existingUser?.sectionStatus as Record<string, any>) || {}),
            [completedSection]: 'completed'
          }
        }
      });
    }
    await auditLog({
      actorUserId: userId,
      actorRole: req.user?.role,
      action: 'sensitive_data.updated',
      entityType: 'sellerProfile',
      entityId: profile.id,
      ipAddress: req.ip,
      userAgent: req.headers['user-agent'],
      metadata: { fields: ['pan', 'aadhaarMasked', 'aadhaarHash'] }
    });
    res.json({ success: true, profile: maskSensitive(profile) });
  } catch (err: any) {
    handleSecureRouteError(res, err);
  }
});

// Manage Seller Offices
app.post('/api/seller/profile/offices', authenticate, authorize('seller'), async (req: AuthRequest, res) => {
  try {
    const userId = Number(req.user?.id);
    const editCheck = await ensureOnboardingEditable(userId);
    if (!editCheck.editable) return res.status(editCheck.status || 403).json({ message: editCheck.message });
    const profile = await prisma.sellerProfile.findUnique({ where: { userId } });
    if (!profile) return res.status(404).json({ message: 'Profile not found' });

    const gstNumber = normalizeSpaces(req.body?.gstNumber).toUpperCase();
    const officeErrors: Record<string, string> = {};
    if (!normalizeSpaces(req.body?.name)) officeErrors.name = 'Office name is required.';
    if (!normalizeSpaces(req.body?.type)) officeErrors.type = 'Office type is required.';
    if (!onboardingPatterns.pincode.test(normalizeSpaces(req.body?.pincode))) officeErrors.pincode = 'PIN code must be a valid 6 digit Indian PIN.';
    if (!normalizeSpaces(req.body?.state)) officeErrors.state = 'State is required.';
    if (!normalizeSpaces(req.body?.city)) officeErrors.city = 'City is required.';
    if (normalizeSpaces(req.body?.address).length < 10) officeErrors.address = 'Complete office address is required.';
    if (gstNumber && !onboardingPatterns.gst.test(gstNumber)) officeErrors.gstNumber = 'GSTIN must follow valid 15 character format.';
    if (Object.keys(officeErrors).length > 0) {
      return res.status(400).json({ message: Object.values(officeErrors)[0], errors: officeErrors });
    }
    if (gstNumber) {
      const duplicateGst = await prisma.sellerOffice.findFirst({
        where: {
          gstNumber,
          sellerProfile: { userId: { not: userId } }
        },
        select: { sellerProfile: { select: { userId: true } } }
      });
      if (duplicateGst) {
        await flagDuplicateSellerIdentifiers({ userId, gstNumbers: [gstNumber] });
        await markUserForManualReview(userId);
        return res.status(409).json({ message: 'GSTIN is already associated with another seller account. Application moved to compliance review.' });
      }
    }

    const office = await prisma.sellerOffice.create({
      data: {
        ...req.body,
        gstNumber: gstNumber || req.body?.gstNumber,
        ...sensitiveProfileFields({ gstNumber }),
        sellerProfileId: profile.id
      }
    });
    res.json({ success: true, office: maskSensitive(office) });
  } catch (err: any) {
    handleSecureRouteError(res, err);
  }
});

app.delete('/api/seller/profile/offices/:id', authenticate, authorize('seller'), async (req: AuthRequest, res) => {
  try {
    const userId = Number(req.user?.id);
    const editCheck = await ensureOnboardingEditable(userId);
    if (!editCheck.editable) return res.status(editCheck.status || 403).json({ message: editCheck.message });
    const officeId = Number(req.params.id);
    const office = await prisma.sellerOffice.findUnique({
      where: { id: officeId },
      include: { sellerProfile: true }
    });
    if (!office || office.sellerProfile.userId !== userId) {
      return res.status(404).json({ message: 'Office not found' });
    }
    await prisma.sellerOffice.delete({ where: { id: officeId } });
    res.json({ success: true });
  } catch (err: any) {
    handleSecureRouteError(res, err);
  }
});

// Manage Seller Bank Accounts
app.post('/api/seller/profile/bank', authenticate, authorize('seller'), async (req: AuthRequest, res) => {
  try {
    const userId = Number(req.user?.id);
    const editCheck = await ensureOnboardingEditable(userId);
    if (!editCheck.editable) return res.status(editCheck.status || 403).json({ message: editCheck.message });
    const profile = await prisma.sellerProfile.findUnique({ where: { userId } });
    if (!profile) return res.status(404).json({ message: 'Profile not found' });

    const validation = validateSellerBankPayload(req.body);
    if (!validation.isValid) {
      return res.status(400).json({ message: 'Invalid bank account details', errors: validation.errors });
    }

    const existingAccounts = await prisma.sellerBankAccount.findMany({
      where: { sellerProfileId: profile.id },
      orderBy: { createdAt: 'asc' }
    });
    const duplicate = existingAccounts.find(bank =>
      bank.ifsc.toUpperCase() === validation.values.ifsc &&
      (bank.bankFingerprint === createHashFingerprint(`${validation.values.ifsc}:${validation.values.accountNumber}`, 'bank') ||
        bank.accountNumberHash === createHashFingerprint(`${validation.values.ifsc}:${validation.values.accountNumber}`, 'bank') ||
        bank.accountNumber === validation.values.accountNumber)
    );
    if (duplicate) {
      return res.status(409).json({ message: 'This bank account is already added for this seller profile' });
    }

    const duplicateExternalBank = await flagDuplicateBankAccount({
      userId,
      sellerProfileId: profile.id,
      ifsc: validation.values.ifsc,
      accountNumber: validation.values.accountNumber
    });
    if (duplicateExternalBank) {
      await markUserForManualReview(userId);
      return res.status(409).json({ message: 'This bank account is already linked to another seller. Application moved to compliance review.' });
    }

    const shouldBePrimary = existingAccounts.length === 0 || validation.values.isPrimary;
    const bank = await prisma.$transaction(async (tx) => {
      if (shouldBePrimary) {
        await tx.sellerBankAccount.updateMany({
          where: { sellerProfileId: profile.id },
          data: { isPrimary: false }
        });
      }
      return tx.sellerBankAccount.create({
        data: {
          sellerProfileId: profile.id,
          ifsc: validation.values.ifsc,
          bankName: validation.values.bankName,
          bankAddress: validation.values.bankAddress,
          holderName: validation.values.holderName,
          accountNumber: null,
          ...sensitiveProfileFields({
            ifsc: validation.values.ifsc,
            accountNumber: validation.values.accountNumber
          }),
          isPrimary: shouldBePrimary
        }
      });
    });
    const bankAccounts = await prisma.sellerBankAccount.findMany({
      where: { sellerProfileId: profile.id },
      orderBy: [{ isPrimary: 'desc' }, { createdAt: 'asc' }]
    });
    await auditLog({
      actorUserId: userId,
      actorRole: req.user?.role,
      action: 'sensitive_data.updated',
      entityType: 'sellerBankAccount',
      entityId: bank.id,
      ipAddress: req.ip,
      userAgent: req.headers['user-agent'],
      metadata: { fields: ['accountNumberMasked', 'accountNumberHash'] }
    });
    res.json({ success: true, bank: maskSensitive(bank), bankAccounts: maskSensitive(bankAccounts) });
  } catch (err: any) {
    handleSecureRouteError(res, err);
  }
});

app.post('/api/seller/ownership/send-otp', authenticate, authorize('seller'), otpSendRateLimit, async (req: AuthRequest, res) => {
  try {
    const userId = Number(req.user?.id);
    const user = await prisma.user.findUnique({
      where: { id: userId },
      select: { id: true, email: true, role: true }
    });
    if (!user?.email) return res.status(400).json({ message: 'Login email is not available for OTP delivery.' });

    const otp = generateOtp();
    const otpState = await storeOtp('ownership_submission', user.email, otp, { userId: user.id, action: 'seller_final_submission' });
    const deliveryConfigured = await sendOtpEmail(user.email, otp, '[JsgSmile Portal] Final submission OTP');

    await auditLog({
      actorUserId: user.id,
      actorRole: user.role,
      action: 'seller.ownership_otp.sent',
      entityType: 'sellerProfile',
      ipAddress: req.ip,
      userAgent: req.headers['user-agent'],
      metadata: { emailHash: sha256(user.email), deliveryConfigured }
    });
    if (!deliveryConfigured) {
      return res.status(503).json({ message: 'Email delivery is not configured. Please configure SMTP to send OTP.' });
    }

    res.json({
      success: true,
      email: user.email,
      sendsRemaining: otpState.sendsRemaining,
      deliveryConfigured
    });
  } catch (err: any) {
    handleSecureRouteError(res, err, 'Unable to send ownership verification OTP right now.');
  }
});

app.post('/api/seller/submit', authenticate, authorize('seller'), async (req: AuthRequest, res) => {
  try {
    const userId = Number(req.user?.id);
    const editCheck = await ensureOnboardingEditable(userId);
    if (!editCheck.editable) return res.status(editCheck.status || 403).json({ message: editCheck.message });

    const existingUser = await prisma.user.findUnique({
      where: { id: userId },
      include: {
        sellerProfile: {
          include: {
            offices: true,
            bankAccounts: true,
            sellerDocuments: true
          }
        }
      }
    });
    if (!existingUser) return res.status(404).json({ message: 'User not found' });
    if (!existingUser.email) return res.status(400).json({ message: 'Login email is required for OTP verification.' });

    const otp = String(req.body?.otp || '').trim();
    if (!/^\d{6}$/.test(otp)) {
      return res.status(400).json({ message: 'Enter the 6-digit OTP sent to your login email.' });
    }

    const otpResult = await verifyOtp('ownership_submission', existingUser.email, otp);
    if (!otpResult.ok) {
      await auditLog({
        actorUserId: userId,
        actorRole: req.user?.role,
        action: 'seller.ownership_otp.failed',
        entityType: 'sellerProfile',
        entityId: existingUser.sellerProfile?.id,
        ipAddress: req.ip,
        userAgent: req.headers['user-agent'],
        metadata: { reason: otpResult.reason, emailHash: sha256(existingUser.email) }
      });
      if (otpResult.reason === 'expired') return res.status(400).json({ message: 'OTP expired. Please request a new code.' });
      const remaining = otpResult.attemptsRemaining ?? 0;
      return res.status(400).json({
        message: remaining > 0 ? `Invalid OTP. ${remaining} attempt${remaining === 1 ? '' : 's'} remaining.` : 'Invalid OTP. Please request a new code.',
        attemptsRemaining: remaining
      });
    }
    const metadataUserId = Number((otpResult.metadata as any)?.userId);
    if (metadataUserId && metadataUserId !== userId) {
      return res.status(400).json({ message: 'OTP does not belong to this seller session.' });
    }

    // Verify dynamic mandatory documents
    const profile = existingUser.sellerProfile;
    if (!profile) return res.status(400).json({ message: 'Seller profile not found' });
    const finalSellerErrors: Record<string, string> = {};
    if (!profile.panVerified) finalSellerErrors.pan = 'Business PAN must be verified before final submission.';
    if (!onboardingPatterns.pan.test(normalizeSpaces(profile.pan).toUpperCase())) finalSellerErrors.pan = 'Business PAN must follow valid government PAN format.';
    if (!onboardingPatterns.name.test(normalizeSpaces(profile.nameAsInPan))) finalSellerErrors.nameAsInPan = 'Name as per PAN is required and must be valid.';
    if (!profile.dateAsInPan || !isPastOrToday(profile.dateAsInPan)) finalSellerErrors.dateAsInPan = 'PAN date is required and cannot be future dated.';
    if (!onboardingPatterns.orgName.test(normalizeSpaces(profile.businessName))) finalSellerErrors.businessName = 'Business / organisation name is required and must be valid.';
    if (!profile.dateOfIncorporation || !isPastOrToday(profile.dateOfIncorporation)) finalSellerErrors.dateOfIncorporation = 'Date of incorporation is required and cannot be future dated.';
    if (!profile.offices?.length) finalSellerErrors.offices = 'At least one registered office is required.';
    if (!profile.bankAccounts?.length) finalSellerErrors.bankAccounts = 'At least one bank account is required.';
    if (!profile.eInvoicingExcluded && !normalizeSpaces(profile.turnoverMax3Yrs)) finalSellerErrors.turnoverMax3Yrs = 'Turnover declaration is required unless excluded from e-invoicing.';
    if (!profile.ownershipDeclarationAccepted) finalSellerErrors.ownershipDeclarationAccepted = 'Beneficial ownership declaration must be accepted.';
    if (Object.keys(finalSellerErrors).length > 0) {
      return res.status(400).json({ message: Object.values(finalSellerErrors)[0], errors: finalSellerErrors });
    }

    const requiredDocs: string[] = ['pan_copy', 'bank_passbook', 'address_proof'];
    const regDetails = (existingUser.registrationDetails as Record<string, any>) || {};

    if (profile.isUdyamCertified || regDetails.udyamNumber) {
      requiredDocs.push('udyam_certificate');
    }

    const hasGstin = regDetails.gstin || profile.offices?.some((o: any) => o.gst);
    if (hasGstin) {
      requiredDocs.push('gst_certificate');
    }

    if (regDetails.verificationMethod === 'Aadhaar' || regDetails.aadhaarNumber) {
      requiredDocs.push('aadhaar_card');
    }

    const corporateTypes = ['Company', 'LLP', 'Partnership', 'Cooperative', 'Society', 'Trust'];
    const isCorporate = corporateTypes.some(t => String(profile.organizationType || regDetails.businessType).toLowerCase().includes(t.toLowerCase()));
    if (isCorporate && (regDetails.cinNumber || regDetails.registrationNumber || regDetails.cin)) {
      requiredDocs.push('business_registration_proof');
    }

    const uploadedDocs = profile.sellerDocuments?.map((d: any) => d.documentType) || [];
    const missingDocs = requiredDocs.filter(d => !uploadedDocs.includes(d));

    if (missingDocs.length > 0) {
      const labels: Record<string, string> = {
        pan_copy: 'PAN Card Copy',
        bank_passbook: 'Bank Passbook / Cancelled Cheque',
        address_proof: 'Address Proof',
        udyam_certificate: 'Udyam Certificate',
        gst_certificate: 'GST Certificate',
        aadhaar_card: 'Aadhaar of Authorized Person',
        business_registration_proof: 'Business Registration Proof (CIN/Shop Act)'
      };
      const missingLabels = missingDocs.map(d => labels[d] || d).join(', ');
      return res.status(400).json({ message: `Missing required documents: ${missingLabels}. Please upload them before submitting.` });
    }

    const sectionStatus = (existingUser.sectionStatus as Record<string, any>) || {};
    const sections = ['pan', 'details', 'additional', 'offices', 'bank', 'einvoicing', 'ownership', 'documents'];

    const finalSectionStatus = { ...sectionStatus };
    for (const sec of sections) {
      if (!finalSectionStatus[sec]) {
        finalSectionStatus[sec] = 'pending';
      }
    }

    if (STRICT_VERIFICATION.PAN === false) finalSectionStatus.pan = 'approved';
    if (STRICT_VERIFICATION.BANK === false) finalSectionStatus.bank = 'approved';
    if (STRICT_VERIFICATION.UDYAM === false) finalSectionStatus.additional = 'approved';

    let onboardingStatus = 'under_compliance_review';
    let registrationStatus = 'completed';

    const user = await prisma.user.update({
      where: { id: userId },
      data: {
        onboardingStatus: onboardingStatus as any,
        registrationStatus: registrationStatus as any,
        sectionStatus: {
          ...finalSectionStatus,
          submitted: true
        },
        sellerProfile: existingUser.sellerProfile
          ? {
            update: {
              ownershipDeclarationAccepted: true,
              ownershipVerified: true
            }
          }
          : undefined
      }
    });

    await consumeOtp('ownership_submission', existingUser.email);
    await auditLog({
      actorUserId: userId,
      actorRole: req.user?.role,
      action: 'seller.ownership_otp.verified',
      entityType: 'sellerProfile',
      entityId: existingUser.sellerProfile?.id,
      ipAddress: req.ip,
      userAgent: req.headers['user-agent'],
      metadata: { emailHash: sha256(existingUser.email) }
    });

    if (existingUser.onboardingStatus !== 'under_compliance_review') {
      await notifyAdminsOfApplication(existingUser, profileOrganizationName(existingUser), 'seller');
    }

    try {
      await createNotificationSafe({
        userId,
        title: 'Application Submitted for Review',
        message: 'Your seller onboarding application has been submitted for admin compliance review. You will be notified when an admin updates the status.',
        type: 'seller_application_submitted_for_review',
        priority: 'high',
        redirectUrl: '/seller/onboarding'
      });
    } catch (e) {
      console.warn('[Seller Submit] Failed to send notification:', e);
    }

    res.json({ success: true, user: toSafeUser(user) });
  } catch (err: any) {
    handleSecureRouteError(res, err);
  }
});


app.delete('/api/seller/profile/bank/:id', authenticate, authorize('seller'), async (req: AuthRequest, res) => {
  try {
    const userId = Number(req.user?.id);
    const editCheck = await ensureOnboardingEditable(userId);
    if (!editCheck.editable) return res.status(editCheck.status || 403).json({ message: editCheck.message });
    const bankId = Number(req.params.id);
    const bank = await prisma.sellerBankAccount.findUnique({
      where: { id: bankId },
      include: { sellerProfile: true }
    });
    if (!bank || bank.sellerProfile.userId !== userId) {
      return res.status(404).json({ message: 'Bank account not found' });
    }
    const accounts = await prisma.sellerBankAccount.findMany({
      where: { sellerProfileId: bank.sellerProfileId },
      orderBy: { createdAt: 'asc' }
    });
    if (accounts.length === 1) {
      return res.status(400).json({ message: 'At least one bank account must remain on the profile' });
    }

    await prisma.$transaction(async (tx) => {
      await tx.sellerBankAccount.delete({ where: { id: bankId } });
      if (bank.isPrimary) {
        const replacement = accounts.find(account => account.id !== bankId);
        if (replacement) {
          await tx.sellerBankAccount.update({
            where: { id: replacement.id },
            data: { isPrimary: true }
          });
        }
      }
    });
    const bankAccounts = await prisma.sellerBankAccount.findMany({
      where: { sellerProfileId: bank.sellerProfileId },
      orderBy: [{ isPrimary: 'desc' }, { createdAt: 'asc' }]
    });
    res.json({ success: true, bankAccounts: maskSensitive(bankAccounts) });
  } catch (err: any) {
    handleSecureRouteError(res, err);
  }
});

app.post('/api/buyer/submission/send-otp', authenticate, authorize('buyer'), otpSendRateLimit, async (req: AuthRequest, res) => {
  try {
    const userId = Number(req.user?.id);
    const user = await prisma.user.findUnique({
      where: { id: userId },
      select: { id: true, email: true, role: true }
    });
    if (!user?.email) return res.status(400).json({ message: 'Login email is not available for OTP delivery.' });

    const otp = generateOtp();
    const otpState = await storeOtp('ownership_submission', user.email, otp, { userId: user.id, action: 'buyer_final_submission' });
    const deliveryConfigured = await sendOtpEmail(user.email, otp, '[JsgSmile Portal] Buyer final submission OTP');

    await auditLog({
      actorUserId: user.id,
      actorRole: user.role,
      action: 'buyer.final_submission_otp.sent',
      entityType: 'buyerProfile',
      ipAddress: req.ip,
      userAgent: req.headers['user-agent'],
      metadata: { emailHash: sha256(user.email), deliveryConfigured }
    });
    if (!deliveryConfigured) {
      return res.status(503).json({ message: 'Email delivery is not configured. Please configure SMTP to send OTP.' });
    }

    res.json({
      success: true,
      email: user.email,
      sendsRemaining: otpState.sendsRemaining,
      deliveryConfigured
    });
  } catch (err: any) {
    handleSecureRouteError(res, err, 'Unable to send buyer final submission OTP right now.');
  }
});

app.post('/api/buyer/register', authenticate, authorize('buyer'), async (req: AuthRequest, res) => {
  try {
    if (req.user?.role !== 'buyer') return res.status(403).json({ message: 'Forbidden' });
    const userId = Number(req.user.id);
    const editCheck = await ensureOnboardingEditable(userId);
    if (!editCheck.editable) return res.status(editCheck.status || 403).json({ message: editCheck.message });
    const { password, otp: buyerSubmissionOtp, ...rawData } = req.body;
    const existingUser = await prisma.user.findUnique({
      where: { id: userId },
      include: { buyerProfile: true }
    });
    if (!existingUser) return res.status(404).json({ message: 'User not found' });
    if (!existingUser.email) return res.status(400).json({ message: 'Login email is required for OTP verification.' });

    const otp = String(buyerSubmissionOtp || '').trim();
    if (!/^\d{6}$/.test(otp)) {
      return res.status(400).json({ message: 'Enter the 6-digit OTP sent to your login email.' });
    }

    const otpResult = await verifyOtp('ownership_submission', existingUser.email, otp);
    if (!otpResult.ok) {
      await auditLog({
        actorUserId: userId,
        actorRole: req.user?.role,
        action: 'buyer.final_submission_otp.failed',
        entityType: 'buyerProfile',
        entityId: existingUser.buyerProfile?.id,
        ipAddress: req.ip,
        userAgent: req.headers['user-agent'],
        metadata: { reason: otpResult.reason, emailHash: sha256(existingUser.email) }
      });
      if (otpResult.reason === 'expired') return res.status(400).json({ message: 'OTP expired. Please request a new code.' });
      const remaining = otpResult.attemptsRemaining ?? 0;
      return res.status(400).json({
        message: remaining > 0 ? `Invalid OTP. ${remaining} attempt${remaining === 1 ? '' : 's'} remaining.` : 'Invalid OTP. Please request a new code.',
        attemptsRemaining: remaining
      });
    }
    const metadataUserId = Number((otpResult.metadata as any)?.userId);
    const metadataAction = String((otpResult.metadata as any)?.action || '');
    if ((metadataUserId && metadataUserId !== userId) || metadataAction !== 'buyer_final_submission') {
      return res.status(400).json({ message: 'OTP does not belong to this buyer submission.' });
    }

    const mobile = rawData.mobile || existingUser.mobile;
    if (!mobile) {
      return res.status(400).json({ message: 'Mobile number is required to complete buyer onboarding' });
    }
    const buyerValidationErrors = validateBuyerOnboardingPayload(rawData, mobile);
    if (Object.keys(buyerValidationErrors).length > 0) {
      return res.status(400).json({
        message: Object.values(buyerValidationErrors)[0],
        errors: buyerValidationErrors
      });
    }

    if (password || rawData.email || rawData.mobile) {
      const updateData: any = {};
      if (password) {
        const passwordValidation = validatePasswordStrength(String(password));
        if (!passwordValidation.ok) {
          return res.status(400).json({ message: 'Password does not meet security requirements', errors: passwordValidation.errors });
        }
        updateData.password = await hashPassword(password);
        updateData.passwordResetVersion = { increment: 1 };
        updateData.sessionVersion = { increment: 1 };
        updateData.lastPasswordChangeAt = new Date();
      }
      if (rawData.email) {
        const existingEmail = await prisma.user.findFirst({
          where: { email: String(rawData.email).trim().toLowerCase(), id: { not: userId } },
          select: { id: true }
        });
        if (existingEmail) return res.status(409).json({ message: 'Email address already in use. Please use unique details.' });
        updateData.email = String(rawData.email).trim().toLowerCase();
      }
      if (rawData.mobile) {
        const existingMobile = await prisma.user.findFirst({
          where: { mobile: String(mobile).trim(), id: { not: userId } },
          select: { id: true }
        });
        if (existingMobile) return res.status(409).json({ message: 'Mobile number already in use. Please use unique details.' });
        updateData.mobile = mobile;
      }
      await prisma.user.update({ where: { id: userId }, data: updateData });
    }

    // Filter only allowed fields for BuyerProfile
    const profileData: any = {
      organizationName: rawData.organizationName || existingUser.name,
      businessType: rawData.businessType || 'Private Limited Company',
      msmeType: rawData.msmeType,
      industry: rawData.industry,
      cin: rawData.cin,
      pan: rawData.pan ? normalizeSpaces(rawData.pan).toUpperCase() : rawData.pan,
      gst: rawData.gst ? normalizeSpaces(rawData.gst).toUpperCase() : rawData.gst,
      ...sensitiveProfileFields({ pan: rawData.pan, gst: rawData.gst, aadhaarNumber: rawData.aadhaarNumber }),
      website: rawData.website,
      state: rawData.state,
      district: rawData.district,
      officeZoneName: rawData.officeZoneName,
      representativeName: rawData.representativeName,
      designation: rawData.designation,
      department: rawData.department,
      email: rawData.email,
      mobile,
      alternateMobile: rawData.alternateMobile,
      aadhaarNumber: null,
      aadhaarVerified: rawData.aadhaarVerified ?? false,
      country: rawData.country,
      city: rawData.city,
      pincode: rawData.pincode,
      registeredAddress: rawData.registeredAddress,
      corporateAddress: rawData.corporateAddress,
      procurementCategories: Array.isArray(rawData.procurementCategories) ? rawData.procurementCategories : [],
      otherCategoryDetails: rawData.otherCategoryDetails,
      annualBudget: rawData.annualBudget,
      preferredMethods: Array.isArray(rawData.preferredMethods) ? rawData.preferredMethods : [],
      otherMethodDetails: rawData.otherMethodDetails,
      declarationAccepted: rawData.declaration ?? false,
      termsAccepted: rawData.agreeTerms ?? false,
      documents: rawData.documents
    };

    const sectionStatus = {
      org: 'pending',
      rep: 'pending',
      address: 'pending',
      procurement: 'pending',
      docs: 'pending',
      submitted: true
    };

    const buyerFlags = rawData.aadhaarNumber
      ? await flagDuplicateSellerIdentifiers({ userId, aadhaarNumber: rawData.aadhaarNumber })
      : [];
    const onboardingStatus = buyerFlags.length > 0 ? 'manual_review_required' : 'under_compliance_review';

    const [profile] = await prisma.$transaction([
      prisma.buyerProfile.upsert({
        where: { userId },
        update: profileData,
        create: { ...profileData, userId }
      }),
      prisma.user.update({
        where: { id: userId },
        data: {
          registrationStatus: 'completed',
          onboardingStatus: onboardingStatus as any,
          sectionStatus
        }
      })
    ]);

    if (existingUser.onboardingStatus !== 'under_compliance_review') {
      await notifyAdminsOfApplication(
        existingUser,
        normalizeSpaces(profile.organizationName || existingUser.buyerProfile?.organizationName || existingUser.name),
        'buyer'
      );
    }

    await createNotificationSafe({
      userId,
      title: 'Application Submitted for Review',
      message: 'Your buyer onboarding application has been submitted for admin compliance review. You will be notified when an admin updates the status.',
      type: 'buyer_application_submitted_for_review',
      priority: 'high',
      redirectUrl: '/buyer/onboarding'
    });

    await auditLog({
      actorUserId: userId,
      actorRole: req.user?.role,
      action: 'buyer.final_submission_otp.verified',
      entityType: 'buyerProfile',
      entityId: profile.id,
      ipAddress: req.ip,
      userAgent: req.headers['user-agent'],
      metadata: { emailHash: sha256(existingUser.email), fields: ['pan', 'gst', 'aadhaarMasked', 'aadhaarHash'] }
    });
    await consumeOtp('ownership_submission', existingUser.email);
    res.json({ success: true, profile: maskSensitive(profile) });
  } catch (err: any) {
    console.error('[Buyer Register] Failed:', err);
    handleSecureRouteError(res, err, 'Unable to save buyer onboarding. Please try again.');
  }
});

// --- Financial Workflow APIs ---
app.get('/api/purchase-orders', authenticate, authorize('buyer', 'seller', 'admin'), async (req: AuthRequest, res) => {
  try {
    const userId = Number(req.user?.id);
    const role = String(req.user?.role);
    const where = role === 'admin'
      ? {}
      : role === 'buyer'
        ? { buyerId: userId }
        : { sellerId: userId };

    const purchaseOrders = await prisma.purchaseOrder.findMany({
      where,
      include: {
        tender: { select: { id: true, tenderId: true, title: true, category: true, status: true } },
        deliveryWorkflow: true,
        inspectionRecord: true,
        invoices: { orderBy: { createdAt: 'desc' } }
      },
      orderBy: { createdAt: 'desc' },
      take: 100
    });
    res.json({ success: true, purchaseOrders: maskSensitive(purchaseOrders) });
  } catch (err: any) {
    return handleFinancialRouteError(res, err);
  }
});

app.post('/api/purchase-orders/:id/accept', authenticate, authorize('seller', 'admin'), async (req: AuthRequest, res) => {
  try {
    const purchaseOrderId = Number(req.params.id);
    if (!Number.isInteger(purchaseOrderId) || purchaseOrderId <= 0) {
      return res.status(400).json({ message: 'Invalid purchase order id' });
    }

    const key = idempotencyKeyFromRequest(req, `po-accept:${purchaseOrderId}:${req.user?.id}`);
    const result = await withIdempotency({
      req,
      userId: Number(req.user?.id),
      route: 'POST /api/purchase-orders/:id/accept',
      key,
      handler: async () => {
        const workflow = await acceptPurchaseOrderAndCreateDelivery(purchaseOrderId, financialActor(req));
        return { success: true, ...maskSensitive(workflow) };
      }
    });
    res.json(result);
  } catch (err: any) {
    return handleFinancialRouteError(res, err);
  }
});

app.post('/api/purchase-orders/:id/inspection/accept', authenticate, authorize('buyer', 'admin'), async (req: AuthRequest, res) => {
  try {
    const purchaseOrderId = Number(req.params.id);
    if (!Number.isInteger(purchaseOrderId) || purchaseOrderId <= 0) {
      return res.status(400).json({ message: 'Invalid purchase order id' });
    }

    const workflow = await acceptInspectionAndEnableInvoice(
      purchaseOrderId,
      financialActor(req),
      normalizeSpaces(req.body?.remarks)
    );
    res.json({ success: true, ...maskSensitive(workflow) });
  } catch (err: any) {
    return handleFinancialRouteError(res, err);
  }
});

app.post('/api/purchase-orders/:id/invoices', authenticate, authorize('seller', 'admin'), async (req: AuthRequest, res) => {
  try {
    const purchaseOrderId = Number(req.params.id);
    if (!Number.isInteger(purchaseOrderId) || purchaseOrderId <= 0) {
      return res.status(400).json({ message: 'Invalid purchase order id' });
    }

    const key = idempotencyKeyFromRequest(req, `invoice-submit:${purchaseOrderId}:${req.user?.id}`);
    const result = await withIdempotency({
      req,
      userId: Number(req.user?.id),
      route: 'POST /api/purchase-orders/:id/invoices',
      key,
      handler: async () => {
        const workflow = await submitInvoiceForPurchaseOrder(purchaseOrderId, financialActor(req), {
          fileAssetId: req.body?.fileAssetId ? Number(req.body.fileAssetId) : null,
          metadata: req.body?.metadata || {}
        });
        return { success: true, ...maskSensitive(workflow) };
      }
    });
    res.status(201).json(result);
  } catch (err: any) {
    return handleFinancialRouteError(res, err);
  }
});

app.get('/api/invoices', authenticate, authorize('buyer', 'seller', 'admin'), async (req: AuthRequest, res) => {
  try {
    const userId = Number(req.user?.id);
    const role = String(req.user?.role);
    const where = role === 'admin'
      ? {}
      : role === 'buyer'
        ? { buyerId: userId }
        : { sellerId: userId };

    const invoices = await prisma.invoice.findMany({
      where,
      include: {
        purchaseOrder: { select: { id: true, poNumber: true, status: true, tenderId: true } },
        payments: { orderBy: { createdAt: 'desc' } }
      },
      orderBy: { createdAt: 'desc' },
      take: 100
    });
    res.json({ success: true, invoices: maskSensitive(invoices) });
  } catch (err: any) {
    return handleFinancialRouteError(res, err);
  }
});

app.post('/api/invoices/:id/approve', authenticate, authorize('buyer', 'admin'), async (req: AuthRequest, res) => {
  try {
    const invoiceId = Number(req.params.id);
    if (!Number.isInteger(invoiceId) || invoiceId <= 0) {
      return res.status(400).json({ message: 'Invalid invoice id' });
    }

    const key = idempotencyKeyFromRequest(req, `invoice-approve:${invoiceId}:${req.user?.id}`);
    const result = await withIdempotency({
      req,
      userId: Number(req.user?.id),
      route: 'POST /api/invoices/:id/approve',
      key,
      handler: async () => {
        const workflow = await approveInvoiceAndCreatePayment(invoiceId, financialActor(req));
        return { success: true, ...maskSensitive(workflow) };
      }
    });
    res.json(result);
  } catch (err: any) {
    return handleFinancialRouteError(res, err);
  }
});

app.get('/api/escrow', authenticate, authorize('buyer', 'seller', 'admin'), async (req: AuthRequest, res) => {
  try {
    const result = await listEscrowAccounts(financialActor(req), {
      skip: Math.max(0, Number(req.query.skip || 0)),
      take: Math.min(100, Math.max(1, Number(req.query.take || req.query.pageSize || 50))),
      q: String(req.query.q || '').trim() || undefined,
      status: String(req.query.status || '').trim() || undefined
    });
    res.json({ success: true, escrowAccounts: maskSensitive(result.escrowAccounts), records: maskSensitive(result.escrowAccounts), total: result.total, skip: result.skip, take: result.take });
  } catch (err: any) {
    return handleFinancialRouteError(res, err);
  }
});

app.post('/api/escrow/:id/milestones', authenticate, authorize('buyer', 'admin'), async (req: AuthRequest, res) => {
  try {
    const escrowAccountId = Number(req.params.id);
    if (!Number.isInteger(escrowAccountId) || escrowAccountId <= 0) {
      return res.status(400).json({ message: 'Invalid escrow account id' });
    }
    const parsed = createMilestoneSchema.parse(req.body);
    const milestone = await createMilestone(financialActor(req), escrowAccountId, parsed);
    res.status(201).json({ success: true, milestone: maskSensitive(milestone) });
  } catch (err: any) {
    return handleFinancialRouteError(res, err);
  }
});

app.post('/api/milestones/:id/complete', authenticate, authorize('seller', 'admin'), async (req: AuthRequest, res) => {
  try {
    const milestoneId = Number(req.params.id);
    if (!Number.isInteger(milestoneId) || milestoneId <= 0) {
      return res.status(400).json({ message: 'Invalid milestone id' });
    }
    const milestone = await completeMilestone(financialActor(req), milestoneId);
    res.json({ success: true, milestone: maskSensitive(milestone) });
  } catch (err: any) {
    return handleFinancialRouteError(res, err);
  }
});

app.post('/api/milestones/:id/approve', authenticate, authorize('buyer', 'admin'), async (req: AuthRequest, res) => {
  try {
    const milestoneId = Number(req.params.id);
    if (!Number.isInteger(milestoneId) || milestoneId <= 0) {
      return res.status(400).json({ message: 'Invalid milestone id' });
    }
    const parsed = milestoneReasonSchema.parse(req.body || {});
    const result = await approveMilestone(financialActor(req), milestoneId, parsed.reason);
    res.json({ success: true, ...maskSensitive(result) });
  } catch (err: any) {
    return handleFinancialRouteError(res, err);
  }
});

app.post('/api/escrow/:id/freeze', authenticate, authorize('buyer', 'admin'), async (req: AuthRequest, res) => {
  try {
    const escrowAccountId = Number(req.params.id);
    if (!Number.isInteger(escrowAccountId) || escrowAccountId <= 0) {
      return res.status(400).json({ message: 'Invalid escrow account id' });
    }
    const parsed = milestoneReasonSchema.parse(req.body || {});
    const escrowAccount = await freezeEscrow(financialActor(req), escrowAccountId, parsed.reason);
    res.json({ success: true, escrowAccount: maskSensitive(escrowAccount) });
  } catch (err: any) {
    return handleFinancialRouteError(res, err);
  }
});

app.post('/api/escrow/:id/refund', authenticate, authorize('admin'), async (req: AuthRequest, res) => {
  try {
    const escrowAccountId = Number(req.params.id);
    if (!Number.isInteger(escrowAccountId) || escrowAccountId <= 0) {
      return res.status(400).json({ message: 'Invalid escrow account id' });
    }
    const parsed = milestoneReasonSchema.parse(req.body || {});
    const result = await refundEscrow(financialActor(req), escrowAccountId, parsed.reason);
    res.json({ success: true, ...maskSensitive(result) });
  } catch (err: any) {
    return handleFinancialRouteError(res, err);
  }
});

app.get('/api/payments', authenticate, authorize('buyer', 'seller', 'admin'), async (req: AuthRequest, res) => {
  try {
    const userId = Number(req.user?.id);
    const role = String(req.user?.role);
    const where = role === 'admin'
      ? {}
      : role === 'buyer'
        ? { payerId: userId }
        : { payeeId: userId };
    const skip = Math.max(0, Number(req.query.skip || 0));
    const take = Math.min(100, Math.max(1, Number(req.query.take || req.query.pageSize || 50)));
    if (req.query.status) (where as any).status = String(req.query.status);
    if (req.query.gateway) (where as any).gateway = String(req.query.gateway);
    if (req.query.q) {
      (where as any).OR = [
        { referenceId: { contains: String(req.query.q), mode: 'insensitive' } },
        { invoice: { invoiceNumber: { contains: String(req.query.q), mode: 'insensitive' } } },
        { purchaseOrder: { poNumber: { contains: String(req.query.q), mode: 'insensitive' } } },
        { payer: { email: { contains: String(req.query.q), mode: 'insensitive' } } },
        { payee: { email: { contains: String(req.query.q), mode: 'insensitive' } } }
      ];
    }

    const [payments, total] = await Promise.all([
      prisma.paymentTransaction.findMany({
        where,
        include: { ledgerEntries: { orderBy: { createdAt: 'asc' } } },
        orderBy: { createdAt: 'desc' },
        skip,
        take
      }),
      prisma.paymentTransaction.count({ where })
    ]);
    res.json({ success: true, payments: maskSensitive(payments), records: maskSensitive(payments), total, skip, take });
  } catch (err: any) {
    return handleFinancialRouteError(res, err);
  }
});

app.post('/api/payments/:id/success', authenticate, authorize('buyer', 'admin'), async (req: AuthRequest, res) => {
  try {
    const paymentId = Number(req.params.id);
    if (!Number.isInteger(paymentId) || paymentId <= 0) {
      return res.status(400).json({ message: 'Invalid payment id' });
    }
    await auditLog({
      actorUserId: Number(req.user?.id),
      actorRole: req.user?.role,
      action: 'payment.client_success_rejected',
      entityType: 'paymentTransaction',
      entityId: paymentId,
      ipAddress: req.ip,
      userAgent: req.headers['user-agent']
    });
    res.status(202).json({
      success: false,
      message: 'Payment success must be confirmed by a verified backend webhook.',
      code: 'PAYMENT_WEBHOOK_REQUIRED'
    });
  } catch (err: any) {
    return handleFinancialRouteError(res, err);
  }
});

app.post('/api/escrow/:paymentId/release', authenticate, authorize('buyer', 'admin'), async (req: AuthRequest, res) => {
  try {
    const paymentId = Number(req.params.paymentId);
    if (!Number.isInteger(paymentId) || paymentId <= 0) {
      return res.status(400).json({ message: 'Invalid payment id' });
    }

    await auditLog({
      actorUserId: Number(req.user?.id),
      actorRole: req.user?.role,
      action: 'escrow.direct_release_rejected',
      entityType: 'paymentTransaction',
      entityId: paymentId,
      ipAddress: req.ip,
      userAgent: req.headers['user-agent']
    });
    res.status(409).json({
      success: false,
      message: 'Escrow release requires milestone approval. Use /api/milestones/:id/approve.',
      code: 'MILESTONE_APPROVAL_REQUIRED'
    });
  } catch (err: any) {
    return handleFinancialRouteError(res, err);
  }
});

// --- Admin APIs ---
app.get('/api/admin/onboarding', authenticate, authorizeAdmin, async (req, res) => {
  try {
    const skip = Math.max(0, Number(req.query.skip || 0));
    const take = Math.min(100, Math.max(1, Number(req.query.take || req.query.pageSize || 50)));
    const role = String(req.query.role || '').trim();
    const status = String(req.query.status || '').trim();
    const q = String(req.query.q || '').trim();
    const pendingStatuses = ['pending', 'pending_validation', 'manual_review_required', 'under_compliance_review'];
    const where: any = { role: { in: role && ['seller', 'buyer'].includes(role) ? [role] : ['seller', 'buyer'] } };
    if (status) {
      where.onboardingStatus = status === 'review_queue' ? { in: pendingStatuses } : status;
    }
    if (q) {
      where.OR = [
        { name: { contains: q, mode: 'insensitive' } },
        { email: { contains: q, mode: 'insensitive' } },
        { sellerProfile: { businessName: { contains: q, mode: 'insensitive' } } },
        { sellerProfile: { pan: { contains: q, mode: 'insensitive' } } },
        { buyerProfile: { organizationName: { contains: q, mode: 'insensitive' } } },
        { buyerProfile: { gst: { contains: q, mode: 'insensitive' } } },
        { buyerProfile: { pan: { contains: q, mode: 'insensitive' } } }
      ];
    }
    const [users, total, statusGroups, approvedRoleGroups, flagged] = await Promise.all([
      prisma.user.findMany({
        where,
        include: {
          sellerProfile: {
            include: {
              sellerDocuments: {
                include: {
                  fileAsset: true
                }
              }
            }
          },
          buyerProfile: true,
          complianceViolations: { where: { status: 'open' }, orderBy: { createdAt: 'desc' } }
        },
        skip,
        take,
        orderBy: { createdAt: 'desc' }
      }),
      prisma.user.count({ where }),
      prisma.user.groupBy({
        by: ['onboardingStatus'],
        where: { role: { in: ['seller', 'buyer'] } },
        _count: { _all: true }
      }),
      prisma.user.groupBy({
        by: ['role'],
        where: { role: { in: ['seller', 'buyer'] }, onboardingStatus: 'approved_for_procurement' },
        _count: { _all: true }
      }),
      prisma.complianceViolation.count({
        where: { status: 'open', user: { role: { in: ['seller', 'buyer'] } } }
      })
    ]);
    const sellers = users.filter((u: any) => u.role === 'seller');
    const buyers = users.filter((u: any) => u.role === 'buyer');

    const getDocumentEntries = (documents: any) =>
      documents && typeof documents === 'object' && !Array.isArray(documents)
        ? Object.entries(documents as Record<string, any>)
        : [];
    const documentOwners = [...new Set([
      ...sellers.filter((u: any) => getDocumentEntries(u.sellerProfile?.documents).length > 0).map((u: any) => u.id),
      ...buyers.filter((u: any) => getDocumentEntries(u.buyerProfile?.documents).length > 0).map((u: any) => u.id)
    ])];
    const documentAssets = documentOwners.length > 0
      ? await prisma.fileAsset.findMany({
        where: { ownerId: { in: documentOwners }, status: 'active' },
        select: { id: true, ownerId: true, key: true, url: true, originalName: true, mimeType: true }
      })
      : [];
    const findDocumentAsset = (ownerId: number, url: string) => {
      const decodedUrl = (() => {
        try {
          return decodeURIComponent(url);
        } catch {
          return url;
        }
      })();
      return documentAssets.find(asset =>
        asset.ownerId === ownerId &&
        (asset.url === url || decodedUrl.includes(asset.key))
      );
    };
    const enrichDocuments = (ownerId: number, documents: any) => {
      if (!documents || typeof documents !== 'object' || Array.isArray(documents)) return documents;
      return Object.fromEntries(getDocumentEntries(documents).map(([key, value]) => {
        const enrichDocumentValue = (documentValue: any) => {
          const url = typeof documentValue === 'string' ? documentValue : documentValue?.url;
          const asset = typeof url === 'string' ? findDocumentAsset(ownerId, url) : null;
          return asset
            ? { url, fileId: asset.id, originalName: asset.originalName, mimeType: asset.mimeType }
            : documentValue;
        };
        return [
          key,
          Array.isArray(value) ? value.map(enrichDocumentValue) : enrichDocumentValue(value)
        ];
      }));
    };

    // Exclude passwords and format for frontend
    const formatUser = (u: any) => {
      const { password, ...rest } = u;
      const profile = u.sellerProfile || u.buyerProfile;
      return maskSensitive({
        ...rest,
        _id: u.id,
        profile: profile ? { ...profile, documents: enrichDocuments(u.id, profile.documents) } : profile,
        status: u.onboardingStatus
      });
    };

    res.json({
      sellers: sellers.map(formatUser),
      buyers: buyers.map(formatUser),
      total,
      skip,
      take,
      filters: { q, role, status, skip, take },
      summary: {
        total,
        statuses: Object.fromEntries(statusGroups.map((row: any) => [row.onboardingStatus || 'pending', row._count._all])),
        approvedRoles: Object.fromEntries(approvedRoleGroups.map((row: any) => [row.role, row._count._all])),
        flagged
      }
    });
  } catch (err: any) {
    handleSecureRouteError(res, err);
  }
});

app.post('/api/admin/status', authenticate, authorizeAdmin, async (req, res) => {
  try {
    const { userId, status, reason } = req.body;
    const updateData: any = { onboardingStatus: status };
    const numericId = Number(userId);
    const openFlags = await prisma.complianceViolation.findMany({
      where: { userId: numericId, status: 'open', severity: { in: ['medium', 'high', 'critical'] } }
    });
    if (status === 'approved_for_procurement' && openFlags.length > 0 && !normalizeSpaces(reason)) {
      return res.status(400).json({ message: 'Approval requires an admin reason while compliance flags are open.' });
    }
    const user = await prisma.user.findUnique({
      where: { id: numericId },
      include: { sellerProfile: true, buyerProfile: true }
    });
    if (!user) return res.status(404).json({ message: 'User not found' });

    if (status === 'approved_for_procurement') {
      const buyerSections = { org: 'approved', rep: 'approved', address: 'approved', procurement: 'approved', docs: 'approved' };
      const sellerSections = { pan: 'approved', details: 'approved', additional: 'approved', offices: 'approved', bank: 'approved', einvoicing: 'approved', ownership: 'approved' };

      updateData.sectionStatus = user?.role === 'buyer' ? buyerSections : sellerSections;
    }

    await prisma.user.update({ where: { id: numericId }, data: updateData });

    if (status === 'approved_for_procurement' && openFlags.length > 0) {
      await auditLog({
        actorUserId: Number((req as AuthRequest).user?.id),
        actorRole: (req as AuthRequest).user?.role,
        action: 'compliance.override.approved_flagged_profile',
        entityType: 'user',
        entityId: numericId,
        ipAddress: req.ip,
        userAgent: req.headers['user-agent'],
        metadata: { reason: normalizeSpaces(reason), flagIds: openFlags.map(flag => flag.id) }
      });
    }

    if (user.onboardingStatus !== status || ['approved_for_procurement', 'rejected', 'resubmission_required'].includes(status)) {
      const typeLabel = applicationTypeLabel(user.role);
      const actionLabel =
        status === 'approved_for_procurement' ? 'approved' :
          status === 'rejected' ? 'rejected' :
            status === 'resubmission_required' ? 'requires changes' :
              'updated';
      await createNotificationSafe({
        userId: numericId,
        title: `${typeLabel} application ${actionLabel}`,
        message: `${profileOrganizationName(user)}: ${statusMessage(status, normalizeSpaces(reason))}`,
        type: `onboarding_${status}`
      });
    }

    res.json({ success: true });
  } catch (err: any) {
    handleSecureRouteError(res, err);
  }
});

app.get('/api/vendors', authenticate, authorize('buyer', 'admin'), async (req, res) => {
  try {
    const vendors = await prisma.user.findMany({
      where: { role: 'seller', onboardingStatus: 'approved_for_procurement' },
      include: {
        sellerProfile: {
          include: {
            offices: true
          }
        }
      }
    });
    res.json(maskSensitive(vendors.map(v => {
      const { password, ...safeVendor } = v;
      if (safeVendor.sellerProfile) {
        const profileAny = safeVendor.sellerProfile as any;
        const offices = safeVendor.sellerProfile.offices || [];
        const gstOffice = offices.find((o: any) => o.gstNumber);
        profileAny.gst = gstOffice?.gstNumber || null;

        if (gstOffice) {
          profileAny.city = profileAny.city || gstOffice.city;
          profileAny.state = profileAny.state || gstOffice.state;
        } else if (offices[0]) {
          profileAny.city = profileAny.city || offices[0].city;
          profileAny.state = offices[0].state;
        }
      }
      return { ...safeVendor, _id: v.id };
    })));
  } catch (err: any) {
    handleSecureRouteError(res, err);
  }
});

app.get('/api/vendors/:id', authenticate, authorize('buyer', 'admin'), async (req, res) => {
  try {
    const vendor = await prisma.user.findUnique({
      where: { id: Number(req.params.id), role: 'seller' },
      include: {
        sellerProfile: {
          include: {
            offices: true,
            bankAccounts: true
          }
        }
      }
    });
    if (!vendor) return res.status(404).json({ message: 'Vendor not found' });
    const { password, ...vendorSafe } = vendor;
    if (vendorSafe.sellerProfile?.bankAccounts) {
      vendorSafe.sellerProfile.bankAccounts = vendorSafe.sellerProfile.bankAccounts.map((bank: any) => ({
        ...bank,
        accountNumber: bank.accountNumberMasked || maskValue(bank.accountNumber)
      }));
    }
    res.json(maskSensitive({ ...vendorSafe, _id: vendor.id }));
  } catch (err: any) {
    handleSecureRouteError(res, err);
  }
});

// --- Quote Request APIs ---
app.post('/api/quotes', authenticate, authorize('buyer'), async (req: AuthRequest, res) => {
  try {
    const { sellerId, subject, message, documentUrl, estimatedValue } = req.body;
    const buyerId = Number(req.user?.id);

    if (req.user?.role !== 'buyer') {
      return res.status(403).json({ message: 'Only buyers can request quotes' });
    }

    const quote = await (prisma.quoteRequest as any).create({
      data: {
        buyerId,
        sellerId: Number(sellerId),
        subject,
        message,
        documentUrl,
        estimatedValue: estimatedValue !== undefined && estimatedValue !== null && estimatedValue !== '' ? Number(estimatedValue) : null,
        status: 'pending'
      },
      include: { buyer: true }
    });

    if (documentUrl) {
      const match = documentUrl.match(/\/api\/files\/(\d+)/);
      const fileId = match ? Number(match[1]) : null;
      if (fileId) {
        await (prisma.fileAsset as any).updateMany({
          where: { id: fileId },
          data: { entityType: 'quote', entityId: quote.id }
        });
      } else {
        await (prisma.fileAsset as any).updateMany({
          where: { url: documentUrl },
          data: { entityType: 'quote', entityId: quote.id }
        });
      }
    }

    await createNotificationSafe({
      userId: Number(sellerId),
      title: 'New Quote Request',
      message: `Buyer ${quote.buyer.name} has requested a quote for: ${subject}`,
      type: 'quote_request'
    });

    res.status(201).json(maskSensitive(quote));
  } catch (err: any) {
    handleSecureRouteError(res, err);
  }
});

app.get('/api/quotes', authenticate, authorize('buyer', 'seller', 'admin'), async (req: AuthRequest, res) => {
  try {
    const userId = Number(req.user?.id);
    const role = req.user?.role;

    let quotes;
    if (role === 'buyer') {
      quotes = await (prisma.quoteRequest as any).findMany({
        where: { buyerId: userId },
        include: { seller: { include: { sellerProfile: true } } },
        orderBy: { createdAt: 'desc' }
      });
    } else if (role === 'seller') {
      quotes = await (prisma.quoteRequest as any).findMany({
        where: { sellerId: userId },
        include: { buyer: { include: { buyerProfile: true } } },
        orderBy: { createdAt: 'desc' }
      });
    } else {
      return res.status(403).json({ message: 'Forbidden' });
    }

    res.json(maskSensitive(quotes));
  } catch (err: any) {
    handleSecureRouteError(res, err);
  }
});

app.post('/api/admin/section-status', authenticate, authorizeAdmin, async (req, res) => {
  try {
    const { userId, section, status, rejectionReason } = req.body;

    console.log(`[Admin] Attempting update - User: ${userId}, Section: ${section}, Status: ${status}`);

    if (!userId || !section || !status) {
      console.error('!!! CRITICAL DATA MISSING FROM FRONTEND !!!', { userId, section, status });
      return res.status(400).json({ message: 'Missing required fields: userId, section, or status' });
    }

    const numericId = Number(userId);
    if (isNaN(numericId)) {
      console.error(`!!! INVALID USER ID RECEIVED !!!: ${userId}`);
      return res.status(400).json({ message: 'User ID must be a valid number' });
    }

    const user = await prisma.user.findUnique({
      where: { id: numericId },
      include: { sellerProfile: true, buyerProfile: true }
    });
    if (!user) {
      console.error(`!!! USER NOT FOUND IN DATABASE !!!: ${numericId}`);
      return res.status(404).json({ message: 'User not found' });
    }


    // Initialize status and reasons if they are null
    const currentStatus = (user.sectionStatus as Record<string, any>) || {};
    const currentReasons = (user.sectionRejectionReasons as Record<string, any>) || {};
    const previousSectionStatus = String(currentStatus[section] || '');
    const previousReason = normalizeSpaces(currentReasons[section]);

    const sectionStatus: Record<string, string> = { ...currentStatus, [section]: status };
    const sectionRejectionReasons: Record<string, string> = { ...currentReasons };

    if (status === 'rejected' || status === 'resubmission_required') {
      sectionRejectionReasons[section] = rejectionReason || '';
    } else if (status === 'approved') {
      sectionRejectionReasons[section] = '';
    }

    // Calculate overall onboarding status based on all sections
    const sections = user.role === 'buyer'
      ? ['org', 'rep', 'address', 'procurement', 'docs']
      : ['pan', 'details', 'additional', 'offices', 'bank', 'einvoicing', 'ownership', 'documents'];

    const statuses = sections.map(s => sectionStatus[s] || 'pending');

    let onboardingStatus = 'under_compliance_review';
    if (statuses.every(s => s === 'approved')) onboardingStatus = 'approved_for_procurement';
    else if (statuses.some(s => s === 'rejected')) onboardingStatus = 'rejected';
    else if (statuses.some(s => s === 'resubmission_required')) onboardingStatus = 'resubmission_required';

    console.log(`[Admin] New calculated status: ${onboardingStatus}`);

    await prisma.user.update({
      where: { id: user.id },
      data: {
        sectionStatus,
        sectionRejectionReasons,
        onboardingStatus: onboardingStatus as any
      }
    });

    // Propagate document status to individual SellerDocument records if section is documents
    if (section === 'documents' && user.sellerProfile) {
      let docStatus: 'VERIFIED' | 'REJECTED' | 'UNDER_REVIEW' | 'PENDING' | undefined;
      if (status === 'approved') {
        docStatus = 'VERIFIED';
      } else if (status === 'rejected' || status === 'resubmission_required') {
        docStatus = 'REJECTED';
      } else if (status === 'under_review') {
        docStatus = 'UNDER_REVIEW';
      } else if (status === 'pending') {
        docStatus = 'PENDING';
      }

      if (docStatus) {
        await prisma.sellerDocument.updateMany({
          where: { sellerProfileId: user.sellerProfile.id },
          data: {
            verificationStatus: docStatus,
            remarks: (docStatus === 'REJECTED') ? (rejectionReason || '') : null,
            verifiedById: req.user?.id ? Number(req.user.id) : null,
            verifiedAt: new Date()
          }
        });
      }
    }

    const label = sectionLabel(user.role, section);
    const normalizedReason = normalizeSpaces(rejectionReason);
    const sectionChanged = previousSectionStatus !== status || previousReason !== normalizedReason;
    if (sectionChanged && ['rejected', 'resubmission_required'].includes(status)) {
      await createNotificationSafe({
        userId: user.id,
        title: `${label} requires attention`,
        message: `${profileOrganizationName(user)}: ${label} has been marked as ${status.replace(/_/g, ' ')}.${normalizedReason ? ` Admin remarks: ${normalizedReason}` : ''}`,
        type: `section_${status}`
      });
    }

    if (user.onboardingStatus !== onboardingStatus && onboardingStatus === 'approved_for_procurement') {
      await createNotificationSafe({
        userId: user.id,
        title: `${applicationTypeLabel(user.role)} application approved`,
        message: `${profileOrganizationName(user)}: ${statusMessage(onboardingStatus)}`,
        type: 'onboarding_approved_for_procurement'
      });
    }

    res.json({ success: true, onboardingStatus: onboardingStatus });
  } catch (err: any) {
    console.error('--- SECTION STATUS ERROR ---');
    console.error('Message:', err.message);
    console.error('Stack:', err.stack);
    handleSecureRouteError(res, err);
  }
});

// Admin: Send Feedback/Query to Stakeholder
app.post('/api/admin/feedback', authenticate, authorizeAdmin, async (req, res) => {
  try {
    const { userId, feedback } = req.body;
    const numericId = Number(userId);
    const user = await prisma.user.findUnique({
      where: { id: numericId },
      include: { sellerProfile: true, buyerProfile: true }
    });
    if (!user) return res.status(404).json({ message: 'User not found' });

    const normalizedFeedback = normalizeSpaces(feedback);
    await prisma.user.update({
      where: { id: numericId },
      data: { adminFeedback: feedback }
    });

    if (normalizedFeedback && normalizeSpaces(user.adminFeedback) !== normalizedFeedback) {
      await notificationService.notifyWithEmail(numericId, {
        title: 'Admin feedback received',
        message: `Feedback/Remarks for ${profileOrganizationName(user)}: ${normalizedFeedback}`,
        type: 'admin_feedback',
        priority: 'high',
        redirectUrl: user.role === 'seller' ? '/seller/onboarding' : '/buyer/onboarding'
      });
    }

    res.json({ success: true });
  } catch (err: any) {
    handleSecureRouteError(res, err);
  }
});

app.get('/api/admin/stats', authenticate, authorizeAdmin, async (req, res) => {
  try {
    const pendingOnboardingStatuses = ['pending', 'pending_validation', 'manual_review_required', 'under_compliance_review'];
    const [pending, sellers, buyers, total] = await Promise.all([
      prisma.user.count({ where: { onboardingStatus: { in: pendingOnboardingStatuses as any }, role: { in: ['seller', 'buyer'] } } }),
      prisma.user.count({ where: { onboardingStatus: 'approved_for_procurement', role: 'seller' } }),
      prisma.user.count({ where: { onboardingStatus: 'approved_for_procurement', role: 'buyer' } }),
      prisma.user.count({ where: { role: { in: ['seller', 'buyer'] } } })
    ]);
    res.json({ pendingApproval: pending, activeSellers: sellers, activeBuyers: buyers, totalNetwork: total });
  } catch (err: any) {
    handleSecureRouteError(res, err);
  }
});

// --- Secure Messaging ---
app.get('/api/conversations', authenticate, async (req: AuthRequest, res) => {
  try {
    const where = req.user?.role === 'admin'
      ? {}
      : { OR: [{ buyerId: Number(req.user?.id) }, { sellerId: Number(req.user?.id) }] };
    const conversations = await prisma.conversation.findMany({
      where,
      include: {
        tender: { select: { id: true, tenderId: true, title: true, status: true } },
        buyer: { select: { id: true, name: true, role: true } },
        seller: { select: { id: true, name: true, role: true } },
        messages: { orderBy: { createdAt: 'desc' }, take: 1 }
      },
      orderBy: { lastMessageAt: 'desc' }
    });
    res.json(maskSensitive(conversations));
  } catch (err: any) {
    handleSecureRouteError(res, err, 'Unable to load conversations');
  }
});

app.post('/api/conversations', authenticate, authorize('buyer', 'seller', 'admin'), async (req: AuthRequest, res) => {
  try {
    await consumeActionBudget(req, 'messages', 20, 60);
    const payload = parseSchema(conversationCreateSchema, req.body);
    const actor = req.user!;
    let buyerId = payload.buyerId;
    let sellerId = payload.sellerId;
    let tender: any = null;

    if (payload.tenderId) {
      tender = await prisma.tender.findUnique({ where: { id: payload.tenderId } });
      if (!tender) return res.status(404).json({ message: 'Tender not found' });
      buyerId = tender.buyerId;
      if (actor.role === 'seller') {
        if (!['published', 'bid_submission'].includes(String(tender.status))) {
          return res.status(404).json({ message: 'Tender not found' });
        }
        sellerId = Number(actor.id);
      }
    }

    if (actor.role === 'buyer') buyerId = Number(actor.id);
    if (actor.role === 'seller') sellerId = Number(actor.id);
    if (!buyerId || !sellerId || buyerId === sellerId) {
      return res.status(400).json({ message: 'Valid buyer and seller are required' });
    }

    const buyer = await prisma.user.findFirst({ where: { id: buyerId, role: 'buyer' }, select: { id: true } });
    const seller = await prisma.user.findFirst({ where: { id: sellerId, role: 'seller' }, select: { id: true } });
    if (!buyer || !seller) return res.status(400).json({ message: 'Valid buyer and seller are required' });

    const conversation = payload.tenderId
      ? await prisma.conversation.upsert({
        where: { conversationTenderPair: { tenderId: payload.tenderId, buyerId, sellerId } } as any,
        update: { subject: sanitizePortalText(payload.subject, 160) },
        create: {
          tenderId: payload.tenderId,
          buyerId,
          sellerId,
          subject: sanitizePortalText(payload.subject, 160),
          lastMessageAt: payload.initialMessage ? new Date() : null
        }
      })
      : await prisma.conversation.create({
        data: { buyerId, sellerId, subject: sanitizePortalText(payload.subject, 160), lastMessageAt: payload.initialMessage ? new Date() : null }
      });

    let message = null;
    if (payload.initialMessage) {
      await assertFileAssetsAccessible(payload.fileAssetIds || [], actor);
      message = await prisma.message.create({
        data: {
          conversationId: conversation.id,
          senderId: Number(actor.id),
          content: sanitizePortalText(payload.initialMessage, 2000),
          attachments: {
            create: (payload.fileAssetIds || []).map(fileAssetId => ({ fileAssetId }))
          }
        },
        include: { attachments: true }
      });
    }

    const recipientId = Number(actor.id) === buyerId ? sellerId : buyerId;
    await createNotificationSafe({
      userId: recipientId,
      title: message ? 'New procurement question' : 'New procurement conversation',
      message: message
        ? `A new question or message was sent for ${conversation.subject}.`
        : `A new procurement conversation was opened for ${conversation.subject}.`,
      type: 'message_received',
      redirectUrl: recipientId === sellerId ? '/seller/messages' : '/buyer/messages'
    });
    await auditLog({
      actorUserId: Number(actor.id),
      actorRole: actor.role,
      action: message ? 'message.sent' : 'conversation.created',
      entityType: 'conversation',
      entityId: conversation.id,
      ipAddress: req.ip,
      userAgent: req.headers['user-agent'],
      metadata: { tenderId: payload.tenderId, recipientId }
    });
    res.status(201).json(maskSensitive({ conversation, message }));
  } catch (err: any) {
    handleSecureRouteError(res, err, 'Unable to create conversation');
  }
});

app.get('/api/conversations/:id', authenticate, async (req: AuthRequest, res) => {
  try {
    const conversation = await prisma.conversation.findUnique({
      where: { id: Number(req.params.id) },
      include: {
        tender: { select: { id: true, tenderId: true, title: true, status: true } },
        buyer: { select: { id: true, name: true, role: true } },
        seller: { select: { id: true, name: true, role: true } },
        messages: { include: { attachments: true, sender: { select: { id: true, name: true, role: true } } }, orderBy: { createdAt: 'asc' } }
      }
    });
    if (!conversation || !canAccessConversation(conversation, req.user!)) return res.status(404).json({ message: 'Conversation not found' });
    res.json(maskSensitive(conversation));
  } catch (err: any) {
    handleSecureRouteError(res, err, 'Unable to load conversation');
  }
});

app.post('/api/conversations/:id/messages', authenticate, async (req: AuthRequest, res) => {
  try {
    await consumeActionBudget(req, 'messages', 20, 60);
    const payload = parseSchema(messageCreateSchema, req.body);
    const conversation = await prisma.conversation.findUnique({ where: { id: Number(req.params.id) } });
    if (!conversation || !canAccessConversation(conversation, req.user!)) return res.status(404).json({ message: 'Conversation not found' });
    await assertFileAssetsAccessible(payload.fileAssetIds || [], req.user!);

    const message = await prisma.message.create({
      data: {
        conversationId: conversation.id,
        senderId: Number(req.user?.id),
        content: sanitizePortalText(payload.content, 2000),
        attachments: { create: (payload.fileAssetIds || []).map(fileAssetId => ({ fileAssetId })) }
      },
      include: { attachments: true, sender: { select: { id: true, name: true, role: true } } }
    });
    await prisma.conversation.update({ where: { id: conversation.id }, data: { lastMessageAt: new Date() } });
    const recipientId = Number(req.user?.id) === conversation.buyerId ? conversation.sellerId : conversation.buyerId;
    await createNotificationSafe({
      userId: recipientId,
      title: 'New procurement question',
      message: `A new question or message was sent for ${conversation.subject}.`,
      type: 'message_received',
      redirectUrl: recipientId === conversation.sellerId ? '/seller/messages' : '/buyer/messages'
    });
    await auditLog({
      actorUserId: Number(req.user?.id),
      actorRole: req.user?.role,
      action: 'message.sent',
      entityType: 'message',
      entityId: message.id,
      ipAddress: req.ip,
      userAgent: req.headers['user-agent'],
      metadata: { conversationId: conversation.id, recipientId }
    });
    res.status(201).json(maskSensitive(message));
  } catch (err: any) {
    handleSecureRouteError(res, err, 'Unable to send message');
  }
});

// --- Secure Disputes ---
app.get('/api/disputes', authenticate, async (req: AuthRequest, res) => {
  try {
    const where = req.user?.role === 'admin'
      ? {}
      : { OR: [{ buyerId: Number(req.user?.id) }, { sellerId: Number(req.user?.id) }, { raisedById: Number(req.user?.id) }] };
    const disputes = await prisma.dispute.findMany({
      where,
      include: { buyer: { select: { id: true, name: true, role: true } }, seller: { select: { id: true, name: true, role: true } } },
      orderBy: { updatedAt: 'desc' }
    });
    res.json(maskSensitive(disputes));
  } catch (err: any) {
    handleSecureRouteError(res, err, 'Unable to load disputes');
  }
});

app.post('/api/disputes', authenticate, authorize('buyer', 'seller', 'admin'), async (req: AuthRequest, res) => {
  try {
    await consumeActionBudget(req, 'disputes', 5, 3600);
    const payload = parseSchema(disputeCreateSchema, req.body);
    const parties = await resolveDisputeParties(payload, req.user!);
    if (req.user?.role !== 'admin' && ![parties.buyerId, parties.sellerId].includes(Number(req.user?.id))) {
      return res.status(404).json({ message: 'Related procurement record not found' });
    }
    await assertFileAssetsAccessible(payload.evidenceFileIds || [], req.user!);

    const result = await prisma.$transaction(async (tx) => {
      const dispute = await tx.dispute.create({
        data: {
          ...parties,
          raisedById: Number(req.user?.id),
          category: sanitizePortalText(payload.category, 80),
          reason: sanitizePortalText(payload.reason, 4000),
          evidence: { create: (payload.evidenceFileIds || []).map(fileAssetId => ({ fileAssetId, uploadedById: Number(req.user?.id) })) }
        },
        include: { evidence: true }
      });
      if (parties.escrowAccountId) {
        await tx.escrowAccount.update({
          where: { id: parties.escrowAccountId },
          data: { status: 'frozen', frozenAt: new Date(), version: { increment: 1 } }
        }).catch(() => undefined);
      } else if (parties.purchaseOrderId) {
        await tx.escrowAccount.updateMany({
          where: { purchaseOrderId: parties.purchaseOrderId, status: { in: ['held', 'funded'] } },
          data: { status: 'frozen', frozenAt: new Date(), version: { increment: 1 } }
        });
      }
      return dispute;
    });

    await Promise.all([parties.buyerId, parties.sellerId].filter(id => id !== Number(req.user?.id)).map(userId =>
      createNotificationSafe({ userId, title: 'Dispute opened', message: `A dispute has been opened for a procurement transaction.`, type: 'dispute_created' })
    ));
    await auditLog({
      actorUserId: Number(req.user?.id),
      actorRole: req.user?.role,
      action: 'dispute.created',
      entityType: 'dispute',
      entityId: result.id,
      ipAddress: req.ip,
      userAgent: req.headers['user-agent'],
      metadata: maskSensitive(parties)
    });
    res.status(201).json(maskSensitive(result));
  } catch (err: any) {
    handleSecureRouteError(res, err, 'Unable to create dispute');
  }
});

app.get('/api/disputes/:id', authenticate, async (req: AuthRequest, res) => {
  try {
    const dispute = await prisma.dispute.findUnique({
      where: { id: Number(req.params.id) },
      include: {
        messages: { include: { sender: { select: { id: true, name: true, role: true } } }, orderBy: { createdAt: 'asc' } },
        evidence: true
      }
    });
    if (!dispute || !canAccessDispute(dispute, req.user!)) return res.status(404).json({ message: 'Dispute not found' });
    const response = req.user?.role === 'admin' ? dispute : { ...dispute, messages: dispute.messages.filter(message => !message.internal) };
    res.json(maskSensitive(response));
  } catch (err: any) {
    handleSecureRouteError(res, err, 'Unable to load dispute');
  }
});

app.post('/api/disputes/:id/messages', authenticate, async (req: AuthRequest, res) => {
  try {
    await consumeActionBudget(req, 'dispute_messages', 15, 60);
    const payload = parseSchema(disputeMessageSchema, req.body);
    const dispute = await prisma.dispute.findUnique({ where: { id: Number(req.params.id) } });
    if (!dispute || !canAccessDispute(dispute, req.user!)) return res.status(404).json({ message: 'Dispute not found' });
    if (payload.internal && req.user?.role !== 'admin') return res.status(403).json({ message: 'Only admins can post internal notes' });
    await assertFileAssetsAccessible(payload.evidenceFileIds || [], req.user!);

    const message = await prisma.disputeMessage.create({
      data: { disputeId: dispute.id, senderId: Number(req.user?.id), content: sanitizePortalText(payload.content, 3000), internal: Boolean(payload.internal) }
    });
    if ((payload.evidenceFileIds || []).length > 0) {
      await prisma.disputeEvidence.createMany({
        data: (payload.evidenceFileIds || []).map(fileAssetId => ({ disputeId: dispute.id, fileAssetId, uploadedById: Number(req.user?.id) }))
      });
    }
    await auditLog({ actorUserId: Number(req.user?.id), actorRole: req.user?.role, action: 'dispute.message_sent', entityType: 'dispute', entityId: dispute.id, ipAddress: req.ip, userAgent: req.headers['user-agent'] });
    res.status(201).json(maskSensitive(message));
  } catch (err: any) {
    handleSecureRouteError(res, err, 'Unable to send dispute message');
  }
});

app.put('/api/disputes/:id/status', authenticate, authorizeAdmin, async (req: AuthRequest, res) => {
  try {
    const payload = parseSchema(disputeStatusSchema, req.body);
    if (['resolved', 'rejected', 'closed'].includes(payload.status) && !payload.remarks) {
      return res.status(400).json({ message: 'Admin remarks are required' });
    }
    const dispute = await prisma.dispute.update({
      where: { id: Number(req.params.id) },
      data: {
        status: payload.status,
        resolutionRemarks: payload.remarks ? sanitizePortalText(payload.remarks, 1000) : undefined,
        resolvedById: ['resolved', 'rejected', 'closed'].includes(payload.status) ? Number(req.user?.id) : undefined,
        resolvedAt: ['resolved', 'rejected', 'closed'].includes(payload.status) ? new Date() : undefined
      }
    });
    await auditLog({ actorUserId: Number(req.user?.id), actorRole: req.user?.role, action: 'dispute.resolved', entityType: 'dispute', entityId: dispute.id, ipAddress: req.ip, userAgent: req.headers['user-agent'], metadata: { status: payload.status } });
    res.json(maskSensitive(dispute));
  } catch (err: any) {
    handleSecureRouteError(res, err, 'Unable to update dispute');
  }
});

// --- Secure Grievances ---
app.get('/api/grievances', authenticate, async (req: AuthRequest, res) => {
  try {
    const where = req.user?.role === 'admin' ? {} : { userId: Number(req.user?.id) };
    const grievances = await prisma.grievanceTicket.findMany({ where, orderBy: { updatedAt: 'desc' } });
    res.json(maskSensitive(grievances));
  } catch (err: any) {
    handleSecureRouteError(res, err, 'Unable to load grievances');
  }
});

app.post('/api/grievances', authenticate, async (req: AuthRequest, res) => {
  try {
    await consumeActionBudget(req, 'grievances', 5, 3600);
    const payload = parseSchema(grievanceCreateSchema, req.body);
    await assertFileAssetsAccessible(payload.fileAssetIds || [], req.user!);
    const grievance = await prisma.grievanceTicket.create({
      data: {
        userId: Number(req.user?.id),
        category: sanitizePortalText(payload.category, 80),
        subject: sanitizePortalText(payload.subject, 160),
        description: sanitizePortalText(payload.description, 4000),
        priority: payload.priority,
        slaDueAt: grievanceSlaDueAt(payload.priority),
        attachments: { create: (payload.fileAssetIds || []).map(fileAssetId => ({ fileAssetId, uploadedById: Number(req.user?.id) })) }
      },
      include: { attachments: true }
    });
    const admins = await prisma.user.findMany({ where: { role: 'admin' }, select: { id: true } });
    await Promise.all(admins.map(admin => createNotificationSafe({ userId: admin.id, title: 'New grievance ticket', message: `A new grievance was submitted: ${grievance.subject}.`, type: 'grievance_created' })));
    await auditLog({ actorUserId: Number(req.user?.id), actorRole: req.user?.role, action: 'grievance.created', entityType: 'grievance', entityId: grievance.id, ipAddress: req.ip, userAgent: req.headers['user-agent'], metadata: { priority: payload.priority } });
    res.status(201).json(maskSensitive(grievance));
  } catch (err: any) {
    handleSecureRouteError(res, err, 'Unable to create grievance');
  }
});

app.get('/api/grievances/:id', authenticate, async (req: AuthRequest, res) => {
  try {
    const grievance = await prisma.grievanceTicket.findUnique({
      where: { id: Number(req.params.id) },
      include: { comments: { orderBy: { createdAt: 'asc' } }, attachments: true }
    });
    if (!grievance || !canAccessGrievance(grievance, req.user!)) return res.status(404).json({ message: 'Grievance not found' });
    const response = req.user?.role === 'admin' ? grievance : { ...grievance, comments: grievance.comments.filter(comment => !comment.internal) };
    res.json(maskSensitive(response));
  } catch (err: any) {
    handleSecureRouteError(res, err, 'Unable to load grievance');
  }
});

app.post('/api/grievances/:id/comments', authenticate, async (req: AuthRequest, res) => {
  try {
    await consumeActionBudget(req, 'grievance_comments', 15, 60);
    const payload = parseSchema(grievanceCommentSchema, req.body);
    const grievance = await prisma.grievanceTicket.findUnique({ where: { id: Number(req.params.id) } });
    if (!grievance || !canAccessGrievance(grievance, req.user!)) return res.status(404).json({ message: 'Grievance not found' });
    if (payload.internal && req.user?.role !== 'admin') return res.status(403).json({ message: 'Only admins can post internal notes' });
    await assertFileAssetsAccessible(payload.fileAssetIds || [], req.user!);
    const comment = await prisma.grievanceComment.create({
      data: { grievanceId: grievance.id, authorId: Number(req.user?.id), content: sanitizePortalText(payload.content, 3000), internal: Boolean(payload.internal) }
    });
    if ((payload.fileAssetIds || []).length > 0) {
      await prisma.grievanceAttachment.createMany({
        data: (payload.fileAssetIds || []).map(fileAssetId => ({ grievanceId: grievance.id, fileAssetId, uploadedById: Number(req.user?.id) }))
      });
    }
    await auditLog({ actorUserId: Number(req.user?.id), actorRole: req.user?.role, action: 'grievance.comment_added', entityType: 'grievance', entityId: grievance.id, ipAddress: req.ip, userAgent: req.headers['user-agent'] });
    res.status(201).json(maskSensitive(comment));
  } catch (err: any) {
    handleSecureRouteError(res, err, 'Unable to add grievance comment');
  }
});

app.put('/api/grievances/:id/assign', authenticate, authorizeAdmin, async (req: AuthRequest, res) => {
  try {
    const payload = parseSchema(grievanceAssignSchema, req.body);
    const admin = await prisma.user.findFirst({ where: { id: payload.assignedAdminId, role: 'admin' }, select: { id: true } });
    if (!admin) return res.status(400).json({ message: 'Assignee must be an admin' });
    const grievance = await prisma.grievanceTicket.update({
      where: { id: Number(req.params.id) },
      data: { assignedAdminId: admin.id, status: 'assigned' }
    });
    await createNotificationSafe({ userId: grievance.userId, title: 'Grievance assigned', message: `Your grievance ${grievance.subject} has been assigned for review.`, type: 'grievance_assigned' });
    await auditLog({ actorUserId: Number(req.user?.id), actorRole: req.user?.role, action: 'grievance.assigned', entityType: 'grievance', entityId: grievance.id, ipAddress: req.ip, userAgent: req.headers['user-agent'], metadata: { assignedAdminId: admin.id, remarks: payload.remarks } });
    res.json(maskSensitive(grievance));
  } catch (err: any) {
    handleSecureRouteError(res, err, 'Unable to assign grievance');
  }
});

app.put('/api/grievances/:id/status', authenticate, authorizeAdmin, async (req: AuthRequest, res) => {
  try {
    const payload = parseSchema(grievanceStatusSchema, req.body);
    if (['resolved', 'closed', 'rejected'].includes(payload.status) && !payload.remarks) {
      return res.status(400).json({ message: 'Admin remarks are required' });
    }
    const grievance = await prisma.grievanceTicket.update({
      where: { id: Number(req.params.id) },
      data: {
        status: payload.status,
        resolutionRemarks: payload.remarks ? sanitizePortalText(payload.remarks, 1000) : undefined,
        resolvedAt: ['resolved', 'closed', 'rejected'].includes(payload.status) ? new Date() : undefined
      }
    });
    await createNotificationSafe({ userId: grievance.userId, title: 'Grievance updated', message: `Your grievance ${grievance.subject} is now ${payload.status.replace(/_/g, ' ')}.`, type: 'grievance_status_updated' });
    await auditLog({ actorUserId: Number(req.user?.id), actorRole: req.user?.role, action: 'grievance.resolved', entityType: 'grievance', entityId: grievance.id, ipAddress: req.ip, userAgent: req.headers['user-agent'], metadata: { status: payload.status } });
    res.json(maskSensitive(grievance));
  } catch (err: any) {
    handleSecureRouteError(res, err, 'Unable to update grievance');
  }
});

app.get('/api/quotes/:id', authenticate, authorize('buyer', 'seller', 'admin'), async (req: AuthRequest, res) => {
  try {
    const quoteId = Number(req.params.id);
    const allowed = await checkOwnership('quote', quoteId, req.user!);
    if (!allowed) return res.status(404).json({ message: 'Quote not found' });

    const quote = await prisma.quoteRequest.findUnique({
      where: { id: quoteId },
      include: {
        buyer: { include: { buyerProfile: true } },
        seller: { include: { sellerProfile: true } }
      }
    });
    if (!quote) return res.status(404).json({ message: 'Quote not found' });
    res.json(maskSensitive(quote));
  } catch (err: any) {
    await auditLog({
      action: 'auth.otp.failed',
      entityType: 'auth',
      ipAddress: req.ip,
      userAgent: req.headers['user-agent'],
      metadata: { reason: err?.code || 'verify_email_otp_error' }
    });
    handleSecureRouteError(res, err, 'Unable to verify OTP right now. Please try again.');
  }
});

app.post('/api/admin/users/:id/unlock', authenticate, authorizeAdmin, async (req: AuthRequest, res) => {
  try {
    const userId = Number(req.params.id);
    if (!userId) return res.status(400).json({ message: 'Invalid user id' });

    const user = await prisma.user.update({
      where: { id: userId },
      data: { failedLoginCount: 0, lockedUntil: null }
    });

    await auditLog({
      actorUserId: Number(req.user?.id),
      actorRole: req.user?.role,
      action: 'auth.account.unlocked_by_admin',
      entityType: 'user',
      entityId: user.id,
      ipAddress: req.ip,
      userAgent: req.headers['user-agent']
    });
    res.json({ success: true });
  } catch (err: any) {
    handleSecureRouteError(res, err);
  }
});

app.get('/api/notifications/stream', async (req, res) => {
  const unauthorizedAuditAction = 'security.unauthorized_access';
  try {
    const token = String(req.query.token || '').trim();
    if (!token) throw new ApiError(401, 'Authentication token is required', 'AUTH_TOKEN_MISSING');

    let decoded;
    try {
      decoded = verifyAccessToken(token);
    } catch (jwtErr: any) {
      throw new ApiError(401, jwtErr.name === 'TokenExpiredError' ? 'Authentication token expired' : 'Invalid authentication token', 'AUTH_TOKEN_INVALID');
    }
    const userId = Number(decoded.id);
    const sessionVersion = Number(decoded.sessionVersion);
    if (!userId || Number.isNaN(sessionVersion)) throw new ApiError(401, 'Invalid authentication token', 'AUTH_TOKEN_INVALID');

    const user = await prisma.user.findUnique({
      where: { id: userId },
      select: { id: true, role: true, sessionVersion: true, lockedUntil: true }
    });
    if (!user || user.sessionVersion !== sessionVersion || user.role !== decoded.role) {
      throw new ApiError(401, 'Session expired. Please sign in again.', 'SESSION_INVALID');
    }
    if (user.lockedUntil && user.lockedUntil > new Date()) {
      throw new ApiError(423, 'Account is temporarily locked', 'ACCOUNT_LOCKED');
    }

    req.socket.setKeepAlive(true);
    res.writeHead(200, {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache, no-transform',
      Connection: 'keep-alive',
      'X-Accel-Buffering': 'no'
    });
    res.flushHeaders?.();
    res.write('retry: 1000\n');
    res.write('event: connected\n');
    res.write('data: {"ok":true}\n\n');

    const clients = notificationClients.get(userId) || new Set<Response>();
    clients.add(res);
    notificationClients.set(userId, clients);

    let closed = false;
    const cleanup = () => {
      if (closed) return;
      closed = true;
      clearInterval(heartbeat);
      clearTimeout(timeoutId);
      clients.delete(res);
      if (clients.size === 0) notificationClients.delete(userId);
    };

    const heartbeat = setInterval(() => {
      if (closed || res.destroyed || res.writableEnded) {
        cleanup();
        return;
      }
      try {
        res.write('event: heartbeat\n');
        res.write('data: {}\n\n');
      } catch {
        cleanup();
      }
    }, 25000);

    // Prevent Vercel Serverless Function timeout (300 seconds limit)
    // by gracefully closing the connection after 30 seconds.
    // The frontend EventSource client will automatically reconnect after 1 second because of 'retry: 1000'.
    const timeoutId = setTimeout(() => {
      if (!closed && !res.destroyed && !res.writableEnded) {
        res.write('event: close\n');
        res.write('data: {"closed":true}\n\n');
        res.end();
      }
      cleanup();
    }, 30000);

    req.on('close', cleanup);
    res.on('error', cleanup);
  } catch (err: any) {
    await auditLog({
      action: unauthorizedAuditAction,
      entityType: 'notifications',
      ipAddress: req.ip,
      userAgent: req.headers['user-agent'],
      metadata: { path: req.originalUrl, reason: err?.code || 'notification_stream_auth_failed' }
    });
    return handleSecureRouteError(res, err, 'Notification stream authentication failed');
  }
});

app.get('/api/notifications', authenticate, async (req: AuthRequest, res) => {
  try {
    const currentUserId = Number(req.user?.id);
    await archiveExpiredReadNotifications(currentUserId);
    const notifications = await prisma.notification.findMany({
      where: { userId: currentUserId, isArchived: false },
      orderBy: { createdAt: 'desc' },
      take: 50
    });
    res.json(maskSensitive(notifications));
  } catch (err: any) {
    handleSecureRouteError(res, err, 'Unable to load notifications');
  }
});

app.post('/api/notifications/read-all', authenticate, async (req: AuthRequest, res) => {
  try {
    const currentUserId = Number(req.user?.id);
    const unread = await prisma.notification.findMany({
      where: { userId: currentUserId, isRead: false, isArchived: false },
      select: { id: true }
    });
    await prisma.notification.updateMany({
      where: { userId: currentUserId, isRead: false, isArchived: false },
      data: { isRead: true }
    });
    await recordNotificationRead(currentUserId, unread.map(item => item.id));
    res.json({ success: true, expiresAfterReadHours: 24 });
  } catch (err: any) {
    handleSecureRouteError(res, err, 'Unable to update notifications');
  }
});

app.post('/api/notifications/:id/read', authenticate, async (req: AuthRequest, res) => {
  try {
    const currentUserId = Number(req.user?.id);
    const notification = await prisma.notification.findFirst({
      where: { id: Number(req.params.id), userId: currentUserId, isArchived: false }
    });
    if (!notification) return res.status(404).json({ message: 'Notification not found' });
    const updated = await prisma.notification.update({ where: { id: notification.id }, data: { isRead: true } });
    if (!notification.isRead) await recordNotificationRead(currentUserId, [notification.id]);
    res.json(maskSensitive(updated));
  } catch (err: any) {
    handleSecureRouteError(res, err, 'Unable to update notification');
  }
});

const startListening = (port: number) => {
  const server = app.listen(port, () => {
    logger.info({ port }, 'Server running');
  });

  server.on('error', (err: any) => {
    if (err?.code === 'EADDRINUSE') {
      const nextPort = port + 1;
      console.warn(`Port ${port} is in use. Retrying on port ${nextPort}...`);
      startListening(nextPort);
      return;
    }
    console.error('Server failed to start:', err);
  });
};

app.use(errorHandler);

export async function startServer() {
  await connectRedis().catch(error => {
    console.error('[Redis] continuing without Redis connection', error instanceof Error ? error.message : error);
  });

  if (redis && isRedisReady()) {
    try {
      const subClient = redis.duplicate();
      subClient.on('error', (err) => {
        logger.warn({ err }, 'Redis subscription client error');
      });
      await subClient.connect().catch((err) => {
        logger.warn({ err }, 'Redis subscription client connect failed');
      });
      if (subClient.status === 'ready') {
        const pattern = `*notifications:user:*`;
        subClient.on('pmessage', (pattern, channel, message) => {
          try {
            const parts = channel.split(':');
            const userIdIndex = parts.indexOf('user');
            if (userIdIndex !== -1 && parts[userIdIndex + 1]) {
              const userId = parseInt(parts[userIdIndex + 1], 10);
              if (!isNaN(userId)) {
                const notification = JSON.parse(message);
                emitNotification(userId, notification);
              }
            }
          } catch (err) {
            logger.warn({ err, message }, 'Failed to parse pattern notification message');
          }
        });
        await subClient.psubscribe(pattern);
        logger.info({ pattern }, 'Subscribed to Redis notifications channel pattern');
      }
    } catch (err) {
      logger.warn({ err }, 'Failed to initialize Redis subscription');
    }
  }

  const PORT = env.PORT;
  startListening(PORT);

  const auctionFinalizerInterval = setInterval(() => {
    void finalizeEndedAuctionsJob().catch(error =>
      console.warn('[AuctionFinalizer] Failed:', error instanceof Error ? error.message : error)
    );
  }, 60_000);
  auctionFinalizerInterval.unref?.();
  void finalizeEndedAuctionsJob().catch(error =>
    console.warn('[AuctionFinalizer] Initial run failed:', error instanceof Error ? error.message : error)
  );

  // Neon serverless DB keepalive: a tiny query every 90 seconds prevents
  // the database from auto-suspending, which is what causes 8-12s cold starts
  // and makes interactive transactions blow past their 5s default timeout.
  // We fire one ping immediately on startup so the very first user request
  // never hits a cold compute.
  if (process.env.NODE_ENV !== 'production' || process.env.DB_KEEPALIVE === 'true') {
    const ping = () => prisma.$queryRawUnsafe('SELECT 1').catch(error =>
      logger.warn({ err: error }, 'DB keepalive ping failed')
    );
    void ping(); // immediate warm-up
    const dbKeepaliveInterval = setInterval(() => { void ping(); }, 90_000);
    dbKeepaliveInterval.unref?.();
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  startServer().catch(err => {
    console.error("Critical error:", err);
    process.exit(1);
  });
}

