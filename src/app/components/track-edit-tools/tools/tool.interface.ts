import { Injector, Type } from '@angular/core';
import { BehaviorSubject, Observable } from 'rxjs';
import { Point } from 'src/app/model/point';
import { Track } from 'src/app/model/track';
import { SelectionTool } from './selection.tool';
import { TrackEditToolComponent } from './track-edit-tools-stack';
import { MapComponent } from '../../map/map.component';
import { ElevationGraphComponent } from '../../elevation-graph/elevation-graph.component';
import { Trail } from 'src/app/model/trail';

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
  readonly selection: SelectionTool;

  trail?: Trail;
  readonly map?: MapComponent;
  readonly elevationGraph?: ElevationGraphComponent;

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

  focusOn(track: Track, startSegment: number, startPoint: number, endSegment: number, endPoint: number): void;
  cancelFocus(): void;

  hasSelection(): boolean;
  getSelection(): PointReference | PointReferenceRange | undefined;
  cancelSelection(): void;

}

export interface PointReference {
  track: Track;
  segmentIndex: number;
  pointIndex: number;
  point: Point;
}

export interface PointReferenceRange {
  track: Track;
  start: PointReference;
  end: PointReference;
}
