import { App } from '../../app/app';
import { PreferencesPage } from '../../app/pages/preferences-page';
import { TrailPage } from '../../app/pages/trail-page';
import { TrailsPage } from '../../app/pages/trails-page';
import { PhotosComponent } from '../../components/photos.component';
import { TestUtils } from '../../utils/test-utils';

describe('Trail Page', () => {

  let trailPage: TrailPage;

  it('Login, create collection, and import gpx', async () => {
    App.init();
    await App.startLoginIfNeeded();
    const menu = await App.openMenu();
    const collectionPage = await menu.addCollection('Test Trail');
    expect(await collectionPage.header.getTitle()).toBe('Test Trail');
    const trailsList = await collectionPage.trailsAndMap.openTrailsList();
    await trailsList.importFile('./test/assets/gpx-001.gpx');
    const trail = await trailsList.waitTrail('Randonnée du 05/06/2023 à 08:58');
    expect(trail).toBeDefined();
    trailPage = await trailsList.openTrail(trail);
  });

  it('Edit trail name', async () => {
    await browser.waitUntil(() => trailPage.header.getTitle().then(title => title === 'Randonnée du 05/06/2023 à 08:58'));
    const menu = await trailPage.header.openActionsMenu()
    await menu.clickItemWithIcon('edit-text');
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

  it('Synchronize', async () => {
    await App.synchronize();
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
    tags = await TestUtils.waitFor(() => trailPage.trailComponent.getTags(), tags => { if (tags.length !== 1) throw new Error('Expect 1 tag, found: ' + tags.length); });
    expect(tags.indexOf('Beautiful') >= 0).toBeTrue();
  });

  it('Interaction with elevation graph', async () => {
    const map = await trailPage.trailComponent.openMap();
    let graph = await trailPage.trailComponent.showElevationGraph();
    let pos = await graph.getElement().$('canvas').getLocation();
    // mouse over graph => tooltip should be displayed
    await TestUtils.retry(async (trial) => {
      await browser.action('pointer').move({x: pos.x + 75 + trial, y: pos.y + 25 + trial, origin: 'viewport'}).pause(10).perform();
      await browser.waitUntil(() => graph.tooltip.isDisplayed(), {timeout: 5000});
    }, 2, 100);
    // mouse out => tooltip should be removed
    await browser.action('pointer').move({x: 1, y: 1, origin: 'viewport'}).pause(10).perform();
    await browser.waitUntil(() => graph.tooltip.isDisplayed().then(d => !d));

    // selection on graph
    await TestUtils.retry(async () => {
      await browser.action('pointer')
        .move({x: pos.x + 75, y: pos.y + 25, origin: 'viewport'})
        .pause(10)
        .down()
        .pause(10)
        .move({x: pos.x + 150, y: pos.y + 25, origin: 'viewport'})
        .pause(10)
        .up()
        .perform();
      // zoom button should be displayed
      await browser.waitUntil(() => graph.zoomButton.isDisplayed());
      // map should contain the selection
      await browser.waitUntil(() => map.getPathsWithClass('track-path').map(p => p.getAttribute('stroke')).then(p => p.indexOf('#E0E000C0') >= 0));
    }, 3, 100);
    let zoom = await map.getZoom();
    await map.zoomTo(zoom - 1);
    zoom--;
    // zoom on selection
    await graph.zoomButton.click();
    await browser.waitUntil(() => map.getZoom().then(z => {
      return z !== zoom;
    }));
    // unzoom
    graph = await trailPage.trailComponent.showElevationGraph();
    await graph.zoomButton.click();
    // click on graph to remove selection
    graph = await trailPage.trailComponent.showElevationGraph();
    pos = await graph.getElement().$('canvas').getLocation();
    await browser.action('pointer').move({x: pos.x + 90, y: pos.y + 25, origin: 'viewport'}).pause(10).down().pause(10).up().perform();
    await browser.waitUntil(() => graph.zoomButton.isDisplayed().then(d => !d));
    // map should not contain selection anymore
    await browser.waitUntil(() => map.getPathsWithClass('track-path').map(p => p.getAttribute('stroke')).then(p => p.indexOf('#E0E000C0') < 0));
  });

  it('Go to departure', async () => {
    const currentWin = await browser.getWindowHandle();
    const wins = await browser.getWindowHandles();
    await trailPage.trailComponent.goToDeparture();
    await browser.waitUntil(() => browser.getWindowHandles().then(h => h.length === wins.length + 1));
    const newWins = await browser.getWindowHandles();
    await browser.switchToWindow(newWins[newWins.length - 1]);
    await browser.waitUntil(() => browser.getUrl().then(url => url.indexOf('google') > 0 && url.indexOf('maps') > 0));
    const url = await browser.getUrl();
    expect(url).toContain('google');
    expect(url).toContain('maps');
    await browser.closeWindow();
    await browser.waitUntil(() => browser.getWindowHandles().then(h => h.length === wins.length));
    await browser.switchToWindow(currentWin);
  });

  let photosComponent: PhotosComponent;

  it('Import PNG', async () => {
    photosComponent = await trailPage.trailComponent.openPhotos();
    await photosComponent.addPhoto('test.png');
    await browser.waitUntil(() => photosComponent.getPhotosContainers().length.then(nb => nb === 1));
    let photos = await photosComponent.collectPhotosInfos();
    expect(photos.size).toBe(1);
    expect(photos.get('test.png')).toBeDefined();
  });

  it('Import JPEG with date', async () => {
    await photosComponent.addPhoto('20230605_101849.jpg');
    await browser.waitUntil(() => photosComponent.getPhotosContainers().length.then(nb => nb === 2));
    await browser.waitUntil(async () => {
      let photos = await photosComponent.collectPhotosInfos();
      return photos.size === 2 &&
        photos.get('20230605_101849.jpg') &&
        photos.get('20230605_101849.jpg')!.metadata.get('date') === '6/5/2023 10:18 AM' &&
        (photos.get('20230605_101849.jpg')!.metadata.get('file')?.indexOf('KB') ?? -1) > 0;
    });
  });

  it('Import JPEG with date and geolocation', async () => {
    await photosComponent.addPhoto('20240823_123625.jpg');
    await browser.waitUntil(() => photosComponent.getPhotosContainers().length.then(nb => nb === 3));
    let photos = await photosComponent.collectPhotosInfos();
    expect(photos.size).toBe(3);
    expect(photos.get('20240823_123625.jpg')).toBeDefined();
    expect(photos.get('20240823_123625.jpg')?.metadata.get('date')).toBe('8/23/2024 12:36 PM');
    const location = photos.get('20240823_123625.jpg')!.metadata.get('location')!;
    expect(location).toBeDefined();
    const i = location.indexOf(' ');
    expect(i).toBeGreaterThan(0);
    const lat = location.substring(0, i);
    const lng = location.substring(i + 1);
    expect(lat.startsWith('44.11416')).toBeTrue();
    expect(lng.startsWith('7.18805')).toBeTrue();
  });

  it('Remove third photo', async() => {
    await photosComponent.selectPhotoByDescription('20240823_123625.jpg');
    await photosComponent.removeSelected();
    await browser.waitUntil(() => photosComponent.getPhotosContainers().length.then(nb => nb === 2));
  });

  it('Move second to first', async() => {
    expect(await photosComponent.getIndexByDescription('20230605_101849.jpg')).toBe(2);
    const index = await TestUtils.retry(async () => {
      try { await photosComponent.moveUpByDescription('20230605_101849.jpg'); }catch (_) {}
      const result = await photosComponent.getIndexByDescription('20230605_101849.jpg');
      if (result != 1) throw Error('Expect photo to be first');
      return result;
    }, 10, 1000);
    expect(index).toBe(1);
  });

  it('Set cover description', async () => {
    await photosComponent.setDescription('20230605_101849.jpg', 'A nice picture');
    expect(await photosComponent.getIndexByDescription('A nice picture')).toBe(1);
  });

  it('Open slider on first photo', async () => {
    const slider = await photosComponent.openSliderByDescription('A nice picture');
    expect(await slider.slider.moveNextButton.isEnabled()).toBeTrue();
    expect(await slider.slider.movePreviousButton.isEnabled()).toBeFalse();
    await slider.close();
  });

  it('Open slider on second photo', async () => {
    const slider = await photosComponent.openSliderByDescription('test.png');
    await TestUtils.retry(async () => {
      if ((await slider.slider.moveNextButton.isEnabled()) !== false) throw new Error('Expected next button to be disabled');
      if ((await slider.slider.movePreviousButton.isEnabled()) !== true) throw new Error('Expected previous button to be enabled');
    }, 10, 100);
    await slider.slider.movePreviousButton.click();
    await TestUtils.retry(async () => {
      if ((await slider.slider.moveNextButton.isEnabled()) !== true) throw new Error('Expected next button to be enabled');
      if ((await slider.slider.movePreviousButton.isEnabled()) !== false) throw new Error('Expected previous button to be disabled');
    }, 10, 100);
    await slider.slider.moveNextButton.click();
    await TestUtils.retry(async () => {
      if ((await slider.slider.moveNextButton.isEnabled()) !== false) throw new Error('Expected next button to be disabled');
      if ((await slider.slider.movePreviousButton.isEnabled()) !== true) throw new Error('Expected previous button to be enabled');
    }, 10, 100);
    await slider.close();
    await App.synchronize();
  });

  it('Show photos on map', async () => {
    let map = await trailPage.trailComponent.openMap();
    // fit bounds and ensure no selected point
    await map.fitBounds();
    const pos = await map.getElement().getLocation();
    await browser.action('pointer')
      .move({x: pos.x + 55, y: pos.y + 10, origin: 'viewport'})
      .pause(10)
      .down()
      .pause(10)
      .up()
      .perform();
    await TestUtils.waitFor(() => map.markers.length, nb => {if (nb !== 1) throw new Error('Expected 1 marker, found: ' + nb)});

    await trailPage.trailComponent.toggleShowPhotosOnMap();
    await TestUtils.waitFor(() => map.markers.length, nb => {if (nb !== 2) throw new Error('Expected 2 markers, found: ' + nb)});
    await trailPage.trailComponent.toggleShowPhotosOnMap();
    await TestUtils.waitFor(() => map.markers.length, nb => {if (nb !== 1) throw new Error('Expected 1 marker, found: ' + nb)});
  });

  it('Clear files on preferences page', async () => {
    await (await trailPage.header.openUserMenu()).clickByLabel('Preferences');
    const prefs = new PreferencesPage();
    await prefs.waitDisplayed();
    const sizes = await TestUtils.retry(async () => {
      const sizes = await prefs.getPhotosSizes();
      if (sizes.length !== 2 || sizes[0] === '0 Bytes' || sizes[1] !== '0 Bytes') throw Error();
      return sizes;
    }, 3, 2500);
    expect(sizes.length).toBe(2);
    expect(sizes[0]).not.toBe('0 Bytes');
    expect(sizes[1]).toBe('0 Bytes');
    await App.synchronize();
    await TestUtils.retry(async () => {
      await prefs.removeAllPhotos();
      await browser.waitUntil(() => prefs.getPhotosSizes().then(s => {
        if (s.length === 2 && s[0] === '0 Bytes' && s[1] === '0 Bytes') return true;
        return false;
      }), { timeout: 5000 });
    }, 5, 5000);

    const menu = await App.openMenu();
    const collectionPage = await menu.openCollection('Test Trail');
    const trailsList = await collectionPage.trailsAndMap.openTrailsList();
    trailPage = await trailsList.openTrailByName('My test trail');
    photosComponent = await trailPage.trailComponent.openPhotos();
    await browser.waitUntil(() => photosComponent.getPhotosContainers().length.then(nb => nb === 2));
  });

  it('Delete collection and synchronize', async () => {
    const menu = await App.openMenu();
    const collectionPage = await menu.openCollection('Test Trail');
    expect(await collectionPage.header.getTitle()).toBe('Test Trail');
    const collectionMenu = await collectionPage.header.openActionsMenu();
    await collectionMenu.clickItemWithText('Delete');
    const alert = await App.waitAlert();
    await alert.clickButtonWithRole('danger');
    const newPage = new TrailsPage();
    await newPage.waitDisplayed();
    await newPage.header.getElement().waitForDisplayed();
    expect(await newPage.header.getTitle()).toBe('My trails');
    await App.synchronize();
  });

  it('End', async () => await App.end());
});
