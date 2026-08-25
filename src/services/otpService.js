import crypto from 'crypto';
import bcrypt from 'bcryptjs';
import OtpToken from '../models/OtpToken.js';
import { notificationConfig } from '../config/notificationConfig.js';
import { sendSMS } from './sms/smsService.js';
import { normalizePhoneNumber, maskPhoneNumber } from '../utils/phoneUtils.js';
import { logger } from '../utils/logger.js';

/**
 * Generates a cryptographically secure numeric OTP of specified length (default 6 digits).
 */
export const generateNumericOtp = (digits = 6) => {
  const min = Math.pow(10, digits - 1);
  const max = Math.pow(10, digits) - 1;
  return crypto.randomInt(min, max + 1).toString();
};

/**
 * Requests and sends an OTP via SMS to the target phone number.
 * Enforces cooldown, invalidates prior tokens, hashes OTP, and safely transmits.
 * 
 * @param {Object} options
 * @param {string} options.phone - Target phone number
 * @param {string} [options.purpose='login'] - Purpose ('login', 'verification', 'password_reset')
 * @param {Object} [options.metadata] - Extra metadata
 * @returns {Promise<Object>} Result { success, message, cooldownSeconds, expiresAt }
 */
export const requestPhoneOtp = async ({ phone, purpose = 'login', metadata = {} }) => {
  const normalizedPhone = normalizePhoneNumber(phone);
  if (!normalizedPhone) {
    return { success: false, message: 'Please provide a valid phone number.' };
  }

  const maskedPhone = maskPhoneNumber(normalizedPhone);
  const cooldownSeconds = notificationConfig.otp.resendCooldownSeconds || 60;
  const expiryMinutes = notificationConfig.otp.expiryMinutes || 5;

  // 1. Check existing active OTP for cooldown
  const existingToken = await OtpToken.findOne({
    identifier: normalizedPhone,
    purpose,
    expiresAt: { $gt: new Date() }
  }).sort({ createdAt: -1 });

  if (existingToken) {
    const elapsedSeconds = Math.floor((Date.now() - new Date(existingToken.lastSentAt).getTime()) / 1000);
    if (elapsedSeconds < cooldownSeconds) {
      const waitTime = cooldownSeconds - elapsedSeconds;
      return {
        success: false,
        message: `Please wait ${waitTime} seconds before requesting a new OTP.`,
        cooldownRemaining: waitTime
      };
    }
  }

  // 2. Invalidate any existing active tokens for this identifier & purpose
  await OtpToken.deleteMany({ identifier: normalizedPhone, purpose });

  // 3. Generate new 6-digit OTP and secure hash
  const rawOtp = generateNumericOtp(6);
  const salt = await bcrypt.genSalt(10);
  const otpHash = await bcrypt.hash(rawOtp, salt);

  const expiresAt = new Date(Date.now() + expiryMinutes * 60 * 1000);

  // 4. Persist hashed OTP token
  await OtpToken.create({
    identifier: normalizedPhone,
    otpHash,
    purpose,
    maxAttempts: notificationConfig.otp.maxAttempts || 5,
    expiresAt,
    lastSentAt: new Date(),
    metadata
  });

  // 5. Transmit OTP via SMS
  const smsBody = `Your Aura Laundry verification code is: ${rawOtp}. Valid for ${expiryMinutes} minutes. Do not share this code with anyone.`;

  logger.info(`[OtpService] Generated OTP for ${maskedPhone} [Purpose: ${purpose}]. Sending via SMS...`);

  const smsResult = await sendSMS({
    to: normalizedPhone,
    message: smsBody,
    type: 'OTP_REQUESTED',
    metadata: { purpose }
  });

  return {
    success: true,
    message: `Verification code sent to ${maskedPhone}.`,
    maskedPhone,
    expiresAt,
    cooldownSeconds,
    smsStatus: smsResult.status
  };
};

/**
 * Verifies a submitted OTP against the stored hash.
 * Enforces attempt limits and deletes the token upon successful verification.
 * 
 * @param {Object} options
 * @param {string} options.phone - Target phone number
 * @param {string} options.otp - Submitted OTP
 * @param {string} [options.purpose='login'] - Expected purpose
 * @returns {Promise<Object>} Verification result { success, message, verified }
 */
export const verifyPhoneOtp = async ({ phone, otp, purpose = 'login' }) => {
  const normalizedPhone = normalizePhoneNumber(phone);
  if (!normalizedPhone || !otp) {
    return { success: false, message: 'Phone number and verification code are required.' };
  }

  const maskedPhone = maskPhoneNumber(normalizedPhone);
  const cleanOtp = String(otp).trim();

  // 1. Find active token
  const tokenDoc = await OtpToken.findOne({
    identifier: normalizedPhone,
    purpose,
    expiresAt: { $gt: new Date() }
  });

  if (!tokenDoc) {
    return {
      success: false,
      message: 'Verification code has expired or is invalid. Please request a new one.'
    };
  }

  // 2. Check attempt limits
  if (tokenDoc.attempts >= tokenDoc.maxAttempts) {
    await OtpToken.deleteOne({ _id: tokenDoc._id });
    logger.warn(`[OtpService] Max attempts reached for ${maskedPhone}. Token invalidated.`);
    return {
      success: false,
      message: 'Too many incorrect attempts. Please request a new verification code.'
    };
  }

  // 3. Verify OTP hash
  const isMatch = await bcrypt.compare(cleanOtp, tokenDoc.otpHash);

  if (!isMatch) {
    tokenDoc.attempts += 1;
    await tokenDoc.save();

    const remainingAttempts = tokenDoc.maxAttempts - tokenDoc.attempts;
    logger.warn(`[OtpService] Incorrect OTP for ${maskedPhone}. ${remainingAttempts} attempts remaining.`);

    return {
      success: false,
      message: `Invalid verification code. ${remainingAttempts} attempt(s) remaining.`
    };
  }

  // 4. Successfully verified -> Delete the OTP token to prevent replay
  await OtpToken.deleteOne({ _id: tokenDoc._id });
  logger.info(`[OtpService] OTP verified successfully for ${maskedPhone} [Purpose: ${purpose}].`);

  return {
    success: true,
    verified: true,
    message: 'Verification code verified successfully.'
  };
};

export default {
  generateNumericOtp,
  requestPhoneOtp,
  verifyPhoneOtp
};
