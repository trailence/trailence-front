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

  public static getActivePageElement() {
    return $('ion-app ion-router-outlet>.ion-page:not(.ion-page-hidden)');
  }

  public override getElement() {
    if (!this._displayedElement)
      this._displayedElement = $('ion-app ion-router-outlet>app-' + this._pageName + '.ion-page:not(.ion-page-hidden)');
    return this._displayedElement;
  }

}

export abstract class PageWithHeader extends Page {

  public get header() { return new HeaderComponent(this); }

}
