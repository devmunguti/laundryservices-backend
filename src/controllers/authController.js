import User from '../models/User.js';
import { generateAccessToken } from '../utils/generateToken.js';
import { createAuditLog } from '../services/auditLogService.js';

// Password Strength Validator (min 8 chars, 1 uppercase, 1 lowercase, 1 number, 1 special char)
const validatePasswordStrength = (password) => {
  const minLength = 8;
  const hasUpper = /[A-Z]/.test(password);
  const hasLower = /[a-z]/.test(password);
  const hasNumber = /[0-9]/.test(password);
  const hasSpecial = /[^A-Za-z0-9]/.test(password);

  if (password.length < minLength) {
    return 'Password must be at least 8 characters long.';
  }
  if (!hasUpper) {
    return 'Password must contain at least 1 uppercase letter.';
  }
  if (!hasLower) {
    return 'Password must contain at least 1 lowercase letter.';
  }
  if (!hasNumber) {
    return 'Password must contain at least 1 number.';
  }
  if (!hasSpecial) {
    return 'Password must contain at least 1 special character.';
  }
  return null;
};

// Cookie Options Helper
const getCookieOptions = () => ({
  httpOnly: true,
  secure: process.env.NODE_ENV === 'production',
  sameSite: 'lax',
  maxAge: 15 * 60 * 1000 // 15 minutes
});

export const register = async (req, res, next) => {
  try {
    const { firstName, lastName, name, email, password, phone, role = 'user' } = req.body;

    // 1. Validation
    if (!email || !password) {
      return res.status(400).json({
        success: false,
        message: 'Email and password are required.'
      });
    }

    const passwordError = validatePasswordStrength(password);
    if (passwordError) {
      return res.status(400).json({
        success: false,
        message: passwordError
      });
    }

    // 2. Normalize email
    const normalizedEmail = email.toLowerCase().trim();

    // 3. Check existing user
    const existingUser = await User.findOne({ email: normalizedEmail });
    if (existingUser) {
      return res.status(409).json({
        success: false,
        message: 'An account with this email address already exists.'
      });
    }

    // Derive names
    let fName = firstName;
    let lName = lastName;

    if (!fName && name) {
      const parts = name.trim().split(' ');
      fName = parts[0];
      lName = parts.slice(1).join(' ') || '';
    }

    // 4. Create User in MongoDB
    const newUser = await User.create({
      firstName: fName || 'User',
      lastName: lName || '',
      fullName: name || `${fName || ''} ${lName || ''}`.trim(),
      email: normalizedEmail,
      phone: phone || '',
      passwordHash: password,
      role: ['user', 'customer', 'driver', 'provider', 'admin'].includes(role) ? role : 'user',
      isActive: true,
      isEmailVerified: false
    });

    // Audit log: Registration
    await createAuditLog({
      req,
      user: newUser,
      action: 'User Registered',
      details: `New ${newUser.role} account created for ${newUser.email}`,
      status: 'Success',
      category: 'Authentication'
    });

    // 5. Generate token and set HttpOnly Cookie
    const token = generateAccessToken(newUser);
    res.cookie('accessToken', token, getCookieOptions());

    // 6. Return safe user payload (never return password)
    return res.status(201).json({
      success: true,
      message: 'Account created successfully',
      user: {
        id: newUser._id,
        firstName: newUser.firstName,
        lastName: newUser.lastName,
        fullName: newUser.fullName,
        email: newUser.email,
        role: newUser.role,
        isActive: newUser.isActive,
        isEmailVerified: newUser.isEmailVerified
      }
    });
  } catch (error) {
    next(error);
  }
};

export const login = async (req, res, next) => {
  try {
    const { email, password } = req.body;

    if (!email || !password) {
      return res.status(400).json({
        success: false,
        message: 'Please provide email and password.'
      });
    }

    const normalizedEmail = email.toLowerCase().trim();

    // Find user (explicitly include passwordHash for checking)
    const user = await User.findOne({ email: normalizedEmail }).select('+passwordHash');
    if (!user) {
      // Audit log: Failed Login (user not found)
      await createAuditLog({
        req,
        user: null,
        action: 'Failed Login',
        details: `Invalid email or password for ${normalizedEmail}`,
        status: 'Failed',
        category: 'Authentication'
      });

      return res.status(401).json({
        success: false,
        message: 'Invalid email or password.'
      });
    }

    if (!user.isActive || user.status === 'Suspended' || user.status === 'Rejected') {
      await createAuditLog({
        req,
        user,
        action: 'Failed Login',
        details: `Attempted login on disabled/suspended account (${normalizedEmail})`,
        status: 'Failed',
        category: 'Authentication'
      });

      return res.status(403).json({
        success: false,
        message: user.status === 'Suspended' 
          ? 'Account has been suspended. Please contact support.' 
          : 'Account has been disabled. Please contact support.'
      });
    }

    const isMatch = await user.comparePassword(password);
    if (!isMatch) {
      // Audit log: Failed Login (wrong password)
      await createAuditLog({
        req,
        user,
        action: 'Failed Login',
        details: `Invalid password for ${normalizedEmail}`,
        status: 'Failed',
        category: 'Authentication'
      });

      return res.status(401).json({
        success: false,
        message: 'Invalid email or password.'
      });
    }

    // Update lastLogin
    user.lastLogin = new Date();
    await user.save();

    // Audit log: Successful Login
    await createAuditLog({
      req,
      user,
      action: 'Login',
      details: 'User logged in successfully',
      status: 'Success',
      category: 'Authentication'
    });

    // Generate JWT & set HttpOnly Cookie
    const token = generateAccessToken(user);
    res.cookie('accessToken', token, getCookieOptions());

    return res.status(200).json({
      success: true,
      message: user.mustChangePassword ? 'Password change required before accessing portal.' : 'Logged in successfully',
      requiresPasswordChange: !!user.mustChangePassword,
      user: {
        id: user._id,
        firstName: user.firstName,
        lastName: user.lastName,
        fullName: user.fullName,
        email: user.email,
        role: user.role,
        isActive: user.isActive,
        isEmailVerified: user.isEmailVerified,
        mustChangePassword: !!user.mustChangePassword,
        lastLogin: user.lastLogin
      }
    });
  } catch (error) {
    next(error);
  }
};

export const changeInitialPassword = async (req, res, next) => {
  try {
    const { newPassword } = req.body;
    if (!newPassword) {
      return res.status(400).json({ success: false, message: 'New password is required.' });
    }

    const passwordError = validatePasswordStrength(newPassword);
    if (passwordError) {
      return res.status(400).json({ success: false, message: passwordError });
    }

    const user = await User.findById(req.user.id).select('+passwordHash');
    if (!user) {
      return res.status(404).json({ success: false, message: 'User account not found.' });
    }

    user.passwordHash = newPassword;
    user.mustChangePassword = false;
    user.passwordChangedAt = new Date();
    await user.save();

    // Re-issue clean JWT token without mustChangePassword flag
    const newAccessToken = generateAccessToken(user);
    res.cookie('accessToken', newAccessToken, getCookieOptions());

    await createAuditLog({
      req,
      user,
      action: 'Provider Password Changed',
      details: `User ${user.email} updated initial temporary password to permanent password.`,
      status: 'Success',
      category: 'Authentication'
    });

    return res.status(200).json({
      success: true,
      message: 'Password changed successfully. You can now access your dashboard.',
      requiresPasswordChange: false,
      user: {
        id: user._id,
        firstName: user.firstName,
        lastName: user.lastName,
        fullName: user.fullName,
        email: user.email,
        role: user.role,
        isActive: user.isActive,
        mustChangePassword: false
      }
    });
  } catch (error) {
    next(error);
  }
};

export const resetProviderPassword = async (req, res, next) => {
  try {
    const { id } = req.params;
    const { temporaryPassword } = req.body;

    if (!temporaryPassword) {
      return res.status(400).json({ success: false, message: 'Temporary password is required.' });
    }

    const passwordError = validatePasswordStrength(temporaryPassword);
    if (passwordError) {
      return res.status(400).json({ success: false, message: passwordError });
    }

    const provider = await User.findOne({ _id: id, role: 'provider' }).select('+passwordHash');
    if (!provider) {
      return res.status(404).json({ success: false, message: 'Cleaner / Provider account not found.' });
    }

    provider.passwordHash = temporaryPassword;
    provider.mustChangePassword = true;
    await provider.save();

    await createAuditLog({
      req,
      user: req.user,
      action: 'Provider Password Reset',
      details: `Admin reset password for provider '${provider.fullName}' (${provider.email}).`,
      status: 'Success',
      category: 'Authentication',
      metadata: { providerId: provider._id }
    });

    return res.status(200).json({
      success: true,
      message: `Password reset successfully for ${provider.fullName}. They must change it on next login.`
    });
  } catch (error) {
    next(error);
  }
};

export const getCurrentUser = async (req, res, next) => {
  try {
    const user = await User.findById(req.user.id);
    if (!user || !user.isActive) {
      return res.status(200).json({
        success: false,
        authenticated: false,
        user: null
      });
    }

    return res.status(200).json({
      success: true,
      authenticated: true,
      user: {
        id: user._id,
        firstName: user.firstName,
        lastName: user.lastName,
        fullName: user.fullName,
        email: user.email,
        role: user.role,
        isActive: user.isActive,
        isEmailVerified: user.isEmailVerified,
        lastLogin: user.lastLogin
      }
    });
  } catch (error) {
    return res.status(200).json({
      success: false,
      authenticated: false,
      user: null
    });
  }
};

export const logout = async (req, res) => {
  if (req.user) {
    await createAuditLog({
      req,
      user: req.user,
      action: 'Logout',
      details: 'User logged out successfully',
      status: 'Success',
      category: 'Authentication'
    });
  }

  res.clearCookie('accessToken', {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'lax'
  });

  return res.status(200).json({
    success: true,
    message: 'Logged out successfully'
  });
};

export const getProfile = async (req, res, next) => {
  try {
    const user = await User.findById(req.user.id);
    if (!user) {
      return res.status(404).json({ success: false, message: 'User profile not found.' });
    }

    res.status(200).json({ success: true, user });
  } catch (error) {
    next(error);
  }
};

export const getProviders = async (req, res, next) => {
  try {
    const page = parseInt(req.query.page, 10) || 1;
    const limit = parseInt(req.query.limit, 10) || 20;
    const skip = (page - 1) * limit;

    const { search, status } = req.query;

    const query = { role: 'provider' };

    if (status && status !== 'All') {
      query.status = status;
    }

    if (search && search.trim() !== '') {
      const searchRegex = new RegExp(search.trim(), 'i');
      query.$or = [
        { fullName: searchRegex },
        { firstName: searchRegex },
        { lastName: searchRegex },
        { email: searchRegex },
        { 'providerDetails.businessName': searchRegex },
        { 'addresses.street': searchRegex },
        { 'addresses.city': searchRegex }
      ];
    }

    const [providers, total] = await Promise.all([
      User.find(query)
        .select('-passwordHash')
        .sort({ createdAt: -1 })
        .skip(skip)
        .limit(limit)
        .lean(),
      User.countDocuments(query)
    ]);

    const totalPages = Math.ceil(total / limit) || 1;

    res.status(200).json({
      success: true,
      count: providers.length,
      data: {
        providers,
        pagination: {
          page,
          limit,
          total,
          totalPages,
          hasNextPage: page < totalPages,
          hasPreviousPage: page > 1
        }
      }
    });
  } catch (error) {
    next(error);
  }
};

export const getProviderStats = async (req, res, next) => {
  try {
    const [total, active, pending, suspended, rejected] = await Promise.all([
      User.countDocuments({ role: 'provider' }),
      User.countDocuments({ role: 'provider', status: 'Active' }),
      User.countDocuments({ role: 'provider', status: 'Pending' }),
      User.countDocuments({ role: 'provider', status: 'Suspended' }),
      User.countDocuments({ role: 'provider', status: 'Rejected' })
    ]);

    res.status(200).json({
      success: true,
      data: {
        total,
        active,
        pending,
        suspended,
        rejected
      }
    });
  } catch (error) {
    next(error);
  }
};

export const getProviderById = async (req, res, next) => {
  try {
    const { id } = req.params;
    const provider = await User.findOne({ _id: id, role: 'provider' }).select('-passwordHash');
    if (!provider) {
      return res.status(404).json({ success: false, message: 'Provider not found' });
    }
    res.status(200).json({ success: true, data: provider });
  } catch (error) {
    next(error);
  }
};

export const createProvider = async (req, res, next) => {
  try {
    const { name, owner, location, email, phone, status = 'Pending' } = req.body;

    const providerEmail = email || `provider_${Date.now()}@laundry.com`;
    const normalizedEmail = providerEmail.toLowerCase().trim();

    // Check duplicate
    const existing = await User.findOne({ email: normalizedEmail });
    if (existing) {
      return res.status(409).json({
        success: false,
        message: 'A provider/user account with this email address already exists.'
      });
    }

    const businessName = name || 'Laundry Provider';
    const ownerName = owner || 'Provider Owner';
    const nameParts = ownerName.split(' ');

    const temporaryPassword = req.body.temporaryPassword || 'Password@123';
    const passwordError = validatePasswordStrength(temporaryPassword);
    if (passwordError) {
      return res.status(400).json({ success: false, message: passwordError });
    }

    const newProvider = await User.create({
      firstName: nameParts[0] || 'Provider',
      lastName: nameParts.slice(1).join(' ') || 'Owner',
      fullName: ownerName,
      email: normalizedEmail,
      phone: phone || '+254700000000',
      passwordHash: temporaryPassword,
      role: 'provider',
      status: ['Pending', 'Active', 'Suspended'].includes(status) ? status : 'Pending',
      mustChangePassword: true,
      addresses: [{ street: location || 'Nairobi', city: 'Nairobi' }],
      providerDetails: {
        businessName,
        commissionRate: 15,
        isApproved: status === 'Active',
        rating: 5.0
      }
    });

    await createAuditLog({
      req,
      user: req.user,
      action: 'Cleaner Created',
      details: `Created cleaner record '${businessName}' (${ownerName}).`,
      status: 'Success',
      category: 'Provider'
    });

    res.status(201).json({ success: true, data: newProvider, message: 'Provider registered successfully' });
  } catch (error) {
    next(error);
  }
};

export const updateProvider = async (req, res, next) => {
  try {
    const { id } = req.params;
    const { name, owner, location, phone } = req.body;

    const provider = await User.findOne({ _id: id, role: 'provider' });
    if (!provider) {
      return res.status(404).json({ success: false, message: 'Provider not found' });
    }

    if (owner) {
      const nameParts = owner.split(' ');
      provider.firstName = nameParts[0] || provider.firstName;
      provider.lastName = nameParts.slice(1).join(' ') || provider.lastName;
      provider.fullName = owner;
    }

    if (name) {
      if (!provider.providerDetails) provider.providerDetails = {};
      provider.providerDetails.businessName = name;
    }

    if (phone) provider.phone = phone;

    if (location) {
      provider.addresses = [{ street: location, city: 'Nairobi' }];
    }

    await provider.save();

    await createAuditLog({
      req,
      user: req.user,
      action: 'Cleaner Updated',
      details: `Updated provider details for '${provider.fullName}'.`,
      status: 'Success',
      category: 'Provider'
    });

    res.status(200).json({ success: true, data: provider, message: 'Provider details updated successfully' });
  } catch (error) {
    next(error);
  }
};

export const updateProviderStatus = async (req, res, next) => {
  try {
    const { id } = req.params;
    const { status } = req.body;

    if (!['Active', 'Pending', 'Suspended', 'Rejected'].includes(status)) {
      return res.status(400).json({ success: false, message: 'Invalid provider status specified.' });
    }

    const provider = await User.findOneAndUpdate(
      { _id: id, role: 'provider' },
      { status, 'providerDetails.isApproved': status === 'Active' },
      { new: true }
    );

    if (!provider) {
      return res.status(404).json({ success: false, message: 'Provider not found' });
    }

    const auditActionMap = {
      Active: 'Cleaner Approved',
      Suspended: 'Cleaner Suspended',
      Rejected: 'Cleaner Rejected',
      Pending: 'Cleaner Status Set to Pending'
    };

    await createAuditLog({
      req,
      user: req.user,
      action: auditActionMap[status] || 'Provider Status Updated',
      details: `Updated provider '${provider.fullName}' status to ${status}.`,
      status: 'Success',
      category: 'Provider'
    });

    res.status(200).json({ success: true, data: provider, message: `Provider status updated to ${status}` });
  } catch (error) {
    next(error);
  }
};

export const deleteProvider = async (req, res, next) => {
  try {
    const { id } = req.params;
    const provider = await User.findOneAndDelete({ _id: id, role: 'provider' });
    if (!provider) {
      return res.status(404).json({ success: false, message: 'Provider not found' });
    }

    await createAuditLog({
      req,
      user: req.user,
      action: 'Provider Deleted',
      details: `Deleted provider '${provider.fullName}' (${provider.email}).`,
      status: 'Success',
      category: 'Provider'
    });

    res.status(200).json({ success: true, message: 'Provider deleted successfully' });
  } catch (error) {
    next(error);
  }
};
