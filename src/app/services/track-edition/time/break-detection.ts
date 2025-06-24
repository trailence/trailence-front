import { Segment } from 'src/app/model/segment';
import { Track } from 'src/app/model/track';

export function calculateLongBreaksFromTrack(track: Track, longBreakMinimumDuration: number, longBreakMaximumDistance: number): number {
  const segments = track.segments;
  if (segments.length === 0) return 0;
  let breaks = calculateLongBreaksFromSegment(segments[0], 0, longBreakMinimumDuration, longBreakMaximumDistance);
  for (let i = 1; i < segments.length; ++i) {
    const segment = segments[i];
    breaks += calculateLongBreaksFromSegment(segment, i, longBreakMinimumDuration, longBreakMaximumDistance);
  }
  return breaks;
}

export function calculateLongBreaksFromSegment(segment: Segment, segmentIndex: number, longBreakMinimumDuration: number, longBreakMaximumDistance: number): number {
  const breaks = detectLongBreaksFromSegment(segment, segmentIndex, longBreakMinimumDuration, longBreakMaximumDistance);
  if (breaks.length === 0) return 0;
  const points = segment.points;
  let duration = 0;
  for (const b of breaks) {
    let startTime = points[b.startIndex].time;
    let i = b.startIndex;
    while (startTime === undefined && i < b.endIndex) {
      startTime = points[++i].time;
    }
    if (startTime === undefined) continue;
    let endIndex = b.endIndex;
    if (endIndex < points.length - 1) endIndex++;
    let endTime = points[endIndex].time;
    while (endTime === undefined && endIndex < points.length - 1) {
      endTime = points[++endIndex].time;
    }
    if (endTime === undefined) continue;
    duration += (endTime - startTime);
  }
  return duration;
}

export interface BreakPointSection {
  segmentIndex: number;
  startIndex: number;
  endIndex: number;
  pointIndex: number;
}

export function detectLongBreaksFromTrack(track: Track, minDuration: number, maxDistance: number): BreakPointSection[] {
  const result: BreakPointSection[] = [];
  for (let i = 0; i < track.segments.length; ++i) {
    for (const b of detectLongBreaksFromSegment(track.segments[i], i, minDuration, maxDistance)) {
      result.push(b);
    }
  }
  return result;
}

export function detectLongBreaksFromSegment(segment: Segment, segmentIndex: number, minDuration: number, maxDistance: number): BreakPointSection[] { // NOSONAR
  const points = segment.points;
  if (points.length < 2) return [];
  let index = 0;
  const breaks: BreakPointSection[] = [];
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
        duration += endPoint.durationFromPreviousPoint;
      if (distance <= 15) {
        lastEligiblePointIndex = endIndex;
        lastEligiblePointDuration = duration;
      }
    }

    if (lastEligiblePointDuration > minDuration) {
      breaks.push(adjustLongBreakDetected(segment, segmentIndex, maxDistance, startIndex, lastEligiblePointIndex));
      index = endIndex + 1;
    } else {
      index++;
    }
  }
  return breaks;
}

function adjustLongBreakDetected(segment: Segment, segmentIndex: number, maxDistance: number, startIndex: number, endIndex: number): BreakPointSection { // NOSONAR
  // because we use maxDistance, we may have too much points at the beginning and at the end
  if (endIndex - startIndex <= 1) return {segmentIndex, startIndex, endIndex, pointIndex: startIndex};
  let bestPoint = startIndex;
  let bestDiff = segment.points[startIndex].durationFromPreviousPoint;
  for (let i = startIndex + 1; i <= endIndex; ++i) {
    const diff = segment.points[i].durationFromPreviousPoint;
    if (diff !== undefined && (bestDiff === undefined || diff > bestDiff)) {
      bestPoint = i;
      bestDiff = diff;
    }
  }
  let realBestPoint = bestPoint;
  if (bestDiff === undefined) bestPoint = startIndex + Math.floor((endIndex - startIndex) / 2);
  else if (bestPoint > startIndex) bestPoint--;

  let angle, i;
  // adjust startIndex
  if (startIndex === 0) {
    i = 1;
    angle = Math.atan2(segment.points[1].pos.lat - segment.points[0].pos.lat, segment.points[1].pos.lng - segment.points[0].pos.lng);
  } else {
    i = startIndex;
    angle = Math.atan2(segment.points[startIndex].pos.lat - segment.points[startIndex - 1].pos.lat, segment.points[startIndex].pos.lng - segment.points[startIndex - 1].pos.lng);
  }
  while (i < bestPoint) {
    const newAngle = Math.atan2(segment.points[i + 1].pos.lat - segment.points[i].pos.lat, segment.points[i + 1].pos.lng - segment.points[i].pos.lng);
    const toBreakAngle = Math.atan2(segment.points[bestPoint].pos.lat - segment.points[i].pos.lat, segment.points[bestPoint].pos.lng - segment.points[i].pos.lng);
    if (Math.abs(newAngle - angle) > 0.3 && Math.abs(toBreakAngle - newAngle) > 0.3) break;
    i++;
    angle = newAngle;
  }
  if (i <= bestPoint) startIndex = i;

  // adjust endIndex
  if (endIndex === segment.points.length - 1) {
    i = endIndex - 1;
    angle = Math.atan2(segment.points[endIndex - 1].pos.lat - segment.points[endIndex].pos.lat, segment.points[endIndex - 1].pos.lng - segment.points[endIndex].pos.lng);
  } else {
    i = endIndex;
    angle = Math.atan2(segment.points[endIndex].pos.lat - segment.points[endIndex + 1].pos.lat, segment.points[endIndex].pos.lng - segment.points[endIndex + 1].pos.lng);
  }
  while (i > bestPoint) {
    const newAngle = Math.atan2(segment.points[i - 1].pos.lat - segment.points[i].pos.lat, segment.points[i - 1].pos.lng - segment.points[i].pos.lng);
    const fromBreakAngle = Math.atan2(segment.points[i].pos.lat - segment.points[bestPoint].pos.lat, segment.points[i].pos.lng - segment.points[bestPoint].pos.lng);
    if (Math.abs(newAngle - angle) > 0.3 && Math.abs(fromBreakAngle - newAngle) > 0.3) break;
    i--;
    angle = newAngle;
  }
  if (i >= bestPoint) endIndex = i;

  return {segmentIndex, startIndex, endIndex, pointIndex: realBestPoint};
}
