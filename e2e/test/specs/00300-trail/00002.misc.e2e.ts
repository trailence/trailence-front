import { App } from '../../app/app';
import { TrailPage } from '../../app/pages/trail-page';

describe('Trail page', () => {

  let trailPage: TrailPage;

  it('Login and go to trail page', async () => {
    App.init();
    const loginPage = await App.start();
    await loginPage.loginAndWaitMyTrailsCollection();
    const menu = await App.openMenu();
    const collectionPage = await menu.openCollection('Test Trail');
    const trailsList = await collectionPage.trailsAndMap.openTrailsList();
    const trail = await trailsList.waitTrail('My test trail');
    expect(trail).toBeDefined();
    trailPage = await trailsList.openTrail(trail);
  });

  it('Edit tools present on desktop mode', async () => {
    if (App.config.mode === 'desktop') {
      expect(await trailPage.trailComponent.hasTabs()).toBeFalse();
      expect(await trailPage.trailComponent.hasEditTools()).toBeTrue();

      const tools = await trailPage.trailComponent.openEditTools();
      await tools.close();
    } else {
      expect(await trailPage.trailComponent.hasTabs()).toBeTrue();
      expect(await trailPage.trailComponent.hasEditTools()).toBeFalse();
    }
  });

  it('Interaction with elevation graph', async () => {
    const map = await trailPage.trailComponent.openMap();
    const graph = await trailPage.trailComponent.showElevationGraph();
    // mouse over graph => tooltip should be displayed
    await browser.action('pointer').move({x: 25, y: 25, origin: await graph.getElement().$('canvas').getElement()}).pause(10).perform();
    await browser.waitUntil(() => graph.tooltip.isDisplayed());
    // mouse out => tooltip should be removed
    await browser.action('pointer').move({x: 1, y: 1, origin: 'viewport'}).pause(10).perform();
    await browser.waitUntil(() => graph.tooltip.isDisplayed().then(d => !d));

    // selection on graph
    await browser.action('pointer')
      .move({x: 50, y: 25, origin: await graph.getElement().$('canvas').getElement()})
      .pause(10)
      .down()
      .pause(10)
      .move({x: 100, y: 25, origin: await graph.getElement().$('canvas').getElement()})
      .pause(10)
      .up()
      .perform();
    // zoom button should be displayed
    await browser.waitUntil(() => graph.zoomButton.isDisplayed());
    // map should contain the selection
    await browser.waitUntil(() => map.paths.map(p => p.getAttribute('stroke')).then(p => p.indexOf('rgba(0,0,255,1)') >= 0));
    let zoom = await browser.getUrl();
    zoom = zoom.substring(zoom.indexOf('zoom=') + 5);
    zoom = zoom.substring(0, zoom.indexOf('&'));
    // zoom on selection
    await graph.zoomButton.click();
    await browser.waitUntil(() => browser.getUrl().then(url => {
      let zoom2 = url.substring(url.indexOf('zoom=') + 5);
      zoom2 = zoom2.substring(0, zoom2.indexOf('&'));
      return zoom2 !== zoom;
    }));
    // unzoom
    await graph.zoomButton.click();
    await browser.waitUntil(() => browser.getUrl().then(url => {
      let zoom2 = url.substring(url.indexOf('zoom=') + 5);
      zoom2 = zoom2.substring(0, zoom2.indexOf('&'));
      return zoom2 === zoom;
    }));
    // click on graph to remove selection
    await browser.action('pointer').move({x: 40, y: 25, origin: await graph.getElement().$('canvas').getElement()}).pause(10).down().pause(10).up().perform();
    await browser.waitUntil(() => graph.zoomButton.isDisplayed().then(d => !d));
    // map should not contain selection anymore
    await browser.waitUntil(() => map.paths.map(p => p.getAttribute('stroke')).then(p => p.indexOf('rgba(0,0,255,1)') < 0));
  });

});
