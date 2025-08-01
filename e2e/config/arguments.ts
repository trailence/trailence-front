export type BrowserName = 'chrome' | 'firefox' | 'edge';
export type BrowserSize = 'desktop' | 'mobile';
export type NativePlatform = 'Android';

export interface TestArguments {
  trailenceUsername: string;
  trailencePassword: string;
  adminUsername?: string;
  adminPassword?: string;
  dbUsername: string;
  dbPassword: string;
  browser?: BrowserName;
  browserSize?: BrowserSize;
  nativePlatform?: NativePlatform;
  nativePlatformVersion?: string;
  nativeDevice?: string;
  specs: string[];
  excludeSpecs: string[];
  instance: number;
};

function check(value: string, allowed: string[]): string {
  if (allowed.indexOf(value) < 0) throw new Error('Invalid value <' + value + '> expected was one of ' + allowed);
  return value;
}

export function parseArguments(): TestArguments {
  console.log('Arguments: ' + JSON.stringify(process.argv));

  const result: TestArguments = {
    trailenceUsername: '',
    trailencePassword: '',
    dbUsername: '',
    dbPassword: '',
    specs: ['./test/specs/**/*.e2e.ts'],
    excludeSpecs: [],
    instance: 1,
  };

  for (const arg of process.argv) {
    if (arg.startsWith('--trailence-username='))
      result.trailenceUsername = arg.substring(21);
    else if (arg.startsWith('--trailence-password='))
      result.trailencePassword = arg.substring(21);
    else if (arg.startsWith('--trailence-admin-username='))
      result.adminUsername = arg.substring(27);
    else if (arg.startsWith('--trailence-admin-password='))
      result.adminPassword = arg.substring(27);
    else if (arg.startsWith('--db-username='))
      result.dbUsername = arg.substring(14);
    else if (arg.startsWith('--db-password='))
      result.dbPassword = arg.substring(14);
    else if (arg.startsWith('--browser='))
      result.browser = check(arg.substring(10), ['chrome', 'firefox', 'edge']) as BrowserName;
    else if (arg.startsWith('--browser-size='))
      result.browserSize = check(arg.substring(15), ['desktop', 'mobile']) as BrowserSize;
    else if (arg.startsWith('--native-platform='))
      result.nativePlatform = check(arg.substring(18), ['Android']) as NativePlatform;
    else if (arg.startsWith('--native-platform-version='))
      result.nativePlatformVersion = arg.substring(26);
    else if (arg.startsWith('--native-device='))
      result.nativeDevice = arg.substring(16);
    else if (arg.startsWith('--test-instance='))
      result.instance = parseInt(arg.substring(16));
    else if (arg.startsWith('--tests='))
      result.specs = arg.substring(8).trim().split(',').map(s => '../test/specs/' + s);
    else if (arg.startsWith('--exclude-tests='))
      result.excludeSpecs = arg.substring(16).trim().split(',').map(s => '../test/specs/' + s);
    else if (arg === '--demo')
      result.specs = ['../test/demo/demo.ts'];
  }

  return result;
}
