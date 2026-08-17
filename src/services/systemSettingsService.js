import SystemSetting from '../models/SystemSetting.js';

// Simple in-memory cache for settings
let cachedSettings = null;
let lastFetchTime = 0;
const CACHE_TTL = 30 * 1000; // 30 seconds cache

/**
 * Returns singleton SystemSetting document from DB (or default if non-existent)
 */
export const getOrInitSettings = async () => {
  const now = Date.now();
  if (cachedSettings && (now - lastFetchTime < CACHE_TTL)) {
    return cachedSettings;
  }

  let settings = await SystemSetting.findOne();
  if (!settings) {
    settings = await SystemSetting.create({});
  } else if (!settings.campusLocations) {
    settings.campusLocations = [];
    await settings.save();
  }

  cachedSettings = settings;
  lastFetchTime = now;
  return settings;
};

/**
 * Helper function to mask sensitive API keys for safe presentation to the frontend
 * e.g. "ck_7f8a9b0c1d2e3f4a5b6c7d8e9f0a1b2c3d4e5f6a" -> "ck_7f8a............e5f6a"
 */
export const maskKey = (key) => {
  if (!key || typeof key !== 'string') return '';
  if (key.length <= 10) return '**********';
  const first = key.substring(0, 7);
  const last = key.substring(key.length - 5);
  return `${first}${'*'.repeat(12)}${last}`;
};

/**
 * Invalidate in-memory cache when settings are saved
 */
export const invalidateSettingsCache = () => {
  cachedSettings = null;
  lastFetchTime = 0;
};
