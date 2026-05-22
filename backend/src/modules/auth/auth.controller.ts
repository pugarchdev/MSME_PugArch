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
import { publishNotificationEvent } from '../../services/realtime.service.js';
import { notificationService } from '../../services/notification.service.js';

// CreateNotificationSafe mock for backward compatibility if not globally service-ified yet
const createNotificationSafe = async (payload: { userId: number; title: string; message: string; type: string }) => {
  try {
    const notification = await prisma.notification.create({
      data: {
        userId: payload.userId,
        title: payload.title.slice(0, 120),
        message: maskSensitive(payload.message).slice(0, 500),
        type: payload.type.slice(0, 80)
      }
    });
    await publishNotificationEvent(payload.userId, notification);
  } catch (err) {
    console.error('[Notification] Failed to create notification:', err);
  }
};

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
          registrationDetails: registrationDetails || {}
        }
      });

      await consumeEmailOtp(email);

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
            emailSubject: 'New User Registration — MSME Procurement Portal',
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
              bankAccounts: true
            }
          },
          buyerProfile: true,
          organization: true
        }
      });
      if (!user) return res.status(404).json({ message: 'Not found' });

      const { password, ...userData } = user;
      res.json(maskSensitive({
        user: { 
          ...userData, 
          _id: user.id, 
          permissions: req.user?.permissions || [] 
        },
        profile: user.role === 'seller' ? user.sellerProfile : user.buyerProfile
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
  }
};
