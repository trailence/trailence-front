import { Component } from './component';
import { IonicSegment } from './ionic/ion-segment';
import { TrailsList } from './trails-list.component';

export class TrailsAndMapComponent extends Component {

  public async waitReady() {
    await browser.waitUntil(() => this.getElement(true).isDisplayed());
    await this.getElement().$('div.top-container').waitForDisplayed();
  }

  public async openTab(tab: string) {
    const segment = new IonicSegment(this.getElement().$('div.tabs-container ion-segment'));
    await segment.setSelected(tab);
  }

  public async openTrailsList() {
    await this.waitReady();
    const list = this.getElement().$('div.list-container app-trails-list');
    if (!await list.isDisplayed()) {
      await this.openTab('list');
      await browser.waitUntil(() => list.isDisplayed());
    }
    return new TrailsList(list);
  }

}
