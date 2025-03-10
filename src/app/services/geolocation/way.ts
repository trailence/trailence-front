import L from 'leaflet';

export interface Way {

  id: string;
  bounds?: {minlat: number, minlon: number, maxlat: number, maxlon: number};
  points: L.LatLngLiteral[];
  permission?: WayPermission;

}

export enum WayPermission {
  FORBIDDEN = 'forbidden',
  PERMISSIVE = 'permissive',
  ALLOWED = 'allowed',
}
