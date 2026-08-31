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
      await Component.scrollIntoView(item);
    }
    const id = await item.$('app-trail-overview').getAttribute('id');
    return new TrailOverview(browser.$('#' + id));
  }

  public async findItemByTrailName(trailName: string) {
    try {
      const id = await this.getElement().$('div.trail-name=' + trailName).parentElement().parentElement().getAttribute('id');
      return new TrailOverview(browser.$('#' + id));
    } catch (_) { /* ignore */}
    // not found, we may need to scroll
    const remainingItems: TrailOverview[] = [];
    for (const item of await this.items.getElements()) {
      try {
        const overview = await this.getItemTrailOverview(item);
        let name = (await overview.getTrailName()).trim();
        if (name === trailName.trim()) return overview;
        if (name.length === 0) remainingItems.push(overview);
      } catch (_) {
        // ignore
      }
    }
    for (const overview of remainingItems) {
      let name = '';
      try {
        await browser.waitUntil(async () => {
          await overview.scrollIntoView();
          name = (await overview.getTrailName()).trim();
          return name.length > 0;
        }, { timeout: 5000 });
      } catch (e) {}
      if (name === trailName.trim()) return overview;
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

  public async getAllTrails() {
    const result = new Map<string, TrailOverview>();
    for (const item of await this.items.getElements()) {
      const overview = await this.getItemTrailOverview(item);
      let name = '';
      try {
        name = (await overview.getTrailName()).trim();
        if (name.length === 0) {
          try {
            await browser.waitUntil(async () => {
              await overview.scrollIntoView();
              name = (await overview.getTrailName()).trim();
              return name.length > 0;
            }, { timeout: 5000 });
          } catch (e) {}
        }
      } catch (e) {
        // ignore
      }
      if (name.length === 0) name = '?' + result.size;
      result.set(name, overview);
    }
    return result;
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
      await Component.scrollIntoView(link);
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

  public async getNbSelected() {
    return await TestUtils.retry(async () => {
      const text = await this.getElement().$('div.selection div.nb-selected').getText();
      const i = text.indexOf('/');
      if (i <= 0) throw new Error('Unexpected selection text: ' + text);
      return Number.parseInt(text.substring(0, i).trim());
    }, 2, 100);
  }

  public async ensureSelected(trail: TrailOverview) {
    const selectedBefore = await this.getNbSelected();
    await TestUtils.retry(async () => {
      await trail.selectTrail();
      await TestUtils.retry(async () => {
        if (await this.getNbSelected() !== selectedBefore + 1) throw new Error('Expected selected ' + (selectedBefore + 1));
      }, 3, 100);
    }, 3, 100);
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
