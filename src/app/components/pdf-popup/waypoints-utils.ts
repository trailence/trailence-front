import { ComputedWayPoint } from 'src/app/model/track';

export function hasWaypointsContent(wayPoints: ComputedWayPoint[]) {
  const departure = wayPoints.find(wp => wp.isDeparture);
  let wayPointData = getWaypointData(departure);
  if (wayPointData) return true;
  let index = 1;
  do {
    const wp = wayPoints.find(wp => wp.index === index);
    if (!wp) break;
    wayPointData = getWaypointData(wp);
    if (wayPointData) return true;
    index++;
  } while (true);
  const arrival = wayPoints.find(wp => wp.isArrival && !wp.isDeparture);
  wayPointData = getWaypointData(arrival);
  if (wayPointData) return true;
  return false;
}

export function getWaypointData(waypoint: ComputedWayPoint | undefined): {waypoint: ComputedWayPoint, name: string | undefined, description: string | undefined} | undefined {
  if (!waypoint) return undefined;
  const name = getWaypointName(waypoint);
  const description = getWaypointDescription(waypoint);
  if (!name && !description) return undefined;
  return {waypoint, name, description};
}

function getWaypointName(waypoint: ComputedWayPoint): string | undefined {
  // TODO depending on language
  let text: string | undefined = waypoint.wayPoint.name?.trim() ?? undefined;
  if (text && text.length === 0) text = undefined;
  return text;
}


function getWaypointDescription(waypoint: ComputedWayPoint): string | undefined {
  // TODO depending on language
  let text: string | undefined = waypoint.wayPoint.description?.trim() ?? undefined;
  if (text && text.length === 0) text = undefined;
  return text;
}
