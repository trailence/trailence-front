import { App } from '../../app/app';
import { TrailPage } from '../../app/pages/trail-page';
import { EditTools } from '../../components/edit-tools.component';
import { IonicButton } from '../../components/ionic/ion-button';
import { MapComponent } from '../../components/map.component';
import { ChainablePromiseElement} from 'webdriverio';
import { TestUtils } from '../../utils/test-utils';
import { OpenFile } from '../../utils/open-file';
import { FilesUtils } from '../../utils/files-utils';
import { TrailsPage } from '../../app/pages/trails-page';

describe('Edit tools', () => {

  let trailPage: TrailPage;
  let map: MapComponent;
  let tools: EditTools;
  let details: ChainablePromiseElement;

  it('Login, import gpx, open edit tools', async () => {
    App.init();
    const loginPage = await App.start();
    const myTrailsPage = await loginPage.loginAndWaitMyTrailsCollection();
    await browser.waitUntil(() => myTrailsPage.header.getTitle().then(title => title === 'My Trails'));
    const trailsList = await myTrailsPage.trailsAndMap.openTrailsList();
    const importButton = await trailsList.getToolbarButton('add-circle');
    await importButton.click();
    await OpenFile.openFile((await FilesUtils.fs()).realpathSync('./test/assets/gpx-001.gpx'));
    const trail = await trailsList.waitTrail('Randonnée du 05/06/2023 à 08:58');
    expect(trail).toBeDefined();
    trailPage = await trailsList.openTrail(trail);
    map = await trailPage.trailComponent.openMap();
    details = await trailPage.trailComponent.openDetails();
    tools = await trailPage.trailComponent.openEditTools();
  });

  const selectPoint = async (arrowIndex: number) => {
    const arrow = await TestUtils.retry(async () => {
      const elements = await map.paths.getElements();
      let arrowFound = 0;
      let arrow;
      for (const element of elements) {
        if ((await element.getAttribute('stroke')) === 'black') {
          if (arrowIndex === arrowFound) {
            arrow = element;
            break;
          }
          arrowFound++;
        }
      }
      if (!arrow) throw Error('Cannot find arrow index ' + arrowIndex + ' in map paths');
      return arrow;
    }, 2, 1000);
    const pos = await map.getPathPosition(arrow);
    await browser.action('pointer').move({x: Math.floor(pos.x) + 2, y: Math.floor(pos.y) + 2, origin: 'viewport'}).pause(10).down().pause(10).up().perform();
    return await tools.waitSelectionTool();
  }

  it('Add and remove a way point', async () => {
    let selectionTool = await selectPoint(5);
    await selectionTool.createWayPoint();
    await browser.waitUntil(() => details.$$('div.waypoint').length.then(nb => nb === 3));
    TestUtils.retry(async () => {
      await new IonicButton(() => details.$$('div.waypoint')[1].$('div.waypoint-actions ion-button[color=danger]')).click();
      await browser.waitUntil(() => details.$$('div.waypoint').length.then(nb => nb === 2), {timeout: 5000});
    }, 2, 500);

    selectionTool = await selectPoint(5);
    await selectionTool.createWayPoint();
    await browser.waitUntil(() => details.$$('div.waypoint').length.then(nb => nb === 3));
    selectionTool = await selectPoint(5);
    await selectionTool.removeWayPoint();
    await browser.waitUntil(() => details.$$('div.waypoint').length.then(nb => nb === 2));
  });

  it('Undo', async () => {
    await tools.undo();
    await browser.waitUntil(() => details.$$('div.waypoint').length.then(nb => nb === 3));
    await tools.undo();
    await browser.waitUntil(() => details.$$('div.waypoint').length.then(nb => nb === 2));
    await tools.undo();
    await browser.waitUntil(() => details.$$('div.waypoint').length.then(nb => nb === 3));
    await tools.undo();
    await browser.waitUntil(() => details.$$('div.waypoint').length.then(nb => nb === 2));
  });

  it('Keep a small slice, then undo', async () => {
    let selectionTool = await selectPoint(10);
    await selectionTool.goToNextPoint();
    await selectionTool.goToNextPoint();
    await selectionTool.removePointsAfter();
    selectionTool = await selectPoint(2);
    await selectionTool.goToPreviousPoint();
    await selectionTool.removePointsBefore()
    const d1 = await trailPage.trailComponent.getMetadataValueByTitle('Distance', true);
    const d2 = await trailPage.trailComponent.getMetadataValueByTitle('Distance', false);
    expect(parseInt(d1.replace('.',''))).toBeGreaterThan(parseInt(d2.replace('.','')));
    await tools.undo();
    await tools.undo();
  });

  it('Select range, delete it, then undo', async () => {
    let selectionTool = await selectPoint(10);
    await selectionTool.extendSelection();
    await selectPoint(11);
    await selectionTool.remove();
    const d1 = await trailPage.trailComponent.getMetadataValueByTitle('Distance', true);
    const d2 = await trailPage.trailComponent.getMetadataValueByTitle('Distance', false);
    expect(parseInt(d1.replace('.',''))).toBeGreaterThan(parseInt(d2.replace('.','')));
    await tools.undo();
  });

  it('Select from elevation graph, then zoom, set it is selection', async () => {
    const graph = await trailPage.trailComponent.showElevationGraph();
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
    // zoom on selection
    await graph.zoomButton.click();
    let selectionTool = await tools.waitSelectionTool();
    await selectionTool.remove();
    await tools.undo();
    await (await trailPage.trailComponent.openMap()).fitBounds();
    await browser.pause(1000); // wait for zoom animation to end
  });

  it('Change elevation from selected point, then remove unprobable elevation', async () => {
    let selectionTool = await selectPoint(10);
    const valueBefore = await selectionTool.getElevation();
    await selectionTool.setElevation(500);
    const expectDiff = Math.abs(500 - parseFloat(valueBefore));
    const ascent1 = (await trailPage.trailComponent.getMetadataValueByTitle('Ascent', true)).replace(',','').replace('+','').trim();
    const ascent2 = (await trailPage.trailComponent.getMetadataValueByTitle('Ascent', false)).replace(',','').replace('+','').trim();
    const diff = Math.abs(parseFloat(ascent1) - parseFloat(ascent2));
    expect(diff).withContext('Ascent before ' + ascent1 + ' (' + valueBefore + '), after ' + ascent2 + ' (500)').toBeLessThanOrEqual(expectDiff + 1);
    // unselect
    const pos = await (await trailPage.trailComponent.openMap()).getMapPosition();
    await browser.action('pointer').move({x: Math.floor(pos.x + 1), y: Math.floor(pos.y + 1), origin: 'viewport'}).pause(100).down().pause(10).up().perform();
    await browser.waitUntil(() =>tools.isSelectionTool().then(d => !d));

    // remove unprobable elevation
    await tools.removeUnprobableElevations();
    const ascent3 = (await trailPage.trailComponent.getMetadataValueByTitle('Ascent', false)).replace(',','').replace('+','').trim();
    const diff2 = Math.abs(parseFloat(ascent1) - parseFloat(ascent3));
    expect(diff2).withContext('Ascent before ' + ascent1 + ' (' + valueBefore + '), after ' + ascent3).toBeLessThanOrEqual(3);

    await tools.undo();
    await tools.undo();
    expect(await tools.canUndo()).toBeFalse();
  });

  it('Join departure and arrival, then undo', async () => {
    expect(await tools.canJoinArrivalToDeparture()).toBeTrue();
    await tools.joinArrivalToDeparture();
    expect(await tools.canJoinArrivalToDeparture()).toBeFalse();
    await tools.undo();
    expect(await tools.canJoinArrivalToDeparture()).toBeTrue();
    expect(await tools.canJoinDepartureToArrival()).toBeTrue();
    await tools.joinDepartureToArrival();
    expect(await tools.canJoinDepartureToArrival()).toBeFalse();
    await tools.undo();
    expect(await tools.canJoinDepartureToArrival()).toBeTrue();
  });

  it('Back to original track', async () => {
    const ascent1 = (await trailPage.trailComponent.getMetadataValueByTitle('Ascent', true)).replace(',','').replace('+','').trim();
    await tools.backToOriginalTrack();
    const ascent2 = (await trailPage.trailComponent.getMetadataValueByTitle('Ascent', true)).replace(',','').replace('+','').trim();
    await tools.undo();
    const ascent3 = (await trailPage.trailComponent.getMetadataValueByTitle('Ascent', true)).replace(',','').replace('+','').trim();
    expect(parseInt(ascent2)).toBeGreaterThan(parseInt(ascent1));
    expect(ascent3).toBe(ascent1);
  });

  it('Remove moves during breaks', async () => {
    const tool = await tools.openRemoveBreaksMoves();
    await tool.start();
    await tool.expectMoves();
    await tool.removeMoves();
    await tool.continue();
    await tool.expectEnd();
    await tool.quit();
  });

  it('Apply elevation threshold', async () => {
    const modal = await tools.openElevationThreshold();
    await modal.threshold.setValue(50);
    await modal.distance.setValue(1080);
    await (await modal.getFooterButtonWithColor('success')).click();
    await modal.waitNotDisplayed();
    await tools.undo();
  });

  it('Close edit tools, delete trail, synchronize', async () => {
    await tools.close();
    const menu = await trailPage.header.openActionsMenu();
    await menu.clickItemWithText('Delete');
    await (await App.waitAlert()).clickButtonWithRole('danger');
    await new TrailsPage().waitDisplayed();
    await App.synchronize();
  });

});
