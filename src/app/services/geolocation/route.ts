export interface RouteCircuit {

  segments: L.LatLng[][];

  name?: string;
  description?: string;

  positiveElevation?: number;
  negativeElevation?: number;
  distance?: number;

  oscmSymbol?: string;

}
