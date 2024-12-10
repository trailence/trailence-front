import { App } from '../../app/app';
import { TrailPage } from '../../app/pages/trail-page';
import { TrailsPage } from '../../app/pages/trails-page';
import { ModalComponent } from '../../components/modal';
import { FilesUtils } from '../../utils/files-utils';
import { OpenFile } from '../../utils/open-file';

describe('Import data from Visorando', () => {

  let collectionPage: TrailsPage;

  it('Login, create a collection', async () => {
    App.init();
    const loginPage = await App.start();
    await loginPage.loginAndWaitMyTrailsCollection();
    const menu = await App.openMenu();
    collectionPage = await menu.addCollection('Visorando');
  });

  let trailPage: TrailPage;

  it('Import GPX from Visorando', async () => {
    const trailsList = await collectionPage.trailsAndMap.openTrailsList();
    const importButton = await trailsList.getToolbarButton('add-circle');
    await importButton.click();
    await OpenFile.openFile((await FilesUtils.fs()).realpathSync('./test/assets/visorando-le-haut-montet.gpx'));
    const modal = new ModalComponent(await App.waitModal());
    expect(await modal.getTitle()).toBe('Import data');
    await (await modal.getFooterButtonWithText('Yes')).click();
    await modal.notDisplayed();
    trailPage = await trailsList.openTrailByName('Le Haut Montet');
    await App.waitNoProgress();
  });

  it('Check data imported from Visorando', async () => {
    const description = await trailPage.trailComponent.getDescription();
    expect(description).toBe('Belle boucle au départ de Caussols, qui mène dans un premier temps au sommet du Montet et ensuite à celui du Haut Montet. Paysages magnifiques et variés, vues exceptionnelles.');
    const waypoints = await trailPage.trailComponent.getWayPoints();
    expect(waypoints[0].name).toBe('Parking Caussols');
    expect(waypoints[0].description).toBe('Traversez au rond-point et prenez à droite puis à gauche pour se diriger vers le parking de l\'école et de la mairie.');
    const location = await trailPage.trailComponent.getLocation();
    expect(location).toBe('Caussols');
    const photos = await trailPage.trailComponent.openPhotos();
    const photosInfos = await photos.collectPhotosInfos();
    expect(photosInfos.has('Station Radar')).toBeTrue();
    await photos.close();
  });

  it('Delete collection and synchronize', async () => {
    await trailPage.header.goBack();
    collectionPage = new TrailsPage();
    await collectionPage.waitDisplayed();
    await (await collectionPage.header.openActionsMenu()).clickItemWithText('Delete');
    await (await App.waitAlert()).clickButtonWithRole('danger');
    await App.waitNoProgress();
    await App.synchronize();
  });

});
