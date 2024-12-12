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
    await this.waitExist(true);
    await this.getElement().$('>>>button').waitForEnabled();
    return await this.getElement().click();
  }

  public async isEnabled() {
    await this.waitDisplayed();
    return await this.getElement().$('>>>button').isEnabled();
  }

}
