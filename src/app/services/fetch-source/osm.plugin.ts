import { Trail } from 'src/app/model/trail';
import { PluginWithDb, TrailInfoBaseDto, TrailToStore } from './abstract-plugin-with-db';
import { Injector } from '@angular/core';
import { GeoService } from '../geolocation/geo.service';
import { from, map, merge, Observable, switchMap } from 'rxjs';
import { Track } from 'src/app/model/track';
import { PreferencesService } from '../preferences/preferences.service';
import { SearchResult } from './fetch-source.interfaces';
import { TrackUtils } from 'src/app/utils/track-utils';
import { HttpService } from '../http/http.service';
import { I18nService } from '../i18n/i18n.service';
import * as L from 'leaflet';
import { filterItemsDefined } from 'src/app/utils/rxjs/filter-defined';
import { Arrays } from 'src/app/utils/arrays';

interface TrailInfoDto extends TrailInfoBaseDto {
  id: string;
}

export class OsmPlugin extends PluginWithDb<TrailInfoDto> {

  public override readonly name = 'Open Street Map';
  public override readonly owner = 'osm';
  public override readonly canFetchFromUrl = false;

  constructor(
    injector: Injector,
  ) {
    super(injector, 'osm_routes', 'id', 'id');
    this.geoService = injector.get(GeoService);
    this.i18n = injector.get(I18nService);
  }

  private readonly geoService: GeoService;
  private readonly i18n: I18nService;

  public override canSearchByArea(): boolean {
    return true;
  }

  public override searchByArea(bounds: L.LatLngBounds, limit: number): Observable<SearchResult> {
    return this.findRoutesIds(bounds, limit).pipe(
      switchMap(ids => from(this.tableTrails.bulkGet(ids)).pipe(
        switchMap(knowns => new Observable<SearchResult>(subscriber => {
          const valid = filterItemsDefined(knowns).map(dto => new Trail(dto));
          const unknowns = filterItemsDefined(knowns.map((metadata, index) => metadata ? undefined : ids[index]));
          if (valid.length === 0 && unknowns.length === 0) {
            subscriber.next({trails: [], end: true, tooManyResults: false});
            subscriber.complete();
            return;
          }
          if (valid.length > 0) {
            subscriber.next({trails: valid, end: unknowns.length === 0, tooManyResults: ids.length >= limit});
            if (unknowns.length === 0) {
              subscriber.complete();
              return;
            }
          }
          let count = 0;
          const chunks = Arrays.chunk(unknowns, 20);
          merge(...chunks.map(chunk => this.getRoutesByIds(chunk))).subscribe(
            trails => {
              subscriber.next({trails, end: ++count === chunks.length, tooManyResults: ids.length >= limit});
              if (count >= chunks.length) subscriber.complete();
            }
          );
        }))
      ))
    );
  }

  private findRoutesIds(bounds: L.LatLngBounds, limit: number): Observable<string[]> {
    return this.injector.get(HttpService).post<{elements: {id: number}[]}>(
      'https://overpass-api.de/api/interpreter',
      "[out:json][timeout:15];rel[type=\"route\"][route~\"(mtb)|(hiking)|(foot)|(nordic_walking)|(running)|(fitness_trail)|(inline_skates)\"](" + bounds.getSouth() + "," + bounds.getWest() + "," + bounds.getNorth() + "," + bounds.getEast() + ");out ids " + limit + ";"
    ).pipe(
      map(response => response.elements.map(e => e.id.toString()))
    );
  }

  private getRoutesByIds(ids: string[]): Observable<Trail[]> {
    return this.injector.get(HttpService).post<{elements: OverpassElement[]}>(
      'https://overpass-api.de/api/interpreter',
      "[out:json][timeout:15];rel(id:" + ids.join(',') + ");out meta geom;"
    ).pipe(
      map(response => response.elements.map(e => this.createTrailFromCircuit(e)).filter(t => !!t)),
      switchMap(toStore => {
        return from(Promise.all([
          this.storeTrails(toStore.map(t => t.trail)),
          this.tableInfos.bulkPut(toStore.map(t => t.info)),
        ]).then(() => toStore.map(t => t.trail.trail)));
      }),
    );
  }

  private createTrailFromCircuit(circuit: OverpassElement): {trail: TrailToStore, info: TrailInfoDto} | null {
    if (!circuit.members) return null;
    const members = circuit.members.filter(m => m.geometry && m.geometry.length > 0);
    if (members.length === 0) return null;
    const trail = new Trail({
      owner: this.owner,
      uuid: circuit.id.toString(),
      name: circuit.tags['name'] ??
        (circuit.tags['from'] && circuit.tags['to'] ? this.i18n.texts.osm.from + ' ' + circuit.tags['from'] + ' ' + this.i18n.texts.osm.to + ' ' + circuit.tags['to'] : undefined),
      description: circuit.tags['description'] ?? undefined,
      collectionUuid: this.owner,
      originalTrackUuid: circuit.id + '-original',
      currentTrackUuid: circuit.id + '-original',
    });
    const track = new Track({ owner: this.owner, uuid: circuit.id + '-original' }, this.injector.get(PreferencesService));
    this.fillTrack(track, members);

    const metaOverride = {} as any;
    const ascent = parseInt(circuit.tags['ascent']);
    if (!isNaN(ascent)) metaOverride.positiveElevation = ascent;
    const descent = parseInt(circuit.tags['descent']);
    if (!isNaN(descent)) metaOverride.negativeElevation = descent;
    const prepared = this.prepareTrailToStore(trail, track, trail.uuid, metaOverride, true);

    const info = {
      id: trail.uuid,
      fetchDate: Date.now(),
      info: {
        key: trail.uuid,
        externalUrl: circuit.tags['website'] ?? undefined,
        oscmSymbol: circuit.tags['osmc:symbol'] ?? undefined,
      },
    } as TrailInfoDto;

    return {trail: prepared, info};
  }

  private fillTrack(track: Track, members: OverpassElementMember[]): void { // NOSONAR
    const remaining = members.map(m => {
      const segment = m.geometry.map(g => L.latLng(g.lat, g.lon));
      if (m.role === 'backward') segment.reverse();
      return segment;
    });
    const firstPoints = remaining.map(s => s[0]);
    const lastPoints = remaining.map(s => s[s.length - 1]);
    const extractSegment = (segmentIndex: number) => {
      const segment = remaining.splice(segmentIndex, 1)[0];
      firstPoints.splice(segmentIndex, 1);
      lastPoints.splice(segmentIndex, 1);
      return segment;
    };
    while (remaining.length > 0) {
      let points: L.LatLng[] = [];
      points.push(...remaining.splice(0, 1)[0]);
      firstPoints.splice(0, 1);
      lastPoints.splice(0, 1);
      let prev = points[points.length - 1];
      while (remaining.length > 0) {
        let index = TrackUtils.findClosestPoint(prev, firstPoints, 5);
        if (index >= 0) {
          points.push(...extractSegment(index));
          prev = points[points.length - 1];
          continue;
        }
        index = TrackUtils.findClosestPoint(prev, lastPoints, 5);
        if (index >= 0) {
          points.push(...extractSegment(index).reverse());
          prev = points[points.length - 1];
          continue;
        }
        index = TrackUtils.findClosestPoint(points[0], lastPoints, 5);
        if (index >= 0) {
          points = [...extractSegment(index), ...points];
          continue;
        }
        index = TrackUtils.findClosestPoint(points[0], firstPoints, 5);
        if (index >= 0) {
          points = [...extractSegment(index).reverse(), ...points];
          continue;
        }
        break;
      }
      // try to include remaining
      while (remaining.length > 0) {
        let found = false;
        for (let segmentIndex = 0; segmentIndex < remaining.length; segmentIndex++) {
          const segment = remaining[segmentIndex];
          let index = TrackUtils.findClosestPoint(segment[0], points, 1);
          if (index >= 0) {
            points = [...points.slice(0, index + 1), ...segment, ...points.slice(index + 1)];
            extractSegment(segmentIndex);
            found = true;
            break;
          }
        }
        if (!found) break;
      }
      track.newSegment().appendMany(points.map(pos => ({pos})));
    }
  }

}

interface OverpassElement {
  id: number;
  members: OverpassElementMember[];
  tags: {[key:string]: any};
}

interface OverpassElementMember {
  role?: string;
  geometry: OverpassGeometry[];
}

interface OverpassGeometry {
  lat: number;
  lon: number;
}
