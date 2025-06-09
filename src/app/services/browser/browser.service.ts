import { Injectable } from '@angular/core';
import { Platform } from '@ionic/angular/standalone';
import { debounceTime, Subject } from 'rxjs';
import { Console } from 'src/app/utils/console';

@Injectable({providedIn: 'root'})
export class BrowserService {

  private _width: number;
  private _height: number;
  private readonly _resize$ = new Subject<{width: number, height: number}>();

  constructor(
    platform: Platform,
  ) {
    Console.info('platform: ' + platform.platforms().join(','));
    platform.resize.pipe(debounceTime(25)).subscribe(() => {
      this._width = platform.width();
      this._height = platform.height();
      Console.info('Screen resize', this._width, this._height);
      this._resize$.next({width: this._width, height: this._height});
    });
    this._width = platform.width();
    this._height = platform.height();
  }

  public get width() { return this._width; }
  public get height() { return this._height; }
  public get resize$() { return this._resize$; }

}
