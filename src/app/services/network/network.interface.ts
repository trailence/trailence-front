import { Observable } from 'rxjs';

export interface INetworkService {

  get server(): PingResponse | null;
  get server$(): Observable<PingResponse | null>;

  get internet(): boolean;
  get internet$(): Observable<boolean>;

}

export interface PingResponse {
  minSupportedVersion: string;
  osmDataVersion: number;
}
