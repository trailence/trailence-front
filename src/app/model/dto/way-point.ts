export interface WayPointDto {
  l: number;
  n: number;
  e?: number;
  t?: number;
  na?: string;
  de?: string;
  nt?: {[lang:string]: string};
  dt?: {[lang:string]: string};
}
