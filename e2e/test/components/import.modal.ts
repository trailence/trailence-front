import { FilesUtils } from '../utils/files-utils';
import { OpenFile } from '../utils/open-file';
import { IonicButton } from './ionic/ion-button';
import { IonicInput } from './ionic/ion-input';
import { ModalComponent } from './modal';

export class ImportModal extends ModalComponent {

  public get urlInput() { return new IonicInput(this.getElement().$('>>>ion-input')); }

  public get fromClipboardButton() { return new IonicButton(this.getElement().$('>>>div.clipboard-container').$('ion-button')); }

  public get fromFileButton() { return new IonicButton(this.getElement().$('>>>div.from-file-container').$('ion-button')); }

  public async importFromUrl(source: string, expectError: boolean = false) {
    const button = new IonicButton(this.getElement().$('>>>div.url-container ion-button'));
    await browser.waitUntil(() => button.isDisplayed());
    expect((await button.getElement().getText()).toUpperCase()).toBe('IMPORT FROM ' + source.toUpperCase());
    await button.click();
    if (!expectError)
      await this.waitNotDisplayed();
  }

  public async getUrlMessage() {
    await this.getElement().$('>>>div.url-container div.message-container').waitForDisplayed();
    return await this.getElement().$('>>>div.url-container div.message-container').getText();
  }

  public async getClipboardMessage() {
    await this.getElement().$('>>>div.clipboard-container div.message-container').waitForDisplayed();
    return await this.getElement().$('>>>div.clipboard-container div.message-container').getText();
  }

  public async importFile(path: string) {
    await this.fromFileButton.click();
    await browser.waitUntil(() => this.getElement().isExisting().then(e => !e));
    await OpenFile.openFile((await FilesUtils.fs()).realpathSync(path));
  }

  public async importFiles(paths: string[]) {
    await this.fromFileButton.click();
    await browser.waitUntil(() => this.getElement().isExisting().then(e => !e));
    const fs = await FilesUtils.fs();
    await OpenFile.openFiles(paths.map(p => fs.realpathSync(p)));
  }

}
