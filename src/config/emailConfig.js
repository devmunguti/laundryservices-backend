import dotenv from 'dotenv';
dotenv.config();

export const emailConfig = {
  enabled: process.env.EMAIL_ENABLED !== 'false',
  provider: (process.env.EMAIL_PROVIDER || 'smtp').toLowerCase(),
  // Cloud HTTP API Providers (Recommended on Render/Cloud to bypass SMTP port blocking & IPv6 issues)
  resendApiKey: process.env.RESEND_API_KEY || '',
  brevoApiKey: process.env.BREVO_API_KEY || process.env.SENDINBLUE_API_KEY || '',
  sendgridApiKey: process.env.SENDGRID_API_KEY || '',
  smtp: {
    host: process.env.SMTP_HOST || 'smtp.gmail.com',
    port: parseInt(process.env.SMTP_PORT || '587', 10),
    secure: process.env.SMTP_SECURE === 'true' || parseInt(process.env.SMTP_PORT || '587', 10) === 465,
    user: process.env.SMTP_USER || '',
    pass: process.env.SMTP_PASS || '',
  },
  from: {
    address: process.env.EMAIL_FROM_ADDRESS || 'support@auralaundry.co.ke',
    name: process.env.EMAIL_FROM_NAME || 'Laundry Platform',
  },
  replyTo: process.env.EMAIL_REPLY_TO || 'support@auralaundry.co.ke',
  adminAlertsTo: process.env.EMAIL_ADMIN_ALERTS_TO || 'admin@auralaundry.co.ke',
  appUrl: process.env.CLIENT_ORIGIN || process.env.APP_URL || 'https://karumarket.click',
  adminPortalUrl: `${process.env.CLIENT_ORIGIN || process.env.APP_URL || 'https://karumarket.click'}/admin/portal`,
  providerPortalUrl: `${process.env.CLIENT_ORIGIN || process.env.APP_URL || 'https://karumarket.click'}/cleaner/portal`
};

export default emailConfig;
