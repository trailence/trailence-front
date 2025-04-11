import { App } from '../../app/app';
import { TrailsPage } from '../../app/pages/trails-page';
import { ImportFromURLModal } from '../../components/import-from-url.modal';

describe('Import data from Outdoor Active', () => {

  let collectionPage: TrailsPage;

  it('Login, create a collection', async () => {
    App.init();
    const loginPage = await App.start();
    await loginPage.loginAndWaitMyTrailsCollection();
    const menu = await App.openMenu();
    collectionPage = await menu.addCollection('Outdoor');
  });

  it('Import trail from URL', async () => {
    const list = await collectionPage.trailsAndMap.openTrailsList();
    (await list.moreMenu()).clickItemWithText('Import from URL');
    const modal = new ImportFromURLModal(await App.waitModal());
    await modal.urlInput.setValue('https://www.outdooractive.com/en/route/snowshoeing/france/pic-de-l-aiglo/235939239/');
    await modal.importFrom('Outdoor Active');

    const trail = await list.waitTrail('Pic de l’Aiglo');
    await trail.expectPhotos();
    await trail.delete();
    expect(await list.items.length).toBe(0);
  });

  it('Delete collection and synchronize', async () => {
    await (await collectionPage.header.openActionsMenu()).clickItemWithText('Delete');
    await (await App.waitAlert()).clickButtonWithRole('danger');
    await App.waitNoProgress();
    await App.synchronize();
  });

  it('End', async () => await App.end());
});
