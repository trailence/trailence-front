import { App } from '../app/app';
import { Page } from '../app/pages/page';
import { HeaderComponent } from '../components/header.component';

export async function setScreenSize(width: number, height: number) {
  await browser.setWindowSize(width + 50, height + 200);
  await browser.setViewport({width, height});
}

let _lang: 'en' | 'fr';
export async function setLang(lang: 'en' | 'fr') {
  if (lang === _lang) return;
  const header = new HeaderComponent((await Page.getActivePageElement()));
  const menu = await header.openUserMenu();
  await menu.clickByIcon('i18n');
  const popover = $('ion-app>ion-popover:not(.overlay-hidden).popover-nested');
  await popover.waitForDisplayed();
  const viewport = popover.$('>>>div.popover-viewport');
  await viewport.waitForExist();
  const list = viewport.$('>>>ion-list');
  const items = list.$$('ion-item');
  if (lang === 'en') await items[0].click();
  else await items[1].click();
  await browser.waitUntil(() => App.getPopoverContainer().isDisplayed().then(d => !d));
  _lang = lang;
}

export async function openMyTrails() {
  return await (await App.openMenu()).openCollection(_lang === 'en' ? 'My Trails' : 'Mes Parcours');
}

async function takeScreenshot(filename: string) {
  await browser.execute(() => document.getElementById('test-mouse-cursor')!.style.display = 'none');
  await browser.saveScreenshot('./output/ss_' + filename + '.png');
  await browser.execute(() => document.getElementById('test-mouse-cursor')!.style.display = '');
}

export interface DemoScenario {
  name: string;
  desktopSize: ScreenSize;
  desktopMode: (() => Promise<any>)[];
  mobileMode: (() => Promise<any>)[];
  doAfter?: () => Promise<any>;
}

export interface ScreenSize {
  width: number;
  height: number;
}

export async function runDemo(scenarios: DemoScenario[]) {
  for (const scenario of scenarios) {
    // desktop mode
    await setScreenSize(scenario.desktopSize.width, scenario.desktopSize.height);
    let index = 1;
    for (const desktopDemo of scenario.desktopMode) {
      // set to english
      await setLang('en');
      await desktopDemo();
      await takeScreenshot(scenario.name + '_' + index + '.en.desktop');
      // same in french
      await setLang('fr');
      await takeScreenshot(scenario.name + '_' + index + '.fr.desktop');
      index++;
    }
    // mobile mode
    await setScreenSize(350, 600);
    index = 1;
    for (const mobileDemo of scenario.mobileMode) {
      // english
      await setLang('en');
      await mobileDemo();
      await takeScreenshot(scenario.name + '_' + index + '.en.mobile');
      // same in french
      await setLang('fr');
      await takeScreenshot(scenario.name + '_' + index + '.fr.mobile');
      index++;
    }
    // cleaning
    if (scenario.doAfter)
      await scenario.doAfter();
  }
}
