import { Component } from './component';
import { IonicButton } from './ionic/ion-button';

export class ModalComponent extends Component {

  public async getTitle() {
    return await this.getElement().$('ion-header ion-label').getText();
  }

  public get contentElement() { return this.getElement().$('ion-content'); }

  public getFooterButtons(end: boolean) {
    return this.getElement().$('ion-footer ion-buttons[slot=' + (end ? 'end' : 'start') + ']');
  }

  public async getFooterButtonWithText(text: string, end: boolean = true) {
    const element = this.getFooterButtons(end).$('ion-button=' + text);
    await element.waitForDisplayed();
    const button = new IonicButton(element);
    return button;
  }

  public async getFooterButtonWithColor(color: string, end: boolean = true) {
    const element = this.getFooterButtons(end).$('ion-button[color=' + color + ']');
    await element.waitForDisplayed();
    const button = new IonicButton(element);
    return button;
  }

}
