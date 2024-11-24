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
    await browser.waitUntil(() => this.getElement().getCSSProperty('height').then(p => p.value && parseInt(p.value) > 0));
    await this.getElement().$('>>>button').waitForEnabled();
    return await this.getElement().click();
  }

  public async isEnabled() {
    await this.waitDisplayed();
    return await this.getElement().$('>>>button').isEnabled();
  }

}
