import { App } from '../../app/app';
import { Page } from '../../app/pages/page';
import { TrailPlannerPage } from '../../app/pages/trail-planner-page';
import { TrailsPage } from '../../app/pages/trails-page';
import { CollectionModal } from '../../components/collection.modal';
import { HeaderComponent } from '../../components/header.component';
import { MapComponent } from '../../components/map.component';
import { TestUtils } from '../../utils/test-utils';

describe('Trail Planner', () => {

  let page: TrailPlannerPage;

  it('Login, search on Osm, copy the trail, and go to trail planner page', async () => {
    App.init();
    const loginPage = await App.start();
    const myTrailsPage = await loginPage.loginAndWaitMyTrailsCollection();
    await browser.waitUntil(() => myTrailsPage.header.getTitle().then(title => title === 'My Trails'));
    let menu = await App.openMenu();
    const trailFinder = await menu.openTrailFinder();

    const map = await trailFinder.trailsAndMap.openMap();
    if (App.config.mode === 'mobile')
      await map.goTo(43.497514901391675,7.046356201171876, 14);
    else
      await map.goTo(43.50748766288276,7.047182321548463, 16);

    await trailFinder.searchSources.selectByText('Open Street Map');
    await trailFinder.searchButton.click();
    const list = await trailFinder.trailsAndMap.openTrailsList();
    await browser.waitUntil(() => list.items.length.then(nb => nb > 0), { timeout: 45000 });
    const trail = await list.waitTrail('Île Saint-Honorat');
    await trail.selectTrail();
    const selectionMenu = await list.openSelectionMenu();
    await selectionMenu.clickItemWithText('Copy into...');
    await selectionMenu.getElement().$('ion-list-header').waitForDisplayed();
    await selectionMenu.clickItemWithText('New collection...');
    const newCollectionModal = new CollectionModal(await App.waitModal());
    await newCollectionModal.setName('Wish list');
    await newCollectionModal.clickCreate();
    await browser.waitUntil(() => newCollectionModal.notDisplayed());

    menu = await App.openMenu();
    page = await menu.openTrailPlanner();
  });

  let map: MapComponent;

  it('Start on Saint Honorat', async () => {
    expect(await page.needZoom()).toBeTrue();
    await browser.waitUntil(() => $('app-map div.leaflet-map-pane div.leaflet-tile-container img').isExisting());
    map = page.map;
    if (App.config.mode === 'mobile')
      await map.goTo(43.50149953433722,7.046613693237306, 14);
    else
      await map.goTo(43.50748766288276,7.047182321548463, 16);
    await browser.waitUntil(() => page.needZoom().then(n => !n));
  });

  it('I can see the trail imported from Osm', async () => {
    expect(await map.paths.length).toBe(0);
    await page.setDisplayMyTrails(true);
    await browser.waitUntil(() => map.paths.length.then(nb => nb === 1));
    await page.setDisplayMyTrails(false);
    await browser.waitUntil(() => map.paths.length.then(nb => nb === 0));
  });

  const putAnchor = async (pathIndex: number, currentMarkers: number) => {
    const path = (await map.paths.filter(e => e.getAttribute('stroke').then(s => s === '#0000FF80'))).at(pathIndex);
    const pos = await map.getPathPosition(path!);
    for (let x = Math.floor(pos.x); x < pos.x + pos.w; x += 5) {
      for (let y = Math.floor(pos.y); y < pos.y + pos.h; y += 5) {
        await browser.action('pointer').move({x, y, origin: 'viewport'}).pause(10).perform();
        if ((await map.markers.length) <= currentMarkers) continue;
        await browser.action('pointer').move({x, y, origin: 'viewport'}).pause(10).down().pause(50).up().perform();
        return;
      }
    }
    if (pathIndex > 2) throw Error('Cannot click on a path');
    await putAnchor(pathIndex + 1, currentMarkers);
  };

  it('Start and put 2 points', async () => {
    await page.start();
    await browser.waitUntil(() => map.paths.length.then(nb => nb > 0));
    await putAnchor(0, 0);
    await page.stop();
    await browser.waitUntil(() => map.paths.length.then(nb => nb === 1));
    await page.resume();
    await browser.waitUntil(() => map.paths.length.then(nb => nb > 1));
    await putAnchor(0, 1);
    let distance = await TestUtils.waitFor(async () => parseInt((await page.getDistance()).replace(',', '').replace('.', '')), d => d > 1000);
    expect(distance).toBeGreaterThan(1000);
  });

  it('Stop, save, and finally delete collection', async () => {
    await page.stop();
    await page.save('Good trail', 'Wish list');
    (await new HeaderComponent(await Page.getActivePageElement()).openAppMenu()).openCollection('Wish list');
    const trailsPage = new TrailsPage();
    await trailsPage.waitDisplayed();
    const list = await trailsPage.trailsAndMap.openTrailsList();
    await list.waitTrail('Good trail');
    await list.waitTrail('Île Saint-Honorat');
    await (await trailsPage.header.openActionsMenu()).clickItemWithText('Delete');
    await (await App.waitAlert()).clickButtonWithRole('danger');
    await App.synchronize();
  });

});
