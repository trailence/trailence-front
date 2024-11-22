import { ChainablePromiseElement, Key } from 'webdriverio';
import { Component } from './component';
import { IonicButton } from './ionic/ion-button';
import { OpenFile } from '../utils/open-file';
import { IonicCheckbox } from './ionic/ion-checkbox';
import { IonicTextArea } from './ionic/ion-textarea';
import { App } from '../app/app';
import { PhotosSliderPopup } from './photos-slider-popup';

export class PhotosPopup extends Component {

  constructor(
    element: ChainablePromiseElement,
    public inPopup: boolean,
  ) {
    super(element);
  }

  public getPhotosContainers() {
    return this.getElement().$$('div.photos div.photo-container');
  }

  public async collectPhotosInfos() {
    const result = new Map<string, { container: WebdriverIO.Element; metadata: Map<string, string> }>();
    for (const container of await this.getPhotosContainers().getElements()) {
      await container.scrollIntoView({block: 'center', inline: 'center'});
      const text = (await container.$('div.photo-and-description div.description').getText()).trim();
      const metadataItems = container.$$('div.metadata-item');
      const metadata = new Map<string, string>();
      for (const metadataItem of await metadataItems.getElements()) {
        const icon = await metadataItem.$('ion-icon').getAttribute('name');
        const value = await metadataItem.$('.metadata-primary').getText();
        metadata.set(icon, value);
      }
      result.set(text, { container, metadata });
    }
    return result;
  }

  public async getPhotoContainerByDescription(description: string) {
    return this.getPhotosContainers()[(await this.getIndexByDescription(description)) - 1];
  }

  public async getIndexByDescription(description: string) {
    let index = 1;
    for (const container of await this.getPhotosContainers().getElements()) {
      await container.scrollIntoView({block: 'center', inline: 'center'});
      const text = (await container.$('div.photo-and-description div.description').getText()).trim();
      if (text === description) return index;
      index++;
    }
    throw new Error('Photo with description not found: ' + description);
  }

  public async select(photoContainer: ChainablePromiseElement) {
    await new IonicCheckbox(photoContainer.$('ion-checkbox')).setSelected(true);
  }

  public async selectPhotoByDescription(description: string) {
    await this.select(await this.getPhotoContainerByDescription(description));
  }

  public async moveUp(photoContainer: ChainablePromiseElement) {
    const buttons = photoContainer.$$('ion-button');
    for (const button of await buttons.getElements()) {
      if (await button.$('>>>ion-icon[name=arrow-up]').isExisting()) {
        await button.click();
        return;
      }
    }
    throw new Error('Button move up not found');
  }

  public async moveUpByDescription(description: string) {
    await this.moveUp(await this.getPhotoContainerByDescription(description));
  }

  public async setDescription(previous: string, newText: string) {
    const container = await this.getPhotoContainerByDescription(previous);
    await container.$('div.photo-and-description div.description').click();
    const textArea = container.$('ion-textarea').$('>>>textarea');
    await textArea.click();
    await textArea.execute((element, text, ionic) => {
      //(element as any).value = text;
      (ionic as any).ionChange.emit({ value: text });
    }, newText, await container.$('ion-textarea').getElement());
    await container.$('.metadata-container').click();
    await browser.waitUntil(() => container.$('ion-textarea').isExisting().then(d => !d));
    await browser.waitUntil(async () => {
      try {
        await this.getPhotoContainerByDescription(newText);
        return true;
      } catch (e) {
        return false;
      }
    });
  }

  public async openSlider(photoContainer: ChainablePromiseElement) {
    await photoContainer.$('app-photo').click();
    return new PhotosSliderPopup(await App.waitModal(undefined, 'app-photos-slider-popup'));
  }

  public async openSliderByDescription(description: string) {
    return await this.openSlider(await this.getPhotoContainerByDescription(description));
  }

  public async removeSelected() {
    const button = new IonicButton(this.getElement().$('div.selection').$('ion-button=Delete'));
    await button.click();
  }

  public async close() {
    if (!this.inPopup) return;
    const element = this.getElement().$('ion-footer ion-buttons').$('ion-button=Close');
    await new IonicButton(element).click();
    await browser.waitUntil(() => this.getElement().isDisplayed().then(d => !d));
  }

  public async addPhoto(file: string) {
    await new IonicButton(this.getElement().$('ion-footer ion-buttons').$('ion-button=Add photos')).click();
    await OpenFile.openFile((await import('fs')).realpathSync('./test/assets/' + file));
  }

}
