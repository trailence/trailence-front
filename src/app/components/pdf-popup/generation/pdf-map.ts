import { MapBounds, MapGenerator } from '../../trail-small-map/map-generator';
import { PdfContext } from './pdf-context';
import { MapAnchor } from '../../map/markers/map-anchor';
import { anchorArrivalBorderColor, anchorArrivalFillColor, anchorArrivalTextColor, anchorBorderColor, anchorDABorderColor, anchorDATextColor, anchorDepartureBorderColor, anchorDepartureFillColor, anchorDepartureTextColor, anchorFillColor, anchorTextColor } from '../../map/track/map-track-way-points';
import { addSvgToPdf } from './pdf-icon';
import { ErrorService } from '@trailence/services/progress/error.service';
import * as L from 'leaflet';
import { getLogger } from '@trailence/utils/console';
import { Point2D } from '@trailence/utils/geometry-utils';

const logger = getLogger('pdf-map');

const RATIO = 1.3333;
const ANCHOR_SIZE = 20;

export async function generatePdfMap(ctx: PdfContext, x: number, y: number, width: number, height: number, includeWaypoints: boolean) {
  const trackBounds = ctx.track.metadata.bounds;
  if (!trackBounds) return;
  const mapBounds = MapGenerator.computeMap(trackBounds, width * RATIO, height * RATIO, 0.01);
  await drawTiles(ctx, x, y, width, height, mapBounds);

  const pathPt = (pos: L.LatLngLiteral): Point2D => MapGenerator.getPathPt(pos, mapBounds.zoom, mapBounds.mapLeft, mapBounds.mapTop);

  drawTrack(ctx, pathPt, x, y);

  const departure = ctx.wayPoints.find(wp => wp.isDeparture);
  const arrival = ctx.wayPoints.find(wp => wp.isArrival);
  if (departure) {
    const pos = pathPt(departure.wayPoint.point.pos);
    let svg: string;
    if (departure.isArrival || (arrival && L.latLng(departure.wayPoint.point.pos).distanceTo(arrival.wayPoint.point.pos) <= 100)) {
      svg = MapAnchor.createSvg(anchorDABorderColor, ctx.i18n.texts.way_points.DA, anchorDATextColor, anchorDepartureFillColor, anchorArrivalFillColor);
    } else {
      svg = MapAnchor.createSvg(anchorDepartureBorderColor, ctx.i18n.texts.way_points.D, anchorDepartureTextColor, anchorDepartureFillColor);
    }
    addSvgToPdf(ctx, svg, x + pos.x / RATIO - ANCHOR_SIZE / 2, y + pos.y / RATIO - ANCHOR_SIZE, ANCHOR_SIZE, ANCHOR_SIZE);
  }
  if (arrival && !arrival.isDeparture && (!departure || L.latLng(departure.wayPoint.point.pos).distanceTo(arrival.wayPoint.point.pos) > 100)) {
    const svg = MapAnchor.createSvg(anchorArrivalBorderColor, ctx.i18n.texts.way_points.A, anchorArrivalTextColor, anchorArrivalFillColor);
    const pos = pathPt(arrival.wayPoint.point.pos);
    addSvgToPdf(ctx, svg, x + pos.x / RATIO - ANCHOR_SIZE / 2, y + pos.y / RATIO - ANCHOR_SIZE, ANCHOR_SIZE, ANCHOR_SIZE);
  }
  if (includeWaypoints) {
    for (const wp of ctx.wayPoints) {
      if (wp.isDeparture || wp.isArrival) continue;
      const svg = MapAnchor.createSvg(anchorBorderColor, '' + wp.index, anchorTextColor, anchorFillColor);
      const pos = pathPt(wp.wayPoint.point.pos);
      addSvgToPdf(ctx, svg, x + pos.x / RATIO - ANCHOR_SIZE / 2, y + pos.y / RATIO - ANCHOR_SIZE, ANCHOR_SIZE, ANCHOR_SIZE);
    }
  }
}

async function drawTiles(ctx: PdfContext, x: number, y: number, width: number, height: number, mapBounds: MapBounds) {
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
        const image = await globalThis.fetch(url).then(r => r.arrayBuffer());
        ctx.doc.image(
          image,
          x + (MapGenerator.tileSize * (tileX - mapBounds.leftTile) + mapBounds.leftDiff) / RATIO,
          y + (MapGenerator.tileSize * (tileY - mapBounds.topTile) + mapBounds.topDiff) / RATIO,
          { width: MapGenerator.tileSize / RATIO, height: MapGenerator.tileSize / RATIO }
        );
      } catch (e) {
        logger.error('Error loading tile for PDF', url, e);
        ctx.injector.get(ErrorService).addTechnicalError(e, 'pages.pdf_popup.error_downloading_tile', []);
        break;
      }
    }
  }
  ctx.doc.restore();
}

function drawTrack(ctx: PdfContext, pathPt: (pos: L.LatLngLiteral) => Point2D, x: number, y: number) {
  const points = ctx.track.getAllPositions();
  let lastPoint = pathPt(points[0]);
  ctx.doc.strokeColor('#ff0000');
  ctx.doc.moveTo(x + lastPoint.x / RATIO, y + lastPoint.y / RATIO);
  const nb = points.length;
  for (let i = 1; i < nb; i++) {
    const p = pathPt(points[i]);
    const dx = p.x - lastPoint.x;
    const dy = p.y - lastPoint.y;
    if (i == nb - 1 || Math.hypot(dx, dy) >= 1) {
      ctx.doc.lineTo(x + p.x / RATIO, y + p.y / RATIO);
      lastPoint = p;
    }
  }
  ctx.doc.stroke();
}
