import { App } from '../app/app';
import { TrailsPage } from '../app/pages/trails-page';
import { ImportTagsPopup } from '../components/import-tags-popup.component';
import { TrailsList } from '../components/trails-list.component';
import { FilesUtils } from './files-utils';
import { OpenFile } from './open-file';
import { TestUtils } from './test-utils';

export interface ExpectedTrail {
  name: string;
  startDate: number;
  endDate: number;
  ascent: number | undefined;
  descent: number | undefined;
  tags: string[];
  photos: number;
}

export const expectedTrailsByFile: {[key: string]: () => ExpectedTrail[]} = {
  'gpx-001.gpx': () => [{
    name: 'Randonnée du 05/06/2023 à 08:58',
    startDate: new Date('2023-06-05T08:58:08+02:00').getTime(),
    endDate: new Date('2023-06-05T12:22:56+02:00').getTime(),
    ascent: 1007,
    descent: 925,
    tags: [],
    photos: 0,
  }],
  'gpx-002.gpx': () => [{
    name: 'Tour de Port-Cros',
    startDate: new Date('2024-06-15T08:13:06.000Z').getTime(),
    endDate: new Date('2024-06-15T13:51:23.000Z').getTime(),
    ascent: 1601,
    descent: 1555,
    tags: ['Tag 1', 'Tag 2'],
    photos: 0,
  }],
  'gpx-003.gpx': () => [{
    name: 'Roquefraîche',
    startDate: new Date('2024-04-04T08:17:44.000Z').getTime(),
    endDate: new Date('2024-04-04T13:08:23.000Z').getTime(),
    ascent: 1283,
    descent: 1280,
    tags: ['Tag 2', 'Tag 3'],
    photos: 0,
  }],
  'gpx-004.gpx': () => [{
    name: 'Au dessus de Montclar',
    startDate: new Date('2022-06-29T07:53:36.000Z').getTime(),
    endDate: new Date('2022-06-29T13:41:20.000Z').getTime(),
    ascent: 1742,
    descent: 1729,
    tags: ['Tag 1', 'Tag 4'],
    photos: 0,
  }],
  'gpx-zip-001.zip': () => [{
    name: 'Près de Tourves',
    startDate: new Date('2021-10-09T08:08:32.000Z').getTime(),
    endDate: new Date('2021-10-09T11:56:48.000Z').getTime(),
    ascent: 1440,
    descent: 1447,
    tags: ['Tag 4'],
    photos: 0,
  }, {
    name: 'Randonnée du 20/02/2022 à 09:55',
    startDate: new Date('2022-02-20T08:55:28.000Z').getTime(),
    endDate: new Date('2022-02-20T13:17:52.000Z').getTime(),
    ascent: 1063,
    descent: 1001,
    tags: ['Tag 1'],
    photos: 0,
  }],
  'gpx-zip-002.zip': () => [{
    name: 'Col et lacs de la Cayolle',
    startDate: new Date('2020-09-21T05:05:04.000Z').getTime(),
    endDate: new Date('2020-09-21T09:04:00.000Z').getTime(),
    ascent: 1985,
    descent: 1992,
    tags: ['Tag 2'],
    photos: 1,
  }]
};

export async function importTrail(collectionPage: TrailsPage, filename: string, expected?: string[], tagsPopup?: (popup: ImportTagsPopup) => Promise<any>) {
  const trailsList = await collectionPage.trailsAndMap.openTrailsList();
  await importTrailInternal(trailsList, filename, tagsPopup);
  if (expected) {
    for (const trailName of expected) {
      const trail = await trailsList.waitTrail(trailName);
      expect(trail).toBeDefined();
    }
  }
}

async function importTrailInternal(trailsList: TrailsList, filename: string, tagsPopup?: (popup: ImportTagsPopup) => Promise<any>) {
  await trailsList.importFile('./test/assets/' + filename);
  if (tagsPopup) {
    const popup = new ImportTagsPopup(await App.waitModal());
    expect(await popup.getTitle()).toBe('Import tags');
    await tagsPopup(popup);
  }
}

export async function importTrails(collectionPage: TrailsPage, filenames: string[]) {
  const trailsList = await collectionPage.trailsAndMap.openTrailsList();
  const expectedTrails: ExpectedTrail[] = [];
  for (const filename of filenames)
    expectedTrails.push(...expectedTrailsByFile[filename]());
  await trailsList.importFiles(filenames.map(f => './test/assets/' + f));
  if (expectedTrails.reduce((p,n) => p || n.tags.length > 0, false)) {
    const popup = new ImportTagsPopup(await App.waitModal());
    await popup.importAll();
  }
  return expectedTrails;
}

export function expectedFromFiles(filenames: string[]) {
  const result = [];
  for (const filename of filenames)
    result.push(...expectedTrailsByFile[filename]());
  return result;
}

export async function expectListContains(list: TrailsList, expectedTrails: ExpectedTrail[]) {
  let nbFound = 0;
  try { await browser.waitUntil(() => list.items.length.then(nb => { nbFound = nb; return nb === expectedTrails.length; })); } catch (e) {}
  expect(nbFound).toBe(expectedTrails.length);
  for (const expected of expectedTrails) {
    const trail = await list.findItemByTrailName(expected.name);
    expect(trail).withContext('Expected trail ' + expected.name).toBeDefined();
    const tags = await TestUtils.retry(async (trial) => {
      if (trial > 1) await trail!.getElement().scrollIntoView({block: 'center', inline: 'center'});
      let list = await trail!.getTags();
      if (list.length !== expected.tags.length) return Promise.reject(new Error('Expected tags ' + expected.tags + ' found ' + list + ' on trail ' + expected.name));
      return list;
    }, 3, 1000);
    expect(tags.length).withContext('Trails tags ' + expected.name).toBe(expected.tags.length);
    for (const expectedTag of expected.tags) {
      expect(tags).withContext('Trails tags ' + expected.name).toContain(expectedTag);
    }
    if (expected.photos > 0) {
      let hasSlider = false;
      await TestUtils.retry(async (trial) => {
        if (trial > 1) await trail!.getElement().scrollIntoView({block: 'center', inline: 'center'});
        const slider = trail!.getPhotosSliderElement();
        hasSlider = await slider.isExisting() && await slider.isDisplayed();
        if (!hasSlider) throw Error('Trails expected photos: ' + expected.name);
      }, 10, 1000);
    }
  }
}

export async function expectListContainsByName(list: TrailsList, expectedTrails: ExpectedTrail[]) {
  try { await browser.waitUntil(() => list.items.length.then(nb => nb === expectedTrails.length)); } catch (e) {}
  const names = await list.getTrailsNames();
  for (const expected of expectedTrails) {
    expect(names).toContain(expected.name);
  }
  expect(names.length).toBe(expectedTrails.length);
}
