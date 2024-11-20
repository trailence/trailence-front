import { IonicButton } from './ionic/ion-button';
import { IonicCheckbox } from './ionic/ion-checkbox';
import { IonicInput } from './ionic/ion-input';
import { ModalComponent } from './modal';

export class TagsPopup extends ModalComponent {

  public async getAllTags() {
    const nodes = this.contentElement.$$('>>>div.tag-node div.tag-name span');
    const tags = [];
    for (const node of await nodes.getElements()) {
      const tagName = await node.getText();
      tags.push(tagName);
    }
    return tags;
  }

  public async selectTags(tags: string[]) {
    const nodes = this.contentElement.$$('>>>div.tag-node');
    const found = [];
    let selected = 0;
    for (const node of await nodes.getElements()) {
      const tagName = await node.$('div.tag-name span').getText();
      const cb = new IonicCheckbox(node.$('ion-checkbox'));
      cb.setSelected(tags.indexOf(tagName) >= 0);
      found.push(tagName);
      if (tags.indexOf(tagName) >= 0) selected++;
    }
    if (selected !== tags.length)
      throw new Error('Cannot select all tags: expect to find ' + tags.join(',') + ' but the following tags were found: ' + found.join(','));
  }

  public async createTag(tagName: string) {
    const container = this.getElement().$('>>>div.add-tag-footer');
    const input = new IonicInput(container.$('ion-input'));
    await input.setValue(tagName);
    const addButton = new IonicButton(container.$('ion-button'));
    await addButton.click();
    await browser.waitUntil(() => this.getAllTags().then(tags => tags.indexOf(tagName) >= 0));
  }

  public async cancel() {
    const button = await this.getFooterButtonWithText('Cancel');
    await button.click();
    await browser.waitUntil(() => this.getElement().isDisplayed().then(d => !d));
  }

  public async apply() {
    const button = await this.getFooterButtonWithText('Apply');
    await button.click();
    await browser.waitUntil(() => this.getElement().isDisplayed().then(d => !d));
  }

}
