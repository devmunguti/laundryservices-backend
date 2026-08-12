import { verifyAccessToken } from '../utils/generateToken.js';
import User from '../models/User.js';

export const authenticate = async (req, res, next) => {
  try {
    let token = null;

    // 1. Read token from HttpOnly cookie
    if (req.cookies && req.cookies.accessToken) {
      token = req.cookies.accessToken;
    } 
    // Fallback: Authorization Bearer header
    else if (req.headers.authorization && req.headers.authorization.startsWith('Bearer ')) {
      token = req.headers.authorization.split(' ')[1];
    }

    if (!token) {
      return res.status(401).json({
        success: false,
        authenticated: false,
        message: 'Access denied. Authentication token missing.'
      });
    }

    const decoded = verifyAccessToken(token);

    // Attach minimal authenticated user claims to req.user
    req.user = {
      id: decoded.sub,
      role: decoded.role,
      mustChangePassword: !!decoded.mustChangePassword
    };

    next();
  } catch (error) {
    return res.status(401).json({
      success: false,
      authenticated: false,
      message: 'Invalid or expired token.'
    });
  }
};

/**
 * Middleware that attaches user identity if token is present, but allows guest requests through
 */
export const optionalAuthenticate = async (req, res, next) => {
  try {
    let token = null;
    if (req.cookies && req.cookies.accessToken) {
      token = req.cookies.accessToken;
    } else if (req.headers.authorization && req.headers.authorization.startsWith('Bearer ')) {
      token = req.headers.authorization.split(' ')[1];
    }

    if (token) {
      const decoded = verifyAccessToken(token);
      req.user = {
        id: decoded.sub,
        role: decoded.role,
        mustChangePassword: !!decoded.mustChangePassword
      };
    }
  } catch (e) {
    // Ignore invalid tokens for optional auth
  }
  next();
};

