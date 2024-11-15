import { AppMenu } from '../components/app-menu.component';
import { HeaderComponent } from '../components/header.component';
import { IonicAlert } from '../components/ionic/ion-alert';
import { LoginPage } from './pages/login-page';
import { Page } from './pages/page';
import { ChainablePromiseElement } from 'webdriverio';

export class App {

  public static config: AppConfig;

  public static init() {
    const trailence = (browser.options as any)['trailence'];
    App.config = {
      initUsername: trailence.initUsername,
      initUserpass: trailence.initUserpass
    };
    expect(App.config.initUsername).toBeDefined();
    expect(App.config.initUserpass).toBeDefined();
    expect(App.config.initUsername.length).toBeGreaterThan(0);
    expect(App.config.initUserpass.length).toBeGreaterThan(0);
    jasmine.getEnv().addReporter({
      specDone: (result => {
          if (result.status === 'failed') {
              return browser.saveScreenshot('wdio_error.png').then();
          }
      })
    });
  }

  public static async desktopMode() {
    return await browser.setWindowSize(1600, 900);
  }

  public static async start() {
    await browser.url(browser.options.baseUrl!);
    const loginPage = new LoginPage();
    await loginPage.waitDisplayed();
    return loginPage;
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
    return popoverContainer.$('>>>div.popover-viewport');
  }

  public static async waitModal() {
    const modal = $('ion-app>ion-modal:not(.overlay-hidden)');
    await modal.waitForDisplayed();
    const page = modal.$('>>>.ion-page');
    await page.waitForExist();
    return page;
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

    const page = Page.getActivePageElement();
    const header = new HeaderComponent(page);
    await header.waitDisplayed();
    return await header.openAppMenu();
  }

  public static async synchronize() {
    const page = Page.getActivePageElement();
    const header = new HeaderComponent(page);
    await header.waitDisplayed();
    const menu = await header.openUserMenu();
    await menu.synchronizeLocalChanges();
  }

  public static async logout(withDelete: boolean = false) {
    const page = Page.getActivePageElement();
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
}
