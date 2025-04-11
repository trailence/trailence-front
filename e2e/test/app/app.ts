import { AppMenu } from '../components/app-menu.component';
import { HeaderComponent } from '../components/header.component';
import { IonicAlert } from '../components/ionic/ion-alert';
import { LoginPage } from './pages/login-page';
import { Page } from './pages/page';
import { ChainablePromiseElement, WaitUntilOptions } from 'webdriverio';
import { TrailsPage, TrailsPageType } from './pages/trails-page';

export class App {

  public static config: AppConfig;

  public static init() {
    const trailence = (browser.options as any)['trailence'];
    const instance = trailence.instance ?? '1';
    App.config = {
      username: trailence.username,
      password: trailence.password,
      mode: trailence.browserSize ?? 'desktop',
      instance: instance,
      downloadPath: './tmp-data/' + instance + '/downloads',
    };
    expect(App.config.username).toBeDefined();
    expect(App.config.password).toBeDefined();
    expect(App.config.username.length).toBeGreaterThan(0);
    expect(App.config.password.length).toBeGreaterThan(0);
    jasmine.getEnv().addReporter({
      specDone: (result) => {
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
        console.log('Retrieving coverage');
        const start = Date.now();
        const step = 10000000;
        const finalStep = (coverage: string) => {
          console.log('Coverage retrieved in ' + (Date.now() - start) + ' ms. with size = ' + coverage.length);
          return import('fs')
          .then(fs => {
            const name = 'cov_' + App.config.instance + '_' + result.id + '_' + Date.now() + '.json';
            console.log('Writing coverage to ' + name);
            fs.writeFileSync(
              '../.nyc_output/' + name,
              coverage
            );
            console.log('Coverage file written: ' + name);
            return '';
          });
        };
        const nextStep = (previous: string, newValue?: string): Promise<string> => {
          console.log('Coverage retrieved: ' + newValue?.length);
          const result = previous + (newValue ?? '');
          if (!newValue || newValue.length < step) return finalStep(result);
          const pos = result.length;
          return browser.execute((pos, step) => (window as any).__coverage__str.substring(pos, pos + step), pos, step).then(n => nextStep(result, n));
        };
        return browser.setTimeout({'script': 120000})
        .then(() => browser.execute(() => (window as any).__coverage__str = JSON.stringify((window as any).__coverage__) ?? ''))
        .then(() => browser.execute((step) => (window as any).__coverage__str.substring(0, step), step))
        .then(part => nextStep('', part))
        .then(() => {})
        .catch(e => {
          console.log('Error retrieving coverage', e);
        });
      },
    });
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
      default:
        await browser.setWindowSize(1600, 900);
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
      document.body.appendChild(d);
      window.addEventListener('mousemove', e => {
        d.style.top = e.pageY + 'px';
        d.style.left = e.pageX + 'px';
      });
    });
    return loginPage;
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
    const popover = this.getPopoverContainer();
    await popover.waitForDisplayed({timeout});
    const content = this.getPopoverContent(popover);
    await content.waitForExist({timeout});
    return content;
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

  public static async waitAlert() {
    const alert = $('ion-app>ion-alert:not(.overlay-hidden)');
    await alert.waitForDisplayed();
    const content = alert.$('>>>.alert-wrapper');
    await content.waitForExist();
    return new IonicAlert(content);
  }

  public static async waitNoProgress(timeout?: number) {
    await browser.waitUntil(() => $('div.progress-container').$$('div').length.then(nb => nb === 0), { timeout });
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

  public static async synchronize() {
    const page = await Page.getActivePageElement();
    const header = new HeaderComponent(page);
    await header.waitDisplayed();
    const menu = await header.openUserMenu();
    await menu.synchronizeLocalChanges();
    await menu.close();
  }

  public static async logout(withDelete: boolean = false) {
    const page = await Page.getActivePageElement();
    const header = new HeaderComponent(page);
    await header.waitDisplayed();
    const userMenu = await header.openUserMenu();
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
  mode: string;
  instance: string;
  downloadPath: string;
}
