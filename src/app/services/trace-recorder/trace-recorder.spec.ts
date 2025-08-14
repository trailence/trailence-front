import { TestBed } from '@angular/core/testing';
import { TraceRecorderService } from './trace-recorder.service';
import { provideHttpClient, withInterceptorsFromDi } from '@angular/common/http';
import { provideErrorService } from 'test/utils/mock-error-service';
import { BehaviorSubject, firstValueFrom, of } from 'rxjs';
import { provideAuthService } from 'test/utils/mock-auth-service';
import { provideNetworkService } from 'test/utils/mock-network-service';
import { TrailCollectionService } from '../database/trail-collection.service';
import { TrailCollection } from 'src/app/model/trail-collection';
import { GeolocationService } from '../geolocation/geolocation.service';
import { GeolocationState } from '../geolocation/geolocation.interface';
import { PointDto } from 'src/app/model/dto/point';
import { I18nService } from '../i18n/i18n.service';
import { TrackService } from '../database/track.service';
import { DatabaseService } from '../database/database.service';
import { AuthService } from '../auth/auth.service';
import { AuthResponse } from '../auth/auth-response';
import { filterDefined } from 'src/app/utils/rxjs/filter-defined';
import { TrailCollectionType } from 'src/app/model/dto/trail-collection';

describe('Test Trace Recorder', () => {

  let userEmail: string;
  let testCount = 1;
  let recorder: TraceRecorderService;
  let collectionService: TrailCollectionService;
  let trackService: TrackService;
  let geolocation: GeolocationService;
  let geoListener: ((position: PointDto) => void) | undefined = undefined;

  beforeEach(async () => {
    userEmail = 'user' + Date.now() + '_' + (testCount++) + '@trailence.org';
    TestBed.configureTestingModule({ imports: [], providers: [
      provideHttpClient(withInterceptorsFromDi()),
      provideErrorService(),
      provideNetworkService(),
      provideAuthService(userEmail)
    ]});
    recorder = TestBed.inject(TraceRecorderService);
    trackService = TestBed.inject(TrackService);

    collectionService = TestBed.inject(TrailCollectionService);
    spyOn(collectionService, 'getMyTrails$').and.returnValue(of(new TrailCollection({
      owner: userEmail,
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

    await firstValueFrom(TestBed.inject(I18nService).texts$.pipe(filterDefined()));
    await firstValueFrom(TestBed.inject(DatabaseService).allLoaded().pipe(filterDefined()));
  });

  afterEach(() => {
    (TestBed.inject(AuthService).auth$ as BehaviorSubject<AuthResponse | null>).next(null);
    TestBed.resetTestingModule();
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

    const original = await firstValueFrom(trackService.getFullTrackReady$(result!.originalTrackUuid, userEmail));
    expect(original.getAllPositions().length).toBe(2);
    expect(original.departurePoint!.pos.lat).toBe(100);
    expect(original.departurePoint!.pos.lng).toBe(200);
    expect(original.departurePoint!.ele).toBe(300);
    expect(original.arrivalPoint!.pos.lat).toBe(102);
    expect(original.arrivalPoint!.pos.lng).toBe(202);
    expect(original.arrivalPoint!.ele).toBe(302);

    const improved = await firstValueFrom(trackService.getFullTrackReady$(result!.currentTrackUuid, userEmail));
    expect(improved.getAllPositions().length).toBe(2);
    expect(improved.departurePoint!.pos.lat).toBe(100);
    expect(improved.departurePoint!.pos.lng).toBe(200);
    expect(improved.departurePoint!.ele).toBe(300);
    expect(improved.arrivalPoint!.pos.lat).toBe(102);
    expect(improved.arrivalPoint!.pos.lng).toBe(202);
    expect(improved.arrivalPoint!.ele).toBe(302);
  });

  it('Points in a short area, and a short time: only the best position accuracy and the best elevation accuracy are kept', async () => {
    await recorder.start();
    expect(geoListener).toBeDefined();
    // first point bad point
    geoListener!({l: 41, n: 6, e: 100, t: 1, pa: 10000, ea: 10000});
    // then a far better point, even 10 seconds later => should update the first point
    geoListener!({l: 41.1, n: 6.1, e: 10, t: 10000, pa: 100, ea: 100});
    // then a second point far enough
    geoListener!({l: 41.854500, n: 6.170560, e: 150, t: 30000, pa: 100, ea: 100});
    // then a new point close to it => should update it
    geoListener!({l: 41.854501, n: 6.170561, e: 160, t: 30100, pa: 110, ea: 90}); // => elevation is better, not position
    // then several in short time and distance
    geoListener!({l: 41.854502, n: 6.170562, e: 140, t: 30200, pa: 90, ea: 101});
    geoListener!({l: 41.854503, n: 6.170563, e: 170, t: 30300, pa: 100, ea: 92});
    geoListener!({l: 41.854504, n: 6.170564, e: 130, t: 30400, pa: 80, ea: 100});
    geoListener!({l: 41.854505, n: 6.170565, e: 180, t: 30500, pa: 120, ea: 70}); // best ele
    geoListener!({l: 41.854506, n: 6.170566, e: 120, t: 30600, pa: 90, ea: 75});
    geoListener!({l: 41.854507, n: 6.170567, e: 190, t: 30700, pa: 79, ea: 76}); // best pos
    geoListener!({l: 41.854508, n: 6.170568, e: 110, t: 30800, pa: 81, ea: 85});
    geoListener!({l: 41.854509, n: 6.170569, e: 100, t: 30900, pa: 100, ea: 100});
    // end
    const result = await firstValueFrom(recorder.stop(true));
    expect(geoListener).toBeUndefined();
    expect(result).not.toBeNull();

    const original = await firstValueFrom(trackService.getFullTrackReady$(result!.originalTrackUuid, userEmail));
    expect(original.segments.length).toBe(1);
    let points = original.segments[0].points;
    expect(points.length).toBe(3);
    // first point original should really be the first point
    expect(points[0].pos.lat).toBe(41);
    expect(points[0].pos.lng).toBe(6);
    expect(points[0].ele).toBe(100);
    // second point original should really be the second received
    expect(points[1].pos.lat).toBe(41.1);
    expect(points[1].pos.lng).toBe(6.1);
    expect(points[1].ele).toBe(10);
    // last point should be the best accuracy of subsequent positions received
    expect(points[2].pos.lat).toBe(41.854507);
    expect(points[2].pos.lng).toBe(6.170567);
    expect(points[2].ele).toBe(180);

    const improved = await firstValueFrom(trackService.getFullTrackReady$(result!.currentTrackUuid, userEmail));
    expect(improved.segments.length).toBe(1);
    points = improved.segments[0].points;
    expect(points.length).toBe(3);
    // first point should be the one 10 seconds later because far better
    expect(points[0].pos.lat).toBe(41.1);
    expect(points[0].pos.lng).toBe(6.1);
    expect(points[0].ele).toBe(10);
    // second point should be the best accuracy from the 2 subsequent positions received
    expect(points[1].pos.lat).toBe(41.854500);
    expect(points[1].pos.lng).toBe(6.170560);
    expect(points[1].ele).toBe(160);
    // last point should be the best accuracy of subsequent positions received
    expect(points[2].pos.lat).toBe(41.854507);
    expect(points[2].pos.lng).toBe(6.170567);
    expect(points[2].ele).toBe(180);
  });

  it('Pause and resume, segments with less than 2 points are removed', async () => {
    await recorder.start();
    expect(geoListener).toBeDefined();
    // segment 1: 3 points
    geoListener!({l: 41, n: 6, e: 100, t: 1, pa: 10, ea: 10});
    geoListener!({l: 41.1, n: 6.1, e: 101, t: 10000, pa: 10, ea: 10});
    geoListener!({l: 41.2, n: 6.2, e: 102, t: 20000, pa: 10, ea: 10});
    // pause
    recorder.pause();
    expect(geoListener).toBeUndefined();
    // resume
    await recorder.resume();
    expect(geoListener).toBeDefined();
    // segment 2: no position
    // pause and resume
    recorder.pause();
    expect(geoListener).toBeUndefined();
    await recorder.resume();
    expect(geoListener).toBeDefined();
    // segment 3: 2 points
    geoListener!({l: 41, n: 6, e: 100, t: 1, pa: 10, ea: 10});
    geoListener!({l: 41.1, n: 6.1, e: 101, t: 10000, pa: 10, ea: 10});
    // pause and resume
    recorder.pause();
    expect(geoListener).toBeUndefined();
    await recorder.resume();
    expect(geoListener).toBeDefined();
    // segment 4: 1 point
    geoListener!({l: 41, n: 6, e: 100, t: 1, pa: 10, ea: 10});
    // pause and resume
    recorder.pause();
    expect(geoListener).toBeUndefined();
    await recorder.resume();
    expect(geoListener).toBeDefined();
    // segment 5: no point
    // stop
    const result = await firstValueFrom(recorder.stop(true));
    expect(geoListener).toBeUndefined();
    expect(result).not.toBeNull();

    const original = await firstValueFrom(trackService.getFullTrackReady$(result!.originalTrackUuid, userEmail));
    expect(original.segments.length).toBe(2);
    expect(original.segments[0].points.length).toBe(3);
    expect(original.segments[1].points.length).toBe(2);

    const improved = await firstValueFrom(trackService.getFullTrackReady$(result!.currentTrackUuid, userEmail));
    expect(improved.segments.length).toBe(2);
    expect(improved.segments[0].points.length).toBe(3);
    expect(improved.segments[1].points.length).toBe(2);
  });

});
