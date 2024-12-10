import { ElevationGraphPointReference } from '../elevation-graph/elevation-graph-events';
import { MapTrackPointReference } from '../map/track/map-track-point-reference';
import { TrailComponent } from './trail.component';

export class TrailHoverCursor {

  constructor(
    private readonly component: TrailComponent,
  ) {}

  private _hoverCursor: {pos: L.LatLngExpression}[] = [];

  private resetHover(): void {
    this._hoverCursor.forEach(cursor => {
      this.component.map?.cursors.removeCursor(cursor.pos);
    });
    this._hoverCursor = [];
  }

  mouseOverPointOnMap(event?: MapTrackPointReference) {
    this.resetHover();
    this.component.elevationGraph?.hideCursor();
    if (event) {
      const pos = event.position;
      if (pos) {
        this.component.map?.cursors.addCursor(pos);
        this.component.elevationGraph?.showCursorForPosition(pos.lat, pos.lng);
        this._hoverCursor.push({pos});
      }
    }
  }

  elevationGraphPointHover(references: ElevationGraphPointReference[]) {
    this.resetHover();
    references.forEach(pt => {
      const pos = pt.pos;
      this._hoverCursor.push({pos});
      this.component.map?.cursors.addCursor(pos);
    });
  }

}
