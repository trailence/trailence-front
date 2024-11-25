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
    await browser.waitUntil(async () => {
      const nbMsg = (await $('div.messages').$$('div.msglist-message').getElements()).length;
      if (nbMsg > 0) return true;
      this.refreshMessages();
    });
  }

  public async openMessageTo(email: string) {
    let content: string | undefined;
    await browser.waitUntil(async () => {
      content = await this.getMessageContent(email);
      if (!content) await this.refreshMessages();
      return !!content;
    });
    return content;
  }

  private async refreshMessages() {
    if (await $('div.toolbar').$('button[title=Refresh]').isDisplayed()) {
      await $('div.toolbar').$('button[title=Refresh]').click();
      const start = Date.now();
      await browser.waitUntil(() => Date.now() - start > 1000);
    }
  }

  private async getMessageContent(email: string) {
    for (const msg of await $('div.messages').$$('div.msglist-message').getElements()) {
      for (const div of await msg.$$('div div div').getElements()) {
        const to = (await div.getText()).trim();
        if (to === email) {
          await msg.click();
          const preview = $('div.preview div.tab-content iframe');
          await preview.waitForDisplayed();
          await browser.switchFrame(preview);
          let content;
          await browser.waitUntil(async () => {
            content = await $('body').getHTML();
            return !!content;
          }, {timeout: 10000});
          await browser.switchToParentFrame();
          if (!content) throw Error('Cannot get email content');
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
