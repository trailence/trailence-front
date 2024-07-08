import { Observable } from 'rxjs';

export interface INetworkService {

  get server(): boolean;
  get server$(): Observable<boolean>;

  get internet(): boolean;
  get internet$(): Observable<boolean>;

}
