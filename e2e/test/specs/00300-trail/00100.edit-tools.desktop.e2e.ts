import { App } from '../../app/app';
import { TrailPage } from '../../app/pages/trail-page';
import { EditTools } from '../../components/edit-tools.component';
import { IonicButton } from '../../components/ionic/ion-button';
import { MapComponent } from '../../components/map.component';
import { ChainablePromiseElement} from 'webdriverio';

describe('Edit tools', () => {

  let trailPage: TrailPage;
  let map: MapComponent;
  let tools: EditTools;
  let details: ChainablePromiseElement;

  it('Login, go to trail page, open edit tools', async () => {
    App.init();
    const loginPage = await App.start();
    await loginPage.loginAndWaitMyTrailsCollection();
    const menu = await App.openMenu();
    const collectionPage = await menu.openCollection('Test Trail');
    const trailsList = await collectionPage.trailsAndMap.openTrailsList();
    const trail = await trailsList.waitTrail('My test trail');
    expect(trail).toBeDefined();
    trailPage = await trailsList.openTrail(trail);
    map = await trailPage.trailComponent.openMap();
    details = await trailPage.trailComponent.openDetails();
    tools = await trailPage.trailComponent.openEditTools();
  });

  const selectPoint = async (arrowIndex: number) => {
    const arrow = (await map.paths.filter(e => e.getAttribute('stroke').then(s => s === 'black'))).at(arrowIndex)
    const pos = await map.getPathPosition(arrow!);
    await browser.action('pointer').move({x: Math.floor(pos.x) + 2, y: Math.floor(pos.y) + 2, origin: 'viewport'}).pause(10).down().pause(10).up().perform();
    await browser.waitUntil(() => tools.isPointSelected());
  }

  it('Add and remove a way point', async () => {
    await selectPoint(5);
    await tools.createWayPoint();
    await browser.waitUntil(() => details.$$('div.waypoint').length.then(nb => nb === 3));
    await new IonicButton(details.$$('div.waypoint')[1].$('ion-button[color=danger]')).click();
    await browser.waitUntil(() => details.$$('div.waypoint').length.then(nb => nb === 2));

    await selectPoint(5);
    await tools.createWayPoint();
    await browser.waitUntil(() => details.$$('div.waypoint').length.then(nb => nb === 3));
    await selectPoint(5);
    await tools.removeWayPoint();
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
    await selectPoint(10);
    await tools.goToNextPoint();
    await tools.goToNextPoint();
    await tools.removePointsAfter();
    await selectPoint(2);
    await tools.goToPreviousPoint();
    await tools.removePointsBefore()
    const d1 = await trailPage.trailComponent.getMetadataValueByTitle('Distance', true);
    const d2 = await trailPage.trailComponent.getMetadataValueByTitle('Distance', false);
    expect(parseInt(d1!.replace('.',''))).toBeGreaterThan(parseInt(d2!.replace('.','')));
    await tools.undo();
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
  });

  it('Back to original track', async () => {
    const ascent1 = (await trailPage.trailComponent.getMetadataValueByTitle('Ascent', true))!.replace(',','').replace('+','').trim();
    await tools.backToOriginalTrack();
    const ascent2 = (await trailPage.trailComponent.getMetadataValueByTitle('Ascent', true))!.replace(',','').replace('+','').trim();
    await tools.undo();
    const ascent3 = (await trailPage.trailComponent.getMetadataValueByTitle('Ascent', true))!.replace(',','').replace('+','').trim();
    expect(parseInt(ascent2)).toBeGreaterThan(parseInt(ascent1));
    expect(ascent3).toBe(ascent1);
  });

  it('Close edit tools', async () => {
    await tools.close();
  });

});
