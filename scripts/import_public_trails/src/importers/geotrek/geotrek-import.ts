import { Importer } from '../importer';
import { TrailenceClient } from '../../trailence/trailence-client';
import { Config } from 'src/config/config';
import { GeoTrekDto, GeoTrekResponse, GeoTrekTranslations } from './geotrek-dtos';
import { PointDescriptor } from 'front/model/point-descriptor.js';
import { TrailDto } from 'front/model/dto/trail.js';
import { Photo } from 'front/model/photo';
import { preferences } from 'src/trailence/preferences';
import { WayPoint } from 'front/model/way-point.js';
import { fixWayPointsPosition } from 'src/utils/way-points';
import { distance } from 'src/utils/crs';

export class GeoTrekImport extends Importer {

  private baseUrl: string;
  private username: string;
  private trekLink?: string;
  private practicesToFetch: {[key: string]: string};

  constructor(
    trailenceClient: TrailenceClient,
    config: Config,
    remoteName: string,
    private readonly maxPending: number,
  ) {
    super(trailenceClient, config);
    this.baseUrl = config.getRequiredString(remoteName, 'url');
    this.username = config.getRequiredString(remoteName, 'username');
    this.trekLink = config.getString(remoteName, 'trek-link');
    this.practicesToFetch = config.getValue(remoteName, 'practices');
  }

  public override async importTrails() {
    const myTrails = await this.trailenceClient.getMyTrails();
    const knownTrails = await this.trailenceClient.getTrailsByCollectionUuid(myTrails.uuid);
    const allTrails = await this.trailenceClient.getTrails();
    const allCollections = await this.trailenceClient.getCollections();
    const pendingTrails = allTrails.filter(t => allCollections.find(c => c.uuid === t.collectionUuid)?.type?.startsWith('PUB_'));
    let nbPending = pendingTrails.length;
    if (nbPending >= this.maxPending) {
      console.log('Already ' + nbPending + ' pending trails, do not import');
      return;
    }
    console.log('Fetching treks from ' + this.baseUrl);
    let page = 1;
    let found = 0;
    let processed = 0;
    let nbTotal = 0;
    const nbBefore = knownTrails.length;
    let upToDate = 0;
    let updated = 0;
    let created = 0;
    let skippedPending = 0;
    let invalid = 0;
    do {
      const response = await this.getTreks(page);
      found += response.results!.length;
      if (response.count) nbTotal = response.count;
      console.log('Treks found on page ' + page + ': ' + response.results!.length + ' (' + found + '/' + response.count + ')');
      for (const trek of response.results!) {
        processed++;
        if (!this.isValid(trek)) {
          invalid++;
          continue;
        }
        const knownIndex = knownTrails.findIndex(t => t.uuid === trek.uuid);
        if (knownIndex >= 0) {
          const pending = pendingTrails.find(t => t.publishedFromUuid === trek.uuid);
          if (pending) {
            skippedPending++;
            continue;
          }
          const existing = knownTrails[knownIndex];
          knownTrails.splice(knownIndex, 1);
          if (await this.updateTrail(trek, existing)) {
            updated++;
            nbPending++;
          } else {
            upToDate++;
          }
        } else {
          await this.createTrail(trek);
          created++;
          nbPending++;
        }
        if (nbPending >= this.maxPending) break;
      }
      if (response.next === null) break;
      page++;
    } while (nbPending < this.maxPending);
    let removed = 0;
    if (nbPending >= this.maxPending) {
      console.log(nbPending + ' pending trails reached, stop importing.');
    } else {
      // TODO remove remaining trails not found
    }
    console.log('Total: before = ' + nbBefore + ', found = ' + found + ', up to date = ' + upToDate + ', updated = ' + updated + ', new = ' + created + ', removed = ' + removed + ', skipped because pending = ' + skippedPending + ', invalid = ' + invalid);
    console.log('Processed: ' + processed + '/' + nbTotal);
  }

  private async getTreks(page: number): Promise<GeoTrekResponse> {
    const response = await fetch(this.baseUrl + '/trek/?length_max=50000&page=' + page + '&practices=' + Object.keys(this.practicesToFetch).join(','));
    const json: any = await response.json();
    if (!response.ok || json['results'] === undefined) {
      console.error('Error getting geotrek page ' + page, json);
      throw new Error();
    }
    return json as GeoTrekResponse;
  }

  private isValid(trek: GeoTrekDto): boolean {
    if (!trek.published) {
      console.log('Trek id ' + trek.id + ' is not valid because there is no published information');
      return false;
    }
    if (!trek.published['fr'] && !trek.published['en']) {
      console.log('Trek id ' + trek.id + ' is not valid because not published in fr or en');
      return false;
    }
    if (!trek.geometry) {
      console.log('Trek id ' + trek.id + ' is not valid because there is no geometry');
      return false;
    }
    if (trek.geometry.type !== 'LineString') {
      console.log('Trek id ' + trek.id + ' is not valid because the geometry type is unknown');
      return false;
    }
    return true;
  }

  private async createTrail(trek: GeoTrekDto) {
    console.log('New trail: ' + trek.uuid + ' (' + trek.id + ')');
    const dtos = await this.toTrailenceDtos(trek);
    console.log('Trail name: ' + dtos.trail.name);
    const photos = await this.downloadPhotos(dtos.trail.owner, dtos.trail.uuid, dtos.photos);

    await this.publishTrail(dtos.trail, dtos.track, dtos.wayPoints, photos);
  }

  private async updateTrail(trek: GeoTrekDto, existing: TrailDto): Promise<boolean> {
    const updatedDate = new Date(trek.update_datetime).getTime();
    if (updatedDate <= existing.date!) {
      //console.log('Trail is up to date: ' + trek.uuid + ' (' + trek.id + '): ' + existing.name);
      return false;
    }
    console.log('Trail has been updated: ' + trek.uuid + ' (' + trek.id + '): ' + existing.name);
    const dtos = await this.toTrailenceDtos(trek);
    const existingTrackDto = await this.trailenceClient.getTrack(existing.currentTrackUuid ?? existing.originalTrackUuid!);
    const track = await this.readTrackDto(existingTrackDto);
    const trailDtoUpdates = this.checkTrailUpdates(existing, dtos.trail);
    let pointsUpdated = track.segments.length !== dtos.track.length;
    for (let si = 0; !pointsUpdated && si < track.segments.length; ++si) {
      const segment = track.segments[si];
      const newSegment = dtos.track[si];
      pointsUpdated = segment.length !== newSegment.length;
      for (let pi = 0; !pointsUpdated && pi < segment.length; ++pi) {
        const point = segment[pi];
        const newPoint = newSegment[pi];
        pointsUpdated = distance(point.pos, newPoint.pos) > 1 ||
          (!point.ele && !!newPoint.ele) ||
          (!!point.ele && !newPoint.ele) ||
          (!!point.ele && !!newPoint.ele && Math.abs(point.ele - newPoint.ele) > 1);
      }
    }
    let wayPointsUpdated = track.wayPoints.length !== dtos.wayPoints.length;
    for (let i = 0; !wayPointsUpdated && i < track.wayPoints.length; ++i) {
      const wp = track.wayPoints[i];
      const nwp = dtos.wayPoints[i];
      // TODO
    }

    // TODO check track, photos, way points...

    if (trailDtoUpdates.length === 0 && !pointsUpdated && !wayPointsUpdated) {
      console.log('No relevant update found: only update the trail date');
      // TODO update the trail date
      return true;
    }
    if (trailDtoUpdates.length > 0) {
      console.log('Updates found on trail:');
      for (const update of trailDtoUpdates) {
        console.log(' - ' + update.description + ': ' + update.previousValue + ' => ' + update.newValue);
      }
    }
    if (pointsUpdated) console.log('Track points have been updated');
    if (wayPointsUpdated) console.log('Way points have been updated');

    // TODO update
    return true;
  }

  private async toTrailenceDtos(trek: GeoTrekDto): Promise<{trail: TrailDto, track: PointDescriptor[][], wayPoints: WayPoint[], photos: PhotoInfo[]}> {
    const track: PointDescriptor[][] = [[]];
    for (const coord of trek.geometry.coordinates) {
      track[0].push({
        pos: {
          lng: coord[0],
          lat: coord[1],
        },
        ele: coord.length > 2 ? coord[2] : undefined,
      });
    }

    const myTrailsCollection = await this.trailenceClient.getMyTrails();

    const trail: TrailDto = {
      owner: this.username,
      uuid: trek.uuid,
      version: 0,
      createdAt: Date.now(),
      updatedAt: Date.now(),
      collectionUuid: myTrailsCollection.uuid,
      activity: this.practicesToFetch[trek.practice.toString()],
      date: new Date(trek.update_datetime).getTime(),
      sourceType: 'external',
      source: this.getTrekLink(trek),
      sourceDate: new Date(trek.update_datetime).getTime(),
    };

    trail.publicationData = {};
    const lang = trek.published['fr'] ? 'fr' : 'en';
    trail.publicationData['lang'] = lang;

    // location
    if (trek.departure_city)
      trail.location = await this.getCity(trek.departure_city);
    if (!trail.location)
      trail.location = this.getSingleTranslation(trek.departure, lang);
    if (trail.location && trail.location.length > 100) trail.location = trail.location.substring(0, 100);

    // name
    this.getTranslations(trek.name, lang, trek.published, (defaultValue, translations) => {
      trail.name = defaultValue;
      if (translations)
        trail.publicationData!['nameTranslations'] = translations;
    });

    // way points
    const wayPointModule = await import('front/model/way-point.js');
    const wayPoints: WayPoint[] = [];
    if (trek.points_reference && trek.points_reference.type === 'MultiPoint') {
      for (const coord of trek.points_reference.coordinates) {
        wayPoints.push(new wayPointModule.WayPoint({
          pos: {
            lng: coord[0],
            lat: coord[1]
          }
        }, '', ''));
      }
    }
    fixWayPointsPosition(wayPoints, track);

    this.getTranslations(trek.departure, lang, trek.published, (departureDefault, departureTranslations) => {
      this.getTranslations(trek.description, lang, trek.published, (defaultValue, translations) => {
        let texts = this.descriptionToWayPointsTexts(defaultValue, wayPoints.length);
        const departure = texts.departure && texts.departure.trim().length > 0 ? new wayPointModule.WayPoint(track[0][0], departureDefault ?? trail.location!, texts.departure.trim()) : undefined;
        for (let i = 0; i < texts.wayPoints.length && i < wayPoints.length; ++i) wayPoints[i].description = texts.wayPoints[i];
        if (departure && departureTranslations) {
          for (const lang of Object.keys(departureTranslations)) {
            let t = departure.nameTranslations ?? {};
            t[lang] = departureTranslations[lang];
            departure.nameTranslations = t;
          }
        }
        if (translations) {
          for (const lang of Object.keys(translations)) {
            texts = this.descriptionToWayPointsTexts(translations[lang], wayPoints.length);
            if (departure && texts.departure && texts.departure.trim().length > 0) {
              let t = departure.descriptionTranslations ?? {};
              t[lang] = texts.departure.trim();
              departure.descriptionTranslations = t;
            }
            for (let i = 0; i < texts.wayPoints.length && i < wayPoints.length; ++i) {
              let t = wayPoints[i].descriptionTranslations ?? {};
              t[lang] = texts.wayPoints[i];
              wayPoints[i].descriptionTranslations = t;
            }
          }
        }
        if (departure)
          wayPoints.splice(0, 0, departure);
      });
    });

    // description
    this.getTranslations(trek.description_teaser, lang, trek.published, (defaultValue, translations) => {
      trail.description = defaultValue;
      if (translations)
        trail.publicationData!['descriptionTranslations'] = translations;
    });
    this.getTranslations(trek.ambiance, lang, trek.published, (defaultValue, translations) => {
      trail.description = this.appendDescription(trail.description!, defaultValue);
      if (translations) {
        if (!trail.publicationData!['descriptionTranslations']) {
          trail.publicationData!['descriptionTranslations'] = translations;
        } else {
          const current = trail.publicationData!['descriptionTranslations'];
          for (const lang of Object.keys(translations)) {
            if (!current[lang]) current[lang] = translations[lang];
            else current[lang] = this.appendDescription(current[lang], translations[lang]);
          }
        }
      }
    });
    const pointDescriptorModule = await import('front/model/point-descriptor.js');
    if (wayPoints.length === 1 && pointDescriptorModule.pointsAreEqual(wayPoints[0].point, track[0][0])) {
      if (wayPoints[0].description) {
        this.getTranslations(trek.description, lang, trek.published, (defaultValue, translations) => {
          trail.description = this.appendDescription(trail.description!, defaultValue);
          if (translations) {
            if (!trail.publicationData!['descriptionTranslations']) {
              trail.publicationData!['descriptionTranslations'] = translations;
            } else {
              const current = trail.publicationData!['descriptionTranslations'];
              for (const lang of Object.keys(translations)) {
                if (!current[lang]) current[lang] = translations[lang];
                else current[lang] = this.appendDescription(current[lang], translations[lang]);
              }
            }
          }
        });
        wayPoints[0].description = '';
        wayPoints[0].descriptionTranslations = undefined;
      }
    }
    this.getTranslations(trek.advice, lang, trek.published, (defaultValue, translations) => {
      trail.description = this.appendDescription(trail.description!, defaultValue);
      if (translations) {
        if (!trail.publicationData!['descriptionTranslations']) {
          trail.publicationData!['descriptionTranslations'] = translations;
        } else {
          const current = trail.publicationData!['descriptionTranslations'];
          for (const lang of Object.keys(translations)) {
            if (!current[lang]) current[lang] = translations[lang];
            else current[lang] = this.appendDescription(current[lang], translations[lang]);
          }
        }
      }
    });

    const photos: PhotoInfo[] = [];
    for (const att of trek.attachments) {
      if (att.license !== null) continue;
      if (att.type !== 'image') continue;
      if (!att.url) continue;
      let photoDescription = '';
      if (att.legend && att.legend.length > 0) photoDescription = att.legend;
      else if (att.title && att.title.length > 0) photoDescription = att.title;
      photos.push({uuid: att.uuid, url: att.url, description: photoDescription});
    }

    return {trail, track, wayPoints, photos};
  }

  private getSingleTranslation(translations: GeoTrekTranslations, defaultLang: string): string {
    if (translations[defaultLang] && translations[defaultLang].length > 0) return translations[defaultLang];
    if (translations['en']?.length) return translations['en'];
    if (translations['fr']?.length) return translations['fr'];
    return '';
  }

  private getTranslations(source: GeoTrekTranslations, defaultLang: string, published: {[lang: string]: boolean}, receiver: (defaultValue: string, translations: {[lang: string]: string} | undefined) => void) {
    const defaultValue = this.getSingleTranslation(source, defaultLang);
    let translations: {[lang: string]: string} | undefined;
    for (const lang of Object.keys(published)) {
      if (!published[lang]) continue;
      if (lang === defaultLang) continue;
      const translated = source[lang];
      if (!translated || translated.length === 0) continue;
      translations ??= {};
      translations[lang] = translated;
    }
    receiver(defaultValue, translations);
  }

  private appendDescription(current: string, append: string): string {
    if (append.trim().length === 0) return current;
    if (current.trim().endsWith('</p>') || current.trim().endsWith('<br/>') || append.trim().startsWith('<p>')) return current + append;
    return current + '<br/>' + append;
  }

  private descriptionToWayPointsTexts(descr: string, nbWayPoints: number): {departure: string, wayPoints: string[]} {
    let i = descr.indexOf('<ol>');
    const wayPoints: string[] = [];
    if (i >= 0) {
      let j = descr.indexOf('</ol>', i);
      if (j > 0) {
        let ol = descr.substring(i + 4, j);
        descr = descr.substring(0, i) + descr.substring(j + 5);
        while ((i = ol.indexOf('<li>')) >= 0) {
          j = ol.indexOf('</li>', i);
          if (j < 0) break;
          try {
            const li = window.document.createElement('DIV');
            li.innerHTML = ol.substring(i + 4, j);
            wayPoints.push(li.textContent.trim());
          } catch (e) {
            break;
          }
          ol = ol.substring(j + 5);
        }
      }
    } else if (nbWayPoints > 0) {
      let s = this.splitWayPoints(descr, nbWayPoints, '.');
      if (!s) s = this.splitWayPoints(descr, nbWayPoints, ')');
      if (!s) s = this.splitWayPoints(descr, nbWayPoints, '-');
      if (!s) s = this.splitWayPoints(descr, nbWayPoints, String.fromCodePoint(8211));
      if (s) {
        for (let i = 0; i < s.wayPoints.length; ++i) {
          const div = window.document.createElement('DIV');
          div.innerHTML = s.wayPoints[i].trim();
          wayPoints.push(div.textContent);
        }
        descr = s.departure;
      }
    }
    let departure = '';
    try {
      const dep = window.document.createElement('DIV');
      dep.innerHTML = descr.trim();
      departure = dep.textContent;
    } catch (e) {
      // ignore
    }
    return {departure, wayPoints};
  }

  private splitWayPoints(descr: string, nbWayPoints: number, patternStart: string): {departure: string, wayPoints: string[]} | undefined {
    let startText = '1' + patternStart;
    let start = descr.indexOf(startText);
    if (start < 0) {
      startText = '1 ' + patternStart;
      start = descr.indexOf(startText);
    }
    if (start < 0) {
      startText = '1' + String.fromCodePoint(160) + patternStart;
      start = descr.indexOf(startText);
    }
    if (start < 0) {
      startText = '<strong>1</strong>' + patternStart;
      start = descr.indexOf(startText);
    }
    if (start < 0) {
      startText = '<strong>1</strong> ' + patternStart;
      start = descr.indexOf(startText);
    }
    if (start < 0) {
      startText = '<strong>1</strong>' + String.fromCodePoint(160) + patternStart;
      start = descr.indexOf(startText);
    }
    if (start < 0) {
      startText = '<strong>1 </strong>' + patternStart;
      start = descr.indexOf(startText);
    }
    if (start < 0) {
      startText = '<strong>1' + String.fromCodePoint(160) + '</strong>' + patternStart;
      start = descr.indexOf(startText);
    }
    //console.log('pattern', patternStart, start);
    if (start < 0) return undefined;
    const departure = descr.substring(0, start).trim();
    descr = descr.substring(start + startText.length);
    const wayPoints: string[] = [];
    let index = 1;
    while (index < nbWayPoints) {
      let nextStartText = '' + (index + 1) + patternStart;
      let nextStart = descr.indexOf(nextStartText);
      if (nextStart < 0) {
        nextStartText = '' + (index + 1) + ' ' + patternStart;
        nextStart = descr.indexOf(nextStartText);
      }
      if (nextStart < 0) {
        nextStartText = '' + (index + 1) + String.fromCodePoint(160) + patternStart;
        nextStart = descr.indexOf(nextStartText);
      }
      if (nextStart < 0) {
        nextStartText = '<strong>' + (index + 1) + '</strong>' + patternStart;
        nextStart = descr.indexOf(nextStartText);
      }
      if (nextStart < 0) {
        nextStartText = '<strong>' + (index + 1) + '</strong> ' + patternStart;
        nextStart = descr.indexOf(nextStartText);
      }
      if (nextStart < 0) {
        nextStartText = '<strong>' + (index + 1) + '</strong>' + String.fromCodePoint(160) + patternStart;
        nextStart = descr.indexOf(nextStartText);
      }
      if (nextStart < 0) {
        nextStartText = '<strong>' + (index + 1) + ' </strong>' + patternStart;
        nextStart = descr.indexOf(nextStartText);
      }
      if (nextStart < 0) {
        nextStartText = '<strong>' + (index + 1) + String.fromCodePoint(160) + '</strong>' + patternStart;
        nextStart = descr.indexOf(nextStartText);
      }
      //console.log('next', patternStart, nextStart);
      if (nextStart < 0) return undefined;
      wayPoints.push(descr.substring(0, nextStart));
      descr = descr.substring(nextStart + nextStartText.length);
      index++;
    }
    wayPoints.push(descr);
    return {departure, wayPoints};
  }

  private getTrekLink(trek: GeoTrekDto): string | undefined {
    if (!this.trekLink) return undefined;
    let link = this.trekLink;
    let i = 0;
    while ((i = link.indexOf('{{', 0)) >= 0) {
      let j = link.indexOf('}}', i + 2);
      if (j < 0) break;
      const name = link.substring(i + 2, j).trim();
      if (!(trek as any)[name]) return undefined;
      link = link.substring(0, i) + (trek as any)[name] + link.substring(j + 2);
    }
    return link;
  }

  private citiesCache = new Map<number, string | undefined>();

  private async getCity(id: number): Promise<string | undefined> {
    if (this.citiesCache.has(id)) return this.citiesCache.get(id);
    const response = await fetch(this.baseUrl + '/city/' + id);
    const json = await response.json();
    if (!response.ok) {
      console.warn('Error getting city id ' + id, json);
      return undefined;
    }
    if (json.published && json.name && json.name.length > 0) {
      this.citiesCache.set(id, json.name);
      return json.name;
    } else {
      this.citiesCache.set(id, undefined);
      return undefined;
    }
  }

  private async downloadPhotos(owner: string, trailUuid: string, infos: PhotoInfo[]): Promise<{blob: Blob, photo: Photo}[]> {
    const photos: {blob: Blob, photo: Photo}[] = [];
    for (const info of infos) {
      try {
        console.log('Downloading photo ' + info.url);
        const file = await (await fetch(info.url)).arrayBuffer();
        const module = await import('front/services/database/photo-import.js');
        photos.push(await module.importPhoto(owner, trailUuid, info.description, photos.length + 1, file, preferences, undefined, undefined, undefined, undefined, info.uuid));
      } catch (e) {
        console.warn('Cannot get trek photo', e);
        continue;
      }
    }
    return photos;
  }

}

interface PhotoInfo {
  uuid: string;
  url: string;
  description: string;
}
