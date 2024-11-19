import { IonicButton } from './ionic/ion-button';
import { ModalComponent } from './modal';

export class ImportTagsPopup extends ModalComponent {

  public async getTags() {
    const table = this.contentElement.$('>>>table');
    const rows = table.$$('tr');
    const tags = new Map<String, String>();
    for (const row of await rows.getElements()) {
      const cells = await row.$$('td').getElements();
      if (cells.length !== 2) continue;
      const tagName = await cells.at(0)!.getText();
      const status = await cells.at(1)!.$('span').getText();
      tags.set(tagName, status);
    }
    return tags;
  }

  public async importAll() {
    const buttons = this.contentElement.$('>>>div.buttons');
    const button = buttons.$('ion-button=Import all');
    await new IonicButton(button).click();
    await browser.waitUntil(() => this.getElement().isDisplayed().then(d => !d));
  }

  public async importAllWithExistingAndMissing() {
    const buttons = this.contentElement.$('>>>div.buttons');
    const button = buttons.$('ion-button=Import all tags by creating the missing ones');
    await new IonicButton(button).click();
    await browser.waitUntil(() => this.getElement().isDisplayed().then(d => !d));
  }

  public async importOnlyExisting() {
    const buttons = this.contentElement.$('>>>div.buttons');
    const button = buttons.$('ion-button=Import only existing tags');
    await new IonicButton(button).click();
    await browser.waitUntil(() => this.getElement().isDisplayed().then(d => !d));
  }

}
