import { Injectable, Injector } from '@angular/core';
import { MapLayer, MapLayerType } from './layers/map-layer';
import { createWorldLayers } from './layers/world/world-layers';
import { createBelgiumLayers } from './layers/world/belgium';
import { createSpainLayers } from './layers/world/spain';
import { createFinlandLayers } from './layers/world/finland';
import { createFranceLayers } from './layers/world/france';
import { createNorwayLayers } from './layers/world/norway';
import { createSwedenLayers } from './layers/world/sweden';
import { createSwissLayers } from './layers/world/swiss';
import { createUsaLayers } from './layers/world/usa';

const LOCALSTORAGE_KEY_DARKMAP = 'trailence.dark-map';

@Injectable({
  providedIn: 'root'
})
export class MapLayersService {

  private readonly _layers: MapLayer[];
  private readonly _possibleLayers: string[];

  private _darkMap = false;

  constructor(private readonly injector: Injector) {
    this._layers = [];
    this._possibleLayers = [];
    [
      ...createWorldLayers(injector),
      ...createBelgiumLayers(injector),
      ...createSpainLayers(injector),
      ...createFinlandLayers(injector),
      ...createFranceLayers(injector),
      ...createNorwayLayers(injector),
      ...createSwedenLayers(injector),
      ...createSwissLayers(injector),
      ...createUsaLayers(injector),
    ].forEach(l => {
      if (l instanceof MapLayer) {
        this._layers.push(l);
        this._possibleLayers.push(l.name);
      } else {
        this._possibleLayers.push(l.name);
        l.layer$.subscribe(loaded => {
          const index = this._layers.findIndex(e => e.name === l.name);
          if (loaded) {
            if (index >= 0) this._layers.splice(index, 1, loaded);
            else this._layers.push(loaded);
          } else if (index >= 0) {
            this._layers.splice(index, 1);
          }
        });
      }
    });
    const darkmap = localStorage.getItem(LOCALSTORAGE_KEY_DARKMAP);
    if (darkmap) this.toggleDarkMap();
  }

  public getLayer(name: string): MapLayer | undefined {
    return this._layers.find(l => l.name === name);
  }

  public getLayerOrDefault(name: string): MapLayer {
    return this.getLayer(name) ?? this.getDefaultLayer();
  }

  public getDefaultLayer(): MapLayer {
    return this._layers.find(l => l.name === 'osm') ?? this._layers[0];
  }

  public getAllPossibleLayersNames(): string[] {
    return [...this._possibleLayers];
  }

  public getAllLayers(type?: MapLayerType): MapLayer[] {
    if (!type) return [...this._layers];
    return this._layers.filter(l => l.type === type);
  }


  public get darkMapEnabled(): boolean { return this._darkMap; }

  public toggleDarkMap(): void {
    this._darkMap = !this._darkMap;
    if (this._darkMap) {
      localStorage.setItem(LOCALSTORAGE_KEY_DARKMAP, "true");
      globalThis.document.body.classList.add('dark-map');
    } else {
      localStorage.removeItem(LOCALSTORAGE_KEY_DARKMAP);
      globalThis.document.body.classList.remove('dark-map');
    }
    const maps = globalThis.document.getElementsByTagName('app-map');
    for (let i = 0; i < maps.length; ++i) {
      if (this._darkMap) {
        maps.item(i)!.classList.remove('light-theme');
        maps.item(i)!.classList.add('dark-theme');
      } else {
        maps.item(i)!.classList.remove('dark-theme');
        maps.item(i)!.classList.add('light-theme');
      }
    }
    const fullscreen = globalThis.document.getElementsByClassName('map-full-screen');
    for (let i = 0; i < fullscreen.length; ++i) {
      if (this._darkMap) {
        fullscreen.item(i)!.classList.remove('light-theme');
        fullscreen.item(i)!.classList.add('dark-theme');
      } else {
        fullscreen.item(i)!.classList.remove('dark-theme');
        fullscreen.item(i)!.classList.add('light-theme');
      }
    }
  }

  public applyDarkMap(element: HTMLElement): void {
    element.classList.add(this._darkMap ? 'dark-theme' : 'light-theme');
  }

}
