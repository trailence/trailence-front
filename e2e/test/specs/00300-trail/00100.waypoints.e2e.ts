import { App } from '../../app/app';
import { TrailPage } from '../../app/pages/trail-page';
import { TestUtils } from '../../utils/test-utils';

describe('Trail - Waypoints', () => {

  let trailPage: TrailPage;

  it('Login, import gpx', async () => {
    App.init();
    const loginPage = await App.start();
    const myTrailsPage = await loginPage.loginAndWaitMyTrailsCollection();
    await browser.waitUntil(() => myTrailsPage.header.getTitle().then(title => title === 'My Trails'));
    const trailsList = await myTrailsPage.trailsAndMap.openTrailsList();
    await trailsList.importFile('./test/assets/gpx-zip-003.zip');
    await App.waitNoProgress();
    const trail = await trailsList.waitTrail('Lacs de Terre Rouge');
    expect(trail).toBeDefined();
    trailPage = await trailsList.openTrail(trail);
    await browser.waitUntil(() => trailPage.header.getTitle().then(title => title === 'Lacs de Terre Rouge'));
  });

  it('Trail characteristics are loaded', async () => {
    const trail = trailPage.trailComponent;
    const stats = await trail.getCharacteristics();
    const pathType = stats.get('Path type');
    expect(pathType).toBeDefined();
    if (pathType) {
      expect(pathType.find(s => s.name === 'Path')?.percent).toBe('99%');
      expect(pathType.find(s => s.name === 'Others')?.percent).toBe('1%');
    }
    const difficulty = stats.get('Difficulty');
    expect(difficulty).toBeDefined();
    if (difficulty) {
      expect(difficulty.find(s => s.name === 'Moderate')?.percent).toBe('75%');
      expect(difficulty.find(s => s.name === 'Unknown')?.percent).toBe('17%');
      expect(difficulty.find(s => s.name === 'Easy')?.percent).toBe('8%');
    }
    expect(stats.get('Trail visibility')).toBeUndefined();
  });

  it('Show trace with known trails', async () => {
    const distanceBefore = await trailPage.trailComponent.getMetadataValueByTitle('Distance', true);
    expect(distanceBefore).toBe('4.968 mi');
    await trailPage.trailComponent.setShowKnownTrails(true);
    const distanceAfter = await TestUtils.retry(async (trial) => {
      const d = await trailPage.trailComponent.getMetadataValueByTitle('Distance', true);
      if (trial > 4 || d === '4.726 mi') return d;
      throw new Error('Found: ' + d);
    }, 5, 500);
    expect(distanceAfter).toBe('4.726 mi');
    await trailPage.trailComponent.setShowKnownTrails(false);
    const distanceBack = await TestUtils.retry(async (trial) => {
      const d = await trailPage.trailComponent.getMetadataValueByTitle('Distance', true);
      if (trial > 4 || d === '4.968 mi') return d;
      throw new Error('Found: ' + d);
    }, 5, 500);
    expect(distanceBack).toBe('4.968 mi');
  });

  it('Way points are present and include photo', async () => {
    const waypoints = await trailPage.trailComponent.getWayPoints(20);
    expect(waypoints).toEqual([
      {name: '', description: '', hasPhotos: false, isBreakpoint: false, isGuidepost: false, innerGuidpost: undefined},
      {name: 'Tourner', description: '', hasPhotos: false, isBreakpoint: false, isGuidepost: false, innerGuidpost: undefined},
      {name: 'Descendre', description: '', hasPhotos: true, isBreakpoint: false, isGuidepost: false, innerGuidpost: undefined},
      {name: '', description: '', hasPhotos: false, isBreakpoint: false, isGuidepost: false, innerGuidpost: undefined},
    ]);
  });

  it('Show breaks', async () => {
    const waypoints = await TestUtils.retry(async (trial) => {
      await trailPage.trailComponent.setShowBreaks(true);
      await trailPage.trailComponent.setShowGuideposts(false);
      const waypoints = await trailPage.trailComponent.getWayPoints(20);
      if (waypoints.length !== 11 && trial < 3) throw new Error();
      return waypoints;
    }, 3, 1000);
    expect(waypoints).toEqual([
      {name: '', description: '', hasPhotos: false, isBreakpoint: false, isGuidepost: false, innerGuidpost: undefined},
      {name: 'Tourner', description: '', hasPhotos: false, isBreakpoint: false, isGuidepost: false, innerGuidpost: undefined},
      {name: '', description: '', hasPhotos: true, isBreakpoint: true, isGuidepost: false, innerGuidpost: undefined},
      {name: '', description: '', hasPhotos: false, isBreakpoint: true, isGuidepost: false, innerGuidpost: undefined},
      {name: '', description: '', hasPhotos: false, isBreakpoint: true, isGuidepost: false, innerGuidpost: undefined},
      {name: 'Descendre', description: '', hasPhotos: true, isBreakpoint: false, isGuidepost: false, innerGuidpost: undefined},
      {name: '', description: '', hasPhotos: false, isBreakpoint: true, isGuidepost: false, innerGuidpost: undefined},
      {name: '', description: '', hasPhotos: true, isBreakpoint: true, isGuidepost: false, innerGuidpost: undefined},
      {name: '', description: '', hasPhotos: false, isBreakpoint: true, isGuidepost: false, innerGuidpost: undefined},
      {name: '', description: '', hasPhotos: false, isBreakpoint: true, isGuidepost: false, innerGuidpost: undefined},
      {name: '', description: '', hasPhotos: false, isBreakpoint: false, isGuidepost: false, innerGuidpost: undefined},
    ]);
  });

  it('Show guideposts', async () => {
    const waypoints = await TestUtils.retry(async (trial) => {
      await trailPage.trailComponent.setShowBreaks(true);
      await trailPage.trailComponent.setShowGuideposts(true);
      const waypoints = await trailPage.trailComponent.getWayPoints(20);
      if (waypoints.length !== 14 && trial < 3) throw new Error();
      return waypoints;
    }, 3, 1000);
    expect(waypoints).toEqual([
      {name: '', description: '', hasPhotos: false, isBreakpoint: false, isGuidepost: false, innerGuidpost: undefined},
      {name: 'Tourner', description: '', hasPhotos: false, isBreakpoint: false, isGuidepost: false, innerGuidpost: '91'},
      {name: '', description: '', hasPhotos: true, isBreakpoint: true, isGuidepost: false, innerGuidpost: undefined},
      {name: '', description: '', hasPhotos: false, isBreakpoint: true, isGuidepost: false, innerGuidpost: undefined},
      {name: '92', description: '', hasPhotos: false, isBreakpoint: false, isGuidepost: true, innerGuidpost: undefined},
      {name: '', description: '', hasPhotos: false, isBreakpoint: true, isGuidepost: false, innerGuidpost: undefined},
      {name: '93', description: '', hasPhotos: true, isBreakpoint: false, isGuidepost: true, innerGuidpost: undefined},
      {name: 'Descendre', description: '', hasPhotos: true, isBreakpoint: false, isGuidepost: false, innerGuidpost: undefined},
      {name: '', description: '', hasPhotos: false, isBreakpoint: true, isGuidepost: false, innerGuidpost: undefined},
      {name: '', description: '', hasPhotos: true, isBreakpoint: true, isGuidepost: false, innerGuidpost: undefined},
      {name: '', description: '', hasPhotos: false, isBreakpoint: true, isGuidepost: false, innerGuidpost: undefined},
      {name: '92', description: '', hasPhotos: true, isBreakpoint: false, isGuidepost: true, innerGuidpost: undefined},
      {name: '', description: '', hasPhotos: false, isBreakpoint: true, isGuidepost: false, innerGuidpost: 'Ajouter la référence'},
      {name: '', description: '', hasPhotos: false, isBreakpoint: false, isGuidepost: false, innerGuidpost: undefined},
    ]);
  });

  it('Hide breaks', async () => {
    const waypoints = await TestUtils.retry(async (trial) => {
      await trailPage.trailComponent.setShowBreaks(false);
      await trailPage.trailComponent.setShowGuideposts(true);
      const waypoints = await trailPage.trailComponent.getWayPoints(20);
      if (waypoints.length !== 8 && trial < 3) throw new Error();
      return waypoints;
    }, 3, 1000);
    expect(waypoints).toEqual([
      {name: '', description: '', hasPhotos: false, isBreakpoint: false, isGuidepost: false, innerGuidpost: undefined},
      {name: 'Tourner', description: '', hasPhotos: false, isBreakpoint: false, isGuidepost: false, innerGuidpost: '91'},
      {name: '92', description: '', hasPhotos: false, isBreakpoint: false, isGuidepost: true, innerGuidpost: undefined},
      {name: '93', description: '', hasPhotos: true, isBreakpoint: false, isGuidepost: true, innerGuidpost: undefined},
      {name: 'Descendre', description: '', hasPhotos: true, isBreakpoint: false, isGuidepost: false, innerGuidpost: undefined},
      {name: '92', description: '', hasPhotos: true, isBreakpoint: false, isGuidepost: true, innerGuidpost: undefined},
      {name: 'Ajouter la référence', description: '', hasPhotos: false, isBreakpoint: false, isGuidepost: true, innerGuidpost: undefined},
      {name: '', description: '', hasPhotos: false, isBreakpoint: false, isGuidepost: false, innerGuidpost: undefined},
    ]);
  });

  it('Hide guideposts', async () => {
    const waypoints = await TestUtils.retry(async (trial) => {
      await trailPage.trailComponent.setShowBreaks(false);
      await trailPage.trailComponent.setShowGuideposts(false);
      const waypoints = await trailPage.trailComponent.getWayPoints(20);
      if (waypoints.length !== 4 && trial < 3) throw new Error();
      return waypoints;
    }, 3, 1000);
    expect(waypoints).toEqual([
      {name: '', description: '', hasPhotos: false, isBreakpoint: false, isGuidepost: false, innerGuidpost: undefined},
      {name: 'Tourner', description: '', hasPhotos: false, isBreakpoint: false, isGuidepost: false, innerGuidpost: undefined},
      {name: 'Descendre', description: '', hasPhotos: true, isBreakpoint: false, isGuidepost: false, innerGuidpost: undefined},
      {name: '', description: '', hasPhotos: false, isBreakpoint: false, isGuidepost: false, innerGuidpost: undefined},
    ]);
  });

  it('Synchronize and logout', async () => {
    await App.synchronize(true);
  });

  it('End', async () => await App.end());
});
