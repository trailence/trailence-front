import { App } from '../app/app';
import { Page } from '../app/pages/page';
import { TrailsPage } from '../app/pages/trails-page';
import { CollectionModal } from './collection.modal';
import { Component } from './component';
import { HeaderComponent } from './header.component';
import { IonicButton } from './ionic/ion-button';

export class AppMenu extends Component {

  public getCollectionsSection() {
    return this.getElement().$('div.menu-content div.menu-section:first-child');
  }

  public getCollectionsItems() {
    return this.getCollectionsSection().$$('div.menu-item');
  }

  public async getCollectionName(item: ChainablePromiseElement) {
    const title = item.$('.item-title a');
    await title.waitForDisplayed();
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
    const items = this.getCollectionsItems();
    await browser.waitUntil(() => this.getCollectionName(items[0]).then(name => name.length > 0));
    for (const item of await items.getElements()) {
      if (await this.getCollectionName(item) === name) {
        await item.click();
        browser.waitUntil(() => Page.getActivePageElement().then(page => new HeaderComponent(page).getTitle()).then(title => title === name));
        return new TrailsPage();
      }
    }
    throw new Error('Collection not found in app menu: ' + name);
  }

  public getAddCollectionButton() {
    return new IonicButton(this.getCollectionsSection(), '.menu-section-header .section-buttons ion-button');
  }

  public async addCollection(name: string) {
    await this.getAddCollectionButton().click();
    const modal = new CollectionModal(await App.waitModal());
    expect(await modal.getTitle()).toBe('Collection');
    await modal.setName(name);
    await modal.clickCreate();
    await browser.waitUntil(() => browser.getUrl().then(url => url.indexOf('/trails/collection/') > 0));
    const trailsPage = new TrailsPage();
    await trailsPage.waitDisplayed();
    return trailsPage;
  }

  public async close() {
    const button = this.getElement().$('div.menu-header div.menu-close ion-button');
    if (await button.isDisplayed()) {
      await button.click();
      await browser.waitUntil(() => button.isDisplayed().then(d => !d));
    }
  }

}
