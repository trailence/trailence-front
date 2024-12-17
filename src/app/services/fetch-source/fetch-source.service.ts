import { Injectable, Injector } from '@angular/core';
import { FetchSourcePlugin, TrailInfo } from './fetch-source.interfaces';
import { VisorandoPlugin } from './visorando.plugin';
import { Arrays } from 'src/app/utils/arrays';
import { Trail } from 'src/app/model/trail';
import { from, Observable, of } from 'rxjs';
import { SimplifiedTrackSnapshot, TrackMetadataSnapshot } from '../database/track-database';
import { Track } from 'src/app/model/track';
import { Photo } from 'src/app/model/photo';

@Injectable({providedIn: 'root'})
export class FetchSourceService {

  private readonly plugins: FetchSourcePlugin[] = [];

  constructor(
    readonly injector: Injector,
  ) {
    this.plugins.push(new VisorandoPlugin(injector));
  }

  public getSource(url: string): FetchSourcePlugin | undefined {
    for (const plugin of this.plugins) {
      if (plugin.canFetchTrailInfoByUrl(url) || plugin.canFetchTrailByUrl(url)) return plugin;
    }
    return undefined;
  }

  public canFetchTrailInfo(url: string): FetchSourcePlugin | undefined {
    for (const plugin of this.plugins) {
      if (plugin.canFetchTrailInfoByUrl(url)) return plugin;
    }
    return undefined;
  }

  public fetchTrailInfo(url: string): Promise<TrailInfo | null> {
    for (const plugin of this.plugins) {
      if (plugin.canFetchTrailInfoByUrl(url))
        return plugin.fetchTrailInfoByUrl(url);
    }
    return Promise.reject();
  }

  public canFetchTrailByUrl(url: string): FetchSourcePlugin | undefined {
    for (const plugin of this.plugins) {
      if (plugin.canFetchTrailByUrl(url)) return plugin;
    }
    return undefined;
  }

  public fetchTrailByUrl(url: string): Promise<Trail | null> {
    for (const plugin of this.plugins) {
      if (plugin.canFetchTrailByUrl(url)) return plugin.fetchTrailByUrl(url);
    }
    return Promise.resolve(null);
  }

  public canFetchTrailsByUrl(url: string): FetchSourcePlugin | undefined {
    for (const plugin of this.plugins) {
      if (plugin.canFetchTrailsByUrl(url)) return plugin;
    }
    for (const plugin of this.plugins) {
      if (plugin.canFetchTrailByUrl(url)) return plugin;
    }
    return undefined;
  }

  public fetchTrailsByUrl(url: string): Promise<Trail[]> {
    for (const plugin of this.plugins) {
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
    for (const plugin of this.plugins) {
      if (plugin.canFetchTrailByContent(html)) return plugin;
    }
    return undefined;
  }

  public canFetchTrailsByContent(html: Document): FetchSourcePlugin | undefined {
    for (const plugin of this.plugins) {
      if (plugin.canFetchTrailsByContent(html)) return plugin;
      if (plugin.canFetchTrailByContent(html)) return plugin;
    }
    return undefined;
  }

  public fetchTrailByContent(html: Document): Promise<Trail | null> {
    for (const plugin of this.plugins) {
      if (plugin.canFetchTrailByContent(html)) return plugin.fetchTrailByContent(html);
    }
    return Promise.resolve(null);
  }

  public fetchTrailsByContent(html: Document): Promise<Trail[]> {
    for (const plugin of this.plugins) {
      if (plugin.canFetchTrailsByContent(html))
        return plugin.fetchTrailsByContent(html);
      if (plugin.canFetchTrailByContent(html))
        return plugin.fetchTrailByContent(html).then(trail => trail ? [trail] : []);
    }
    return Promise.resolve([]);
  }

  public searchByArea(bounds: L.LatLngBounds): Promise<Trail[]> {
    const results: Promise<Trail[]>[] = [];
    for (const plugin of this.plugins) {
      if (plugin.canSearchByArea()) results.push(plugin.searchByArea(bounds));
    }
    return Promise.all(results).then(r => Arrays.flatMap(r, a => a));
  }

  public getTrail$(owner: string, uuid: string): Observable<Trail | null> {
    const plugin = this.plugins.find(p => p.owner === owner);
    return plugin ? from(plugin.getTrail(uuid)) : of(null);
  }

  public getMetadata$(owner: string, uuid: string): Observable<TrackMetadataSnapshot | null> {
    const plugin = this.plugins.find(p => p.owner === owner);
    return plugin ? from(plugin.getMetadata(uuid)) : of(null);
  }

  public getSimplifiedTrack$(owner: string, uuid: string): Observable<SimplifiedTrackSnapshot | null> {
    const plugin = this.plugins.find(p => p.owner === owner);
    return plugin ? from(plugin.getSimplifiedTrack(uuid)) : of(null);
  }

  public getFullTrack$(owner: string, uuid: string): Observable<Track | null> {
    const plugin = this.plugins.find(p => p.owner === owner);
    return plugin ? from(plugin.getFullTrack(uuid)) : of(null);
  }

  public getPhotos$(owner: string, uuid: string): Observable<Photo[]> {
    const plugin = this.plugins.find(p => p.owner === owner);
    return !plugin ? of([]) :
      from(
        plugin.getInfo(uuid)
        .then(info => !(info?.photos) ? [] : info.photos.map(
          p => new Photo({
            owner,
            trailUuid: uuid,
            description: p.description,
            uuid: p.url
          }))
        )
      );
  }

  public getExternalUrl$(owner: string, uuid: string): Observable<string | null> {
    const plugin = this.plugins.find(p => p.owner === owner);
    if (!plugin) return of(null);
    return from(plugin.getInfo(uuid).then(i => i?.externalUrl ?? null));
  }

  public getName(owner: string): string | undefined {
    return this.plugins.find(p => p.owner === owner)?.name;
  }

}
