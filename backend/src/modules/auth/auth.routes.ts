import { Router } from 'express';
import { authController } from './auth.controller.js';
import { validate } from '../../middleware/validate.js';
import { authenticate } from '../../middleware/auth.js';
import {
  authLoginRateLimit,
  forgotPasswordRateLimit,
  otpSendRateLimit
} from '../../middleware/rateLimit.js';
import {
  changePasswordSchema,
  forgotPasswordSchema,
  loginSchema,
  mobileExistsSchema,
  otpSchema,
  registerSchema,
  resetPasswordSchema,
  sendEmailOtpSchema,
  verifyEmailOtpSchema
} from './auth.validation.js';

export const authRoutes = Router();

// Public Routes with Rate Limiting and Validation
authRoutes.post('/send-email-otp', otpSendRateLimit, validate({ body: sendEmailOtpSchema }), authController.sendEmailOtp);
authRoutes.post('/verify-email-otp', validate({ body: verifyEmailOtpSchema }), authController.verifyEmailOtp);
authRoutes.post('/send-otp', otpSendRateLimit, validate({ body: sendEmailOtpSchema }), authController.sendEmailOtp);
authRoutes.post('/verify-otp', validate({ body: verifyEmailOtpSchema }), authController.verifyEmailOtp);
authRoutes.get('/mobile-exists', validate({ query: mobileExistsSchema }), authController.mobileExists);
authRoutes.post('/register', validate({ body: registerSchema }), authController.register);
authRoutes.post('/login', authLoginRateLimit, validate({ body: loginSchema }), authController.login);
authRoutes.post('/2fa/verify', validate({ body: otpSchema }), authController.verify2fa);
authRoutes.post('/refresh', authController.refresh);

// Password Recovery
authRoutes.post('/forgot-password', forgotPasswordRateLimit, validate({ body: forgotPasswordSchema }), authController.forgotPassword);
authRoutes.post('/reset-password', forgotPasswordRateLimit, validate({ body: resetPasswordSchema }), authController.resetPassword);

// Authenticated Routes
authRoutes.post('/logout', authenticate, authController.logout);
authRoutes.get('/me', authenticate, authController.me);
authRoutes.post('/change-password', authenticate, validate({ body: changePasswordSchema }), authController.changePassword);
authRoutes.post('/switch-role', authenticate, authController.switchRole);
authRoutes.post('/activate-dual-role', authenticate, authController.activateDualRole);

// Multi-Factor Setup
authRoutes.post('/2fa/enable', authenticate, authController.enable2fa);
authRoutes.post('/2fa/disable', authenticate, authController.disable2fa);
