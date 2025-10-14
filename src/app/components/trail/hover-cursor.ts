import { GraphPointReference } from '../trail-graph/graph-events';
import { TrailGraphComponent } from '../trail-graph/trail-graph.component';
import { MapComponent } from '../map/map.component';
import { MapTrackPointReference } from '../map/track/map-track-point-reference';
import { PointReference } from 'src/app/model/point-reference';

export class TrailHoverCursor {

  constructor(
    private readonly getMap: () => MapComponent | undefined,
    private readonly getGraph: () => TrailGraphComponent | undefined,
  ) {}

  private _hoverCursor: {pos: L.LatLngExpression}[] = [];

  private resetHover(): void {
    const map = this.getMap();
    if (map)
      for (const cursor of this._hoverCursor)
        map.cursors.removeCursor(cursor.pos);
    this._hoverCursor = [];
  }

  mouseOverPointOnMap(event?: MapTrackPointReference) {
    this.resetHover();
    this.getGraph()?.hideCursor();
    if (event) {
      const pos = event.position;
      if (pos) {
        this.getMap()?.cursors.addCursor(pos);
        this.getGraph()?.showCursorForPosition(pos.lat, pos.lng);
        this._hoverCursor.push({pos});
      }
    }
  }

  graphPointHover(references: GraphPointReference[]) {
    this.resetHover();
    for (const pt of references) {
      const pos = pt.pos;
      this._hoverCursor.push({pos});
      this.getMap()?.cursors.addCursor(pos);
    };
  }

  pointSelected(point: PointReference) {
    this.resetHover();
    this.getMap()?.cursors.addCursor(point.point.pos);
    this._hoverCursor.push({pos: point.point.pos});
    this.getGraph()?.showCursorForPosition(point.point.pos.lat, point.point.pos.lng);
  }

}
