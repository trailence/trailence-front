import { AppElement } from '../../app/app-element';
import { Component } from '../component';

export class IonicInput extends Component {

  constructor(
    parent: AppElement | ChainablePromiseElement,
    selector: string
  ) {
    super(parent, 'ion-input' + selector);
  }

  public async setValue(value: string) {
    await this.waitDisplayed();
    const input = await this.getElement().$('input');
    await input.setValue(value);
  }

}
