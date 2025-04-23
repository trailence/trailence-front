import { IonicButton } from '../../components/ionic/ion-button';
import { IonicInput } from '../../components/ionic/ion-input';
import { IonicSelect } from '../../components/ionic/ion-select';
import { IonicToggle } from '../../components/ionic/ion-toggle';
import { MapComponent } from '../../components/map.component';
import { ModalComponent } from '../../components/modal';
import { TestUtils } from '../../utils/test-utils';
import { App } from '../app';
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

  public get map() { return new MapComponent(this.getElement().$('app-map')); }

  public async setDisplayMyTrails(value: boolean) {
    await this.getElement().$('div.left-pane-button').click();
    await browser.pause(1000); // wait animation
    const toggle = new IonicToggle(this.getElement().$('div.trails-section ion-toggle'));
    await toggle.setValue(value);
    await this.getElement().$('div.left-pane-button').click();
    await browser.pause(1000); // wait animation
  }

  public getButton(className: string) {
    return this.getElement().$('app-map div.map-top-controls div.map-tool.' + className);
  }

  public async start() {
    const button = this.getButton('button-start');
    await button.click();
    await browser.waitUntil(() => button.isExisting().then(e => !e), { timeout: 5000 });
  }

  public async stop() {
    const button = this.getButton('button-stop');
    await button.click();
    await browser.waitUntil(() => button.isExisting().then(e => !e), { timeout: 5000 });
  }

  public async resume() {
    const button = this.getButton('button-resume');
    await button.click();
    await browser.waitUntil(() => button.isExisting().then(e => !e), { timeout: 5000 });
  }

  public async save(trailName: string, trailCollection: string) {
    const button = this.getButton('button-save');
    await button.click();
    const modal = await App.waitModal();
    await new IonicInput(modal.$('>>>ion-input[name=trail-name]')).setValue(trailName);
    await new IonicSelect(modal.$('>>>ion-select[name=collection]')).selectByText(trailCollection);
    await (await new ModalComponent(modal).getFooterButtonWithText('Save')).click();
  }

  public async getDistance() {
    return await this.getElement().$('div.metadata-container div.metadata-item-container div.metadata-item ion-icon[name=distance]').nextElement().$('div.metadata-primary').getText();
  }

}
