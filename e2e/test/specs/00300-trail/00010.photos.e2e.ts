import { App } from '../../app/app';
import { TrailPage } from '../../app/pages/trail-page';
import { PhotosPopup } from '../../components/photos-popup.component';

describe('Trail - Photos', () => {

  let trailPage: TrailPage;

  it('Login and go to trail', async () => {
    App.init();
    const loginPage = await App.start();
    const myTrailsPage = await loginPage.loginAndWaitMyTrailsCollection();
    expect(await myTrailsPage.header.getTitle()).toBe('My Trails');
    const menu = await App.openMenu();
    const collectionPage = await menu.openCollection('Test Trail');
    expect(await collectionPage.header.getTitle()).toBe('Test Trail');
    const trailsList = await collectionPage.trailsAndMap.openTrailsList();
    const trail = await trailsList.waitTrail('My test trail');
    expect(trail).toBeDefined();
    trailPage = await trailsList.openTrail(trail!);
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
    let photos = await photosPopup.collectPhotosInfos();
    expect(photos.size).toBe(2);
    expect(photos.get('20230605_101849.jpg')).toBeDefined();
    expect(photos.get('20230605_101849.jpg')?.metadata.get('date')).toBe('6/5/2023 10:18 AM');
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
    expect(await photosPopup.getIndexByDescription('20230605_101849.jpg')).toBe(1);
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

  it('Synchronize', async () => {
    await App.synchronize();
  });

});