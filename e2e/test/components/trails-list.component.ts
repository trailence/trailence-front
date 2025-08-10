import { App } from '../app/app';
import { TrailPage } from '../app/pages/trail-page';
import { TestUtils } from '../utils/test-utils';
import { Component } from './component';
import { ImportModal } from './import.modal';
import { IonicCheckbox } from './ionic/ion-checkbox';
import { MenuContent } from './menu-content.component';
import { ToolbarComponent } from './toolbar.component';
import { TrailOverview } from './trail-overview.component';

export class TrailsList extends Component {

  public get toolbar() { return new ToolbarComponent(this.getElement().$('app-toolbar')); }

  public get items() { return this.getElement().$('div.trails').$$('div.metadata-container.trail'); }

  public get selectAllCheckbox() { return new IonicCheckbox(this.getElement().$('div.selection').$('ion-checkbox')); }

  public async switchToCondensedView() {
    (await this.toolbar.clickByIconAndGetMenu('list-items')).clickItemWithIcon('list-condensed');
  }

  public async switchToDetailedView() {
    (await this.toolbar.clickByIconAndGetMenu('list-items')).clickItemWithIcon('list-detailed');
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
    for (const item of await this.items.getElements()) {
      try {
        const overview = await this.getItemTrailOverview(item);
        let name = (await overview.getTrailName()).trim();
        if (name === trailName.trim()) return overview;
        if (name.length === 0) {
          try {
            await browser.waitUntil(async () => {
              await overview.getElement().scrollIntoView({block: 'center', inline: 'center'});
              name = (await overview.getTrailName()).trim();
              return name.length > 0;
            }, { timeout: 5000 });
          } catch (e) {}
        }
        if (name === trailName.trim()) return overview;
      } catch (e) {
        // ignore
      }
    }
    return undefined;
  }

  public async getTrailsNames() {
    const names: string[] = [];
    for (const item of await this.items.getElements()) {
      try {
        const overview = await this.getItemTrailOverview(item);
        names.push(await overview.getTrailName());
      } catch (e) {
        // ignore
      }
    }
    return names;
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
      throw new Error('Trail not found in list: ' + trailName + ' (' + e + '). Found: ' + await this.getTrailsNames(), {cause: e});
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
      const link = trail.getElement(trial > 1).$('div.trail-name a');
      await link.scrollIntoView({block: 'center', inline: 'center'});
      await link.click();
      await browser.waitUntil(() => link.isDisplayed().then(d => !d), { timeout: 5000 });
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
    return new MenuContent(popover);
  }

  public async selectionMenu(itemName: string) {
    await (await this.openSelectionMenu()).clickItemWithText(itemName);
  }

  public async selectionMenuWithIcon(icon: string) {
    await (await this.openSelectionMenu()).clickItemWithIcon(icon);
  }

  public async selectTrails(names: string[]) {
    for (const name of names) {
      await (await this.findItemByTrailName(name))!.selectTrail();
    }
  }

  public async openImportModal() {
    await this.toolbar.clickByIcon('add-circle');
    return new ImportModal(await App.waitModal());
  }

  public async importFile(path: string) {
    const modal = await this.openImportModal();
    await modal.importFile(path);
  }

  public async importFiles(paths: string[]) {
    const modal = await this.openImportModal();
    await modal.importFiles(paths);
  }

}
