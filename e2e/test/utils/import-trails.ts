import { App } from '../app/app';
import { TrailsPage } from '../app/pages/trails-page';
import { ImportTagsPopup } from '../components/import-tags-popup.component';
import { OpenFile } from './open-file';

export async function importTrail(collectionPage: TrailsPage, filename: string, expected: string[], tagsPopup?: (popup: ImportTagsPopup) => Promise<any>) {
  const trailsList = await collectionPage.trailsAndMap.openTrailsList();
  const importButton = await trailsList.getToolbarButton('add-circle');
  await importButton.click();
  await OpenFile.openFile((await import('fs')).realpathSync('./test/assets/' + filename));
  if (tagsPopup) {
    const popup = new ImportTagsPopup(await App.waitModal());
    expect(await popup.getTitle()).toBe('Import tags');
    await tagsPopup(popup);
  }
  for (const trailName of expected) {
    const trail = await trailsList.waitTrail(trailName);
    expect(trail).toBeDefined();
  }
}

export async function importAllTrailsToCollection(collectionPage: TrailsPage) {

  await importTrail(collectionPage, 'gpx-001.gpx', ['Randonnée du 05/06/2023 à 08:58']);
  await importTrail(collectionPage, 'gpx-002.gpx', ['Tour de Port-Cros'], async (popup) => popup.importAll());
  await importTrail(collectionPage, 'gpx-003.gpx', ['Roquefraîche'], async (popup) => popup.importAllWithExistingAndMissing());
  await importTrail(collectionPage, 'gpx-004.gpx', ['Au dessus de Montclar'], async (popup) => popup.importAllWithExistingAndMissing());
  await importTrail(collectionPage, 'gpx-zip-002.zip', ['Col et lacs de la Cayolle'], async (popup) => popup.importAll());

}
