import type { CapacitorConfig } from '@capacitor/cli';

const config: CapacitorConfig = {
  appId: 'org.trailence',
  appName: 'Trailence',
  webDir: 'www',
  server: {
    androidScheme: 'https',
    allowNavigation: []
  },
  plugins: {
    CapacitorHttp: {
      enabled: false
    }
  },
  android: {
    useLegacyBridge: true,
  }
};

if (process.env['npm_lifecycle_script'] && process.env['npm_lifecycle_script'].indexOf('android-dev') > 0) {
  config.server!.androidScheme = 'http';
  config.server!.cleartext = true;
}

export default config;
