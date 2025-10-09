import { App } from '../../app/app';
import { TrailPage } from '../../app/pages/trail-page';
import { TrailsPage } from '../../app/pages/trails-page';
import { TagsPopup } from '../../components/tags-popup';
import { TrailsList } from '../../components/trails-list.component';
import { expectedFromFiles, ExpectedTrail, expectListContains, importTrails } from '../../utils/import-trails';

describe('Trails Tools', () => {

  let collectionPage: TrailsPage;
  let EXPECTED_TRAILS: ExpectedTrail[];

  it('Login, open collection, import trails', async () => {
    App.init();
    const loginPage = await App.start();
    await loginPage.loginAndWaitMyTrailsCollection();
    const menu = await App.openMenu();
    collectionPage = await menu.openCollection('Test SortFilter');
    expect(await collectionPage.header.getTitle()).toBe('Test SortFilter');
    EXPECTED_TRAILS = expectedFromFiles(['gpx-001.gpx', 'gpx-002.gpx', 'gpx-003.gpx', 'gpx-004.gpx', 'gpx-zip-001.zip', 'gpx-zip-002.zip']);
  });

  let list: TrailsList;
  let trailPage: TrailPage;

  it('Switch to condensed list, then back', async () => {
    list = await collectionPage.trailsAndMap.openTrailsList();
    await list.switchToCondensedView();
    await browser.waitUntil(() => list.getElement(true).$('div.trails').$$('app-trail-overview-condensed').length.then(nb => nb === EXPECTED_TRAILS.length));
    await list.switchToDetailedView();
    try {
      await browser.waitUntil(() => list.getElement(true).$('div.trails').$$('app-trail-overview').length.then(nb => nb === EXPECTED_TRAILS.length));
    } catch (e) { // NOSONAR
      throw new Error('Expected ' + EXPECTED_TRAILS.length + ', found ' + (await list.getElement(true).$('div.trails').$$('app-trail-overview').length));
    }
  });

  let duration1: string, duration2: string;

  it('Select first, then second, and compare', async () => {
    const trail1 = await list.findItemByTrailName('Randonnée du 20/02/2022 à 09:55');
    const trail1Id = await list.getTrailId(trail1!);
    await trail1!.clickMenuItem('Compare with...');
    await (await App.waitAlert()).clickButtonWithRole('cancel');
    const trail2 = await list.findItemByTrailName('Près de Tourves');
    await trail2!.clickMenuItem('Compare with this trail');
    const trail2Id = await list.getTrailId(trail2!);

    trailPage = new TrailPage(trail1Id.owner, trail1Id.uuid, trail2Id.owner, trail2Id.uuid);
    await trailPage.waitDisplayed();
    expect(await trailPage.header.getTitle()).toBe('Compare');
    expect(await trailPage.header.getTitle2()).toBe('Randonnée du 20/02/2022 à 09:55 and Près de Tourves');
    const details = await trailPage.trailComponent.openDetails();
    expect(await details.$('.description-text').isExisting()).toBeFalse();

    duration1 = (await trailPage.trailComponent.getMetadataValueByTitle('Duration', true))!;
    duration2 = (await trailPage.trailComponent.getMetadataValueByTitle('Duration', false))!;
    expect(duration1).toContain('h');
    expect(duration2).toContain('h');
    expect(duration1).not.toBe(duration2);
  });

  it('Use selection menu to compare trails', async () => {
    await trailPage.header.goBack();
    collectionPage = new TrailsPage();
    await collectionPage.waitDisplayed();
    list = await collectionPage.trailsAndMap.openTrailsList();
    const trail1 = await list.findItemByTrailName('Randonnée du 20/02/2022 à 09:55');
    await trail1!.selectTrail();
    const trail1Id = await list.getTrailId(trail1!);
    const trail2 = await list.findItemByTrailName('Près de Tourves');
    await trail2!.selectTrail();
    const trail2Id = await list.getTrailId(trail2!);
    (await list.openSelectionMenu()).clickItemWithText('Compare');

    trailPage = new TrailPage(trail1Id.owner, trail1Id.uuid, trail2Id.owner, trail2Id.uuid);
    await trailPage.waitDisplayed();
    expect(await trailPage.header.getTitle()).toBe('Compare');
    const title2 = await trailPage.header.getTitle2();
    if (title2 !== 'Randonnée du 20/02/2022 à 09:55 and Près de Tourves' && title2 !== 'Près de Tourves and Randonnée du 20/02/2022 à 09:55')
      throw new Error('Unexpected title: ' + title2);
  });

  it('Selecting one or more than two trails, does not propose to compare', async () => {
    await trailPage.header.goBack();
    collectionPage = new TrailsPage();
    await collectionPage.waitDisplayed();

    list = await collectionPage.trailsAndMap.openTrailsList();
    await list.selectAllCheckbox.setSelected(false);

    let trail = await list.findItemByTrailName('Randonnée du 20/02/2022 à 09:55');
    await trail!.selectTrail();

    let menu = await list.openSelectionMenu();
    expect(await menu.hasItem('Compare')).toBeFalse();
    await menu.close();

    trail = await list.findItemByTrailName('Près de Tourves');
    await trail!.selectTrail();

    menu = await list.openSelectionMenu();
    expect(await menu.hasItem('Compare')).toBeTrue();
    await menu.close();

    trail = await list.findItemByTrailName('Roquefraîche');
    await trail!.selectTrail();

    menu = await list.openSelectionMenu();
    expect(await menu.hasItem('Compare')).toBeFalse();
    await menu.close();

    await list.selectAllCheckbox.setSelected(false);
  });

  it('Merge trails', async () => {
    let trail = await list.findItemByTrailName('Randonnée du 20/02/2022 à 09:55');
    await trail!.selectTrail();
    trail = await list.findItemByTrailName('Près de Tourves');
    await trail!.selectTrail();

    await (await list.openSelectionMenu()).clickItemWithText('Merge these tracks');
    trailPage = await TrailPage.waitForName('Merged track');
    await trailPage.trailComponent.openDetails();
    const duration = await trailPage.trailComponent.getMetadataValueByTitle('Duration' ,true);

    let i = duration1.indexOf('h');
    const h1 = parseInt(duration1.substring(0, i));
    const m1 = parseInt(duration1.substring(i + 1));
    i = duration2.indexOf('h');
    const h2 = parseInt(duration2.substring(0, i));
    const m2 = parseInt(duration2.substring(i + 1));
    i = duration.indexOf('h');
    const h3 = parseInt(duration.substring(0, i));
    const m3 = parseInt(duration.substring(i + 1));
    const mergedMinutes = h3 * 60 + m3;
    const expectedMinutes = (h1 + h2) * 60 + m1 + m2;
    expect(Math.abs(expectedMinutes - mergedMinutes)).withContext('Original duration of ' + duration1 + ' + ' + duration2 + ', found merged duration: ' + duration).toBeLessThanOrEqual(2);

    await (await trailPage.header.openActionsMenu()).clickItemWithText('Delete');
    await (await App.waitAlert()).clickButtonWithRole('danger');

    await collectionPage.waitDisplayed();
  });

  it('Edit tags', async () => {
    list = await collectionPage.trailsAndMap.openTrailsList();
    await list.selectAllCheckbox.setSelected(false);
    await (await collectionPage.header.openActionsMenu()).clickItemWithIcon('tags');
    let tags = new TagsPopup('edit', await App.waitModal());
    await tags.editName('Tag 2', 'Tag 2 edited');
    await tags.cancel();

    await expectListContains(list, EXPECTED_TRAILS);

    await (await collectionPage.header.openActionsMenu()).clickItemWithIcon('tags');
    tags = new TagsPopup('edit', await App.waitModal());
    await tags.editName('Tag 2', 'Tag 2 edited');
    await tags.save();

    await expectListContains(list, EXPECTED_TRAILS.map(t => {
      return {...t, tags: t.tags.map(tag => tag === 'Tag 2' ? 'Tag 2 edited' : tag)};
    }));

    await (await collectionPage.header.openActionsMenu()).clickItemWithIcon('tags');
    tags = new TagsPopup('edit', await App.waitModal());
    await tags.editName('Tag 2 edited', 'Tag 2');
    await tags.save();

    await expectListContains(list, EXPECTED_TRAILS);

    let trail = await list.findItemByTrailName('Tour de Port-Cros');
    await trail!.clickMenuItemWithIcon('tags');
    tags = new TagsPopup('selection', await App.waitModal());
    await tags.editMode();
    await tags.editName('Tag 1', 'Tag 1 edited');
    await tags.save();
    await tags.cancel();

    await expectListContains(list, EXPECTED_TRAILS.map(t => {
      return {...t, tags: t.tags.map(tag => tag === 'Tag 1' ? 'Tag 1 edited' : tag)};
    }));

    trail = await list.findItemByTrailName('Tour de Port-Cros');
    await trail!.clickMenuItemWithIcon('tags');
    tags = new TagsPopup('selection', await App.waitModal());
    await tags.editMode();
    await tags.editName('Tag 1 edited', 'Tag 1');
    await tags.save();
    await tags.cancel();

    await expectListContains(list, EXPECTED_TRAILS);

    trail = await list.findItemByTrailName('Tour de Port-Cros');
    await trail!.clickMenuItemWithIcon('tags');
    tags = new TagsPopup('selection', await App.waitModal());
    await tags.editMode();
    await tags.editName('Tag 1', 'Tag 1 edited');
    await tags.cancel();
    await tags.cancel();

    await expectListContains(list, EXPECTED_TRAILS);
  });

  it('Synchronize and logout', async () => {
    await App.synchronize(true);
  });

  it('End', async () => await App.end());

});
