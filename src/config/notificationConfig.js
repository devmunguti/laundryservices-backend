import dotenv from 'dotenv';
dotenv.config();

export const notificationConfig = {
  sms: {
    enabled: process.env.SMS_ENABLED !== 'false',
    provider: process.env.SMS_PROVIDER || 'mock', // 'africastalking' | 'twilio' | 'mock'
    africasTalking: {
      username: process.env.AT_USERNAME || 'sandbox',
      apiKey: process.env.AT_API_KEY || '',
      senderId: process.env.AT_SENDER_ID || ''
    },
    twilio: {
      accountSid: process.env.TWILIO_ACCOUNT_SID || '',
      authToken: process.env.TWILIO_AUTH_TOKEN || '',
      fromNumber: process.env.TWILIO_PHONE_NUMBER || ''
    }
  },
  inApp: {
    enabled: process.env.IN_APP_NOTIFICATIONS_ENABLED !== 'false'
  },
  email: {
    enabled: process.env.EMAIL_ENABLED !== 'false'
  },
  otp: {
    expiryMinutes: parseInt(process.env.OTP_EXPIRY_MINUTES || '5', 10),
    resendCooldownSeconds: parseInt(process.env.OTP_RESEND_COOLDOWN_SECONDS || '60', 10),
    maxAttempts: parseInt(process.env.OTP_MAX_ATTEMPTS || '5', 10)
  }
};

export default notificationConfig;
