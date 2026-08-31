import { App } from '../app/app';
import { TestUtils } from '../utils/test-utils';
import { Component } from './component';
import { IonicButton } from './ionic/ion-button';
import { IonicCheckbox } from './ionic/ion-checkbox';
import { MenuContent } from './menu-content.component';

export class TrailOverview extends Component {

  public async getTrailName() {
    const nameDiv = this.getElement().$('div.trail-name');
    let name = await nameDiv.getText();
    if (name.trim().length > 0) return name;
    try {
      await browser.waitUntil(async () => {
        await this.scrollIntoView();
        name = await this.getElement().$('div.trail-name').getText();
        return name.trim().length > 0;
      }, { timeout: 5000 });
    } catch (e) {}
    return name;
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
    // it's in a @defer, so we may need to retry
    const present = await TestUtils.retry(async (trial) => {
      const present = await this.getElement(trial > 2).$('app-rate').isDisplayed();
      if (!present) throw new Error('missing rate: ' + await this.getElement().getHTML());
      return present;
    }, 5, 100);
    expect(present).toBeTrue();
  }

  public async expectIsPublished() {
    await browser.waitUntil(() => this.getElement().$('ion-button.public-trail-button').isDisplayed());
  }

  public async openMenu() {
    await TestUtils.retry(async () => {
      const button = new IonicButton(this.getElement().$('div.trail-name-row ion-button.trail-menu-button'));
      await button.scrollIntoView();
      await button.click();
    }, 2, 100);
    return new MenuContent(await App.waitPopover());
  }

  public async clickMenuItem(item: string) {
    await (await this.openMenu()).clickItemWithText(item);
  }

  public async clickMenuItemWithIcon(icon: string) {
    await (await this.openMenu()).clickItemWithIcon(icon);
  }

  public async clickMenuItemWithColorAndText(color: string, text: string) {
    await (await this.openMenu()).clickItemWithColorAndText(color, text);
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
    if (scroll) await this.scrollIntoView();
    const iconElement = this.getElement().$('div.metadata-item-container div.metadata-item ion-icon[name=' + icon + ']');
    if (!(await iconElement.isExisting())) return undefined;
    return await iconElement.nextElement().$('div.metadata-primary').getText();
  }

  public async getTrackMetadata(scroll: boolean = true): Promise<Map<string, string>> {
    if (scroll) await this.scrollIntoView();
    const meta = new Map<string, string>();
    const html = await this.getElement().$('div.metadata').getHTML();
    let pos = 0;
    while ((pos = html.indexOf('class="metadata-title">', pos)) > 0) {
      let end = html.indexOf('</div>', pos);
      if (end < 0) break;
      const title = html.substring(pos + 23, end).trim();
      let start = html.indexOf('class="metadata-primary">', end);
      if (start < 0) {
        meta.set(title, '');
        pos = end;
      } else {
        end = html.indexOf('</div>', start);
        if (end < 0) {
          meta.set(title, '');
          pos = start;
        } else {
          const value = html.substring(start + 25, end).trim();
          meta.set(title, value);
          pos = end;
        }
      }
    }
    return await browser.execute(meta => {
      const result = new Map<string, string>();
      const fake = document.createElement('DIV');
      for (const entry of meta.entries()) {
        fake.innerHTML = entry[1];
        document.body.appendChild(fake);
        result.set(entry[0], fake.innerText.trim());
        fake.remove();
      }
      return result;
    }, meta);
  }

}
