import { Trail } from '../../model/trail';
import { Track } from '../../model/track';
import { PointDescriptor } from '../../model/point-descriptor';
import { XmlUtils } from '../xml-utils';
import { WayPoint } from 'src/app/model/way-point';
import { TrailSourceType } from 'src/app/model/dto/trail';
import { BinaryContent } from '../binary-content';
import { PreferencesService } from 'src/app/services/preferences/preferences.service';
import { Photo } from 'src/app/model/photo';
import { PhotoDto } from 'src/app/model/dto/photo';
import { GpxFormatRaw, ImportedTrackRaw } from './gpx-format-raw';
import { OfflineMapService } from 'src/app/services/map/offline-map.service';
import { WorkerService } from 'src/app/worker/web-app';
import { TrackComputedDataCacheService } from 'src/app/services/database/track-computed-data-cache.service';
import { NetworkService } from 'src/app/services/network/network.service';
import { distance } from '../latlng';

export interface ImportedTrail {
  trail: Trail;
  tracks: Track[];
  tags: string[][];
  photos: Partial<PhotoDto>[];
  photosFilenames: Map<Partial<PhotoDto>, string>;
  source?: string;
}

export class GpxFormat {

  public static importGpx(file: ArrayBuffer, user: string, collectionUuid: string, preferencesService: PreferencesService, mapService: OfflineMapService, workerService: WorkerService, trackCacheService: TrackComputedDataCacheService, networkService: NetworkService, trailSourceType: TrailSourceType | undefined, trailSource: string | undefined, trailSourceDate: number | undefined): ImportedTrail[] { // NOSONAR
    const raw = GpxFormatRaw.importGpxRaw(file, user, collectionUuid, trailSourceType, trailSource, trailSourceDate, new DOMParser());
    if (raw.creator === 'Trailence' || raw.tracks.length === 1) {
      // single trail case
      const tracks = raw.tracks.map(trackRaw => {
        if (!raw.trail.name?.length && trackRaw.name?.length) raw.trail.name = trackRaw.name;
        if (!raw.trail.description?.length && trackRaw.description?.length) raw.trail.description = trackRaw.description;
        const track = new Track({owner: user}, false, preferencesService, mapService, workerService, trackCacheService, networkService);
        for (const segmentRaw of trackRaw.segments) {
          const segment = track.newSegment();
          segment.appendMany(segmentRaw);
        }
        for (const wp of trackRaw.wayPoints) {
          track.appendWayPoint(wp);
        }
        return track;
      });
      if (tracks.at(-1)!.wayPoints.length === 0 && raw.wayPoints.length > 0) {
        const track = tracks.at(-1)!;
        for (const wp of raw.wayPoints) {
          track.appendWayPoint(wp);
        }
      }
      return [{
        trail: new Trail({...raw.trail, originalTrackUuid: tracks[0].uuid, currentTrackUuid: tracks.at(-1)!.uuid}),
        tracks,
        tags: raw.tags,
        photos: raw.photos,
        photosFilenames: raw.photosFilenames,
        source: raw.source,
      }];
    }
    // attach waypoints to tracks
    const wpAttachment = new Map<ImportedTrackRaw, WayPoint[]>();
    for (const wp of raw.wayPoints) {
      let bestTracks: ImportedTrackRaw[] = [];
      let bestDistance = -1;
      for (const track of raw.tracks) {
        for (const segment of track.segments) {
          for (const point of segment) {
            const d = Math.floor(distance(wp.point.pos, point.pos) / 2);
            if (d < 13) {
              if (bestDistance === -1 || d < bestDistance) {
                bestTracks = [track];
                bestDistance = d;
              } else if (d === bestDistance) {
                bestTracks.push(track);
              }
            }
          }
        }
      }
      for (const track of bestTracks) {
        let waypoints = wpAttachment.get(track);
        if (!waypoints) {
          wpAttachment.set(track, [wp]);
        } else {
          waypoints.push(wp);
        }
      }
    }
    return raw.tracks.map(trackRaw => {
      const track = new Track({owner: user}, false, preferencesService, mapService, workerService, trackCacheService, networkService);
      for (const segmentRaw of trackRaw.segments) {
        const segment = track.newSegment();
        segment.appendMany(segmentRaw);
      }
      if (trackRaw.wayPoints.length === 0) {
        const trackWaypoints = wpAttachment.get(trackRaw);
        if (trackWaypoints) {
          for (const wp of trackWaypoints) {
            track.appendWayPoint(wp);
          }
        }
      }
      return {
        trail: new Trail({
          ...raw.trail,
          name: trackRaw.name ?? raw.trail.name,
          description: trackRaw.description ?? raw.trail.description,
          originalTrackUuid: track.uuid,
          currentTrackUuid: track.uuid,
        }),
        tracks: [track],
        tags: [], photos: [], photosFilenames: new Map(), source: undefined,
      };
    });
  }

  public static exportGpx(trail: Trail, tracks: Track[], tags: string[][], photos: Photo[], photosFilenames: Map<Photo, string>): BinaryContent { // NOSONAR
    let gpx = '<?xml version="1.0" encoding="UTF-8" standalone="no" ?>\n';
    gpx += '<gpx version="1.1" creator="Trailence" xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance" xmlns="http://www.topografix.com/GPX/1/1" xmlns:ext="https://trailence.org/schemas/gpx_extension/1" xsi:schemaLocation="http://www.topografix.com/GPX/1/1 http://www.topografix.com/GPX/1/1/gpx.xsd">\n';
    gpx += '<metadata>';
      gpx += '<name>' + XmlUtils.escapeHtml(trail.name) + '</name>';
      gpx += '<desc>' + XmlUtils.escapeHtml(trail.description) + '</desc>';
      if (trail.location.length > 0 || tags.length > 0 || photos.length > 0 || trail.activity?.length || trail.sourceType) {
        gpx += '<extensions>';
        if (trail.location.length > 0) {
          gpx += '<ext:location>' + XmlUtils.escapeHtml(trail.location) + '</ext:location>';
        }
        if (trail.activity?.length) {
          gpx += '<ext:activity>' + XmlUtils.escapeHtml(trail.activity) + '</ext:activity>';
        }
        if (trail.sourceType) {
          gpx += '<ext:source><type>' + XmlUtils.escapeHtml(trail.sourceType) + '</type>';
          if (trail.sourceDate) gpx += '<date>' + trail.sourceDate + '</date>';
          if (trail.source) gpx += '<value>' + XmlUtils.escapeHtml(trail.source) + '</value>';
          gpx += '</ext:source>';
        }
        if (trail.followedOwner && trail.followedUuid) {
          gpx += '<ext:followed_trail><owner>' + XmlUtils.escapeHtml(trail.followedOwner) + '</owner><uuid>' + trail.followedUuid + '</uuid></ext:followed_trail>';
        }
        if (trail.followedUrl) {
          gpx += '<ext:followed_url>' + XmlUtils.escapeHtml(trail.followedUrl) + '</ext:followed_url>';
        }
        if (tags.length > 0) {
          gpx += '<ext:tags>';
          for (const tag of tags) {
            gpx += '<ext:tag>';
            for (const name of tag) {
              gpx += '<ext:tagname>' + XmlUtils.escapeHtml(name) + '</ext:tagname>';
            }
            gpx += '</ext:tag>';
          }
          gpx += '</ext:tags>';
        }
        if (photos.length > 0) {
          gpx += '<ext:photos>';
          for (const photo of photos) {
            gpx += '<ext:photo';
            gpx += ' filename="' + photosFilenames.get(photo)! + '"';
            if (photo.dateTaken) gpx += ' date="' + photo.dateTaken + '"';
            if (photo.latitude !== undefined) gpx += ' lat="' + photo.latitude + '"';
            if (photo.longitude !== undefined) gpx += ' lng="' + photo.longitude + '"';
            gpx += ' index="' + photo.index + '"';
            gpx += ' cover="' + photo.isCover + '"';
            gpx += '>';
            gpx += XmlUtils.escapeHtml(photo.description);
            gpx += '</ext:photo>';
          }
          gpx += '</ext:photos>';
        }
        gpx += '</extensions>';
      }
    gpx += '</metadata>\n';
    for (const track of tracks) {
      gpx += '<trk>';
      for (const segment of track.segments) {
        gpx += '<trkseg>';
        for (const point of segment.points) {
          gpx += this.writePoint(point, 'trkpt');
        }
        gpx += '</trkseg>';
      }
      if (tracks.length > 1 && track.wayPoints.length > 0) {
        gpx += '<extensions>';
        for (const wp of track.wayPoints) {
          this.writePoint(wp, 'ext:wpt');
        }
        gpx += '</extensions>';
      }
      gpx += '</trk>\n';
    }
    if (tracks.at(-1)!.wayPoints.length > 0) {
      for (const wp of tracks.at(-1)!.wayPoints) {
        gpx += this.writePoint(wp, 'wpt');
      }
    }
    gpx += '</gpx>';
    const result = new BinaryContent(new TextEncoder().encode(gpx).buffer, 'application/gpx+xml');
    return result;
  }

  private static writePoint(point: PointDescriptor | WayPoint, elementName: string): string { // NOSONAR
    const pt = point instanceof WayPoint ? point.point : point;
    const wp = point instanceof WayPoint ? point : undefined;
    let gpx = '<' + elementName;
    gpx += ' lat="' + pt.pos.lat.toFixed(7) + '" lon="' + pt.pos.lng.toFixed(7) + '">';
    if (pt.ele !== undefined) {
      gpx += '<ele>' + pt.ele.toFixed(1) + '</ele>';
    }
    if (pt.time !== undefined) {
      gpx += '<time>' + new Date(pt.time).toISOString() + '</time>';
    }
    if (wp?.name && wp.name.length > 0) {
      gpx += '<name>' + XmlUtils.escapeHtml(wp.name) + '</name>';
    }
    if (wp?.description && wp.description.length > 0) {
      gpx += '<desc>' + XmlUtils.escapeHtml(wp.description) + '</desc>';
    }
    if (pt.posAccuracy !== undefined) {
      gpx += '<hdop>' + pt.posAccuracy.toFixed(2) + '</hdop>';
    }
    if (pt.eleAccuracy !== undefined) {
      gpx += '<vdop>' + pt.eleAccuracy.toFixed(2) + '</vdop>';
    }
    if (pt.heading !== undefined || pt.speed !== undefined) {
      gpx += '<extensions>';
      if (pt.heading) {
        gpx += '<ext:heading>' + pt.heading.toFixed(2) + '</ext:heading>';
      }
      if (pt.speed) {
        gpx += '<ext:speed>' + pt.speed.toFixed(2) + '</ext:speed>';
      }
      gpx += '</extensions>';
    }
    gpx += '</' + elementName + '>';
    return gpx;
  }

}
