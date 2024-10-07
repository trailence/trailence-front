import { HttpClient } from '@angular/common/http';
import { Injectable, NgZone } from "@angular/core";
import { addIcons } from 'ionicons';
import { Observable, Subscriber } from "rxjs";

@Injectable({
  providedIn: "root"
})
export class AssetsService {

  public icons: {[name: string]: string};

  constructor(private http: HttpClient, private ngZone: NgZone) {
    this.icons = {
      'account': 'assets/ionicons/person-circle-outline.svg',
      'add': 'assets/ionicons/add.svg',
      'add-circle': 'assets/ionicons/add-circle-outline.svg',
      'altitude': 'assets/altitude.1.svg',
      'android': 'assets/ionicons/logo-android.svg',
      'arrow-back': 'assets/ionicons/arrow-back.svg',
      'arrow-down': 'assets/ionicons/arrow-down.svg',
      'arrow-forward': 'assets/ionicons/arrow-forward.svg',
      'arrow-up': 'assets/ionicons/arrow-up.svg',
      'car': 'assets/ionicons/car.svg',
      'caret-down': 'assets/ionicons/caret-down.svg',
      'center-on-location': 'assets/center-on-location.1.svg',
      'checkmark': 'assets/ionicons/checkmark-outline.svg',
      'chevron-down': 'assets/ionicons/chevron-down-outline.svg',
      'chevron-left': 'assets/ionicons/chevron-back-outline.svg',
      'chevron-right': 'assets/ionicons/chevron-forward-outline.svg',
      'chevron-up': 'assets/ionicons/chevron-up-outline.svg',
      'chrono': 'assets/ionicons/stopwatch-outline.svg',
      'cleaning': 'assets/cleaning.1.svg',
      'collection': 'assets/collection.1.svg',
      'collection-copy': 'assets/collection-copy.1.svg',
      'collection-move': 'assets/collection-move.1.svg',
      'compare': 'assets/ionicons/swap-horizontal-outline.svg',
      'cross': 'assets/ionicons/close-outline.svg',
      'database': 'assets/ionicons/server-outline.svg',
      'date': 'assets/ionicons/calendar-outline.svg',
      'distance': 'assets/distance.1.svg',
      'download': 'assets/ionicons/cloud-download.svg',
      'duration': 'assets/ionicons/time-outline.svg',
      'edit': 'assets/ionicons/create-outline.svg',
      'elevation': 'assets/ionicons/analytics-outline.svg',
      'error': 'assets/ionicons/alert-circle-outline.svg',
      'export': 'assets/ionicons/download-outline.svg',
      'filters': 'assets/ionicons/funnel-outline.svg',
      'half-loop': 'assets/half-loop.1.svg',
      'highest-point': 'assets/highest-point.1.svg',
      'hourglass': 'assets/ionicons/hourglass-outline.svg',
      'i18n': 'assets/ionicons/language-outline.svg',
      'info': 'assets/ionicons/information-circle-outline.svg',
      'item-menu': 'assets/ionicons/ellipsis-vertical.svg',
      'layers': 'assets/ionicons/layers-outline.svg',
      'location': 'assets/ionicons/location.svg',
      'logo': 'assets/icon/trailence.1.svg',
      'logout': 'assets/ionicons/log-out-outline.svg',
      'loop': 'assets/loop.1.svg',
      'lowest-point': 'assets/lowest-point.1.svg',
      'offline': 'assets/ionicons/alert-circle-outline.svg',
      'one-way': 'assets/point-to-point.1.svg',
      'online': 'assets/ionicons/checkmark-circle-outline.svg',
      'out-and-back': 'assets/out-and-back.1.svg',
      'pin': 'assets/pin.1.svg',
      'pin-off': 'assets/pin-off.1.svg',
      'merge': 'assets/ionicons/git-merge-outline.svg',
      'negative-elevation': 'assets/negative-elevation.1.svg',
      'path': 'assets/path.1.svg',
      'pause-circle': 'assets/ionicons/pause-circle-outline.svg',
      'photos': 'assets/ionicons/images-outline.svg',
      'planner': 'assets/ionicons/calendar-outline.svg',
      'play': 'assets/ionicons/play-outline.svg',
      'play-circle': 'assets/ionicons/play-circle-outline.svg',
      'points-distance': 'assets/points-distance.1.svg',
      'positive-elevation': 'assets/positive-elevation.1.svg',
      'question': 'assets/ionicons/help-outline.svg',
      'redo': 'assets/ionicons/arrow-redo-outline.svg',
      'reset': 'assets/ionicons/refresh-outline.svg',
      'save': 'assets/ionicons/save.svg',
      'settings': 'assets/ionicons/settings.svg',
      'share': 'assets/ionicons/share-social.svg',
      'share-outline': 'assets/ionicons/share-social-outline.svg',
      'small-loop': 'assets/small-loop.1.svg',
      'speed': 'assets/ionicons/speedometer-outline.svg',
      'sort': 'assets/ionicons/swap-vertical-outline.svg',
      'stop': 'assets/ionicons/stop-outline.svg',
      'stop-circle': 'assets/ionicons/stop-circle-outline.svg',
      'sync': 'assets/ionicons/sync-circle-outline.svg',
      'tags': 'assets/ionicons/pricetags-outline.svg',
      'text': 'assets/ionicons/reader-outline.svg',
      'tool': 'assets/ionicons/hammer-outline.svg',
      'trash': 'assets/ionicons/trash.svg',
      'theme': 'assets/ionicons/color-palette-outline.svg',
      'theme-light': 'assets/ionicons/sunny-outline.svg',
      'theme-dark': 'assets/ionicons/moon-outline.svg',
      'theme-system': 'assets/ionicons/cog-outline.svg',
      'undo': 'assets/ionicons/arrow-undo-outline.svg',
      'zoom-in': 'assets/zoom-in.1.svg',
      'zoom-out': 'assets/zoom-out.1.svg',
    };
    addIcons(this.icons);
  }

  private _loadedSvg = new Map<string, SVGSVGElement>();
  private _loadingSvg = new Map<string, Subscriber<SVGSVGElement>[]>();

  public loadJson(url: string): Observable<any> {
    return this.http.get(url);
  }

  public loadSvg(url: string): Observable<SVGSVGElement> {
    return new Observable<SVGSVGElement>(observer => {
      this.ngZone.runOutsideAngular(() => {
        const known = this._loadedSvg.get(url);
        if (known) {
          observer.next(known.cloneNode(true) as SVGSVGElement);
          observer.complete();
          return;
        }
        const loading = this._loadingSvg.get(url);
        if (loading) {
          loading.push(observer);
          return;
        }
        this._loadingSvg.set(url, [observer]);
        const error = (e: any) => {
          console.error('Error loading SVG ' + url, e);
          const subscribers = this._loadingSvg.get(url);
          this._loadingSvg.delete(url);
          subscribers?.forEach(s => {
            s.error(e);
          });
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
              s.next(svg.cloneNode(true) as SVGSVGElement);
              s.complete();
            });
          },
          error: e => {
            error(e);
          }
        });
      });
    });
  }

}
