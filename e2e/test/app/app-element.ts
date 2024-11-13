export abstract class AppElement {

  public abstract getElement(): ChainablePromiseElement | undefined;

  public async waitDisplayed() {
    await this.getElement().waitForDisplayed();
  }

  public isDisplayed(): Promise<boolean> {
    return this.getElement()!.isDisplayed();
  }

  public notDisplayed(): Promise<boolean> {
    return this.isDisplayed().then(displayed => !displayed);
  }

}
