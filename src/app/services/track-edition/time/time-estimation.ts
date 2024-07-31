import { Segment } from 'src/app/model/segment';
import { Track } from 'src/app/model/track';

export function estimateTimeForTrack(track: Track): number {
  let total = 0;
  for (const segment of track.segments)
    total += estimateTimeForSegment(segment);
  return total;
}

export function estimateTimeForSegment(segment: Segment): number {
  let total = 0;
  let duration = 0;
  let durationSincePeviousBreak = 0;
  const nb = segment.relativePoints.length;
  for (let i = 1; i < nb; ++i) {
    const sp = segment.relativePoints[i];
    duration += sp.durationFromPreviousPoint;
    durationSincePeviousBreak += sp.durationFromPreviousPoint;
    const distance = sp.distanceFromPreviousPoint;
    const elevation = sp.elevationFromPreviousPoint !== undefined ? sp.elevationFromPreviousPoint : 0;
    let baseSpeed = 5000; // TODO from a configuration
    const hrs = Math.floor(duration / (60 * 60 * 1000)) - 2;
    if (hrs > 0) baseSpeed -= 100 * Math.min(hrs, 5);
    const speedMetersByHour = Math.min(baseSpeed - 500, baseSpeed * Math.exp(-3.5 * Math.abs(elevation / distance + 0.05)));
    total += distance * (60 * 60 * 1000) / speedMetersByHour;
    if (durationSincePeviousBreak >= 60 * 60 * 1000) {
      total += (hrs > 0 ? 5 : 3) * 60 * 1000;
      durationSincePeviousBreak = 0;
    }
  }
  // round to 5 minutes
  const _5minutes = total % (5 * 60 * 1000);
  if (_5minutes > 0) total += 5 * 60 * 1000 - _5minutes;
  return total;
}
