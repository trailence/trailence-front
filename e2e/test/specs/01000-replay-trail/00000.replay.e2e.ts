import { App } from '../../app/app';
import { Page } from '../../app/pages/page';
import { TrailPage } from '../../app/pages/trail-page';
import { TrailsPage } from '../../app/pages/trails-page';
import { HeaderComponent } from '../../components/header.component';
import { FilesUtils } from '../../utils/files-utils';
import { importGpx } from '../../utils/gpx';
import { OpenFile } from '../../utils/open-file';

describe('Replay trail', () => {

  let trailPage: TrailPage;

  it('Login and prepare browser', async () => {
    const fs = await FilesUtils.fsPromises();
    const f = await fs.open('./test/assets/gpx-005.gpx', 'r');
    const file = await f.readFile();
    await f.close();
    const segments = await importGpx(file);
    // remove 2/3 points to speed up the test
    for (let i = 0; i < segments.length; ++i) {
      const s = segments[i];
      for (let j = 1; j < s.length; ++j) {
        s.splice(j, 2);
      }
    }

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
        setTimeout(() => nextPoint(), 500);
        return 1;
      };
      window.navigator.geolocation.clearWatch = function(id) {
        // nothing
      };
    }, segments);
  });

  let savedUuid: string;

  it('Replay', async () => {
    await trailPage.trailComponent.startTrail();
    await browser.waitUntil(() => browser.execute(() => (window as any)._resumeSegment !== undefined), { interval: 2000, timeout: 60000 });
    await trailPage.trailComponent.pauseRecordingFromMap();
    await trailPage.trailComponent.resumeRecordingFromMap();
    await browser.waitUntil(() => browser.execute(() => (window as any)._replayDone === true), { interval: 2000, timeout: 60000 });
    await browser.pause(2000); // make sure the metadata has time to refresh
    await trailPage.trailComponent.openDetails();

    const duration1 = await trailPage.trailComponent.getMetadataValueByTitle('Duration', true);
    const duration2 = await trailPage.trailComponent.getMetadataValueByTitle('Duration', false);
    expect(duration1).toBeDefined();
    expect(duration2).toBe(duration1);

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
    await intValueAlmostSame('Ascent', 20);
    await intValueAlmostSame('Descent', 20);
    await intValueAlmostSame('Highest altitude', 5);
    await intValueAlmostSame('Lowest altitude', 5);

    const breaks1 = await trailPage.trailComponent.getMetadataValueByTitle('Breaks', true);
    const breaks2 = await trailPage.trailComponent.getMetadataValueByTitle('Breaks', false);
    expect(breaks1).toBeDefined();
    expect(breaks2).toBe(breaks1);

    const urlBefore = await browser.getUrl();
    let uuidBefore = urlBefore.substring(urlBefore.indexOf('/trail/' + App.config.initUsername + '/') + 7 + App.config.initUsername.length + 1);
    uuidBefore = uuidBefore.substring(0, 36)

    await trailPage.trailComponent.openMap();
    await trailPage.trailComponent.stopRecordingFromMap();

    await App.waitNoProgress(60000);

    const urlAfter = await browser.getUrl();
    let uuidAfter = urlAfter.substring(urlAfter.indexOf('/trail/' + App.config.initUsername + '/') + 7 + App.config.initUsername.length + 1);
    uuidAfter = uuidAfter.substring(0, 36)

    expect(uuidAfter).not.toBe(uuidBefore);
    savedUuid = uuidAfter;
  });

  it('Check saved trail, then delete it', async () => {
    const page = new TrailPage(App.config.initUsername, savedUuid);
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

});
