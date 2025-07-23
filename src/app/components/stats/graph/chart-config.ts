import * as C from 'chart.js';

export interface ChartConfig {
  type: C.ChartConfiguration['type'];
  options: C.ChartConfiguration['options'];
  data?: C.ChartConfiguration['data'];

  maxDataShown: number;
}
