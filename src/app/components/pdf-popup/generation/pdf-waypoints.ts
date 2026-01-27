import { ComputedWayPoint } from 'src/app/model/track';
import { HorizBounds, PdfContext } from './pdf-context';
import { MapAnchor } from '../../map/markers/map-anchor';
import { anchorBorderColor, anchorDepartureBorderColor, anchorDepartureFillColor, anchorDepartureTextColor, anchorFillColor, anchorTextColor } from '../../map/track/map-track-way-points';
import { addSvgToPdf } from './pdf-icon';
import { generatePdfText } from './pdf-text';
import { getWaypointData } from '../waypoints-utils';

export async function generateWaypointsTextToPdf(ctx: PdfContext, y: number, horiz: HorizBounds) {
  const userLang = ctx.preferences.preferences.lang;
  const sourceLang = ctx.trailInfo?.lang ?? userLang;
  const departure = ctx.wayPoints.find(wp => wp.isDeparture);
  let wayPointData = getWaypointData(departure, sourceLang, userLang);
  let state: {y: number, horiz: HorizBounds} = {y, horiz};
  if (wayPointData) {
    state = await generateWaypoint(ctx, wayPointData.waypoint, wayPointData.name, wayPointData.description, state.y, state.horiz);
  }
  let index = 1;
  do {
    const wp = ctx.wayPoints.find(wp => wp.index === index);
    if (!wp) break;
    if (!wp.isDeparture && !wp.isArrival) {
      wayPointData = getWaypointData(wp, sourceLang, userLang);
      if (wayPointData) {
        state = await generateWaypoint(ctx, wayPointData.waypoint, wayPointData.name, wayPointData.description, state.y, state.horiz);
      }
    }
    index++;
  } while (true);
  const arrival = ctx.wayPoints.find(wp => wp.isArrival && !wp.isDeparture);
  wayPointData = getWaypointData(arrival, sourceLang, userLang);
  if (wayPointData) {
    state = await generateWaypoint(ctx, wayPointData.waypoint, wayPointData.name, wayPointData.description, state.y, state.horiz);
  }
  ctx.doc.y = state.y;
  return state;
}

async function generateWaypoint(ctx: PdfContext, waypoint: ComputedWayPoint, name: string | undefined, description: string | undefined, y: number, horiz: HorizBounds): Promise<{y: number, horiz: HorizBounds}> {
  const anchorSize = 20;
  const anchorMargin = 2;

  let nameSize = 0;
  if (name) {
    ctx.doc.strokeColor('#3088D8').fillColor('#3088D8').font('Roboto', 10);
    nameSize = ctx.doc.heightOfString(name, horiz.x + anchorSize + anchorMargin, y, {continued: false, width: horiz.width - (anchorSize + anchorMargin)});
    nameSize++;
  }

  const svg = MapAnchor.createSvg(
    waypoint.isDeparture ? anchorDepartureBorderColor : anchorBorderColor,
    waypoint.isDeparture ? ctx.i18n.texts.way_points.D : waypoint.isArrival ? ctx.i18n.texts.way_points.A : '' + waypoint.index,
    waypoint.isDeparture ? anchorDepartureTextColor : anchorTextColor,
    waypoint.isDeparture ? anchorDepartureFillColor : anchorFillColor,
    undefined);
  ctx.doc.y = y;
  let nextPageCalled = false;
  const originalHoriz = horiz;
  horiz = {x: horiz.x, width: horiz.width, nextPage: current => {
    nextPageCalled = true;
    return originalHoriz.nextPage(current);
  }};
  if (y + Math.max(anchorSize + 1, nameSize + 15) > ctx.layout.height - ctx.layout.margin) {
    horiz = horiz.nextPage(horiz);
  }
  addSvgToPdf(ctx, svg, horiz.x, ctx.doc.y, anchorSize, anchorSize);
  if (name) {
    ctx.doc.strokeColor('#3088D8').fillColor('#3088D8').font('Roboto', 10);
    ctx.doc.text(name, horiz.x + anchorSize + anchorMargin, ctx.doc.y, {continued: false, width: horiz.width - (anchorSize + anchorMargin)});
    ctx.doc.y++;
  }
  if (description) {
    const h = {x: horiz.x + anchorSize + anchorMargin, width: horiz.width - (anchorSize + anchorMargin), nextPage: current => {
      const next = horiz.nextPage(current);
      next.x += anchorSize + anchorMargin;
      next.width -= anchorSize + anchorMargin;
      return next;
    }} as HorizBounds;
    const after = await generatePdfText(ctx, description, ctx.doc.y, h, 9);
    ctx.doc.y = after.y;
    horiz.x = after.horiz.x - (anchorSize + anchorMargin);
    horiz.width = after.horiz.width + (anchorSize + anchorMargin);
    horiz.nextPage = after.horiz.nextPage === h.nextPage ? horiz.nextPage : after.horiz.nextPage;
    ctx.doc.y++;
  }
  if (!nextPageCalled)
    ctx.doc.y = Math.max(ctx.doc.y, y + anchorSize + 1);
  return {y: ctx.doc.y, horiz};
}
