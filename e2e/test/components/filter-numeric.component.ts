import { Component } from './component';
import { IonicRange } from './ionic/ion-range';

export class FilterNumeric extends Component {

  public async setValues(minValue: number | undefined, maxValue: number | undefined) {
    await new IonicRange(this.getElement().$('ion-range')).setValues(minValue, maxValue);
  }

}
