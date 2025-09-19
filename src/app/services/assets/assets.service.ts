import { HttpClient } from '@angular/common/http';
import { Injectable, NgZone } from "@angular/core";
import { addIcons } from 'ionicons';
import { firstValueFrom, Observable, Subscriber } from "rxjs";
import { Console } from 'src/app/utils/console';
import { ICONS } from './icons';
import { environment } from 'src/environments/environment';

const ICONS_VERSION = '2';
const iconsPath = '/icons.' + ICONS_VERSION + '.svg';

@Injectable({
  providedIn: "root"
})
export class AssetsService {

  constructor(private readonly http: HttpClient, private readonly ngZone: NgZone) {
    this.loadIcons();
    const ionIcons: {[key: string]: string} = {};
    for (const iconName of ICONS) ionIcons[iconName] = 'assets/.icon/' + iconName + '.svg';
    addIcons(ionIcons);
    // override fetch to intercept ion icons calls, and use our cache
    const originalFetch: (input: string | URL | globalThis.Request, init?: RequestInit) => Promise<Response> = window.fetch;
    window.fetch = (input, init) => {
      if (typeof input === 'string' && input.startsWith('assets/.icon/') && input.endsWith('.svg')) {
        const iconName = input.substring(13, input.length - 4);
        return firstValueFrom(this.getIcon(iconName, false)).then(svg => {
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

  private _loading: {icon: string, clone: boolean, subscriber: Subscriber<SVGSVGElement>}[] | undefined = [];
  private readonly _icons = new Map<string, SVGSVGElement>();

  private loadIcons(): void {
    const start = Date.now();
    this.ngZone.runOutsideAngular(() => {
      this.http.get(environment.assetsUrl + iconsPath, {responseType: 'text'}).subscribe(text => {
        const el = document.createElement('html');
        el.innerHTML = text;
        const parentEl = el.getElementsByTagName('icons').item(0)!;
        for (let i = 0; i < parentEl.children.length; ++i) {
          const iconChild = parentEl.children.item(i)!;
          if (iconChild.tagName.toLowerCase() !== 'icon') continue;
          const names = iconChild.getAttribute('names')!.split(',');
          const svg = iconChild.children.item(0)! as SVGSVGElement;
          for (const name of names) this._icons.set(name, svg);
        }
        Console.info('Icons loaded (' + (Date.now() - start) + 'ms.)');
        const subscribers = this._loading!;
        this._loading = undefined;
        subscribers.forEach(s => {
          this.getIcon(s.icon, s.clone).subscribe({
            next: svg => {
              s.subscriber.next(svg);
              s.subscriber.complete();
            },
            error: e => s.subscriber.error(e),
          });
        });
      });
    });
  }

  public getIcon(iconName: string, clone: boolean = true): Observable<SVGSVGElement> {
    return new Observable<SVGSVGElement>(observer => {
      if (this._loading !== undefined) {
        this._loading.push({icon: iconName, clone, subscriber: observer});
        return;
      }
      const svg = this._icons.get(iconName);
      if (!svg) {
        observer.error(new Error('Icon not found: ' + iconName));
        return;
      }
      observer.next(clone ? svg.cloneNode(true) as SVGSVGElement : svg);
      observer.complete();
    });
  }


  public loadJson(url: string): Observable<any> {
    return this.http.get(url);
  }

}
