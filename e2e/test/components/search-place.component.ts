import { App } from '../app/app';
import { Component } from './component';
import { Key } from 'webdriverio';

export class SearchPlace extends Component {

  public async searchPlace(place: string) {
    const clearButton = this.getElement().$('ion-searchbar button.searchbar-clear-button');
    if (await clearButton.isDisplayed()) await clearButton.click();
    await this.getElement().$('ion-searchbar input').setValue(place);
    await browser.action('key').down(Key.Enter).pause(10).up(Key.Enter).perform();
    const popover = await App.waitPopover();
    return popover.$('ion-list').$$('ion-item');
  }

}
