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
        keyCreatedAt: Date.now(),
        keyExpiresAt: Date.now() + 120 * 60 * 1000,
        preferences: {
        },
        complete: true,
        admin: false,
        quotas: {
          collectionsMax: 10,
          collectionsUsed: 1,
          photosMax: 100,
          photosUsed: 0,
          photosSizeMax: 10000,
          photosSizeUsed: 0,
          sharesMax: 10,
          sharesUsed: 0,
          tagsMax: 100,
          tagsUsed: 0,
          tracksMax: 100,
          tracksUsed: 0,
          tracksSizeMax: 10000,
          tracksSizeUsed: 0,
          trailsMax: 100,
          trailsUsed: 0,
          trailTagsMax: 100,
          trailTagsUsed: 0
        },
      })
    }
  }
}
