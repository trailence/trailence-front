import { EnvironmentInjector, Injector } from '@angular/core';
import { Track } from '@trailence/model/track';
import { Trail } from '@trailence/model/trail';
import { AssetsService } from '@trailence/services/assets/assets.service';
import { TrailInfo } from '@trailence/services/fetch-source/fetch-source.interfaces';
import { I18nService } from '@trailence/services/i18n/i18n.service';
import { MapLayer } from '@trailence/services/map/map-layers.service';
import { PreferencesService } from '@trailence/services/preferences/preferences.service';
import { WayPointFromTrack } from '@trailence/utils/track-waypoints/waypoints-from-track';

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
  wayPoints: WayPointFromTrack[];
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
