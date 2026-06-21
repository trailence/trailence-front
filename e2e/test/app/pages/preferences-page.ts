import { Component } from '../../components/component';
import { IonicButton } from '../../components/ionic/ion-button';
import { IonicInput } from '../../components/ionic/ion-input';
import { IonicRange } from '../../components/ionic/ion-range';
import { IonicSegment } from '../../components/ionic/ion-segment';
import { PageWithHeader } from './page';

export class PreferencesPage extends PageWithHeader {

  constructor() { super('preferences'); }

  protected expectedUrl(url: string): boolean {
    return url.indexOf('/preferences') > 0;
  }

  public async getOptionSegmentByTitle(title: string) {
    const segment = new IonicSegment(this.getElement().$('div.title=' + title).parentElement().$('div.value'), 'ion-segment');
    await segment.scrollIntoView();
    return segment;
  }

  public async getRangeByTitle(title: string) {
    const range = new IonicRange(this.getElement().$('div.title=' + title).parentElement().$('div.value'), 'ion-range');
    await range.scrollIntoView();
    return range;
  }

  public async getInputByTitle(title: string) {
    const input = new IonicInput(this.getElement().$('div.title=' + title).parentElement().$('div.value'), 'ion-input');
    await input.scrollIntoView();
    return input;
  }

  public async getPhotosSizes() {
    await Component.scrollIntoView(this.getElement().$('ion-button#button-remove-all-photos'));
    const cells = await this.getElement().$('div.title=Downloaded photos').parentElement().$$('table tr td').getElements();
    const sizes: string[] = [];
    for (const cell of cells) {
      sizes.push((await cell.getText()).trim());
    }
    return sizes;
  }

  public async removeAllPhotos() {
    await new IonicButton(this.getElement().$('ion-button#button-remove-all-photos')).click();
  }

  public async resetAll() {
    await new IonicButton(this.getElement(), 'ion-button=Restore all settings to default').click();
  }

}
