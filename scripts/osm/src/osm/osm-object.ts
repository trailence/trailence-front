export interface OsmObject {
  id: bigint;
}

export class OsmNode implements OsmObject {
  constructor(
    public readonly id: bigint,
    public readonly x: number,
    public readonly y: number,
    public readonly tags: {[key: string]: string},
  ) {}
}

export class OsmWay implements OsmObject {
  constructor(
    public readonly id: bigint,
    public readonly nodes: bigint[],
    public readonly tags: {[key: string]: string},
  ) {}

}

export class OsmRelation implements OsmObject {
  constructor(
    public readonly id: bigint,
    public readonly members: OsmRelationMember[],
    public readonly tags: {[key: string]: string},
  ) {}
}

export interface OsmRelationMember {
  type: OsmRelationMemberType;
  id: bigint;
  role: OsmRelationMemberRole | undefined;
}

export enum OsmRelationMemberType {
  NODE, WAY, RELATION,
}

export enum OsmRelationMemberRole {
  FORWARD = 1,
  BACKWARD = 2,
  EXCURSION = 3,
}
