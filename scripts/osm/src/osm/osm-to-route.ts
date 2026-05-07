import { Route, RouteType } from '../model/route';
import { OsmRelation } from './osm-object';

export function osmToRoute(osm: OsmRelation): Route | undefined {
  const route: Route = {
    id: osm.id,
    colour: notEmpty(osm.tags['colour']),
    symbol: notEmpty(osm.tags['osmc:symbol']),
    name: notEmpty(osm.tags['name']),
    ref: notEmpty(osm.tags['ref']),
    types: toTypes(osm.tags['route']),
  };
  if (route.types.length === 0) return undefined;
  return route;
}

function notEmpty(s: string | undefined): string | undefined {
  if (!s) return undefined;
  s = s.trim();
  if (s.length > 0) return s;
  return undefined;
}

function toTypes(value: string): RouteType[] {
  return value.split(';').map(s => s.trim().toLowerCase()).filter(s => s.length > 0).map(s => toType(s)).filter(t => !!t);
}

function toType(s: string): RouteType | undefined {
  switch (s) {
    case 'foot': case 'hiking': case 'walking': return RouteType.HIKE;
    case 'bicycle': return RouteType.BICYCLE;
    case 'mtb': return RouteType.MTB;
    case 'fitness_trail': return RouteType.FITNESS_TRAIL;
    case 'running': return RouteType.RUNNING;
    case 'nordic_walking': return RouteType.NORDIC_WALK;
  }
  return undefined;
}
