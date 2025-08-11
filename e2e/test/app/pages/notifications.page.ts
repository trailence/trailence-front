import { PageWithHeader } from './page';

export class NotificationsPage extends PageWithHeader {

  constructor() {
    super('notifications');
  }

  protected override expectedUrl(url: string): boolean {
    return url.indexOf('/notifications') > 0;
  }

  public async expectNotifications(texts: string[]) {
    const notFound: string[] = [...texts];
    const found: string[] = [];
    const items = await this.getElement().$('>>>ion-list').$$('app-notification-item ion-item div.item-content ion-label').getElements();
    for (let i = 0; i < items.length; ++i) {
      const text = await items[i].getText();
      const j = notFound.findIndex(t => text.indexOf(t) >= 0);
      if (j >= 0) {
        found.push(notFound[j]);
        notFound.splice(j, 1);
        if (notFound.length === 0) return;
      }
    }
    if (notFound.length === 0) return;
    throw new Error('Expected notifications: ' + JSON.stringify(texts) + '. Found ' + JSON.stringify(found) + '. Not found ' + JSON.stringify(notFound));
  }

  public async expectAndClickFirstNotificationWithText(text: string) {
    const items = await this.getElement().$('>>>ion-list').$$('app-notification-item ion-item div.item-content ion-label').getElements();
    for (let i = 0; i < items.length; ++i) {
      const itemText = await items[i].getText();
      if (itemText.indexOf(text) >= 0) {
        await items[i].$('a').click();
        return;
      }
    }
    throw new Error('Notification not found: ' + text);
  }

}
