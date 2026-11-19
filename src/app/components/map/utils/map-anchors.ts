import { EarthPoint } from '@trailence/utils/latlng';
import { MapRenderer } from '../impl/map-renderer';
import { IconOptions, IconPrimitive } from '../primitives/icon';
import { anchorArrivalBorderColor, anchorArrivalFillColor, anchorArrivalTextColor, anchorBreakBorderColor, anchorBreakTextColor, anchorDABorderColor, anchorDATextColor, anchorDepartureBorderColor, anchorDepartureFillColor, anchorDepartureTextColor, anchorSelectedPointBorderColor, anchorSelectedPointFillColor, anchorTextColor, createMapAchorSvgString, MAP_ANCHOR_SVG_SIZE } from './map-anchor-svg';
import { Color } from '@trailence/utils/color';

export const MAP_ANCHOR_RENDER_SIZE = 40;

export function createDAIcon(id: string, renderer: MapRenderer, position: EarthPoint, texts: any): IconPrimitive<MapRenderer, any> {
  return renderer.createIcon(id, position, getDAIconOptions(texts));
}
export function getDAIconOptions(texts: any): IconOptions {
  return {
    icon: createMapAchorSvgString(anchorDABorderColor, texts.way_points.DA, anchorDATextColor, anchorDepartureFillColor, anchorArrivalFillColor),
    iconOriginalSize: {x: MAP_ANCHOR_SVG_SIZE, y: MAP_ANCHOR_SVG_SIZE},
    iconRenderSize: {x: MAP_ANCHOR_RENDER_SIZE, y: MAP_ANCHOR_RENDER_SIZE},
    iconAnchor: 'bottom-center',
    rotateOnMouseOver: true,
  };
}

export function createDIcon(id: string, renderer: MapRenderer, position: EarthPoint, texts: any): IconPrimitive<MapRenderer, any> {
  return renderer.createIcon(id, position, getDIconOptions(texts));
}
export function getDIconOptions(texts: any): IconOptions {
  return {
    icon: createMapAchorSvgString(anchorDepartureBorderColor, texts.way_points.D, anchorDepartureTextColor, anchorDepartureFillColor),
    iconOriginalSize: {x: MAP_ANCHOR_SVG_SIZE, y: MAP_ANCHOR_SVG_SIZE},
    iconRenderSize: {x: MAP_ANCHOR_RENDER_SIZE, y: MAP_ANCHOR_RENDER_SIZE},
    iconAnchor: 'bottom-center',
    rotateOnMouseOver: true,
  };
}

export function createAIcon(id: string, renderer: MapRenderer, position: EarthPoint, texts: any): IconPrimitive<MapRenderer, any> {
  return renderer.createIcon(id, position, getAIconOptions(texts));
}
export function getAIconOptions(texts: any): IconOptions {
  return {
    icon: createMapAchorSvgString(anchorArrivalBorderColor, texts.way_points.A, anchorArrivalTextColor, anchorArrivalFillColor),
    iconOriginalSize: {x: MAP_ANCHOR_SVG_SIZE, y: MAP_ANCHOR_SVG_SIZE},
    iconRenderSize: {x: MAP_ANCHOR_RENDER_SIZE, y: MAP_ANCHOR_RENDER_SIZE},
    iconAnchor: 'bottom-center',
    rotateOnMouseOver: true,
  };
}

export function createWPIcon(id: string, renderer: MapRenderer, position: EarthPoint, index: number, color: Color): IconPrimitive<MapRenderer, any> {
  return renderer.createIcon(id, position, getWPIconOptions(index, color));
}
export function getWPIconOptions(index: number, color: Color): IconOptions {
  return {
    icon: createMapAchorSvgString(color.toString(), '' + index, anchorTextColor, color.copy().setAlpha(0.8).darker(48).toString()),
    iconOriginalSize: {x: MAP_ANCHOR_SVG_SIZE, y: MAP_ANCHOR_SVG_SIZE},
    iconRenderSize: {x: MAP_ANCHOR_RENDER_SIZE, y: MAP_ANCHOR_RENDER_SIZE},
    iconAnchor: 'bottom-center',
    rotateOnMouseOver: true,
  };
}

export function createBreakPointIcon(id: string, renderer: MapRenderer, position: EarthPoint, color: Color, text: string): IconPrimitive<MapRenderer, any> {
  return renderer.createIcon(id, position, getBreakPointIconOptions(color, text));
}
export function getBreakPointIconOptions(color: Color, text: string): IconOptions {
  return {
    icon: createMapAchorSvgString(anchorBreakBorderColor, text, anchorBreakTextColor, color.toString()),
    iconOriginalSize: {x: MAP_ANCHOR_SVG_SIZE, y: MAP_ANCHOR_SVG_SIZE},
    iconRenderSize: {x: MAP_ANCHOR_RENDER_SIZE, y: MAP_ANCHOR_RENDER_SIZE},
    iconAnchor: 'bottom-center',
    rotateOnMouseOver: true,
  };
}

export function createSelectedPointAnchorIcon(id: string, renderer: MapRenderer, position: EarthPoint): IconPrimitive<MapRenderer, any> {
  return renderer.createIcon(id, position, {
    icon: createMapAchorSvgString(anchorSelectedPointBorderColor, undefined, undefined, anchorSelectedPointFillColor),
    iconOriginalSize: {x: MAP_ANCHOR_SVG_SIZE, y: MAP_ANCHOR_SVG_SIZE},
    iconRenderSize: {x: MAP_ANCHOR_RENDER_SIZE, y: MAP_ANCHOR_RENDER_SIZE},
    iconAnchor: 'bottom-center',
    rotateOnMouseOver: true,
  });
}
