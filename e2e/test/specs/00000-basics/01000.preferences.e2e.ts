import { App } from '../../app/app';
import { Page } from '../../app/pages/page';
import { PreferencesPage } from '../../app/pages/preferences-page';
import { HeaderComponent } from '../../components/header.component';
import { TrailsList } from '../../components/trails-list.component';
import { FilesUtils } from '../../utils/files-utils';
import { OpenFile } from '../../utils/open-file';
import { TestUtils } from '../../utils/test-utils';

describe('Preferences', () => {

  const checkTrail = async (
    list: TrailsList,
    date: string,
    timeTitle: string, time: string,
    distanceTitle: string, distance: string,
    ascentTitle: string, positiveElevation: string,
    descentTitle: string, negativeElevation: string,
  ) => {
    const trail = await list.waitTrail('Randonnée du 05/06/2023 à 08:58');
    if (!trail) throw new Error('Trail not found');
    let value = await trail.getTrailMetadata('date', true);
    if (value !== date) throw new Error('Date found <' + value + '> expected was <' + date + '>');
    const meta = await trail.getTrackMetadata();
    if (meta.get(timeTitle) !== time) throw new Error(timeTitle + ' found <' + meta.get(timeTitle) + '> expected was <' + time + '>');
    if (meta.get(distanceTitle) !== distance) throw new Error(distanceTitle + ' found <' + meta.get(distanceTitle) + '> expected was <' + distance + '>');
    if (meta.get(ascentTitle) !== positiveElevation) throw new Error(ascentTitle + ' found <' + meta.get(ascentTitle) + '> expected was <' + positiveElevation + '>');
    if (meta.get(descentTitle) !== negativeElevation) throw new Error(descentTitle + ' found <' + meta.get(descentTitle) + '> expected was <' + negativeElevation + '>');
  }

  const expectedUtcDate = Date.UTC(2023, 4, 6, 6, 58, 0, 0);
  const pad = (n: number) => {
    let s = '' + n;
    if (s.length < 2) s = '0' + s;
    return s;
  };
  const expectedDateEn = '6/5/2023 ' + pad(new Date(expectedUtcDate).getHours() % 12) + ':' + pad(new Date(expectedUtcDate).getMinutes()) + ' ' + (new Date(expectedUtcDate).getHours() >= 12 ? 'PM' : 'AM');
  const expectedDateFr = '05/06/2023 ' + pad(new Date(expectedUtcDate).getHours()) + ':' + pad(new Date(expectedUtcDate).getMinutes());

  it('Login, import a GPX', async () => {
    App.init();
    const loginPage = await App.start();
    const myTrailsPage = await loginPage.loginAndWaitMyTrailsCollection();
    const trailsList = await myTrailsPage.trailsAndMap.openTrailsList();
    const importButton = await trailsList.getToolbarButton('add-circle');
    await importButton.click();
    await OpenFile.openFile((await FilesUtils.fs()).realpathSync('./test/assets/gpx-001.gpx'));
    await checkTrail(trailsList, expectedDateEn, 'Duration', '3h07 (≈ 2h40)', 'Distance', '5.335 mi', 'Ascent', '+ 1,053 ft', 'Descent', '- 971 ft');
  });

  const goToPreferences = async (title: string) => {
    const menu = await new HeaderComponent(await Page.getActivePageElement()).openUserMenu();
    await menu.clickByLabel(title);
    const page = new PreferencesPage();
    await page.waitDisplayed();
    return page;
  };

  const goToCollection = async (name: string) => {
    const menu = await App.openMenu();
    return await menu.openCollection(name);
  };

  it('Change language to french', async () => {
    const preferences = await goToPreferences('Preferences');
    await (await preferences.getOptionSegmentByTitle('Language')).setSelected('fr');
    await browser.waitUntil(() => preferences.header.getTitle().then(title => title === 'Préférences'));
    expect(await (await preferences.getOptionSegmentByTitle('Unité de distance')).getSelected()).toBe('METERS');
    expect(await (await preferences.getOptionSegmentByTitle('Format de date')).getSelected()).toBe('dd/mm/yyyy');
    expect(await (await preferences.getOptionSegmentByTitle('Format d\'heure')).getSelected()).toBe('H24');
    const collection = await goToCollection('Mes Parcours');
    await checkTrail(await collection.trailsAndMap.openTrailsList(), expectedDateFr, 'Durée', '3h07 (≈ 2h40)', 'Distance', '8,59 km', 'Dénivelé positif', '+ 321 m', 'Dénivelé négatif', '- 296 m');
  });

  it('Change back to english', async () => {
    const preferences = await goToPreferences('Préférences');
    await (await preferences.getOptionSegmentByTitle('Langue')).setSelected('en');
    await browser.waitUntil(() => preferences.header.getTitle().then(title => title === 'Preferences'));
    expect(await (await preferences.getOptionSegmentByTitle('Distance Unit')).getSelected()).toBe('IMPERIAL');
    expect(await (await preferences.getOptionSegmentByTitle('Date format')).getSelected()).toBe('m/d/yyyy');
    expect(await (await preferences.getOptionSegmentByTitle('Time format')).getSelected()).toBe('H12');
    const collection = await goToCollection('My Trails');
    await checkTrail(await collection.trailsAndMap.openTrailsList(), expectedDateEn, 'Duration', '3h07 (≈ 2h40)', 'Distance', '5.335 mi', 'Ascent', '+ 1,053 ft', 'Descent', '- 971 ft');
  });

  it('Change speed', async () => {
    const preferences = await goToPreferences('Preferences');
    await (await preferences.getRangeByTitle('Speed on flat terrain')).setValue(10);
    const collection = await goToCollection('My Trails');
    await TestUtils.retry(
      async () => await checkTrail(await collection.trailsAndMap.openTrailsList(), expectedDateEn, 'Duration', '3h07 (≈ 1h00)', 'Distance', '5.335 mi', 'Ascent', '+ 1,053 ft', 'Descent', '- 971 ft'),
      20, 1000
    );
  });

  it('Reset all, delete trail, and synchronize', async () => {
    const preferences = await goToPreferences('Preferences');
    await preferences.resetAll();
    const collection = await goToCollection('My Trails');
    const trailsList = await collection.trailsAndMap.openTrailsList();
    await TestUtils.retry(
      async () => await checkTrail(trailsList, expectedDateEn, 'Duration', '3h07 (≈ 2h40)', 'Distance', '5.335 mi', 'Ascent', '+ 1,053 ft', 'Descent', '- 971 ft'),
      20, 1000
    );
    const trail = await trailsList.findItemByTrailName('Randonnée du 05/06/2023 à 08:58');
    await trail!.clickMenuItem('Delete');
    const alert = await App.waitAlert();
    expect(await alert.getTitle()).toBe('Delete Trail');
    await alert.clickButtonWithRole('danger');
    await browser.waitUntil(() => trailsList.items.getElements().then(l => l.length === 0));
    await App.synchronize();
  });

});
