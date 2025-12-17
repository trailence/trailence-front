import { EnvironmentInjector, Injector, ViewContainerRef } from '@angular/core';
import { ComputedWayPoint, Track } from 'src/app/model/track';
import { Trail } from 'src/app/model/trail';
import { AssetsService } from 'src/app/services/assets/assets.service';
import { I18nService } from 'src/app/services/i18n/i18n.service';
import { MapLayer } from 'src/app/services/map/map-layers.service';
import { PreferencesService } from 'src/app/services/preferences/preferences.service';

export interface PageLayout {
  width: number;
  height: number;
  margin: number;
  headerHeight: number;
  headerMargin: number;
  pixelRatio: number;
}

export interface HorizBounds {
  x: number;
  width: number;
  nextPage?: (current: HorizBounds) => HorizBounds;
}

export interface PdfContext {
  doc: any;
  reset: () => void;
  nextPage: () => void,
  layout: PageLayout;
  pages: number;

  trail: Trail;
  track: Track;
  wayPoints: ComputedWayPoint[];
  mapLayer: MapLayer;

  assets: AssetsService;
  i18n: I18nService;
  preferences: PreferencesService;

  injector: Injector;
  environmentInjector: EnvironmentInjector;
}
