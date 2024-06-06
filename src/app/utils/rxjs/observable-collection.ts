import { BehaviorSubject, Observable, OperatorFunction, Subject, combineLatest, concat, filter, first, map, mergeMap, of, tap, zip } from "rxjs";

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

    public pipe<A>(op: OperatorFunction<T[], A[]>): CollectionObservable<A> {
        return new PipeCollectionObservable<T, A>(this, op);
    }

}

export class PipeCollectionObservable<T, A> extends CollectionObservable<A> {

    constructor(
        private collection: CollectionObservable<T>,
        private operator: OperatorFunction<T[], A[]>
    ) { super(); }

    public override get values$(): Observable<A[]> {
        return this.collection.values$.pipe(this.operator);
    }

    public override get changes$(): Observable<{ added: A[]; removed: A[]; }> {
        return this.collection.changes$.pipe(
            mergeMap(
                changes => zip(
                    changes.added.length > 0 ? this.operator(of(changes.added)) : of([]),
                    changes.removed.length > 0 ? this.operator(of(changes.removed)) : of([])
                ).pipe(
                    map(([added, removed]) => ({added, removed}))
                )
            )
        );
    }
}

export abstract class CollectionBehaviorSubject<T> extends CollectionObservable<T> {

    public abstract get values(): T[];

    public abstract clear(): void;

    public abstract change(append: T[], remove?: (item: T) => boolean): void;

    public add(append: T[]): void { this.change(append); }

    public addAndRemove(append: T[], remove: T[]): void {
        this.change(append, item => remove.indexOf(item) >= 0);
    }

    public remove(remove: T[]): void {
        this.addAndRemove([], remove);
    }

    public removeIf(remove: (item: T) => boolean): void {
        this.change([], remove);
    }

}

export class ArrayBehaviorSubject<T> extends CollectionBehaviorSubject<T> {

    private _array$: BehaviorSubject<T[]>;
    private _changes$ = new Subject<{added: T[], removed: T[]}>();

    constructor(array: T[] = []) {
        super();
        this._array$ = new BehaviorSubject<T[]>(array);
    }

    public override get values(): T[] { return this._array$.value; }
    public override get values$(): Observable<T[]> { return this._array$; }

    public override get changes$(): Observable<{ added: T[]; removed: T[]; }> {
        return this._changes$;
    }

    public override clear(): void {
        if (this._array$.value.length > 0)
            this._changes$.next({added: [], removed: this._array$.value});
        this._array$.next([]);
    }

    public override change(append: T[], remove?: (item: T) => boolean): void {
        let changed = false;
        const a = this._array$.value;
        const removed: T[] = [];
        if (remove) {
            let nbRemoved = 0;
            for (let i = 0; i < a.length; ++i) {
                if (remove(a[i])) {
                    nbRemoved++;
                    changed = true;
                    removed.push(a[i]);
                } else if (nbRemoved > 0) {
                    a.splice(i - nbRemoved, nbRemoved);
                    i -= nbRemoved;
                    nbRemoved = 0;
                }
            }
            if (nbRemoved > 0) {
                a.splice(a.length - nbRemoved, nbRemoved);
            }
        }
        if (append.length > 0) {
            a.push(...append);
            changed = true;
        }
        if (changed) {
            this._array$.next(a);
            this._changes$.next({added: append, removed});
        }
    }

}

export function mergeMapCollectionObservable<S, T, U>(
    source: CollectionObservable<Observable<S | null>>,
    merger: (source: S) => Observable<T>,
    mapper: (item: T) => U
): Observable<{added: U[], removed: U[]}> {
    const mapSU = new Map<Observable<S | null>, U | null>();
    return source.initialValuesThenChanges$.pipe(
        mergeMap(changes => {
            const removed = changes.removed.map(o => {
                const u = mapSU.get(o);
                mapSU.delete(o);
                return u;
            }).filter(u => !!u) as U[];
            changes.added.forEach(o => mapSU.set(o, null));
            const fromAdded = changes.added.length === 0 ? of({added: [], removed: []}) :
                combineLatest(changes.added.map(
                    o => o.pipe(
                        mergeMap(s => s ? merger(s) : of(null)),
                        map(t => {
                            const previous = mapSU.get(o);
                            if (t) {
                                const u = mapper(t);
                                mapSU.set(o, u);
                                return {added: u, removed: previous};
                            }
                            mapSU.set(o, null);
                            return {added: null, removed: previous};
                        })
                    )
                )).pipe(map(
                    items => {
                        const result: {added: U[], removed: U[]} = {added: [], removed: []};
                        items.forEach(item => {
                            if (item.added) result.added.push(item.added);
                            if (item.removed) result.removed.push(item.removed);
                        })
                        return result;
                    }
                ));
            return concat(
                of({removed: removed, added: []}),
                fromAdded
            );
        })
    );
}