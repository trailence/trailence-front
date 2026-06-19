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
