import { Component } from '../component';

export class IonicSegment extends Component {

  public get buttons() { return this.getElement().$$('>>>ion-segment-button'); }

  public async getSelected() {
    const checked = this.getElement().$('>>>ion-segment-button.segment-button-checked');
    if (await checked.isExisting()) {
      return await checked.getAttribute('value');
    }
    return undefined;
  }

  public async setSelected(value: string) {
    const selected = await this.getSelected();
    if (selected === value) return;
    const found = [];
    for (const button of await this.buttons.getElements()) {
      const buttonValue = await button.getAttribute('value');
      if (buttonValue === value) {
        await button.click();
        await browser.waitUntil(() => this.getSelected().then(selected => selected === value));
        return;
      }
      found.push(buttonValue);
    }
    throw Error('ion-segment-button not found for value: ' + value + ', found was: ' + found.join(','));
  }

  public async hasOption(value: string) {
    return this.getElement().$('>>>ion-segment-button[value=' + value + ']').isExisting();
  }

}
