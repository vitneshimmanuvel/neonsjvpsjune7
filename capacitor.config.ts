import type { CapacitorConfig } from '@capacitor/cli';

const config: CapacitorConfig = {
  appId: 'com.agtrust.recordbook',
  appName: 'AG Trust Record Book',
  webDir: 'dist',
  server: {
    // Allow the APK to make network requests to the Vercel API backend
    allowNavigation: ['agtrustregistor.vercel.app'],
  },
};

export default config;

