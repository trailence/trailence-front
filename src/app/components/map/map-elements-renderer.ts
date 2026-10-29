import { BehaviorSubject, combineLatest, filter, map, Observable, Subscription, switchMap } from 'rxjs';
import { MAP_ELEMENT_LAYERS, MapElement, MapElementPosition, MapElementsLayer, MapPrimitive } from './map-element';
import { Injector, NgZone } from '@angular/core';
import { mapList } from '@trailence/utils/rxjs/mapList';
import { MapRenderer } from './impl/map-renderer';
import { debounceTimeExtended } from '@trailence/utils/rxjs/debounce-time-extended';

export interface MapElementsSource {
  id: string;
  elements$: Observable<MapElement[]>;
}

export class MapElementsRenderer {

  constructor(
    injector: Injector,
    map$: Observable<MapRenderer | undefined>,
  ) {
    this.subscription = injector.get(NgZone).runOutsideAngular(() =>
      map$.pipe(
        filter(renderer => !!renderer),
        switchMap(renderer =>
          mapList(this.sources$, source =>
            mapList(source.elements$, element =>
              combineLatest([
                element.getPositionOnMap$(),
                element.getPrimitives$(renderer)
              ]).pipe(
                map(([position, primitives]) => ({element, position, primitives}))
              )
            )
          ).pipe(
            map(primitives => ({renderer, primitives: primitives.flat()})),
          )
        ),
        debounceTimeExtended(0, 100, 100, (p, n) => p.renderer !== n.renderer),
      ).subscribe(r => this.render(r.renderer, r.primitives))
    );
  }

  private readonly subscription: Subscription;

  public destroy(): void {
    this.subscription.unsubscribe();
    for (const element of this._currentElements) element.destroy();
  }

  private readonly sources$ = new BehaviorSubject<MapElementsSource[]>([]);

  public setSource(source: MapElementsSource): void {
    const sources = this.sources$.value;
    const index = sources.findIndex(s => s.id === source.id);
    if (index >= 0) sources.splice(index, 1);
    sources.push(source);
    this.sources$.next(sources);
  }

  public removeSource(id: string): void {
    const sources = this.sources$.value;
    const index = sources.findIndex(s => s.id === id);
    if (index < 0) return;
    sources.splice(index, 1);
    this.sources$.next(sources);
  }

  private _currentPrimitives: MapPrimitive[] = [];
  private _currentElements: MapElement[] = [];
  private render(renderer: MapRenderer, elements: {element: MapElement, position: MapElementPosition, primitives: MapPrimitive[]}[]): void {
    const sortedElements = sortMapElements(elements, MAP_ELEMENT_LAYERS);

    const primitives = sortedElements.flatMap(e => elements.find(re => re.element === e)!.primitives);
    const primitivesPresent: MapPrimitive[] = [];
    for (const currentPrimitive of this._currentPrimitives) {
      if (primitives.includes(currentPrimitive)) {
        primitivesPresent.push(currentPrimitive);
      } else {
        renderer.remove(currentPrimitive);
      }
    }
    for (const primitive of primitives) {
      if (primitivesPresent.includes(primitive)) {
        renderer.bringToFront(primitive);
      } else {
        renderer.add(primitive);
      }
    }
    for (const element of this._currentElements)
      if (!elements.some(e => e.element === element))
        element.destroy();
    this._currentPrimitives = primitives;
    this._currentElements = elements.map(e => e.element);
  }

}

function sortMapElements(
  elements: { element: MapElement; position: MapElementPosition }[],
  layers: MapElementsLayer[],
): MapElement[] {
  type Entry = (typeof elements)[number];

  interface LayerGroup {
    zIndex: number;
    firstIndex: number;
    entries: Entry[];
  }

  // Resolve layer names in O(1).
  const zIndexByLayer = new Map<string, number>();
  for (const layer of layers) {
    zIndexByLayer.set(layer.name, layer.zIndex);
  }

  // Group elements by layer, preserving their original order.
  const groupsByLayer = new Map<string, LayerGroup>();

  for (let i = 0; i < elements.length; i++) {
    const entry = elements[i];
    const { layer } = entry.position;
    const zIndex = zIndexByLayer.get(layer);

    if (zIndex === undefined) {
      throw new Error(`Unknown layer: ${layer}`);
    }

    let group = groupsByLayer.get(layer);

    if (!group) {
      group = {
        zIndex,
        firstIndex: i,
        entries: [],
      };
      groupsByLayer.set(layer, group);
    }

    group.entries.push(entry);
  }

  // Lower zIndex must always be behind higher zIndex.
  const groups = [...groupsByLayer.values()];
  groups.sort(
    (a, b) => a.zIndex - b.zIndex || a.firstIndex - b.firstIndex,
  );

  const result: MapElement[] = [];

  for (const group of groups) {
    const entries = group.entries;
    const n = entries.length;

    // Map IDs to local indices within this layer.
    const indexById = new Map<string, number>();

    for (let i = 0; i < n; i++) {
      indexById.set(entries[i].element.id, i);
    }

    // Directed edge u -> v means u must be behind v.
    const edges: number[][] = Array.from(
      { length: n },
      () => [],
    );
    const indegree = new Int32Array(n);

    const addEdge = (from: number, to: number): void => {
      if (from === to) return;

      edges[from].push(to);
      indegree[to]++;
    };

    for (let i = 0; i < n; i++) {
      const position = entries[i].position;

      if (position.behindId !== undefined) {
        const target = indexById.get(position.behindId);

        if (target !== undefined) {
          addEdge(i, target);
        }
      }

      if (position.inFrontOfId !== undefined) {
        const target = indexById.get(position.inFrontOfId);

        if (target !== undefined) {
          addEdge(target, i);
        }
      }
    }

    // Maintain remaining nodes in original order using a linked list.
    // This lets us break cycles deterministically in O(1) per fallback.
    const prev = new Int32Array(n);
    const next = new Int32Array(n);
    const removed = new Uint8Array(n);

    for (let i = 0; i < n; i++) {
      prev[i] = i - 1;
      next[i] = i + 1 < n ? i + 1 : -1;
    }

    let head = n > 0 ? 0 : -1;

    const remove = (i: number): void => {
      removed[i] = 1;

      if (prev[i] !== -1) {
        next[prev[i]] = next[i];
      } else {
        head = next[i];
      }

      if (next[i] !== -1) {
        prev[next[i]] = prev[i];
      }
    };

    // Kahn's topological sort, using a queue instead of Array.shift().
    const queue: number[] = [];
    let queueHead = 0;

    for (let i = 0; i < n; i++) {
      if (indegree[i] === 0) {
        queue.push(i);
      }
    }

    let processed = 0;

    while (processed < n) {
      let current: number;

      if (queueHead < queue.length) {
        current = queue[queueHead++];
      } else {
        // A cycle remains. No ordering can satisfy all its constraints.
        // Pick the earliest remaining element as a deterministic fallback.
        current = head;
      }

      remove(current);
      result.push(entries[current].element);
      processed++;

      for (const target of edges[current]) {
        if (removed[target]) continue;

        indegree[target]--;

        if (indegree[target] === 0) {
          queue.push(target);
        }
      }
    }
  }

  return result;
}
