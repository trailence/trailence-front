export enum TrailActivity {
  WALKING = 'walking',
  HIKING = 'hiking',
  RUNNING = 'running',
  TRAIL_RUNNING = 'trail',
  MOUNTAIN_BIKING = 'moutain-biking',
  GRAVEL_BIKING = 'gravel-biking',
  ROAD_BIKING = 'road-biking',
  HORSEBACK_RIDING = 'horseback-riding',
  SKIING = 'skiing',
  SNOWSHOEING = 'snowshoeing',
  BOAT = 'on-water',
  CANOE = 'canoe',
  VIA_FERRATA = 'via-ferrata',
  ROCK_CLIMBING = 'rock-climbing',
}

export enum TrailActivityGroup {
  PEDESTRIAN = 'pedestrian',
  BIKE = 'bike',
  SNOW = 'snow',
  WATER = 'water',
  OTHERS = 'others',
}

export interface TrailActivitiesGroup {
  key: TrailActivityGroup;
  activities: TrailActivity[];
}

export const TrailActivitiesGroups: TrailActivitiesGroup[] = [
  {
    key: TrailActivityGroup.PEDESTRIAN,
    activities: [
      TrailActivity.WALKING,
      TrailActivity.HIKING,
      TrailActivity.RUNNING,
      TrailActivity.TRAIL_RUNNING,
    ]
  }, {
    key: TrailActivityGroup.BIKE,
    activities: [
      TrailActivity.GRAVEL_BIKING,
      TrailActivity.MOUNTAIN_BIKING,
      TrailActivity.ROAD_BIKING,
    ]
  }, {
    key: TrailActivityGroup.SNOW,
    activities: [
      TrailActivity.SNOWSHOEING,
      TrailActivity.SKIING,
    ]
  }, {
    key: TrailActivityGroup.WATER,
    activities: [
      TrailActivity.CANOE,
      TrailActivity.BOAT,
    ]
  }, {
    key: TrailActivityGroup.OTHERS,
    activities: [
      TrailActivity.HORSEBACK_RIDING,
      TrailActivity.VIA_FERRATA,
      TrailActivity.ROCK_CLIMBING,
    ]
  }
];

export function getActivityIcon(activity: TrailActivity | undefined): string {
  if (activity === undefined) return 'question';
  switch (activity) {
    case TrailActivity.WALKING: return 'walk';
    case TrailActivity.HIKING: return 'hiking';
    case TrailActivity.MOUNTAIN_BIKING: return 'mountain-biking';
    case TrailActivity.GRAVEL_BIKING: return 'gravel-bike';
    case TrailActivity.ROAD_BIKING: return 'road-bike';
    case TrailActivity.SNOWSHOEING: return 'snow-shoeing';
    case TrailActivity.BOAT: return 'boat';
    case TrailActivity.SKIING: return 'ski';
    case TrailActivity.RUNNING: return 'running';
    case TrailActivity.TRAIL_RUNNING: return 'trail-activity';
    case TrailActivity.HORSEBACK_RIDING: return 'horse-riding';
    case TrailActivity.VIA_FERRATA: return 'carabiner';
    case TrailActivity.ROCK_CLIMBING: return 'climbing';
    case TrailActivity.CANOE: return 'kayak';
    default: return 'question';
  }
}

export function getActivityGroupIcon(key: TrailActivityGroup): string | undefined {
  switch (key) {
    case TrailActivityGroup.PEDESTRIAN: return 'shoe';
    case TrailActivityGroup.BIKE: return 'bicycle';
    case TrailActivityGroup.SNOW: return 'snow';
    case TrailActivityGroup.WATER: return 'water';
    default: return undefined;
  }
}
