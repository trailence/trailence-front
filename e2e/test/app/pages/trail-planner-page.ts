import { IonicButton } from '../../components/ionic/ion-button';
import { IonicToggle } from '../../components/ionic/ion-toggle';
import { MapComponent } from '../../components/map.component';
import { PageWithHeader } from './page';

export class TrailPlannerPage extends PageWithHeader {

  constructor() {
    super('trail-planner');
  }

  protected expectedUrl(url: string): boolean {
    return url.indexOf('/trail-planner') > 0;
  }

  public async needZoom() {
    return await this.getElement().$('div.message-zoom').isDisplayed();
  }

  public async setDisplayMyTrails(value: boolean) {
    const toggle = new IonicToggle(this.getElement().$('div.trails-section ion-toggle'));
    await toggle.setValue(value);
  }

  public async setDisplayCircuits(value: boolean) {
    const toggle = new IonicToggle(this.getElement().$('div.circuits-section ion-toggle'));
    await toggle.setValue(value);
  }

  public get circuitsItems() {
    return this.getElement().$('div.circuits-section ion-list.routes').$$('ion-item');
  }

  public get map() { return new MapComponent(this.getElement().$('app-map')); }

  public async start() {
    const button = this.getElement().$('div.actions').$('ion-button=Start');
    await new IonicButton(button).click();
  }

  public async getDistance() {
    return await this.getElement().$('div.metadata-container div.metadata-item-container div.metadata-item ion-icon[name=distance]').nextElement().getText();
  }

}
