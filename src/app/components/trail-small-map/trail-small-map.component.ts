import { Component, ElementRef, Input, OnChanges, SimpleChanges } from '@angular/core';
import { Track } from 'src/app/model/track';
import * as L from 'leaflet';

@Component({
  selector: 'app-trail-small-map',
  template: ``,
  imports: []
})
export class TrailSmallMapComponent implements OnChanges {

  @Input() track!: Track;
  @Input() width!: number;
  @Input() height!: number;

  constructor(
    private readonly element: ElementRef,
  ) {}

  ngOnChanges(changes: SimpleChanges): void {
    this.reset();
  }

  private reset(): void {
    while (this.element.nativeElement.children.length > 1) this.element.nativeElement.children.item(0).remove();
    const trackBounds = this.track.metadata.bounds;
    if (!trackBounds) return;
    const map = this.createMap(trackBounds);
    this.createPath(map.zoom, map.mapLeft, map.mapTop);
  }

  private createMap(trackBounds: L.LatLngBounds): {zoom: number, mapLeft: number, mapTop: number} {
    const tileContainer = document.createElement('DIV');
    tileContainer.className = 'map-tile-layer';
    this.element.nativeElement.appendChild(tileContainer);

    const mapBounds = this.computeMapBounds(trackBounds);
    const bounds = mapBounds.bounds;
    const pathYMiddle = (bounds.y1 + (bounds.y2 - bounds.y1) / 2) * tileSize;
    const mapTop = pathYMiddle - this.height/2;
    const topTile = Math.floor(mapTop / tileSize);
    const topDiff = (topTile * tileSize) - mapTop;

    const pathXMiddle = (bounds.x1 + (bounds.x2 - bounds.x1) / 2) * tileSize;
    const mapLeft = pathXMiddle - this.width/2;
    const leftTile = Math.floor(mapLeft / tileSize);
    const leftDiff = (leftTile * tileSize) - mapLeft;

    const mapBottom = pathYMiddle + this.height/2;
    const bottomTile = Math.floor(mapBottom / tileSize);

    const mapRight = pathXMiddle + this.width/2;
    const rightTile = Math.floor(mapRight / tileSize);

    for (let y = topTile; y <= bottomTile; y++) {
      for (let x = leftTile; x <= rightTile; x++) {
        const img = document.createElement('IMG') as HTMLImageElement;
        img.width = tileSize;
        img.height = tileSize;
        img.src = 'https://tile.openstreetmap.org/' + mapBounds.zoom + '/' + x + '/' + y + '.png';
        img.style.top = (tileSize * (y - topTile) + topDiff) + 'px';
        img.style.left = (tileSize * (x - leftTile) + leftDiff) + 'px';
        img.style.position = 'absolute';
        tileContainer.appendChild(img);
      }
    }

    return {zoom: mapBounds.zoom, mapLeft, mapTop};
  }

  private computeMapBounds(trackBounds: L.LatLngBounds): {zoom: number, bounds: Bounds} {
    let zoom = 5;
    let bounds = convertBounds(trackBounds.getNorth(), trackBounds.getWest(), trackBounds.getSouth(), trackBounds.getEast(), zoom);
    const maxPathWidth = this.width - (this.width * margin * 2);
    const maxPathHeight = this.height - (this.height * margin * 2);
    while (zoom < 17 && (bounds.x2 - bounds.x1) * tileSize < maxPathWidth && (bounds.y2 - bounds.y1) * tileSize < maxPathHeight) {
      zoom++;
      const newBounds = convertBounds(trackBounds.getNorth(), trackBounds.getWest(), trackBounds.getSouth(), trackBounds.getEast(), zoom);
      if ((newBounds.x2 - newBounds.x1) * tileSize > maxPathWidth || (newBounds.y2 - newBounds.y1) * tileSize > maxPathHeight) {
        zoom--;
        break;
      }
      bounds = newBounds;
    }
    return {zoom, bounds};
  }

  private createPath(zoom: number, mapLeft: number, mapTop: number): void {
    const points = this.track.getAllPositions();
    const pathPt = (pos: L.LatLng): {x: number, y: number} => ({x: (lon2pt(pos.lng, zoom) * tileSize) - mapLeft, y: (lat2pt(pos.lat, zoom) * tileSize) - mapTop});

    let lastPoint = pathPt(points[0]);
    let svgPath = 'M' + lastPoint.x + ' ' + lastPoint.y;
    const nb = points.length;
    for (let i = 1; i < nb; i++) {
      const p = pathPt(points[i]);
      const dx = p.x - lastPoint.x;
      const dy = p.y - lastPoint.y;
      if (i == nb - 1 || Math.hypot(dx, dy) >= 1) {
        svgPath += ' L' + p.x + ' ' + p.y;
        lastPoint = p;
      }
    }
    const svg = document.createElementNS("http://www.w3.org/2000/svg", "svg");
    svg.setAttribute('xmlns', 'http://www.w3.org/2000/svg');
    svg.setAttribute('viewBox', '0 0 ' + this.width + ' ' + this.height);
    svg.innerHTML = '<path d="' + svgPath + '" stroke="red" stroke-width="3" fill="none"/>';

    const pathLayer = document.createElement('DIV');
    pathLayer.className = 'map-path-layer';
    pathLayer.appendChild(svg);
    this.element.nativeElement.appendChild(pathLayer);
  }

}

const tileSize = 256;
const margin = 0.025;

function lon2pt(lon: number, zoom: number) { return (lon+180)/360*Math.pow(2,zoom); }
function lat2pt(lat: number, zoom: number)  { return (1-Math.log(Math.tan(lat*Math.PI/180) + 1/Math.cos(lat*Math.PI/180))/Math.PI)/2 *Math.pow(2,zoom); }

interface Bounds {
  x1: number;
  y1: number;
  x2: number;
  y2: number;
}

function convertBounds(north: number, west: number, south: number, east: number, zoom: number): Bounds {
  const x1 = lon2pt(west, zoom);
  const x2 = lon2pt(east, zoom);
  const y1 = lat2pt(north, zoom);
  const y2 = lat2pt(south, zoom);
  return {
    x1: Math.min(x1, x2),
    y1: Math.min(y1, y2),
    x2: Math.max(x1, x2),
    y2: Math.max(y1, y2)
  };
}
