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

}
