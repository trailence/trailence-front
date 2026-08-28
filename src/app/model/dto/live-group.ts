export interface LiveGroupDto {
  slug: string;
  name: string;
  startedAt: number;
  expiresAt: number;
  trailOwner: string;
  trailUuid: string;
  trailShared: boolean;
  members: LiveGroupMemberDto[];
  updatedAt: number;
}

export interface LiveGroupMemberDto {
  uuid: string;
  name: string;
  lastPosition: {lat: number, lng: number} | null | undefined;
  lastPositionAt: number | null | undefined;
  you: boolean;
  owner: boolean;
}
