import { Importer } from '../importer';
import { TrailenceClient } from '../../trailence/trailence-client';
import { Config } from 'src/config/config';
import { GeoTrekDto, GeoTrekResponse, GeoTrekTranslations } from './geotrek-dtos';
import { PointDescriptor } from 'front/model/point-descriptor.js';
import { TrailDto } from 'front/model/dto/trail.js';
import { Photo } from 'front/model/photo';
import { preferences } from 'src/trailence/preferences';

export class GeoTrekImport extends Importer {

  private baseUrl: string;
  private username: string;
  private trekLink?: string;

  constructor(
    trailenceClient: TrailenceClient,
    config: Config,
    remoteName: string,
  ) {
    super(trailenceClient);
    this.baseUrl = config.getRequiredString(remoteName, 'url');
    this.username = config.getRequiredString(remoteName, 'username');
    this.trekLink = config.getString(remoteName, 'trek-link');
  }

  public override async importTrails() {
    const myTrails = await this.trailenceClient.getMyTrails();
    const knownTrails = await this.trailenceClient.getTrailsByCollectionUuid(myTrails.uuid);
    console.log('Fetching treks from ' + this.baseUrl);
    let page = 1;
    let found = 0;
    const nbBefore = knownTrails.length;
    let upToDate = 0;
    let updated = 0;
    let created = 0;
    do {
      const response = await this.getTreks(page);
      found += response.results!.length;
      console.log('Treks found on page ' + page + ': ' + response.results!.length + ' (' + found + '/' + response.count + ')');
      for (const trek of response.results!) {
        if (!this.isValid(trek)) continue;
        const knownIndex = knownTrails.findIndex(t => t.uuid === trek.uuid);
        if (knownIndex >= 0) {
          const existing = knownTrails[knownIndex];
          knownTrails.splice(knownIndex, 1);
          // TODO update if needed
          upToDate++;
        } else {
          await this.createTrail(trek);
          created++;
        }
      }
      if (response.next === null) break;
      page++;
    } while (true);
    // TODO remove remaining trails not found
    console.log('Total: before = ' + nbBefore + ', found = ' + found + ', up to date = ' + upToDate + ', updated = ' + updated + ', new = ' + created + ', removed = ' + knownTrails.length);
  }

  private async getTreks(page: number): Promise<GeoTrekResponse> {
    const response = await fetch(this.baseUrl + '/trek/?practices=4&length_max=50000&page=' + page);
    const json: any = await response.json();
    if (!response.ok || json['results'] === undefined) {
      console.error('Error getting geotrek page ' + page, json);
      throw new Error();
    }
    return json as GeoTrekResponse;
  }

  private isValid(trek: GeoTrekDto): boolean {
    if (!trek.published) return false;
    if (!trek.published['fr'] && !trek.published['en']) return false;
    if (!trek.geometry) return false;
    if (trek.geometry.type !== 'LineString') return false;
    return true;
  }

  private async createTrail(trek: GeoTrekDto) {
    console.log('New trail: ' + trek.uuid);

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
    const activitiesModule = await import('front/model/dto/trail-activity');

    const trail: TrailDto = {
      owner: this.username,
      uuid: trek.uuid,
      version: 0,
      createdAt: Date.now(),
      updatedAt: Date.now(),
      collectionUuid: myTrailsCollection.uuid,
      activity: activitiesModule.TrailActivity.HIKING,
      date: new Date(trek.update_datetime).getTime(),
      sourceType: 'external',
      source: this.getTrekLink(trek),
      sourceDate: new Date(trek.update_datetime).getTime(),
    };

    trail.publicationData = {};
    const lang = trek.published['fr'] ? 'fr' : 'en';
    trail.publicationData['lang'] = lang;
    trail.location = this.getSingleTranslation(trek.departure, lang);
    this.getTranslations(trek.name, lang, trek.published, (defaultValue, translations) => {
      trail.name = defaultValue;
      if (translations)
        trail.publicationData!['nameTranslations'] = translations;
    });
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
    if (trail.source) {
      const src = 'Source: <a href="' + trail.source + '" target="_blank">' + trail.source + '</a>';
      trail.description = this.appendDescription(trail.description!, src);
      if (trail.publicationData && trail.publicationData!['descriptionTranslations'])
        for (const lang of Object.keys(trail.publicationData!['descriptionTranslations']))
          trail.publicationData!['descriptionTranslations'][lang] = this.appendDescription(trail.publicationData!['descriptionTranslations'][lang], src);
    }

    const wayPointModule = await import('front/model/way-point.js');
    const wayPoints: any[] = [];
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

    let descr = this.getSingleTranslation(trek.description, lang);
    let i = descr.indexOf('<ol>');
    if (i >= 0) {
      let j = descr.indexOf('</ol>', i);
      if (j > 0) {
        let ol = descr.substring(i + 4, j);
        descr = descr.substring(0, i) + descr.substring(j + 5);
        let index = 0;
        while ((i = ol.indexOf('<li>')) >= 0 && index < wayPoints.length) {
          j = ol.indexOf('</li>', i);
          if (j < 0) break;
          try {
            const li = window.document.createElement('DIV');
            li.innerHTML = ol.substring(i + 4, j);
            wayPoints[index++].description = li.textContent;
          } catch (e) {
            break;
          }
          ol = ol.substring(j + 5);
        }
      }
    }
    const departure = window.document.createElement('DIV');
    departure.innerHTML = descr;
    const departureDescr = departure.textContent.trim();
    wayPoints.splice(0, 0, new wayPointModule.WayPoint(track[0][0], trail.location, departureDescr));

    const photos: {blob: Blob, photo: Photo}[] = [];
    for (const att of trek.attachments) {
      if (att.license !== null) continue;
      if (att.type !== 'image') continue;
      if (!att.url) continue;
      try {
        console.log('Downloading image ' + att.url);
        const file = await (await fetch(att.url)).arrayBuffer();
        let photoDescription = '';
        if (att.legend && att.legend.length > 0) photoDescription = att.legend;
        else if (att.title && att.title.length > 0) photoDescription = att.title;
        const module = await import('front/services/database/photo-import.js');
        photos.push(await module.importPhoto(trail.owner, trail.uuid, photoDescription, photos.length + 1, file, preferences, undefined, undefined, undefined, undefined, att.uuid));
      } catch (e) {
        console.warn('Cannot get trek photo', e);
        continue;
      }
    }

    await this.publishTrail(trail, track, wayPoints, photos);
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

}
