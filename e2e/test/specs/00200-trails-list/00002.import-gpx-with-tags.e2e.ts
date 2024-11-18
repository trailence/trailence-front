import { App } from '../../app/app';
import { TrailPage } from '../../app/pages/trail-page';
import { TrailsPage } from '../../app/pages/trails-page';
import { ImportTagsPopup } from '../../components/import-tags-popup.component';
import { TagsPopup } from '../../components/tags-popup';
import { OpenFile } from '../../utils/open-file';

describe('Trails list - Import GPX with 2 non existing tags', () => {

  it('Login and go to Test import collection', async () => {
    App.init();
    const loginPage = await App.start();
    await loginPage.loginAndWaitMyTrailsCollection();
    const menu = await App.openMenu();
    const page = await menu.openCollection('Test Import');
    expect(await page.header.getTitle()).toBe('Test Import');
  });

  let trailPage: TrailPage;

  it('Import a GPX file with Tag 1 and Tag 2', async () => {
    const page = new TrailsPage();
    const trailsList = await page.trailsAndMap.openTrailsList();
    const importButton = await trailsList.getToolbarButton('add-circle');
    await importButton.click();
    await OpenFile.openFile((await import('fs')).realpathSync('./test/assets/gpx-002.gpx'));
    const popup = new ImportTagsPopup(await App.waitModal());
    expect(await popup.getTitle()).toBe('Import tags');
    const tags = await popup.getTags();
    expect(tags.size).toBe(2);
    expect(tags.get('Tag 1')).toBe('Does not exist');
    expect(tags.get('Tag 2')).toBe('Does not exist');
    await popup.importAll();
    const trail = await trailsList.findItemByTrailName('Tour de Port-Cros');
    expect(trail).toBeDefined();
    await browser.waitUntil(async () => {
      const tags = await trail!.getTags();
      return tags.length === 2 && tags.indexOf('Tag 1') >= 0 && tags.indexOf('Tag 2') >= 0;
    });
    await trail!.clickMenuItem('Tags');
    const tagsPopup = new TagsPopup(await App.waitModal());
    const allTags = await tagsPopup.getAllTags();
    expect(allTags.length).toBe(2);
    expect(allTags.indexOf('Tag 1') >= 0).toBeTrue();
    expect(allTags.indexOf('Tag 2') >= 0).toBeTrue();
    await tagsPopup.cancel();
    trailPage = await trailsList.openTrail(trail!);
  });

  it('Open trail, it has the 2 tags', async () => {
    await browser.waitUntil(() => trailPage.header.getTitle().then(title => title === 'Tour de Port-Cros'));
    const trail = trailPage.trailComponent;
    await browser.waitUntil(async () => {
      const tags = await trail.getTags();
      return tags.length === 2 && tags.indexOf('Tag 1') >= 0 && tags.indexOf('Tag 2') >= 0;
    });
  });

  it('Synchronize', async () => {
    await App.synchronize();
  });

});
