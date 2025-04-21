import { expect } from '@wdio/globals'
import { App } from '../../app/app';
import { TrailsPage } from '../../app/pages/trails-page';
import { CollectionModal } from '../../components/collection.modal';

describe('Collections', () => {

  it('Login', async () => {
    App.init();
    const loginPage = await App.start();
    const myTrailsPage = await loginPage.loginAndWaitMyTrailsCollection();
    await browser.waitUntil(() => myTrailsPage.header.getTitle().then(title => title === 'My Trails'));
  });

  it('Only MyTrails collection exists', async () => {
    const menu = await App.openMenu();
    const collections = await menu.getCollections();
    expect(collections.length).toBe(1);
    expect(collections).toContain('My Trails');
  });

  it('Create a collection', async () => {
    const menu = await App.openMenu();
    const page = await menu.addCollection('Test first Collection');
    expect(await page.header.getTitle()).toBe('Test first Collection');
  });

  it('Collection is present in App Menu', async () => {
    const menu = await App.openMenu();
    const collections = await menu.getCollections();
    expect(collections.length).toBe(2);
    expect(collections).toContain('My Trails');
    expect(collections).toContain('Test first Collection');
    menu.close();
  });

  it('Update collection name', async () => {
    const page = new TrailsPage();
    const menu = await page.header.openActionsMenu();
    await menu.clickItemWithText('Edit');
    const modal = new CollectionModal(await App.waitModal());
    expect(await modal.getTitle()).toBe('Collection');
    await modal.setName('Test first Collection UPDATE 1');
    await modal.clickSave();
    browser.waitUntil(() => page.header.getTitle().then(title => title === 'Test first Collection UPDATE 1'));
  });

  it('Name is updated on app menu', async () => {
    const menu = await App.openMenu();
    const collections = await menu.getCollections();
    expect(collections.length).toBe(2);
    expect(collections).toContain('My Trails');
    expect(collections).toContain('Test first Collection UPDATE 1');
    await menu.close();
  });

  it('Synchronize, logout with delete, login again, the collection is still there', async () => {
    await App.synchronize();
    const loginPage = await App.logout(true);
    await loginPage.loginAndWaitMyTrailsCollection();
    const menu = await App.openMenu();
    const collections = await menu.getCollections();
    expect(collections.length).toBe(2);
    expect(collections).toContain('My Trails');
    expect(collections).toContain('Test first Collection UPDATE 1');
    const page = await menu.openCollection('Test first Collection UPDATE 1');
    expect(await page.header.getTitle()).toBe('Test first Collection UPDATE 1');
  });

  it('Update collection name 2', async () => {
    const page = new TrailsPage();
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
    await newPage.waitDisplayed();
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
    await menu.close();
  });

  it('End', async () => {
    await App.logout(false);
    await App.end();
  });

})
