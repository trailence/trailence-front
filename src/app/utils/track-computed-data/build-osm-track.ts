import { Track } from 'src/app/model/track';
import { OsmWaysTrackPoint } from './match-osm-ways';
import { PointDescriptor } from 'src/app/model/point-descriptor';

export function buildOsmTrack(baseTrack: Track, osm: OsmWaysTrackPoint[][]): Track {
  const newTrack = baseTrack.newTrack('osm-match');
  for (const osmSegment of osm) {
    const segment = newTrack.newSegment();
    const points: PointDescriptor[] = osmSegment.map(p => {
      const originalPoint = p.originalSegmentIndex === undefined ? undefined : baseTrack.segments[p.originalSegmentIndex].points[p.originalPointIndex!];
      return {
        pos: p.osmWayPoint ?? originalPoint!.pos,
        ele: originalPoint?.ele,
        time: originalPoint?.time,
      };
    });
    segment.appendMany(points);
  }
  return newTrack;
}
