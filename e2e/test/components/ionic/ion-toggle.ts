import { Component } from '../component';

export class IonicToggle extends Component {

  public async setValue(value1: boolean) {
    const input = this.getElement().$('>>>input[type=checkbox]');
    const value = await input.isSelected();
    if (value === value1) {
      await input.scrollIntoView({block: 'center', inline: 'center'});
      await browser.action('pointer').move({origin: input}).down().pause(10).up().perform();
    }
  }

}
