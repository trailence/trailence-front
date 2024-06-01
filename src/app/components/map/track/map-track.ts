import { Track } from 'src/app/model/track';
import { I18nService } from 'src/app/services/i18n/i18n.service';
import { MapTrackPath } from './map-track-path';
import { Trail } from 'src/app/model/trail';

export class MapTrack {

  constructor(
    private _trail: Trail | undefined,
    private _track: Track,
    color: string,
    smoothFactor: number,
    isRecording: boolean,
    i18n: I18nService,
  ) {
    this._path = new MapTrackPath(_track, color, smoothFactor);
  }

  private _map?: L.Map;
  private _path: MapTrackPath;

  public addTo(map: L.Map): void {
    this._map = map;
    this._path.addTo(map);
  }

  public remove(): void {
    if (!this._map) return;
    this._path.removeFrom(this._map);
    this._map = undefined;
  }

  public get trail(): Trail | undefined { return this._trail; }
  public get track(): Track { return this._track; }

  public get bounds(): L.LatLngBounds | undefined { return this._path.bounds }
  public get color(): string { return this._path.color; }
  public set color(value: string) { this._path.color = value; }

}
