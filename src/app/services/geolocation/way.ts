import L from 'leaflet';

export interface Way {

  points: L.LatLngLiteral[];
  permission?: WayPermission;

}

export enum WayPermission {
  FORBIDDEN = 'forbidden',
  PERMISSIVE = 'permissive',
  ALLOWED = 'allowed',
}
