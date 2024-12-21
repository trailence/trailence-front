import { Injectable, Injector } from '@angular/core';
import { FetchSourcePlugin, TrailInfo } from './fetch-source.interfaces';
import { Arrays } from 'src/app/utils/arrays';
import { Trail } from 'src/app/model/trail';
import { BehaviorSubject, catchError, combineLatest, from, map, Observable, of, switchMap } from 'rxjs';
import { SimplifiedTrackSnapshot, TrackMetadataSnapshot } from '../database/track-database';
import { Track } from 'src/app/model/track';
import { Photo } from 'src/app/model/photo';
import { NetworkService } from '../network/network.service';
import { HttpService } from '../http/http.service';
import { environment } from 'src/environments/environment';
import { firstTimeout } from 'src/app/utils/rxjs/first-timeout';
import { filterDefined } from 'src/app/utils/rxjs/filter-defined';
import { Console } from 'src/app/utils/console';
import { filterTimeout } from 'src/app/utils/rxjs/filter-timeout';

@Injectable({providedIn: 'root'})
export class FetchSourceService {

  private readonly ready$ = new BehaviorSubject<boolean>(false);
  private readonly plugins$ = new BehaviorSubject<FetchSourcePlugin[]>([]);

  constructor(
    readonly injector: Injector,
  ) {
    const subscription = injector.get(NetworkService).server$.pipe(
      switchMap(available => !available ? of([undefined, undefined]) :
        combineLatest([
          injector.get(HttpService).get<boolean>(environment.apiBaseUrl + '/search-trails/v1/visorando/available').pipe(catchError(e => of(null))),
          injector.get(HttpService).get<boolean>(environment.apiBaseUrl + '/search-trails/v1/outdooractive/available').pipe(catchError(e => of(null))),
        ])
      )
    ).subscribe(
      ([visorandoAvailable, outdooractiveAvailable]) => {
        Console.info("available sources: Visorando = " + visorandoAvailable + ", Outdoor Active = " + outdooractiveAvailable);
        const ready =
          visorandoAvailable !== undefined && visorandoAvailable !== null &&
          outdooractiveAvailable !== undefined && outdooractiveAvailable !== null;
        if (ready) subscription.unsubscribe();
        const promises: Promise<FetchSourcePlugin>[] = [];
        if (visorandoAvailable === true && !this.plugins$.value.find(p => p.name === 'Visorando'))
          promises.push(import('./visorando.plugin').then(m => new m.VisorandoPlugin(injector)));
        if (outdooractiveAvailable === true && !this.plugins$.value.find(p => p.name === 'Outdoor Active'))
          promises.push(import('./outdoor.plugin').then(m => new m.OutdoorPlugin(injector)));
        Promise.all(promises).then(list => {
          this.plugins$.next([...this.plugins$.value, ...list]);
          if (ready) this.ready$.next(true);
        });
      }
    );
  }

  public getPlugins$(): Observable<FetchSourcePlugin[]> {
    return this.plugins$;
  }

  public waitReady$(): Observable<boolean> {
    return this.ready$.pipe(filterTimeout(r => r, 10000, () => false));
  }

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
      if (plugin.canFetchTrailByUrl(url))
        return plugin.fetchTrailByUrl(url).then(trail => trail ? [trail] : []);
    }
    return Promise.resolve([]);
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
      if (plugin.canFetchTrailByContent(html))
        return plugin.fetchTrailByContent(html).then(trail => trail ? [trail] : []);
    }
    return Promise.resolve([]);
  }

  public searchByArea(bounds: L.LatLngBounds, plugins?: string[]): Promise<{trails: Trail[], tooMuchResults: boolean}> {
    const results: Promise<{trails: Trail[], tooMuchResults: boolean}>[] = [];
    for (const plugin of this.plugins$.value) {
      if (plugins && plugins.indexOf(plugin.name) < 0) continue;
      if (plugin.canSearchByArea()) results.push(plugin.searchByArea(bounds));
    }
    return Promise.all(results).then(r => ({trails: Arrays.flatMap(r, a => a.trails), tooMuchResults: r.reduce((p,n) => p || n.tooMuchResults, false)}));
  }

  private plugin$(name: string): Observable<FetchSourcePlugin | undefined> {
    return this.plugins$.pipe(
      firstTimeout(plugins => !!plugins?.find(p => p.owner === name), 5000, () => undefined as FetchSourcePlugin[] | undefined),
      filterDefined(),
      map(plugins => plugins.find(p => p.owner === name)),
    );
  }

  public getTrail$(owner: string, uuid: string): Observable<Trail | null> {
    return this.plugin$(owner).pipe(switchMap(plugin => plugin ? from(plugin.getTrail(uuid)) : of(null)));
  }

  public getMetadata$(owner: string, uuid: string): Observable<TrackMetadataSnapshot | null> {
    return this.plugin$(owner).pipe(switchMap(plugin => plugin ? from(plugin.getMetadata(uuid)) : of(null)));
  }

  public getSimplifiedTrack$(owner: string, uuid: string): Observable<SimplifiedTrackSnapshot | null> {
    return this.plugin$(owner).pipe(switchMap(plugin => plugin ? from(plugin.getSimplifiedTrack(uuid)) : of(null)));
  }

  public getFullTrack$(owner: string, uuid: string): Observable<Track | null> {
    return this.plugin$(owner).pipe(switchMap(plugin => plugin ? from(plugin.getFullTrack(uuid)) : of(null)));
  }

  public getPhotos$(owner: string, uuid: string): Observable<Photo[]> {
    return this.plugin$(owner).pipe(switchMap(plugin => !plugin ? of([]) : from(
      plugin.getInfo(uuid)
      .then(info => !(info?.photos) ? [] : info.photos.map(
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
        })
      )
    )));
  }

  public getExternalUrl$(owner: string, uuid: string): Observable<string | null> {
    return this.plugin$(owner).pipe(switchMap(plugin => plugin ? from(plugin.getInfo(uuid).then(i => i?.externalUrl ?? null)) : of(null)));
  }

  public getName(owner: string): string | undefined {
    return this.plugins$.value.find(p => p.owner === owner)?.name;
  }

}
