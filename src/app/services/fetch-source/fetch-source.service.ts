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

  public canFetchTrailInfo(url: string): boolean {
    for (const plugin of this.plugins) {
      if (plugin.canFetchTrailInfo(url)) return true;
    }
    return false;
  }

  public getSourceName(url: string): string | undefined {
    for (const plugin of this.plugins) {
      if (plugin.canFetchTrailInfo(url)) return plugin.name;
    }
    return undefined;
  }

  public fetchTrailInfo(url: string): Promise<TrailInfo | null> {
    for (const plugin of this.plugins) {
      if (plugin.canFetchTrailInfo(url))
        return plugin.fetchTrailInfo(url);
    }
    return Promise.reject();
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
