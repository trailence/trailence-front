import { Segment } from 'src/app/model/segment';
import { Track } from 'src/app/model/track';
import { ComputedPreferences } from '../../preferences/preferences';
import { Point } from 'src/app/model/point';

export function estimateTimeForTrack(track: Track, preferences: ComputedPreferences): number {
  let total = 0;
  for (const segment of track.segments)
    total += estimateTimeForSegment(segment, preferences);
  return total;
}

export const ESTIMATED_SMALL_BREAK_EVERY = 60 * 60 * 1000;

export function estimateTimeForSegment(segment: Segment, preferences: ComputedPreferences): number {
  let duration = 0;
  let durationSincePeviousBreak = 0;
  const segmentDuration = segment.duration;
  const nb = segment.points.length;
  for (let i = 1; i < nb; ++i) {
    const sp = segment.points[i];
    const distance = sp.distanceFromPreviousPoint;
    if (distance === 0) continue;
    const speedMetersByHour = estimateSpeedInMetersByHour(sp, duration, preferences);
    const estimatedTime = speedMetersByHour > 0 ? distance * (60 * 60 * 1000) / speedMetersByHour : 0;
    duration += estimatedTime;
    durationSincePeviousBreak += estimatedTime;
    if (durationSincePeviousBreak >= ESTIMATED_SMALL_BREAK_EVERY && (!segmentDuration || segmentDuration - duration > ESTIMATED_SMALL_BREAK_EVERY)) {
      duration += estimateSmallBreakTime(duration);
      durationSincePeviousBreak = 0;
    }
  }
  if (duration > 15 * 60 * 1000) {
    // round to 5 minutes
    const _5minutes = duration % (5 * 60 * 1000);
    if (_5minutes > 0) duration += 5 * 60 * 1000 - _5minutes;
  }
  return duration;
}

export function estimateSpeedInMetersByHour(point: Point, durationSinceStart: number, preferences: ComputedPreferences): number {
  let baseSpeed = preferences.estimatedBaseSpeed;
  const hrs = Math.floor(durationSinceStart / (60 * 60 * 1000));
  // after 3 hours, reduce speed by 1%, then 1% more every 2 hours, with a maximum of 5%
  if (hrs > 2) {
    let percent = 0.01;
    if (hrs > 4) percent += 0.01 * (hrs - 3) / 2;
    percent = Math.min(0.05, percent);
    baseSpeed -= baseSpeed * percent;
  }
  const elevation = point.elevationFromPreviousPoint ?? 0;
  const distance = point.distanceFromPreviousPoint;
    // a speed < 1000 probably means an invalid elevation...
  return Math.min(baseSpeed - 500, Math.max(1000, baseSpeed * Math.exp(-3.5 * Math.abs(elevation / distance + 0.05))));
}

export function estimateSmallBreakTime(durationSinceStart: number): number {
  if (durationSinceStart >= 3 * 60 * 60 * 1000) return 3 * 60 * 1000;
  return 2 * 60 * 1000;
}
