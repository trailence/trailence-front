export interface Way {
  id: string;
  points: {lat: number, lng: number}[];
  footPermission: WayPermission | undefined;
  bicyclePermission: WayPermission | undefined;
  type: WayType | undefined;
  surface: WaySurface | undefined;
  hikingDifficulty: HikingDifficulty | undefined;
  mtbDifficuly: HikingDifficulty | undefined;
  visibility: WayVisibility | undefined;
  routes: Route[];
}

export interface WayReference {
  id: string;
  tile: number;
}

export enum WayPermission {
  ALLOWED = 1,
  PERMISSIVE = 2,
  FORBIDDEN = 3,
  DISMOUNT = 4, // for bicycle, where cycling is not allowed but pushing the bicycle while dismounted is allowed.
}

export enum WayType {
  MAIN = 1, // roads, pedestrian streets, asphalt tracks, motorway, busway...
  TRACK = 2, // track, path.. typically not for motorized vehicles
  STEPS = 3,
  VIA_FERRATA = 4,
  LADDER = 5,
}

export enum WaySurface {
  SOLID = 1,        // grade1, paved, asphalt, bricks...
  MOSTLY_SOLID = 2, // grade2, compacted, grass_paver, fine_gravel...
  MIXTURE = 3,      // grade3,
  MOSTLY_SOFT = 4,  // grade4
  SOFT = 5,         // grade5, gravel, shells, dirt, earth, grass...
  SOFT_WITH_DIFFICULTY = 6, // mud, sand
  ROCK = 7,         // rock
}

export enum HikingDifficulty {
  VERY_EASY = 1,
  EASY = 2,
  MEDIUM = 3,
  HARD = 4,
  VERY_HARD = 5,
  IMPOSSIBLE = 6,
}

export enum WayVisibility {
  EXCELLENT = 1,
  GOOD = 2,
  INTERMEDIATE = 3,
  BAD = 4,
  HORRIBLE = 5,
  NO = 6,
}

export interface Route {
  id: string;
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
