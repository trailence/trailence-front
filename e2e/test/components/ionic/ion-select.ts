import { App } from '../../app/app';
import { AppElement } from '../../app/app-element';
import { Component } from '../component';

export class IonicSelect extends Component {

  constructor(
    parent: AppElement | ChainablePromiseElement | (() => ChainablePromiseElement),
    selector?: string,
    private readonly multiple: boolean = false,
  ) {
    super(parent, selector);
  }

  public async selectByText(text: string) {
    await this.getElement().click();
    const alert = await App.waitAlert();
    await alert.getElement()
      .$('div.alert-' + (this.multiple ? 'checkbox' : 'radio') + '-group')
      .$('div.alert-' + (this.multiple ? 'checkbox' : 'radio') + '-label=' + text)
      .parentElement().parentElement().click();
    await alert.clickButtonWithText('OK');
  }

}
