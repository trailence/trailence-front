export interface Way {
  id: bigint;
  points: number[];
  footPermission: WayPermission | undefined;
  bicyclePermission: WayPermission | undefined;
  type: WayType | undefined;
  surface: WaySurface | undefined;
  hikingDifficulty: HikingDifficulty | undefined;
  mtbDifficuly: HikingDifficulty | undefined;
  visibility: WayVisibility | undefined;
  routes: bigint[];
}

export enum WayPermission {
  ALLOWED = 1,
  PERMISSIVE = 2,
  FORBIDDEN = 3,
  DISMOUNT = 4, // for bicycle, where cycling is not allowed but pushing the bicycle while dismounted is allowed.
}

export enum WayType {
  MAIN = 1, // roads, pedestrian streets, asphalt tracks...
  TRACK = 2,
  STEPS = 3,
  VIA_FERRATA = 4,
}

export enum WaySurface {
  SOLID = 1,
  MOSTLY_SOLID = 2,
  MIXTURE = 3,
  MOSTLY_SOFT = 4,
  SOFT = 5,
  SOFT_WITH_DIFFICULTY = 6,
  ROCK = 7,
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
