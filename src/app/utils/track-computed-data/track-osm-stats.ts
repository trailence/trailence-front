import { HikingDifficulty, Way, WaySurface, WayType, WayVisibility } from 'src/app/services/map/way';
import { OsmWaysTrackPoint } from './match-osm-ways';
import { distance } from '../latlng';
import { TrackPointReference } from './types';

export type TrackSection = {start: TrackPointReference, end: TrackPointReference};

export type TrackOsmStatInfo = {distance: number, sections: TrackSection[]};

export interface TrackOsmStats {
  isPartial: boolean;
  osmTotalDistanceMeters: number;
  wayType: Map<WayType, TrackOsmStatInfo>;
  surface: Map<WaySurface, TrackOsmStatInfo>;
  hikingDifficulty: Map<HikingDifficulty, TrackOsmStatInfo>;
  visibility: Map<WayVisibility, TrackOsmStatInfo>;
}

export function getTrackOsmStats(ways: Map<string, Way>, osmTrackPoints: OsmWaysTrackPoint[][], isPartial: boolean): TrackOsmStats {
  const stats: TrackOsmStats = {
    osmTotalDistanceMeters: 0,
    wayType: new Map<WayType, TrackOsmStatInfo>(),
    surface: new Map<WaySurface, TrackOsmStatInfo>(),
    hikingDifficulty: new Map<HikingDifficulty, TrackOsmStatInfo>(),
    visibility: new Map<WayVisibility, TrackOsmStatInfo>(),
    isPartial,
  };
  for (const segment of osmTrackPoints) {
    for (let pi = 0; pi < segment.length; ++pi) {
      const point = segment[pi];
      if (!point.osm) {
        continue;
      }
      let pi2 = pi + 1;
      while (pi2 < segment.length && point.osm.wayId === segment[pi2].osm?.wayId) pi2++;
      if (pi2 === pi + 1) continue; // single point
      let start: TrackPointReference | undefined = undefined;
      let end: TrackPointReference | undefined = undefined;
      let d = 0;
      for (let i = pi; i < pi2; ++i) {
        const point2 = segment[i];
        if (i > pi) {
          const previous = segment[i - 1];
          if (previous.osm)
            d += distance(previous.osm.point, point2.osm!.point);
        }
        if (point2.originalTrackPoint) {
          end = {...point2.originalTrackPoint};
          start ??= end;
        }
      }
      stats.osmTotalDistanceMeters += d;
      const section = start && end ? {start, end} : undefined;
      const way = ways.get(point.osm.wayId)!;
      if (way.type !== undefined)
        addStat(stats.wayType, way.type, d, section)
      if (way.surface !== undefined)
        addStat(stats.surface, way.surface, d, section);
      if (way.hikingDifficulty !== undefined)
        addStat(stats.hikingDifficulty, way.hikingDifficulty, d, section);
      if (way.visibility !== undefined)
        addStat(stats.visibility, way.visibility, d, section);
      pi = pi2 - 1;
    }
  }
  mergeSections(stats.wayType);
  mergeSections(stats.surface);
  mergeSections(stats.hikingDifficulty);
  mergeSections(stats.visibility);
  return stats;
}

function addStat<T>(map: Map<T, TrackOsmStatInfo>, value: T, distance: number, section: TrackSection | undefined): void {
  const stat = map.get(value);
  if (!stat) {
    map.set(value, {distance, sections: section ? [section] : []});
  } else {
    stat.distance += distance;
    if (section)
      stat.sections.push(section);
  }
}

function mergeSections(map: Map<any, TrackOsmStatInfo>) {
  for (const info of map.values())
    mergeSectionsArray(info.sections);
}

export function trackSectionsComparator(s1: TrackSection, s2: TrackSection): number {
  if (s1.start.segmentIndex < s2.start.segmentIndex) return -1;
  if (s1.start.segmentIndex > s2.start.segmentIndex) return 1;
  return s1.start.pointIndex - s2.start.pointIndex;
};

function mergeSectionsArray(sections: TrackSection[]) {
  sections.sort(trackSectionsComparator);
  if (sections.length < 2) return;
  for (let i = 1; i < sections.length; ++i) {
    const previous = sections[i - 1];
    const current = sections[i];
    if (previous.start.segmentIndex !== current.end.segmentIndex) continue;
    if (current.start.pointIndex > previous.end.pointIndex) continue;
    previous.end.pointIndex = Math.max(previous.end.pointIndex, current.end.pointIndex);
    sections.splice(i, 1);
    i--;
  }
}
