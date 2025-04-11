import { App } from '../../app/app';
import { TrailsPage } from '../../app/pages/trails-page';

describe('Collection map', () => {

  let collectionPage: TrailsPage;

  it('Login and go to Test import collection', async () => {
    App.init();
    const loginPage = await App.start();
    await loginPage.loginAndWaitMyTrailsCollection();
    const menu = await App.openMenu();
    collectionPage = await menu.openCollection('Test Import');
    expect(await collectionPage.header.getTitle()).toBe('Test Import');
  });

  it('Map bubbles', async () => {
    const map = await collectionPage.trailsAndMap.openMap();

    // map should contain only trails
    let paths = await map.paths.map(e => e.getAttribute('stroke'));
    expect(paths.length).toBeGreaterThan(0);
    expect(paths.every(p => p === 'red'));
    let bubbles = await map.markers.map(m => m.getAttribute('class'));
    expect(bubbles.length).toBe(0);

    await map.toggleBubbles();
    // map should only bubbles
    paths = await map.paths.map(e => e.getAttribute('stroke'));
    expect(paths.length).toBe(0);
    bubbles = await map.markers.map(m => m.getAttribute('class'));
    expect(bubbles.length).toBeGreaterThan(0);
    expect(bubbles.every(c => c.indexOf('bubble') >= 0));

    await map.toggleBubbles();
    // map should contain only trails
    paths = await map.paths.map(e => e.getAttribute('stroke'));
    expect(paths.length).toBeGreaterThan(0);
    expect(paths.every(p => p === 'red'));
    bubbles = await map.markers.map(m => m.getAttribute('class'));
    expect(bubbles.length).toBe(0);
  });

  it('Can select a trail from map', async () => {
    const map = await collectionPage.trailsAndMap.openMap();
    await browser.execute(() => window.location.hash = '#zoom=16&center=43.01415572012757,6.39906406402588');

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
