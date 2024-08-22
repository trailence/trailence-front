import { Segment } from 'src/app/model/segment';
import { Track } from 'src/app/model/track';
import { ComputedPreferences } from '../../preferences/preferences';

export function calculateLongBreaksFromTrack(track: Track, preferences: ComputedPreferences): number {
  const segments = track.segments;
  if (segments.length === 0) return 0;
  //let previousSegment = segments[0];
  //let breaks = calculateLongBreaksFromSegment(previousSegment, preferences);
  let breaks = calculateLongBreaksFromSegment(segments[0], preferences);
  for (let i = 1; i < segments.length; ++i) {
    const segment = segments[i];
    //const segmentStart = segment.startDate;
    //if (segmentStart === undefined) continue;
    //const previousEnd = previousSegment.endDate;
    //if (previousEnd !== undefined) breaks += segmentStart - previousEnd;
    breaks += calculateLongBreaksFromSegment(segment, preferences);
    //previousSegment = segment;
  }
  return breaks;
}

export function calculateLongBreaksFromSegment(segment: Segment, preferences: ComputedPreferences): number {
  const breaks = detectLongBreaksFromSegment(segment, preferences.longBreakMinimumDuration, preferences.longBreakMaximumDistance);
  if (breaks.length === 0) return 0;
  const points = segment.relativePoints;
  let duration = 0;
  for (const b of breaks) {
    for (let i = b.startIndex + 1; i <= b.endIndex; ++i)
      duration += points[i].durationFromPreviousPoint;
  }
  return duration;
}

export function detectLongBreaksFromTrack(track: Track, minDuration: number, maxDistance: number): {segmentIndex: number; startIndex: number; endIndex: number}[] {
  const result: {segmentIndex: number; startIndex: number; endIndex: number}[] = [];
  for (let i = 0; i < track.segments.length; ++i) {
    for (const b of detectLongBreaksFromSegment(track.segments[i], minDuration, maxDistance)) {
      result.push({segmentIndex: i, startIndex: b.startIndex, endIndex: b.endIndex});
    }
  }
  return result;
}

export function detectLongBreaksFromSegment(segment: Segment, minDuration: number, maxDistance: number): {startIndex: number; endIndex: number}[] {
  const points = segment.relativePoints;
  if (points.length < 2) return [];
  let index = 0;
  const breaks: {startIndex: number; endIndex: number}[] = [];
  while (index < points.length - 1) {
    let startIndex = index;
    let startPoint = points[startIndex];
    while (startPoint.point.time === undefined && startIndex < points.length - 1)  {
      startIndex++;
      startPoint = points[startIndex];
    }
    if (startIndex >= points.length - 1) break;

    let endIndex = startIndex + 1;
    let endPoint = points[endIndex];
    let distance = startPoint.point.distanceTo(endPoint.point.pos);
    let duration = endPoint.durationFromPreviousPoint;
    let lastEligiblePointIndex = endIndex;
    let lastEligiblePointDuration = duration;
    while (endIndex < points.length - 1 && (endPoint.point.time === undefined || distance < maxDistance)) {
      endIndex++;
      endPoint = points[endIndex];
      distance = startPoint.point.distanceTo(endPoint.point.pos);
      duration += endPoint.durationFromPreviousPoint;
      if (distance <= 15) {
        lastEligiblePointIndex = endIndex;
        lastEligiblePointDuration = duration;
      }
    }

    if (lastEligiblePointDuration > minDuration) {
      breaks.push({startIndex, endIndex: lastEligiblePointIndex});
      index = endIndex + 1;
    } else {
      index++;
    }
  }
  return breaks;
}
