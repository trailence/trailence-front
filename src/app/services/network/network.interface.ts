import { Observable } from 'rxjs';

export interface INetworkService {

  get server(): PingResponse | null;
  get server$(): Observable<PingResponse | null>;

  get internet(): boolean;
  get internet$(): Observable<boolean>;

}

export interface PingResponse {
  minSupportedVersion: string;
  osmDataVersions: {[key:number]: number};
}

export function sameOsmDataVersions(osmDataVersions1: {[key:number]: number}, osmDataVersions2: {[key:number]: number}): boolean {
  let version = 1;
  while (osmDataVersions1[version]) {
    if (osmDataVersions1[version] !== osmDataVersions2[version]) return false;
    version++;
  }
  if (osmDataVersions2[version]) return false;
  return true;
}
