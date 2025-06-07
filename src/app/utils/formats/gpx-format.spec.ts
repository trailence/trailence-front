import { HttpClient, provideHttpClient, withInterceptorsFromDi } from '@angular/common/http';
import { TestBed } from '@angular/core/testing';
import { firstValueFrom } from 'rxjs';
import { Photo } from 'src/app/model/photo';
import { Point } from 'src/app/model/point';
import { Segment } from 'src/app/model/segment';
import { Track } from 'src/app/model/track';
import { Trail } from 'src/app/model/trail';
import { PreferencesService } from 'src/app/services/preferences/preferences.service';
import { GpxFormat } from 'src/app/utils/formats/gpx-format';

describe('Test Gpx Format', () => {

  let http: HttpClient;
  let preferencesService: PreferencesService;

  beforeEach(() => {
    TestBed.configureTestingModule({ imports: [], providers: [provideHttpClient(withInterceptorsFromDi())] });
    http = TestBed.inject(HttpClient);
    preferencesService = TestBed.inject(PreferencesService);
  });

  it('Import gpx-001', async () => {
    const file = await firstValueFrom(http.get('/assets/test/gpx-001.gpx', { responseType: 'arraybuffer'}));
    const imported = GpxFormat.importGpx(file, 'test@example.com', '0', preferencesService);
    expect(imported).not.toBeNull();
    const trail = imported.trail;
    expect(trail.name).toBe('Randonnée du 05/06/2023 à 08:58');
    expect(trail.description).toBe('');
    const track = imported.tracks[0];
    expect(Math.floor(track.metadata.distance)).toBe(8585);
    expect(track.metadata.positiveElevation).toBe(409);
    expect(track.metadata.negativeElevation).toBe(384);
    expect(track.metadata.highestAltitude).toBe(122);
    expect(track.metadata.lowestAltitude).toBe(49);
    expect(track.metadata.duration).toBe((((3 * 60 + 24) * 60) + 48) * 1000);
  });

  const compareTrails = (trail1: Trail, trail2: Trail) => {
    expect(trail2.name).toBe(trail1.name);
    expect(trail2.description).toBe(trail1.description);
    expect(trail2.location).toBe(trail1.location);
    expect(trail2.activity).toBe(trail1.activity);
  }

  const comparePoints = (point1: Point, point2: Point) => {
    expect(point2.pos.lat).toBeCloseTo(point1.pos.lat, 5);
    expect(point2.pos.lng).toBeCloseTo(point1.pos.lng, 5);
    expect(point2.ele === undefined).toBe(point1.ele === undefined);
    if (point2.ele !== undefined)
      expect(point2.ele).toBeCloseTo(point1.ele!, 1);
    expect(point2.time === undefined).toBe(point1.time === undefined);
    if (point2.time !== undefined)
      expect(point2.time).toBeCloseTo(point1.time!, 0);
    expect(point2.posAccuracy === undefined).toBe(point1.posAccuracy === undefined);
    if (point2.posAccuracy !== undefined)
      expect(point2.posAccuracy).toBeCloseTo(point1.posAccuracy!, 1);
    expect(point2.eleAccuracy === undefined).toBe(point1.eleAccuracy === undefined);
    if (point2.eleAccuracy !== undefined)
      expect(point2.eleAccuracy).toBeCloseTo(point1.eleAccuracy!, 1);
    expect(point2.heading === undefined).toBe(point1.heading === undefined);
    if (point2.heading !== undefined)
      expect(point2.heading).toBeCloseTo(point1.heading!, 1);
    expect(point2.speed === undefined).toBe(point1.speed === undefined);
    if (point2.speed !== undefined)
      expect(point2.speed).toBeCloseTo(point1.speed!, 1);
  }

  const compareSegments = (segment1: Segment, segment2: Segment) => {
    expect(segment2.points.length).toBe(segment1.points.length);
    for (let i = 0; i < segment1.points.length; ++i)
      comparePoints(segment1.points[i], segment2.points[i]);
  }

  const compareTracks = (track1: Track, track2: Track) => {
    expect(track2.segments.length).toBe(track1.segments.length);
    for (let i = 0; i < track1.segments.length; ++i)
      compareSegments(track1.segments[i], track2.segments[i]);
  }

  it('Import gpx-001, then export, then import again', async () => {
    const file = await firstValueFrom(http.get('/assets/test/gpx-001.gpx', { responseType: 'arraybuffer'}));
    const imported = GpxFormat.importGpx(file, 'test@example.com', '0', preferencesService);
    const exported = await GpxFormat.exportGpx(imported.trail, imported.tracks, [], [], new Map<Photo,string>()).toArrayBuffer();
    const imported2 = GpxFormat.importGpx(exported, 'test@example.com', '0', preferencesService);
    expect(imported2).not.toBeNull();
    compareTrails(imported.trail, imported2.trail);
    expect(imported.tracks.length).toBe(imported2.tracks.length);
    for (let i = 0; i < imported.tracks.length; ++i)
      compareTracks(imported.tracks[i], imported2.tracks[i]);
  });

});
