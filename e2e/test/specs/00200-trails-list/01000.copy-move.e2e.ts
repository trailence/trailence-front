import { App } from '../../app/app';
import { TrailsPage } from '../../app/pages/trails-page';
import { CollectionModal } from '../../components/collection.modal';
import { ImportTagsPopup } from '../../components/import-tags-popup.component';
import { MenuContent } from '../../components/menu-content.component';
import { EXPECTED_TRAILS, expectListContains } from './00099.list';

describe('Copy / Move Trails', () => {

  let collectionPage: TrailsPage;

  it('Login and go to Test import collection', async () => {
    App.init();
    const loginPage = await App.start();
    await loginPage.loginAndWaitMyTrailsCollection();
    const menu = await App.openMenu();
    collectionPage = await menu.openCollection('Test Import');
    expect(await collectionPage.header.getTitle()).toBe('Test Import');
  });

  it('Copy full collection to new collection', async () => {
    const list = await collectionPage.trailsAndMap.openTrailsList();
    await browser.waitUntil(() => list.items.length.then(nb => nb === EXPECTED_TRAILS.length));
    await (await list.getToolbarButton('more-menu')).click();
    const popover = await App.waitPopover();
    const menu = new MenuContent(popover);
    await menu.waitDisplayed();
    await menu.clickItemWithText('Copy into...');
    await menu.getElement().$('ion-list-header').waitForDisplayed();
    await menu.clickItemWithText('New collection...');
    const newCollectionModal = new CollectionModal(await App.waitModal());
    await newCollectionModal.setName('Copy 1');
    await newCollectionModal.clickCreate();
    await browser.waitUntil(() => newCollectionModal.notDisplayed());
    const copyTagsModal = new ImportTagsPopup(await App.waitModal());
    await copyTagsModal.waitDisplayed(true);
    const tags = await copyTagsModal.getTags();
    expect(tags.size).toBe(4);
    await copyTagsModal.copyAll();
    const alert = await App.waitAlert();
    expect(await alert.getTitle()).toBe('Copy photos');
    await alert.clickButtonWithRole('success');
    await browser.waitUntil(() => alert.notDisplayed());

    const appMenu = await App.openMenu();
    const copyPage = await appMenu.openCollection('Copy 1');
    await expectListContains(await copyPage.trailsAndMap.openTrailsList(), EXPECTED_TRAILS);
    (await copyPage.header.openActionsMenu()).clickItemWithText('Delete')
    const alertDelete = await App.waitAlert();
    expect(await alertDelete.getTitle()).toBe('Delete Collection');
    await alertDelete.clickButtonWithRole('danger');

    await browser.waitUntil(() => browser.getTitle().then(title => title === 'My Trails - Trailence'));
  });

  const moved1 = ['Tour de Port-Cros', 'Roquefraîche', 'Au dessus de Montclar'];

  it('Move trails to new collection', async () => {
    let appMenu = await App.openMenu();
    collectionPage = await appMenu.openCollection('Test Import');
    expect(await collectionPage.header.getTitle()).toBe('Test Import');
    let list = await collectionPage.trailsAndMap.openTrailsList();
    await browser.waitUntil(() => list.items.length.then(nb => nb === EXPECTED_TRAILS.length));

    await list.selectTrails(moved1);
    const selectionMenu = await list.openSelectionMenu();
    await selectionMenu.clickItemWithText('Move to...');
    await selectionMenu.getElement().$('ion-list-header').waitForDisplayed();
    await selectionMenu.clickItemWithText('New collection...');
    const newCollectionModal = new CollectionModal(await App.waitModal());
    await newCollectionModal.setName('Move 1');
    await newCollectionModal.clickCreate();
    await browser.waitUntil(() => newCollectionModal.notDisplayed());
    const copyTagsModal = new ImportTagsPopup(await App.waitModal());
    await copyTagsModal.waitDisplayed(true);
    const tags = await copyTagsModal.getTags();
    expect(tags.size).toBe(3);
    await copyTagsModal.copyAll();
    await browser.waitUntil(() => copyTagsModal.notDisplayed());
    await App.waitNoProgress();

    await expectListContains(list, EXPECTED_TRAILS.filter(t => moved1.indexOf(t.name) < 0));

    appMenu = await App.openMenu();
    collectionPage = await appMenu.openCollection('Move 1');
    expect(await collectionPage.header.getTitle()).toBe('Move 1');
    list = await collectionPage.trailsAndMap.openTrailsList();
    await expectListContains(list, EXPECTED_TRAILS.filter(t => moved1.indexOf(t.name) >= 0));
  });

  it('Move them back and delete collection', async () => {
    let list = await collectionPage.trailsAndMap.openTrailsList();
    await list.selectAllCheckbox.setSelected(true);
    const selectionMenu = await list.openSelectionMenu();
    await selectionMenu.clickItemWithText('Move to...');
    await selectionMenu.getElement().$('ion-list-header').waitForDisplayed();
    await selectionMenu.clickItemWithText('Test Import');
    const copyTagsModal = new ImportTagsPopup(await App.waitModal());
    await copyTagsModal.waitDisplayed(true);
    const tags = await copyTagsModal.getTags();
    expect(tags.size).toBe(3);
    await copyTagsModal.copyAll();
    await browser.waitUntil(() => copyTagsModal.notDisplayed());
    await App.waitNoProgress();

    await expectListContains(list, []);

    await (await collectionPage.header.openActionsMenu()).clickItemWithText('Delete');
    const alert = await App.waitAlert();
    await alert.clickButtonWithRole('danger');

    const appMenu = await App.openMenu();
    collectionPage = await appMenu.openCollection('Test Import');
    list = await collectionPage.trailsAndMap.openTrailsList();
    await expectListContains(list, EXPECTED_TRAILS);
  });

  it('Synchronize', async () => {
    await App.synchronize();
  });

});
