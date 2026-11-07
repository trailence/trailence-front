import { bboxCenter, bboxPadRatio, earthBBox, EarthBBox, EarthPoint, extendBBoxWithPoint, projectEarthPointForZoom, unprojectToEarthPointForZoom } from '@trailence/utils/latlng';
import { MapBubble } from '../map/elements/map-bubble';
import { distance2d, Point2D } from '@trailence/utils/geometry-utils';

export function buildBubblesFromBoundsAndZoom(bounds: EarthBBox[], zoom: number): MapBubble[] {
  const bubbles: Bubble[] = [];
  const positions: Pos[] = [];
  // sort the points so we are deterministic
  const sortedPoints = bounds.map(b => bboxCenter(b)).sort(pointsComparator);
  for (const p of sortedPoints) {
    positions.push(new Pos(p, projectEarthPointForZoom(p, zoom)));
  }
  while (positions.length > 0) {
    const pos = positions[0];
    const bubble = {pos, bounds: earthBBox(pos.latLng, pos.latLng), content: [pos]};
    bubbles.push(bubble);
    positions.splice(0, 1);
    do {
      addPositionsToBubbleWithoutMovingCenter(bubble, positions);
      const extended =
        addPositionsToBubbleBasedOnCurrentBoundsCenter(bubble, positions, zoom) ||
        addPositionsToBubbleMovingCenter(bubble, positions, zoom);
      if (!extended) break;
    } while (true);
  }
  return bubbles.map(b => {
    const p1 = projectEarthPointForZoom({lat: b.bounds.minlat, lng: b.bounds.minlng}, zoom);
    const p2 = projectEarthPointForZoom({lat: b.bounds.maxlat, lng: b.bounds.maxlng}, zoom);
    const center = projectEarthPointForZoom(bboxCenter(b.bounds), zoom);
    const width = Math.floor(Math.abs(p1.x - p2.x)) + 1;
    const height = Math.floor(Math.abs(p1.y - p2.y)) + 1;
    let size = Math.max(BUBBLE_MIN_PIXELS, Math.min(BUBBLE_MAX_PIXELS, Math.max(width, height)));
    if (size < BUBBLE_MAX_PIXELS && b.content.length > 1) {
      // the bounds is a rectangle, but we show a circle, so some points may be outside
      for (const c of b.content) {
        const d = Math.floor(distance2d(c.pixel, center)) + 1;
        if (size < BUBBLE_MAX_PIXELS && d > size / 2)
          size = Math.min(d * 2, BUBBLE_MAX_PIXELS);
      }
    }
    const bubbleBounds = earthBBox(
      unprojectToEarthPointForZoom({x: center.x - size / 2, y: center.y + size / 2}, zoom),
      unprojectToEarthPointForZoom({x: center.x + size / 2, y: center.y - size / 2}, zoom)
    );
    const text = '' + b.content.length;
    return new MapBubble(
      'tracks-bubble$' + bubbleBounds.minlat + '$' + bubbleBounds.minlng + '$' + bubbleBounds.maxlat + '$' + bubbleBounds.maxlng,
      bubbleBounds,
      bboxPadRatio(bubbleBounds, 0.5),
      '#FF000060', '#FF000080', text, size < 25 ? 125 / (text.length + 1) : 100 / (text.length + 1), '#000000'
    );
  });
}

class Bubble {
  constructor(
    public pos: Pos,
    public bounds: EarthBBox,
    public content: Pos[],
  ) {}
}

class Pos {
  constructor(
    public latLng: EarthPoint,
    public pixel: Point2D,
  ) {}
}

const BUBBLE_MAX_PIXELS = 50;
const BUBBLE_MIN_PIXELS = 20;

function pointsComparator(p1: EarthPoint, p2: EarthPoint): number {
  const d = p1.lat - p2.lat;
  if (d !== 0) return d < 0 ? -1 : 1;
  const d2 = p1.lng - p2.lng;
  if (d2 < 0) return -1;
  if (d2 > 0) return 1;
  return 0;
}

function addPositionsToBubbleWithoutMovingCenter(bubble: Bubble, positions: Pos[]): void {
  for (let i = 0; i < positions.length; ++i) {
    if (addToBubbleWithoutMovingCenter(bubble, positions[i])) {
      positions.splice(i, 1);
      i--;
    }
  }
}

function addToBubbleWithoutMovingCenter(bubble: Bubble, pos: Pos): boolean {
  if (distance2d(pos.pixel, bubble.pos.pixel) < (BUBBLE_MAX_PIXELS / 2 + 1)) {
    bubble.bounds = extendBBoxWithPoint(bubble.bounds, pos.latLng);
    bubble.content.push(pos);
    return true;
  }
  return false;
}

function addPositionsToBubbleBasedOnCurrentBoundsCenter(bubble: Bubble, positions: Pos[], zoom: number): boolean {
  for (let i = 0; i < positions.length; ++i) {
    if (addToBubbleBasedOnCurrentBoundsCenter(bubble, positions[i], zoom)) {
      positions.splice(i, 1);
      return true;
    }
  }
  return false;
}

function addToBubbleBasedOnCurrentBoundsCenter(bubble: Bubble, pos: Pos, zoom: number): boolean {
  const center = projectEarthPointForZoom(bboxCenter(bubble.bounds), zoom);
  if (distance2d(pos.pixel, center) < (BUBBLE_MAX_PIXELS / 2 + 1)) {
    bubble.bounds = extendBBoxWithPoint(bubble.bounds, pos.latLng);
    bubble.content.push(pos);
    const newCenter = bboxCenter(bubble.bounds);
    bubble.pos = new Pos(newCenter, projectEarthPointForZoom(newCenter, zoom));
    return true;
  }
  return false;
}

function addPositionsToBubbleMovingCenter(bubble: Bubble, positions: Pos[], zoom: number): boolean {
  for (let i = 0; i < positions.length; ++i) {
    if (addToBubble3(bubble, positions[i], zoom)) {
      positions.splice(i, 1);
      return true;
    }
  }
  return false;
}

function addToBubble3(bubble: Bubble, pos: Pos, zoom: number): boolean {
  const newBounds = extendBBoxWithPoint(bubble.bounds, pos.latLng);
  const newBoundsCenter = bboxCenter(newBounds);
  const center = projectEarthPointForZoom(newBoundsCenter, zoom);
  if (distance2d(pos.pixel, center) < (BUBBLE_MAX_PIXELS / 2 + 1)) {
    let ok = true;
    for (const c of bubble.content) {
      if (distance2d(center, projectEarthPointForZoom(c.latLng, zoom)) >= (BUBBLE_MAX_PIXELS / 2 + 1)) {
        ok = false;
        break;
      }
    }
    if (ok) {
      bubble.bounds = newBounds;
      bubble.content.push(pos);
      bubble.pos = new Pos(newBoundsCenter, center);
      return true;
    }
  }
  return false;
}
