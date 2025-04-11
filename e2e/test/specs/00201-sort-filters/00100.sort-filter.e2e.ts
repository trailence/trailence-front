import { App } from '../../app/app';
import { TrailsPage } from '../../app/pages/trails-page';
import { FilterTrailsPopup } from '../../components/filter-trails-popup';
import { SortTrailsPopup } from '../../components/sort-trails-popup';
import { TrailsList } from '../../components/trails-list.component';
import { expectListContains, expectListContainsByName, ExpectedTrail, importTrails } from '../../utils/import-trails';

describe('Trails list - Sort and filter', () => {

  let EXPECTED_TRAILS: ExpectedTrail[];

  it('Login, create collection, import trails', async () => {
    App.init();
    const loginPage = await App.start();
    await loginPage.loginAndWaitMyTrailsCollection();
    const menu = await App.openMenu();
    const collectionPage = await menu.addCollection('Test SortFilter');
    expect(await collectionPage.header.getTitle()).toBe('Test SortFilter');
    EXPECTED_TRAILS = await importTrails(collectionPage, ['gpx-001.gpx', 'gpx-002.gpx', 'gpx-003.gpx', 'gpx-004.gpx', 'gpx-zip-001.zip', 'gpx-zip-002.zip']);
  });

  let page: TrailsPage;
  let list: TrailsList;

  it('List contains expected trails', async () => {
    page = new TrailsPage();
    list = await page.trailsAndMap.openTrailsList();
    await expectListContains(list, EXPECTED_TRAILS);
  });

  const testSort = async (
    field: string,
    ascending: boolean,
    checkSort: (names: string[]) => void,
  ) => {
    await (await list.getToolbarButton('sort')).click();
    const popup = new SortTrailsPopup(await App.waitModal());
    await popup.setAscending(ascending);
    await popup.selectField(field);
    await popup.close();
    const found = await list.getTrailsNames();
    checkSort(found);
  };

  const check = (expected: string[], found: string[], context: string) => {
    expect(found.length).withContext(context).toBe(expected.length);
    for (let i = 0; i < expected.length; ++i)
      expect(found[i]).withContext(context + ', item ' + i).toBe(expected[i]);
  }

  it('Sort by date ascending', () => testSort(
    'track.startDate',
    true,
    names => {
      const expected = [...EXPECTED_TRAILS].sort((t1, t2) => t1.startDate - t2.startDate).map(t => t.name);
      check(expected, names, 'sort ascending by start date');
    }
  ));

  it('Sort by date descending', () => testSort(
    'track.startDate',
    false,
    names => {
      const expected = [...EXPECTED_TRAILS].sort((t1, t2) => t2.startDate - t1.startDate).map(t => t.name);
      check(expected, names, 'sort descending by start date');
    }
  ));

  it('Sort by ascent ascending', () => testSort(
    'track.positiveElevation',
    true,
    names => {
      const expected = [...EXPECTED_TRAILS].sort((t1, t2) => (t1.ascent ?? 0) - (t2.ascent ?? 0)).map(t => t.name);
      check(expected, names, 'sort ascending by positive elevation');
    }
  ));

  it('Sort by ascent descending', () => testSort(
    'track.positiveElevation',
    false,
    names => {
      const expected = [...EXPECTED_TRAILS].sort((t1, t2) => (t2.ascent ?? 0) - (t1.ascent ?? 0)).map(t => t.name);
      check(expected, names, 'sort descending by positive elevation');
    }
  ));

  it('Sort by descent ascending', () => testSort(
    'track.negativeElevation',
    true,
    names => {
      const expected = [...EXPECTED_TRAILS].sort((t1, t2) => (t1.descent ?? 0) - (t2.descent ?? 0)).map(t => t.name);
      check(expected, names, 'sort ascending by negative elevation');
    }
  ));

  it('Sort by descent descending', () => testSort(
    'track.negativeElevation',
    false,
    names => {
      const expected = [...EXPECTED_TRAILS].sort((t1, t2) => (t2.descent ?? 0) - (t1.descent ?? 0)).map(t => t.name);
      check(expected, names, 'sort descending by negative elevation');
    }
  ));

  // --- Filter

  it('Filter on positive elevation greater than 1200 ft', async () => {
    await (await list.getToolbarButton('filters')).click();
    const popup = new FilterTrailsPopup(await App.waitModal());
    await popup.resetFilters();
    await popup.setNumericFilter('Positive elevation', 1200, undefined);
    await popup.close();
    await expectListContainsByName(list, [...EXPECTED_TRAILS].filter(t => t.ascent && t.ascent >= 1200));
  });

  it('Filter on negative elevation less than 1500 ft', async () => {
    await (await list.getToolbarButton('filters')).click();
    const popup = new FilterTrailsPopup(await App.waitModal());
    await popup.resetFilters();
    await popup.setNumericFilter('Negative elevation', undefined, 1500);
    await popup.close();
    await expectListContainsByName(list, [...EXPECTED_TRAILS].filter(t => t.descent && t.descent <= 1500));
  });


  it('Filter on Tag 1', async () => {
    await (await list.getToolbarButton('filters')).click();
    const popup = new FilterTrailsPopup(await App.waitModal());
    await popup.resetFilters();
    await popup.setTagsFilter('include_and', ['Tag 1']);
    await popup.close();
    await expectListContainsByName(list, [...EXPECTED_TRAILS].filter(t => t.tags.indexOf('Tag 1') >= 0));
  });

  it('Filter on Tag 2 and Tag 3', async () => {
    await (await list.getToolbarButton('filters')).click();
    const popup = new FilterTrailsPopup(await App.waitModal());
    await popup.resetFilters();
    await popup.setTagsFilter('include_and', ['Tag 2', 'Tag 3']);
    await popup.close();
    await expectListContainsByName(list, [...EXPECTED_TRAILS].filter(t => t.tags.indexOf('Tag 2') >= 0 && t.tags.indexOf('Tag 3') >= 0));
  });

  it('Filter on Tag 1 or Tag 3', async () => {
    await (await list.getToolbarButton('filters')).click();
    const popup = new FilterTrailsPopup(await App.waitModal());
    await popup.resetFilters();
    await popup.setTagsFilter('include_or', ['Tag 1', 'Tag 3']);
    await popup.close();
    await expectListContainsByName(list, [...EXPECTED_TRAILS].filter(t => t.tags.indexOf('Tag 1') >= 0 || t.tags.indexOf('Tag 3') >= 0));
  });

  it('Filter on not Tag 2', async () => {
    await (await list.getToolbarButton('filters')).click();
    const popup = new FilterTrailsPopup(await App.waitModal());
    await popup.resetFilters();
    await popup.setTagsFilter('exclude', ['Tag 2']);
    await popup.close();
    await expectListContainsByName(list, [...EXPECTED_TRAILS].filter(t => t.tags.indexOf('Tag 2') < 0));
  });

  it('Filter on without any tag', async () => {
    await (await list.getToolbarButton('filters')).click();
    const popup = new FilterTrailsPopup(await App.waitModal());
    await popup.resetFilters();
    await popup.setTagsFilter('onlyWithoutAnyTag', []);
    await popup.close();
    await expectListContainsByName(list, [...EXPECTED_TRAILS].filter(t => t.tags.length === 0));
  });

  it('Filter visible on map', async () => {
    await (await list.getToolbarButton('filters')).click();
    const popup = new FilterTrailsPopup(await App.waitModal());
    await popup.resetFilters();
    await popup.showOnlyVisibleCheckbox.setSelected(true);
    await popup.close();
    const map = await page.trailsAndMap.openMap();
    await map.goTo(43.388583, 6.023254, 11);
    list = await page.trailsAndMap.openTrailsList();
    await expectListContainsByName(list, [...EXPECTED_TRAILS].filter(t => t.name === 'Près de Tourves' || t.name === 'Randonnée du 20/02/2022 à 09:55'));
  });

  it('Remove filters', async () => {
    await (await list.getToolbarButton('filters')).click();
    const popup = new FilterTrailsPopup(await App.waitModal());
    await popup.resetFilters();
    await popup.close();
    await expectListContains(list, EXPECTED_TRAILS);
  });

  it('End', async () => await App.end());
});
