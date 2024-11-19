import { TrailPage } from '../app/pages/trail-page';
import { Component } from './component';
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

  public async getItemTrailOverview(item: WebdriverIO.Element) {
    if (!await item.isDisplayed()) {
      await item.scrollIntoView({block: 'center', inline: 'center'});
    }
    return new TrailOverview(item.$('app-trail-overview'));
  }

  public async findItemByTrailName(trailName: string) {
    for (const item of await this.items.getElements()) {
      const overview = await this.getItemTrailOverview(item);
      const name = await overview.getTrailName();
      if (name === trailName) return overview;
    }
    return undefined;
  }

  public async openTrail(trail: TrailOverview) {
    const parent = await trail.getElement().parentElement();
    let id = await parent.getAttribute('id');
    expect(id.startsWith('trail-list-id-')).toBeTrue();
    id = id.substring(14);
    let i = id.indexOf('-trail-');
    expect(i).toBeGreaterThan(0);
    id = id.substring(i + 7);
    expect(id.length).toBeGreaterThan(36);
    const uuid = id.substring(0, 36)
    const owner = id.substring(37);
    const openButtonContainer = trail.getElement().nextElement();
    if (!await openButtonContainer.isExisting()) {
      await trail.getElement().click();
    }
    const openButton = openButtonContainer.$('ion-button');
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

}
