import { App } from '../app/app';
import { ActivityModal } from './activity.modal';
import { Component } from './component';
import { EditTools } from './edit-tools.component';
import { ElevationGraph } from './elevation-graph.component';
import { IonicButton } from './ionic/ion-button';
import { IonicInput } from './ionic/ion-input';
import { IonicSegment } from './ionic/ion-segment';
import { IonicTextArea } from './ionic/ion-textarea';
import { MapComponent } from './map.component';
import { ModalComponent } from './modal';
import { PhotosPopup } from './photos-popup.component';
import { PublicationChecklistModal } from './publication-checklist.modal';
import { TagsPopup } from './tags-popup';
import { ToolbarComponent } from './toolbar.component';

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
    const map = await this.openMap();
    await map.rightToolbar.clickByIcon('photos');
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
    const editPhotos = section.$('ion-button.edit');
    await browser.waitUntil(async () => {
      if (await editPhotos.isExisting()) {
        await new IonicButton(editPhotos).click();
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
    if (text === 'Describe the trail here') return '';
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
    const title = details.$('div.section-title');
    await title.scrollIntoView({block: 'center', inline: 'center'});
    await title.click();
    await browser.waitUntil(() => textArea.isDisplayed().then(d => !d));
  }

  public async getLocation() {
    return this.getMetadataValueByTitle('Location', true);
  }

  public async setLocation() {
    const element = await this.getMetadataContentByTitle('Location');
    await element.click();
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

  public async setActivity(activity?: string) {
    const element = await this.getMetadataContentByTitle('Activity');
    await element.click();
    const modal = new ActivityModal(await App.waitModal());
    await modal.select(activity);
    await modal.apply();
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

  public async goToDeparture() {
    const details = await (await this.openDetails()).getElement();
    await new ToolbarComponent(details.$('app-toolbar')).clickByIcon('car');
  }

  public async hasEditTools() {
    const map = await this.openMap();
    return await map.topToolbar.getButtonByIcon('tool').isExisting();
  }

  public async openEditTools() {
    const map = await this.openMap();
    await map.topToolbar.clickByIcon('tool');
    await browser.waitUntil(() => this.getElement().$('app-track-edit-tools').isDisplayed());
    return new EditTools(this.getElement().$('app-track-edit-tools'));
  }

  public async getStartTrailButton() {
    const details = await (await this.openDetails()).getElement();
    return new ToolbarComponent(details.$('app-toolbar')).getButtonByIcon('play-circle');
  }

  public async pauseRecordingFromMap() {
    const map = await this.openMap();
    await map.topToolbar.clickByIcon('pause-circle');
    const alert = await App.waitAlert();
    await alert.clickButtonWithRole('confirm');
  }

  public async resumeRecordingFromMap() {
    const map = await this.openMap();
    await map.topToolbar.clickByIcon('play-circle');
    const alert = await App.waitAlert();
    await alert.clickButtonWithRole('confirm');
  }

  public async stopRecordingFromMap() {
    const map = await this.openMap();
    await map.topToolbar.clickByIcon('stop-circle');
    const alert = await App.waitAlert();
    await alert.clickButtonWithRole('confirm');
  }

  public async openPublicationCheckList() {
    const details = await (await this.openDetails()).getElement();
    await new ToolbarComponent(details.$('app-toolbar')).getButtonByIcon('check-list').click();
    return new PublicationChecklistModal(await App.waitModal());
  }

  public async publishDraft(message: string) {
    const details = await (await this.openDetails()).getElement();
    await new ToolbarComponent(details.$('app-toolbar')).getButtonByIcon('web').click();
    const alert = await App.waitAlert();
    await alert.setTextareaValue(message);
    await alert.clickButtonWithRole('confirm');
    await alert.waitNotDisplayed();
  }

  public async rejectPublication(message: string) {
    const details = await (await this.openDetails()).getElement();
    await new ToolbarComponent(details.$('app-toolbar')).getButtonByIcon('cross').click();
    const alert = await App.waitAlert();
    await alert.setTextareaValue(message);
    await alert.clickButtonWithRole('confirm');
    await alert.waitNotDisplayed();
  }

  public async acceptPublication() {
    const details = await (await this.openDetails()).getElement();
    await new ToolbarComponent(details.$('app-toolbar')).getButtonByIcon('web').click();
    const alert = await App.waitAlert();
    await alert.clickButtonWithRole('confirm');
    await alert.waitNotDisplayed();
    await App.waitNoProgress();
  }

  public async improvePublication() {
    const details = await (await this.openDetails()).getElement();
    await new ToolbarComponent(details.$('app-toolbar')).getButtonByIcon('undo').click();
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
    const graph = new ElevationGraph(this.getElement().$('div.graph-container app-trail-graph'));
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
