import { App } from '../app/app';
import { Component } from './component';
import { Key } from 'webdriverio';

export class SearchPlace extends Component {

  public async searchPlace(place: string) {
    const clearButton = this.getElement().$('ion-searchbar button.searchbar-clear-button');
    const currentPO = App.getPopoverContainer();
    if (await currentPO.isExisting()) {
      await browser.action('key').down(Key.Escape).pause(50).up(Key.Escape).perform();
      await App.waitNoPopover();
    }
    if (await clearButton.isDisplayed()) await clearButton.click();
    await this.getElement().$('ion-searchbar input').setValue(place);
    await browser.action('key').down(Key.Enter).pause(10).up(Key.Enter).perform();
    const popover = await App.waitPopover();
    return popover.$('ion-list').$$('ion-item');
  }

}
