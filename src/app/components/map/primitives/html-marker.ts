import { MapRenderer } from '../impl/map-renderer';
import { MapPrimitiveSinglePosition } from './primitive';

export interface HtmlMarkerOptions {
  html: string | HTMLElement,
  anchorPos: 'left' | 'right' | 'bottom' | 'top',
  opacity?: number;
  className?: string;
}

export abstract class HtmlMarkerPrimitive<R extends MapRenderer> extends MapPrimitiveSinglePosition<HtmlMarkerOptions, R> {

}
