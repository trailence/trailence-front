import { App } from '../../app/app';
import { TrailsPage } from '../../app/pages/trails-page';
import { TrailOverview } from '../../components/trail-overview.component';
import { TrailsList } from '../../components/trails-list.component';

describe('Find Trail', () => {

  it('Login', async () => {
    App.init();
    const loginPage = await App.start();
    await loginPage.loginAndWaitMyTrailsCollection();
  });

  let page: TrailsPage;

  it('Go to find a trail, zoom on Saint Honorat, search with Visorando', async () => {
    const menu = await App.openMenu();
    page = await menu.openTrailFinder();
    const map = await page.trailsAndMap.openMap();
    await map.goTo(43.50436332683977, 7.046184539794922, 14);
    await page.searchSources.selectByText('Visorando');
    const list = await page.trailsAndMap.openTrailsList();
    const trail = await list.waitTrail('Tour de l\'Île Saint-Honorat');
    const trailPage = await list.openTrail(trail);
    const details = await trailPage.trailComponent.openDetails();
    await browser.waitUntil(() => details.$('a=Open in Visorando').isExisting());
    expect(await trailPage.trailComponent.getDescription())
    .toBe("Une magnifique balade sur la plus petite des deux îles de Lérins. Vous ferez le tour de cette charmante île sous les pins en longeant la mer par un chemin très agréable. Le clou du spectacle vient lorsque l'on pénètre au sein du fort et que l'on surplombe l'abbaye avec les montagnes du Mercantour en arrière plan.");
    const wayPoints = await trailPage.trailComponent.getWayPoints();
    expect(wayPoints.length).toBe(6);
    expect(wayPoints[0].name).toBe('Débarcadère');
    expect(wayPoints[0].description).toBe("En descendant du bateau, emprunter la rampe qui monte légèrement sur la gauche et suivre le chemin principal. En arrivant à une patte d'oie au bout de quelques mètres, emprunter le chemin de droite et arriver au niveau d'une chapelle surmontée d'une Vierge.");
    await trailPage.header.goBack();
  });

  it('Unselect Visorando, zoom fo Outdoor Active', async () => {
    await page.searchSources.selectByText('Visorando');
    const map = await page.trailsAndMap.openMap();
    if (App.config.mode === 'mobile')
      await map.goTo(43.497514901391675,7.046356201171876, 14);
    else
      await map.goTo(43.50748766288276,7.047182321548463, 17);
  });

  let trail: TrailOverview;
  let list: TrailsList;

  it('search with Outdoor Active', async () => {
    await page.searchSources.selectByText('Outdoor Active');
    list = await page.trailsAndMap.openTrailsList();
    await browser.waitUntil(() => list.items.length.then(nb => nb > 0), { timeout: 45000 });
    trail = await list.waitTrail('20201025-Saint Honorat');
  });

  it('Check trail from Outdoor Active', async () => {
    const trailPage = await list.openTrail(trail);
    const details = await trailPage.trailComponent.openDetails();
    await browser.waitUntil(() => details.$('a=Open in Outdoor Active').isExisting());
    await trailPage.header.goBack();
  });

});
