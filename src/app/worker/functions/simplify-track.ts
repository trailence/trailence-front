import { SimplifiedPoint, SimplifiedTrackSnapshot } from 'src/app/model/snapshots';
import { distance } from 'src/app/utils/latlng';

export async function simplifyTrack(points: SimplifiedPoint[]): Promise<SimplifiedTrackSnapshot> {
  const simplified: SimplifiedTrackSnapshot = { points: [] };
  let previous: SimplifiedPoint | undefined;
  for (const point of points) {
    if (!previous || distance(point, previous) >= 25) {
      const newPoint: SimplifiedPoint = {
        lat: point.lat,
        lng: point.lng,
        ele: point.ele,
        time: point.time,
      };
      if (previous && simplified.points.length > 1) {
        const angle1 = Math.atan2(point.lat - previous.lat, point.lng - previous.lng);
        const pprevious = simplified.points.at(-2)!;
        const angle2 = Math.atan2(previous.lat - pprevious.lat, previous.lng - pprevious.lng);
        if (Math.abs(angle1 - angle2) < 0.35) {
          simplified.points[simplified.points.length - 1] = newPoint;
          previous = point;
          continue;
        }
      }
      simplified.points.push(newPoint);
      previous = point;
    }
  }
  const lastPoint = points.at(-1)!;
  if (previous !== lastPoint) {
    simplified.points.push({
      lat: lastPoint.lat,
      lng: lastPoint.lng,
      ele: lastPoint.ele,
      time: lastPoint.time,
    });
  }
  return simplified;
}
