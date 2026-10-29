import { EarthPoint } from '@trailence/utils/latlng';
import { MapPrimitive } from '../map-element';
import { Color } from '@trailence/utils/color';

export interface CircleOptions {
  position: EarthPoint,
  radius: number;
  radiusUnit: 'pixel' | 'meter';
  fillColor?: Color;
  strokeColor?: Color;
  strokeWidth?: number;
}

export abstract class Circle implements MapPrimitive {

  constructor(
    public readonly id: string,
    options: CircleOptions
  ) {
    this.options = {...options};
  }

  protected options: CircleOptions;

  public getOptions(): CircleOptions { return {...this.options}; }
  public abstract setOptions(options: CircleOptions): void;

}
