export interface RouteCircuit {

  segments: L.LatLng[][];

  id: string;
  name?: string;
  description?: string;

  positiveElevation?: number;
  negativeElevation?: number;
  distance?: number;

  oscmSymbol?: string;

}
