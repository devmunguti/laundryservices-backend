/**
 * Normalizes phone numbers to standard E.164 format.
 * Accurately parses Kenyan numbers (07..., 01..., 254..., +254...) and international numbers.
 * 
 * @param {string} phone - Raw input phone number
 * @param {string} [defaultCountryCode='254'] - Default country code without plus
 * @returns {string|null} - E.164 formatted number e.g. "+254712345678", or null if invalid
 */
export const normalizePhoneNumber = (phone, defaultCountryCode = '254') => {
  if (!phone || typeof phone !== 'string') return null;

  // Remove spaces, dashes, parentheses, dots
  let cleaned = phone.replace(/[\s\-\(\)\.]/g, '').trim();

  if (!cleaned) return null;

  // Handle leading '+'
  if (cleaned.startsWith('+')) {
    const digits = cleaned.slice(1);
    if (/^\d{8,15}$/.test(digits)) {
      return `+${digits}`;
    }
    return null;
  }

  // Handle Kenyan 07... and 01... numbers
  if (/^0[17]\d{8}$/.test(cleaned)) {
    return `+${defaultCountryCode}${cleaned.slice(1)}`;
  }

  // Handle Kenyan local numbers without leading 0 (9 digits starting with 7 or 1)
  if (/^[17]\d{8}$/.test(cleaned)) {
    return `+${defaultCountryCode}${cleaned}`;
  }

  // Handle Kenyan numbers already starting with 254
  if (/^254[17]\d{8}$/.test(cleaned)) {
    return `+${cleaned}`;
  }

  // Generic international digits without leading '+'
  if (/^\d{9,15}$/.test(cleaned)) {
    return `+${cleaned}`;
  }

  return null;
};

/**
 * Validates whether a phone number matches valid E.164 formatting.
 */
export const isValidPhoneNumber = (phone) => {
  const normalized = normalizePhoneNumber(phone);
  return Boolean(normalized && /^\+[1-9]\d{7,14}$/.test(normalized));
};

/**
 * Masks a phone number for safe logging (e.g. +2547******12).
 */
export const maskPhoneNumber = (phone) => {
  if (!phone || typeof phone !== 'string') return 'N/A';
  const clean = phone.trim();
  if (clean.length <= 6) return '******';
  const start = clean.slice(0, 5);
  const end = clean.slice(-2);
  return `${start}******${end}`;
};

export default {
  normalizePhoneNumber,
  isValidPhoneNumber,
  maskPhoneNumber
};
