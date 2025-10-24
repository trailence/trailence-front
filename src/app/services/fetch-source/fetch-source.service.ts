import { Injectable, Injector } from '@angular/core';
import { FetchSourcePlugin, SearchResult, TrailInfo } from './fetch-source.interfaces';
import { Trail } from 'src/app/model/trail';
import { BehaviorSubject, catchError, combineLatest, debounceTime, filter, first, from, map, merge, Observable, of, Subscriber, switchMap, take } from 'rxjs';
import { Track } from 'src/app/model/track';
import { Photo } from 'src/app/model/photo';
import { firstTimeout } from 'src/app/utils/rxjs/first-timeout';
import { filterDefined } from 'src/app/utils/rxjs/filter-defined';
import { filterTimeout } from 'src/app/utils/rxjs/filter-timeout';
import { Console } from 'src/app/utils/console';
import { SimplifiedTrackSnapshot, TrackMetadataSnapshot } from 'src/app/model/snapshots';
import { NetworkService } from '../network/network.service';
import { ApiError } from '../http/api-error';

@Injectable({providedIn: 'root'})
export class FetchSourceService {

  private readonly ready$ = new BehaviorSubject<boolean>(false);
  private readonly plugins$ = new BehaviorSubject<FetchSourcePlugin[]>([]);

  constructor(
    private readonly injector: Injector,
  ) {
    this.load();
  }

  private load(): void {
    Promise.all([
      import('./trailence.plugin').then(m => new m.TrailencePlugin(this.injector)),
      import('./visorando.plugin').then(m => new m.VisorandoPlugin(this.injector)),
      import('./outdoor.plugin').then(m => new m.OutdoorPlugin(this.injector)),
      import('./osm.plugin').then(m => new m.OsmPlugin(this.injector)),
    ])
    .then(list => {
      const newPlugins = [...this.plugins$.value];
      for (const p of list) {
        if (!newPlugins.some(pi => pi.name === p.name)) newPlugins.push(p);
      }
      this.plugins$.next(newPlugins);
      this.ready$.next(true);
      Console.info('Fetch plugins loaded', newPlugins.map(p => p.name));
    });
  }

  public getAllPlugins$(): Observable<FetchSourcePlugin[]> {
    return this.plugins$;
  }

  public getAllowedPlugins$(): Observable<FetchSourcePlugin[]> {
    return this.plugins$.pipe(
      switchMap(plugins =>
        (plugins.length === 0 ? of([]) : combineLatest(plugins.map(p => p.allowed$))).pipe(
          map(allowed => {
            const result: FetchSourcePlugin[] = [];
            for (let i = 0; i < plugins.length; ++i)
              if (allowed[i]) result.push(plugins[i]);
            return result;
          })
        )
      )
    );
  }

  public get canSearch$(): Observable<boolean> {
    return this.plugins$.pipe(
      switchMap(plugins => plugins.length === 0 ? of([]) : combineLatest(plugins.map(p => p.allowed$))),
      map(allowed => allowed.some(a => !!a))
    );
  }

  public get canImportFromUrl$(): Observable<boolean> {
    return this.plugins$.pipe(
      switchMap(plugins => plugins.length === 0 ? of([]) : combineLatest(plugins.map(p => p.allowed$.pipe(map(a => ({p, a})))))),
      map(plugins => plugins.some(p => p.a && p.p.canFetchFromUrl))
    );
  }

  public get canImportFromUrl(): boolean {
    return this.plugins$.value.some(p => p.allowed && p.canFetchFromUrl);
  }

  public waitReady$(): Observable<boolean> {
    return this.ready$.pipe(filterTimeout(r => r, 10000, () => false));
  }

  public get isReady$(): Observable<boolean> { return this.ready$; }

  public getSource(url: string): FetchSourcePlugin | undefined {
    for (const plugin of this.plugins$.value) {
      if (plugin.canFetchTrailInfoByUrl(url) || plugin.canFetchTrailByUrl(url)) return plugin;
    }
    return undefined;
  }

  public canFetchTrailInfo(url: string): FetchSourcePlugin | undefined {
    for (const plugin of this.plugins$.value) {
      if (plugin.canFetchTrailInfoByUrl(url)) return plugin;
    }
    return undefined;
  }

  public fetchTrailInfo(url: string): Promise<TrailInfo | null> {
    for (const plugin of this.plugins$.value) {
      if (plugin.canFetchTrailInfoByUrl(url))
        return plugin.fetchTrailInfoByUrl(url);
    }
    return Promise.reject();
  }

  public canFetchTrailByUrl(url: string): FetchSourcePlugin | undefined {
    for (const plugin of this.plugins$.value) {
      if (plugin.canFetchTrailByUrl(url)) return plugin;
    }
    return undefined;
  }

  public fetchTrailByUrl(url: string): Promise<Trail | null> {
    for (const plugin of this.plugins$.value) {
      if (plugin.canFetchTrailByUrl(url)) return plugin.fetchTrailByUrl(url);
    }
    return Promise.resolve(null);
  }

  public canFetchTrailsByUrl(url: string): FetchSourcePlugin | undefined {
    for (const plugin of this.plugins$.value) {
      if (plugin.canFetchTrailsByUrl(url)) return plugin;
    }
    for (const plugin of this.plugins$.value) {
      if (plugin.canFetchTrailByUrl(url)) return plugin;
    }
    return undefined;
  }

  public fetchTrailsByUrl(url: string): Promise<Trail[]> {
    for (const plugin of this.plugins$.value) {
      if (plugin.canFetchTrailsByUrl(url)) {
        return plugin.fetchTrailsByUrl(url)
        .then(trails => {
          if (trails.length > 0) return trails;
          return plugin.fetchTrailByUrl(url).then(trail => trail ? [trail] : []);
        });
      }
    }
    return this.fetchTrailByUrl(url).then(trail => trail ? [trail] : []);
  }

  public canFetchTrailByContent(html: Document): FetchSourcePlugin | undefined {
    for (const plugin of this.plugins$.value) {
      if (plugin.canFetchTrailByContent(html)) return plugin;
    }
    return undefined;
  }

  public canFetchTrailsByContent(html: Document): FetchSourcePlugin | undefined {
    for (const plugin of this.plugins$.value) {
      if (plugin.canFetchTrailsByContent(html)) return plugin;
    }
    for (const plugin of this.plugins$.value) {
      if (plugin.canFetchTrailByContent(html)) return plugin;
    }
    return undefined;
  }

  public fetchTrailByContent(html: Document): Promise<Trail | null> {
    for (const plugin of this.plugins$.value) {
      if (plugin.canFetchTrailByContent(html)) return plugin.fetchTrailByContent(html);
    }
    return Promise.resolve(null);
  }

  public fetchTrailsByContent(html: Document): Promise<Trail[]> {
    for (const plugin of this.plugins$.value) {
      if (plugin.canFetchTrailsByContent(html))
        return plugin.fetchTrailsByContent(html);
    }
    for (const plugin of this.plugins$.value) {
      if (plugin.canFetchTrailByContent(html))
        return plugin.fetchTrailByContent(html).then(trail => trail ? [trail] : []);
    }
    return Promise.resolve([]);
  }

  public searchByArea(bounds: L.LatLngBounds, limit: number, plugins?: string[]): Observable<SearchResult> {
    const list = this.plugins$.value.filter(plugin => (!plugins || plugins.includes(plugin.name)) && plugin.canSearchByArea());
    if (list.length === 0) return of({trails: [], end: true, tooManyResults: false});
    let tooMany = false;
    const end: string[] = [];
    return merge(
      ...list.map(plugin =>
        plugin.searchByArea(bounds, Math.floor(limit / list.length)).pipe(
          map(result => {
            tooMany ||= result.tooManyResults;
            if (result.end) end.push(plugin.owner);
            return {trails: result.trails, end: end.length === list.length, tooManyResults: tooMany};
          }),
          catchError(e => {
            Console.error('Error searching trails on ', plugin.name, e);
            return of({trails: [], end: true, tooManyResults: false});
          })
        )
      )
    );
  }

  public plugin$(name: string): Observable<FetchSourcePlugin | undefined> {
    return this.plugins$.pipe(
      firstTimeout(plugins => !!plugins?.find(p => p.owner === name), 5000, () => undefined as FetchSourcePlugin[] | undefined),
      filterDefined(),
      map(plugins => plugins.find(p => p.owner === name)),
    );
  }

  private promiseToObservable<T>(promise: () => Promise<T>, shouldRetry: (e: T) => boolean, onerror: () => T): Observable<T> {
    return new Observable<T>(subscriber => {
      this.fetchPromise(promise, shouldRetry, onerror, subscriber, 1);
    });
  }

  private fetchPromise<T>(promise: () => Promise<T>, shouldRetry: (e: T) => boolean, onerror: () => T, subscriber: Subscriber<T>, trial: number): void {
    promise()
    .then(element => {
      subscriber.next(element);
      if (trial >= 5 || !shouldRetry(element)) {
        subscriber.complete();
        return;
      }
      this.retryPromise(promise, shouldRetry, onerror, subscriber, trial + 1);
    })
    .catch(e => {
      subscriber.next(onerror());
      if (trial >= 5 || (e instanceof ApiError && e.httpCode >= 400)) {
        subscriber.complete();
        return;
      }
      this.retryPromise(promise, shouldRetry, onerror, subscriber, trial + 1);
    });
  }

  private retryPromise<T>(promise: () => Promise<T>, shouldRetry: (e: T) => boolean, onerror: () => T, subscriber: Subscriber<T>, trial: number): void {
    this.injector.get(NetworkService).internet$.pipe(debounceTime(1000), filter(connected => connected), take(1)).subscribe(
      () => this.fetchPromise(promise, shouldRetry, onerror, subscriber, trial)
    );
  }

  public getTrail$(owner: string, uuid: string): Observable<Trail | null> {
    return this.plugin$(owner).pipe(
      switchMap(plugin => plugin ?
        this.promiseToObservable(() => plugin.getTrail(uuid), t => !t, () => null)
        : of(null)
      )
    );
  }

  public getMetadata$(owner: string, uuid: string): Observable<TrackMetadataSnapshot | null> {
    return this.plugin$(owner).pipe(
      switchMap(plugin => plugin ?
        this.promiseToObservable(() => plugin.getMetadata(uuid), t => !t, () => null)
        : of(null)
      )
    );
  }

  public getMetadataList$(list: {owner: string, uuid: string}[]): Observable<TrackMetadataSnapshot[]> {
    const byPlugin = new Map<string, string[]>();
    for (const item of list) {
      let list = byPlugin.get(item.owner);
      if (!list) {
        list = [];
        byPlugin.set(item.owner, list);
      }
      list.push(item.uuid);
    }
    const result: Observable<TrackMetadataSnapshot[]>[] = [];
    for (const entry of byPlugin.entries()) {
      result.push(this.plugin$(entry[0]).pipe(switchMap(plugin => plugin ? from(plugin.getMetadataList(entry[1])) : of([]))));
    }
    if (result.length === 0) return of([]);
    return combineLatest(result).pipe(map(lists => {
      const all: TrackMetadataSnapshot[] = [];
      for (const l of lists) all.push(...l);
      return all;
    }))
  }

  public getSimplifiedTrack$(owner: string, uuid: string): Observable<SimplifiedTrackSnapshot | null> {
    return this.plugin$(owner).pipe(
      switchMap(plugin => plugin ?
        this.promiseToObservable(() => plugin.getSimplifiedTrack(uuid), t => !t, () => null)
        : of(null)
      )
    );
  }

  public getFullTrack$(owner: string, uuid: string): Observable<Track | null> {
    return this.plugin$(owner).pipe(
      switchMap(plugin => plugin ?
        this.promiseToObservable(() => plugin.getFullTrack(uuid), t => !t, () => null)
        : of(null)
      )
    );
  }

  public getPhotos$(owner: string, uuid: string): Observable<Photo[]> {
    return this.plugin$(owner).pipe(
      switchMap(plugin => {
        if (!plugin) return of([]);
        return this.promiseToObservable(() => plugin.getInfo(uuid), i => !i, () => null).pipe(
          map(info => {
            if (!info?.photos) return [];
            return info.photos.map(
              (p, index) => {
                const photo = new Photo({
                  owner,
                  trailUuid: uuid,
                  description: p.description,
                  uuid: p.url,
                  dateTaken: p.time,
                  index,
                });
                photo.latitude = p.pos?.lat;
                photo.longitude = p.pos?.lng;
                return photo;
              }
            );
          })
        );
      })
    );
  }

  public getTrailInfo$(owner: string, uuid: string): Observable<TrailInfo | null> {
    return this.plugin$(owner).pipe(
      switchMap(plugin => plugin ?
        this.promiseToObservable(() => plugin.getInfo(uuid), i => !i, () => null)
        : of(null)
      )
    );
  }

  public getPluginNameByOwner(owner: string): string | undefined {
    return this.plugins$.value.find(p => p.owner === owner)?.name;
  }

  public getPluginNameByUrl(url: string): string | undefined {
    for (const plugin of this.plugins$.value) {
      if (plugin.canFetchTrailInfoByUrl(url) || plugin.canFetchTrailByUrl(url))
        return plugin.name;
    }
    return undefined;
  }

  public getPluginNameBySource(source?: string): string | undefined {
    if (!source) return undefined;
    for (const plugin of this.plugins$.value) {
      if (plugin.name === source || plugin.owner === source || plugin.canFetchTrailInfoByUrl(source) || plugin.canFetchTrailByUrl(source))
        return plugin.name;
    }
    return undefined;
  }

  public getPluginByName(name: string): FetchSourcePlugin | undefined {
    return this.plugins$.value.find(p => p.name === name);
  }

  public getPluginsByName(names: string[]): FetchSourcePlugin[] {
    return this.plugins$.value.filter(p => names.includes(p.name));
  }

  public getExternalUrl$(owner: string, uuid: string): Observable<string | null> {
    return this.plugin$(owner).pipe(switchMap(plugin => plugin ? from(plugin.getInfo(uuid).then(i => i?.externalUrl ?? null)) : of(null)));
  }

}
