import { BehaviorSubject, combineLatest, map, Observable, Subscription, switchMap, tap } from 'rxjs';
import { MenuItem } from '../menus/menu-item';
import { MapTool, MapToolGroup } from './map-tool';
import { Resubscribeables } from '@trailence/utils/rxjs/subscription-utils';
import { Injector } from '@angular/core';
import { MapComponent } from './map.component';
import { combineLatestSafe } from '@trailence/utils/rxjs/combineLatestSafe';
import { ZoomInTool, ZoomLevelLabel, ZoomOutTool, ZoomToolGroup } from './tools/zoom-tools';
import { OrientationToolGroup, RotationTool } from './tools/orientation-tools';
import { FitBoundsTool, GoBackTool, NavigationToolGroup } from './tools/navigation-tools';

export class MapTools {
  _leftTools: MenuItem[] = [];
  _rightTools: MenuItem[] = [];
  _topTools: MenuItem[] = [];

  private readonly inputTools$ = new BehaviorSubject<{groups?: MapToolGroup[], tools?: MapTool[]}>({});
  private subscription?: Subscription;

  reset(tools$: Observable<{groups?: MapToolGroup[], tools?: MapTool[]}> | undefined): void {
    this.subscription?.unsubscribe();
    if (tools$ === undefined) {
      this.subscription = undefined;
      this.inputTools$.next({});
    } else {
      this.subscription = tools$.subscribe(r => this.inputTools$.next(r));
    }
  }

  init(
    whenVisible: Resubscribeables,
    tools$: Observable<{groups?: MapToolGroup[], tools?: MapTool[]}> | undefined,
    injector: Injector,
    mapComponent: MapComponent,
    additionalGroups: MapToolGroup[],
    additionalTools: MapTool[],
  ): void {
    this.reset(tools$);
    whenVisible.subscribe(
      this.inputTools$.pipe(
        switchMap(inputTools => {
          const leftGroups: MapToolGroup[] = [];
          const rightGroups: MapToolGroup[] = [];
          const topGroups: MapToolGroup[] = [];
          for (const group of [...baseToolGroups, ...additionalGroups, ...(inputTools.groups ?? [])]) {
            switch (group.pane) {
              case 'left': leftGroups.push(group); break;
              case 'right': rightGroups.push(group); break;
              case 'top': topGroups.push(group); break;
            }
          }
          leftGroups.sort(toolOrderComparator);
          rightGroups.sort(toolOrderComparator);
          topGroups.sort(toolOrderComparator);

          const toolsByGroup = new Map<string, MapTool[]>();
          for (const tool of [...baseTools, ...additionalTools, ...(inputTools.tools ?? [])]) {
            let g = toolsByGroup.get(tool.group);
            if (g === undefined) {
              g = [tool];
              toolsByGroup.set(tool.group, g);
            } else {
              g.push(tool);
            }
          }
          for (const list of toolsByGroup.values()) list.sort(toolOrderComparator);

          const leftTools: MapTool[][] = leftGroups.map(group => toolsByGroup.get(group.id)).filter(tools => !!tools);
          const rightTools: MapTool[][] = rightGroups.map(group => toolsByGroup.get(group.id)).filter(tools => !!tools);
          const topTools: MapTool[][] = topGroups.map(group => toolsByGroup.get(group.id)).filter(tools => !!tools);

          return combineLatest([
            toMenuItems$(leftTools, injector, mapComponent).pipe(tap(tools => this._leftTools = tools)),
            toMenuItems$(rightTools, injector, mapComponent).pipe(tap(tools => this._rightTools = tools)),
            toMenuItems$(topTools, injector, mapComponent).pipe(tap(tools => this._topTools = tools)),
          ]);
        }),
      ),
      () => {
        mapComponent.changesDetection.detectChanges();
      }
    );
  }

  destroy(): void {
    this.subscription?.unsubscribe();
  }
}


const baseToolGroups: MapToolGroup[] = [
  ZoomToolGroup,
  OrientationToolGroup,
  NavigationToolGroup,
];

const baseTools: MapTool[] = [
  new ZoomInTool(),
  new ZoomLevelLabel(),
  new ZoomOutTool(),
  new RotationTool(),
  new FitBoundsTool(),
  new GoBackTool(),
];

function toolOrderComparator(t1: MapTool | MapToolGroup, t2: MapTool | MapToolGroup): number {
  return t1.order - t2.order;
}

function toMenuItems$(tools: MapTool[][], injector: Injector, mapComponent: MapComponent): Observable<MenuItem[]> {
  return combineLatestSafe(
    tools.map(group =>
      combineLatest(group.map(tool => tool.createMenuItem$(injector, mapComponent))).pipe(
        map(items => [...items, new MenuItem()])
      )
    )
  ).pipe(
    map(tools => tools.flat())
  );
}
