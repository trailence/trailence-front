import { AppElement } from '../../app/app-element';
import { Component } from '../component';

export class IonicInput extends Component {

  constructor(
    parent: AppElement | ChainablePromiseElement,
    selector?: string
  ) {
    super(parent, selector);
  }

  public async setValue(value: string) {
    await this.waitDisplayed();
    const input = this.getElement().$('input');
    await input.setValue(value);
  }

}
