import { Type } from '@angular/core';
import { TrackEditToolContext } from './tool.interface';

export class TrackEditToolsStack {

  constructor(
    public readonly context: TrackEditToolContext,
    public readonly components: TrackEditToolComponent<any>[],
  ) {}

}

export interface TrackEditToolComponent<T> {

  component: Type<T>;
  instance?: T;
  onCreated: (instance: T) => void;

}
