export enum AdminStatsType {
  NB_USERS = 'nbUsers',
  NEW_USERS = 'newUsers',
  DELETED_USERS = 'deletedUsers',
  CONNECTED_USERS = 'connectedUsers',
  NB_COLLECTIONS = 'nbCollections',
  NB_TRAILS = 'nbTrails',
  NB_TRACKS = 'nbTracks',
  NB_TAGS = 'nbTags',
  NB_TRAIL_TAGS = 'nbTrailTags',
  NB_SHARES = 'nbShares',
  NB_PHOTOS = 'nbPhotos',
  NB_PUBLIC_TRAILS = 'nbPublicTrails',
  NB_PUBLIC_LINKS = 'nbPublicLinks',
  NEW_LIVE_GROUPS = 'newLiveGroups',
  ACTIVE_USERS_30_30 = 'nbActiveUsers3030',
  ACTIVE_USERS_60_45 = 'nbActiveUsers6045',
  ACTIVE_USERS_90_45 = 'nbActiveUsers9045',
  ACTIVE_USERS_180_45 = 'nbActiveUsers18045',
}

export enum AdminStatsAggregation {
  DAY = 'day',
  WEEK = 'week',
  MONTH = 'month',
  YEAR = 'year',
}

export interface AdminStatsConfig {

  type: AdminStatsType;
  aggregation: AdminStatsAggregation;

}
