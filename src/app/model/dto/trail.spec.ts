import { HttpClient, HttpClientModule } from '@angular/common/http';
import { TestBed } from '@angular/core/testing';
import { firstValueFrom } from 'rxjs';
import { GpxImporter } from 'src/app/utils/formats/gpx-format';
import { TrailDto } from './trail';
import { TrackDto } from './track';

describe('Test GpxImporter', () => {

  let http: HttpClient;

  beforeEach(() => {
    TestBed.configureTestingModule({imports: [HttpClientModule]});
    http = TestBed.inject(HttpClient);
  });

  it('gpx-001', async () => {
    const file = await firstValueFrom(http.get('/assets/test/gpx-001.gpx', { responseType: 'arraybuffer'}));
    const originalTrail = GpxImporter.importGpx(file);
    const trailDto = TrailDto.of(originalTrail);
    const trackDto = TrackDto.of(originalTrail.track);
    const trail = trailDto.toTrail();
    trackDto.toTrack(trail.track);
    expect(trail.name).toBe(originalTrail.name);
    expect(trail.description).toBe(originalTrail.description);
    expect(Math.floor(trail.track.metadata.distance)).toBe(Math.floor(originalTrail.track.metadata.distance));
    expect(trail.track.metadata.positiveElevation).toBe(originalTrail.track.metadata.positiveElevation);
    expect(trail.track.metadata.negativeElevation).toBe(originalTrail.track.metadata.negativeElevation);
    expect(trail.track.metadata.highestAltitude).toBe(originalTrail.track.metadata.highestAltitude);
    expect(trail.track.metadata.lowestAltitude).toBe(originalTrail.track.metadata.lowestAltitude);
    expect(trail.track.metadata.duration).toBe(originalTrail.track.metadata.duration);
  });

});
