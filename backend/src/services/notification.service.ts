import prisma from '../lib/prisma.js';
import { publishNotificationEvent } from './realtime.service.js';
import { getTransporter, getTransporterForCompany, compileEmailTemplate } from './mail.service.js';
import { env } from '../config/env.js';
import { logger } from '../config/logger.js';
import { smsService, type SmsPurpose } from './sms.service.js';

const db = prisma as any;

interface NotifyOpts {
  title: string;
  message: string;
  type: string;
  priority?: 'low' | 'medium' | 'high' | 'urgent';
  redirectUrl?: string;
}

interface EmailOpts {
  subject: string;
  html: string;
  templateSlug?: string;
  variables?: Record<string, string>;
}

interface SmsOpts {
  message: string;
  templateId?: string;
  purpose?: SmsPurpose;
}

const escapeHtml = (value: unknown) =>
  String(value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');

export const buildNotificationEmailHtml = (opts: {
  title: string;
  message: string;
  type?: string;
  priority?: string;
  redirectUrl?: string;
}) => {
  const title = escapeHtml(opts.title);
  const message = escapeHtml(opts.message);
  const priority = escapeHtml(opts.priority || 'medium');
  const type = escapeHtml((opts.type || 'notification').replace(/_/g, ' '));
  const portalUrl = (env.FRONTEND_URL || env.CORS_ALLOWED_ORIGINS?.split(',')[0] || '').replace(/\/$/, '');
  const actionUrl = portalUrl && opts.redirectUrl ? `${portalUrl}${opts.redirectUrl.startsWith('/') ? opts.redirectUrl : `/${opts.redirectUrl}`}` : portalUrl;

  return `
    <div style="margin: 0 0 20px; padding: 18px 20px; background: #eff6ff; border: 1px solid #bfdbfe; border-radius: 8px;">
      <p style="margin: 0 0 6px; color: #1d4ed8; font-size: 12px; font-weight: 700; letter-spacing: 0.08em; text-transform: uppercase;">${type}</p>
      <h2 style="margin: 0; color: #0f172a; font-size: 20px; line-height: 1.3;">${title}</h2>
    </div>
    <p style="margin: 0 0 18px; color: #334155; font-size: 15px; line-height: 1.7;">${message}</p>
    <table role="presentation" style="width: 100%; margin: 0 0 22px; border-collapse: collapse;">
      <tr>
        <td style="padding: 10px 12px; background: #f8fafc; border: 1px solid #e2e8f0; color: #64748b; font-size: 12px; font-weight: 700; text-transform: uppercase;">Priority</td>
        <td style="padding: 10px 12px; border: 1px solid #e2e8f0; color: #0f172a; font-size: 14px; text-transform: capitalize;">${priority}</td>
      </tr>
    </table>
    ${actionUrl ? `<p style="margin: 0;"><a href="${escapeHtml(actionUrl)}" style="display: inline-block; background: #1d4ed8; color: #ffffff; text-decoration: none; padding: 12px 18px; border-radius: 6px; font-weight: 700;">Open Portal</a></p>` : ''}
  `;
};

export const notificationService = {
  /** Create in-app notification + publish via Redis */
  async notify(userId: number, opts: NotifyOpts) {
    void this.notifyNow(userId, opts);
    return null;
  },

  async notifyUser(userId: number, opts: NotifyOpts, channels?: Array<'in_app' | 'email' | 'sms'>) {
    const selected = channels?.length ? channels : ['in_app', 'email', 'sms'];
    if (selected.includes('in_app')) await this.notifyNow(userId, opts);
    if (selected.includes('email')) {
      await this.sendEmail(userId, {
        subject: `${opts.title} - MSME Procurement Portal`,
        html: buildNotificationEmailHtml(opts)
      });
    }
    if (selected.includes('sms')) {
      await this.sendSmsNotificationForUser(userId, {
        message: `${opts.title}: ${opts.message}`,
        purpose: opts.type?.includes('tender') || opts.type?.includes('procurement') ? 'tender_alert' : 'notification'
      });
    }
  },

  async notifyNow(userId: number, opts: NotifyOpts) {
    try {
      const notification = await db.notification.create({
        data: {
          userId,
          title: opts.title,
          message: opts.message,
          type: opts.type,
          priority: opts.priority || 'medium',
          redirectUrl: opts.redirectUrl
        }
      });
      await publishNotificationEvent(userId, notification);
      return notification;
    } catch (error) {
      logger.warn({ error, userId, type: opts.type }, 'Failed to create notification');
      return null;
    }
  },

  /** Notify all admin users */
  async notifyAdmins(opts: NotifyOpts) {
    try {
      const admins = await db.user.findMany({
        where: { role: 'admin' },
        select: { id: true }
      });
      await Promise.allSettled(
        admins.map((admin: { id: number }) => this.notifyUser(admin.id, opts, ['in_app', 'sms']))
      );
    } catch (error) {
      logger.warn({ error, type: opts.type }, 'Failed to notify admins');
    }
  },

  async sendSmsNotification(phone: string, message: string, templateId?: string, purpose: SmsPurpose = 'notification') {
    return smsService.sendNotificationSms(phone, message, templateId, purpose);
  },

  async sendSmsNotificationForUser(userId: number, opts: SmsOpts) {
    try {
      const user = await db.user.findUnique({
        where: { id: userId },
        select: { mobile: true, mobileVerified: true, companyId: true }
      });
      if (!user?.mobile || !user.mobileVerified) return null;

      if (user.companyId) {
        const companyFeature = await db.companyFeature.findFirst({
          where: {
            companyId: user.companyId,
            feature: { code: 'sms' }
          }
        });
        if (!companyFeature || !companyFeature.enabled) {
          return null;
        }
      }

      const pref = await db.notificationPreference.findUnique({ where: { userId } });
      if (pref && !pref.smsNotifications) return null;

      const result = await this.sendSmsNotification(user.mobile, opts.message, opts.templateId, opts.purpose || 'notification');
      await db.notificationLog.create({
        data: {
          userId,
          channel: 'SMS',
          recipient: smsService.normalizeMobile(user.mobile) || user.mobile,
          status: result.success ? 'SENT' : 'FAILED',
          sentAt: result.success ? new Date() : null,
          providerResponse: { provider: 'msg91', reason: result.reason, skipped: result.skipped }
        }
      }).catch(() => null);
      return result;
    } catch (error) {
      logger.warn({ error, userId }, 'Failed to send SMS notification');
      await db.notificationLog.create({
        data: {
          userId,
          channel: 'SMS',
          recipient: 'unknown',
          status: 'FAILED',
          providerResponse: { error: String(error) }
        }
      }).catch(() => null);
      return null;
    }
  },

  /** Send email respecting user preferences */
  async sendEmail(userId: number, opts: EmailOpts) {
    try {
      // Check notification preferences
      const pref = await db.notificationPreference.findUnique({ where: { userId } });
      if (pref && !pref.emailNotifications) return null;

      const user = await db.user.findUnique({ where: { id: userId }, select: { email: true, name: true, companyId: true } });
      if (!user?.email) return null;

      const companyId = user.companyId || 1;

      // 1. Resolve company portal details (branding)
      const company = await db.company.findUnique({
        where: { id: companyId },
        select: { portalDisplayName: true, name: true }
      });
      const portalName = company?.portalDisplayName || company?.name || 'JsgSmile Portal';

      // 2. Resolve dynamic SMTP credentials & sender details
      const settings = await db.companySetting.findUnique({
        where: { companyId_key: { companyId, key: 'portal-email-settings' } }
      });
      const val = settings?.value || {};
      const fromEmail = val.fromEmail || env.SMTP_USER;
      const fromName = val.fromName || portalName;

      // Verify if email is actually enabled for this tenant
      const emailEnabled = val.emailEnabled ?? Boolean(env.SMTP_USER && env.SMTP_PASS);
      if (!emailEnabled) {
        logger.warn({ userId }, `Email sending is disabled for company ${companyId}. Notification: ${opts.subject}`);
        return null;
      }

      // 3. Resolve template
      const templateSlug = opts.templateSlug || 'notification';
      const templatesSetting = await db.companySetting.findUnique({
        where: { companyId_key: { companyId, key: 'email-templates' } }
      });
      const templates = Array.isArray(templatesSetting?.value) ? templatesSetting.value : [];
      const template = templates.find((t: any) => t.slug === templateSlug && t.isActive);

      let finalSubject = opts.subject;
      let finalHtml = '';

      const portalUrl = (env.FRONTEND_URL || env.CORS_ALLOWED_ORIGINS?.split(',')[0] || '').replace(/\/$/, '');
      const relativeActionUrl = opts.variables?.actionUrl || '';
      const actionUrl = portalUrl && relativeActionUrl ? `${portalUrl}${relativeActionUrl.startsWith('/') ? relativeActionUrl : `/${relativeActionUrl}`}` : portalUrl;

      const templateVars = {
        userName: user.name || 'User',
        userEmail: user.email,
        portalName,
        companyName: company?.name || portalName,
        actionUrl,
        currentDate: new Date().toLocaleDateString(),
        title: opts.variables?.title || opts.subject,
        message: opts.variables?.message || '',
        ...opts.variables
      };

      if (template) {
        const compiled = compileEmailTemplate(template.subject, template.htmlBody, templateVars);
        finalSubject = compiled.subject;
        finalHtml = compiled.html;
      } else {
        // Fallback wrapped html layout
        finalHtml = `
          <div style="font-family: 'Noto Sans', Arial, sans-serif; max-width: 640px; margin: 0 auto; background: #ffffff; border: 1px solid #e2e8f0; border-radius: 8px; overflow: hidden; box-shadow: 0 4px 6px -1px rgb(0 0 0 / 0.1);">
            <div style="background: #0c2340; padding: 24px; text-align: center; border-bottom: 4px solid #c5a556;">
              <h1 style="color: #ffffff; font-size: 20px; margin: 0; font-weight: 700; letter-spacing: 0.5px;">${portalName}</h1>
              <p style="color: #c5a556; font-size: 12px; margin: 6px 0 0; letter-spacing: 1px; font-weight: 600; text-transform: uppercase;">Portal Automated Notification</p>
            </div>
            <div style="padding: 32px 24px; color: #1e293b; line-height: 1.6; font-size: 15px;">
              <p style="margin-top: 0; font-weight: 600; color: #0c2340;">Dear ${user.name || 'User'},</p>
              ${opts.html}
            </div>
            <div style="background: #f8fafc; padding: 20px 24px; text-align: center; font-size: 12px; color: #64748b; border-top: 1px solid #e2e8f0;">
              <p style="margin: 0; font-weight: 500;">This is an automated system notification from the ${portalName}.</p>
              <p style="margin: 4px 0 0;">Please do not reply to this email directly.</p>
              <p style="margin: 12px 0 0; font-size: 11px; opacity: 0.8;">© ${new Date().getFullYear()} ${portalName}. All rights reserved.</p>
            </div>
          </div>
        `;
      }

      const transporter = await getTransporterForCompany(companyId);

      const hasAuth = val.username || (env.SMTP_USER && env.SMTP_PASS);
      if (!hasAuth) {
        logger.warn({ userId }, 'No SMTP credentials configured; email not sent');
        return null;
      }

      const info = await transporter.sendMail({
        from: `"${fromName}" <${fromEmail}>`,
        to: user.email,
        subject: finalSubject,
        html: finalHtml
      });

      // Log delivery
      await db.notificationLog.create({
        data: {
          userId,
          channel: 'EMAIL',
          recipient: user.email,
          status: 'SENT',
          sentAt: new Date(),
          providerResponse: { messageId: info?.messageId }
        }
      }).catch(() => null);

      return info;
    } catch (error) {
      logger.warn({ error, userId }, 'Failed to send email notification');
      // Log failure
      await db.notificationLog.create({
        data: {
          userId,
          channel: 'EMAIL',
          recipient: 'unknown',
          status: 'FAILED',
          providerResponse: { error: String(error) }
        }
      }).catch(() => null);
      return null;
    }
  },

  async notifyWithEmail(userId: number, opts: NotifyOpts & { emailSubject?: string; emailHtml?: string }) {
    void (async () => {
      await this.notifyNow(userId, opts);
      await this.sendEmail(userId, {
        subject: opts.emailSubject || `${opts.title} - MSME Procurement Portal`,
        html: opts.emailHtml || buildNotificationEmailHtml(opts),
        templateSlug: opts.type?.replace(/_/g, '-'),
        variables: {
          title: opts.title,
          message: opts.message,
          actionUrl: opts.redirectUrl || ''
        }
      });
      await this.sendSmsNotificationForUser(userId, {
        message: `${opts.title}: ${opts.message}`,
        purpose: opts.type?.includes('tender') || opts.type?.includes('procurement') ? 'tender_alert' : 'notification'
      });
    })().catch(err => {
      logger.warn({ err, userId }, 'Background notification failed');
    });
    return null;
  },

  /** Notify admins with email */
  async notifyAdminsWithEmail(opts: NotifyOpts & { emailSubject?: string; emailHtml?: string }) {
    try {
      const admins = await db.user.findMany({
        where: { role: 'admin' },
        select: { id: true }
      });
      await Promise.allSettled(
        admins.map((admin: { id: number }) => this.notifyWithEmail(admin.id, opts))
      );
    } catch (error) {
      logger.warn({ error, type: opts.type }, 'Failed to notify admins with email');
    }
  }
};
