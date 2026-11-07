export interface Point2D {
  x: number;
  y: number;
}

export interface BBox2D {
  minX: number;
  maxX: number;
  minY: number;
  maxY: number;
}

export function distance2d(p1: Point2D, p2: Point2D): number {
  return Math.hypot(p2.x - p1.x, p2.y - p1.y);
}

export function bbox2DContainsBBox2D(container: BBox2D, contained: BBox2D): boolean {
  return contained.minX >= container.minX && contained.maxX <= container.maxX && contained.minY >= container.minY && contained.maxY <= container.maxY;
}

export function bbox2DPadding(bbox: BBox2D, padding: number): BBox2D {
  return {
    minX: bbox.minX - padding,
    minY: bbox.minY - padding,
    maxX: bbox.maxX + padding,
    maxY: bbox.maxY + padding,
  };
}

export function extendBBox2D(b1: BBox2D, b2: BBox2D): BBox2D {
  return {
    minX: Math.min(b1.minX, b2.minX),
    maxX: Math.max(b1.maxX, b2.maxX),
    minY: Math.min(b1.minY, b2.minY),
    maxY: Math.max(b1.maxY, b2.maxY),
  };
}
