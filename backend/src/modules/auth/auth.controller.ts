import type { Request, Response } from 'express';
import prisma from '../../lib/prisma.js';
import { Role, RegistrationStatus, OrganizationType, OrgRole } from '@prisma/client';
import { env } from '../../config/env.js';
import { sha256 } from '../../utils/crypto.js';
import { isRedisReady, redis } from '../../config/redis.js';
import { auditLog } from '../audit/audit.service.js';
import { logger } from '../../config/logger.js';


const localResetTokens = new Map<string, { userId: number | null; identifier: string; channel: 'email' | 'sms'; expiresAt: number }>();
import { recordLoginEvent } from './login-event.service.js';
import {
  assertEmailOtpVerified,
  assertMobileOtpVerified,
  consumeEmailOtp,
  consumeMobileOtp,
  consumeOtp,
  generateOtp,
  storeEmailOtp,
  storeMobileOtp,
  storeOtp,
  verifyEmailOtp,
  verifyMobileOtp,
  verifyOtp
} from '../../services/otp.service.js';
import { sendOtpEmail } from '../../services/mail.service.js';
import { smsService, toLocalIndianMobile } from '../../services/sms.service.js';
import { hashPassword, validatePasswordStrength, verifyPassword } from '../../services/password.service.js';
import { issueAuthResponse, verifyRefreshToken } from '../../services/token.service.js';
import { handleSecureRouteError, handleFinancialRouteError, toSafeUser } from '../../utils/routeHelpers.js';
import { validatePersonalVerification } from '../../utils/validationHelpers.js';
import { maskSensitive } from '../../utils/maskSensitive.js';
import type { AuthRequest } from '../../middleware/auth.js';
import { notificationService } from '../../services/notification.service.js';
import { onUserLinkedToOrganization } from '../../services/org-membership.service.js';
import { getDefaultCompanyId } from '../../services/default-company.service.js';

// CreateNotificationSafe mock for backward compatibility if not globally service-ified yet

const sanitizeRegistrationDetails = (details: any) => {
  const sanitized = { ...(details || {}) };
  delete sanitized.aadhaarNumber;
  return sanitized;
};

const hasVerifiedAadhaarKyc = async (userId: number) => {
  const row = await prisma.userKycVerification.findUnique({
    where: {
      userId_provider_verificationType: {
        userId,
        provider: 'MERIPEHCHAAN',
        verificationType: 'AADHAAR'
      }
    },
    select: { status: true }
  });
  return row?.status === 'VERIFIED';
};

const isSmsFeatureEnabledForCompany = async (companyId: number | null) => {
  const targetCompanyId = companyId || await getDefaultCompanyId();
  const companyFeature = await prisma.companyFeature.findFirst({
    where: {
      companyId: targetCompanyId,
      feature: { code: 'sms' }
    }
  });
  return !!companyFeature?.enabled;
};


const createNotificationSafe = async (payload: { userId: number; title: string; message: string; type: string }) => {
  try {
    await notificationService.notifyWithEmail(payload.userId, {
      title: payload.title.slice(0, 120),
      message: payload.message.slice(0, 500),
      type: payload.type.slice(0, 80),
      priority: 'high',
      redirectUrl: '/dashboard'
    });
  } catch (err) {
    console.error('[Notification] Failed to create notification:', err);
  }
};

const clean = (value: unknown) => String(value || '').trim();

const asObject = (value: unknown): Record<string, any> =>
  value && typeof value === 'object' && !Array.isArray(value) ? value as Record<string, any> : {};

const firstValue = (...values: unknown[]) => {
  for (const value of values) {
    const text = clean(value);
    if (text) return text;
  }
  return '';
};

const roleHome = (role: 'buyer' | 'seller') => role === 'buyer' ? '/buyer/marketplace' : '/seller/marketplace';

const onboardingPath = (role: 'buyer' | 'seller') => role === 'buyer' ? '/buyer/onboarding' : '/seller/onboarding';

type OtpChannel = 'email' | 'sms';

const normalizeChannel = (value: unknown): OtpChannel => value === 'sms' ? 'sms' : 'email';

const normalizeOtpIdentity = (identifier: unknown, channel: OtpChannel) => {
  if (channel === 'sms') return smsService.normalizeMobile(identifier);
  const email = String(identifier || '').trim().toLowerCase();
  return email && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) ? email : null;
};

const identityFromBody = (body: any, channel: OtpChannel) =>
  normalizeOtpIdentity(channel === 'sms' ? (body.identifier || body.mobile) : (body.identifier || body.email), channel);

const channelFromBody = (body: any): OtpChannel => {
  if (body.channel === 'sms' || body.channel === 'email') return body.channel;
  const identifier = String(body.identifier || '').trim();
  if (body.mobile) return 'sms';
  if (body.email || identifier.includes('@')) return 'email';
  return identifier ? 'sms' : 'email';
};

const userLookupForIdentity = (identifier: string, channel: OtpChannel) =>
  channel === 'sms'
    ? { mobile: toLocalIndianMobile(identifier) || identifier }
    : { email: identifier };

const purposeForRegistrationChannel = (channel: OtpChannel) =>
  channel === 'sms' ? 'registration_mobile' as const : 'registration_email' as const;

const smsPurposeForOtp = (purpose: string) => {
  if (purpose === 'forgot_password') return 'forgot_password' as const;
  if (purpose === 'two_factor_login') return 'login_otp' as const;
  if (purpose === 'registration_mobile' || purpose === 'registration_email') return 'registration_otp' as const;
  if (purpose.includes('onboarding') || purpose.includes('profile') || purpose.includes('ownership')) return 'onboarding_alert' as const;
  return 'common_otp' as const;
};

const sendOtpByChannel = async (
  channel: OtpChannel,
  identity: string,
  otp: string,
  subject: string,
  purpose: string
) => {
  if (env.NODE_ENV !== 'production') {
    logger.info({ channel, identity, otp, purpose }, `[DEV OTP BYPASS] Channel: ${channel} | Identity: ${identity} | OTP: ${otp} | Purpose: ${purpose}`);
    console.log(`\n\x1b[33m--- [DEV OTP BYPASS] Channel: ${channel} | Identity: ${identity} | OTP: ${otp} | Purpose: ${purpose} ---\x1b[0m\n`);
  }
  if (channel === 'sms') {
    return smsService.sendOtpSms(identity, otp, smsPurposeForOtp(purpose));
  }
  const deliveryConfigured = await sendOtpEmail(identity, otp, subject);
  return { success: Boolean(deliveryConfigured), skipped: !deliveryConfigured, reason: deliveryConfigured ? undefined : 'SMTP not configured' };
};

const getPrimarySellerOffice = (sellerProfile: any) =>
  Array.isArray(sellerProfile?.offices) ? sellerProfile.offices[0] : null;

const ensureOrganizationForDualRole = async (user: any, targetRole: 'buyer' | 'seller') => {
  if (user.organization) return user.organization;
  if (user.organizationId) {
    const existing = await prisma.organization.findUnique({ where: { id: user.organizationId } });
    if (existing) return existing;
  }

  const registration = asObject(user.registrationDetails);
  const sellerOffice = getPrimarySellerOffice(user.sellerProfile);
  const orgName = firstValue(
    user.buyerProfile?.organizationName,
    user.sellerProfile?.businessName,
    user.sellerProfile?.nameAsInPan,
    registration.businessName,
    registration.accountName,
    user.name,
    'Organization'
  );
  const pan = firstValue(user.buyerProfile?.pan, user.sellerProfile?.pan, registration.pan);
  const gst = firstValue(user.buyerProfile?.gst, sellerOffice?.gstNumber, registration.gstin);

  const defaultCompanyId = user.companyId || await getDefaultCompanyId();
  return prisma.organization.create({
    data: {
      organizationName: orgName,
      organizationType: targetRole === 'buyer' ? 'GOVERNMENT' : 'MSME',
      panNumber: pan || null,
      gstin: gst || null,
      cinNumber: firstValue(user.buyerProfile?.cin, registration.cinNumber, registration.cin) || null,
      website: firstValue(user.buyerProfile?.website, registration.website) || null,
      state: firstValue(user.buyerProfile?.state, sellerOffice?.state, registration.state) || null,
      district: firstValue(user.buyerProfile?.district, registration.district) || null,
      city: firstValue(user.buyerProfile?.city, sellerOffice?.city, registration.city) || null,
      pincode: firstValue(user.buyerProfile?.pincode, sellerOffice?.pincode, registration.pincode) || null,
      addressLine1: firstValue(user.buyerProfile?.registeredAddress, sellerOffice?.address, registration.address) || null,
      country: 'India',
      companyId: defaultCompanyId,
      verificationStatus: user.onboardingStatus === 'approved_for_procurement' ? 'VERIFIED' : 'PENDING'
    }
  });
};

const buildSafeAuthPayload = async (userId: number) => prisma.user.findUnique({
  where: { id: userId },
  include: {
    buyerProfile: true,
    sellerProfile: { include: { offices: true, bankAccounts: true, sellerDocuments: { include: { fileAsset: true } } } },
    organization: true
  }
});

export const authController = {
  sendEmailOtp: async (req: Request, res: Response) => {
    try {
      const email = String(req.body.email || '').trim().toLowerCase();
      if (!email) return res.status(400).json({ message: 'Email is required' });

      // Preemptive check: Does user already exist in DB?
      const existingUser = await prisma.user.findUnique({ where: { email } });
      if (existingUser) {
        await auditLog({
          action: 'auth.otp.rejected_existing_user',
          entityType: 'auth',
          ipAddress: req.ip,
          userAgent: req.headers['user-agent'],
          metadata: { emailHash: sha256(email) }
        });
        return res.status(400).json({ message: 'User already exists. Please login directly.' });
      }
      const otp = generateOtp();

      const otpState = await storeEmailOtp(email, otp);
      if (env.NODE_ENV !== 'production') {
        logger.info({ email, otp }, `[DEV OTP BYPASS] Email: ${email} | OTP: ${otp}`);
        console.log(`\n\x1b[33m--- [DEV OTP BYPASS] Email: ${email} | OTP: ${otp} ---\x1b[0m\n`);
      }

      const deliveryConfigured = await sendOtpEmail(email, otp, '[SECURE AUTH] Email verification code');
      await auditLog({
        action: 'auth.otp.sent',
        entityType: 'auth',
        ipAddress: req.ip,
        userAgent: req.headers['user-agent'],
        metadata: { emailHash: sha256(email), purpose: 'registration_email', deliveryConfigured }
      });
      res.json({ success: true, sendsRemaining: otpState.sendsRemaining });
    } catch (err: any) {
      console.error('[Email OTP] Failed:', err);
      handleSecureRouteError(res, err, 'Unable to send OTP right now. Please try again.');
    }
  },

  verifyEmailOtp: async (req: Request, res: Response) => {
    try {
      const email = String(req.body.email || '').trim().toLowerCase();
      const otp = String(req.body.otp || '').trim();
      const result = await verifyEmailOtp(email, otp);
      if (!result.ok && result.reason === 'expired') {
        await auditLog({
          action: 'auth.otp.failed',
          entityType: 'auth',
          ipAddress: req.ip,
          userAgent: req.headers['user-agent'],
          metadata: { emailHash: sha256(email), reason: 'expired' }
        });
        return res.status(400).json({ message: 'OTP expired. Please request a new code.' });
      }
      if (!result.ok) {
        await auditLog({
          action: 'auth.otp.failed',
          entityType: 'auth',
          ipAddress: req.ip,
          userAgent: req.headers['user-agent'],
          metadata: { emailHash: sha256(email), reason: result.reason }
        });
        const remaining = result.attemptsRemaining ?? 0;
        if (result.reason === 'max_attempts' || remaining <= 0) {
          return res.status(400).json({ message: 'Invalid OTP. No attempts remaining. Please request a new code.', attemptsRemaining: 0 });
        }
        const label = remaining === 1 ? 'last trial is remaining' : `${remaining} trials are remaining`;
        return res.status(400).json({ message: `Invalid OTP. ${label}.`, attemptsRemaining: remaining });
      }
      await auditLog({
        action: 'auth.otp.verified',
        entityType: 'auth',
        ipAddress: req.ip,
        userAgent: req.headers['user-agent'],
        metadata: { emailHash: sha256(email) }
      });
      res.json({ success: true });
    } catch (err: any) {
      handleSecureRouteError(res, err);
    }
  },

  sendMobileOtp: async (req: Request, res: Response) => {
    try {
      const isSmsEnabled = await isSmsFeatureEnabledForCompany(null);
      if (!isSmsEnabled) {
        return res.status(403).json({ message: 'SMS verification is currently disabled.' });
      }

      const mobile = toLocalIndianMobile(req.body.mobile);
      if (!mobile) return res.status(400).json({ message: 'Valid Indian mobile number is required' });

      const existingUser = await prisma.user.findFirst({ where: { mobile } });
      if (existingUser) {
        await auditLog({
          action: 'auth.otp.rejected_existing_mobile',
          entityType: 'auth',
          ipAddress: req.ip,
          userAgent: req.headers['user-agent'],
          metadata: { mobileHash: sha256(mobile) }
        });
        return res.status(400).json({ message: 'Mobile number already exists. Please login directly.' });
      }

      const otp = generateOtp();
      const otpState = await storeMobileOtp(mobile, otp);
      if (env.NODE_ENV !== 'production') {
        logger.info({ mobile, otp }, `[DEV OTP BYPASS] Mobile: ${mobile} | OTP: ${otp}`);
        console.log(`\n\x1b[33m--- [DEV OTP BYPASS] Mobile: ${mobile} | OTP: ${otp} ---\x1b[0m\n`);
      }
      const sms = await smsService.sendOtpSms(mobile, otp, 'registration_otp');
      await auditLog({
        action: 'auth.mobile_otp.sent',
        entityType: 'auth',
        ipAddress: req.ip,
        userAgent: req.headers['user-agent'],
        metadata: { mobileHash: sha256(mobile), purpose: 'registration_mobile', smsSent: sms.success, smsSkipped: sms.skipped, smsReason: sms.reason }
      });
      res.json({ success: true, sendsRemaining: otpState.sendsRemaining, smsEnabled: smsService.isEnabled() });
    } catch (err: any) {
      handleSecureRouteError(res, err, 'Unable to send OTP right now. Please try again.');
    }
  },

  verifyMobileOtp: async (req: Request, res: Response) => {
    try {
      const mobile = toLocalIndianMobile(req.body.mobile);
      const otp = String(req.body.otp || '').trim();
      if (!mobile) return res.status(400).json({ message: 'Valid Indian mobile number is required' });

      const result = await verifyMobileOtp(mobile, otp);
      if (!result.ok) {
        await auditLog({
          action: 'auth.mobile_otp.failed',
          entityType: 'auth',
          ipAddress: req.ip,
          userAgent: req.headers['user-agent'],
          metadata: { mobileHash: sha256(mobile), reason: result.reason }
        });
        return res.status(400).json({ message: result.reason === 'expired' ? 'OTP expired. Please request a new code.' : 'Invalid OTP' });
      }
      await auditLog({
        action: 'auth.mobile_otp.verified',
        entityType: 'auth',
        ipAddress: req.ip,
        userAgent: req.headers['user-agent'],
        metadata: { mobileHash: sha256(mobile) }
      });
      res.json({ success: true });
    } catch (err: any) {
      handleSecureRouteError(res, err);
    }
  },

  sendOtp: async (req: Request, res: Response) => {
    const channel = normalizeChannel(req.body.channel || (req.body.mobile ? 'sms' : 'email'));
    if (channel === 'sms' && !req.body.mobile) req.body.mobile = req.body.identifier;
    if (channel === 'email' && !req.body.email) req.body.email = req.body.identifier;
    return channel === 'sms' ? authController.sendMobileOtp(req, res) : authController.sendEmailOtp(req, res);
  },

  verifyOtp: async (req: Request, res: Response) => {
    const channel = normalizeChannel(req.body.channel || (req.body.mobile ? 'sms' : 'email'));
    if (channel === 'sms' && !req.body.mobile) req.body.mobile = req.body.identifier;
    if (channel === 'email' && !req.body.email) req.body.email = req.body.identifier;
    return channel === 'sms' ? authController.verifyMobileOtp(req, res) : authController.verifyEmailOtp(req, res);
  },

  mobileExists: async (req: Request, res: Response) => {
    try {
      const mobile = String(req.query.mobile || '').trim();
      if (!/^[6-9]\d{9}$/.test(mobile) || /^(\d)\1{9}$/.test(mobile)) {
        return res.status(400).json({ message: 'Enter a valid 10 digit Indian mobile number' });
      }

      const existingUser = await prisma.user.findFirst({
        where: { mobile },
        select: { id: true }
      });

      res.json({ exists: Boolean(existingUser) });
    } catch (err: any) {
      handleSecureRouteError(res, err);
    }
  },

  register: async (req: Request, res: Response) => {
    try {
      const { password, role, registrationDetails, mobile, dob } = req.body;
      const email = String(req.body.email || '').trim().toLowerCase();
      const name = String(
        req.body.name ||
        registrationDetails?.accountName ||
        registrationDetails?.userId ||
        registrationDetails?.businessName ||
        email
      ).trim();
      const emailOtpRecord = await assertEmailOtpVerified(email);
      if (!emailOtpRecord.ok) {
        if (emailOtpRecord.reason === 'expired') {
          return res.status(400).json({ message: 'Email OTP expired. Please request a new code.' });
        }
        return res.status(400).json({ message: 'Please verify your email address first.' });
      }

      const isSmsEnabled = await isSmsFeatureEnabledForCompany(null);
      let mobileOtpRecord = { ok: false, reason: '' };

      if (isSmsEnabled) {
        if (!mobile) {
          return res.status(400).json({ message: 'Mobile number is required' });
        }
        const normalizedMobile = smsService.normalizeMobile(mobile);
        if (!normalizedMobile) {
          return res.status(400).json({ message: 'Valid 10-digit Indian mobile number is required' });
        }
        mobileOtpRecord = await assertMobileOtpVerified(normalizedMobile);
        if (!mobileOtpRecord.ok) {
          if (mobileOtpRecord.reason === 'expired') {
            return res.status(400).json({ message: 'Mobile OTP expired. Please request a new code.' });
          }
          return res.status(400).json({ message: 'Please verify your mobile number first.' });
        }
      } else if (mobile) {
        const normalizedMobile = smsService.normalizeMobile(mobile);
        if (normalizedMobile) {
          mobileOtpRecord = await assertMobileOtpVerified(normalizedMobile);
          if (!mobileOtpRecord.ok) {
            if (mobileOtpRecord.reason === 'expired') {
              return res.status(400).json({ message: 'Mobile OTP expired. Please request a new code.' });
            }
            return res.status(400).json({ message: 'Please verify your mobile number first.' });
          }
        }
      }

      const passwordValidation = validatePasswordStrength(String(password || ''));
      if (!passwordValidation.ok) {
        return res.status(400).json({
          message: 'Password does not meet security requirements',
          errors: passwordValidation.errors
        });
      }

      const existingEmail = await prisma.user.findUnique({ where: { email } });
      if (existingEmail) return res.status(400).json({ message: 'Email already registered. Please log in.' });

      if (mobile) {
        const existingMobile = await prisma.user.findFirst({ where: { mobile: String(mobile).trim() } });
        if (existingMobile) return res.status(400).json({ message: 'Mobile number already in use. Please use unique details.' });
      }

      logger.debug({ bodyKeys: Object.keys(req.body) }, '[DEBUG REGISTER] req.body keys');
      if (req.body.registrationDetails) {
        logger.debug({ detailsKeys: Object.keys(req.body.registrationDetails) }, '[DEBUG REGISTER] req.body.registrationDetails keys');
      }

      const kycSessionToken = String(
        req.body.registrationDetails?.aadhaarVerificationId ||
        req.body.aadhaarVerificationId ||
        req.body.kycSessionToken ||
        ''
      ).trim();
      let kycSession = null;

      logger.debug({ hasKycSessionToken: !!kycSessionToken }, '[DEBUG REGISTER] aadhaarVerificationId / kycSessionToken received');

      if ((role === 'buyer' || role === 'seller') && registrationDetails?.verificationMethod === 'aadhaar') {
        if (kycSessionToken) {
          const kycSessionTokenHash = sha256(kycSessionToken);
          kycSession = await prisma.preRegistrationKycSession.findUnique({ where: { kycSessionTokenHash } });
          if (kycSession) {
            logger.debug({
              id: kycSession.id,
              status: kycSession.status,
              used: kycSession.used,
              expiresAt: kycSession.expiresAt,
              isExpired: kycSession.expiresAt <= new Date()
            }, '[DEBUG REGISTER] DB KycSession record found');
            if (kycSession.status === 'VERIFIED' && !kycSession.used && kycSession.expiresAt > new Date()) {
              if (registrationDetails) {
                registrationDetails.isAadhaarVerified = true;
                if (!registrationDetails.aadhaarNumber && kycSession.aadhaarLast4) {
                  registrationDetails.aadhaarNumber = `XXXX XXXX ${kycSession.aadhaarLast4}`;
                }
              }
            }
          } else {
            logger.debug({ tokenHash: kycSessionTokenHash }, '[DEBUG REGISTER] DB KycSession record NOT found for hash');
          }
        }
      }

      const personalValidation = validatePersonalVerification(role, registrationDetails, dob, mobile);
      if ((role === 'buyer' || role === 'seller') && registrationDetails?.verificationMethod === 'aadhaar') {
        if (!kycSessionToken) {
          personalValidation.errors.aadhaarVerified = 'Please verify Aadhaar before creating the account.';
          personalValidation.isValid = false;
        } else if (!kycSession) {
          personalValidation.errors.aadhaarVerified = 'Aadhaar verification could not be confirmed.';
          personalValidation.isValid = false;
        } else if (kycSession.status !== 'VERIFIED') {
          personalValidation.errors.aadhaarVerified = 'Please verify Aadhaar before creating the account.';
          personalValidation.isValid = false;
        } else if (kycSession.expiresAt <= new Date()) {
          personalValidation.errors.aadhaarVerified = 'Aadhaar verification expired. Please verify again.';
          personalValidation.isValid = false;
        } else if (kycSession.used) {
          personalValidation.errors.aadhaarVerified = 'Aadhaar verification has already been used. Please verify again.';
          personalValidation.isValid = false;
        }
      }
      if (!personalValidation.isValid) {
        return res.status(400).json({
          message: 'Invalid personal verification details',
          errors: personalValidation.errors
        });
      }

      const hashedPassword = await hashPassword(password);
      const user = await prisma.user.create({
        data: {
          userId: email,
          name, email, password: hashedPassword,
          role: role as Role,
          accountTypeId: role === 'seller' ? 2 : role === 'shg' ? 4 : role === 'buyer' ? 3 : role === 'admin' ? 1 : 3,
          mobile,
          dob: (dob && !isNaN(Date.parse(dob))) ? new Date(dob) : null,
          emailVerified: emailOtpRecord.ok,
          mobileVerified: mobileOtpRecord.ok,
          lastPasswordChangeAt: new Date(),
          registrationStatus: RegistrationStatus.completed,
          accountStatus: 'ACTIVE',
          onboardingStatus: 'pending',
          registrationDetails: sanitizeRegistrationDetails(registrationDetails)
        }
      });

      if (user.role === 'buyer' || user.role === 'seller') {
        const rDetails = asObject(registrationDetails);
        const gstDetails = asObject(rDetails.gstDetails);

        const orgName = firstValue(
          rDetails.businessName,
          rDetails.organisation,
          gstDetails.legalName,
          gstDetails.tradeName,
          name,
          'Default Organisation'
        );

        let orgType: OrganizationType = 'MSME';
        if (user.role === 'buyer') {
          orgType = 'GOVERNMENT';
        } else {
          const typeStr = String(rDetails.businessType || rDetails.organisationType || '').trim().toUpperCase();
          if (typeStr.includes('PROPRIETORSHIP')) {
            orgType = 'PROPRIETORSHIP';
          } else if (typeStr.includes('PARTNERSHIP')) {
            orgType = 'PARTNERSHIP';
          } else if (typeStr.includes('LLP')) {
            orgType = 'LLP';
          } else if (typeStr.includes('STARTUP')) {
            orgType = 'STARTUP';
          } else if (typeStr.includes('PRIVATE_LIMITED') || typeStr.includes('PVT LTD') || typeStr.includes('PVT. LTD.')) {
            orgType = 'PRIVATE_LIMITED';
          } else if (typeStr.includes('PUBLIC_LIMITED') || typeStr.includes('PUBLIC LTD')) {
            orgType = 'PUBLIC_LIMITED';
          } else if (typeStr.includes('SHG')) {
            orgType = 'SHG';
          } else if (typeStr.includes('NGO')) {
            orgType = 'NGO';
          } else if (typeStr.includes('TRUST')) {
            orgType = 'TRUST';
          } else if (typeStr.includes('SOCIETY')) {
            orgType = 'SOCIETY';
          } else if (typeStr.includes('GOVERNMENT')) {
            orgType = 'GOVERNMENT';
          } else if (typeStr.includes('PSU')) {
            orgType = 'PSU';
          } else {
            orgType = 'MSME';
          }
        }

        const stateVal = firstValue(rDetails.state, gstDetails.state) || null;
        const districtVal = firstValue(rDetails.district, gstDetails.district, gstDetails.city) || null;
        const cityVal = firstValue(gstDetails.city, rDetails.district) || null;
        const pincodeVal = firstValue(gstDetails.pincode) || null;
        const addressLine1Val = firstValue(rDetails.officeZoneName, gstDetails.address) || null;

        // Resolve default company so org & user are linked to it from the start
        const defaultCompanyId = await getDefaultCompanyId();

        const createdOrg = await prisma.organization.create({
          data: {
            organizationName: orgName,
            organizationType: orgType,
            gstin: firstValue(rDetails.gstin) || null,
            panNumber: firstValue(rDetails.pan, rDetails.panNumber, gstDetails.pan) || null,
            udyamNumber: firstValue(rDetails.udyamNumber) || null,
            cinNumber: firstValue(rDetails.cin) || null,
            website: firstValue(rDetails.website) || null,
            state: stateVal,
            district: districtVal,
            city: cityVal,
            pincode: pincodeVal,
            addressLine1: addressLine1Val,
            verificationStatus: 'PENDING',
            organizationOnboardingStatus: 'pending',
            companyId: defaultCompanyId
          }
        });

        await prisma.user.update({
          where: { id: user.id },
          data: { organizationId: createdOrg.id, companyId: defaultCompanyId }
        });

        await prisma.orgMembership.create({
          data: {
            userId: user.id,
            organizationId: createdOrg.id,
            orgRole: OrgRole.ORG_ADMIN,
            isActive: true,
            invitedAt: new Date(),
            acceptedAt: new Date()
          }
        });

        await onUserLinkedToOrganization(user.id, createdOrg.id).catch(err => {
          console.error('[Register Org Hook Error]:', err);
        });

        user.organizationId = createdOrg.id;
      }

      if (kycSession) {
        await prisma.$transaction([
          prisma.preRegistrationKycSession.update({ where: { id: kycSession.id }, data: { used: true, usedAt: new Date() } }),
          prisma.userKycVerification.upsert({
            where: { userId_provider_verificationType: { userId: user.id, provider: 'MERIPEHCHAAN', verificationType: 'AADHAAR' } },
            create: {
              userId: user.id,
              provider: 'MERIPEHCHAAN',
              verificationType: 'AADHAAR',
              status: 'VERIFIED',
              verifiedName: kycSession.verifiedName,
              verifiedDob: kycSession.verifiedDob,
              verifiedGender: kycSession.verifiedGender,
              referenceKey: kycSession.referenceKey,
              idTokenSubject: kycSession.idTokenSubject,
              idTokenVerified: kycSession.idTokenVerified,
              verifiedAt: kycSession.verifiedAt || new Date()
            },
            update: {
              status: 'VERIFIED',
              verifiedName: kycSession.verifiedName,
              verifiedDob: kycSession.verifiedDob,
              verifiedGender: kycSession.verifiedGender,
              referenceKey: kycSession.referenceKey,
              idTokenSubject: kycSession.idTokenSubject,
              idTokenVerified: kycSession.idTokenVerified,
              verifiedAt: kycSession.verifiedAt || new Date()
            }
          })
        ]);
      }


      if (emailOtpRecord.ok) await consumeEmailOtp(email).catch(() => undefined);
      if (mobileOtpRecord.ok && mobile) await consumeMobileOtp(String(mobile).trim()).catch(() => undefined);

      try {
        await notificationService.notifyAdmins({
          title: 'New Stakeholder Registered',
          message: `${user.name} has registered as a new ${user.role}. Email: ${user.email}.`,
          type: 'stakeholder_registered',
          priority: 'medium',
          redirectUrl: '/admin/onboarding'
        });
      } catch (err) {
        console.error('[Register Notification] Failed to notify admins:', err);
      }

      const tokens = issueAuthResponse(user);
      await auditLog({
        actorUserId: user.id,
        action: 'auth.register',
        entityType: 'user',
        entityId: user.id,
        ipAddress: req.ip,
        userAgent: req.headers['user-agent'],
        metadata: { role: user.role }
      });

      if (user.role === Role.buyer || user.role === Role.seller) {
        try {
          await notificationService.notifyAdminsWithEmail({
            title: 'New User Registered',
            message: `${user.name} (${user.role}) has completed account registration and is ready for onboarding review.`,
            type: 'user_registered',
            priority: 'medium',
            redirectUrl: '/admin/onboarding',
            emailSubject: 'New User Registration — JsgSmile Procurement Portal',
            emailHtml: `<p>A new ${user.role} account has completed registration.</p><p><strong>Name:</strong> ${user.name}</p><p><strong>Email:</strong> ${user.email}</p><p><strong>Next Step:</strong> Monitor onboarding completion in Admin Onboarding.</p>`
          });
        } catch (_error) {
          // Suppress notification errors to keep registration non-blocking.
        }
      }

      res.status(201).json({ ...tokens, user: toSafeUser(user) });
    } catch (err: any) {
      handleSecureRouteError(res, err, 'Unable to register right now. Please try again.');
    }
  },

  login: async (req: Request, res: Response) => {
    try {
      const emailOrMobile = String(req.body.email || '').trim().toLowerCase();
      const { password } = req.body;
      let user = null;
      if (emailOrMobile.includes('@')) {
        user = await prisma.user.findUnique({ where: { email: emailOrMobile } });
      } else {
        const localMobile = toLocalIndianMobile(emailOrMobile) || emailOrMobile;
        user = await prisma.user.findFirst({ where: { mobile: localMobile } });
      }

      if (!user) {
        await recordLoginEvent({ req, success: false, reason: 'user_not_found' });
        await auditLog({
          action: 'auth.login.failed',
          entityType: 'auth',
          ipAddress: req.ip,
          userAgent: req.headers['user-agent'],
          metadata: { identifierHash: sha256(emailOrMobile), reason: 'not_found' }
        });
        return res.status(400).json({ message: 'Invalid credentials' });
      }

      if (user.lockedUntil && user.lockedUntil > new Date()) {
        await recordLoginEvent({ req, userId: user.id, success: false, reason: 'account_locked' });
        await auditLog({
          actorUserId: user.id,
          actorRole: user.role,
          action: 'auth.login.locked',
          entityType: 'user',
          entityId: user.id,
          ipAddress: req.ip,
          userAgent: req.headers['user-agent']
        });
        return res.status(423).json({ message: 'Account is temporarily locked. Please try again later.' });
      }

      if (user.accountStatus !== 'ACTIVE') {
        await recordLoginEvent({ req, userId: user.id, success: false, reason: 'account_disabled' });
        await auditLog({
          actorUserId: user.id,
          actorRole: user.role,
          action: 'auth.login.disabled',
          entityType: 'user',
          entityId: user.id,
          ipAddress: req.ip,
          userAgent: req.headers['user-agent'],
          metadata: { accountStatus: user.accountStatus }
        });
        return res.status(403).json({ message: 'Your account is inactive or blocked. Please contact the platform administrator.' });
      }


      const isMatch = await verifyPassword(String(password || ''), user.password);
      if (!isMatch) {
        const nextFailedCount = user.failedLoginCount + 1;
        const shouldLock = nextFailedCount >= env.FAILED_LOGIN_LOCK_THRESHOLD;
        const lockedUntil = shouldLock
          ? new Date(Date.now() + env.FAILED_LOGIN_LOCK_MINUTES * 60 * 1000)
          : null;
        await prisma.user.update({
          where: { id: user.id },
          data: {
            failedLoginCount: nextFailedCount,
            ...(lockedUntil ? { lockedUntil } : {})
          }
        });
        await recordLoginEvent({ req, userId: user.id, success: false, reason: shouldLock ? 'account_locked' : 'password_mismatch' });
        await auditLog({
          actorUserId: user.id,
          actorRole: user.role,
          action: 'auth.login.failed',
          entityType: 'user',
          entityId: user.id,
          ipAddress: req.ip,
          userAgent: req.headers['user-agent'],
          metadata: { reason: 'password_mismatch', failedLoginCount: nextFailedCount, locked: shouldLock }
        });
        if (shouldLock) {
          await createNotificationSafe({
            userId: user.id,
            title: 'Account temporarily locked',
            message: `Your account was temporarily locked after repeated failed login attempts. Try again after ${env.FAILED_LOGIN_LOCK_MINUTES} minutes or contact an administrator.`,
            type: 'account_locked'
          });
          await auditLog({
            actorUserId: user.id,
            actorRole: user.role,
            action: 'auth.account.locked',
            entityType: 'user',
            entityId: user.id,
            ipAddress: req.ip,
            userAgent: req.headers['user-agent'],
            metadata: { lockedUntil }
          });
        }
        return res.status(400).json({ message: 'Invalid credentials' });
      }

      if (user.twoFactorEnabled) {
        const otp = generateOtp();
        const clientRequestedChannel = req.body.channel ? normalizeChannel(req.body.channel) : null;
        const configuredChannel = clientRequestedChannel || normalizeChannel((user as any).twoFactorChannel || (user as any).preferredOtpChannel);
        const isSmsEnabled = await isSmsFeatureEnabledForCompany(user.companyId);
        const hasMobileVerified = user.mobileVerified && user.mobile && smsService.isEnabled() && isSmsEnabled;
                let channel: OtpChannel = (configuredChannel === 'sms' && hasMobileVerified) ? 'sms' : 'email';
        let otpIdentity = channel === 'sms' ? String(user.mobile) : user.email;
        
        await storeOtp('two_factor_login', otpIdentity, otp, { userId: user.id, channel }, channel);
        let delivery = await sendOtpByChannel(channel, otpIdentity, otp, '[SECURE AUTH] Two-factor login code', 'two_factor_login');
        
        if (channel === 'sms' && !delivery.success) {
          channel = 'email';
          otpIdentity = user.email;
          await storeOtp('two_factor_login', otpIdentity, otp, { userId: user.id, channel }, channel);
          delivery = await sendOtpByChannel(channel, otpIdentity, otp, '[SECURE AUTH] Two-factor login code (Fallback)', 'two_factor_login');
        }
 
        await auditLog({
          actorUserId: user.id,
          actorRole: user.role,
          action: 'auth.2fa.challenge_sent',
          entityType: 'user',
          entityId: user.id,
          ipAddress: req.ip,
          userAgent: req.headers['user-agent'],
          metadata: { channel, deliveryConfigured: delivery.success, smsSkipped: delivery.skipped, smsReason: delivery.reason }
        });
        await recordLoginEvent({ req, userId: user.id, success: false, reason: 'two_factor_required' });
        return res.json({
          requiresTwoFactor: true,
          email: user.email,
          channel,
          canSms: !!hasMobileVerified,
          message: 'Two-factor verification required'
        });
      }

      const updatedUser = await prisma.user.update({
        where: { id: user.id },
        data: { failedLoginCount: 0, lockedUntil: null, lastLoginAt: new Date() }
      });
      const tokens = issueAuthResponse(updatedUser);
      await auditLog({
        actorUserId: user.id,
        actorRole: user.role,
        action: 'auth.login.success',
        entityType: 'user',
        entityId: user.id,
        ipAddress: req.ip,
        userAgent: req.headers['user-agent']
      });
      await recordLoginEvent({ req, userId: user.id, success: true, reason: 'password_login' });
      res.json({ ...tokens, user: toSafeUser(updatedUser) });
    } catch (err: any) {
      handleSecureRouteError(res, err, 'Unable to sign in right now. Please try again.');
    }
  },

  verify2fa: async (req: Request, res: Response) => {
    try {
      const email = String(req.body.email || '').trim().toLowerCase();
      const requestedChannel = normalizeChannel(req.body.channel);
      const otp = String(req.body.otp || '').trim();

      const user = await prisma.user.findUnique({ where: { email } });
      if (!user) return res.status(400).json({ message: 'Invalid verification request' });
      const channel: OtpChannel = requestedChannel === 'sms' && user.mobileVerified && user.mobile ? 'sms' : 'email';
      const otpIdentity = channel === 'sms' ? String(user.mobile) : email;
      const result = await verifyOtp('two_factor_login', otpIdentity, otp);

      if (!result.ok) {
        await recordLoginEvent({ req, userId: user.id, success: false, reason: `two_factor_${result.reason}` });
        await auditLog({
          actorUserId: user.id,
          actorRole: user.role,
          action: 'auth.otp.failed',
          entityType: 'user',
          entityId: user.id,
          ipAddress: req.ip,
          userAgent: req.headers['user-agent'],
          metadata: { purpose: 'two_factor_login', reason: result.reason }
        });
        return res.status(400).json({ message: result.reason === 'expired' ? 'OTP expired' : 'Invalid OTP' });
      }

      await consumeOtp('two_factor_login', otpIdentity);
      const updatedUser = await prisma.user.update({
        where: { id: user.id },
        data: { failedLoginCount: 0, lockedUntil: null, lastLoginAt: new Date() }
      });
      const tokens = issueAuthResponse(updatedUser);
      await auditLog({
        actorUserId: user.id,
        actorRole: user.role,
        action: 'auth.otp.verified',
        entityType: 'user',
        entityId: user.id,
        ipAddress: req.ip,
        userAgent: req.headers['user-agent'],
        metadata: { purpose: 'two_factor_login', channel }
      });
      await recordLoginEvent({ req, userId: user.id, success: true, reason: 'two_factor_login' });
      res.json({ ...tokens, user: toSafeUser(updatedUser) });
    } catch (err: any) {
      handleSecureRouteError(res, err, 'Unable to check mobile number right now. Please try again.');
    }
  },

  refresh: async (req: Request, res: Response) => {
    try {
      const refreshToken = String(req.body.refreshToken || '');
      const decoded = verifyRefreshToken(refreshToken);
      if (decoded.type !== 'refresh' || !decoded.id || Number.isNaN(Number(decoded.sessionVersion))) {
        return res.status(401).json({ message: 'Invalid refresh token' });
      }

      const user = await prisma.user.findUnique({ where: { id: Number(decoded.id) } });
      if (!user || user.sessionVersion !== Number(decoded.sessionVersion)) {
        return res.status(401).json({ message: 'Session expired. Please sign in again.' });
      }

      res.json(issueAuthResponse(user));
    } catch {
      res.status(401).json({ message: 'Invalid refresh token' });
    }
  },

  logout: async (req: AuthRequest, res: Response) => {
    try {
      await prisma.user.update({
        where: { id: Number(req.user?.id) },
        data: { sessionVersion: { increment: 1 } }
      });
      await auditLog({
        actorUserId: Number(req.user?.id),
        actorRole: req.user?.role,
        action: 'auth.logout',
        entityType: 'user',
        entityId: Number(req.user?.id),
        ipAddress: req.ip,
        userAgent: req.headers['user-agent']
      });
      res.json({ success: true });
    } catch (err: any) {
      handleSecureRouteError(res, err, 'Unable to register right now. Please try again.');
    }
  },

  forgotPassword: async (req: Request, res: Response) => {
    try {
      const channel = channelFromBody(req.body);
      if (channel === 'sms') {
        const isSmsEnabled = await isSmsFeatureEnabledForCompany(null);
        if (!isSmsEnabled) {
          return res.status(403).json({ message: 'SMS verification is currently disabled.' });
        }
      }
      const identifier = identityFromBody(req.body, channel);
      if (!identifier) return res.status(400).json({ message: channel === 'sms' ? 'Valid Indian mobile number is required' : 'Valid email is required' });
      const user = await prisma.user.findFirst({ where: userLookupForIdentity(identifier, channel) });

      const otp = generateOtp();
      await storeOtp('forgot_password', identifier, otp, { userId: user ? user.id : null, channel }, channel);

      if (user) {
        const delivery = await sendOtpByChannel(channel, identifier, otp, '[SECURE AUTH] Password reset code', 'forgot_password');
        await auditLog({
          actorUserId: user.id,
          actorRole: user.role,
          action: 'auth.password_reset.requested',
          entityType: 'user',
          entityId: user.id,
          ipAddress: req.ip,
          userAgent: req.headers['user-agent'],
          metadata: { channel, deliveryConfigured: delivery.success, smsSkipped: delivery.skipped, smsReason: delivery.reason }
        });
      } else {
        await auditLog({
          action: 'auth.password_reset.requested_unknown',
          entityType: 'auth',
          ipAddress: req.ip,
          userAgent: req.headers['user-agent'],
          metadata: { channel, identifierHash: sha256(identifier) }
        });
      }

      res.json({ success: true, message: 'If the details are registered, an OTP has been sent.' });
    } catch (err: any) {
      handleSecureRouteError(res, err);
    }
  },

  verifyForgotPasswordOtp: async (req: Request, res: Response) => {
    try {
      const channel = channelFromBody(req.body);
      const identifier = identityFromBody(req.body, channel);
      const otp = String(req.body.otp || '').trim();
      if (!identifier) return res.status(400).json({ message: 'Invalid verification request' });

      const result = await verifyOtp('forgot_password', identifier, otp);
      if (!result.ok) {
        return res.status(400).json({ message: result.reason === 'expired' ? 'OTP expired' : 'Invalid OTP' });
      }

      const user = await prisma.user.findFirst({ where: userLookupForIdentity(identifier, channel) });
      const otpToken = sha256(`${user ? user.id : 'none'}:${identifier}:${Date.now()}`).slice(0, 32);

      const tokenKey = `reset_token:${otpToken}`;
      const tokenData = { userId: user ? user.id : null, identifier, channel };
      if (redis && isRedisReady()) {
        await redis.set(tokenKey, JSON.stringify(tokenData), 'EX', 10 * 60);
      } else {
        localResetTokens.set(tokenKey, { ...tokenData, expiresAt: Date.now() + 10 * 60 * 1000 });
      }

      if (user) {
        await auditLog({
          actorUserId: user.id,
          actorRole: user.role,
          action: 'auth.otp.verified',
          entityType: 'user',
          entityId: user.id,
          ipAddress: req.ip,
          userAgent: req.headers['user-agent'],
          metadata: { purpose: 'forgot_password', channel }
        });
      }

      res.json({ success: true, otpToken });
    } catch (err: any) {
      handleSecureRouteError(res, err);
    }
  },

  resetPassword: async (req: Request, res: Response) => {
    try {
      const channel = channelFromBody(req.body);
      const identifier = identityFromBody(req.body, channel);
      const otp = String(req.body.otp || '').trim();
      const otpToken = String(req.body.otpToken || '').trim();
      const newPassword = String(req.body.newPassword || '');
      if (!identifier) return res.status(400).json({ message: 'Invalid reset request' });
      const passwordValidation = validatePasswordStrength(newPassword);
      if (!passwordValidation.ok) {
        return res.status(400).json({ message: 'Password does not meet security requirements', errors: passwordValidation.errors });
      }

      let verified = false;
      let targetUserId: number | null = null;

      if (otpToken) {
        const tokenKey = `reset_token:${otpToken}`;
        let tokenData: { userId: number | null, identifier: string, channel: string } | null = null;
        if (redis && isRedisReady()) {
          const raw = await redis.get(tokenKey);
          if (raw) tokenData = JSON.parse(raw);
        } else {
          const local = localResetTokens.get(tokenKey);
          if (local && local.expiresAt > Date.now()) {
            tokenData = local;
          }
        }

        if (!tokenData || tokenData.identifier !== identifier || tokenData.channel !== channel) {
          return res.status(400).json({ message: 'Invalid or expired reset token' });
        }
        verified = true;
        targetUserId = tokenData.userId;
      } else if (otp) {
        const result = await verifyOtp('forgot_password', identifier, otp);
        if (!result.ok) {
          const userObj = await prisma.user.findFirst({ where: userLookupForIdentity(identifier, channel) });
          if (userObj) {
            await auditLog({
              actorUserId: userObj.id,
              actorRole: userObj.role,
              action: 'auth.otp.failed',
              entityType: 'user',
              entityId: userObj.id,
              ipAddress: req.ip,
              userAgent: req.headers['user-agent'],
              metadata: { purpose: 'forgot_password', channel, reason: result.reason }
            });
          }
          return res.status(400).json({ message: result.reason === 'expired' ? 'OTP expired' : 'Invalid OTP' });
        }
        const userObj = await prisma.user.findFirst({ where: userLookupForIdentity(identifier, channel) });
        targetUserId = userObj ? userObj.id : null;
        verified = true;
      } else {
        return res.status(400).json({ message: 'Verification code or reset token is required' });
      }

      if (!targetUserId) {
        return res.json({ success: true, message: 'Password reset successful. Please sign in again.' });
      }

      const user = await prisma.user.findUnique({ where: { id: targetUserId } });
      if (!user) {
        return res.json({ success: true, message: 'Password reset successful. Please sign in again.' });
      }

      await prisma.user.update({
        where: { id: user.id },
        data: {
          password: await hashPassword(newPassword),
          passwordResetVersion: { increment: 1 },
          sessionVersion: { increment: 1 },
          failedLoginCount: 0,
          lockedUntil: null,
          lastPasswordChangeAt: new Date()
        }
      });

      if (otpToken) {
        const tokenKey = `reset_token:${otpToken}`;
        if (redis && isRedisReady()) {
          await redis.del(tokenKey).catch(() => undefined);
        } else {
          localResetTokens.delete(tokenKey);
        }
      }
      await consumeOtp('forgot_password', identifier);

      await auditLog({
        actorUserId: user.id,
        actorRole: user.role,
        action: 'auth.password_reset.completed',
        entityType: 'user',
        entityId: user.id,
        ipAddress: req.ip,
        userAgent: req.headers['user-agent']
      });
      res.json({ success: true, message: 'Password reset successful. Please sign in again.' });
    } catch (err: any) {
      handleSecureRouteError(res, err, 'Unable to sign in right now. Please try again.');
    }
  },

  enable2fa: async (req: AuthRequest, res: Response) => {
    try {
      const user = await prisma.user.findUnique({ where: { id: Number(req.user?.id) } });
      if (!user) return res.status(404).json({ message: 'User not found' });

      const otp = String(req.body.otp || '').trim();
      if (!otp) {
        const code = generateOtp();
        const requestedChannel = normalizeChannel(req.body.channel || (user as any).twoFactorChannel || (user as any).preferredOtpChannel);
        const channel: OtpChannel = requestedChannel === 'sms' && user.mobileVerified && user.mobile && smsService.isEnabled() ? 'sms' : 'email';
        const otpIdentity = channel === 'sms' ? String(user.mobile) : user.email;
        await storeOtp('two_factor_login', otpIdentity, code, { userId: user.id, action: 'enable_2fa', channel }, channel);
        await sendOtpByChannel(channel, otpIdentity, code, '[SECURE AUTH] Enable 2FA code', 'two_factor_login');
        return res.json({ success: true, pendingVerification: true, channel });
      }

      const requestedChannel = normalizeChannel(req.body.channel);
      const channel: OtpChannel = requestedChannel === 'sms' && user.mobileVerified && user.mobile ? 'sms' : 'email';
      const otpIdentity = channel === 'sms' ? String(user.mobile) : user.email;
      const result = await verifyOtp('two_factor_login', otpIdentity, otp);
      if (!result.ok) return res.status(400).json({ message: result.reason === 'expired' ? 'OTP expired' : 'Invalid OTP' });

      await prisma.user.update({ where: { id: user.id }, data: { twoFactorEnabled: true, twoFactorChannel: channel } as any });
      await consumeOtp('two_factor_login', otpIdentity);
      await auditLog({
        actorUserId: user.id,
        actorRole: user.role,
        action: 'auth.2fa.enabled',
        entityType: 'user',
        entityId: user.id,
        ipAddress: req.ip,
        userAgent: req.headers['user-agent']
      });
      res.json({ success: true, twoFactorEnabled: true });
    } catch (err: any) {
      handleSecureRouteError(res, err);
    }
  },

  disable2fa: async (req: AuthRequest, res: Response) => {
    try {
      const user = await prisma.user.findUnique({ where: { id: Number(req.user?.id) } });
      if (!user) return res.status(404).json({ message: 'User not found' });

      const password = String(req.body.password || '');
      if (!(await verifyPassword(password, user.password))) {
        return res.status(400).json({ message: 'Invalid credentials' });
      }

      await prisma.user.update({ where: { id: user.id }, data: { twoFactorEnabled: false } });
      await auditLog({
        actorUserId: user.id,
        actorRole: user.role,
        action: 'auth.2fa.disabled',
        entityType: 'user',
        entityId: user.id,
        ipAddress: req.ip,
        userAgent: req.headers['user-agent']
      });
      res.json({ success: true, twoFactorEnabled: false });
    } catch (err: any) {
      // Typo fixed in source logic, using secure route handler now
      return handleSecureRouteError(res, err);
    }
  },

  me: async (req: AuthRequest, res: Response) => {
    try {
      const user = await (prisma as any).user.findUnique({
        where: { id: Number(req.user?.id) },
        include: {
          sellerProfile: {
            include: {
              offices: true,
              bankAccounts: true,
              sellerDocuments: {
                include: {
                  fileAsset: true
                }
              }
            }
          },
          shgProfile: true,
          buyerProfile: true,
          organization: true,
          company: true,
          accountType: true
        }
      });
      if (!user) return res.status(404).json({ message: 'Not found' });

      const getDocumentEntries = (documents: any) =>
        documents && typeof documents === 'object' && !Array.isArray(documents)
          ? Object.entries(documents as Record<string, any>)
          : [];
      const enrichDocuments = async (documents: any) => {
        const entries = getDocumentEntries(documents);
        if (entries.length === 0) return documents;

        const assets = await prisma.fileAsset.findMany({
          where: { ownerId: user.id, status: 'active' },
          select: { id: true, ownerId: true, key: true, url: true, originalName: true, mimeType: true }
        });
        const findAsset = (url: string) => {
          const decodedUrl = (() => {
            try {
              return decodeURIComponent(url);
            } catch {
              return url;
            }
          })();
          return assets.find(asset => asset.url === url || decodedUrl.includes(asset.key));
        };

        return Object.fromEntries(entries.map(([key, value]) => {
          const url = typeof value === 'string' ? value : value?.url;
          const existingFileId = typeof value === 'object' ? value?.fileId : null;
          const asset = typeof url === 'string' ? findAsset(url) : null;
          return [
            key,
            asset
              ? { url, fileId: asset.id, originalName: asset.originalName, mimeType: asset.mimeType }
              : existingFileId
                ? value
                : value
          ];
        }));
      };

      const profile = user.role === 'seller' ? user.sellerProfile : user.buyerProfile;
      const enrichedProfile = profile
        ? { ...profile, documents: await enrichDocuments((profile as any).documents) }
        : profile;
      const { password, accountType, ...userData } = user as any;
      res.json(maskSensitive({
        user: { 
          ...userData, 
          _id: user.id, 
          accountType: accountType?.code || req.user?.accountType || null,
          accountTypeId: user.accountTypeId ?? req.user?.accountTypeId ?? null,
          permissions: req.user?.permissions || [],
          enabledFeatures: req.user?.enabledFeatures || [],
          companyId: req.user?.companyId ?? userData.companyId ?? null
        },
        profile: enrichedProfile
      }));
    } catch (err: any) {
      handleSecureRouteError(res, err);
    }
  },

  changePassword: async (req: AuthRequest, res: Response) => {
    try {
      const { currentPassword, newPassword } = req.body;
      const userId = Number(req.user?.id);

      if (!currentPassword || !newPassword) {
        return res.status(400).json({ message: 'Current and new passwords are required' });
      }

      const user = await prisma.user.findUnique({ where: { id: userId } });
      if (!user) return res.status(404).json({ message: 'User not found' });

      const isMatch = await verifyPassword(currentPassword, user.password);
      if (!isMatch) return res.status(400).json({ message: 'Current password incorrect' });

      const passwordValidation = validatePasswordStrength(String(newPassword || ''));
      if (!passwordValidation.ok) {
        return res.status(400).json({
          message: 'Password does not meet security requirements',
          errors: passwordValidation.errors
        });
      }

      const hashedPassword = await hashPassword(newPassword);
      await prisma.user.update({
        where: { id: userId },
        data: {
          password: hashedPassword,
          passwordResetVersion: { increment: 1 },
          sessionVersion: { increment: 1 },
          lastPasswordChangeAt: new Date()
        }
      });

      await auditLog({
        actorUserId: userId,
        actorRole: req.user?.role,
        action: 'auth.password.changed',
        entityType: 'user',
        entityId: userId,
        ipAddress: req.ip,
        userAgent: req.headers['user-agent']
      });
      res.json({ message: 'Password updated successfully' });
    } catch (err: any) {
      handleSecureRouteError(res, err);
    }
  },

  switchRole: async (req: AuthRequest, res: Response) => {
    try {
      const userId = Number(req.user?.id);
      const { role } = req.body;
      if (role !== 'buyer' && role !== 'seller') {
        return res.status(400).json({ message: 'Invalid role request. Must be buyer or seller.' });
      }

      const user = await prisma.user.findUnique({
        where: { id: userId },
        include: {
          buyerProfile: true,
          sellerProfile: true,
          organization: true
        }
      });
      if (!user) return res.status(404).json({ message: 'User not found' });

      if (role === 'buyer' && !user.buyerProfile) {
        return res.status(400).json({ message: 'Buyer profile is not active yet. Activate buyer profile first.' });
      }
      if (role === 'seller' && !user.sellerProfile) {
        return res.status(400).json({ message: 'Seller profile is not active yet. Activate seller profile first.' });
      }

      const updatedUser = await prisma.user.update({
        where: { id: userId },
        data: {
          role: role as Role,
          isDualRole: Boolean(user.buyerProfile && user.sellerProfile),
          sessionVersion: { increment: 1 }
        }
      });

      const safeUser = await buildSafeAuthPayload(userId);
      const tokens = issueAuthResponse(updatedUser);
      await auditLog({
        actorUserId: userId,
        actorRole: user.role,
        action: 'auth.role_switch',
        entityType: 'user',
        entityId: userId,
        ipAddress: req.ip,
        userAgent: req.headers['user-agent'],
        metadata: { fromRole: user.role, toRole: role }
      });

      res.json({
        success: true,
        ...tokens,
        redirectUrl: roleHome(role),
        user: toSafeUser(safeUser || updatedUser)
      });
    } catch (err: any) {
      handleSecureRouteError(res, err);
    }
  },

  activateDualRole: async (req: AuthRequest, res: Response) => {
    try {
      const userId = Number(req.user?.id);
      const { roleToActivate } = req.body;

      if (roleToActivate !== 'buyer' && roleToActivate !== 'seller') {
        return res.status(400).json({ message: 'Invalid role activation request.' });
      }

      const user = await prisma.user.findUnique({
        where: { id: userId },
        include: {
          buyerProfile: true,
          sellerProfile: { include: { offices: true } },
          organization: true
        }
      });
      if (!user) return res.status(404).json({ message: 'User not found' });

      if (user.role === 'admin') {
        return res.status(400).json({ message: 'Admin accounts cannot activate buyer or seller profiles.' });
      }

      const registration = asObject(user.registrationDetails);
      const sellerOffice = getPrimarySellerOffice(user.sellerProfile);
      const org = await ensureOrganizationForDualRole(user, roleToActivate);
      const mobile = firstValue(user.mobile, user.buyerProfile?.mobile, user.sellerProfile?.mobile, sellerOffice?.contactNumber, '0000000000');
      const gst = firstValue(org.gstin, user.buyerProfile?.gst, sellerOffice?.gstNumber, registration.gstin);
      const pan = firstValue(org.panNumber, user.buyerProfile?.pan, user.sellerProfile?.pan, registration.pan);
      const orgName = firstValue(
        org.organizationName,
        user.buyerProfile?.organizationName,
        user.sellerProfile?.businessName,
        user.sellerProfile?.nameAsInPan,
        registration.businessName,
        user.name
      );
      let createdProfile = false;

      if (roleToActivate === 'buyer') {
        const requestedVerificationMethod = String(req.body.profileData?.verificationMethod || registration.verificationMethod || '').trim();
        if (requestedVerificationMethod === 'aadhaar' && !(await hasVerifiedAadhaarKyc(userId))) {
          return res.status(400).json({ message: 'Aadhaar must be verified with DigiLocker / MeriPehchaan before activating buyer registration.' });
        }
        if (!user.buyerProfile) {
          await prisma.buyerProfile.create({
            data: {
              userId: user.id,
              organizationId: org.id,
              organizationName: orgName || 'Buyer Organization',
              businessType: firstValue(user.sellerProfile?.organizationType, registration.businessType, 'Government Buyer'),
              organizationType: firstValue(user.sellerProfile?.organizationType, registration.businessType) || null,
              msmeType: firstValue(user.sellerProfile?.msmeType, registration.msmeType) || null,
              industry: firstValue(user.buyerProfile?.industry, registration.industry, 'Other') || null,
              cin: firstValue(org.cinNumber, user.buyerProfile?.cin, registration.cinNumber, registration.cin) || null,
              pan: pan || null,
              gst: gst || null,
              website: firstValue(org.website, user.buyerProfile?.website, registration.website) || null,
              state: firstValue(org.state, user.buyerProfile?.state, sellerOffice?.state, registration.state) || null,
              district: firstValue(org.district, user.buyerProfile?.district, registration.district) || null,
              city: firstValue(org.city, user.buyerProfile?.city, sellerOffice?.city, registration.city) || null,
              pincode: firstValue(org.pincode, user.buyerProfile?.pincode, sellerOffice?.pincode, registration.pincode) || null,
              registeredAddress: firstValue(org.addressLine1, user.buyerProfile?.registeredAddress, sellerOffice?.address, registration.address) || null,
              representativeName: firstValue(user.buyerProfile?.representativeName, registration.accountName, user.name),
              email: user.email,
              mobile,
              procurementCategories: [],
              preferredMethods: [],
              declarationAccepted: true,
              termsAccepted: true,
              verificationStatusEnum: 'PENDING'
            }
          });
          createdProfile = true;
        } else if (!user.buyerProfile.organizationId) {
          await prisma.buyerProfile.update({
            where: { id: user.buyerProfile.id },
            data: { organizationId: org.id }
          });
        }
      } else {
        if (!user.sellerProfile) {
          const sellerPan = (pan || `PENDING${user.id}`).toUpperCase();
          const duplicatePan = await prisma.sellerProfile.findFirst({
            where: {
              userId: { not: userId },
              pan: sellerPan
            },
            select: { userId: true }
          });
          if (duplicatePan) {
            return res.status(409).json({ message: 'This organization PAN is already associated with another seller account.' });
          }

          await prisma.sellerProfile.create({
            data: {
              userId: user.id,
              organizationId: org.id,
              pan: sellerPan,
              nameAsInPan: firstValue(user.buyerProfile?.nameAsInPan, registration.accountName, orgName, user.name),
              businessName: orgName || user.name,
              organizationType: firstValue(user.buyerProfile?.organizationType, user.buyerProfile?.businessType, registration.businessType, 'Proprietorship'),
              mobile,
              msmeType: firstValue(user.buyerProfile?.msmeType, registration.msmeType) || null,
              dateOfIncorporation: (() => {
                const rawDate = req.body.profileData?.incorporationDate || registration.incorporationDate || registration.gstDetails?.registrationDate;
                if (!rawDate) return null;
                const parsed = new Date(rawDate);
                return isNaN(parsed.getTime()) ? null : parsed;
              })(),
              productCategories: [],
              documents: {},
              termsAccepted: true,
              panVerified: Boolean(pan),
              verificationStatusEnum: 'PENDING'
            }
          });
          createdProfile = true;
        } else if (!user.sellerProfile.organizationId) {
          await prisma.sellerProfile.update({
            where: { id: user.sellerProfile.id },
            data: { organizationId: org.id }
          });
        }
      }

      const currentRegistrationDetails = asObject(user.registrationDetails);
      const updatedRegistrationDetails = {
        ...currentRegistrationDetails,
        ...sanitizeRegistrationDetails(req.body.profileData || {})
      };

      const currentSectionStatus = asObject(user.sectionStatus);
      const updatedSectionStatus = { ...currentSectionStatus };
      if (createdProfile) {
        const orgVerified = org.verificationStatus === 'VERIFIED';
        if (roleToActivate === 'seller') {
          const sellerSections = ['pan', 'details', 'additional', 'offices', 'bank', 'ownership', 'documents'];
          for (const sec of sellerSections) {
            updatedSectionStatus[sec] = orgVerified && ['pan', 'details', 'offices'].includes(sec) ? 'completed' : 'pending';
          }
        } else if (roleToActivate === 'buyer') {
          const buyerSections = ['org', 'rep', 'address', 'procurement', 'docs'];
          for (const sec of buyerSections) {
            updatedSectionStatus[sec] = orgVerified && ['org', 'address'].includes(sec) ? 'completed' : 'pending';
          }
        }
        updatedSectionStatus.submitted = false;
      }

      const updatedUser = await prisma.user.update({
        where: { id: userId },
        data: {
          organizationId: org.id,
          companyId: user.companyId || org.companyId || await getDefaultCompanyId(),
          isDualRole: true,
          role: roleToActivate as Role,
          registrationDetails: updatedRegistrationDetails,
          sectionStatus: updatedSectionStatus,
          sessionVersion: { increment: 1 }
        }
      });
      await onUserLinkedToOrganization(user.id, org.id).catch(err => console.error('[Dual Role Membership] link failed', err));

      const safeUser = await buildSafeAuthPayload(userId);
      const tokens = issueAuthResponse(updatedUser);
      await auditLog({
        actorUserId: userId,
        actorRole: user.role,
        action: 'auth.activate_dual_role',
        entityType: 'user',
        entityId: userId,
        ipAddress: req.ip,
        userAgent: req.headers['user-agent'],
        metadata: { activatedRole: roleToActivate }
      });

      res.json({
        success: true,
        ...tokens,
        createdProfile,
        activatedRole: roleToActivate,
        redirectUrl: createdProfile ? onboardingPath(roleToActivate) : roleHome(roleToActivate),
        user: toSafeUser(safeUser || updatedUser)
      });
    } catch (err: any) {
      handleSecureRouteError(res, err);
    }
  },

  getPublicFeatures: async (req: Request, res: Response) => {
    try {
      const company = await (prisma as any).company.findFirst({
        where: { isActive: true },
        select: { id: true }
      });
      let activeCodes: string[] = [];
      if (company) {
        const features = await (prisma as any).companyFeature.findMany({
          where: { companyId: company.id, enabled: true },
          include: { feature: true }
        });
        activeCodes = features.map((row: any) => row.feature.code);
      } else {
        const allFeatures = await prisma.feature.findMany({ select: { code: true } });
        activeCodes = allFeatures.map(f => f.code);
      }

      res.json({ enabledFeatures: activeCodes });
    } catch (err: any) {
      handleSecureRouteError(res, err);
    }
  }
};
