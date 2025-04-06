import { App } from '../../app/app';
import { FilesUtils } from '../../utils/files-utils';
import { MailHog } from '../../utils/mailhog';

describe('Shares - Share 1', () => {

  let linkUrl: string;

  it('Open mail', async () => {
    App.init();
    const mh = new MailHog();
    await mh.open();
    const msg = await mh.openMessageTo('friend1@trailence.org');
    expect(msg).toBeDefined();
    let i = msg!.indexOf('<a href="');
    expect(i).toBeGreaterThan(0);
    let j = msg!.indexOf('"', i + 9);
    const link = msg!.substring(i + 9, j);
    expect(link.startsWith('https://trailence.org/link/')).toBeTrue();
    linkUrl = link.substring(27);
    await mh.deleteMessage();
    await FilesUtils.fs().then(fs => {
      fs.writeFileSync(App.config.downloadPath + '/share1.link', linkUrl);
    });
  });

  it('Open link', async () => {
    const page = await App.startLink(linkUrl);
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

});
