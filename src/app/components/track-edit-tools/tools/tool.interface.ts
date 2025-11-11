import { Injector, Type } from '@angular/core';
import { BehaviorSubject, Observable } from 'rxjs';
import { Track } from 'src/app/model/track';
import { TrackEditToolComponent } from './track-edit-tools-stack';
import { Trail } from 'src/app/model/trail';
import { TrailSelection } from '../../trail/trail-selection';
import { MapComponent } from '../../map/map.component';
import { MenuItem } from '../../menus/menu-item';

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

  modifyTrack(trackModifier: (track: Track) => Observable<any>, mayNotChange: boolean, doNotNotifyIfNotChange: boolean): Observable<any>;
  modifySelectedRange(trackModifier: (track: Track) => Observable<any>, mayNotChange: boolean, doNotNotifyIfNotChange: boolean): Observable<any>;
  setBaseTrack(track: Track): void;
  isBaseTrackShown(): boolean;
  setShowBaseTrack(show: boolean): void;
  hasModifications(): boolean;

  appendTool<T>(component: TrackEditToolComponent<T>): void;
  insertTool<T>(component: TrackEditToolComponent<T>): void;
  removeTool(component: Type<any>): void;
  getTool<T>(component: Type<T>): T | undefined;
  refreshTools(): void;

  startInteractiveTool(toolbar: (ctx: InteractiveToolContext) => MenuItem[], trackListener?: (ctx: InteractiveToolContext, track: Track) => void): Promise<InteractiveToolContext>;

}

export interface InteractiveToolContext {

  map: MapComponent;
  trackListener?: (ctx: InteractiveToolContext, track: Track) => void;

  startEditTrack(): void;
  trackModified(): void;
  endEditTrack(): void;

  toolbar: (ctx: InteractiveToolContext) => MenuItem[];

  close(): void;

}
