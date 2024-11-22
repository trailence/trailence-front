import { ChainablePromiseElement, WaitForOptions } from 'webdriverio';

export abstract class AppElement {

  public abstract getElement(): ChainablePromiseElement;

  public async waitDisplayed(opts?: WaitForOptions) {
    await this.getElement().waitForDisplayed(opts);
  }

  public isDisplayed(): Promise<boolean> {
    return this.getElement()!.isDisplayed();
  }

  public notDisplayed(): Promise<boolean> {
    return this.isDisplayed().then(displayed => !displayed);
  }

}
