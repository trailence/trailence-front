import { IonicInput } from './ionic/ion-input';
import { ModalComponent } from './modal';

export class CollectionModal extends ModalComponent {

  public get nameInput() { return new IonicInput(this.contentElement, '>>>ion-input'); }

  public async setName(name: string) {
    const input = this.nameInput;
    await input.setValue(name);
  }

  public async clickCreate() {
    const button = await this.getFooterButtonWithText('Create');
    try {
      await button.click();
    } catch (e) {
      await browser.waitUntil(() => false, { timeout: 600000 }); // TODO to debug when app menu not closed
    }
  }

  public async clickSave() {
    const button = await this.getFooterButtonWithText('Save');
    await button.click();
  }

}
