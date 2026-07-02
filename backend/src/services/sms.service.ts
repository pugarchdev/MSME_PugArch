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

const digitsOnly = (value: string) => value.replace(/\D/g, '');

const maskMobile = (mobile: string | null | undefined): string => {
  if (!mobile) return '';
  const str = String(mobile);
  return str.slice(-4).padStart(str.length, '*');
};

export const normalizeIndianMobile = (value: unknown): string | null => {
  const raw = String(value || '').trim();
  if (!raw) return null;
  let digits = digitsOnly(raw);
  if (digits.startsWith('0091')) {
    digits = digits.slice(4);
  } else if (digits.startsWith('91') && digits.length === 12) {
    digits = digits.slice(2);
  } else if (digits.startsWith('0') && digits.length === 11) {
    digits = digits.slice(1);
  }
  if (digits.length !== 10 || !/^[6-9]\d{9}$/.test(digits) || /^(\d)\1{9}$/.test(digits)) {
    return null;
  }
  return `91${digits}`;
};

export const toLocalIndianMobile = (value: unknown) => {
  const normalized = normalizeIndianMobile(value);
  return normalized ? normalized.slice(2) : null;
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
      logger.info({ mobileMasked: maskMobile(normalized), reason: readiness.reason, purpose }, '[SMS] OTP SMS skipped');
      return { success: false, skipped: true, mobile: normalized, reason: readiness.reason };
    }

    const selectedTemplateId = env.MSG91_COMMON_OTP_TEMPLATE_ID;
    if (!selectedTemplateId) {
      logger.warn({ mobileMasked: maskMobile(normalized), purpose }, '[SMS] OTP template missing');
      return { success: false, skipped: true, mobile: normalized, reason: 'MSG91 common OTP template ID missing' };
    }

    try {
      const response = await postMsg91('/api/v5/flow', {
        template_id: selectedTemplateId,
        short_url: '0',
        recipients: [
          {
            mobiles: normalized,
            var: env.MSG91_OTP_BRAND_NAME || 'JsgSMILE Portal',
            var1: otp
          }
        ]
      });
      logger.info({ mobileMasked: maskMobile(normalized), purpose, status: 'sent' }, '[SMS] OTP SMS sent');
      return { success: true, mobile: normalized, provider: 'msg91', response };
    } catch (error: any) {
      logger.error({ err: error?.message || error, mobileMasked: maskMobile(normalized), purpose, status: 'failed' }, '[SMS] OTP SMS failed');
      return { success: false, mobile: normalized, provider: 'msg91', reason: 'MSG91 send failed' };
    }
  },

  async sendNotificationSms(mobile: unknown, message: string, templateId?: string, purpose: SmsPurpose = 'notification'): Promise<SmsResult> {
    const normalized = normalizeIndianMobile(mobile);
    if (!normalized) return { success: false, skipped: true, reason: 'Invalid mobile number' };

    logger.info({ mobileMasked: maskMobile(normalized), purpose }, '[SMS] Non-OTP SMS skipped (only OTP flows supported)');
    return { success: false, skipped: true, mobile: normalized, reason: 'Notification templates not supported' };
  }
};
