import { App } from '../../app/app';
import { TrailPage } from '../../app/pages/trail-page';
import { TrailsPage } from '../../app/pages/trails-page';
import { ErrorsModal } from '../../components/errors.modal';
import { ImportTagsPopup } from '../../components/import-tags-popup.component';
import { TagsPopup } from '../../components/tags-popup';
import { FilesUtils } from '../../utils/files-utils';
import { OpenFile } from '../../utils/open-file';
import { TestUtils } from '../../utils/test-utils';

describe('Trails list - Import Simple GPX', () => {

  it('Login', async () => {
    App.init();
    const loginPage = await App.start();
    const myTrailsPage = await loginPage.loginAndWaitMyTrailsCollection();
    await browser.waitUntil(() => myTrailsPage.header.getTitle().then(title => title === 'My Trails'));
  });

  let collectionPage: TrailsPage;
  let trailPage: TrailPage;

  it('Create collection', async () => {
    const menu = await App.openMenu();
    collectionPage = await menu.addCollection('Test Import');
    expect(await collectionPage.header.getTitle()).toBe('Test Import');
  });

  it('Import an invalid file', async () => {
    const trailsList = await collectionPage.trailsAndMap.openTrailsList();
    const importButton = await trailsList.getToolbarButton('add-circle');
    await importButton.click();
    await OpenFile.openFile((await FilesUtils.fs()).realpathSync('./test/app/app.ts'));
    const modal = new ErrorsModal(await App.waitModal());
    expect(await modal.getTitle()).toBe('Error');
    const errors = await modal.getErrors();
    expect(errors).toContain('File \'app.ts\' cannot be imported: File is not a valid GPX');
    expect(errors.length).toBe(1);
    await modal.deleteAll();
  });

  it('Import a simple GPX file', async () => {
    const trailsList = await collectionPage.trailsAndMap.openTrailsList();
    const importButton = await trailsList.getToolbarButton('add-circle');
    await importButton.click();
    await OpenFile.openFile((await FilesUtils.fs()).realpathSync('./test/assets/gpx-001.gpx'));
    const trail = await trailsList.waitTrail('Randonnée du 05/06/2023 à 08:58');
    expect(trail).toBeDefined();
    trailPage = await trailsList.openTrail(trail);
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
    collectionPage = new TrailsPage();
    await collectionPage.waitDisplayed();
  });


  it('Import a GPX file with Tag 1 and Tag 2', async () => {
    const trailsList = await collectionPage.trailsAndMap.openTrailsList();
    const importButton = await trailsList.getToolbarButton('add-circle');
    await importButton.click();
    await OpenFile.openFile((await FilesUtils.fs()).realpathSync('./test/assets/gpx-002.gpx'));
    const popup = new ImportTagsPopup(await App.waitModal());
    expect(await popup.getTitle()).toBe('Import tags');
    const tags = await popup.getTags();
    expect(tags.size).toBe(2);
    expect(tags.get('Tag 1')).toBe('Does not exist');
    expect(tags.get('Tag 2')).toBe('Does not exist');
    await popup.importAll();
    const trail = await trailsList.waitTrail('Tour de Port-Cros');
    expect(trail).toBeDefined();
    await browser.waitUntil(async () => {
      const tags = await trail.getTags();
      return tags.length === 2 && tags.indexOf('Tag 1') >= 0 && tags.indexOf('Tag 2') >= 0;
    });
    await trail.clickMenuItem('Tags');
    const tagsPopup = new TagsPopup(await App.waitModal());
    const allTags = await TestUtils.waitFor(() => tagsPopup.getAllTags(), tags => tags.length === 2);
    expect(allTags.length).toBe(2);
    expect(allTags.indexOf('Tag 1') >= 0).toBeTrue();
    expect(allTags.indexOf('Tag 2') >= 0).toBeTrue();
    await tagsPopup.cancel();
    trailPage = await trailsList.openTrail(trail);
  });

  it('Open trail, it has the 2 tags', async () => {
    await browser.waitUntil(() => trailPage.header.getTitle().then(title => title === 'Tour de Port-Cros'));
    const trail = trailPage.trailComponent;
    await browser.waitUntil(async () => {
      const tags = await trail.getTags();
      return tags.length === 2 && tags.indexOf('Tag 1') >= 0 && tags.indexOf('Tag 2') >= 0;
    });
    await trailPage.header.goBack();
    collectionPage = new TrailsPage();
    await collectionPage.waitDisplayed();
  });

  it('Import a GPX file with Tag 2 and Tag 3', async () => {
    const trailsList = await collectionPage.trailsAndMap.openTrailsList();
    const importButton = await trailsList.getToolbarButton('add-circle');
    await importButton.click();
    await OpenFile.openFile((await FilesUtils.fs()).realpathSync('./test/assets/gpx-003.gpx'));
    const popup = new ImportTagsPopup(await App.waitModal());
    expect(await popup.getTitle()).toBe('Import tags');
    const tags = await popup.getTags();
    expect(tags.size).toBe(2);
    expect(tags.get('Tag 2')).toBe('Exists');
    expect(tags.get('Tag 3')).toBe('Does not exist');
    await popup.importAllWithExistingAndMissing();
    const trail = await trailsList.waitTrail('Roquefraîche');
    expect(trail).toBeDefined();
    await browser.waitUntil(async () => {
      const tags = await trail.getTags();
      return tags.length === 2 && tags.indexOf('Tag 2') >= 0 && tags.indexOf('Tag 3') >= 0;
    });
    await trail.clickMenuItem('Tags');
    const tagsPopup = new TagsPopup(await App.waitModal());
    const allTags = await TestUtils.waitFor(() => tagsPopup.getAllTags(), tags => tags.length === 3);
    expect(allTags.length).toBe(3);
    expect(allTags.indexOf('Tag 1') >= 0).toBeTrue();
    expect(allTags.indexOf('Tag 2') >= 0).toBeTrue();
    expect(allTags.indexOf('Tag 3') >= 0).toBeTrue();
    await tagsPopup.cancel();
  });

  it('Import a GPX file with Tag 1 and Tag 4, but do not import Tag 4', async () => {
    const trailsList = await collectionPage.trailsAndMap.openTrailsList();
    const importButton = await trailsList.getToolbarButton('add-circle');
    await importButton.click();
    await OpenFile.openFile((await FilesUtils.fs()).realpathSync('./test/assets/gpx-004.gpx'));
    const popup = new ImportTagsPopup(await App.waitModal());
    expect(await popup.getTitle()).toBe('Import tags');
    const tags = await popup.getTags();
    expect(tags.size).toBe(2);
    expect(tags.get('Tag 1')).toBe('Exists');
    expect(tags.get('Tag 4')).toBe('Does not exist');
    await popup.importOnlyExisting();
    const trail = await trailsList.waitTrail('Au dessus de Montclar');
    expect(trail).toBeDefined();
    await browser.waitUntil(async () => {
      const tags = await trail.getTags();
      return tags.length === 1 && tags.indexOf('Tag 1') >= 0;
    });
    await trail.clickMenuItem('Tags');
    const tagsPopup = new TagsPopup(await App.waitModal());
    const allTags = await TestUtils.waitFor(() => tagsPopup.getAllTags(), tags => tags.length === 3);
    expect(allTags.length).toBe(3);
    expect(allTags.indexOf('Tag 1') >= 0).toBeTrue();
    expect(allTags.indexOf('Tag 2') >= 0).toBeTrue();
    expect(allTags.indexOf('Tag 3') >= 0).toBeTrue();
    await tagsPopup.cancel();
  });


  it('Import a ZIP with 2 trails, Tag 1 and Tag 4', async () => {
    const trailsList = await collectionPage.trailsAndMap.openTrailsList();
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
      const tags = await trail1.getTags();
      return tags.length === 1 && tags.indexOf('Tag 1') >= 0;
    });

    const trail2 = await trailsList.waitTrail('Près de Tourves');
    expect(trail2).toBeDefined();
    await browser.waitUntil(async () => {
      const tags = await trail2.getTags();
      return tags.length === 1 && tags.indexOf('Tag 4') >= 0;
    });

    await trail1.clickMenuItem('Tags');
    const tagsPopup = new TagsPopup(await App.waitModal());
    const allTags = await TestUtils.waitFor(() => tagsPopup.getAllTags(), tags => tags.length === 4);
    expect(allTags.length).toBe(4);
    expect(allTags.indexOf('Tag 1') >= 0).toBeTrue();
    expect(allTags.indexOf('Tag 2') >= 0).toBeTrue();
    expect(allTags.indexOf('Tag 3') >= 0).toBeTrue();
    expect(allTags.indexOf('Tag 4') >= 0).toBeTrue();
    await tagsPopup.cancel();
  });

  it('Import a ZIP file with 1 trail, Tag 2, and 1 photo', async () => {
    const trailsList = await collectionPage.trailsAndMap.openTrailsList();
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
      const tags = await trail.getTags();
      return tags.length === 1 && tags.indexOf('Tag 2') >= 0;
    });
    await browser.waitUntil(async () => {
      const slider = trail.getPhotosSliderElement();
      return await slider.isExisting() && await slider.isDisplayed();
    });
    trailPage = await trailsList.openTrail(trail);
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
