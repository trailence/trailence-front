import { App } from '../../app/app';
import { TrailPage } from '../../app/pages/trail-page';
import { TrailsPage } from '../../app/pages/trails-page';
import { OpenFile } from '../../utils/open-file';

describe('Trails list - Import Simple GPX', () => {

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

  let trailPage: TrailPage;

  it('Import a simple GPX file', async () => {
    const page = new TrailsPage();
    const trailsList = await page.trailsAndMap.openTrailsList();
    const importButton = await trailsList.getToolbarButton('add-circle');
    await importButton.click();
    await OpenFile.openFile((await import('fs')).realpathSync('./test/assets/gpx-001.gpx'));
    const trail = await trailsList.findItemByTrailName('Randonnée du 05/06/2023 à 08:58');
    expect(trail).toBeDefined();
    trailPage = await trailsList.openTrail(trail!);
  });

  it('Open trail, it has the original track and an improved track', async () => {
    await browser.waitUntil(() => trailPage.header.getTitle().then(title => title === 'Randonnée du 05/06/2023 à 08:58'));
    const trail = trailPage.trailComponent;
    await browser.waitUntil(() => trail.getMetadataValueByTitle('Ascent', true).then(value => !!value && value.length > 0));
    const improvedAscent = await trail.getMetadataValueByTitle('Ascent', true);
    expect(improvedAscent).toBeDefined();
    expect(improvedAscent!.indexOf('+ ')).toBe(0);
    await trail.toggleShowOriginalTrace();
    await browser.waitUntil(() => trail.getMetadataValueByTitle('Ascent', true).then(value => !!value && value.length > 0 && value !== improvedAscent));
    const originalAscent = await trail.getMetadataValueByTitle('Ascent', true);
    expect(originalAscent).toBeDefined();
    expect(originalAscent!.indexOf('+ ')).toBe(0);
    expect(parseInt(originalAscent!.substring(2).replaceAll(',', ''))).toBeGreaterThan(parseInt(improvedAscent!.substring(2).replaceAll(',', '')));
    await trailPage.header.goBack();
    await browser.waitUntil(() => browser.getUrl().then(url => url.indexOf('/trails/collection/') > 0));
    const trailsPage = new TrailsPage();
    await trailsPage.waitDisplayed();
  });

  it('Synchronize', async () => {
    await App.synchronize();
    await App.end();
  });

});
