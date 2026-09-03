import { App } from '../../app/app';
import { TrailsPage, TrailsPageType } from '../../app/pages/trails-page';
import { CollectionModal } from '../../components/collection.modal';
import { TagsPopup } from '../../components/tags-popup';
import { ExpectedTrail, expectListContains, importTrails } from '../../utils/import-trails';
import { MailHog } from '../../utils/mailhog';
import { TestUtils } from '../../utils/test-utils';

describe('Shared Collections', () => {

  it('Login', async () => {
    App.init();
    await App.startLoginIfNeeded();
  });

  const expectationsByUser = new Map<string, Map<string, ExpectedTrail[]>>();
  const sc1Email = 'sc1.' + Date.now() + '@trailence.org';
  const sc2Email = 'sc2.' + Date.now() + '@trailence.org';
  const sc3Email = 'sc3.' + Date.now() + '@trailence.org';
  const sc4Email = 'sc4.' + Date.now() + '@trailence.org';

  function getExpectedTrails(user: string, col: string): ExpectedTrail[] {
    return expectationsByUser.get(user)!.get(col)!;
  }
  function updateCollection(col: string, updater: (trails: ExpectedTrail[]) => void) {
    const users = Array.from(expectationsByUser.keys());
    for (const user of users) {
      const byUser = expectationsByUser.get(user)!;
      const byCol = byUser.get(col);
      if (!byCol) continue;
      updater(byCol);
    }
  }
  function newTrails(col: string, trails: ExpectedTrail[]) {
    updateCollection(col, list => list.push(...trails));
  }
  function collectionRemoved(col: string) {
    const users = Array.from(expectationsByUser.keys());
    for (const user of users) {
      const byUser = expectationsByUser.get(user)!;
      byUser.delete(col);
    }
  }
  function updateExpected(col: string, name: string, updater: ((trail: ExpectedTrail) => ExpectedTrail | undefined)) {
    updateCollection(col, trails => {
      const trailIndex = trails.findIndex(t => t.name === name);
      if (trailIndex < 0) return;
      const updated = updater(trails[trailIndex]);
      if (updated) {
        trails[trailIndex] = updated;
      } else {
        trails.splice(trailIndex, 1);
      }
    });
  }
  function tagRenamed(col: string, oldName: string, newName: string) {
    updateCollection(col, trails => {
      for (let i = 0; i < trails.length; ++i) {
        let trail = trails[i];
        for (let j = 0; j < trail.tags.length; ++j) {
          if (trail.tags[j] === oldName) {
            const newTags = [...trail.tags];
            newTags[j] = newName;
            trail = {...trail, tags: newTags};
            break;
          }
        }
        trails[i] = trail;
      }
    });
  }
  function tagRemoved(col: string, name: string) {
    updateCollection(col, trails => {
      for (let i = 0; i < trails.length; ++i) {
        let trail = trails[i];
        const index = trail.tags.indexOf(name);
        if (index >= 0) {
          const newTags = [...trail.tags];
          newTags.splice(index, 1);
          trails[i] = {...trail, tags: newTags};
        }
      }
    });
  }

  it('Create col1 shared with no one, with 1 trail', async () => {
    const colPage = await (await App.openMenu()).addCollection('col1', []);
    const col1Trails = await importTrails(colPage, ['gpx-001.gpx']);
    expectationsByUser.set('user', new Map([['col1', [...col1Trails]]]));
  });

  it('Create col2 shared with sc1, with 2 trails', async () => {
    const colPage = await (await App.openMenu()).addCollection('col2', [sc1Email]);
    const col2Trails = await importTrails(colPage, ['gpx-002.gpx', 'gpx-003.gpx']);
    expectationsByUser.get('user')!.set('col2', [...col2Trails]);
    expectationsByUser.set('sc1', new Map([['col2', [...col2Trails]]]));
  });

  it('Create col3 shared with sc2 and sc3, without trail', async () => {
    await (await App.openMenu()).addCollection('col3', [sc2Email, sc3Email]);
    expectationsByUser.get('user')!.set('col3', []);
    expectationsByUser.set('sc2', new Map([['col3', []]]));
    expectationsByUser.set('sc3', new Map([['col3', []]]));
  });

  it('Synchronize', async () => {
    await App.synchronize();
  });

  let sc1Col2Link: string;
  let sc2Col3Link: string;
  let sc3Col3Link: string;

  it('Get links', async () => {
    const mh = new MailHog();
    await mh.open(true);
    let msg = await mh.openMessageTo(sc1Email);
    expect(msg).toBeDefined();
    let i = msg!.indexOf('<a href="');
    expect(i).toBeGreaterThan(0);
    let j = msg!.indexOf('"', i + 9);
    let link = msg!.substring(i + 9, j);
    expect(link.startsWith('https://trailence.org/link/')).toBeTrue();
    sc1Col2Link = link.substring(27);
    await mh.deleteMessage();

    msg = await mh.openMessageTo(sc2Email);
    expect(msg).toBeDefined();
    i = msg!.indexOf('<a href="');
    expect(i).toBeGreaterThan(0);
    j = msg!.indexOf('"', i + 9);
    link = msg!.substring(i + 9, j);
    expect(link.startsWith('https://trailence.org/link/')).toBeTrue();
    sc2Col3Link = link.substring(27);
    await mh.deleteMessage();

    msg = await mh.openMessageTo(sc3Email);
    expect(msg).toBeDefined();
    i = msg!.indexOf('<a href="');
    expect(i).toBeGreaterThan(0);
    j = msg!.indexOf('"', i + 9);
    link = msg!.substring(i + 9, j);
    expect(link.startsWith('https://trailence.org/link/')).toBeTrue();
    sc3Col3Link = link.substring(27);
    await mh.deleteMessage();

    await mh.closeTab();
  });

  it('sc1 can see col2 with 2 trails, rename Port-Cros, rename Tag 2 to sc1 Tag 2, remove Tag 3, add sc1 Tag to Port-Cros', async () => {
    const page = await App.openLink(sc1Col2Link, TrailsPageType.COLLECTION);
    await browser.waitUntil(() => page.header.getTitle().then(title => title === 'col2'));
    const list = await page.trailsAndMap.openTrailsList();
    const trails = await expectListContains(list, getExpectedTrails('sc1', 'col2'));

    const portCros = trails.get('Tour de Port-Cros')!;
    await portCros.clickMenuItemWithIcon('edit-text');
    const alertRename = await App.waitAlert();
    await alertRename.setInputValue('Port-Cros updated');
    await alertRename.clickButtonWithRole('ok');
    updateExpected('col2', 'Tour de Port-Cros', t => ({...t, name: 'Port-Cros updated'}));

    await portCros.clickMenuItemWithIcon('tags');
    const tagsPopup = new TagsPopup('selection', await App.waitModal());
    await tagsPopup.createTag('sc1 Tag');
    await tagsPopup.editMode();
    await tagsPopup.editName('Tag 2', 'sc1 Tag 2');
    await tagsPopup.removeTag('Tag 3');
    await tagsPopup.save();
    await tagsPopup.apply();
    updateExpected('col2', 'Port-Cros updated', t => ({...t, tags: [...t.tags, 'sc1 Tag']}));
    tagRenamed('col2', 'Tag 2', 'sc1 Tag 2');
    tagRemoved('col2', 'Tag 3');
    await App.synchronize();
  });

  it('sc2 can see col3, create 1 trail with a photo', async () => {
    const page = await App.openLink(sc2Col3Link, TrailsPageType.COLLECTION);
    await browser.waitUntil(() => page.header.getTitle().then(title => title === 'col3'));
    const list = await page.trailsAndMap.openTrailsList();
    const col3Trails = await importTrails(page, ['gpx-zip-002.zip']);
    await expectListContains(list, col3Trails);
    newTrails('col3', col3Trails);
    await App.synchronize();
  });

  it('sc3 can see col3 with 1 trail, rename trail and create sc3tag1', async () => {
    const page = await App.openLink(sc3Col3Link, TrailsPageType.COLLECTION);
    await browser.waitUntil(() => page.header.getTitle().then(title => title === 'col3'));
    const list = await page.trailsAndMap.openTrailsList();
    const trails = await expectListContains(list, getExpectedTrails('sc3', 'col3'));
    const cayolle = trails.get('Col et lacs de la Cayolle')!;

    await cayolle.clickMenuItemWithIcon('edit-text');
    const alertRename = await App.waitAlert();
    await alertRename.setInputValue('Cayolle');
    await alertRename.clickButtonWithRole('ok');

    await cayolle.clickMenuItemWithIcon('tags');
    const tagsPopup = new TagsPopup('selection', await App.waitModal());
    await tagsPopup.createTag('sc3tag1');
    await tagsPopup.apply();
    updateExpected('col3', 'Col et lacs de la Cayolle', t => ({...t, name: 'Cayolle', tags: [...t.tags, 'sc3tag1']}));
    await App.synchronize(true);
  });

  it('user can see 2 trails on col2, rename Port-Cros, rename sc1tag to mytag1, remove sc1tag2, create mytag3', async () => {
    await App.startLoginIfNeeded();
    await App.forceSyncronize();
    const page = await (await App.openMenu()).openCollection('col2');
    const list = await page.trailsAndMap.openTrailsList();
    const trails = await expectListContains(list, getExpectedTrails('user', 'col2'));

    const portCros = trails.get('Port-Cros updated')!;
    await portCros.clickMenuItemWithIcon('edit-text');
    const alertRename = await App.waitAlert();
    await alertRename.setInputValue('Port-Cros');
    await alertRename.clickButtonWithRole('ok');
    updateExpected('col2', 'Port-Cros updated', t => ({...t, name: 'Port-Cros'}));

    await portCros.clickMenuItemWithIcon('tags');
    const tagsPopup = new TagsPopup('selection', await App.waitModal());
    await tagsPopup.createTag('mytag3');
    await tagsPopup.editMode();
    await tagsPopup.editName('sc1 Tag', 'mytag1');
    await tagsPopup.removeTag('sc1 Tag 2');
    await tagsPopup.save();
    await tagsPopup.apply();
    updateExpected('col2', 'Port-Cros', t => ({...t, tags: [...t.tags, 'mytag3']}));
    tagRenamed('col2', 'sc1 Tag', 'mytag1');
    tagRemoved('col2', 'sc1 Tag 2');
  });

  it('user add sc2 to col2', async () => {
    const page = new TrailsPage();
    const menu = await page.header.openActionsMenu();
    await menu.clickItemWithIcon('edit');
    const modal = new CollectionModal(await App.waitModal());
    await modal.addSharedWith(sc2Email);
    await modal.clickSave();
    expectationsByUser.get('sc2')!.set('col2', [...getExpectedTrails('user', 'col2')]);
  });

  it('user can see col3 content, remove col3', async () => {
    const page = await (await App.openMenu()).openCollection('col3');
    const list = await page.trailsAndMap.openTrailsList();
    await expectListContains(list, getExpectedTrails('user', 'col3'));
    const menu = await page.header.openActionsMenu();
    await menu.clickItemWithColor('danger');
    await (await App.waitAlert()).clickButtonWithRole('danger');
    collectionRemoved('col3');
  });

  it('User add sc1 and sc4 to col1', async () => {
    const page = await (await App.openMenu()).openCollection('col1');
    const menu = await page.header.openActionsMenu();
    await menu.clickItemWithIcon('edit');
    const modal = new CollectionModal(await App.waitModal());
    await modal.addSharedWith(sc1Email);
    await modal.addSharedWith(sc4Email);
    await modal.clickSave();
    await App.synchronize();
    expectationsByUser.get('sc1')!.set('col1', [...getExpectedTrails('user', 'col1')]);
    expectationsByUser.set('sc4', new Map([['col1', [...getExpectedTrails('user', 'col1')]]]));
  });

  it('sc2 cannot see col3, can see col2, open Port-Cros remove mytag1, rename mytag3 to tag3sc2, create sc2tag4', async () => {
    await App.openLink(sc2Col3Link, TrailsPageType.COLLECTION);
    await App.forceSyncronize();
    const menu = await App.openMenu();
    await TestUtils.waitFor(() => menu.getCollections(), async names => {
      if (names.includes('col3')) throw new Error('sc2 should not see col3 anymore');
      if (!names.includes('col2')) throw new Error('sc2 should see col2 now');
    });
    const page = await menu.openCollection('col2');
    const list = await page.trailsAndMap.openTrailsList();
    const trails = await expectListContains(list, getExpectedTrails('sc2', 'col2'));

    const portCros = trails.get('Port-Cros')!;
    await portCros.clickMenuItemWithIcon('tags');
    const tagsPopup = new TagsPopup('selection', await App.waitModal());
    await tagsPopup.createTag('sc2tag4');
    await tagsPopup.editMode();
    await tagsPopup.editName('mytag3', 'tag3sc2');
    await tagsPopup.removeTag('mytag1');
    await tagsPopup.save();
    await tagsPopup.apply();
    updateExpected('col2', 'Port-Cros', t => ({...t, tags: [...t.tags, 'sc2tag4']}));
    tagRenamed('col2', 'mytag3', 'tag3sc2');
    tagRemoved('col2', 'mytag1');
    await App.synchronize();
  });

  it('sc1 can see col1, can see sc2 changes on col2, remove himself from col2', async () => {
    let page = await App.openLink(sc1Col2Link, TrailsPageType.COLLECTION);
    await App.forceSyncronize();
    let list = await page.trailsAndMap.openTrailsList();
    await expectListContains(list, getExpectedTrails('sc1', 'col2'));
    await (await page.header.openActionsMenu()).clickItemWithColor('danger');
    await (await App.waitAlert()).clickButtonWithRole('danger');
    expectationsByUser.get('sc1')!.delete('col2');
    page = await (await App.openMenu()).openCollection('col1');
    list = await page.trailsAndMap.openTrailsList();
    await expectListContains(list, getExpectedTrails('sc1', 'col1'));
    await App.synchronize();
  });

  it('sc4 can see col1', async () => {
    const mh = new MailHog();
    await mh.open(true);
    let msg = await mh.openMessageTo(sc4Email);
    expect(msg).toBeDefined();
    let i = msg!.indexOf('<a href="');
    expect(i).toBeGreaterThan(0);
    let j = msg!.indexOf('"', i + 9);
    let link = msg!.substring(i + 9, j);
    expect(link.startsWith('https://trailence.org/link/')).toBeTrue();
    const sc4link = link.substring(27);
    await mh.deleteMessage();
    await mh.closeTab();

    const page = await App.openLink(sc4link, TrailsPageType.COLLECTION);
    await browser.waitUntil(() => page.header.getTitle().then(title => title === 'col1'));
    const list = await page.trailsAndMap.openTrailsList();
    await expectListContains(list, getExpectedTrails('sc4', 'col1'));
    await App.logout();
  });

  it('user can see sc1 removed himself from col2', async () => {
    await App.startLoginIfNeeded();
    await App.forceSyncronize();
    const page = await (await App.openMenu()).openCollection('col2');
    await (await page.header.openActionsMenu()).clickItemWithIcon('edit');
    const modal = new CollectionModal(await App.waitModal());
    const emails = await modal.getEmails();
    expect(emails).toHaveSize(1);
    expect(emails).toContain(sc2Email);
  });

});
