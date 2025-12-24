import { ComputedWayPoint } from 'src/app/model/track';

export function hasWaypointsContent(wayPoints: ComputedWayPoint[], sourceLang: string, userLang: string) {
  const departure = wayPoints.find(wp => wp.isDeparture);
  let wayPointData = getWaypointData(departure, sourceLang, userLang);
  if (wayPointData) return true;
  let index = 1;
  do {
    const wp = wayPoints.find(wp => wp.index === index);
    if (!wp) break;
    wayPointData = getWaypointData(wp, sourceLang, userLang);
    if (wayPointData) return true;
    index++;
  } while (true);
  const arrival = wayPoints.find(wp => wp.isArrival && !wp.isDeparture);
  wayPointData = getWaypointData(arrival, sourceLang, userLang);
  if (wayPointData) return true;
  return false;
}

export function getWaypointData(waypoint: ComputedWayPoint | undefined, sourceLang: string, userLang: string): {waypoint: ComputedWayPoint, name: string | undefined, description: string | undefined} | undefined {
  if (!waypoint) return undefined;
  const name = getWaypointName(waypoint, sourceLang, userLang);
  const description = getWaypointDescription(waypoint, sourceLang, userLang);
  if (!name && !description) return undefined;
  return {waypoint, name, description};
}

function getWaypointName(waypoint: ComputedWayPoint, sourceLang: string, userLang: string): string | undefined {
  const text =
    sourceLang === userLang ? waypoint.wayPoint.name?.trim() :
    (waypoint.wayPoint.nameTranslations?.[userLang] ? waypoint.wayPoint.nameTranslations[userLang].trim() : waypoint.wayPoint.name?.trim());
  if (text && text.length === 0) return undefined;
  return text;
}


function getWaypointDescription(waypoint: ComputedWayPoint, sourceLang: string, userLang: string): string | undefined {
  const text =
    sourceLang === userLang ? waypoint.wayPoint.description?.trim() :
    (waypoint.wayPoint.descriptionTranslations?.[userLang] ? waypoint.wayPoint.descriptionTranslations[userLang].trim() : waypoint.wayPoint.description?.trim());
  if (text && text.length === 0) return undefined;
  return text;
}
