import { TestUtils } from '../../utils/test-utils';
import { Component } from '../component';

export class IonicCheckbox extends Component {

  public async getStatus() {
    const c = await this.getElement(true).getAttribute('class');
    if (c.indexOf('checkbox-checked') >= 0) return true;
    if (c.indexOf('checkbox-indeterminate') >= 0) return undefined;
    return false;
  }

  public async toggle() {
    await this.getElement().click();
  }

  public async setSelected(selected: boolean) {
    const current = await this.getStatus();
    if (current === selected) return;
    await this.toggle();
    if (current === undefined) {
      if (!selected) return;
      await this.toggle();
    }
  }

  public async setSelectedWaitNewValue(selected: boolean) {
    await TestUtils.retry(async () => {
      await this.setSelected(selected);
      const newValue = await this.getStatus();
      if (newValue !== selected) throw new Error('Expected ' + selected + ', found ' + newValue + ': ' + await this.getElement().getAttribute('class'));
    }, 3, 10);
  }

  public async getLabel() {
    return this.getElement().getText();
  }

}
