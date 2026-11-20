import { Observable, of } from 'rxjs';
import { MapRenderer } from '../impl/map-renderer';
import { MAP_MARKED_TRAILS_LAYER, MapElement } from '../map-element';
import { MapPrimitive } from '../primitives/primitive';
import { Injector } from '@angular/core';
import { Track } from '@trailence/model/track';
import { OsmWayMatchResponse } from '@trailence/utils/track-computed-data/track-computed-data';
import { Arrays } from '@trailence/utils/arrays';
import { OsmWaysTrackPoint } from '@trailence/utils/track-computed-data/match-osm-ways';
import { TrackPointReference } from '@trailence/utils/track-computed-data/types';
import { Route, Way } from '@trailence/services/map/way';
import { Maps } from '@trailence/utils/maps';
import { Point } from '@trailence/model/point';
import { OsmcSymbolService } from '@trailence/services/geolocation/osmc-symbol.service';
import { EarthPoint, RAD_TO_DEG } from '@trailence/utils/latlng';
import { IconPrimitive } from '../primitives/icon';

export class MapTrackMarkedTrails extends MapElement<null> {

  constructor(
    id: string,
    private readonly points: MarkedTrailsPoint[],
  ) {
    super(id, {layer: MAP_MARKED_TRAILS_LAYER});
  }

  public override readonly fitBounds$ = of(undefined);

  protected override createPrimitives$(renderer: MapRenderer): Observable<{ primitive: MapPrimitive<any, MapRenderer, any>; eventBinding: undefined; }[]> {
    return of(this.points.map(p => ({
      primitive: this.createPrimitive(p, renderer),
      eventBinding: undefined,
    })));
  }

  private createPrimitive(point: MarkedTrailsPoint, renderer: MapRenderer): IconPrimitive<any, any> {
    let popup: HTMLElement | undefined = undefined;
    if (point.routesNames.size > 0) {
      popup = document.createElement('DIV');
      const service = renderer.getInjector().get(OsmcSymbolService);
      for (const [symbol, names] of point.routesNames) {
        const svg = service.generateSvg(symbol);
        if (!svg) continue;
        for (const name of names) {
          const n = name.trim();
          if (n.length === 0) continue;
          const row = document.createElement('DIV');
          row.style.display = 'flex';
          row.style.flexDirection = 'row';
          row.style.alignItems = 'center';
          if (popup.children.length > 0) row.style.marginTop = '2px';
          const svgContainer = document.createElement('DIV')
          svgContainer.innerHTML = svg;
          svgContainer.style.border = '1px solid rgba(0, 0, 0, 0.33)';
          svgContainer.style.height = '26px';
          row.appendChild(svgContainer);
          const textContainer = document.createElement('DIV');
          textContainer.innerText = n;
          textContainer.style.marginLeft = '3px';
          row.appendChild(textContainer);
          popup.appendChild(row);
        }
      }
      if (popup.children.length === 0) popup = undefined;
    }

    return renderer.createIcon(
      this.id + '$' + point.position.lat + '$' + point.position.lng,
      point.position,
      {
        icon: {htmlString: '<div class="marked-trail">' + point.svg + '</div>'},
        iconSize: {x: 24, y: point.svgHeight},
        iconAnchor: 'center',
        className: 'no-background',
        rotationWithMapDeg: -point.rotation,
        popup: popup ? {content: popup, className: 'marked-trails-popup'} : undefined,
      }
    );
  }

}

interface MarkedTrailsPoint {
  svg: string;
  svgHeight: number;
  position: EarthPoint;
  rotation: number;
  routesNames: Map<string, Set<string>>;
}

const MIN_DISTANCE_TO_DISPLAY = 100;
const MAX_DISTANCE_TO_MERGE = 75;

export function buildMapMarkedTrails(injector: Injector, baseTrack: Track, osm: OsmWayMatchResponse): MapTrackMarkedTrails | undefined {
  const sections = buildSections(osm);
  mergeCloseSections(sections, baseTrack);
  removeShortSections(sections, baseTrack);
  const points = buildMarkedTrails(sections, baseTrack, osm, injector.get(OsmcSymbolService));
  if (points.length === 0) return undefined;
  return new MapTrackMarkedTrails(
    'track$' + baseTrack.owner + '$' + baseTrack.uuid + '$markedTrails',
    points,
  );
}

function buildMarkedTrails(sections: Section[], track: Track, osm: OsmWayMatchResponse, service: OsmcSymbolService): MarkedTrailsPoint[] {
  const result: MarkedTrailsPoint[] = [];
  let previousSymbols = new Set<string>();
  for (const section of sections) {
    const newSymbols = new Set(section.symbols);
    const removed = Array.from(previousSymbols).filter(s => !newSymbols.has(s));
    previousSymbols = newSymbols;
    const icon = createIcon(section.symbols, removed, service);
    if (!icon) continue;
    const firstPoint = track.getPoint(section.firstPoint!);
    let rotation = getRotation(firstPoint);
    result.push({
      svg: icon.svg,
      svgHeight: icon.height,
      position: firstPoint.pos,
      rotation,
      routesNames: section.getRoutesNames(osm.waysOnTrack),
    });
  }
  return result;
}


function buildSections(osm: OsmWayMatchResponse): Section[] {
  let sections: Section[] = [];
  let section: Section | undefined = undefined;
  for (const segment of osm.osmTrackPoints) {
    for (const point of segment) {
      const symbols = getSymbols(osm, point);
      if (section === undefined) {
        if (symbols.length > 0) {
          section = new Section(symbols, point);
        }
        continue;
      }
      if (Arrays.equals(symbols, section.symbols)) {
        section.addOsmPoint(point);
      } else {
        sections.push(section);
        section = new Section(symbols, point);
      }
    }
  }
  if (section !== undefined) sections.push(section);
  return sections.filter(s => s.firstPoint !== undefined);
}

class Section {

  constructor(
    public readonly symbols: string[],
    startPoint: OsmWaysTrackPoint,
  ) {
    this.osmPoints = [startPoint];
    this._firstPoint = startPoint.originalTrackPoint;
    this._lastPoint = this._firstPoint;
  }

  private readonly osmPoints: OsmWaysTrackPoint[];
  private _firstPoint: TrackPointReference | undefined;
  private _lastPoint: TrackPointReference | undefined;

  get firstPoint(): TrackPointReference | undefined { return this._firstPoint; }
  get lastPoint(): TrackPointReference | undefined { return this._lastPoint; }

  addOsmPoint(point: OsmWaysTrackPoint): void {
    this.osmPoints.push(point);
    if (point.originalTrackPoint) {
      this._lastPoint = point.originalTrackPoint;
      this._firstPoint ??= point.originalTrackPoint;
    }
  }

  merge(section: Section): void {
    this.osmPoints.push(...section.osmPoints);
    this._lastPoint = section._lastPoint;
  }

  getRoutesNames(ways: Map<string, Way>): Map<string, Set<string>> {
    const result = new Map<string, Set<string>>();
    for (const p of this.osmPoints) {
      if (!p.osm) continue;
      const way = ways.get(p.osm?.wayId);
      if (!way) continue;
      for (const route of way.routes) {
        if (!route.symbol) continue;
        const name = this.getRouteName(route);
        if (name) Maps.computeIfAbsent(result, route.symbol, () => new Set()).add(name);
      }
    }
    return result;
  }

  getRouteName(route: Route): string | undefined {
    if (route.name) {
      if (route.ref) return route.name + ' (' + route.ref + ')';
      return route.name;
    }
    if (route.ref) return route.ref;
    return undefined;
  }

}

function mergeCloseSections(sections: Section[], track: Track): void {
  for (let i = 0; i < sections.length; ++i) {
    for (let j = i + 2; j < sections.length; ++j) {
      if (!Arrays.equals(sections[i].symbols, sections[j].symbols)) continue;
      if (distanceBetween(sections[j].firstPoint!, sections[i].lastPoint!, track) <= MAX_DISTANCE_TO_MERGE) {
        for (let k = i + 1; k <= j; ++k) sections[i].merge(sections[k]);
        sections.splice(i + 1, j - i);
        i--;
      }
      break;
    }
  }
}

function removeShortSections(sections: Section[], track: Track): void {
  for (let i = 0; i < sections.length; ++i) {
    if (distanceBetween(sections[i].lastPoint!, sections[i].firstPoint!, track) < MIN_DISTANCE_TO_DISPLAY) {
      sections.splice(i, 1);
      i--;
    }
  }
}

function distanceBetween(p1: TrackPointReference, p2: TrackPointReference, track: Track): number {
  let distance = 0;
  let startPointIndex;
  if (p1.segmentIndex > p2.segmentIndex) {
    let p: Point | undefined = track.getPoint(p1);
    while (p) {
      distance += p.distanceFromPreviousPoint;
      p = p.previousPoint;
    }
    for (let s = p1.segmentIndex - 1; s > p2.segmentIndex; --s)
      distance += track.segments[s].metadata.distance;
    startPointIndex = track.segments[p2.segmentIndex].points.length - 1;
  } else {
    startPointIndex = p1.pointIndex;
  }
  let p: Point | undefined = track.getPoint({segmentIndex: p2.segmentIndex, pointIndex: startPointIndex});
  for (let i = startPointIndex; i > p2.pointIndex && p; --i) {
    distance += p.distanceFromPreviousPoint;
    p = p.previousPoint;
  }
  return distance;
}


function getRotation(point: Point): number {
  let p1 = point;
  let p2 = point;
  let d = 0;
  while (d < 25) {
    if (!p2.nextPoint) break;
    p2 = p2.nextPoint;
    d += p2.distanceFromPreviousPoint;
  }
  if (d < 25) {
    while (d < 25) {
      if (!p1.previousPoint) break;
      d += p1.distanceFromPreviousPoint;
      p1 = p1.previousPoint;
    }
  }
  if (d === 0) return 0;
  const meanLat = ((p1.pos.lat + p2.pos.lat) / 2) * Math.PI / 180;

  const dx = (p2.pos.lng - p1.pos.lng) * Math.cos(meanLat);
  const dy = p2.pos.lat - p1.pos.lat;

  return Math.atan2(dy, dx) * RAD_TO_DEG;
}

function getSymbols(osm: OsmWayMatchResponse, point: OsmWaysTrackPoint): string[] {
  if (!point.osm) return [];
  const way = osm.waysOnTrack.get(point.osm.wayId);
  if (!way) return [];
  const set = new Set<string>(way.routes.map(r => r.symbol).filter(s => s !== undefined));
  if (set.size === 0) return [];
  return Array.from(set).sort(); // NOSONAR
}

function createIcon(added: string[], removed: string[], service: OsmcSymbolService): {svg: string, height: number} | undefined {
  if (added.length === 1 && removed.length === 0) {
    const content = service.generateSvg(added[0]);
    if (!content) return undefined;
    return {svg: content, height: 24};
  }
  const addedSvg = added.map(s => ({osmc: s, icon: service.generateSvgContent(s, 0, 23, 0, 23)})).filter(s => s.icon !== undefined);
  const removedSvg = removed.map(s => ({osmc: s, icon: service.generateSvgContent(s, 0, 23, 0, 23)})).filter(s => s.icon !== undefined);
  if (addedSvg.length === 0 && removedSvg.length === 0) return undefined;
  const gap = 2;
  const nbIcons = addedSvg.length + removedSvg.length;
  const totalHeight = nbIcons * 24 + (nbIcons - 1) * gap;
  let svg = '<svg width="24px" height="' + totalHeight + 'px" viewBox="0 0 24 ' + totalHeight + '" fill="none" xmlns="http://www.w3.org/2000/svg">';
  let y = 0;
  for (const element of addedSvg) {
    svg += '<g osmc="' + element.osmc + '"';
    if (y > 0) svg += ' transform="translate(0 ' + y + ')"';
    svg += '>' + element.icon + '</g>';
    y += 24 + gap;
  }
  for (const element of removedSvg) {
    svg += '<g osmc="' + element.osmc + '"';
    if (y > 0) svg += ' transform="translate(0 ' + y + ')"';
    svg += '>' + element.icon;
    svg += '<line x1="1" x2="23" y1="1" y2="23" stroke="#000000A0" stroke-width="1.5"/>';
    svg += '<line x1="1" x2="23" y1="23" y2="1" stroke="#000000A0" stroke-width="1.5"/>';
    svg += '</g>';
    y += 24 + gap;
  }
  svg += '</svg>';
  return {svg, height: y - gap};
}
