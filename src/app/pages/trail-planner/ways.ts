import { Way } from '@trailence/services/map/way';
import { closestPointOnSegment, distance, EarthPoint } from '@trailence/utils/latlng';

export interface TrackPoint {
  pos: EarthPoint;
  free: boolean;

  /**
   * Metadata for points placed on an OSM way.
   * Useful for quickly reconnecting the next routing session.
   */
  network?: {
    wayId: string;
    segmentIndex: number;
    t: number;
  };
}

export interface WaySnap {
  /** Snapped geographic position. */
  pos: EarthPoint;

  /** Distance between the cursor and the snapped position. */
  distanceMeters: number;

  wayId: string;

  /** Index of the first point of the way segment. */
  segmentIndex: number;

  /** Position along the segment, from 0 to 1. */
  t: number;

  /**
   * Internal segment identifier.
   * Only valid until the next setWays() call.
   */
  segmentId: number;
}

export interface WayRoute {
  /**
   * Ordered positions, including the previous track point
   * and the destination snap point.
   */
  points: WayRoutePoint[];

  /** Network distance plus any initial connection to the network. */
  distanceMeters: number;

  target: WaySnap;
}

export interface WayRoutePoint {
  pos: EarthPoint;

  /** OSM way used to reach this point from the previous point. */
  wayId: string | null;
}

export interface NearbyWay {
  wayId: string;
  distanceMeters: number;
}

export interface WaysPreview {
  snap?: WaySnap;
  route?: WayRoute;
  nearbyWays: NearbyWay[];
}

export interface WaysHelperOptions {
  /** Maximum cursor-to-way distance for snapping. */
  snapRadiusMeters?: number;

  /** Maximum distance to connect a free starting point to a way. */
  startAccessRadiusMeters?: number;

  /** Maximum distance when reconnecting an existing non-free track point. */
  startSnapToleranceMeters?: number;

  /** Radius used to find ways to highlight around the cursor. */
  highlightRadiusMeters?: number;

  /** Maximum number of nearby ways returned. */
  maxHighlightedWays?: number;

  /**
   * Optional limit for Dijkstra's search radius.
   * Infinity means search the entire reachable component.
   */
  maxSearchDistanceMeters?: number;
}

interface GraphEdge {
  to: number;
  length: number;
  segmentId: number;
}

interface GraphNode {
  pos: EarthPoint;
  edges: GraphEdge[];
}

interface Segment {
  id: number;

  wayId: string;
  segmentIndex: number;

  /** Graph node indices. */
  a: number;
  b: number;

  /** Original segment endpoints. */
  aPos: EarthPoint;
  bPos: EarthPoint;

  length: number;
}

interface SegmentHit {
  point: EarthPoint;
  distanceMeters: number;
  t: number;
}

interface MinHeapItem {
  node: number;
  distance: number;
}

const DEFAULT_OPTIONS: Required<WaysHelperOptions> = {
  snapRadiusMeters: 60,
  startAccessRadiusMeters: 250,
  startSnapToleranceMeters: 5,
  highlightRadiusMeters: 120,
  maxHighlightedWays: 12,
  maxSearchDistanceMeters: Infinity,
};

const EARTH_RADIUS_METERS = 6371008.8;
const DEG_TO_RAD = Math.PI / 180;
const NODE_COORDINATE_FACTOR = 10_000_000;
const POINT_EQUALITY_METERS = 0.02;

/**
 * A binary min-heap, used by Dijkstra.
 *
 * It avoids the overhead of sorting an array every time
 * we need to retrieve the next closest graph node.
 */
class MinHeap {
  private nodes: number[] = [];
  private distances: number[] = [];

  get size(): number {
    return this.nodes.length;
  }

  push(node: number, distance: number): void {
    let index = this.nodes.length;

    this.nodes.push(node);
    this.distances.push(distance);

    while (index > 0) {
      const parent = (index - 1) >> 1;

      if (this.distances[parent] <= distance) {
        break;
      }

      this.nodes[index] = this.nodes[parent];
      this.distances[index] = this.distances[parent];

      index = parent;
    }

    this.nodes[index] = node;
    this.distances[index] = distance;
  }

  pop(): MinHeapItem | undefined {
    const length = this.nodes.length;

    if (length === 0) {
      return undefined;
    }

    const result: MinHeapItem = {
      node: this.nodes[0],
      distance: this.distances[0],
    };

    const lastNode = this.nodes.pop()!;
    const lastDistance = this.distances.pop()!;

    if (this.nodes.length === 0) {
      return result;
    }

    let index = 0;
    const newLength = this.nodes.length;

    while (true) {
      const left = index * 2 + 1;
      const right = left + 1;

      if (left >= newLength) {
        break;
      }

      let smallest = left;

      if (
        right < newLength &&
        this.distances[right] < this.distances[left]
      ) {
        smallest = right;
      }

      if (this.distances[smallest] >= lastDistance) {
        break;
      }

      this.nodes[index] = this.nodes[smallest];
      this.distances[index] = this.distances[smallest];

      index = smallest;
    }

    this.nodes[index] = lastNode;
    this.distances[index] = lastDistance;

    return result;
  }
}

export class WaysHelper {
  private nodes: GraphNode[] = [];
  private segments: Segment[] = [];

  private readonly segmentByWay = new Map<string, Segment>();

  private spatialIndex?: any; /* Flatbush but any so it can be loaded on demand */

  /**
   * Incremented each time setWays() is called.
   * Existing routing sessions become invalid after that.
   */
  private generation = 0;

  private readonly options: Required<WaysHelperOptions>;

  public readonly wayById = new Map<string, Way>();

  constructor(options: WaysHelperOptions = {}) {
    this.options = {
      ...DEFAULT_OPTIONS,
      ...options,
    };
  }

  /**
   * Rebuilds the graph and spatial index.
   *
   * Complexity:
   * - Graph construction: O(number of points + number of segments)
   * - Spatial index construction: O(number of segments log number of segments)
   */
  async setWays(ways: Way[]) {
    this.generation++;

    this.nodes = [];
    this.segments = [];
    this.segmentByWay.clear();
    this.spatialIndex = undefined;

    const nodeByKey = new Map<string, number>();

    const getNode = (
      way: Way,
      pointIndex: number,
      pos: EarthPoint
    ): number => {
      // TODO improve key ?
      const key = `p:${Math.round(pos.lat * NODE_COORDINATE_FACTOR)}:${Math.round(pos.lng * NODE_COORDINATE_FACTOR)}`;

      const existing = nodeByKey.get(key);

      if (existing !== undefined) {
        return existing;
      }

      const index = this.nodes.length;

      this.nodes.push({
        pos,
        edges: [],
      });

      nodeByKey.set(key, index);

      return index;
    };

    this.wayById.clear();
    for (const way of ways) {
      this.wayById.set(way.id, way);
      const points = way.points;

      if (points.length < 2) {
        continue;
      }

      for (let i = 0; i < points.length - 1; i++) {
        const aPos = points[i];
        const bPos = points[i + 1];

        if (
          !Number.isFinite(aPos.lat) ||
          !Number.isFinite(aPos.lng) ||
          !Number.isFinite(bPos.lat) ||
          !Number.isFinite(bPos.lng)
        ) {
          continue;
        }

        const a = getNode(way, i, aPos);
        const b = getNode(way, i + 1, bPos);

        if (a === b) {
          continue;
        }

        const length = distance(aPos, bPos);

        if (!Number.isFinite(length) || length <= 0) {
          continue;
        }

        const segment: Segment = {
          id: this.segments.length,
          wayId: way.id,
          segmentIndex: i,
          a,
          b,
          aPos,
          bPos,
          length,
        };

        this.segments.push(segment);

        // Hiking ways are treated as bidirectional.
        this.nodes[a].edges.push({
          to: b,
          length,
          segmentId: segment.id,
        });

        this.nodes[b].edges.push({
          to: a,
          length,
          segmentId: segment.id,
        });

        this.segmentByWay.set(
          this.getSegmentKey(way.id, i),
          segment
        );
      }
    }

    if (this.segments.length === 0) {
      return;
    }

    // Build a static R-tree-like spatial index over all segments.
    const flatbushModule = await import('flatbush');
    const index = new flatbushModule.default(this.segments.length);

    for (const segment of this.segments) {
      index.add(
        Math.min(segment.aPos.lng, segment.bPos.lng),
        Math.min(segment.aPos.lat, segment.bPos.lat),
        Math.max(segment.aPos.lng, segment.bPos.lng),
        Math.max(segment.aPos.lat, segment.bPos.lat)
      );
    }

    index.finish();
    this.spatialIndex = index;
  }

  /**
   * Finds the closest point on any OSM way within maxDistanceMeters.
   *
   * This method only performs a spatial query. It does not calculate
   * a route.
   */
  findClosestWayPoint(
    pos: EarthPoint,
    maxDistanceMeters = this.options.snapRadiusMeters
  ): WaySnap | undefined {
    return this.query(
      pos,
      maxDistanceMeters,
      0,
      0
    ).snap;
  }

  /**
   * Finds nearby ways, ordered by their closest distance to pos.
   */
  findNearbyWays(
    pos: EarthPoint,
    radiusMeters = this.options.highlightRadiusMeters,
    maxResults = this.options.maxHighlightedWays
  ): NearbyWay[] {
    return this.query(
      pos,
      0,
      radiusMeters,
      maxResults
    ).nearbyWays;
  }

  /**
   * Creates a routing session for one fixed starting point.
   *
   * IMPORTANT:
   * Create this once when the previous track point changes,
   * not on every mouse movement.
   *
   * Dijkstra runs here, once. Subsequent preview() calls only
   * perform a spatial query and reconstruct the route.
   *
   * Returns undefined if the starting point cannot be connected
   * to the available way network.
   */
  createRoutingSession(
    start: TrackPoint,
    options: WaysHelperOptions = {}
  ): RoutingSession | undefined {
    if (!this.spatialIndex || this.segments.length === 0) {
      return undefined;
    }

    const config = {
      ...this.options,
      ...options,
    };

    const sessionGeneration = this.generation;

    const sourceSnap = this.resolveStartSnap(start, config);

    if (!sourceSnap) {
      return undefined;
    }

    const sourceSegment = this.segments[sourceSnap.segmentId];

    if (!sourceSegment) {
      return undefined;
    }

    // The starting point may be free and connected to the network
    // with a straight line. This distance is added to every route.
    const initialAccessDistance = distance(
      start.pos,
      sourceSnap.pos
    );

    // --------------------------------------------
    // Precompute shortest paths from the source.
    // --------------------------------------------

    const nodeCount = this.nodes.length;

    const distances = new Float64Array(nodeCount);
    distances.fill(Infinity);

    const previous = new Int32Array(nodeCount);
    previous.fill(-1);
    const previousSegment = new Int32Array(nodeCount);
    previousSegment.fill(-1);

    const heap = new MinHeap();

    const pushSeed = (node: number, cost: number, segmentId: number) => {
      if (cost < distances[node]) {
        distances[node] = cost;
        previous[node] = -1;
        previousSegment[node] = segmentId;
        heap.push(node, cost);
      }
    };

    // The source lies somewhere along an edge.
    // We can reach either endpoint by following that edge.
    pushSeed(
      sourceSegment.a,
      sourceSnap.t * sourceSegment.length,
      sourceSegment.id
    );

    pushSeed(
      sourceSegment.b,
      (1 - sourceSnap.t) * sourceSegment.length,
      sourceSegment.id
    );

    const maxSearchDistance =
      config.maxSearchDistanceMeters;

    while (heap.size > 0) {
      const current = heap.pop()!;

      // A newer, shorter entry may have been inserted.
      if (current.distance !== distances[current.node]) {
        continue;
      }

      if (current.distance > maxSearchDistance) {
        break;
      }

      const edges = this.nodes[current.node].edges;

      for (const edge of edges) {
        const candidate =
          current.distance + edge.length;

        if (candidate >= distances[edge.to]) {
          continue;
        }

        distances[edge.to] = candidate;
        previous[edge.to] = current.node;
        previousSegment[edge.to] = edge.segmentId;

        heap.push(edge.to, candidate);
      }
    }

    // --------------------------------------------
    // The session can now serve many target points.
    // --------------------------------------------

    const routeTo = (target: WaySnap): WayRoute | undefined => {
      const targetSegment = this.segments[target.segmentId];

      if (!targetSegment) {
        return undefined;
      }

      let bestDistance = Infinity;

      let targetEndpoint = -1;
      let useDirectSegment = false;

      // Candidate 1: arrive through endpoint A.
      const costA =
        distances[targetSegment.a] +
        target.t * targetSegment.length;

      if (costA < bestDistance) {
        bestDistance = costA;
        targetEndpoint = targetSegment.a;
      }

      // Candidate 2: arrive through endpoint B.
      const costB =
        distances[targetSegment.b] +
        (1 - target.t) * targetSegment.length;

      if (costB < bestDistance) {
        bestDistance = costB;
        targetEndpoint = targetSegment.b;
      }

      // Candidate 3: source and target are on the same edge.
      // In this case, going directly along that edge may be
      // shorter than going through either endpoint.
      if (target.segmentId === sourceSegment.id) {
        const directDistance =
          Math.abs(target.t - sourceSnap.t) *
          sourceSegment.length;

        if (directDistance < bestDistance) {
          bestDistance = directDistance;
          useDirectSegment = true;
          targetEndpoint = -1;
        }
      }

      if (!Number.isFinite(bestDistance)) {
        return undefined;
      }

      // Reconstruct the chosen route.
      const points: WayRoutePoint[] = [];

      const append = (
        point: EarthPoint,
        wayId: string | null
      ) => {
        const previousPoint = points.at(-1);

        if (
          previousPoint &&
          distance(previousPoint.pos, point) <= POINT_EQUALITY_METERS
        ) {
          return;
        }

        points.push({
          pos: point,
          wayId,
        });
      };

      append(start.pos, null);
      append(sourceSnap.pos, null);

      if (useDirectSegment) {
        append(target.pos, sourceSegment.wayId);
      } else {
        // Reconstruct the graph path from the selected endpoint
        // back to one of the two initial source endpoints.
        const path: {
          node: number;
          segmentId: number;
        }[] = [];

        let node = targetEndpoint;

        while (node !== -1) {
          path.push({
            node,
            segmentId: previousSegment[node],
          });
          node = previous[node];
        }

        path.reverse();

        for (const step of path) {
          const segment = this.segments[step.segmentId];

          append(
            this.nodes[step.node].pos,
            segment?.wayId ?? null
          );
        }

        append(target.pos, targetSegment.wayId);
      }

      return {
        points,
        distanceMeters:
          initialAccessDistance + bestDistance,
        target,
      };
    };

    return {
      preview: (cursor: EarthPoint): WaysPreview | undefined => {
        // setWays() invalidates all existing routing sessions.
        if (sessionGeneration !== this.generation) {
          return undefined;
        }

        const result = this.query(
          cursor,
          config.snapRadiusMeters,
          config.highlightRadiusMeters,
          config.maxHighlightedWays
        );

        const route = result.snap
          ? routeTo(result.snap)
          : undefined;

        return {
          snap: result.snap,
          route,
          nearbyWays: result.nearbyWays,
        };
      },
    };
  }

  // ==========================================================
  // Internal methods
  // ==========================================================

  private getSegmentKey(
    wayId: string,
    segmentIndex: number
  ): string {
    return `${wayId}\u0000${segmentIndex}`;
  }

  /**
   * Connects the starting track point to the network.
   *
   * If network metadata is available, we first try the exact
   * previously-used segment. Otherwise, we perform a spatial query.
   */
  private resolveStartSnap(
    start: TrackPoint,
    options: Required<WaysHelperOptions>
  ): WaySnap | undefined {
    if (!start.free && start.network) {
      const segment = this.segmentByWay.get(
        this.getSegmentKey(
          start.network.wayId,
          start.network.segmentIndex
        )
      );

      if (segment) {
        const match = closestPointOnSegment(
          start.pos,
          segment.aPos,
          segment.bPos
        );

        if (
          match &&
          match.distanceMeters <= options.startSnapToleranceMeters
        ) {
          return this.createSnap(segment, match);
        }
      }
    }

    const radius = start.free
      ? options.startAccessRadiusMeters
      : options.startSnapToleranceMeters;

    return this.query(start.pos, radius, 0, 0).snap;
  }

  /**
   * Runs one spatial query and reuses its results for both:
   * - finding the nearest segment for snapping
   * - finding nearby ways to highlight
   */
  private query(
    pos: EarthPoint,
    snapRadiusMeters: number,
    highlightRadiusMeters: number,
    maxHighlightedWays: number
  ): {
    snap?: WaySnap;
    nearbyWays: NearbyWay[];
  } {
    if (!this.spatialIndex || this.segments.length === 0) {
      return { nearbyWays: [] };
    }

    const searchRadius = Math.max(
      snapRadiusMeters,
      highlightRadiusMeters
    );

    if (searchRadius <= 0) {
      return { nearbyWays: [] };
    }

    const latRadius =
      (searchRadius / EARTH_RADIUS_METERS) * (180 / Math.PI);

    const cosLat = Math.max(
      0.000001,
      Math.cos(pos.lat * DEG_TO_RAD)
    );

    const lngRadius = latRadius / cosLat;

    const candidates = this.spatialIndex.search(
      pos.lng - lngRadius,
      Math.max(-90, pos.lat - latRadius),
      pos.lng + lngRadius,
      Math.min(90, pos.lat + latRadius)
    );

    let closestSnap: WaySnap | undefined;

    const wayDistances = new Map<string, number>();

    for (const candidate of candidates) {
      const segment = this.segments[candidate];

      if (!segment) {
        continue;
      }

      const match = closestPointOnSegment(
        pos,
        segment.aPos,
        segment.bPos
      );

      if (!match) {
        continue;
      }

      const d = match.distanceMeters;

      if (d <= snapRadiusMeters) {
        if (
          !closestSnap ||
          d < closestSnap.distanceMeters
        ) {
          closestSnap = this.createSnap(segment, match);
        }
      }

      if (d <= highlightRadiusMeters) {
        const previousDistance = wayDistances.get(segment.wayId);

        if (
          previousDistance === undefined ||
          d < previousDistance
        ) {
          wayDistances.set(segment.wayId, d);
        }
      }
    }

    const nearbyWays = Array.from(
      wayDistances,
      ([wayId, distanceMeters]) => ({
        wayId,
        distanceMeters,
      })
    )
      .sort((a, b) => a.distanceMeters - b.distanceMeters)
      .slice(0, maxHighlightedWays);

    return {
      snap: closestSnap,
      nearbyWays,
    };
  }

  private createSnap(
    segment: Segment,
    match: SegmentHit
  ): WaySnap {
    const aEle = segment.aPos.ele;
    const bEle = segment.bPos.ele;

    let ele: number | undefined;

    if (aEle !== undefined && bEle !== undefined) {
      ele = aEle + (bEle - aEle) * match.t;
    }

    return {
      pos: {
        ...match.point,
        ele,
      },
      distanceMeters: match.distanceMeters,
      wayId: segment.wayId,
      segmentIndex: segment.segmentIndex,
      t: match.t,
      segmentId: segment.id,
    };
  }
}

export interface RoutingSession {
  /**
   * Returns the exact preview that should be used if the user clicks.
   * Returns undefined if setWays() has invalidated this session.
   */
  preview(cursor: EarthPoint): WaysPreview | undefined;
}
