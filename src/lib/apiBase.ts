// Centralized API base URL for all fetch calls.
// On the web (Vercel), we use relative URLs (empty string).
// On Capacitor (APK), we need the full production URL since the app
// loads from capacitor://localhost and relative /api calls won't work.

import { Capacitor } from '@capacitor/core';

const PRODUCTION_API_URL = 'https://agtrustregistor.vercel.app';

/**
 * Returns the base URL prefix for all API calls.
 * - Web: '' (relative URLs work fine)
 * - Capacitor (APK): 'https://agtrustregistor.vercel.app'
 */
export function getApiBase(): string {
  if (Capacitor.isNativePlatform()) {
    return PRODUCTION_API_URL;
  }
  return '';
}

/**
 * Helper to build full API URL from a relative path like '/api/auth/login'
 */
export function apiUrl(path: string): string {
  return `${getApiBase()}${path}`;
}
