import { HttpClient, HttpClientModule } from '@angular/common/http';
import { TestBed } from '@angular/core/testing';
import { firstValueFrom } from 'rxjs';
import { GpxImporter } from 'src/app/utils/formats/gpx-format';
import { TrailDto } from './trail';
import { TrackDto } from './track';
import { Trail } from '../trail';
import { Track } from '../track';

describe('Test Trail and Track DTOs', () => {

  let http: HttpClient;

  beforeEach(() => {
    TestBed.configureTestingModule({imports: [HttpClientModule]});
    http = TestBed.inject(HttpClient);
  });

  it('gpx-001', async () => {
    const file = await firstValueFrom(http.get('/assets/test/gpx-001.gpx', { responseType: 'arraybuffer'}));
    const imported = GpxImporter.importGpx(file, 'test@example.com', '0');
    const trailDto = imported.trail.toDto();
    const trackDto = imported.track.toDto();
    const trail = new Trail(trailDto);
    const track = new Track(trackDto);
    expect(trail.name).toBe(imported.trail.name);
    expect(trail.description).toBe(imported.trail.description);
    expect(Math.floor(track.metadata.distance)).withContext('distance').toBe(Math.floor(imported.track.metadata.distance));
    expect(track.metadata.positiveElevation).withContext('positiveElevation').toBe(imported.track.metadata.positiveElevation);
    expect(track.metadata.negativeElevation).withContext('negativeElevation').toBe(imported.track.metadata.negativeElevation);
    expect(track.metadata.highestAltitude).withContext('highestAltitude').toBe(imported.track.metadata.highestAltitude);
    expect(track.metadata.lowestAltitude).withContext('lowestAltitude').toBe(imported.track.metadata.lowestAltitude);
    expect(track.metadata.duration).withContext('duration').toBe(imported.track.metadata.duration);
  });

});
