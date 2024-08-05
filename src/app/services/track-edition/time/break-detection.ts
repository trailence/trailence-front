import { Segment } from 'src/app/model/segment';
import { Track } from 'src/app/model/track';
import { ComputedPreferences } from '../../preferences/preferences';

export function calculateLongBreaksFromTrack(track: Track, preferences: ComputedPreferences): number {
  const segments = track.segments;
  if (segments.length === 0) return 0;
  let previousSegment = segments[0];
  let breaks = calculateLongBreaksFromSegment(previousSegment, preferences);
  for (let i = 1; i < segments.length; ++i) {
    const segment = segments[i];
    const segmentStart = segment.startDate;
    if (segmentStart === undefined) continue;
    const previousEnd = previousSegment.endDate;
    if (previousEnd !== undefined) breaks += segmentStart - previousEnd;
    breaks += calculateLongBreaksFromSegment(segment, preferences);
    previousSegment = segment;
  }
  return breaks;
}

export function calculateLongBreaksFromSegment(segment: Segment, preferences: ComputedPreferences): number {
  const points = segment.relativePoints;
  if (points.length < 2) return 0;
  let index = 0;
  let breaks = 0;
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
    let distance = endPoint.distanceFromPreviousPoint;
    let duration = endPoint.durationFromPreviousPoint;
    while (endIndex < points.length - 1 && (endPoint.point.time === undefined || distance < preferences.longBreakMaximumDistance)) {
      endIndex++;
      endPoint = points[endIndex];
      distance += endPoint.distanceFromPreviousPoint;
      duration += endPoint.durationFromPreviousPoint;
    }

    if (duration > preferences.longBreakMinimumDuration) {
      breaks += duration - preferences.longBreakMinimumDuration;
    }
    index = endIndex;
  }
  return breaks;
}
