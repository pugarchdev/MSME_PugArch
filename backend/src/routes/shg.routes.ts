import { Router, type Request, type Response } from 'express';
import { z } from 'zod';
import prisma from '../lib/prisma.js';
import { env } from '../config/env.js';
import { authenticate, authorize, type AuthRequest } from '../middleware/auth.js';
import { apiResponse } from '../utils/apiResponse.js';
import { createHashFingerprint, sha256 } from '../utils/crypto.js';
import { hashPassword, validatePasswordStrength } from '../services/password.service.js';
import {
  assertEmailOtpVerified,
  assertOtpVerified,
  consumeEmailOtp,
  consumeOtp,
  generateOtp,
  storeEmailOtp,
  storeOtp,
  verifyEmailOtp,
  verifyOtp
} from '../services/otp.service.js';
import { sendOtpEmail } from '../services/mail.service.js';
import { issueCookieAuth } from '../services/auth-cookie.service.js';
import { toSafeUser } from '../utils/routeHelpers.js';
import { deleteCache, invalidateByPattern } from '../services/cache.service.js';
import { redisKeys } from '../constants/redis-keys.js';
import { getDefaultCompanyId } from '../services/default-company.service.js';

const router = Router();

const mobileRegex = /^[6-9]\d{9}$/;
const panRegex = /^[A-Z]{5}[0-9]{4}[A-Z]$/;
const gstinRegex = /^[0-9]{2}[A-Z]{5}[0-9]{4}[A-Z][1-9A-Z]Z[0-9A-Z]$/;
const udyamRegex = /^UDYAM-[A-Z]{2}-\d{2}-\d{7}$/;
const ifscRegex = /^[A-Z]{4}0[A-Z0-9]{6}$/;
const aadhaarOrVidRegex = /^(\d{12}|\d{16})$/;
const allowedMimeTypes = new Set(['application/pdf', 'image/jpeg', 'image/jpg', 'image/png']);
const maxFileSize = 10 * 1024 * 1024;

const shgTypes = [
  'WOMEN_SHG',
  'FARMER_PRODUCER_GROUP',
  'ARTISAN_HANDICRAFT_SHG',
  'DAIRY_COOPERATIVE_SHG',
  'LIVELIHOOD_SHG',
  'TRIBAL_SHG',
  'YOUTH_SHG',
  'OTHER_SHG'
] as const;

const officeRoles = [
  'PRESIDENT',
  'SECRETARY',
  'TREASURER',
  'LEADER',
  'COORDINATOR',
  'AUTHORIZED_REPRESENTATIVE',
  'MEMBER',
  'OTHER'
] as const;

const documentTypes = [
  'LEADER_KYC',
  'BANK_PASSBOOK',
  'MEMBER_LIST',
  'ADDRESS_PROOF',
  'FORMATION_RESOLUTION',
  'AUTHORIZATION_LETTER',
  'REGISTRATION_CERTIFICATE',
  'PAN_CARD',
  'UDYAM_CERTIFICATE',
  'GST_CERTIFICATE',
  'NRLM_SRLM_CERTIFICATE',
  'TRAINING_CERTIFICATE',
  'PRODUCT_CATALOGUE',
  'ACTIVITY_CERTIFICATE',
  'MEETING_REGISTER',
  'BANK_STATEMENT',
  'OTHER'
] as const;

const clean = (value: unknown) => String(value ?? '').trim();
const upper = (value: unknown) => clean(value).toUpperCase();
const normalizeEmail = (value: unknown) => clean(value).toLowerCase();
const last4 = (value: string) => value.replace(/\D/g, '').slice(-4);
const maskAadhaar = (value: string) => {
  const suffix = last4(value);
  return value.replace(/\D/g, '').length === 16 ? `VID XXXX XXXX ${suffix}` : `XXXX XXXX ${suffix}`;
};
const maskAccount = (value: string) => `XXXX${last4(value)}`;
const safeShgInclude = {
  organization: true,
  representativeVerifications: true,
  members: true,
  bankAccounts: true,
  documents: true,
  onboardingProgress: true,
  auditLogs: { orderBy: { createdAt: 'desc' }, take: 20 },
  meetings: true,
  resolutions: true
};

const requiredDocumentTypes = (registrationStatus?: string) => {
  const base = ['LEADER_KYC', 'BANK_PASSBOOK', 'MEMBER_LIST', 'ADDRESS_PROOF', 'FORMATION_RESOLUTION', 'AUTHORIZATION_LETTER'];
  if (registrationStatus === 'REGISTERED') base.push('REGISTRATION_CERTIFICATE');
  return base;
};

const generateApplicationNumber = async () => {
  const year = new Date().getFullYear();
  const count = await (prisma as any).shgProfile.count({
    where: { applicationNumber: { startsWith: `SHG-JSG-${year}-` } }
  });
  return `SHG-JSG-${year}-${String(count + 1).padStart(6, '0')}`;
};

const addShgAudit = async (shgProfileId: number, req: Request, action: string, payload: Record<string, unknown> = {}) =>
  (prisma as any).shgApplicationAuditLog.create({
    data: {
      shgProfileId,
      actorUserId: (req as AuthRequest).user?.id || null,
      actorRole: (req as AuthRequest).user?.role || null,
      action,
      section: typeof payload.section === 'string' ? payload.section : null,
      remarks: typeof payload.remarks === 'string' ? payload.remarks : null,
      metadata: payload,
      ipAddress: req.ip,
      userAgent: req.headers['user-agent'] || null
    }
  }).catch(() => undefined);

const validateBody = <T>(schema: z.ZodType<T>, req: Request, res: Response): T | null => {
  const parsed = schema.safeParse(req.body);
  if (!parsed.success) {
    apiResponse.error(res, 400, 'Invalid SHG request payload', 'VALIDATION_ERROR', parsed.error.flatten());
    return null;
  }
  return parsed.data;
};

const getOwnedShgProfile = async (req: AuthRequest) => {
  const userId = Number(req.user?.id || 0);
  if (!userId) return null;
  return (prisma as any).shgProfile.findUnique({
    where: { userId },
    include: safeShgInclude
  });
};

const organizationSchema = z.object({
  shgType: z.enum(shgTypes).default('WOMEN_SHG'),
  state: z.string().min(2),
  district: z.string().min(2),
  block: z.string().optional().nullable(),
  gramPanchayat: z.string().optional().nullable(),
  village: z.string().min(2),
  pincode: z.string().regex(/^\d{6}$/).optional().or(z.literal('')).nullable(),
  shgName: z.string().min(3),
  formationYear: z.coerce.number().int().min(1900).max(new Date().getFullYear()).optional().nullable(),
  formationDate: z.string().optional().nullable(),
  memberCount: z.coerce.number().int().positive(),
  registrationStatus: z.enum(['REGISTERED', 'UNREGISTERED']),
  registrationNumber: z.string().optional().nullable(),
  nrlmId: z.string().optional().nullable(),
  promotedBy: z.string().optional().nullable(),
  mainActivity: z.string().min(2),
  provideAdditionalDetails: z.boolean().optional().default(false),
  gstin: z.string().optional().nullable(),
  udyamNumber: z.string().optional().nullable(),
  website: z.string().url().optional().or(z.literal('')).nullable()
}).superRefine((value, ctx) => {
  if (value.registrationStatus === 'REGISTERED' && !clean(value.registrationNumber)) {
    ctx.addIssue({ code: 'custom', path: ['registrationNumber'], message: 'SHG registration number is required for registered groups' });
  }
  if (clean(value.gstin) && !gstinRegex.test(upper(value.gstin))) {
    ctx.addIssue({ code: 'custom', path: ['gstin'], message: 'Invalid GSTIN format' });
  }
  if (clean(value.udyamNumber) && !udyamRegex.test(upper(value.udyamNumber))) {
    ctx.addIssue({ code: 'custom', path: ['udyamNumber'], message: 'Invalid Udyam number format' });
  }
});

const createAccountSchema = z.object({
  organization: organizationSchema,
  representative: z.object({
    firstName: z.string().min(1),
    lastName: z.string().optional().nullable(),
    mobile: z.string().regex(mobileRegex),
    role: z.enum(officeRoles),
    email: z.string().email(),
    maskedIdentifier: z.string().optional().nullable(),
    identifierLast4: z.string().optional().nullable(),
    verificationType: z.enum(['AADHAAR', 'PAN']).optional().default('AADHAAR'),
    verificationReferenceId: z.string().optional().nullable()
  }),
  credentials: z.object({
    userId: z.string().min(4),
    password: z.string().min(12),
    confirmPassword: z.string().min(12)
  }),
  terms: z.object({
    accepted: z.boolean(),
    version: z.string().default('SHG-GTC-2026-01'),
    acceptedAt: z.string().optional().nullable()
  })
}).superRefine((value, ctx) => {
  if (value.credentials.password !== value.credentials.confirmPassword) {
    ctx.addIssue({ code: 'custom', path: ['credentials', 'confirmPassword'], message: 'Passwords do not match' });
  }
  if (!value.terms.accepted) {
    ctx.addIssue({ code: 'custom', path: ['terms', 'accepted'], message: 'Terms must be accepted' });
  }
});

router.post('/shg/registration/prerequisites', (req, res) => {
  const selectedType = clean(req.body?.selectedType || req.body?.shgType || 'WOMEN_SHG');
  return apiResponse.success(res, {
    selectedType,
    requiredDocuments: requiredDocumentTypes(req.body?.registrationStatus),
    optionalDocuments: ['PAN_CARD', 'UDYAM_CERTIFICATE', 'GST_CERTIFICATE', 'NRLM_SRLM_CERTIFICATE', 'TRAINING_CERTIFICATE', 'PRODUCT_CATALOGUE']
  });
});

router.post('/shg/registration/terms', (req, res) => {
  if (!req.body?.accepted) return apiResponse.error(res, 400, 'Terms acceptance is required', 'TERMS_REQUIRED');
  return apiResponse.success(res, {
    termsAcceptedAt: new Date().toISOString(),
    termsVersion: clean(req.body?.version || 'SHG-GTC-2026-01'),
    ipAvailable: Boolean(req.ip),
    userAgentAvailable: Boolean(req.headers['user-agent'])
  });
});

router.post('/shg/registration/organisation', (req, res) => {
  const payload = validateBody(organizationSchema, req, res);
  if (!payload) return;
  return apiResponse.success(res, payload);
});

router.post('/shg/registration/verify-aadhaar', (req, res) => {
  if (env.NODE_ENV === 'production') {
    return apiResponse.error(res, 503, 'Aadhaar verification provider is not configured', 'VERIFICATION_PROVIDER_REQUIRED');
  }
  const aadhaarOrVid = clean(req.body?.aadhaarOrVid).replace(/\s+/g, '');
  const mobile = clean(req.body?.mobile);
  if (!aadhaarOrVidRegex.test(aadhaarOrVid) || !mobileRegex.test(mobile) || !req.body?.consent) {
    return apiResponse.error(res, 400, 'Aadhaar/VID, linked mobile, and consent are required', 'VALIDATION_ERROR');
  }
  return apiResponse.success(res, {
    verificationStatus: 'VERIFIED',
    verificationProvider: 'DEV_MOCK',
    verificationReferenceId: `SHG-AAD-${sha256(`${aadhaarOrVid}:${Date.now()}`).slice(0, 12)}`,
    maskedAadhaar: maskAadhaar(aadhaarOrVid),
    aadhaarLast4: last4(aadhaarOrVid),
    verifiedAt: new Date().toISOString()
  });
});

router.post('/shg/registration/verify-pan', (req, res) => {
  if (env.NODE_ENV === 'production') {
    return apiResponse.error(res, 503, 'PAN verification provider is not configured', 'VERIFICATION_PROVIDER_REQUIRED');
  }
  const pan = upper(req.body?.pan);
  if (!panRegex.test(pan) || !req.body?.consent) {
    return apiResponse.error(res, 400, 'Valid PAN and consent are required', 'VALIDATION_ERROR');
  }
  return apiResponse.success(res, {
    verificationStatus: 'VERIFIED',
    verificationProvider: 'DEV_MOCK',
    verificationReferenceId: `SHG-PAN-${sha256(`${pan}:${Date.now()}`).slice(0, 12)}`,
    maskedPan: `${pan.slice(0, 2)}***${pan.slice(-2)}`,
    identifierLast4: pan.slice(-4),
    verifiedAt: new Date().toISOString()
  });
});

router.post('/shg/registration/send-email-otp', async (req, res) => {
  const email = normalizeEmail(req.body?.email);
  if (!z.string().email().safeParse(email).success) return apiResponse.error(res, 400, 'Valid email is required', 'VALIDATION_ERROR');
  const otp = generateOtp();
  await storeEmailOtp(email, otp);
  await sendOtpEmail(email, otp, '[JsgSmile] SHG registration email verification');
  return apiResponse.success(res, { email, expiresInMinutes: 10, resendCooldownSeconds: 60 });
});

router.post('/shg/registration/verify-email-otp', async (req, res) => {
  const email = normalizeEmail(req.body?.email);
  const otp = clean(req.body?.otp);
  const result = await verifyEmailOtp(email, otp);
  if (!result.ok) return apiResponse.error(res, 400, result.reason === 'expired' ? 'OTP expired' : 'Invalid OTP', 'OTP_INVALID');
  return apiResponse.success(res, { verified: true });
});

router.post('/shg/registration/send-mobile-otp', async (req, res) => {
  const { smsService, toLocalIndianMobile } = await import('../services/sms.service.js');
  const mobile = toLocalIndianMobile(req.body?.mobile);
  if (!mobile) return apiResponse.error(res, 400, 'Valid Indian mobile number is required', 'VALIDATION_ERROR');
  const existing = await (prisma as any).user.findFirst({ where: { mobile }, select: { id: true } });
  if (existing) return apiResponse.error(res, 400, 'Mobile is already registered', 'DUPLICATE_REGISTRATION');
  const otp = generateOtp();
  await storeOtp('registration_mobile', mobile, otp, undefined, 'sms');
  await smsService.sendOtpSms(mobile, otp, 'registration_otp');
  return apiResponse.success(res, { mobile, expiresInMinutes: 5, resendCooldownSeconds: 60, smsEnabled: smsService.isEnabled() });
});

router.post('/shg/registration/verify-mobile-otp', async (req, res) => {
  const { toLocalIndianMobile } = await import('../services/sms.service.js');
  const mobile = toLocalIndianMobile(req.body?.mobile);
  const otp = clean(req.body?.otp);
  if (!mobile) return apiResponse.error(res, 400, 'Valid Indian mobile number is required', 'VALIDATION_ERROR');
  const result = await verifyOtp('registration_mobile', mobile, otp);
  if (!result.ok) return apiResponse.error(res, 400, result.reason === 'expired' ? 'OTP expired' : 'Invalid OTP', 'OTP_INVALID');
  return apiResponse.success(res, { verified: true });
});

router.post('/shg/registration/create-account', async (req, res) => {
  const payload = validateBody(createAccountSchema, req, res);
  if (!payload) return;
  const email = normalizeEmail(payload.representative.email);
  const passwordValidation = validatePasswordStrength(payload.credentials.password);
  if (!passwordValidation.ok) {
    return apiResponse.error(res, 400, 'Password does not meet security requirements', 'VALIDATION_ERROR', passwordValidation.errors);
  }
  const otpRecord = await assertEmailOtpVerified(email);
  if (!otpRecord.ok) return apiResponse.error(res, 400, otpRecord.reason === 'expired' ? 'OTP expired' : 'Verify email first', 'EMAIL_OTP_REQUIRED');

  const existing = await (prisma as any).user.findFirst({
    where: { OR: [{ email }, { userId: payload.credentials.userId }, { mobile: payload.representative.mobile }] }
  });
  if (existing) return apiResponse.error(res, 400, 'Email, mobile, or User ID is already registered', 'DUPLICATE_REGISTRATION');

  const now = new Date();
  const user = await (prisma as any).$transaction(async (tx: any) => {
    const createdUser = await tx.user.create({
      data: {
        name: `${payload.representative.firstName} ${payload.representative.lastName || ''}`.trim(),
        email,
        userId: payload.credentials.userId,
        password: await hashPassword(payload.credentials.password),
        role: 'shg',
        mobile: payload.representative.mobile,
        emailVerified: true,
        mobileVerified: Boolean((await assertOtpVerified('registration_mobile', payload.representative.mobile)).ok),
        lastPasswordChangeAt: now,
        registrationStatus: 'completed',
        onboardingStatus: 'pending',
        accountStatus: 'ACTIVE',
        registrationDetails: {
          stakeholderCategory: 'herSHG',
          shgName: payload.organization.shgName,
          shgType: payload.organization.shgType,
          selectedDocuments: requiredDocumentTypes(payload.organization.registrationStatus)
        }
      }
    });

    const defaultCompanyId = await getDefaultCompanyId(tx as any);
    const org = await tx.organization.create({
      data: {
        organizationName: payload.organization.shgName,
        organizationType: 'SHG',
        gstin: upper(payload.organization.gstin) || null,
        udyamNumber: upper(payload.organization.udyamNumber) || null,
        state: payload.organization.state,
        district: payload.organization.district,
        city: payload.organization.village,
        pincode: clean(payload.organization.pincode) || null,
        country: 'India',
        website: clean(payload.organization.website) || null,
        companyId: defaultCompanyId,
        verificationStatus: 'PENDING'
      }
    });

    await tx.user.update({ where: { id: createdUser.id }, data: { organizationId: org.id, companyId: defaultCompanyId } });
    const shg = await tx.shgProfile.create({
      data: {
        organizationId: org.id,
        userId: createdUser.id,
        createdById: createdUser.id,
        shgType: payload.organization.shgType,
        shgName: payload.organization.shgName,
        state: payload.organization.state,
        district: payload.organization.district,
        block: clean(payload.organization.block) || null,
        gramPanchayat: clean(payload.organization.gramPanchayat) || null,
        village: payload.organization.village,
        pincode: clean(payload.organization.pincode) || null,
        formationYear: payload.organization.formationYear || null,
        formationDate: payload.organization.formationDate ? new Date(payload.organization.formationDate) : null,
        memberCount: payload.organization.memberCount,
        registrationStatus: payload.organization.registrationStatus,
        registrationNumber: clean(payload.organization.registrationNumber) || null,
        nrlmId: clean(payload.organization.nrlmId) || null,
        promotedBy: clean(payload.organization.promotedBy) || null,
        mainActivity: payload.organization.mainActivity,
        gstin: upper(payload.organization.gstin) || null,
        udyamNumber: upper(payload.organization.udyamNumber) || null,
        website: clean(payload.organization.website) || null,
        representativeFirstName: payload.representative.firstName,
        representativeLastName: clean(payload.representative.lastName) || null,
        representativeMobile: payload.representative.mobile,
        representativeEmail: email,
        representativeRole: payload.representative.role,
        applicationStatus: 'IN_PROGRESS',
        termsAcceptedAt: payload.terms.acceptedAt ? new Date(payload.terms.acceptedAt) : now,
        termsVersion: payload.terms.version,
        termsIpAddress: req.ip,
        termsUserAgent: req.headers['user-agent'] || null,
        consentVersion: 'SHG-IDENTITY-CONSENT-2026-01',
        draftData: { organization: payload.organization, representative: { ...payload.representative, verificationReferenceId: payload.representative.verificationReferenceId || null } }
      }
    });

    if (payload.representative.maskedIdentifier || payload.representative.identifierLast4) {
      await tx.shgRepresentativeVerification.create({
        data: {
          shgProfileId: shg.id,
          verificationType: payload.representative.verificationType,
          verificationStatus: 'VERIFIED',
          maskedIdentifier: payload.representative.maskedIdentifier || null,
          identifierLast4: payload.representative.identifierLast4 || null,
          provider: env.NODE_ENV === 'production' ? 'EXTERNAL' : 'DEV_MOCK',
          referenceId: payload.representative.verificationReferenceId || `SHG-VER-${sha256(`${createdUser.id}:${now.toISOString()}`).slice(0, 12)}`,
          consentTextVersion: 'SHG-IDENTITY-CONSENT-2026-01',
          consentedAt: now,
          verifiedAt: now
        }
      });
    }

    await tx.shgApplicationAuditLog.create({
      data: {
        shgProfileId: shg.id,
        actorUserId: createdUser.id,
        actorRole: 'shg',
        action: 'shg.registration.created',
        ipAddress: req.ip,
        userAgent: req.headers['user-agent'] || null
      }
    });

    return tx.user.findUnique({ where: { id: createdUser.id }, include: { organization: true } });
  });

  await consumeEmailOtp(email);
  const tokens = await issueCookieAuth(req, res, user);
  return apiResponse.created(res, { ...tokens, user: toSafeUser(user), redirectUrl: '/shg/onboarding' }, 'SHG account created');
});

router.get('/shg/me', authenticate, authorize('shg'), async (req: AuthRequest, res) => {
  const profile = await getOwnedShgProfile(req);
  if (!profile) return apiResponse.error(res, 404, 'SHG profile not found', 'SHG_NOT_FOUND');
  return apiResponse.success(res, profile);
});

router.get('/shg/onboarding', authenticate, authorize('shg'), async (req: AuthRequest, res) => {
  const profile = await getOwnedShgProfile(req);
  if (!profile) return apiResponse.error(res, 404, 'SHG profile not found', 'SHG_NOT_FOUND');
  return apiResponse.success(res, profile);
});

router.patch('/shg/onboarding/step/:step', authenticate, authorize('shg'), async (req: AuthRequest, res) => {
  const profile = await getOwnedShgProfile(req);
  if (!profile) return apiResponse.error(res, 404, 'SHG profile not found', 'SHG_NOT_FOUND');
  const step = clean(req.params.step);
  const data = req.body?.data || {};
  const completed = Boolean(req.body?.completed);
  const completionPercent = Math.max(0, Math.min(100, Number(req.body?.completionPercent || (completed ? 100 : 0))));
  await (prisma as any).shgOnboardingProgress.upsert({
    where: { shgProfileId_step: { shgProfileId: profile.id, step } },
    create: { shgProfileId: profile.id, step, completed, completionPercent, data },
    update: { completed, completionPercent, data }
  });
  const updated = await (prisma as any).shgProfile.update({
    where: { id: profile.id },
    data: { draftData: { ...(profile.draftData || {}), [step]: data }, applicationStatus: profile.applicationStatus === 'DRAFT' ? 'IN_PROGRESS' : profile.applicationStatus },
    include: safeShgInclude
  });
  await addShgAudit(profile.id, req, 'shg.onboarding.step_saved', { section: step, completed });
  return apiResponse.success(res, updated);
});

router.post('/shg/onboarding/save-draft', authenticate, authorize('shg'), async (req: AuthRequest, res) => {
  const profile = await getOwnedShgProfile(req);
  if (!profile) return apiResponse.error(res, 404, 'SHG profile not found', 'SHG_NOT_FOUND');
  const updated = await (prisma as any).shgProfile.update({
    where: { id: profile.id },
    data: { draftData: { ...(profile.draftData || {}), ...(req.body?.draft || req.body || {}) }, applicationStatus: profile.applicationStatus === 'DRAFT' ? 'IN_PROGRESS' : profile.applicationStatus },
    include: safeShgInclude
  });
  await addShgAudit(profile.id, req, 'shg.onboarding.draft_saved');
  return apiResponse.success(res, updated);
});

const bankSchema = z.object({
  bankName: z.string().min(2),
  accountHolderName: z.string().min(2),
  accountNumber: z.string().regex(/^\d{6,20}$/).optional(),
  confirmAccountNumber: z.string().optional(),
  ifsc: z.string().transform(value => value.toUpperCase()).refine(value => ifscRegex.test(value), 'Invalid IFSC'),
  branchName: z.string().optional().nullable(),
  accountType: z.enum(['Savings', 'Current']).default('Savings'),
  isPrimary: z.boolean().optional().default(false)
}).superRefine((value, ctx) => {
  if (value.accountNumber && value.accountNumber !== value.confirmAccountNumber) {
    ctx.addIssue({ code: 'custom', path: ['confirmAccountNumber'], message: 'Account numbers do not match' });
  }
});

router.post('/shg/bank-accounts', authenticate, authorize('shg'), async (req: AuthRequest, res) => {
  const payload = validateBody(bankSchema, req, res);
  if (!payload) return;
  const profile = await getOwnedShgProfile(req);
  if (!profile) return apiResponse.error(res, 404, 'SHG profile not found', 'SHG_NOT_FOUND');
  if (payload.isPrimary) await (prisma as any).shgBankAccount.updateMany({ where: { shgProfileId: profile.id }, data: { isPrimary: false } });
  const created = await (prisma as any).shgBankAccount.create({
    data: {
      shgProfileId: profile.id,
      bankName: payload.bankName,
      accountHolderName: payload.accountHolderName,
      accountNumberMasked: maskAccount(payload.accountNumber || ''),
      accountNumberHash: payload.accountNumber ? createHashFingerprint(payload.accountNumber, 'shg_bank') : null,
      ifsc: payload.ifsc,
      branchName: clean(payload.branchName) || null,
      accountType: payload.accountType,
      isPrimary: payload.isPrimary
    }
  });
  await addShgAudit(profile.id, req, 'shg.bank_account.created');
  return apiResponse.created(res, created);
});

router.patch('/shg/bank-accounts/:id', authenticate, authorize('shg'), async (req: AuthRequest, res) => {
  const profile = await getOwnedShgProfile(req);
  if (!profile) return apiResponse.error(res, 404, 'SHG profile not found', 'SHG_NOT_FOUND');
  const id = Number(req.params.id);
  const existing = await (prisma as any).shgBankAccount.findFirst({ where: { id, shgProfileId: profile.id } });
  if (!existing) return apiResponse.error(res, 404, 'Bank account not found', 'BANK_NOT_FOUND');
  const payload = validateBody(bankSchema.partial(), req, res);
  if (!payload) return;
  if (payload.isPrimary) await (prisma as any).shgBankAccount.updateMany({ where: { shgProfileId: profile.id }, data: { isPrimary: false } });
  const updated = await (prisma as any).shgBankAccount.update({
    where: { id },
    data: {
      ...payload,
      branchName: payload.branchName === undefined ? undefined : clean(payload.branchName) || null,
      accountNumber: undefined,
      confirmAccountNumber: undefined,
      accountNumberMasked: payload.accountNumber ? maskAccount(payload.accountNumber) : undefined,
      accountNumberHash: payload.accountNumber ? createHashFingerprint(payload.accountNumber, 'shg_bank') : undefined
    }
  });
  await addShgAudit(profile.id, req, 'shg.bank_account.updated');
  return apiResponse.success(res, updated);
});

router.delete('/shg/bank-accounts/:id', authenticate, authorize('shg'), async (req: AuthRequest, res) => {
  const profile = await getOwnedShgProfile(req);
  if (!profile) return apiResponse.error(res, 404, 'SHG profile not found', 'SHG_NOT_FOUND');
  const deleted = await (prisma as any).shgBankAccount.deleteMany({ where: { id: Number(req.params.id), shgProfileId: profile.id } });
  if (!deleted.count) return apiResponse.error(res, 404, 'Bank account not found', 'BANK_NOT_FOUND');
  await addShgAudit(profile.id, req, 'shg.bank_account.deleted');
  return apiResponse.success(res, { deleted: true });
});

const memberSchema = z.object({
  name: z.string().min(2),
  mobile: z.string().regex(mobileRegex).optional().or(z.literal('')).nullable(),
  role: z.string().optional().nullable(),
  officeRole: z.enum(officeRoles).optional().nullable(),
  gender: z.string().optional().nullable(),
  age: z.coerce.number().int().min(1).max(120).optional().nullable(),
  socialCategory: z.string().optional().nullable(),
  aadhaarLast4: z.string().regex(/^\d{4}$/).optional().or(z.literal('')).nullable(),
  kycStatus: z.enum(['PENDING', 'UNDER_REVIEW', 'VERIFIED', 'REJECTED', 'FAILED']).optional().default('PENDING'),
  isOfficeBearer: z.boolean().optional().default(false)
});

router.post('/shg/members', authenticate, authorize('shg'), async (req: AuthRequest, res) => {
  const payload = validateBody(memberSchema, req, res);
  if (!payload) return;
  const profile = await getOwnedShgProfile(req);
  if (!profile) return apiResponse.error(res, 404, 'SHG profile not found', 'SHG_NOT_FOUND');
  const created = await (prisma as any).shgMember.create({ data: { ...payload, shgProfileId: profile.id, mobile: clean(payload.mobile) || null, aadhaarLast4: clean(payload.aadhaarLast4) || null } });
  await addShgAudit(profile.id, req, 'shg.member.created');
  return apiResponse.created(res, created);
});

router.patch('/shg/members/:id', authenticate, authorize('shg'), async (req: AuthRequest, res) => {
  const payload = validateBody(memberSchema.partial(), req, res);
  if (!payload) return;
  const profile = await getOwnedShgProfile(req);
  if (!profile) return apiResponse.error(res, 404, 'SHG profile not found', 'SHG_NOT_FOUND');
  const existing = await (prisma as any).shgMember.findFirst({ where: { id: Number(req.params.id), shgProfileId: profile.id } });
  if (!existing) return apiResponse.error(res, 404, 'Member not found', 'MEMBER_NOT_FOUND');
  const updated = await (prisma as any).shgMember.update({ where: { id: existing.id }, data: payload });
  await addShgAudit(profile.id, req, 'shg.member.updated');
  return apiResponse.success(res, updated);
});

router.delete('/shg/members/:id', authenticate, authorize('shg'), async (req: AuthRequest, res) => {
  const profile = await getOwnedShgProfile(req);
  if (!profile) return apiResponse.error(res, 404, 'SHG profile not found', 'SHG_NOT_FOUND');
  const deleted = await (prisma as any).shgMember.deleteMany({ where: { id: Number(req.params.id), shgProfileId: profile.id } });
  if (!deleted.count) return apiResponse.error(res, 404, 'Member not found', 'MEMBER_NOT_FOUND');
  await addShgAudit(profile.id, req, 'shg.member.deleted');
  return apiResponse.success(res, { deleted: true });
});

router.post('/shg/members/import-csv', authenticate, authorize('shg'), (_req, res) =>
  apiResponse.success(res, { imported: 0, message: 'CSV import endpoint is reserved for the secure upload pipeline.' })
);
router.get('/shg/members/export-csv', authenticate, authorize('shg'), async (req: AuthRequest, res) => {
  const profile = await getOwnedShgProfile(req);
  if (!profile) return apiResponse.error(res, 404, 'SHG profile not found', 'SHG_NOT_FOUND');
  const rows = (profile.members || []).map((m: any) => [m.name, m.mobile || '', m.officeRole || m.role || '', m.gender || '', m.age || '', m.kycStatus, m.isOfficeBearer ? 'Yes' : 'No']);
  res.setHeader('Content-Type', 'text/csv');
  res.setHeader('Content-Disposition', 'attachment; filename="shg-members.csv"');
  return res.send([['Member Name', 'Mobile', 'Role', 'Gender', 'Age', 'KYC Status', 'Office Bearer'].join(','), ...rows.map((row: any[]) => row.join(','))].join('\n'));
});

const documentSchema = z.object({
  documentType: z.enum(documentTypes),
  fileAssetId: z.coerce.number().int().positive().optional().nullable(),
  fileName: z.string().optional().nullable(),
  mimeType: z.string().optional().nullable(),
  size: z.coerce.number().int().positive().optional().nullable(),
  required: z.boolean().optional().default(false),
  description: z.string().optional().nullable()
}).superRefine((value, ctx) => {
  if (value.mimeType && !allowedMimeTypes.has(value.mimeType.toLowerCase())) {
    ctx.addIssue({ code: 'custom', path: ['mimeType'], message: 'Only PDF, JPG, JPEG, and PNG files are allowed' });
  }
  if (value.size && value.size > maxFileSize) {
    ctx.addIssue({ code: 'custom', path: ['size'], message: 'File size must be 10MB or less' });
  }
});

router.post('/shg/documents', authenticate, authorize('shg'), async (req: AuthRequest, res) => {
  const payload = validateBody(documentSchema, req, res);
  if (!payload) return;
  const profile = await getOwnedShgProfile(req);
  if (!profile) return apiResponse.error(res, 404, 'SHG profile not found', 'SHG_NOT_FOUND');
  const saved = await (prisma as any).shgDocument.create({
    data: {
      ...payload,
      shgProfileId: profile.id,
      status: payload.fileAssetId || payload.fileName ? 'UPLOADED' : 'NOT_UPLOADED',
      uploadedById: req.user?.id || null,
      uploadedAt: payload.fileAssetId || payload.fileName ? new Date() : null
    }
  });
  await addShgAudit(profile.id, req, 'shg.document.uploaded', { section: payload.documentType });
  return apiResponse.created(res, saved);
});

router.get('/shg/documents', authenticate, authorize('shg'), async (req: AuthRequest, res) => {
  const profile = await getOwnedShgProfile(req);
  if (!profile) return apiResponse.error(res, 404, 'SHG profile not found', 'SHG_NOT_FOUND');
  return apiResponse.success(res, profile.documents || []);
});

router.patch('/shg/documents/:id', authenticate, authorize('shg'), async (req: AuthRequest, res) => {
  const profile = await getOwnedShgProfile(req);
  if (!profile) return apiResponse.error(res, 404, 'SHG profile not found', 'SHG_NOT_FOUND');
  const existing = await (prisma as any).shgDocument.findFirst({ where: { id: Number(req.params.id), shgProfileId: profile.id } });
  if (!existing) return apiResponse.error(res, 404, 'Document not found', 'DOCUMENT_NOT_FOUND');
  const payload = validateBody(documentSchema.partial(), req, res);
  if (!payload) return;
  const updated = await (prisma as any).shgDocument.update({ where: { id: existing.id }, data: { ...payload, status: payload.fileAssetId || payload.fileName ? 'UPLOADED' : undefined, uploadedAt: new Date() } });
  await addShgAudit(profile.id, req, 'shg.document.updated', { section: existing.documentType });
  return apiResponse.success(res, updated);
});

router.post('/shg/final-otp/send', authenticate, authorize('shg'), async (req: AuthRequest, res) => {
  const profile = await getOwnedShgProfile(req);
  if (!profile) return apiResponse.error(res, 404, 'SHG profile not found', 'SHG_NOT_FOUND');
  const { smsService } = await import('../services/sms.service.js');
  const mobile = profile.representativeMobile;
  const channel = req.body?.channel === 'sms' && mobile && smsService.isEnabled() ? 'sms' : 'email';
  const identity = channel === 'sms' ? mobile : normalizeEmail(profile.representativeEmail);
  if (!identity) return apiResponse.error(res, 400, 'Recipient identity not configured', 'VALIDATION_ERROR');

  const otp = generateOtp();
  await storeOtp('ownership_submission', identity, otp, { shgProfileId: profile.id, channel }, channel);
  
  let deliveryConfigured = false;
  if (channel === 'sms') {
    const smsResult = await smsService.sendOtpSms(identity, otp, 'common_otp');
    deliveryConfigured = smsResult.success;
  } else {
    deliveryConfigured = await sendOtpEmail(identity, otp, '[JsgSmile] SHG final submission OTP');
  }
  return apiResponse.success(res, { sent: true, expiresInMinutes: 10, resendCooldownSeconds: 60, channel, deliveryConfigured });
});

router.post('/shg/final-otp/verify', authenticate, authorize('shg'), async (req: AuthRequest, res) => {
  const profile = await getOwnedShgProfile(req);
  if (!profile) return apiResponse.error(res, 404, 'SHG profile not found', 'SHG_NOT_FOUND');
  const mobile = profile.representativeMobile;
  const channel = req.body?.channel === 'sms' && mobile ? 'sms' : 'email';
  const identity = channel === 'sms' ? mobile : normalizeEmail(profile.representativeEmail);
  if (!identity) return apiResponse.error(res, 400, 'Recipient identity not configured', 'VALIDATION_ERROR');

  const result = await verifyOtp('ownership_submission', identity, clean(req.body?.otp));
  if (!result.ok) return apiResponse.error(res, 400, result.reason === 'expired' ? 'OTP expired' : 'Invalid OTP', 'OTP_INVALID');
  return apiResponse.success(res, { verified: true });
});

router.post('/shg/submit', authenticate, authorize('shg'), async (req: AuthRequest, res) => {
  const profile = await getOwnedShgProfile(req);
  if (!profile) return apiResponse.error(res, 404, 'SHG profile not found', 'SHG_NOT_FOUND');
  if (!req.body?.declarationAccepted) return apiResponse.error(res, 400, 'Declaration is required before submission', 'DECLARATION_REQUIRED');
  const mobile = profile.representativeMobile;
  const channel = req.body?.channel === 'sms' && mobile ? 'sms' : 'email';
  const identity = channel === 'sms' ? mobile : normalizeEmail(profile.representativeEmail);
  if (!identity) return apiResponse.error(res, 400, 'Recipient identity not configured', 'VALIDATION_ERROR');

  const otpRecord = await assertOtpVerified('ownership_submission', identity);
  if (!otpRecord.ok) return apiResponse.error(res, 400, 'Final submission OTP must be verified', 'FINAL_OTP_REQUIRED');
  const missingDocuments = requiredDocumentTypes(profile.registrationStatus).filter(type =>
    !(profile.documents || []).some((doc: any) => doc.documentType === type && ['UPLOADED', 'UNDER_REVIEW', 'VERIFIED'].includes(doc.status))
  );
  const hasPrimaryBank = (profile.bankAccounts || []).some((bank: any) => bank.isPrimary);
  if (!hasPrimaryBank || missingDocuments.length) {
    return apiResponse.error(res, 400, 'Mandatory SHG onboarding data is incomplete', 'ONBOARDING_INCOMPLETE', { hasPrimaryBank, missingDocuments });
  }
  const applicationNumber = profile.applicationNumber || await generateApplicationNumber();
  const updated = await (prisma as any).shgProfile.update({
    where: { id: profile.id },
    data: { applicationStatus: 'PENDING_REVIEW', applicationNumber, submittedAt: new Date() },
    include: safeShgInclude
  });
  await consumeOtp('ownership_submission', identity);
  await addShgAudit(profile.id, req, 'shg.application.submitted', { applicationNumber });
  return apiResponse.success(res, updated, 200, 'SHG application submitted');
});

router.get('/admin/shg-applications', authenticate, authorize('admin', 'master_admin'), async (req: AuthRequest, res) => {
  const where: Record<string, unknown> = {};
  if (req.query.status) where.applicationStatus = String(req.query.status);
  if (req.query.district) where.district = String(req.query.district);
  if (req.query.shgType) where.shgType = String(req.query.shgType);
  if (req.query.registrationStatus) where.registrationStatus = String(req.query.registrationStatus);
  if (req.query.search) {
    const search = String(req.query.search);
    where.OR = [
      { shgName: { contains: search, mode: 'insensitive' } },
      { applicationNumber: { contains: search, mode: 'insensitive' } },
      { representativeMobile: { contains: search } },
      { representativeEmail: { contains: search, mode: 'insensitive' } }
    ];
  }
  if (req.user?.role === 'admin' && req.user.companyId) {
    where.organization = { companyId: req.user.companyId };
  }
  const rows = await (prisma as any).shgProfile.findMany({
    where,
    orderBy: { submittedAt: 'desc' },
    include: { organization: true, documents: true, primaryUser: { select: { id: true, name: true, email: true, mobile: true } } },
    take: Math.min(100, Number(req.query.take || 50)),
    skip: Math.max(0, Number(req.query.skip || 0))
  });
  return apiResponse.success(res, rows);
});

router.get('/admin/shg-applications/:id', authenticate, authorize('admin', 'master_admin'), async (req, res) => {
  const profile = await (prisma as any).shgProfile.findUnique({ where: { id: Number(req.params.id) }, include: safeShgInclude });
  if (!profile) return apiResponse.error(res, 404, 'SHG application not found', 'SHG_NOT_FOUND');
  return apiResponse.success(res, profile);
});

router.post('/admin/shg-applications/:id/approve', authenticate, authorize('admin', 'master_admin'), async (req: AuthRequest, res) => {
  const id = Number(req.params.id);
  const profile = await (prisma as any).shgProfile.findUnique({ where: { id }, include: { organization: true } });
  if (!profile) return apiResponse.error(res, 404, 'SHG application not found', 'SHG_NOT_FOUND');
  const updated = await (prisma as any).shgProfile.update({
    where: { id },
    data: { applicationStatus: 'APPROVED', approvedAt: new Date(), adminRemarks: clean(req.body?.remarks) || null, marketplaceEnabled: true },
    include: safeShgInclude
  });
  await (prisma as any).organization.update({ where: { id: profile.organizationId }, data: { verificationStatus: 'VERIFIED' } }).catch(() => undefined);
  deleteCache('marketplace:home:v2').catch(() => undefined);
  deleteCache(redisKeys.cacheMarketplaceHome()).catch(() => undefined);
  deleteCache(redisKeys.cacheMarketplaceFeaturedCategories()).catch(() => undefined);
  invalidateByPattern('cache:marketplace:*').catch(() => undefined);
  await addShgAudit(id, req, 'admin.shg_application.approved', { remarks: clean(req.body?.remarks) });
  return apiResponse.success(res, updated);
});

router.post('/admin/shg-applications/:id/reject', authenticate, authorize('admin', 'master_admin'), async (req: AuthRequest, res) => {
  const reason = clean(req.body?.reason || req.body?.remarks);
  if (!reason) return apiResponse.error(res, 400, 'Rejection reason is required', 'REASON_REQUIRED');
  const updated = await (prisma as any).shgProfile.update({
    where: { id: Number(req.params.id) },
    data: { applicationStatus: 'REJECTED', rejectedAt: new Date(), adminRemarks: reason },
    include: safeShgInclude
  });
  await addShgAudit(updated.id, req, 'admin.shg_application.rejected', { remarks: reason });
  return apiResponse.success(res, updated);
});

router.post('/admin/shg-applications/:id/request-correction', authenticate, authorize('admin', 'master_admin'), async (req: AuthRequest, res) => {
  const remarks = clean(req.body?.remarks);
  const sections = Array.isArray(req.body?.sections) ? req.body.sections.map(String) : [];
  if (!remarks) return apiResponse.error(res, 400, 'Correction remarks are required', 'REMARKS_REQUIRED');
  const updated = await (prisma as any).shgProfile.update({
    where: { id: Number(req.params.id) },
    data: { applicationStatus: 'CORRECTION_REQUIRED', adminRemarks: remarks, correctionSections: sections },
    include: safeShgInclude
  });
  await addShgAudit(updated.id, req, 'admin.shg_application.correction_requested', { remarks, sections });
  return apiResponse.success(res, updated);
});

router.post('/admin/shg-documents/:documentId/verify', authenticate, authorize('admin', 'master_admin'), async (req: AuthRequest, res) => {
  const updated = await (prisma as any).shgDocument.update({
    where: { id: Number(req.params.documentId) },
    data: { status: 'VERIFIED', verifiedById: req.user?.id || null, verifiedAt: new Date(), remarks: clean(req.body?.remarks) || null }
  });
  await addShgAudit(updated.shgProfileId, req, 'admin.shg_document.verified', { section: updated.documentType });
  return apiResponse.success(res, updated);
});

router.post('/admin/shg-documents/:documentId/reject', authenticate, authorize('admin', 'master_admin'), async (req: AuthRequest, res) => {
  const remarks = clean(req.body?.remarks);
  if (!remarks) return apiResponse.error(res, 400, 'Document rejection remarks are required', 'REMARKS_REQUIRED');
  const updated = await (prisma as any).shgDocument.update({
    where: { id: Number(req.params.documentId) },
    data: { status: 'NEEDS_CORRECTION', verifiedById: req.user?.id || null, verifiedAt: new Date(), remarks }
  });
  await addShgAudit(updated.shgProfileId, req, 'admin.shg_document.rejected', { section: updated.documentType, remarks });
  return apiResponse.success(res, updated);
});

router.get('/admin/shg-applications/:id/audit', authenticate, authorize('admin', 'master_admin'), async (req, res) => {
  const logs = await (prisma as any).shgApplicationAuditLog.findMany({
    where: { shgProfileId: Number(req.params.id) },
    orderBy: { createdAt: 'desc' }
  });
  return apiResponse.success(res, logs);
});

router.get('/master-admin/shg-document-requirements', authenticate, authorize('master_admin'), async (_req, res) => {
  const rows = await (prisma as any).shgDocumentRequirementConfig.findMany({ orderBy: [{ state: 'asc' }, { district: 'asc' }, { documentType: 'asc' }] });
  return apiResponse.success(res, rows);
});

router.put('/master-admin/shg-document-requirements', authenticate, authorize('master_admin'), async (req, res) => {
  const rows = Array.isArray(req.body?.requirements) ? req.body.requirements : [];
  await (prisma as any).shgDocumentRequirementConfig.deleteMany({});
  const created = rows.length
    ? await (prisma as any).shgDocumentRequirementConfig.createMany({ data: rows, skipDuplicates: true })
    : { count: 0 };
  return apiResponse.success(res, { saved: created.count });
});

export default router;
