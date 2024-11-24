import { App } from '../../app/app';
import { TrailsPage } from '../../app/pages/trails-page';

describe('Trail - Delete collection', () => {

  it('Login, delete collection, synchronize', async () => {
    App.init();
    const loginPage = await App.start();
    const myTrailsPage = await loginPage.loginAndWaitMyTrailsCollection();
    await browser.waitUntil(() => myTrailsPage.header.getTitle().then(title => title === 'My Trails'));
    const menu = await App.openMenu();
    const collectionPage = await menu.openCollection('Test Trail');
    expect(await collectionPage.header.getTitle()).toBe('Test Trail');
    const collectionMenu = await collectionPage.header.openActionsMenu();
    await collectionMenu.clickItemWithText('Delete');
    const alert = await App.waitAlert();
    await alert.clickButtonWithRole('danger');
    const newPage = new TrailsPage();
    await newPage.waitDisplayed();
    await newPage.header.getElement().waitForDisplayed();
    expect(await newPage.header.getTitle()).toBe('My Trails');
    await App.synchronize();
  });

});
