import { ComputedWayPoint } from 'src/app/model/track';
import { HorizBounds, PdfContext } from './pdf-context';
import { MapAnchor } from '../../map/markers/map-anchor';
import { anchorBorderColor, anchorDepartureBorderColor, anchorDepartureFillColor, anchorDepartureTextColor, anchorFillColor, anchorTextColor } from '../../map/track/map-track-way-points';
import { addSvgToPdf } from './pdf-icon';
import { generatePdfText } from './pdf-text';
import { getWaypointData } from '../waypoints-utils';

export async function generateWaypointsTextToPdf(ctx: PdfContext, y: number, horiz: HorizBounds, onFirst: (y: number, minHeight: number, horiz: HorizBounds) => Promise<{y: number, horiz: HorizBounds}>) {
  const departure = ctx.wayPoints.find(wp => wp.isDeparture);
  let wayPointData = getWaypointData(departure);
  let before = onFirst;
  let noMoreHeader = (y: number, minHeight: number, horiz: HorizBounds) => {
    if (y + minHeight > ctx.layout.height - ctx.layout.margin) {
      y = ctx.layout.headerHeight + ctx.layout.headerMargin;
      if (horiz.nextPage) horiz = horiz.nextPage(horiz);
      else ctx.nextPage();
    }
    return Promise.resolve({y, horiz});
  };
  let state: {y: number, horiz: HorizBounds} = {y, horiz};
  if (wayPointData) {
    state = await generateWaypoint(ctx, wayPointData.waypoint, wayPointData.name, wayPointData.description, state.y, state.horiz, before);
    before = noMoreHeader;
  }
  let index = 1;
  do {
    const wp = ctx.wayPoints.find(wp => wp.index === index);
    if (!wp) break;
    if (!wp.isDeparture && !wp.isArrival) {
      wayPointData = getWaypointData(wp);
      if (wayPointData) {
        state = await generateWaypoint(ctx, wayPointData.waypoint, wayPointData.name, wayPointData.description, state.y, state.horiz, before);
        before = noMoreHeader;
      }
    }
    index++;
  } while (true);
  const arrival = ctx.wayPoints.find(wp => wp.isArrival && !wp.isDeparture);
  wayPointData = getWaypointData(arrival);
  if (wayPointData) {
    state = await generateWaypoint(ctx, wayPointData.waypoint, wayPointData.name, wayPointData.description, state.y, state.horiz, before);
    before = noMoreHeader;
  }
  ctx.doc.y = state.y;
  return state;
}

async function generateWaypoint(ctx: PdfContext, waypoint: ComputedWayPoint, name: string | undefined, description: string | undefined, y: number, horiz: HorizBounds, before: (y: number, minHeight: number, horiz: HorizBounds) => Promise<{y: number, horiz: HorizBounds}>): Promise<{y: number, horiz: HorizBounds}> {
  const anchorSize = 20;
  const anchorMargin = 2;

  let nameSize = 0;
  if (name) {
    ctx.doc.strokeColor('#3088D8').fillColor('#3088D8').font('Roboto', 10);
    nameSize = ctx.doc.heightOfString(name, horiz.x + anchorSize + anchorMargin, y, {continued: false, width: horiz.width - (anchorSize + anchorMargin)});
    nameSize++;
  }

  let state = await before(y, Math.max(anchorSize + 1, nameSize + 15), horiz);
  y = state.y + 3;
  horiz = state.horiz;

  const svg = MapAnchor.createSvg(
    waypoint.isDeparture ? anchorDepartureBorderColor : anchorBorderColor,
    waypoint.isDeparture ? ctx.i18n.texts.way_points.D : waypoint.isArrival ? ctx.i18n.texts.way_points.A : '' + waypoint.index,
    waypoint.isDeparture ? anchorDepartureTextColor : anchorTextColor,
    waypoint.isDeparture ? anchorDepartureFillColor : anchorFillColor,
    undefined);
  const startY = y;
  const startPage = ctx.doc.bufferedPageRange().count;
  addSvgToPdf(ctx, svg, horiz.x, y, anchorSize, anchorSize);
  if (name) {
    ctx.doc.strokeColor('#3088D8').fillColor('#3088D8').font('Roboto', 10);
    ctx.doc.text(name, horiz.x + anchorSize + anchorMargin, y, {continued: false, width: horiz.width - (anchorSize + anchorMargin)});
    y = ctx.doc.y + 1;
  }
  if (description) {
    const h = {x: horiz.x + anchorSize + anchorMargin, width: horiz.width - (anchorSize + anchorMargin), nextPage: horiz.nextPage} as HorizBounds;
    const after = await generatePdfText(ctx, description, y, h, 9);
    ctx.doc.y = after.y;
    horiz.x = after.horiz.x - (anchorSize + anchorMargin);
    horiz.width = after.horiz.width + (anchorSize + anchorMargin);
    horiz.nextPage = after.horiz.nextPage;
    y = ctx.doc.y + 1;
  }
  if (ctx.doc.bufferedPageRange().count === startPage)
    y = Math.max(y, startY + anchorSize + 1);
  ctx.doc.y = y;
  return {y, horiz};
}
