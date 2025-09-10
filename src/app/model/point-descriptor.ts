export interface PointDescriptor {
  pos: {lat: number, lng: number};
  ele?: number;
  time?: number;
  posAccuracy?: number;
  eleAccuracy?: number;
  heading?: number;
  speed?: number;
}

export function copyPoint(p: PointDescriptor): PointDescriptor {
  return {
    pos: {
      lat: p.pos.lat,
      lng: p.pos.lng,
    },
    ele: p.ele,
    time: p.time,
    posAccuracy: p.posAccuracy,
    eleAccuracy: p.eleAccuracy,
    heading: p.heading,
    speed: p.speed,
  }
}

export function pointsAreEqual(p1: PointDescriptor, p2: PointDescriptor): boolean {
  return p1.pos.lat === p2.pos.lat &&
    p1.pos.lng === p2.pos.lng &&
    p1.ele === p2.ele &&
    p1.time === p2.time &&
    p1.posAccuracy === p2.posAccuracy &&
    p1.eleAccuracy === p2.eleAccuracy &&
    p1.heading === p2.heading &&
    p1.speed === p2.speed;
}
