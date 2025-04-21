import { App } from '../../app/app';
import { FilesUtils } from '../../utils/files-utils';
import { MailHog } from '../../utils/mailhog';

describe('Shares - Check shares', () => {

  let link1: string;
  let link2: string;
  let link3: string;
  let link4: string;

  it('Retrieve links from mails', async () => {
    App.init();
    const mh = new MailHog();
    await mh.open();
    let msg = await mh.openMessageTo('friend1@trailence.org');
    expect(msg).toBeDefined();
    let i = msg!.indexOf('<a href="');
    expect(i).toBeGreaterThan(0);
    let j = msg!.indexOf('"', i + 9);
    let link = msg!.substring(i + 9, j);
    expect(link.startsWith('https://trailence.org/link/')).toBeTrue();
    link1 = link.substring(27);
    await mh.deleteMessage();
    await FilesUtils.fs().then(fs => {
      fs.writeFileSync(App.config.downloadPath + '/share1.link', link1);
    });

    msg = await mh.openMessageTo('friend2@trailence.org');
    expect(msg).toBeDefined();
    i = msg!.indexOf('<a href="');
    expect(i).toBeGreaterThan(0);
    j = msg!.indexOf('"', i + 9);
    link = msg!.substring(i + 9, j);
    expect(link.startsWith('https://trailence.org/link/')).toBeTrue();
    link2 = link.substring(27);
    await mh.deleteMessage();
    await FilesUtils.fs().then(fs => {
      fs.writeFileSync(App.config.downloadPath + '/share2.link', link2);
    });

    msg = await mh.openMessageTo('friend3@trailence.org');
    expect(msg).toBeDefined();
    i = msg!.indexOf('<a href="');
    expect(i).toBeGreaterThan(0);
    j = msg!.indexOf('"', i + 9);
    link = msg!.substring(i + 9, j);
    expect(link.startsWith('https://trailence.org/link/')).toBeTrue();
    link3 = link.substring(27);
    await mh.deleteMessage();
    await FilesUtils.fs().then(fs => {
      fs.writeFileSync(App.config.downloadPath + '/share3.link', link3);
    });

    msg = await mh.openMessageTo('friend4@trailence.org');
    expect(msg).toBeDefined();
    i = msg!.indexOf('<a href="');
    expect(i).toBeGreaterThan(0);
    j = msg!.indexOf('"', i + 9);
    link = msg!.substring(i + 9, j);
    expect(link.startsWith('https://trailence.org/link/')).toBeTrue();
    link4 = link.substring(27);
    await mh.deleteMessage();
    await FilesUtils.fs().then(fs => {
      fs.writeFileSync(App.config.downloadPath + '/share4.link', link4);
    });
  });

  it('Check share 1', async () => {
    const page = await App.openLink(link1);
    await browser.waitUntil(() => page.header.getTitle().then(title => title === 'full col'));
    const menu = await page.header.openUserMenu();
    expect(await menu.getUser()).toBe('friend1@trailence.org');
    await menu.close();

    const appMenu = await App.openMenu();
    expect(await appMenu.hasAdmin()).toBeFalse();
    await appMenu.close();

    const list = await page.trailsAndMap.openTrailsList();
    await browser.waitUntil(() => list.items.length.then(nb => nb === 5));
    const trails = await list.getTrailsNames();
    expect(trails).toContain('Tour de Port-Cros');
    expect(trails).toContain('Roquefraîche');
    expect(trails).toContain('Au dessus de Montclar');
    expect(trails).toContain('Col et lacs de la Cayolle');
    expect(trails).toContain('Randonnée du 05/06/2023 à 08:58');
    expect(trails.length).toBe(5);

    const trail = await list.findItemByTrailName('Col et lacs de la Cayolle');
    expect(trail).toBeDefined();
    await trail!.expectNoPhotos();
  });

  it('Check share 2', async () => {
    const page = await App.openLink(link2);
    await browser.waitUntil(() => page.header.getTitle().then(title => title === 'tag2 nophoto'));
    const menu = await page.header.openUserMenu();
    expect(await menu.getUser()).toBe('friend2@trailence.org');
    await menu.close();
    const list = await page.trailsAndMap.openTrailsList();
    await browser.waitUntil(() => list.items.length.then(nb => nb === 3));
    const trails = await list.getTrailsNames();
    expect(trails).toContain('Tour de Port-Cros');
    expect(trails).toContain('Roquefraîche');
    expect(trails).toContain('Col et lacs de la Cayolle');
    expect(trails.length).toBe(3);

    const trail = await list.findItemByTrailName('Col et lacs de la Cayolle');
    expect(trail).toBeDefined();
    await trail!.expectNoPhotos();
  });

  it('Check share 3', async () => {
    const page = await App.openLink(link3);
    await browser.waitUntil(() => page.header.getTitle().then(title => title === 'tag2+4+photo'));
    const menu = await page.header.openUserMenu();
    expect(await menu.getUser()).toBe('friend3@trailence.org');
    await menu.close();
    const list = await page.trailsAndMap.openTrailsList();
    await browser.waitUntil(() => list.items.length.then(nb => nb === 4));
    const trails = await list.getTrailsNames();
    expect(trails).toContain('Tour de Port-Cros');
    expect(trails).toContain('Roquefraîche');
    expect(trails).toContain('Au dessus de Montclar');
    expect(trails).toContain('Col et lacs de la Cayolle');
    expect(trails.length).toBe(4);

    const trail = await list.findItemByTrailName('Col et lacs de la Cayolle');
    expect(trail).toBeDefined();
    await trail!.expectPhotos();
  });

  it('Check share 4', async () => {
    const page = await App.openLink(link4);
    await browser.waitUntil(() => page.header.getTitle().then(title => title === '2trails'));
    const menu = await page.header.openUserMenu();
    expect(await menu.getUser()).toBe('friend4@trailence.org');
    await menu.close();
    const list = await page.trailsAndMap.openTrailsList();
    await browser.waitUntil(() => list.items.length.then(nb => nb === 2));
    const trails = await list.getTrailsNames();
    expect(trails).toContain('Tour de Port-Cros');
    expect(trails).toContain('Randonnée du 05/06/2023 à 08:58');
    expect(trails.length).toBe(2);
  });

  it('End', async () => {
    await App.logout(false);
    await App.end();
  });
});
