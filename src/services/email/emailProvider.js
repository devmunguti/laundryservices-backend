import nodemailer from 'nodemailer';
import { emailConfig } from '../../config/emailConfig.js';
import { logger } from '../../utils/logger.js';

import dns from 'dns';
try {
  dns.setDefaultResultOrder?.('ipv4first');
} catch (e) {
  // Ignore DNS config errors on older Node
}

let transporterInstance = null;

/**
 * Creates or returns the singleton Nodemailer transporter.
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
      family: 4, // Strict IPv4 to prevent Render/Cloud ENETUNREACH IPv6 errors
      connectionTimeout: 10000, // 10s connection timeout
      greetingTimeout: 10000,   // 10s greeting timeout
      socketTimeout: 15000,    // 15s socket timeout
      tls: {
        rejectUnauthorized: false
      }
    });

    logger.info(`EmailProvider initialized with IPv4 SMTP transport (${emailConfig.smtp.host || 'smtp.gmail.com'}:${port}).`);
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
 * Sends mail via configured Nodemailer transport.
 * @param {Object} mailOptions { to, subject, html, text, from, replyTo, headers }
 */
export const sendTransportMail = async (mailOptions) => {
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

  const info = await transporter.sendMail(finalOptions);
  return info;
};

export default {
  getEmailTransporter,
  sendTransportMail
};
