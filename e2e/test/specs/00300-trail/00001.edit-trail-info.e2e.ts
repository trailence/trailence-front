import { App } from '../../app/app';
import { TrailPage } from '../../app/pages/trail-page';
import { FilesUtils } from '../../utils/files-utils';
import { OpenFile } from '../../utils/open-file';

describe('Trail - Edit infos', () => {

  let trailPage: TrailPage;

  it('Login, create collection, and import gpx', async () => {
    App.init();
    const loginPage = await App.start();
    const myTrailsPage = await loginPage.loginAndWaitMyTrailsCollection();
    await browser.waitUntil(() => myTrailsPage.header.getTitle().then(title => title === 'My Trails'));
    const menu = await App.openMenu();
    const collectionPage = await menu.addCollection('Test Trail');
    expect(await collectionPage.header.getTitle()).toBe('Test Trail');
    const trailsList = await collectionPage.trailsAndMap.openTrailsList();
    const importButton = await trailsList.getToolbarButton('add-circle');
    await importButton.click();
    await OpenFile.openFile((await FilesUtils.fs()).realpathSync('./test/assets/gpx-001.gpx'));
    const trail = await trailsList.waitTrail('Randonnée du 05/06/2023 à 08:58');
    expect(trail).toBeDefined();
    trailPage = await trailsList.openTrail(trail);
  });

  it('Edit trail name', async () => {
    await browser.waitUntil(() => trailPage.header.getTitle().then(title => title === 'Randonnée du 05/06/2023 à 08:58'));
    const menu = await trailPage.header.openActionsMenu()
    await menu.clickItemWithText('Rename');
    const alert = await App.waitAlert();
    expect(await alert.getInputValue()).toBe('Randonnée du 05/06/2023 à 08:58');
    await alert.setInputValue('My test trail')
    await alert.clickButtonWithRole('ok');
    await browser.waitUntil(() => alert.isDisplayed().then(d => !d));
    await browser.waitUntil(() => new TrailPage(trailPage.owner, trailPage.uuid).header.getTitle().then(title => title === 'My test trail'));
    trailPage = new TrailPage(trailPage.owner, trailPage.uuid);
  });

  it('Edit description', async () => {
    expect(await trailPage.trailComponent.getDescription()).toBe('');
    await trailPage.trailComponent.setDescription('This is a good trail');
    await browser.waitUntil(() => new TrailPage(trailPage.owner, trailPage.uuid).trailComponent.getDescription().then(d => d === 'This is a good trail'));
    trailPage = new TrailPage(trailPage.owner, trailPage.uuid);
  });

  it('Edit location', async () => {
    expect(await trailPage.trailComponent.getLocation()).toBe('');
    await trailPage.trailComponent.setLocation();
    await browser.waitUntil(() => new TrailPage(trailPage.owner, trailPage.uuid).trailComponent.getLocation().then(l => l === 'Bonifacio'));
    trailPage = new TrailPage(trailPage.owner, trailPage.uuid);
  });

  it('Edit tags', async () => {
    expect((await trailPage.trailComponent.getTags()).length).toBe(0);
    let tagsPopup = await trailPage.trailComponent.openTags();
    expect((await tagsPopup.getAllTags()).length).toBe(0);
    await tagsPopup.createTag('My Tag');
    await tagsPopup.createTag('Beautiful');
    await tagsPopup.selectTags(['My Tag', 'Beautiful']);
    await tagsPopup.apply();
    try { await browser.waitUntil(() => new TrailPage(trailPage.owner, trailPage.uuid).trailComponent.getTags().then(tags => tags.length === 2)); } catch (e) {}
    trailPage = new TrailPage(trailPage.owner, trailPage.uuid);
    let tags = await trailPage.trailComponent.getTags();
    expect(tags.length).toBe(2);
    expect(tags.indexOf('My Tag') >= 0).toBeTrue();
    expect(tags.indexOf('Beautiful') >= 0).toBeTrue();

    tagsPopup = await trailPage.trailComponent.openTags();
    await tagsPopup.selectTags(['Beautiful']);
    await tagsPopup.apply();
    try { await browser.waitUntil(() => new TrailPage(trailPage.owner, trailPage.uuid).trailComponent.getTags().then(tags => tags.length === 1)); } catch (e) {}
    trailPage = new TrailPage(trailPage.owner, trailPage.uuid);
    tags = await trailPage.trailComponent.getTags();
    expect(tags.length).toBe(1);
    expect(tags.indexOf('Beautiful') >= 0).toBeTrue();
  });

  it('Synchronize', async () => {
    await App.synchronize();
  });

});
