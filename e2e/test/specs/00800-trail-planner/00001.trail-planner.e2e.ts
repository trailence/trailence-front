import { App } from '../../app/app';
import { Page } from '../../app/pages/page';
import { TrailPlannerPage } from '../../app/pages/trail-planner-page';
import { HeaderComponent } from '../../components/header.component';
import { MapComponent } from '../../components/map.component';
import { TestUtils } from '../../utils/test-utils';

describe('Trail Planner', () => {

  let page: TrailPlannerPage;

  it('Login, import gpx and go to trail planner page', async () => {
    App.init();
    await App.startLoginIfNeeded();
    let menu = await App.openMenu();
    const collectionPage = await menu.addCollection('Wish list');
    expect(await collectionPage.header.getTitle()).toBe('Wish list');
    const trailsList = await collectionPage.trailsAndMap.openTrailsList();
    await trailsList.importFile('./test/assets/saint-honorat.gpx');
    const alert = await App.waitAlert();
    await alert.clickButtonWithRole('cancel');
    await alert.waitNotDisplayed();
    const trail = await trailsList.waitTrail('Île Saint-Honorat');
    expect(trail).toBeDefined();

    menu = await App.openMenu();
    page = await menu.openTrailPlanner();
  });

  let map: MapComponent;

  it('Start on Saint Honorat', async () => {
    expect(await page.needZoom()).toBeTrue();
    await browser.waitUntil(() => $('app-map div.leaflet-map-pane div.leaflet-tile-container img').isExisting());
    map = page.map;
    if (App.config.mode === 'mobile')
      await map.goTo(43.497514901391675,7.046356201171876, 14);
    else
      await map.goTo(43.50748766288276,7.047182321548463, 16);
    await browser.waitUntil(() => page.needZoom().then(n => !n));
  });

  it('I can see the imported trail', async () => {
    expect(await map.getPathsWithClass('track-path').length).toBe(0);
    await page.setDisplayMyTrails(true);
    await browser.waitUntil(() => map.getPathsWithClass('track-path').length.then(nb => nb === 1));
    await page.setDisplayMyTrails(false);
    await browser.waitUntil(() => map.getPathsWithClass('track-path').length.then(nb => nb === 0));
  });

  const putAnchor = async (pathIndex: number, currentMarkers: number) => {
    const path = (await map.getPathsWithClass('track-path').filter(e => e.getAttribute('stroke').then(s => s === '#0000FF80'))).at(pathIndex);
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

  it('Start, put a first point and pause', async () => {
    await page.start();
    await browser.waitUntil(() => map.getPathsWithClass('track-path').length.then(nb => nb > 0));
    await putAnchor(0, 0);
    await page.stop();
    await browser.waitUntil(() => map.getPathsWithClass('track-path').length.then(nb => nb === 1));
  });


  it('Resume and put another point', async () => {
    await page.resume();
    await browser.waitUntil(() => map.getPathsWithClass('track-path').length.then(nb => nb > 1));
    await putAnchor(0, 1);
    await TestUtils.waitFor(
      async () => parseInt((await page.getDistance()).replace(',', '').replace('.', '')),
      d => { if (d <= 10) throw new Error('Expect distance to be greater than 10'); }
    );
  });

  it('Stop, save, and finally delete collection', async () => {
    await page.stop();
    await page.save('Good trail', 'Wish list');
    const appMenu = await TestUtils.retry(async () =>
      await new HeaderComponent(await Page.getActivePageElement()).openAppMenu()
    , 2, 2000);
    const trailsPage = await appMenu.openCollection('Wish list');
    const list = await trailsPage.trailsAndMap.openTrailsList();
    await list.waitTrail('Good trail');
    await list.waitTrail('Île Saint-Honorat');
    await (await trailsPage.header.openActionsMenu()).clickItemWithText('Delete');
    await (await App.waitAlert()).clickButtonWithRole('danger');
    await App.waitNoProgress();
  });

  it('End', async () => await App.end());
});
