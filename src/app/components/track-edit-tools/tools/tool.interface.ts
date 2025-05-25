import { Injector, Type } from '@angular/core';
import { BehaviorSubject, Observable } from 'rxjs';
import { Track } from 'src/app/model/track';
import { TrackEditToolComponent } from './track-edit-tools-stack';
import { Trail } from 'src/app/model/trail';
import { TrailSelection } from '../../trail/trail-selection';

export interface TrackEditTool {

  readonly icon?: string;
  labelKey(ctx: TrackEditToolContext): string;
  readonly backgroundColor?: string;
  readonly textColor?: string;

  isAvailable(ctx: TrackEditToolContext): boolean;

  execute(ctx: TrackEditToolContext): void;

}

export interface TrackEditToolContext {

  readonly injector: Injector;
  readonly selection: TrailSelection;
  readonly trail: Trail;

  readonly currentTrack$: BehaviorSubject<Track | undefined>;

  modifyTrack(mayNotChange: boolean, trackModifier: (track: Track) => Observable<any>): Observable<any>;
  modifySelectedRange(mayNotChange: boolean, trackModifier: (track: Track) => Observable<any>): Observable<any>;
  setBaseTrack(track: Track): void;
  isBaseTrackShown(): boolean;
  setShowBaseTrack(show: boolean): void;
  hasModifications(): boolean;

  appendTool<T>(component: TrackEditToolComponent<T>): void;
  insertTool<T>(component: TrackEditToolComponent<T>): void;
  removeTool(component: Type<any>): void;
  getTool<T>(component: Type<T>): T | undefined;
  refreshTools(): void;

}
