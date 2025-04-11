import { ChainablePromiseElement } from 'webdriverio';
import { App } from '../app/app';
import { Page } from '../app/pages/page';
import { TrailsPage, TrailsPageType } from '../app/pages/trails-page';
import { CollectionModal } from './collection.modal';
import { Component } from './component';
import { HeaderComponent } from './header.component';
import { IonicButton } from './ionic/ion-button';
import { TestUtils } from '../utils/test-utils';
import { TrailPlannerPage } from '../app/pages/trail-planner-page';
import { AdminPage } from '../admin/admin.page';
import { MenuContent } from './menu-content.component';

export class AppMenu extends Component {

  public getCollectionsSection() {
    return this.getElement().$('div.menu-content div.menu-section:first-child');
  }

  public getCollectionsItems() {
    return this.getCollectionsSection().$$('div.menu-item');
  }

  public async getCollectionName(item: WebdriverIO.Element | ChainablePromiseElement) {
    const title = item.$('.item-title a');
    return await title.getText();
  }

  public async getCollections(): Promise<string[]> {
    const items = this.getCollectionsItems();
    await browser.waitUntil(() => this.getCollectionName(items[0]).then(name => name.length > 0));
    const names: string[] = [];
    for (const item of await items.getElements()) {
      names.push(await this.getCollectionName(item));
    }
    return names;
  }

  public async openCollection(name: string) {
    return await TestUtils.retry(async () => {
      const items = this.getCollectionsItems();
      await browser.waitUntil(() => this.getCollectionName(items[0]).then(name => name.length > 0), { timeout: 2000 });
      for (const item of await items.getElements()) {
        if (await this.getCollectionName(item) === name) {
          await item.click();
          await browser.waitUntil(() => Page.getActivePageElement().then(page => new HeaderComponent(page).getTitle()).then(title => title === name), {timeout: 10000});
          return new TrailsPage();
        }
      }
      throw new Error('Collection not found in app menu: ' + name);
    }, 3, 1000);
  }

  public getAddCollectionButton() {
    return new IonicButton(this.getCollectionsSection(), '.menu-section-header .section-buttons ion-button');
  }

  public async addCollection(name: string) {
    const modal = await TestUtils.retry(async () => {
      await this.getAddCollectionButton().click();
      return new CollectionModal(await App.waitModal());
    }, 2, 1000);
    expect(await modal.getTitle()).toBe('Collection');
    await modal.setName(name);
    await modal.clickCreate();
    const trailsPage = new TrailsPage();
    await trailsPage.waitDisplayed();
    return trailsPage;
  }

  public getSharedWithMeSection() {
    return this.getElement().$('div.menu-content div.menu-section#section-shared-with-me');
  }

  public getSharedByMeSection() {
    return this.getElement().$('div.menu-content div.menu-section#section-shared-by-me');
  }

  public async openShareSection(section: ChainablePromiseElement) {
    const openButton = section.$('.menu-section-header ion-button');
    const iconName = await openButton.$('>>>ion-icon').getAttribute('name');
    if (iconName === 'chevron-right') {
      await openButton.click();
    }
  }

  public async getShares(section: ChainablePromiseElement) {
    await this.openShareSection(section);
    const items = section.$$('.menu-item');
    const shares: string[][] = [];
    for (const item of await items.getElements()) {
      const name = await item.$('.item-title').getText();
      const email = await item.$('.item-sub-title').getText();
      shares.push([name, email]);
    }
    return shares;
  }

  public async openShareMenu(section: ChainablePromiseElement, shareName: string) {
    await this.openShareSection(section);
    const items = section.$$('.menu-item');
    for (const item of await items.getElements()) {
      const name = await item.$('.item-title').getText();
      if (name === shareName) {
        const menuButton = new IonicButton(item.$('.item-title ion-button'));
        await menuButton.click();
        const popover = await App.waitPopover();
        return new MenuContent(popover.$('>>>app-menu-content'));
      }
    }
    return undefined;
  }

  public async openTrailPlanner() {
    await this.getElement().$('ion-icon[name=planner]').parentElement().click();
    const page = new TrailPlannerPage();
    await page.waitDisplayed();
    return page;
  }

  public async openTrailFinder() {
    await this.getElement().$('ion-icon[name=search]').parentElement().click();
    const page = new TrailsPage(TrailsPageType.SEARCH);
    await page.waitDisplayed();
    return page;
  }

  public async hasAdmin() {
    return await this.getElement().$('ion-icon[name=tool]').isExisting();
  }

  public async openAdmin() {
    await this.getElement().$('ion-icon[name=tool]').parentElement().click();
    const page = new AdminPage();
    await page.waitDisplayed();
    return page;
  }

  public async close() {
    const button = this.getElement().$('div.menu-header div.menu-close ion-button');
    if (await button.isDisplayed()) {
      await button.click();
      await browser.waitUntil(() => button.isDisplayed().then(d => !d));
    }
  }

}
