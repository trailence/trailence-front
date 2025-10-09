import { AppMenu } from '../components/app-menu.component';
import { HeaderComponent, UserMenu } from '../components/header.component';
import { IonicAlert } from '../components/ionic/ion-alert';
import { LoginPage } from './pages/login-page';
import { Page } from './pages/page';
import { ChainablePromiseElement, WaitUntilOptions } from 'webdriverio';
import { TrailsPage, TrailsPageType } from './pages/trails-page';
import { TestUtils } from '../utils/test-utils';
import { HomePage } from './pages/home-page';

export class App {

  public static config: AppConfig;

  public static init() {
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
            .then(() => browser.getUrl()).catch(e => Promise.resolve('error')).then(url => { console.log('Browser URL was: ' + url); return true; });
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
    const start = Date.now();
    const step = 15000000;
    await browser.setTimeout({'script': 120000});
    const size = await browser.execute(() => {
      (window as any).__coverage__str = JSON.stringify((window as any).__coverage__) ?? '';
      return (window as any).__coverage__str.length;
    });
    let coverage = '';
    let pos = 0;
    do {
      const part = await browser.execute((pos, step) => (window as any).__coverage__str.substring(pos, pos + step), pos, step);
      coverage += part;
      pos += part.length;
    } while (pos < size);
    console.log('Coverage retrieved in ' + (Date.now() - start) + ' ms. with size = ' + coverage.length);
    const fs = await import('fs');
    const name = 'cov_' + App.config.instance + '_' + Date.now() + '.json';
    console.log('Writing coverage to ' + name);
    try {
      fs.writeFileSync(
        '../.nyc_output/' + name,
        coverage
      );
      console.log('Coverage file written: ' + name);
    } catch (e) {
      console.error('Error writing coverage file', e);
    }
  }

  private static async startMode() {
    switch (App.config.mode) {
      case 'mobile':
        await browser.setWindowSize(800, 800);
        await browser.setViewport({
          width: 350,
          height: 600
        })
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
    let url = browser.options.baseUrl! + '/login';
    if (redirectUrl) {
      url += '?returnUrl=' + encodeURIComponent(redirectUrl);
    }
    await browser.url(url);
    const loginPage = new LoginPage();
    await loginPage.waitDisplayed();
    await this.initBrowser();
    return loginPage;
  }

  public static async startHome() {
    await App.startMode();
    await browser.url(browser.options.baseUrl!);
    const homePage = new HomePage();
    await homePage.waitDisplayed();
    await this.initBrowser();
    return homePage;
  }

  private static async initBrowser() {
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

  public static async waitNoPopover(opts?: WaitUntilOptions) {
    await browser.waitUntil(() => App.getPopoverContainer().isExisting().then(e => !e), opts);
  }

  public static async waitModal(index?: number, byElementName?: string, timeout?: number) {
    if (index === undefined && byElementName === undefined)
      index = 1;
    if (index !== undefined) {
      try { await browser.waitUntil(() => $$('ion-app>ion-modal:not(.overlay-hidden)').getElements().then(elements => elements.length >= index), {timeout}); }
      catch (e) {
        if (timeout) throw e;
        expect((await $$('ion-app>ion-modal:not(.overlay-hidden)').getElements()).length).toBeGreaterThanOrEqual(index);
      }
      const modal = $$('ion-app>ion-modal:not(.overlay-hidden)')[index - 1];
      await modal.waitForDisplayed();
      const page = modal.$('>>>.ion-page');
      await page.waitForExist();
      return page;
    }
    if (byElementName !== undefined) {
      let page: ChainablePromiseElement | undefined = undefined;
      await browser.waitUntil(async () => {
        let i = 0;
        for (const modal of await browser.$$('ion-app>ion-modal:not(.overlay-hidden)').getElements()) {
          const modalPage = modal.$('>>>' + byElementName + '.ion-page');
          if (await modalPage.isExisting()) {
            page = browser.$$('ion-app>ion-modal:not(.overlay-hidden)')[i].$('>>>' + byElementName + '.ion-page');
            return true;
          }
          i++;
        }
        return false;
      });
      expect(page).withContext('Modal with element ' + byElementName).toBeDefined();
      return page!;
    }
    throw new Error('Unexepcted');
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

    const page = await Page.getActivePageElement();
    const header = new HeaderComponent(page);
    await header.waitDisplayed();
    return await header.openAppMenu();
  }

  public static async synchronize(andLogout: boolean = false) {
    const header = await TestUtils.retry(async () => {
      const page = await Page.getActivePageElement();
      const header = new HeaderComponent(page);
      await header.waitDisplayed(false, 5000);
      return header;
    }, 2, 100);
    const menu = await header.openUserMenu();
    await menu.synchronizeLocalChanges();
    if (!andLogout) {
      await menu.close();
      return;
    }
    await this.handleLogout(menu, false);
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
