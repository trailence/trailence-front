import { IonicButton } from './ionic/ion-button';
import { ModalComponent } from './modal';

export class ImportTagsPopup extends ModalComponent {

  public async getTags() {
    const table = this.contentElement.$('>>>table');
    const rows = table.$$('tr');
    const tags = new Map<string, string>();
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
    await new IonicButton(this.contentElement.$('>>>div.buttons').$('ion-button.import-all')).click();
    await browser.waitUntil(() => this.getElement().isDisplayed().then(d => !d), { timeout: 5000});
  }

  public async importOnlyExisting() {
    await new IonicButton(this.contentElement.$('>>>div.buttons').$('ion-button.import-existing-only')).click();
    await browser.waitUntil(() => this.getElement().isDisplayed().then(d => !d), { timeout: 5000});
  }

  public async doNotImportTags() {
    await new IonicButton(this.contentElement.$('>>>div.buttons').$('ion-button.import-none')).click();
    await browser.waitUntil(() => this.getElement().isDisplayed().then(d => !d), { timeout: 5000});
  }

}
