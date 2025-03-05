export interface PlanDto {
  name: string;
  collections: number;
  trails: number;
  tracks: number;
  tracksSize: number;
  photos: number;
  photosSize: number;
  tags: number;
  trailTags: number;
  shares: number;

  subscriptionsCount?: number;
  activeSubscriptionsCount?: number;
}
