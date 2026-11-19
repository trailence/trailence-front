import { GraphPointReference } from '../trail-graph/graph-events';
import { TrailGraphComponent } from '../trail-graph/trail-graph.component';
import { PointReference } from '@trailence/model/point-reference';
import { EarthPoint } from '@trailence/utils/latlng';
import { MapCursors } from '../map/elements/map-cursors';
import { MAP_GEOLOCATION_LAYER } from '../map/map-element';

export class TrailHoverCursor {

  constructor(
    private readonly getGraph: () => TrailGraphComponent | undefined,
  ) {}

  private _hoverCursor: {pos: EarthPoint}[] = [];

  public mapCursors = new MapCursors('hover-cursors');

  private resetHover(): void {
    this.mapCursors.removeAll();
    this._hoverCursor = [];
  }

  mouseOverPointOnMap(event?: PointReference) {
    this.resetHover();
    this.getGraph()?.hideCursor();
    if (event) {
      const pos = event.point.pos;
      if (pos) {
        this.mapCursors.addCursor(pos);
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
      this.mapCursors.addCursor(pos);
    };
  }

  pointSelected(point: PointReference) {
    this.resetHover();
    this.mapCursors.addCursor(point.point.pos);
    this._hoverCursor.push({pos: point.point.pos});
    this.getGraph()?.showCursorForPosition(point.point.pos.lat, point.point.pos.lng);
  }

}
