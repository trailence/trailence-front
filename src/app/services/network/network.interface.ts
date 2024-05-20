import { Observable } from 'rxjs';

export interface INetworkService {

  get connected(): boolean;
  get connected$(): Observable<boolean>;

}
