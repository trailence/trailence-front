import * as L from 'leaflet';

const BUBBLE_MAX_PIXELS = 50;
const BUBBLE_MIN_PIXELS = 20;

export class MapBubble {

  private _map?: L.Map;
  private readonly _marker: L.Marker;

  constructor(
    private readonly _center: L.LatLng,
    size: number,
    text: string,
  ) {
    this._marker = L.marker(
      _center,
      {
        icon: L.icon({
          iconUrl: MapBubble.createDataIcon(size, text),
          iconSize: [size, size],
          iconAnchor: [size / 2, size / 2]
        })
      }
    );
    this._marker.on('click', () => {
      if (this._map)
        this._map.setView(_center, this._map.getZoom() + 1);
    });
  }

  public get center(): L.LatLng { return this._center; }

  addTo(map: L.Map): void {
    if (this._map) return;
    this._map = map;
    this._marker.addTo(map);
  }

  remove(): void {
    if (!this._map) return;
    this._marker.removeFrom(this._map);
    this._map = undefined;
  }

  private static createDataIcon(size: number, text: string): string {
    let svg = '<?xml version="1.0" encoding="utf-8"?>';
    svg += '<svg width="' + size + 'px" height="' + size + 'px" viewBox="0 0 ' + size + ' ' + size + '" xmlns="http://www.w3.org/2000/svg">';
    svg += '<circle cx="' + (size / 2) + '" cy="' + (size / 2) + '" r="' + (size / 2) + '" fill="#FF000060" stroke="#FF000080" />';
    svg += '<text x="' + (size / 2) + '" y="' + (size / 2 + 1) + '" dominant-baseline="middle" text-anchor="middle" font-family="Arial" font-size="' + (size > 25 ? 20 : 14) + 'px" font-weight="bold" fill="#000000">' + text + '</text>';
    svg += '</svg>';
    return 'data:image/svg+xml;base64,' + btoa(svg);
  }

  public static build(points: L.LatLng[], zoom: number): MapBubble[] {
    const bubbles: Bubble[] = [];
    const positions: Pos[] = [];
    // sort the points so we are deterministic
    const sortedPoints = [...points].sort(MapBubble.pointsComparator);
    for (const p of sortedPoints) {
      positions.push(new Pos(p, L.CRS.EPSG3857.latLngToPoint(p, zoom)));
    }
    while (positions.length > 0) {
      const pos = positions[0];
      const bubble = {pos, bounds: L.latLngBounds(pos.latLng, pos.latLng), content: [pos]};
      bubbles.push(bubble);
      positions.splice(0, 1);
      do {
        this.addPositionsToBubbleWithoutMovingCenter(bubble, positions);
        const extended =
          this.addPositionsToBubbleBasedOnCurrentBoundsCenter(bubble, positions, zoom) ||
          this.addPositionsToBubbleMovingCenter(bubble, positions, zoom);
        if (!extended) break;
      } while (true);
    }
    return bubbles.map(b => {
      const p1 = L.CRS.EPSG3857.latLngToPoint(b.bounds.getNorthEast(), zoom);
      const p2 = L.CRS.EPSG3857.latLngToPoint(b.bounds.getSouthWest(), zoom);
      const center = L.CRS.EPSG3857.latLngToPoint(b.bounds.getCenter(), zoom);
      const width = Math.floor(Math.abs(p1.x - p2.x)) + 1;
      const height = Math.floor(Math.abs(p1.y - p2.y)) + 1;
      let size = Math.max(BUBBLE_MIN_PIXELS, Math.min(BUBBLE_MAX_PIXELS, Math.max(width, height)));
      if (size < BUBBLE_MAX_PIXELS && b.content.length > 1) {
        // the bounds is a rectangle, but we show a circle, so some points may be outside
        for (const c of b.content) {
          const d = Math.floor(c.pixel.distanceTo(center)) + 1;
          if (size < BUBBLE_MAX_PIXELS && d > size / 2)
            size = Math.min(d * 2, BUBBLE_MAX_PIXELS);
        }
      }
      return new MapBubble(b.bounds.getCenter(), size, '' + b.content.length);
    });
  }

  private static pointsComparator(p1: L.LatLng, p2: L.LatLng): number {
    const d = p1.lat - p2.lat;
    if (d !== 0) return d < 0 ? -1 : 1;
    const d2 = p1.lng - p2.lng;
    if (d2 < 0) return -1;
    if (d2 > 0) return 1;
    return 0;
  }

  private static addPositionsToBubbleWithoutMovingCenter(bubble: Bubble, positions: Pos[]): void {
    for (let i = 0; i < positions.length; ++i) {
      if (this.addToBubbleWithoutMovingCenter(bubble, positions[i])) {
        positions.splice(i, 1);
        i--;
      }
    }
  }

  private static addToBubbleWithoutMovingCenter(bubble: Bubble, pos: Pos): boolean {
    if (pos.pixel.distanceTo(bubble.pos.pixel) < (BUBBLE_MAX_PIXELS / 2 + 1)) {
      bubble.bounds.extend(pos.latLng);
      bubble.content.push(pos);
      return true;
    }
    return false;
  }

  private static addPositionsToBubbleBasedOnCurrentBoundsCenter(bubble: Bubble, positions: Pos[], zoom: number): boolean {
    for (let i = 0; i < positions.length; ++i) {
      if (this.addToBubbleBasedOnCurrentBoundsCenter(bubble, positions[i], zoom)) {
        positions.splice(i, 1);
        return true;
      }
    }
    return false;
  }

  private static addToBubbleBasedOnCurrentBoundsCenter(bubble: Bubble, pos: Pos, zoom: number): boolean {
    const center = L.CRS.EPSG3857.latLngToPoint(bubble.bounds.getCenter(), zoom);
    if (pos.pixel.distanceTo(center) < (BUBBLE_MAX_PIXELS / 2 + 1)) {
      bubble.bounds.extend(pos.latLng);
      bubble.content.push(pos);
      bubble.pos = new Pos(bubble.bounds.getCenter(), L.CRS.EPSG3857.latLngToPoint(bubble.bounds.getCenter(), zoom));
      return true;
    }
    return false;
  }

  private static addPositionsToBubbleMovingCenter(bubble: Bubble, positions: Pos[], zoom: number): boolean {
    for (let i = 0; i < positions.length; ++i) {
      if (this.addToBubble3(bubble, positions[i], zoom)) {
        positions.splice(i, 1);
        return true;
      }
    }
    return false;
  }

  private static addToBubble3(bubble: Bubble, pos: Pos, zoom: number): boolean {
    const newBounds = L.latLngBounds(
      L.latLng(bubble.bounds.getSouth(), bubble.bounds.getWest()),
      L.latLng(bubble.bounds.getNorth(), bubble.bounds.getEast()),
    ).extend(pos.latLng);
    const center = L.CRS.EPSG3857.latLngToPoint(newBounds.getCenter(), zoom);
    if (pos.pixel.distanceTo(center) < (BUBBLE_MAX_PIXELS / 2 + 1)) {
      let ok = true;
      for (const c of bubble.content) {
        if (center.distanceTo(L.CRS.EPSG3857.latLngToPoint(c.latLng, zoom)) >= (BUBBLE_MAX_PIXELS / 2 + 1)) {
          ok = false;
          break;
        }
      }
      if (ok) {
        bubble.bounds = newBounds;
        bubble.content.push(pos);
        bubble.pos = new Pos(newBounds.getCenter(), center);
        return true;
      }
    }
    return false;
  }

}

class Bubble {
  constructor(
    public pos: Pos,
    public bounds: L.LatLngBounds,
    public content: Pos[],
  ) {}
}

class Pos {
  constructor(
    public latLng: L.LatLng,
    public pixel: L.Point,
  ) {}
}
