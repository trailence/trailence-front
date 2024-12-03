export interface AppDownload {
  icon: string;
  i18nText: string;
  badge?: string;
  launch: () => void;
}

export const APK_PATH = '/assets/apk/trailence.apk';
