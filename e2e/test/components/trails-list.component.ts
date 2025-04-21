import { App } from '../app/app';
import { TrailPage } from '../app/pages/trail-page';
import { TestUtils } from '../utils/test-utils';
import { Component } from './component';
import { IonicButton } from './ionic/ion-button';
import { IonicCheckbox } from './ionic/ion-checkbox';
import { IonicSegment } from './ionic/ion-segment';
import { MenuContent } from './menu-content.component';
import { TrailOverview } from './trail-overview.component';

export class TrailsList extends Component {

  public get toolbarButtons() { return this.getElement().$('div.toolbar').$$('app-icon-label-button'); }

  public async getToolbarButton(icon: string) {
    for (const button of await this.toolbarButtons.getElements()) {
      const buttonIcon = await button.getAttribute('icon');
      if (buttonIcon === icon) return button;
    }
    throw new Error('Toolbar button not found: ' + icon);
  }

  public async moreMenu() {
    await (await this.getToolbarButton('more-menu')).click();
    const popover = await App.waitPopover();
    const menu = new MenuContent(popover);
    await menu.waitDisplayed();
    return menu;
  }

  public get items() { return this.getElement().$('div.trails').$$('div.metadata-container.trail'); }

  public get selectAllCheckbox() { return new IonicCheckbox(this.getElement().$('div.selection').$('ion-checkbox')); }

  public async switchToCondensedView() {
    await new IonicSegment(this.getElement().$('div.selection div.view-selection ion-segment')).setSelected('condensed');
  }

  public async switchToDetailedView() {
    await new IonicSegment(this.getElement().$('div.selection div.view-selection ion-segment')).setSelected('detailed');
  }

  public async getItemTrailOverview(item: WebdriverIO.Element) {
    if (!await item.isDisplayed()) {
      await item.scrollIntoView({block: 'center', inline: 'center'});
    }
    return new TrailOverview(item.$('app-trail-overview'));
  }

  public async findItemByTrailName(trailName: string) {
    let overview = new TrailOverview(this.getElement().$('div.trail-name=' + trailName).parentElement().parentElement());
    try {
      if (await overview.getElement().isExisting()) return overview;
    } catch (e) {}
    // not found, we may need to scroll
    for (const element of await this.getElement().$$('div.trail-name').getElements())
      await element.scrollIntoView({block: 'center', inline: 'center'});
    // try again
    overview = new TrailOverview(this.getElement().$('div.trail-name=' + trailName).parentElement().parentElement());
    try {
      if (!await overview.getElement().isExisting()) {
        return undefined;
      }
      return overview;
    } catch (e) {
      return undefined;
    }
  }

  public async getTrailsNames() {
    return await this.getElement().$('div.trails').$$('div.metadata-container.trail div.trail-name').map(e => e.getText());
  }

  public async waitTrail(trailName: string) {
    let trail: TrailOverview | undefined;
    try {
      await browser.waitUntil(async () => {
        trail = await this.findItemByTrailName(trailName);
        return trail !== undefined;
      });
      return trail!;
    } catch (e) {
      throw new Error('Trail not found in list: ' + trailName + ' (' + e + ')', {cause: e});
    }
  }

  public async getTrailId(trail: TrailOverview) {
    const parent = trail.getElement().parentElement();
    let id = await parent.getAttribute('id');
    expect(id.startsWith('trail-list-id-')).toBeTrue();
    id = id.substring(14);
    let i = id.indexOf('-trail-');
    expect(i).toBeGreaterThan(0);
    id = id.substring(i + 7);
    i = id.lastIndexOf('-');
    const uuid = id.substring(0, i)
    const owner = id.substring(i + 1);
    return {uuid, owner};
  }

  public async openTrail(trail: TrailOverview) {
    const {uuid, owner} = await this.getTrailId(trail);
    const trailPage = new TrailPage(owner, uuid);
    await TestUtils.retry(async (trial) => {
      if (trial > 1 && await trailPage.isDisplayed()) return;
      const openButton = new IonicButton(trail.getElement(trial > 1).$('div.open-trail ion-button'));
      await openButton.getElement().scrollIntoView({block: 'center', inline: 'center'});
      await openButton.click();
      await browser.waitUntil(() => openButton.isDisplayed().then(d => !d), { timeout: 5000 });
    }, 5, 100);
    await trailPage.waitDisplayed();
    return trailPage;
  }

  public async openTrailByName(trailName: string) {
    const item = await this.findItemByTrailName(trailName);
    expect(item).toBeDefined();
    return await this.openTrail(item!);
  }

  public async openSelectionMenu() {
    await this.getElement().$('div.selection ion-button').click();
    const popover = await App.waitPopover();
    return new MenuContent(popover.$('>>>app-menu-content'));
  }

  public async selectionMenu(itemName: string) {
    await (await this.openSelectionMenu()).clickItemWithText(itemName);
  }

  public async selectTrails(names: string[]) {
    for (const name of names) {
      await (await this.findItemByTrailName(name))!.selectTrail();
    }
  }

}
