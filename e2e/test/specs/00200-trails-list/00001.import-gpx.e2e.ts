import { App } from '../../app/app';
import { TrailsPage } from '../../app/pages/trails-page';
import { OpenFile } from '../../utils/open-file';

describe('Collections', () => {

  it('Login', async () => {
    App.init();
    await App.desktopMode();
    const loginPage = await App.start();
    const myTrailsPage = await loginPage.loginAndWaitMyTrailsCollection();
    expect(await myTrailsPage.header.getTitle()).toBe('My Trails');
  });

  it('Create collection', async () => {
    const menu = await App.openMenu();
    const page = await menu.addCollection('Test Import');
    expect(await page.header.getTitle()).toBe('Test Import');
  });

  it('Import a simple GPX file', async () => {
    const page = new TrailsPage();
    const trailsList = await page.trailsAndMap.openTrailsList();
    const importButton = await trailsList.getToolbarButton('add-circle');
    await importButton.click();
    await OpenFile.openFile((await import('fs')).realpathSync('./test/assets/gpx-001.gpx'));
    const trail = await trailsList.findItemByTrailName('Randonnée du 05/06/2023 à 08:58');
    expect(trail).toBeDefined();
  });

});
