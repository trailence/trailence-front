import { App } from '../../app/app';

describe('Find Trail', () => {

  it('Login', async () => {
    App.init();
    const loginPage = await App.start();
    await loginPage.loginAndWaitMyTrailsCollection();
  });

  it('Go to find a trail, zoom on Saint Honorat', async () => {
    const menu = await App.openMenu();
    const page = await menu.openTrailFinder();
    const map = await page.trailsAndMap.openMap();
    await map.goTo(43.50436332683977, 7.046184539794922, 14);
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
  });

});
