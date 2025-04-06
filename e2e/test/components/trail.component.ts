import { App } from '../app/app';
import { Component } from './component';
import { EditTools } from './edit-tools.component';
import { ElevationGraph } from './elevation-graph.component';
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
  private _currentTab: string | undefined = undefined;

  public async hasTabs() {
    if (this._hasTabs === undefined)
      this._hasTabs = await this.getElement().$('div.top-container div.tabs-container ion-segment').isExisting();
    return this._hasTabs;
  }

  public async hasTab(name: string) {
    if (this._tabsSegment === undefined)
      this._tabsSegment = new IonicSegment(this.getElement().$('div.top-container div.tabs-container ion-segment'));
    return await this._tabsSegment.hasOption(name);
  }

  public async openTab(tab: string) {
    if (this._currentTab === tab) return false;
    if (this._tabsSegment === undefined)
      this._tabsSegment = new IonicSegment(this.getElement().$('div.top-container div.tabs-container ion-segment'));
    await this._tabsSegment.setSelected(tab);
    this._currentTab = tab;
    return true;
  }

  public async openDetails() {
    if (await this.hasTabs()) {
      if (await this.openTab('details'))
        await browser.waitUntil(() => this.getElement().$('div.top-container>div.trail-details').isDisplayed());
    }
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
    const details = await this.openDetails();
    const itemTitle = details.$('div.metadata-title=' + title);
    return itemTitle.parentElement();
  }

  public async getMetadataValueByTitle(title: string, primary: boolean) {
    const item = await this.getMetadataContentByTitle(title);
    return item.$('.metadata-' + (primary ? 'primary' : 'secondary')).getText();
  }

  public async getCollectionsNames() {
    const name1 = await this.getElement().$('>>>div.metadata-item-container.collection1').$('div.metadata-primary').getText();
    const name2 = await this.getElement().$('>>>div.metadata-item-container.collection2').$('div.metadata-secondary').getText();
    return [name1, name2];
  }

  public async getTrailsNames() {
    const name1 = await this.getElement().$('>>>div.metadata-item-container.trail1name').$('div.metadata-primary').getText();
    const name2 = await this.getElement().$('>>>div.metadata-item-container.trail2name').$('div.metadata-secondary').getText();
    return [name1, name2];
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
    return new TagsPopup('selection', await App.waitModal());
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
      const wait = await this.openTab('photos')
      const element = this.getElement().$('div.top-container>div.trail-photos-tab>app-photos-popup');
      if (wait)
        await element.waitForDisplayed();
      return new PhotosPopup(element, false);
    }

    // desktop mode
    const section = this.getElement().$('div.top-container>div.trail-details>div.trail-photos');
    const noPhoto = section.$('.no-photo');
    const editButton = section.$('ion-button.edit');
    await section.scrollIntoView({block: 'center', inline: 'center'});
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
    if (text === 'Enter the description of the route here') return '';
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
      if (await this.openTab('map'))
        await this.getElement().$('div.top-container>div.map-container>app-map').waitForDisplayed();
    }
    const element = this.getElement().$('div.top-container>div.map-container>app-map');
    return new MapComponent(element);
  }

  public async goToDeparture() {
    const details = await (await this.openDetails()).getElement();
    await details.$('app-icon-label-button[icon=car]').click();
  }

  public async hasEditTools() {
    const details = await (await this.openDetails()).getElement();
    return await details.$('app-icon-label-button[icon=tool]').isExisting();
  }

  public async openEditTools() {
    const details = await (await this.openDetails()).getElement();
    const button = details.$('app-icon-label-button[icon=tool]');
    await button.waitForExist();
    await button.scrollIntoView({block: 'center', inline: 'center'});
    await button.click();
    await browser.waitUntil(() => this.getElement().$('div.edit-tools-container app-edit-tools').isDisplayed());
    return new EditTools(this.getElement().$('div.edit-tools-container app-edit-tools'));
  }

  public async getStartTrailButton() {
    const details = await (await this.openDetails()).getElement();
    const button = details.$('app-icon-label-button[icon=play-circle]');
    await button.waitForExist();
    await button.scrollIntoView({block: 'center', inline: 'center'});
    return await button.getElement();
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

  public async isBottomSheetOpen() {
    const top = await this.getElement().$('div.top-container').getAttribute('class');
    return top.indexOf('bottom-sheet-closed') < 0;
  }

  public async openBottomSheet() {
    if (await this.isBottomSheetOpen()) return;
    await this.getElement().$('div.bottom-sheet-button').click();
    await browser.pause(1000); // wait for animation
  }

  public async openBottomSheetTab(icon: string) {
    await this.getElement().$('div.bottom-sheet-tabs ion-icon[name=' + icon + ']').parentElement().click();
  }

  public async showElevationGraph() {
    if (await this.hasTabs()) {
      await this.openMap();
      await this.openBottomSheet();
      await this.openBottomSheetTab('elevation');
    } else {
      await this.openBottomSheet();
    }
    const graph = new ElevationGraph(this.getElement().$('div.elevation-container app-elevation-graph'));
    await graph.waitDisplayed(true);
    return graph;
  }

  public async getWayPoints() {
    const details = await this.openDetails();
    const elements = await details.$$('div.waypoint div.waypoint-content').getElements();
    const result = [];
    for (const element of elements) {
      if (await element.$('div.waypoint-name span').isExisting())
        result.push({
          name: await element.$('div.waypoint-name span').getText(),
          description: await element.$('div.waypoint-description span').getText(),
        });
      else
        result.push({name: '', description: ''});
    }
    return result;
  }

}
