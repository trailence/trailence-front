export class FilesUtils {

  private static _fs: any;

  public static async fs() {
    if (!this._fs) this._fs = await import('fs');
    return this._fs;
  }

  public static async waitFileDownloaded(filename: string) {
    const fs = await FilesUtils.fs();
    try {
      await browser.waitUntil(async () => fs.existsSync('./downloads/' + filename));
    } catch (e) {
      const dir = await fs.opendir('./downloads');
      let content = '';
      for await (const ent of dir) content += ent.name + ', ';
      throw new Error('File ' + filename + ' cannot be found in downloads directory, found are: ' + content);
    }
  }

}
