import { inject } from '@angular/core';
import { ActivatedRouteSnapshot, RouterStateSnapshot, Routes } from '@angular/router';
import { AuthService } from './services/auth/auth.service';

export const routes: Routes = [
  {
    path: 'login',
    loadComponent: () => import('./pages/login/login.page').then( m => m.LoginPage)
  },
  {
    path: '',
    canActivate: [(route: ActivatedRouteSnapshot, state: RouterStateSnapshot) => inject(AuthService).guardAuthenticated(route, state)],
    children: [
      {
        path: 'trails/:trailsType/:trailsId',
        loadComponent: () => import('./pages/trails/trails.page').then( m => m.TrailsPage)
      },
      {
        path: 'trails/:trailsType/:trailsId/:trailsFrom',
        loadComponent: () => import('./pages/trails/trails.page').then( m => m.TrailsPage)
      },
      {
        path: '',
        redirectTo: 'trails/collection/my_trails',
        pathMatch: 'full',
      },
    ]
  },
];
