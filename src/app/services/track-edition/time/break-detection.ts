import { Segment } from 'src/app/model/segment';
import { Track } from 'src/app/model/track';
import { ComputedPreferences } from '../../preferences/preferences';

export function calculateLongBreaksFromTrack(track: Track, preferences: ComputedPreferences): number {
  const segments = track.segments;
  if (segments.length === 0) return 0;
  let breaks = calculateLongBreaksFromSegment(segments[0], preferences);
  for (let i = 1; i < segments.length; ++i) {
    const segment = segments[i];
    breaks += calculateLongBreaksFromSegment(segment, preferences);
  }
  return breaks;
}

export function calculateLongBreaksFromSegment(segment: Segment, preferences: ComputedPreferences): number {
  const breaks = detectLongBreaksFromSegment(segment, preferences.longBreakMinimumDuration, preferences.longBreakMaximumDistance);
  if (breaks.length === 0) return 0;
  const points = segment.points;
  let duration = 0;
  for (const b of breaks) {
    for (let i = b.startIndex + 1; i <= b.endIndex; ++i) {
      const d = points[i].durationFromPreviousPoint;
      if (d !== undefined)
        duration += d;
    }
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

export function detectLongBreaksFromSegment(segment: Segment, minDuration: number, maxDistance: number): {startIndex: number; endIndex: number}[] { // NOSONAR
  const points = segment.points;
  if (points.length < 2) return [];
  let index = 0;
  const breaks: {startIndex: number; endIndex: number}[] = [];
  while (index < points.length - 1) {
    let startIndex = index;
    let startPoint = points[startIndex];
    while (startPoint.time === undefined && startIndex < points.length - 1)  {
      startIndex++;
      startPoint = points[startIndex];
    }
    if (startIndex >= points.length - 1) break;

    let endIndex = startIndex + 1;
    let endPoint = points[endIndex];
    let distance = startPoint.distanceTo(endPoint.pos);
    let duration = endPoint.durationFromPreviousPoint ?? 0;
    let lastEligiblePointIndex = endIndex;
    let lastEligiblePointDuration = duration;
    while (endIndex < points.length - 1 && (endPoint.time === undefined || distance < maxDistance)) {
      endIndex++;
      endPoint = points[endIndex];
      distance = startPoint.distanceTo(endPoint.pos);
      if (endPoint.durationFromPreviousPoint !== undefined)
        duration += endPoint.durationFromPreviousPoint!;
      if (distance <= 15) {
        lastEligiblePointIndex = endIndex;
        lastEligiblePointDuration = duration;
      }
    }

    if (lastEligiblePointDuration > minDuration) {
      breaks.push(adjustLongBreakDetected(segment, maxDistance, startIndex, lastEligiblePointIndex));
      index = endIndex + 1;
    } else {
      index++;
    }
  }
  return breaks;
}

function adjustLongBreakDetected(segment: Segment, maxDistance: number, startIndex: number, endIndex: number): {startIndex: number, endIndex: number} { // NOSONAR
  // because we use maxDistance, we may have too much points at the beginning and at the end
  if (endIndex - startIndex <= 1) return {startIndex, endIndex};
  // adjust startIndex
  let distance = 0;
  const startTime = segment.points[startIndex].time;
  if (startTime) {
    let index = startIndex + 1;
    for (; index < endIndex; ++index) {
      const point = segment.points[index];
      const dist = point.distanceFromPreviousPoint;
      distance += dist;
      if (distance >= maxDistance) {
        index--;
        break;
      }
      const maxTimeDiff = distance * 1.0 * 60 * 60;
      if (point.time && point.time - startTime > maxTimeDiff) {
        index--;
        break;
      }
    }
    startIndex = index;
  }
  // adjust endIndex
  distance = 0;
  const endTime = segment.points[endIndex].time;
  if (endTime) {
    let index = endIndex - 1;
    for (; index > startIndex; --index) {
      const point = segment.points[index];
      const dist = point.nextPoint!.distanceFromPreviousPoint;
      distance += dist;
      if (distance >= maxDistance) {
        index++;
        break;
      }
      const maxTimeDiff = distance * 1.0 * 60 * 60;
      if (point.time && endTime - point.time > maxTimeDiff) {
        index++;
        break;
      }
    }
    endIndex = index;
  }
  if (endIndex < startIndex) return {startIndex: endIndex, endIndex: startIndex};
  return {startIndex, endIndex};
}
