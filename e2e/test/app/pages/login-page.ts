import { IonicButton } from '../../components/ionic/ion-button';
import { IonicInput } from '../../components/ionic/ion-input';
import { App } from '../app';
import { Page } from './page';
import { TrailsPage } from './trails-page';

export class LoginPage extends Page {

  constructor() {
    super('login');
  }

  protected override expectedUrl(url: string): boolean {
    return url.indexOf('/login') > 0;
  }

  public get loginInput() { return new IonicInput(this, 'ion-input[name=email]'); }
  public get passwordInput() { return new IonicInput(this, 'ion-input[name=password]'); }
  public get loginButton() { return new IonicButton(this, 'ion-button[type=submit]'); }

  public get errorMessage() { return this.getElement().$('div ion-label[color=danger]'); }
  public get forgotPasswordButton() { return new IonicButton(this, 'ion-button[color=tertiary]'); }

  public async login(username?: string, password?: string) {
    await browser.waitUntil(() => this.loginInput.isDisplayed());
    await this.loginInput.setValue(username ?? App.config.initUsername);
    await this.passwordInput.setValue(password ?? App.config.initUserpass);
    await this.loginButton.click();
    await browser.waitUntil(() => this.notDisplayed());
  }

  public async loginAndWaitMyTrailsCollection(username?: string, password?: string) {
    await this.login(username, password);
    const trailsPage = new TrailsPage();
    await trailsPage.waitDisplayed();
    await App.waitNoProgress();
    return trailsPage;
  }

}
