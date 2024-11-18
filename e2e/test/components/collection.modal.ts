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
    await button.click();
  }

  public async clickSave() {
    const button = await this.getFooterButtonWithText('Save');
    await button.click();
  }

}
