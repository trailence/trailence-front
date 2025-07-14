import { App } from '../../app/app';
import { TrailPage } from '../../app/pages/trail-page';
import { EditTools } from '../../components/edit-tools.component';
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
    await trailsList.toolbar.clickByIcon('add-circle');
    await OpenFile.openFile((await FilesUtils.fs()).realpathSync('./test/assets/gpx-001.gpx'));
    const trail = await trailsList.waitTrail('Randonnée du 05/06/2023 à 08:58');
    expect(trail).toBeDefined();
    trailPage = await trailsList.openTrail(trail);
    details = await trailPage.trailComponent.openDetails();
    map = await trailPage.trailComponent.openMap();
    tools = await trailPage.trailComponent.openEditTools();
  });

  const selectPoint = async (arrowIndex: number) => {
    return await TestUtils.retry(async () => {
      const arrow = await TestUtils.retry(async () => {
        const elements = map.getPathsWithClass('track-arrow');
        const arrow = elements[arrowIndex];
        if (await arrow.isExisting()) return await arrow.getElement();
        throw Error('Cannot find arrow index ' + arrowIndex + ' in map paths');
      }, 2, 1000);
      const pos = await map.getPathPosition(arrow);
      await browser.action('pointer').move({x: Math.floor(pos.x) + 2, y: Math.floor(pos.y) + 2, origin: 'viewport'}).pause(10).down().pause(10).up().perform();
      return await tools.waitSelectionTool();
    }, 2, 1000);
  }

  it('Add and remove a way point', async () => {
    details = await trailPage.trailComponent.openDetails();
    await browser.waitUntil(() => details.$$('div.waypoint').length.then(nb => nb === 2));
    map = await trailPage.trailComponent.openMap();

    await selectPoint(4); // selection tool displayed, so the map won't move

    await selectPoint(5);
    await tools.createWayPoint();
    await browser.pause(1000);

    await selectPoint(7);
    await tools.createWayPoint();
    await browser.pause(1000);

    await selectPoint(5);
    await tools.removeWayPoint();
    await browser.pause(1000);

    details = await trailPage.trailComponent.openDetails();
    await browser.waitUntil(() => details.$$('div.waypoint').length.then(nb => nb === 3));
    map = await trailPage.trailComponent.openMap();
  });

  it('Undo', async () => {
    await tools.undo();
    await tools.undo();
    await tools.undo();
    details = await trailPage.trailComponent.openDetails();
    await browser.waitUntil(() => details.$$('div.waypoint').length.then(nb => nb === 2));
    map = await trailPage.trailComponent.openMap();
  });

  it('Keep a small slice, then undo', async () => {
    let selectionTool = await selectPoint(5);
    await selectionTool.goToNextPoint();
    await selectionTool.goToNextPoint();
    await tools.removePointsAfter();
    selectionTool = await selectPoint(2);
    await selectionTool.goToPreviousPoint();
    await tools.removePointsBefore()
    details = await trailPage.trailComponent.openDetails();
    const d1 = await trailPage.trailComponent.getMetadataValueByTitle('Distance', true);
    const d2 = await trailPage.trailComponent.getMetadataValueByTitle('Distance', false);
    expect(parseInt(d1.replace('.',''))).toBeGreaterThan(parseInt(d2.replace('.','')));
    map = await trailPage.trailComponent.openMap();
    await tools.undo();
    await tools.undo();
  });

  it('Select range, delete it, then undo', async () => {
    await TestUtils.retry(async () => {
      await browser.action('pointer').move({x: 1, y: 1, origin: 'viewport'}).pause(100).down().pause(100).up().perform();
      let selectionTool = await selectPoint(3);
      await selectionTool.extendSelection();
      await selectPoint(4);
      await tools.removeSelectedRangeAndReconnect();
    }, 3, 1000);
    details = await trailPage.trailComponent.openDetails();
    const d1 = await trailPage.trailComponent.getMetadataValueByTitle('Distance', true);
    const d2 = await trailPage.trailComponent.getMetadataValueByTitle('Distance', false);
    expect(parseInt(d1.replace('.',''))).toBeGreaterThan(parseInt(d2.replace('.','')));
    map = await trailPage.trailComponent.openMap();
    await tools.undo();
  });

  it('Select from elevation graph, then remove', async () => {
    const graph = await trailPage.trailComponent.showElevationGraph();
    // select a range on graph
    await browser.action('pointer')
      .move({x: 50, y: 25, origin: await graph.getElement().$('canvas').getElement()})
      .pause(10)
      .down()
      .pause(10)
      .move({x: 100, y: 25, origin: await graph.getElement().$('canvas').getElement()})
      .pause(10)
      .up()
      .perform();
    await tools.waitSelectionTool();
    await tools.removeSelectedRangeAndReconnect();
    await tools.undo();

    // select a point on graph
    await TestUtils.retry(async () => {
      await browser.action('pointer')
        .move({x: 50, y: 25, origin: await (await trailPage.trailComponent.showElevationGraph()).getElement().$('canvas').getElement()})
        .pause(10)
        .down()
        .pause(10)
        .up()
        .perform();
    }, 2, 1000);
    await tools.waitSelectionTool();
    await tools.removeSelectedPointAndReconnect();
    await tools.undo();

    await map.fitBounds();
    await browser.pause(1000); // wait for zoom animation to end
  });

  it('Change elevation from selected point, then remove unprobable elevation', async () => {
    let selectionTool = await selectPoint(3);
    const valueBefore = await selectionTool.getElevation();
    await selectionTool.setElevation(500);
    details = await trailPage.trailComponent.openDetails();
    const expectDiff = Math.abs(500 - parseFloat(valueBefore));
    const ascent1 = (await trailPage.trailComponent.getMetadataValueByTitle('Ascent', true)).replace(',','').replace('+','').trim();
    const ascent2 = (await trailPage.trailComponent.getMetadataValueByTitle('Ascent', false)).replace(',','').replace('+','').trim();
    const diff = Math.abs(parseFloat(ascent1) - parseFloat(ascent2));
    expect(diff).withContext('Ascent before ' + ascent1 + ' (' + valueBefore + '), after ' + ascent2 + ' (500)').toBeLessThanOrEqual(expectDiff + 1);
    map = await trailPage.trailComponent.openMap();
    // unselect
    const pos = await map.getMapPosition();
    await browser.action('pointer').move({x: Math.floor(pos.x + 1), y: Math.floor(pos.y + 1), origin: 'viewport'}).pause(100).down().pause(10).up().perform();
    await browser.waitUntil(() =>tools.isSelectionTool().then(d => !d));

    // remove unprobable elevation
    await tools.removeUnprobableElevations();
    details = await trailPage.trailComponent.openDetails();
    const ascent3 = (await trailPage.trailComponent.getMetadataValueByTitle('Ascent', false)).replace(',','').replace('+','').trim();
    const diff2 = Math.abs(parseFloat(ascent1) - parseFloat(ascent3));
    expect(diff2).withContext('Ascent before ' + ascent1 + ' (' + valueBefore + '), after ' + ascent3).toBeLessThanOrEqual(3);
    map = await trailPage.trailComponent.openMap();

    while (await tools.canUndo())
      await tools.undo();
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
    while (await tools.canUndo())
      await tools.undo();
  });

  it('Back to original track', async () => {
    details = await trailPage.trailComponent.openDetails();
    const ascent1 = (await trailPage.trailComponent.getMetadataValueByTitle('Ascent', true)).replace(',','').replace('+','').trim();
    map = await trailPage.trailComponent.openMap();
    await tools.backToOriginalTrack();
    details = await trailPage.trailComponent.openDetails();
    const ascent2 = (await trailPage.trailComponent.getMetadataValueByTitle('Ascent', true)).replace(',','').replace('+','').trim();
    map = await trailPage.trailComponent.openMap();
    await tools.undo();
    details = await trailPage.trailComponent.openDetails();
    const ascent3 = (await trailPage.trailComponent.getMetadataValueByTitle('Ascent', true)).replace(',','').replace('+','').trim();
    expect(parseInt(ascent2)).toBeGreaterThan(parseInt(ascent1));
    expect(ascent3).toBe(ascent1);
    map = await trailPage.trailComponent.openMap();
    while (await tools.canUndo())
      await tools.undo();
  });

  it('Apply elevation threshold', async () => {
    const modal = await tools.openElevationThreshold();
    await modal.threshold.setValue(50);
    await modal.distance.setValue(1080);
    await (await modal.getFooterButtonWithColor('success')).click();
    await modal.waitNotDisplayed();
    await tools.undo();
    while (await tools.canUndo())
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

  it('End', async () => {
    await App.logout(false);
    await App.end();
  });
});
