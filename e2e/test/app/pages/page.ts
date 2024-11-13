import { HeaderComponent } from '../../components/header.component';
import { AppElement } from '../app-element';

export abstract class Page extends AppElement {

  protected _displayedElement?: ChainablePromiseElement;

  constructor(
    private readonly _pageName: string,
  ) {
    super();
  }

  public static async getActivePageElement() {
    return $('.ion-page:not(.ion-page-hidden)');
  }

  public override getElement() {
    if (!this._displayedElement)
      this._displayedElement = $('app-' + this._pageName + '.ion-page:not(.ion-page-hidden)');
    return this._displayedElement;
  }

}

export abstract class PageWithHeader extends Page {

  private _header: HeaderComponent;

  constructor(
    pageName: string,
  ) {
    super(pageName);
    this._header = new HeaderComponent(this);
  }

  public get header() { return this._header; }

}
