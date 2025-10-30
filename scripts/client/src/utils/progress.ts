export class ConsoleProgress {

  constructor(
    public text: string,
    public workAmount: number,
    public subText: string = '',
    public workDone: number = 0,
  ) {
    this.writeToConsole();
  }

  public addWorkDone(amount: number, newSubText?: string): void {
    this.workDone += amount;
    if (this.workDone > this.workAmount) this.workDone = this.workAmount;
    if (newSubText) this.subText = newSubText;
    this.writeToConsole();
  }

  public done(finalText?: string): void {
    if (!finalText) {
      this.workDone = this.workAmount;
      this.subText = 'done.';
      this.writeToConsole();
      console.log('');
    } else {
      process.stdout.clearLine(-1);
      process.stdout.cursorTo(0);
      console.log(finalText);
    }
  }

  public setSubText(subText: string): void {
    this.subText = subText;
    this.writeToConsole();
  }

  private writeToConsole(): void {
    process.stdout.clearLine(-1);
    process.stdout.cursorTo(0);
    process.stdout.write(this.text + ' [' + this.getProgressBar() + '] ' + this.getProgressPercent() + '% ' + this.subText);
  }

  private getProgressPercent(): number {
    return Math.floor(this.workDone * 100 / this.workAmount);
  }

  private getProgressBar(): string {
    const nbFilled = Math.min(10, Math.max(0, Math.floor(this.getProgressPercent() / 10)));
    return '█'.repeat(nbFilled) + '▒'.repeat(10 - nbFilled);
  }

}
