import { MapBounds, MapGenerator } from '../../trail-small-map/map-generator';
import { PdfContext } from './pdf-context';
import { addSvgToPdf } from './pdf-icon';
import { ErrorService } from '@trailence/services/progress/error.service';
import { getLogger } from '@trailence/utils/console';
import { Point2D } from '@trailence/utils/geometry-utils';
import { createMapAchorSvgString } from '@trailence/components/map/utils/map-anchor';
import { anchorArrivalBorderColor, anchorArrivalFillColor, anchorArrivalTextColor, anchorBorderColor, anchorDABorderColor, anchorDATextColor, anchorDepartureBorderColor, anchorDepartureFillColor, anchorDepartureTextColor, anchorFillColor, anchorTextColor } from '@trailence/components/map/elements/map-track-anchors';
import { distance } from '@trailence/utils/latlng';
import { firstValueFrom, from } from 'rxjs';

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
    if (departure.isArrival || (arrival && distance(departure.wayPoint.point.pos, arrival.wayPoint.point.pos) <= 100)) {
      svg = createMapAchorSvgString(anchorDABorderColor, ctx.i18n.texts.way_points.DA, anchorDATextColor, anchorDepartureFillColor, anchorArrivalFillColor);
    } else {
      svg = createMapAchorSvgString(anchorDepartureBorderColor, ctx.i18n.texts.way_points.D, anchorDepartureTextColor, anchorDepartureFillColor);
    }
    addSvgToPdf(ctx, svg, x + pos.x / RATIO - ANCHOR_SIZE / 2, y + pos.y / RATIO - ANCHOR_SIZE, ANCHOR_SIZE, ANCHOR_SIZE);
  }
  if (arrival && !arrival.isDeparture && (!departure || distance(departure.wayPoint.point.pos, arrival.wayPoint.point.pos) > 100)) {
    const svg = createMapAchorSvgString(anchorArrivalBorderColor, ctx.i18n.texts.way_points.A, anchorArrivalTextColor, anchorArrivalFillColor);
    const pos = pathPt(arrival.wayPoint.point.pos);
    addSvgToPdf(ctx, svg, x + pos.x / RATIO - ANCHOR_SIZE / 2, y + pos.y / RATIO - ANCHOR_SIZE, ANCHOR_SIZE, ANCHOR_SIZE);
  }
  if (includeWaypoints) {
    for (const wp of ctx.wayPoints) {
      if (wp.isDeparture || wp.isArrival) continue;
      const svg = createMapAchorSvgString(anchorBorderColor, '' + wp.index, anchorTextColor, anchorFillColor);
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
      try {
        const dl = await firstValueFrom(ctx.mapLayer.download(tileX, tileY, mapBounds.zoom));
        if (dl instanceof Blob) {
          const image = await dl.arrayBuffer();
          ctx.doc.image(
            image,
            x + (MapGenerator.tileSize * (tileX - mapBounds.leftTile) + mapBounds.leftDiff) / RATIO,
            y + (MapGenerator.tileSize * (tileY - mapBounds.topTile) + mapBounds.topDiff) / RATIO,
            { width: MapGenerator.tileSize / RATIO, height: MapGenerator.tileSize / RATIO }
          );
        } else {
          throw new Error('Cannot download tile: ' + dl.message);
        }
      } catch (e) {
        logger.error('Error loading tile for PDF', e);
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
