import { Injector, SecurityContext } from '@angular/core';
import { DomSanitizer } from '@angular/platform-browser';
import { XmlUtils } from 'src/app/utils/xml-utils';
import { FetchSourcePlugin, populateWayPointInfo, TrailInfo } from './fetch-source.interfaces';
import L from 'leaflet';
import Dexie, { Table } from 'dexie';
import { GpxFormat } from 'src/app/utils/formats/gpx-format';
import { PreferencesService } from '../preferences/preferences.service';
import { TrailDto } from 'src/app/model/dto/trail';
import { TrackDto } from 'src/app/model/dto/track';
import { SimplifiedPoint, SimplifiedTrackSnapshot, TrackDatabase, TrackMetadataSnapshot } from '../database/track-database';
import { Trail } from 'src/app/model/trail';
import { firstValueFrom } from 'rxjs';
import { HttpService } from '../http/http.service';
import { environment } from 'src/environments/environment';
import { Track } from 'src/app/model/track';
import { TrackEditionService } from '../track-edition/track-edition.service';
import { Console } from 'src/app/utils/console';

interface TrailInfoDto {
  keyNumber: string;
  keyGpx: string;
  url: string;
  info: TrailInfo;
  fetchDate: number;
}

interface SimplifiedTrackDto {
  uuid: string;
  points: SimplifiedPoint[];
}

export class VisorandoPlugin implements FetchSourcePlugin {

  public readonly name = 'Visorando';
  public readonly owner = 'visorando';

  private readonly sanitizer: DomSanitizer;

  private readonly tableInfos: Table<TrailInfoDto, string>;
  private readonly tableTrails: Table<TrailDto, string>;
  private readonly tableFullTracks: Table<TrackDto, string>;
  private readonly tableSimplifiedTracks: Table<SimplifiedTrackDto, string>;
  private readonly tableMetadata: Table<TrackMetadataSnapshot, string>;

  constructor(
    readonly injector: Injector,
  ) {
    this.sanitizer = injector.get(DomSanitizer);
    const db = new Dexie('visorando');
      const schemaV1: any = {};
      schemaV1['infos'] = 'keyNumber, keyGpx, url, fetchDate';
      schemaV1['trails'] = 'uuid';
      schemaV1['full_tracks'] = 'uuid';
      schemaV1['simplified_tracks'] = 'uuid';
      schemaV1['metadata'] = 'uuid';
      db.version(1).stores(schemaV1);
      this.tableInfos = db.table<TrailInfoDto, string>('infos');
      this.tableTrails = db.table<TrailDto, string>('trails');
      this.tableFullTracks = db.table<TrackDto, string>('full_tracks');
      this.tableSimplifiedTracks = db.table<SimplifiedTrackDto, string>('simplified_tracks');
      this.tableMetadata = db.table<TrackMetadataSnapshot, string>('metadata');
  }

  public canFetchTrailInfo(url: string): boolean {
    return url.startsWith('https://www.visorando.com/');
  }

  public fetchTrailInfo(url: string): Promise<TrailInfo | null> {
    if (!url.endsWith('/')) url += '/';
    const fromDb = this.tableInfos.where('url').equalsIgnoreCase(url).first();
    return fromDb.then(info => info?.info ?? window.fetch(url, {mode: 'cors'}).then(response => response.text()).then(text => { // NOSONAR
      const result: TrailInfo = {};
      const parser = new DOMParser();
      const doc = parser.parseFromString(text, "text/html");

      // description
      const metaDescription = doc.querySelector('main header meta[itemprop=mainEntityOfPage');
      const descriptionDivs = metaDescription?.parentElement?.querySelectorAll('div');
      if (descriptionDivs && descriptionDivs.length > 1) {
        const content = descriptionDivs.item(descriptionDivs.length - 1).textContent;
        if (content) result.description = this.sanitize(content) ?? undefined;
      }

      // location
      const images = doc.querySelectorAll('img');
      for (let imageIndex = 0; imageIndex < images.length; imageIndex++) {
        const img = images.item(imageIndex)!; // NOSONAR
        if (img.src?.endsWith('municipality.svg')) {
          const link = img.parentElement?.querySelector('a');
          if (link) result.location = this.sanitize(link.textContent) ?? undefined;
        }
      }

      // way points
      const sections = doc.querySelectorAll('main section');
      for (let sectionIndex = 0; sectionIndex < sections.length; sectionIndex++) {
        const section = sections.item(sectionIndex)!; // NOSONAR
        const article = XmlUtils.getChild(section, 'article');
        if (article) {
          const paragraphs = XmlUtils.getChildren(article, 'p');
          for (let pIndex = 0; pIndex < paragraphs.length; pIndex++) {
            const strongs = paragraphs.at(pIndex)!.querySelectorAll('strong'); // NOSONAR
            for (let strongIndex = 0; strongIndex < strongs.length; strongIndex++) {
              const strong = strongs.item(strongIndex)!; // NOSONAR
              const n = strong.textContent!; // NOSONAR
              let text = '';
              let node = strong.nextSibling;
              while (node && (strongIndex === strongs.length - 1 || node != strongs.item(strongIndex + 1))) {
                text += node.textContent;
                node = node.nextSibling;
              }
              text = text.trim();
              if (text.startsWith(')')) text = text.substring(1).trim();
              if (text.endsWith('(')) text = text.substring(0, text.length - 1).trim();

              if (!result.wayPoints) result.wayPoints = [];
              if (n === 'D/A') {
                if (!result.wayPoints.find(w => w.isDeparture && w.isArrival))
                  result.wayPoints.push({isDeparture: true, isArrival: true, description: text});
              } else {
                let num = parseInt(n);
                if (!isNaN(num)) {
                  if (!result.wayPoints.find(w => w.number === num))
                    result.wayPoints.push({number: num, description: text});
                }
              }
            }
          }
        }
      }

      // photos
      const photos = doc.querySelectorAll('a.thumbnail img');
      if (photos.length > 0) {
        result.photos = [];
        for (let i = 0; i < photos.length; ++i) {
          const photo = photos.item(i)! as HTMLImageElement; // NOSONAR
          result.photos.push({
            url: photo.src.replace('/thumbnail/t-', '/inter/m-'),
            description: photo.alt
          })
        }
      }

      // ids
      const buttons = doc.querySelectorAll('a.btn');
      let keyGpx = '';
      let keyNumber = '';
      for (let i = 0; i < buttons.length; ++i) {
        const button = buttons.item(i)!; // NOSONAR
        const data = button.getAttribute('data');
        if (data && data.indexOf('task=gpxRando') > 0) {
          const j = data.lastIndexOf('=');
          keyGpx = data.substring(j + 1);
        } else if (data && data.indexOf('task=pdfRando') > 0) {
          const j = data.lastIndexOf('=');
          keyNumber = data.substring(j + 1);
        }
      }
      result.key = keyNumber + '-' + keyGpx;
      result.externalUrl = url;

      if (keyNumber.length === 0) return null;

      this.tableInfos.put({info: result, keyNumber, keyGpx, url, fetchDate: Date.now()}, keyNumber);
      return result;
    }).catch(e => {
      Console.warn('Error parsing Visorando page', e);
      return Promise.reject(e);
    }));
  }

  private sanitize(content: string | null | undefined): string | null {
    if (!content) return null;
    return this.sanitizer.sanitize(SecurityContext.NONE, content.replace(/\r/g, '').replace(/\n/g, ' ').trim());
  }

  public canSearchByArea(): boolean {
    return true;
  }

  public searchByArea(bounds: L.LatLngBounds): Promise<Trail[]> {
    const bbox = '' + bounds.getWest() + '%2C' + bounds.getEast() + '%2C' + bounds.getSouth() + '%2C' + bounds.getNorth();
    return firstValueFrom(this.injector.get(HttpService).get<{id: number, url: string}[]>(environment.apiBaseUrl + '/search-trails/v1/visorando?bbox=' + bbox))
    .then(items => {
      const nextItems = (found: Trail[], items: {id: number, url: string}[], startIndex: number): Promise<Trail[]> => {
        if (found.length >= 200 || startIndex >= items.length) return Promise.resolve(found);
        const toFetch = items.slice(startIndex, Math.min(items.length, startIndex + 200 - found.length));
        const trails$: Promise<TrailDto | undefined>[] = [];
        for (const item of toFetch) trails$.push(this.fetchTrailByIdAndUrl('' + item.id, item.url).catch(e => undefined));
        return Promise.all(trails$).then(trails => trails.filter(trail => !!trail).map(dto => new Trail(dto))) // NOSONAR
        .then(newFound => nextItems([...found, ...newFound], items, startIndex + toFetch.length)); // NOSONAR
      };
      return nextItems([], items, 0);
    });
  }

  private fetchTrailByIdAndUrl(id: string, url: string) {
    return this.fetchTrailInfo(url)
    .then(info => {
      if (!info?.key) return undefined;
      const i = info.key.indexOf('-');
      if (i <= 0) return undefined;
      const keyNumber = info.key.substring(0, i);
      const keyGpx = info.key.substring(i + 1);
      return this.tableTrails.get(keyNumber)
      .then(trail => trail ?? this.fetchTrailByGpx(keyNumber, keyGpx, info));
    });
  }

  private fetchTrailByGpx(idTrail: string, idGpx: string, info: TrailInfo) {
    if (idGpx.length === 0) {
      Console.warn('No GPX id for', idTrail, info.externalUrl);
      return Promise.reject();
    }
    return this.tableTrails.get(idTrail).then(t => t ?? this.fetchGpx(idTrail, idGpx, info));
  }

  private fetchGpx(idTrail: string, idGpx: string, info: TrailInfo) {
    return window.fetch('https://www.visorando.com/visorando-' + idGpx + '.gpx')
    .then(response => response.arrayBuffer())
    .then(gpx => GpxFormat.importGpx(gpx, 'visorando', 'visorando', this.injector.get(PreferencesService)))
    .then(gpx => {
      if (info.description && info.description.length > 0 && (gpx.trail.description ?? '').length === 0)
        gpx.trail.description = info.description;
      if (info.wayPoints && info.wayPoints.length > 0) {
        populateWayPointInfo(gpx.tracks[0], info.wayPoints, this.injector.get(PreferencesService).preferences);
      }
      if (info.location && info.location.length > 0 && gpx.trail.location.length === 0) {
        gpx.trail.location = info.location;
      }

      const improved = this.injector.get(TrackEditionService).applyDefaultImprovments(gpx.tracks[0]);
      this.injector.get(TrackEditionService).computeFinalMetadata(gpx.trail, improved);
      const trailDto = gpx.trail.toDto();
      trailDto.uuid = idTrail;
      trailDto.originalTrackUuid = idTrail + '-original';
      trailDto.currentTrackUuid = idTrail + '-improved';
      const track1Dto = gpx.tracks[0].toDto();
      track1Dto.uuid = idTrail + '-original';
      const track2Dto = improved.toDto();
      track2Dto.uuid = idTrail + '-improved';
      const metadata = TrackDatabase.toMetadata(improved);
      metadata.uuid = idTrail;
      this.tableTrails.put(trailDto, idTrail);
      this.tableFullTracks.put(track1Dto, track1Dto.uuid);
      this.tableFullTracks.put(track2Dto, track2Dto.uuid);
      this.tableSimplifiedTracks.put({uuid: track1Dto.uuid, points: TrackDatabase.simplify(gpx.tracks[0]).points}, track1Dto.uuid);
      this.tableSimplifiedTracks.put({uuid: track2Dto.uuid, points: TrackDatabase.simplify(improved).points}, track2Dto.uuid);
      this.tableMetadata.put({...TrackDatabase.toMetadata(gpx.tracks[0]), uuid: track1Dto.uuid}, track1Dto.uuid);
      this.tableMetadata.put({...TrackDatabase.toMetadata(improved), uuid: track2Dto.uuid}, track2Dto.uuid);
      return trailDto;
    })
  }

  public getTrail(uuid: string): Promise<Trail | null> {
    return this.tableTrails.get(uuid).then(t => t ? new Trail(t) : null);
  }

  public getMetadata(uuid: string): Promise<TrackMetadataSnapshot | null> {
    return this.tableMetadata.get(uuid).then(t => t ?? null);
  }

  public getSimplifiedTrack(uuid: string): Promise<SimplifiedTrackSnapshot | null> {
    return this.tableSimplifiedTracks.get(uuid).then(t => t ?? null);
  }

  public getFullTrack(uuid: string): Promise<Track | null> {
    return this.tableFullTracks.get(uuid).then(t => t ? new Track(t, this.injector.get(PreferencesService)) : null);
  }

  public getInfo(uuid: string): Promise<TrailInfo | null> {
    return this.tableInfos.get(uuid).then(t => t?.info ?? null);
  }

  /*
  private fetchTrailTrack(id: number): Promise<PointDescriptor[]> {
    const url = 'https://www.visorando.com/index.php?component=exportData&task=getRandoGeoJson&chartData=1&wholePointsData=1&idRandonnee=' + id;
    return window.fetch(url, {headers: [['Accept', 'application/json'], ['X-Requested-With', 'XMLHttpRequest']]})
    .then(response => response.json())
    .then(response => {
      const features = response.geojson?.features;
      const points: PointDescriptor[] = [];
      if (Array.isArray(features)) {
        for (const feature of features) {
          const coords = feature.geometry?.coordinates;
          if (!Array.isArray(coords)) continue;
          points.push({pos: {lat: coords[1], lng: coords[0]}});
        }
      }
      const chartdata = response.chartdata?.data;
      if (Array.isArray(chartdata)) {
        if (chartdata.length === points.length) {
          for (let i = 0; i < points.length; ++i) {
            const data = chartdata[i];
            if (Array.isArray(data)) {
              points[i].ele = data[1];
            }
          }
        }
      }
      return points;
    });
  }*/

}
