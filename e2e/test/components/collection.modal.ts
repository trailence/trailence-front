import { TestUtils } from '../utils/test-utils';
import { IonicInput } from './ionic/ion-input';
import { IonicToggle } from './ionic/ion-toggle';
import { ModalComponent } from './modal';

export class CollectionModal extends ModalComponent {

  public get nameInput() { return new IonicInput(this.getElement().$('div.modal-content'), '>>>ion-input'); }

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

  public async toggleSharedCollection() {
    await new IonicToggle(this.getElement().$('div.shared-section ion-toggle')).setValue(true);
    await browser.waitUntil(() => this.getElement().$('app-multiple-input-email').isDisplayed());
  }

  public async addSharedWith(email: string) {
    const elements = await TestUtils.waitFor(() => this.getElement().$('app-multiple-input-email').$$('>>>app-input-email ion-input').getElements(), async newElements => {
      if (newElements.length === 0) throw new Error('No email input');
    }, 30, 100);
    await new IonicInput(elements[elements.length - 1]).setValue(email);
    await TestUtils.waitFor(() => this.getElement().$('app-multiple-input-email').$$('>>>app-input-email ion-input').getElements(), async newElements => {
      if (newElements.length !== elements.length + 1) throw new Error('Expected ' + (elements.length + 1) + ' email inputs, found ' + newElements.length);
    }, 30, 100);
  }

  public async getEmails(): Promise<Set<string>> {
    const elements = await this.getElement().$('app-multiple-input-email').$$('>>>app-input-email ion-input').getElements();
    const emails = new Set<string>();
    for (const element of elements) {
      const email = (await new IonicInput(element).getValue()).trim();
      if (email.length > 0) emails.add(email);
    }
    return emails;
  }

}
