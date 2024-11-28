import { App } from '../app/app';
import { Component } from './component';
import { IonicButton } from './ionic/ion-button';
import { IonicInput } from './ionic/ion-input';
import { IonicSegment } from './ionic/ion-segment';
import { IonicTextArea } from './ionic/ion-textarea';
import { MapComponent } from './map.component';
import { PhotosPopup } from './photos-popup.component';
import { TagsPopup } from './tags-popup';

export class TrailComponent extends Component {

  private _hasTabs: boolean | undefined = undefined;
  private _tabsSegment: IonicSegment | undefined = undefined;

  public async hasTabs() {
    if (this._hasTabs === undefined)
      this._hasTabs = await this.getElement().$('div.top-container div.tabs-container ion-segment').isExisting();
    return this._hasTabs;
  }

  public async openTab(tab: string) {
    if (this._tabsSegment === undefined)
      this._tabsSegment = new IonicSegment(this.getElement().$('div.top-container div.tabs-container ion-segment'));
    await this._tabsSegment.setSelected(tab);
  }

  public async openDetails() {
    if (await this.hasTabs()) {
      await this.openTab('details');
    }
    await browser.waitUntil(() => this.getElement().$('div.top-container>div.trail-details').isDisplayed());
    return this.getElement().$('div.top-container>div.trail-details');
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

  public async toggleShowPhotosOnMap() {
    const details = await this.openDetails();
    const checkboxes = details.$$('ion-checkbox');
    for (const cb of await checkboxes.getElements()) {
      await cb.scrollIntoView({block: 'center', inline: 'center'});
      const text = await cb.getText();
      if (text === 'Show photos on map') {
        await cb.click();
        return;
      }
    }
    throw new Error('Checkbox "Show photos on map" not found');
  }

  public async openPhotos() {
    // mobile mode
    if (await this.hasTabs()) {
      await this.openTab('photos');
      const element = this.getElement().$('div.top-container>div.trail-photos-tab>app-photos-popup');
      await element.waitForDisplayed();
      return new PhotosPopup(element, false);
    }

    // desktop mode
    const section = this.getElement().$('div.top-container>div.trail-details>div.trail-photos');
    const noPhoto = section.$('.no-photo');
    const editButton = section.$('ion-button.edit');
    await browser.waitUntil(async () => {
      if (await editButton.isExisting()) {
        await browser.action('pointer', { parameters: { pointerType: 'mouse' }})
          .move({origin: editButton})
          .pause(100)
          .down(0).pause(10).up(0)
          .perform();
        return true;
      }
      if (await noPhoto.isExisting()) {
        await noPhoto.click();
        return true;
      }
      return false;
    });
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
    await browser.action('pointer').move({origin: element.previousElement()}).pause(100).down().pause(100).up().perform();
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
    await browser.waitUntil(() => new IonicInput(modal.$('ion-content').$('>>>ion-input')).getValue().then(value => value === 'Bonifacio'));
    const save = new IonicButton(modal.$('ion-footer').$('>>>ion-buttons').$('ion-button=Save'));
    await save.click();
    await browser.waitUntil(() => modal.isDisplayed().then(d => !d));
  }

  public async openMap() {
    if (await this.hasTabs()) {
      // mobile mode
      await this.openTab('map');
    }
    const element = this.getElement().$('div.top-container>div.map-container>app-map');
    await element.waitForDisplayed();
    return new MapComponent(element);
  }

  public async startTrail() {
    const details = await (await this.openDetails()).getElement();
    const button = details.$('app-icon-label-button[icon=play-circle]');
    await button.waitForExist();
    await button.scrollIntoView({block: 'center', inline: 'center'});
    await button.click();
    return await this.openMap();
  }

  public async pauseRecordingFromMap() {
    await this.openMap();
    const button = new IonicButton(this.getElement().$('div.map-container div.map-top-buttons ion-button[color=medium]'));
    await button.click();
    const alert = await App.waitAlert();
    await alert.clickButtonWithRole('confirm');
  }

  public async resumeRecordingFromMap() {
    await this.openMap();
    const button = new IonicButton(this.getElement().$('div.map-container div.map-top-buttons ion-button'));
    await button.click();
    const alert = await App.waitAlert();
    await alert.clickButtonWithRole('confirm');
  }

  public async stopRecordingFromMap() {
    await this.openMap();
    const button = new IonicButton(this.getElement().$('div.map-container div.map-top-buttons ion-button[color=danger]'));
    await button.click();
    const alert = await App.waitAlert();
    await alert.clickButtonWithRole('confirm');
  }

}
