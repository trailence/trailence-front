import { IonicButton } from './ionic/ion-button';
import { IonicInput } from './ionic/ion-input';
import { ModalComponent } from './modal';

export class ImportFromURLModal extends ModalComponent {

  public get urlInput() { return new IonicInput(this.getElement().$('>>>ion-input')); }

  public get fromClipboardButton() { return new IonicButton(this.getElement().$('>>>div.clipboard-container').$('ion-button')); }

  public async importFrom(source: string) {
    await (await this.getFooterButtonWithText('Import from ' + source)).click();
    await this.waitNotDisplayed();
  }

  public async getMessage() {
    await this.getElement().$('>>>div.message-container').waitForDisplayed();
    return await this.getElement().$('>>>div.message-container').getText();
  }

}
