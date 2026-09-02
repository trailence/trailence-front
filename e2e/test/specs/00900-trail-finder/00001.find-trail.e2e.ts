import { App } from '../../app/app';
import { TrailPage } from '../../app/pages/trail-page';
import { TrailsPage } from '../../app/pages/trails-page';
import { Component } from '../../components/component';
import { TrailOverview } from '../../components/trail-overview.component';
import { TrailsList } from '../../components/trails-list.component';
import { TestUtils } from '../../utils/test-utils';

describe('Find Trail', () => {

  it('Login', async () => {
    App.init();
    await App.startLoginIfNeeded();
  });

  let page: TrailsPage;
  let trail: TrailOverview;
  let list: TrailsList;
  let trailPage: TrailPage;

  it('Go to find a trail, zoom on Saint Honorat, search with Visorando', async () => {
    const menu = await App.openMenu();
    page = await menu.openTrailFinder();
    const map = await page.trailsAndMap.openMap();
    await map.goTo(43.50436332683977, 7.046184539794922, 14);
    await map.topToolbar.clickByIcon('radio-group');
    const alert = await App.waitAlert();
    await alert.clickRadioButtonByLabel('Visorando');
    await alert.clickButtonWithText('Ok');
    await map.topToolbar.clickByIcon('search-map');
    const list = await page.trailsAndMap.openTrailsList();
    const trail = await list.waitTrail('Tour de l\'Île Saint-Honorat');
    await trail.expectRatingPresent();
    trailPage = await list.openTrail(trail);
    const details = await trailPage.trailComponent.openDetails();
    await browser.waitUntil(() => details.$('a=Open in Visorando').isExisting());
    expect(await trailPage.trailComponent.getDescription())
    .toBe("Une magnifique balade sur la plus petite des deux îles de Lérins.Vous ferez le tour de cette charmante île sous les pins en longeant la mer par un chemin très agréable.Le clou du spectacle vient lorsque l'on pénètre au sein du fort et que l'on surplombe l'abbaye avec les montagnes du Mercantour en arrière plan.");
    const wayPoints = await trailPage.trailComponent.getWayPoints(7);
    expect(wayPoints).toHaveSize(6);
    expect(wayPoints[0].name).toBe('Débarcadère');
    expect(wayPoints[0].description).toBe("En descendant du bateau, emprunter la rampe qui monte légèrement sur la gauche et suivre le chemin principal. En arrivant à une patte d'oie au bout de quelques mètres, emprunter le chemin de droite et arriver au niveau d'une chapelle surmontée d'une Vierge.");
    await trailPage.header.goBack();
  });

  it('Search with Outdoor Active', async () => {
    const map = await page.trailsAndMap.openMap();
    try { await map.topToolbar.clickByIcon('trash'); } catch (_) {}
    if (App.config.mode === 'mobile')
      await map.goTo(43.497514901391675,7.046356201171876, 14);
    else
      await map.goTo(43.50748766288276,7.047182321548463, 17);
    await map.topToolbar.clickByIcon('radio-group');
    const alert = await App.waitAlert();
    await alert.clickRadioButtonByLabel('Outdoor Active');
    await alert.clickButtonWithText('Ok');
    await map.topToolbar.clickByIcon('search-map');
    trail = (await TestUtils.waitFor(async () => {
      list = await page.trailsAndMap.openTrailsList();
      if ((await list.items.length) > 0) return list.getItemTrailOverview(await list.items[0].getElement());
      return undefined;
    }, trail => {
      if (!trail) throw new Error('No trail found');
    }, 90, 500))!;
  });

  it('Check trail from Outdoor Active', async () => {
    trailPage = await list.openTrail(trail);
    const details = await trailPage.trailComponent.openDetails();
    await browser.waitUntil(async () => {
      const link = details.$('div.external-link a');
      await Component.scrollIntoView(link);
      const text = (await link.getText()).trim();
      if (text !== 'Open in Outdoor Active') throw new Error('Link does not contain expected text: ' + text);
      return true;
    });
    await trailPage.header.goBack();
  });

  /*
  it('Search with Open Street Map', async () => {
    const map = await page.trailsAndMap.openMap();
    if (App.config.mode === 'mobile')
      await map.goTo(43.497514901391675,7.046356201171876, 14);
    else
      await map.goTo(43.50748766288276,7.047182321548463, 16);
    await map.topToolbar.clickByIcon('radio-group');
    const alert = await App.waitAlert();
    await alert.clickRadioButtonByLabel('Open Street Map');
    await alert.clickButtonWithText('Ok');
    await map.topToolbar.clickByIcon('search-map');
    list = await page.trailsAndMap.openTrailsList();
    await browser.waitUntil(() => list.items.length.then(nb => nb > 0), { timeout: 25000 }).catch(_ => true);
  });

  it('Wait for Open Street Map result', async () => {
    await browser.waitUntil(() => list.items.length.then(nb => nb > 0), { timeout: 45000 });
  });

  it('Check trail from Open Street Map', async () => {
    trail = await list.waitTrail('Île Saint-Honorat');
    trailPage = await list.openTrail(trail);
    const details = await trailPage.trailComponent.openDetails();
    await browser.waitUntil(() => details.$('div.external-link').isExisting());
    await trailPage.header.goBack();
  });*/

  it('End', async () => {
    await App.end();
  });
});
