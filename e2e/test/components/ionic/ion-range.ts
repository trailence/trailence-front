import { Component } from '../component';

export class IonicRange extends Component {

  public async setValues(lowerValue: number | undefined, upperValue: number | undefined) {
    await browser.execute((el, lower, upper) => {
      const currentValue = (el as any).value;
      const newValue = {lower: lower ?? currentValue.lower, upper: upper ?? currentValue.upper};
      (el as any).value = newValue;
      (el as any).ionInput.emit({value: newValue});
    }, await this.getElement().getElement(), lowerValue, upperValue);
  }

  public async setValue(value: number) {
    await browser.execute((el, v) => {
      (el as any).value = v;
      (el as any).ionInput.emit({value: v});
    }, await this.getElement().getElement(), value);
  }

}
