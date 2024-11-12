import { expect } from '@wdio/globals'

describe('First Test', () => {
    it('first test', async () => {
      await browser.setWindowSize(1600, 900);
      await browser.url(browser.options.baseUrl!);
      browser.waitUntil(async () => await $('app-login.ion-page').isDisplayed(), { timeout: 30000 });
      const loginPage = await $('app-login.ion-page');
      expect(await loginPage.isDisplayed()).toBeTrue()
      const loginInput = await loginPage.$('ion-card-content ion-input');
      browser.waitUntil(async () => await $('app-login.ion-page').isDisplayed());
      expect(await loginInput.isDisplayed()).toBeTrue()
    })
})

