import { ChainablePromiseElement, WaitForOptions } from 'webdriverio';

export abstract class AppElement {

  public getElement(resetGetElement: boolean = false): ChainablePromiseElement {
    return this._getElement(resetGetElement);
  }

  public abstract _getElement(resetGetElement: boolean): ChainablePromiseElement;

  public async waitDisplayed(resetGetElement: boolean = false) {
    await browser.waitUntil(() => this.getElement(resetGetElement).isDisplayed());
  }

  public isDisplayed(): Promise<boolean> {
    return this.getElement(true).isDisplayed();
  }

  public async notDisplayed() {
    return !(await this.isDisplayed());
  }

}
