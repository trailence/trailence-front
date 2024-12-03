import { App } from '../../app/app';
import { TrailPlannerPage } from '../../app/pages/trail-planner-page';

describe('Trail Planner', () => {

  let page: TrailPlannerPage;

  it('Login and go to trail planner page', async () => {
    App.init();
    const loginPage = await App.start();
    const myTrailsPage = await loginPage.loginAndWaitMyTrailsCollection();
    await browser.waitUntil(() => myTrailsPage.header.getTitle().then(title => title === 'My Trails'));
    const menu = await App.openMenu();
    page = await menu.openTrailPlanner();
  });

  it('Zoom to start', async () => {
    expect(await page.needZoom()).toBeTrue();
    await browser.waitUntil(() => $('app-map div.leaflet-map-pane div.leaflet-tile-container img').isExisting());
    await browser.pause(1000);
    await browser.execute(() => window.location.hash = '#zoom=14&center=43.72344388187324,6.966876983642579');
    await browser.waitUntil(() => page.needZoom().then(n => !n));
    await page.setDisplayMyTrails(true);
    await page.setDisplayCircuits(true);
    await browser.waitUntil(() => page.circuitsItems.length.then(nb => nb > 0));
    const map = page.map;
    await browser.waitUntil(() => map.paths.getElements().then(elements => elements.find(e => e.getAttribute('stroke').then(s => s === '#FF00FF80')).then(result => !!result)));
    await page.setDisplayCircuits(false);
    await page.setDisplayMyTrails(false);
    await browser.execute(() => window.location.hash = '#zoom=7&center=43.72344388187324,6.966876983642579');
    await browser.waitUntil(() => page.needZoom());
    await browser.pause(1000);
    await browser.execute(() => window.location.hash = '#zoom=16&center=43.7128128047139,6.904070377349854');
    await browser.waitUntil(() => page.needZoom().then(n => !n));
    await page.start();
    await browser.waitUntil(() => map.paths.getElements().then(elements => elements.find(e => e.getAttribute('stroke').then(s => s === '#0000FF80')).then(result => !!result)));
    const mapRect = await map.getMapPosition();
    let found = false;
    for (let x = Math.floor(mapRect.x) + 200; x < mapRect.x + mapRect.w - 200; x += 10) {
      for (let y = Math.floor(mapRect.y) + 200; y < mapRect.y + mapRect.h - 200; y += 5) {
        await browser.action('pointer').move({x, y, origin: 'viewport'}).pause(10).perform();
        if ((await map.markers.length) > 0) {
          await browser.action('pointer').move({x, y, origin: 'viewport'}).pause(10).down().pause(50).up().perform();
          for (let x2 = x + 100; x2 < x + 200; x2 += 10) {
            for (let y2 = y - 25; y2 < y + 25; y2 += 5) {
              await browser.action('pointer').move({x: x2, y: y2, origin: 'viewport'}).pause(10).perform();
              if ((await map.markers.length) > 1) {
                await browser.action('pointer').move({x: x2, y: y2, origin: 'viewport'}).pause(10).down().pause(50).up().perform();
                found = true;
                break;
              }
            }
            if (found) break;
          }
          found = true;
          break;
        }
      }
      if (found) break;
    }
    expect(found).toBeTrue();
    let distance = parseInt((await page.getDistance()).replace(',', '').replace('.', ''));
    expect(distance).toBeGreaterThan(100);
  });

});
