import { Injectable } from '@angular/core';
import { BehaviorSubject, debounceTime, Subject } from 'rxjs';
import { Console } from 'src/app/utils/console';
import { Platform } from '@ionic/angular/common';

@Injectable({providedIn: 'root'})
export class BrowserService {

  private _width: number;
  private _height: number;
  private readonly _resize$ = new Subject<{width: number, height: number}>();
  private readonly _size$: BehaviorSubject<{width: number, height: number}>;

  constructor(
    platform: Platform,
  ) {
    Console.info('platform: ' + platform.platforms().join(','));
    platform.resize.pipe(debounceTime(25)).subscribe(() => {
      this._width = platform.width();
      this._height = platform.height();
      Console.info('Screen resize', this._width, this._height);
      const newSize = {width: this._width, height: this._height};
      this._resize$.next(newSize);
      this._size$.next(newSize);
    });
    this._width = platform.width();
    this._height = platform.height();
    this._size$ = new BehaviorSubject<{width: number, height: number}>({width: this._width, height: this._height});
  }

  public get width() { return this._width; }
  public get height() { return this._height; }
  public get resize$() { return this._resize$; }
  public get size$() { return this._size$; }

}
