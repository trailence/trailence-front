import { LoginPage } from './pages/login-page';

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
    const popover = $('ion-app>ion-popover:not(.overlay-hidden)');
    await popover.waitForDisplayed();
    const viewport = await popover.$('>>>div.popover-viewport');
    await viewport.waitForExist();
    return viewport;
  }

  public static async waitModal() {
    const modal = $('ion-app>ion-modal:not(.overlay-hidden)');
    await modal.waitForDisplayed();
    const page = await modal.$('>>>div.ion-page');
    await page.waitForExist();
    return page;
  }

}

export interface AppConfig {
  initUsername: string;
  initUserpass: string;
}
