import { EnvironmentInjector, Injector } from '@angular/core';
import { ComputedWayPoint, Track } from 'src/app/model/track';
import { Trail } from 'src/app/model/trail';
import { AssetsService } from 'src/app/services/assets/assets.service';
import { TrailInfo } from 'src/app/services/fetch-source/fetch-source.interfaces';
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
  nextPage: (current: HorizBounds) => HorizBounds;
}

export function defaultNextPage(ctx: PdfContext): (current: HorizBounds) => HorizBounds {
  return current => {
    ctx.doc.addPage();
    ctx.doc.y = ctx.layout.headerHeight + ctx.layout.headerMargin;
    return {x: ctx.layout.margin, width: ctx.layout.width - ctx.layout.margin * 2, nextPage: defaultNextPage(ctx)};
  };
}

export interface PdfContext {
  doc: any;
  sandbox: () => any;
  nextPage: () => void,
  layout: PageLayout;
  pages: number;

  trail: Trail;
  track: Track;
  wayPoints: ComputedWayPoint[];
  trailInfo?: TrailInfo;
  trailName: string;
  description?: string;
  avatar?: ArrayBuffer;
  avatarSize?: 'small' | 'large';
  photo?: {photo: ArrayBuffer, width: number, height: number};
  mapLayer: MapLayer;

  assets: AssetsService;
  i18n: I18nService;
  preferences: PreferencesService;

  injector: Injector;
  environmentInjector: EnvironmentInjector;
}
