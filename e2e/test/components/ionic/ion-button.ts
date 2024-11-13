import { AppElement } from '../../app/app-element';
import { Component } from '../component';

export class IonicButton extends Component {

  constructor(
    parent: AppElement | ChainablePromiseElement,
    selector?: string
  ) {
    super(parent, selector ? 'ion-button' + selector : undefined);
  }

  public async click() {
    await this.waitDisplayed();
    return this.getElement().click();
  }

}
