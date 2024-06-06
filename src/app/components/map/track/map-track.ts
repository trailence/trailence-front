import { Track } from 'src/app/model/track';
import { I18nService } from 'src/app/services/i18n/i18n.service';
import { MapTrackPath } from './map-track-path';
import { Trail } from 'src/app/model/trail';
import { MapTrackWayPoints } from './map-track-way-points';
import { SimplifiedTrackSnapshot } from 'src/app/services/database/track-database';

export class MapTrack {

  constructor(
    private _trail: Trail | undefined,
    private _track: Track | SimplifiedTrackSnapshot,
    color: string,
    smoothFactor: number,
    isRecording: boolean,
    i18n: I18nService,
  ) {
    this._path = new MapTrackPath(_track, color, smoothFactor);
    this._wayPoints = new MapTrackWayPoints(_track, isRecording, i18n);
  }

  private _path: MapTrackPath;
  private _wayPoints: MapTrackWayPoints;

  public addTo(map: L.Map): void {
    this._path.addTo(map);
    this._wayPoints.addTo(map);
  }

  public remove(): void {
    this._path.remove();
    this._wayPoints.remove();
  }

  public get trail(): Trail | undefined { return this._trail; }
  public get track(): Track | SimplifiedTrackSnapshot { return this._track; }

  public get bounds(): L.LatLngBounds | undefined { return this._path.bounds }
  public get color(): string { return this._path.color; }
  public set color(value: string) { this._path.color = value; }

  public showDepartureAndArrivalAnchors(show: boolean = true): void {
    this._wayPoints.showDepartureAndArrival(show);
  }

  public showWayPointsAnchors(show: boolean = true): void {
    this._wayPoints.showWayPoints(show);
  }

}
