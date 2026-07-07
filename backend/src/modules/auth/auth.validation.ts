import { z } from 'zod';

export const otpChannelSchema = z.enum(['email', 'sms']).default('email');
const identifierSchema = z.string().trim().min(3).max(254);

export const sendEmailOtpSchema = z.object({
  email: z.string().email().max(254)
});

export const verifyEmailOtpSchema = z.object({
  email: z.string().email().max(254),
  otp: z.string().regex(/^\d{6}$/)
});

export const sendMobileOtpSchema = z.object({
  mobile: z.string().regex(/^(?:\+?91)?[6-9]\d{9}$/)
});

export const verifyMobileOtpSchema = z.object({
  mobile: z.string().regex(/^(?:\+?91)?[6-9]\d{9}$/),
  otp: z.string().regex(/^\d{6}$/)
});

export const sendUnifiedOtpSchema = z.object({
  identifier: identifierSchema.optional(),
  email: z.string().email().max(254).optional(),
  mobile: z.string().regex(/^(?:\+?91)?[6-9]\d{9}$/).optional(),
  channel: otpChannelSchema.optional()
});

export const verifyUnifiedOtpSchema = sendUnifiedOtpSchema.extend({
  otp: z.string().regex(/^\d{6}$/)
});

export const registerSchema = z.object({
  name: z.string().trim().min(2).max(120),
  email: z.string().email().max(254),
  password: z.string().min(12).max(128),
  role: z.enum(['buyer', 'seller', 'admin']),
  mobile: z.preprocess(
    value => String(value || '').trim(),
    z.string().regex(/^[6-9]\d{9}$/)
  ),
  dob: z.string().optional().nullable(),
  registrationDetails: z.any().optional()
});

export const loginSchema = z.object({
  email: z.string().min(3).max(254),
  password: z.string().min(1).max(128)
});

export const changePasswordSchema = z.object({
  currentPassword: z.string().min(1).max(128),
  newPassword: z.string().min(12).max(128)
});

export const otpSchema = z.object({
  email: z.string().email().max(254),
  channel: otpChannelSchema.optional(),
  otp: z.string().regex(/^\d{6}$/)
});

export const forgotPasswordSchema = z.object({
  email: z.string().email().max(254).optional(),
  identifier: identifierSchema.optional(),
  channel: otpChannelSchema.optional()
});

export const resetPasswordSchema = z.object({
  email: z.string().email().max(254).optional(),
  identifier: identifierSchema.optional(),
  channel: otpChannelSchema.optional(),
  otp: z.string().regex(/^\d{6}$/).optional(),
  otpToken: z.string().optional(),
  newPassword: z.string().min(12).max(128)
});

export const mobileExistsSchema = z.object({
  mobile: z.string().regex(/^[6-9]\d{9}$/)
});
