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
