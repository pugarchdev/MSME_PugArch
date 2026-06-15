import type { Request, Response } from 'express';
import prisma from '../../lib/prisma.js';
import { Role, RegistrationStatus } from '@prisma/client';
import { env } from '../../config/env.js';
import { sha256 } from '../../utils/crypto.js';
import { auditLog } from '../audit/audit.service.js';
import { recordLoginEvent } from './login-event.service.js';
import {
  assertEmailOtpVerified,
  consumeEmailOtp,
  consumeOtp,
  generateOtp,
  storeEmailOtp,
  storeOtp,
  verifyEmailOtp,
  verifyOtp
} from '../../services/otp.service.js';
import { sendOtpEmail } from '../../services/mail.service.js';
import { hashPassword, validatePasswordStrength, verifyPassword } from '../../services/password.service.js';
import { issueAuthResponse, signAccessToken, verifyRefreshToken } from '../../services/token.service.js';
import { handleSecureRouteError, handleFinancialRouteError, toSafeUser } from '../../utils/routeHelpers.js';
import { validatePersonalVerification } from '../../utils/validationHelpers.js';
import { maskSensitive } from '../../utils/maskSensitive.js';
import type { AuthRequest } from '../../middleware/auth.js';
import { notificationService } from '../../services/notification.service.js';
import { onUserLinkedToOrganization } from '../../services/org-membership.service.js';

// CreateNotificationSafe mock for backward compatibility if not globally service-ified yet
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
      const otpRecord = await assertEmailOtpVerified(email);
      if (!otpRecord.ok && otpRecord.reason === 'expired') {
        return res.status(400).json({ message: 'OTP expired. Please request a new code.' });
      }
      if (!otpRecord.ok) return res.status(400).json({ message: 'Verify email first' });

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

      const personalValidation = validatePersonalVerification(role, registrationDetails, dob, mobile);
      if (!personalValidation.isValid) {
        return res.status(400).json({
          message: 'Invalid personal verification details',
          errors: personalValidation.errors
        });
      }

      const hashedPassword = await hashPassword(password);
      const user = await prisma.user.create({
        data: {
          name, email, password: hashedPassword,
          role: role as Role,
          mobile,
          dob: (dob && !isNaN(Date.parse(dob))) ? new Date(dob) : null,
          emailVerified: true,
          lastPasswordChangeAt: new Date(),
          registrationStatus: RegistrationStatus.completed,
          accountStatus: 'ACTIVE',
          registrationDetails: registrationDetails || {}
        }
      });


      await consumeEmailOtp(email);

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
      const email = String(req.body.email || '').trim().toLowerCase();
      const { password } = req.body;
      const user = await prisma.user.findUnique({ where: { email } });
      if (!user) {
        await recordLoginEvent({ req, success: false, reason: 'user_not_found' });
        await auditLog({
          action: 'auth.login.failed',
          entityType: 'auth',
          ipAddress: req.ip,
          userAgent: req.headers['user-agent'],
          metadata: { emailHash: sha256(String(email || '').toLowerCase()), reason: 'not_found' }
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
        await storeOtp('two_factor_login', email, otp, { userId: user.id });
        const deliveryConfigured = await sendOtpEmail(email, otp, '[SECURE AUTH] Two-factor login code');
        await auditLog({
          actorUserId: user.id,
          actorRole: user.role,
          action: 'auth.2fa.challenge_sent',
          entityType: 'user',
          entityId: user.id,
          ipAddress: req.ip,
          userAgent: req.headers['user-agent'],
          metadata: { deliveryConfigured }
        });
        await recordLoginEvent({ req, userId: user.id, success: false, reason: 'two_factor_required' });
        return res.json({ requiresTwoFactor: true, email, message: 'Two-factor verification required' });
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
      const otp = String(req.body.otp || '').trim();
      const result = await verifyOtp('two_factor_login', email, otp);

      const user = await prisma.user.findUnique({ where: { email } });
      if (!user) return res.status(400).json({ message: 'Invalid verification request' });

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

      await consumeOtp('two_factor_login', email);
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
        metadata: { purpose: 'two_factor_login' }
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

      const accessToken = signAccessToken({ id: user.id, role: user.role, sessionVersion: user.sessionVersion });
      res.json({ token: accessToken, accessToken, expiresIn: env.JWT_ACCESS_EXPIRES_IN });
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
      const email = String(req.body.email || '').trim().toLowerCase();
      const user = await prisma.user.findUnique({ where: { email } });

      if (user) {
        const otp = generateOtp();
        await storeOtp('forgot_password', email, otp, { userId: user.id });
        const deliveryConfigured = await sendOtpEmail(email, otp, '[SECURE AUTH] Password reset code');
        await auditLog({
          actorUserId: user.id,
          actorRole: user.role,
          action: 'auth.password_reset.requested',
          entityType: 'user',
          entityId: user.id,
          ipAddress: req.ip,
          userAgent: req.headers['user-agent'],
          metadata: { deliveryConfigured }
        });
      } else {
        await auditLog({
          action: 'auth.password_reset.requested_unknown',
          entityType: 'auth',
          ipAddress: req.ip,
          userAgent: req.headers['user-agent'],
          metadata: { emailHash: sha256(email) }
        });
      }

      res.json({ success: true, message: 'If the account exists, a reset code has been sent.' });
    } catch (err: any) {
      handleSecureRouteError(res, err);
    }
  },

  resetPassword: async (req: Request, res: Response) => {
    try {
      const email = String(req.body.email || '').trim().toLowerCase();
      const otp = String(req.body.otp || '').trim();
      const newPassword = String(req.body.newPassword || '');
      const passwordValidation = validatePasswordStrength(newPassword);
      if (!passwordValidation.ok) {
        return res.status(400).json({ message: 'Password does not meet security requirements', errors: passwordValidation.errors });
      }

      const user = await prisma.user.findUnique({ where: { email } });
      if (!user) return res.status(400).json({ message: 'Invalid reset request' });

      const result = await verifyOtp('forgot_password', email, otp);
      if (!result.ok) {
        await auditLog({
          actorUserId: user.id,
          actorRole: user.role,
          action: 'auth.otp.failed',
          entityType: 'user',
          entityId: user.id,
          ipAddress: req.ip,
          userAgent: req.headers['user-agent'],
          metadata: { purpose: 'forgot_password', reason: result.reason }
        });
        return res.status(400).json({ message: result.reason === 'expired' ? 'OTP expired' : 'Invalid OTP' });
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
      await consumeOtp('forgot_password', email);
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
        await storeOtp('two_factor_login', user.email, code, { userId: user.id, action: 'enable_2fa' });
        await sendOtpEmail(user.email, code, '[SECURE AUTH] Enable 2FA code');
        return res.json({ success: true, pendingVerification: true });
      }

      const result = await verifyOtp('two_factor_login', user.email, otp);
      if (!result.ok) return res.status(400).json({ message: result.reason === 'expired' ? 'OTP expired' : 'Invalid OTP' });

      await prisma.user.update({ where: { id: user.id }, data: { twoFactorEnabled: true } });
      await consumeOtp('two_factor_login', user.email);
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
      const user = await prisma.user.findUnique({
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
          buyerProfile: true,
          organization: true,
          company: true
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
      const { password, ...userData } = user;
      res.json(maskSensitive({
        user: { 
          ...userData, 
          _id: user.id, 
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
              verificationStatusEnum: org.verificationStatus === 'VERIFIED' ? 'VERIFIED' : 'PENDING'
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
              productCategories: [],
              documents: {},
              termsAccepted: true,
              panVerified: Boolean(pan),
              verificationStatusEnum: org.verificationStatus === 'VERIFIED' ? 'VERIFIED' : 'PENDING'
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
        ...(req.body.profileData || {})
      };

      const updatedUser = await prisma.user.update({
        where: { id: userId },
        data: {
          organizationId: org.id,
          isDualRole: true,
          role: roleToActivate as Role,
          registrationDetails: updatedRegistrationDetails,
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
  }
};
