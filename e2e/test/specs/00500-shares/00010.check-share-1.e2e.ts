import { App } from '../../app/app';
import { MailHog } from '../../utils/mailhog';

describe('Shares - Share 1', () => {

  let linkUrl: string;

  it('Open mail', async () => {
    const mh = new MailHog();
    await mh.open();
    const msg = await mh.openMessageTo('friend1@trailence.org');
    expect(msg).toBeDefined();
    let i = msg.indexOf('<a href="');
    expect(i).toBeGreaterThan(0);
    let j = msg.indexOf('"', i + 9);
    const link = msg.substring(i + 9, j);
    expect(link.startsWith('https://trailence.org/link/')).toBeTrue();
    linkUrl = link.substring(27);
    await mh.deleteMessage();
  });

  it('Open link', async () => {
    App.init();
    const page = await App.startLink(linkUrl);
    await browser.waitUntil(() => page.header.getTitle().then(title => title === 'full col'));
    const menu = await page.header.openUserMenu();
    expect(await menu.getUser()).toBe('friend1@trailence.org');
    await menu.close();
    const list = await page.trailsAndMap.openTrailsList();
    await browser.waitUntil(() => list.items.length.then(nb => nb === 5));
    expect(await list.findItemByTrailName('Tour de Port-Cros')).toBeDefined();
    expect(await list.findItemByTrailName('Roquefraîche')).toBeDefined();
    expect(await list.findItemByTrailName('Randonnée du 05/06/2023 à 08:58')).toBeDefined();
    expect(await list.findItemByTrailName('Au dessus de Montclar')).toBeDefined();
    const trail = await list.findItemByTrailName('Col et lacs de la Cayolle');
    expect(trail).toBeDefined();
    expect(await trail!.getPhotosSliderElement().isExisting()).toBeFalse();
  });

});
