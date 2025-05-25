import { HttpClient } from '@angular/common/http';
import { Injectable, NgZone } from "@angular/core";
import { addIcons } from 'ionicons';
import { firstValueFrom, Observable, Subscriber } from "rxjs";
import { Console } from 'src/app/utils/console';

@Injectable({
  providedIn: "root"
})
export class AssetsService {

  public icons: {[name: string]: string};

  constructor(private readonly http: HttpClient, private readonly ngZone: NgZone) {
    this.icons = {
      'account': 'assets/account.1.svg', // person-circle-outline
      'add': 'assets/add.1.svg', // add
      'add-circle': 'assets/add-circle.1.svg', // add-circle-outline
      'altitude': 'assets/altitude.1.svg',
      'android': 'assets/android.1.svg', // logo-android
      'apple': 'assets/apple.1.svg', // logo-apple
      'arrow-back': 'assets/arrow-back.1.svg', // arrow-back
      'arrow-down': 'assets/arrow-down.1.svg', // arrow-down
      'arrow-forward': 'assets/arrow-forward.1.svg', // arrow-forward
      'arrow-up': 'assets/arrow-up.1.svg', // arrow-up
      'browser-chrome': 'assets/browser-chrome.1.svg', // logo-chrome
      'browser-firefox': 'assets/browser-firefox.1.svg', // logo-firefox
      'browser-edge': 'assets/browser-edge.1.svg', // logo-edge
      'bubbles': 'assets/bubbles.1.svg',
      'car': 'assets/car.1.svg', // car
      'caret-back': 'assets/caret-back.1.svg', // caret-back
      'caret-down': 'assets/caret-down.1.svg', // caret-down
      'caret-forward': 'assets/caret-forward.1.svg', // caret-forward
      'celebration': 'assets/celebration.1.svg',
      'center-on-location': 'assets/center-on-location.1.svg',
      'checkmark': 'assets/checkmark.1.svg', // checkmark-outline
      'chevron-down': 'assets/chevron-down.1.svg', // chevron-down-outline
      'chevron-first': 'assets/admin/chevron-first.1.svg',
      'chevron-last': 'assets/admin/chevron-last.1.svg',
      'chevron-left': 'assets/chevron-left.1.svg', // chevron-back-outline
      'chevron-right': 'assets/chevron-right.1.svg', // chevron-forward-outline
      'chevron-up': 'assets/chevron-up.1.svg', // chevron-up-outline
      'chrono': 'assets/chrono.1.svg', // stopwatch-outline
      'cleaning': 'assets/cleaning.1.svg',
      'collection': 'assets/collection.1.svg',
      'collection-copy': 'assets/collection-copy.1.svg',
      'collection-move': 'assets/collection-move.1.svg',
      'compare': 'assets/compare.1.svg', // swap-horizontal-outline
      'cross': 'assets/cross.1.svg', // close-outline
      'database': 'assets/database.1.svg', // server-outline
      'date': 'assets/calendar-outline.1.svg', // calendar-outline
      'desktop': 'assets/desktop.1.svg', // desktop-outline
      'distance': 'assets/distance.1.svg',
      'download': 'assets/download.1.svg', // cloud-download
      'duration': 'assets/duration.1.svg', // time-outline
      'edit': 'assets/edit.1.svg', // create-outline
      'elevation': 'assets/elevation.1.svg', // analytics-outline
      'enter': 'assets/enter.1.svg', // enter-outline
      'error': 'assets/exclamation-circle.1.svg', // alert-circle-outline
      'export': 'assets/export.1.svg', // download-outline
      'file': 'assets/file.1.svg', // document-outline
      'filters': 'assets/filters.1.svg', // funnel-outline
      'half-loop': 'assets/half-loop.1.svg',
      'heart-outline': 'assets/heart-outline.1.svg', // heart-outline
      'highest-point': 'assets/highest-point.1.svg',
      'hourglass': 'assets/hourglass.1.svg', // hourglass-outline
      'i18n': 'assets/language.1.svg', // language-outline
      'info': 'assets/info-circle.1.svg', // information-circle-outline
      'item-menu': 'assets/item-menu.1.svg', // ellipsis-vertical
      'key': 'assets/key.1.svg', // key-outline
      'layers': 'assets/layers.1.svg', // layers-outline
      'list-condensed': 'assets/list-condensed.1.svg',
      'list-detailed': 'assets/list-detailed.1.svg',
      'location': 'assets/location.1.svg', // location
      'logo': 'assets/icon/trailence.1.svg',
      'logout': 'assets/logout.1.svg', // log-out-outline
      'loop': 'assets/loop.1.svg',
      'lowest-point': 'assets/lowest-point.1.svg',
      'mail': 'assets/mail.1.svg', // mail-outline
      'map': 'assets/map.1.svg', // map
      'menu': 'assets/menu.1.svg', // menu
      'mobile': 'assets/mobile.1.svg',
      'more-menu': 'assets/more-menu.1.svg', // ellipsis-horizontal
      'offline': 'assets/exclamation-circle.1.svg', // alert-circle-outline
      'one-way': 'assets/point-to-point.1.svg',
      'online': 'assets/online.1.svg', // checkmark-circle-outline
      'out-and-back': 'assets/out-and-back.1.svg',
      'pin': 'assets/pin.1.svg',
      'pin-off': 'assets/pin-off.1.svg',
      'plus': 'assets/add.1.svg', // add
      'merge': 'assets/merge.1.svg', // git-merge-outline
      'minus': 'assets/minus.1.svg', // remove
      'negative-elevation': 'assets/negative-elevation.1.svg',
      'path': 'assets/path.1.svg',
      'pause': 'assets/pause.1.svg', // pause-outline
      'pause-circle': 'assets/pause-circle.1.svg', // pause-circle-outline
      'phone-lock': 'assets/phone-lock.2.svg',
      'photos': 'assets/photos.1.svg', // images-outline
      'planner': 'assets/calendar-outline.1.svg', // calendar-outline
      'play': 'assets/play.1.svg', // play-outline
      'play-circle': 'assets/play-circle.1.svg', // play-circle-outline
      'points-distance': 'assets/points-distance.1.svg',
      'positive-elevation': 'assets/positive-elevation.1.svg',
      'question': 'assets/question.1.svg', // help-outline
      'redo': 'assets/redo.1.svg', // arrow-redo-outline
      'reset': 'assets/reset.1.svg', // refresh-outline
      'save': 'assets/save.1.svg', // save
      'search': 'assets/search.1.svg', // search-outline
      'selection': 'assets/selection.1.svg',
      'selection-add': 'assets/selection-add.1.svg',
      'selection-off': 'assets/selection-off.1.svg',
      'send-message': 'assets/send-message.1.svg', // send-outline
      'settings': 'assets/settings.1.svg', // settings
      'share': 'assets/share.1.svg', // share-social
      'share-outline': 'assets/share-outline.1.svg',  // share-social-outline
      'small-loop': 'assets/small-loop.1.svg',
      'speed': 'assets/speed.1.svg', // speedometer-outline
      'star-empty': 'assets/star-empty.1.svg', // star-outline
      'star-half': 'assets/star-half.1.svg', // star-half
      'star-filled': 'assets/star-filled.1.svg', // star
      'sort': 'assets/sort.1.svg', // swap-vertical-outline
      'stop': 'assets/stop.1.svg', // stop-outline
      'stop-circle': 'assets/stop-circle.1.svg', // stop-circle-outline
      'sync': 'assets/sync.1.svg', // sync-circle-outline
      'tags': 'assets/tags.1.svg', // pricetags-outline
      'text': 'assets/text.1.svg', // reader-outline
      'tool': 'assets/tool.1.svg', // hammer-outline
      'trash': 'assets/trash.1.svg', // trash
      'theme': 'assets/theme.1.svg', // color-palette-outline
      'theme-light': 'assets/theme-light.1.svg', // sunny-outline
      'theme-dark': 'assets/theme-dark.1.svg', // moon-outline
      'theme-system': 'assets/theme-system.1.svg', // cog-outline
      'undo': 'assets/undo.1.svg', // arrow-undo-outline
      'warning': 'assets/warning.2.svg', // warning-outline
      'web': 'assets/web.1.svg', // globe-outline
      'windows': 'assets/windows.1.svg', // logo-windows
      'zoom-in': 'assets/zoom-in.1.svg',
      'zoom-out': 'assets/zoom-out.1.svg',
      'zoom-fit-bounds': 'assets/zoom-fit.1.svg',
    };
    addIcons(this.icons);
    // override fetch to intercept ion icons calls, and use our cache
    const originalFetch: (input: string | URL | globalThis.Request, init?: RequestInit) => Promise<Response> = window.fetch;
    window.fetch = (input, init) => {
      if (typeof input === 'string' && input.startsWith('assets/') && input.endsWith('.svg')) {
        return firstValueFrom(this.loadSvg(input, false)).then(svg => {
          const text = svg.outerHTML;
          return {
            ok: true,
            text: () => Promise.resolve(text),
          } as Response;
        });
      }
      return originalFetch(input, init);
    };
  }

  private readonly _loadedSvg = new Map<string, SVGSVGElement>();
  private readonly _loadingSvg = new Map<string, Subscriber<SVGSVGElement>[]>();

  public loadJson(url: string): Observable<any> {
    return this.http.get(url);
  }

  public loadSvg(url: string, clone: boolean = true): Observable<SVGSVGElement> {
    return new Observable<SVGSVGElement>(observer => {
      this.ngZone.runOutsideAngular(() => {
        const known = this._loadedSvg.get(url);
        if (known) {
          observer.next(clone ? known.cloneNode(true) as SVGSVGElement : known);
          observer.complete();
          return;
        }
        const loading = this._loadingSvg.get(url);
        if (loading) {
          loading.push(observer);
          return;
        }
        this._loadingSvg.set(url, [observer]);
        this._loadSvg(url, clone);
      });
    });
  }

  private _loadSvg(url: string, clone: boolean) {
    const error = (e: any) => {
      Console.error('Error loading SVG ' + url, e);
      const subscribers = this._loadingSvg.get(url);
      this._loadingSvg.delete(url);
      subscribers?.forEach(s => s.error(e));
    };
    this.http.get(url, {responseType: 'text'}).subscribe({
      next: svgText => {
        const el = document.createElement('html');
        el.innerHTML = svgText;
        const svg = el.getElementsByTagName('svg').item(0);
        if (!svg) {
          error(new Error('Invalid SVG'));
          return;
        }
        const subscribers = this._loadingSvg.get(url);
        this._loadingSvg.delete(url);
        this._loadedSvg.set(url, svg);
        subscribers?.forEach(s => {
          s.next(clone ? svg.cloneNode(true) as SVGSVGElement : svg);
          s.complete();
        });
      },
      error: e => {
        error(e);
      }
    });
  }

}
