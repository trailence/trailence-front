import { Component } from './component';
import { IonicButton } from './ionic/ion-button';

export class ModalComponent extends Component {

  public async getTitle() {
    return await this.getElement().$('ion-header ion-label').getText();
  }

  public get contentElement() { return this.getElement().$('ion-content'); }

  public getFooterButtons() {
    return this.getElement().$('ion-footer ion-buttons');
  }

  public async getFooterButtonWithText(text: string) {
    const element = await this.getFooterButtons().$('ion-button=' + text);
    await element.waitForDisplayed();
    const button = new IonicButton(element);
    return button;
  }

}
