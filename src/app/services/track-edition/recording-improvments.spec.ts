import { HttpClient, provideHttpClient, withInterceptorsFromDi } from '@angular/common/http';
import { TestBed } from '@angular/core/testing';
import { firstValueFrom } from 'rxjs';
import { GpxFormat } from 'src/app/utils/formats/gpx-format';
import { ImprovmentRecordingState, TrackEditionService } from './track-edition.service';
import { Track } from 'src/app/model/track';
import { copyPoint } from 'src/app/model/point';
import { PreferencesService } from '../preferences/preferences.service';

describe('Test improvments while recording', () => {

  let http: HttpClient;
  let trackEdition: TrackEditionService;
  let preferencesService: PreferencesService;

  beforeEach(() => {
    TestBed.configureTestingModule({ imports: [], providers: [provideHttpClient(withInterceptorsFromDi())] });
    http = TestBed.inject(HttpClient);
    trackEdition = TestBed.inject(TrackEditionService);
    preferencesService = TestBed.inject(PreferencesService);
  });
  afterEach(() => {
    TestBed.resetTestingModule();
  });

  it('gpx-001 improvments are same when importing and while recording', async () => {
    const file = await firstValueFrom(http.get('/assets/test/gpx-001.gpx', { responseType: 'arraybuffer'}));
    const imported = GpxFormat.importGpx(file, 'test@example.com', '0', preferencesService, undefined, undefined, undefined);

    const track = imported.tracks[0];
    const improved = trackEdition.applyDefaultImprovments(track);
    const recording = new Track({owner: 'test@example.com'}, preferencesService);
    for (const originalSegment of track.segments) {
      const segment = recording.newSegment();
      const state = new ImprovmentRecordingState();
      for (const originalPoint of originalSegment.points) {
        segment.append(copyPoint(originalPoint));
        trackEdition.applyDefaultImprovmentsForRecordingSegment(segment, state, segment.points.length === originalSegment.points.length);
      }
    }

    for (let i = 0; i < improved.segments.length; ++i) {
      for (let j = 0; j < improved.segments[i].points.length; ++j) {
        const pt1 = improved.segments[i].points[j];
        const pt2 = recording.segments[i].points[j];
        const ctx = 'segment ' + (i + 1) + '/' + improved.segments.length +
          ', point ' + (j + 1) + '/' + improved.segments[i].points.length +
          ', pos ' + pt1.pos.lat + ',' + pt1.pos.lng + ' / ' + pt2.pos.lat + ',' + pt2.pos.lng;
        if (pt1.ele === undefined)
          expect(pt2.ele).withContext(ctx).toBe(undefined);
        else {
          expect(pt2.ele).withContext(ctx).toBeLessThan(pt1.ele + 1);
          expect(pt2.ele).withContext(ctx).toBeGreaterThan(pt1.ele - 1);
        }
      }
    }
  });

});
