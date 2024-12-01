import { App } from '../../app/app';
import { TrailsPage } from '../../app/pages/trails-page';
import { SortTrailsPopup } from '../../components/sort-trails-popup';
import { TrailsList } from '../../components/trails-list.component';
import { EXPECTED_TRAILS, expectListContains } from './00099.list';

describe('Trails list - Sort', () => {

  it('Login and go to Test import collection', async () => {
    App.init();
    const loginPage = await App.start();
    await loginPage.loginAndWaitMyTrailsCollection();
    const menu = await App.openMenu();
    const page = await menu.openCollection('Test Import');
    expect(await page.header.getTitle()).toBe('Test Import');
  });

  let list: TrailsList;

  it('List contains expected trails', async () => {
    const page = new TrailsPage();
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

});
