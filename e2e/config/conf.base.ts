import type { Options } from '@wdio/types';

export const baseConfig: Options.Testrunner = {
  runner: 'local',
  tsConfigPath: '../tsconfig.json',
  maxInstances: 1,
  logLevel: 'info',
  logLevels: {
    webdriver: 'info',
    webdriverio: 'error',
  },
  bail: 1,
  framework: 'jasmine',
  jasmineOpts: {
    // Jasmine default timeout
    defaultTimeoutInterval: 300000,
    random: false,
    //
    // The Jasmine framework allows interception of each assertion in order to log the state of the application
    // or website depending on the result. For example, it is pretty handy to take a screenshot every time
    // an assertion fails.
    //expectationResultHandler: function(passed, assertion) {
        // do something
    //},
    stopOnSpecFailure: true
  },
  reporters: [
    'spec'
  ],
  // Default timeout for all waitFor* commands.
  waitforTimeout: 30000,
  //
  // Default timeout in milliseconds for request
  // if browser driver or grid doesn't send response
  connectionRetryTimeout: 120000,
  //
  // Default request retries count
  connectionRetryCount: 3,

}
