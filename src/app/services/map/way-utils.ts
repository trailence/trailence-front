import { Arrays } from '@trailence/utils/arrays';
import { Way } from './way';
import { ClosestMatch, closestPointOnSegment, distance, EarthPoint, findClosestPointOnPath } from '@trailence/utils/latlng';

export class WayUtils {

  public static getClosestPointsOnWays(pos: EarthPoint, ways: Way[], maxDistance: number = 2.5): {way: Way, closest: ClosestMatch}[] {
    const result: {way: Way, closest: ClosestMatch}[] = [];
    for (const way of ways) {
      const closest = findClosestPointOnPath(way.points, pos, maxDistance);
      if (closest) result.push({way, closest});
    }
    return result;
  }
  /*
  public static getMatchingWays(pos: EarthPoint, ways: Way[], maxDistance: number = 2.5): Way[] {
    const matching: Way[] = [];
    for (const way of ways) {
      if (way.points.some(pt => distance(pos, pt) <= maxDistance)) {
        matching.push(way);
      } else {
        const match = findClosestPointOnPath(way.points, pos, maxDistance);
        if (match) matching.push(way);
      }
    }
    return matching;
  }*/

  public static findClosestWayPoint(pos: EarthPoint, ways: Way[], maxDistance: number = 2.5): {way: Way, match: ClosestMatch} | undefined {
    let best: {way: Way, match: ClosestMatch} | undefined = undefined;
    for (const way of ways) {
      const match = findClosestPointOnPath(way.points, pos, maxDistance);
      if (!match) continue;
      if (match.distanceMeters === 0) return {way, match};
      if (!best || match.distanceMeters < best.match.distanceMeters) best = {way, match};
    }
    return best;
  }

  public static mergeWays(ways: Way[], mergePredicate: (way1: Way, way2: Way) => boolean): Way[] {
    if (ways.length < 2) return ways;
    for (let i = 0; i < ways.length; ++i) {
      const way = ways[i];
      let merged = false;
      let start = way.points[0];
      let way2Index = this.findSingleWayStartingAt(start.lat, start.lng, ways, i + 1, (w2) => mergePredicate(way, w2));
      if (way2Index >= 0) {
        this.merge(way, ways[way2Index]);
        ways.splice(way2Index, 1);
        merged = true;
      }
      start = way.points.at(-1)!;
      way2Index = this.findSingleWayStartingAt(start.lat, start.lng, ways, i + 1, (w2) => mergePredicate(way, w2));
      if (way2Index >= 0) {
        this.merge(way, ways[way2Index]);
        ways.splice(way2Index, 1);
        merged = true;
      }
      if (merged) i--;
    }
    return ways;
  }

  private static findSingleWayStartingAt(lat: number, lng: number, ways: Way[], i: number, mergePredicate: (way: Way) => boolean): number {
    let found = -1;
    for (; i < ways.length; ++i) {
      const way = ways[i];
      if (!mergePredicate(way)) continue;
      if (way.points[0].lat === lat && way.points[0].lng === lng) {
        if (found !== -1) return -1;
        found = i;
        continue;
      }
      const l = way.points.length - 1;
      if (way.points[l].lat === lat && way.points[l].lng === lng) {
        if (found !== -1) return -1;
        found = i;
      }
    }
    return found;
  }

  private static merge(w1: Way, w2: Way): void {
    const l1 = w1.points.length - 1;
    const l2 = w2.points.length - 1;
    if (w2.points[0].lat === w1.points[0].lat && w2.points[0].lng === w1.points[0].lng) {
      // first point of w2 matches with first point of w1 => w2 goes before w1, but reverse way
      w1.points.splice(0, 0, ...Arrays.toReversed(w2.points));
    } else if (w2.points[0].lat === w1.points[l1].lat && w2.points[0].lng === w1.points[l1].lng) {
      // first point of w2 matches with last point of w1 => append points
      w1.points.push(...w2.points);
    } else if (w2.points[l2].lat === w1.points[0].lat && w2.points[l2].lng === w1.points[0].lng) {
      // last point of w2 matches with first point of w1 => insert points at beginning
      w1.points.splice(0, 0, ...w2.points);
    } else {
      // last point of w2 matches with last point of w1 => append points, but reverse way
      w1.points.push(...Arrays.toReversed(w2.points));
    }
    w1.id = w1.id + '-' + w2.id;
  }

}

// --- Graph ---

export type WaysPathPoints = { way: Way; point: EarthPoint }[];
export type WaysPath = { startingFreePoints: EarthPoint[]; waysPath: WaysPathPoints };

interface GraphEdge {
  to: number;
  distance: number;
  refs: number;
}

interface GraphNode {
  point: EarthPoint;
  edges: Map<number, GraphEdge>;
  refs: number;
  ways: Set<Way>;
}

interface CachedWay {
  source: Way;
  pointKeys: string[];
  nodeIds: number[];
}

class MinHeap {
  private readonly items: { id: number; distance: number }[] = [];

  get size(): number {
    return this.items.length;
  }

  push(id: number, distance: number): void {
    const items = this.items;
    let i = items.length;

    items.push({ id, distance });

    while (i > 0) {
      const parent = (i - 1) >> 1;

      if (items[parent].distance <= distance) break;

      items[i] = items[parent];
      i = parent;
    }

    items[i] = { id, distance };
  }

  pop(): { id: number; distance: number } | undefined {
    const items = this.items;

    if (items.length === 0) return undefined;

    const result = items[0];
    const last = items.pop()!;

    if (items.length === 0) return result;

    let i = 0;

    while (true) {
      const left = i * 2 + 1;
      const right = left + 1;

      if (left >= items.length) break;

      let smallest = left;

      if (
        right < items.length &&
        items[right].distance < items[left].distance
      ) {
        smallest = right;
      }

      if (items[smallest].distance >= last.distance) break;

      items[i] = items[smallest];
      i = smallest;
    }

    items[i] = last;

    return result;
  }
}

function pointKey(point: EarthPoint): string {
  return `${point.lat},${point.lng}`;
}

export class WaysGraph {
  private readonly nodes: (GraphNode | undefined)[] = [];
  private readonly pointToNode = new Map<string, number>();
  private readonly ways = new Map<string, CachedWay>();
  private readonly freeNodeIds: number[] = [];

  /**
   * Gets an existing node or creates a new one.
   */
  private getNodeId(point: EarthPoint, key: string): number {
    const existing = this.pointToNode.get(key);

    if (existing !== undefined) {
      return existing;
    }

    let id: number;

    if (this.freeNodeIds.length > 0) {
      id = this.freeNodeIds.pop()!;
      this.nodes[id] = {
        point,
        edges: new Map(),
        refs: 0,
        ways: new Set(),
      };
    } else {
      id = this.nodes.length;

      this.nodes.push({
        point,
        edges: new Map(),
        refs: 0,
        ways: new Set(),
      });
    }

    this.pointToNode.set(key, id);

    return id;
  }

  /**
   * Adds a way to the graph.
   */
  private addWay(way: Way, pointKeys: string[]): void {
    const nodeIds: number[] = [];

    for (let i = 0; i < way.points.length; i++) {
      const id = this.getNodeId(way.points[i], pointKeys[i]);

      nodeIds.push(id);
    }

    // Count each node once per way.
    const uniqueNodeIds = new Set(nodeIds);

    for (const id of uniqueNodeIds) {
      this.nodes[id]!.refs++;
      this.nodes[id]!.ways.add(way);
    }

    // Add edges between consecutive points.
    for (let i = 0; i < nodeIds.length - 1; i++) {
      const from = nodeIds[i];
      const to = nodeIds[i + 1];

      if (from === to) continue;

      const d = distance(
        way.points[i],
        way.points[i + 1]
      );

      this.addEdge(from, to, d);
    }

    this.ways.set(way.id, {
      source: way,
      pointKeys,
      nodeIds,
    });
  }

  /**
   * Adds a bidirectional edge.
   * Multiple ways can contribute to the same edge.
   */
  private addEdge(from: number, to: number, distance: number): void {
    const a = this.nodes[from]!;
    const b = this.nodes[to]!;

    const existingA = a.edges.get(to);

    if (existingA) {
      existingA.refs++;
    } else {
      a.edges.set(to, {
        to,
        distance,
        refs: 1,
      });
    }

    const existingB = b.edges.get(from);

    if (existingB) {
      existingB.refs++;
    } else {
      b.edges.set(from, {
        to: from,
        distance,
        refs: 1,
      });
    }
  }

  /**
   * Removes a way and its edge contributions.
   */
  private removeWay(way: CachedWay): void {
    const { nodeIds } = way;

    // Remove edge contributions.
    for (let i = 0; i < nodeIds.length - 1; i++) {
      const from = nodeIds[i];
      const to = nodeIds[i + 1];

      if (from === to) continue;

      this.removeEdge(from, to);
    }

    // Decrement node references.
    const uniqueNodeIds = new Set(nodeIds);

    for (const id of uniqueNodeIds) {
      const node = this.nodes[id]!;

      node.refs--;

      // No remaining ways reference this node.
      if (node.refs === 0) {
        this.pointToNode.delete(pointKey(node.point));
        this.nodes[id] = undefined;
        this.freeNodeIds.push(id);
      }
    }
  }

  /**
   * Removes one way's contribution to an edge.
   */
  private removeEdge(from: number, to: number): void {
    const a = this.nodes[from]!;
    const b = this.nodes[to]!;

    const edgeA = a.edges.get(to)!;
    const edgeB = b.edges.get(from)!;

    edgeA.refs--;
    edgeB.refs--;

    if (edgeA.refs === 0) {
      a.edges.delete(to);
      b.edges.delete(from);
    }
  }

  /**
   * Updates the graph incrementally.
   *
   * Ways with unchanged geometry are kept.
   * Changed and new ways are added.
   * Missing ways are removed.
   */
  public setWays(ways: Way[]): void {
    const incomingIds = new Set<string>();

    for (const way of ways) {
      incomingIds.add(way.id);

      const existing = this.ways.get(way.id);
      if (existing) continue;

      // Add the new geometry.
      const pointKeys = way.points.map(pointKey);
      this.addWay(way, pointKeys);
    }

    // Remove ways no longer present in the new dataset.
    for (const [id, way] of this.ways) {
      if (!incomingIds.has(id)) {
        this.removeWay(way);
        this.ways.delete(id);
      }
    }
  }

  /**
   * Finds the shortest path between two graph vertices.
   */
  public getShortestPath(
    start: EarthPoint,
    destination: EarthPoint
  ): WaysPathPoints | undefined {
    const startId = this.pointToNode.get(pointKey(start));
    const targetId = this.pointToNode.get(pointKey(destination));

    if (startId === undefined || targetId === undefined) {
      return undefined;
    }

    if (startId === targetId) {
      const way = this.nodes[startId]!.ways.values().next().value;
      return way ? [{ way, point: this.nodes[startId]!.point }] : undefined;
    }

    const count = this.nodes.length;
    const distances = new Float64Array(count);
    distances.fill(Infinity);

    const previous = new Int32Array(count);
    previous.fill(-1);

    const heap = new MinHeap();

    distances[startId] = 0;
    heap.push(startId, 0);

    while (heap.size > 0) {
      const current = heap.pop()!;
      const id = current.id;

      if (current.distance > distances[id]) continue;
      if (id === targetId) break;

      const node = this.nodes[id];
      if (!node) continue;

      for (const edge of node.edges.values()) {
        const newDistance = current.distance + edge.distance;

        if (newDistance < distances[edge.to]) {
          distances[edge.to] = newDistance;
          previous[edge.to] = id;
          heap.push(edge.to, newDistance);
        }
      }
    }

    if (distances[targetId] === Infinity) {
      return undefined;
    }

    const path: number[] = [];

    for (let id = targetId; id !== -1; id = previous[id]) {
      path.push(id);
    }

    path.reverse();

    return path.map(id => {
      const node = this.nodes[id]!;
      const way = node.ways.values().next().value!;

      return {
        way,
        point: node.point,
      };
    });
  }


  public getShortestPathFromFreePoint(
    start: EarthPoint,
    destination: EarthPoint,
    thresholdMeters: number = 2.5
  ): WaysPath | undefined {

    const targetId = this.pointToNode.get(pointKey(destination));

    if (targetId === undefined) {
      return undefined;
    }

    // Each possible entry into the graph.
    interface Entry {
      nodeId: number;
      initialDistance: number;
      projection: EarthPoint;
      way: Way;
    }

    const entries = new Map<number, Entry>();

    // Examine all segments of all cached ways.
    for (const cachedWay of this.ways.values()) {
      const { source: way, nodeIds } = cachedWay;
      const points = way.points;

      if (points.length === 1) {
        const d = distance(start, points[0]);

        if (d <= thresholdMeters) {
          const nodeId = nodeIds[0];
          const existing = entries.get(nodeId);

          if (!existing || d < existing.initialDistance) {
            entries.set(nodeId, {
              nodeId,
              initialDistance: d,
              projection: points[0],
              way,
            });
          }
        }

        continue;
      }

      for (let i = 0; i < points.length - 1; i++) {
        const a = points[i];
        const b = points[i + 1];

        const match = closestPointOnSegment(start, a, b);

        if (!match || match.distanceMeters > thresholdMeters) {
          continue;
        }

        // Consider both endpoints of this segment.
        const candidates = [
          {
            nodeId: nodeIds[i],
            point: a,
          },
          {
            nodeId: nodeIds[i + 1],
            point: b,
          },
        ];

        for (const candidate of candidates) {
          const initialDistance =
            match.distanceMeters +
            distance(match.point, candidate.point);

          const existing = entries.get(candidate.nodeId);

          if (
            !existing ||
            initialDistance < existing.initialDistance
          ) {
            entries.set(candidate.nodeId, {
              nodeId: candidate.nodeId,
              initialDistance,
              projection: match.point,
              way,
            });
          }
        }
      }
    }

    if (entries.size === 0) {
      return undefined;
    }

    // Multi-source Dijkstra.
    const count = this.nodes.length;

    const distances = new Float64Array(count);
    distances.fill(Infinity);

    const previous = new Int32Array(count);
    previous.fill(-1);

    const sources: (Entry | undefined)[] = new Array(count);

    const heap = new MinHeap();

    for (const entry of entries.values()) {
      distances[entry.nodeId] = entry.initialDistance;
      sources[entry.nodeId] = entry;

      heap.push(entry.nodeId, entry.initialDistance);
    }

    while (heap.size > 0) {
      const current = heap.pop()!;
      const id = current.id;

      if (current.distance > distances[id]) {
        continue;
      }

      if (id === targetId) {
        break;
      }

      const node = this.nodes[id];

      if (!node) continue;

      for (const edge of node.edges.values()) {
        const newDistance = current.distance + edge.distance;

        if (newDistance < distances[edge.to]) {
          distances[edge.to] = newDistance;
          previous[edge.to] = id;
          sources[edge.to] = sources[id];

          heap.push(edge.to, newDistance);
        }
      }
    }

    if (distances[targetId] === Infinity) {
      return undefined;
    }

    // Reconstruct the graph path.
    const pathIds: number[] = [];

    for (
      let id = targetId;
      id !== -1;
      id = previous[id]
    ) {
      pathIds.push(id);
    }

    pathIds.reverse();

    const entry = sources[targetId];

    if (!entry) {
      return undefined;
    }

    // Find the way shared by two consecutive graph nodes.
    const getWayBetween = (a: number, b: number): Way => {
      const waysA = this.nodes[a]!.ways;

      for (const way of waysA) {
        if (this.nodes[b]!.ways.has(way)) {
          return way;
        }
      }

      // Fallback for a node belonging to only one way.
      return this.nodes[b]!.ways.values().next().value
        ?? entry.way;
    };

    // Associate each vertex with the way used by the route.
    const waysPath = pathIds.map((id, index) => {
      let way: Way;

      if (pathIds.length === 1) {
        way = entry.way;
      } else if (index < pathIds.length - 1) {
        way = getWayBetween(id, pathIds[index + 1]);
      } else {
        way = getWayBetween(pathIds[index - 1], id);
      }

      return {
        way,
        point: this.nodes[id]!.point,
      };
    });

    // Avoid duplicating the projection if it is already
    // the first graph vertex.
    const firstPoint = waysPath[0].point;

    const projectionIsVertex =
      pointKey(entry.projection) === pointKey(firstPoint);

    const startingFreePoints = projectionIsVertex
      ? [start]
      : [start, entry.projection];

    return {
      startingFreePoints,
      waysPath,
    };
  }

}
