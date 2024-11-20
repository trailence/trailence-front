import { Component } from '../component';

export class IonicRadioGroup extends Component {

  public get items() { return this.getElement().$$('>>>ion-radio'); }

  public async selectValue(value: string) {
    const found = [];
    for (const item of await this.items.getElements()) {
      const itemValue = await item.getAttribute('value');
      if (itemValue === value) {
        const classes = await item.getAttribute('class');
        if (classes.indexOf('radio-checked') >= 0) return;
        await item.scrollIntoView({block: 'center', inline: 'center'});
        await item.click();
        return;
      }
      found.push(itemValue);
    }
    throw new Error('Cannot find ion-radio with value: ' + value + ', found was: ' + found.join(','));
  }

}
