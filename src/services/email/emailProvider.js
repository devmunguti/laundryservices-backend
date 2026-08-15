import nodemailer from 'nodemailer';
import { emailConfig } from '../../config/emailConfig.js';
import { logger } from '../../utils/logger.js';

let transporterInstance = null;

/**
 * Creates or returns the singleton Nodemailer transporter pool.
 */
export const getEmailTransporter = () => {
  if (transporterInstance) {
    return transporterInstance;
  }

  // If SMTP user/pass is configured, use SMTP pool
  if (emailConfig.smtp.user && emailConfig.smtp.pass) {
    transporterInstance = nodemailer.createTransport({
      host: emailConfig.smtp.host,
      port: emailConfig.smtp.port,
      secure: emailConfig.smtp.secure,
      auth: {
        user: emailConfig.smtp.user,
        pass: emailConfig.smtp.pass
      },
      pool: true,
      maxConnections: 5,
      maxMessages: 100,
      timeout: 10000 // 10s socket timeout
    });
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
