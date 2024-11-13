import { AppElement } from '../app/app-element';

export abstract class Component extends AppElement {

  private _element?: ChainablePromiseElement;

  constructor(
    private _parent: AppElement | ChainablePromiseElement,
    private _selector?: string,
  ) {
    super();
  }

  public getElement(): ChainablePromiseElement {
    if (!this._element) {
      const parentElement = this._parent instanceof AppElement ? this._parent.getElement()! : this._parent;
      this._element = this._selector ? parentElement.$(this._selector) : parentElement;
    }
    return this._element;
  }

}
