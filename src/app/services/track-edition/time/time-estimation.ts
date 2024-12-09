import { Segment } from 'src/app/model/segment';
import { Track } from 'src/app/model/track';
import { ComputedPreferences } from '../../preferences/preferences';

export function estimateTimeForTrack(track: Track, preferences: ComputedPreferences): number {
  let total = 0;
  for (const segment of track.segments)
    total += estimateTimeForSegment(segment, preferences);
  return total;
}

export function estimateTimeForSegment(segment: Segment, preferences: ComputedPreferences): number {
  let total = 0;
  let duration = 0;
  let durationSincePeviousBreak = 0;
  const nb = segment.points.length;
  for (let i = 1; i < nb; ++i) {
    const sp = segment.points[i];
    duration += sp.durationFromPreviousPoint ?? 0;
    durationSincePeviousBreak += sp.durationFromPreviousPoint ?? 0;
    const distance = sp.distanceFromPreviousPoint;
    if (distance === 0) continue;
    const elevation = sp.elevationFromPreviousPoint ?? 0;
    let baseSpeed = preferences.estimatedBaseSpeed;
    const hrs = Math.floor(duration / (60 * 60 * 1000)) - 2;
    if (hrs > 0) baseSpeed -= 100 * Math.min(hrs, 5);
    // a speed < 1000 probably means an invalid elevation...
    const speedMetersByHour = Math.min(baseSpeed - 500, Math.max(1000, baseSpeed * Math.exp(-3.5 * Math.abs(elevation / distance + 0.05))));
    total += distance * (60 * 60 * 1000) / speedMetersByHour;
    if (durationSincePeviousBreak >= 60 * 60 * 1000) {
      total += (hrs > 0 ? 5 : 3) * 60 * 1000;
      durationSincePeviousBreak = 0;
    }
  }
  if (total > 15 * 60 * 1000) {
    // round to 5 minutes
    const _5minutes = total % (5 * 60 * 1000);
    if (_5minutes > 0) total += 5 * 60 * 1000 - _5minutes;
  }
  return total;
}
