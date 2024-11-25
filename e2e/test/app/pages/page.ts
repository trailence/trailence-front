import { HeaderComponent } from '../../components/header.component';
import { AppElement } from '../app-element';
import { ChainablePromiseElement } from 'webdriverio';

export abstract class Page extends AppElement {

  protected _displayedElement?: ChainablePromiseElement;

  constructor(
    private readonly _pageName: string,
  ) {
    super();
  }

  protected abstract expectedUrl(url: string): boolean;

  public static async getActivePageElement() {
    const app = $('ion-app');
    await browser.waitUntil(async () => {
      const nb = await app.$$('>>>ion-router-outlet>.ion-page:not(.ion-page-hidden)').length;
      return nb === 1;
    });
    return app.$('>>>ion-router-outlet>.ion-page:not(.ion-page-hidden)');
  }

  public override _getElement(resetGetElement: boolean) {
    if (!this._displayedElement || resetGetElement)
      this._displayedElement = $('ion-app').$('>>>ion-router-outlet>app-' + this._pageName + '.ion-page:not(.ion-page-hidden)');
    return this._displayedElement;
  }

  public async waitDisplayed() {
    await browser.waitUntil(() => browser.getUrl().then(url => this.expectedUrl(url)));
    await super.waitDisplayed(true);
  }

}

export abstract class PageWithHeader extends Page {

  public get header() { return new HeaderComponent(this); }

  public override async waitDisplayed() {
    await super.waitDisplayed();
    await browser.waitUntil(() => new HeaderComponent(this.getElement(true)).getElement(true).isDisplayed());
  }

}
