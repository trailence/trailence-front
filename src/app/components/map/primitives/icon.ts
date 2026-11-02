import { Point2D } from '@trailence/utils/geometry-utils';
import { MapRenderer } from '../impl/map-renderer';
import { MapPrimitiveSinglePosition } from './primitive';

export interface IconOptions {
  icon: string | SVGSVGElement;
  iconOriginalSize: Point2D;
  iconRenderSize: Point2D;
  iconAnchor: 'center' | 'top-left' | 'top-right' | 'top-center' | 'bottom-left' | 'bottom-right' | 'bottom-center' | 'right-center' | 'left-center';
  rotateOnMouseOver?: boolean;
  interactiveData?: any;
}

export abstract class IconPrimitive<R extends MapRenderer> extends MapPrimitiveSinglePosition<IconOptions, R> {

}
