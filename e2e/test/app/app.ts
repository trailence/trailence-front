import { AppMenu } from '../components/app-menu.component';
import { HeaderComponent } from '../components/header.component';
import { IonicAlert } from '../components/ionic/ion-alert';
import { LoginPage } from './pages/login-page';
import { Page } from './pages/page';
import { ChainablePromiseElement } from 'webdriverio';
import { TrailsPage } from './pages/trails-page';

export class App {

  public static config: AppConfig;

  public static init() {
    const trailence = (browser.options as any)['trailence'];
    App.config = {
      initUsername: trailence.initUsername,
      initUserpass: trailence.initUserpass,
      mode: trailence.mode ?? 'desktop'
    };
    expect(App.config.initUsername).toBeDefined();
    expect(App.config.initUserpass).toBeDefined();
    expect(App.config.initUsername.length).toBeGreaterThan(0);
    expect(App.config.initUserpass.length).toBeGreaterThan(0);
    jasmine.getEnv().addReporter({
      specDone: (result) => {
        return browser.getLogs('browser').then(logs => {
          logs = logs.map(log => (log as any)?.message).filter(msg => msg?.indexOf('[WDIO]') < 0);
          console.log(' **** Test: ' + result.fullName + ' -- Console output ****');
          console.log(logs);
        }).then(() => {
          if (result.status === 'failed') {
            return browser.saveScreenshot('wdio_error.png').then();
          }
        });
      },
      suiteDone: (result) => {
        console.log('Suite done: ' + result.fullName);
        const start = Date.now();
        return browser.execute(() => JSON.stringify((window as any).__coverage__))
        .then(coverage => {
          console.log('Coverage retrieved in ' + (Date.now() - start) + ' ms.');
          return import('fs')
          .then(fs => {
            const name = 'cov_' + result.id + '_' + Date.now() + '.json';
            console.log('Writing coverage to ' + name);
            fs.writeFileSync(
              '../.nyc_output/' + name,
              coverage
            );
            console.log('Coverage file written: ' + name);
          })
        });
      },
    });
  }

  private static async startMode() {
    switch (App.config.mode) {
      case 'mobile':
        await browser.setWindowSize(800, 800);
        await browser.setViewport({
          width: 300,
          height: 616
        })
        break;
      default:
        await browser.setWindowSize(1600, 900);
    }
  }

  public static async start() {
    await App.startMode();
    await browser.url(browser.options.baseUrl!);
    const loginPage = new LoginPage();
    await loginPage.waitDisplayed();
    return loginPage;
  }

  public static async startLink(link: string) {
    await App.startMode();
    const url = browser.options.baseUrl!;
    await browser.url(url + '/link/' + link);
    const trailsPage = new TrailsPage(true);
    await trailsPage.waitDisplayed();
    return trailsPage;
  }

  public static async waitPopover() {
    const popover = this.getPopoverContainer();
    await popover.waitForDisplayed();
    const content = this.getPopoverContent(popover);
    await content.waitForExist();
    return content;
  }

  public static getPopoverContainer(): ChainablePromiseElement {
    return $('ion-app>ion-popover:not(.overlay-hidden)');
  }

  public static getPopoverContent(popoverContainer: ChainablePromiseElement): ChainablePromiseElement {
    return popoverContainer.$('>>>.popover-viewport');
  }

  public static async waitModal(index?: number, byElementName?: string) {
    if (index === undefined && byElementName === undefined)
      index = 1;
    if (index !== undefined) {
      try { await browser.waitUntil(() => $$('ion-app>ion-modal:not(.overlay-hidden)').getElements().then(elements => elements.length >= index)); }
      catch (e) {
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

  public static async openMenu() {
    const menu = $('app-root ion-menu app-menu');
    if (await menu.isDisplayed()) {
      return new AppMenu(menu);
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
  initUsername: string;
  initUserpass: string;
  mode: string;
}
