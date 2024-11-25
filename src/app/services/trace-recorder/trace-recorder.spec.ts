import { TestBed } from '@angular/core/testing';
import { TraceRecorderService } from './trace-recorder.service';
import { provideHttpClient, withInterceptorsFromDi } from '@angular/common/http';
import { provideErrorService } from 'test/utils/mock-error-service';
import { filter, firstValueFrom, of } from 'rxjs';
import { provideAuthService } from 'test/utils/mock-auth-service';
import { provideNetworkService } from 'test/utils/mock-network-service';
import { TrailCollectionService } from '../database/trail-collection.service';
import { TrailCollection, TrailCollectionType } from 'src/app/model/trail-collection';
import { GeolocationService } from '../geolocation/geolocation.service';
import { GeolocationState } from '../geolocation/geolocation.interface';
import { PointDto } from 'src/app/model/dto/point';
import { I18nService } from '../i18n/i18n.service';
import { TrackService } from '../database/track.service';
import { DatabaseService } from '../database/database.service';

describe('Test Trace Recorder', () => {

  let recorder: TraceRecorderService;
  let collectionService: TrailCollectionService;
  let trackService: TrackService;
  let geolocation: GeolocationService;
  let geoListener: ((position: PointDto) => void) | undefined = undefined;

  beforeEach(async () => {
    TestBed.configureTestingModule({ imports: [], providers: [
      provideHttpClient(withInterceptorsFromDi()),
      provideErrorService(),
      provideNetworkService(),
      provideAuthService('user@trailence.org')
    ] });
    recorder = TestBed.inject(TraceRecorderService);
    trackService = TestBed.inject(TrackService);

    collectionService = TestBed.inject(TrailCollectionService);
    spyOn(collectionService, 'getMyTrails$').and.returnValue(of(new TrailCollection({
      owner: 'user@trailence.org',
      uuid: '1234',
      version: 1,
      type: TrailCollectionType.MY_TRAILS,
    })));

    geolocation = TestBed.inject(GeolocationService);
    geoListener = undefined;
    spyOn(geolocation, 'getState').and.returnValue(Promise.resolve(GeolocationState.ENABLED));
    spyOn(geolocation, 'watchPosition').and.callFake((notifMessage, listener) => {
      geoListener = listener;
    });
    spyOn(geolocation, 'stopWatching').and.callFake(listener => {
      expect(listener).toBe(geoListener);
      geoListener = undefined;
    });

    await firstValueFrom(TestBed.inject(I18nService).texts$.pipe(
      filter(t => !!t)
    ));
    await firstValueFrom(TestBed.inject(DatabaseService).allLoaded().pipe(filter(l => !!l)));
  });

  it('No point should not create a trail', async () => {
    await recorder.start();
    expect(geoListener).toBeDefined();
    const result = await firstValueFrom(recorder.stop(true));
    expect(result).toBeNull();
    expect(geoListener).toBeUndefined();
  });

  it('Single point should not create a trail', async () => {
    await recorder.start();
    expect(geoListener).toBeDefined();
    geoListener!({l: 10, n: 20, e: 30, t: 1, pa: 1000, ea: 1000});
    const result = await firstValueFrom(recorder.stop(true));
    expect(result).toBeNull();
    expect(geoListener).toBeUndefined();
  });

  it('Bad first point, then better one in less than 5s, should keep the second one', async () => {
    await recorder.start();
    expect(geoListener).toBeDefined();
    geoListener!({l: 10, n: 20, e: 30, t: 1, pa: 1000, ea: 1000});
    geoListener!({l: 100, n: 200, e: 300, t: 4000, pa: 100, ea: 10});
    geoListener!({l: 102, n: 202, e: 302, t: 10000, pa: 100, ea: 10});
    const result = await firstValueFrom(recorder.stop(true));
    expect(geoListener).toBeUndefined();
    expect(result).not.toBeNull();
    const original = await firstValueFrom(trackService.getFullTrackReady$(result!.originalTrackUuid, 'user@trailence.org'));
    expect(original.getAllPositions().length).toBe(2);
    expect(original.departurePoint!.pos.lat).toBe(100);
    expect(original.departurePoint!.pos.lng).toBe(200);
    expect(original.departurePoint!.ele).toBe(300);
    expect(original.arrivalPoint!.pos.lat).toBe(102);
    expect(original.arrivalPoint!.pos.lng).toBe(202);
    expect(original.arrivalPoint!.ele).toBe(302);
  });

});
