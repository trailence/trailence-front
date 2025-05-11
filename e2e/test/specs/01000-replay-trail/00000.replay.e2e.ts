import { App } from '../../app/app';
import { Page } from '../../app/pages/page';
import { TrailPage } from '../../app/pages/trail-page';
import { HeaderComponent } from '../../components/header.component';
import { FilesUtils } from '../../utils/files-utils';
import { importGpx } from '../../utils/gpx';
import { OpenFile } from '../../utils/open-file';

describe('Replay trail', () => {

  let trailPage: TrailPage;

  it('Login, import trail and open it', async () => {
    App.init();
    const loginPage = await App.start();
    const myTrailsPage = await loginPage.loginAndWaitMyTrailsCollection();
    await browser.waitUntil(() => myTrailsPage.header.getTitle().then(title => title === 'My Trails'));
    const menu = await App.openMenu();
    const page = await menu.addCollection('Replay');
    expect(await page.header.getTitle()).toBe('Replay');
    const trailsList = await page.trailsAndMap.openTrailsList();
    const importButton = await trailsList.getToolbarButton('add-circle');
    await importButton.click();
    await OpenFile.openFile((await FilesUtils.fs()).realpathSync('./test/assets/gpx-005.gpx'));
    const trail = await trailsList.waitTrail('Lac de l\'Avellan');
    trailPage = await trailsList.openTrail(trail);
  });

  it('Prepare browser for replay', async () => {
    const fs = await FilesUtils.fsPromises();
    const f = await fs.open('./test/assets/gpx-005.gpx', 'r');
    const file = await f.readFile();
    await f.close();
    const segments = await importGpx(file);
    // remove 2/3 points to speed up the test
    for (const s of segments) {
      for (let j = 1; j < s.length; ++j) {
        s.splice(j, 2);
      }
    }

    await browser.execute((segments) => {
      window.navigator.geolocation.getCurrentPosition = function(success, error) {
        if (error) error({code: GeolocationPositionError.POSITION_UNAVAILABLE, message: 'Fake!'} as GeolocationPositionError);
      };
      window.navigator.geolocation.watchPosition = function(success, error) {
        let segmentIndex = (window as any)._resumeSegment ?? 0;
        let pointIndex = (window as any)._resumePoint ?? 0;
        let count = 0;
        const nextPoint = () => {
          if (segmentIndex >= segments.length) {
            (window as any)._replayDone = true;
            return;
          }
          success({
            coords: {
              latitude: segments[segmentIndex][pointIndex].lat,
              longitude: segments[segmentIndex][pointIndex].lng,
              altitude: segments[segmentIndex][pointIndex].ele ?? null,
              accuracy: 1,
              altitudeAccuracy: null,
              heading: null,
              speed: null,
              toJSON: function() {},
            },
            timestamp: segments[segmentIndex][pointIndex].time ?? 0,
            toJSON: function() {},
          });
          if (++count === 300 && (window as any)._resumeSegment === undefined) {
            (window as any)._resumeSegment = segmentIndex;
            (window as any)._resumePoint = pointIndex;
            return;
          }
          if (++pointIndex >= segments[segmentIndex].length) {
            segmentIndex++;
            pointIndex = 0;
          }
          setTimeout(() => nextPoint(), 1);
        };
        if ((window as any)._resumeSegment !== undefined) setTimeout(() => nextPoint(), 500);
        else {
          const checkStart = () => {
            if ((window as any)._startTrail) setTimeout(() => nextPoint(), 500);
            else setTimeout(() => checkStart(), 2500);
          };
          setTimeout(() => checkStart(), 5000);
        }
        return 1;
      };
      window.navigator.geolocation.clearWatch = function(id) {
        // nothing
      };
    }, segments);
  });

  let savedUuid: string;

  let ok = true;

  it('Start trail', async () => {
    let startButton = await trailPage.trailComponent.getStartTrailButton();
    await startButton.click();
  });

  it('Go to map and wait until pause', async () => {
    await browser.execute(() => (window as any)._startTrail = true);
    await trailPage.trailComponent.openMap();
    await browser.waitUntil(() => browser.execute(() => (window as any)._resumeSegment !== undefined), { interval: 2000, timeout: 45000 });
  });

  it('Pause then resume', async () => {
    await trailPage.trailComponent.pauseRecordingFromMap();
    await trailPage.trailComponent.resumeRecordingFromMap();
  });

  it('Wait until end of trail', async () => {
    await browser.waitUntil(() => browser.execute(() => (window as any)._replayDone === true), { interval: 2000, timeout: 45000 });
  });

  let uuidBefore: string;

  it('Check result, then stop recording', async () => {
    await browser.pause(2000); // make sure the metadata has time to refresh
    await trailPage.trailComponent.openDetails();

    const duration1 = await trailPage.trailComponent.getMetadataValueByTitle('Duration', true);
    const duration2 = await trailPage.trailComponent.getMetadataValueByTitle('Duration', false);
    expect(duration1).toBeDefined();
    expect(duration2).toBeDefined();
    let i = duration1.indexOf('h');
    const d1 = parseInt(duration1.substring(0, i)) * 60 + parseInt(duration1.substring(i + 1));
    const d2 = parseInt(duration2.substring(0, i)) * 60 + parseInt(duration2.substring(i + 1));
    const diff = Math.abs(d2 - d1);
    expect(diff).withContext('Expected duration ' + duration1 + ', found ' + duration2).toBeLessThanOrEqual(1);

    const intValueAlmostSame = async (title: string, acceptedVariation: number) => {
      const val1 = await trailPage.trailComponent.getMetadataValueByTitle(title, true);
      const val2 = await trailPage.trailComponent.getMetadataValueByTitle(title, false);
      expect(val1).toBeDefined();
      expect(val2).toBeDefined();
      const v1 = parseInt(val1!.replace('.', '').replace(',','').replace('+','').replace(' ', ''));
      const v2 = parseInt(val2!.replace('.', '').replace(',','').replace('+','').replace(' ', ''));
      const diff = Math.abs(v1 - v2);
      expect(diff).toBeLessThanOrEqual(acceptedVariation);
    }

    await intValueAlmostSame('Distance', 200);
    await intValueAlmostSame('Ascent', 150);
    await intValueAlmostSame('Descent', 150);
    await intValueAlmostSame('Highest altitude', 5);
    await intValueAlmostSame('Lowest altitude', 5);

    const breaks1 = await trailPage.trailComponent.getMetadataValueByTitle('Breaks', true);
    const breaks2 = await trailPage.trailComponent.getMetadataValueByTitle('Breaks', false);
    expect(breaks1).toBeDefined();
    expect(breaks2).toBe(breaks1);

    const urlBefore = await browser.getUrl();
    uuidBefore = urlBefore.substring(urlBefore.indexOf('/trail/' + App.config.username + '/') + 7 + App.config.username.length + 1);
    uuidBefore = uuidBefore.substring(0, 36)

    await trailPage.trailComponent.openMap();
    await trailPage.trailComponent.stopRecordingFromMap();
    ok = true;
    try { await App.waitNoProgress(30000); }
    catch (e) { ok = false; }
  });

  it('Wait for the trail to be saved', async () => {
    if (!ok)
      await App.waitNoProgress(45000);

    const urlAfter = await browser.getUrl();
    let uuidAfter = urlAfter.substring(urlAfter.indexOf('/trail/' + App.config.username + '/') + 7 + App.config.username.length + 1);
    uuidAfter = uuidAfter.substring(0, 36)

    expect(uuidAfter).not.toBe(uuidBefore);
    savedUuid = uuidAfter;
  });

  it('Check saved trail, then delete it', async () => {
    const page = new TrailPage(App.config.username, savedUuid);
    expect(await page.trailComponent.getMetadataValueByTitle('Duration', true)).toBe('3h15');
    const menu = await page.header.openActionsMenu();
    await menu.clickItemWithText('Delete');
    const alert = await App.waitAlert();
    await alert.clickButtonWithRole('danger');
    await browser.waitUntil(() => Page.getActivePageElement().then(p => new HeaderComponent(p).getTitle()).then(title => title === 'My Trails'));
  });

  it('Remove Replay collection and synchronize', async () => {
    const page = await (await App.openMenu()).openCollection('Replay');
    await (await page.header.openActionsMenu()).clickItemWithText('Delete');
    const alert = await App.waitAlert();
    await alert.clickButtonWithRole('danger');
    await browser.waitUntil(() => Page.getActivePageElement().then(p => new HeaderComponent(p).getTitle()).then(title => title === 'My Trails'));
    await App.synchronize();
  });

  it('End', async () => {
    await App.logout(false);
    await App.end();
  });
});
