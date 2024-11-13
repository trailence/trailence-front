import { IonicButton } from '../../components/ionic/ion-button';
import { IonicInput } from '../../components/ionic/ion-input';
import { App } from '../app';
import { Page } from './page';
import { TrailsPage } from './trails-page';

export class LoginPage extends Page {

  private _loginInput: IonicInput;
  private _passwordInput: IonicInput;
  private _loginButton: IonicButton;

  constructor() {
    super('login');
    this._loginInput = new IonicInput(this, '[name=email]');
    this._passwordInput = new IonicInput(this, '[name=password]');
    this._loginButton = new IonicButton(this, '[type=submit]');
  }

  public get loginInput() { return this._loginInput; }
  public get passwordInput() { return this._passwordInput; }
  public get loginButton() { return this._loginButton; }

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
