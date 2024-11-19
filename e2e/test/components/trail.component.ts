import { Component } from './component';
import { IonicSegment } from './ionic/ion-segment';

export class TrailComponent extends Component {

  public async openTab(tab: string) {
    const segment = new IonicSegment(this.getElement().$('div.top-container div.tabs-container ion-segment'));
    await segment.setSelected(tab);
  }

  public async openDetails() {
    const details = this.getElement().$('div.top-container div.trail-details');
    if (!await details.isExisting()) {
      await this.openTab('details');
      await browser.waitUntil(() => this.getElement().$('div.top-container div.trail-details').isDisplayed());
    }
    return this.getElement().$('div.top-container div.trail-details');
  }

  public async getMetadataItems() {
    const details = await this.openDetails();
    return details.$$('.metadata-item-container>.metadata-item>.metadata-content');
  }

  public async getMetadataTitle(item: WebdriverIO.Element) {
    await item.scrollIntoView({block: 'center', inline: 'center'});
    return await item.$('.metadata-title').getText();
  }

  public async getMetadataContentByTitle(title: string) {
    const items = await this.getMetadataItems();
    for (const item of await items.getElements()) {
      const itemTitle = await this.getMetadataTitle(item);
      if (itemTitle === title) return item;
    }
    return undefined;
  }

  public async getMetadataValueByTitle(title: string, primary: boolean) {
    const item = await this.getMetadataContentByTitle(title);
    if (!item) return undefined;
    return item.$('.metadata-' + (primary ? 'primary' : 'secondary')).getText();
  }

  public async getTags() {
    const details = await this.openDetails();
    const elements = details.$('.trail-tags-row').$$('.tag');
    const tags = [];
    for (const element of await elements.getElements()) {
      const tagName = await element.getText();
      tags.push(tagName);
    }
    return tags;
  }

  public async toggleShowOriginalTrace() {
    const details = await this.openDetails();
    const checkboxes = details.$$('ion-checkbox');
    for (const cb of await checkboxes.getElements()) {
      await cb.scrollIntoView({block: 'center', inline: 'center'});
      const text = await cb.getText();
      if (text === 'Show original trace') {
        await cb.click();
        return;
      }
    }
    throw new Error('Checkbox "Show original trace" not found');
  }

}
