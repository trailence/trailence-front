import { IonicButton } from '../../components/ionic/ion-button';
import { IonicInput } from '../../components/ionic/ion-input';
import { App } from '../app';
import { Page } from './page';
import { TrailsPage } from './trails-page';

export class LoginPage extends Page {

  constructor() {
    super('login');
  }

  public get loginInput() { return new IonicInput(this, 'ion-input[name=email]'); }
  public get passwordInput() { return new IonicInput(this, 'ion-input[name=password]'); }
  public get loginButton() { return new IonicButton(this, 'ion-button[type=submit]'); }

  public async login(username?: string, password?: string) {
    browser.waitUntil(() => this.loginInput.isDisplayed());
    await this.loginInput.setValue(username ?? App.config.initUsername);
    await this.passwordInput.setValue(password ?? App.config.initUserpass);
    await this.loginButton.click();
    await browser.waitUntil(() => this.notDisplayed());
  }

  public async loginAndWaitMyTrailsCollection(username?: string, password?: string) {
    await this.login(username, password);
    await browser.waitUntil(() => browser.getUrl().then(url => url.startsWith(browser.options.baseUrl + '/trails/collection/')));
    const trailsPage = new TrailsPage();
    await trailsPage.waitDisplayed();
    return trailsPage;
  }

}
