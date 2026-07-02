import nodemailer from 'nodemailer';
import { env } from '../config/env.js';
import prisma from '../config/prisma.js';

const db = prisma as any;

// Transporter Cache per companyId (key: companyId, value: transporter)
const transporterCache = new Map<number, nodemailer.Transporter>();
let globalTransporter: nodemailer.Transporter | null = null;

/**
 * Resolve or create a nodemailer SMTP transporter for the specified company.
 */
export const getTransporterForCompany = async (companyId: number): Promise<nodemailer.Transporter> => {
  if (transporterCache.has(companyId)) {
    return transporterCache.get(companyId)!;
  }

  try {
    const stored = await db.companySetting.findUnique({
      where: { companyId_key: { companyId, key: 'portal-email-settings' } }
    });

    const val = stored?.value || {};
    // If custom SMTP is enabled and has a host/username, construct a transporter
    if (val.emailEnabled && val.host && val.username) {
      const dynamicTransporter = nodemailer.createTransport({
        host: val.host,
        port: Number(val.port || 587),
        secure: Boolean(val.secure),
        auth: {
          user: val.username,
          pass: val.password || ''
        },
        connectionTimeout: 10000,
        greetingTimeout: 10000
      });

      transporterCache.set(companyId, dynamicTransporter);
      return dynamicTransporter;
    }
  } catch (err) {
    console.error(`[SMTP Resolver] Failed to resolve SMTP config for company ${companyId}:`, err);
  }

  // Fallback to global SMTP transporter
  if (!globalTransporter) {
    globalTransporter = nodemailer.createTransport({
      host: env.SMTP_HOST,
      port: env.SMTP_PORT,
      secure: env.SMTP_PORT === 465,
      auth: env.SMTP_USER && env.SMTP_PASS ? {
        user: env.SMTP_USER,
        pass: env.SMTP_PASS
      } : undefined,
      connectionTimeout: 10000,
      greetingTimeout: 10000
    });
  }

  return globalTransporter;
};

/**
 * Legacy compatibility helper. Returns the global transporter.
 */
export const getTransporter = () => {
  if (!globalTransporter) {
    globalTransporter = nodemailer.createTransport({
      host: env.SMTP_HOST,
      port: env.SMTP_PORT,
      secure: env.SMTP_PORT === 465,
      auth: env.SMTP_USER && env.SMTP_PASS ? {
        user: env.SMTP_USER,
        pass: env.SMTP_PASS
      } : undefined,
      connectionTimeout: 10000,
      greetingTimeout: 10000
    });
  }
  return globalTransporter;
};

/**
 * Replace template placeholders like {{variableName}} with their values.
 */
export const compileEmailTemplate = (
  subject: string,
  htmlBody: string,
  variables: Record<string, string>
): { subject: string; html: string } => {
  let compiledSubject = subject;
  let compiledHtml = htmlBody;

  for (const [key, value] of Object.entries(variables)) {
    const regex = new RegExp(`{{\\s*${key}\\s*}}`, 'g');
    compiledSubject = compiledSubject.replace(regex, value || '');
    compiledHtml = compiledHtml.replace(regex, value || '');
  }

  return { subject: compiledSubject, html: compiledHtml };
};

/**
 * Send an OTP verification email using company-specific settings and templates when available.
 */
export const sendOtpEmail = async (
  email: string,
  otp: string,
  subjectDefault = '[SECURE AUTH] Verification Code',
  templateSlug = 'common-otp'
): Promise<boolean> => {
  try {
    // 1. Resolve user's company ID
    const user = await db.user.findFirst({
      where: { email },
      select: { companyId: true, name: true }
    });
    const companyId = user?.companyId || 1;

    // 2. Fetch company portal details (branding)
    const company = await db.company.findUnique({
      where: { id: companyId },
      select: { portalDisplayName: true, name: true }
    });
    const portalName = company?.portalDisplayName || company?.name || 'JsgSmile Portal';

    // 3. Resolve dynamic SMTP credentials & sender details
    const settings = await db.companySetting.findUnique({
      where: { companyId_key: { companyId, key: 'portal-email-settings' } }
    });
    const val = settings?.value || {};
    const fromEmail = val.fromEmail || env.SMTP_USER;
    const fromName = val.fromName || portalName;

    // Verify if email is actually enabled for this tenant
    const emailEnabled = val.emailEnabled ?? Boolean(env.SMTP_USER && env.SMTP_PASS);
    if (!emailEnabled) {
      console.warn(`[OTP] Email sending is disabled for company ${companyId}. Generated OTP: ${otp} (for ${email})`);
      return false;
    }

    // 4. Resolve template
    const templatesSetting = await db.companySetting.findUnique({
      where: { companyId_key: { companyId, key: 'email-templates' } }
    });
    const templates = Array.isArray(templatesSetting?.value) ? templatesSetting.value : [];
    const template = templates.find((t: any) => t.slug === templateSlug && t.isActive);

    let finalSubject = subjectDefault;
    let finalHtml = '';

    const templateVars = {
      otp,
      userName: user?.name || 'User',
      userEmail: email,
      portalName,
      companyName: company?.name || portalName,
      currentDate: new Date().toLocaleDateString()
    };

    if (template) {
      const compiled = compileEmailTemplate(template.subject, template.htmlBody, templateVars);
      finalSubject = compiled.subject;
      finalHtml = compiled.html;
    } else {
      // Hardcoded fallback template matching the old style
      finalHtml = `
        <div style="font-family: Arial, sans-serif; max-width: 560px; margin: 20px auto; border: 1px solid #e2e8f0; border-radius: 8px; overflow: hidden;">
          <div style="background:#12335f;color:white;padding:18px;text-align:center;font-weight:700;">${portalName} Secure Verification</div>
          <div style="padding:28px;color:#1e293b;">
            <p>Use this verification code to continue:</p>
            <div style="font-size:32px;letter-spacing:10px;font-weight:800;text-align:center;margin:24px 0;color:#12335f;">${otp}</div>
            <p style="font-size:12px;color:#64748b;">This code expires in 10 minutes. If you did not request it, ignore this message and contact support.</p>
          </div>
        </div>
      `;
    }

    const transporter = await getTransporterForCompany(companyId);

    // If no transporter auth credentials resolved and no global credentials, log OTP
    const hasAuth = val.username || (env.SMTP_USER && env.SMTP_PASS);
    if (!hasAuth) {
      console.warn(`[OTP] No SMTP credentials configured. Generated OTP: ${otp} (for ${email})`);
      return false;
    }

    await transporter.sendMail({
      from: `"${fromName}" <${fromEmail}>`,
      to: email,
      subject: finalSubject,
      html: finalHtml
    });

    return true;
  } catch (error: any) {
    console.error(`[OTP] Failed to send email to ${email}. Error:`, error);
    console.warn(`[OTP Fallback] Generated OTP: ${otp} (for ${email})`);
    return false;
  }
};
