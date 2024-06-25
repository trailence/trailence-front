import { Observable, UnaryFunction, concat, filter, first, map } from "rxjs";

export abstract class CollectionObservable<T> {

    public abstract get values$(): Observable<T[]>;

    public abstract get changes$(): Observable<{added: T[], removed: T[]}>;

    public get initialValuesThenChanges$(): Observable<{added: T[], removed: T[]}> {
        return concat(
            this.values$.pipe(
                first(),
                map(initialValues => ({added: initialValues, removed: []}))
            ),
            this.changes$
        );
    }

    public get addedItems$(): Observable<T[]> {
        return this.changes$.pipe(map(changes => changes.added), filter(added => added.length > 0));
    }

    public get removedItems$(): Observable<T[]> {
        return this.changes$.pipe(map(changes => changes.removed), filter(removed => removed.length > 0));
    }

    public pipe<A>(op: CollectionOperatorFunction<T, A>): CollectionObservable<A> {
      return op(this);
    }

}

export interface CollectionOperatorFunction<T, R> extends UnaryFunction<CollectionObservable<T>, CollectionObservable<R>> {}

export interface MonoTypeCollectionOperatorFunction<T> extends CollectionOperatorFunction<T, T> {}
