import { Point2D } from '@trailence/utils/geometry-utils';
import { MapRenderer } from './impl/map-renderer';
import { EarthPoint } from '@trailence/utils/latlng';
import { AppEvent } from '@trailence/utils/events';

export class MapEvents {

  public readonly click = new AppEvent<MapPointerEvent>();
  public readonly mousePosition = new AppEvent<MapPointerEvent>();

}

export interface MapEvent {
  renderer: MapRenderer;
}

export interface MapPointerEvent extends MapEvent {
  viewportPoint: Point2D;
  geographicPoint: EarthPoint;
  nativeEvent: MouseEvent;
}
