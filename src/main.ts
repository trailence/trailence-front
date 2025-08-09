import { enableProdMode, ErrorHandler } from '@angular/core';
import { bootstrapApplication } from '@angular/platform-browser';
import { RouteReuseStrategy, provideRouter, withComponentInputBinding } from '@angular/router';
import { IonicRouteStrategy, provideIonicAngular } from '@ionic/angular/standalone';

import { routes } from './app/routes/routes';
import { AppComponent } from './app/app.component';
import { environment } from './environments/environment';
import { provideHttpClient } from '@angular/common/http';
import { Console } from './app/utils/console';

Console.info('App loading: start framework after ', Date.now() - ((window as any)._trailenceStart || 0));

window.onerror = function myErrorHandler(errorMsg, url, lineNumber) {
    Console.error('Unhandled error at ' + url + ' line ' + lineNumber + ': ', errorMsg);
    return false;
}

class MyErrorHandler implements ErrorHandler {
  handleError(error: any): void {
    Console.error('Angular error', error);
  }
}

if (environment.production) {
  enableProdMode();
}

bootstrapApplication(AppComponent, {
  providers: [
    { provide: RouteReuseStrategy, useClass: IonicRouteStrategy },
    provideIonicAngular({mode: 'md', swipeBackEnabled: false}),
    provideRouter(routes, withComponentInputBinding()),
    provideHttpClient(),
    { provide: ErrorHandler, useClass: MyErrorHandler }
  ],
});

Console.info('App loading: framework started after ', Date.now() - ((window as any)._trailenceStart || 0));
