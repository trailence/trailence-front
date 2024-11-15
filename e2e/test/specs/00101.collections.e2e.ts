import { expect } from '@wdio/globals'
import { App } from '../app/app';
import { TrailsPage } from '../app/pages/trails-page';
import { CollectionModal } from '../components/collection.modal';

describe('Collections', () => {

  it('Login', async () => {
    App.init();
    await App.desktopMode();
    const loginPage = await App.start();
    const myTrailsPage = await loginPage.loginAndWaitMyTrailsCollection();
    expect(await myTrailsPage.header.getTitle()).toBe('My Trails');
  });

  it('Update collection name 2', async () => {
    const appMenu = await App.openMenu();
    const page = await appMenu.openCollection('Test first Collection UPDATE 1')
    const menu = await page.header.openActionsMenu();
    await menu.clickItemWithText('Edit');
    const modal = new CollectionModal(await App.waitModal());
    expect(await modal.getTitle()).toBe('Collection');
    await modal.setName('Test first Collection UPDATE 2');
    await modal.clickSave();
    browser.waitUntil(() => page.header.getTitle().then(title => title === 'Test first Collection UPDATE 2'));
  });

  it('Name 2 is updated on app menu', async () => {
    const menu = await App.openMenu();
    const collections = await menu.getCollections();
    expect(collections.length).toBe(2);
    expect(collections).toContain('My Trails');
    expect(collections).toContain('Test first Collection UPDATE 2');
    menu.close();
  });

  it('Delete collection', async () => {
    const page = new TrailsPage();
    const menu = await page.header.openActionsMenu();
    await menu.clickItemWithText('Delete');
    const alert = await App.waitAlert();
    await alert.clickButtonWithRole('danger');
    const newPage = new TrailsPage();
    await newPage.header.getElement().waitForDisplayed();
    expect(await newPage.header.getTitle()).toBe('My Trails');
  });

  it('Collection is not anymore in the menu', async () => {
    const menu = await App.openMenu();
    browser.waitUntil(() => menu.getCollections().then(col => col.length === 1));
    const collections = await menu.getCollections();
    expect(collections.length).toBe(1);
    expect(collections).toContain('My Trails');
    await menu.close();
  });

  it('Synchronize, logout with delete, login again, no more collection', async () => {
    await App.synchronize();
    const loginPage = await App.logout(true);
    await loginPage.loginAndWaitMyTrailsCollection();
    const menu = await App.openMenu();
    const collections = await menu.getCollections();
    expect(collections.length).toBe(1);
    expect(collections).toContain('My Trails');
  });

})
