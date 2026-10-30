export interface Point2D {
  x: number;
  y: number;
}

export function distance2d(p1: Point2D, p2: Point2D): number {
  return Math.hypot(p2.x - p1.x, p2.y - p1.y);
}
