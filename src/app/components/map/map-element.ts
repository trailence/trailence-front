import { LayerSpecification, MapLibreMap, SourceSpecification } from 'maplibre-gl';
import { BehaviorSubject, Observable } from 'rxjs';
import { MapState } from './map-state';

export type LeafletElement<T extends L.Layer> = {
  element: T;
  onAdd?: (leaflet: L.Map) => void;
  onRemove?: (leaflet: L.Map) => void;
};
export type MapLibreElement = (Omit<LayerSpecification, "source"> & {
  source: SourceSpecification;
  onAdd?: (leaflet: L.Map, mapLibre: MapLibreMap) => void;
  onRemove?: (leaflet: L.Map, mapLibre: MapLibreMap) => void;
});

export interface MapElementPosition {
  behindId?: string;
  inFrontOfId?: string;
  onTop: boolean;
}

export type ElementsFor3D = {elements2d$: Observable<LeafletElement<any>[]>, elements3d$: Observable<MapLibreElement[]>}

export abstract class MapElement {

  private readonly positionOnMap$ = new BehaviorSubject<MapElementPosition>({onTop: false});

  constructor(
    public readonly id: string,
  ) {}

  public destroy() { /* nothing by default */ }

  public abstract fitBounds: L.LatLngBounds | undefined;

  public abstract get2DElements$(leaflet: L.Map, mapState: MapState, zoomAnim$: Observable<boolean>): Observable<LeafletElement<any>[]>;
  public abstract get3DElements$(leaflet: L.Map, mapState: MapState, zoomAnim$: Observable<boolean>, mapLibre: MapLibreMap): ElementsFor3D;

  public getPositionOnMap$(): Observable<MapElementPosition> { return this.positionOnMap$; }

  public setPositionOnMap(position: MapElementPosition): this {
    if (position.behindId === this.positionOnMap$.value.behindId &&
        position.inFrontOfId === this.positionOnMap$.value.inFrontOfId &&
        position.onTop === this.positionOnMap$.value.onTop) return this;
    this.positionOnMap$.next(position);
    return this;
  }

}

export function sortMapElements(
  elements: { element: MapElement; position: MapElementPosition }[],
): MapElement[] {
  const n = elements.length;
  if (n < 2) return elements.map(({ element }) => element);

  const indexById = new Map<string, number>();
  for (let i = 0; i < n; i++) {
    indexById.set(elements[i].element.id, i);
  }

  // Edges represent "must appear before".
  const edges: number[][] = Array.from({ length: n }, () => []);
  const indegree = new Int32Array(n);

  // Build constraints, ignoring those overridden by onTop.
  for (let i = 0; i < n; i++) {
    const { position } = elements[i];

    const addEdge = (from: number, to: number) => {
      if (from === to) return;

      // onTop always takes precedence over relative constraints.
      if (
        elements[from].position.onTop !==
        elements[to].position.onTop
      ) {
        return;
      }

      edges[from].push(to);
      indegree[to]++;
    };

    if (position.behindId !== undefined) {
      const target = indexById.get(position.behindId);
      if (target !== undefined) addEdge(i, target);
    }

    if (position.inFrontOfId !== undefined) {
      const target = indexById.get(position.inFrontOfId);
      if (target !== undefined) addEdge(target, i);
    }
  }

  // Kahn's topological sort. Preserve input order when possible.
  const queue = new Int32Array(n);
  let head = 0;
  let tail = 0;

  for (let i = 0; i < n; i++) {
    if (indegree[i] === 0) queue[tail++] = i;
  }

  const result: MapElement[] = [];
  const processed = new Uint8Array(n);

  for (let i = 0; i < n; i++) {
    // A cycle remains: break it deterministically by selecting
    // the earliest unprocessed element in the input.
    if (head === tail) {
      let next = 0;
      while (next < n && processed[next]) next++;
      if (next === n) break;
      queue[tail++] = next;
    }

    const current = queue[head++];
    if (processed[current]) continue;

    processed[current] = 1;
    result.push(elements[current].element);

    for (const neighbor of edges[current]) {
      if (--indegree[neighbor] === 0) {
        queue[tail++] = neighbor;
      }
    }
  }

  // Enforce the onTop rule absolutely. The graph already respects
  // it, so this is not needed as a separate sorting pass.
  return result;
}
