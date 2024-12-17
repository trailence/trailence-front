import { App } from '../../app/app';
import { Component } from '../component';

export class IonicSelect extends Component {

  public async selectByText(text: string) {
    await this.getElement().click();
    const alert = await App.waitAlert();
    await alert.getElement().$('div.alert-radio-group').$('div.alert-radio-label=' + text).parentElement().parentElement().click();
    await alert.clickButtonWithText('OK');
  }

}
