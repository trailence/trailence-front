import { IonicButton } from './ionic/ion-button';
import { ModalComponent } from './modal';

export class ErrorsModal extends ModalComponent {

  public override async getTitle() {
    return await this.getElement().$('ion-header').$('>>>ion-title').$('>>>div.error-title').getText();
  }

  public async getErrors() {
    const errors: string[] = [];
    for (const item of await this.getElement().$$('>>>ion-item').getElements()) {
      errors.push(await item.$('>>>span.error-item').getText());
    }
    return errors;
  }

  public async deleteAll() {
    while (true) {
      const items = await this.getElement().$$('>>>ion-item').getElements();
      if (items.length === 0) break;
      await new IonicButton(items[0].$('>>>ion-button')).click();
    }
    await browser.waitUntil(() => this.getElement().isDisplayed().then(d => !d));
  }

}
