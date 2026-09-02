import { App } from '../../app/app';
import { TrailPage } from '../../app/pages/trail-page';
import { TrailsPage } from '../../app/pages/trails-page';
import { ErrorsModal } from '../../components/errors.modal';
import { ImportTagsPopup } from '../../components/import-tags-popup.component';
import { TagsPopup } from '../../components/tags-popup';
import { TestUtils } from '../../utils/test-utils';

describe('Trails list', () => {

  it('Login', async () => {
    App.init();
    await App.startLoginIfNeeded();
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
    await trailsList.importFile('./test/app/app.ts');
    const modal = new ErrorsModal(await App.waitModal());
    expect(await modal.getTitle()).toBe('Error');
    const errors = await modal.getErrors();
    expect(errors).toContain('File \'app.ts\' cannot be imported: This file is not a valid GPX');
    expect(errors.length).toBe(1);
    await modal.deleteAll();
  });

  it('Import a simple GPX file', async () => {
    const trailsList = await collectionPage.trailsAndMap.openTrailsList();
    await trailsList.importFile('./test/assets/gpx-001.gpx');
    const trail = await trailsList.waitTrail('Randonnée du 05/06/2023 à 08:58');
    expect(trail).toBeDefined();
    trailPage = await trailsList.openTrail(trail);
  });

  it('Open trail, it has the original track and an improved track', async () => {
    await browser.waitUntil(() => trailPage.header.getTitle().then(title => title === 'Randonnée du 05/06/2023 à 08:58'));
    const trail = trailPage.trailComponent;
    const improvedAscent = await TestUtils.waitFor(
      () => trail.getMetadataValueByTitle('Ascent', true),
      value => {
        if (!value?.length) throw new Error('Expect ascent to not be 0, found: ' + value);
      }
    );
    expect(improvedAscent).toBeDefined();
    expect(improvedAscent!.indexOf('+ ')).toBe(0);
    await trail.toggleShowOriginalTrace();
    const originalAscent = await TestUtils.waitFor(
      () => trail.getMetadataValueByTitle('Ascent', true),
      value => {
        if (!value?.length || value === improvedAscent) throw new Error('Expect ascent to not be 0 and different from ' + improvedAscent + ', found: ' + value);
      }
    );
    expect(originalAscent).toBeDefined();
    expect(originalAscent!.indexOf('+ ')).toBe(0);
    expect(parseInt(originalAscent!.substring(2).replaceAll(',', ''))).toBeGreaterThan(parseInt(improvedAscent!.substring(2).replaceAll(',', '')));
    await trailPage.header.goBack();
    collectionPage = new TrailsPage();
    await collectionPage.waitDisplayed();
  });

  it('Import a GPX file with Tag 1 and Tag 2', async () => {
    const trailsList = await collectionPage.trailsAndMap.openTrailsList();
    await trailsList.importFile('./test/assets/gpx-002.gpx');
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
    await trail.clickMenuItemWithIcon('tags');
    const tagsPopup = new TagsPopup('selection', await App.waitModal());
    const allTags = await TestUtils.waitFor(() => tagsPopup.getAllTags(), tags => { if (tags.length !== 2) throw new Error('Expect 2 tags, found: ' + tags.length); });
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
    await trailsList.importFile('./test/assets/gpx-003.gpx');
    const popup = new ImportTagsPopup(await App.waitModal());
    expect(await popup.getTitle()).toBe('Import tags');
    const tags = await popup.getTags();
    expect(tags.size).toBe(2);
    expect(tags.get('Tag 2')).toBe('Exists');
    expect(tags.get('Tag 3')).toBe('Does not exist');
    await popup.importAll();
    const trail = await trailsList.waitTrail('Roquefraîche');
    expect(trail).toBeDefined();
    await browser.waitUntil(async () => {
      const tags = await trail.getTags();
      return tags.length === 2 && tags.indexOf('Tag 2') >= 0 && tags.indexOf('Tag 3') >= 0;
    });
    await trail.clickMenuItemWithIcon('tags');
    const tagsPopup = new TagsPopup('selection', await App.waitModal());
    const allTags = await TestUtils.waitFor(() => tagsPopup.getAllTags(), tags => { if (tags.length !== 3) throw new Error('Expect 3 tags, found: ' + tags.length); });
    expect(allTags.indexOf('Tag 1') >= 0).toBeTrue();
    expect(allTags.indexOf('Tag 2') >= 0).toBeTrue();
    expect(allTags.indexOf('Tag 3') >= 0).toBeTrue();
    await tagsPopup.cancel();
  });

  it('Import a GPX file with Tag 1 and Tag 4, but do not import Tag 4', async () => {
    const trailsList = await collectionPage.trailsAndMap.openTrailsList();
    await trailsList.importFile('./test/assets/gpx-004.gpx');
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
    await trail.clickMenuItemWithIcon('tags');
    const tagsPopup = new TagsPopup('selection', await App.waitModal());
    const allTags = await TestUtils.waitFor(() => tagsPopup.getAllTags(), tags => { if (tags.length !== 3) throw new Error('Expect 3 tags, found: ' + tags.length); });
    expect(allTags.indexOf('Tag 1') >= 0).toBeTrue();
    expect(allTags.indexOf('Tag 2') >= 0).toBeTrue();
    expect(allTags.indexOf('Tag 3') >= 0).toBeTrue();
    await tagsPopup.cancel();
  });


  it('Import a ZIP with 2 trails, Tag 1 and Tag 4', async () => {
    const trailsList = await collectionPage.trailsAndMap.openTrailsList();
    await trailsList.importFile('./test/assets/gpx-zip-001.zip');
    const popup = new ImportTagsPopup(await App.waitModal());
    expect(await popup.getTitle()).toBe('Import tags');
    const tags = await popup.getTags();
    expect(tags.size).toBe(2);
    expect(tags.get('Tag 1')).toBe('Exists');
    expect(tags.get('Tag 4')).toBe('Does not exist');
    await popup.importAll();
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

    await trail1.clickMenuItemWithIcon('tags');
    const tagsPopup = new TagsPopup('selection', await App.waitModal());
    const allTags = await TestUtils.waitFor(() => tagsPopup.getAllTags(), tags => { if (tags.length !== 4) throw new Error('Expect 4 tags, found: ' + tags.length); });
    expect(allTags.indexOf('Tag 1') >= 0).toBeTrue();
    expect(allTags.indexOf('Tag 2') >= 0).toBeTrue();
    expect(allTags.indexOf('Tag 3') >= 0).toBeTrue();
    expect(allTags.indexOf('Tag 4') >= 0).toBeTrue();
    await tagsPopup.cancel();
  });

  it('Import a ZIP file with 1 trail, Tag 2, and 1 photo', async () => {
    const trailsList = await collectionPage.trailsAndMap.openTrailsList();
    await trailsList.importFile('./test/assets/gpx-zip-002.zip');
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
    await trail.expectPhotos();
    trailPage = await trailsList.openTrail(trail);
  });

  it('Trail page contains the photo', async () => {
    const photosPopup = await trailPage.trailComponent.openPhotos();
    const photos = photosPopup.getPhotosContainers();
    expect(await photos.length).toBe(1);
    await trailPage.header.goBack();
    collectionPage = new TrailsPage();
    await collectionPage.waitDisplayed();
  });

  it('Map bubbles', async () => {
    const map = await collectionPage.trailsAndMap.openMap();
    await map.fitBounds();

    // map should contain only trails
    let paths = await map.getPathsWithClass('track-path').map(e => e.getAttribute('stroke'));
    expect(paths.length).toBeGreaterThan(0);
    expect(paths.every(p => p === 'red'));
    let bubbles = await map.getOverlaysSvgsWithClass('bubble').map(e => e.getAttribute('stroke'));
    expect(bubbles.length).toBe(0);

    await map.setBubblesMode();
    // map should contain only bubbles
    paths = await TestUtils.retry(() => map.getPathsWithClass('track-path').map(e => e.getAttribute('stroke')).then(p => { if (p.length > 0) throw new Error('' + p.length + ' paths found'); return p; }), 5, 1000);
    expect(paths.length).toBe(0);
    bubbles = await map.getOverlaysSvgsWithClass('bubble').map(m => m.getAttribute('class'));
    expect(bubbles.length).toBeGreaterThan(0);
    expect(bubbles.every(c => c.indexOf('bubble') >= 0));

    await map.setPathMode();
    // map should contain only trails
    paths = await TestUtils.retry(() => map.getPathsWithClass('track-path').map(e => e.getAttribute('stroke')).then(p => { if (p.length === 0) throw new Error('No path found'); return p; }), 5, 1000);
    expect(paths.length).toBeGreaterThan(0);
    expect(paths.every(p => p === 'red'));
    bubbles = await map.getOverlaysSvgsWithClass('bubble').map(m => m.getAttribute('class'));
    expect(bubbles.length).toBe(0);
  });

  it('Can select a trail from map', async () => {
    const map = await collectionPage.trailsAndMap.openMap();
    await map.goTo(43.01415572012757,6.39906406402588,16);

    const mapRect = await map.getMapPosition();
    let found = false;
    const startX = Math.floor(mapRect.x + (mapRect.w / 2) - 15);
    const startY = Math.floor(mapRect.y + (mapRect.h / 2) - 25);
    for (let x = startX; x < startX + 25; x += 5) {
      for (let y = startY; y < startY + 30; y += 5) {
        await browser.action('pointer').move({x, y, origin: 'viewport'}).pause(100).down().pause(10).up().perform();
        if (await map.markers.length) {
          found = true;
          break;
        }
      }
      if (found) break;
    }
    expect(found).toBeTrue();
  });

  it('End', async () => await App.end());

});
