import { App } from '../../app/app';
import { TrailsPage } from '../../app/pages/trails-page';

describe('Locate me on map', () => {

  let myTrailsPage: TrailsPage;

  it('Login', async () => {
    await browser.emulate('geolocation', {latitude: 9.157015, longitude: 124.669407, accuracy: 100, altitude: 140, altitudeAccuracy: 50 });
    App.init();
    const loginPage = await App.start();
    myTrailsPage = await loginPage.loginAndWaitMyTrailsCollection();
    await browser.waitUntil(() => myTrailsPage.header.getTitle().then(title => title === 'My Trails'));
    await browser.execute(() => {
      window.navigator.geolocation.watchPosition = function(success, error) {
        return 1;
      }
      window.navigator.geolocation.clearWatch = function(id) {
        // nothing
      }
    });
  });

  it('Locate me', async () => {
    const map = await myTrailsPage.trailsAndMap.openMap();
    await map.waitReady();
    await browser.waitUntil(() => map.getGeolocationMarker().isDisplayed().then(d => !d));
    expect(await map.getControl('center-on-location-tool').isDisplayed()).toBeFalse();
    await map.toggleGeolocation();
    await browser.waitUntil(() => map.getGeolocationMarker().isDisplayed());
    expect(await map.getControl('center-on-location-tool').isDisplayed()).toBeTrue();
    await map.centerOnGeolocation();
    await browser.waitUntil(() => browser.getUrl().then(url => url.indexOf('center=9.157015,124.669407') > 0));
    await map.toggleGeolocation();
    await browser.waitUntil(() => map.getGeolocationMarker().isDisplayed().then(d => !d));
    expect(await map.getControl('center-on-location-tool').isDisplayed()).toBeFalse();
  });

  it('End', async () => {
    await App.logout(false);
    await App.end();
  });

});
