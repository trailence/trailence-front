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
    await TestUtils.retry(async () => {
      try { await new IonicButton(this.getElement(true).$('div.not-started').$('ion-button=Start')).click(); } catch (e) {}
      await browser.waitUntil(() => this.getElement().$('div.not-started').isExisting().then(e => !e), { timeout: 5000 });
    }, 3, 1000);
  }

  public async stop() {
    await TestUtils.retry(async () => {
      try { await new IonicButton(this.getElement(true).$('div.started').$('ion-item.ion-color-secondary')).click(); } catch (e) {}
      await browser.waitUntil(() => this.getElement().$('div.started').$('ion-item.resume-button').isDisplayed(), { timeout: 5000 });
    }, 3, 1000);
  }

  public async resume() {
    await TestUtils.retry(async () => {
      try { await new IonicButton(this.getElement(true).$('div.started').$('ion-item.resume-button')).click(); } catch (e) {}
      await browser.waitUntil(() => this.getElement().$('div.started').$('ion-item.ion-color-secondary').isDisplayed(), { timeout: 5000 });
    }, 3, 1000);
  }

  public async save(trailName: string, trailCollection: string) {
    const modal = await TestUtils.retry(async () => {
      const button = this.getElement(true).$('div.started').$('ion-item.save-button');
      try { await button.click(); }catch (e) {}
      return await App.waitModal(undefined, undefined, 5000);
    }, 3, 1000);
    await new IonicInput(modal.$('>>>ion-input[name=trail-name]')).setValue(trailName);
    await new IonicSelect(modal.$('>>>ion-select[name=collection]')).selectByText(trailCollection);
    await (await new ModalComponent(modal).getFooterButtonWithText('Save')).click();
  }

  public async getDistance() {
    return await this.getElement().$('div.metadata-container div.metadata-item-container div.metadata-item ion-icon[name=distance]').nextElement().getText();
  }

}
