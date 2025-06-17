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

  it('Interaction with elevation graph', async () => {
    const map = await trailPage.trailComponent.openMap();
    let graph = await trailPage.trailComponent.showElevationGraph();
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
    await browser.waitUntil(() => map.getPathsWithClass('track-path').map(p => p.getAttribute('stroke')).then(p => p.indexOf('#E0E000C0') >= 0));
    let zoom = await map.getZoom();
    // zoom on selection
    await graph.zoomButton.click();
    await browser.waitUntil(() => map.getZoom().then(z => {
      return z !== zoom;
    }));
    // unzoom
    graph = await trailPage.trailComponent.showElevationGraph();
    await graph.zoomButton.click();
    // click on graph to remove selection
    graph = await trailPage.trailComponent.showElevationGraph();
    await browser.action('pointer').move({x: 40, y: 25, origin: await graph.getElement(true).$('canvas').getElement()}).pause(10).down().pause(10).up().perform();
    await browser.waitUntil(() => graph.zoomButton.isDisplayed().then(d => !d));
    // map should not contain selection anymore
    await browser.waitUntil(() => map.getPathsWithClass('track-path').map(p => p.getAttribute('stroke')).then(p => p.indexOf('#E0E000C0') < 0));
  });

  it('Go to departure', async () => {
    const currentWin = await browser.getWindowHandle();
    const wins = await browser.getWindowHandles();
    await trailPage.trailComponent.goToDeparture();
    await browser.waitUntil(() => browser.getWindowHandles().then(h => h.length === wins.length + 1));
    const newWins = await browser.getWindowHandles();
    await browser.switchToWindow(newWins[newWins.length - 1]);
    await browser.waitUntil(() => browser.getUrl().then(url => url.indexOf('google') > 0 && url.indexOf('maps') > 0));
    const url = await browser.getUrl();
    expect(url).toContain('google');
    expect(url).toContain('maps');
    await browser.closeWindow();
    await browser.waitUntil(() => browser.getWindowHandles().then(h => h.length === wins.length));
    await browser.switchToWindow(currentWin);
  });

  it('End', async () => {
    await App.logout(false);
    await App.end();
  });
});
