import { App } from '../app/app';
import { Component } from './component';
import { IonicButton } from './ionic/ion-button';
import { IonicSegment } from './ionic/ion-segment';
import { IonicTextArea } from './ionic/ion-textarea';
import { PhotosPopup } from './photos-popup.component';
import { TagsPopup } from './tags-popup';

export class TrailComponent extends Component {

  public async hasTabs() {
    return await this.getElement().$('div.top-container div.tabs-container ion-segment').isExisting();
  }

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

  public async openTags() {
    const details = await this.openDetails();
    const row = details.$('.trail-tags-row');
    await row.click();
    return new TagsPopup(await App.waitModal());
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

  public async openPhotos() {
    // mobile mode
    if (await this.hasTabs()) {
      await this.openTab('photos');
      const element = this.getElement().$('div.trail-photos-tab app-photos-popup');
      await element.waitForDisplayed();
      return new PhotosPopup(element, false);
    }

    // desktop mode
    const buttonElement = this.getElement().$('div.top-container div.trail-details div.trail-photos ion-button.edit');
    await buttonElement.waitForExist();
    await browser.action('pointer', { parameters: { pointerType: 'mouse' }})
      .move({origin: buttonElement})
      .pause(100)
      .down(0).pause(10).up(0)
      .perform();
    return new PhotosPopup(await App.waitModal(), true);
  }

  public async getDescription() {
    const details = await this.openDetails();
    const element = details.$('div.description-text');
    await element.scrollIntoView({block: 'center', inline: 'center'});
    const span = element.$('span');
    const text = await span.getText();
    if (text === 'Enter the description of the trail here') return '';
    return text;
  }

  public async setDescription(text: string) {
    const details = await this.openDetails();
    const element = details.$('div.description-text');
    await element.scrollIntoView({block: 'center', inline: 'center'});
    await element.click();
    const textArea = new IonicTextArea(element.$('ion-textarea'));
    await textArea.waitDisplayed();
    await textArea.setValue(text);
    await browser.action('pointer').move({origin: element.previousElement()}).down().up().perform();
    await browser.waitUntil(() => textArea.isDisplayed().then(d => !d));
  }

  public async getLocation() {
    return this.getMetadataValueByTitle('Location', true);
  }

  public async setLocation() {
    const element = await this.getMetadataContentByTitle('Location');
    await element!.click();
    const modal = await App.waitModal();
    const button = new IonicButton(modal.$('ion-content').$('>>>ion-button'));
    await button.click();
    const ul = modal.$('ion-content').$('>>>ul');
    await ul.waitForDisplayed();
    const link = ul.$('li:first-child').$('a');
    await link.waitForDisplayed();
    await link.click();
    const save = new IonicButton(modal.$('ion-footer').$('>>>ion-buttons').$('ion-button=Save'));
    await save.click();
    await browser.waitUntil(() => modal.isDisplayed().then(d => !d));
  }

}
