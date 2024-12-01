import { TrailsList } from '../../components/trails-list.component';
import { TestUtils } from '../../utils/test-utils';

export interface ExpectedTrail {
  importIndex: number;
  name: string;
  startDate: number;
  endDate: number;
  ascent: number | undefined;
  descent: number | undefined;
  tags: string[];
  photos: number;
}

export const EXPECTED_TRAILS: ExpectedTrail[] = [
  {
    importIndex: 1,
    name: 'Randonnée du 05/06/2023 à 08:58',
    startDate: new Date('2023-06-05T08:58:08+02:00').getTime(),
    endDate: new Date('2023-06-05T12:22:56+02:00').getTime(),
    ascent: 1053,
    descent: 971,
    tags: [],
    photos: 0,
  }, {
    importIndex: 2,
    name: 'Tour de Port-Cros',
    startDate: new Date('2024-06-15T08:13:06.000Z').getTime(),
    endDate: new Date('2024-06-15T13:51:23.000Z').getTime(),
    ascent: 1601,
    descent: 1555,
    tags: ['Tag 1', 'Tag 2'],
    photos: 0,
  }, {
    importIndex: 3,
    name: 'Roquefraîche',
    startDate: new Date('2024-04-04T08:17:44.000Z').getTime(),
    endDate: new Date('2024-04-04T13:08:23.000Z').getTime(),
    ascent: 1283,
    descent: 1280,
    tags: ['Tag 2', 'Tag 3'],
    photos: 0,
  }, {
    importIndex: 4,
    name: 'Au dessus de Montclar',
    startDate: new Date('2022-06-29T07:53:36.000Z').getTime(),
    endDate: new Date('2022-06-29T13:41:20.000Z').getTime(),
    ascent: 1742,
    descent: 1729,
    tags: ['Tag 1'],
    photos: 0,
  }, {
    importIndex: 5,
    name: 'Près de Tourves',
    startDate: new Date('2021-10-09T08:08:32.000Z').getTime(),
    endDate: new Date('2021-10-09T11:56:48.000Z').getTime(),
    ascent: 1424,
    descent: 1430,
    tags: ['Tag 4'],
    photos: 0,
  }, {
    importIndex: 5,
    name: 'Randonnée du 20/02/2022 à 09:55',
    startDate: new Date('2022-02-20T08:55:28.000Z').getTime(),
    endDate: new Date('2022-02-20T13:17:52.000Z').getTime(),
    ascent: 1096,
    descent: 1033,
    tags: ['Tag 1'],
    photos: 0,
  }, {
    importIndex: 6,
    name: 'Col et lacs de la Cayolle',
    startDate: new Date('2020-09-21T05:05:04.000Z').getTime(),
    endDate: new Date('2020-09-21T09:04:00.000Z').getTime(),
    ascent: 1985,
    descent: 1992,
    tags: ['Tag 2'],
    photos: 1,
  }
];

export async function expectListContains(list: TrailsList, expectedTrails: ExpectedTrail[]) {
  let nbFound = 0;
  try { await browser.waitUntil(() => list.items.length.then(nb => { nbFound = nb; return nb === expectedTrails.length; })); } catch (e) {}
  expect(nbFound).toBe(expectedTrails.length);
  for (const expected of expectedTrails) {
    const trail = await list.findItemByTrailName(expected.name);
    expect(trail).withContext('Expected trail ' + expected.name).toBeDefined();
    const tags = await TestUtils.retry(async () => {
      let list = await trail!.getTags();
      if (list.length !== expected.tags.length) return Promise.reject();
      return list;
    }, 3, 1000);
    expect(tags.length).withContext('Trails tags ' + expected.name).toBe(expected.tags.length);
    for (const expectedTag of expected.tags) {
      expect(tags).withContext('Trails tags ' + expected.name).toContain(expectedTag);
    }
    if (expected.photos > 0)
      await browser.waitUntil(async () => {
        const slider = trail!.getPhotosSliderElement();
        return await slider.isExisting() && await slider.isDisplayed();
      }, { timeoutMsg: 'Trails expected photos: ' + expected.name });
  }
}
