import { Injectable } from '@angular/core';
import { MapState } from '@trailence/components/map/map-state';
import { distance, EarthPoint } from '@trailence/utils/latlng';
import { BehaviorSubject, combineLatest, debounceTime, EMPTY, map, Observable, Subscription, switchMap } from 'rxjs';

@Injectable({providedIn: 'root'})
export class MapStateHistoryService {

  private readonly _states$ = new BehaviorSubject<MapStateHistoryEntry[]>([]);
  private readonly _subscriptions = new Map<MapState, Subscription>();

  public register(mapState: MapState, mapVisible$: Observable<boolean>): void {
    if (this._subscriptions.has(mapState)) return;
    this._subscriptions.set(mapState,
      mapVisible$.pipe(
        switchMap(visible => {
          if (!visible) return EMPTY;
          return combineLatest([mapState.center$, mapState.zoom$]).pipe(
            debounceTime(1000),
            map(([center, zoom]) => ({center, zoom} as MapStateHistoryEntry))
          );
        })
      ).subscribe(state => this.pushState(state))
    );
  }

  public unregister(mapState: MapState): void {
    const subscription = this._subscriptions.get(mapState);
    if (subscription) {
      subscription.unsubscribe();
      this._subscriptions.delete(mapState);
    }
  }

  private pushState(state: MapStateHistoryEntry): void {
    const latest = this._states$.value.at(-1);
    if (latest?.zoom !== state.zoom || distance(latest.center, state.center) > 500) {
      this._states$.value.push(state);
      if (this._states$.value.length > 100) this._states$.value.splice(0, 1);
      this._states$.next(this._states$.value);
    }
  }

  public canGoBack$(center: EarthPoint, zoom: number): Observable<MapStateHistoryEntry | undefined> {
    return this._states$.pipe(
      map(states => {
        for (let i = states.length - 1; i >= 0; --i) {
          const state = states[i];
          if (state.zoom !== zoom || distance(center, state.center) > 500) return state;
        }
        return undefined;
      })
    );
  }

  public popState(entry: MapStateHistoryEntry): void {
    const states = this._states$.value;
    const index = states.lastIndexOf(entry);
    if (index < 0) return;
    states.splice(index, states.length - index);
    this._states$.next(states);
  }

}

export interface MapStateHistoryEntry {
  center: EarthPoint;
  zoom: number;
}
