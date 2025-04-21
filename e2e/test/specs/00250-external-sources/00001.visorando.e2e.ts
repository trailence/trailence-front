import { App } from '../../app/app';
import { TrailsPage } from '../../app/pages/trails-page';
import { ImportFromURLModal } from '../../components/import-from-url.modal';
import { ModalComponent } from '../../components/modal';
import { FilesUtils } from '../../utils/files-utils';
import { OpenFile } from '../../utils/open-file';
import { Key } from 'webdriverio'

describe('Import data from Visorando', () => {

  let collectionPage: TrailsPage;

  it('Login, create a collection', async () => {
    App.init();
    const loginPage = await App.start();
    await loginPage.loginAndWaitMyTrailsCollection();
    const menu = await App.openMenu();
    collectionPage = await menu.addCollection('Visorando');
  });

  const hautMontetName = 'Le Haut Montet';
  const hautMontetDescription = 'Belle boucle au départ de Caussols, qui mène dans un premier temps au sommet du Montet et ensuite à celui du Haut Montet. Paysages magnifiques et variés, vues exceptionnelles.';
  const hautMontetWayPoint1Name = 'Parking Caussols';
  const hautMontetWayPoint1Description = 'Traversez au rond-point et prenez à droite puis à gauche pour se diriger vers le parking de l\'école et de la mairie.';
  const hautMontetLocation = 'Caussols';

  it('Import GPX from Visorando', async () => {
    const trailsList = await collectionPage.trailsAndMap.openTrailsList();
    const importButton = await trailsList.getToolbarButton('add-circle');
    await importButton.click();
    await OpenFile.openFile((await FilesUtils.fs()).realpathSync('./test/assets/visorando-le-haut-montet.gpx'));
    const modal = new ModalComponent(await App.waitModal());
    expect(await modal.getTitle()).toBe('Import data');
    await (await modal.getFooterButtonWithText('Yes')).click();
    await modal.notDisplayed();
    await App.waitNoProgress();

    const trailPage = await trailsList.openTrailByName(hautMontetName);
    const description = await trailPage.trailComponent.getDescription();
    expect(description).toBe(hautMontetDescription);
    const waypoints = await trailPage.trailComponent.getWayPoints();
    expect(waypoints[0].name).toBe(hautMontetWayPoint1Name);
    expect(waypoints[0].description).toBe(hautMontetWayPoint1Description);
    const location = await trailPage.trailComponent.getLocation();
    expect(location).toBe(hautMontetLocation);
    const photos = await trailPage.trailComponent.openPhotos();
    const photosInfos = await photos.collectPhotosInfos();
    expect(photosInfos.has('Station Radar')).toBeTrue();
    await photos.close();

    await (await trailPage.header.openActionsMenu()).clickItemWithText('Delete');
    await (await App.waitAlert()).clickButtonWithRole('danger');

    collectionPage = new TrailsPage();
    await collectionPage.waitDisplayed();
    expect(await (await collectionPage.trailsAndMap.openTrailsList()).items.length).toBe(0);
  });

  it('Import trail from URL', async () => {
    const list = await collectionPage.trailsAndMap.openTrailsList();
    (await list.moreMenu()).clickItemWithText('Import from URL');
    const modal = new ImportFromURLModal(await App.waitModal());
    await modal.urlInput.setValue('https://www.visorando.com/randonnee-le-haut-montet-2/');
    await modal.importFrom('Visorando');

    const trail = await list.waitTrail(hautMontetName);
    expect(await trail.getTrailMetadata('location')).toBe(hautMontetLocation);
    await trail.expectPhotos();
    await trail.delete();
    expect(await list.items.length).toBe(0);
  });

  it('Import trails from user page', async () => {
    const list = await collectionPage.trailsAndMap.openTrailsList();
    (await list.moreMenu()).clickItemWithText('Import from URL');
    const modal = new ImportFromURLModal(await App.waitModal());
    await modal.urlInput.setValue('https://www.visorando.com/page-jean-paul-m3/');
    await modal.importFrom('Visorando');
    await browser.waitUntil(() => list.items.length.then(l => l > 5));
    expect(await list.items.length).toBeGreaterThan(5);
    await list.waitTrail('Circuit des balcons des Gorges de Daluis');
    await list.waitTrail('Cime du Mont Meras');

    await list.selectAllCheckbox.setSelected(true);
    await list.selectionMenu('Delete');
    await (await App.waitAlert()).clickButtonWithRole('danger');
    await App.waitNoProgress();
  });

  it('Import from clipboard', async () => {
    const list = await collectionPage.trailsAndMap.openTrailsList();
    (await list.moreMenu()).clickItemWithText('Import from URL');
    let modal = new ImportFromURLModal(await App.waitModal());

    try { await browser.setPermissions({name: 'clipboard-read'}, 'granted'); }
    catch (e) {} // firefox does not support it

    await browser.action('key').down(Key.Ctrl).down('a').up('a').down('c').up('c').up(Key.Ctrl).perform();

    await modal.fromClipboardButton.click();
    expect(await modal.getMessage()).toBe('No trail found in the clipboard');

    await browser.newWindow('https://www.visorando.com/randonnee-le-haut-montet-2/', { type: 'tab' });
    await browser.waitUntil(() => browser.$('h2=Photos').isExisting());
    await browser.action('key').down(Key.Ctrl).down('a').up('a').down('c').up('c').up(Key.Ctrl).perform();
    await browser.closeWindow();
    let handles = await browser.getWindowHandles();
    await browser.switchToWindow(handles[handles.length - 1]);

    await modal.fromClipboardButton.click();
    await modal.importFrom('Visorando');

    let trail = await list.waitTrail(hautMontetName);
    expect(await trail.getTrailMetadata('location')).toBe(hautMontetLocation);
    await trail.expectPhotos();
    await trail.delete();
    expect(await list.items.length).toBe(0);


    await browser.newWindow('https://www.visorando.com/page-ggpolice/', { type: 'tab' });
    await browser.waitUntil(() => browser.$('h2=Mes circuits de randonnée').isExisting());
    await browser.action('key').down(Key.Ctrl).down('a').up('a').down('c').up('c').up(Key.Ctrl).perform();
    await browser.closeWindow();
    handles = await browser.getWindowHandles();
    await browser.switchToWindow(handles[handles.length - 1]);

    (await list.moreMenu()).clickItemWithText('Import from URL');
    modal = new ImportFromURLModal(await App.waitModal());
    await modal.fromClipboardButton.click();
    await modal.importFrom('Visorando');

    trail = await list.waitTrail(hautMontetName);
    expect(await trail.getTrailMetadata('location')).toBe(hautMontetLocation);
    await trail.expectPhotos();
    await list.selectAllCheckbox.setSelected(true);
    await list.selectionMenu('Delete');
    await (await App.waitAlert()).clickButtonWithRole('danger');
    await browser.waitUntil(() => list.items.length.then(nb => nb === 0));
  });

  it('Import with unknown URL', async () => {
    const list = await collectionPage.trailsAndMap.openTrailsList();
    (await list.moreMenu()).clickItemWithText('Import from URL');
    const modal = new ImportFromURLModal(await App.waitModal());
    await modal.urlInput.setValue('https://www.google.com');
    expect((await modal.getMessage()).trim()).toBe('No supported source matches this URL');
    await (await modal.getFooterButtonWithText('Cancel')).click();
    await modal.waitNotDisplayed();
  });

  it('Import with page not containing trail', async () => {
    const list = await collectionPage.trailsAndMap.openTrailsList();
    (await list.moreMenu()).clickItemWithText('Import from URL');
    const modal = new ImportFromURLModal(await App.waitModal());
    await modal.urlInput.setValue('https://www.visorando.com/inscription-visorando.html');
    await (await modal.getFooterButtonWithText('Import from Visorando')).click();
    await browser.waitUntil(() => modal.getMessage().then(s => s === 'The trail could not be retrieved correctly'));
    await modal.urlInput.setValue('');
    await (await modal.getFooterButtonWithText('Cancel')).click();
    await modal.waitNotDisplayed();
  });

  it('Delete collection and synchronize', async () => {
    await (await collectionPage.header.openActionsMenu()).clickItemWithText('Delete');
    await (await App.waitAlert()).clickButtonWithRole('danger');
    await App.waitNoProgress();
    await App.synchronize();
  });

  it('End', async () => {
    await App.logout(false);
    await App.end();
  });
});
