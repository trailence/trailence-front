import { Injector, SecurityContext } from '@angular/core';
import { XmlUtils } from 'src/app/utils/xml-utils';
import { populateWayPointInfo, SearchResult, TrailInfo } from './fetch-source.interfaces';
import L from 'leaflet';
import { GpxFormat } from 'src/app/utils/formats/gpx-format';
import { PreferencesService } from '../preferences/preferences.service';
import { Trail } from 'src/app/model/trail';
import { from, Observable, switchMap, zip } from 'rxjs';
import { HttpService } from '../http/http.service';
import { environment } from 'src/environments/environment';
import { Console } from 'src/app/utils/console';
import { filterItemsDefined } from 'src/app/utils/rxjs/filter-defined';
import { PluginWithDb, TrailInfoBaseDto } from './abstract-plugin-with-db';

interface TrailInfoDto extends TrailInfoBaseDto {
  keyNumber: string;
  keyGpx: string;
  url: string;
}

export class VisorandoPlugin extends PluginWithDb<TrailInfoDto> {

  public readonly name = 'Visorando';
  public readonly owner = 'visorando';

  constructor(
    injector: Injector,
  ) {
    super(injector, 'visorando', 'keyNumber, keyGpx, url', 'keyNumber');
  }

  public override canFetchTrailInfoByUrl(url: string): boolean {
    return url.startsWith('https://www.visorando.com/') && !url.startsWith('https://www.visorando.com/page-');
  }

  public override fetchTrailInfoByUrl(url: string): Promise<TrailInfo | null> {
    if (!url.endsWith('/')) url += '/';
    const fromDb = this.tableInfos.searchFirstIgnoreCase('url', url);
    return fromDb.then(info => info?.info ?? window.fetch(url, {mode: 'cors'}).then(response => response.text()).then(text => {
      const parser = new DOMParser();
      const doc = parser.parseFromString(text, "text/html");
      return this.fetchTrailInfoByContent(doc);
    }).catch(e => {
      Console.warn('Error parsing Visorando page', e);
      return Promise.reject(e);
    }));
  }

  public override canFetchTrailInfoByContent(doc: Document): boolean {
    return !!doc.querySelector('div.vr-walk-datasheet');
  }

  public override fetchTrailInfoByContent(doc: Document, fromUrl?: string): Promise<TrailInfo | null> { // NOSONAR
    const result: TrailInfo = {};

    // description
    let description = doc.querySelector('main header div[itemprop=description]');
    if (description) {
      const content = description.textContent;
      if (content) result.description = this.sanitize(content) ?? undefined;
    }
    if (!result.description) {
      description = doc.querySelector('main header div.text--lg p');
      const content = description?.textContent;
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

    // rating
    const ratingElement = doc.querySelector('div[itemprop=aggregateRating] span[itemprop=ratingValue]');
    if (ratingElement?.textContent) {
      const v = parseFloat(ratingElement.textContent);
      if (!isNaN(v) && v >= 0 && v <= 5) result.rating = v;
    }

    // ids
    const buttons = doc.querySelectorAll('a.btn');
    let keyGpx = '';
    let keyNumber = '';
    for (let i = 0; i < buttons.length; ++i) {
      const button = buttons.item(i)! as HTMLAnchorElement; // NOSONAR
      const data = button.getAttribute('data');
      if (data && data.indexOf('task=gpxRando') > 0) {
        const j = data.lastIndexOf('=');
        keyGpx = data.substring(j + 1);
      } else if (data && data.indexOf('task=pdfRando') > 0) {
        const j = data.lastIndexOf('=');
        keyNumber = data.substring(j + 1);
      } else if (button.href.indexOf('task=gpxRando') > 0) {
        const j = button.href.lastIndexOf('=');
        keyGpx = button.href.substring(j + 1);
      } else if (button.href.indexOf('task=pdfRando') > 0) {
        const j = button.href.lastIndexOf('=');
        keyNumber = button.href.substring(j + 1);
      }
    }
    result.key = keyNumber + '-' + keyGpx;
    let url = fromUrl;
    if (!url) {
      const links = doc.querySelectorAll('link');
      for (let i = 0; i < links.length; ++i) {
        const link = links.item(i);
        if (link.rel === 'canonical') {
          url = link.href;
          break;
        }
      }
    }
    if (!url && keyNumber) url = 'https://www.visorando.com/randonnee-' + keyNumber;
    result.externalUrl = url;
    Console.info('Trail fetch from Visorando', url, result);

    if (keyNumber.length === 0) return Promise.resolve(null);

    this.tableInfos.put({info: result, keyNumber, keyGpx, url: url ?? '', fetchDate: Date.now()});
    return Promise.resolve(result);
  }

  private sanitize(content: string | null | undefined): string | null {
    if (!content) return null;
    return this.sanitizer.sanitize(SecurityContext.NONE, content.replace(/\r/g, '').replace(/\n/g, ' ').trim());
  }

  public override canSearchByArea(): boolean {
    return true;
  }

  public override searchByArea(bounds: L.LatLngBounds, limit: number): Observable<SearchResult> {
    const bbox = '' + bounds.getWest() + '%2C' + bounds.getEast() + '%2C' + bounds.getSouth() + '%2C' + bounds.getNorth();
    return this.injector.get(HttpService).get<{id: number, url: string}[]>(environment.apiBaseUrl + '/search-trails/v1/visorando?bbox=' + bbox).pipe(
      switchMap(allItems => new Observable<SearchResult>(subscriber => {
        const nextItems = (emitted: number, startIndex: number) => {
          const nbToFetch = Math.min(allItems.length - startIndex, limit - emitted);
          if (nbToFetch <= 0) {
            subscriber.next({trails: [], end: true, tooManyResults: allItems.length > limit});
            subscriber.complete();
            return;
          }
          const urlsToFetch = allItems.slice(startIndex, startIndex + Math.min(nbToFetch, 30)).map(item => item.url);
          zip(...urlsToFetch.map(url => from(this.fetchTrailByUrl(url)))).subscribe(trails => {
            const ok = filterItemsDefined(trails);
            if (ok.length === 0) {
              nextItems(emitted, startIndex + urlsToFetch.length);
              return;
            }
            const end = emitted + ok.length >= limit || startIndex + urlsToFetch.length === allItems.length;
            const tooManyResults = end && emitted + ok.length >= limit && startIndex + urlsToFetch.length < allItems.length;
            subscriber.next({trails: ok, end, tooManyResults});
            if (end) subscriber.complete();
            else nextItems(emitted + ok.length, startIndex + urlsToFetch.length);
          });
        };
        nextItems(0, 0);
      }))
    );
  }

  public override canFetchTrailByUrl(url: string): boolean {
    return url.startsWith('https://www.visorando.com/') && !url.startsWith('https://www.visorando.com/page-');
  }

  public override fetchTrailByUrl(url: string) {
    return this.fetchTrailInfoByUrl(url)
    .then(info => info ? this.fetchTrailFromInfo(info) : null);
  }

  public override canFetchTrailByContent(html: Document): boolean {
    return this.canFetchTrailInfoByContent(html);
  }

  public override fetchTrailByContent(html: Document): Promise<Trail | null> {
    return this.fetchTrailInfoByContent(html)
    .then(info => info ? this.fetchTrailFromInfo(info) : null);
  }

  private fetchTrailFromInfo(info: TrailInfo): Promise<Trail | null> {
    if (!info?.key) return Promise.resolve(null);
    const i = info.key.indexOf('-');
    if (i <= 0) return Promise.resolve(null);
    const keyNumber = info.key.substring(0, i);
    const keyGpx = info.key.substring(i + 1);
    return this.tableTrails.get(keyNumber)
    .then(trail => trail ?? this.fetchTrailByGpx(keyNumber, keyGpx, info))
    .then(dto => dto ? new Trail(dto) : null);
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
      const prepare = this.prepareTrailToStore(gpx.trail, gpx.tracks[0], idTrail);
      this.storeTrails([prepare]);
      return prepare.trailDto;
    })
  }

  public override canFetchTrailsByUrl(url: string): boolean {
    return url.startsWith('https://www.visorando.com/page-');
  }

  public override fetchTrailsByUrl(url: string): Promise<Trail[]> {
    return window.fetch(url, {mode: 'cors'}).then(response => response.text()).then(text => {
      const parser = new DOMParser();
      const doc = parser.parseFromString(text, "text/html");
      return this.fetchTrailsByContent(doc);
    }).catch(e => {
      Console.warn('Error parsing Visorando page', e);
      return Promise.resolve([]);
    });
  }

  public override canFetchTrailsByContent(doc: Document): boolean { // NOSONAR
    if (doc.querySelector('div.vr-walk-datasheet')) return false; // single trail case
    const links = doc.querySelectorAll('a');
    for (let i = 0; i < links.length; ++i) {
      const link = links.item(i);
      if (link.href.startsWith('https://www.visorando.com/randonnee-')) {
        const innerLinks = link.parentElement!.querySelectorAll('a');
        for (let j = 0; j < innerLinks.length; ++j) {
          const link2 = innerLinks.item(j);
          const data = link2.getAttribute('data');
          if (data && data.indexOf('task=gpxRandoPre') > 0) {
            return true;
          }
          if (link2.href.indexOf('task=gpxRandoPre') > 0) {
            return true;
          }
        }
      }
    }
    return false;
  }

  public override fetchTrailsByContent(doc: Document): Promise<Trail[]> { // NOSONAR
    const links = doc.querySelectorAll('a');
    const validLinks = [];
    for (let i = 0; i < links.length; ++i) {
      const link = links.item(i);
      if (link.href.startsWith('https://www.visorando.com/randonnee-')) {
        const innerLinks = link.parentElement!.querySelectorAll('a.btn');
        for (let j = 0; j < innerLinks.length; ++j) {
          const link2 = innerLinks.item(j) as HTMLAnchorElement;
          const data = link2.getAttribute('data');
          if (data && data.indexOf('task=gpxRandoPre') > 0) {
            validLinks.push(link.href);
            break;
          }
          if (link2.href.indexOf('task=gpxRandoPre') > 0) {
            validLinks.push(link.href);
            break;
          }
        }
      }
    }
    Console.info('Found links on Visorando page', validLinks);
    const promises = [];
    for (const link of validLinks) promises.push(this.fetchTrailByUrl(link));
    return Promise.all(promises).then(list => filterItemsDefined(list));
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
