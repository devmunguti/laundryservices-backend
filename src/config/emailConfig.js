import dotenv from 'dotenv';
dotenv.config();

/**
 * Resolves active email provider based on explicit configuration or available credentials.
 * Priority: Explicit EMAIL_PROVIDER > RESEND > BREVO > SENDGRID > SMTP > MOCK
 */
export const resolveEmailProvider = () => {
  const explicitProvider = process.env.EMAIL_PROVIDER?.trim().toLowerCase();
  if (explicitProvider) {
    return explicitProvider;
  }

  // Auto-detect based on available credentials in recommended priority order
  if (process.env.RESEND_API_KEY?.trim()) return 'resend';
  if (process.env.BREVO_API_KEY?.trim() || process.env.SENDINBLUE_API_KEY?.trim()) return 'brevo';
  if (process.env.SENDGRID_API_KEY?.trim()) return 'sendgrid';
  if (process.env.SMTP_USER?.trim() && process.env.SMTP_PASS?.trim()) return 'smtp';

  return 'mock';
};

export const emailConfig = {
  enabled: process.env.EMAIL_ENABLED !== 'false',
  provider: resolveEmailProvider(),
  rawProviderEnv: process.env.EMAIL_PROVIDER || '',

  // Cloud HTTP API Providers (HTTPS / Port 443 — Recommended for Render / Cloud)
  resendApiKey: process.env.RESEND_API_KEY?.trim() || '',
  brevoApiKey: (process.env.BREVO_API_KEY || process.env.SENDINBLUE_API_KEY || '').trim(),
  sendgridApiKey: process.env.SENDGRID_API_KEY?.trim() || '',

  // SMTP Configuration (Local Development or Dedicated SMTP Hosts)
  smtp: {
    host: process.env.SMTP_HOST || 'smtp.gmail.com',
    port: parseInt(process.env.SMTP_PORT || '587', 10),
    secure: process.env.SMTP_SECURE === 'true' || parseInt(process.env.SMTP_PORT || '587', 10) === 465,
    user: process.env.SMTP_USER?.trim() || '',
    pass: process.env.SMTP_PASS?.trim() || '',
  },

  // Sender Metadata
  from: {
    address: process.env.EMAIL_FROM_ADDRESS || 'support@auralaundry.co.ke',
    name: process.env.EMAIL_FROM_NAME || 'Laundry Platform',
  },
  replyTo: process.env.EMAIL_REPLY_TO || process.env.EMAIL_FROM_ADDRESS || 'support@auralaundry.co.ke',
  adminAlertsTo: process.env.EMAIL_ADMIN_ALERTS_TO || 'admin@auralaundry.co.ke',

  // Portal & App URLs
  appUrl: process.env.CLIENT_ORIGIN || process.env.APP_URL || 'https://karumarket.click',
  adminPortalUrl: `${process.env.CLIENT_ORIGIN || process.env.APP_URL || 'https://karumarket.click'}/admin/portal`,
  providerPortalUrl: `${process.env.CLIENT_ORIGIN || process.env.APP_URL || 'https://karumarket.click'}/cleaner/portal`
};

export default emailConfig;
