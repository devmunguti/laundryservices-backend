import nodemailer from 'nodemailer';
import dns from 'dns';
import axios from 'axios';
import { emailConfig } from '../../config/emailConfig.js';
import { logger } from '../../utils/logger.js';

try {
  dns.setDefaultResultOrder?.('ipv4first');
} catch (e) {
  // Ignore DNS config errors on older Node versions
}

/**
 * Custom DNS lookup handler that guarantees ONLY IPv4 addresses are returned.
 * Prevents Linux container ENETUNREACH errors on cloud platforms without IPv6 routing (Render, AWS, etc.).
 */
const ipv4OnlyLookup = (hostname, options, callback) => {
  if (typeof options === 'function') {
    callback = options;
    options = {};
  }
  return dns.lookup(hostname, { family: 4, all: false, ...(typeof options === 'object' ? options : {}) }, callback);
};

let transporterInstance = null;

/**
 * Sends email via Resend HTTP REST API (Port 443 HTTPS - 100% reliable on Render/Cloud)
 */
const sendViaResend = async (mailOptions) => {
  const apiKey = emailConfig.resendApiKey;
  if (!apiKey) {
    throw new Error('RESEND_API_KEY is not configured in environment variables.');
  }

  const fromAddress = mailOptions.from || `"${emailConfig.from.name}" <${emailConfig.from.address}>`;

  const payload = {
    from: fromAddress,
    to: Array.isArray(mailOptions.to) ? mailOptions.to : [mailOptions.to],
    subject: mailOptions.subject,
    html: mailOptions.html,
    text: mailOptions.text,
    reply_to: mailOptions.replyTo || emailConfig.replyTo
  };

  const response = await axios.post('https://api.resend.com/emails', payload, {
    headers: {
      'Authorization': `Bearer ${apiKey}`,
      'Content-Type': 'application/json'
    },
    timeout: 15000
  });

  return { messageId: response.data?.id || `RESEND-${Date.now()}` };
};

/**
 * Sends email via Brevo / Sendinblue HTTP REST API (Port 443 HTTPS - reliable on Render/Cloud)
 */
const sendViaBrevo = async (mailOptions) => {
  const apiKey = emailConfig.brevoApiKey;
  if (!apiKey) {
    throw new Error('BREVO_API_KEY is not configured in environment variables.');
  }

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

  const response = await axios.post('https://api.brevo.com/v3/smtp/email', payload, {
    headers: {
      'api-key': apiKey,
      'Content-Type': 'application/json'
    },
    timeout: 15000
  });

  return { messageId: response.data?.messageId || `BREVO-${Date.now()}` };
};

/**
 * Sends email via SendGrid HTTP REST API (Port 443 HTTPS)
 */
const sendViaSendGrid = async (mailOptions) => {
  const apiKey = emailConfig.sendgridApiKey;
  if (!apiKey) {
    throw new Error('SENDGRID_API_KEY is not configured in environment variables.');
  }

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

  const response = await axios.post('https://api.sendgrid.com/v3/mail/send', payload, {
    headers: {
      'Authorization': `Bearer ${apiKey}`,
      'Content-Type': 'application/json'
    },
    timeout: 15000
  });

  return { messageId: response.headers?.['x-message-id'] || `SENDGRID-${Date.now()}` };
};

/**
 * Creates or returns the singleton Nodemailer SMTP transporter.
 */
export const getEmailTransporter = () => {
  if (transporterInstance) {
    return transporterInstance;
  }

  // If SMTP user/pass is configured, initialize transport
  if (emailConfig.smtp.user && emailConfig.smtp.pass) {
    const port = emailConfig.smtp.port || 587;
    const isPort465 = port === 465;

    transporterInstance = nodemailer.createTransport({
      host: emailConfig.smtp.host || 'smtp.gmail.com',
      port: port,
      secure: emailConfig.smtp.secure ?? isPort465,
      auth: {
        user: emailConfig.smtp.user,
        pass: emailConfig.smtp.pass
      },
      family: 4, // Strict IPv4 socket
      lookup: ipv4OnlyLookup, // Custom resolver enforcing IPv4 A-records exclusively
      connectionTimeout: 10000, // 10s connection timeout
      greetingTimeout: 10000,   // 10s greeting timeout
      socketTimeout: 15000,    // 15s socket timeout
      tls: {
        rejectUnauthorized: false
      }
    });

    logger.info(`EmailProvider initialized with strict IPv4 SMTP transport (${emailConfig.smtp.host || 'smtp.gmail.com'}:${port}).`);
  } else {
    // Development / test fallback transporter (in-memory stream/json transport)
    transporterInstance = nodemailer.createTransport({
      jsonTransport: true
    });
    logger.info('EmailProvider initialized with development JSON transport (SMTP credentials not set).');
  }

  return transporterInstance;
};

/**
 * Dispatches mail via the configured email provider (Resend HTTP, Brevo HTTP, SendGrid HTTP, or SMTP).
 * @param {Object} mailOptions { to, subject, html, text, from, replyTo, headers }
 */
export const sendTransportMail = async (mailOptions) => {
  const provider = emailConfig.provider;

  // 1. Resend REST API (Recommended for Render)
  if (provider === 'resend' || (!emailConfig.smtp.user && emailConfig.resendApiKey)) {
    return await sendViaResend(mailOptions);
  }

  // 2. Brevo / Sendinblue REST API (Recommended for Render)
  if (provider === 'brevo' || provider === 'sendinblue' || (!emailConfig.smtp.user && emailConfig.brevoApiKey)) {
    return await sendViaBrevo(mailOptions);
  }

  // 3. SendGrid REST API
  if (provider === 'sendgrid' || (!emailConfig.smtp.user && emailConfig.sendgridApiKey)) {
    return await sendViaSendGrid(mailOptions);
  }

  // 4. Default SMTP Transport
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

  try {
    const info = await transporter.sendMail(finalOptions);
    return info;
  } catch (smtpErr) {
    // If Render blocks SMTP ports or hits IPv6 ENETUNREACH
    if (
      smtpErr.code === 'ENETUNREACH' ||
      smtpErr.message?.includes('ENETUNREACH') ||
      smtpErr.message?.includes('Connection timeout') ||
      smtpErr.code === 'ETIMEDOUT'
    ) {
      logger.warn(
        `[EmailProvider] SMTP socket blocked or unreachable (${smtpErr.message}). ` +
        `Note: Render containers block outbound SMTP ports (587, 465, 25) and IPv6. ` +
        `For cloud deployments, switch to HTTP API (e.g. EMAIL_PROVIDER=resend with RESEND_API_KEY or EMAIL_PROVIDER=brevo with BREVO_API_KEY).`
      );
    }
    throw smtpErr;
  }
};

export default {
  getEmailTransporter,
  sendTransportMail
};
