import { Injectable } from "@angular/core";
import { addIcons } from 'ionicons';
import { Observable, Subscriber } from "rxjs";

@Injectable({
  providedIn: "root"
})
export class AssetsService {

  public icons: {[name: string]: string};

  constructor() {
    this.icons = {
      'add': 'assets/ionicons/add.svg',
      'add-circle': 'assets/ionicons/add-circle-outline.svg',
      'arrow-back': 'assets/ionicons/arrow-back.svg',
      'car': 'assets/ionicons/car.svg',
      'caret-down': 'assets/ionicons/caret-down.svg',
      'chevron-down': 'assets/ionicons/chevron-down-outline.svg',
      'chevron-up': 'assets/ionicons/chevron-up-outline.svg',
      'date': 'assets/ionicons/calendar-outline.svg',
      'distance': 'assets/distance.1.svg',
      'download': 'assets/ionicons/cloud-download.svg',
      'duration': 'assets/ionicons/time-outline.svg',
      'edit': 'assets/ionicons/create-outline.svg',
      'elevation': 'assets/ionicons/analytics-outline.svg',
      'filters': 'assets/ionicons/funnel-outline.svg',
      'folder': 'assets/ionicons/folder.svg',
      'i18n': 'assets/ionicons/language-outline.svg',
      'info': 'assets/ionicons/information-circle-outline.svg',
      'item-menu': 'assets/ionicons/ellipsis-vertical.svg',
      'offline': 'assets/ionicons/alert-circle-outline.svg',
      'online': 'assets/ionicons/checkmark-circle-outline.svg',
      'negative-elevation': 'assets/negative-elevation.1.svg',
      'positive-elevation': 'assets/positive-elevation.1.svg',
      'settings': 'assets/ionicons/settings.svg',
      'sort': 'assets/ionicons/swap-vertical-outline.svg',
      'sync': 'assets/ionicons/sync-circle-outline.svg',
      'tags': 'assets/ionicons/pricetags-outline.svg',
      'text': 'assets/ionicons/reader-outline.svg',
      'trash': 'assets/ionicons/trash.svg',
      'theme': 'assets/ionicons/color-palette-outline.svg',
      'theme-light': 'assets/ionicons/sunny-outline.svg',
      'theme-dark': 'assets/ionicons/moon-outline.svg',
      'theme-system': 'assets/ionicons/cog-outline.svg',
      'waypoint': 'assets/ionicons/location.svg',
    };
    addIcons(this.icons);
  }

  private _loaded = new Map<string, HTMLElement>();
  private _loading = new Map<string, Subscriber<HTMLElement>[]>();

  public loadText(url: string, keepInCache: boolean): Observable<HTMLElement> {
    return new Observable<HTMLElement>(observer => {
      const known = this._loaded.get(url);
      if (known) {
        observer.next(known);
        observer.complete();
        return;
      }
      const loading = this._loading.get(url);
      if (loading) {
        loading.push(observer);
        return;
      }
      this._loading.set(url, [observer]);
      const iframe = document.createElement('IFRAME') as HTMLIFrameElement;
      iframe.allow = '';
      iframe.style.position = 'fixed';
      iframe.style.top = '-10000px';
      iframe.style.left = '-10000px';
      iframe.style.width = '1px';
      iframe.style.height = '1px';
      iframe.onload = () => {
        const element = iframe.contentDocument?.documentElement;
        if (keepInCache && element)
          this._loaded.set(url, element);
        const subscribers = this._loading.get(url);
        this._loading.delete(url);
        subscribers?.forEach(s => {
          if (element)
            s.next(element);
          s.complete();
        });
        iframe.parentElement?.removeChild(iframe);
      };
      iframe.onerror = e => {
        console.error('error loading asset', url);
      };
      iframe.src = url;
      document.documentElement.appendChild(iframe);
    });
  }

}
