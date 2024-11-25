import { of } from 'rxjs';
import { NetworkService } from 'src/app/services/network/network.service';

export function provideNetworkService(internetConnected: boolean = false, serverConnected: boolean = false) {
  return {
    provide: NetworkService,
    useValue: {
      server: serverConnected,
      server$: of(serverConnected),
      internet: internetConnected,
      internet$: of(internetConnected)
    }
  }
}
