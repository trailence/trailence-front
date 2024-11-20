import { App } from '../../app/app';
import { FilterTrailsPopup } from '../../components/filter-trails-popup';
import { TrailsList } from '../../components/trails-list.component';
import { EXPECTED_TRAILS, ExpectedTrail } from './00099.list';

describe('Trails list - Sort', () => {

  let list: TrailsList;

  it('Login and go to Test import collection', async () => {
    App.init();
    const loginPage = await App.start();
    await loginPage.loginAndWaitMyTrailsCollection();
    const menu = await App.openMenu();
    const page = await menu.openCollection('Test Import');
    expect(await page.header.getTitle()).toBe('Test Import');
    list = await page.trailsAndMap.openTrailsList();
  });

  const checkList = async (expectedList: ExpectedTrail[]) => {
    try { await browser.waitUntil(() => list.items.length.then(nb => nb === expectedList.length)); } catch (e) {}
    for (const expected of expectedList) {
      const trail = await list.findItemByTrailName(expected.name);
      expect(trail).withContext('Expected trail ' + expected.name).toBeDefined();
    }
    expect(await list.items.length).toBe(expectedList.length);
  };

  it('List contains expected trails', async () => {
    await checkList(EXPECTED_TRAILS);
  });

  it('Filter on positive elevation greater than 1200 ft', async () => {
    await (await list.getToolbarButton('filters')).click();
    const popup = new FilterTrailsPopup(await App.waitModal());
    await popup.resetFilters();
    await popup.setNumericFilter('Positive elevation', 1200, undefined);
    await popup.close();
    await checkList([...EXPECTED_TRAILS].filter(t => t.ascent && t.ascent >= 1200));
  });

  it('Filter on negative elevation less than 1500 ft', async () => {
    await (await list.getToolbarButton('filters')).click();
    const popup = new FilterTrailsPopup(await App.waitModal());
    await popup.resetFilters();
    await popup.setNumericFilter('Negative elevation', undefined, 1500);
    await popup.close();
    await checkList([...EXPECTED_TRAILS].filter(t => t.descent && t.descent <= 1500));
  });


  it('Filter on Tag 1', async () => {
    await (await list.getToolbarButton('filters')).click();
    const popup = new FilterTrailsPopup(await App.waitModal());
    await popup.resetFilters();
    await popup.setTagsFilter('include_and', ['Tag 1']);
    await popup.close();
    await checkList([...EXPECTED_TRAILS].filter(t => t.tags.indexOf('Tag 1') >= 0));
  });

  it('Filter on Tag 2 and Tag 3', async () => {
    await (await list.getToolbarButton('filters')).click();
    const popup = new FilterTrailsPopup(await App.waitModal());
    await popup.resetFilters();
    await popup.setTagsFilter('include_and', ['Tag 2', 'Tag 3']);
    await popup.close();
    await checkList([...EXPECTED_TRAILS].filter(t => t.tags.indexOf('Tag 2') >= 0 && t.tags.indexOf('Tag 3') >= 0));
  });

  it('Filter on Tag 1 or Tag 3', async () => {
    await (await list.getToolbarButton('filters')).click();
    const popup = new FilterTrailsPopup(await App.waitModal());
    await popup.resetFilters();
    await popup.setTagsFilter('include_or', ['Tag 1', 'Tag 3']);
    await popup.close();
    await checkList([...EXPECTED_TRAILS].filter(t => t.tags.indexOf('Tag 1') >= 0 || t.tags.indexOf('Tag 3') >= 0));
  });

  it('Filter on not Tag 2', async () => {
    await (await list.getToolbarButton('filters')).click();
    const popup = new FilterTrailsPopup(await App.waitModal());
    await popup.resetFilters();
    await popup.setTagsFilter('exclude', ['Tag 2']);
    await popup.close();
    await checkList([...EXPECTED_TRAILS].filter(t => t.tags.indexOf('Tag 2') < 0));
  });

  it('Filter on without any tag', async () => {
    await (await list.getToolbarButton('filters')).click();
    const popup = new FilterTrailsPopup(await App.waitModal());
    await popup.resetFilters();
    await popup.setTagsFilter('onlyWithoutAnyTag', []);
    await popup.close();
    await checkList([...EXPECTED_TRAILS].filter(t => t.tags.length === 0));
  });

});
