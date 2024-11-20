import { Component } from '../component';

export class IonicCheckbox extends Component {

  public async isSelected() {
    const value = await this.getElement().getAttribute("ng-reflect-checked");
    if (value === 'true') return true;
    if (value === 'false') return false;
    throw new Error('Cannot determine checkbox status: ' + value);
  }

  public async toggle() {
    await this.getElement().click();
  }

  public async setSelected(selected: boolean) {
    if ((await this.isSelected()) !== selected)
      await this.toggle();
  }

}
