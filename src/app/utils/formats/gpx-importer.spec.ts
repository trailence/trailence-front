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
    const imported = GpxImporter.importGpx(file, 'test@example.com', '0');
    const trail = imported.trail;
    expect(trail.name).toBe('Randonnée du 05/06/2023 à 08:58');
    expect(trail.description).toBe('');
    const track = imported.track;
    expect(Math.floor(track.metadata.distance)).toBe(8585);
    expect(track.metadata.positiveElevation).toBe(409);
    expect(track.metadata.negativeElevation).toBe(384);
    expect(track.metadata.highestAltitude).toBe(121);
    expect(track.metadata.lowestAltitude).toBe(49);
    expect(track.metadata.duration).toBe((((3 * 60 + 24) * 60) + 48) * 1000);
  });

});
