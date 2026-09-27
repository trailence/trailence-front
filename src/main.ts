import { enableProdMode, ErrorHandler, provideZoneChangeDetection } from '@angular/core';
import { bootstrapApplication } from '@angular/platform-browser';
import { RouteReuseStrategy, provideRouter, withComponentInputBinding } from '@angular/router';
import { IonicRouteStrategy, provideIonicAngular } from '@ionic/angular';

import { routes } from './app/routes/routes';
import { AppComponent } from './app/app.component';
import { environment } from './environments/environment';
import { provideHttpClient, withXhr } from '@angular/common/http';
import { provideServiceWorker } from '@angular/service-worker';
import { getLogger } from '@trailence/utils/console';

const logger = getLogger('main');

logger.info('App loading: start framework after ', Date.now() - ((globalThis as any)._trailenceStart || 0));

globalThis.onerror = function myErrorHandler(errorMsg, url, lineNumber) {
    logger.error('Unhandled error at ' + url + ' line ' + lineNumber + ': ', errorMsg);
    return false;
}

class MyErrorHandler implements ErrorHandler {
  handleError(error: any): void {
    logger.error('Angular error', error);
  }
}

if (environment.production) {
  enableProdMode();
}

bootstrapApplication(AppComponent, {
  providers: [
    provideZoneChangeDetection(),
    { provide: RouteReuseStrategy, useClass: IonicRouteStrategy },
    provideIonicAngular({mode: 'md', swipeBackEnabled: false}),
    provideRouter(routes, withComponentInputBinding()),
    provideHttpClient(withXhr()),
    { provide: ErrorHandler, useClass: MyErrorHandler },
    provideServiceWorker('ngsw-worker.js', {
      enabled: environment.serviceWorker,
      registrationStrategy: 'registerWhenStable:30000'
    })
  ],
});

logger.info('App loading: framework started after ', Date.now() - ((globalThis as any)._trailenceStart || 0));
