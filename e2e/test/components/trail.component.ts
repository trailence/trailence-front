import { Component } from './component';

export class TrailComponent extends Component {

  public getMetadataItems() {
    return this.getElement().$$('.metadata-item-container>.metadata-item>.metadata-content');
  }

  public async getMetadataTitle(item: WebdriverIO.Element) {
    await item.scrollIntoView({block: 'center', inline: 'center'});
    return await item.$('.metadata-title').getText();
  }

  public async getMetadataContentByTitle(title: string) {
    const items = this.getMetadataItems();
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

  public async toggleShowOriginalTrace() {
    const checkboxes = this.getElement().$$('ion-checkbox');
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
