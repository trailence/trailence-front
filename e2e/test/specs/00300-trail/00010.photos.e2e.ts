import { App } from '../../app/app';
import { PreferencesPage } from '../../app/pages/preferences-page';
import { TrailPage } from '../../app/pages/trail-page';
import { TrailsPage } from '../../app/pages/trails-page';
import { PhotosPopup } from '../../components/photos-popup.component';
import { TestUtils } from '../../utils/test-utils';

describe('Trail - Photos', () => {

  let trailPage: TrailPage;

  it('Login and go to trail', async () => {
    App.init();
    const loginPage = await App.start();
    const myTrailsPage = await loginPage.loginAndWaitMyTrailsCollection();
    await browser.waitUntil(() => myTrailsPage.header.getTitle().then(title => title === 'My Trails'));
    const menu = await App.openMenu();
    const collectionPage = await menu.openCollection('Test Trail');
    expect(await collectionPage.header.getTitle()).toBe('Test Trail');
    const trailsList = await collectionPage.trailsAndMap.openTrailsList();
    const trail = await trailsList.waitTrail('My test trail');
    expect(trail).toBeDefined();
    trailPage = await trailsList.openTrail(trail);
  });

  let photosPopup: PhotosPopup;

  it('Import PNG', async () => {
    photosPopup = await trailPage.trailComponent.openPhotos();
    await photosPopup.addPhoto('test.png');
    await browser.waitUntil(() => photosPopup.getPhotosContainers().length.then(nb => nb === 1));
    let photos = await photosPopup.collectPhotosInfos();
    expect(photos.size).toBe(1);
    expect(photos.get('test.png')).toBeDefined();
  });

  it('Import JPEG with date', async () => {
    await photosPopup.addPhoto('20230605_101849.jpg');
    await browser.waitUntil(() => photosPopup.getPhotosContainers().length.then(nb => nb === 2));
    await browser.waitUntil(async () => {
      let photos = await photosPopup.collectPhotosInfos();
      return photos.size === 2 &&
        photos.get('20230605_101849.jpg') &&
        photos.get('20230605_101849.jpg')!.metadata.get('date') === '6/5/2023 10:18 AM' &&
        (photos.get('20230605_101849.jpg')!.metadata.get('file')?.indexOf('KB') ?? -1) > 0;
    });
  });

  it('Import JPEG with date and geolocation', async () => {
    await photosPopup.addPhoto('20240823_123625.jpg');
    await browser.waitUntil(() => photosPopup.getPhotosContainers().length.then(nb => nb === 3));
    let photos = await photosPopup.collectPhotosInfos();
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
    await photosPopup.selectPhotoByDescription('20240823_123625.jpg');
    await photosPopup.removeSelected();
    await browser.waitUntil(() => photosPopup.getPhotosContainers().length.then(nb => nb === 2));
  });

  it('Move second to first', async() => {
    expect(await photosPopup.getIndexByDescription('20230605_101849.jpg')).toBe(2);
    await photosPopup.moveUpByDescription('20230605_101849.jpg');
    const index = await TestUtils.retry(async () => {
      const result = await photosPopup.getIndexByDescription('20230605_101849.jpg');
      if (result != 1) throw Error('Expect photo to be first');
      return result;
    }, 2, 1000);
    expect(index).toBe(1);
  });

  it('Set cover description', async () => {
    await photosPopup.setDescription('20230605_101849.jpg', 'A nice picture');
    expect(await photosPopup.getIndexByDescription('A nice picture')).toBe(1);
  });

  it('Open slider on first photo', async () => {
    const slider = await photosPopup.openSliderByDescription('A nice picture');
    expect(await slider.slider.moveNextButton.isEnabled()).toBeTrue();
    expect(await slider.slider.movePreviousButton.isEnabled()).toBeFalse();
    await slider.close();
  });

  it('Open slider on second photo', async () => {
    const slider = await photosPopup.openSliderByDescription('test.png');
    expect(await slider.slider.moveNextButton.isEnabled()).toBeFalse();
    expect(await slider.slider.movePreviousButton.isEnabled()).toBeTrue();
    await slider.slider.movePreviousButton.click();
    expect(await slider.slider.moveNextButton.isEnabled()).toBeTrue();
    expect(await slider.slider.movePreviousButton.isEnabled()).toBeFalse();
    await slider.slider.moveNextButton.click();
    expect(await slider.slider.moveNextButton.isEnabled()).toBeFalse();
    expect(await slider.slider.movePreviousButton.isEnabled()).toBeTrue();
    await slider.close();
    await photosPopup.close();
  });

  it('Show photos on map', async () => {
    let map = await trailPage.trailComponent.openMap();
    expect(await map.markers.length).toBe(1);
    await trailPage.trailComponent.toggleShowPhotosOnMap();
    map = await trailPage.trailComponent.openMap();
    await browser.waitUntil(() => map.markers.length.then(nb => nb === 2));
    await trailPage.trailComponent.toggleShowPhotosOnMap();
    map = await trailPage.trailComponent.openMap();
    await browser.waitUntil(() => map.markers.length.then(nb => nb === 1));
  });

  it('Clear files on preferences page', async () => {
    await (await trailPage.header.openUserMenu()).clickByLabel('Preferences');
    const prefs = new PreferencesPage();
    await prefs.waitDisplayed();
    const sizes = await prefs.getPhotosSizes();
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
    photosPopup = await trailPage.trailComponent.openPhotos();
    await browser.waitUntil(() => photosPopup.getPhotosContainers().length.then(nb => nb === 2));
    await photosPopup.close();
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
    expect(await newPage.header.getTitle()).toBe('My Trails');
    await App.synchronize();
  });

  it('End', async () => await App.end());
});
