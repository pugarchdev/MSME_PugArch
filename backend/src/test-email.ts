import { transporter } from './services/mail.service.js';
import { env } from './config/env.js';

async function testMail() {
  console.log('Using SMTP settings:');
  console.log('Host:', env.SMTP_HOST);
  console.log('Port:', env.SMTP_PORT);
  console.log('User:', env.SMTP_USER);
  console.log('Pass:', env.SMTP_PASS ? '********' : 'missing');

  try {
    const info = await transporter.sendMail({
      from: `"MSME Procurement Test" <${env.SMTP_USER}>`,
      to: env.SMTP_USER, // send to self
      subject: 'Test Email from MSME Portal',
      html: '<p>This is a test email to verify SMTP configuration.</p>'
    });
    console.log('Email sent successfully!');
    console.log('Message ID:', info.messageId);
    console.log('Response:', info.response);
  } catch (error) {
    console.error('SMTP test failed:', error);
  }
}

testMail().then(() => process.exit(0));
