export interface Route {
  id: bigint;
  types: RouteType[];
  colour: string | undefined;
  symbol: string | undefined;
  name: string | undefined;
  ref: string | undefined;
}

export enum RouteType {
  HIKE = 1,
  FITNESS_TRAIL = 2,
  NORDIC_WALK = 3,
  RUNNING = 4,
  BICYCLE = 5,
  MTB = 6,
}
