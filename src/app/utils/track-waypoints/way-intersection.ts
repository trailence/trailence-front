import { Track } from 'src/app/model/track';
import { TrackWayPoint, TrackWayPointElement } from './track-waypoint';
import { OsmWayPointInfo, OsmWaysTrackPoint } from '../track-computed-data/match-osm-ways';
import { Way } from 'src/app/services/map/way';
import { distance, EarthPoint } from '../latlng';
import { TrackPointReference } from '../track-computed-data/types';
import { Point } from 'src/app/model/point';
import { WayPoint } from 'src/app/model/way-point';
import { Maps } from '../maps';

export interface IntersectionElement {
  way: Way;
  point: EarthPoint;
  isFrom: boolean;
  isTo: boolean;
}

export class OsmWayIntersection extends TrackWayPointElement {

  constructor(
    track: Track,
    nearestTrackPoint: TrackPointReference | undefined,
    public readonly point: EarthPoint,
    public readonly intersection: IntersectionElement[],
    public readonly angle: number,
  ) {
    super(track, nearestTrackPoint);
    this.direction = getDirectionForAngle(angle);
  }

  public readonly direction: IntersectionDirection;

  public static from(wp: TrackWayPoint): OsmWayIntersection | undefined {
    return wp.elements.find(e => e instanceof OsmWayIntersection);
  }

  public override getWayPoint(): WayPoint | undefined {
    return undefined;
  }

  public override getPosition(): { lat: number; lng: number; } {
    if (this.nearestTrackPoint === undefined) return this.point;
    return this.track.getPoint(this.nearestTrackPoint).pos;
  }

  public override getPoint(): Point | undefined {
    if (this.nearestTrackPoint === undefined) return undefined;
    return this.track.getPoint(this.nearestTrackPoint);
  }

  public override getAltitude(): number | undefined {
    return this.getPoint()?.ele;
  }

  public override getBreakDuration(): number {
    return 0;
  }

  public toSvg(followedWayColor: string): SVGSVGElement {
    const center = this.point;
    const lat0 = center.lat * Math.PI / 180;

    // Convert to local coordinates (north = +y)
    const SEGMENT_LENGTH = 1; // arbitrary unit

    const points = this.intersection.map(element => {
      const x = (element.point.lng - center.lng) * Math.cos(lat0);
      const y = element.point.lat - center.lat;

      const length = Math.sqrt(x * x + y * y);

      return {
        ...element,
        x: x / length * SEGMENT_LENGTH,
        y: y / length * SEGMENT_LENGTH
      };
    });

    // Find incoming segment angle
    let incomingAngle = 0;

    for (const p of points) {
      if (p.isFrom) {
        incomingAngle = Math.atan2(p.y, p.x);
        break;
      }
    }

    // Rotate so incoming segment points downward
    // (user comes from bottom and goes up)
    const rotation = -Math.PI / 2 - incomingAngle;
    const cos = Math.cos(rotation);
    const sin = Math.sin(rotation);

    // Rotate all points
    const rotated = points.map(p => ({
      ...p,
      xr: p.x * cos - p.y * sin,
      yr: p.x * sin + p.y * cos
    }));

    // Determine bounds
    let minX = 0;
    let maxX = 0;
    let minY = 0;
    let maxY = 0;

    for (const p of rotated) {
      minX = Math.min(minX, p.xr);
      maxX = Math.max(maxX, p.xr);
      minY = Math.min(minY, p.yr);
      maxY = Math.max(maxY, p.yr);
    }

    const width = maxX - minX;
    const height = maxY - minY;

    // Add some margin
    const margin = Math.max(width, height) * 0.1;

    minX -= margin;
    maxX += margin;
    minY -= margin;
    maxY += margin;

    const svgWidth = 800;
    const svgHeight = 800;

    // Scale to SVG
    const scale = Math.min(
      svgWidth / (maxX - minX),
      svgHeight / (maxY - minY)
    );

    const cx = (-minX) * scale;
    const cy = maxY * scale; // SVG Y is downward

    const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
    svg.setAttribute('width', svgWidth + 'px');
    svg.setAttribute('height', svgHeight + 'px');
    svg.setAttribute('viewBox', `0 0 ${svgWidth} ${svgHeight}`);

    for (const p of rotated) {

      const x1 = cx + p.xr * scale;
      const y1 = cy - p.yr * scale; // invert Y

      const color = p.isFrom || p.isTo ? followedWayColor : 'currentColor';
      const strokeWidth = p.isFrom || p.isTo ? 40 : 30;

      addLine(svg, x1, y1, cx, cy, color, strokeWidth);

      if (p.isFrom) {
        // User came FROM this segment TO the center
        addArrow(svg, x1, y1, cx, cy, true, strokeWidth, followedWayColor);
      }

      if (p.isTo) {
        // User goes FROM center TO this segment
        addArrow(svg, cx, cy, x1, y1, true, strokeWidth, followedWayColor);
      }
    }

    return svg;
  }

}

function addArrow(
  svg: SVGSVGElement,
  x0: number,
  y0: number,
  x1: number,
  y1: number,
  towardEnd: boolean,
  strokeWidth: number,
  color: string,
): void {

  // Position of the arrow (middle of the segment)
  const mx = (x0 + x1) / 2;
  const my = (y0 + y1) / 2;

  // Direction
  let dx = x1 - x0;
  let dy = y1 - y0;

  if (!towardEnd) {
    dx = -dx;
    dy = -dy;
  }

  const len = Math.sqrt(dx * dx + dy * dy);
  dx /= len;
  dy /= len;

  // Arrow size
  const arrowLength = strokeWidth * 2;
  const arrowWidth = strokeWidth * 3;

  // Tip
  const tx = mx + dx * arrowLength / 2;
  const ty = my + dy * arrowLength / 2;

  // Base center
  const bx = mx - dx * arrowLength / 2;
  const by = my - dy * arrowLength / 2;

  // Perpendicular vector
  const px = -dy;
  const py = dx;

  const lx = bx + px * arrowWidth / 2;
  const ly = by + py * arrowWidth / 2;

  const rx = bx - px * arrowWidth / 2;
  const ry = by - py * arrowWidth / 2;

  addLine(svg, lx, ly, tx, ty, color, strokeWidth);
  addLine(svg, rx, ry, tx, ty, color, strokeWidth);
}

function addLine(svg: SVGSVGElement, x1: number, y1: number, x2: number, y2: number, color: string, width: number): void {
  const line = document.createElementNS('http://www.w3.org/2000/svg', 'line');
  line.setAttribute('x1', '' + x1);
  line.setAttribute('y1', '' + y1);
  line.setAttribute('x2', '' + x2);
  line.setAttribute('y2', '' + y2);
  line.setAttribute('stroke', color);
  line.setAttribute('stroke-width', '' + width);
  line.setAttribute('stroke-linecap', 'round');
  svg.appendChild(line);
}

export function computeOsmWayChanges(track: Track, osmTrackPoints: OsmWaysTrackPoint[][], ways: Iterable<Way>, wayPoints: TrackWayPoint[]): boolean {
  const intersections: OsmWayIntersection[] = [];
  const osmPointsMap = buildOsmWayPointMap(ways);
  for (const osmSegment of osmTrackPoints) {
    for (let osmPi = 1; osmPi < osmSegment.length - 1; ++osmPi) {
      const point = osmSegment[osmPi];
      if (point.osm?.position?.type !== 'exact') continue;
      // we have an osm way point
      const segments = getSegmentsAt(osmPointsMap, point.osm.point);
      if (segments.length <= 2) continue;
      let fromPoint: OsmWaysTrackPoint | undefined;
      for (let i = 1; i < 10 && osmPi - i >= 0; ++i) {
        const p = osmSegment[osmPi - i];
        if (p.osm) {
          if (distance(p.osm.point, point.osm.point) < 40)
            fromPoint = p;
          break;
        }
      }
      if (!fromPoint?.osm) continue;
      let toPoint: OsmWaysTrackPoint | undefined;
      for (let i = 1; i < 20 && osmPi + i < osmSegment.length; ++i) {
        const p = osmSegment[osmPi + i];
        if (!p.osm) continue;
        if (distance(p.osm.point, point.osm.point) < 20) continue;
        // we have a next point at a distance >= 20 meters
        // let's go back while we are on the same way
        for (let j = 1; j < i; ++j) {
          const p2 = osmSegment[osmPi + j];
          if (p2.osm && p2.osm.wayId === p.osm.wayId) {
            toPoint = p2;
            break;
          }
        }
        if (!toPoint) toPoint = p;
        break;
      }
      if (!toPoint?.osm) continue;
      const from = extractSegment(segments, fromPoint.osm);
      if (!from) {
        //console.warn('no from', point, fromPoint, segments);
        continue;
      }
      const to = extractSegment(segments, toPoint.osm);
      if (!to) {
        //console.warn('no to', point.osm, toPoint.osm, segments);
        continue;
      }
      let nearestTrackPoint = point.originalTrackPoint;
      if (!nearestTrackPoint) {
        let firstBefore: TrackPointReference | undefined;
        for (let i = osmPi - 1; i >= 0; --i) {
          if (osmSegment[i].originalTrackPoint) {
            firstBefore = osmSegment[i].originalTrackPoint;
            break;
          }
        }
        let firstAfter: TrackPointReference | undefined;
        for (let i = osmPi + 1; i < osmSegment.length; ++i) {
          if (osmSegment[i].originalTrackPoint) {
            firstAfter = osmSegment[i].originalTrackPoint;
            break;
          }
        }
        if (!firstBefore) nearestTrackPoint = firstAfter;
        else if (!firstAfter) nearestTrackPoint = firstBefore;
        else if (distance(track.getPoint(firstBefore).pos, point.osm.point) <= distance(track.getPoint(firstAfter).pos, point.osm.point)) nearestTrackPoint = firstBefore;
        else nearestTrackPoint = firstAfter;
      }
      if (!nearestTrackPoint) continue;
      const intersection: IntersectionElement[] = [
        {way: from.way, point: from.way.points[from.index], isFrom: true, isTo: false},
        {way: to.way, point: to.way.points[to.index], isFrom: false, isTo: true},
        ...segments.map(s => ({way: s.way, point: s.way.points[s.index], isFrom: false, isTo: false})),
      ];
      const angle = turnAngleDegrees(fromPoint.osm.point, point.osm.point, toPoint.osm.point);
      console.log('intersection at', point, 'from', fromPoint, 'to', toPoint, 'nearest', nearestTrackPoint);
      intersections.push(new OsmWayIntersection(track, nearestTrackPoint, point.osm.point, intersection, angle));
    }
  }
  if (intersections.length === 0) return false;
  // TODO attach to existing waypoints
  wayPoints.push(...intersections.map(e => new TrackWayPoint(e)));
  return true;
}

function buildOsmWayPointMap(ways: Iterable<Way>): Map<number, Map<number, Segment[]>> {
  const map = new Map<number, Map<number, Segment[]>>();
  for (const way of ways) {
    for (let i = 0; i < way.points.length; ++i) {
      const point = way.points[i];
      Maps.computeIfAbsent(
        Maps.computeIfAbsent(map, Math.floor(point.lat * 1e7), () => new Map<number, Segment[]>()),
        Math.floor(point.lng * 1e7),
        () => [],
      ).push({way, index: i});
    }
  }
  return map;
}

interface Segment {
  way: Way;
  index: number;
}

function getSegmentsAt(waysPoints: Map<number, Map<number, Segment[]>>, pos: EarthPoint): Segment[] {
  const segments: Segment[] = [];
  const latMap = waysPoints.get(Math.floor(pos.lat * 1e7));
  if (latMap) {
    const points = latMap.get(Math.floor(pos.lng * 1e7));
    if (points) {
      for (const p of points) {
        if (p.index > 0) segments.push({way: p.way, index: p.index - 1});
        if (p.index < p.way.points.length - 1) segments.push({way: p.way, index: p.index + 1});
      }
    }
  }
  return segments;
}

function extractSegment(segments: Segment[], point: OsmWayPointInfo): Segment | undefined {
  const index = segments.findIndex(segment => {
    if (segment.way.id !== point.wayId) return false;
    if (point.position.type === 'exact') return segment.index === point.position.index;
    return segment.index === point.position.indexBefore || segment.index === point.position.indexAfter
  });
  if (index >= 0) {
    return segments.splice(index, 1)[0];
  }
  return undefined;
}

const R = Math.PI / 180;

function turnAngle(from: EarthPoint, intersection: EarthPoint, to: EarthPoint): number {
  /*
  // Incoming direction
  const ux = intersection.lng - from.lng;
  const uy = intersection.lat - from.lat;

  // Outgoing direction
  const vx = to.lng - intersection.lng;
  const vy = to.lat - intersection.lat;

  const cross = ux * vy - uy * vx;
  const dot = ux * vx + uy * vy;

  return Math.atan2(cross, dot); // radians in [-π, π]
  */
  // Scale longitude by cos(latitude) to account for Earth's curvature
  const cosLat = Math.cos(intersection.lat * R);

  // Local coordinates centered at B
  const ax = (from.lng - intersection.lng) * cosLat;
  const ay = from.lat - intersection.lat;

  const cx = (to.lng - intersection.lng) * cosLat;
  const cy = to.lat - intersection.lat;

  // Incoming vector from -> intersection
  const ux = -ax;
  const uy = -ay;

  // Outgoing vector intersection -> to
  const vx = cx;
  const vy = cy;

  const cross = ux * vy - uy * vx;
  const dot = ux * vx + uy * vy;

  return Math.atan2(cross, dot); // radians
}

function turnAngleDegrees(from: EarthPoint, intersection: EarthPoint, to: EarthPoint): number {
  return turnAngle(from, intersection, to) * 180 / Math.PI;
}

function getWaysIntersectionAt(ways: Map<string, Way>, fromWayId: string, fromWayPointIndex: number, toPoint: OsmWayPointInfo): IntersectionElement[] | undefined {
  const fromWay = ways.get(fromWayId);
  if (!fromWay) return undefined;
  const fromPoint = fromWay.points[fromWayPointIndex];
  const intersection: IntersectionElement[] = [];
  for (const way of ways.values()) {
    if (way.id === fromWayId || way.id === toPoint.wayId) continue;
    for (let wayPi = 0; wayPi < way.points.length; ++wayPi) {
      const point = way.points[wayPi];
      if (point.lat === fromPoint.lat && point.lng === fromPoint.lng) {
        if (wayPi > 0)
          intersection.push({way, point: way.points[wayPi - 1], isFrom: false, isTo: false});
        if (wayPi < way.points.length - 1)
          intersection.push({way, point: way.points[wayPi + 1], isFrom: false, isTo: false});
      }
    }
  }
  if (intersection.length === 0) return undefined;
  intersection.push({way: fromWay, point: fromPoint, isFrom: true, isTo: false});
  /*
  const toWay = ways.get(toPoint.wayId);
  if (toWay) {
    switch (toPoint.position.type) {
      case 'exact':
        intersection.push({way: toWay, point: toPoint.point, isFrom: false, isTo: true});
        break;
      case 'segment':
        if (toWay.id === fromWayId) {
          if (toPoint.position.indexBefore === fromWayPointIndex)
            intersection.push({way: toWay, point: toWay.points[toPoint.position.indexAfter], isFrom: false, isTo: true});
          else if (toPoint.position.indexAfter === fromWayPointIndex)
            intersection.push({way: toWay, point: toWay.points[toPoint.position.indexBefore], isFrom: false, isTo: true});
          else {
            console.log('no before or after'); // TODO
          }
        } else {
          console.log('TODO change of way');
        }
        break;
    }
  }*/
  return intersection;
}

export type IntersectionDirection =
  'straight' | 'uturn' |
  'left-turn' | 'left-turn-small' | 'left-turn-medium' | 'left-turn-large' |
  'right-turn' | 'right-turn-small' | 'right-turn-medium' | 'right-turn-large'
  ;

function getDirectionForAngle(angle: number): IntersectionDirection {
  if (angle > -15 && angle < 15) return 'straight';
  if (angle < -165 || angle > 165) return 'uturn';
  if (angle < 0) {
    if (angle > -30) return 'right-turn-small';
    if (angle > -60) return 'right-turn-medium';
    if (angle > -120) return 'right-turn';
    return 'right-turn-large';
  } else {
    if (angle < 30) return 'left-turn-small';
    if (angle < 60) return 'left-turn-medium';
    if (angle < 120) return 'left-turn';
    return 'left-turn-large';
  }
}
