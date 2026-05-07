import { DrinkingWater, Guidepost, Toilets } from '../model/pois';
import { OsmNode, OsmObject } from './osm-object';

export function osmToGuidepost(osm: OsmObject): Guidepost | undefined {
  if (!(osm instanceof OsmNode)) return undefined;
  if (osm.tags['information'] !== 'guidepost' || osm.tags['tourism'] !== 'information') return undefined;
  let name = osm.tags['name'];
  let ref = osm.tags['ref'] ?? Object.entries(osm.tags).find(e => e[0].startsWith('ref') || e[0].endsWith('ref'))?.[1];
  let note = osm.tags['note'];
  let comment = osm.tags['comment'];
  let description = osm.tags['description'];
  let text: string | undefined = undefined;
  if (name?.length) {
    if (ref?.length) text = name + ' (' + ref + ')';
    else text = name;
  } else if (ref?.length)
    text = ref;
  else if (note?.length)
    text = note;
  else if (comment?.length)
    text = comment;
  else if (description?.length)
    text = description;
  //else console.log('no text found', obj)
  return {lat: osm.y, lon: osm.x, text};
}

export function osmToToilets(osm: OsmObject): Toilets | undefined {
  if (!(osm instanceof OsmNode)) return undefined;
  if (osm.tags['amenity'] !== 'toilets') return undefined;
  return {lat: osm.y, lon: osm.x};
}

export function osmToDrinkingWater(osm: OsmObject): DrinkingWater | undefined {
  if (!(osm instanceof OsmNode)) return undefined;
  if (osm.tags['amenity'] !== 'drinking_water') return undefined;
  return {lat: osm.y, lon: osm.x};
}
