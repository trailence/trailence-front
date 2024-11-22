import { AppElement } from '../../app/app-element';
import { Component } from '../component';

export class IonicTextArea extends Component {

  constructor(
    parent: AppElement | ChainablePromiseElement,
    selector?: string
  ) {
    super(parent, selector);
  }

  public async setValue(value: string) {
    await this.waitDisplayed({timeout: 10000});
    const input = this.getElement().$('textarea');
    await input.setValue(value);
  }

}
