import { HikingDifficulty, Way, WayPermission, WaySurface, WayType, WayVisibility } from '../model/way';
import { OsmObject, OsmWay } from './osm-object';

export function osmToWayWithoutPoints(osm: OsmObject): Way | undefined {
  if (!(osm instanceof OsmWay)) return undefined;
  const genericPermissions = toWayPermission(osm.tags['access']);
  const footPermission = toWayPermission(osm.tags['foot']) || genericPermissions;
  const bicyclePermission = toWayPermission(osm.tags['bicycle']) || genericPermissions;
  const way = {
    id: osm.id, footPermission, bicyclePermission,
    type: undefined, surface: undefined, hikingDifficulty: undefined, mtbDifficuly: undefined, visibility: undefined,
    points: [],
    routes: []
  } as Way;
  if (!osm.tags['highway']) {
    console.log('no highway tag', osm);
    return undefined;
  }
  switch (osm.tags['highway']) {
    case 'motorway': case 'trunk': case 'primary': case 'secondary': case 'tertiary': case 'unclassified': case 'residential':
    case 'motorway_link': case 'trunk_link': case 'primary_link': case 'secondary_link': case 'tertiary_link':
    case 'living_street': case 'service': case 'bus_guideway': case 'escape': case 'road': case 'busway':
      way.type = WayType.MAIN;
      break;
    case 'pedestrian': case 'footway':
      way.type = WayType.MAIN;
      if (!way.footPermission) way.footPermission = WayPermission.ALLOWED;
      break;
    case 'raceway':
      way.type = WayType.MAIN;
      if (!way.footPermission) way.footPermission = WayPermission.FORBIDDEN;
      if (!way.bicyclePermission) way.bicyclePermission = WayPermission.FORBIDDEN;
      break;
    case 'track': case 'path':
      way.type = WayType.TRACK;
      break;
    case 'cycleway':
      way.type = WayType.MAIN;
      if (!way.bicyclePermission) way.bicyclePermission = WayPermission.ALLOWED;
      break;
    case 'bridleway':
      break;
    case 'steps':
      way.type = WayType.STEPS;
      break;
    case 'via_ferrata':
      way.type = WayType.VIA_FERRATA;
      break;
    case 'construction': case 'proposed': case 'rest_area': case 'no': case 'corridor': case 'platform': case 'disused': case 'elevator':
    case 'razed': case 'services': case 'planned': case 'closed': case 'seasonal': case 'abandoned': case 'private':
      return undefined;
    case 'yes': break;
    default:
      console.log('unknown highway type', osm.tags['highway'], osm);
      return undefined;
  }
  const trackType = osm.tags['tracktype'];
  if (trackType) {
    switch (trackType) {
      case 'grade1': way.surface = WaySurface.SOLID; break;
      case 'grade2': way.surface = WaySurface.MOSTLY_SOLID; break;
      case 'grade3': way.surface = WaySurface.MIXTURE; break;
      case 'grade4': way.surface = WaySurface.MOSTLY_SOFT; break;
      case 'grade5': way.surface = WaySurface.SOFT; break;
    }
  }
  const surfaceTag = osm.tags['surface'];
  if (surfaceTag && way.type === WayType.TRACK) {
    const sep = surfaceTag.indexOf(':');
    const mainSurface = sep < 0 ? surfaceTag : surfaceTag.substring(0, sep);
    switch (mainSurface) {
      case 'paved': case 'asphalt': case 'chipseal': case 'concrete': case 'paving_stones':
      case 'sett': case 'unhewn_cobblestone': case 'cobblestone': case 'bricks': case 'metal': case 'metal_grid':
      case 'wood': case 'tiles': case 'fibre_reinforced _polymer_grate':
        if (!way.surface) way.surface = WaySurface.SOLID;
        break;
      case 'unpaved':
        break;
      case 'compacted': case 'grass_paver': case 'fine_gravel':
        if (!way.surface) way.surface = WaySurface.MOSTLY_SOLID;
        break;
      case 'gravel': case 'shells': case 'pebblestone': case 'ground': case 'dirt': case 'earth': case 'grass': case 'woodchips':
        if (!way.surface) way.surface = WaySurface.SOFT;
        break;
      case 'rock':
        way.surface = WaySurface.ROCK;
        break;
      case 'mud': case 'sand':
        way.surface = WaySurface.SOFT_WITH_DIFFICULTY;
        break;
    }
  }
  if (!way.surface && way.type === WayType.MAIN) way.surface = WaySurface.SOLID;
  if (osm.tags['sac_scale']) {
    switch (osm.tags['sac_scale']) {
      case 'strolling': way.hikingDifficulty = HikingDifficulty.VERY_EASY; break;
      case 'hiking': way.hikingDifficulty = HikingDifficulty.EASY; break;
      case 'mountain_hiking': way.hikingDifficulty = HikingDifficulty.MEDIUM; break;
      case 'demanding_mountain_hiking': way.hikingDifficulty = HikingDifficulty.HARD; break;
      case 'alpine_hiking': case 'demanding_alpine_hiking': case 'difficult_alpine_hiking':
        way.hikingDifficulty = HikingDifficulty.VERY_HARD; break;
    }
  }
  if (osm.tags['mtb:scale']) {
    switch (osm.tags['mtb:scale']) {
      case '0': way.mtbDifficuly = HikingDifficulty.VERY_EASY; break;
      case '1': way.mtbDifficuly = HikingDifficulty.EASY; break;
      case '2': way.mtbDifficuly = HikingDifficulty.MEDIUM; break;
      case '3': way.mtbDifficuly = HikingDifficulty.HARD; break;
      case '4': case '5': way.mtbDifficuly = HikingDifficulty.VERY_HARD; break;
      case '6': way.mtbDifficuly = HikingDifficulty.IMPOSSIBLE; break;
    }
  }
  if (osm.tags['trail_visibility']) {
    switch (osm.tags['trail_visibility']) {
      case 'excellent': way.visibility = WayVisibility.EXCELLENT; break;
      case 'good': way.visibility = WayVisibility.GOOD; break;
      case 'intermediate': way.visibility = WayVisibility.INTERMEDIATE; break;
      case 'bad': way.visibility = WayVisibility.BAD; break;
      case 'horrible': way.visibility = WayVisibility.HORRIBLE; break;
      case 'no': way.visibility = WayVisibility.NO; break;
    }
  }
  return way;
}

function toWayPermission(value: string | undefined | null): WayPermission | undefined {
  if (!value) return undefined;
  switch (value) {
    case 'yes': case 'designated': case 'optional_sidepath':
      return WayPermission.ALLOWED;
    case 'permissive':
      return WayPermission.PERMISSIVE;
    case 'no': case 'use_sidepath': case 'private': case 'destination':
      return WayPermission.FORBIDDEN;
    case 'dismount':
      return WayPermission.DISMOUNT;
  }
  return undefined;
}
