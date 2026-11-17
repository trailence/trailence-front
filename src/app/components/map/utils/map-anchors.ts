import { EarthPoint } from '@trailence/utils/latlng';
import { MapRenderer } from '../impl/map-renderer';
import { IconOptions, IconPrimitive } from '../primitives/icon';
import { anchorArrivalBorderColor, anchorArrivalFillColor, anchorArrivalTextColor, anchorDABorderColor, anchorDATextColor, anchorDepartureBorderColor, anchorDepartureFillColor, anchorDepartureTextColor, createMapAchorSvgString, MAP_ANCHOR_SVG_SIZE } from './map-anchor-svg';

export function createDAIcon(id: string, renderer: MapRenderer, position: EarthPoint, texts: any): IconPrimitive<MapRenderer> {
  return renderer.createIcon(id + '$DA', position, getDAIconOptions(texts));
}
export function getDAIconOptions(texts: any): IconOptions {
  return {
    icon: createMapAchorSvgString(anchorDABorderColor, texts.way_points.DA, anchorDATextColor, anchorDepartureFillColor, anchorArrivalFillColor),
    iconOriginalSize: {x: MAP_ANCHOR_SVG_SIZE, y: MAP_ANCHOR_SVG_SIZE},
    iconRenderSize: {x: 40, y: 40},
    iconAnchor: 'bottom-center',
    rotateOnMouseOver: true,
  };
}

export function createDIcon(id: string, renderer: MapRenderer, position: EarthPoint, texts: any): IconPrimitive<MapRenderer> {
  return renderer.createIcon(id + '$D', position, getDIconOptions(texts));
}
export function getDIconOptions(texts: any): IconOptions {
  return {
    icon: createMapAchorSvgString(anchorDepartureBorderColor, texts.way_points.D, anchorDepartureTextColor, anchorDepartureFillColor),
    iconOriginalSize: {x: MAP_ANCHOR_SVG_SIZE, y: MAP_ANCHOR_SVG_SIZE},
    iconRenderSize: {x: 40, y: 40},
    iconAnchor: 'bottom-center',
    rotateOnMouseOver: true,
  };
}

export function createAIcon(id: string, renderer: MapRenderer, position: EarthPoint, texts: any): IconPrimitive<MapRenderer> {
  return renderer.createIcon(id + '$A', position, getAIconOptions(texts));
}
export function getAIconOptions(texts: any): IconOptions {
  return {
    icon: createMapAchorSvgString(anchorArrivalBorderColor, texts.way_points.A, anchorArrivalTextColor, anchorArrivalFillColor),
    iconOriginalSize: {x: MAP_ANCHOR_SVG_SIZE, y: MAP_ANCHOR_SVG_SIZE},
    iconRenderSize: {x: 40, y: 40},
    iconAnchor: 'bottom-center',
    rotateOnMouseOver: true,
  };
}
