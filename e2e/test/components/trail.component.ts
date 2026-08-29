import { App } from '../app/app';
import { TestUtils } from '../utils/test-utils';
import { ActivityModal } from './activity.modal';
import { Component } from './component';
import { EditTools } from './edit-tools.component';
import { ElevationGraph } from './elevation-graph.component';
import { IonicButton } from './ionic/ion-button';
import { IonicCheckbox } from './ionic/ion-checkbox';
import { IonicInput } from './ionic/ion-input';
import { IonicSegment } from './ionic/ion-segment';
import { IonicTextArea } from './ionic/ion-textarea';
import { MapComponent } from './map.component';
import { MenuContent } from './menu-content.component';
import { PhotosComponent } from './photos.component';
import { PublicationChecklistModal } from './publication-checklist.modal';
import { RateAndComments } from './rate-and-comments.component';
import { TagsPopup } from './tags-popup';
import { ToolbarComponent } from './toolbar.component';

export class TrailComponent extends Component {

  private _tabsSegment: IonicSegment | undefined = undefined;
  private _currentTab: string | undefined = undefined;
  private _hasDetailsTab: boolean | undefined = undefined;

  public async getTabs(): Promise<IonicSegment> {
    if (this._tabsSegment === undefined) {
      this._tabsSegment = new IonicSegment(this.getElement().$('div.top-container div.tabs-container ion-segment'));
      await browser.waitUntil(() => this._tabsSegment!.isDisplayed());
    }
    return this._tabsSegment;
  }

  public async hasTab(name: string) {
    const tabs = await this.getTabs();
    return await tabs.hasOption(name);
  }

  private async hasDetailsTab() {
    this._hasDetailsTab ??= await this.hasTab('details');
    return this._hasDetailsTab;
  }

  public async openTab(tab: string) {
    if (this._currentTab === tab) return false;
    await (await this.getTabs()).setSelected(tab);
    this._currentTab = tab;
    return true;
  }

  public async openDetails() {
    if (await this.hasDetailsTab()) {
      if (await this.openTab('details'))
        await browser.waitUntil(() => this.getElement().$('div.top-container>div.trail-details').isDisplayed());
    }
    return this.getElement().$('div.top-container>div.trail-details');
  }

  public async centerOnMetadata() {
    const details = await this.openDetails();
    const meta = await details.$$('.metadata-item-container').getElements();
    await Component.scrollIntoView(meta[meta.length - 1]);
  }

  public async getMetadataItems() {
    const details = await this.openDetails();
    return details.$$('.metadata-item-container>.metadata-item>.metadata-content');
  }

  public async getMetadataTitle(item: WebdriverIO.Element) {
    await Component.scrollIntoView(item);
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
    const item = this.getElement().$('div.metadata-title=Collection').parentElement();
    const name1 = await item.$('div.metadata-primary').getText();
    const name2 = await item.$('div.metadata-secondary').getText();
    return [name1, name2];
  }

  public async getTrailsNames() {
    const item = this.getElement().$('div.metadata-title=Title').parentElement();
    const name1 = await item.$('div.metadata-primary').getText();
    const name2 = await item.$('div.metadata-secondary').getText();
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
      await Component.scrollIntoView(cb);
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
    await map.rightToolbar.clickByIcon('privacy');
    const menu = new MenuContent(await App.waitPopover());
    await menu.clickItemWithIcon('photos');
    await App.closePopover();
  }

  public async openPhotos() {
    const wait = await this.openTab('photos')
    const element = this.getElement().$('div.top-container>div.trail-photos-tab>app-photos');
    if (wait)
      await element.waitForDisplayed();
    return new PhotosComponent(element, false);
  }

  public async getDescription() {
    const details = await this.openDetails();
    const element = details.$('div.description-text');
    await Component.scrollIntoView(element);
    const span = element.$('span');
    const text = await span.getText();
    if (text === 'Describe the trail here') return '';
    return text;
  }

  public async setDescription(text: string) {
    const details = await this.openDetails();
    const element = details.$('div.description-text');
    await Component.scrollIntoView(element);
    await element.click();
    const textArea = new IonicTextArea(element.$('ion-textarea'));
    await textArea.waitDisplayed();
    await textArea.setValue(text);
    const somewhere = details.$('div.trail-dates');
    await Component.scrollIntoView(somewhere);
    await somewhere.click();
    await browser.waitUntil(() => textArea.isDisplayed().then(d => !d));
  }

  public async getLocation() {
    return this.getMetadataValueByTitle('Location', true);
  }

  public async setLocation() {
    const element = await this.getMetadataContentByTitle('Location');
    await element.click();
    const modal = await App.waitModal();
    const button = new IonicButton(modal.$('ion-content').$('>>>ion-button.search-place-button'));
    await button.click();
    const ul = modal.$('ion-content').$('>>>ul');
    try {
      await ul.waitForDisplayed({timeout: 15000});
      const link = ul.$('li:first-child').$('a');
      await link.waitForDisplayed();
      await link.click();
      await browser.waitUntil(() => new IonicInput(modal.$('ion-content').$('>>>ion-input')).getValue().then(value => value === 'Bonifacio'));
    } catch (_) {
      // overpass ko ?
      await new IonicInput(modal.$('ion-content').$('>>>ion-input')).setValue('Bonifacio');
    }
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
    await this.openTab('map');
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

  public async publishDraft(message: string, checkAllCheckList: boolean) {
    await TestUtils.retry(async () => {
      if (checkAllCheckList) {
        const checklist = await this.openPublicationCheckList();
        await checklist.checkAll();
        await (await checklist.getFooterButtonWithText('Close')).click();
        await checklist.waitNotDisplayed();
      }
      const details = await (await this.openDetails()).getElement();
      const alert = await TestUtils.retry(async () => {
        await new ToolbarComponent(details.$('app-toolbar')).getButtonByIcon('web').click();
        return await App.waitAlert(5000);
      }, 2, 100);
      await alert.setTextareaValue(message);
      await alert.clickButtonWithRole('confirm');
      await alert.waitNotDisplayed();
    }, 2, 100);
  }

  public async rejectPublication(message: string) {
    const details = await (await this.openDetails()).getElement();
    const alert = await TestUtils.retry(async () => {
      await new ToolbarComponent(details.$('app-toolbar')).getButtonByIcon('cross').click();
      return await App.waitAlert(5000);
    }, 2, 100);
    await alert.setTextareaValue(message);
    await alert.clickButtonWithRole('confirm');
    await alert.waitNotDisplayed();
  }

  public async canAcceptPublication() {
    const details = await (await this.openDetails()).getElement();
    return await new ToolbarComponent(details.$('app-toolbar')).getButtonByIcon('web').parentElement().getAttribute('class').then(c => !c.includes('disabled'));
  }

  public async acceptPublication() {
    const details = await (await this.openDetails()).getElement();
    const alert = await TestUtils.retry(async () => {
      await new ToolbarComponent(details.$('app-toolbar')).getButtonByIcon('web').click();
      return await App.waitAlert(5000);
    }, 2, 100);
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
    await this.openMap();
    await this.openBottomSheet();
    await this.openBottomSheetTab('elevation');
    const graph = new ElevationGraph(this.getElement().$('div.graph-container app-trail-graph'));
    await graph.waitDisplayed(true);
    return graph;
  }

  public async openWayPoints() {
    if (App.config.mode === 'mobile') {
      await this.openTab('waypoints');
    }
    return this.getElement(true).$('div.waypoints-container');
  }

  public async getWayPoints(max: number) {
    const waypoints = await this.openWayPoints();
    await Component.scrollIntoView(this.getElement(true).$('div.waypoints-container'));
    const nbElements = await waypoints.$$('app-waypoint').length;
    console.log('nb waypoints', nbElements);
    const result = [];
    for (let i = 0; i < nbElements && i < max; ++i) {
      try {
        const element = this.getElement(true).$('div.waypoints-container').$$('app-waypoint')[i];
        const {isBreakpoint, isGuidepost, innerGuidpost, hasPhotos, name, description} = await browser.execute((e) => {
          const elem = (e as any as HTMLElement);
          const titles = elem.querySelectorAll('div.waypoint-info-title');
          const isBreakpoint = Array.from(titles.entries()).some(title => (title[1] as any).innerText === 'Duration');
          const isGuidepost = !!elem.querySelector('div.waypoint-anchor ion-icon[name=poi-guidepost]');
          const innerGuidpostSpan = elem.querySelector('div.waypoint-attached-guidepost span') as HTMLSpanElement | null;
          const innerGuidpost = innerGuidpostSpan ? innerGuidpostSpan.innerText : undefined;
          const hasPhotos = !!elem.querySelector('div.waypoint-photos');
          const nameSpan = elem.querySelector('div.waypoint-name span') as HTMLSpanElement | null;
          const name = nameSpan ? nameSpan.innerText : '';
          const descriptionSpan = elem.querySelector('div.waypoint-description span') as HTMLSpanElement | null;
          const description = descriptionSpan ? descriptionSpan.innerText : '';
          return {isBreakpoint, isGuidepost, innerGuidpost: innerGuidpost?.trim(), hasPhotos, name: name.trim(), description: description.trim()};
        }, await element.getElement());
        console.log('waypoint', i, {name, description, hasPhotos, isBreakpoint, isGuidepost, innerGuidpost})
        result.push({name, description, hasPhotos, isBreakpoint, isGuidepost, innerGuidpost});
      } catch (e) {
        console.log('Error getting waypoint', i, e);
        result.push({name: '', description: '', hasPhotos: false, isBreakpoint: false, isGuidepost: false, innerGuidpost: undefined});
      }
      if (result.length >= max) break;
    }
    return result;
  }

  public async setShowKnownTrails(show: boolean) {
    const details = this.openDetails();
    const cb = new IonicCheckbox((await details).$('div.show-osm ion-checkbox'));
    await cb.scrollIntoView();
    await cb.setSelectedWaitNewValue(show);
  }

  public async setShowBreaks(show: boolean) {
    const waypoints = await this.openWayPoints();
    const cb = new IonicCheckbox(waypoints.$('ion-checkbox[name=show-breaks]'));
    await cb.scrollIntoView();
    await cb.setSelectedWaitNewValue(show);
  }

  public async setShowGuideposts(show: boolean) {
    const waypoints = await this.openWayPoints();
    const cb = new IonicCheckbox(waypoints.$('ion-checkbox[name=show-guideposts]'));
    await cb.scrollIntoView();
    await cb.setSelectedWaitNewValue(show);
  }

  public async openComments() {
    await this.openTab('reviews');
    return new RateAndComments(this.getElement().$('app-rate-and-comments'));
  }

  public async getCharacteristics() {
    await this.openDetails();
    await browser.waitUntil(() => this.getElement(true).$('div.stats-content').isExisting());
    Component.scrollIntoView(this.getElement().$('div.stats-content'));
    const result = new Map<string, {name: string, percent: string}[]>();
    for (const statType of await this.getElement().$$('div.stat-type').getElements()) {
      const title = await statType.$('div.stat-title').getText();
      const values: {name: string, percent: string}[] = [];
      for (const statValue of await statType.$$('div.stat-value').getElements()) {
        const name = await statValue.$('div.stat-name').getText();
        const percent = await statValue.$('div.stat-percent').getText();
        values.push({name: name.trim(), percent: percent.trim()});
      }
      result.set(title.trim(), values);
    }
    return result;
  }

}
