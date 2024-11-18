export class OpenFile {

  public static async openFile(path: string) {
    const input = browser.$('html>input[type=file]');
    await input.waitForExist();
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
    await input.waitForDisplayed();
    await input.setValue(path);
  }

}
