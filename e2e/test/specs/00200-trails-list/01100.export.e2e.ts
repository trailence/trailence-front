import { App } from '../../app/app';
import { ExportTrailModal } from '../../components/export-trail.modal';
import { ImportTagsPopup } from '../../components/import-tags-popup.component';
import { FilesUtils } from '../../utils/files-utils';
import { OpenFile } from '../../utils/open-file';
import { EXPECTED_TRAILS, ExpectedTrail, expectListContains } from './00099.list';

describe('Export', () => {

  it('Login, create a collection for reimport', async () => {
    App.init();
    const loginPage = await App.start();
    await loginPage.loginAndWaitMyTrailsCollection();
    const menu = await App.openMenu();
    await menu.addCollection('Reimport');
  });

  it('Export a single trail, only original, without photo', async () => {
    let menu = await App.openMenu();
    let collectionPage = await menu.openCollection('Test Import');
    expect(await collectionPage.header.getTitle()).toBe('Test Import');
    let trailsList = await collectionPage.trailsAndMap.openTrailsList();
    let trail = await trailsList.waitTrail('Randonnée du 05/06/2023 à 08:58');
    await trail.clickMenuItem('Export');
    const popup = new ExportTrailModal(await App.waitModal());
    await popup.exportTypeRadioGroup.selectValue('original');
    await (await popup.getFooterButtonWithText('Ok')).click();
    await FilesUtils.waitFileDownloaded('Randonnée du 05_06_2023 à 08_58.gpx');
    await App.waitNoProgress();

    menu = await App.openMenu();
    collectionPage = await menu.openCollection('Reimport');
    expect(await collectionPage.header.getTitle()).toBe('Reimport');
    trailsList = await collectionPage.trailsAndMap.openTrailsList();
    await (await trailsList.getToolbarButton('add-circle')).click();
    await OpenFile.openFile((await FilesUtils.fs()).realpathSync('./downloads/Randonnée du 05_06_2023 à 08_58.gpx'));
    await App.waitNoProgress();
    await expectListContains(trailsList, EXPECTED_TRAILS.filter(t => t.name === 'Randonnée du 05/06/2023 à 08:58'));
    trail = await trailsList.waitTrail('Randonnée du 05/06/2023 à 08:58');
    await trail.clickMenuItem('Delete');
    await (await App.waitAlert()).clickButtonWithRole('danger');
    await browser.waitUntil(() => trailsList.items.length.then(nb => nb === 0));
    await App.waitNoProgress();
  });

  it('Export a single trail, having photos and tags, but do not export photos', async () => {
    let menu = await App.openMenu();
    let collectionPage = await menu.openCollection('Test Import');
    expect(await collectionPage.header.getTitle()).toBe('Test Import');
    let trailsList = await collectionPage.trailsAndMap.openTrailsList();
    let trail = await trailsList.waitTrail('Col et lacs de la Cayolle');
    await trail.clickMenuItem('Export');
    const popup = new ExportTrailModal(await App.waitModal());
    await popup.exportTypeRadioGroup.selectValue('both');
    await (await popup.getFooterButtonWithText('Ok')).click();
    await FilesUtils.waitFileDownloaded('Col et lacs de la Cayolle.gpx');
    await App.waitNoProgress();

    menu = await App.openMenu();
    collectionPage = await menu.openCollection('Reimport');
    expect(await collectionPage.header.getTitle()).toBe('Reimport');
    trailsList = await collectionPage.trailsAndMap.openTrailsList();
    await (await trailsList.getToolbarButton('add-circle')).click();
    await OpenFile.openFile((await FilesUtils.fs()).realpathSync('./downloads/Col et lacs de la Cayolle.gpx'));
    await App.waitNoProgress();
    const tagsPopup = new ImportTagsPopup(await App.waitModal());
    await tagsPopup.doNotImportTags();
    await App.waitNoProgress();
    await expectListContains(trailsList, EXPECTED_TRAILS.filter(t => t.name === 'Col et lacs de la Cayolle').map(t => ({...t, photos: 0, tags: [] } as ExpectedTrail)));
    trail = await trailsList.waitTrail('Col et lacs de la Cayolle');
    await trail.clickMenuItem('Delete');
    await (await App.waitAlert()).clickButtonWithRole('danger');
    await browser.waitUntil(() => trailsList.items.length.then(nb => nb === 0));
    await App.waitNoProgress();
  });


  it('Export a single trail, having photos and tags, export with photos', async () => {
    let menu = await App.openMenu();
    let collectionPage = await menu.openCollection('Test Import');
    expect(await collectionPage.header.getTitle()).toBe('Test Import');
    let trailsList = await collectionPage.trailsAndMap.openTrailsList();
    let trail = await trailsList.waitTrail('Col et lacs de la Cayolle');
    await trail.clickMenuItem('Export');
    const popup = new ExportTrailModal(await App.waitModal());
    await popup.exportTypeRadioGroup.selectValue('both');
    await popup.includePhotosCheckbox.setSelected(true);
    await (await popup.getFooterButtonWithText('Ok')).click();
    await FilesUtils.waitFileDownloaded('Col et lacs de la Cayolle.zip');
    await App.waitNoProgress();

    menu = await App.openMenu();
    collectionPage = await menu.openCollection('Reimport');
    expect(await collectionPage.header.getTitle()).toBe('Reimport');
    trailsList = await collectionPage.trailsAndMap.openTrailsList();
    await (await trailsList.getToolbarButton('add-circle')).click();
    await OpenFile.openFile((await FilesUtils.fs()).realpathSync('./downloads/Col et lacs de la Cayolle.zip'));
    await App.waitNoProgress();
    const tagsPopup = new ImportTagsPopup(await App.waitModal());
    await tagsPopup.doNotImportTags();
    await App.waitNoProgress();
    await expectListContains(trailsList, EXPECTED_TRAILS.filter(t => t.name === 'Col et lacs de la Cayolle').map(t => ({...t, tags: [] } as ExpectedTrail)));
    trail = await trailsList.waitTrail('Col et lacs de la Cayolle');
    await trail.clickMenuItem('Delete');
    await (await App.waitAlert()).clickButtonWithRole('danger');
    await browser.waitUntil(() => trailsList.items.length.then(nb => nb === 0));
    await App.waitNoProgress();
  });

  it('Export all', async () => {
    let menu = await App.openMenu();
    let collectionPage = await menu.openCollection('Test Import');
    expect(await collectionPage.header.getTitle()).toBe('Test Import');
    let trailsList = await collectionPage.trailsAndMap.openTrailsList();
    await trailsList.selectAllCheckbox.setSelected(true);
    const selectionMenu = await trailsList.openSelectionMenu();
    await selectionMenu.clickItemWithText('Export');
    const popup = new ExportTrailModal(await App.waitModal());
    await popup.exportTypeRadioGroup.selectValue('both');
    await popup.includePhotosCheckbox.setSelected(true);
    await (await popup.getFooterButtonWithText('Ok')).click();
    await FilesUtils.waitFileDownloaded('trailence-export.zip');
    await App.waitNoProgress();

    menu = await App.openMenu();
    collectionPage = await menu.openCollection('Reimport');
    expect(await collectionPage.header.getTitle()).toBe('Reimport');
    trailsList = await collectionPage.trailsAndMap.openTrailsList();
    await (await trailsList.getToolbarButton('add-circle')).click();
    await OpenFile.openFile((await FilesUtils.fs()).realpathSync('./downloads/trailence-export.zip'));
    await App.waitNoProgress();
    const tagsPopup = new ImportTagsPopup(await App.waitModal());
    await tagsPopup.importAll();
    await App.waitNoProgress();
    await expectListContains(trailsList, EXPECTED_TRAILS);
  });

  it('Remove Reimport collection and synchronize', async () => {
    const menu = await App.openMenu();
    const collectionPage = await menu.openCollection('Reimport');
    expect(await collectionPage.header.getTitle()).toBe('Reimport');
    (await collectionPage.header.openActionsMenu()).clickItemWithText('Delete');
    await (await App.waitAlert()).clickButtonWithRole('danger');
    await App.waitNoProgress();
    await App.synchronize();
  });

});
