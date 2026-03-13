import * as C from 'chart.js';
import { Observable } from 'rxjs';

export interface GraphConfig {
  type: C.ChartConfiguration['type'];
  options: C.ChartConfiguration['options'];
  data?: C.ChartConfiguration['data'];
  plugins?: C.Plugin[];

  maxDataShown: number | undefined;
}

export interface GraphConfigSource<T> {
  source$: Observable<T | undefined>;
}

export interface GraphProvider<T> {
  buildGraphConfig(source: T, width: number, height: number, styles: CSSStyleDeclaration): Observable<GraphConfig | undefined>;
}
