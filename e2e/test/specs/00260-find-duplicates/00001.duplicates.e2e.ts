import { App } from '../../app/app';
import { Page } from '../../app/pages/page';
import { TrailsPage } from '../../app/pages/trails-page';
import { CollectionModal } from '../../components/collection.modal';
import { FindDuplicatesModal } from '../../components/find-duplicates.modal';
import { HeaderComponent } from '../../components/header.component';
import { TrailsList } from '../../components/trails-list.component';
import { FilesUtils } from '../../utils/files-utils';
import { OpenFile } from '../../utils/open-file';

describe('Find Duplicates', () => {

  let collectionPage: TrailsPage;
  let list: TrailsList;

  it('Login, create collection, import 2 similar trails', async () => {
    App.init();
    const loginPage = await App.start();
    await loginPage.loginAndWaitMyTrailsCollection();
    const menu = await App.openMenu();
    collectionPage = await menu.addCollection('Duplicates');
    list = await collectionPage.trailsAndMap.openTrailsList();
    const importButton = await list.getToolbarButton('add-circle');
    await importButton.click();
    await OpenFile.openFile((await FilesUtils.fs()).realpathSync('./test/assets/gpx-001.gpx'));
    await importButton.click();
    await OpenFile.openFile((await FilesUtils.fs()).realpathSync('./test/assets/gpx-001-bis.gpx'));
    await list.waitTrail('Randonnée du 05/06/2023 à 08:58');
    await list.waitTrail('Phare de la Madonetta, Îlot de Fazzio, plage de Paragan depuis Bonifacio');
  });

  let modal: FindDuplicatesModal;

  it('Find duplicates with at least 90%, does not detect anything', async () => {
    await (await list.moreMenu()).clickItemWithText('Search for similar tracks');
    modal = new FindDuplicatesModal(await App.waitModal());
    await modal.selectOption('inside');
    await modal.setSimilarityPercent(90);
    await modal.start();
    await modal.expectEnd();
  });

  it('Try again with 70%, detects the two trails to be similar', async () => {
    await modal.setSimilarityPercent(70);
    await modal.start();
    await modal.expectSimilarFound();
    await modal.continue();
    await modal.expectEnd();
    await modal.close();
  });

  it('Copy trails to another collection', async () => {
    const menu = await list.moreMenu();
    await menu.clickItemWithText('Copy into...');
    await menu.clickItemWithText('New collection...');
    const collectionModal = new CollectionModal(await App.waitModal());
    await collectionModal.setName('Copy');
    await collectionModal.clickCreate();
    await collectionModal.waitNotDisplayed();
    await App.waitNoProgress();
  });

  it('Compare trails between the 2 collections with threshold of 90%', async () => {
    await (await list.moreMenu()).clickItemWithText('Search for similar tracks');
    modal = new FindDuplicatesModal(await App.waitModal());
    await modal.selectOption('two');
    await modal.selectOtherCollection('Copy');
    await modal.setSimilarityPercent(90);
    try {
      await modal.start();
    } catch (e) {
      await modal.selectOtherCollection('Copy');
      await modal.start();
    }
    await modal.expectSimilarFound();
    await modal.continue();
    await modal.expectSimilarFound();
    await modal.continue();
    await modal.expectEnd();
  });

  it('Compare trails in all collections with threshold of 90%', async () => {
    await modal.selectOption('all');
    await modal.start();
    for (let i = 0; i < 2; ++i) {
      const trail = await modal.expectSimilarFound();
      await trail.openDetails();
      const collections = await trail.getCollectionsNames();
      const names = await trail.getTrailsNames();
      expect(collections).toContain('Duplicates');
      expect(collections).toContain('Copy');
      expect(names[0]).toBe(names[1]);
      if (names[0] === 'Phare de la Madonetta, Îlot de Fazzio, plage de Paragan depuis Bonifacio')
        await modal.deleteTrail(collections[0] === 'Copy');
      else
        await modal.continue();
    }
    await modal.expectEnd();
    await modal.close();
  });

  it('Check collections', async () => {
    expect(await list.items.length).toBe(2);
    await list.waitTrail('Randonnée du 05/06/2023 à 08:58');
    await list.waitTrail('Phare de la Madonetta, Îlot de Fazzio, plage de Paragan depuis Bonifacio');
    await (await collectionPage.header.openActionsMenu()).clickItemWithText('Delete');
    await (await App.waitAlert()).clickButtonWithRole('danger');
    collectionPage = await (await App.openMenu()).openCollection('Copy');
    list = await collectionPage.trailsAndMap.openTrailsList();
    await list.waitTrail('Randonnée du 05/06/2023 à 08:58');
    expect(await list.items.length).toBe(1);
    await (await collectionPage.header.openActionsMenu()).clickItemWithText('Delete');
    await (await App.waitAlert()).clickButtonWithRole('danger');
    await browser.waitUntil(() => Page.getActivePageElement().then(p => new HeaderComponent(p).getTitle()).then(title => title === 'My Trails'));
    await App.synchronize();
  });

  it('End', async () => {
    await App.logout(false);
    await App.end();
  });
});
