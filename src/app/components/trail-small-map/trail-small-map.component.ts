import { Component, ElementRef, Input, OnChanges, SimpleChanges } from '@angular/core';
import { Track } from 'src/app/model/track';
import * as L from 'leaflet';
import { MapGenerator } from './map-generator';

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

    const mapBounds = MapGenerator.computeMap(trackBounds, this.width, this.height);

    for (let y = mapBounds.topTile; y <= mapBounds.bottomTile; y++) {
      for (let x = mapBounds.leftTile; x <= mapBounds.rightTile; x++) {
        const img = document.createElement('IMG') as HTMLImageElement;
        img.width = MapGenerator.tileSize;
        img.height = MapGenerator.tileSize;
        img.src = 'https://tile.openstreetmap.org/' + mapBounds.zoom + '/' + x + '/' + y + '.png';
        img.style.top = (MapGenerator.tileSize * (y - mapBounds.topTile) + mapBounds.topDiff) + 'px';
        img.style.left = (MapGenerator.tileSize * (x - mapBounds.leftTile) + mapBounds.leftDiff) + 'px';
        img.style.position = 'absolute';
        tileContainer.appendChild(img);
      }
    }

    return {zoom: mapBounds.zoom, mapLeft: mapBounds.mapLeft, mapTop: mapBounds.mapTop};
  }


  private createPath(zoom: number, mapLeft: number, mapTop: number): void {
    const points = this.track.getAllPositions();
    const pathPt = (pos: L.LatLng): {x: number, y: number} => MapGenerator.getPathPt(pos, zoom, mapLeft, mapTop);

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
