import { App } from '../../app/app';
import { TrailPage } from '../../app/pages/trail-page';
import { MapComponent } from '../../components/map.component';
import { FilesUtils } from '../../utils/files-utils';
import { OpenFile } from '../../utils/open-file';

describe('Map offline', () => {

  let trailPage: TrailPage;
  let map: MapComponent;

  it('Prepare scenario', async () => {
    // Login
    App.init();
    const loginPage = await App.start();
    const myTrailsPage = await loginPage.loginAndWaitMyTrailsCollection();
    await browser.waitUntil(() => myTrailsPage.header.getTitle().then(title => title === 'My Trails'));
    // import trail
    const trailsList = await myTrailsPage.trailsAndMap.openTrailsList();
    await (await trailsList.getToolbarButton('add-circle')).click();;
    await OpenFile.openFile((await FilesUtils.fs()).realpathSync('./test/assets/gpx-001.gpx'));
    const trail = await trailsList.waitTrail('Randonnée du 05/06/2023 à 08:58');
    expect(trail).toBeDefined();
    // go to trail page
    trailPage = await trailsList.openTrail(trail);
    // open details
    await trailPage.trailComponent.openDetails();
    // open map
    map = await trailPage.trailComponent.openMap();
    // open map layer
    await map.selectLayer('osm');
  });

  it('Download IGN satellite map offline until zoom 13', async () => {
    // download map offline
    await map.downloadMapOffline(['ign-sat'], 13);
  });

  it('Offline, OSM Fr cannot be loaded', async () => {
    await browser.throttleNetwork('offline');
    await browser.setNetworkConditions({ latency: 0, throughput: 0, offline: true });
    await map.selectLayer('osmfr');
    await browser.waitUntil(async () => {
      const tiles = await map.tiles.getElements();
      if (tiles.length === 0) return false;
      for (const tile of tiles) {
        const c = await tile.getAttribute('class');
        if (c.indexOf('map-tile-error') < 0) return false;
      }
      return true;
    });
    await map.selectLayer('osm');
    await map.zoomTo(11);
  });

  it('Offline, IGN satellite is available until zoom 13', async () => {
    await map.selectLayer('ign-sat');
    await browser.waitUntil(async () => {
      const tiles = await map.tiles.getElements();
      if (tiles.length === 0) return false;
      for (const tile of tiles) {
        const c = await tile.getAttribute('class');
        if (c.indexOf('map-tile-offline') >= 0) return true;
      }
      return false;
    });
  });

  it('Offline, IGN satellite fallback after zoom 13', async () => {
    await map.zoomTo(14);
    await browser.waitUntil(async () => {
      const tiles = await map.tiles.getElements();
      if (tiles.length === 0) return false;
      for (const tile of tiles) {
        const c = await tile.getAttribute('class');
        if (c.indexOf('map-tile-offline') >= 0) return false;
        if (c.indexOf('map-tile-fallback') >= 0 && c.indexOf('map-tile-fallback-2') >= 0) return true;
      }
      return false;
    });
    await map.zoomTo(15);
    await browser.waitUntil(async () => {
      const tiles = await map.tiles.getElements();
      if (tiles.length === 0) return false;
      for (const tile of tiles) {
        const c = await tile.getAttribute('class');
        if (c.indexOf('map-tile-offline') >= 0) return false;
        if (c.indexOf('map-tile-fallback') >= 0 && c.indexOf('map-tile-fallback-4') >= 0) return true;
      }
      return false;
    });
  });

  it('Back to online, fallback go to online', async () => {
    await browser.throttleNetwork('online');
    await browser.setNetworkConditions({}, 'No throttling');
    await browser.waitUntil(async () => {
      const tiles = await map.tiles.getElements();
      if (tiles.length === 0) return false;
      for (const tile of tiles) {
        const c = await tile.getAttribute('class');
        if (c.indexOf('map-tile-offline') >= 0) return false;
        if (c.indexOf('map-tile-fallback') >= 0) return false;
      }
      return true;
    });
  });

  it('Back to offline, select OSM Fr, tiles in error', async () => {
    await browser.throttleNetwork('offline');
    await browser.setNetworkConditions({ latency: 0, throughput: 0, offline: true });
    await map.selectLayer('osmfr');
    await browser.waitUntil(async () => {
      const tiles = await map.tiles.getElements();
      if (tiles.length === 0) return false;
      for (const tile of tiles) {
        const c = await tile.getAttribute('class');
        if (c.indexOf('map-tile-error') < 0) return false;
      }
      return true;
    });
  });

  it('Back to online, tiles become online', async () => {
    await browser.throttleNetwork('online');
    await browser.setNetworkConditions({}, 'No throttling');
    await browser.waitUntil(async () => {
      const tiles = await map.tiles.getElements();
      if (tiles.length === 0) return false;
      for (const tile of tiles) {
        const c = await tile.getAttribute('class');
        if (c.indexOf('map-tile-error') >= 0) return false;
      }
      return true;
    });
  });

});
