import prisma from '../config/prisma.js';
import { publishNotificationEvent } from './realtime.service.js';
import { transporter } from './mail.service.js';
import { env } from '../config/env.js';
import { logger } from '../config/logger.js';

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
        admins.map((admin: { id: number }) => this.notify(admin.id, opts))
      );
    } catch (error) {
      logger.warn({ error, type: opts.type }, 'Failed to notify admins');
    }
  },

  /** Send email respecting user preferences */
  async sendEmail(userId: number, opts: EmailOpts) {
    try {
      // Check notification preferences
      const pref = await db.notificationPreference.findUnique({ where: { userId } });
      if (pref && !pref.emailNotifications) return null;

      const user = await db.user.findUnique({ where: { id: userId }, select: { email: true, name: true } });
      if (!user?.email) return null;

      if (!env.SMTP_USER || !env.SMTP_PASS) {
        logger.warn({ userId }, 'SMTP credentials missing; email not sent');
        return null;
      }

      const wrappedHtml = `
        <div style="font-family: 'Noto Sans', Arial, sans-serif; max-width: 640px; margin: 0 auto; background: #ffffff; border: 1px solid #e2e8f0; border-radius: 8px; overflow: hidden; box-shadow: 0 4px 6px -1px rgb(0 0 0 / 0.1);">
          <div style="background: #0c2340; padding: 24px; text-align: center; border-bottom: 4px solid #c5a556;">
            <h1 style="color: #ffffff; font-size: 20px; margin: 0; font-weight: 700; letter-spacing: 0.5px;">MSME Government Procurement Portal</h1>
            <p style="color: #c5a556; font-size: 12px; margin: 6px 0 0; letter-spacing: 1px; font-weight: 600; text-transform: uppercase;">Government of India - Procurement System</p>
          </div>
          <div style="padding: 32px 24px; color: #1e293b; line-height: 1.6; font-size: 15px;">
            <p style="margin-top: 0; font-weight: 600; color: #0c2340;">Dear ${user.name || 'User'},</p>
            ${opts.html}
          </div>
          <div style="background: #f8fafc; padding: 20px 24px; text-align: center; font-size: 12px; color: #64748b; border-top: 1px solid #e2e8f0;">
            <p style="margin: 0; font-weight: 500;">This is an automated system notification from the MSME Procurement Portal.</p>
            <p style="margin: 4px 0 0;">Please do not reply to this email directly.</p>
            <p style="margin: 12px 0 0; font-size: 11px; opacity: 0.8;">© ${new Date().getFullYear()} MSME Procurement Portal. All rights reserved.</p>
          </div>
        </div>
      `;

      const info = await transporter.sendMail({
        from: `"MSME Procurement Portal" <${env.SMTP_USER}>`,
        to: user.email,
        subject: opts.subject,
        html: wrappedHtml
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
        html: opts.emailHtml || buildNotificationEmailHtml(opts)
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
