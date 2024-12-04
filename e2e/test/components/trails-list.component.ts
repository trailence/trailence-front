import { App } from '../app/app';
import { TrailPage } from '../app/pages/trail-page';
import { Component } from './component';
import { IonicCheckbox } from './ionic/ion-checkbox';
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

  public get items() { return this.getElement().$('div.trails').$$('div.metadata-container.trail'); }

  public get selectAllCheckbox() { return new IonicCheckbox(this.getElement().$('div.selection').$('ion-checkbox')); }

  public async getItemTrailOverview(item: WebdriverIO.Element) {
    if (!await item.isDisplayed()) {
      await item.scrollIntoView({block: 'center', inline: 'center'});
    }
    return new TrailOverview(item.$('app-trail-overview'));
  }

  public async findItemByTrailName(trailName: string) {
    const overview = new TrailOverview(this.getElement().$('div.trail-name=' + trailName).parentElement().parentElement());
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
    expect(id.length).toBeGreaterThan(36);
    const uuid = id.substring(0, 36)
    const owner = id.substring(37);
    return {uuid, owner};
  }

  public async openTrail(trail: TrailOverview) {
    const {uuid, owner} = await this.getTrailId(trail);
    let openButtonContainer = trail.getElement().nextElement();
    if (!await openButtonContainer.isExisting()) {
      const trailName = trail.getElement().$('div.trail-name');
      await trailName.scrollIntoView({block: 'center', inline: 'center'});
      await trailName.click();
      await browser.waitUntil(() => trail.getElement().nextElement().isExisting());
      openButtonContainer = trail.getElement().nextElement();
    }
    const openButton = openButtonContainer.$('ion-button');
    await openButton.scrollIntoView({block: 'center', inline: 'center'});
    await openButton.waitForDisplayed();
    await openButton.click();
    const trailPage = new TrailPage(owner, uuid);
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
