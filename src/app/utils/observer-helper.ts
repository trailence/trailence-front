export class ObserverHelper {

  private observer?: IntersectionObserver;

  public observe(element: HTMLElement, callback: (entry: IntersectionObserverEntry) => any): void {
    this.disconnect();
    this.observer = new IntersectionObserver(entries => {
      if (!this.observer) return;
      const e = entries.at(-1);
      if (!e?.isIntersecting) return;
      this.disconnect();
      callback(e);
    });
    this.observer.observe(element);
  }

  public disconnect(): void {
    this.observer?.disconnect();
    this.observer = undefined;
  }

  public observing(): boolean {
    return this.observer !== undefined;
  }

}
