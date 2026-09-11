import { AppElement } from '../app/app-element';
import { ChainablePromiseElement } from 'webdriverio';

export abstract class Component extends AppElement {

  private _element?: ChainablePromiseElement;

  constructor(
    private readonly _parent: AppElement | ChainablePromiseElement | (() => ChainablePromiseElement),
    private readonly _selector?: string,
  ) {
    super();
  }

  public override _getElement(resetGetElement: boolean): ChainablePromiseElement {
    if (!this._element || resetGetElement) {
      const parentElement =
        this._parent instanceof AppElement ? this._parent.getElement(resetGetElement)
        : typeof this._parent ==='function' ? this._parent() : this._parent;
      this._element = this._selector ? parentElement.$(this._selector) : parentElement;
    }
    return this._element;
  }

  public static async scrollIntoView(element: ChainablePromiseElement) {
    //await element.scrollIntoView({block: 'center', inline: 'center'});
    await this.scrollElementIntoView(await element.getElement());
  }
  public static async scrollElementIntoView(element: WebdriverIO.Element) {
    //await element.scrollIntoView({block: 'center', inline: 'center'});
    await browser.execute((e) => e.scrollIntoView({block: 'center', inline: 'center'}), element);
  }

  public async scrollIntoView() {
    await Component.scrollIntoView(this.getElement());
  }

}
