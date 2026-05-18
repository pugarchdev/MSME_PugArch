import { z } from 'zod';

export const sendEmailOtpSchema = z.object({
  email: z.string().email().max(254)
});

export const verifyEmailOtpSchema = z.object({
  email: z.string().email().max(254),
  otp: z.string().regex(/^\d{6}$/)
});

export const registerSchema = z.object({
  name: z.string().trim().min(2).max(120),
  email: z.string().email().max(254),
  password: z.string().min(12).max(128),
  role: z.enum(['buyer', 'seller', 'admin']),
  mobile: z.string().regex(/^[6-9]\d{9}$/).optional()
});

export const loginSchema = z.object({
  email: z.string().email().max(254),
  password: z.string().min(1).max(128)
});

export const changePasswordSchema = z.object({
  currentPassword: z.string().min(1).max(128),
  newPassword: z.string().min(12).max(128)
});

export const otpSchema = z.object({
  email: z.string().email().max(254),
  otp: z.string().regex(/^\d{6}$/)
});

export const forgotPasswordSchema = z.object({
  email: z.string().email().max(254)
});

export const resetPasswordSchema = z.object({
  email: z.string().email().max(254),
  otp: z.string().regex(/^\d{6}$/),
  newPassword: z.string().min(12).max(128)
});

export const mobileExistsSchema = z.object({
  mobile: z.string().regex(/^[6-9]\d{9}$/)
});
