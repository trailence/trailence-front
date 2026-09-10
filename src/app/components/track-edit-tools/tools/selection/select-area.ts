import { Point2D } from '@trailence/utils/geometry-utils';
import { TrackEditTool, TrackEditToolContext } from '../tool.interface';
import * as L from 'leaflet';
import { PointReference, RangeReference } from '@trailence/model/point-reference';

export class SelectAreaTool implements TrackEditTool {

  readonly icon = 'selection-add';
  labelKey(ctx: TrackEditToolContext) { return 'selection.rectangle'; }

  isAvailable(ctx: TrackEditToolContext): boolean {
    return true;
  }

  execute(ctx: TrackEditToolContext) {
    const track = ctx.currentTrack$.value;
    if (!track) return;
    ctx.selection.cancelSelection();
    ctx.startInteractiveTool(
      () => [],
    ).then(iCtx => {
      const mapElement = document.getElementById(iCtx.map.id) as HTMLDivElement;
      const overlay = document.createElement('DIV');
      overlay.style.position = 'absolute';
      overlay.style.left = '0';
      overlay.style.right = '0';
      overlay.style.top = '0';
      overlay.style.bottom = '0';
      overlay.style.zIndex = '10000';
      overlay.style.cursor = 'crosshair';
      mapElement.appendChild(overlay);
      const rect = document.createElement('DIV');
      rect.style.border = '1px dashed #808080';
      rect.style.background = '#80808080';
      rect.style.position = 'absolute';
      rect.style.display = 'none';
      overlay.appendChild(rect);
      let startPoint: Point2D | undefined;
      let startPointAbsolute: Point2D | undefined;
      let endPoint: Point2D | undefined;
      let bounds: L.Bounds | undefined;
      const updateBounds = () => {
        bounds = L.bounds(L.point({x: Math.min(startPoint!.x, endPoint!.x), y: Math.min(startPoint!.y, endPoint!.y)}), L.point({x: Math.max(startPoint!.x, endPoint!.x), y: Math.max(startPoint!.y, endPoint!.y)}));
        const topLeft = iCtx.map.getMap()!.containerPointToLatLng(bounds.getTopLeft());
        const bottomRight = iCtx.map.getMap()!.containerPointToLatLng(bounds.getBottomRight())
        const mapBounds = L.latLngBounds(topLeft, bottomRight);
        let currentSection: {start: PointReference, end: PointReference, nbPoints: number} | undefined;
        let bestSection: {start: PointReference, end: PointReference, nbPoints: number} | undefined;
        for (let iSegment = 0; iSegment < track.segments.length; ++iSegment) {
          const segment = track.segments[iSegment];
          const points = segment.points;
          for (let iPoint = 0; iPoint < points.length; ++iPoint) {
            const point = points[iPoint];
            if (mapBounds.contains(point.pos)) {
              if (currentSection) {
                currentSection.end = new PointReference(track, iSegment, iPoint);
                currentSection.nbPoints++;
              } else {
                const ref = new PointReference(track, iSegment, iPoint);
                currentSection = {start: ref, end: ref, nbPoints: 1};
              }
            } else {
              if (currentSection && (!bestSection || currentSection.nbPoints > bestSection.nbPoints)) {
                bestSection = currentSection;
              }
              currentSection = undefined;
            }
          }
        }
        if (currentSection && (!bestSection || currentSection.nbPoints > bestSection.nbPoints)) {
          bestSection = currentSection;
        }
        ctx.selection.cancelSelection();
        if (bestSection) {
          ctx.selection.addRange(new RangeReference(bestSection.start, bestSection.end));
        }
      };
      overlay.addEventListener('mousedown', ev => {
        ev.preventDefault();
        ev.stopPropagation();
        startPoint = {x: ev.offsetX, y: ev.offsetY};
        startPointAbsolute = {x: ev.pageX, y: ev.pageY};
      });
      overlay.addEventListener('mouseup', ev => {
        ev.preventDefault();
        ev.stopPropagation();
        overlay.remove();
        iCtx.close();
      });
      overlay.addEventListener('mousemove', ev => {
        if (!startPoint) return;
        endPoint = {x: ev.pageX - (startPointAbsolute!.x - startPoint!.x), y: ev.pageY - (startPointAbsolute!.y - startPoint!.y)};
        updateBounds();
        const topLeft = bounds!.getTopLeft();
        const size = bounds!.getSize();
        rect.style.top = topLeft.y + 'px';
        rect.style.left = topLeft.x + 'px';
        rect.style.width = size.x + 'px';
        rect.style.height = size.y + 'px';
        rect.style.display = 'block';
      });
    });
  }

}
