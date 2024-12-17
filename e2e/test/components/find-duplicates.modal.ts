import { App } from '../app/app';
import { IonicInput } from './ionic/ion-input';
import { IonicRadioGroup } from './ionic/ion-radio-group';
import { IonicSelect } from './ionic/ion-select';
import { ModalComponent } from './modal';
import { TrailComponent } from './trail.component';

export class FindDuplicatesModal extends ModalComponent {

  public async selectOption(option: 'inside' | 'two' | 'all') {
    await new IonicRadioGroup(this.contentElement.$('>>>ion-radio-group')).selectValue(option);
  }

  public async selectOtherCollection(name: string) {
    await new IonicSelect(this.contentElement.$('>>>ion-radio-group').$('ion-select')).selectByText(name);
  }

  public async setSimilarityPercent(percent: number) {
    await new IonicInput(this.contentElement.$('>>>.threshold').$('ion-input')).setValue('' + percent);
  }

  public async start() {
    await (await this.getFooterButtonWithText('Start')).click();
  }

  public async continue() {
    await (await this.getFooterButtonWithText('Continue')).click();
  }

  public async close() {
    await (await this.getFooterButtonWithText('Cancel')).click();
    await this.waitNotDisplayed();
  }

  public async deleteTrail(first: boolean) {
    await (await this.getFooterButtonWithColor('danger')).click();
    const elements = await (await App.waitPopover()).$('ion-list').$$('ion-item').getElements();
    await elements.at(first ? 0 : 1)?.click();
    await (await App.waitAlert()).clickButtonWithRole('danger');
    await App.waitNoProgress();
  }

  public async expectEnd() {
    await browser.waitUntil(() => this.contentElement.$('>>>div.end-message').isExisting(), { timeout: 10000 });
  }

  public async expectSimilarFound() {
    await browser.waitUntil(() => this.contentElement.$('>>>div.found').isExisting(), { timeout: 10000 });
    return new TrailComponent(this.contentElement.$('>>>div.found').$('app-trail'));
  }

}
