import rateLimit from 'express-rate-limit';

export const loginLimiter = rateLimit({
  windowMs: 1 * 60 * 1000, // 1 minute window for development
  max: 30, // 30 attempts per minute in development
  standardHeaders: true,
  legacyHeaders: false,
  message: {
    success: false,
    message: 'Too many login attempts from this IP. Please try again after 1 minute.'
  }
});

export const otpLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes window
  max: 10, // Max 10 OTP requests per IP per 15 minutes
  standardHeaders: true,
  legacyHeaders: false,
  message: {
    success: false,
    message: 'Too many OTP requests from this IP. Please try again in 15 minutes.'
  }
});

