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

  public async cancel() {
    const button = await this.getFooterButtonWithText('Cancel');
    await button.click();
    await browser.waitUntil(() => this.getElement().isDisplayed().then(d => !d));
  }

}
