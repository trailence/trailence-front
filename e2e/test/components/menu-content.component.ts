import { Component } from './component';

export class MenuContent extends Component {

  public async clickItemWithText(text: string) {
    await this.getElement().$('ion-label=' + text).click();
  }

}
