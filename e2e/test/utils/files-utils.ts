import { App } from '../app/app';

export class FilesUtils {

  private static _fs: any;
  private static _fsPromises: any;

  public static async fs() {
    if (!this._fs) this._fs = await import('fs');
    return this._fs;
  }

  public static async fsPromises() {
    if (!this._fsPromises) this._fsPromises = await import('fs/promises');
    return this._fsPromises;
  }

  public static async waitFileDownloaded(filename: string) {
    const fs = await FilesUtils.fs();
    try {
      await browser.waitUntil(async () => fs.existsSync(App.config.downloadPath + '/' + filename));
    } catch (e) {
      const dir = await fs.opendir(App.config.downloadPath);
      let content = '';
      for await (const ent of dir) content += ent.name + ', ';
      throw new Error('File ' + filename + ' cannot be found in downloads directory, found are: ' + content);
    }
  }

}
