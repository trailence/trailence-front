import { HttpClient, provideHttpClient, withInterceptorsFromDi } from '@angular/common/http';
import { TestBed } from '@angular/core/testing';
import { firstValueFrom } from 'rxjs';
import { GpxFormat } from 'src/app/utils/formats/gpx-format';
import { Trail } from '../trail';
import { Track } from '../track';
import { Point } from '../point';
import { PreferencesService } from 'src/app/services/preferences/preferences.service';

describe('Test Trail and Track DTOs', () => {

  let http: HttpClient;
  let preferencesService: PreferencesService;

  beforeEach(() => {
    TestBed.configureTestingModule({ imports: [], providers: [provideHttpClient(withInterceptorsFromDi())] });
    http = TestBed.inject(HttpClient);
    preferencesService = TestBed.inject(PreferencesService);
  });

  it('track to dto to track', async () => {
    const track = new Track({owner: 'test@test.com'}, preferencesService);
    const segment = track.newSegment();
    segment.append({pos: { lat: 1, lng: 2 }, ele: 3, time: 4, posAccuracy: 5, eleAccuracy: 6, heading: 7, speed: 8});
    segment.append({pos: { lat: 10, lng: 20 }, ele: 30, time: 40, posAccuracy: 50, eleAccuracy: 60, heading: 70, speed: 80});
    segment.append({pos: { lat: 10, lng: 20 }, ele: 30, time: 40, posAccuracy: 50, eleAccuracy: 60, heading: 70, speed: 80});
    segment.append({pos: { lat: 1, lng: 2 }, ele: 3, time: 4, posAccuracy: 5, eleAccuracy: 6, heading: 7, speed: 8});
    segment.append({pos: { lat: 1, lng: 2 }, ele: 3, time: 4, posAccuracy: 5, eleAccuracy: 6, heading: 7, speed: 8});
    const dto = track.toDto();
    const track2 = new Track(dto, preferencesService);
    expect(track2.segments.length).toBe(1);
    const segment2 = track2.segments[0];
    expect(segment2.points.length).toBe(5);
    const checkPoint = (point: Point, l: number, n: number, e: number | undefined, t: number | undefined, pa: number | undefined, ea: number | undefined, h: number | undefined, s: number | undefined) => {
      expect(point.pos.lat).toBe(l);
      expect(point.pos.lng).toBe(n);
      expect(point.ele).toBe(e);
      expect(point.time).toBe(t);
      expect(point.posAccuracy).toBe(pa);
      expect(point.eleAccuracy).toBe(ea);
      expect(point.heading).toBe(h);
      expect(point.speed).toBe(s);
    }
    checkPoint(segment2.points[0], 1, 2, 3, 4, 5, 6, 7, 8);
    checkPoint(segment2.points[1], 10, 20, 30, 40, 50, 60, 70, 80);
    checkPoint(segment2.points[2], 10, 20, 30, 40, 50, 60, 70, 80);
    checkPoint(segment2.points[3], 1, 2, 3, 4, 5, 6, 7, 8);
    checkPoint(segment2.points[4], 1, 2, 3, 4, 5, 6, 7, 8);
  })

  it('gpx-001', async () => {
    const file = await firstValueFrom(http.get('/assets/test/gpx-001.gpx', { responseType: 'arraybuffer'}));
    const imported = GpxFormat.importGpx(file, 'test@example.com', '0', preferencesService, undefined, undefined, undefined);
    expect(imported).not.toBeNull();
    expect(imported.tracks.length).toBe(1);
    const trailDto = imported.trail.toDto();
    const trackDto = imported.tracks[0].toDto();
    const trail = new Trail(trailDto);
    const track = new Track(trackDto, preferencesService);
    expect(trail.name).toBe(imported.trail.name);
    expect(trail.description).toBe(imported.trail.description);
    expect(Math.floor(track.metadata.distance)).withContext('distance').toBe(Math.floor(imported.tracks[0].metadata.distance));
    expect(track.metadata.positiveElevation).withContext('positiveElevation').toBe(imported.tracks[0].metadata.positiveElevation);
    expect(track.metadata.negativeElevation).withContext('negativeElevation').toBe(imported.tracks[0].metadata.negativeElevation);
    expect(track.metadata.highestAltitude).withContext('highestAltitude').toBe(imported.tracks[0].metadata.highestAltitude);
    expect(track.metadata.lowestAltitude).withContext('lowestAltitude').toBe(imported.tracks[0].metadata.lowestAltitude);
    expect(track.metadata.duration).withContext('duration').toBe(imported.tracks[0].metadata.duration);
  });

});
