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

}
