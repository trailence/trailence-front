import { App } from '../app/app';
import { TrailPage } from '../app/pages/trail-page';
import { TrailsPage } from '../app/pages/trails-page';
import { MapComponent } from '../components/map.component';
import { importTrail } from '../utils/import-trails';
import { DemoScenario, openMyTrails, runDemo, setLang } from './demo-utils';

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
      }
      await importTrail(mytrails, '../demo/mytrails.zip', undefined, tags => tags.importAll());
      await App.waitNoProgress();
      await App.synchronize();
    }
    await browser.execute(() => (window as any)['_isDemo'] = true);
  });

  it('Demo', async () => {
    let tmp: any;
    await runDemo([
      {
        name: 'trail-list',
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
      }, {
        name: 'trace',
        desktopSize: { width: 1050, height: 512 },
        desktopMode: [
          async () => {
            const mytrails = await openMyTrails();
            const trailPage = await (await mytrails.trailsAndMap.openTrailsList()).openTrailByName('Mouton d\'Anou');
            const menu = await trailPage.header.openActionsMenu();
            await menu.clickItemWithText('[Dev] Replay following current');
            await browser.pause(15000); // wait the replay + remaining metadata to be ready
          }
        ],
        mobileMode: [
          async () => {
            // nothing, stay here
          }
        ],
        doAfter: async () => {
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
      }, {
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
            await page.trailComponent.openDetails();
          },
          async () => {
            const mytrails = await openMyTrails();
            const page = await (await mytrails.trailsAndMap.openTrailsList()).openTrailByName('Snow');
            const map = await page.trailComponent.openMap();
            await map.leftToolbar.clickByIcon('zoom-fit-bounds');
            await browser.pause(1000);
          }
        ]
      }, {
        name: 'photos-on-map',
        desktopSize: { width: 1400, height: 682 },
        desktopMode: [
          async () => {
            const mytrails = await openMyTrails();
            const trailPage = await (await mytrails.trailsAndMap.openTrailsList()).openTrailByName('Tour de Port-Cros');
            const map = await trailPage.trailComponent.openMap();
            await map.rightToolbar.clickByIcon('photos');
            await browser.pause(2000); // wait photos to be loaded and displayed
            tmp = map;
          }
        ],
        mobileMode: [
          async() => {
            await (tmp as MapComponent).leftToolbar.clickByIcon('zoom-fit-bounds');
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
