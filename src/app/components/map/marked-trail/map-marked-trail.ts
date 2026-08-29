import { Track } from 'src/app/model/track';
import { OsmWayMatchResponse } from 'src/app/utils/track-computed-data/track-computed-data';
import * as L from 'leaflet';
import { Injector } from '@angular/core';
import { OsmcSymbolService } from 'src/app/services/geolocation/osmc-symbol.service';
import { MapElement } from '../map-element';
import { Point } from 'src/app/model/point';
import { OsmWaysTrackPoint } from 'src/app/utils/track-computed-data/match-osm-ways';
import { Arrays } from 'src/app/utils/arrays';
import { TrackPointReference } from 'src/app/utils/track-computed-data/types';
import { EarthPoint } from 'src/app/utils/latlng';
import { Way } from 'src/app/services/map/way';
import { Maps } from 'src/app/utils/maps';

const MIN_DISTANCE_TO_DISPLAY = 100;
const MAX_DISTANCE_TO_MERGE = 75;

export function buildMapMarkedTrails(injector: Injector, baseTrack: Track, osm: OsmWayMatchResponse): MapMarkedTrail[] {
  const sections = buildSections(osm);
  mergeCloseSections(sections, baseTrack);
  removeShortSections(sections, baseTrack);
  return buildMarkedTrails(sections, baseTrack, osm, injector.get(OsmcSymbolService));
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
        if (!route.name && !route.ref) continue;
        const name = route.name ? (route.name + (route.ref ? ' (' + route.ref + ')' : '')) : route.ref!;
        Maps.computeIfAbsent(result, route.symbol, () => new Set()).add(name);
      }
    }
    return result;
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

function buildMarkedTrails(sections: Section[], track: Track, osm: OsmWayMatchResponse, service: OsmcSymbolService): MapMarkedTrail[] {
  const result: MapMarkedTrail[] = [];
  let previousSymbols = new Set<string>();
  for (const section of sections) {
    const newSymbols = new Set(section.symbols);
    const removed = Array.from(previousSymbols).filter(s => !newSymbols.has(s));
    previousSymbols = newSymbols;
    const icon = createIcon(section.symbols, removed, service);
    if (!icon) continue;
    const firstPoint = track.getPoint(section.firstPoint!);
    let rotation = getRotation(firstPoint);
    result.push(new MapMarkedTrail(icon.svg, icon.height, firstPoint.pos, rotation, section.getRoutesNames(osm.waysOnTrack), service));
  }
  return result;
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

  return Math.atan2(dy, dx)/* * 180 / Math.PI*/;
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

export class MapMarkedTrail implements MapElement {

  constructor(
    private readonly svg: string,
    private readonly height: number,
    private readonly pos: EarthPoint,
    private readonly rotation: number,
    private readonly routesNames: Map<string, Set<string>>,
    private readonly symbolService: OsmcSymbolService,
  ) {}

  private _map?: L.Map;
  private _osmc?: L.Marker;

  addTo(map: L.Map): void {
    if (this._map) return;
    this._map = map;
    if (this._osmc === undefined) {
      this._osmc = L.marker(this.pos, {
        icon: L.divIcon({
          html: '<div class="marked-trail">' + this.svg + '</div>',
          iconSize: [24, this.height],
          iconAnchor: [12, this.height / 2],
          className: 'no-background rotate-' + this.rotation,
        }),
        rotation: -this.rotation,
        rotateWithView: true,
      } as any);
      if (this.routesNames.size > 0) {
        const popup = document.createElement('DIV');
        for (const [symbol, names] of this.routesNames) {
          const svg = this.symbolService.generateSvg(symbol);
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
        if (popup.children.length > 0)
          this._osmc.bindPopup(popup, {className: 'marked-trails-popup'});
      }
    }
    this._osmc.addTo(map);
  }

  remove(): void {
    if (!this._map) return;
    this._map = undefined;
    if (this._osmc) {
      this._osmc.remove();
    }
  }

  bringToFront(): void {
    // nothing
  }

  public get bounds(): L.LatLngBounds | undefined {
    return undefined;
  }

  highlighted = false;

}
