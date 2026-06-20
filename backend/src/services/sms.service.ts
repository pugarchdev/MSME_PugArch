import { env } from '../config/env.js';
import { logger } from '../config/logger.js';

export type SmsPurpose =
  | 'common_otp'
  | 'forgot_password'
  | 'login_otp'
  | 'registration_otp'
  | 'notification'
  | 'tender_alert'
  | 'onboarding_alert';

type SmsResult = {
  success: boolean;
  skipped?: boolean;
  mobile?: string;
  provider?: string;
  reason?: string;
  response?: unknown;
};

const purposeTemplateEnv: Record<SmsPurpose, keyof typeof env> = {
  common_otp: 'MSG91_COMMON_OTP_TEMPLATE_ID',
  forgot_password: 'MSG91_FORGOT_PASSWORD_TEMPLATE_ID',
  login_otp: 'MSG91_LOGIN_OTP_TEMPLATE_ID',
  registration_otp: 'MSG91_REGISTRATION_OTP_TEMPLATE_ID',
  notification: 'MSG91_NOTIFICATION_TEMPLATE_ID',
  tender_alert: 'MSG91_TENDER_ALERT_TEMPLATE_ID',
  onboarding_alert: 'MSG91_ONBOARDING_ALERT_TEMPLATE_ID'
};

const purposeFallback: Partial<Record<SmsPurpose, SmsPurpose>> = {
  forgot_password: 'common_otp',
  login_otp: 'common_otp',
  registration_otp: 'common_otp',
  tender_alert: 'notification',
  onboarding_alert: 'notification'
};

const digitsOnly = (value: string) => value.replace(/\D/g, '');

export const normalizeIndianMobile = (value: unknown) => {
  const raw = String(value || '').trim();
  if (!raw) return null;
  let digits = digitsOnly(raw);
  if (digits.startsWith('0091')) digits = digits.slice(2);
  if (digits.startsWith('91') && digits.length === 12) digits = digits.slice(2);
  if (digits.length !== 10 || !/^[6-9]\d{9}$/.test(digits) || /^(\d)\1{9}$/.test(digits)) {
    return null;
  }
  return `91${digits}`;
};

export const toLocalIndianMobile = (value: unknown) => {
  const normalized = normalizeIndianMobile(value);
  return normalized ? normalized.slice(2) : null;
};

const truncateSms = (message: string, max = 300) => {
  const compact = message.replace(/\s+/g, ' ').trim();
  return compact.length <= max ? compact : `${compact.slice(0, max - 3)}...`;
};

const templateFor = (purpose: SmsPurpose, explicitTemplateId?: string) => {
  if (explicitTemplateId) return explicitTemplateId;
  const direct = env[purposeTemplateEnv[purpose]];
  if (direct) return String(direct);
  const fallbackPurpose = purposeFallback[purpose];
  return fallbackPurpose ? String(env[purposeTemplateEnv[fallbackPurpose]] || '') : '';
};

const canSend = () => {
  if (!env.SMS_ENABLED) return { ok: false, reason: 'SMS disabled' };
  if (env.SMS_PROVIDER !== 'msg91') return { ok: false, reason: 'Unsupported SMS provider' };
  if (!env.MSG91_AUTH_KEY) return { ok: false, reason: 'MSG91 auth key missing' };
  if (!env.MSG91_SENDER_ID) return { ok: false, reason: 'MSG91 sender ID missing' };
  return { ok: true };
};

const postMsg91 = async (path: string, body: Record<string, unknown>) => {
  const baseUrl = env.MSG91_BASE_URL.replace(/\/$/, '');
  const response = await fetch(`${baseUrl}${path}`, {
    method: 'POST',
    headers: {
      authkey: env.MSG91_AUTH_KEY || '',
      'Content-Type': 'application/json'
    },
    body: JSON.stringify(body)
  });
  const text = await response.text();
  let payload: unknown = text;
  try {
    payload = text ? JSON.parse(text) : {};
  } catch {
    payload = { raw: text.slice(0, 500) };
  }
  if (!response.ok) {
    throw new Error(`MSG91 request failed with HTTP ${response.status}`);
  }
  return payload;
};

export const smsService = {
  isEnabled() {
    return canSend().ok;
  },

  normalizeMobile: normalizeIndianMobile,
  toLocalMobile: toLocalIndianMobile,

  async sendOtpSms(mobile: unknown, otp: string, purpose: SmsPurpose = 'common_otp', templateId?: string): Promise<SmsResult> {
    const normalized = normalizeIndianMobile(mobile);
    if (!normalized) return { success: false, skipped: true, reason: 'Invalid mobile number' };

    const readiness = canSend();
    if (!readiness.ok) {
      logger.info({ mobile: normalized, reason: readiness.reason, purpose }, '[SMS] OTP SMS skipped');
      return { success: false, skipped: true, mobile: normalized, reason: readiness.reason };
    }

    const selectedTemplateId = templateFor(purpose, templateId);
    if (!selectedTemplateId) {
      logger.warn({ mobile: normalized, purpose }, '[SMS] OTP template missing');
      return { success: false, skipped: true, mobile: normalized, reason: 'MSG91 template ID missing' };
    }

    try {
      const response = await postMsg91('/api/v5/otp', {
        template_id: selectedTemplateId,
        mobile: normalized,
        authkey: env.MSG91_AUTH_KEY,
        otp,
        sender: env.MSG91_SENDER_ID
      });
      logger.info({ mobile: normalized, purpose }, '[SMS] OTP SMS sent');
      return { success: true, mobile: normalized, provider: 'msg91', response };
    } catch (error) {
      logger.error({ err: error, mobile: normalized, purpose }, '[SMS] OTP SMS failed');
      return { success: false, mobile: normalized, provider: 'msg91', reason: 'MSG91 send failed' };
    }
  },

  async sendNotificationSms(mobile: unknown, message: string, templateId?: string, purpose: SmsPurpose = 'notification'): Promise<SmsResult> {
    const normalized = normalizeIndianMobile(mobile);
    if (!normalized) return { success: false, skipped: true, reason: 'Invalid mobile number' };

    const readiness = canSend();
    if (!readiness.ok) {
      logger.info({ mobile: normalized, reason: readiness.reason, purpose }, '[SMS] Notification SMS skipped');
      return { success: false, skipped: true, mobile: normalized, reason: readiness.reason };
    }

    const selectedTemplateId = templateFor(purpose, templateId);
    if (!selectedTemplateId) {
      logger.warn({ mobile: normalized, purpose }, '[SMS] Notification template missing');
      return { success: false, skipped: true, mobile: normalized, reason: 'MSG91 template ID missing' };
    }

    try {
      const response = await postMsg91('/api/v5/flow', {
        template_id: selectedTemplateId,
        sender: env.MSG91_SENDER_ID,
        mobiles: normalized,
        message: truncateSms(message),
        VAR1: truncateSms(message, 160)
      });
      logger.info({ mobile: normalized, purpose }, '[SMS] Notification SMS sent');
      return { success: true, mobile: normalized, provider: 'msg91', response };
    } catch (error) {
      logger.error({ err: error, mobile: normalized, purpose }, '[SMS] Notification SMS failed');
      return { success: false, mobile: normalized, provider: 'msg91', reason: 'MSG91 send failed' };
    }
  }
};
