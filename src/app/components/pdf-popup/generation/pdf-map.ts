import { MapGenerator } from '../../trail-small-map/map-generator';
import { PdfContext } from './pdf-context';
import { MapAnchor } from '../../map/markers/map-anchor';
import { anchorArrivalBorderColor, anchorArrivalFillColor, anchorArrivalTextColor, anchorBorderColor, anchorDABorderColor, anchorDATextColor, anchorDepartureBorderColor, anchorDepartureFillColor, anchorDepartureTextColor, anchorFillColor, anchorTextColor } from '../../map/track/map-track-way-points';
import { addSvgToPdf } from './pdf-icon';
import { Console } from 'src/app/utils/console';
import { ErrorService } from 'src/app/services/progress/error.service';
import * as L from 'leaflet';

export async function generatePdfMap(ctx: PdfContext, x: number, y: number, width: number, height: number, includeWaypoints: boolean) {
  const trackBounds = ctx.track.metadata.bounds;
  if (!trackBounds) return;
  const ratio = 1.3333;
  const mapBounds = MapGenerator.computeMap(trackBounds, width * ratio, height * ratio, 0.01);
  ctx.doc.save();
  ctx.doc.rect(x, y, width, height).clip();
  for (let tileY = mapBounds.topTile; tileY <= mapBounds.bottomTile; tileY++) {
    for (let tileX = mapBounds.leftTile; tileX <= mapBounds.rightTile; tileX++) {
      const url = ctx.mapLayer.templateUrl
        .replace('{z}', '' + mapBounds.zoom)
        .replace('{y}', '' + tileY)
        .replace('{x}', '' + tileX)
        .replace('{s}', 'a');
      try {
        const image = await window.fetch(url).then(r => r.arrayBuffer());
        ctx.doc.image(
          image,
          x + (MapGenerator.tileSize * (tileX - mapBounds.leftTile) + mapBounds.leftDiff) / ratio,
          y + (MapGenerator.tileSize * (tileY - mapBounds.topTile) + mapBounds.topDiff) / ratio,
          { width: MapGenerator.tileSize / ratio, height: MapGenerator.tileSize / ratio }
        );
      } catch (e) {
        Console.error('Error loading tile for PDF', url, e);
        ctx.injector.get(ErrorService).addTechnicalError(e, 'pages.pdf_popup.error_downloading_tile', []);
        break;
      }
    }
  }
  ctx.doc.restore();

  const points = ctx.track.getAllPositions();
  const pathPt = (pos: L.LatLngLiteral): {x: number, y: number} => MapGenerator.getPathPt(pos, mapBounds.zoom, mapBounds.mapLeft, mapBounds.mapTop);

  let lastPoint = pathPt(points[0]);
  ctx.doc.strokeColor('#ff0000');
  ctx.doc.moveTo(x + lastPoint.x / ratio, y + lastPoint.y / ratio);
  const nb = points.length;
  for (let i = 1; i < nb; i++) {
    const p = pathPt(points[i]);
    const dx = p.x - lastPoint.x;
    const dy = p.y - lastPoint.y;
    if (i == nb - 1 || Math.hypot(dx, dy) >= 1) {
      ctx.doc.lineTo(x + p.x / ratio, y + p.y / ratio);
      lastPoint = p;
    }
  }
  ctx.doc.stroke();

  const anchorSize = 20;

  const departure = ctx.wayPoints.find(wp => wp.isDeparture);
  const arrival = ctx.wayPoints.find(wp => wp.isArrival);
  if (departure) {
    const pos = pathPt(departure.wayPoint.point.pos);
    let svg: string;
    if (departure.isArrival || (arrival && L.latLng(departure.wayPoint.point.pos).distanceTo(arrival.wayPoint.point.pos) <= 100)) {
      svg = MapAnchor.createSvg(anchorDABorderColor, ctx.i18n.texts.way_points.DA, anchorDATextColor, anchorDepartureFillColor, anchorArrivalFillColor);
    } else {
      svg = MapAnchor.createSvg(anchorDepartureBorderColor, ctx.i18n.texts.way_points.D, anchorDepartureTextColor, anchorDepartureFillColor, undefined);
    }
    addSvgToPdf(ctx, svg, x + pos.x / ratio - anchorSize / 2, y + pos.y / ratio - anchorSize, anchorSize, anchorSize);
  }
  if (arrival && !arrival.isDeparture && (!departure || L.latLng(departure.wayPoint.point.pos).distanceTo(arrival.wayPoint.point.pos) > 100)) {
    const svg = MapAnchor.createSvg(anchorArrivalBorderColor, ctx.i18n.texts.way_points.A, anchorArrivalTextColor, anchorArrivalFillColor, undefined);
    const pos = pathPt(arrival.wayPoint.point.pos);
    addSvgToPdf(ctx, svg, x + pos.x / ratio - anchorSize / 2, y + pos.y / ratio - anchorSize, anchorSize, anchorSize);
  }
  if (includeWaypoints) {
    for (const wp of ctx.wayPoints) {
      if (wp.isDeparture || wp.isArrival || wp.breakPoint) continue;
      const svg = MapAnchor.createSvg(anchorBorderColor, '' + wp.index, anchorTextColor, anchorFillColor, undefined);
      const pos = pathPt(wp.wayPoint.point.pos);
      addSvgToPdf(ctx, svg, x + pos.x / ratio - anchorSize / 2, y + pos.y / ratio - anchorSize, anchorSize, anchorSize);
    }
  }
}
