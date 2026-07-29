import { App } from '../app/app';
import { TrailPage } from '../app/pages/trail-page';
import { TrailsPage } from '../app/pages/trails-page';
import { importTrail } from '../utils/import-trails';
import { openMyTrails, runDemo, setLang, setTheme, takeScreenshot } from './demo-utils';

describe('Demo', () => {

  it('Login', async () => {
    App.init();
    const loginPage = await App.start();
    await loginPage.loginAndWaitMyTrailsCollection();
  });

  it('Import trails', async () => {
    const mytrails = new TrailsPage();
    const list = await mytrails.trailsAndMap.openTrailsList();
    const present = await list.items.length;
    if (present !== 41) {
      if (present > 0) {
        await list.selectAllCheckbox.setSelected(true);
        await list.selectionMenu('Delete');
        await (await App.waitAlert()).clickButtonWithRole('danger');
        await App.waitNoProgress();
        await browser.waitUntil(() => list.items.length.then(nb => nb === 0));
      }
      await importTrail(mytrails, '../demo/mytrails.zip', undefined, tags => tags.importAll());
      await App.waitNoProgress();
      await App.synchronize(false, 20);
    }
    await browser.execute(() => (window as any)['_isDemo'] = true);
  });

  it('Demo - Collection', async () => {
    await runDemo([
      {
        name: 'collection',
        desktopSize: { width: 1400, height: 682 },
        desktopMode: [
          async () => {
            const mytrails = await openMyTrails();
            const map = await mytrails.trailsAndMap.openMap();
            await map.goTo(43.69, 6.9, 11);
          }
        ],
        mobileMode: [
          async () => {
            const mytrails = await openMyTrails();
            const map = await mytrails.trailsAndMap.openMap();
            await map.goTo(43.69, 6.9, 10);
          },
          async () => {
            await new TrailsPage().trailsAndMap.openTrailsList();
          }
        ]
      }
    ]);
  });

  it('Demo - Feature screen', async () => {
    await runDemo([
      {
        name: 'feature',
        desktopSize: { width: 1024, height: 500 },
        desktopMode: [
          async () => {
            const mytrails = await openMyTrails();
            const map = await mytrails.trailsAndMap.openMap();
            await map.goTo(43.69, 6.9, 11);
          }
        ],
      }
    ]);
  });


  it('Demo - Trace recording', async () => {
    await runDemo([
      {
        name: 'trace',
        mobileMode: [
          async () => {
            await browser.execute(() => (window as any)['_demoReplayStep'] = 0);
            const mytrails = await openMyTrails();
            const trailPage = await (await mytrails.trailsAndMap.openTrailsList()).openTrailByName('Mouton d\'Anou');
            const map = await (await TrailPage.waitForOpen()).trailComponent.openMap();
            const menu = await trailPage.header.openActionsMenu();
            await menu.clickItemWithText('[Dev] Replay following current');
            await App.waitToastAndCloseIt();
            await browser.pause(5000); // wait the replay to start
            await map.centerOnGeolocation();
            await map.centerOnGeolocation();
            await map.rotate('tertiary');
            await browser.pause(10000); // wait remaining metadata to be ready
          }
        ],
        doAfter: async () => {
          await setLang('en');
          await setTheme('dark');
          await browser.execute(() => (window as any)['_demoReplayStep'] = 1);
          for (let i = 1; i <= 65; ++i) {
            await takeScreenshot('trace_gif_' + i);
            await browser.execute(i => (window as any)['_demoReplayStep'] = 120 + i, i);
          }
          await browser.execute(() => (window as any)['_demoReplayStep'] = -1);
          const urlAfter = await browser.getUrl();
          let uuidAfter = urlAfter.substring(urlAfter.indexOf('/trail/demo@trailence.org/') + 26);
          uuidAfter = uuidAfter.substring(0, 36)
          const trailPage = new TrailPage('demo@trailence.org', uuidAfter);
          await trailPage.trailComponent.stopRecordingFromMap();
          await App.waitNoProgress(30000);
          await (await trailPage.header.openActionsMenu()).clickItemWithColor('danger');
          const alert = await App.waitAlert();
          await alert.clickButtonWithRole('danger');
          await App.waitNoProgress();
          await browser.waitUntil(() => browser.getUrl().then(url => url.indexOf('/trails/collection/') > 0));
        }
      }
    ]);
  });

  it('Demo - Trail details', async () => {
    await runDemo([
      {
        name: 'trail-details',
        desktopSize: { width: 1400, height: 682 },
        desktopMode: [
          async () => {
            const mytrails = await openMyTrails();
            await (await mytrails.trailsAndMap.openTrailsList()).openTrailByName('Snow');
          }
        ],
        mobileMode: [
          async () => {
            const mytrails = await openMyTrails();
            const page = await (await mytrails.trailsAndMap.openTrailsList()).openTrailByName('Snow');
            await page.trailComponent.centerOnMetadata();
          },
          async () => {
            const mytrails = await openMyTrails();
            const page = await (await mytrails.trailsAndMap.openTrailsList()).openTrailByName('Snow');
            const map = await page.trailComponent.openMap();
            await map.leftToolbar.clickByIcon('zoom-fit-bounds');
            await browser.pause(1000);
          }
        ]
      }
    ]);
  });

  it('Demo - Photos on map', async () => {
    await runDemo([
      {
        name: 'photos-on-map',
        mobileMode: [
          async() => {
            const mytrails = await openMyTrails();
            const trailPage = await (await mytrails.trailsAndMap.openTrailsList()).openTrailByName('Tour de Port-Cros');
            const map = await trailPage.trailComponent.openMap();
            await map.showOnMap(['photos']);
            await browser.pause(2000); // wait photos to be loaded and displayed
            await map.leftToolbar.clickByIcon('zoom-fit-bounds');
            await browser.pause(1000);
          }
        ]
      }
    ]);
  });

  it('Synchronize', async () => {
    await setLang('en');
    await App.synchronize();
  });

});
