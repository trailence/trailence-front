import { ElevationGraphPointReference } from '../elevation-graph/elevation-graph-events';
import { ElevationGraphComponent } from '../elevation-graph/elevation-graph.component';
import { MapComponent } from '../map/map.component';
import { MapTrackPointReference } from '../map/track/map-track-point-reference';

export class TrailHoverCursor {

  constructor(
    private readonly getMap: () => MapComponent | undefined,
    private readonly getElevationGraph: () => ElevationGraphComponent | undefined,
  ) {}

  private _hoverCursor: {pos: L.LatLngExpression}[] = [];

  private resetHover(): void {
    this._hoverCursor.forEach(cursor => {
      this.getMap()?.cursors.removeCursor(cursor.pos);
    });
    this._hoverCursor = [];
  }

  mouseOverPointOnMap(event?: MapTrackPointReference) {
    this.resetHover();
    this.getElevationGraph()?.hideCursor();
    if (event) {
      const pos = event.position;
      if (pos) {
        this.getMap()?.cursors.addCursor(pos);
        this.getElevationGraph()?.showCursorForPosition(pos.lat, pos.lng);
        this._hoverCursor.push({pos});
      }
    }
  }

  elevationGraphPointHover(references: ElevationGraphPointReference[]) {
    this.resetHover();
    references.forEach(pt => {
      const pos = pt.pos;
      this._hoverCursor.push({pos});
      this.getMap()?.cursors.addCursor(pos);
    });
  }

}
