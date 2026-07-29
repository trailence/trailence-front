import { App } from '../app/app';
import { Page } from '../app/pages/page';
import { HeaderComponent } from '../components/header.component';
import { AvailableLocales, LocaleKey } from '../../../src/app/services/i18n/available-locales';

export async function setScreenSize(width: number, height: number) {
  await browser.setWindowSize(width + 50, height + 200);
  await browser.setViewport({width, height});
}

let _lang: LocaleKey;
export async function setLang(lang: LocaleKey) {
  if (lang === _lang) return;
  const header = new HeaderComponent((await Page.getActivePageElement()));
  const menu = await header.openUserMenu();
  await menu.clickByIcon('i18n');
  const popover = $('ion-app>ion-popover:not(.overlay-hidden).popover-nested');
  await popover.waitForDisplayed();
  const viewport = popover.$('>>>div.popover-viewport');
  await viewport.waitForExist();
  const list = viewport.$('>>>ion-list');
  await list.$('ion-item.lang-' + lang).click();
  await browser.waitUntil(() => App.getPopoverContainer().isDisplayed().then(d => !d));
  _lang = lang;
}

export async function setTheme(theme: 'dark' | 'light') {
  const header = new HeaderComponent((await Page.getActivePageElement()));
  const menu = await header.openUserMenu();
  await menu.clickByIcon('theme');
  const popover = $('ion-app>ion-popover:not(.overlay-hidden).popover-nested');
  await popover.waitForDisplayed();
  const viewport = popover.$('>>>div.popover-viewport');
  await viewport.waitForExist();
  const list = viewport.$('>>>ion-list');
  await list.$('ion-item.button-theme-' + theme).click();
  await browser.waitUntil(() => App.getPopoverContainer().isDisplayed().then(d => !d));
}

export async function openMyTrails() {
  return await (await App.openMenu()).openCollection(_lang === 'en' ? 'My Trails' : 'Mes Parcours');
}

export async function takeScreenshot(filename: string) {
  await browser.execute(() => document.getElementById('test-mouse-cursor')!.style.display = 'none');
  await browser.saveScreenshot('./output/ss_' + filename + '.png');
  await browser.execute(() => document.getElementById('test-mouse-cursor')!.style.display = '');
}

export interface DemoScenario {
  name: string;
  desktopSize?: ScreenSize;
  desktopMode?: (() => Promise<any>)[];
  mobileMode?: (() => Promise<any>)[];
  doAfter?: () => Promise<any>;
}

export interface ScreenSize {
  width: number;
  height: number;
}

export async function runDemo(scenarios: DemoScenario[]) {
  for (const scenario of scenarios) {
    // desktop mode
    if (scenario.desktopMode && scenario.desktopSize) {
      await setScreenSize(scenario.desktopSize.width, scenario.desktopSize.height);
      let index = 1;
      for (const desktopDemo of scenario.desktopMode) {
        // set to english
        await setLang('en');
        await setTheme('light');
        await desktopDemo();
        await takeScreenshot(scenario.name + '_' + index + '.en.desktop.light');
        await setTheme('dark');
        await takeScreenshot(scenario.name + '_' + index + '.en.desktop.dark');
        let theme: 'dark' | 'light' = 'dark';
        for (const lang of Object.values(AvailableLocales)) {
          if (lang.key === 'en') continue;
          await setLang(lang.key);
          await takeScreenshot(scenario.name + '_' + index + '.' + lang.key + '.desktop.' + theme);
          theme = theme === 'light' ? 'dark' : 'light';
          await setTheme(theme);
          await takeScreenshot(scenario.name + '_' + index + '.' + lang.key + '.desktop.' + theme);
        }
        index++;
      }
    }
    // mobile mode
    if (scenario.mobileMode) {
      await setScreenSize(350, 600);
      let index = 1;
      for (const mobileDemo of scenario.mobileMode) {
        // english
        await setLang('en');
        await setTheme('light');
        await mobileDemo();
        await takeScreenshot(scenario.name + '_' + index + '.en.mobile.light');
        await setTheme('dark');
        await takeScreenshot(scenario.name + '_' + index + '.en.mobile.dark');
        let theme: 'dark' | 'light' = 'dark';
        for (const lang of Object.values(AvailableLocales)) {
          if (lang.key === 'en') continue;
          await setLang(lang.key);
          await takeScreenshot(scenario.name + '_' + index + '.' + lang.key + '.mobile.' + theme);
          theme = theme === 'light' ? 'dark' : 'light';
          await setTheme(theme);
          await takeScreenshot(scenario.name + '_' + index + '.' + lang.key + '.mobile.' + theme);
        }
        index++;
      }
    }
    // cleaning
    if (scenario.doAfter)
      await scenario.doAfter();
  }
}
