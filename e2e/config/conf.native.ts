import { TestArguments } from './arguments';
import { join } from "node:path";

export function nativeConfig(args: TestArguments, downloadPath: string, userDataPath: string, isCi: boolean) {
  return {
    baseUrl: 'http://localhost',
    services: [
      [
          'appium',
          {
              // This will use the globally installed version of Appium
              // command: 'appium',
              args: {
                  // This is needed to tell Appium that we can execute local ADB commands
                  // and to automatically download the latest version of ChromeDriver
                  relaxedSecurity: true,
                  // Write the Appium logs to a file in the root of the directory
                  log: './output/appium_' + args.instance + '.log',
              },
          },
      ],
    ],
    before: async ()=> {
        // Only update the setting for Android, this is needed to reduce the timeout for the UiSelector locator strategy,
        // which is also used in certain tests, so it will not wait for 10 seconds if it can't find an element
        if (driver.isAndroid){
            await driver.updateSettings({
                // This reduces the timeout for the UiUiSelector from 10 seconds to 3 seconds
                waitForSelectorTimeout: 3 * 1000
            });
            await driver.switchContext('WEBVIEW');
        }
    },
    capabilities: [{
      // The defaults you need to have in your config
      platformName: args.nativePlatform,
      "wdio:maxInstances": 1,
      "appium:deviceName": args.nativeDevice,
      "appium:platformVersion": args.nativePlatformVersion,
      "appium:orientation": "PORTRAIT",
      "appium:automationName": "UiAutomator2",
      "appium:app": join(process.cwd(), "apk", "trailence.apk"),
      "appium:appWaitActivity": "org.trailence.MainActivity",
      "appium:newCommandTimeout": 240,
    }]
  };
}
