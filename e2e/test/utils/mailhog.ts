export class MailHog {

  public async open(newTab: boolean = false) {
    if (newTab) {
      await browser.newWindow('http://localhost:8025', { type: 'tab' });
    } else {
      await browser.url('http://localhost:8025');
    }
    await browser.waitUntil(() => browser.getUrl().then(url => url.indexOf(':8025') > 0));
    await browser.waitUntil(() => browser.getTitle().then(title => title === 'MailHog'));
    await browser.waitUntil(() => $('div.messages').isDisplayed());
    await browser.waitUntil(() => $('div.messages').$$('div.msglist-message').getElements().then(elements => elements.length > 0));
  }

  public async openMessageTo(email: string) {
    for (const msg of await $('div.messages').$$('div.msglist-message').getElements()) {
      for (const div of await msg.$$('div div div').getElements()) {
        const to = (await div.getText()).trim();
        if (to === email) {
          await msg.click();
          const preview = $('div.preview div.tab-content iframe');
          await preview.waitForDisplayed();
          await browser.switchFrame(preview);
          const content = await $('body').getHTML();
          await browser.switchToParentFrame();
          return content;
        }
      }
    }
  }

  public async deleteMessage() {
    await $('div.toolbar button i.glyphicon-trash').parentElement().click();
    await browser.waitUntil(() => $('div.preview div.tab-content iframe').isExisting().then(d => !d));
  }

  public async closeTab() {
    await browser.closeWindow();
    const handles = await browser.getWindowHandles();
    await browser.switchToWindow(handles[handles.length - 1]);
  }

}
