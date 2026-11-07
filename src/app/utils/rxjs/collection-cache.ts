import { Observable, Subscriber, Subscription } from 'rxjs';

export class CollectionObservableCache<T, R> {

  constructor(
    private readonly mapper: (element: T) => Observable<R>,
    private readonly elementComparator: (e1: T, e2: T) => boolean = (e1, e2) => e1 === e2,
  ) {}

  private elements: CacheElement<T, R>[] = [];
  private subscriber?: Subscriber<R[]>;

  public combineLatest(list: T[]): Observable<R[]> {
    const newElements: T[] = [];
    const existing: CacheElement<T, R>[] = [];
    for (const element of list) {
      const knownIndex = this.elements.findIndex(e => this.elementComparator(e.source, element));
      if (knownIndex >= 0) {
        existing.push(this.elements.splice(knownIndex, 1)[0]);
      } else {
        newElements.push(element);
      }
    }

    // unsusbscribe from removed
    for (const removed of this.elements) {
      removed.subscription.unsubscribe();
    }

    // subscribe to new elements
    for (const element of newElements) {
      existing.push(new CacheElement(element, this.mapper, () => this.emit()));
    }
    this.elements = existing;
    return new Observable<R[]>(subscriber => {
      this.subscriber = subscriber;
      this.emit();
      return () => {
        if (this.subscriber === subscriber) this.subscriber = undefined;
      };
    });
  }

  private emit(): void {
    if (!this.subscriber) return;
    if (this.elements.length === 0) {
      this.subscriber.next([]);
      return;
    }
    const nb = this.elements.length;
    const result: R[] = new Array(nb);
    for (let i = 0; i < nb; ++i) {
      const e = this.elements[i];
      if (!e.emitted) return;
      result[i] = e.latest!;
    }
    this.subscriber.next(result);
  }

  public destroy(): void {
    for (const element of this.elements) {
      element.subscription.unsubscribe();
    }
    this.elements = [];
  }

}

class CacheElement<T, R> {
  constructor(
    public readonly source: T,
    mapper: (element: T) => Observable<R>,
    onNext: () => void,
  ) {
    this.subscription = mapper(source).subscribe(result => {
      this.latest = result;
      this.emitted = true;
      onNext();
    });
  }

  public readonly subscription: Subscription;
  public emitted = false;
  public latest: R | undefined;
}
