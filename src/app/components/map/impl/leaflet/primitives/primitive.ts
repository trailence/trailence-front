import * as L from 'leaflet';
import { LeafletPrimitiveEvents } from './events';
import { MapPrimitive } from '@trailence/components/map/primitives/primitive';
import { Leaflet } from '../leaflet';

export interface LeafletPrimitive<O, P extends MapPrimitive<O, Leaflet, P> & LeafletPrimitive<O,P>> {

  readonly leafletEvents: LeafletPrimitiveEvents<O, P>,

  getLayer(): L.Layer | undefined;

}
