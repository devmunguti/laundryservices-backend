import nodemailer from 'nodemailer';
import dns from 'dns';
import axios from 'axios';
import { emailConfig } from '../../config/emailConfig.js';
import { logger } from '../../utils/logger.js';

try {
  dns.setDefaultResultOrder?.('ipv4first');
} catch (e) {
  // Ignore DNS config errors on older Node runtimes
}

/**
 * Custom DNS lookup handler that strictly guarantees ONLY IPv4 (family 4) addresses are returned.
 * Prevents dual-stack IPv6 socket attempts and ENETUNREACH errors on cloud container platforms.
 */
export const ipv4OnlyLookup = (hostname, options, callback) => {
  if (typeof options === 'function') {
    callback = options;
    options = {};
  }
  const safeOptions = typeof options === 'object' && options !== null
    ? { ...options, family: 4, all: false }
    : { family: 4, all: false };

  return dns.lookup(hostname, safeOptions, callback);
};

let smtpTransporterInstance = null;

/**
 * Performs startup/runtime validation of the active email provider configuration.
 * @param {boolean} [logResult=false] - Whether to log the result to standard logger
 * @returns {Object} { provider, transport, valid, error, warnings }
 */
export const validateEmailConfiguration = (logResult = false) => {
  if (!emailConfig.enabled) {
    const result = {
      provider: 'disabled',
      transport: 'None (EMAIL_ENABLED=false)',
      valid: true,
      warnings: ['Email delivery is globally disabled via EMAIL_ENABLED=false. Emails will be mocked in logs.']
    };
    if (logResult) {
      logger.info(`[EmailProvider] Status: Disabled | Transport: ${result.transport}`);
    }
    return result;
  }

  const provider = emailConfig.provider;

  if (provider === 'resend') {
    if (!emailConfig.resendApiKey) {
      const result = {
        provider: 'resend',
        transport: 'HTTPS REST API (api.resend.com:443)',
        valid: false,
        error: 'RESEND_API_KEY is required when EMAIL_PROVIDER=resend'
      };
      if (logResult) logger.error(`[EmailProvider] Configuration Error: ${result.error}`);
      return result;
    }
    const result = {
      provider: 'resend',
      transport: 'HTTPS REST API (api.resend.com:443)',
      valid: true
    };
    if (logResult) logger.info(`[EmailProvider] Active Provider: resend | Transport: ${result.transport} | Status: Ready`);
    return result;
  }

  if (provider === 'brevo' || provider === 'sendinblue') {
    if (!emailConfig.brevoApiKey) {
      const result = {
        provider: 'brevo',
        transport: 'HTTPS REST API (api.brevo.com:443)',
        valid: false,
        error: 'BREVO_API_KEY is required when EMAIL_PROVIDER=brevo'
      };
      if (logResult) logger.error(`[EmailProvider] Configuration Error: ${result.error}`);
      return result;
    }
    const result = {
      provider: 'brevo',
      transport: 'HTTPS REST API (api.brevo.com:443)',
      valid: true
    };
    if (logResult) logger.info(`[EmailProvider] Active Provider: brevo | Transport: ${result.transport} | Status: Ready`);
    return result;
  }

  if (provider === 'sendgrid') {
    if (!emailConfig.sendgridApiKey) {
      const result = {
        provider: 'sendgrid',
        transport: 'HTTPS REST API (api.sendgrid.com:443)',
        valid: false,
        error: 'SENDGRID_API_KEY is required when EMAIL_PROVIDER=sendgrid'
      };
      if (logResult) logger.error(`[EmailProvider] Configuration Error: ${result.error}`);
      return result;
    }
    const result = {
      provider: 'sendgrid',
      transport: 'HTTPS REST API (api.sendgrid.com:443)',
      valid: true
    };
    if (logResult) logger.info(`[EmailProvider] Active Provider: sendgrid | Transport: ${result.transport} | Status: Ready`);
    return result;
  }

  if (provider === 'smtp') {
    const hasCreds = Boolean(emailConfig.smtp.user && emailConfig.smtp.pass);
    const transport = hasCreds
      ? `SMTP (${emailConfig.smtp.host}:${emailConfig.smtp.port})`
      : 'JSON Mock Transport (No SMTP credentials configured)';

    const result = {
      provider: 'smtp',
      transport,
      valid: true,
      warnings: hasCreds ? [] : ['SMTP_USER and SMTP_PASS not set. Emails will be logged via in-memory JSON transport.']
    };
    if (logResult) {
      logger.info(`[EmailProvider] Active Provider: smtp | Transport: ${transport} | Status: Ready`);
    }
    return result;
  }

  // Fallback / Mock
  const result = {
    provider: 'mock',
    transport: 'JSON Mock Transport',
    valid: true,
    warnings: ['No active email credentials configured. Operating in mock mode.']
  };
  if (logResult) logger.info(`[EmailProvider] Active Provider: mock | Transport: ${result.transport}`);
  return result;
};

/**
 * Sends email via Resend HTTP REST API (Port 443 HTTPS - 100% reliable on Render/Cloud)
 */
export const sendViaResend = async (mailOptions) => {
  if (!emailConfig.resendApiKey) {
    throw new Error('RESEND_API_KEY is required when EMAIL_PROVIDER=resend');
  }

  const recipient = Array.isArray(mailOptions.to) ? mailOptions.to[0] : mailOptions.to;
  const fromAddress = mailOptions.from || `"${emailConfig.from.name}" <${emailConfig.from.address}>`;

  const payload = {
    from: fromAddress,
    to: Array.isArray(mailOptions.to) ? mailOptions.to : [mailOptions.to],
    subject: mailOptions.subject,
    html: mailOptions.html,
    text: mailOptions.text,
    reply_to: mailOptions.replyTo || emailConfig.replyTo
  };

  logger.info(`[EmailProvider] Sending email via Resend API to ${recipient}`);

  try {
    const response = await axios.post('https://api.resend.com/emails', payload, {
      headers: {
        'Authorization': `Bearer ${emailConfig.resendApiKey}`,
        'Content-Type': 'application/json'
      },
      timeout: 15000
    });

    const messageId = response.data?.id || `RESEND-${Date.now()}`;
    logger.info(`[EmailProvider] Resend delivery successful to ${recipient} (MsgID: ${messageId})`);
    return { success: true, provider: 'resend', messageId };
  } catch (err) {
    const safeError = err.response?.data?.message || err.response?.data?.error?.message || err.message;
    logger.error(`[EmailProvider] Resend delivery failed to ${recipient}: ${safeError}`);
    throw new Error(`Resend delivery failed: ${safeError}`);
  }
};

/**
 * Sends email via Brevo / Sendinblue HTTP REST API (Port 443 HTTPS)
 */
export const sendViaBrevo = async (mailOptions) => {
  if (!emailConfig.brevoApiKey) {
    throw new Error('BREVO_API_KEY is required when EMAIL_PROVIDER=brevo');
  }

  const recipient = Array.isArray(mailOptions.to) ? mailOptions.to[0] : mailOptions.to;

  const payload = {
    sender: {
      name: emailConfig.from.name,
      email: emailConfig.from.address
    },
    to: Array.isArray(mailOptions.to)
      ? mailOptions.to.map((email) => ({ email }))
      : [{ email: mailOptions.to }],
    subject: mailOptions.subject,
    htmlContent: mailOptions.html,
    textContent: mailOptions.text,
    replyTo: { email: mailOptions.replyTo || emailConfig.replyTo }
  };

  logger.info(`[EmailProvider] Sending email via Brevo API to ${recipient}`);

  try {
    const response = await axios.post('https://api.brevo.com/v3/smtp/email', payload, {
      headers: {
        'api-key': emailConfig.brevoApiKey,
        'Content-Type': 'application/json'
      },
      timeout: 15000
    });

    const messageId = response.data?.messageId || `BREVO-${Date.now()}`;
    logger.info(`[EmailProvider] Brevo delivery successful to ${recipient} (MsgID: ${messageId})`);
    return { success: true, provider: 'brevo', messageId };
  } catch (err) {
    const safeError = err.response?.data?.message || err.message;
    logger.error(`[EmailProvider] Brevo delivery failed to ${recipient}: ${safeError}`);
    throw new Error(`Brevo delivery failed: ${safeError}`);
  }
};

/**
 * Sends email via SendGrid HTTP REST API (Port 443 HTTPS)
 */
export const sendViaSendGrid = async (mailOptions) => {
  if (!emailConfig.sendgridApiKey) {
    throw new Error('SENDGRID_API_KEY is required when EMAIL_PROVIDER=sendgrid');
  }

  const recipient = Array.isArray(mailOptions.to) ? mailOptions.to[0] : mailOptions.to;
  const recipients = Array.isArray(mailOptions.to) ? mailOptions.to : [mailOptions.to];

  const payload = {
    personalizations: [
      {
        to: recipients.map((email) => ({ email }))
      }
    ],
    from: {
      email: emailConfig.from.address,
      name: emailConfig.from.name
    },
    reply_to: {
      email: mailOptions.replyTo || emailConfig.replyTo
    },
    subject: mailOptions.subject,
    content: [
      {
        type: 'text/html',
        value: mailOptions.html || ''
      },
      ...(mailOptions.text
        ? [
          {
            type: 'text/plain',
            value: mailOptions.text
          }
        ]
        : [])
    ]
  };

  logger.info(`[EmailProvider] Sending email via SendGrid API to ${recipient}`);

  try {
    const response = await axios.post('https://api.sendgrid.com/v3/mail/send', payload, {
      headers: {
        'Authorization': `Bearer ${emailConfig.sendgridApiKey}`,
        'Content-Type': 'application/json'
      },
      timeout: 15000
    });

    const messageId = response.headers?.['x-message-id'] || `SENDGRID-${Date.now()}`;
    logger.info(`[EmailProvider] SendGrid delivery successful to ${recipient} (MsgID: ${messageId})`);
    return { success: true, provider: 'sendgrid', messageId };
  } catch (err) {
    const safeError = err.response?.data?.errors?.[0]?.message || err.message;
    logger.error(`[EmailProvider] SendGrid delivery failed to ${recipient}: ${safeError}`);
    throw new Error(`SendGrid delivery failed: ${safeError}`);
  }
};

/**
 * Creates or returns the singleton Nodemailer SMTP transporter.
 */
export const getEmailTransporter = () => {
  if (smtpTransporterInstance) {
    return smtpTransporterInstance;
  }

  if (emailConfig.smtp.user && emailConfig.smtp.pass) {
    const port = emailConfig.smtp.port || 587;
    const isPort465 = port === 465;

    smtpTransporterInstance = nodemailer.createTransport({
      host: emailConfig.smtp.host || 'smtp.gmail.com',
      port: port,
      secure: emailConfig.smtp.secure ?? isPort465,
      auth: {
        user: emailConfig.smtp.user,
        pass: emailConfig.smtp.pass
      },
      family: 4, // Strict IPv4 socket enforcement
      lookup: ipv4OnlyLookup, // Strict IPv4 A-record resolver
      connectionTimeout: 10000,
      greetingTimeout: 10000,
      socketTimeout: 15000,
      tls: {
        rejectUnauthorized: true // Standard strict TLS certificate validation
      }
    });

    logger.info(`[EmailProvider] Initialized strict IPv4 SMTP transport (${emailConfig.smtp.host || 'smtp.gmail.com'}:${port}).`);
  } else {
    // Development / test fallback transporter (in-memory JSON transport)
    smtpTransporterInstance = nodemailer.createTransport({
      jsonTransport: true
    });
    logger.info('[EmailProvider] Initialized development JSON transport (SMTP credentials not configured).');
  }

  return smtpTransporterInstance;
};

/**
 * Sends mail via Nodemailer SMTP transport.
 */
const sendViaSMTP = async (mailOptions) => {
  const recipient = Array.isArray(mailOptions.to) ? mailOptions.to[0] : mailOptions.to;
  const transporter = getEmailTransporter();

  const finalOptions = {
    from: mailOptions.from || `"${emailConfig.from.name}" <${emailConfig.from.address}>`,
    to: mailOptions.to,
    replyTo: mailOptions.replyTo || emailConfig.replyTo,
    subject: mailOptions.subject,
    html: mailOptions.html,
    text: mailOptions.text,
    headers: mailOptions.headers || {}
  };

  logger.info(`[EmailProvider] Sending email via SMTP to ${recipient}`);

  try {
    const info = await transporter.sendMail(finalOptions);
    const messageId = info.messageId || `SMTP-${Date.now()}`;
    logger.info(`[EmailProvider] SMTP delivery successful to ${recipient} (MsgID: ${messageId})`);
    return { success: true, provider: 'smtp', messageId };
  } catch (smtpErr) {
    let diagnosticReason = 'Unknown SMTP error';
    if (smtpErr.code === 'ETIMEDOUT' || smtpErr.message?.includes('Connection timeout')) {
      diagnosticReason = 'Connection timeout (ETIMEDOUT) - Outbound SMTP port blocked or throttled by cloud host network';
    } else if (smtpErr.code === 'ENETUNREACH' || smtpErr.message?.includes('ENETUNREACH')) {
      diagnosticReason = 'Network unreachable (ENETUNREACH) - IPv6 route not available on container network';
    } else if (smtpErr.code === 'ECONNREFUSED') {
      diagnosticReason = 'Connection refused (ECONNREFUSED) - Remote host rejected connection on specified port';
    } else if (smtpErr.code === 'ECONNRESET') {
      diagnosticReason = 'Connection reset (ECONNRESET) - Remote host dropped socket';
    } else if (smtpErr.responseCode === 535 || smtpErr.message?.includes('535') || smtpErr.code === 'EAUTH') {
      diagnosticReason = 'Authentication failed (535/EAUTH) - Invalid SMTP credentials or application password';
    } else if (smtpErr.message?.includes('certificate') || smtpErr.code === 'DEPTH_ZERO_SELF_SIGNED_CERT') {
      diagnosticReason = 'TLS certificate validation error';
    }

    logger.error(`[EmailProvider] SMTP delivery failed to ${recipient}: [${smtpErr.code || 'NO_CODE'}] ${diagnosticReason} (${smtpErr.message})`);

    if (
      smtpErr.code === 'ENETUNREACH' ||
      smtpErr.code === 'ETIMEDOUT' ||
      smtpErr.code === 'ECONNREFUSED' ||
      smtpErr.message?.includes('ENETUNREACH') ||
      smtpErr.message?.includes('Connection timeout')
    ) {
      logger.warn(
        `[EmailProvider] The configured SMTP server is unreachable from this environment (${smtpErr.code || smtpErr.message}). ` +
        `For cloud hosting deployments on Render, please use an HTTP-based email provider (e.g., EMAIL_PROVIDER=resend with RESEND_API_KEY).`
      );
    }

    throw smtpErr;
  }
};

/**
 * Primary dispatch function called by emailService.
 * Directs transmission to the active provider with NO silent fall-through to SMTP.
 * 
 * @param {Object} mailOptions { to, subject, html, text, from, replyTo, headers }
 * @returns {Promise<{ success: boolean, provider: string, messageId: string }>}
 */
export const sendTransportMail = async (mailOptions) => {
  const provider = emailConfig.provider;

  switch (provider) {
    case 'resend':
      return await sendViaResend(mailOptions);

    case 'brevo':
    case 'sendinblue':
      return await sendViaBrevo(mailOptions);

    case 'sendgrid':
      return await sendViaSendGrid(mailOptions);

    case 'smtp':
      return await sendViaSMTP(mailOptions);

    case 'mock':
    case 'json': {
      const recipient = Array.isArray(mailOptions.to) ? mailOptions.to[0] : mailOptions.to;
      const mockId = `MOCK-EMAIL-${Date.now()}`;
      logger.info(`[EmailProvider] [MOCK] Email simulated for ${recipient} (MsgID: ${mockId})`);
      return { success: true, provider: 'mock', messageId: mockId };
    }

    default:
      throw new Error(`Unknown email provider '${provider}'. Valid options: resend, brevo, sendgrid, smtp, mock.`);
  }
};

export default {
  validateEmailConfiguration,
  sendTransportMail,
  sendViaResend,
  sendViaBrevo,
  sendViaSendGrid,
  getEmailTransporter,
  ipv4OnlyLookup
};

