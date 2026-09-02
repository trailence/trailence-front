import { AppMenu } from '../components/app-menu.component';
import { HeaderComponent, UserMenu } from '../components/header.component';
import { IonicAlert } from '../components/ionic/ion-alert';
import { LoginPage } from './pages/login-page';
import { Page } from './pages/page';
import { ChainablePromiseElement, WaitUntilOptions } from 'webdriverio';
import { TrailsPage, TrailsPageType } from './pages/trails-page';
import { TestUtils } from '../utils/test-utils';
import { HomePage } from './pages/home-page';
import { FilesUtils } from '../utils/files-utils';

export class App {

  public static config: AppConfig;

  private static _init = false;
  public static init() {
    if (App._init) return;
    App._init = true;
    const trailence = (browser.options as any)['trailence'];
    const instance = trailence.instance ?? '1';
    App.config = {
      username: trailence.username,
      password: trailence.password,
      adminUsername: trailence.adminUsername,
      adminPassword: trailence.adminPassword,
      mode: trailence.native ? 'native' : trailence.browserSize ?? 'desktop',
      instance: instance,
      downloadPath: './tmp-data/' + instance + '/downloads',
    };
    console.log('Trailence config', App.config);
    expect(App.config.username).toBeDefined();
    expect(App.config.password).toBeDefined();
    expect(App.config.username.length).toBeGreaterThan(0);
    expect(App.config.password.length).toBeGreaterThan(0);
    const timing: {name: string, start: number, end: number}[] = [];
    const start = Date.now();
    jasmine.getEnv().addReporter({
      specStarted: (result) => {
        console.log('Start spec: ' + result.fullName);
        timing.push({name: result.fullName, start: Date.now(), end: 0});
      },
      specDone: (result) => {
        console.log('Spec done: ' + result.fullName);
        if (timing.length > 0) {
          const last = timing[timing.length - 1];
          if (last.name === result.fullName)
            last.end = Date.now();
        } else {
          timing.push({name: result.fullName, start, end: Date.now()});
        }
        let promise: Promise<any> = Promise.resolve();
        if (result.status === 'failed') {
          console.log('Test error: take a screen shot');
          promise = promise
            .then(() => browser.saveScreenshot('./output/wdio_error_' + App.config.instance + '_' + result.id + '_' + Date.now() + '.png').then().catch(() => Promise.resolve()))
            .then(() => browser.getUrl()).catch(_ => Promise.resolve('error')).then(url => { console.log('Browser URL was: ' + url); return true; });
        }
        promise = promise.then(() => browser.execute(name => {
          const history = [...(window as any)['_consoleHistory'], ' *** End of ' + name + ' ***'];
          (window as any)['_consoleHistory'].push(' *** End of ' + name + ' ***');
          return history;
        }, result.fullName)
        .then(logs => {
          console.log(' **** Test: ' + result.fullName + ' -- Console output ****');
          const chunks: string[][] = [];
          let currentChunk: string[] = [];
          for (const log of logs) {
            currentChunk.push(log);
            if (currentChunk.length >= 30) {
              chunks.push(currentChunk);
              currentChunk = [];
            }
          }
          if (currentChunk.length > 0) chunks.push(currentChunk);
          for (const chunk of chunks)
            console.log(chunk);
          console.log('----- End of Console -----');
          return true;
        })
        .catch(e => {
          console.log('Cannot get console history', e);
          return Promise.resolve();
        }));

        if (result.status === 'failed') {
          console.log('Failed expectations:');
          for (const fail of result.failedExpectations) {
            console.log(' - Expected: ', fail.expected, ' Actual: ', fail.actual);
            console.log('   Message: ', fail.message);
            console.log('   Stack:');
            console.log(fail.stack);
          }
        }

        return promise;
      },
      suiteDone: (result) => {
        console.log('Suite done: ' + result.fullName);
        for (const t of timing) {
          let s = ' - ' + t.name + ': ';
          while (s.length < 100) s += ' ';
          s += (t.end - t.start) + ' ms.';
          console.log(s);
        }
      },
    });
  }

  public static async end() {
    console.log('Retrieving code coverage...');
    await browser.setTimeout({'script': 120000});
    // launch retrieval of workers coverage
    browser.execute(() => {
      const fct = (window as any).__workerCoverage;
      if (fct) fct(); else (window as any).__workerCoverageResult = [];
    });
    // main thread coverage
    const main =
      browser.execute(() => { (window as any).__coverage__str = JSON.stringify((window as any).__coverage__) ?? ''; })
      .then(() => this.retrieveAndWriteCoverage('main_thread', '__coverage__str'));
    // workers coverage
    const workers = TestUtils.retry(async () => {
      const nb: number = await browser.execute(() => (window as any).__workerCoverageResult !== undefined ? (window as any).__workerCoverageResult.length : -1);
      if (nb !== -1) return nb;
      throw new Error('Still waiting for coverage');
    }, 100, 1)
    .then(nbWorkers => {
      const promises = [];
      for (let i = 1; i <= nbWorkers; ++i)
        promises.push(this.retrieveAndWriteCoverage('worker_' + i, '__workerCoverageResult', i - 1));
      return Promise.all(promises);
    });
    await Promise.all([main, workers]);
  }

  private static async retrieveAndWriteCoverage(
    description: string,
    windowVariableName: string,
    variableIndex?: number,
  ) {
    const start = Date.now();
    await browser.execute((vName, vIndex, filename) => {
      let data = (window as any)[vName];
      if (vIndex !== undefined) data = data[vIndex];
      const blob = new Blob([data], { type: 'text/plain' });
      const url = URL.createObjectURL(blob);

      const a = document.createElement('a');
      a.href = url;
      a.download = filename;
      document.body.appendChild(a);
      a.click();

      // Cleanup
      a.remove();
      URL.revokeObjectURL(url);
    }, windowVariableName, variableIndex, description + '.txt');
    await FilesUtils.waitFileDownloaded(description + '.txt');
    console.log('Coverage for ' + description + ' retrieved in ' + (Date.now() - start) + ' ms.');
    const fs = await FilesUtils.fs()
    const name = 'cov_' + App.config.instance + '_' + description + '_' + Date.now() + '.json';
    fs.renameSync(App.config.downloadPath + '/' + description + '.txt', '../.nyc_output/' + name)
    console.log('Coverage file written: ' + name);
  }

  private static _started = false;
  public static async startMode(forceRefresh = false) {
    if (App._started && !forceRefresh) return;
    App._started = true;
    while ((await browser.getWindowHandles()).length > 1)
      await browser.closeWindow();
    switch (App.config.mode) {
      case 'mobile':
        await browser.setWindowSize(800, 800);
        await browser.setViewport({
          width: 350,
          height: 600
        });
        break;
      case 'desktop':
        await browser.setWindowSize(1600, 900);
        break;
      case 'native':
        // nothing
        break;
    }
  }

  public static async start(redirectUrl?: string) {
    await App.startMode();
    let url = browser.options.baseUrl! + '/en/login';
    if (redirectUrl) {
      url += '?returnUrl=' + encodeURIComponent(redirectUrl);
    }
    await browser.url(url);
    const loginPage = new LoginPage();
    await loginPage.waitDisplayed();
    await this.initBrowser();
    return loginPage;
  }

  public static async startLoginIfNeeded(): Promise<TrailsPage> {
    await App.startMode();
    await browser.url(browser.options.baseUrl! + '/en/login');
    await (await Page.getActivePageElement()).waitForExist();
    await this.initBrowser();
    return await TestUtils.retry(async () => {
      const url = await browser.getUrl();
      if (url.includes('/login')) {
        const loginPage = new LoginPage();
        try {
          if (await loginPage.getElement(true).$('>>>ion-spinner').isExisting()) {
            await loginPage.waitNotDisplayed(15000);
          } else {
            await loginPage.loginInput.setValue(App.config.username, false, false);
            await loginPage.passwordInput.setValue(App.config.password, false, false);
            await loginPage.loginButton.click({timeout: 1000});
          }
        } catch (_) {}
      } else if (url.includes('/trails/')) {
        const myTrails = new TrailsPage();
        await myTrails.waitDisplayed();
        if ((await myTrails.header.getTitle()) === 'My trails') return myTrails;
      }
      throw new Error('Cannot login or page is not My trails');
    }, 5, 1);
  }

  public static async startHome() {
    await App.startMode();
    await browser.url(browser.options.baseUrl!);
    const homePage = new HomePage();
    await homePage.waitDisplayed();
    await this.initBrowser();
    return homePage;
  }

  private static _initBrowser = false;
  private static async initBrowser() {
    if (App._initBrowser) return;
    App._initBrowser = true;
    await browser.execute(() => {
      const d = document.createElement('DIV');
      d.style.pointerEvents = 'none';
      d.style.position = 'fixed';
      d.style.background = 'rgba(255, 0, 0, 0.75)';
      d.style.top = '0px';
      d.style.left = '0px';
      d.style.width = '10px';
      d.style.height = '10px';
      d.style.zIndex = '10000';
      d.style.borderRadius = '10px';
      d.style.border = '2px solid black';
      d.id = 'test-mouse-cursor';
      document.body.appendChild(d);
      window.addEventListener('mousemove', e => {
        d.style.top = e.pageY + 'px';
        d.style.left = e.pageX + 'px';
      });
    });
  }

  public static async startLink(link: string) {
    await App.startMode();
    return await this.openLink(link);
  }

  public static async openLink(link: string) {
    const url = browser.options.baseUrl!;
    await browser.url(url + '/link/' + link);
    const trailsPage = new TrailsPage(TrailsPageType.SHARE);
    await trailsPage.waitDisplayed();
    return trailsPage;
  }

  public static async waitPopover(timeout?: number) {
    timeout = timeout ?? 30000;
    return await TestUtils.retry(async () => {
      const popover = this.getPopoverContainer();
      await popover.waitForDisplayed({timeout: 2000});
      const content = this.getPopoverContent(popover);
      await content.waitForExist({timeout: 2000});
      return content;
    }, Math.max(2, timeout / 2000), 100);
  }

  public static getPopoverContainer(): ChainablePromiseElement {
    return $('ion-app>ion-popover:not(.overlay-hidden)');
  }

  public static getPopoverContent(popoverContainer: ChainablePromiseElement): ChainablePromiseElement {
    return popoverContainer.$('>>>.popover-viewport');
  }

  public static async closePopover() {
    await TestUtils.retry(async () => {
      const pos = await this.getPopoverContent(this.getPopoverContainer()).getLocation();
      await browser.action('pointer').move({x: pos.x - 10, y: pos.y - 10, origin: 'viewport'}).pause(10).down().pause(50).up().perform();
      await this.waitNoPopover({timeout: 3000});
    }, 3, 500);
  }

  public static async waitNoPopover(opts?: WaitUntilOptions) {
    await browser.waitUntil(() => App.getPopoverContainer().isExisting().then(e => !e), opts);
  }

  public static async waitModal(options?: {
    byRootElementName?: string,
    byTitle?: string,
    timeout?: number,
  }): Promise<ChainablePromiseElement> {
    let page: ChainablePromiseElement | undefined = undefined;
    let getPage: (chain: ChainablePromiseElement) => Promise<ChainablePromiseElement | undefined>;
    let context = 'Waiting modal';
    getPage = async chain => {
      const result = chain.$('>>>.ion-page');
      await result.waitForDisplayed();
      return result;
    };
    if (options?.byRootElementName) {
      const elementName = options.byRootElementName;
      getPage = async chain => {
        const modalPage = chain.$('>>>' + elementName + '.ion-page');
        if (await modalPage.isExisting()) {
          await modalPage.waitForDisplayed();
          return modalPage;
        }
      };
      context += ' with root element ' + elementName;
    } else if (options?.byTitle) {
      const title = options.byTitle;
      getPage = async chain => {
        const titleElement = chain.$('>>>ion-header').$('>>>ion-title').$('>>>ion-label');
        if (!(await titleElement.isExisting())) return undefined;
        await titleElement.waitForDisplayed();
        const text = await titleElement.getText();
        if (text.trim() === title.trim()) return chain.$('>>>.ion-page');
      };
      context += ' with title: ' + title;
    }
    await browser.waitUntil(async () => {
      const modals = await browser.$$('ion-app>ion-modal:not(.overlay-hidden)').getElements();
      if (modals.length === 0) return false;
      for (const modal of modals) {
        const id = await modal.getAttribute('id');
        if (!id) continue;
        const chain = browser.$('ion-app>ion-modal#' + id);
        try {
          const result = await getPage(chain);
          if (result) {
            page = result;
            return true;
          }
        } catch (_) {}
      }
      return false;
    }, {timeout: options?.timeout});
    if (!page) throw new Error('Cannot find ' + context);
    return page;
  }

  public static async waitAlert(timeout?: number) {
    const alert = $('ion-app>ion-alert:not(.overlay-hidden)');
    await alert.waitForDisplayed({timeout});
    const content = alert.$('>>>.alert-wrapper');
    await content.waitForExist({timeout});
    return new IonicAlert(content);
  }

  public static async waitNoProgress(timeout?: number) {
    await browser.waitUntil(() => $('div.progress-container').$$('div').length.then(nb => nb === 0), { timeout });
  }

  public static async waitToastAndCloseIt() {
    const toast = $('ion-app>ion-toast');
    await browser.waitUntil(() => toast.isDisplayed());
    const button = toast.$('>>>button');
    await button.click();
    await browser.waitUntil(() => toast.isDisplayed().then(d => !d));
  }

  public static async openMenu() {
    const menu = $('app-root ion-menu').$('>>>app-menu').$('div.menu-content');
    if (await menu.isDisplayed()) {
      await browser.waitUntil(() => $('app-root ion-menu').$('>>>app-menu').getCSSProperty('width').then(w => w.value === '304px'));
      return new AppMenu($('app-root ion-menu').$('>>>app-menu'));
    }

    return await TestUtils.retry(async () => {
      const page = await Page.getActivePageElement();
      const header = new HeaderComponent(page);
      await header.waitDisplayed();
      return await header.openAppMenu();
    }, 2, 100);
  }

  public static async synchronize(andLogout: boolean = false, maxSyncTrials: number = 10) {
    const header = await TestUtils.retry(async () => {
      const page = await Page.getActivePageElement();
      const header = new HeaderComponent(page);
      await header.waitDisplayed(false, 5000);
      return header;
    }, 2, 100);
    const menu = await header.openUserMenu();
    const syncSuccess = await menu.synchronizeLocalChanges(maxSyncTrials);
    if (!syncSuccess) return;
    if (!andLogout) {
      await menu.close();
      return;
    }
    return await this.handleLogout(menu, false);
  }

  public static async logout(withDelete: boolean = false) {
    const page = await Page.getActivePageElement();
    const header = new HeaderComponent(page);
    await header.waitDisplayed();
    const userMenu = await header.openUserMenu();
    return await this.handleLogout(userMenu, withDelete);
  }

  private static async handleLogout(userMenu: UserMenu, withDelete: boolean) {
    const logoutPopup = await userMenu.clickLogout();
    expect(await logoutPopup.getTitle()).toBe('Sign out');
    if (withDelete)
      await logoutPopup.clickDelete();
    else
      await logoutPopup.clickKeepData();
    const loginPage = new LoginPage();
    await loginPage.waitDisplayed();
    return loginPage;
  }

}

export interface AppConfig {
  username: string;
  password: string;
  adminUsername?: string,
  adminPassword?: string,
  mode: string;
  instance: string;
  downloadPath: string;
}
