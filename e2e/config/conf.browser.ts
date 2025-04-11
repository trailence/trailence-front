import { TestArguments } from './arguments';

function chromeCaps(downloadPath: string, userDataPath: string, isCi: boolean) {
  return {
    browserName: 'chrome',
    'goog:chromeOptions': {
      args: [
        '--lang=en_US',
        '--disable-ipc-flooding-protection',
        '--disk-cache-size=1',
        '--aggressive-cache-discard',
        '--user-data-dir=' + userDataPath,
        ...(isCi ? [
          '--no-sandbox',
          '--disable-infobars',
          '--headless',
          '--disable-gpu',
          '--disable-background-networking',
          '--enable-features=NetworkService,NetworkServiceInProcess',
          '--disable-background-timer-throttling',
          '--disable-backgrounding-occluded-windows',
          '--disable-breakpad',
          '--disable-crash-reporter',
          '--disable-client-side-phishing-detection',
          '--disable-component-extensions-with-background-pages',
          '--disable-default-apps',
          '--disable-dev-shm-usage',
          '--disable-extensions',
          // BlinkGenPropertyTrees disabled due to crbug.com/937609
          '--disable-features=TranslateUI,BlinkGenPropertyTrees',
          '--disable-hang-monitor',
          '--disable-popup-blocking',
          '--disable-prompt-on-repost',
          '--disable-renderer-backgrounding',
          '--disable-sync',
          '--force-color-profile=srgb',
          '--metrics-recording-only',
          '--no-first-run',
          '--enable-automation',
          '--password-store=basic',
          '--use-mock-keychain',
        ] : [])
      ],
      prefs: {
        "download.default_directory": downloadPath,
      }
    },
    'goog:loggingPrefs': {
      browser: "ALL",
    }
  };
}

function firefoxCaps(downloadPath: string, userDataPath: string, isCi: boolean) {
  return {
    browserName: 'firefox',
    'moz:firefoxOptions': {
      args: [
        ...(isCi ? [
          '-headless'
        ] : [])
      ],
      "prefs": {
        "devtools.console.stdout.content": false,
        "browser.download.dir": downloadPath,
        "browser.download.folderList": 2,
        "browser.download.manager.showWhenStarting": false,
        "browser.helperApps.neverAsk.saveToDisk": "*/*",
        "permissions.default.geo": 1,
        'dom.events.asyncClipboard.readText': true,
        'dom.events.asyncClipboard.clipboardItem': true,
        'dom.events.testing.asyncClipboard': true,
      }
    },
    'moz:debuggerAddress': true,
  };
}

function edgeCaps(downloadPath: string, userDataPath: string, isCi: boolean) {
  const chrome = chromeCaps(downloadPath, userDataPath, isCi);
  return {
    browserName: 'msedge',
    'ms:edgeOptions': {
      args: chrome['goog:chromeOptions'].args,
      prefs: chrome['goog:chromeOptions'].prefs,
    }
  };
}

export function browserConfig(args: TestArguments, downloadPath: string, userDataPath: string, isCi: boolean) {
  return {
    baseUrl: isCi ? 'http://localhost:80' : 'http://localhost:8100',
    capabilities: [
      {
        ...(
          args.browser === 'chrome' ? chromeCaps(downloadPath, userDataPath, isCi) :
          args.browser === 'firefox' ? firefoxCaps(downloadPath, userDataPath, isCi) :
          edgeCaps(downloadPath, userDataPath, isCi)
        )
      }
    ],
  }
}
