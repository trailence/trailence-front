import { enableProdMode } from '@angular/core';
import { bootstrapApplication } from '@angular/platform-browser';
import { RouteReuseStrategy, provideRouter, withComponentInputBinding } from '@angular/router';
import { IonicRouteStrategy, provideIonicAngular } from '@ionic/angular/standalone';

import { routes } from './app/routes/routes';
import { AppComponent } from './app/app.component';
import { environment } from './environments/environment';
import { provideHttpClient } from '@angular/common/http';
import { Console } from './app/utils/console';

window.onerror = function myErrorHandler(errorMsg, url, lineNumber) {
    Console.error('Unhandled error at ' + url + ' line ' + lineNumber + ': ', errorMsg);
    return false;
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
  ],
});
