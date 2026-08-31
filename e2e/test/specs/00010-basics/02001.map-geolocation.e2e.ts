import { App } from '../../app/app';
import { TrailsPage } from '../../app/pages/trails-page';

describe('Locate me on map', () => {

  let myTrailsPage: TrailsPage;

  it('Login', async () => {
    await browser.emulate('geolocation', {latitude: 9.157015, longitude: 124.669407, accuracy: 100, altitude: 140, altitudeAccuracy: 50 });
    App.init();
    myTrailsPage = await App.startLoginIfNeeded();
    await browser.waitUntil(() => myTrailsPage.header.getTitle().then(title => title === 'My trails'));
    await browser.execute(() => {
      window.navigator.geolocation.watchPosition = function() {
        return 1;
      }
      window.navigator.geolocation.clearWatch = function() {
        // nothing
      }
    });
  });

  it('Locate me', async () => {
    const map = await myTrailsPage.trailsAndMap.openMap();
    await map.waitReady();
    await browser.waitUntil(() => map.getGeolocationMarker().isDisplayed().then(d => !d));
    expect(await map.hasCenterOnGeolocation()).toBeFalse();
    await map.toggleGeolocation();
    await browser.waitUntil(() => map.getGeolocationMarker().isDisplayed());
    expect(await map.hasCenterOnGeolocation()).toBeTrue();
    await map.centerOnGeolocation();
    await map.toggleGeolocation();
    await browser.waitUntil(() => map.getGeolocationMarker().isDisplayed().then(d => !d));
    expect(await map.hasCenterOnGeolocation()).toBeFalse();
  });

  it('End', async () => {
    await App.end();
  });

});
