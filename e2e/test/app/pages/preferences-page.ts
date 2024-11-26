import { IonicButton } from '../../components/ionic/ion-button';
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
    await segment.getElement().scrollIntoView({block: 'center', inline: 'center'});
    return segment;
  }

  public async getRangeByTitle(title: string) {
    const range = new IonicRange(this.getElement().$('div.title=' + title).parentElement().$('div.value'), 'ion-range');
    await range.getElement().scrollIntoView({block: 'center', inline: 'center'});
    return range;
  }

  public async resetAll() {
    await new IonicButton(this.getElement(), 'ion-button=Reset all to default values').click();
  }

}
