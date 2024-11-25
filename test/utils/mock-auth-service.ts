import { BehaviorSubject } from 'rxjs';
import { AuthResponse } from 'src/app/services/auth/auth-response';
import { AuthService } from 'src/app/services/auth/auth.service';

export function provideAuthService(email: string) {
  return {
    provide: AuthService,
    useValue: {
      auth$: new BehaviorSubject<AuthResponse>({
        accessToken: 'mockToken',
        expires: Date.now() + 120 * 60 * 1000,
        email,
        keyId: 'mockKey',
        preferences: {
        },
        complete: true
      })
    }
  }
}
