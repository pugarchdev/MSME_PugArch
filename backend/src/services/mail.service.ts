import nodemailer from 'nodemailer';
import { env } from '../config/env.js';

const createTransporter = () => nodemailer.createTransport({
  host: env.SMTP_HOST,
  port: env.SMTP_PORT,
  secure: env.SMTP_PORT === 465,
  auth: {
    user: env.SMTP_USER,
    pass: env.SMTP_PASS,
  },
  connectionTimeout: 10000,
  greetingTimeout: 10000,
});

let transporter: ReturnType<typeof createTransporter> | null = null;
export const getTransporter = () => {
  if (!transporter) transporter = createTransporter();
  return transporter;
};

export const sendOtpEmail = async (email: string, otp: string, subject = '[SECURE AUTH] Verification Code'): Promise<boolean> => {
  if (!env.SMTP_USER || !env.SMTP_PASS) {
    console.warn(`[OTP] SMTP credentials missing. Generated OTP: ${otp} (for ${email})`);
    return false;
  }

  try {
    await getTransporter().sendMail({
      from: `"Government Procurement Support" <${env.SMTP_USER}>`,
      to: email,
      subject,
      html: `
        <div style="font-family: Arial, sans-serif; max-width: 560px; margin: 20px auto; border: 1px solid #e2e8f0; border-radius: 8px; overflow: hidden;">
          <div style="background:#12335f;color:white;padding:18px;text-align:center;font-weight:700;">JsgSmile Portal Secure Verification</div>
          <div style="padding:28px;color:#1e293b;">
            <p>Use this verification code to continue:</p>
            <div style="font-size:32px;letter-spacing:10px;font-weight:800;text-align:center;margin:24px 0;color:#12335f;">${otp}</div>
            <p style="font-size:12px;color:#64748b;">This code expires in 5 minutes. If you did not request it, ignore this message and contact support.</p>
          </div>
        </div>
      `
    });
    return true;
  } catch (error: any) {
    console.error(`[OTP] Failed to send email to ${email}. Error:`, error);
    console.warn(`[OTP Fallback] Generated OTP: ${otp} (for ${email})`);
    return false;
  }
};
