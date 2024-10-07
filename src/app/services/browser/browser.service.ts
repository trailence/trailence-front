import { Injectable } from '@angular/core';
import { Platform } from '@ionic/angular/standalone';
import { Subject } from 'rxjs';

@Injectable({providedIn: 'root'})
export class BrowserService {

  private _width: number;
  private _height: number;
  private _resize$ = new Subject<{width: number, height: number}>();

  constructor(
    platform: Platform
  ) {
    platform.resize.subscribe(() => {
      this._width = platform.width();
      this._height = platform.height();
      this._resize$.next({width: this._width, height: this._height});
    });
    this._width = platform.width();
    this._height = platform.height();
  }

  public get width() { return this._width; }
  public get height() { return this._height; }
  public get resize$() { return this._resize$; }

}
