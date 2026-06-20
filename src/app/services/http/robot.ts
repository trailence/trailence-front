const BOT_UA_REGEX: RegExp = /(bot|crawler|spider|slurp|facebookexternalhit|bingpreview|googlebot|adsbot|duckduckbot|baiduspider|yandex|curl\/|wget|httpclient|go-http-client|okhttp|python|aiohttp|httpx|axios|java\/|libwww|l9explore|masscan|scanner|securityscanner|playstore-google|googleassociationservice|google-adstxt|tlm-audit-scanner)/i;

let detected: boolean | undefined = undefined;

export function isRobot(): boolean {
  detected ??= BOT_UA_REGEX.test(navigator.userAgent.toLowerCase());
  return detected;
}
