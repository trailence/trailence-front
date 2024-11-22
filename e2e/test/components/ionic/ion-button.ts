import { AppElement } from '../../app/app-element';
import { Component } from '../component';

export class IonicButton extends Component {

  constructor(
    parent: AppElement | ChainablePromiseElement,
    selector?: string
  ) {
    super(parent, selector);
  }

  public async click() {
    await this.waitDisplayed();
    return this.getElement().click();
  }

  public async isEnabled() {
    await this.waitDisplayed();
    return await this.getElement().$('>>>button').isEnabled();
  }

}
