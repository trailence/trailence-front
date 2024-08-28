import type { CapacitorConfig } from '@capacitor/cli';

const config: CapacitorConfig = {
  appId: 'org.trailence',
  appName: 'Trailence',
  webDir: 'www',
  server: {
    hostname: 'trailence.org',
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
    includePlugins: [
      '@capacitor/app',
      '@capacitor/geolocation',
      '@capacitor/haptics',
      '@capacitor/keyboard',
      '@capacitor/network',
      '@capacitor/status-bar',
      '@capawesome/capacitor-file-picker'
    ]
  }
};

if (process.env['npm_config_env'] &&
  (process.env['npm_config_env'] === 'dev' ||
   process.env['npm_config_env'] === 'local')) {
  config.server!.androidScheme = 'http';
  config.server!.cleartext = true;
  config.server!.hostname = 'localhost';
}

export default config;
