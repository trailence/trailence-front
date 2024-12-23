import { IonicButton } from '../../components/ionic/ion-button';
import { IonicInput } from '../../components/ionic/ion-input';
import { IonicSelect } from '../../components/ionic/ion-select';
import { IonicToggle } from '../../components/ionic/ion-toggle';
import { MapComponent } from '../../components/map.component';
import { ModalComponent } from '../../components/modal';
import { App } from '../app';
import { PageWithHeader } from './page';
import { TrailPage } from './trail-page';

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
    if (App.config.mode === 'mobile') {
      await this.getElement().$('div.left-pane-button').click();
      await browser.pause(1000); // wait animation
      const toggle = new IonicToggle(this.getElement().$('div.trails-section ion-toggle'));
      await toggle.setValue(value);
      await this.getElement().$('div.left-pane-button').click();
      await browser.pause(1000); // wait animation
    } else {
      const toggle = new IonicToggle(this.getElement().$('div.trails-section ion-toggle'));
      await toggle.setValue(value);
    }
  }

  public async start() {
    const button = this.getElement().$('div.not-started').$('ion-button=Start');
    await new IonicButton(button).click();
  }

  public async stop() {
    const button = this.getElement().$('div.started').$('ion-item.ion-color-secondary');
    await button.click();
  }

  public async resume() {
    const button = this.getElement().$('div.started').$('>>>ion-icon[name=play]');
    await button.click();
  }

  public async save(trailName: string, trailCollection: string) {
    const button = this.getElement().$('div.started').$('>>>ion-icon[name=save]');
    await button.click();
    const modal = await App.waitModal();
    await new IonicInput(modal.$('>>>ion-input[name=trail-name]')).setValue(trailName);
    await new IonicSelect(modal.$('>>>ion-select[name=collection]')).selectByText(trailCollection);
    await (await new ModalComponent(modal).getFooterButtonWithText('Save')).click();
  }

  public async getDistance() {
    return await this.getElement().$('div.metadata-container div.metadata-item-container div.metadata-item ion-icon[name=distance]').nextElement().getText();
  }

}
