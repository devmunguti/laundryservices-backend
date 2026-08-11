/**
 * Middleware to block providers who have mustChangePassword = true from accessing normal endpoints
 */
export const requirePasswordChangeCompleted = (req, res, next) => {
  if (req.user && req.user.role === 'provider' && req.user.mustChangePassword) {
    return res.status(403).json({
      success: false,
      code: 'PASSWORD_CHANGE_REQUIRED',
      requiresPasswordChange: true,
      message: 'You must change your password before accessing the dashboard.'
    });
  }
  next();
};
