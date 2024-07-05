import { Segment } from 'src/app/model/segment';
import { Track } from 'src/app/model/track';

export function applyElevationThresholdToTrack(track: Track, threshold: number): void {
  for (const segment of track.segments)
    applyElevationThresholdToSegment(segment, threshold);
}

export function applyElevationThresholdToSegment(segment: Segment, threshold: number): void {
  const points = segment.points;
  if (points.length < 3) return;
  let previous = points[0].ele;
  let previousIndex = 0;
  for (let i = 1; i < points.length - 1; ++i) {
    const ele = points[i].ele;
    if (ele) {
      if (previous === undefined) {
        previous = ele;
        previousIndex = i;
      } else {
        const diff = ele - previous;
        if (diff >= threshold || -diff >= threshold) {
          const nb = i - previousIndex;
          for (let j = previousIndex + 1; j < i; ++j) {
            points[j].ele = previous + (diff * (j - previousIndex) / nb)
          }
          previous = ele;
          previousIndex = i;
        }
      }
    }
  }
}
