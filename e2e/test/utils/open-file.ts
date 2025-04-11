export class OpenFile {

  public static async openFile(path: string) {
    const input = browser.$('html>input[type=file]');
    await input.waitForExist({timeout: 10000});
    await browser.execute(() => {
      for (let i = 0; i < document.documentElement.children.length; ++i) {
        const el = document.documentElement.children.item(i) as HTMLElement | null;
        if (el?.nodeName?.toUpperCase() === 'INPUT') {
          el!.style.top = '0px';
          el!.style.left = '0px';
          break;
        }
      }
    });
    try {
      await input.waitForDisplayed({timeout: 10000});
    } catch (e) {
      // ok anyway
    }
    await input.setValue(path);
  }

  public static async openFiles(paths: string[]) {
    const input = browser.$('html>input[type=file]');
    await input.waitForExist({timeout: 10000});
    await browser.execute(() => {
      for (let i = 0; i < document.documentElement.children.length; ++i) {
        const el = document.documentElement.children.item(i) as HTMLElement | null;
        if (el?.nodeName?.toUpperCase() === 'INPUT') {
          el!.style.top = '0px';
          el!.style.left = '0px';
          break;
        }
      }
    });
    try {
      await input.waitForDisplayed({timeout: 10000});
    } catch (e) {
      // ok anyway
    }
    await input.addValue(paths.join('\n'));
  }

}
