import { App } from '../../app/app';
import { TrailPage } from '../../app/pages/trail-page';
import { TrailsPage } from '../../app/pages/trails-page';
import { ImportTagsPopup } from '../../components/import-tags-popup.component';
import { TagsPopup } from '../../components/tags-popup';
import { FilesUtils } from '../../utils/files-utils';
import { OpenFile } from '../../utils/open-file';

describe('Trails list - Import Zip files', () => {

  it('Login and go to Test import collection', async () => {
    App.init();
    const loginPage = await App.start();
    await loginPage.loginAndWaitMyTrailsCollection();
    const menu = await App.openMenu();
    const page = await menu.openCollection('Test Import');
    expect(await page.header.getTitle()).toBe('Test Import');
  });

  it('Import a ZIP with 2 trails, Tag 1 and Tag 4', async () => {
    const page = new TrailsPage();
    const trailsList = await page.trailsAndMap.openTrailsList();
    const importButton = await trailsList.getToolbarButton('add-circle');
    await importButton.click();
    await OpenFile.openFile((await FilesUtils.fs()).realpathSync('./test/assets/gpx-zip-001.zip'));
    const popup = new ImportTagsPopup(await App.waitModal());
    expect(await popup.getTitle()).toBe('Import tags');
    const tags = await popup.getTags();
    expect(tags.size).toBe(2);
    expect(tags.get('Tag 1')).toBe('Exists');
    expect(tags.get('Tag 4')).toBe('Does not exist');
    await popup.importAllWithExistingAndMissing();
    const trail1 = await trailsList.waitTrail('Randonnée du 20/02/2022 à 09:55');
    expect(trail1).toBeDefined();
    await browser.waitUntil(async () => {
      const tags = await trail1!.getTags();
      return tags.length === 1 && tags.indexOf('Tag 1') >= 0;
    });

    const trail2 = await trailsList.waitTrail('Près de Tourves');
    expect(trail2).toBeDefined();
    await browser.waitUntil(async () => {
      const tags = await trail2!.getTags();
      return tags.length === 1 && tags.indexOf('Tag 4') >= 0;
    });

    await trail1!.clickMenuItem('Tags');
    const tagsPopup = new TagsPopup(await App.waitModal());
    const allTags = await tagsPopup.getAllTags();
    expect(allTags.length).toBe(4);
    expect(allTags.indexOf('Tag 1') >= 0).toBeTrue();
    expect(allTags.indexOf('Tag 2') >= 0).toBeTrue();
    expect(allTags.indexOf('Tag 3') >= 0).toBeTrue();
    expect(allTags.indexOf('Tag 4') >= 0).toBeTrue();
    await tagsPopup.cancel();
  });

  let trailPage: TrailPage;

  it('Import a ZIP file with 1 trail, Tag 2, and 1 photo', async () => {
    const page = new TrailsPage();
    const trailsList = await page.trailsAndMap.openTrailsList();
    const importButton = await trailsList.getToolbarButton('add-circle');
    await importButton.click();
    await OpenFile.openFile((await FilesUtils.fs()).realpathSync('./test/assets/gpx-zip-002.zip'));
    const popup = new ImportTagsPopup(await App.waitModal());
    expect(await popup.getTitle()).toBe('Import tags');
    const tags = await popup.getTags();
    expect(tags.size).toBe(1);
    expect(tags.get('Tag 2')).toBe('Exists');
    await popup.importAll();
    const trail = await trailsList.waitTrail('Col et lacs de la Cayolle');
    expect(trail).toBeDefined();
    await browser.waitUntil(async () => {
      const tags = await trail!.getTags();
      return tags.length === 1 && tags.indexOf('Tag 2') >= 0;
    });
    await browser.waitUntil(async () => {
      const slider = trail!.getPhotosSliderElement();
      return await slider.isExisting() && await slider.isDisplayed();
    });
    trailPage = await trailsList.openTrail(trail!);
  });

  it('Trail page contains the photo', async () => {
    const photosPopup = await trailPage.trailComponent.openPhotos();
    const photos = photosPopup.getPhotosContainers();
    expect(await photos.length).toBe(1);
    await photosPopup.close();
  });

  it('Synchronize', async () => {
    await App.synchronize();
  });

});
