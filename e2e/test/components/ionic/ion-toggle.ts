import { Component } from '../component';

export class IonicToggle extends Component {

  public async setValue(enabled: boolean) {
    const input = this.getElement().$('>>>input[type=checkbox]');
    const value = await input.isSelected();
    if (value !== enabled) {
      await input.scrollIntoView({block: 'center', inline: 'center'});
      await browser.action('pointer').move({origin: input}).pause(100).down().pause(100).up().perform();
    }
  }

}
