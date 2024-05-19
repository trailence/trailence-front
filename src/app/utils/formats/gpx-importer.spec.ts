import { HttpClient, HttpClientModule } from '@angular/common/http';
import { TestBed } from '@angular/core/testing';
import { firstValueFrom } from 'rxjs';
import { GpxImporter } from 'src/app/utils/formats/gpx-format';

describe('Test GpxImporter', () => {

  let http: HttpClient;

  beforeEach(() => {
    TestBed.configureTestingModule({imports: [HttpClientModule]});
    http = TestBed.inject(HttpClient);
  });

  it('gpx-001', async () => {
    const file = await firstValueFrom(http.get('/assets/test/gpx-001.gpx', { responseType: 'arraybuffer'}));
    const trail = GpxImporter.importGpx(file);
    expect(trail.name).toBe('Randonnée du 05/06/2023 à 08:58');
    expect(trail.description).toBe('');
    expect(Math.floor(trail.track.metadata.distance)).toBe(8585);
    expect(trail.track.metadata.positiveElevation).toBe(409);
    expect(trail.track.metadata.negativeElevation).toBe(384);
    expect(trail.track.metadata.highestAltitude).toBe(121);
    expect(trail.track.metadata.lowestAltitude).toBe(49);
    expect(trail.track.metadata.duration).toBe((((3 * 60 + 24) * 60) + 48) * 1000);
  });

});
