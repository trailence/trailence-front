import { Injectable, NgZone } from '@angular/core';
import { Platform } from '@ionic/angular/standalone';
import { BehaviorSubject, Subject } from 'rxjs';
import { Console } from 'src/app/utils/console';

@Injectable({providedIn: 'root'})
export class BrowserService {

  private _width: number;
  private _height: number;
  private readonly _resize$ = new Subject<{width: number, height: number}>();
  private readonly _hash$ = new BehaviorSubject<Map<string,string>>(new Map<string, string>());

  constructor(
    platform: Platform,
    ngZone: NgZone,
  ) {
    Console.info('platform: ' + platform.platforms().join(','));
    platform.resize.subscribe(() => {
      this._width = platform.width();
      this._height = platform.height();
      this._resize$.next({width: this._width, height: this._height});
    });
    this._width = platform.width();
    this._height = platform.height();
    this._hash$.next(this.decodeHash(window.location.hash));
    ngZone.runOutsideAngular(() => {
      window.addEventListener('hashchange', () => {
        this._hash$.next(this.decodeHash(window.location.hash));
      });
    });
  }

  public get width() { return this._width; }
  public get height() { return this._height; }
  public get resize$() { return this._resize$; }
  public get hash$() { return this._hash$; }

  public setHash(name: string, value: string): void {
    const map = this.decodeHash(window.location.hash);
    if (map.get(name) === value) return;
    map.set(name, value);
    window.location.hash = this.encodeHash(map);
  }

  public setHashes(...nameValuePairs: string[]): void {
    const map = this.decodeHash(window.location.hash);
    let changed = false;
    for (let i = 0; i < nameValuePairs.length; i += 2) {
      const name = nameValuePairs[i];
      const value = i < nameValuePairs.length - 1 ? nameValuePairs[i + 1] : '';
      if (map.get(name) === value) continue;
      map.set(name, value);
      changed = true;
    }
    if (changed)
      window.location.hash = this.encodeHash(map);
  }

  public deleteHash(name: string): void {
    const map = this.decodeHash(window.location.hash);
    map.delete(name);
    window.location.hash = this.encodeHash(map);
  }

  public decodeHash(hash: string): Map<string, string> {
    if (hash.startsWith('#')) hash = hash.substring(1);
    const pairs = hash.split('&').filter(p => p.length > 0);
    const map = new Map<string,string>();
    for (const pair of pairs) {
      const i = pair.indexOf('=');
      if (i < 0) {
        map.set(pair, '');
      } else {
        map.set(decodeURIComponent(pair.substring(0,i)), decodeURIComponent(pair.substring(i + 1)));
      }
    }
    return map;
  }

  public encodeHash(map: Map<string, string>): string {
    let hash = '#';
    let first = true;
    for (const entry of map.entries()) {
      if (first) {
        first = false;
      } else {
        hash += '&';
      }
      if (entry[1].length === 0) {
        hash += encodeURIComponent(entry[0]);
      } else {
        hash += encodeURIComponent(entry[0]) + '=' + encodeURIComponent(entry[1]);
      }
    }
    return hash;
  }

}
