import { App } from '../app/app';
import { Component } from './component';
import { IonicButton } from './ionic/ion-button';
import { IonicCheckbox } from './ionic/ion-checkbox';
import { MenuContent } from './menu-content.component';

export class TrailOverview extends Component {

  public async getTrailName() {
    const nameDiv = this.getElement().$('div.trail-name');
    return await nameDiv.getText();
  }

  public async getTags() {
    const row = this.getElement(true).$('div.trail-tags-row');
    const elements = row.$$('div.tag');
    const tags = [];
    for (const element of await elements.getElements()) {
      tags.push(await element.getText());
    }
    return tags;
  }

  public getTagsElements(reset: boolean = false) {
    return this.getElement(reset).$('div.trail-tags-row').$$('div.tag');
  }

  public getPhotosSliderElement() {
    return this.getElement().$('div.photos app-photos-slider');
  }

  public async expectPhotos() {
    await browser.waitUntil(async () => {
      const slider = this.getPhotosSliderElement();
      return await slider.isExisting() && await slider.isDisplayed();
    });
  }

  public async expectNoPhotos() {
    expect(await this.getPhotosSliderElement().isExisting()).toBeFalse();
  }

  public async expectRatingPresent() {
    expect(await this.getElement().$('div.rating-stars').isDisplayed()).toBeTrue();
  }

  public async clickMenuItem(item: string) {
    const button = new IonicButton(this.getElement().$('div.trail-name-row ion-button.trail-menu-button'));
    await button.click();
    const menu = new MenuContent(await App.waitPopover());
    await menu.clickItemWithText(item);
  }

  public async clickMenuItemWithColorAndText(color: string, text: string) {
    const button = new IonicButton(this.getElement().$('div.trail-name-row ion-button.trail-menu-button'));
    await button.click();
    const menu = new MenuContent(await App.waitPopover());
    await menu.clickItemWithColorAndText(color, text);
  }

  public async delete() {
    await this.clickMenuItemWithColorAndText('danger', 'Delete');
    const alert = await App.waitAlert();
    await alert.clickButtonWithRole('danger');
    await alert.waitNotDisplayed();
    await App.waitNoProgress();
  }

  public async selectTrail() {
    const cb = new IonicCheckbox(this.getElement().$('div.trail-name-row ion-checkbox'));
    await cb.setSelected(true);
  }

  public async getTrailMetadata(icon: string, scroll: boolean = true) {
    if (scroll) await this.getElement().scrollIntoView({block: 'center', inline: 'center'});
    const iconElement = this.getElement().$('div.metadata-item-container div.metadata-item ion-icon[name=' + icon + ']');
    if (!(await iconElement.isExisting())) return undefined;
    return await iconElement.nextElement().$('div.metadata-primary').getText();
  }

  public async getTrackMetadata(scroll: boolean = true) {
    if (scroll) await this.getElement().scrollIntoView({block: 'center', inline: 'center'});
    const titles = await this.getElement().$$('div.metadata-item-container div.metadata-item div.metadata-content div.metadata-title').getElements();
    const meta = new Map<string, string>();
    for (const titleElement of titles) {
      const titleHtml = await titleElement.getHTML();
      const i = titleHtml.indexOf('>');
      const j = titleHtml.indexOf('<', i + 1);
      const titleText = titleHtml.substring(i + 1, j).trim();
      const value = await titleElement.nextElement().$('div.metadata-primary').getText();
      meta.set(titleText, value);
    }
    return meta;
  }

}
