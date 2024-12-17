import { App } from '../../app/app';
import { FilesUtils } from '../../utils/files-utils';
import { MailHog } from '../../utils/mailhog';

describe('Shares - Share 2', () => {

  let linkUrl: string;

  it('Open mail', async () => {
    const mh = new MailHog();
    await mh.open();
    const msg = await mh.openMessageTo('friend2@trailence.org');
    expect(msg).toBeDefined();
    let i = msg!.indexOf('<a href="');
    expect(i).toBeGreaterThan(0);
    let j = msg!.indexOf('"', i + 9);
    const link = msg!.substring(i + 9, j);
    expect(link.startsWith('https://trailence.org/link/')).toBeTrue();
    linkUrl = link.substring(27);
    await mh.deleteMessage();
    await FilesUtils.fs().then(fs => {
      fs.writeFileSync('./downloads/share2.link', linkUrl);
    });
  });

  it('Open link', async () => {
    App.init();
    const page = await App.startLink(linkUrl);
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

});
